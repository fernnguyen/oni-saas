import type { IDataConnector, TransactionClient } from '@oni/adapters'
import { ReportBusyError } from './reportGuard'
import type { DayBucket, MethodAmount, ProductGroup, ResourceGroup, ReturnsTotal, VnDays } from './salesSummary'

// SQL aggregates behind orders/stats and reports/overview (Postgres only).
//
// - Scope mirrors PostgresConnector.list(): tenant, the branch plus rows with no
//   branch, and soft-deleted rows excluded.
// - orders.created_at is a timestamp without time zone holding Vietnam wall-clock
//   time (getGMT7Time), so day boundaries are compared as plain timestamps.
// - Money columns are varchar: anything that is not a plain number counts as 0
//   instead of failing (or NaN-poisoning) the whole sum.
// - varchar dates (paid_at, processed_at) may be ISO with 'Z' or naive Vietnam
//   time; the transaction's TIME ZONE makes naive values read as Vietnam time.

const STATEMENT_TIMEOUT = '5s'
const VN_TZ = 'Asia/Ho_Chi_Minh'

const num = (col: string) =>
  `(CASE WHEN ${col} ~ '^[[:space:]]*[-+]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][-+]?[0-9]+)?[[:space:]]*$' THEN ${col}::numeric ELSE 0 END)`

const vnTime = (col: string) =>
  `(CASE WHEN ${col} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)?$' THEN (${col}::timestamptz AT TIME ZONE '${VN_TZ}') END)`

const scope = (alias = '') => {
  const a = alias ? `${alias}.` : ''
  return `${a}tenant_id = $1 AND (${a}branch_id = $2 OR ${a}branch_id IS NULL OR ${a}branch_id = '') AND (${a}active IS NULL OR ${a}active <> 'FALSE')`
}

const isReturn = `COALESCE(is_return = 'TRUE', false)`

export type ReportTx = TransactionClient & { tenantId: string; branchId: string }

/**
 * Runs `fn` in a read-only transaction with a statement timeout.
 * Returns null when the connector cannot run SQL (non-Postgres) so the caller
 * falls back to row-based aggregation.
 */
export async function withReportTx<T>(connector: IDataConnector, fn: (tx: ReportTx) => Promise<T>): Promise<T | null> {
  if (!connector.withTransaction) return null
  try {
    return await connector.withTransaction(async (tx) => {
      if (tx.dialect !== 'postgres' || !tx.tenantId || !tx.branchId) return null
      await tx.query('SET TRANSACTION READ ONLY')
      await tx.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)
      await tx.query(`SET LOCAL TIME ZONE '${VN_TZ}'`)
      return fn(tx as ReportTx)
    })
  } catch (e) {
    // query_canceled: the statement timeout fired, the DB is overloaded
    if ((e as { code?: string })?.code === '57014') throw new ReportBusyError()
    throw e
  }
}

/** True for Postgres data errors (bad cast, bad date): worth retrying the row-based path. */
export function isPgDataError(e: unknown) {
  const code = (e as { code?: string })?.code
  return typeof code === 'string' && code.startsWith('22')
}

const params = (tx: ReportTx, ...rest: unknown[]) => [tx.tenantId, tx.branchId, ...rest]

export async function queryOrderDays(tx: ReportTx, since: string): Promise<DayBucket[]> {
  const rows = await tx.query(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, ${isReturn} AS is_return,
            COUNT(*)::int AS count, SUM(${num('total_amount')}) AS revenue, SUM(${num('debt_amount')}) AS debt
       FROM orders
      WHERE ${scope()} AND created_at >= $3::timestamp
      GROUP BY 1, 2`,
    params(tx, since),
  )
  return rows.map((r) => ({ day: r.day, isReturn: r.is_return, count: r.count, revenue: Number(r.revenue), debt: Number(r.debt) }))
}

export async function queryProcessedReturns(tx: ReportTx, since: string): Promise<ReturnsTotal> {
  const [row] = await tx.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(${num('total_refund')}), 0) AS refund
       FROM returns
      WHERE ${scope()} AND status = 'processed'
        AND COALESCE(${vnTime('processed_at')}, created_at) >= $3::timestamp`,
    params(tx, since),
  )
  return { count: row?.count ?? 0, refund: Number(row?.refund ?? 0) }
}

export async function queryStatusBreakdown(tx: ReportTx): Promise<Record<string, number>> {
  const rows = await tx.query(
    `SELECT COALESCE(NULLIF(status, ''), 'unknown') AS status, COUNT(*)::int AS count
       FROM orders WHERE ${scope()} GROUP BY 1`,
    params(tx),
  )
  return Object.fromEntries(rows.map((r) => [r.status, r.count]))
}

export async function queryProductGroups(tx: ReportTx): Promise<ProductGroup[]> {
  const rows = await tx.query(
    `SELECT product_id, COALESCE(product_name, '') AS product_name,
            SUM(${num('line_total')}) AS revenue, SUM(${num('qty')}) AS qty
       FROM order_items
      WHERE ${scope()} AND product_id IS NOT NULL AND product_id <> ''
      GROUP BY 1, 2`,
    params(tx),
  )
  return rows.map((r) => ({ productId: r.product_id, productName: r.product_name, revenue: Number(r.revenue), qty: Number(r.qty) }))
}

export async function queryPaymentMethods(tx: ReportTx, since: string): Promise<MethodAmount[]> {
  const rows = await tx.query(
    `SELECT COALESCE(p.method, '') AS method, SUM(${num('p.amount')}) AS amount
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
      WHERE ${scope('p')}
        AND NOT (COALESCE(p.method, '') = '' AND COALESCE(p.amount, '') = '')
        AND COALESCE(${vnTime('p.paid_at')}, o.created_at, p.created_at) >= $3::timestamp
      GROUP BY 1`,
    params(tx, since),
  )
  return rows.map((r) => ({ method: r.method, amount: Number(r.amount) }))
}

export async function queryOrderPaymentMethods(tx: ReportTx, since: string): Promise<MethodAmount[]> {
  const rows = await tx.query(
    `SELECT COALESCE(NULLIF(payment_method, ''), 'cash') AS method, SUM(${num('paid_amount')}) AS amount
       FROM orders
      WHERE ${scope()} AND NOT ${isReturn} AND created_at >= $3::timestamp
      GROUP BY 1`,
    params(tx, since),
  )
  return rows.map((r) => ({ method: r.method, amount: Number(r.amount) }))
}

export async function queryResourceGroups(tx: ReportTx, days: VnDays): Promise<ResourceGroup[]> {
  const rows = await tx.query(
    `SELECT key, MAX(name) AS name,
            COUNT(*)::int AS count, SUM(amount) AS revenue,
            (COUNT(*) FILTER (WHERE created_at >= $3::timestamp))::int AS today_count,
            COALESCE(SUM(amount) FILTER (WHERE created_at >= $3::timestamp), 0) AS today_revenue,
            (COUNT(*) FILTER (WHERE created_at >= $4::timestamp))::int AS month_count,
            COALESCE(SUM(amount) FILTER (WHERE created_at >= $4::timestamp), 0) AS month_revenue
       FROM (
         SELECT COALESCE(NULLIF(metadata->>'resource_id', ''), NULLIF(resource_id, ''), NULLIF(metadata->>'resource_name', '')) AS key,
                COALESCE(metadata->>'resource_name', '') AS name,
                ${num('total_amount')} AS amount,
                created_at
           FROM orders
          WHERE ${scope()} AND NOT ${isReturn}
       ) o
      WHERE key IS NOT NULL AND lower(key) NOT LIKE 'takeaway%'
      GROUP BY key`,
    params(tx, days.today, days.monthStart),
  )
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    count: r.count,
    revenue: Number(r.revenue),
    todayCount: r.today_count,
    todayRevenue: Number(r.today_revenue),
    monthCount: r.month_count,
    monthRevenue: Number(r.month_revenue),
  }))
}

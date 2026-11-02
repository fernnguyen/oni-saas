import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { after, before } from 'node:test'
import type { Pool as PgPool } from 'pg'

import { PostgresConnector } from '../../packages/adapters/src/postgresAdapter'
import { listAllConnectorRows } from '../../apps/web/lib/server/listAllConnectorRows'
import {
  queryOrderDays,
  queryOrderPaymentMethods,
  queryPaymentMethods,
  queryProcessedReturns,
  queryProductGroups,
  queryResourceGroups,
  queryStatusBreakdown,
  withReportTx,
} from '../../apps/web/lib/server/reports/pgReportQueries'
import {
  assembleOrderStats,
  assembleOverview,
  orderDaysFromRows,
  orderPaymentMethodsFromRows,
  paymentMethodsFromRows,
  processedReturnsFromRows,
  productGroupsFromRows,
  resourceGroupsFromRows,
  statusBreakdownFromRows,
  vnDays,
} from '../../apps/web/lib/server/reports/salesSummary'

// The SQL aggregates must give the same orders/stats and reports/overview as the
// row-based path they replace. Needs a DISPOSABLE database with the drizzle schema:
//   REPORTS_TEST_PG_URI=postgresql://localhost:5432/oni_table_sync_test pnpm test:reports
// Skipped when REPORTS_TEST_PG_URI is not set. Refuses a database whose name lacks "test".

const uri = process.env.REPORTS_TEST_PG_URI || ''
const skip = !uri ? 'REPORTS_TEST_PG_URI not set' : false

const TENANT = 'tenant-reports-test'
const BRANCH = 'branch-reports-test'
const requireFromAdapters = createRequire(path.resolve(process.cwd(), 'packages/adapters/package.json'))
let pool: PgPool
let connector: PostgresConnector

const days = vnDays()
const dayOffset = (n: number) => new Date(Date.parse(`${days.today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
// Vietnam wall-clock, as getGMT7Time() stores it
const at = (day: string, time = '12:00:00') => `${day} ${time}`

let seq = 0
async function order(o: { day: string; time?: string; total: string; debt?: string; status?: string; branch?: string | null; active?: string; method?: string; paid?: string; resource_id?: string; metadata?: Record<string, unknown> | string }) {
  const id = `RPT-O-${++seq}`
  await pool.query(
    `INSERT INTO orders (id, tenant_id, branch_id, status, total_amount, debt_amount, paid_amount, payment_method, resource_id, metadata, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
    [id, TENANT, o.branch === undefined ? BRANCH : o.branch, o.status ?? 'completed', o.total, o.debt ?? '0', o.paid ?? o.total, o.method ?? null,
     o.resource_id ?? null, o.metadata === undefined ? null : typeof o.metadata === 'string' ? o.metadata : JSON.stringify(o.metadata), o.active ?? 'TRUE', at(o.day, o.time)],
  )
  return id
}

async function item(orderId: string, productId: string, name: string, qty: string, lineTotal: string) {
  await pool.query(
    `INSERT INTO order_items (id, tenant_id, branch_id, order_id, product_id, product_name, qty, line_total, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [`RPT-I-${++seq}`, TENANT, BRANCH, orderId, productId, name, qty, lineTotal],
  )
}

async function payment(orderId: string, method: string, amount: string, paidAt: string, createdDay = days.today) {
  await pool.query(
    `INSERT INTO payments (id, tenant_id, branch_id, order_id, method, amount, paid_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [`RPT-P-${++seq}`, TENANT, BRANCH, orderId, method, amount, paidAt, at(createdDay)],
  )
}

async function ret(status: string, refund: string, createdDay: string, processedAt = '') {
  await pool.query(
    `INSERT INTO returns (id, tenant_id, branch_id, status, total_refund, processed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [`RPT-R-${++seq}`, TENANT, BRANCH, status, refund, processedAt, at(createdDay)],
  )
}

async function clean() {
  for (const t of ['payments', 'order_items', 'returns', 'orders']) {
    await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT])
  }
}

before(async () => {
  if (skip) return
  const { Pool } = requireFromAdapters('pg') as typeof import('pg')
  pool = new Pool({ connectionString: uri, max: 5 })
  const { rows } = await pool.query('SELECT current_database() AS db')
  if (!String(rows[0].db).includes('test')) throw new Error(`Refusing to run on non-test database ${rows[0].db}`)
  await clean()
  connector = new PostgresConnector(uri, TENANT, BRANCH)

  // Orders: today, yesterday, this week, older; junk amounts; other branch / no branch / soft-deleted
  const o1 = await order({ day: days.today, total: '100000', debt: '20000', method: 'cash', resource_id: 'R1', metadata: { resource_name: 'Bàn 1' } })
  const o2 = await order({ day: days.today, time: '00:00:01', total: '50000', method: 'bank_transfer', metadata: { resource_id: 'R2', resource_name: 'Bàn 2' } })
  await order({ day: days.today, time: '23:59:59', total: 'NaN', status: 'cancelled' })
  await order({ day: days.yesterday, total: '70000', metadata: { resource_name: 'Takeaway' } })
  await order({ day: dayOffset(-3), total: '30000', status: 'draft', metadata: '"not-an-object"' })
  await order({ day: dayOffset(-6), total: '', debt: 'abc' })
  await order({ day: dayOffset(-7), total: '45000' })
  await order({ day: dayOffset(-40), total: '999000', resource_id: 'R1' })
  await order({ day: dayOffset(1), total: '11000' }) // future-dated
  await order({ day: days.today, total: '5000', branch: null })
  await order({ day: days.today, total: '6000', branch: '' })
  await order({ day: days.today, total: '777000', branch: 'other-branch' })
  await order({ day: days.today, total: '888000', active: 'FALSE' })

  await item(o1, 'P-COFFEE', 'Cà phê', '2', '40000')
  await item(o1, 'P-COFFEE', 'Cà phê sữa', '1', '25000')
  await item(o1, 'time_charge_R1', 'Tiền giờ', '1', '35000')
  await item(o2, 'P-TEA', 'Trà', '5', 'NaN')
  await item(o2, 'P-TEA', 'Trà', '1.5', '15000')

  // Payments: paid_at as ISO Z, naive Vietnam time, empty (falls back to the order date)
  await payment(o1, 'cash', '80000', new Date().toISOString())
  await payment(o1, 'CASH', '20000', `${days.today}T09:00:00.000`)
  await payment(o2, 'bank_transfer_vcb', '50000', '')
  await payment(o2, 'momo', '12345', `${dayOffset(-45)}T09:00:00.000`)

  // Returns: only processed ones this month count
  await ret('processed', '15000', days.today, new Date().toISOString())
  await ret('processed', '5000', dayOffset(-40), '')
  await ret('pending', '99000', days.today)
  await ret('rejected', '88000', days.today)
})

after(async () => {
  if (skip) return
  await clean()
  await pool.end()
})

async function sqlInputs() {
  const r = await withReportTx(connector, async (tx) => ({
    buckets: await queryOrderDays(tx, days.seriesStart),
    returns: await queryProcessedReturns(tx, days.monthStart),
    statusBreakdown: await queryStatusBreakdown(tx),
    productGroups: await queryProductGroups(tx),
    paymentMethods: await queryPaymentMethods(tx, days.monthStart),
    orderPaymentMethods: await queryOrderPaymentMethods(tx, days.monthStart),
    resourceGroups: await queryResourceGroups(tx, days),
  }))
  assert.ok(r, 'Postgres connector must take the SQL path')
  return r
}

async function rowInputs() {
  const orders = await listAllConnectorRows(connector, 'orders', { sortBy: 'created_at' }, 3)
  const returns = await listAllConnectorRows(connector, 'returns')
  const items = await listAllConnectorRows(connector, 'order-items')
  const payments = await listAllConnectorRows(connector, 'payments')
  return {
    buckets: orderDaysFromRows(orders, days.seriesStart),
    returns: processedReturnsFromRows(returns, days.monthStart),
    statusBreakdown: statusBreakdownFromRows(orders),
    productGroups: productGroupsFromRows(items),
    paymentMethods: paymentMethodsFromRows(payments, orders, days.monthStart),
    orderPaymentMethods: orderPaymentMethodsFromRows(orders, days.monthStart),
    resourceGroups: resourceGroupsFromRows(orders, days),
  }
}

test('orders/stats: SQL path matches the row path', { skip }, async () => {
  const sql = await sqlInputs()
  const rows = await rowInputs()
  const viaSql = assembleOrderStats(sql.buckets, sql.returns, days)
  assert.deepEqual(viaSql, assembleOrderStats(rows.buckets, rows.returns, days))

  // today: 100k + 50k + NaN(0) + branch NULL 5k + branch '' 6k + future 11k
  assert.equal(viaSql.today.count, 6)
  assert.equal(viaSql.today.revenue, 172000)
  assert.equal(viaSql.today.debt, 20000)
  assert.equal(viaSql.yesterday.count, 1)
  assert.equal(viaSql.week.count, 9)
  assert.deepEqual(viaSql.returns, { count: 1, revenue: 15000, debt: 0 })
})

test('reports/overview: SQL path matches the row path', { skip }, async () => {
  const resources = [{ id: 'R1', name: 'Bàn số 1', status: 'occupied', zone: 'A' }, { id: 'R2', name: 'Bàn số 2', status: 'available', zone: 'A' }]
  const viaSql = assembleOverview(await sqlInputs(), resources, 'cafe', days)
  const viaRows = assembleOverview(await rowInputs(), resources, 'cafe', days)
  assert.deepEqual(viaSql, viaRows)

  assert.deepEqual(viaSql.topProducts.map((p) => [p.id, p.revenue, p.qty]), [['P-COFFEE', 65000, 3], ['P-TEA', 15000, 6.5]])
  assert.equal(viaSql.topResources.find((r) => r.id === 'R1')?.count, 2)
  assert.ok(!viaSql.topResources.some((r) => r.id.toLowerCase().startsWith('takeaway')))
  assert.equal(viaSql.paymentRevenue.cash, 100000)
  assert.equal(viaSql.paymentRevenue.bank_transfer, 50000)
  assert.equal(viaSql.paymentRevenue.momo, undefined)
  assert.equal(viaSql.kpi.returns.count, 1)
})

test('SQL aggregates use the report indexes', { skip }, async () => {
  const plan = await withReportTx(connector, async (tx) => {
    await tx.query('SET LOCAL enable_seqscan = off')
    const rows = await tx.query(
      `EXPLAIN SELECT COUNT(*) FROM orders WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL OR branch_id = '') AND created_at >= $3::timestamp`,
      [TENANT, BRANCH, days.monthStart],
    )
    return rows.map((r) => r['QUERY PLAN']).join('\n')
  })
  assert.match(plan ?? '', /idx_orders_tenant_branch_created_at/)
})

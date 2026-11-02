import crypto from 'crypto'
import type { TransactionClient } from '@oni/adapters'
import { getGMT7Time } from '@oni/core'
import type { LineRow, OpResult, SessionRow, TableSyncRepo } from './engine'

// SQL implementation of TableSyncRepo for the shared Postgres schema (tenant_id scoped).
// Every method runs on the caller's transaction connection.

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const parseJson = (v: unknown): Record<string, any> => {
  if (!v) return {}
  if (typeof v === 'object') return { ...(v as Record<string, any>) }
  try {
    const parsed = JSON.parse(String(v))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function mapSessionRow(row: any): SessionRow {
  return {
    id: String(row.id),
    branch_id: String(row.branch_id || ''),
    resource_id: String(row.resource_id || ''),
    order_id: String(row.order_id || ''),
    status: String(row.status || ''),
    check_in: String(row.check_in || ''),
    version: num(row.version) || 1,
  }
}

function mapLineRow(row: any): LineRow {
  return {
    id: String(row.id),
    order_id: String(row.order_id || ''),
    product_id: String(row.product_id || ''),
    product_name: String(row.product_name || ''),
    qty: num(row.qty),
    unit_price: num(row.unit_price),
    modifier_total: num(row.modifier_total),
    line_total: num(row.line_total),
    variant_label: String(row.variant_label || ''),
    modifiers: String(row.modifiers || ''),
    active: String(row.active || 'TRUE').toUpperCase() !== 'FALSE',
  }
}

export function createPgTableSyncRepo(tx: TransactionClient): TableSyncRepo {
  const tenantId = tx.tenantId ?? ''

  return {
    async findOp(opId) {
      const rows = await tx.query(
        `SELECT status, result FROM order_item_ops WHERE id = $1 AND tenant_id = $2`,
        [opId, tenantId]
      )
      if (!rows[0]) return null
      return { status: String(rows[0].status), result: parseJson(rows[0].result) as OpResult }
    },

    async lockSession(sessionId) {
      const rows = await tx.query(
        `SELECT * FROM table_sessions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [sessionId, tenantId]
      )
      return rows[0] ? mapSessionRow(rows[0]) : null
    },

    async listLines(orderId) {
      const rows = await tx.query(
        `SELECT id, order_id, product_id, product_name, qty, unit_price, modifier_total, line_total,
                variant_label, modifiers, active
           FROM order_items
          WHERE order_id = $1 AND tenant_id = $2
          ORDER BY created_at ASC, id ASC
          FOR UPDATE`,
        [orderId, tenantId]
      )
      return rows.map(mapLineRow)
    },

    async insertLine(orderId, line) {
      const id = `OI-V2-${crypto.randomUUID()}`
      const now = getGMT7Time()
      const rows = await tx.query(
        `INSERT INTO order_items
           (id, tenant_id, branch_id, order_id, product_id, sku, product_name, qty, unit_price, unit_cost,
            original_price, line_total, line_discount, discount_amount, tax_rate, tax_amount, tax_group,
            variant_label, modifiers, modifier_total, active, created_at, updated_at)
         SELECT $1, o.tenant_id, o.branch_id, o.id, $3, $4, $5, $6, $7, $8,
                $7, $9, '0', '0', $10, '0', $11,
                $12, $13, $14, 'TRUE', $15, $15
           FROM orders o
          WHERE o.id = $2 AND o.tenant_id = $16
         RETURNING id, order_id, product_id, product_name, qty, unit_price, modifier_total, line_total,
                   variant_label, modifiers, active`,
        [
          id, orderId,
          String(line.product_id), String((line as any).sku ?? ''), String(line.product_name),
          String(line.qty), String(line.unit_price), String((line as any).unit_cost ?? ''),
          String(line.line_total), String((line as any).tax_rate ?? '0'), String((line as any).tax_group ?? ''),
          String(line.variant_label ?? ''), String(line.modifiers ?? ''), String(line.modifier_total ?? 0),
          now, tenantId,
        ]
      )
      if (!rows[0]) throw new Error(`Order ${orderId} not found for new line`)
      return mapLineRow(rows[0])
    },

    async updateLine(itemId, patch) {
      const sets: string[] = []
      const params: unknown[] = []
      const push = (col: string, val: unknown) => {
        params.push(val)
        sets.push(`"${col}" = $${params.length}`)
      }
      if (patch.qty !== undefined) push('qty', String(patch.qty))
      if (patch.unit_price !== undefined) push('unit_price', String(patch.unit_price))
      if (patch.line_total !== undefined) push('line_total', String(patch.line_total))
      if (patch.product_name !== undefined) push('product_name', patch.product_name)
      if (patch.active !== undefined) push('active', patch.active ? 'TRUE' : 'FALSE')
      if (sets.length === 0) return
      push('updated_at', getGMT7Time())
      params.push(itemId, tenantId)
      await tx.query(
        `UPDATE order_items SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
        params
      )
    },

    async insertOp({ op, session, deviceId, status, itemId, result }) {
      const now = getGMT7Time()
      await tx.query(
        `INSERT INTO order_item_ops
           (id, tenant_id, branch_id, session_id, order_id, device_id, op_type, item_id, payload, status, result,
            client_created_at, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'TRUE', $13, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          op.op_id, tenantId, session.branch_id, session.id, session.order_id || null, deviceId || null,
          String((op as any).type || 'unknown'), itemId || null, JSON.stringify(op), status, JSON.stringify(result),
          (op as any).client_created_at || null, now,
        ]
      )
    },

    async bumpSessionVersion(sessionId) {
      const rows = await tx.query(
        `UPDATE table_sessions SET version = version + 1, updated_at = $3
          WHERE id = $1 AND tenant_id = $2 RETURNING version`,
        [sessionId, tenantId, getGMT7Time()]
      )
      return num(rows[0]?.version)
    },

    async insertEvent({ session, kind, payload }) {
      const rows = await tx.query(
        `INSERT INTO table_sync_events (tenant_id, branch_id, session_id, resource_id, kind, payload)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING seq`,
        [tenantId, session.branch_id, session.id, session.resource_id, kind, JSON.stringify(payload)]
      )
      return num(rows[0]?.seq)
    },

    async getOrderTotalsInput(orderId) {
      const rows = await tx.query(
        `SELECT discount_amount, tax_amount, shipping_fee, metadata FROM orders
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [orderId, tenantId]
      )
      if (!rows[0]) return null
      return {
        discount_amount: num(rows[0].discount_amount),
        tax_amount: num(rows[0].tax_amount),
        shipping_fee: num(rows[0].shipping_fee),
        metadata: parseJson(rows[0].metadata),
      }
    },

    async updateOrderTotals(orderId, totals) {
      await tx.query(
        `UPDATE orders SET subtotal = $1, total_amount = $2, metadata = $3, updated_at = $4
          WHERE id = $5 AND tenant_id = $6 AND status = 'in_progress'`,
        [String(totals.subtotal), String(totals.total_amount), JSON.stringify(totals.metadata), getGMT7Time(), orderId, tenantId]
      )
    },
  }
}

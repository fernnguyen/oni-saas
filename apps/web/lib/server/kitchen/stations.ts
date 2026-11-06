// Bar/Bếp K0 — station + routing persistence (docs/KITCHEN-BAR-PLAN.md).
// Postgres only (same gate as table sync v2): connectors without withTransaction are rejected.

import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { IDataConnector } from '@oni/adapters'
import { PREP_STATION_KINDS, PREP_STATION_OUTPUTS, toPrepStation, type PrepStation, type PrepStationRoute } from '@oni/core'

type TxConnector = IDataConnector & { withTransaction: NonNullable<IDataConnector['withTransaction']> }

export class KitchenUnsupportedError extends Error {
  code = 'kitchen_unsupported'
  constructor() {
    super('Bar/Bếp chỉ hỗ trợ cửa hàng dùng cơ sở dữ liệu Postgres.')
  }
}

export function requireKitchenConnector(connector: IDataConnector): TxConnector {
  if (typeof connector.withTransaction !== 'function') throw new KitchenUnsupportedError()
  return connector as TxConnector
}

export function kitchenErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof KitchenUnsupportedError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: 409 })
  }
  return null
}

const boolish = z.union([z.boolean(), z.enum(['TRUE', 'FALSE', 'true', 'false'])])
  .transform((v) => (String(v).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'))

export const stationCreateSchema = z.object({
  name: z.string().trim().min(1, 'Tên trạm không được để trống').max(100),
  kind: z.enum(PREP_STATION_KINDS).default('kitchen'),
  output: z.enum(PREP_STATION_OUTPUTS).default('print'),
  is_default: boolish.optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional(),
})

export const stationUpdateSchema = stationCreateSchema.partial()

export const routesReplaceSchema = z.object({
  // category_id → station_id ('' / null = not routed, falls back to the default station)
  categories: z.record(z.string(), z.string().nullable()),
})

export async function listStations(connector: IDataConnector, shopId: string): Promise<PrepStation[]> {
  const res = await connector.list('prep_stations', { page: 1, limit: 200, filters: { branch_id: shopId } })
  return res.data.map(toPrepStation).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'vi'))
}

export async function listRoutes(connector: TxConnector, shopId: string): Promise<PrepStationRoute[]> {
  return connector.withTransaction(async (tx) => {
    const rows = await tx.query(
      `SELECT station_id, target_type, target_id FROM prep_station_routes
        WHERE tenant_id = $1 AND branch_id = $2 AND (active IS NULL OR active != 'FALSE')`,
      [tx.tenantId ?? '', shopId],
    )
    return rows.map((r) => ({ station_id: r.station_id, target_type: r.target_type, target_id: r.target_id }))
  })
}

/**
 * Only one default station per branch: clear the flag on the others. Goes through
 * connector.update (not raw SQL) so the cached station list is invalidated.
 */
export async function clearOtherDefaults(connector: IDataConnector, shopId: string, keepId: string) {
  const stations = await listStations(connector, shopId)
  for (const s of stations) {
    if (s.id !== keepId && s.is_default) await connector.update('prep_stations', s.id, { is_default: 'FALSE' })
  }
}

/** Hard-replace all category routes of a branch in one transaction. */
export async function replaceCategoryRoutes(
  connector: TxConnector,
  shopId: string,
  mapping: Record<string, string | null>,
  validStationIds: Set<string>,
): Promise<number> {
  const entries = Object.entries(mapping).filter(([cat, st]) => cat && st && validStationIds.has(st)) as [string, string][]
  return connector.withTransaction(async (tx) => {
    await tx.query(
      `DELETE FROM prep_station_routes WHERE tenant_id = $1 AND branch_id = $2 AND target_type = 'category'`,
      [tx.tenantId ?? '', shopId],
    )
    for (const [categoryId, stationId] of entries) {
      await tx.query(
        `INSERT INTO prep_station_routes (id, tenant_id, branch_id, station_id, target_type, target_id, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'category', $5, 'TRUE', NOW(), NOW())`,
        [crypto.randomUUID(), tx.tenantId ?? '', shopId, stationId, categoryId],
      )
    }
    return entries.length
  })
}

export async function deleteRoutesOfStation(connector: TxConnector, shopId: string, stationId: string) {
  await connector.withTransaction((tx) =>
    tx.query(`DELETE FROM prep_station_routes WHERE tenant_id = $1 AND branch_id = $2 AND station_id = $3`, [
      tx.tenantId ?? '',
      shopId,
      stationId,
    ]),
  )
}

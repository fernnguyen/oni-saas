// Bar/Bếp — per-branch settings (kitchen_settings: one row per branch, missing row = defaults).
//
// auto_send (default on): new dishes go to the kitchen without pressing "Gửi bếp".
//   - Web POS sends a few seconds after the last change on the table, and when the table closes.
//   - Mobile "Lưu & báo bếp" sends on save (off → plain "Lưu vào bàn" + the manual send bar).
//   Enforced by the clients: the server never fires on its own (ops stay plain saves).

import { z } from 'zod'
import type { TransactionClient } from '@oni/adapters'
import type { TxConnector } from './tickets'

export interface KitchenSettings {
  auto_send: boolean
}

export const KITCHEN_SETTINGS_DEFAULTS: KitchenSettings = { auto_send: true }

export const kitchenSettingsSchema = z.object({ auto_send: z.boolean() }).strict()

const tid = (tx: TransactionClient) => tx.tenantId ?? ''

export async function readKitchenSettings(tx: TransactionClient, shopId: string): Promise<KitchenSettings> {
  const rows = await tx.query(
    `SELECT auto_send FROM kitchen_settings WHERE tenant_id = $1 AND branch_id = $2`,
    [tid(tx), shopId],
  )
  if (!rows[0]) return { ...KITCHEN_SETTINGS_DEFAULTS }
  return { auto_send: String(rows[0].auto_send).toUpperCase() !== 'FALSE' }
}

export function getKitchenSettings(connector: TxConnector, shopId: string): Promise<KitchenSettings> {
  return connector.withTransaction((tx) => readKitchenSettings(tx, shopId))
}

export async function saveKitchenSettings(
  connector: TxConnector,
  shopId: string,
  input: KitchenSettings,
): Promise<KitchenSettings> {
  await connector.withTransaction((tx) =>
    tx.query(
      `INSERT INTO kitchen_settings (tenant_id, branch_id, auto_send, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id, branch_id) DO UPDATE SET auto_send = EXCLUDED.auto_send, updated_at = NOW()`,
      [tid(tx), shopId, input.auto_send ? 'TRUE' : 'FALSE'],
    ),
  )
  return input
}

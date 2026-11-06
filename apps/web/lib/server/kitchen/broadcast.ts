// Realtime hint for kitchen screens / print stations: channel `kitchen_<shopId>`.
// Same contract as table sync broadcast: payload is only a hint, clients refetch tickets.
// Best-effort; never fails the write.

import { env } from '../../env'

export interface KitchenBroadcast {
  kind: 'ticket_created' | 'ticket_updated' | 'item_unavailable' | 'unavailable_changed' | 'void_answered'
  ticket_id?: string
  station_id?: string
  /** item_unavailable: what to tell the floor ("Bếp báo hết: Mì tôm – Bàn 2") */
  product_name?: string
  resource_name?: string
  /** station the message is about ("Bar báo hết: ...") */
  station_name?: string
  session_id?: string
  /** void_answered: 'stopped' ("Dừng kịp") | 'made' ("Đã làm rồi" = waste) | '' (answer cleared) */
  outcome?: string
}

export function kitchenChannel(shopId: string) {
  return `kitchen_${shopId}`
}

export async function broadcastKitchen(shopId: string, message: KitchenBroadcast): Promise<void> {
  const url = env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || url.includes('placeholder')) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    await fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: kitchenChannel(shopId), event: 'changes', payload: message }] }),
      signal: controller.signal,
    })
  } catch (err) {
    console.warn('[kitchen] broadcast failed (clients refetch on next poll):', err)
  } finally {
    clearTimeout(timer)
  }
}

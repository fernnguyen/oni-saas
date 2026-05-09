/**
 * check-sepay-order
 *
 * Poll endpoint để frontend kiểm tra trạng thái đơn hàng SEPAY.
 * Frontend gọi mỗi 3 giây trong khi hiển thị QR code.
 *
 * ── Request body ──────────────────────────────────────────────────────────────
 *   { order_id: string }
 *
 * ── Response (200) ────────────────────────────────────────────────────────────
 *   { status: 'pending' | 'completed' | 'expired', fulfilled_at?: string }
 *
 * ── Bảo mật ───────────────────────────────────────────────────────────────────
 *   - JWT required
 *   - Chỉ trả về order thuộc về user đang đăng nhập (user_id = auth.uid())
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { verifyUser, AuthError } from "../_shared/auth.ts"

const supabaseUrl            = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

serve(async (req) => {
  if (req.method === "OPTIONS") return respond(null, 204)

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // 1. Verify JWT
  let user: Awaited<ReturnType<typeof verifyUser>>
  try {
    user = await verifyUser(req, admin)
  } catch (e) {
    if (e instanceof AuthError) return respond({ error: e.code }, e.status)
    return respond({ error: "unauthorized" }, 401)
  }

  // 2. Parse body
  let body: { order_id?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const orderId = body.order_id?.trim()
  if (!orderId) {
    return respond({ error: "invalid_request", detail: "order_id is required" }, 400)
  }

  // 3. Lookup order — chỉ trả về nếu thuộc về user này
  const { data: order, error } = await admin
    .from("subscription_orders")
    .select("id, status, expires_at, fulfilled_at")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    console.error("[check-sepay-order] DB error:", error)
    return respond({ error: "internal_error" }, 500)
  }

  if (!order) {
    return respond({ error: "not_found" }, 404)
  }

  // 4. Auto-expire nếu quá hạn và vẫn pending
  let status = order.status
  if (status === "pending" && new Date(order.expires_at) < new Date()) {
    await admin
      .from("subscription_orders")
      .update({ status: "expired" })
      .eq("id", orderId)
    status = "expired"
  }

  return respond({
    status,
    fulfilled_at: order.fulfilled_at ?? undefined,
  })
})

function respond(data: unknown, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  })
}

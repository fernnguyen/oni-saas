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

const BANK_CODE      = Deno.env.get("SEPAY_BANK_CODE")      ?? "MB"
const ACCOUNT_NUMBER = Deno.env.get("SEPAY_ACCOUNT_NUMBER") ?? ""
const ACCOUNT_NAME   = Deno.env.get("SEPAY_ACCOUNT_NAME")   ?? "ONI SAAS TECH"
const BANK_NAME      = Deno.env.get("SEPAY_BANK_NAME")      ?? "MBBank"

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
    .select("id, status, expires_at, fulfilled_at, reference_code, amount_vnd, plan_code, billing_interval")
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

  // Construct response payload
  const responseData: Record<string, any> = {
    status,
    fulfilled_at: order.fulfilled_at ?? undefined,
  }

  // If the order is pending, return all payment details so the client can display the QR
  if (status === "pending") {
    const transferContent = `SEVQR ${order.reference_code}`
    const addInfo = encodeURIComponent(transferContent)
    const accName = encodeURIComponent(ACCOUNT_NAME)
    const qrUrl   = `https://img.vietqr.io/image/${BANK_CODE}-${ACCOUNT_NUMBER}-compact.png` +
      `?amount=${order.amount_vnd}&addInfo=${addInfo}&accountName=${accName}`

    // Fetch plan details to show plan name
    const { data: plan } = await admin
      .from("plans")
      .select("name")
      .eq("code", order.plan_code)
      .maybeSingle()

    responseData.order_id = order.id
    responseData.reference_code = order.reference_code
    responseData.transfer_content = transferContent
    responseData.amount_vnd = order.amount_vnd
    responseData.qr_url = qrUrl
    responseData.bank_name = BANK_NAME
    responseData.account_number = ACCOUNT_NUMBER
    responseData.account_name = ACCOUNT_NAME
    responseData.expires_at = order.expires_at
    responseData.plan_name = plan?.name ?? order.plan_code
    responseData.billing_interval = order.billing_interval
  }

  return respond(responseData)
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

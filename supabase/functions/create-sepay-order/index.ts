/**
 * create-sepay-order
 *
 * Tạo đơn thanh toán SEPAY cho một gói cước (plan).
 * Trả về QR URL và thông tin chuyển khoản để frontend hiển thị.
 *
 * ── Request body ──────────────────────────────────────────────────────────────
 *   {
 *     plan_code:        string              // 'plan_pro' | 'plan_enterprise'
 *     billing_interval: 'monthly'|'yearly'  // default: 'monthly'
 *     tenant_id:        string              // UUID của tenant đang thanh toán
 *   }
 *
 * ── Response (200) ────────────────────────────────────────────────────────────
 *   {
 *     order_id:       string
 *     reference_code:   string   // VD: "ONIAB12CD34" (dùng để tra cứu DB)
 *     transfer_content: string   // VD: "SEVQR ONIAB12CD34" (nội dung CK user cần nhập)
 *     amount_vnd:     number
 *     qr_url:         string   // VietQR image URL
 *     bank_name:      string
 *     account_number: string
 *     account_name:   string
 *     expires_at:     string   // ISO timestamp, hết hạn sau 15 phút
 *   }
 *
 * ── Bảo mật ───────────────────────────────────────────────────────────────────
 *   - JWT required (Bearer token)
 *   - User phải là owner hoặc admin của tenant
 *   - Plan phải tồn tại và có giá VNĐ > 0
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { verifyUser, AuthError } from "../_shared/auth.ts"

const supabaseUrl            = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

// Thông tin tài khoản ngân hàng nhận tiền — cấu hình qua Supabase Secrets
const BANK_CODE      = Deno.env.get("SEPAY_BANK_CODE")      ?? "MB"
const ACCOUNT_NUMBER = Deno.env.get("SEPAY_ACCOUNT_NUMBER") ?? ""
const ACCOUNT_NAME   = Deno.env.get("SEPAY_ACCOUNT_NAME")   ?? "ONI SAAS TECH"
const BANK_NAME      = Deno.env.get("SEPAY_BANK_NAME")      ?? "MBBank"

// CORS headers chung
const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  })
}

function generateRefCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const bytes = new Uint8Array(8) // 8 ký tự suffix → tổng "ONI" + 8 = 11 ký tự
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes, b => chars[b % chars.length]).join("")
  return `ONI${suffix}` // VD: ONIAB12CD34
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // 1. Xác thực JWT
  let user: Awaited<ReturnType<typeof verifyUser>>
  try {
    user = await verifyUser(req, admin)
  } catch (e) {
    if (e instanceof AuthError) return respond({ error: e.code }, e.status)
    return respond({ error: "unauthorized" }, 401)
  }

  // 2. Parse body
  let body: { plan_code?: string; billing_interval?: string; tenant_id?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const planCode        = body.plan_code?.trim()
  const billingInterval = body.billing_interval === "yearly" ? "yearly" : "monthly"
  const tenantId        = body.tenant_id?.trim()

  if (!planCode || !tenantId) {
    return respond({ error: "invalid_request", detail: "plan_code và tenant_id là bắt buộc" }, 400)
  }

  // 3. Kiểm tra user có quyền owner/admin trong tenant này không
  const { data: membership, error: memberError } = await admin
    .from("user_tenants")
    .select("role_id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (memberError || !membership) {
    return respond({ error: "forbidden", detail: "Bạn không thuộc tenant này" }, 403)
  }

  const { data: role } = await admin
    .from("roles")
    .select("code")
    .eq("id", membership.role_id)
    .maybeSingle()

  if (!role || !["owner", "admin"].includes(role.code)) {
    return respond({ error: "forbidden", detail: "Chỉ Owner hoặc Admin mới có thể thanh toán" }, 403)
  }

  // 4. Lấy thông tin gói + giá
  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id, code, name, price_monthly, price_yearly")
    .eq("code", planCode)
    .maybeSingle()

  if (planError || !plan) {
    return respond({ error: "plan_not_found" }, 404)
  }

  const amountVnd = billingInterval === "yearly"
    ? (plan.price_yearly ?? 0)
    : (plan.price_monthly ?? 0)

  if (amountVnd <= 0) {
    return respond({ error: "plan_not_purchasable", detail: "Gói này không hỗ trợ thanh toán VNĐ" }, 400)
  }

  // 5. Tạo reference code + subscription_order
  const referenceCode = generateRefCode()
  const expiresAt     = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { data: order, error: orderError } = await admin
    .from("subscription_orders")
    .insert({
      tenant_id:        tenantId,
      user_id:          user.id,
      plan_code:        planCode,
      billing_interval: billingInterval,
      amount_vnd:       amountVnd,
      reference_code:   referenceCode,
      status:           "pending",
      expires_at:       expiresAt,
    })
    .select("id")
    .single()

  if (orderError || !order) {
    console.error("[create-sepay-order] Insert error:", orderError)
    return respond({ error: "create_order_failed" }, 500)
  }

  // 6. Xây dựng VietQR URL — nội dung CK theo chuẩn SEPAY: "SEVQR ONIXXXXX"
  const transferContent = `SEVQR ${referenceCode}`
  const addInfo = encodeURIComponent(transferContent)
  const accName = encodeURIComponent(ACCOUNT_NAME)
  const qrUrl   = `https://img.vietqr.io/image/${BANK_CODE}-${ACCOUNT_NUMBER}-compact.png` +
    `?amount=${amountVnd}&addInfo=${addInfo}&accountName=${accName}`

  console.log(`[create-sepay-order] Created order: id=${order.id} ref=${referenceCode} plan=${planCode} interval=${billingInterval} amount=${amountVnd}`)

  return respond({
    order_id:         order.id,
    reference_code:   referenceCode,
    transfer_content: transferContent,
    amount_vnd:       amountVnd,
    qr_url:           qrUrl,
    bank_name:        BANK_NAME,
    account_number:   ACCOUNT_NUMBER,
    account_name:     ACCOUNT_NAME,
    expires_at:       expiresAt,
  })
})

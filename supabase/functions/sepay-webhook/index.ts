/**
 * sepay-webhook
 *
 * Xử lý webhook từ SePay khi có giao dịch chuyển khoản vào TK ngân hàng.
 * Khớp "SEVQR {reference_code}" trong nội dung CK với subscription_orders → kích hoạt plan.
 *
 * ── Bảo mật ───────────────────────────────────────────────────────────────────
 *   1. Header "Authorization: Apikey {SEPAY_WEBHOOK_API_KEY}" — 401 nếu sai
 *   2. transferType === "in" — bỏ qua tiền ra
 *   3. Regex extract reference_code (ONI[A-Z0-9]{6,12}) từ content
 *   4. Order phải ở status='pending' — bỏ qua nếu đã xử lý
 *   5. expires_at > NOW() — từ chối nếu hết hạn
 *   6. transferAmount >= amount_vnd — từ chối nếu thiếu tiền
 *   7. Atomic claim status='processing' — chống double-fulfillment
 *   8. UNIQUE(sepay_transaction_id) — DB constraint reject duplicate
 *
 * ── Response ──────────────────────────────────────────────────────────────────
 *   Success: {"success": true}  HTTP 200
 *   Reject:  {"success": false, "message": "..."}  HTTP 200  (không retry)
 *   Error:   {"success": false}  HTTP 400/500  (SePay sẽ retry)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const supabaseUrl            = Deno.env.get("SUPABASE_URL") ?? ""
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const sepayWebhookApiKey     = Deno.env.get("SEPAY_WEBHOOK_API_KEY") ?? ""
const resendApiKey           = Deno.env.get("RESEND_API_KEY") ?? ""
const oniFromEmail           = Deno.env.get("ONI_FROM_EMAIL") ?? "noreply@oni.vn"
const oniAppUrl              = Deno.env.get("ONI_APP_URL")   ?? "https://oni.vn"

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// ─── Email helpers ────────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  heading:     string
  bodyLines:   string[]
  buttonText?: string
  buttonUrl?:  string
  footerNote?: string
}): string {
  const { heading, bodyLines, buttonText, buttonUrl, footerNote } = params
  const bodyHtml       = bodyLines.map((l) => `    <p>${l}</p>`).join("\n")
  const buttonHtml     = buttonText && buttonUrl
    ? `\n    <a href="${buttonUrl}" class="button">${buttonText}</a>\n`
    : ""
  const footerNoteHtml = footerNote ? `${footerNote}<br>` : ""

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #0268FF; font-size: 24px; margin: 0 0 20px 0; }
    .highlight { font-weight: 600; color: #0050CC; }
    .button {
      display: inline-block; background-color: #0268FF; color: white !important;
      padding: 14px 28px; text-decoration: none; border-radius: 6px;
      font-weight: 600; margin: 20px 0;
    }
    .footer { margin-top: 40px; font-size: 14px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${heading}</h1>
    <p>Xin chào,</p>
${bodyHtml}
${buttonHtml}
    <p class="footer">
      <div>—</div>
      ${footerNoteHtml}
      Cảm ơn bạn đã tin dùng ONI.<br>
      <strong>Đội ngũ ONI</strong>
    </p>
  </div>
</body>
</html>`
}

async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!resendApiKey) {
    console.warn("[sepay-webhook] RESEND_API_KEY chưa cấu hình — bỏ qua gửi email")
    return
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        from:    `ONI <${oniFromEmail}>`,
        to:      params.to,
        subject: params.subject,
        html:    params.html,
      }),
    })
    if (!res.ok) console.error("[sepay-webhook] Resend error:", await res.text())
    else console.log(`[sepay-webhook] Email đã gửi → ${params.to}: ${params.subject}`)
  } catch (err) {
    console.error("[sepay-webhook] sendEmail exception:", err)
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !user) return null
  return user.email ?? null
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return successResponse()

  // 1. Xác thực API key từ SePay
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
  if (!sepayWebhookApiKey || authHeader !== `Apikey ${sepayWebhookApiKey}`) {
    console.warn("[sepay-webhook] API key không hợp lệ")
    return new Response(JSON.stringify({ success: false, message: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  // 2. Parse payload
  // deno-lint-ignore no-explicit-any
  let payload: Record<string, any>
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ success: false, message: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  console.log("[sepay-webhook] Nhận webhook:", JSON.stringify({
    id:             payload.id,
    transferType:   payload.transferType,
    transferAmount: payload.transferAmount,
    content:        payload.content,
  }))

  // 3. Chỉ xử lý tiền vào
  if (payload.transferType !== "in") {
    console.log("[sepay-webhook] Bỏ qua — transferType:", payload.transferType)
    return successResponse()
  }

  // 4. Extract reference code từ nội dung CK
  //    Format thực tế: "SEVQR ONIAB12CD34" — extract phần ONI... để tra cứu DB
  const content       = String(payload.content ?? "")
  const refMatch      = content.match(/ONI[A-Z0-9]{6,12}/i)
  const referenceCode = refMatch?.[0]?.toUpperCase()

  if (!referenceCode) {
    console.log("[sepay-webhook] Không tìm thấy mã ONI... trong nội dung — không phải giao dịch của ONI")
    return successResponse()
  }

  console.log(`[sepay-webhook] Reference code: ${referenceCode}`)

  // 5. Tìm order pending với reference code này
  const { data: order, error: orderError } = await supabase
    .from("subscription_orders")
    .select("id, tenant_id, user_id, plan_code, billing_interval, amount_vnd, expires_at, status")
    .eq("reference_code", referenceCode)
    .eq("status", "pending")
    .maybeSingle()

  if (orderError) {
    console.error("[sepay-webhook] Lỗi tra cứu order:", orderError)
    return errorResponse("db_error")
  }

  if (!order) {
    console.log(`[sepay-webhook] Không tìm thấy pending order cho ref=${referenceCode} — có thể đã xử lý rồi`)
    return successResponse()
  }

  // 6. Kiểm tra hết hạn
  if (new Date(order.expires_at) < new Date()) {
    console.log(`[sepay-webhook] Order hết hạn: ref=${referenceCode}`)
    await supabase.from("subscription_orders").update({ status: "expired" }).eq("id", order.id)
    return successResponse()
  }

  // 7. Kiểm tra số tiền
  const transferAmount = Number(payload.transferAmount ?? 0)
  if (transferAmount < order.amount_vnd) {
    console.warn(
      `[sepay-webhook] Số tiền không đủ: nhận=${transferAmount} yêu cầu=${order.amount_vnd} ref=${referenceCode}`
    )
    return successResponse()
  }

  // ── Từ đây: giao dịch hợp lệ ─────────────────────────────────────────────

  const sepayTransactionId = Number(payload.id)

  // 8. Atomic claim — SET status='processing' WHERE status='pending'
  //    Chỉ 1 request thắng được; nếu 0 rows → request khác đang xử lý → bỏ qua.
  const { data: claimed, error: claimError } = await supabase
    .from("subscription_orders")
    .update({ status: "processing" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id")

  if (claimError) {
    console.error("[sepay-webhook] Lỗi claim:", claimError)
    return errorResponse("claim_failed")
  }

  if (!claimed || claimed.length === 0) {
    console.log(`[sepay-webhook] Order đang được xử lý bởi request khác — bỏ qua: ref=${referenceCode}`)
    return successResponse()
  }

  // 9. Fulfill plan — nếu fail → revert về 'pending' để SePay retry
  const fulfillResult = await fulfillPlan({
    order,
    sepayTransactionId,
  })

  const fulfillOk = fulfillResult.ok &&
    (await fulfillResult.clone().json().catch(() => ({}))).success !== false

  if (!fulfillOk) {
    await supabase
      .from("subscription_orders")
      .update({ status: "pending" })
      .eq("id", order.id)
      .eq("status", "processing")
    console.error(`[sepay-webhook] Fulfillment thất bại — revert về pending: ref=${referenceCode}`)
    return fulfillResult
  }

  // 10. Mark completed
  const { error: orderUpdateError } = await supabase
    .from("subscription_orders")
    .update({
      status:               "completed",
      fulfilled_at:         new Date().toISOString(),
      sepay_transaction_id: sepayTransactionId,
    })
    .eq("id", order.id)
    .eq("status", "processing")

  if (orderUpdateError) {
    if (
      orderUpdateError.message?.includes("unique") ||
      orderUpdateError.message?.includes("duplicate")
    ) {
      console.log(`[sepay-webhook] Duplicate sepay_transaction_id — đã completed: sepay_id=${sepayTransactionId}`)
    } else {
      console.error("[sepay-webhook] Lỗi cập nhật order (không nghiêm trọng, đã fulfill):", orderUpdateError)
    }
  }

  return fulfillResult
})

// ─── Plan fulfillment ─────────────────────────────────────────────────────────

async function fulfillPlan(params: {
  // deno-lint-ignore no-explicit-any
  order: Record<string, any>
  sepayTransactionId: number
}) {
  const { order } = params
  const { tenant_id, user_id, plan_code, billing_interval, amount_vnd } = order

  console.log(
    `[sepay-webhook] Kích hoạt plan: tenant=${tenant_id} plan=${plan_code}` +
    ` interval=${billing_interval} amount=${amount_vnd}`
  )

  // Lấy plan_id từ code
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, name")
    .eq("code", plan_code)
    .maybeSingle()

  if (planError || !plan) {
    console.error("[sepay-webhook] Không tìm thấy plan:", plan_code, planError)
    return errorResponse("plan_not_found")
  }

  // Lấy subscription hiện tại để tính ngày gia hạn cộng dồn
  const { data: currentSub } = await supabase
    .from("subscriptions")
    .select("current_period_end")
    .eq("tenant_id", tenant_id)
    .maybeSingle()

  const now        = new Date()
  const daysToAdd  = billing_interval === "yearly" ? 365 : 30

  // Cộng dồn từ ngày hết hạn hiện tại nếu còn thời hạn
  const baseDate  = currentSub?.current_period_end && new Date(currentSub.current_period_end) > now
    ? new Date(currentSub.current_period_end)
    : now

  const newPeriodEnd = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000)

  // Cập nhật subscription — upsert phòng trường hợp chưa có row
  const { error: subError } = await supabase
    .from("subscriptions")
    .upsert(
      {
        tenant_id:            tenant_id,
        plan_id:              plan.id,
        status:               "active",
        current_period_start: now.toISOString(),
        current_period_end:   newPeriodEnd.toISOString(),
      },
      { onConflict: "tenant_id" }
    )

  if (subError) {
    console.error("[sepay-webhook] Lỗi cập nhật subscription:", subError)
    return errorResponse("subscription_update_failed")
  }

  // Gửi email xác nhận (chỉ gửi cho email thật, bỏ qua các email dạng @*.oni.vn)
  const email = await getUserEmail(user_id)
  if (email && !email.endsWith('.oni.vn')) {
    const intervalLabel = billing_interval === "yearly" ? "1 năm" : "1 tháng"
    const accessUntil   = newPeriodEnd.toLocaleDateString("vi-VN", {
      year: "numeric", month: "long", day: "numeric",
    })
    await sendEmail({
      to:      email,
      subject: `ONI ${plan.name} — Thanh toán thành công`,
      html:    buildEmailHtml({
        heading:   "Thanh toán thành công!",
        bodyLines: [
          `Gói <strong class="highlight">${plan.name}</strong> (${intervalLabel}) của bạn đã được kích hoạt.`,
          `Bạn có thể sử dụng đầy đủ tính năng đến <strong>${accessUntil}</strong>.`,
          "Để gia hạn sau khi hết hạn, vui lòng quay lại trang quản lý và thực hiện thanh toán mới.",
        ],
        buttonText: "Vào Dashboard",
        buttonUrl:  `${oniAppUrl}/dashboard`,
        footerNote: "Nếu bạn cần hỗ trợ, vui lòng liên hệ <a href=\"mailto:support@oni.vn\">support@oni.vn</a>.",
      }),
    })
  }

  console.log(
    `[sepay-webhook] ✓ Plan kích hoạt thành công: tenant=${tenant_id} plan=${plan_code}` +
    ` ends=${newPeriodEnd.toISOString()}`
  )
  return successResponse()
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function successResponse() {
  return new Response(JSON.stringify({ success: true }), {
    status:  200,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(message: string) {
  return new Response(JSON.stringify({ success: false, message }), {
    status:  400,
    headers: { "Content-Type": "application/json" },
  })
}

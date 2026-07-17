import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { isZaloOAMessageEnabled, sendZaloOAMessageToUser } from '@/lib/server/zaloOA';

const PENDING_THRESHOLD_MINUTES = 5;

// Gửi tin nhắn OA qua Zalo Customer Service API
async function sendZaloOAMessage(zaloIdByOA: string, message: string): Promise<boolean> {
  try {
    const result = await sendZaloOAMessageToUser(zaloIdByOA, message);
    return result.sent;
  } catch (e) {
    console.error('[OA Cron] sendZaloOAMessage error:', e);
    return false;
  }
}

export async function GET(req: NextRequest) {
  // Bảo vệ endpoint - chỉ cho phép gọi nội bộ hoặc có secret key đúng
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const thresholdTime = new Date(Date.now() - PENDING_THRESHOLD_MINUTES * 60 * 1000).toISOString();

  try {
    const sendOAMsgEnabled = await isZaloOAMessageEnabled();
    if (!sendOAMsgEnabled) {
      return NextResponse.json({
        processed: 0,
        notified: 0,
        skipped: true,
        reason: 'disabled_by_setting',
        message: 'Zalo OA sending is disabled by system setting',
      });
    }

    // 1. Lấy tất cả đơn hàng QR đang chờ > 5 phút và chưa gửi thông báo OA
    const { data: pendingOrders, error: fetchError } = await admin
      .from('qr_order_requests')
      .select('id, tenant_id, branch_id, resource_id, items, created_at, customer_name, note')
      .eq('status', 'pending')
      .eq('oa_notified', false)
      .lte('created_at', thresholdTime)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) throw fetchError;
    if (!pendingOrders || pendingOrders.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No pending orders to notify' });
    }

    let notifiedCount = 0;
    const errors: string[] = [];

    for (const order of pendingOrders) {
      try {
        // 2. Lấy bàn ăn để hiển thị tên bàn
        let tableName = order.resource_id || 'Bàn không xác định';
        try {
          const { data: tableData } = await admin
            .from('location_resources')
            .select('name')
            .eq('id', order.resource_id)
            .maybeSingle();
          if (tableData?.name) tableName = tableData.name;
        } catch {}

        // 3. Lấy danh sách quản trị viên/chủ cửa hàng của tenant
        const { data: userTenants, error: utError } = await admin
          .from('user_tenants')
          .select('user_id')
          .eq('tenant_id', order.tenant_id);

        if (utError || !userTenants?.length) continue;

        // 4. Xây dựng nội dung tin nhắn cảnh báo
        const itemCount = Array.isArray(order.items) ? order.items.length : 0;
        const waitMinutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
        const customerDisplay = order.customer_name ? ` (${order.customer_name})` : '';
        const noteDisplay = order.note ? `\n📝 Ghi chú: ${order.note}` : '';

        const message =
          `⚠️ THÔNG BÁO ĐƠN GỌI MÓN CHƯA ĐƯỢC DUYỆT\n\n` +
          `🪑 Bàn: ${tableName}${customerDisplay}\n` +
          `🍽️ Số món: ${itemCount} món\n` +
          `⏱️ Đã chờ: ${waitMinutes} phút${noteDisplay}\n\n` +
          `Vui lòng mở ứng dụng ONI để duyệt ngay!\n` +
          `👉 https://zalo.me/s/${process.env.NEXT_PUBLIC_ZALO_MINI_APP_ID || '3208409885005498355'}/`;

        // 5. Gửi tin nhắn đến từng quản trị viên có đăng ký Zalo OA
        let sentToAny = false;
        for (const { user_id } of userTenants) {
          try {
            const { data: userData } = await admin.auth.admin.getUserById(user_id);
            const zaloIdByOA = userData?.user?.user_metadata?.zalo_id_by_oa;

            if (zaloIdByOA) {
              const sent = await sendZaloOAMessage(zaloIdByOA, message);
              if (sent) sentToAny = true;
            }
          } catch (userErr) {
            console.error(`[OA Cron] Failed to send to user ${user_id}:`, userErr);
          }
        }

        // 6. Đánh dấu đã xử lý (dù có gửi được hay không để tránh spam)
        await admin
          .from('qr_order_requests')
          .update({
            oa_notified: true,
            notified_at: new Date().toISOString(),
          })
          .eq('id', order.id);

        if (sentToAny) notifiedCount++;
      } catch (orderErr) {
        console.error(`[OA Cron] Error processing order ${order.id}:`, orderErr);
        errors.push(order.id);
      }
    }

    return NextResponse.json({
      processed: pendingOrders.length,
      notified: notifiedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error('[OA Cron] Fatal error:', e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

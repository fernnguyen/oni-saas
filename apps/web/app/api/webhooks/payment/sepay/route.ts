export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';
import { getConnectorForShop } from '@/lib/server/connectorFactory';
import { invalidate } from '@/lib/server/cache';
import { dispatchNotification } from '@/lib/server/notifications';

function getGMT7Time() {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 7);
  return d.toISOString().replace('Z', '');
}

export async function POST(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const token = sp.get('token') || '';

    const body = await req.json();
    console.log('[SEPAY Webhook] Payload received:', JSON.stringify(body));

    const {
      content = '',
      transferAmount = 0,
      transferType = 'in',
      gateway = '',
      accountNumber = '',
      code = '',
    } = body;

    if (transferType !== 'in' || parseFloat(transferAmount) <= 0) {
      return NextResponse.json({ success: true, message: 'Ignore non-inbound transaction' });
    }

    // 1. Identify order number/reference in transfer content
    // We search for patterns like ORD-xxxx or ORDxxxx or ONIORDxxxx
    const contentText = String(content).toUpperCase();
    const orderNoRegex = /(ORD[-_]?[A-Z0-9]+)/i;
    const match = contentText.match(orderNoRegex);
    const resolvedOrderNo = match ? match[1].trim() : '';

    if (!resolvedOrderNo) {
      console.log(`[SEPAY Webhook] Could not parse order reference from transfer content: "${content}"`);
      return NextResponse.json({
        success: false,
        error: 'Could not resolve order reference from content',
      }, { status: 400 });
    }

    console.log(`[SEPAY Webhook] Matched order reference: "${resolvedOrderNo}". Resolving database shop...`);

    const admin = getSupabaseAdminClient();

    // 2. We search globally for this order_no in active tenant branches (using raw client if needed, or query global index)
    // For local and multi-tenant scaling, we lookup the order across shops. 
    // We can query a list of recently active shops, or query our postgres database directly.
    // Let's run a query to locate the shop and order.
    // Select the order matching reference_no or order_no.
    // Wait, let's query all branches/shops, then look up the order.
    const { data: shops } = await admin.from('shops').select('id, tenant_id, name');
    if (!shops || shops.length === 0) {
      return NextResponse.json({ success: false, error: 'No active shops' }, { status: 400 });
    }

    let foundOrder: any = null;
    let targetShop: any = null;
    let shopConnector: any = null;

    for (const shop of shops) {
      try {
        const connector = await getConnectorForShop(shop.id, shop.tenant_id);
        const orderList = await connector.list('orders', {
          page: 1,
          limit: 1,
          filters: { order_no: resolvedOrderNo }
        });
        if (orderList.total > 0) {
          foundOrder = orderList.data[0];
          targetShop = shop;
          shopConnector = connector;
          break;
        }

        // Also fallback to search by reference_no/local ID
        const refList = await connector.list('orders', {
          page: 1,
          limit: 1,
          filters: { reference_no: resolvedOrderNo }
        });
        if (refList.total > 0) {
          foundOrder = refList.data[0];
          targetShop = shop;
          shopConnector = connector;
          break;
        }
      } catch (err) {
        // Silent catch for branches with different connectors or databases
      }
    }

    if (!foundOrder || !targetShop || !shopConnector) {
      console.log(`[SEPAY Webhook] Order "${resolvedOrderNo}" not found in any branch database.`);
      return NextResponse.json({
        success: false,
        error: `Order ${resolvedOrderNo} not found`,
      }, { status: 404 });
    }

    const shopId = targetShop.id;
    const tenantId = targetShop.tenant_id;
    const orderId = foundOrder.order_id || foundOrder.id;

    // 3. Verify security token if shop has webhook token configured in settings
    const { data: settings } = await admin
      .from('shop_settings')
      .select('sepay_webhook_token')
      .eq('shop_id', shopId)
      .maybeSingle();

    const configuredToken = settings?.sepay_webhook_token || '';
    if (configuredToken && token !== configuredToken) {
      console.log('[SEPAY Webhook] Token mismatch. Forbidden.');
      return NextResponse.json({ success: false, error: 'Unauthorized token' }, { status: 401 });
    }

    console.log(`[SEPAY Webhook] Processing payment for Order ID: ${orderId} (${resolvedOrderNo}) in shop ${targetShop.name}`);

    // 4. Update the order as paid, completed
    const currentPaid = parseFloat(foundOrder.paid_amount || '0');
    const totalAmount = parseFloat(foundOrder.total_amount || '0');
    const transferAmt = parseFloat(transferAmount);
    const newPaid = Math.min(totalAmount, currentPaid + transferAmt);
    const newDebt = Math.max(0, totalAmount - newPaid);
    const newStatus = newPaid >= totalAmount ? 'completed' : foundOrder.status;

    await shopConnector.update('orders', orderId, {
      paid_amount: String(newPaid),
      debt_amount: String(newDebt),
      status: newStatus,
    });

    // 5. Create a payment record
    const paymentId = `PAY-SEPAY-${Date.now()}`;
    await shopConnector.create('payments', {
      id: paymentId,
      order_id: orderId,
      order_no: resolvedOrderNo,
      method: 'bank_transfer',
      amount: String(transferAmt),
      reference_no: code,
      note: `Tự động gạch nợ SEPay: ${gateway} - TK ${accountNumber}`,
      paid_at: getGMT7Time(),
    });

    // 6. Create a cashbook receipt record
    // Locate the default bank fund for this shop
    const fundsRes = await shopConnector.list('payment-funds', {
      filters: { branch_id: shopId },
      limit: 100
    });
    const funds = fundsRes.data as any[];
    const bankFund = funds.find(f => f.type === 'bank' && f.is_default === 'TRUE') || funds.find(f => f.type === 'bank') || funds[0];

    let balanceAfter = '';
    if (bankFund) {
      const currentBal = parseFloat(bankFund.current_balance || '0');
      const nextBal = currentBal + transferAmt;
      balanceAfter = String(nextBal);

      await shopConnector.update('payment-funds', bankFund.id, {
        current_balance: balanceAfter
      });
    }

    await shopConnector.create('cashbook', {
      type: 'receipt',
      amount: String(transferAmt),
      method: 'bank_transfer',
      category: 'sales',
      reference_id: orderId,
      reference_name: foundOrder.customer_name || 'Khách lẻ',
      note: `Thanh toán chuyển khoản tự động SEPay cho đơn hàng ${resolvedOrderNo}`,
      employee_id: foundOrder.employee_id || '',
      branch_id: shopId,
      fund_id: bankFund?.id || '',
      balance_after_transaction: balanceAfter,
    });

    // 7. Clear table/room session resources if applicable (hourly vertical)
    if (foundOrder.metadata) {
      try {
        const meta = typeof foundOrder.metadata === 'string' ? JSON.parse(foundOrder.metadata) : foundOrder.metadata;
        const resourceId = meta?.resource_id || meta?.table_id;
        if (resourceId) {
          console.log(`[SEPAY Webhook] Order linked to resource ${resourceId}. Cleared session.`);
          // Update location resources status to available
          await shopConnector.update('location-resources', resourceId, {
            status: 'available',
            current_order_id: null,
            session_start: null,
          });
          invalidate(shopId, 'location-resources');
        }
      } catch (e) {
        console.error('Failed to clear linked session resource:', e);
      }
    }

    // 8. Invalidate relevant caches
    invalidate(shopId, 'orders');
    invalidate(shopId, 'payments');
    invalidate(shopId, 'cashbook');

    // 9. Dispatch a beautiful desktop/Telegram notification!
    await dispatchNotification(tenantId, 'ORDER_COMPLETED', {
      title: `⚡️ Đối soát SEPay thành công - ${targetShop.name}`,
      message: `Đơn hàng #${resolvedOrderNo} đã được thanh toán tự động qua chuyển khoản!\nSố tiền: +${transferAmt.toLocaleString('vi-VN')}đ\nNgân hàng: ${gateway}\nMã GD: ${code}\nTrạng thái: Hoàn tất đơn & Mở bàn sảnh.`,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully processed payment for order ${resolvedOrderNo}`,
      amount: transferAmt,
      order_id: orderId,
    });
  } catch (e: any) {
    console.error('[SEPAY Webhook] Fatal error:', e);
    return NextResponse.json({ success: false, error: e.message || 'Internal server error' }, { status: 500 });
  }
}

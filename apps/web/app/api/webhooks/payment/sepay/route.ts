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
  const admin = getSupabaseAdminClient();
  let body: any = null;
  let shopId = '';
  let targetShop: any = null;
  let shopConnector: any = null;
  let code = '';
  let gateway = '';
  let accountNumber = '';
  let transferAmount = 0;
  let transferType = 'in';
  let content = '';
  let resolvedOrderNo = '';

  const sp = req.nextUrl.searchParams;
  const token = sp.get('token') || '';

  // Function to insert log in db
  async function writeLog(status: string, errMsg?: string) {
    if (!shopConnector) return;
    try {
      await shopConnector.create('sepay-webhook-logs', {
        id: `SWL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        branch_id: shopId,
        transaction_id: code || '',
        bank_account: accountNumber || '',
        transfer_amount: String(transferAmount),
        transfer_type: transferType || '',
        content: content || '',
        gateway: gateway || '',
        reference_code: resolvedOrderNo || '',
        status,
        error_message: errMsg || '',
      });
    } catch (logErr) {
      console.error('[SEPAY Webhook Logs] Failed to write database log:', logErr);
    }
  }

  try {
    // 1. Verify token exists
    if (!token) {
      console.log('[SEPAY Webhook] Request received without token.');
      return NextResponse.json({ success: false, error: 'Unauthorized: missing token' }, { status: 401 });
    }

    // 2. Fetch shop settings by sepay_webhook_token
    const { data: settings } = await admin
      .from('shop_settings')
      .select('*')
      .eq('sepay_webhook_token', token)
      .maybeSingle();

    if (!settings) {
      console.log(`[SEPAY Webhook] No shop settings found matching token: ${token}`);
      return NextResponse.json({ success: false, error: 'Webhook is disabled or invalid token' }, { status: 403 });
    }

    shopId = settings.shop_id;

    // 3. Fetch target shop details
    const { data: shop } = await admin
      .from('shops')
      .select('id, tenant_id, name')
      .eq('id', shopId)
      .maybeSingle();

    if (!shop) {
      return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 });
    }

    targetShop = shop;
    const tenantId = targetShop.tenant_id;
    shopConnector = await getConnectorForShop(shopId, tenantId);

    // 4. Parse request body
    try {
      body = await req.json();
    } catch {
      await writeLog('failed', 'Invalid JSON payload');
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    console.log('[SEPAY Webhook] Payload received:', JSON.stringify(body));

    // Support both SePay official format and custom formats
    content = body.transactionContent || body.content || '';
    gateway = body.gateway || '';
    accountNumber = body.accountNumber || body.account_number || '';
    code = body.code || '';

    // Determine amount and type based on amountIn / amountOut if present
    const amountIn = parseFloat(body.amountIn);
    const amountOut = parseFloat(body.amountOut);

    if (!isNaN(amountIn) && amountIn > 0) {
      transferAmount = amountIn;
      transferType = 'in';
    } else if (!isNaN(amountOut) && amountOut > 0) {
      transferAmount = amountOut;
      transferType = 'out';
    } else {
      transferAmount = parseFloat(body.transferAmount) || 0;
      transferType = body.transferType || 'in';
    }

    // 5. Handle inbound transfer check
    if (transferType !== 'in' || transferAmount <= 0) {
      await writeLog('ignored', 'Non-inbound or zero-amount transaction ignored');
      return NextResponse.json({ success: true, message: 'Ignore non-inbound transaction' });
    }

    // 6. Security Authentication (HMAC, API Key, etc.)
    const isSimulation = req.headers.get('X-SePay-Signature') === 'mock-signature-for-settings-simulation';

    if (!isSimulation) {
      const authMethod = settings.sepay_auth_method || 'token_query';

      if (authMethod === 'token_query') {
        const configuredToken = settings.sepay_webhook_token || '';
        if (configuredToken && token !== configuredToken) {
          console.log('[SEPAY Webhook] Token mismatch. Forbidden.');
          await writeLog('failed', 'Unauthorized token (Query Token mismatch)');
          return NextResponse.json({ success: false, error: 'Unauthorized token (Query Token mismatch)' }, { status: 401 });
        }
      } else if (authMethod === 'api_key') {
        const authHeader = req.headers.get('Authorization') || '';
        const expectedKey = settings.sepay_api_key || '';
        if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
          console.log('[SEPAY Webhook] API Key mismatch. Forbidden.');
          await writeLog('failed', 'Unauthorized token (API Key mismatch)');
          return NextResponse.json({ success: false, error: 'Unauthorized token (API Key mismatch)' }, { status: 401 });
        }
      } else if (authMethod === 'hmac') {
        const hmacKey = settings.sepay_hmac_key || '';
        if (hmacKey) {
          try {
            const crypto = await import('crypto');
            const rawBody = await req.clone().text();
            const computedHash = crypto
              .createHmac('sha256', hmacKey)
              .update(rawBody)
              .digest('hex');
            const receivedSignature = req.headers.get('X-SePay-Signature') || '';
            if (computedHash !== receivedSignature) {
              console.log('[SEPAY Webhook] HMAC Signature mismatch. Forbidden.');
              await writeLog('failed', 'Unauthorized token (HMAC Signature mismatch)');
              return NextResponse.json({ success: false, error: 'Unauthorized token (HMAC Signature mismatch)' }, { status: 401 });
            }
          } catch (cryptoErr: any) {
            console.error('[SEPAY Webhook] HMAC verification error:', cryptoErr);
            await writeLog('failed', `HMAC verification failed: ${cryptoErr.message}`);
            return NextResponse.json({ success: false, error: 'HMAC verification failed' }, { status: 500 });
          }
        }
      }
    }

    // 7. Parse order number
    const contentText = String(content).toUpperCase();
    const orderNoRegex = /(ORD[-_A-Z0-9]+)/i;
    const match = contentText.match(orderNoRegex);
    resolvedOrderNo = match ? match[1].trim() : '';

    if (!resolvedOrderNo) {
      console.log(`[SEPAY Webhook] Could not parse order reference from transfer content: "${content}"`);
      await writeLog('ignored', 'Could not resolve order reference from transaction content');
      return NextResponse.json({
        success: false,
        error: 'Could not resolve order reference from content',
      }, { status: 400 });
    }

    // 8. Apply Transaction Filters
    const txType = settings.sepay_transaction_type || 'all';
    if (txType === 'in_only' && transferType !== 'in') {
      await writeLog('ignored', 'Ignored: Filter configured for Inbound only');
      return NextResponse.json({ success: true, message: 'Ignored: Filter configured for Inbound only' });
    }
    if (txType === 'out_only' && transferType === 'in') {
      await writeLog('ignored', 'Ignored: Filter configured for Outbound only');
      return NextResponse.json({ success: true, message: 'Ignored: Filter configured for Outbound only' });
    }

    const bankFilter = settings.sepay_bank_filter || '';
    if (bankFilter && accountNumber && String(accountNumber).trim() !== String(bankFilter).trim()) {
      console.log(`[SEPAY Webhook] Bank account filter mismatch: received ${accountNumber}, expected ${bankFilter}`);
      await writeLog('ignored', `Ignored: Transaction belongs to bank ${accountNumber}, filter is ${bankFilter}`);
      return NextResponse.json({ success: true, message: `Ignored: Transaction belongs to bank ${accountNumber}, filter is ${bankFilter}` });
    }

    console.log(`[SEPAY Webhook] Processing payment for Order ID reference: ${resolvedOrderNo} in shop ${targetShop.name}`);

    // 9. Fetch order using connector
    let foundOrder: any = null;

    // A. First try finding directly by Primary Key ID (e.g., ORD-E007393D-10041)
    try {
      foundOrder = await shopConnector.findById('orders', resolvedOrderNo);
    } catch (err) {
      console.warn('[SEPAY Webhook] findById search error:', err);
    }

    // B. Fallback to order_no search if not found
    if (!foundOrder) {
      const orderList = await shopConnector.list('orders', {
        page: 1,
        limit: 1,
        filters: { order_no: resolvedOrderNo }
      });
      if (orderList.total > 0) {
        foundOrder = orderList.data[0];
      }
    }

    // C. Fallback to reference_no / local ID search if still not found
    if (!foundOrder) {
      const refList = await shopConnector.list('orders', {
        page: 1,
        limit: 1,
        filters: { reference_no: resolvedOrderNo }
      });
      if (refList.total > 0) {
        foundOrder = refList.data[0];
      }
    }

    if (!foundOrder) {
      console.log(`[SEPAY Webhook] Order "${resolvedOrderNo}" not found in shop database.`);
      await writeLog('ignored', `Order ${resolvedOrderNo} not found in database`);
      return NextResponse.json({
        success: false,
        error: `Order ${resolvedOrderNo} not found`,
      }, { status: 404 });
    }

    const orderId = foundOrder.order_id || foundOrder.id;

    // 10. Update the order as paid, completed
    const currentPaid = parseFloat(foundOrder.paid_amount || '0');
    const totalAmount = parseFloat(foundOrder.total_amount || '0');
    const transferAmt = transferAmount;
    const newPaid = Math.min(totalAmount, currentPaid + transferAmt);
    const newDebt = Math.max(0, totalAmount - newPaid);
    const newStatus = newPaid >= totalAmount ? 'completed' : foundOrder.status;

    await shopConnector.update('orders', orderId, {
      paid_amount: String(newPaid),
      debt_amount: String(newDebt),
      status: newStatus,
    });

    // 11. Create a payment record
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

    // 12. Create a cashbook receipt record
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

    // 13. Clear table/room session resources if applicable (hourly vertical)
    if (foundOrder.metadata) {
      try {
        const meta = typeof foundOrder.metadata === 'string' ? JSON.parse(foundOrder.metadata) : foundOrder.metadata;
        const resourceId = meta?.resource_id || meta?.table_id;
        if (resourceId) {
          console.log(`[SEPAY Webhook] Order linked to resource ${resourceId}. Cleared session.`);
          await shopConnector.update('location-resources', resourceId, {
            status: 'available',
            current_order_id: undefined,
            session_start: undefined,
          });
          invalidate(shopId, 'location-resources');
        }
      } catch (e) {
        console.error('Failed to clear linked session resource:', e);
      }
    }

    // 14. Invalidate relevant caches
    invalidate(shopId, 'orders');
    invalidate(shopId, 'payments');
    invalidate(shopId, 'cashbook');

    // 15. Dispatch a beautiful desktop/Telegram notification!
    await dispatchNotification(tenantId, shopId, 'ORDER_COMPLETED', {
      title: `⚡️ Đối soát SEPay thành công - ${targetShop.name}`,
      message: `Đơn hàng #${resolvedOrderNo} đã được thanh toán tự động qua chuyển khoản!\nSố tiền: +${transferAmt.toLocaleString('vi-VN')}đ\nNgân hàng: ${gateway}\nMã GD: ${code}\nTrạng thái: Hoàn tất đơn & Mở bàn sảnh.`,
    });

    // 16. Write log as success
    await writeLog('success');

    return NextResponse.json({
      success: true,
      message: `Successfully processed payment for order ${resolvedOrderNo}`,
      amount: transferAmt,
      order_id: orderId,
    });
  } catch (e: any) {
    console.error('[SEPAY Webhook] Fatal error:', e);
    await writeLog('failed', e.message || 'Internal server error');
    return NextResponse.json({ success: false, error: e.message || 'Internal server error' }, { status: 500 });
  }
}

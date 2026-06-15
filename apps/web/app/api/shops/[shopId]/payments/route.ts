export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { paymentCreateSchema } from '@/lib/validators/orders'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { dispatchNotification } from '@/lib/server/notifications'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const order_id = sp.get('order_id') ?? ''
    const filters: Record<string, string> = {}
    if (order_id) filters.order_id = order_id

    const result = await connector.list('payments', { page, limit, filters })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET payments')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId)

    const body = await req.json()
    const data = paymentCreateSchema.parse(body)
    if (!data.paid_at) {
      data.paid_at = new Date().toISOString()
    }

    const created = await connector.create('payments', data)
    invalidate(shopId, 'payments')
    invalidate(shopId, 'orders');

    // Dispatch PAYMENT_RECEIVED notification in background
    (async () => {
      try {
        const admin = getSupabaseAdminClient();
        const { data: shop } = await admin
          .from('shops')
          .select('tenant_id, name, slug')
          .eq('id', shopId)
          .maybeSingle();

        if (shop) {
          const amountText = `${Number(data.amount).toLocaleString('vi-VN')}đ`;
          const message = `Mã đơn: #${data.order_no || ''}\nSố tiền thanh toán: ${amountText}\nPhương thức: ${data.method || 'Khác'}\n${data.note ? `Ghi chú: ${data.note}\n` : ''}`;
          const path = `/${shop.slug}/orders?search=${data.order_no || ''}`;
          
          await dispatchNotification(shop.tenant_id, shopId, 'PAYMENT_RECEIVED', {
            title: `💰 Thanh toán thành công - ${shop.name}`,
            message,
            url: path,
            data: {
              order_id: data.order_id,
              order_no: data.order_no
            }
          });
        }
      } catch (err) {
        console.error('Failed to send PAYMENT_RECEIVED notification:', err);
      }
    })();

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST payments')
  }
}

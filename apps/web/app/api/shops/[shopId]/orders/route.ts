export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { orderCreateSchema } from '@/lib/validators/orders'
import { shopTag, invalidate, shopCache } from '@/lib/server/cache'
import { cacheTTL } from '@/lib/env'
import { handleApiError } from '../../_helpers'
import { dispatchNotification } from '@/lib/server/notifications'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

function getGMT7Time() {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 7)
  return d.toISOString().replace('Z', '')
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'orders.view')

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50')))
    const search = sp.get('search') ?? ''
    const status = sp.get('status') ?? ''
    const channel = sp.get('channel') ?? ''
    const customer_id = sp.get('customer_id') ?? ''
    const filters: Record<string, string> = {}
    if (status) filters.status = status
    if (channel) filters.channel = channel
    if (customer_id) filters.customer_id = customer_id

    const result = await connector.list('orders', { page, limit, search: search || undefined, filters, sortDesc: true })

    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET orders')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector, shop, user, permissions } = await requireShopAccess(shopId, 'orders.create')

    const body = await req.json()
    const data = orderCreateSchema.parse(body)

    // --- KIỂM TRA CA LÀM VIỆC (SHIFT MANAGEMENT) ---
    const admin = getSupabaseAdminClient()
    const { data: settings } = await admin
      .from('shop_settings')
      .select('enable_shift_management')
      .eq('shop_id', shopId)
      .maybeSingle()

    const isShiftEnabled = settings?.enable_shift_management ?? false
    let activeShift: Record<string, string> | null = null

    if (isShiftEnabled) {
      const isBypassShift = permissions.includes('cashbook.shift.manage')

      if (!isBypassShift) {
        const userEmail = user.email || ''
        const branchId = data.branch_id || ''
        
        const shiftsRes = await connector.list('shop-shifts', {
          filters: { branch_id: branchId, user_id: userEmail, status: 'open' },
          limit: 1
        })
        
        if (shiftsRes.total === 0) {
          return NextResponse.json(
            { error: 'Yêu cầu mở ca làm việc: Vui lòng mở ca làm việc tại POS trước khi bán hàng!' },
            { status: 400 }
          )
        }
        activeShift = shiftsRes.data[0]
      }
    }

    let finalCustomerId = data.customer_id ?? ''
    
    // Auto-create customer if name is provided but no ID
    const isRetailGuest = !data.customer_name || data.customer_name.trim().toLowerCase() === 'khách lẻ' || data.customer_name.trim().toLowerCase() === 'khach le';
    if (isRetailGuest) {
      finalCustomerId = 'C-DEFAULT-RETAIL'
      data.customer_name = 'Khách lẻ'
    } else if (!finalCustomerId) {
      const meta = typeof data.metadata === 'string' ? JSON.parse(data.metadata || '{}') : (data.metadata || {})
      const newCustomer = await connector.create('customers', {
        name: data.customer_name,
        phone: meta.customer_phone || ''
      })
      finalCustomerId = (newCustomer as Record<string, string>).customer_id || ''
    }

    const created = await connector.create('orders', {
      ...data,
      customer_id: finalCustomerId,
      created_at: getGMT7Time()
    })

    // Cập nhật expected_closing_cash của ca nếu thanh toán bằng tiền mặt
    if (isShiftEnabled && activeShift && data.payment_method === 'cash') {
      const currentExpected = parseFloat(activeShift.expected_closing_cash || '0')
      const paid = parseFloat(data.paid_amount || '0')
      await connector.update('shop-shifts', activeShift.id, {
        expected_closing_cash: String(currentExpected + paid)
      })
    }

    invalidate(shopId, 'orders')
    
    // Run notification formatting and dispatch asynchronously to prevent blocking response
    ;(async () => {
      try {
        const itemsList = Array.isArray(body.items) ? body.items.map((it: any, i: number) => {
          const itemTotal = Number(it.line_total).toLocaleString('vi-VN');
          const unitPrice = Number(it.unit_price).toLocaleString('vi-VN');
          let txt = `${i + 1}. ${it.product_name}\n   ${it.qty} x ${unitPrice}đ = ${itemTotal}đ`;
          if (Number(it.line_discount) > 0) {
            txt += ` (Giảm: ${Number(it.line_discount).toLocaleString('vi-VN')}đ)`;
          }
          return txt;
        }).join('\n') : '';

        const admin = getSupabaseAdminClient();
        const { data: tenant } = await admin.from('tenants').select('slug').eq('id', shop.tenant_id).maybeSingle();
        const domainName = tenant?.slug ? `${tenant.slug}.oni.vn` : 'oni.vn';
        const creatorEmail = user?.email || 'Unknown';

        let customerPhone = ''
        if (data.customer_id) {
          try {
            const customer = await connector.findById('customers', data.customer_id)
            if (customer) {
              customerPhone = (customer.phone as string) || ''
            }
          } catch (err) {
            console.error('Failed to fetch customer:', err)
          }
        }

        const paymentMethodMap: Record<string, string> = {
          cash: 'Tiền mặt',
          card: 'Quẹt thẻ',
          bank_transfer: 'Chuyển khoản',
          momo: 'MoMo',
          vnpay: 'VNPay',
          zalopay: 'ZaloPay',
          debt: 'Ghi nợ'
        };

        let paidText = `${Number(data.paid_amount).toLocaleString('vi-VN')}đ`;
        if (data.payment_method) {
          const methodName = paymentMethodMap[data.payment_method] || data.payment_method;
          paidText += ` (${methodName})`;
        }

        const customerDisplay = data.customer_name 
          ? `${data.customer_name}${customerPhone ? ` (${customerPhone})` : ''}` 
          : 'Khách lẻ';

        const message = `Mã đơn: #${data.order_no}\nKhách hàng: ${customerDisplay}\n${data.note ? `Ghi chú: ${data.note}\n` : ''}\n🛍 MẶT HÀNG:\n${itemsList}\n\n💰 THANH TOÁN:\nTiền hàng: ${Number(data.subtotal).toLocaleString('vi-VN')}đ\nGiảm giá: ${Number(data.discount_amount).toLocaleString('vi-VN')}đ\nTổng cộng: ${Number(data.total_amount).toLocaleString('vi-VN')}đ\nĐã thu: ${paidText}\nCòn nợ: ${Number(data.debt_amount || 0).toLocaleString('vi-VN')}đ\n\n📝 Người tạo phiếu: ${creatorEmail} (${domainName})`;

        await dispatchNotification(shop.tenant_id, shopId, 'ORDER_CREATED', {
          title: `📦 Đơn hàng mới (Online) - ${shop.name}`,
          message,
        });
      } catch (err) {
        console.error('Background notification error:', err)
      }
    })()

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e, 'POST orders')
  }
}

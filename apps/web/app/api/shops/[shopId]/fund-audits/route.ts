export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireShopAccess } from '@/lib/server/shopAccess'
import { invalidate } from '@/lib/server/cache'
import { handleApiError } from '../../_helpers'
import { fundAuditCreateSchema } from '@/lib/validators/fund-audits'
import { RollbackContext } from '@oni/adapters'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params
    const { connector } = await requireShopAccess(shopId, 'cashbook.view')

    const { searchParams } = new URL(req.url)
    const fund_id = searchParams.get('fund_id')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const filters: Record<string, string> = {}
    if (fund_id) filters.fund_id = fund_id

    const result = await connector.list('fund-audits', { page, limit, filters, sortDesc: true })
    return NextResponse.json(result)
  } catch (e) {
    return handleApiError(e, 'GET fund-audits')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  let tx: RollbackContext | undefined;
  try {
    const { shopId } = await params
    const { connector, user } = await requireShopAccess(shopId, 'cashbook.audit')
    tx = new RollbackContext()

    const body = await req.json()
    const payload = fundAuditCreateSchema.parse(body)

    // 1. Lấy thông tin quỹ cần kiểm kê
    const fund = await connector.findById('payment-funds', payload.fund_id)
    if (!fund) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản quỹ cần kiểm kê' }, { status: 404 })
    }

    const systemBalance = parseFloat(fund.current_balance || '0')
    const actualBalance = payload.actual_balance
    const variance = actualBalance - systemBalance

    // 2. Tạo phiếu kiểm quỹ
    const createdAudit = await connector.create('fund-audits', {
      fund_id: payload.fund_id,
      audited_by: user.email || 'System',
      audited_at: new Date().toISOString(),
      system_balance: String(systemBalance),
      actual_balance: String(actualBalance),
      variance: String(variance),
      cash_denominations: payload.cash_denominations ? JSON.stringify(payload.cash_denominations) : '{}',
      status: 'confirmed',
      note: payload.note ?? '',
      active: 'TRUE',
    })
    const auditId = (createdAudit as any).audit_id || createdAudit.id

    tx.add(async () => {
      await connector.delete('fund-audits', auditId).catch(() => {})
    })

    // 3. Cơ chế tự động tạo phiếu Thu/Chi cân bằng quỹ nếu có chênh lệch
    if (variance !== 0) {
      const amount = Math.abs(variance)
      const type = variance > 0 ? 'receipt' : 'payment'
      const note = variance > 0
        ? `Thu điều chỉnh cân bằng quỹ do thừa khi kiểm kê (Phiếu kiểm #${auditId})`
        : `Chi điều chỉnh cân bằng quỹ do thiếu khi kiểm kê (Phiếu kiểm #${auditId})`

      // Tạo phiếu cashbook cân bằng
      const createdCb = await connector.create('cashbook', {
        type,
        amount: String(amount),
        method: fund.type || 'cash',
        category: 'other',
        reference_id: auditId,
        reference_name: 'Hệ thống tự động',
        note,
        branch_id: fund.branch_id || '',
        employee_id: user.email || 'System',
        fund_id: fund.id,
        balance_after_transaction: String(actualBalance),
      })
      tx.add(async () => {
        await connector.delete('cashbook', (createdCb as any).transaction_id).catch(() => {})
      })
    }

    // 4. Cập nhật số dư hiện tại của quỹ về giá trị thực tế
    await connector.update('payment-funds', fund.id, {
      current_balance: String(actualBalance)
    })
    tx.add(async () => {
      await connector.update('payment-funds', fund.id!, {
        current_balance: String(systemBalance)
      }).catch(() => {})
    })

    invalidate(shopId, 'fund-audits')
    invalidate(shopId, 'cashbook')
    invalidate(shopId, 'payment-funds')

    return NextResponse.json(createdAudit, { status: 201 })
  } catch (e) {
    if (tx) {
      await tx.rollback()
    }
    return handleApiError(e, 'POST fund-audits')
  }
}

'use client'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/app/components/ui/PageHeader'

interface Props { shopId: string }

interface MonthRow { month: string; revenue: number; refund: number; debt: number; orders: number; net: number }
interface DebtCustomer { customer_id: string; customer_name: string; phone: string; debt_amount: string }
interface AccountingData {
  monthlySeries:    MonthRow[]
  paymentBreakdown: Record<string, number>
  debtCustomers:    DebtCustomer[]
  totalDebt:        number
  totalRevenue:     number
  totalRefund:      number
  totalNet:         number
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Tiền mặt', card: 'Thẻ', bank_transfer: 'Chuyển khoản',
  momo: 'MoMo', vnpay: 'VNPay', zalopay: 'ZaloPay', debt: 'Nợ',
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + 'đ' }
function fmtMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `T${m}/${y}`
}

function SummaryCard({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}

export function AccountingClient({ shopId }: Props) {
  const { data, isLoading } = useQuery<AccountingData>({
    queryKey: ['reports-accounting', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/reports/accounting`)
      if (!res.ok) throw new Error('Không tải được báo cáo')
      return res.json()
    },
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Kế toán" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      </div>
    )
  }

  if (!data) return null

  // Payment breakdown code...

  // Debt customers
  const { monthlySeries, paymentBreakdown, debtCustomers, totalDebt, totalRevenue, totalRefund, totalNet } = data
  const paymentEntries = Object.entries(paymentBreakdown).sort((a, b) => b[1] - a[1])
  const totalPayments  = paymentEntries.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Kế toán" />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Tổng doanh thu"    value={fmtVND(totalRevenue)} />
        <SummaryCard label="Tổng hoàn trả"     value={fmtVND(totalRefund)} />
        <SummaryCard label="Doanh thu thuần"   value={fmtVND(totalNet)} />
        <SummaryCard label="Tổng công nợ"      value={fmtVND(totalDebt)} className="border-orange-200" />
      </div>

      {/* Monthly table */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-700">Doanh thu 12 tháng gần nhất</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-5 py-3">Tháng</th>
                <th className="px-5 py-3 text-right">Đơn hàng</th>
                <th className="px-5 py-3 text-right">Doanh thu</th>
                <th className="px-5 py-3 text-right">Hoàn trả</th>
                <th className="px-5 py-3 text-right">Công nợ</th>
                <th className="px-5 py-3 text-right font-semibold">Thuần</th>
              </tr>
            </thead>
            <tbody>
              {monthlySeries.map((row) => (
                <tr key={row.month} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{fmtMonth(row.month)}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{row.orders}</td>
                  <td className="px-5 py-3 text-right">{fmtVND(row.revenue)}</td>
                  <td className="px-5 py-3 text-right text-red-600">{row.refund > 0 ? `-${fmtVND(row.refund)}` : '—'}</td>
                  <td className="px-5 py-3 text-right text-orange-600">{row.debt > 0 ? fmtVND(row.debt) : '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold">{fmtVND(row.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-sm font-semibold">
                <td className="px-5 py-3">Tổng cộng</td>
                <td className="px-5 py-3 text-right">{monthlySeries.reduce((s, r) => s + r.orders, 0)}</td>
                <td className="px-5 py-3 text-right">{fmtVND(totalRevenue)}</td>
                <td className="px-5 py-3 text-right text-red-600">{totalRefund > 0 ? `-${fmtVND(totalRefund)}` : '—'}</td>
                <td className="px-5 py-3 text-right text-orange-600">{totalDebt > 0 ? fmtVND(totalDebt) : '—'}</td>
                <td className="px-5 py-3 text-right">{fmtVND(totalNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Payment breakdown */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Phân bổ thanh toán</h2>
          {paymentEntries.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-3">
              {paymentEntries.map(([method, amount]) => {
                const pct = totalPayments > 0 ? (amount / totalPayments) * 100 : 0
                return (
                  <div key={method}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-slate-600">{PAYMENT_LABEL[method] ?? method}</span>
                      <span className="font-medium">{fmtVND(amount)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-right text-xs text-slate-400">{pct.toFixed(1)}%</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Debt customers */}
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-700">
              Khách hàng nợ ({debtCustomers.length} người)
            </h2>
          </div>
          {debtCustomers.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Không có công nợ</p>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2">Khách hàng</th>
                    <th className="px-4 py-2">Điện thoại</th>
                    <th className="px-4 py-2 text-right">Nợ</th>
                  </tr>
                </thead>
                <tbody>
                  {debtCustomers.map((c) => (
                    <tr key={c.customer_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="max-w-[120px] truncate px-4 py-2 font-medium">{c.customer_name || '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{c.phone || '—'}</td>
                      <td className="px-4 py-2 text-right font-medium text-orange-600">
                        {Number(c.debt_amount).toLocaleString('vi-VN')}đ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

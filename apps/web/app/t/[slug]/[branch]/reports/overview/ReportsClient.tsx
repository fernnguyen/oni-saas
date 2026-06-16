'use client'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/app/components/ui/PageHeader'
import { getPaymentMethodLabel } from '@oni/core'

interface Props { shopId: string }

interface KpiPeriod   { orders: number; revenue: number }
interface RevenueDay  { date: string; revenue: number }
interface TopProduct  { id: string; name: string; revenue: number; qty: number }
interface TopResource { id: string; name: string; count: number; revenue: number }
interface OverviewData {
  kpi: { today: KpiPeriod; month: KpiPeriod; returns: { count: number; refund: number } }
  revenueSeries: RevenueDay[]
  topProducts: TopProduct[]
  statusBreakdown: Record<string, number>
  paymentRevenue: Record<string, number>
  topResources: TopResource[]
}

const STATUS_LABEL: Record<string, string> = {
  draft:      'Nháp',
  confirmed:  'Đã xác nhận',
  processing: 'Đang xử lý',
  completed:  'Hoàn thành',
  cancelled:  'Đã hủy',
  refunded:   'Hoàn tiền',
  in_progress: 'Đang sử dụng',
}

const PAYMENT_LABEL: Record<string, string> = {
  cash:          'Tiền mặt',
  card:          'Thẻ',
  bank_transfer: 'Chuyển khoản',
  momo:          'MoMo',
  vnpay:         'VNPay',
  zalopay:       'ZaloPay',
  debt:          'Nợ',
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + 'đ' }
function fmtShort(v: number) {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B'
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'K'
  return String(v)
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

// Simple bar chart — no external chart library needed
function MiniBarChart({ data }: { data: { label: string; tooltipLabel?: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex h-32 items-end gap-px">
      {data.map((d, i) => (
        <div
          key={i}
          className="group relative flex-1"
          style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
        >
          <div className="h-full w-full rounded-t bg-blue-400 transition-colors group-hover:bg-blue-600" />
          <div className="absolute bottom-full left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-xs text-white group-hover:block z-10">
            {d.tooltipLabel || d.label}: {fmtShort(d.value)}đ
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReportsClient({ shopId }: Props) {
  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ['reports-overview', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/reports/overview`)
      if (!res.ok) throw new Error('Không tải được báo cáo')
      return res.json()
    },
    staleTime: 120_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Báo cáo tổng quan" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { kpi, revenueSeries, topProducts, statusBreakdown, paymentRevenue } = data

  // Last 30 days revenue chart — show every 5th day label
  const chartData = revenueSeries.map((d, i) => {
    const parts = d.date.split('-')
    const [y, m, day] = parts.length === 3 ? parts : [d.date, '', '']
    const formattedLabel = parts.length === 3 ? `${day}/${m}` : d.date
    const formattedTooltip = parts.length === 3 ? `${day}/${m}/${y}` : d.date

    return {
      label: i % 5 === 0 ? formattedLabel : '',
      tooltipLabel: formattedTooltip,
      value: d.revenue,
      fullDate: d.date,
    }
  })

  const statusEntries  = Object.entries(statusBreakdown).sort((a, b) => b[1] - a[1])
  const paymentEntries = Object.entries(paymentRevenue).sort((a, b) => b[1] - a[1])
  const totalPayments  = paymentEntries.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Báo cáo tổng quan" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Doanh thu hôm nay"
          value={fmtVND(kpi.today.revenue)}
          sub={`${kpi.today.orders} đơn`}
        />
        <KpiCard
          label="Doanh thu tháng này"
          value={fmtVND(kpi.month.revenue)}
          sub={`${kpi.month.orders} đơn`}
        />
        <KpiCard
          label="Trả hàng"
          value={String(kpi.returns.count) + ' phiếu'}
          sub={`Hoàn: ${fmtVND(kpi.returns.refund)}`}
        />
        <KpiCard
          label="Tỷ lệ hoàn tiền"
          value={kpi.month.revenue > 0
            ? ((kpi.returns.refund / kpi.month.revenue) * 100).toFixed(1) + '%'
            : '—'}
          sub="so với doanh thu tháng"
        />
      </div>

      {/* Revenue chart */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Doanh thu 30 ngày qua</h2>
        <MiniBarChart data={chartData} />
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          {chartData.filter((d) => d.label).map((d) => (
            <span key={d.fullDate}>{d.label}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Left Column: Top products & Top resources */}
        <div className="space-y-5">
          {/* Top products */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Top 10 sản phẩm (doanh thu)</h2>
            {topProducts.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p, i) => {
                  const max = topProducts[0].revenue
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-slate-700">{p.name}</p>
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${(p.revenue / max) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-slate-700">{fmtShort(p.revenue)}đ</p>
                        <p className="text-xs text-slate-400">{Math.round(p.qty)} sp</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top resources */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Hiệu suất phòng / bàn (lượt dùng)</h2>
            {!data.topResources || data.topResources.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Chưa có dữ liệu phòng/bàn</p>
            ) : (
              <div className="space-y-2">
                {data.topResources.map((r, i) => {
                  const max = data.topResources[0].count
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-slate-700">{r.name}</p>
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: max > 0 ? `${(r.count / max) * 100}%` : '0%' }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-slate-700">{fmtShort(r.revenue)}đ</p>
                        <p className="text-xs text-slate-400">{r.count} lượt</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: status + payment */}
        <div className="space-y-5">
          {/* Order status breakdown */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Trạng thái đơn hàng</h2>
            {statusEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-2">
                {statusEntries.map(([status, count]) => {
                  const total = statusEntries.reduce((s, [, v]) => s + v, 0)
                  return (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{STATUS_LABEL[status] ?? status}</span>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-400"
                            style={{ width: `${(count / total) * 100}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-medium text-slate-700">{count}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Payment method breakdown */}
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Hình thức thanh toán (tháng này)</h2>
            {paymentEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-2">
                {paymentEntries.map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{getPaymentMethodLabel(method)}</span>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: totalPayments > 0 ? `${(amount / totalPayments) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="w-20 text-right font-medium text-slate-700">{fmtShort(amount)}đ</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

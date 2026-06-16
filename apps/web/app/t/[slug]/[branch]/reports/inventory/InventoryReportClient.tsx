'use client'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/app/components/ui/PageHeader'
import { TagBadge, TagColor } from '@/app/components/ui/TagBadge'

interface Props { shopId: string }

interface OverviewData {
  kpi: {
    totalQty: number
    totalValue: number
    todayMovements: number
    monthMovements: number
  }
  movementProportion: Record<string, { count: number; qty: number }>
  activitySeries: { date: string; in: number; out: number }[]
  topProducts: { id: string; name: string; inQty: number; outQty: number }[]
}

const MOVEMENT_TYPES = [
  { value: 'purchase_in',  label: 'Nhập hàng',      color: 'blue'   as TagColor },
  { value: 'p2p_purchase_in', label: 'Nhập hàng P2P', color: 'indigo' as TagColor },
  { value: 'sale_out',     label: 'Bán hàng',       color: 'green'  as TagColor },
  { value: 'return_in',    label: 'Hàng trả về',    color: 'red'    as TagColor },
  { value: 'transfer_out', label: 'Xuất chuyển kho',color: 'orange' as TagColor },
  { value: 'transfer_in',  label: 'Nhập chuyển kho',color: 'purple' as TagColor },
  { value: 'adjustment',   label: 'Điều chỉnh',     color: 'yellow' as TagColor },
  { value: 'issue',        label: 'Hao hụt / Xuất hủy', color: 'red'    as TagColor },
]

const MOVEMENT_TYPE_MAP = Object.fromEntries(MOVEMENT_TYPES.map(t => [t.value, t]))

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

// Double bar chart for In/Out
function DoubleBarChart({ data }: { data: { label: string; tooltipLabel: string; inValue: number; outValue: number }[] }) {
  const maxIn = Math.max(...data.map(d => d.inValue), 1)
  const maxOut = Math.max(...data.map(d => d.outValue), 1)
  const globalMax = Math.max(maxIn, maxOut)

  return (
    <div className="flex h-40 items-end gap-1">
      {data.map((d, i) => (
        <div key={i} className="group relative flex flex-1 flex-col justify-end items-center gap-px h-full">
          <div className="flex items-end gap-0.5 w-full h-full justify-center">
            {/* In Bar */}
            <div 
              className="w-[45%] rounded-t bg-blue-400 transition-colors group-hover:bg-blue-600" 
              style={{ height: `${Math.max(2, (d.inValue / globalMax) * 100)}%` }}
            />
            {/* Out Bar */}
            <div 
              className="w-[45%] rounded-t bg-orange-400 transition-colors group-hover:bg-orange-600" 
              style={{ height: `${Math.max(2, (d.outValue / globalMax) * 100)}%` }}
            />
          </div>

          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block z-10 shadow-lg mb-1">
            <p className="font-semibold mb-1 text-[11px] text-slate-300">{d.tooltipLabel}</p>
            <p className="text-blue-300">Nhập: {d.inValue.toLocaleString('vi-VN')} sp</p>
            <p className="text-orange-300">Xuất: {d.outValue.toLocaleString('vi-VN')} sp</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function InventoryReportClient({ shopId }: Props) {
  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ['reports-inventory', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/reports/inventory`)
      if (!res.ok) throw new Error('Không tải được báo cáo kho')
      return res.json()
    },
    staleTime: 120_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Báo cáo kho" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { kpi, movementProportion, activitySeries, topProducts } = data

  const chartData = activitySeries.map((d, i) => {
    const parts = d.date.split('-')
    const [y, m, day] = parts.length === 3 ? parts : [d.date, '', '']
    return {
      label: i % 5 === 0 ? (parts.length === 3 ? `${day}/${m}` : d.date) : '',
      tooltipLabel: parts.length === 3 ? `${day}/${m}/${y}` : d.date,
      inValue: d.in,
      outValue: d.out,
      fullDate: d.date,
    }
  })

  const proportionEntries = Object.entries(movementProportion).sort((a, b) => b[1].qty - a[1].qty)
  const totalQtyMovements = proportionEntries.reduce((sum, [, v]) => sum + v.qty, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Báo cáo kho" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Tổng lượng tồn kho"
          value={kpi.totalQty.toLocaleString('vi-VN')}
          sub="sản phẩm"
        />
        <KpiCard
          label="Tổng giá trị tồn kho"
          value={fmtVND(kpi.totalValue)}
          sub="theo giá vốn"
        />
        <KpiCard
          label="Giao dịch hôm nay"
          value={kpi.todayMovements.toLocaleString('vi-VN')}
          sub="phiếu kho"
        />
        <KpiCard
          label="Giao dịch tháng này"
          value={kpi.monthMovements.toLocaleString('vi-VN')}
          sub="phiếu kho"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
        {/* Activity Series */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Lưu lượng xuất/nhập 30 ngày qua</h2>
            <div className="flex gap-3 text-xs font-medium">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-blue-400"></div>Nhập</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-orange-400"></div>Xuất</div>
            </div>
          </div>
          <DoubleBarChart data={chartData} />
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            {chartData.filter(d => d.label).map(d => (
              <span key={d.fullDate}>{d.label}</span>
            ))}
          </div>
        </div>

        {/* Proportion Breakdown */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm flex flex-col">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Tỷ lệ các loại phiếu (tháng này)</h2>
          
          {proportionEntries.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Chưa có dữ liệu</div>
          ) : (
            <div className="space-y-4 flex-1">
              {proportionEntries.map(([type, stats]) => {
                const meta = MOVEMENT_TYPE_MAP[type]
                const label = meta ? meta.label : type
                const percent = totalQtyMovements > 0 ? (stats.qty / totalQtyMovements) * 100 : 0
                
                return (
                  <div key={type} className="group">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-700 flex items-center gap-2">
                        {meta ? <TagBadge label={label} color={meta.color} /> : <span className="text-slate-600">{label}</span>}
                      </span>
                      <span className="text-slate-600 text-xs font-semibold">{percent.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="text-right w-16">
                        <p className="text-xs font-semibold text-slate-700">{stats.qty.toLocaleString('vi-VN')}</p>
                        <p className="text-[10px] text-slate-400">{stats.count} phiếu</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top Products Inbound vs Outbound */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Top sản phẩm nhập kho & Tỷ lệ xuất kho</h2>
        {topProducts.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-4">
            {topProducts.map((p, i) => {
              const maxVal = Math.max(p.inQty, p.outQty, 1)
              const inPercent = (p.inQty / maxVal) * 100
              const outPercent = (p.outQty / maxVal) * 100
              
              return (
                <div key={p.id} className="group">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700 flex items-center gap-2">
                      <span className="w-5 text-slate-400 text-xs">{i + 1}.</span>
                      {p.name}
                    </span>
                    <div className="text-right flex items-center gap-4 text-xs font-semibold">
                      <span className="text-blue-600">Nhập: {p.inQty.toLocaleString('vi-VN')}</span>
                      <span className="text-orange-600">Xuất: {p.outQty.toLocaleString('vi-VN')}</span>
                    </div>
                  </div>
                  <div className="ml-7 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${inPercent}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${outPercent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

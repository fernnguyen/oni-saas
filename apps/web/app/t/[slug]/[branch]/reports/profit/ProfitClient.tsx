'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/app/components/ui/PageHeader'

import { RefreshCw } from 'lucide-react'

interface Props { shopId: string }

interface KpiData {
  gross_revenue: number
  discounts: number
  returns: number
  net_revenue: number
  cogs: number
  gross_profit: number
  operating_expenses: number
  net_profit: number
  gross_margin_pct: number
  net_margin_pct: number
}

interface ProfitSeries {
  date: string
  gross_revenue: number
  discounts: number
  returns: number
  net_revenue: number
  cogs: number
  gross_profit: number
  expenses: number
  net_profit: number
}

interface ExpenseBreakdown {
  category: string
  amount: number
}

interface CogsBreakdown {
  id: string
  name: string
  cogs: number
  qty: number
}

interface ProfitData {
  kpi: KpiData
  series: ProfitSeries[]
  expenses_breakdown: ExpenseBreakdown[]
  cogs_breakdown: CogsBreakdown[]
}

const CATEGORY_MAP: Record<string, string> = {
  inventory: 'Nhập hàng',
  salary: 'Lương thưởng',
  utilities: 'Điện nước & Tiện ích',
  marketing: 'Quảng cáo & Marketing',
  rent: 'Mặt bằng',
  logistics: 'Vận chuyển',
  other: 'Khác'
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + 'đ' }
function fmtShort(v: number) {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B'
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'K'
  return String(v)
}

function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${highlight ? 'border-indigo-100 bg-indigo-50' : 'border-slate-100 bg-white'}`}>
      <p className={`text-sm ${highlight ? 'text-indigo-600 font-medium' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? 'text-indigo-900' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${highlight ? 'text-indigo-500' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  )
}

function MultiBarChart({ data }: { data: { label: string; tooltipLabel?: string; rev: number; exp: number; profit: number }[] }) {
  const max = Math.max(...data.map(d => Math.max(d.rev, d.exp, d.profit, 1)))
  return (
    <div className="flex h-48 items-end gap-1">
      {data.map((d, i) => (
        <div key={i} className="group relative flex flex-1 items-end gap-0.5 h-full">
          {/* Revenue */}
          <div className="w-1/3 rounded-t bg-blue-300 transition-colors group-hover:bg-blue-500" style={{ height: `${Math.max(2, (d.rev / max) * 100)}%` }} />
          {/* Expenses */}
          <div className="w-1/3 rounded-t bg-rose-300 transition-colors group-hover:bg-rose-500" style={{ height: `${Math.max(2, (d.exp / max) * 100)}%` }} />
          {/* Profit */}
          <div className="w-1/3 rounded-t bg-emerald-400 transition-colors group-hover:bg-emerald-600" style={{ height: `${Math.max(2, (d.profit / max) * 100)}%` }} />
          
          <div className="absolute bottom-full left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block z-10 shadow-lg">
            <p className="font-semibold mb-1 text-slate-200">{d.tooltipLabel || d.label}</p>
            <p>Doanh thu: {fmtVND(d.rev)}</p>
            <p>Chi phí: {fmtVND(d.exp)}</p>
            <p className="border-t border-slate-600 mt-1 pt-1 font-medium text-emerald-300">Lãi ròng: {fmtVND(d.profit)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

const PIE_COLORS = [
  '#f43f5e', // rose-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#64748b', // slate-500
]

function ExpensePieChart({ data, total }: { data: { category: string; amount: number }[], total: number }) {
  let acc = 0;
  const coloredData = data.map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] }))
  const gradient = coloredData.map(d => {
    const start = acc;
    const curr = total > 0 ? (d.amount / total) * 100 : 0;
    acc += curr;
    return `${d.color} ${start}% ${start + curr}%`;
  }).join(', ');

  return (
    <div className="flex flex-col items-center gap-8 mt-4 h-full w-full">
      <div
        className="w-56 h-56 md:w-64 md:h-64 rounded-full shrink-0 shadow-inner border border-slate-100"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <div className="w-full space-y-3 max-h-60 overflow-y-auto pr-2">
        {coloredData.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-slate-700 truncate capitalize font-medium">{CATEGORY_MAP[d.category.toLowerCase()] || d.category}</span>
            </div>
            <div className="text-right shrink-0 ml-4 flex items-center gap-4">
              <span className="font-semibold text-slate-800">{fmtShort(d.amount)}đ</span>
              <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded w-12 text-center">{total > 0 ? ((d.amount / total) * 100).toFixed(1) : 0}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProfitClient({ shopId }: Props) {
  const [period, setPeriod] = useState('7d')

  const { data, isLoading, refetch, isFetching } = useQuery<ProfitData>({
    queryKey: ['reports-profit', shopId, period],
    queryFn: async () => {
      let from = ''
      let to = ''
      const now = new Date()
      const tzOffset = 7 * 60 * 60 * 1000 // Vietnam time
      const localNow = new Date(now.getTime() + tzOffset)
      const todayString = localNow.toISOString().slice(0, 10)
      
      if (period === '7d') {
        const d = new Date(localNow.getTime() - 6 * 86_400_000)
        from = d.toISOString().slice(0, 10)
        to = todayString
      } else if (period === '30d') {
        const d = new Date(localNow.getTime() - 29 * 86_400_000)
        from = d.toISOString().slice(0, 10)
        to = todayString
      } else if (period === 'month') {
        const d = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1))
        from = d.toISOString().slice(0, 10)
        to = todayString
      }

      let url = `/api/shops/${shopId}/reports/profit`
      if (from && to) url += `?from=${from}&to=${to}`

      const res = await fetch(url)
      if (!res.ok) throw new Error('Không tải được báo cáo lợi nhuận')
      return res.json()
    },
    staleTime: 120_000,
  })

  const actions = (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="appearance-none h-10 w-[140px] rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-medium text-slate-700 outline-none transition-all hover:border-slate-300 hover:bg-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-xs"
        >
          <option value="7d">7 ngày qua</option>
          <option value="30d">30 ngày qua</option>
          <option value="month">Tháng này</option>
          <option value="all">Toàn thời gian</option>
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600 disabled:opacity-50"
        title="Làm mới dữ liệu"
      >
        <RefreshCw className={`h-5 w-5 ${isFetching ? 'animate-spin text-blue-500' : ''}`} />
      </button>
    </div>
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Báo cáo Lợi Nhuận" actions={actions} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { kpi, series, expenses_breakdown, cogs_breakdown } = data

  const chartData = series.map((d, i) => {
    const parts = d.date.split('-')
    const [y, m, day] = parts.length === 3 ? parts : [d.date, '', '']
    const formattedLabel = parts.length === 3 ? `${day}/${m}` : d.date
    const formattedTooltip = parts.length === 3 ? `${day}/${m}/${y}` : d.date

    return {
      label: i % Math.max(1, Math.floor(series.length / 7)) === 0 ? formattedLabel : '',
      tooltipLabel: formattedTooltip,
      rev: d.net_revenue,
      exp: d.cogs + d.expenses,
      profit: d.net_profit,
      fullDate: d.date,
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Báo cáo Lợi Nhuận" actions={actions} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Doanh thu thuần"
          value={fmtVND(kpi.net_revenue)}
          sub={`Gộp: ${fmtShort(kpi.gross_revenue)} - Giảm trừ: ${fmtShort(kpi.discounts + kpi.returns)}`}
        />
        <KpiCard
          label="Lợi nhuận gộp"
          value={fmtVND(kpi.gross_profit)}
          sub={`Biên lợi nhuận gộp: ${kpi.gross_margin_pct.toFixed(1)}% | Giá vốn: ${fmtShort(kpi.cogs)}`}
        />
        <KpiCard
          label="Chi phí vận hành"
          value={fmtVND(kpi.operating_expenses)}
          sub="Từ sổ quỹ (Phiếu chi)"
        />
        <KpiCard
          label="Lãi ròng"
          value={fmtVND(kpi.net_profit)}
          sub={`Biên lợi nhuận: ${kpi.net_margin_pct.toFixed(1)}%`}
          highlight
        />
      </div>

      {/* Revenue chart */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Hiệu quả kinh doanh</h2>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-400"></div><span className="text-slate-600">Doanh thu thuần</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-400"></div><span className="text-slate-600">Tổng chi phí (Giá vốn + Phí)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-400"></div><span className="text-slate-600">Lãi ròng</span></div>
          </div>
        </div>
        
        <MultiBarChart data={chartData} />
        <div className="mt-2 flex justify-between text-xs text-slate-400 px-2">
          {chartData.filter((d) => d.label).map((d) => (
            <span key={d.fullDate}>{d.label}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Left Column: Expenses Breakdown */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm h-full max-h-[500px] flex flex-col">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Cơ cấu chi phí vận hành</h2>
            {expenses_breakdown.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-400">Chưa có chi phí ghi nhận</p>
              </div>
            ) : (
              <ExpensePieChart data={expenses_breakdown} total={kpi.operating_expenses} />
            )}
          </div>
        </div>

        {/* Right column: COGS Breakdown */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm h-full max-h-[500px] flex flex-col">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Top sản phẩm chiếm giá vốn cao</h2>
            {cogs_breakdown.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-400">Chưa có dữ liệu giá vốn</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                {cogs_breakdown.map((item, i) => {
                  const max = cogs_breakdown[0].cogs
                  return (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="w-5 text-right text-xs text-slate-400 font-medium">{i + 1}</span>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-slate-700">{item.name}</p>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${(item.cogs / max) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="text-sm font-medium text-slate-700">{fmtShort(item.cogs)}đ</p>
                        <p className="text-xs text-slate-400">{Math.round(item.qty)} SP</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

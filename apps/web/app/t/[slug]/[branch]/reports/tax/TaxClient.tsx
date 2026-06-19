'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/app/components/ui/PageHeader'

interface Props { shopId: string; hasAccess: boolean }

interface Invoice {
  order_id: string; order_no: string; date: string; customer_name: string;
  subtotal: number; tax_rate: number; tax_amount: number; total: number;
}
interface TaxData {
  invoices:       Invoice[]
  totalSubtotal:  number
  totalTax:       number
  totalRevenue:   number
  byRate:         Record<string, { subtotal: number; tax: number }>
  period:         { from: string; to: string }
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + 'đ' }

function cleanOrderNo(orderNo: string | undefined, orderId: string): string {
  const code = orderNo || orderId;
  if (!code) return '';

  // 1. Khớp mẫu ORD-[tenantHash]-[orderId] hoặc RET-[tenantHash]-[orderId]
  // ví dụ: ORD-E007393D-XXXX -> ORD-XXXX (bỏ qua E007393D là tenant hash 8 ký tự hex/alphanumeric)
  const matchTenantPattern = code.match(/(ORD|RET)-([a-fA-F0-9]{8})-([a-zA-Z0-9-]+)/i);
  if (matchTenantPattern) {
    return `${matchTenantPattern[1].toUpperCase()}-${matchTenantPattern[3]}`;
  }

  // 2. Dự phòng: Trích xuất mã ORD-... hoặc RET-... từ chuỗi
  const match = code.match(/(ORD-[a-zA-Z0-9-]+|RET-[a-zA-Z0-9-]+)/i);
  if (match) {
    return match[1].toUpperCase();
  }

  // 3. Nếu là UUID dài, rút gọn còn 8 ký tự
  if (code.length > 20 && /^[a-fA-F0-9-]{36}$/.test(code)) {
    return code.slice(0, 8).toUpperCase();
  }

  // 4. Nếu chuỗi có chứa dấu gạch dưới, lấy phần sau cùng
  if (code.length > 15) {
    if (code.includes('_')) {
      const parts = code.split('_');
      const ordPart = parts.find(p => p.toUpperCase().startsWith('ORD-') || p.toUpperCase().startsWith('RET-'));
      if (ordPart) return cleanOrderNo(ordPart, '');
      return parts[parts.length - 1];
    }
    return code.slice(0, 10) + '...';
  }

  return code;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

// CSV export helper — runs entirely client-side, no server needed
function exportCSV(invoices: Invoice[], period: { from: string; to: string }) {
  const header = 'Mã đơn,Ngày,Khách hàng,Doanh thu chưa VAT,Thuế suất (%),Tiền thuế,Tổng cộng'
  const rows = invoices.map((i) =>
    [
      cleanOrderNo(i.order_no, i.order_id),
      formatDate(i.date),
      i.customer_name,
      i.subtotal.toFixed(0),
      i.tax_rate.toFixed(0),
      i.tax_amount.toFixed(0),
      i.total.toFixed(0),
    ].join(',')
  )
  const csv  = [header, ...rows].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `bao-cao-thue-${period.from}_${period.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// S1a-HKD simplified sales book export (Thông tư 152/2025/TT-BTC)
function exportS1aCSV(invoices: Invoice[], period: { from: string; to: string }) {
  const headerLines = [
    'SỔ DOANH THU BÁN HÀNG HÓA, DỊCH VỤ',
    'Mẫu số S1a-HKD (Ban hành kèm theo Thông tư số 152/2025/TT-BTC)',
    `Kỳ báo cáo: Từ ${formatDate(period.from)} đến ${formatDate(period.to)}`,
    '',
    'STT,Ngày ghi sổ,Số hiệu chứng từ,Diễn giải,Doanh thu (VND)'
  ]
  const rows = invoices.map((i, index) =>
    [
      index + 1,
      formatDate(i.date),
      cleanOrderNo(i.order_no, i.order_id),
      `Doanh thu bán lẻ theo đơn số ${cleanOrderNo(i.order_no, i.order_id)}${i.customer_name ? ` - Khách hàng: ${i.customer_name}` : ''}`,
      i.total.toFixed(0)
    ].join(',')
  )
  const total = invoices.reduce((s, i) => s + i.total, 0)
  const totalRow = [
    'Tổng cộng',
    '',
    '',
    '',
    total.toFixed(0)
  ].join(',')

  const csv = [...headerLines, ...rows, totalRow].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `so-doanh-thu-S1a-HKD-${period.from}_${period.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Upgrade gate component ───────────────────────────────────────────────────
function UpgradeGate() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 py-16 text-center">
      <div className="mb-4 rounded-full bg-blue-100 p-4">
        <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-slate-800">Báo cáo thuế</h2>
      <p className="mb-6 max-w-sm text-sm text-slate-500">
        Tính năng báo cáo thuế VAT, bảng kê hóa đơn đầu ra và xuất file CSV
        chỉ dành cho gói <strong>Pro</strong> trở lên.
      </p>
      <button
        onClick={() => window.dispatchEvent(new Event('open-plan-modal'))}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        Nâng cấp lên Pro
      </button>
    </div>
  )
}

export function TaxClient({ shopId, hasAccess }: Props) {
  const now  = new Date()
  const [from, setFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  )
  const [to, setTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  )
  const [activeTab, setActiveTab] = useState<'s1a' | 'deduction'>('s1a')
  const [searchQuery, setSearchQuery] = useState('')

  const { data, isLoading, isError } = useQuery<TaxData>({
    queryKey: ['reports-tax', shopId, from, to],
    queryFn: async () => {
      const sp  = new URLSearchParams({ from, to })
      const res = await fetch(`/api/shops/${shopId}/reports/tax?${sp}`)
      if (!res.ok) throw new Error((await res.json()).error ?? 'Lỗi tải báo cáo')
      return res.json()
    },
    enabled: hasAccess,
    staleTime: 300_000,
  })

  const totalRevenue = data?.totalRevenue ?? 0
  const THRESHOLD = 1_000_000_000 // 1 Billion VND
  const percent = Math.min((totalRevenue / THRESHOLD) * 100, 100)

  // Filter invoices client-side based on search query
  const filteredInvoices = data?.invoices.filter((inv) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const cleanNo = cleanOrderNo(inv.order_no, inv.order_id).toLowerCase()
    const rawNo = (inv.order_no || '').toLowerCase()
    const rawId = inv.order_id.toLowerCase()
    const custName = (inv.customer_name || '').toLowerCase()
    return cleanNo.includes(q) || rawNo.includes(q) || rawId.includes(q) || custName.includes(q)
  }) ?? []

  // Calculated totals of the filtered subset (for summary cards inside tab)
  const filteredSubtotal = filteredInvoices.reduce((s, i) => s + i.subtotal, 0)
  const filteredTax = filteredInvoices.reduce((s, i) => s + i.tax_amount, 0)
  const filteredTotal = filteredInvoices.reduce((s, i) => s + i.total, 0)

  // Recalculate breakdown of VAT by rate for filtered subset
  const filteredByRate: Record<string, { subtotal: number; tax: number }> = {}
  for (const inv of filteredInvoices) {
    const rate = String(Math.round(inv.tax_rate))
    if (!filteredByRate[rate]) filteredByRate[rate] = { subtotal: 0, tax: 0 }
    filteredByRate[rate].subtotal += inv.subtotal
    filteredByRate[rate].tax      += inv.tax_amount
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Báo cáo thuế" />

      {!hasAccess ? (
        <UpgradeGate />
      ) : (
        <>
          {/* Period picker & Export button */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">Từ ngày</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">Đến ngày</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            {data && (
              <button
                onClick={() => {
                  if (activeTab === 's1a') {
                    exportS1aCSV(filteredInvoices, data.period)
                  } else {
                    exportCSV(filteredInvoices, data.period)
                  }
                }}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Xuất {activeTab === 's1a' ? 'Sổ S1a-HKD' : 'Bảng kê CSV'}
              </button>
            )}
          </div>

          {isLoading && (
            <div className="py-12 text-center text-sm text-slate-400">Đang tải dữ liệu thuế...</div>
          )}

          {isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Không tải được báo cáo. Vui lòng thử lại.
            </div>
          )}

          {data && (
            <>
              {/* Revenue Threshold Tracker */}
              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      Theo dõi hạn mức doanh thu miễn thuế
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Theo Nghị định 141/2026/NĐ-CP (áp dụng từ 01/01/2026), hộ kinh doanh có doanh thu dưới 1 tỷ đồng/năm được miễn thuế GTGT & TNCN.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-slate-500">Doanh thu trong kỳ:</span>
                    <p className="text-lg font-bold text-indigo-600">{fmtVND(totalRevenue)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Tích lũy: {percent.toFixed(1)}%</span>
                    <span>Hạn mức: 1.000.000.000đ</span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        totalRevenue >= THRESHOLD ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                {totalRevenue < THRESHOLD ? (
                  <div className="flex gap-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3.5 text-xs">
                    <svg className="h-5 w-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-semibold mb-0.5">Trong diện miễn thuế</p>
                      <p className="text-emerald-700 leading-relaxed">
                        Doanh thu trong kỳ của bạn nằm dưới hạn mức 1 tỷ đồng/năm. Bạn được miễn thuế GTGT & TNCN, chỉ cần duy trì <strong>Sổ doanh thu bán hàng hóa, dịch vụ (Mẫu S1a-HKD)</strong> và nộp Tờ khai thông báo doanh thu năm.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3.5 text-xs">
                    <svg className="h-5 w-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="font-semibold mb-0.5">Vượt hạn mức miễn thuế</p>
                      <p className="text-amber-700 leading-relaxed">
                        Doanh thu đã đạt mức 1 tỷ đồng. Bạn cần chuyển sang phương pháp kê khai khấu trừ thuế thông thường (Mẫu 01/GTGT) và thực hiện đầy đủ nghĩa vụ thuế theo quy định.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="border-b border-slate-100">
                <nav className="flex space-x-6" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab('s1a')}
                    className={`border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                      activeTab === 's1a'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    Sổ doanh thu (Mẫu S1a-HKD)
                  </button>
                  <button
                    onClick={() => setActiveTab('deduction')}
                    className={`border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                      activeTab === 'deduction'
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    Kê khai khấu trừ (Mẫu 01/GTGT)
                  </button>
                </nav>
              </div>

              {activeTab === 's1a' ? (
                /* S1a-HKD Sổ Doanh Thu Table */
                <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">
                        Sổ doanh thu bán hàng hóa, dịch vụ ({filteredInvoices.length} nghiệp vụ)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Mẫu số S1a-HKD - Theo Thông tư số 152/2025/TT-BTC</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Tìm mã đơn, khách..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full sm:w-64 rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                        />
                        <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <div className="text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium shrink-0">
                        Dành cho hộ miễn thuế
                      </div>
                    </div>
                  </div>
                  {filteredInvoices.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">
                      Không có phát sinh doanh thu trong kỳ này
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-xs text-slate-500 bg-slate-50">
                            <th className="px-5 py-3 w-16 text-center">STT</th>
                            <th className="px-5 py-3 w-28">Ngày ghi sổ</th>
                            <th className="px-5 py-3 w-36">Số hiệu chứng từ</th>
                            <th className="px-5 py-3">Diễn giải</th>
                            <th className="px-5 py-3 text-right w-44">Doanh thu (VND)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInvoices.map((inv, idx) => (
                            <tr key={inv.order_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                              <td className="px-5 py-3 text-center text-slate-400 text-xs font-medium">{idx + 1}</td>
                              <td className="px-5 py-3 text-slate-600">{formatDate(inv.date)}</td>
                              <td className="px-5 py-3 font-mono text-xs text-slate-700 font-medium">
                                {cleanOrderNo(inv.order_no, inv.order_id)}
                              </td>
                              <td className="px-5 py-3 text-slate-600">
                                Doanh thu bán lẻ theo đơn số {cleanOrderNo(inv.order_no, inv.order_id)}
                                {inv.customer_name ? ` - Khách hàng: ${inv.customer_name}` : ''}
                              </td>
                              <td className="px-5 py-3 text-right font-medium text-slate-800">{fmtVND(inv.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50/70 font-semibold border-t border-slate-100 text-slate-700">
                            <td colSpan={4} className="px-5 py-3 text-right">Tổng cộng doanh thu ghi sổ</td>
                            <td className="px-5 py-3 text-right text-indigo-600 text-base">{fmtVND(filteredTotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                      <p className="text-sm text-slate-500">Doanh thu chưa VAT</p>
                      <p className="mt-1 text-xl font-bold text-slate-800">{fmtVND(filteredSubtotal)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                      <p className="text-sm text-slate-500">Tổng thuế VAT</p>
                      <p className="mt-1 text-xl font-bold text-blue-700">{fmtVND(filteredTax)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                      <p className="text-sm text-slate-500">Doanh thu gộp (có VAT)</p>
                      <p className="mt-1 text-xl font-bold text-slate-800">{fmtVND(filteredTotal)}</p>
                    </div>
                  </div>

                  {/* By rate summary */}
                  {Object.keys(filteredByRate).length > 0 && (
                    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                      <h3 className="mb-3 text-sm font-semibold text-slate-700">Phân loại theo thuế suất</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                            <th className="py-2">Thuế suất</th>
                            <th className="py-2 text-right">Doanh thu trước thuế</th>
                            <th className="py-2 text-right">Tiền thuế</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(filteredByRate).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, v]) => (
                            <tr key={rate} className="border-b border-slate-50">
                              <td className="py-2">{rate}%</td>
                              <td className="py-2 text-right">{fmtVND(v.subtotal)}</td>
                              <td className="py-2 text-right font-medium">{fmtVND(v.tax)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Invoice table */}
                  <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700">
                          Bảng kê hóa đơn ({filteredInvoices.length} hóa đơn)
                        </h3>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Tìm mã đơn, khách..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full sm:w-64 rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                        />
                        <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>
                    {filteredInvoices.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-400">
                        Không có hóa đơn trong kỳ này
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                              <th className="px-5 py-3">Mã đơn</th>
                              <th className="px-5 py-3">Ngày</th>
                              <th className="px-5 py-3">Khách hàng</th>
                              <th className="px-5 py-3 text-right">Trước thuế</th>
                              <th className="px-5 py-3 text-right">Thuế suất</th>
                              <th className="px-5 py-3 text-right">Tiền thuế</th>
                              <th className="px-5 py-3 text-right">Tổng</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredInvoices.map((inv) => (
                              <tr key={inv.order_id} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="px-5 py-3 font-mono text-xs">{cleanOrderNo(inv.order_no, inv.order_id)}</td>
                                <td className="px-5 py-3">{formatDate(inv.date)}</td>
                                <td className="max-w-[160px] truncate px-5 py-3">{inv.customer_name || '—'}</td>
                                <td className="px-5 py-3 text-right">{fmtVND(inv.subtotal)}</td>
                                <td className="px-5 py-3 text-right">{inv.tax_rate.toFixed(0)}%</td>
                                <td className="px-5 py-3 text-right text-blue-600">{fmtVND(inv.tax_amount)}</td>
                                <td className="px-5 py-3 text-right font-medium">{fmtVND(inv.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 font-semibold">
                              <td colSpan={3} className="px-5 py-3">Tổng cộng</td>
                              <td className="px-5 py-3 text-right">{fmtVND(filteredSubtotal)}</td>
                              <td className="px-5 py-3" />
                              <td className="px-5 py-3 text-right text-blue-600">{fmtVND(filteredTax)}</td>
                              <td className="px-5 py-3 text-right">{fmtVND(filteredTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

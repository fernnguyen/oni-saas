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

// CSV export helper — runs entirely client-side, no server needed
function exportCSV(invoices: Invoice[], period: { from: string; to: string }) {
  const header = 'Mã đơn,Ngày,Khách hàng,Doanh thu chưa VAT,Thuế suất (%),Tiền thuế,Tổng cộng'
  const rows = invoices.map((i) =>
    [
      i.order_no || i.order_id,
      i.date,
      i.customer_name,
      i.subtotal.toFixed(0),
      i.tax_rate.toFixed(0),
      i.tax_amount.toFixed(0),
      i.total.toFixed(0),
    ].join(',')
  )
  const csv  = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `bao-cao-thue-${period.from}_${period.to}.csv`
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

  return (
    <div className="space-y-6">
      <PageHeader title="Báo cáo thuế VAT" />

      {!hasAccess ? (
        <UpgradeGate />
      ) : (
        <>
          {/* Period picker */}
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
                onClick={() => exportCSV(data.invoices, data.period)}
                className="ml-auto rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Xuất CSV
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
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">Doanh thu chưa VAT</p>
                  <p className="mt-1 text-xl font-bold text-slate-800">{fmtVND(data.totalSubtotal)}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">Tổng thuế VAT</p>
                  <p className="mt-1 text-xl font-bold text-blue-700">{fmtVND(data.totalTax)}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">Doanh thu gộp (có VAT)</p>
                  <p className="mt-1 text-xl font-bold text-slate-800">{fmtVND(data.totalRevenue)}</p>
                </div>
              </div>

              {/* By rate summary */}
              {Object.keys(data.byRate).length > 0 && (
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
                      {Object.entries(data.byRate).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, v]) => (
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
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Bảng kê hóa đơn ({data.invoices.length} hóa đơn)
                  </h3>
                </div>
                {data.invoices.length === 0 ? (
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
                        {data.invoices.map((inv) => (
                          <tr key={inv.order_id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-5 py-3 font-mono text-xs">{inv.order_no || inv.order_id.slice(0, 8)}</td>
                            <td className="px-5 py-3">{inv.date}</td>
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
                          <td className="px-5 py-3 text-right">{fmtVND(data.totalSubtotal)}</td>
                          <td className="px-5 py-3" />
                          <td className="px-5 py-3 text-right text-blue-600">{fmtVND(data.totalTax)}</td>
                          <td className="px-5 py-3 text-right">{fmtVND(data.totalRevenue)}</td>
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
    </div>
  )
}

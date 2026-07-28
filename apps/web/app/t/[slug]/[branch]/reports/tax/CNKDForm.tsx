'use client'
import { TaxProfileForm } from './TaxProfileForm'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { saveAs } from 'file-saver'
import {
  asTaxPeriodType,
  buildCnkdTemplateData,
  getMissingTaxProfileFields,
  getTaxPeriodRange,
  type TaxProfile,
} from '@/lib/taxReporting'

interface Props {
  shopId: string
  data: {
    totalRevenue: number
    period: { from: string; to: string; type?: string }
  }
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + 'đ' }

export function CNKDForm({ shopId, data }: Props) {
  const annualPeriodIsUnsupported = data.period.type === 'annual'

  const handleExportDocx = async () => {
    try {
      if (annualPeriodIsUnsupported) {
        throw new Error('Mẫu 01/CNKD chỉ hỗ trợ kỳ khai theo tháng hoặc quý')
      }
      const response = await fetch('/api/templates/01_CNKD.docx')
      if (!response.ok) throw new Error('Không tìm thấy file template')
      const arrayBuffer = await response.arrayBuffer()
      
      const zip = new PizZip(arrayBuffer)
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
      })
      
      const settingsRes = await fetch(`/api/shops/${shopId}/settings`)
      if (!settingsRes.ok) throw new Error('Không tải được thông tin thuế')
      const settings = (await settingsRes.json()) as TaxProfile
      const missing = getMissingTaxProfileFields(settings, { requireAddress: true })
      if (missing.length) {
        throw new Error(`Vui lòng bổ sung: ${missing.join(', ')}`)
      }
      const period = getTaxPeriodRange(
        asTaxPeriodType(data.period.type || settings.tax_period_type),
        data.period.from
      )

      doc.render(buildCnkdTemplateData(settings, data.totalRevenue, period))

      const out = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      saveAs(out, `01-CNKD-${data.period.from}_${data.period.to}.docx`)
    } catch (e: any) {
      alert(e.message || 'Lỗi xuất file')
    }
  }

  return (
    <div className="space-y-6">
      <TaxProfileForm shopId={shopId} />

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-semibold text-slate-800">Tờ khai 01/CNKD</h3>
            <p className="text-xs text-slate-500 mt-1">Dành cho Hộ kinh doanh có doanh thu trên 1 tỷ đồng/năm</p>
          </div>
          <button
            onClick={handleExportDocx}
            disabled={annualPeriodIsUnsupported}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Tải Tờ khai DOCX
          </button>
        </div>

        <div className="text-sm text-slate-600 space-y-3">
          <p>
            Doanh thu trong kỳ ({data.period.from} đến {data.period.to}): <span className="font-bold text-slate-800">{fmtVND(data.totalRevenue)}</span>
          </p>
          {annualPeriodIsUnsupported && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Cấu hình hiện tại là khai theo năm. Mẫu 01/CNKD yêu cầu kỳ tháng
              hoặc quý; hãy cập nhật “Kỳ khai thuế” trước khi xuất.
            </p>
          )}
          <p className="text-slate-500 text-xs">Vui lòng tải biểu mẫu DOCX bên trên để có tờ khai chuẩn, sẵn sàng để ký nộp.</p>
        </div>
      </div>
    </div>
  )
}

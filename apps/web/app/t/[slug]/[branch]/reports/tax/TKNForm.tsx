'use client'
import { TaxProfileForm } from './TaxProfileForm'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { saveAs } from 'file-saver'
import {
  buildTknTemplateData,
  getMissingTaxProfileFields,
  type AnnualTaxData,
  type TaxProfile,
} from '@/lib/taxReporting'

interface Props {
  shopId: string
  annualData: AnnualTaxData
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + 'đ' }

export function TKNForm({ shopId, annualData }: Props) {
  const handleExportDocx = async () => {
    try {
      const response = await fetch('/api/templates/01_TKN_CNKD.docx')
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
      const missing = getMissingTaxProfileFields(settings)
      if (missing.length) {
        throw new Error(`Vui lòng bổ sung: ${missing.join(', ')}`)
      }

      doc.render(buildTknTemplateData(settings, annualData))

      const out = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      saveAs(out, `01-TKN-CNKD-${annualData.year}.docx`)
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
            <h3 className="font-semibold text-slate-800">Tờ khai 01/TKN-CNKD</h3>
            <p className="text-xs text-slate-500 mt-1">Dành cho Hộ kinh doanh có doanh thu dưới 1 tỷ đồng/năm</p>
          </div>
          <button
            onClick={handleExportDocx}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Tải Tờ khai DOCX
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">Phần I: Doanh thu kinh doanh</h4>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex justify-between p-2 bg-slate-50 rounded">
                <span>[13.1] Tổng doanh thu cả năm</span>
                <span className="font-semibold">{fmtVND(annualData.yearToDateRevenue)}</span>
              </div>
              <div className="rounded p-2 text-xs leading-relaxed text-slate-500">
                Các chỉ tiêu [13.2]–[13.15] và các phần thuế TTĐB, tài nguyên,
                bảo vệ môi trường được để trống vì báo cáo này chỉ thông báo
                doanh thu thuộc diện miễn thuế GTGT và TNCN.
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">Doanh thu chi tiết theo tháng</h4>
            <div className="max-h-[200px] overflow-y-auto pr-2 text-sm">
              <table className="w-full text-left">
                <tbody>
                  {Object.entries(annualData.monthlyRevenue).map(([month, val]) => (
                    <tr key={month} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-500">Tháng {month}</td>
                      <td className="py-1.5 text-right font-medium text-slate-700">{fmtVND(val as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

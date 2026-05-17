'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { VERTICAL_REGISTRY, type IndustryType, INDUSTRY_TYPES } from '@oni/core'

interface Props {
  tenantId: string
  currentIndustry: string
}

export function IndustrySwitcher({ tenantId, currentIndustry }: Props) {
  const confirm = useConfirm()
  const [selected, setSelected] = useState<string>(currentIndustry || 'retail')
  const [saving, setSaving] = useState(false)

  const hasChanged = selected !== currentIndustry
  const currentConfig = VERTICAL_REGISTRY[currentIndustry as IndustryType] ?? VERTICAL_REGISTRY.retail

  async function handleSave() {
    if (!hasChanged) return

    const targetConfig = VERTICAL_REGISTRY[selected as IndustryType]
    const ok = await confirm({
      title: '⚠️ Thay đổi ngành nghề',
      description: `Chuyển từ "${currentConfig.label}" sang "${targetConfig?.label}".\n\n• Menu điều hướng và POS layout sẽ thay đổi hoàn toàn.\n• Dữ liệu sản phẩm, đơn hàng, tồn kho hiện tại có thể KHÔNG PHÙ HỢP với ngành mới.\n• Khuyến nghị: Chỉ thay đổi ngành nghề khi mới bắt đầu hoặc chấp nhận bắt đầu lại từ đầu.\n\nThao tác này không thể hoàn tác tự động.`,
      confirmLabel: 'Tôi hiểu, thay đổi ngành nghề',
      variant: 'danger',
    })
    if (!ok) return

    setSaving(true)
    try {
      const res = await fetch(`/api/tenants/${tenantId}/industry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry_type: selected }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Lỗi')
      }
      toast.success('Đã chuyển đổi ngành nghề. Đang tải lại...')
      setTimeout(() => window.location.reload(), 500)
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi cập nhật')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">{currentConfig.icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Ngành nghề kinh doanh</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Hiện tại: <strong>{currentConfig.label}</strong> — {currentConfig.description}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {INDUSTRY_TYPES.map(type => {
            const config = VERTICAL_REGISTRY[type]
            const isActive = selected === type
            const isCurrent = currentIndustry === type
            return (
              <button
                key={type}
                onClick={() => setSelected(type)}
                className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                  isActive
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {isCurrent && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    Hiện tại
                  </span>
                )}
                <span className="text-xl">{config.icon}</span>
                <p className="mt-1.5 text-xs font-bold text-slate-800">{config.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400 line-clamp-2 leading-tight">{config.description}</p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {config.features.location_resource && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-blue-50 text-blue-600">
                      📍 Bàn/Sân
                    </span>
                  )}
                  {config.features.hourly_billing && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-amber-50 text-amber-600">
                      ⏱ Theo giờ
                    </span>
                  )}
                  {config.features.barcode_scan && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-green-50 text-green-600">
                      📷 Barcode
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {hasChanged && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {saving ? 'Đang lưu...' : `Chuyển sang ${VERTICAL_REGISTRY[selected as IndustryType]?.label}`}
            </button>
            <button
              onClick={() => setSelected(currentIndustry)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

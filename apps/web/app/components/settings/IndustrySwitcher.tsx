'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { VERTICAL_REGISTRY, type IndustryType, INDUSTRY_TYPES } from '@oni/core'
import { IndustryIcon } from '../layout/IndustryIcon'
import { MapPin, Clock, Barcode, ChefHat, Calendar, Palette } from 'lucide-react'

interface Props {
  tenantId: string
  currentIndustry: string
}

const INDUSTRY_VISUALS: Record<IndustryType, {
  gradient: string
  bgActive: string
  bgSphere: string
  textColor: string
  borderColor: string
  shadowColor: string
}> = {
  retail: {
    gradient: 'from-blue-500 to-indigo-600',
    bgActive: 'bg-blue-50/30 border-blue-200 ring-blue-500/20',
    bgSphere: 'from-blue-500/10 to-indigo-500/10 text-indigo-600 border-indigo-200/50',
    textColor: 'text-indigo-700',
    borderColor: 'border-indigo-500',
    shadowColor: 'shadow-blue-100',
  },
  fnb: {
    gradient: 'from-orange-500 to-rose-500',
    bgActive: 'bg-orange-50/30 border-orange-200 ring-orange-500/20',
    bgSphere: 'from-orange-500/10 to-rose-500/10 text-orange-600 border-orange-200/50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-500',
    shadowColor: 'shadow-orange-100',
  },
  billiards: {
    gradient: 'from-emerald-500 to-teal-600',
    bgActive: 'bg-emerald-50/30 border-emerald-200 ring-emerald-500/20',
    bgSphere: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 border-emerald-200/50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-500',
    shadowColor: 'shadow-emerald-100',
  },
  sports_court: {
    gradient: 'from-violet-500 to-fuchsia-600',
    bgActive: 'bg-violet-50/30 border-violet-200 ring-violet-500/20',
    bgSphere: 'from-violet-500/10 to-fuchsia-500/10 text-violet-600 border-violet-200/50',
    textColor: 'text-violet-700',
    borderColor: 'border-violet-500',
    shadowColor: 'shadow-violet-100',
  },
  lodging: {
    gradient: 'from-cyan-500 to-blue-600',
    bgActive: 'bg-cyan-50/30 border-cyan-200 ring-cyan-500/20',
    bgSphere: 'from-cyan-500/10 to-blue-500/10 text-blue-600 border-blue-200/50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-500',
    shadowColor: 'shadow-cyan-100',
  },
  fashion: {
    gradient: 'from-pink-500 to-rose-500',
    bgActive: 'bg-pink-50/30 border-pink-200 ring-pink-500/20',
    bgSphere: 'from-pink-500/10 to-rose-500/10 text-pink-600 border-pink-200/50',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-500',
    shadowColor: 'shadow-pink-100',
  },
  service_hourly: {
    gradient: 'from-amber-500 to-orange-600',
    bgActive: 'bg-amber-50/30 border-amber-200 ring-amber-500/20',
    bgSphere: 'from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-200/50',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-500',
    shadowColor: 'shadow-amber-100',
  },
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
      title: '⚠️ Xác nhận chuyển đổi ngành nghề kinh doanh',
      description: `Hệ thống sẽ chuyển từ "${currentConfig.label}" sang "${targetConfig?.label}".\n\n• Toàn bộ menu điều hướng, bố cục màn hình bán hàng (POS) sẽ được cấu hình lại theo đặc trưng của ngành mới.\n• Các dữ liệu sản phẩm, hóa đơn và tồn kho hiện có của quý khách có thể không tương thích tốt nhất với cấu trúc mới.\n• Khuyến nghị: Thực hiện thay đổi khi mới bắt đầu hoặc chấp nhận thiết lập lại dữ liệu để đạt hiệu quả cao nhất.`,
      confirmLabel: 'Tôi đồng ý, chuyển ngành nghề',
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
      toast.success('Đã cập nhật ngành kinh doanh thành công. Đang thiết lập lại không gian làm việc...')
      setTimeout(() => window.location.reload(), 800)
    } catch (e: any) {
      toast.error(e.message || 'Có lỗi xảy ra khi cập nhật ngành kinh doanh')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm shrink-0">
            <IndustryIcon type={currentIndustry as IndustryType} className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Ngành nghề kinh doanh chính</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Quý khách vui lòng chọn ngành kinh doanh chính của doanh nghiệp. Giao diện bán hàng (POS), menu điều hướng và báo cáo phân tích sẽ tự động tối ưu hóa theo đặc thù riêng biệt của từng ngành nghề. Hiện tại hệ thống đang được tối ưu hóa cho ngành: <strong className="text-primary font-bold">{currentConfig.label}</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {INDUSTRY_TYPES.map(type => {
            const config = VERTICAL_REGISTRY[type]
            const isActive = selected === type
            const isCurrent = currentIndustry === type
            const visuals = INDUSTRY_VISUALS[type] ?? INDUSTRY_VISUALS.retail

            return (
              <button
                key={type}
                onClick={() => setSelected(type)}
                className={`group relative rounded-2xl border-2 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-between ${isActive
                    ? `${visuals.bgActive} ${visuals.borderColor} ring-2 ring-slate-100 shadow-md ${visuals.shadowColor}`
                    : 'border-slate-100 bg-white hover:border-slate-300 hover:shadow-md hover:shadow-slate-100/50'
                  }`}
              >
                <div>
                  <div className="flex items-center gap-3 mb-3 shrink-0">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${visuals.bgSphere} shadow-inner border border-slate-100/50 transition-transform duration-300 group-hover:scale-110 shrink-0`}>
                      <IndustryIcon type={type} className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col justify-center">
                        <p className="text-sm font-bold text-slate-800 transition-colors group-hover:text-slate-900 leading-snug line-clamp-2">
                          {config.label}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {isCurrent && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20 shrink-0">
                              Đang dùng
                            </span>
                          )}
                          {isActive && !isCurrent && (
                            <span className={`text-[8px] font-bold uppercase tracking-wider text-white bg-gradient-to-r ${visuals.gradient} px-1.5 py-0.5 rounded-full shadow-sm shrink-0`}>
                              Lựa chọn
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-1.5 text-[11px] text-slate-500 leading-normal line-clamp-3">
                    {config.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-50 flex flex-wrap gap-1.5 shrink-0">
                  {config.features.location_resource && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wide rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                      <MapPin className="h-2.5 w-2.5 shrink-0" />
                      {type === 'sports_court' ? 'Sân thể thao' : type === 'lodging' ? 'Quản lý Phòng' : 'Quản lý Bàn'}
                    </span>
                  )}
                  {config.features.hourly_billing && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wide rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                      <Clock className="h-2.5 w-2.5 shrink-0" />
                      Theo giờ
                    </span>
                  )}
                  {config.features.barcode_scan && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wide rounded-full bg-green-50 text-green-600 border border-green-100">
                      <Barcode className="h-2.5 w-2.5 shrink-0" />
                      Barcode
                    </span>
                  )}
                  {config.features.kitchen_display && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wide rounded-full bg-rose-50 text-rose-600 border border-rose-100">
                      <ChefHat className="h-2.5 w-2.5 shrink-0" />
                      Màn KDS
                    </span>
                  )}
                  {config.features.reservation && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wide rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                      <Calendar className="h-2.5 w-2.5 shrink-0" />
                      Đặt chỗ trước
                    </span>
                  )}
                  {config.features.product_variants && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wide rounded-full bg-pink-50 text-pink-600 border border-pink-100">
                      <Palette className="h-2.5 w-2.5 shrink-0" />
                      Size/Màu sắc
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {hasChanged && (
          <div className="mt-6 flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 animate-fade-in">
            <button
              onClick={handleSave}
              disabled={saving}
              className="cursor-pointer rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Đang lưu cấu hình...' : `Chuyển sang ngành ${VERTICAL_REGISTRY[selected as IndustryType]?.label}`}
            </button>
            <button
              onClick={() => setSelected(currentIndustry)}
              className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 transition-colors"
            >
              Quay lại
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

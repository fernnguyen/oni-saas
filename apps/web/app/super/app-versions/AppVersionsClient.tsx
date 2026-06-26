'use client'

import React, { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Apple, Smartphone, Save } from 'lucide-react'
import { updateMobileVersionSettings } from './actions'

export function AppVersionsClient({ initialData }: { initialData: any }) {
  const [formData, setFormData] = useState({
    ios: {
      min_version: initialData?.ios?.min_version || '1.0.0',
      latest_version: initialData?.ios?.latest_version || '1.0.0',
      store_url: initialData?.ios?.store_url || ''
    },
    android: {
      min_version: initialData?.android?.min_version || '1.0.0',
      latest_version: initialData?.android?.latest_version || '1.0.0',
      store_url: initialData?.android?.store_url || ''
    },
    ota_enabled: initialData?.ota_enabled ?? true,
    ota_silent: initialData?.ota_silent ?? false
  })

  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updateMobileVersionSettings(formData)
        toast.success('Lưu cấu hình phiên bản thành công!')
      } catch (err: any) {
        toast.error(err.message || 'Lỗi khi lưu cấu hình')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Cấu hình tự động cập nhật</h3>
            <p className="text-sm text-slate-500 mt-1">Kiểm soát các phiên bản được phép truy cập và tính năng cập nhật ngầm.</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">OTA Update:</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={formData.ota_enabled}
                  onChange={(e) => setFormData(p => ({...p, ota_enabled: e.target.checked}))}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">Cập nhật ngầm:</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={formData.ota_silent}
                  onChange={(e) => setFormData(p => ({...p, ota_silent: e.target.checked}))}
                  disabled={!formData.ota_enabled}
                />
                <div className={`w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${formData.ota_enabled ? 'peer-checked:bg-blue-500' : 'opacity-50'}`}></div>
              </label>
            </div>
          </div>
        </div>
        
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* iOS Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Apple className="w-5 h-5 text-slate-700" />
              <h4 className="font-medium text-slate-900">Apple iOS</h4>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phiên bản tối thiểu (Min Version)</label>
              <input 
                type="text" 
                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.ios.min_version}
                onChange={e => setFormData(p => ({...p, ios: {...p.ios, min_version: e.target.value}}))}
                placeholder="Ví dụ: 1.0.0"
              />
              <p className="text-xs text-slate-500 mt-1">Người dùng có phiên bản nhỏ hơn số này sẽ bị ép buộc cập nhật từ App Store.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phiên bản mới nhất (Latest Version)</label>
              <input 
                type="text" 
                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.ios.latest_version}
                onChange={e => setFormData(p => ({...p, ios: {...p.ios, latest_version: e.target.value}}))}
                placeholder="Ví dụ: 1.0.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">App Store URL</label>
              <input 
                type="text" 
                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.ios.store_url}
                onChange={e => setFormData(p => ({...p, ios: {...p.ios, store_url: e.target.value}}))}
                placeholder="https://apps.apple.com/..."
              />
            </div>
          </div>

          {/* Android Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Smartphone className="w-5 h-5 text-slate-700" />
              <h4 className="font-medium text-slate-900">Google Android</h4>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phiên bản tối thiểu (Min Version)</label>
              <input 
                type="text" 
                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.android.min_version}
                onChange={e => setFormData(p => ({...p, android: {...p.android, min_version: e.target.value}}))}
                placeholder="Ví dụ: 1.0.0"
              />
              <p className="text-xs text-slate-500 mt-1">Người dùng có phiên bản nhỏ hơn số này sẽ bị ép buộc cập nhật từ Play Store.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phiên bản mới nhất (Latest Version)</label>
              <input 
                type="text" 
                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.android.latest_version}
                onChange={e => setFormData(p => ({...p, android: {...p.android, latest_version: e.target.value}}))}
                placeholder="Ví dụ: 1.0.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Google Play URL</label>
              <input 
                type="text" 
                className="w-full h-10 px-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                value={formData.android.store_url}
                onChange={e => setFormData(p => ({...p, android: {...p.android, store_url: e.target.value}}))}
                placeholder="https://play.google.com/store/apps/details?id=..."
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  )
}

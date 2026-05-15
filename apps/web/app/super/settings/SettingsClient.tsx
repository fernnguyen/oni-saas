'use client'

import React, { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateSystemSettings } from './actions'

export function SettingsClient({ initialConfig }: { initialConfig: any }) {
  const [config, setConfig] = useState(initialConfig)
  const [isPending, startTransition] = useTransition()

  const handleToggle = (checked: boolean) => {
    const newConfig = { ...config, enable_sentry_debug: checked }
    setConfig(newConfig)
    startTransition(async () => {
      try {
        await updateSystemSettings(newConfig)
        toast.success('Đã lưu cấu hình')
      } catch (err) {
        toast.error('Lỗi khi lưu cấu hình')
        setConfig(config) // revert
      }
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Tính năng thử nghiệm & Gỡ lỗi</h2>
        <p className="text-xs text-slate-400 mt-0.5">Thiết lập các tính năng theo dõi và thu thập lỗi tập trung cho toàn bộ hệ thống.</p>
      </div>
      <div className="px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-slate-800">Gửi log lỗi lên Sentry</h4>
            <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">
              Tự động thu thập các ngoại lệ (exception) server (mã 500) và đẩy lên Sentry thay vì chỉ báo lỗi ra Console. Nếu tắt, lỗi sẽ chỉ hiển thị ở log của server.
            </p>
          </div>
          <div className="flex-shrink-0 ml-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={!!config.enable_sentry_debug}
                onChange={(e) => handleToggle(e.target.checked)}
                disabled={isPending}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

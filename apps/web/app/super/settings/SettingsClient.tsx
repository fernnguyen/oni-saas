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
        toast.success('Đã lưu cấu hình Sentry')
      } catch (err) {
        toast.error('Lỗi khi lưu cấu hình Sentry')
        setConfig(config) // revert
      }
    })
  }

  const handleRegistrationModeChange = (mode: string) => {
    const newConfig = { ...config, registration_mode: mode }
    setConfig(newConfig)
    startTransition(async () => {
      try {
        await updateSystemSettings(newConfig)
        toast.success('Đã cập nhật chế độ đăng ký')
      } catch (err) {
        toast.error('Lỗi khi cập nhật chế độ đăng ký')
        setConfig(config) // revert
      }
    })
  }

  const handleEmailVerificationToggle = (checked: boolean) => {
    const newConfig = { ...config, require_email_verification: checked }
    setConfig(newConfig)
    startTransition(async () => {
      try {
        await updateSystemSettings(newConfig)
        toast.success('Đã cập nhật yêu cầu xác thực email')
      } catch (err) {
        toast.error('Lỗi khi cập nhật yêu cầu xác thực email')
        setConfig(config) // revert
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Registration Settings Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900">Quản lý Đăng ký & Kích hoạt Thành viên</h2>
          <p className="text-xs text-slate-400 mt-0.5">Cấu hình chế độ tham gia hệ thống và yêu cầu bảo mật kích hoạt tài khoản.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {/* Registration Mode */}
          <div className="px-6 py-5 space-y-3">
            <div>
              <h4 className="text-sm font-medium text-slate-800">Chế độ đăng ký thành viên</h4>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Thiết lập quyền hạn tạo tài khoản mới từ trang chủ công cộng của ONI.vn.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {[
                { value: 'free', label: '🔓 Đăng ký tự do', desc: 'Cho phép bất kỳ ai cũng có thể tự tạo tài khoản mới.' },
                { value: 'code', label: '🔑 Cần mã mời / Code', desc: 'Chỉ người dùng nhập mã mời hợp lệ mới được đăng ký.' },
                { value: 'disabled', label: '🔒 Khóa đăng ký', desc: 'Tắt hoàn toàn đăng ký. Chỉ Superadmin mới có thể tạo.' }
              ].map((opt) => {
                const active = (config.registration_mode || 'free') === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleRegistrationModeChange(opt.value)}
                    className={`text-left p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                      active 
                        ? 'border-primary bg-blue-50/20 ring-2 ring-primary/10 font-medium' 
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                    <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Email Verification */}
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-slate-800">Yêu cầu xác minh Email trước khi kích hoạt</h4>
              <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                Tự động gửi link kích hoạt đến email thật của người dùng. Họ bắt buộc phải nhấp vào link trong email để mở khóa và đăng nhập vào workspace lần đầu.
              </p>
              <div className="mt-2 text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-100 rounded px-2 py-0.5 inline-flex items-center gap-1">
                ⚠️ Chỉ áp dụng cho đăng ký mới (không ảnh hưởng tài khoản nhân viên).
              </div>
            </div>
            <div className="flex-shrink-0 ml-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!config.require_email_verification}
                  onChange={(e) => handleEmailVerificationToggle(e.target.checked)}
                  disabled={isPending}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Sentry Settings Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900">Tính năng thử nghiệm & Gỡ lỗi</h2>
          <p className="text-xs text-slate-400 mt-0.5">Thiết lập các tính năng theo dõi và thu thập lỗi tập trung cho toàn bộ hệ thống.</p>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-slate-800">Gửi log lỗi lên Sentry</h4>
              <p className="text-sm text-slate-500 mt-0.5 max-w-2xl leading-normal">
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
    </div>
  )
}

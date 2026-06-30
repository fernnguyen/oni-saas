'use client'

import React, { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateSystemSettings, upsertTaxGroupAction, deleteTaxGroupAction } from './actions'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'

export function SettingsClient({ 
  initialConfig, 
  initialTaxGroups = [] 
}: { 
  initialConfig: any
  initialTaxGroups?: any[]
}) {
  const [config, setConfig] = useState(initialConfig)
  const [isPending, startTransition] = useTransition()
  const [starterTrialDays, setStarterTrialDays] = useState<number>(initialConfig.starter_trial_days ?? 90)

  // System tax groups states
  const [taxGroups, setTaxGroups] = useState<any[]>(initialTaxGroups)
  const [isAddingGroup, setIsAddingGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState<any | null>(null)
  const [groupForm, setGroupForm] = useState({
    code: '',
    name: '',
    vat_rate: '0',
    pit_rate: '0',
    active: true
  })

  const confirm = useConfirm()

  const handleOpenAdd = () => {
    setEditingGroup(null)
    setGroupForm({
      code: '',
      name: '',
      vat_rate: '0',
      pit_rate: '0',
      active: true
    })
    setIsAddingGroup(true)
  }

  const handleOpenEdit = (group: any) => {
    setEditingGroup(group)
    setGroupForm({
      code: group.code,
      name: group.name,
      vat_rate: String(group.vat_rate),
      pit_rate: String(group.pit_rate),
      active: group.active
    })
    setIsAddingGroup(true)
  }

  const handleSaveGroup = () => {
    if (!groupForm.code.trim() || !groupForm.name.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin!')
      return
    }

    startTransition(async () => {
      try {
        const payload = {
          id: editingGroup?.id,
          code: groupForm.code.trim(),
          name: groupForm.name.trim(),
          vat_rate: parseFloat(groupForm.vat_rate) || 0,
          pit_rate: parseFloat(groupForm.pit_rate) || 0,
          active: groupForm.active
        }
        await upsertTaxGroupAction(payload)
        toast.success(editingGroup ? 'Cập nhật nhóm thuế thành công' : 'Thêm nhóm thuế mới thành công')
        setIsAddingGroup(false)
        setEditingGroup(null)
        window.location.reload()
      } catch (err: any) {
        toast.error(err.message || 'Lỗi khi lưu nhóm thuế')
      }
    })
  }

  const handleDeleteGroup = (id: string, name: string) => {
    confirm({
      title: 'Xác nhận xóa',
      description: `Bạn có chắc chắn muốn xóa nhóm thuế "${name}" không? Hành động này không thể hoàn tác.`,
      confirmLabel: 'Xóa bỏ',
      cancelLabel: 'Hủy',
      onConfirm: async () => {
        startTransition(async () => {
          try {
            await deleteTaxGroupAction(id)
            toast.success('Đã xóa nhóm thuế thành công')
            setTaxGroups(prev => prev.filter(g => g.id !== id))
          } catch (err: any) {
            toast.error(err.message || 'Lỗi khi xóa nhóm thuế')
          }
        })
      }
    })
  }

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

  const handleStarterTrialDaysSave = (daysVal: number) => {
    const finalDays = Math.max(1, daysVal)
    setStarterTrialDays(finalDays)
    const newConfig = { ...config, starter_trial_days: finalDays }
    setConfig(newConfig)
    startTransition(async () => {
      try {
        await updateSystemSettings(newConfig)
        toast.success('Đã cập nhật số ngày dùng thử mặc định')
      } catch (err) {
        toast.error('Lỗi khi cập nhật số ngày dùng thử mặc định')
        setConfig(config) // revert
        setStarterTrialDays(config.starter_trial_days ?? 90)
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

          {/* Starter Plan Default Trial Days */}
          <div className="px-6 py-5 space-y-3">
            <div>
              <h4 className="text-sm font-medium text-slate-800">Thời gian dùng thử mặc định (Gói Starter)</h4>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Số ngày dùng thử miễn phí mặc định khi người dùng mới đăng ký gói Starter mà không sử dụng mã giới thiệu.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="number"
                min="1"
                value={starterTrialDays}
                onChange={(e) => setStarterTrialDays(parseInt(e.target.value) || 0)}
                onBlur={(e) => handleStarterTrialDaysSave(parseInt(e.target.value) || 90)}
                disabled={isPending}
                className="w-32 rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
              />
              <span className="text-sm text-slate-500 font-medium">ngày</span>
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
      </div>

      {/* Subscription Settings Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900">Quản lý Cảnh báo Hết hạn Dịch vụ</h2>
          <p className="text-xs text-slate-400 mt-0.5">Cấu hình thời gian gửi email, hiển thị banner và thời gian ân hạn sau khi hết hạn.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {/* Expiration Settings */}
          <div className="px-6 py-5 space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-800">Cảnh báo sắp hết hạn (Gửi email / thông báo)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={config.plan_expiration_notice_days ?? 30}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0
                    setConfig({ ...config, plan_expiration_notice_days: val })
                  }}
                  onBlur={(e) => {
                    const newConfig = { ...config, plan_expiration_notice_days: parseInt(e.target.value) || 0 }
                    startTransition(async () => {
                      try { await updateSystemSettings(newConfig); toast.success('Đã lưu cài đặt') } 
                      catch { toast.error('Lỗi khi lưu'); setConfig(config) }
                    })
                  }}
                  disabled={isPending}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-slate-500">ngày trước khi hết hạn (Mặc định: 30 ngày)</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-800">Hiển thị banner cảnh báo trên giao diện</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={config.plan_expiration_banner_days ?? 7}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0
                    setConfig({ ...config, plan_expiration_banner_days: val })
                  }}
                  onBlur={(e) => {
                    const newConfig = { ...config, plan_expiration_banner_days: parseInt(e.target.value) || 0 }
                    startTransition(async () => {
                      try { await updateSystemSettings(newConfig); toast.success('Đã lưu cài đặt') } 
                      catch { toast.error('Lỗi khi lưu'); setConfig(config) }
                    })
                  }}
                  disabled={isPending}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-slate-500">ngày trước khi hết hạn (Mặc định: 7 ngày)</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-800">Thời gian ân hạn (Lock account / Downgrade)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={config.plan_lock_grace_days ?? 3}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0
                    setConfig({ ...config, plan_lock_grace_days: val })
                  }}
                  onBlur={(e) => {
                    const newConfig = { ...config, plan_lock_grace_days: parseInt(e.target.value) || 0 }
                    startTransition(async () => {
                      try { await updateSystemSettings(newConfig); toast.success('Đã lưu cài đặt') } 
                      catch { toast.error('Lỗi khi lưu'); setConfig(config) }
                    })
                  }}
                  disabled={isPending}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-slate-500">ngày sau khi hết hạn mới bị khóa/hạ cấp (Mặc định: 3 ngày)</span>
              </div>
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

      {/* POS Realtime Sync Settings Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-900">Đồng bộ POS Thời gian thực (Realtime)</h2>
          <p className="text-xs text-slate-400 mt-0.5">Cấu hình kết nối Supabase Broadcast để đồng bộ Web và Mobile POS tức thì.</p>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-slate-800">Bật tính năng Realtime Sync</h4>
              <p className="text-sm text-slate-500 mt-0.5 max-w-2xl leading-normal">
                Thay thế cơ chế Polling (tải lại mỗi 15s) bằng kết nối Socket (Supabase Broadcast). Giúp thao tác giữa các thiết bị được cập nhật tức thì (Đề xuất bật). Nếu tắt, hệ thống sẽ tự fallback về cơ chế tải lại thủ công.
              </p>
            </div>
            <div className="flex-shrink-0 ml-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={!!config.enable_realtime_sync}
                  onChange={(e) => {
                    const newConfig = { ...config, enable_realtime_sync: e.target.checked }
                    setConfig(newConfig)
                    startTransition(async () => {
                      try {
                        await updateSystemSettings(newConfig)
                        toast.success('Đã lưu cấu hình Realtime Sync')
                      } catch (err) {
                        toast.error('Lỗi khi lưu cấu hình Realtime')
                        setConfig(config) // revert
                      }
                    })
                  }}
                  disabled={isPending}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Tax Groups Settings Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex flex-row justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Biểu thuế khoán Hộ kinh doanh (Circular 40/2021)</h2>
            <p className="text-xs text-slate-400 mt-0.5">Quản lý biểu thuế suất khoán nộp thay mặt cửa hàng/hộ kinh doanh toàn hệ thống.</p>
          </div>
          {!isAddingGroup && (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm nhóm mới
            </button>
          )}
        </div>

        <div className="p-6">
          {isAddingGroup ? (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-4 max-w-xl">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {editingGroup ? 'Chỉnh sửa nhóm thuế' : 'Thêm nhóm thuế mới'}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Mã code (không dấu, unique)</label>
                  <input
                    type="text"
                    disabled={!!editingGroup || isPending}
                    value={groupForm.code}
                    onChange={(e) => setGroupForm(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="e.g. phan_phoi"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Tên nhóm ngành thuế</label>
                  <input
                    type="text"
                    disabled={isPending}
                    value={groupForm.name}
                    onChange={(e) => setGroupForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Phân phối, cung cấp hàng hóa"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Thuế suất VAT khoán (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    disabled={isPending}
                    value={groupForm.vat_rate}
                    onChange={(e) => setGroupForm(prev => ({ ...prev, vat_rate: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Thuế suất TNCN khoán (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    disabled={isPending}
                    value={groupForm.pit_rate}
                    onChange={(e) => setGroupForm(prev => ({ ...prev, pit_rate: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="groupActive"
                    disabled={isPending}
                    checked={groupForm.active}
                    onChange={(e) => setGroupForm(prev => ({ ...prev, active: e.target.checked }))}
                    className="rounded border-slate-350 text-primary focus:ring-primary"
                  />
                  <label htmlFor="groupActive" className="text-xs font-medium text-slate-700">Kích hoạt hoạt động</label>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
                <button
                  onClick={() => setIsAddingGroup(false)}
                  disabled={isPending}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveGroup}
                  disabled={isPending}
                  className="px-3.5 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/95 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  {editingGroup ? 'Cập nhật' : 'Thêm mới'}
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-4 py-3 text-left text-xxs font-bold text-slate-400 uppercase tracking-wider">Mã code</th>
                    <th className="px-4 py-3 text-left text-xxs font-bold text-slate-400 uppercase tracking-wider">Tên nhóm</th>
                    <th className="px-4 py-3 text-right text-xxs font-bold text-slate-400 uppercase tracking-wider">VAT khoán</th>
                    <th className="px-4 py-3 text-right text-xxs font-bold text-slate-400 uppercase tracking-wider">TNCN khoán</th>
                    <th className="px-4 py-3 text-center text-xxs font-bold text-slate-400 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-4 py-3 text-center text-xxs font-bold text-slate-400 uppercase tracking-wider w-[100px]">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {taxGroups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400 font-medium italic">
                        Chưa có nhóm thuế nào được cấu hình.
                      </td>
                    </tr>
                  ) : (
                    taxGroups.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/20">
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500 font-mono">{g.code}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800">{g.name}</td>
                        <td className="px-4 py-3 text-xs font-bold text-right text-slate-700">{g.vat_rate}%</td>
                        <td className="px-4 py-3 text-xs font-bold text-right text-slate-700">{g.pit_rate}%</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${g.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {g.active ? 'Hoạt động' : 'Tắt'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center flex flex-row justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(g)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-all cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(g.id, g.name)}
                            className="p-1 rounded hover:bg-rose-50 text-rose-600 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

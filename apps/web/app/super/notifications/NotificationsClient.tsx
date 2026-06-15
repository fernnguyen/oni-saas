'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { toast } from 'sonner'
import { sendSystemBroadcastNotification, getTenantsList, getShopsList } from './actions'
import { Megaphone, Send, RotateCcw, Building2, Store, AlertTriangle, X } from 'lucide-react'

export function NotificationsClient() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [shops, setShops] = useState<{ id: string; name: string }[]>([])
  const [selectedShopId, setSelectedShopId] = useState('')
  
  const [isPending, startTransition] = useTransition()
  const [loadingTenants, setLoadingTenants] = useState(false)
  const [loadingShops, setLoadingShops] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  // Tải danh sách các tổ chức (tenants) khi mount
  useEffect(() => {
    setLoadingTenants(true)
    getTenantsList()
      .then((data) => {
        setTenants(data)
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải danh sách tổ chức.')
      })
      .finally(() => {
        setLoadingTenants(false)
      })
  }, [])

  // Tải danh sách chi nhánh (shops) khi thay đổi tổ chức
  useEffect(() => {
    if (!selectedTenantId) {
      setShops([])
      setSelectedShopId('')
      return
    }

    setLoadingShops(true)
    getShopsList(selectedTenantId)
      .then((data) => {
        setShops(data)
        setSelectedShopId('') // Reset chi nhánh đã chọn
      })
      .catch((err) => {
        console.error(err)
        toast.error('Không thể tải danh sách chi nhánh.')
      })
      .finally(() => {
        setLoadingShops(false)
      })
  }, [selectedTenantId])

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !content.trim()) {
      toast.error('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo!')
      return
    }

    setIsConfirmOpen(true)
  }

  const handleConfirmSend = () => {
    setIsConfirmOpen(false)

    startTransition(async () => {
      try {
        const result = await sendSystemBroadcastNotification(
          title,
          content,
          url,
          selectedTenantId || undefined,
          selectedShopId || undefined
        )
        if (result.success) {
          toast.success(`Đã gửi thông báo thành công tới ${result.successCount}/${result.total} tổ chức!`)
          // Reset form text
          setTitle('')
          setContent('')
          setUrl('')
        } else {
          toast.error('Có lỗi xảy ra khi gửi thông báo.')
        }
      } catch (err: any) {
        console.error(err)
        toast.error(err.message || 'Lỗi hệ thống khi gửi thông báo.')
      }
    })
  }

  const handleReset = () => {
    setTitle('')
    setContent('')
    setUrl('')
    setSelectedTenantId('')
    setSelectedShopId('')
  }

  const targetTenantName = tenants.find((t) => t.id === selectedTenantId)?.name
  const targetShopName = shops.find((s) => s.id === selectedShopId)?.name

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Soạn thông báo đẩy</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Gửi tin nhắn tức thì tới các tổ chức hoặc chi nhánh, hiển thị trên cả Web POS và Thiết bị di động.
            </p>
          </div>
        </div>

        <form onSubmit={handleOpenConfirm} className="p-6 space-y-5">
          {/* Target Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tenant Selection */}
            <div className="space-y-1.5">
              <label htmlFor="tenant-select" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                Tổ chức mục tiêu
              </label>
              <select
                id="tenant-select"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer"
                disabled={isPending || loadingTenants}
              >
                <option value="">🌍 Toàn bộ máy chủ (Tất cả tổ chức)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    🏢 {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Shop Selection */}
            <div className="space-y-1.5">
              <label htmlFor="shop-select" className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Store className="h-3.5 w-3.5 text-slate-400" />
                Chi nhánh mục tiêu
              </label>
              <select
                id="shop-select"
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
                disabled={isPending || !selectedTenantId || loadingShops}
              >
                {!selectedTenantId ? (
                  <option value="">🔒 Chọn tổ chức trước</option>
                ) : (
                  <>
                    <option value="">🏬 Tất cả chi nhánh</option>
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        🏪 {s.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="title" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tiêu đề thông báo <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Bảo trì hệ thống định kỳ"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
              disabled={isPending}
              required
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <label htmlFor="content" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Nội dung chi tiết <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nhập nội dung thông báo gửi đến người dùng..."
              rows={5}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 resize-none"
              disabled={isPending}
              required
            />
          </div>

          {/* Redirect URL */}
          <div className="space-y-1.5">
            <label htmlFor="url" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Đường dẫn liên kết (Tùy chọn)
            </label>
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Ví dụ: /dashboard/settings hoặc đường dẫn ngoài (http...)"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
              disabled={isPending}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Khi người dùng nhấp vào thông báo trên web/di động, hệ thống sẽ tự động chuyển hướng đến đường dẫn này.
            </p>
          </div>

          {/* Alert / Warning */}
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 flex gap-3 text-amber-800 text-xs">
            <span className="text-base select-none">⚠️</span>
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold">Lưu ý quan trọng:</span> Hành động này sẽ gửi thông báo đến{' '}
              <span className="font-bold text-indigo-700">
                {!selectedTenantId
                  ? 'tất cả người dùng thuộc mọi tổ chức (tenant)'
                  : !selectedShopId
                    ? `tất cả người dùng thuộc tổ chức "${targetTenantName || ''}"`
                    : `tất cả người dùng thuộc chi nhánh "${targetShopName || ''}"`}
              </span>{' '}
              trên hệ thống. Vui lòng kiểm tra kỹ nội dung trước khi nhấn gửi.
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              disabled={isPending}
            >
              <RotateCcw className="h-4 w-4" />
              Nhập lại
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary-dark shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Gửi thông báo
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fade-in_0.2s_ease-out]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 animate-[popover-in_0.2s_ease-out]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-bold text-slate-900">Xác nhận gửi thông báo</h3>
              </div>
              <button
                onClick={() => setIsConfirmOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Bạn có chắc chắn muốn gửi thông báo này không? Thao tác này sẽ phân phối đẩy trực tiếp đến các thiết bị di động và trình duyệt web.
              </p>

              {/* Target Indicator */}
              <div className="rounded-xl bg-indigo-50/50 border border-indigo-100/50 p-4 space-y-2.5">
                <div className="flex items-start gap-2 text-xs">
                  <span className="font-bold text-slate-500 w-24 shrink-0">Đối tượng nhận:</span>
                  <span className="font-bold text-indigo-700">
                    {!selectedTenantId
                      ? '🌍 Toàn bộ máy chủ (Tất cả tổ chức & chi nhánh)'
                      : !selectedShopId
                        ? `🏢 Tổ chức: ${targetTenantName}`
                        : `🏪 Chi nhánh: ${targetShopName} (${targetTenantName})`}
                  </span>
                </div>
                {url && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="font-bold text-slate-500 w-24 shrink-0">Đường dẫn:</span>
                    <span className="font-mono text-slate-600 break-all">{url}</span>
                  </div>
                )}
              </div>

              {/* Preview Content */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50/30">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bản xem trước tin nhắn</div>
                <div className="text-sm font-bold text-slate-900">{title}</div>
                <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                  {content}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                className="px-5 py-2 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary-dark shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="h-4 w-4" />
                Xác nhận và gửi
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Animations style */}
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popover-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

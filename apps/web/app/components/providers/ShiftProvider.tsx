'use client'

import React, { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'

interface ShiftContextType {
  isShiftEnabled: boolean
  hasActiveShift: boolean
  activeShift: Record<string, any> | null
  isLoading: boolean
  checkShiftOrOpen: (onSuccess: () => void) => void
  refetchShift: () => Promise<any>
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined)

interface ShiftProviderProps {
  children: ReactNode
  shopId: string
  branchId: string
  userEmail: string
  permissions: string[]
}

export function ShiftProvider({
  children,
  shopId,
  branchId,
  userEmail,
  permissions,
}: ShiftProviderProps) {
  const queryClient = useQueryClient()
  const canBypassShift = permissions.includes('cashbook.shift.manage')

  // Modals States
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false)
  const [showBypassConfirm, setShowBypassConfirm] = useState(false)
  const [openingCashInput, setOpeningCashInput] = useState('0')
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // 1. Fetch Shop Settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
  })
  const isShiftEnabled = settings?.enable_shift_management ?? false

  // 2. Fetch Active Open Shift for Current Employee
  const {
    data: activeShiftData,
    isLoading: shiftLoading,
    refetch: refetchShift,
  } = useQuery({
    queryKey: ['open-shift', shopId, branchId, userEmail],
    queryFn: async () => {
      if (!isShiftEnabled || !branchId || !userEmail) return null
      const res = await fetch(
        `/api/shops/${shopId}/shifts?status=open&branch_id=${branchId}&user_id=${userEmail}`
      )
      if (!res.ok) return null
      const data = await res.json()
      return data.total > 0 ? data.data[0] : null
    },
    enabled: isShiftEnabled && !!branchId && !!userEmail,
  })

  const hasActiveShift = !!activeShiftData
  const activeShift = activeShiftData
  const isLoading = settingsLoading || (isShiftEnabled && shiftLoading)

  // 3. Open Shift Mutation
  const openShiftMutation = useMutation({
    mutationFn: async (payload: { branch_id: string; opening_cash: number }) => {
      const res = await fetch(`/api/shops/${shopId}/shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Mở ca thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Mở ca làm việc POS thành công!')
      queryClient.invalidateQueries({
        queryKey: ['open-shift', shopId, branchId, userEmail],
      })
      queryClient.invalidateQueries({
        queryKey: ['all-open-shifts', shopId, branchId],
      })

      // Execute pending action after successful shift opening
      if (pendingAction) {
        // Delay slightly to let React Query update state
        setTimeout(() => {
          pendingAction()
          setPendingAction(null)
        }, 100)
      }

      setShowOpenShiftModal(false)
      setShowBypassConfirm(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Core business hook handler
  const checkShiftOrOpen = (onSuccess: () => void) => {
    if (!isShiftEnabled || hasActiveShift) {
      onSuccess()
      return
    }

    setPendingAction(() => onSuccess)

    if (canBypassShift) {
      // User has permissions to bypass shift check (Owner / Admin)
      setShowBypassConfirm(true)
    } else {
      // Ordinary staff must open a shift
      setOpeningCashInput('0')
      setShowOpenShiftModal(true)
    }
  }

  const handleOpenQuickShiftFromBypass = () => {
    setShowBypassConfirm(false)
    setOpeningCashInput('0')
    setShowOpenShiftModal(true)
  }

  const handleBypassConfirm = () => {
    setShowBypassConfirm(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
  }

  return (
    <ShiftContext.Provider
      value={{
        isShiftEnabled,
        hasActiveShift,
        activeShift,
        isLoading,
        checkShiftOrOpen,
        refetchShift,
      }}
    >
      {children}

      {/* DIALOG A: MỞ CA LÀM VIỆC NHANH (GLOBAL QUICK SHIFT OPEN) */}
      <ConfirmDialog
        open={showOpenShiftModal}
        onClose={() => {
          setShowOpenShiftModal(false)
          setPendingAction(null)
        }}
        onConfirm={() =>
          openShiftMutation.mutate({
            branch_id: branchId,
            opening_cash: Number(openingCashInput) || 0,
          })
        }
        title="Mở ca làm việc POS"
        confirmLabel={openShiftMutation.isPending ? 'Đang mở ca...' : 'Xác nhận Mở ca'}
        cancelLabel="Hủy bỏ"
        loading={openShiftMutation.isPending}
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="text-center bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-2xl border border-indigo-100/50 space-y-1">
            <div className="text-3xl">🏦</div>
            <h3 className="text-sm font-bold text-slate-800">Yêu cầu mở ca làm việc</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Hệ thống đang bật chế độ Quản lý ca. Tài khoản của bạn cần khai báo số tiền mặt hiện có trong két trước khi tiếp tục thực hiện giao dịch này.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Số tiền mặt bàn giao đầu ca
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={openingCashInput ? Number(openingCashInput).toLocaleString('vi-VN') : ''}
                onChange={(e) => setOpeningCashInput(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-xl font-extrabold border border-slate-200 rounded-xl py-2.5 px-8 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white text-slate-800 transition-all shadow-sm"
                placeholder="Nhập số tiền mặt đầu ca"
                autoFocus
              />
              <span className="absolute right-4 text-sm font-semibold text-slate-400">đ</span>
            </div>
          </div>
        </div>
      </ConfirmDialog>

      {/* DIALOG B: CẢNH BÁO CHƯA MỞ CA DÀNH CHO OWNER/ADMIN (BYPASS FLOW) */}
      <ConfirmDialog
        open={showBypassConfirm}
        onClose={() => {
          setShowBypassConfirm(false)
          setPendingAction(null)
        }}
        onConfirm={handleBypassConfirm}
        title="Thông báo ca làm việc"
        confirmLabel="Bỏ qua & Tiếp tục"
        cancelLabel="Đóng"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="text-center bg-amber-50 p-4 rounded-2xl border border-amber-100/50 space-y-1">
            <div className="text-3xl">⚠️</div>
            <h3 className="text-sm font-bold text-slate-800">Chưa có ca làm việc mở</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Chi nhánh hiện tại đang bật Quản lý ca kíp nhưng bạn chưa mở ca làm việc cá nhân.
            </p>
          </div>

          <div className="text-xs text-slate-600 leading-relaxed border-l-2 border-primary pl-3 py-1 bg-slate-50 rounded-r-lg">
            Vì bạn có quyền <strong>Quản lý ca kíp</strong> (Owner/Admin), bạn có thể lựa chọn <strong>"Bỏ qua ca"</strong> để ghi nhận giao dịch trực tiếp vào sổ quỹ, hoặc <strong>"Mở ca nhanh"</strong> để bắt đầu ca mới.
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleOpenQuickShiftFromBypass}
              className="text-xs font-semibold text-indigo-650 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 px-4 py-2 rounded-xl transition-all border border-indigo-150 active:scale-95 cursor-pointer shadow-xs"
            >
              🚀 Mở ca làm việc nhanh
            </button>
          </div>
        </div>
      </ConfirmDialog>
    </ShiftContext.Provider>
  )
}

export function useShift() {
  const context = useContext(ShiftContext)
  if (context === undefined) {
    throw new Error('useShift must be used within a ShiftProvider')
  }
  return context
}

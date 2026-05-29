'use client'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { NumberInput } from '@/app/components/ui/NumberInput'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { CopyableId } from '@/app/components/ui/CopyableId'
import { BANKS } from '@/lib/constants/banks'
import { Coins, Check, X } from 'lucide-react'

export function getBankDisplayName(bankCodeOrName: string) {
  if (!bankCodeOrName) return '—'
  const trimmed = bankCodeOrName.trim().toUpperCase()
  const bank = BANKS.find(
    (b) =>
      b.code?.toUpperCase() === trimmed ||
      b.shortName?.toUpperCase() === trimmed ||
      b.name?.toUpperCase() === trimmed ||
      b.short_name?.toUpperCase() === trimmed
  )
  return bank ? bank.shortName : bankCodeOrName
}

export function formatCustomerId(id: string | undefined): string {
  if (!id) return '—'
  const parts = id.split('-')
  if (parts.length >= 3 && (parts[0] === 'C' || parts[0] === 'S')) {
    const num = parts[parts.length - 1]
    if (/^\d+$/.test(num)) {
      return `#${num}`
    }
  }
  return id
}

interface Props {
  shopId: string
  shopName: string
}

export function DebtClient({ shopId }: Props) {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const supplierQuery = searchParams?.get('supplier')
  
  const [slideOpen, setSlideOpen] = useState(false)
  const [tab, setTab] = useState<'customer' | 'supplier'>(supplierQuery ? 'supplier' : 'customer')
  const [selectedEntity, setSelectedEntity] = useState<Record<string, string> | null>(null)
  const [amountToCollect, setAmountToCollect] = useState(0)
  const [method, setMethod] = useState('cash')
  const [fundId, setFundId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['debt', shopId, tab],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/debt?type=${tab}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Record<string, string>[]; total: number, totalDebt: number }>
    },
  })

  // Load payment funds (Quỹ tiền mặt, Ngân hàng...)
  const { data: fundsData } = useQuery({
    queryKey: ['payment-funds', shopId, 'active'],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payment-funds?active=TRUE`)
      if (!res.ok) throw new Error('Không tải được danh sách quỹ')
      return res.json() as Promise<{ data: Record<string, any>[] }>
    }
  })
  const funds = fundsData?.data ?? []

  // Auto-open supplier from query params
  useEffect(() => {
    if (supplierQuery && data?.data) {
      const row = data.data.find(r => r.id === supplierQuery)
      if (row && !slideOpen && !selectedEntity) {
        openCollect(row)
      }
    }
  }, [supplierQuery, data, slideOpen, selectedEntity])

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEntity) throw new Error(tab === 'supplier' ? 'Không có nhà cung cấp' : 'Không có khách hàng')
      if (amountToCollect <= 0) throw new Error('Số tiền phải lớn hơn 0')
      
      const payload = {
        type: tab === 'supplier' ? 'payment' : 'receipt',
        amount: amountToCollect,
        method,
        fund_id: fundId || undefined,
        category: tab === 'supplier' ? 'debt_payment' : 'debt_collection',
        reference_id: tab === 'supplier' ? selectedEntity.id : selectedEntity.customer_id,
        reference_name: selectedEntity.name,
        note: tab === 'supplier' ? `Trả nợ nhà cung cấp ${selectedEntity.name}` : `Thu nợ khách hàng ${selectedEntity.name}`,
      }

      const res = await fetch(`/api/shops/${shopId}/cashbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Thanh toán thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success(tab === 'supplier' 
        ? `Đã trả ${amountToCollect.toLocaleString('vi-VN')}đ thành công!` 
        : `Đã thu ${amountToCollect.toLocaleString('vi-VN')}đ thành công!`
      )
      setSlideOpen(false)
      queryClient.invalidateQueries({ queryKey: ['debt', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['customers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['suppliers', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payment-funds', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function openCollect(row: Record<string, string>) {
    setSelectedEntity(row)
    setAmountToCollect(parseFloat(row.debt_amount || '0'))
    
    // Auto-select default fund
    const defaultFund = funds.find(f => f.is_default === 'TRUE') || funds[0]
    setFundId(defaultFund?.id || '')
    if (defaultFund) {
      setMethod(defaultFund.type === 'cash' ? 'cash' : 'bank_transfer')
    } else {
      setMethod('cash')
    }

    setSlideOpen(true)
  }

  // Pre-calculate debt age (days) and local search filter
  const processedData = useMemo(() => {
    const raw = data?.data ?? []
    const mapped = raw.map((row): Record<string, string> => {
      // Parse metadata to extract imported debt_days
      let importedDebtDays = 0
      try {
        if (row.metadata) {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
          if (meta && meta.debt_days) {
            importedDebtDays = parseInt(String(meta.debt_days), 10) || 0
          }
        }
      } catch (e) {
        console.error('Failed to parse metadata in DebtClient:', e)
      }

      // Calculate debt age:
      // If there is an imported debt_days, the debt started 'importedDebtDays' before customer creation.
      // Otherwise, the debt started at customer creation (created_at).
      const baseDateStr = row.created_at || new Date().toISOString()
      let debtDays = 0
      if (baseDateStr) {
        const baseDate = new Date(baseDateStr)
        if (!isNaN(baseDate.getTime())) {
          if (importedDebtDays > 0) {
            baseDate.setDate(baseDate.getDate() - importedDebtDays)
          }
          const diffTime = Math.max(0, new Date().getTime() - baseDate.getTime())
          debtDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        }
      }

      return {
        ...row,
        debt_days: String(debtDays),
      }
    })

    if (!search) return mapped
    let s = search.toLowerCase()
    if (s.startsWith('#')) {
      s = s.substring(1)
    }
    return mapped.filter(row => 
      row.name?.toLowerCase().includes(s) || 
      row.phone?.toLowerCase().includes(s) || 
      (tab === 'supplier' ? row.id : row.customer_id)?.toLowerCase().includes(s)
    )
  }, [data?.data, search, tab])

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { 
      key: 'id_code', 
      label: tab === 'supplier' ? 'Mã NCC' : 'Mã KH', 
      render: (row) => {
        const fullId = tab === 'supplier' ? row.id : row.customer_id
        return fullId ? (
          <CopyableId 
            id={fullId} 
            label={formatCustomerId(fullId)} 
            className="text-sm font-semibold text-primary" 
          />
        ) : <span>—</span>
      }
    },
    { 
      key: 'name', 
      label: tab === 'supplier' ? 'Tên Nhà Cung Cấp' : 'Tên Khách Hàng', 
      sortable: true,
      render: (row) => <span className="font-medium text-slate-900">{row.name}</span> 
    },
    { key: 'phone', label: 'SĐT' },
    {
      key: 'debt_amount',
      label: 'Công nợ hiện tại',
      sortable: true,
      render: (row) => <span className="font-semibold text-red-600">{Number(row.debt_amount || 0).toLocaleString('vi-VN')}đ</span>,
    },
    {
      key: 'debt_days',
      label: 'Số ngày nợ',
      sortable: true,
      render: (row) => {
        const days = Number(row.debt_days || 0)
        return (
          <span className={`font-medium ${days > 30 ? 'text-red-500 font-semibold' : 'text-slate-700'}`}>
            {days} ngày
          </span>
        )
      }
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              openCollect(row)
            }}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-dark transition-all cursor-pointer active:scale-95"
          >
            {tab === 'supplier' ? 'Trả nợ' : 'Thu nợ'}
          </button>
        </div>
      ),
    },
  ], [tab])

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Quản lý Công Nợ</h1>
          
          {/* Consistent Tab Navigation */}
          <div className="mt-3 flex border-b border-slate-200">
            <button
              onClick={() => {
                setTab('customer')
                setSearch('')
              }}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                tab === 'customer'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Nợ cần thu (Khách hàng)
            </button>
            <button
              onClick={() => {
                setTab('supplier')
                setSearch('')
              }}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                tab === 'supplier'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Nợ cần trả (Nhà cung cấp)
            </button>
          </div>

          <p className="mt-3 text-sm text-slate-500">
            {search ? `${processedData.length} trên ` : ''}{data?.total ?? 0} {tab === 'supplier' ? 'đối tác' : 'khách hàng'} đang nợ
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
        
        <div className={`rounded-2xl border px-6 py-3 text-right ${tab === 'supplier' ? 'border-orange-100 bg-orange-50/50' : 'border-red-100 bg-red-50/50'}`}>
          <p className={`text-sm font-medium ${tab === 'supplier' ? 'text-orange-600/80' : 'text-red-600/80'}`}>
            {tab === 'supplier' ? 'Tổng công nợ cần trả' : 'Tổng công nợ cần thu'}
          </p>
          <p className={`text-2xl font-bold ${tab === 'supplier' ? 'text-orange-600' : 'text-red-600'}`}>
            {Number(data?.totalDebt || 0).toLocaleString('vi-VN')}đ
          </p>
        </div>
      </div>

      {/* Local search input */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={tab === 'supplier' ? "Tìm kiếm nhà cung cấp..." : "Tìm kiếm khách hàng..."}
        hideFilter
      />

      {/* DataTable supporting sorting, clickable rows */}
      <DataTable
        columns={columns}
        data={processedData}
        loading={isLoading}
        emptyState={<EmptyState title="Không có công nợ" description={tab === 'supplier' ? "Tất cả nhà cung cấp đã được thanh toán." : "Tất cả khách hàng đã thanh toán đầy đủ."} />}
        rowKey={(row) => tab === 'supplier' ? row.id : row.customer_id}
        onRowClick={openCollect}
      />

      {/* Collect / Pay Debt SlideOver */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={tab === 'supplier' ? 'Trả nợ nhà cung cấp' : 'Thu nợ khách hàng'}
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 w-full *:w-full sm:*:w-auto">
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all justify-center"
            >
              <X className="w-4 h-4" />
              Hủy
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={collectMutation.isPending || amountToCollect <= 0}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-sm justify-center"
            >
              {collectMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  {tab === 'supplier' ? 'Xác nhận trả nợ' : 'Xác nhận thu nợ'}
                </>
              )}
            </button>
          </div>
        }
      >
        {selectedEntity && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">{tab === 'supplier' ? 'Nhà cung cấp:' : 'Khách hàng:'}</span>
                <span className="font-medium text-slate-900">{selectedEntity.name}</span>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-500">Số điện thoại:</span>
                <span className="font-medium text-slate-900">{selectedEntity.phone}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                <span className="text-sm font-medium text-slate-700">Dư nợ hiện tại:</span>
                <span className="font-bold text-red-650">
                  {Number(selectedEntity.debt_amount || 0).toLocaleString('vi-VN')}đ
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <NumberInput
                label={tab === 'supplier' ? 'Số tiền trả *' : 'Số tiền thu *'}
                value={String(amountToCollect)}
                onChange={(v) => setAmountToCollect(Number(v) || 0)}
                suffix="đ"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline hover:text-primary-dark transition-colors cursor-pointer"
                  onClick={() => setAmountToCollect(parseFloat(selectedEntity.debt_amount || '0'))}
                >
                  {tab === 'supplier' ? 'Trả toàn bộ' : 'Thu toàn bộ'}
                </button>
              </div>

              {/* Cashbook/Fund Selection Dropdown */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {tab === 'supplier' ? 'Tài khoản/Sổ quỹ chi tiền *' : 'Tài khoản/Sổ quỹ nhận tiền *'}
                </label>
                <select
                  value={fundId}
                  onChange={(e) => {
                    const val = e.target.value
                    setFundId(val)
                    const selectedFund = funds.find(f => f.id === val)
                    if (selectedFund) {
                      const fundType = selectedFund.type || 'cash'
                      if (fundType === 'cash') {
                        setMethod('cash')
                      } else {
                        setMethod('bank_transfer')
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none transition-colors"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.type === 'cash' ? 'Tiền mặt' : 'Tài khoản ngân hàng'} - Số dư: {Number(f.current_balance || 0).toLocaleString('vi-VN')}đ)
                    </option>
                  ))}
                  {funds.length === 0 && <option value="">Đang tải danh sách sổ quỹ...</option>}
                </select>
              </div>

              {/* Show banking info if bank transfer selected */}
              {(() => {
                const selectedFund = funds.find(f => f.id === fundId)
                if (selectedFund && selectedFund.type === 'bank' && (selectedFund.bank_name || selectedFund.account_number)) {
                  return (
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-2 text-xs text-indigo-900 animate-in fade-in slide-in-from-top-1 duration-200 shadow-xs relative overflow-hidden">
                      <div className="absolute right-3 top-3 opacity-10 text-3xl font-bold select-none pointer-events-none">🏛️</div>
                      <p className="font-bold text-[10px] uppercase tracking-wider text-indigo-500 mb-1 flex items-center gap-1">
                        <span>🏛️</span> Thông tin thanh toán (Chuyển khoản)
                      </p>
                      <div className="grid grid-cols-3 gap-y-1.5 gap-x-2">
                        <span className="text-indigo-650 font-medium">Ngân hàng:</span>
                        <span className="col-span-2 font-bold text-slate-800">
                          {getBankDisplayName(selectedFund.bank_name)}
                        </span>
                        
                        <span className="text-indigo-650 font-medium">Số tài khoản:</span>
                        <span className="col-span-2 font-bold text-slate-800">
                          {selectedFund.account_number ? (
                            <CopyableId
                              id={selectedFund.account_number}
                              className="text-sm font-bold text-slate-800"
                            />
                          ) : (
                            <span className="text-sm font-bold text-slate-800">—</span>
                          )}
                        </span>
                        
                        <span className="text-indigo-650 font-medium">Chủ tài khoản:</span>
                        <span className="col-span-2 font-bold text-slate-800">
                          {selectedFund.account_name ? (
                            <CopyableId
                              id={selectedFund.account_name.toUpperCase()}
                              className="text-sm font-bold text-slate-800 uppercase"
                            />
                          ) : (
                            <span className="text-sm font-bold text-slate-800">—</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )
                }
                return null
              })()}
            </div>
            
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              <p>Sau khi {tab === 'supplier' ? 'trả' : 'thu'}, dư nợ của đối tác sẽ còn <b>{Math.max(0, parseFloat(selectedEntity.debt_amount || '0') - amountToCollect).toLocaleString('vi-VN')}đ</b>.</p>
              <p className="mt-1">Một <b>Phiếu {tab === 'supplier' ? 'Chi' : 'Thu'}</b> sẽ được tự động tạo trong Sổ Quỹ.</p>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Double confirmation modal */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          collectMutation.mutate()
          setConfirmOpen(false)
        }}
        title={tab === 'supplier' ? 'Xác nhận trả nợ nhà cung cấp' : 'Xác nhận thu nợ khách hàng'}
        description={
          tab === 'supplier'
            ? `Hành động này sẽ tự động tạo một PHIẾU CHI SỔ QUỸ tương ứng và khấu trừ công nợ của nhà cung cấp. Bạn có chắc chắn muốn trả ${amountToCollect.toLocaleString('vi-VN')}đ cho nhà cung cấp "${selectedEntity?.name}" không?`
            : `Hành động này sẽ tự động tạo một PHIẾU THU SỔ QUỸ tương ứng và khấu trừ công nợ của khách hàng. Bạn có chắc chắn muốn thu ${amountToCollect.toLocaleString('vi-VN')}đ từ khách hàng "${selectedEntity?.name}" không?`
        }
        confirmLabel={tab === 'supplier' ? 'Xác nhận trả nợ' : 'Xác nhận thu nợ'}
        variant="default"
        loading={collectMutation.isPending}
      />
    </div>
  )
}

'use client'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { CopyableId } from '@/app/components/ui/CopyableId'
import { DebtCollectionSlideOver } from '@/app/components/ui/DebtCollectionSlideOver'
import { RefreshCw } from 'lucide-react'


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

  function openCollect(row: Record<string, string>) {
    setSelectedEntity(row)
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
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">Quản lý Công Nợ</h1>
          </div>
          
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

      {/* Local search input & Refresh */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={tab === 'supplier' ? "Tìm kiếm nhà cung cấp..." : "Tìm kiếm khách hàng..."}
            hideFilter
          />
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['debt', shopId] })}
          className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          title="Làm mới dữ liệu"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-primary' : ''}`} />
        </button>
      </div>

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
      <DebtCollectionSlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        shopId={shopId}
        entity={selectedEntity}
        entityType={tab}
        funds={funds}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['debt', shopId] })
        }}
      />
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { SearchBar } from '@/app/components/ui/SearchBar'

interface Props {
  shopId: string
  shopName: string
}

export function InventoryClient({ shopId }: Props) {
  const [data, setData] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (search) sp.set('search', search)
      const res = await fetch(`/api/shops/${shopId}/inventory?${sp}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json.data)
      setTotal(json.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [shopId, page, search])

  useEffect(() => { fetchData() }, [fetchData])

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'product_id', label: 'Mã SP' },
    { key: 'sku', label: 'SKU' },
    { key: 'branch_id', label: 'Mã chi nhánh' },
    {
      key: 'stock_qty',
      label: 'Tồn kho',
      render: (row) => {
        const isLow = row.min_stock && Number(row.stock_qty || 0) <= Number(row.min_stock || 0)
        return (
          <span className={isLow ? 'font-medium text-red-500' : undefined}>
            {row.stock_qty ?? '0'}
          </span>
        )
      },
    },
    { key: 'min_stock', label: 'Tồn min' },
    {
      key: 'cost_price',
      label: 'Giá vốn',
      render: (row) => <span>{Number(row.cost_price || 0).toLocaleString('vi-VN')}đ</span>,
    },
  ], [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tồn kho</h1>
          <p className="mt-0.5 text-sm text-slate-500">{total} mặt hàng</p>
        </div>
        <button
          disabled
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
        >
          Nhập kho
        </button>
      </div>

      <SearchBar
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder="Tìm kiếm..."
      />

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        pagination={{ page, total, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có dữ liệu tồn kho" description="Dữ liệu sẽ xuất hiện khi có giao dịch nhập/xuất." />}
        rowKey={(row) => `${row.product_id}-${row.branch_id}`}
      />
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Calendar, Package } from 'lucide-react'
import Image from 'next/image'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { EmptyState } from '@/app/components/ui/EmptyState'

interface ExpiringBatchesClientProps {
  shopId: string;
  shopName: string;
}

export function ExpiringBatchesClient({ shopId, shopName }: ExpiringBatchesClientProps) {
  const router = useRouter();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchBatches(days);
  }, [shopId, days]);

  const fetchBatches = async (lookaheadDays: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shops/${shopId}/inventory/expiring-batches?days=${lookaheadDays}`);
      if (res.ok) {
        const json = await res.json();
        setBatches(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const isExpired = (dateStr: string) => {
    return new Date(dateStr) < new Date();
  }

  const columns: Column[] = useMemo(() => [
    {
      key: 'product',
      header: 'Sản phẩm',
      width: '35%',
      render: (row: any) => {
        const product = row.product;
        return (
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
              {product?.image_url ? (
                <Image src={product.image_url} alt="" fill className="object-cover" />
              ) : (
                <Package className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-slate-400" />
              )}
            </div>
            <div>
              <div className="font-semibold text-slate-900">{product?.name || 'Sản phẩm không rõ'}</div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">{product?.sku || product?.barcode || ''}</div>
            </div>
          </div>
        )
      }
    },
    {
      key: 'batch_no',
      header: 'Số lô',
      width: '20%',
      render: (row: any) => (
        <span className="font-mono text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
          {row.batch_no || 'N/A'}
        </span>
      )
    },
    {
      key: 'expiry_date',
      header: 'Hạn sử dụng',
      width: '20%',
      render: (row: any) => {
        const expired = isExpired(row.expiry_date);
        return (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${expired ? 'text-red-600' : 'text-orange-600'}`}>
            <Calendar className="h-4 w-4" />
            {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('vi-VN') : 'N/A'}
            {expired && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase ml-1">Đã hết hạn</span>}
          </div>
        )
      }
    },
    {
      key: 'stock_qty',
      header: 'Tồn kho',
      width: '15%',
      align: 'right',
      render: (row: any) => {
        const qty = parseFloat(row.stock_qty || '0');
        const unit = row.product?.unit || '';
        return (
          <span className="font-semibold text-slate-900">
            {qty.toLocaleString('vi-VN')} <span className="text-slate-500 text-xs font-normal">{unit}</span>
          </span>
        )
      }
    }
  ], []);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in-50 duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors border border-slate-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Lô sắp hết hạn
              <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Cảnh báo</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">Danh sách các lô hàng đang còn tồn kho và sắp hết hạn sử dụng.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Lọc theo thời gian:</label>
          <select 
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#fa5907]/20 focus:border-[#fa5907]"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Trong 7 ngày tới</option>
            <option value={15}>Trong 15 ngày tới</option>
            <option value={30}>Trong 30 ngày tới</option>
            <option value={60}>Trong 60 ngày tới</option>
            <option value={90}>Trong 90 ngày tới</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#fa5907]"></div>
          </div>
        ) : batches.length === 0 ? (
          <EmptyState
            icon={<Package className="mx-auto h-12 w-12 text-slate-300" />}
            title="Không có dữ liệu"
            description={`Không tìm thấy lô hàng nào sắp hết hạn trong vòng ${days} ngày tới.`}
          />
        ) : (
          <DataTable
            columns={columns}
            data={batches}
            keyField="id"
          />
        )}
      </div>
    </div>
  )
}

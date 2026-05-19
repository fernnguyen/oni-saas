'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebounce } from 'use-debounce'
import { useSearchParams } from 'next/navigation'
import { DataTable, Column } from '@/app/components/ui/DataTable'
import { SlideOver } from '@/app/components/ui/SlideOver'
import { TagBadge, TagColor } from '@/app/components/ui/TagBadge'
import { EmptyState } from '@/app/components/ui/EmptyState'
import { ConfirmDialog } from '@/app/components/ui/ConfirmDialog'
import { SearchBar } from '@/app/components/ui/SearchBar'
import { CopyableId } from '@/app/components/ui/CopyableId'
import { useConfirm } from '@/app/components/ui/ConfirmProvider'
import { printBill } from '@/lib/pos/printBill'

const Eye = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
const Ban = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
const Printer = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
const RotateCcw = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>

interface Props {
  shopId: string
  shopName: string
}

interface StatPeriod {
  count: number
  revenue: number
}

interface OrderStats {
  today: StatPeriod
  week: StatPeriod
  month: StatPeriod
  returns: StatPeriod
}

type Row = Record<string, string>

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'draft', label: 'Nháp' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'in_progress', label: 'Đang sử dụng' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'returning', label: 'Đang trả hàng' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'partially_refunded', label: 'Hoàn 1 phần' },
  { value: 'refunded', label: 'Hoàn tiền' },
]
const CHANNEL_LABEL: Record<string, string> = {
  pos: 'Tại quầy',
  online: 'Online',
  phone: 'Điện thoại',
  zalo: 'Zalo',
}

const METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  card: 'Thẻ',
  bank_transfer: 'Chuyển khoản',
  momo: 'MoMo',
  vnpay: 'VNPay',
  zalopay: 'ZaloPay',
  debt: 'Nợ',
}

function statusColor(s: string): TagColor {
  if (s === 'completed') return 'green'
  if (s === 'cancelled') return 'red'
  if (s === 'draft') return 'yellow'
  if (s === 'confirmed') return 'blue'
  if (s === 'processing') return 'orange'
  if (s === 'in_progress') return 'blue'
  if (s === 'returning') return 'yellow'
  if (s === 'partially_refunded') return 'purple'
  if (s === 'refunded') return 'gray'
  return 'gray'
}

function statusLabel(s: string) {
  if (s === 'processed') return 'Đã xử lý'
  if (s === 'pending') return 'Chờ duyệt'
  if (s === 'rejected') return 'Đã hủy'
  if (s === 'deleted') return 'Đã xóa'
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
}

function fmtVND(v: string | undefined) {
  return Number(v || 0).toLocaleString('vi-VN') + 'đ'
}

function fmtDate(v: string | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

const EMPTY_PAYMENT = { method: 'cash', amount: '', note: '', reference_no: '' }

const STAT_CARDS: { key: keyof OrderStats; label: string }[] = [
  { key: 'today',   label: 'Hôm nay' },
  { key: 'week',    label: '7 ngày qua' },
  { key: 'month',   label: 'Tháng này' },
  { key: 'returns', label: 'Trả hàng' },
]

export function OrdersClient({ shopId, shopName }: Props) {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const initialSearch = searchParams?.get('search') || searchParams?.get('orderId') || ''
  
  const confirm = useConfirm()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch] = useDebounce(search, 300)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Row | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null)
  const [cancelReason, setCancelReason] = useState('Sai sót hệ thống')
  const [customCancelReason, setCustomCancelReason] = useState('')
  const [paymentForm, setPaymentForm] = useState<Record<string, string>>(EMPTY_PAYMENT)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [returnReason, setReturnReason] = useState('other')
  const [returnRefundMethod, setReturnRefundMethod] = useState('cash')
  const [returnNote, setReturnNote] = useState('')
  const [returnRefundAmount, setReturnRefundAmount] = useState('')
  const [returnItems, setReturnItems] = useState<Record<string, number>>({})
  const [showConfirmReturn, setShowConfirmReturn] = useState(false)
  const [printTarget, setPrintTarget] = useState<Row | null>(null)

  const { data: settings } = useQuery({
    queryKey: ['settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/settings`)
      if (!res.ok) return {}
      return res.json()
    },
    enabled: !!shopId,
  })

  const calcAutoRefund = () => {
    const items = itemsData?.data ?? []
    let total = 0
    items.forEach(i => {
      const q = returnItems[i.item_id!]
      if (q) {
        total += (parseFloat(i.line_total || '0') / parseFloat(i.qty || '1')) * q
      }
    })
    return total
  }

  // Stats summary
  const { data: stats } = useQuery<OrderStats>({
    queryKey: ['orders-stats', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/orders/stats`)
      if (!res.ok) throw new Error('Không tải được thống kê')
      return res.json()
    },
    staleTime: 60_000,
  })

  // Orders list
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['orders', shopId, page, debouncedSearch, statusFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) sp.set('search', debouncedSearch)
      if (statusFilter) sp.set('status', statusFilter)
      const res = await fetch(`/api/shops/${shopId}/orders?${sp}`)
      if (!res.ok) throw new Error('Không tải được dữ liệu')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
  })

  // Order items (lazy — only when detail open)
  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['order-items', shopId, selectedOrder?.order_id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/order-items?order_id=${selectedOrder!.order_id}&limit=100`)
      if (!res.ok) throw new Error('Không tải được chi tiết')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    enabled: !!selectedOrder,
  })

  // Payments (lazy — only when detail open)
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', shopId, selectedOrder?.order_id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/payments?order_id=${selectedOrder!.order_id}&limit=50`)
      if (!res.ok) throw new Error('Không tải được thanh toán')
      return res.json() as Promise<{ data: Row[]; total: number }>
    },
    enabled: !!selectedOrder,
  })

  // Returns history for order (lazy)
  const { data: orderReturnsData } = useQuery({
    queryKey: ['order-returns', shopId, selectedOrder?.order_id],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/returns?order_id=${selectedOrder!.order_id}&limit=50`)
      if (!res.ok) throw new Error('Không tải được lịch sử trả hàng')
      const returns = (await res.json()) as { data: any[]; total: number }
      
      const itemsPromises = returns.data.map(async (r) => {
        const iRes = await fetch(`/api/shops/${shopId}/return-items?return_id=${r.return_id}&limit=100`)
        const iData = await iRes.json()
        return { ...r, items: iData.data as any[] }
      })
      return Promise.all(itemsPromises) as Promise<any[]>
    },
    enabled: !!selectedOrder,
  })

  // Cashbook (lazy — only when detail open)
  const { data: cashbookData } = useQuery({
    queryKey: ['cashbook', shopId, selectedOrder?.order_id, orderReturnsData],
    queryFn: async () => {
      if (!selectedOrder) return { data: [] }
      const res = await fetch(`/api/shops/${shopId}/cashbook?reference_id=${selectedOrder.order_id}&limit=100`)
      const baseData = res.ok ? await res.json() : { data: [] }
      
      const allData = [...(baseData.data ?? [])]
      
      if (orderReturnsData) {
        for (const ret of orderReturnsData) {
          const retRef = ret.return_no || ret.return_id
          if (!retRef) continue
          const retRes = await fetch(`/api/shops/${shopId}/cashbook?reference_id=${retRef}&limit=10`)
          if (retRes.ok) {
            const retCb = await retRes.json()
            allData.push(...(retCb.data ?? []))
          }
        }
      }
      
      return { data: allData } as { data: Row[] }
    },
    enabled: !!selectedOrder,
  })

  const paymentCbMap = useMemo(() => {
    const map = new Map<string, string>()
    const usedCb = new Set<string>()
    for (const p of (paymentsData?.data ?? [])) {
      const cbMatch = (cashbookData?.data ?? []).find(cb => {
        const cbId = cb.id || cb.transaction_id
        if (usedCb.has(cbId)) return false
        return Math.abs(Number(cb.amount)) === Math.abs(Number(p.amount)) && 
               cb.method === p.method && 
               (Number(p.amount) < 0 ? cb.type === 'expense' : cb.type === 'receipt')
      })
      if (cbMatch) {
        const cbId = cbMatch.id || cbMatch.transaction_id
        usedCb.add(cbId)
        map.set(p.payment_id || p.id, cbId)
      }
    }
    return map
  }, [paymentsData, cashbookData])



  const alreadyReturnedQty = useMemo(() => {
    const qtyMap: Record<string, number> = {}
    if (!orderReturnsData) return qtyMap
    
    orderReturnsData.forEach(ret => {
      if (ret.status === 'rejected' || ret.status === 'deleted') return
      ret.items.forEach((item: any) => {
        const id = item.order_item_id || item.product_id
        if (id) {
          qtyMap[id] = (qtyMap[id] || 0) + parseInt(item.qty_returned || '0', 10)
        }
      })
    })
    return qtyMap
  }, [orderReturnsData])

  // Update status
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/shops/${shopId}/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Cập nhật thất bại')
      }
      return res.json()
    },
    onSuccess: (updated) => {
      toast.success('Đã cập nhật trạng thái')
      setSelectedOrder(updated)
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Add payment
  const paymentMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch(`/api/shops/${shopId}/orders/${selectedOrder?.order_id}/pay-installment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Thêm thanh toán thất bại')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Đã thêm thanh toán')
      setPaymentForm(EMPTY_PAYMENT)
      setShowPaymentForm(false)
      queryClient.invalidateQueries({ queryKey: ['payments', shopId, selectedOrder?.order_id] })
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Create return from order
  const returnMutation = useMutation({
    mutationFn: async (order: Row) => {
      const items = itemsData?.data ?? []
      const returningItems = items
        .map(i => ({ ...i, retQty: returnItems[i.item_id!] || 0 } as Row & { retQty: number }))
        .filter(i => i.retQty > 0)

      if (returningItems.length === 0) throw new Error('Vui lòng chọn ít nhất 1 sản phẩm để trả')

      const totalRefund = returnRefundAmount !== '' 
        ? parseFloat(returnRefundAmount) 
        : returningItems.reduce((s, i) => s + (parseFloat(i.line_total || '0') / parseFloat(i.qty || '1')) * i.retQty, 0)

      // 1. Create return header
      const retRes = await fetch(`/api/shops/${shopId}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id:      order.order_id,
          order_no:      order.order_no ?? order.order_id,
          customer_id:   order.customer_id ?? '',
          customer_name: order.customer_name ?? '',
          reason:        returnReason,
          refund_method: returnRefundMethod,
          total_refund:  String(totalRefund),
          status:        'pending',
          note:          returnNote,
        }),
      })
      if (!retRes.ok) throw new Error((await retRes.json()).error ?? 'Lỗi tạo phiếu trả')
      const ret = await retRes.json()
      // 2. Create return items from order items (fire-and-forget individual failures)
      await Promise.allSettled(
        returningItems.map((item) => {
          const retLineTotal = (parseFloat(item.line_total || '0') / parseFloat(item.qty || '1')) * item.retQty;
          return fetch(`/api/shops/${shopId}/return-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              return_id:    ret.return_id,
              return_no:    ret.return_no ?? ret.return_id,
              order_item_id: item.item_id ?? '',
              product_id:   item.product_id,
              product_name: item.product_name ?? '',
              sku:          item.sku ?? '',
              qty_returned: String(item.retQty),
              unit_price:   item.unit_price,
              line_total:   String(retLineTotal),
              variant_label: item.variant_label ?? '',
              modifiers: typeof item.modifiers === 'object' ? JSON.stringify(item.modifiers) : (item.modifiers ?? ''),
              modifier_total: item.modifier_total ?? '0',
            }),
          })
        })
      )
      
      let processed = false
      let processErrorStr = ''
      if (settings?.skip_return_confirmation) {
        const processRes = await fetch(`/api/shops/${shopId}/returns/${ret.return_id}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processed_by: 'Hệ thống (Tự động)' })
        })
        if (processRes.ok) {
          processed = true
        } else {
          const errData = await processRes.json().catch(() => ({}))
          processErrorStr = errData.message || errData.error || 'Thiếu quyền duyệt phiếu trả'
        }
      }
      return { ret, processed, processErrorStr }
    },
    onSuccess: (res) => {
      if (res.processed) {
        toast.success('Đã tạo và tự động duyệt phiếu trả hàng')
        // Invalidating orders will fetch the correct status (refunded / partially_refunded)
        queryClient.invalidateQueries({ queryKey: ['orders', shopId] }).then(() => {
          // Force a refetch for the selected order to update UI
          if (selectedOrder) {
            fetch(`/api/shops/${shopId}/orders/${selectedOrder.order_id}`)
              .then(r => r.json())
              .then(data => {
                if (data) {
                  setSelectedOrder(data)
                  setEditStatus(data.status)
                }
              })
          }
        })
      } else {
        if (settings?.skip_return_confirmation) {
          toast.success('Đã tạo phiếu trả hàng thành công', { 
            description: `Cần xét duyệt thủ công vì lỗi tự động: ${res.processErrorStr}`
          })
        } else {
          toast.success('Đã tạo phiếu trả hàng — xem trong mục Đơn trả hàng')
        }
        setSelectedOrder((prev) => prev ? { ...prev, status: 'returning' } : prev)
        setEditStatus('returning')
      }
      setShowReturnForm(false)
      setShowConfirmReturn(false)
      queryClient.invalidateQueries({ queryKey: ['returns', shopId] })
      queryClient.invalidateQueries({ queryKey: ['order-returns', shopId] })
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
      queryClient.invalidateQueries({ queryKey: ['cashbook', shopId] })
      queryClient.invalidateQueries({ queryKey: ['payments', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Cancel order
  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/shops/${shopId}/orders/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Hủy thất bại')
      }
    },
    onSuccess: () => {
      toast.success('Đã hủy đơn hàng')
      setCancelTarget(null)
      if (selectedOrder) {
        setEditStatus('cancelled')
        setSelectedOrder({ ...selectedOrder, status: 'cancelled' })
      }
      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Reprint logic
  async function handleReprint(order: Row) {
    try {
      // items and payments must be fetched or available
      // Actually we have them if we open detail, but if we click print from the list, we need to fetch them
      let localItems = itemsData?.data ?? []
      let localPayments = paymentsData?.data ?? []
      
      if (selectedOrder?.order_id !== order.order_id) {
        const [resItems, resPayments] = await Promise.all([
          fetch(`/api/shops/${shopId}/order-items?order_id=${order.order_id}&limit=100`),
          fetch(`/api/shops/${shopId}/payments?order_id=${order.order_id}&limit=50`)
        ])
        const dataItems = await resItems.json()
        const dataPayments = await resPayments.json()
        localItems = dataItems.data || []
        localPayments = dataPayments.data || []
      }

      const currentCount = parseInt(order.print_count || '0', 10)
      const newCount = currentCount + 1

      // print first
      await printBill({
        order,
        items: localItems,
        payments: localPayments,
        shopName,
        settings,
        printCount: newCount,
        shopId
      })

      // update count on server
      await fetch(`/api/shops/${shopId}/orders/${order.order_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ print_count: String(newCount) })
      })

      queryClient.invalidateQueries({ queryKey: ['orders', shopId] })
      if (selectedOrder?.order_id === order.order_id) {
        setSelectedOrder(prev => prev ? { ...prev, print_count: String(newCount) } : prev)
      }
    } catch (err) {
      console.error(err)
      toast.error('Có lỗi xảy ra khi in hóa đơn')
    }
  }

  function openDetail(row: Row) {
    setSelectedOrder(row)
    setEditStatus(row.status)
    setPaymentForm(EMPTY_PAYMENT)
    setShowPaymentForm(false)
  }

  function closeDetail() {
    setSelectedOrder(null)
    setShowReturnForm(false)
    setReturnReason('other')
    setReturnRefundMethod('cash')
    setReturnNote('')
    setReturnRefundAmount('')
    setReturnItems({})
    setShowConfirmReturn(false)
  }

  const columns = useMemo<Column<Row>[]>(() => [
    {
      key: 'order_id',
      label: 'Mã đơn',
      render: (row) => (
        <CopyableId 
          id={row.order_id} 
          onClick={() => openDetail(row)} 
        />
      ),
    },
    {
      key: 'customer_name',
      label: 'Khách hàng',
      render: (row) => <span>{row.customer_name || 'Khách lẻ'}</span>,
    },
    {
      key: 'channel',
      label: 'Kênh',
      render: (row) => <TagBadge label={CHANNEL_LABEL[row.channel] ?? row.channel} color="blue" />,
    },
    {
      key: 'status',
      label: 'Trạng thái',
      render: (row) => <TagBadge label={statusLabel(row.status)} color={statusColor(row.status)} />,
    },
    {
      key: 'total_amount',
      label: 'Tổng tiền',
      render: (row) => <span>{fmtVND(row.total_amount)}</span>,
    },
    {
      key: 'debt_amount',
      label: 'Còn nợ',
      render: (row) => (
        <span className={Number(row.debt_amount || 0) > 0 ? 'font-medium text-orange-600' : 'text-slate-400'}>
          {fmtVND(row.debt_amount)}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Ngày tạo',
      render: (row) => <span className="text-slate-500">{fmtDate(row.created_at)}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openDetail(row)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Xem
          </button>
          <button
            onClick={() => {
              if (parseInt(row.print_count || '0', 10) > 0) {
                setPrintTarget(row)
              } else {
                handleReprint(row)
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" /> In
          </button>
          {row.status !== 'cancelled' && row.status !== 'in_progress' && (
            <button
              onClick={() => setCancelTarget(row)}
              className="flex items-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-500 shadow-sm hover:bg-red-50 transition-colors"
            >
              <Ban className="h-3.5 w-3.5" /> Hủy
            </button>
          )}
        </div>
      ),
    },
  ], [])

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_CARDS.map(({ key, label }) => {
          const s = stats?.[key]
          return (
            <div key={key} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {s ? fmtVND(String(s.revenue)) : <span className="animate-pulse text-slate-300">—</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {s != null ? `${s.count} đơn` : ''}
              </p>
            </div>
          )
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Đơn hàng</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data?.total ?? 0} đơn hàng
            {isFetching && !isLoading && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1) }}
            className={[
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === opt.value
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <SearchBar
        value={search}
        onChange={(v) => { setSearch(v); setPage(1) }}
        placeholder="Tìm kiếm đơn hàng..."
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        pagination={{ page, total: data?.total ?? 0, pageSize: 50, onChange: setPage }}
        emptyState={<EmptyState title="Chưa có đơn hàng nào" description="Đơn hàng sẽ xuất hiện ở đây sau khi được tạo từ POS." />}
        rowKey={(row, idx) => `${row.order_id}__${idx}`}
      />

      <ConfirmDialog
        open={!!printTarget}
        title="Xác nhận in lại hóa đơn"
        description={`Bạn đang thực hiện thao tác in lại hóa đơn. Hóa đơn sẽ hiển thị (In lại lần ${parseInt(printTarget?.print_count || '0', 10)}). Bạn có chắc chắn muốn in?`}
        confirmLabel="In hóa đơn"
        cancelLabel="Hủy bỏ"
        onConfirm={() => {
          if (printTarget) handleReprint(printTarget)
          setPrintTarget(null)
        }}
        onClose={() => setPrintTarget(null)}
      />

      <SlideOver
        open={!!selectedOrder}
        onClose={closeDetail}
        title={selectedOrder ? `Chi tiết: ${selectedOrder.order_id}` : 'Chi tiết đơn hàng'}
        width={640}
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              {selectedOrder?.status === 'completed' || selectedOrder?.status === 'partially_refunded' ? (
                <button
                  onClick={() => {
                    setShowReturnForm((v) => {
                      if (!v) {
                        setTimeout(() => {
                          document.getElementById('return-section')?.scrollIntoView({ behavior: 'smooth' })
                        }, 100)
                      }
                      return !v
                    })
                    setReturnReason('other')
                    setReturnRefundMethod('cash')
                    setReturnNote('')
                    setReturnRefundAmount('')
                    setReturnItems({})
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 shadow-sm hover:bg-orange-100 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" /> Tạo phiếu trả
                </button>
              ) : (
                <span
                  title={selectedOrder?.status === 'refunded' ? 'Đơn đã hoàn tiền' : 'Chỉ tạo được phiếu trả khi đơn đã Hoàn thành'}
                  className="flex items-center gap-1.5 cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
                >
                  <RotateCcw className="h-4 w-4" /> Tạo phiếu trả
                </span>
              )}
              <button
                onClick={() => {
                  if (parseInt(selectedOrder?.print_count || '0', 10) > 0) {
                    setPrintTarget(selectedOrder)
                  } else {
                    handleReprint(selectedOrder!)
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" /> In lại
              </button>
            </div>
            <button onClick={closeDetail} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              Đóng
            </button>
          </div>
        }
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Order info */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Khách hàng</dt>
                  <dd className="font-medium text-slate-900">{selectedOrder.customer_name || 'Khách lẻ'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Kênh</dt>
                  <dd><TagBadge label={CHANNEL_LABEL[selectedOrder.channel] ?? selectedOrder.channel} color="blue" /></dd>
                </div>
                <div>
                  <dt className="text-slate-500">Ngày tạo</dt>
                  <dd className="text-slate-900">{fmtDate(selectedOrder.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Nhân viên</dt>
                  <dd className="text-slate-900">{selectedOrder.employee_id || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Tổng tiền</dt>
                  <dd className="font-semibold text-slate-900">{fmtVND(selectedOrder.total_amount)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Đã trả</dt>
                  <dd className="font-medium text-green-700">{fmtVND(selectedOrder.paid_amount)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Còn nợ</dt>
                  <dd className={Number(selectedOrder.debt_amount || 0) > 0 ? 'font-medium text-orange-600' : 'text-slate-400'}>
                    {fmtVND(selectedOrder.debt_amount)}
                  </dd>
                </div>
                {selectedOrder.note && (
                  <div className="col-span-2">
                    <dt className="text-slate-500">Ghi chú</dt>
                    <dd className="text-slate-900">{selectedOrder.note}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Status update */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Cập nhật trạng thái</h3>
              <div className="flex gap-2">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  disabled={selectedOrder.status === 'cancelled'}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50 disabled:bg-slate-50"
                >
                  {STATUS_OPTIONS.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => statusMutation.mutate({ id: selectedOrder.order_id, status: editStatus })}
                  disabled={statusMutation.isPending || editStatus === selectedOrder.status || selectedOrder.status === 'cancelled'}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </div>

            {/* Order items */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Sản phẩm</h3>
              {itemsLoading ? (
                <p className="text-sm text-slate-400">Đang tải...</p>
              ) : (itemsData?.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">Chưa có sản phẩm</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Sản phẩm</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">SL</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">Đơn giá</th>
                        <th className="px-3 py-2 text-right font-medium text-slate-600">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(itemsData?.data ?? []).map((item) => {
                        const parsedModifiers = typeof item.modifiers === 'string' && item.modifiers.startsWith('[') 
                          ? (() => { try { return JSON.parse(item.modifiers) } catch { return [] } })() 
                          : (item.modifiers || [])
                        const effPrice = Number(item.unit_price) + Number(item.modifier_total || 0)
                        return (
                        <tr key={item.item_id} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2 text-slate-900">
                            {item.product_name}
                            {item.variant_label && parsedModifiers.length === 0 && (
                              <span className="text-[11px] text-violet-600 font-medium block truncate mt-0.5">{item.variant_label}</span>
                            )}
                            {parsedModifiers.length > 0 && (
                              <span className="text-[11px] text-amber-600 block truncate mt-0.5">
                                {parsedModifiers.map((m: any) => m.option).join(' · ')}
                                {Number(item.modifier_total || 0) > 0 && (
                                  <span className="ml-1 text-emerald-600 font-medium">+{Number(item.modifier_total).toLocaleString('vi-VN')}đ</span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {item.qty}
                            {alreadyReturnedQty[item.item_id!] > 0 && (
                              <span className="ml-1 block text-xs text-orange-600">
                                (Đã trả {alreadyReturnedQty[item.item_id!]})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtVND(effPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">{fmtVND(item.line_total)}</td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Return History */}
            {orderReturnsData && orderReturnsData.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-700">Lịch sử trả hàng</h3>
                <div className="space-y-2">
                  {orderReturnsData.map(ret => (
                    <div key={ret.return_id} className="rounded-lg border border-orange-100 bg-orange-50/30 p-3 text-sm">
                      <div className="mb-1 flex justify-between font-medium text-slate-900">
                        <span>{ret.return_no || ret.return_id}</span>
                        <span className="text-orange-700">{fmtVND(ret.total_refund)}</span>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <TagBadge label={statusLabel(ret.status)} color={statusColor(ret.status)} />
                        <span>{fmtDate(ret.created_at)}</span>
                        {ret.note && <span>• {ret.note}</span>}
                      </div>
                      <div className="space-y-1">
                        {ret.items.map((item: any) => (
                          <div key={item.item_id || item.product_id} className="flex justify-between text-xs text-slate-600">
                            <span>{item.product_name}</span>
                            <span>SL: {item.qty_returned}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payments */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700">Thanh toán</h3>
                {selectedOrder.status === 'cancelled' && <span className="text-xs text-red-500 font-medium">Đơn đã hủy</span>}
              </div>

              {paymentsLoading ? (
                <p className="text-sm text-slate-400">Đang tải...</p>
              ) : (paymentsData?.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">Chưa có thanh toán</p>
              ) : (
                <div className="space-y-2">
                  {(paymentsData?.data ?? []).map((p) => {
                    const cbId = paymentCbMap.get(p.payment_id || p.id)
                    return (
                      <div key={p.payment_id || p.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium text-slate-900">{METHOD_LABEL[p.method] ?? p.method}</span>
                          {cbId && (
                            <span 
                              className="ml-2 cursor-pointer text-xs font-mono text-slate-500 hover:text-slate-700" 
                              title="Nhấn để sao chép mã" 
                              onClick={() => { 
                                navigator.clipboard.writeText(cbId)
                                toast.success('Đã copy mã: ' + cbId) 
                              }}
                            >
                              (#{cbId.split('-')[0] + '-' + (cbId.split('-')[1] || '')})
                            </span>
                          )}
                          {p.reference_no && <span className="ml-2 text-slate-500">#{p.reference_no}</span>}
                          {p.note && <span className="ml-2 text-slate-400">— {p.note}</span>}
                        </div>
                        <span className={`font-semibold ${Number(p.amount) < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtVND(p.amount)}</span>
                      </div>
                    )
                  })}
                  {(cashbookData?.data ?? [])
                    .filter(cb => !Array.from(paymentCbMap.values()).includes(cb.id || cb.transaction_id))
                    .map((cb) => {
                      const cbId = String(cb.id || cb.transaction_id);
                      return (
                        <div key={cbId} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium text-slate-900">{METHOD_LABEL[cb.method] ?? cb.method}</span>
                            <span 
                              className="ml-2 cursor-pointer text-xs font-mono text-slate-500 hover:text-slate-700" 
                              title="Nhấn để sao chép mã" 
                              onClick={() => { 
                                navigator.clipboard.writeText(cbId)
                                toast.success('Đã copy mã: ' + cbId) 
                              }}
                            >
                              (#{cbId.split('-')[0] + '-' + (cbId.split('-')[1] || '')})
                            </span>
                            {cb.category === 'refund' && <span className="ml-2 text-red-500 text-[10px] font-bold border border-red-200 bg-red-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Hoàn tiền</span>}
                            {cb.category === 'revenue' && <span className="ml-2 text-green-600 text-[10px] font-bold border border-green-200 bg-green-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Thu khác</span>}
                            {cb.note && <span className="ml-2 text-slate-500">— {cb.note}</span>}
                          </div>
                          <span className={`font-semibold ${cb.type === 'payment' ? 'text-red-600' : 'text-green-700'}`}>
                            {cb.type === 'payment' ? '-' : '+'}{fmtVND(cb.amount)}
                          </span>
                        </div>
                      )
                    })
                  }
                </div>
              )}

              {/* Add payment form */}
              {showPaymentForm && selectedOrder.status !== 'cancelled' && (
                <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Phương thức</label>
                      <select
                        value={paymentForm.method}
                        onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                      >
                        {Object.entries(METHOD_LABEL).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Số tiền</label>
                      <input
                        type="text"
                        value={paymentForm.amount ? Number(String(paymentForm.amount).replace(/\D/g, '')).toLocaleString('vi-VN') : ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '')
                          setPaymentForm((p) => ({ ...p, amount: val }))
                        }}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Mã giao dịch</label>
                    <input
                      type="text"
                      value={paymentForm.reference_no}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, reference_no: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                      placeholder="Tùy chọn"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Ghi chú</label>
                    <input
                      type="text"
                      value={paymentForm.note}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, note: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                      placeholder="Tùy chọn"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowPaymentForm(false); setPaymentForm(EMPTY_PAYMENT) }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={async () => {
                        const amt = Number(paymentForm.amount || 0)
                        const ok = await confirm({
                          title: 'Xác nhận thu tiền',
                          description: `Khoản thu ${fmtVND(String(amt))} sẽ lập tức được ghi nhận vào Sổ Quỹ (phiếu thu ${fmtVND(String(amt))}). Bạn có chắc chắn?`,
                          confirmLabel: 'Xác nhận thu',
                          cancelLabel: 'Hủy'
                        })
                        if (!ok) return
                        paymentMutation.mutate({
                          ...paymentForm,
                          order_id: selectedOrder.order_id,
                          order_no: selectedOrder.order_no ?? selectedOrder.order_id,
                        })
                      }}
                      disabled={paymentMutation.isPending || !paymentForm.amount}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                    >
                      {paymentMutation.isPending ? 'Đang lưu...' : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Return form */}
            {showReturnForm && (
              <div id="return-section" className="mt-4 space-y-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
                <h3 className="font-semibold text-orange-800">Tạo phiếu trả hàng</h3>
                <p className="text-xs text-orange-600">
                  Chọn các sản phẩm và số lượng muốn trả lại.
                </p>

                {settings?.skip_return_confirmation && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <strong className="block mb-1">⚠️ Cảnh báo:</strong>
                    Hệ thống đã cài đặt bỏ qua bước xét duyệt khi trả hàng. Hành động này sẽ tự động tạo phiếu chi (hoàn tiền), trả sản phẩm về kho và hoàn tất các phiếu liên quan ngay lập tức mà không cần xác nhận. Vẫn tiếp tục?
                  </div>
                )}

                {/* Return Items Selection */}
                <div className="space-y-2 rounded-lg border border-orange-200 bg-white p-2">
                  {(itemsData?.data ?? []).map((item) => {
                    const maxPurchased = parseInt(item.qty || '0', 10)
                    const returnedSoFar = alreadyReturnedQty[item.item_id!] || alreadyReturnedQty[item.product_id!] || 0
                    const maxQty = Math.max(0, maxPurchased - returnedSoFar)
                    
                    if (maxQty === 0) return null;

                    const isSelected = !!returnItems[item.item_id!]
                    const qtyToReturn = returnItems[item.item_id!] || 0
                    const lineTotal = parseFloat(item.line_total || '0')
                    const retTotal = isSelected ? (lineTotal / maxPurchased) * qtyToReturn : 0

                    return (
                      <div key={item.item_id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm border-b border-slate-50 last:border-0">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setReturnItems(prev => {
                                const next = { ...prev }
                                if (checked) next[item.item_id!] = maxQty
                                else delete next[item.item_id!]
                                return next
                              })
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-600"
                          />
                          <div>
                            <p className="font-medium text-slate-900">{item.product_name}</p>
                            {item.variant_label && (!item.modifiers || item.modifiers === '[]') && (
                              <p className="text-[11px] text-violet-600 font-medium mt-0.5">{item.variant_label}</p>
                            )}
                            {item.modifiers && item.modifiers !== '[]' && (
                              <p className="text-[11px] text-amber-600 mt-0.5">
                                {(() => {
                                   let parsed: any[] = [];
                                   try { parsed = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers; } catch {}
                                   return Array.isArray(parsed) ? parsed.map((m: any) => m.option).join(' · ') : ''
                                })()}
                                {Number(item.modifier_total || 0) > 0 && (
                                  <span className="ml-1 text-emerald-600 font-medium">+{Number(item.modifier_total).toLocaleString('vi-VN')}đ</span>
                                )}
                              </p>
                            )}
                            <p className="text-xs text-slate-500">Mua: {maxQty} | {fmtVND(item.unit_price)}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500">SL trả:</label>
                              <input
                                type="number"
                                min="1"
                                max={maxQty}
                                value={qtyToReturn}
                                onChange={(e) => {
                                  let q = parseInt(e.target.value, 10)
                                  if (isNaN(q) || q < 1) q = 1
                                  if (q > maxQty) q = maxQty
                                  setReturnItems(prev => ({ ...prev, [item.item_id!]: q }))
                                }}
                                className="w-16 rounded border border-orange-200 px-2 py-1 text-right text-sm"
                              />
                            </div>
                            <div className="w-24 text-right font-medium text-orange-700">
                              {fmtVND(String(retTotal))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-orange-700">Lý do</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="defective">Hàng lỗi</option>
                      <option value="damaged">Hàng hỏng</option>
                      <option value="wrong_item">Sai hàng</option>
                      <option value="changed_mind">Đổi ý</option>
                      <option value="other">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-orange-700">Hình thức hoàn</label>
                    <select
                      value={returnRefundMethod}
                      onChange={(e) => setReturnRefundMethod(e.target.value)}
                      className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="cash">Tiền mặt</option>
                      <option value="bank_transfer">Chuyển khoản</option>
                      <option value="store_credit">Ghi nợ</option>
                      <option value="none">Không hoàn</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-orange-700">
                    Số tiền hoàn (Mặc định: {fmtVND(String(calcAutoRefund()))})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={returnRefundAmount}
                    onChange={(e) => setReturnRefundAmount(e.target.value)}
                    placeholder={`Để trống sẽ tự tính: ${calcAutoRefund()}`}
                    className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-orange-700">Ghi chú</label>
                  <input
                    value={returnNote}
                    onChange={(e) => setReturnNote(e.target.value)}
                    placeholder="Tùy chọn"
                    className="w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowReturnForm(false)}
                    className="rounded-lg border border-orange-200 px-3 py-1.5 text-xs text-orange-700 hover:bg-orange-100"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => {
                      if (Object.keys(returnItems).length === 0) {
                        toast.error('Vui lòng chọn ít nhất 1 sản phẩm để trả')
                        return
                      }
                      setShowConfirmReturn(true)
                    }}
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                  >
                    Tạo phiếu trả hàng
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideOver>

      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => { 
          if (cancelTarget) {
            const finalReason = cancelReason === 'other' ? customCancelReason : cancelReason
            cancelMutation.mutate({ id: cancelTarget.order_id, reason: finalReason || 'Không rõ' })
          }
        }}
        title="Xác nhận hủy đơn hàng"
        description={`Khách hàng: ${cancelTarget?.customer_name || 'Khách lẻ'} - Tổng tiền: ${fmtVND(cancelTarget?.total_amount || '0')} \nBạn có chắc muốn hủy đơn hàng "${cancelTarget?.order_id}"? Việc này không thể hoàn tác. Hệ thống sẽ tự động tạo phiếu chi để hoàn lại dòng tiền tương ứng và khôi phục tồn kho.${
          parseFloat(cancelTarget?.debt_amount || '0') > 0 ? `\nĐồng thời xóa công nợ ${fmtVND(cancelTarget?.debt_amount || '0')} cho khách hàng này.` : ''
        }`}
        confirmLabel="Hủy đơn"
        variant="danger"
        loading={cancelMutation.isPending}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Lý do hủy</label>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            >
              <option value="Sai sót hệ thống">Sai sót hệ thống</option>
              <option value="Nhập nhầm đơn">Nhập nhầm đơn</option>
              <option value="Khách không nhận hàng">Khách không nhận hàng</option>
              <option value="Khách hủy trước khi giao">Khách hủy trước khi giao</option>
              <option value="other">Khác</option>
            </select>
          </div>
          {cancelReason === 'other' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Lý do khác</label>
              <input
                autoFocus
                type="text"
                value={customCancelReason}
                onChange={(e) => setCustomCancelReason(e.target.value)}
                placeholder="Nhập lý do hủy..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={showConfirmReturn}
        onClose={() => setShowConfirmReturn(false)}
        onConfirm={() => { if (selectedOrder) returnMutation.mutate(selectedOrder) }}
        title="Xác nhận tạo phiếu trả hàng"
        description={`Bạn chuẩn bị trả ${Object.values(returnItems).reduce((a, b) => a + b, 0)} sản phẩm. Số tiền hoàn dự kiến: ${fmtVND(returnRefundAmount !== '' ? returnRefundAmount : String(calcAutoRefund()))}. Hành động này sẽ ghi nhận hoàn tiền và thay đổi trạng thái đơn hàng. Bạn có chắc chắn?`}
        confirmLabel="Xác nhận trả hàng"
        variant="danger"
        loading={returnMutation.isPending}
      />
    </div>
  )
}

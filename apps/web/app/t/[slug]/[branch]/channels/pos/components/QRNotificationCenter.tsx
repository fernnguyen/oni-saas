'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser'
import { useNotificationCenter } from '@/app/components/notifications/NotificationContext'

interface QRNotificationCenterProps {
  shopId: string
  branchId: string
  onAcceptRequest?: () => void
  isGlobalDrawer?: boolean
}

interface OrderRequestItem {
  product_id: string
  product_name: string
  qty: number | string
  unit_price: number | string
  line_total: number | string
  variant_label?: string
  modifiers?: any
  modifier_total?: number | string
}

interface QROrderRequest {
  id: string
  tenant_id: string
  branch_id: string
  session_id: string
  resource_id: string
  items: OrderRequestItem[]
  status: 'pending' | 'accepted' | 'rejected'
  reject_reason?: string
  created_at: string
  updated_at: string
}

interface QROrderingSession {
  id: string
  tenant_id: string
  branch_id: string
  resource_id: string
  session_token: string
  status: 'pending' | 'active' | 'completed'
  active: 'TRUE' | 'FALSE'
  created_at: string
  updated_at: string
}

interface TableResource {
  resource_id: string
  id?: string
  name: string
}

export default function QRNotificationCenter({
  shopId,
  branchId,
  onAcceptRequest,
  isGlobalDrawer = false
}: QRNotificationCenterProps) {
  let context: any;
  try {
    context = useNotificationCenter();
  } catch {
    context = null;
  }

  const [requests, setRequests] = useState<QROrderRequest[]>([])
  const [sessionRequests, setSessionRequests] = useState<QROrderingSession[]>([])
  const [activeTab, setActiveTab] = useState<'sessions' | 'orders'>('sessions')
  const [tables, setTables] = useState<Record<string, string>>({})
  const [isOpen, setIsOpen] = useState(false)

  const drawerOpen = isGlobalDrawer && context ? context.isQRDrawerOpen : isOpen;
  const highlightId = isGlobalDrawer && context ? context.highlightQRId : null;

  const handleClose = () => {
    if (isGlobalDrawer && context) {
      context.closeQRDrawer()
    } else {
      setIsOpen(false)
    }
  }

  // Sync tab state from context if global
  useEffect(() => {
    if (isGlobalDrawer && context) {
      setActiveTab(context.activeQRTab);
    }
  }, [isGlobalDrawer, context?.activeQRTab]);

  // Scroll to highlighted item smoothly
  useEffect(() => {
    if (drawerOpen && highlightId) {
      const timer = setTimeout(() => {
        const id = activeTab === 'sessions' ? `qr-session-req-${highlightId}` : `qr-order-req-${highlightId}`;
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [drawerOpen, highlightId, activeTab]);

  const triggerSync = () => {
    if (typeof window !== 'undefined') {
      const bc = new BroadcastChannel('oni-pos-sync')
      bc.postMessage({ type: 'REFRESH_TABLE_MAP', shopId })
      bc.close()
    }
  };
  const [selectedRequest, setSelectedRequest] = useState<QROrderRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [excludedItemIds, setExcludedItemIds] = useState<Record<string, number[]>>({})

  const toggleItemExclusion = (reqId: string, idx: number) => {
    setExcludedItemIds((prev) => {
      const current = prev[reqId] || []
      const updated = current.includes(idx)
        ? current.filter((i) => i !== idx)
        : [...current, idx]
      return { ...prev, [reqId]: updated }
    })
  }
  const [isMuted, setIsMuted] = useState(false)

  // Initialize mute sound setting
  useEffect(() => {
    const muted = localStorage.getItem('pos_qr_mute_sound') === 'true'
    setIsMuted(muted)
  }, [])

  const toggleMute = () => {
    const newVal = !isMuted
    setIsMuted(newVal)
    localStorage.setItem('pos_qr_mute_sound', String(newVal))
    toast.success(newVal ? 'Đã tắt âm thanh thông báo QR' : 'Đã bật âm thanh thông báo QR')
  }

  // Synthesize Premium Ding-Dong Chime using Web Audio API (0% static asset dependency)
  const playChime = useCallback(() => {
    if (isMuted || isGlobalDrawer) return // Context will play chime globally
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return
      
      const ctx = new AudioContextClass()
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator()
        const gainNode = ctx.createGain()
        
        // Add subtle harmonic overlay for richer bell sound
        const oscHarmonic = ctx.createOscillator()
        const gainHarmonic = ctx.createGain()
        
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, startTime)
        
        oscHarmonic.type = 'triangle'
        oscHarmonic.frequency.setValueAtTime(freq * 1.5, startTime) // Perfect fifth harmonic
        
        gainNode.gain.setValueAtTime(0.25, startTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
        
        gainHarmonic.gain.setValueAtTime(0.08, startTime)
        gainHarmonic.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.7)
        
        osc.connect(gainNode)
        oscHarmonic.connect(gainHarmonic)
        
        gainNode.connect(ctx.destination)
        gainHarmonic.connect(ctx.destination)
        
        osc.start(startTime)
        oscHarmonic.start(startTime)
        
        osc.stop(startTime + duration)
        oscHarmonic.stop(startTime + duration)
      }

      // Ding (A5 - 880Hz)
      playTone(880, ctx.currentTime, 1.2)
      // Dong (E5 - 659.25Hz) after 0.28 seconds
      playTone(659.25, ctx.currentTime + 0.28, 1.5)
    } catch (err) {
      console.error('AudioContext synthesis failed:', err)
    }
  }, [isMuted])

  // Fetch initial pending requests and tables map
  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch pending requests
      const reqRes = await fetch(`/api/shops/${shopId}/qr-orders?status=pending`)
      let pendingRequests: QROrderRequest[] = []
      if (reqRes.ok) {
        const data = await reqRes.json()
        setRequests(data)
        pendingRequests = data
      }

      // 2. Fetch pending table sessions
      const sessRes = await fetch(`/api/shops/${shopId}/qr-sessions?status=pending`)
      let pendingSessions: QROrderingSession[] = []
      if (sessRes.ok) {
        const data = await sessRes.json()
        setSessionRequests(data)
        pendingSessions = data
      }

      // Auto-focus on active tab depending on counts
      if (pendingSessions.length > 0) {
        setActiveTab('sessions')
      } else if (pendingRequests.length > 0) {
        setActiveTab('orders')
      } else {
        setActiveTab('sessions')
      }

      // 3. Fetch tables to map ID to name
      const tabRes = await fetch(`/api/shops/${shopId}/location-resources?limit=200`)
      if (tabRes.ok) {
        const result = await tabRes.json()
        const tableMap: Record<string, string> = {}
        const rows = Array.isArray(result.data) ? result.data : []
        rows.forEach((r: TableResource) => {
          const id = r.resource_id || r.id || ''
          if (id) {
            tableMap[id] = r.name
          }
        })
        setTables(tableMap)
      }
    } catch (err) {
      console.error('Failed to fetch QR orders metadata:', err)
    }
  }, [shopId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const tablesRef = useRef(tables)
  useEffect(() => {
    tablesRef.current = tables
  }, [tables])

  const playChimeRef = useRef(playChime)
  useEffect(() => {
    playChimeRef.current = playChime
  }, [playChime])

  // Subscribe to Realtime notifications from Supabase (Silent listener, layout's NotificationContext handles chimes and toasts)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const channelName = `qr-orders-pos-${shopId}-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: 'pos' }
      }
    })

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_order_requests',
          filter: `branch_id=eq.${shopId}`
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload
          if (eventType === 'INSERT') {
            const newReq = newRecord as QROrderRequest
            if (newReq && newReq.status === 'pending') {
              setRequests((prev) => {
                if (prev.some((r) => r.id === newReq.id)) return prev
                return [newReq, ...prev]
              })
            }
          } else if (eventType === 'UPDATE') {
            const req = newRecord as QROrderRequest
            if (req) {
              if (req.status === 'pending') {
                setRequests((prev) => {
                  if (prev.some((r) => r.id === req.id)) return prev
                  return [req, ...prev]
                })
              } else {
                setRequests((prev) => prev.filter((r) => r.id !== req.id))
              }
            }
          } else if (eventType === 'DELETE') {
            const req = oldRecord as QROrderRequest
            if (req) {
              setRequests((prev) => prev.filter((r) => r.id !== req.id))
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qr_ordering_sessions',
          filter: `branch_id=eq.${shopId}`
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload
          if (eventType === 'INSERT') {
            const sess = newRecord as QROrderingSession
            if (sess && sess.status === 'pending' && sess.active === 'TRUE') {
              setSessionRequests((prev) => {
                if (prev.some((s) => s.id === sess.id)) return prev
                return [sess, ...prev]
              })
            }
          } else if (eventType === 'UPDATE') {
            const sess = newRecord as QROrderingSession
            if (sess) {
              if (sess.status === 'pending' && sess.active === 'TRUE') {
                setSessionRequests((prev) => {
                  if (prev.some((s) => s.id === sess.id)) return prev
                  return [sess, ...prev]
                })
              } else {
                setSessionRequests((prev) => prev.filter((s) => s.id !== sess.id))
              }
            }
          } else if (eventType === 'DELETE') {
            const sess = oldRecord as QROrderingSession
            if (sess) {
              setSessionRequests((prev) => prev.filter((s) => s.id !== sess.id))
            }
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [shopId])

  // Accept a QR order request
  const handleAccept = async (reqId: string) => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      const req = requests.find((r) => r.id === reqId)
      if (!req) return

      const excluded = excludedItemIds[reqId] || []
      const acceptedItems = req.items.filter((_, idx) => !excluded.includes(idx))

      if (acceptedItems.length === 0) {
        toast.error('Vui lòng chọn ít nhất 1 món để chấp nhận, hoặc nhấn "Từ chối" toàn bộ.')
        setIsProcessing(false)
        return
      }

      let rejectReasonForExcluded = ''
      if (excluded.length > 0) {
        const rejectedItemNames = req.items
          .filter((_, idx) => excluded.includes(idx))
          .map((item) => `${item.qty}x ${item.product_name}`)
          .join(', ')
        rejectReasonForExcluded = `Từ chối các món hết hàng: ${rejectedItemNames}`
      }

      const res = await fetch(`/api/shops/${shopId}/qr-orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: reqId,
          action: 'accept',
          items: acceptedItems,
          reject_reason: rejectReasonForExcluded || undefined
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Duyệt đơn thất bại')
      }

      toast.success(
        excluded.length > 0
          ? 'Đã chấp nhận các món được chọn và từ chối món còn lại!'
          : 'Đã chấp nhận đơn và gộp món thành công!'
      )
      setRequests((prev) => prev.filter((r) => r.id !== reqId))
      setSelectedRequest(null)
      triggerSync()
      
      // Reload map tables in parent component
      if (onAcceptRequest) {
        onAcceptRequest()
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi hệ thống khi duyệt đơn.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Reject a QR order request
  const handleReject = async () => {
    if (!selectedRequest || isProcessing) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/qr-orders`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: selectedRequest.id,
          action: 'reject',
          reject_reason: rejectReason || 'Không có lý do cụ thể'
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Từ chối đơn thất bại')
      }

      toast.success('Đã từ chối đơn hàng thành công.')
      setRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id))
      setSelectedRequest(null)
      setShowRejectModal(false)
      setRejectReason('')
      triggerSync()
    } catch (err: any) {
      toast.error(err.message || 'Lỗi hệ thống khi từ chối đơn.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Accept/Approve a QR Table Session request
  const handleApproveSession = async (sessionId: string) => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/qr-sessions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'approve'
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Duyệt mở bàn thất bại')
      }

      toast.success('Đã cho phép mở bàn ăn thành công!')
      setSessionRequests((prev) => prev.filter((s) => s.id !== sessionId))
      triggerSync()
      
      if (onAcceptRequest) {
        onAcceptRequest()
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi hệ thống khi duyệt mở bàn.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Reject a QR Table Session request
  const handleRejectSession = async (sessionId: string) => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/shops/${shopId}/qr-sessions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'reject'
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Từ chối mở bàn thất bại')
      }

      toast.success('Đã từ chối mở bàn thành công.')
      setSessionRequests((prev) => prev.filter((s) => s.id !== sessionId))
      triggerSync()
      
      if (onAcceptRequest) {
        onAcceptRequest()
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi hệ thống khi từ chối mở bàn.')
    } finally {
      setIsProcessing(false)
    }
  }

  const totalPending = requests.length + sessionRequests.length

  return (
    <div className={isGlobalDrawer ? "" : "relative inline-flex items-center"}>
      {/* Bell & Mute Trigger Buttons (Only when NOT global) */}
      {!isGlobalDrawer && (
        <>
          {/* Bell Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="relative p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-orange-500"
            title="Yêu cầu QR Chờ Duyệt"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className={`w-6 h-6 ${totalPending > 0 ? 'animate-[wiggle_1.5s_infinite] text-orange-500' : ''}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
              />
            </svg>

            {/* Counter Badge */}
            {totalPending > 0 && (
              <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-orange-600 rounded-full transform translate-x-1 -translate-y-1">
                {totalPending}
              </span>
            )}
          </button>

          {/* Mute Button */}
          <button
            onClick={toggleMute}
            className="p-2 ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-all focus:outline-none"
            title={isMuted ? 'Bật chuông báo' : 'Tắt chuông báo'}
          >
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            )}
          </button>
        </>
      )}

      {/* Main Drawer Overlay */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 animate-in fade-in duration-200"
            onClick={handleClose}
          />
          <div className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-transform animate-[slideIn_0.2s_ease-out]">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-orange-50 dark:bg-orange-950/20">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-orange-500 text-white rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                  </svg>
                </span>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">
                  Duyệt yêu cầu QR ({totalPending})
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Custom Tab Selector */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-1 gap-1">
              <button
                onClick={() => setActiveTab('sessions')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 ${
                  activeTab === 'sessions'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/50 dark:border-slate-700/50'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                }`}
              >
                Yêu cầu mở bàn
                {sessionRequests.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                    {sessionRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 ${
                  activeTab === 'orders'
                    ? 'bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 shadow-sm border border-slate-200/50 dark:border-slate-700/50'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                }`}
              >
                Yêu cầu gọi món
                {requests.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                    {requests.length}
                  </span>
                )}
              </button>
            </div>

            {/* List rendered by active tab */}
            {activeTab === 'sessions' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {sessionRequests.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto mb-3 opacity-60 text-slate-300">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                    </svg>
                    <p className="text-sm font-medium">Hiện không có yêu cầu mở bàn nào.</p>
                    <p className="text-xs text-slate-400 mt-1">Yêu cầu mở bàn ăn qua QR sẽ hiển thị tại đây.</p>
                  </div>
                ) : (
                  sessionRequests.map((sess) => {
                    const tableName = tables[sess.resource_id] || `Bàn ID: ${sess.resource_id.slice(-6)}`
                    const timeStr = new Date(sess.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    
                    return (
                      <div
                        key={sess.id}
                        id={`qr-session-req-${sess.id}`}
                        className={`border rounded-xl overflow-hidden p-4 transition-all ${
                          highlightId === sess.id
                            ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/10'
                            : 'border-slate-200 dark:border-slate-800 hover:border-orange-200 dark:hover:border-orange-900 bg-slate-50/50 dark:bg-slate-800/40'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="font-bold text-base text-slate-800 dark:text-slate-100">
                              {tableName}
                            </span>
                            <span className="block text-[11px] text-slate-400 mt-0.5">
                              Yêu cầu lúc: {timeStr}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 animate-pulse">
                            Chờ mở bàn
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 bg-slate-100 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
                          Khách vừa quét mã QR tại bàn và đang chờ bạn cấp phép mở bàn để bắt đầu gọi món.
                        </p>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handleRejectSession(sess.id)}
                            disabled={isProcessing}
                            className="flex-1 py-2 text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                          >
                            Từ chối
                          </button>
                          <button
                            onClick={() => handleApproveSession(sess.id)}
                            disabled={isProcessing}
                            className="flex-1 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5"
                          >
                            {isProcessing ? (
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                Cho phép mở bàn
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {requests.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto mb-3 opacity-60 text-slate-300">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.03 0 1.9.693 2.166 1.638m-7.377 12.408.062-4.006a22.453 22.453 0 0 1 6 .062L16 16.311m-6.022.046a2.25 2.25 0 0 0 2.277 2.235h3.49a2.25 2.25 0 0 0 2.277-2.235M9 12a2.25 2.25 0 0 0-2.25-2.25H4.5A2.25 2.25 0 0 0 2.25 12v3.75A2.25 2.25 0 0 0 4.5 18h2.25A2.25 2.25 0 0 0 9 15.75V12Z" />
                    </svg>
                    <p className="text-sm font-medium">Hiện không có yêu cầu gọi món nào.</p>
                    <p className="text-xs text-slate-400 mt-1">Đơn đặt từ QR sẽ tự động đồng bộ và kêu chuông tại đây.</p>
                  </div>
                ) : (
                  requests.map((req) => {
                    const tableName = tables[req.resource_id] || `Bàn ID: ${req.resource_id.slice(-6)}`
                    const timeStr = new Date(req.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                    
                    return (
                      <div
                        key={req.id}
                        id={`qr-order-req-${req.id}`}
                        className={`border rounded-xl overflow-hidden p-4 transition-all ${
                          highlightId === req.id
                            ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/10'
                            : 'border-slate-200 dark:border-slate-800 hover:border-orange-200 dark:hover:border-orange-900 bg-slate-50/50 dark:bg-slate-800/40'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="font-bold text-base text-slate-800 dark:text-slate-100">
                              {tableName}
                            </span>
                            <span className="block text-[11px] text-slate-400 mt-0.5">
                              Gửi lúc: {timeStr}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400">
                            Chờ duyệt
                          </span>
                        </div>

                        {/* Items List */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border-y border-slate-100 dark:border-slate-800 py-2 my-2">
                          {req.items.map((item, idx) => {
                            const isExcluded = (excludedItemIds[req.id] || []).includes(idx)
                            return (
                              <div key={idx} className={`py-2 flex items-start justify-between text-sm ${isExcluded ? 'bg-slate-50/20 opacity-60' : ''}`}>
                                <div className="flex items-start gap-2.5 flex-1 pr-2">
                                  {/* Custom Premium Checkbox (White checkmark on orange background, completely OS independent) */}
                                  <button
                                    type="button"
                                    onClick={() => toggleItemExclusion(req.id, idx)}
                                    disabled={isProcessing}
                                    className="mt-0.5 shrink-0 h-4.5 w-4.5 rounded border flex items-center justify-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500/25 select-none text-white"
                                    style={{
                                      backgroundColor: !isExcluded ? '#f97316' : 'transparent',
                                      borderColor: !isExcluded ? '#f97316' : '#cbd5e1',
                                    }}
                                  >
                                    {!isExcluded && (
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={4} stroke="white" className="w-3 h-3 text-white stroke-white" style={{ stroke: '#ffffff' }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" stroke="#ffffff" style={{ stroke: '#ffffff' }} />
                                      </svg>
                                    )}
                                  </button>

                                  <div className="flex-1">
                                    <div className="flex items-baseline gap-1.5">
                                      <span className={`font-semibold ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {item.qty}x
                                      </span>
                                      <span className={`font-medium ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {item.product_name}
                                      </span>
                                    </div>
                                    {/* Variant context */}
                                    {item.variant_label && (
                                      <span className={`block text-[11px] font-medium ml-0.5 mt-0.5 ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-400'}`}>
                                        Phân loại: {item.variant_label}
                                      </span>
                                    )}
                                    {/* Modifiers topping */}
                                    {item.modifiers && (() => {
                                      try {
                                        const parsed = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers
                                        if (Array.isArray(parsed) && parsed.length > 0) {
                                          return (
                                            <span className={`block text-[11px] font-medium ml-0.5 mt-0.5 ${isExcluded ? 'text-slate-400 line-through' : 'text-orange-500/80'}`}>
                                              + Toppings: {parsed.map((m: any) => m.option).join(', ')}
                                            </span>
                                          )
                                        }
                                      } catch {}
                                      return null
                                    })()}
                                  </div>
                                </div>
                                <span className={`font-semibold text-xs mt-0.5 ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-400'}`}>
                                  {Number(item.line_total).toLocaleString('vi-VN')}đ
                                </span>
                              </div>
                            )
                          })}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 mt-3 pt-1">
                          <button
                            onClick={() => {
                              setSelectedRequest(req)
                              setShowRejectModal(true)
                            }}
                            disabled={isProcessing}
                            className="flex-1 py-2 text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                          >
                            Từ chối
                          </button>
                          <button
                            onClick={() => handleAccept(req.id)}
                            disabled={isProcessing}
                            className="flex-1 py-2 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5"
                          >
                            {isProcessing ? (
                              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                                Chấp nhận
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 w-full max-w-[450px] shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
              Từ chối yêu cầu gọi món?
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Vui lòng nhập lý do từ chối để thông báo lại cho thực khách tại bàn.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ví dụ: Hết nguyên liệu, Quán chuẩn bị đóng cửa..."
              className="w-full min-h-[80px] p-2 border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-950 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 dark:text-slate-100"
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setSelectedRequest(null)
                  setRejectReason('')
                }}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-lg transition-all"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg shadow-sm transition-all"
              >
                {isProcessing ? 'Đang gửi...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Wiggle CSS Keyframes & SlideIn Animation */}
      <style jsx global>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(12deg); }
          30% { transform: rotate(-10deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(4deg); }
          90% { transform: rotate(-2deg); }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

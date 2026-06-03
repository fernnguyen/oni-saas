'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Stage, Layer, Rect, Circle, Text, Group, Line, Shape } from 'react-konva'

interface Resource {
  id: string
  name: string
  type: string
  status: string
  current_order_id?: string
  zone: string
  capacity: string
  hourly_rate: string
  sort_order: string
  metadata?: string
}

interface DecorationShape {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  shape: 'rect' | 'circle' | 'text'
  color: string
  icon?: string
  noLabel?: boolean
  rotation?: number
  textOrientation?: 'horizontal' | 'vertical'
}

interface OrderData {
  id: string
  order_no: string
  status: string
  customer_name: string
  customer_id: string
  total_amount: string
  paid_amount: string
  debt_amount: string
  metadata: string
  created_at: string
}

interface Props {
  shopId: string
  industryType: string
  resources: Resource[]
  selectedZone: string | null
  shopSettings: any
  inProgressOrders: OrderData[]
  onResourceClick: (resource: Resource) => void
  onRefresh?: () => void
  groupCheckoutMode?: boolean
  selectedResourceIds?: string[]
}

export default function MapViewer({
  shopId,
  industryType,
  resources,
  selectedZone,
  shopSettings,
  inProgressOrders,
  onResourceClick,
  onRefresh,
  groupCheckoutMode = false,
  selectedResourceIds = [],
}: Props) {
  const [decorations, setDecorations] = useState<DecorationShape[]>([])
  const [tableLayouts, setTableLayouts] = useState<Record<string, { x: number; y: number; w: number; h: number; shape: 'rect' | 'circle'; rotation?: number }>>({})
  const [boundary, setBoundary] = useState<{ shape: 'rect' | 'circle'; w: number; h: number }>({ shape: 'rect', w: 1200, h: 800 })
  
  // View controls
  const [scale, setScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [pulseOpacity, setPulseOpacity] = useState(0.4)
  const [, setTick] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const stageRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 1200, height: 800 })

  // Track container size dynamically
  useEffect(() => {
    if (!containerRef.current) return
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])
  
  const CANVAS_WIDTH = 1200
  const CANVAS_HEIGHT = 800
  const GRID_SIZE = 15

  // Filter resources by current zone
  const activeZoneResources = useMemo(() => {
    return resources.filter(r => r.status !== 'deleted' && (r.zone || 'Chưa phân vùng') === (selectedZone || 'Chưa phân vùng'))
  }, [resources, selectedZone])

  // Get resources in the current zone that are positioned
  const positionedTables = useMemo(() => {
    return activeZoneResources.filter(r => tableLayouts[r.id] !== undefined)
  }, [activeZoneResources, tableLayouts])

  // Map orders for fast lookup
  const ordersMap = useMemo(() => {
    const map = new Map<string, OrderData>()
    for (const order of inProgressOrders) {
      map.set(order.id, order)
      // Also index by resource_id inside metadata if present
      try {
        const meta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {})
        if (meta.resource_id) {
          map.set(`res-${meta.resource_id}`, order)
        }
      } catch {}
    }
    return map
  }, [inProgressOrders])

  // Load layouts from resources metadata and settings
  useEffect(() => {
    // 1. Load table layouts
    const layouts: Record<string, { x: number; y: number; w: number; h: number; shape: 'rect' | 'circle' }> = {}
    activeZoneResources.forEach(r => {
      try {
        const meta = r.metadata ? JSON.parse(r.metadata) : {}
        if (meta.layout) {
          layouts[r.id] = meta.layout
        }
      } catch (e) {
        console.error('Error parsing metadata for', r.name, e)
      }
    })
    setTableLayouts(layouts)

    // 2. Load static decorations and boundary for this zone from settings
    if (shopSettings?.resource_sub_types) {
      try {
        const parsed = typeof shopSettings.resource_sub_types === 'string' 
          ? JSON.parse(shopSettings.resource_sub_types) 
          : shopSettings.resource_sub_types
          
        const zoneKey = selectedZone || 'Chưa phân vùng'
        if (parsed.layouts && parsed.layouts[zoneKey]) {
          setDecorations(parsed.layouts[zoneKey])
        } else {
          setDecorations([])
        }

        if (parsed.boundaries && parsed.boundaries[zoneKey]) {
          setBoundary(parsed.boundaries[zoneKey])
        } else {
          setBoundary({ shape: 'rect', w: 1200, h: 800 })
        }
      } catch (e) {
        console.error('Error parsing layouts from settings', e)
        setDecorations([])
        setBoundary({ shape: 'rect', w: 1200, h: 800 })
      }
    } else {
      setDecorations([])
      setBoundary({ shape: 'rect', w: 1200, h: 800 })
    }
  }, [resources, selectedZone, shopSettings, activeZoneResources])

  // Real-time ticking for active timers & pulsing animations
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1)
    }, 10000) // update timers every 10s

    // Pulse effect animation loop for occupied tables
    let direction = -1
    const pulseTimer = setInterval(() => {
      setPulseOpacity(prev => {
        if (prev <= 0.25) direction = 1
        if (prev >= 0.75) direction = -1
        return prev + direction * 0.05
      })
    }, 100)

    return () => {
      clearInterval(timer)
      clearInterval(pulseTimer)
    }
  }, [])

  // Auto-center canvas on load or size changes (Xem toàn cảnh / Fit by default)
  useEffect(() => {
    if (containerRef.current) {
      const width = containerRef.current.clientWidth || 1200
      const height = containerRef.current.clientHeight || 800
      const targetScale = Math.min(width / boundary.w, height / boundary.h)
      setScale(targetScale)
      setStagePos({
        x: (width - boundary.w * targetScale) / 2,
        y: (height - boundary.h * targetScale) / 2
      })
    }
  }, [selectedZone, boundary, containerSize])

  // Zoom control
  const handleZoom = (type: 'in' | 'out' | 'reset' | 'fit') => {
    if (type === 'in') setScale(prev => Math.min(2.5, prev + 0.15))
    else if (type === 'out') setScale(prev => Math.max(0.3, prev - 0.15))
    else if (type === 'reset') {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth || 1200
        const height = containerRef.current.clientHeight || 800
        setScale(1)
        setStagePos({
          x: (width - boundary.w) / 2,
          y: (height - boundary.h) / 2
        })
      } else {
        setScale(1)
        setStagePos({ x: 0, y: 0 })
      }
    } else if (type === 'fit') {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth || 1200
        const height = containerRef.current.clientHeight || 800
        const targetScale = Math.min(width / boundary.w, height / boundary.h)
        setScale(targetScale)
        setStagePos({
          x: (width - boundary.w * targetScale) / 2,
          y: (height - boundary.h * targetScale) / 2
        })
      }
    }
  }

  const handleRefreshClick = () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    if (onRefresh) onRefresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }

  // Premium Zoom towards pointer on mouse wheel scroll
  const handleWheel = (e: any) => {
    e.evt.preventDefault()
    
    const stage = stageRef.current
    if (!stage) return

    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    // Calculate pointer relative to stage content
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }

    // Zoom speed factor
    const zoomFactor = 1.12
    let newScale = e.evt.deltaY < 0 ? oldScale * zoomFactor : oldScale / zoomFactor

    // Clamp zoom level between 0.3x and 2.5x
    newScale = Math.max(0.3, Math.min(2.5, newScale))

    setScale(newScale)

    // Set new stage coordinates to center on cursor
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }
    setStagePos(newPos)
  }
  // Grid background lines
  const gridLines = useMemo(() => {
    const lines = []
    for (let i = 0; i <= boundary.w; i += GRID_SIZE * 2) {
      lines.push(<Line key={`v-${i}`} points={[i, 0, i, boundary.h]} stroke="#cbd5e1" strokeWidth={0.5} opacity={0.4} />)
    }
    for (let j = 0; j <= boundary.h; j += GRID_SIZE * 2) {
      lines.push(<Line key={`h-${j}`} points={[0, j, boundary.w, j]} stroke="#cbd5e1" strokeWidth={0.5} opacity={0.4} />)
    }
    return lines
  }, [boundary])

  // Helper to format VND amount
  const fmtVND = (v: number | string | null | undefined) => {
    return Number(v ?? 0).toLocaleString('vi-VN') + 'đ'
  }

  // Helper to format duration from order start time
  const getElapsedDuration = (order: OrderData) => {
    let checkInDate = new Date(order.created_at)
    try {
      const orderMeta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {})
      if (orderMeta.check_in) {
        checkInDate = new Date(orderMeta.check_in)
      } else if (orderMeta.check_in_time) {
        const [hh, mm] = orderMeta.check_in_time.split(':').map(Number)
        checkInDate.setHours(hh, mm, 0, 0)
      }
    } catch {}

    const diff = Math.floor((Date.now() - checkInDate.getTime()) / 1000)
    if (diff <= 0) return '0p'
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}h ${m}p` : `${m}p`
  }

  // Get active guest count (pax) from order
  const getPaxCount = (order: OrderData) => {
    try {
      const orderMeta = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : (order.metadata || {})
      if (orderMeta.num_guests) return orderMeta.num_guests
      if (orderMeta.guests && Array.isArray(orderMeta.guests)) return orderMeta.guests.length
    } catch {}
    return null
  }

  // Status-specific card design system tokens
  const STATUS_THEME: Record<string, {
    bg: string
    stroke: string
    cardBorder: string
    glowColor: string
    pillStroke: string
    pillText: string
    label: string
    pillBg: string
    gradientColors?: [string, string]
  }> = {
    available: { bg: '#ffffff', stroke: '#10b981', cardBorder: '#e2e8f0', glowColor: '#10b981', pillStroke: '#a7f3d0', pillText: '#15803d', label: 'Trống', pillBg: '#f0fdf4', gradientColors: ['#4ade80', '#10b981'] },
    occupied: { bg: '#fff5f5', stroke: '#f43f5e', cardBorder: '#ffe4e6', glowColor: '#f43f5e', pillStroke: '#fecdd3', pillText: '#be123c', label: 'Đang sử dụng', pillBg: '#fff1f2', gradientColors: ['#f87171', '#f43f5e'] },
    cleaning: { bg: '#fffbeb', stroke: '#d97706', cardBorder: '#fef3c7', glowColor: '#d97706', pillStroke: '#fde68a', pillText: '#b45309', label: 'Dọn dẹp', pillBg: '#fffbeb', gradientColors: ['#fbbf24', '#d97706'] },
    reserved: { bg: '#f0f9ff', stroke: '#3b82f6', cardBorder: '#e0f2fe', glowColor: '#3b82f6', pillStroke: '#bfdbfe', pillText: '#1d4ed8', label: 'Đã đặt', pillBg: '#f0f9ff', gradientColors: ['#60a5fa', '#3b82f6'] },
    maintenance: { bg: '#f8fafc', stroke: '#64748b', cardBorder: '#e2e8f0', glowColor: '#64748b', pillStroke: '#cbd5e1', pillText: '#475569', label: 'Tạm ngừng', pillBg: '#f8fafc', gradientColors: ['#94a3b8', '#64748b'] },
  }

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-3xl overflow-hidden relative shadow-sm shadow-slate-100 h-full w-full min-h-[350px]">
      
      {/* Visual Canvas Toolbar Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 bg-slate-50/80 border-b border-slate-200 px-4 sm:px-6 py-2.5 sm:py-3 select-none w-full shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs font-bold text-slate-700 hidden sm:inline-block">
            <span>Sơ đồ trực quan:</span>{' '}
            <span className="text-primary">{selectedZone || 'Chưa phân vùng'}</span>
          </p>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <span className="text-[10px] text-slate-450 font-semibold hidden md:inline">Nhấn kéo bản đồ để di chuyển • Nhấp bàn để thao tác</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Scale controls */}
          <div className="flex items-center rounded-lg bg-white border border-slate-200 p-0.5 shadow-sm">
            <button onClick={() => handleZoom('out')} className="rounded px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs text-slate-500 hover:text-slate-850 hover:bg-slate-100 transition-colors font-extrabold cursor-pointer">-</button>
            <span className="px-0.5 sm:px-1 text-[9px] sm:text-[10px] font-extrabold text-slate-700 w-9 sm:w-11 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => handleZoom('in')} className="rounded px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs text-slate-500 hover:text-slate-850 hover:bg-slate-100 transition-colors font-extrabold cursor-pointer">+</button>
          </div>
          <button 
            onClick={() => handleZoom('fit')} 
            className="rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-850 text-slate-650 px-2 sm:px-3 py-1.5 text-[11px] font-bold active:scale-95 transition-all cursor-pointer shadow-sm"
            title="Co giãn vừa màn hình"
          >
            <span className="sm:inline hidden">Xem toàn cảnh</span>
            <span className="sm:hidden inline">Toàn cảnh</span>
          </button>
          <button 
            onClick={() => handleZoom('reset')} 
            className="rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-850 text-slate-650 px-2 sm:px-3 py-1.5 text-[11px] font-bold active:scale-95 transition-all cursor-pointer shadow-sm"
            title="Đặt lại zoom 100%"
          >
            100%
          </button>

          {onRefresh && (
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="rounded-lg bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-850 text-slate-650 p-1.5 active:scale-95 transition-all cursor-pointer shadow-sm disabled:opacity-60 flex items-center justify-center"
              title="Lấy dữ liệu mới nhất"
            >
              <svg 
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-primary' : 'text-slate-500'}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Blueprint Interactive Stage */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative w-full h-full">
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
          draggable
          onDragEnd={(e) => {
            // Update stage position on drag
            if (e.target === stageRef.current) {
              setStagePos({ x: e.target.x(), y: e.target.y() })
            }
          }}
          onWheel={handleWheel}
          className="cursor-grab active:cursor-grabbing w-full h-full"
        >
          {/* Background grid layer */}
          <Layer>
            {boundary.shape === 'circle' ? (
              <>
                <Circle
                  x={boundary.w / 2}
                  y={boundary.h / 2}
                  radius={boundary.w / 2}
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
                <Group clipFunc={(ctx) => {
                  ctx.arc(boundary.w / 2, boundary.h / 2, boundary.w / 2, 0, Math.PI * 2, false)
                }}>
                  <Rect width={boundary.w} height={boundary.h} fill="#ffffff" />
                  {gridLines}
                </Group>
              </>
            ) : (
              <>
                <Rect width={boundary.w} height={boundary.h} fill="#ffffff" />
                {gridLines}
                <Rect width={boundary.w} height={boundary.h} stroke="#cbd5e1" strokeWidth={1} />
              </>
            )}
          </Layer>

          {/* Shapes layer */}
          <Layer>
            {/* 1. Static decoration shapes */}
            {decorations.map(dec => {
              return (
                <Group
                  key={dec.id}
                  x={dec.x}
                  y={dec.y}
                  width={dec.w}
                  height={dec.h}
                  rotation={dec.rotation || 0}
                >
                  {dec.shape === 'circle' ? (
                    <Circle
                      x={dec.w / 2}
                      y={dec.h / 2}
                      radius={dec.w / 2}
                      fill={dec.color}
                      stroke="#cbd5e1"
                      strokeWidth={1}
                      opacity={0.65}
                    />
                  ) : dec.shape === 'text' ? (
                    null
                  ) : (
                    <Rect
                      width={dec.w}
                      height={dec.h}
                      cornerRadius={6}
                      fill={dec.color}
                      stroke="#cbd5e1"
                      strokeWidth={1}
                      opacity={0.65}
                    />
                  )}
                  
                  {!dec.noLabel && dec.name && (
                    dec.textOrientation === 'vertical' ? (
                      <Text
                        text={dec.name}
                        x={dec.w / 2}
                        y={dec.h / 2}
                        width={dec.h}
                        height={dec.w}
                        offsetX={dec.h / 2}
                        offsetY={dec.w / 2}
                        rotation={90 - (dec.rotation || 0)}
                        align="center"
                        verticalAlign="middle"
                        fontSize={dec.shape === 'text' ? 13 : 11}
                        fontStyle="bold"
                        fill={dec.shape === 'text' ? (dec.color || '#334155') : '#475569'}
                        ellipsis={dec.shape !== 'text'}
                      />
                    ) : (
                      <Text
                        text={dec.name}
                        x={dec.w / 2}
                        y={dec.h / 2}
                        width={dec.w}
                        height={dec.h}
                        offsetX={dec.w / 2}
                        offsetY={dec.h / 2}
                        rotation={-(dec.rotation || 0)}
                        align="center"
                        verticalAlign="middle"
                        fontSize={dec.shape === 'text' ? 13 : 11}
                        fontStyle="bold"
                        fill={dec.shape === 'text' ? (dec.color || '#334155') : '#475569'}
                        ellipsis={dec.shape !== 'text'}
                      />
                    )
                  )}
                </Group>
              )
            })}

            {/* 2. Physical active tables */}
            {positionedTables.map(r => {
              const layout = tableLayouts[r.id]
              if (!layout) return null
              
              const isOccupied = r.status === 'occupied'
              const theme = STATUS_THEME[r.status] || STATUS_THEME.available
              const isRoom = r.type === 'room'
              
              // Get live order details if occupied
              const activeOrder = isOccupied 
                ? (ordersMap.get(r.current_order_id || '') || ordersMap.get(`res-${r.id}`)) 
                : null
                
              const elapsedStr = activeOrder ? getElapsedDuration(activeOrder) : null
              const paxCount = activeOrder ? getPaxCount(activeOrder) : null
              const orderTotal = activeOrder ? Number(activeOrder.total_amount) : 0

              const isSelected = selectedResourceIds.includes(r.id)

              return (
                <Group
                  key={r.id}
                  x={layout.x}
                  y={layout.y}
                  width={layout.w}
                  height={layout.h}
                  rotation={layout.rotation || 0}
                  onClick={(e) => {
                    // Prevent trigger when dragging Stage
                    if (e.target.getStage()?.isDragging()) return
                    onResourceClick(r)
                  }}
                  onTap={(e) => {
                    onResourceClick(r)
                  }}
                  className="cursor-pointer"
                  opacity={groupCheckoutMode && !isOccupied ? 0.45 : 1}
                >
                  {/* Glowing light shadow */}
                  {layout.shape === 'circle' ? (
                    <>
                      {/* Background Fill (Linear Gradient Outer Ring) */}
                      <Circle
                        x={layout.w / 2}
                        y={layout.h / 2}
                        radius={Math.min(layout.w, layout.h) / 2}
                        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                        fillLinearGradientEndPoint={{ x: 0, y: layout.h }}
                        fillLinearGradientColorStops={
                          theme.gradientColors
                            ? [0, theme.gradientColors[0], 1, theme.gradientColors[1]]
                            : [0, theme.stroke, 1, theme.stroke]
                        }
                      />
                      {/* Inner White Circle to mask and create gradient border */}
                      <Circle
                        x={layout.w / 2}
                        y={layout.h / 2}
                        radius={Math.min(layout.w, layout.h) / 2 - 5}
                        fill="#ffffff"
                      />
                      {/* Sibling 2: Thin Outer Border */}
                      <Circle
                        x={layout.w / 2}
                        y={layout.h / 2}
                        radius={Math.min(layout.w, layout.h) / 2}
                        stroke={isSelected ? '#4f46e5' : (theme.cardBorder || '#e2e8f0')}
                        strokeWidth={isSelected ? 3 : 1}
                        shadowColor={isSelected ? '#4f46e5' : theme.glowColor}
                        shadowBlur={isSelected ? 14 : (isOccupied ? 12 + pulseOpacity * 6 : 4)}
                        shadowOpacity={isSelected ? 0.6 : (isOccupied ? pulseOpacity * 0.35 : 0.08)}
                      />
                      {groupCheckoutMode && isOccupied && (
                        <Group x={layout.w / 2 + (Math.min(layout.w, layout.h) / 2) * 0.7 - 8} y={layout.h / 2 - (Math.min(layout.w, layout.h) / 2) * 0.7 - 8}>
                          <Rect
                            width={16}
                            height={16}
                            cornerRadius={4}
                            fill={isSelected ? '#4f46e5' : '#ffffff'}
                            stroke={isSelected ? '#4f46e5' : '#cbd5e1'}
                            strokeWidth={1.5}
                          />
                          {isSelected && (
                            <Text
                              text="✓"
                              x={3.5}
                              y={2.5}
                              fontSize={11}
                              fontStyle="bold"
                              fill="#ffffff"
                            />
                          )}
                        </Group>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Card Shadow and White Background (drawn first) */}
                      <Rect
                        width={layout.w}
                        height={layout.h}
                        cornerRadius={16}
                        fill="#ffffff"
                        shadowColor={isSelected ? '#4f46e5' : theme.glowColor}
                        shadowBlur={isSelected ? 14 : (isOccupied ? 12 + pulseOpacity * 6 : 4)}
                        shadowOpacity={isSelected ? 0.6 : (isOccupied ? pulseOpacity * 0.35 : 0.08)}
                      />

                      {/* Clipped Group for beautiful rounded card with top status stripe */}
                      <Group
                        clipFunc={(ctx) => {
                          const inset = 1
                          const r = 16 - inset
                          const w = layout.w - inset * 2
                          const h = layout.h - inset * 2
                          ctx.beginPath()
                          ctx.moveTo(inset + r, inset)
                          ctx.arcTo(inset + w, inset, inset + w, inset + h, r)
                          ctx.arcTo(inset + w, inset + h, inset, inset + h, r)
                          ctx.arcTo(inset, inset + h, inset, inset, r)
                          ctx.arcTo(inset, inset, inset + w, inset, r)
                          ctx.closePath()
                        }}
                      >
                        {/* Background color of the card */}
                        <Rect
                          width={layout.w}
                          height={layout.h}
                          fill={theme.bg}
                        />
                        {/* Top accent status color bar */}
                        <Rect
                          width={layout.w}
                          height={6}
                          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                          fillLinearGradientEndPoint={{ x: layout.w, y: 0 }}
                          fillLinearGradientColorStops={
                            theme.gradientColors
                              ? [0, theme.gradientColors[0], 1, theme.gradientColors[1]]
                              : [0, theme.stroke, 1, theme.stroke]
                          }
                        />
                      </Group>

                      {/* Sibling 2: Thin Outer Border for premium smooth corners */}
                      <Rect
                        width={layout.w}
                        height={layout.h}
                        cornerRadius={16}
                        stroke={isSelected ? '#4f46e5' : (theme.cardBorder || '#e2e8f0')}
                        strokeWidth={isSelected ? 3 : 1}
                      />

                      {/* Checkbox for rect */}
                      {groupCheckoutMode && isOccupied && (
                        <Group x={layout.w - 24} y={8}>
                          <Rect
                            width={16}
                            height={16}
                            cornerRadius={4}
                            fill={isSelected ? '#4f46e5' : '#ffffff'}
                            stroke={isSelected ? '#4f46e5' : '#cbd5e1'}
                            strokeWidth={1.5}
                          />
                          {isSelected && (
                            <Text
                              text="✓"
                              x={3.5}
                              y={2.5}
                              fontSize={11}
                              fontStyle="bold"
                              fill="#ffffff"
                            />
                          )}
                        </Group>
                      )}
                    </>
                  )}

                  {/* Name and Icon (Centered) */}
                  <Text
                    text={r.name}
                    x={0}
                    y={layout.shape === 'circle' ? 26 : 14}
                    width={layout.w}
                    align="center"
                    fontSize={11.5}
                    fontStyle="bold"
                    fill="#1e293b"
                    ellipsis={true}
                  />

                  {/* Capacity label (static default or active customer name) */}
                  {isOccupied ? (
                    <Text
                      text={activeOrder?.customer_name || 'Khách lẻ'}
                      x={10}
                      y={layout.h / 2 - 12}
                      width={layout.w - 20}
                      align="center"
                      fontSize={10.5}
                      fontStyle="bold"
                      fill="#334155"
                      ellipsis={true}
                    />
                  ) : r.capacity ? (
                    <Text
                      text={`👥 Sức chứa: ${r.capacity}`}
                      x={10}
                      y={layout.h / 2 - 12}
                      width={layout.w - 20}
                      align="center"
                      fontSize={9}
                      fill="#64748b"
                    />
                  ) : null}

                  {/* Active occupied order total amount */}
                  {isOccupied && orderTotal > 0 && (
                    <Text
                      text={fmtVND(orderTotal)}
                      x={10}
                      y={layout.h / 2 + 3}
                      width={layout.w - 20}
                      align="center"
                      fontSize={10}
                      fontStyle="bold"
                      fill="#e11d48"
                    />
                  )}

                  {/* Status Indicator Pill / Elapsed Time Timer (Compact & Centered) */}
                  {(() => {
                    const statusText = isOccupied && elapsedStr ? elapsedStr : theme.label;
                    const pillWidth = Math.min(layout.w - 24, statusText.length * 6 + 14);
                    return (
                      <Group x={layout.w / 2 - pillWidth / 2} y={layout.h - 26}>
                        <Rect
                          width={pillWidth}
                          height={18}
                          cornerRadius={9}
                          fill={theme.pillBg}
                        />
                        <Text
                          text={statusText}
                          x={0}
                          y={3.5}
                          width={pillWidth}
                          align="center"
                          fontSize={9}
                          fontStyle="bold"
                          fill={theme.pillText}
                        />
                      </Group>
                    );
                  })()}
                </Group>
              )
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  )
}

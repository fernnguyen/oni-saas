'use client'

import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { Stage, Layer, Rect, Circle, Text, Group, Line, Transformer, Shape } from 'react-konva'
import { toast } from 'sonner'
import { getVerticalConfig } from '@oni/core'
import { ResourceIcon } from '@/app/components/layout/IndustryIcon'

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

interface Props {
  shopId: string
  industryType: string
  resources: Resource[]
  selectedZone: string | null
  onSaveSuccess: () => void
  shopSettings: any
  onSaveSettings: (updatedSubTypes: any) => Promise<void>
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

const PRESET_COLORS = [
  { name: 'Xanh Lam', hex: '#3b82f6' },
  { name: 'Xanh Lá', hex: '#10b981' },
  { name: 'Vàng Amber', hex: '#f59e0b' },
  { name: 'Đỏ Rose', hex: '#f43f5e' },
  { name: 'Xám Ghi', hex: '#64748b' },
  { name: 'Xanh Ngọc', hex: '#14b8a6' },
  { name: 'Tối Trầm', hex: '#1e293b' },
]

const DECORATION_PRESETS = [
  { name: 'Khối vuông / Chữ nhật', shape: 'rect' as const, w: 120, h: 90, color: '#cbd5e1' },
  { name: 'Khối tròn / Oval', shape: 'circle' as const, w: 95, h: 95, color: '#cbd5e1' },
  { name: 'Nhãn chữ (Label)', shape: 'text' as const, w: 120, h: 30, color: '#334155' },
]

export default function MapEditor({
  shopId,
  industryType,
  resources,
  selectedZone,
  onSaveSuccess,
  shopSettings,
  onSaveSettings,
}: Props) {
  const vertical = useMemo(() => getVerticalConfig(industryType), [industryType])
  const tpl = vertical.resourceTemplate

  const [decorations, setDecorations] = useState<DecorationShape[]>([])
  const [tableLayouts, setTableLayouts] = useState<Record<string, { x: number; y: number; w: number; h: number; shape: 'rect' | 'circle'; rotation?: number }>>({})
  const [boundary, setBoundary] = useState<{ shape: 'rect' | 'circle'; w: number; h: number }>({ shape: 'rect', w: 900, h: 600 })
  
  const [selectedId, setSelectedId] = useState<string | null>('boundary')
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [scale, setScale] = useState(1)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  
  const [stagePos, setStagePos] = useState({ x: 40, y: 40 })
  const [containerSize, setContainerSize] = useState({ width: 900, height: 600 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Table Zone switching states & helper functions
  const [moveZoneValue, setMoveZoneValue] = useState('')
  const [isMoveZoneNew, setIsMoveZoneNew] = useState(false)

  const allZonesList = useMemo(() => {
    const set = new Set<string>()
    if (shopSettings?.resource_sub_types) {
      try {
        const parsed = typeof shopSettings.resource_sub_types === 'string'
          ? JSON.parse(shopSettings.resource_sub_types)
          : shopSettings.resource_sub_types
        const order = parsed[`${industryType}_zone_order`] || []
        order.forEach((z: string) => {
          if (z && z !== 'Chưa phân vùng') set.add(z)
        })
      } catch {}
    }
    resources.filter(r => r.status !== 'deleted').forEach(r => {
      if (r.zone && r.zone !== 'Chưa phân vùng') set.add(r.zone)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'))
  }, [resources, shopSettings, industryType])

  useEffect(() => {
    if (selectedId && !selectedId.startsWith('dec_') && selectedId !== 'boundary') {
      const res = resources.find(r => r.id === selectedId)
      if (res) {
        setMoveZoneValue(res.zone || '')
        setIsMoveZoneNew(false)
      }
    }
  }, [selectedId, resources])

  const handleMoveTableToZone = async (newZone: string) => {
    if (!selectedId || selectedId.startsWith('dec_') || selectedId === 'boundary') return
    const resItem = resources.find(r => r.id === selectedId)
    if (!resItem) return

    const trimmedNewZone = newZone.trim()
    const currentZone = resItem.zone || ''
    
    if (trimmedNewZone === currentZone) {
      toast.error('Bàn đã thuộc khu vực này rồi')
      return
    }

    try {
      setSaving(true)
      
      const currentMeta = resItem.metadata ? JSON.parse(resItem.metadata) : {}
      const { layout: _, ...rest } = currentMeta

      const response = await fetch(`/api/shops/${shopId}/location-resources/${resItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone: trimmedNewZone,
          metadata: JSON.stringify(rest)
        }),
      })

      if (!response.ok) throw new Error()
      
      toast.success(`Đã di chuyển bàn "${resItem.name}" sang khu vực "${trimmedNewZone || 'Chưa phân vùng'}" thành công!`)
      setSelectedId('boundary')
      onSaveSuccess()
    } catch {
      toast.error('Lỗi khi chuyển khu vực cho bàn')
    } finally {
      setSaving(false)
    }
  }

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

  // Auto-center canvas on zone change, boundary change, or container size changes
  useEffect(() => {
    if (containerRef.current) {
      const width = containerRef.current.clientWidth || 900
      const height = containerRef.current.clientHeight || 600
      const targetScale = Math.min((width - 80) / boundary.w, (height - 80) / boundary.h, 1)
      setScale(targetScale)
      setStagePos({
        x: (width - boundary.w * targetScale) / 2,
        y: (height - boundary.h * targetScale) / 2
      })
    }
  }, [selectedZone, boundary, containerSize])
  
  const stageRef = useRef<any>(null)
  const trRef = useRef<any>(null)
  // Listen to Delete/Backspace key to quickly delete selected item
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return
      
      // If typing in input field, don't trigger deletion!
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId === 'boundary') return
        e.preventDefault()
        if (selectedId.startsWith('dec_')) {
          handleDeleteDecoration(selectedId)
        } else {
          handleRemoveTable(selectedId)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, decorations])
  
  const CANVAS_WIDTH = 1200
  const CANVAS_HEIGHT = 800
  const GRID_SIZE = 15

  // Filter resources by current zone
  const activeZoneResources = useMemo(() => {
    return resources.filter(r => r.status !== 'deleted' && (r.zone || 'Chưa phân vùng') === (selectedZone || 'Chưa phân vùng'))
  }, [resources, selectedZone])

  // Get resources in the current zone that are ALREADY positioned
  const positionedTables = useMemo(() => {
    return activeZoneResources.filter(r => tableLayouts[r.id] !== undefined)
  }, [activeZoneResources, tableLayouts])

  // Get resources in the current zone that are NOT YET positioned
  const unpositionedTables = useMemo(() => {
    return activeZoneResources.filter(r => tableLayouts[r.id] === undefined)
  }, [activeZoneResources, tableLayouts])

  // Load existing layouts from resources metadata and settings
  useEffect(() => {
    // 1. Load active table layouts
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

    // 2. Load static decorations for this zone from settings
    if (shopSettings?.resource_sub_types) {
      try {
        const parsed = JSON.parse(shopSettings.resource_sub_types)
        const zoneKey = selectedZone || 'Chưa phân vùng'
        if (parsed.layouts && parsed.layouts[zoneKey]) {
          setDecorations(parsed.layouts[zoneKey])
        } else {
          setDecorations([])
        }

        if (parsed.boundaries && parsed.boundaries[zoneKey]) {
          setBoundary(parsed.boundaries[zoneKey])
        } else {
          setBoundary({ shape: 'rect', w: 900, h: 600 })
        }
      } catch (e) {
        console.error('Error parsing layouts from settings', e)
        setDecorations([])
        setBoundary({ shape: 'rect', w: 900, h: 600 })
      }
    } else {
      setDecorations([])
      setBoundary({ shape: 'rect', w: 900, h: 600 })
    }
    
    setSelectedId('boundary')
  }, [resources, selectedZone, shopSettings, activeZoneResources])

  // Transformer selection sync
  useEffect(() => {
    if (previewMode) {
      setSelectedId(null)
      return
    }

    if (trRef.current) {
      if (selectedId) {
        const selectedNode = stageRef.current.findOne('#' + selectedId)
        if (selectedNode) {
          trRef.current.nodes([selectedNode])
          trRef.current.getLayer().batchDraw()
          return
        }
      }
      trRef.current.nodes([])
      trRef.current.getLayer().batchDraw()
    }
  }, [selectedId, previewMode])

  // Grid background line computations
  const gridLines = useMemo(() => {
    const lines = []
    const MAX_W = 3000
    const MAX_H = 3000
    for (let i = 0; i <= MAX_W; i += GRID_SIZE * 2) {
      lines.push(<Line key={`v-${i}`} points={[i, 0, i, MAX_H]} stroke="#cbd5e1" strokeWidth={0.5} opacity={0.4} />)
    }
    for (let j = 0; j <= MAX_H; j += GRID_SIZE * 2) {
      lines.push(<Line key={`h-${j}`} points={[0, j, MAX_W, j]} stroke="#cbd5e1" strokeWidth={0.5} opacity={0.4} />)
    }
    return lines
  }, [])

  // Helper to handle snapping
  const snap = (val: number) => {
    if (!snapToGrid) return val
    return Math.round(val / GRID_SIZE) * GRID_SIZE
  }

  // Add an unpositioned table to the center of the canvas
  const handleAddTable = (resource: Resource) => {
    setTableLayouts(prev => ({
      ...prev,
      [resource.id]: {
        x: snap(boundary.w / 2 - 60),
        y: snap(boundary.h / 2 - 45),
        w: resource.type === 'room' ? 150 : 120,
        h: resource.type === 'room' ? 120 : 90,
        shape: resource.type === 'court' ? 'rect' : 'rect', // Fallback defaults
      }
    }))
    setSelectedId(resource.id)
    toast.success(`Đã xếp vị trí cho ${resource.name}`)
  }

  // Unlink a table to return it to the side panel
  const handleRemoveTable = (tableId: string) => {
    const updated = { ...tableLayouts }
    delete updated[tableId]
    setTableLayouts(updated)
    if (selectedId === tableId) setSelectedId('boundary')
    toast.success(`Đã đưa ${(tpl?.label || 'bàn').toLowerCase()} về trạng thái chưa phân tọa độ`)
  }

  // Create a new static decoration shape
  const handleAddDecoration = (preset: typeof DECORATION_PRESETS[0]) => {
    const newDec: DecorationShape = {
      id: `dec_${Date.now()}`,
      name: '', // Start with empty label!
      x: snap(boundary.w / 2 - preset.w / 2),
      y: snap(boundary.h / 2 - preset.h / 2),
      w: preset.w,
      h: preset.h,
      shape: preset.shape,
      color: preset.color,
      noLabel: false,
      rotation: 0,
    }
    setDecorations(prev => [...prev, newDec])
    setSelectedId(newDec.id)
    toast.success(`Đã thêm khối hình mới`)
  }

  // Duplicate a decoration
  const handleDuplicateDecoration = (dec: DecorationShape) => {
    const newDec: DecorationShape = {
      ...dec,
      id: `dec_${Date.now()}`,
      x: snap(dec.x + 30),
      y: snap(dec.y + 30),
    }
    setDecorations(prev => [...prev, newDec])
    setSelectedId(newDec.id)
    toast.success(`Nhân bản thành công`)
  }

  // Delete a decoration shape
  const handleDeleteDecoration = (id: string) => {
    setDecorations(prev => prev.filter(d => d.id !== id))
    if (selectedId === id) setSelectedId('boundary')
    toast.success('Đã xóa hình trang trí')
  }

  // Find currently selected node details
  const selectedItem = useMemo(() => {
    if (!selectedId) return null
    if (selectedId.startsWith('dec_')) {
      const dec = decorations.find(d => d.id === selectedId)
      return dec ? { type: 'decoration' as const, data: dec } : null
    } else {
      const res = activeZoneResources.find(r => r.id === selectedId)
      const layout = tableLayouts[selectedId]
      return res && layout ? { type: 'table' as const, resource: res, layout } : null
    }
  }, [selectedId, decorations, tableLayouts, activeZoneResources])

  // Update properties of currently selected node
  const handleUpdateItem = (fields: Partial<DecorationShape> & { w?: number; h?: number; shape?: 'rect' | 'circle' }) => {
    if (!selectedItem) return

    if (selectedItem.type === 'decoration') {
      setDecorations(prev => prev.map(d => d.id === selectedId ? { ...d, ...fields } as DecorationShape : d))
    } else {
      setTableLayouts(prev => ({
        ...prev,
        [selectedId!]: {
          ...prev[selectedId!],
          ...fields,
        } as any
      }))
    }
  }

  // Zoom control
  const handleZoom = (type: 'in' | 'out' | 'reset') => {
    if (type === 'in') setScale(prev => Math.min(3.0, prev + 0.15))
    else if (type === 'out') setScale(prev => Math.max(0.3, prev - 0.15))
    else if (type === 'reset') {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth || 900
        const height = containerRef.current.clientHeight || 600
        const targetScale = Math.min((width - 80) / boundary.w, (height - 80) / boundary.h, 1)
        setScale(targetScale)
        setStagePos({
          x: (width - boundary.w * targetScale) / 2,
          y: (height - boundary.h * targetScale) / 2
        })
      } else {
        setScale(1)
        setStagePos({ x: 40, y: 40 })
      }
    }
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

    // Clamp zoom level between 0.3x and 3.0x
    newScale = Math.max(0.3, Math.min(3.0, newScale))

    setScale(newScale)

    // Set new stage coordinates to center on cursor
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }
    setStagePos(newPos)
  }

  // Save changes to Server API
  const handleSaveLayout = async () => {
    setSaving(true)
    try {
      const zoneKey = selectedZone || 'Chưa phân vùng'

      // 1. Build and save settings (decorations list & boundary)
      const parsedSubTypes = shopSettings?.resource_sub_types ? JSON.parse(shopSettings.resource_sub_types) : {}
      if (!parsedSubTypes.layouts) {
        parsedSubTypes.layouts = {}
      }
      parsedSubTypes.layouts[zoneKey] = decorations
      
      if (!parsedSubTypes.boundaries) {
        parsedSubTypes.boundaries = {}
      }
      parsedSubTypes.boundaries[zoneKey] = boundary

      await onSaveSettings(parsedSubTypes)

      // 2. Build and save coordinates for each active physical table
      const savePromises = activeZoneResources.map(async (r) => {
        const layout = tableLayouts[r.id]
        const currentMeta = r.metadata ? JSON.parse(r.metadata) : {}
        
        // Build new metadata
        let updatedMeta
        if (layout) {
          updatedMeta = { ...currentMeta, layout }
        } else {
          // If layout is deleted, remove layout field from metadata
          const { layout: _, ...rest } = currentMeta
          updatedMeta = rest
        }

        return fetch(`/api/shops/${shopId}/location-resources/${r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: JSON.stringify(updatedMeta) }),
        })
      })

      const responses = await Promise.all(savePromises)
      const failed = responses.some(res => !res.ok)
      if (failed) throw new Error('Save layout failed')

      toast.success(`Đã lưu toàn bộ sơ đồ ${(tpl?.label || 'bàn').toLowerCase()} thành công!`)
      onSaveSuccess()
    } catch (e) {
      console.error(e)
      toast.error('Lỗi khi lưu sơ đồ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[80vh] min-h-[600px] text-slate-800">
      
      {/* LEFT Toolbox: Controls & Unpositioned Tables list */}
      {!previewMode && (
        <div className="w-full lg:w-72 flex flex-col gap-4 overflow-y-auto shrink-0 select-none bg-white border border-slate-200 rounded-2xl p-4 shadow-sm shadow-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Khối trang trí tĩnh</h3>
            <div className="grid grid-cols-2 gap-2">
              {DECORATION_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAddDecoration(p)}
                  className="flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 p-2.5 text-xs text-left cursor-pointer transition-all hover:scale-[1.02] shadow-sm font-semibold"
                >
                  <span
                    className="h-3.5 w-3.5 rounded shrink-0 border"
                    style={{
                      backgroundColor: p.color,
                      borderColor: p.shape === 'text' ? '#64748b' : 'rgba(0,0,0,0.1)',
                      borderRadius: p.shape === 'circle' ? '50%' : '3px',
                    }}
                  />
                  <span className="line-clamp-1">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tpl?.label || 'Bàn'} chưa xếp vị trí</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-650">{unpositionedTables.length}</span>
            </div>
            
            <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
              {unpositionedTables.length === 0 ? (
                <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-200 text-center px-4 bg-slate-50/50">
                  <p className="text-xs text-slate-400 font-medium">Tất cả {(tpl?.label || 'bàn').toLowerCase()} đã xếp vị trí!</p>
                </div>
              ) : (
                unpositionedTables.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleAddTable(r)}
                    className="w-full flex items-center justify-between rounded-xl bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all hover:scale-[1.01] text-left group cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <ResourceIcon icon={tpl?.icon || ''} type={r.type} className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="truncate max-w-[120px] font-bold">{r.name}</span>
                    </span>
                    <span className="text-[10px] text-primary font-bold group-hover:underline">+ Xếp</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Properties Panel inside Left Toolbox */}
          {selectedId && (
            <div className="border-t border-slate-100 pt-4 flex flex-col gap-3 mt-auto">
              {selectedId === 'boundary' ? (
                // 1. FLOOR / AREA BOUNDARY SETTINGS (Default when no item is selected)
                <div className="space-y-3 text-slate-800">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cài đặt mặt bằng</h4>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">Bản vẽ</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hình dáng mặt bằng</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setBoundary(prev => ({ ...prev, shape: 'rect' }))}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            boundary.shape === 'rect'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          Chữ nhật
                        </button>
                        <button
                          onClick={() => setBoundary(prev => ({ ...prev, shape: 'circle' }))}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            boundary.shape === 'circle'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          Hình tròn
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                          {boundary.shape === 'circle' ? 'Đường kính X (px)' : 'Chiều rộng (px)'}
                        </label>
                        <input
                          type="number"
                          value={boundary.w}
                          onChange={(e) => setBoundary(prev => ({ ...prev, w: Math.max(200, Number(e.target.value)) }))}
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 text-center font-bold focus:bg-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-455 uppercase mb-1">
                          {boundary.shape === 'circle' ? 'Đường kính Y (px)' : 'Chiều cao (px)'}
                        </label>
                        <input
                          type="number"
                          value={boundary.h}
                          onChange={(e) => setBoundary(prev => ({ ...prev, h: Math.max(200, Number(e.target.value)) }))}
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 text-center font-bold focus:bg-white outline-none"
                        />
                      </div>
                    </div>
                    
                    <div className="text-[10px] text-slate-400 font-medium leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      💡 Chọn một vật thể hoặc bàn trên sơ đồ để sửa các thuộc tính chi tiết. Nhấp ra ngoài để quay lại.
                    </div>
                  </div>
                </div>
              ) : selectedItem?.type === 'decoration' ? (
                // 2. STATIC DECORATION SHAPE SETTINGS
                <div className="space-y-3 text-slate-800">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hình khối trang trí</h4>
                    <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Vật thể</span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nhãn hiển thị (Label)</label>
                      <input
                        value={selectedItem.data.name}
                        onChange={(e) => handleUpdateItem({ name: e.target.value })}
                        placeholder="Ví dụ: Lối đi, Bếp, Toilet..."
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-850 focus:border-primary focus:ring-1 focus:ring-primary focus:bg-white transition-all outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rộng (px)</label>
                        <input
                          type="number"
                          value={selectedItem.data.w}
                          onChange={(e) => handleUpdateItem({ w: Number(e.target.value) })}
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 text-center focus:bg-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cao (px)</label>
                        <input
                          type="number"
                          value={selectedItem.data.h}
                          onChange={(e) => handleUpdateItem({ h: Number(e.target.value) })}
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 text-center focus:bg-white outline-none"
                        />
                      </div>
                    </div>

                    {/* Rotation control for decoration */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Góc xoay (Độ)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={selectedItem.data.rotation || 0}
                          onChange={(e) => handleUpdateItem({ rotation: Math.round(Number(e.target.value)) })}
                          className="w-16 rounded-xl bg-slate-50 border border-slate-200 px-1.5 py-2 text-sm text-slate-800 text-center font-semibold focus:bg-white outline-none"
                        />
                        <button
                          onClick={() => handleUpdateItem({ rotation: 0 })}
                          className={`flex-1 rounded-xl text-[10px] font-bold border transition-colors cursor-pointer ${
                            (selectedItem.data.rotation || 0) === 0
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Ngang
                        </button>
                        <button
                          onClick={() => handleUpdateItem({ rotation: 90 })}
                          className={`flex-1 rounded-xl text-[10px] font-bold border transition-colors cursor-pointer ${
                            (selectedItem.data.rotation || 0) === 90
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Dọc
                        </button>
                        <button
                          onClick={() => {
                            const current = selectedItem.data.rotation || 0
                            const next = (current + 90) % 360
                            handleUpdateItem({ rotation: next })
                          }}
                          className="rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 px-2.5 py-2 text-xs font-bold cursor-pointer"
                          title="Xoay +90°"
                        >
                          +90°
                        </button>
                      </div>
                    </div>

                    {/* Text orientation control */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hướng chữ hiển thị</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateItem({ textOrientation: 'horizontal' })}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            (selectedItem.data.textOrientation || 'horizontal') === 'horizontal'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Ngang
                        </button>
                        <button
                          onClick={() => handleUpdateItem({ textOrientation: 'vertical' })}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            (selectedItem.data.textOrientation || 'horizontal') === 'vertical'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Dọc
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Màu sắc</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c.hex}
                            onClick={() => handleUpdateItem({ color: c.hex })}
                            className={`h-6 w-6 rounded-full border transition-all cursor-pointer ${
                              selectedItem.data.color === c.hex 
                                ? 'border-slate-400 scale-110 shadow-md ring-2 ring-primary/20' 
                                : 'border-slate-200 hover:scale-105'
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-455 uppercase mb-1">Loại khối hình</label>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleUpdateItem({ shape: 'rect' })}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            selectedItem.data.shape === 'rect'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          Chữ nhật
                        </button>
                        <button
                          onClick={() => handleUpdateItem({ shape: 'circle' })}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            selectedItem.data.shape === 'circle'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          Hình tròn
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 flex gap-2">
                      <button
                        onClick={() => handleDuplicateDecoration(selectedItem.data)}
                        className="flex-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold py-2 text-xs transition-colors cursor-pointer"
                      >
                        Nhân bản
                      </button>
                      <button
                        onClick={() => handleDeleteDecoration(selectedItem.data.id)}
                        className="flex-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 font-semibold py-2 text-xs transition-colors cursor-pointer"
                        title="Phím tắt: Delete/Backspace"
                      >
                        Xóa nhanh
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedItem?.type === 'table' ? (
                // 3. PHYSICAL ACTIVE TABLE SETTINGS
                <div className="space-y-3 text-slate-800">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thông tin bàn</h4>
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Hoạt động</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                      <p className="text-sm font-bold text-slate-800">{selectedItem.resource.name}</p>
                      <p className="text-[10px] text-slate-500">Phân loại: <span className="capitalize">{selectedItem.resource.type === 'court' ? 'Sân / Bàn đấu' : selectedItem.resource.type === 'room' ? 'Phòng' : 'Bàn'}</span></p>
                      {selectedItem.resource.capacity && <p className="text-[10px] text-slate-500">Sức chứa: 👥 {selectedItem.resource.capacity} pax</p>}
                      {selectedItem.resource.hourly_rate && Number(selectedItem.resource.hourly_rate) > 0 && (
                        <p className="text-[10px] text-slate-500">Giá giờ: ⏱️ <span className="font-semibold">{Number(selectedItem.resource.hourly_rate).toLocaleString('vi-VN')}₫/h</span></p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Chiều rộng (px)</label>
                        <input
                          type="number"
                          value={selectedItem.layout.w}
                          onChange={(e) => handleUpdateItem({ w: Number(e.target.value) })}
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 text-center font-bold focus:bg-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Chiều cao (px)</label>
                        <input
                          type="number"
                          value={selectedItem.layout.h}
                          onChange={(e) => handleUpdateItem({ h: Number(e.target.value) })}
                          className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 text-center font-bold focus:bg-white outline-none"
                        />
                      </div>
                    </div>

                    {/* Rotation control for physical table */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Góc xoay (Độ)</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={selectedItem.layout.rotation || 0}
                          onChange={(e) => handleUpdateItem({ rotation: Math.round(Number(e.target.value)) })}
                          className="w-16 rounded-xl bg-slate-50 border border-slate-200 px-1.5 py-2 text-sm text-slate-800 text-center font-semibold focus:bg-white outline-none"
                        />
                        <button
                          onClick={() => handleUpdateItem({ rotation: 0 })}
                          className={`flex-1 rounded-xl text-[10px] font-bold border transition-colors cursor-pointer ${
                            (selectedItem.layout.rotation || 0) === 0
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Ngang
                        </button>
                        <button
                          onClick={() => handleUpdateItem({ rotation: 90 })}
                          className={`flex-1 rounded-xl text-[10px] font-bold border transition-colors cursor-pointer ${
                            (selectedItem.layout.rotation || 0) === 90
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Dọc
                        </button>
                        <button
                          onClick={() => {
                            const current = selectedItem.layout.rotation || 0
                            const next = (current + 90) % 360
                            handleUpdateItem({ rotation: next })
                          }}
                          className="rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 px-2.5 py-2 text-xs font-bold cursor-pointer"
                          title="Xoay +90°"
                        >
                          +90°
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-455 uppercase mb-1">Hình dáng bàn</label>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleUpdateItem({ shape: 'rect' })}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            selectedItem.layout.shape !== 'circle'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          Bàn Vuông / Dài
                        </button>
                        <button
                          onClick={() => handleUpdateItem({ shape: 'circle' })}
                          className={`flex-1 rounded-xl py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                            selectedItem.layout.shape === 'circle'
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}
                        >
                          Bàn Tròn / Oval
                        </button>
                      </div>
                    </div>

                    {/* Zone Re-assignment */}
                    <div className="border-t border-slate-100 pt-3 space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase">Khu vực bàn</label>
                      {!isMoveZoneNew ? (
                        <div className="flex gap-2">
                          <select
                            value={moveZoneValue}
                            onChange={(e) => {
                              if (e.target.value === '__new__') {
                                setIsMoveZoneNew(true)
                                setMoveZoneValue('')
                              } else {
                                setMoveZoneValue(e.target.value)
                              }
                            }}
                            className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:bg-white transition-colors"
                          >
                            <option value="">Chưa phân vùng</option>
                            {allZonesList.map(z => (
                              <option key={z} value={z}>{z}</option>
                            ))}
                            <option value="__new__" className="text-primary font-semibold">+ Tạo vị trí mới...</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleMoveTableToZone(moveZoneValue)}
                            className="rounded-xl bg-primary text-white px-3 py-2 text-xs font-bold hover:bg-primary-dark transition-colors cursor-pointer shadow-sm shadow-primary/10"
                          >
                            Chuyển
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <input
                              value={moveZoneValue}
                              onChange={(e) => setMoveZoneValue(e.target.value)}
                              placeholder="Tên khu vực mới"
                              className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-800 outline-none focus:bg-white transition-colors"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleMoveTableToZone(moveZoneValue)}
                              className="rounded-xl bg-primary text-white px-2.5 py-1.5 text-xs font-bold hover:bg-primary-dark transition-colors cursor-pointer shadow-sm shadow-primary/10"
                            >
                              Lưu
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsMoveZoneNew(false)
                                setMoveZoneValue(selectedItem.resource.zone || '')
                              }}
                              className="rounded-xl border border-slate-200 bg-slate-50 text-slate-600 px-2.5 py-1.5 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      <button
                        onClick={() => handleRemoveTable(selectedItem.resource.id)}
                        className="w-full rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold py-2.5 text-xs transition-colors cursor-pointer"
                        title="Phím tắt: Delete/Backspace"
                      >
                        Gỡ khỏi sơ đồ
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* CENTRAL Design Canvas area */}
      <div className="flex-1 flex flex-col bg-slate-50 border border-slate-200 rounded-3xl overflow-hidden relative shadow-md shadow-slate-100">
        
        {/* Canvas Toolbar Header */}
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-2 w-2 rounded-full bg-emerald-550 animate-pulse" />
            <p className="text-xs font-bold text-slate-700">Khu vực: <span className="text-primary">{selectedZone || 'Chưa phân vùng'}</span></p>
            <div className="h-4 w-px bg-slate-200" />
            <button
              onClick={() => setSnapToGrid(!snapToGrid)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all border cursor-pointer ${
                snapToGrid 
                  ? 'bg-primary/10 border-primary/20 text-primary' 
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              Bám lưới 15px
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Scale controls */}
            <div className="flex items-center rounded-lg bg-slate-50 border border-slate-200 p-0.5">
              <button onClick={() => handleZoom('out')} className="rounded px-2.5 py-1 text-xs text-slate-500 hover:text-slate-850 hover:bg-white transition-colors font-extrabold">-</button>
              <span className="px-1 text-[10px] font-extrabold text-slate-700 w-10 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => handleZoom('in')} className="rounded px-2.5 py-1 text-xs text-slate-500 hover:text-slate-850 hover:bg-white transition-colors font-extrabold">+</button>
              <button onClick={() => handleZoom('reset')} className="rounded px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-850 border-l border-slate-200 hover:bg-white">Reset</button>
            </div>

            <div className="h-4 w-px bg-slate-200" />

            {/* Preview toggle */}
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all border cursor-pointer ${
                previewMode 
                  ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100' 
                  : 'bg-primary border-primary hover:bg-primary-dark text-white shadow-sm'
              }`}
            >
              {previewMode ? '⚙️ Chế độ Thiết kế' : '👁️ Chế độ Xem trước'}
            </button>

            <div className="h-4 w-px bg-slate-200" />

            {/* Save Button */}
            <button
              onClick={handleSaveLayout}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold px-3 py-1.5 text-xs shadow-md shadow-emerald-700/20 cursor-pointer transition-colors"
            >
              {saving ? 'Đang lưu...' : 'Lưu sơ đồ'}
            </button>
          </div>
        </div>

        {/* Blueprint Interactive Stage */}
        {/* Blueprint Interactive Stage */}
        <div ref={containerRef} className="flex-1 w-full h-full relative overflow-hidden bg-slate-100 select-none">
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
              if (e.target === stageRef.current) {
                setStagePos({ x: e.target.x(), y: e.target.y() })
              }
            }}
            onWheel={handleWheel}
            onClick={(e) => {
              if (e.target === e.target.getStage()) {
                setSelectedId('boundary')
              }
            }}
            onTap={(e) => {
              if (e.target === e.target.getStage()) {
                setSelectedId('boundary')
              }
            }}
            onContentMousemove={(e: any) => {
              const stage = e.target.getStage()
              if (!stage) return
              const pointerPos = stage.getPointerPosition()
              if (!pointerPos) return
              const intersection = stage.getIntersection(pointerPos)
              if (intersection && intersection.name() === 'rotater') {
                stage.container().style.cursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21.5 2v6h-6'/><path d='M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67'/></svg>") 12 12, auto`
              } else if (stage.container().style.cursor.includes('data:image/svg+xml')) {
                stage.container().style.cursor = 'default'
              }
            }}
            className="cursor-grab active:cursor-grabbing w-full h-full"
          >
            {/* Background grid layer */}
            <Layer>
              <Group x={40} y={40}>
                {boundary.shape === 'circle' ? (
                  <>
                    <Circle
                      x={boundary.w / 2}
                      y={boundary.h / 2}
                      radius={boundary.w / 2}
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth={1}
                      shadowColor="#0f172a"
                      shadowBlur={20}
                      shadowOpacity={0.06}
                      shadowOffset={{ x: 0, y: 10 }}
                    />
                      <Group clipFunc={(ctx) => {
                        ctx.arc(boundary.w / 2, boundary.h / 2, boundary.w / 2, 0, Math.PI * 2, false)
                      }}>
                        <Rect width={boundary.w} height={boundary.h} fill="#ffffff" />
                        {gridLines}
                      </Group>
                      <Text
                        text="MẶT BẰNG"
                        x={0}
                        y={boundary.h / 2 - 24}
                        width={boundary.w}
                        align="center"
                        fontSize={Math.max(28, Math.min(64, Math.round(boundary.w / 10)))}
                        fontStyle="bold"
                        fill="#475569"
                        opacity={0.06}
                        listening={false}
                      />
                    </>
                  ) : (
                    <>
                      <Rect 
                        width={boundary.w} 
                        height={boundary.h} 
                        fill="#ffffff" 
                        shadowColor="#0f172a"
                        shadowBlur={20}
                        shadowOpacity={0.06}
                        shadowOffset={{ x: 0, y: 10 }}
                      />
                      <Group clipFunc={(ctx) => {
                        ctx.rect(0, 0, boundary.w, boundary.h)
                      }}>
                        {gridLines}
                      </Group>
                      <Text
                        text="MẶT BẰNG"
                        x={0}
                        y={boundary.h / 2 - 24}
                        width={boundary.w}
                        align="center"
                        fontSize={Math.max(28, Math.min(64, Math.round(boundary.w / 10)))}
                        fontStyle="bold"
                        fill="#475569"
                        opacity={0.06}
                        listening={false}
                      />
                      <Rect width={boundary.w} height={boundary.h} stroke="#cbd5e1" strokeWidth={1} />
                    </>
                  )}
                </Group>
              </Layer>

              {/* Shapes interactive layer */}
              <Layer>
                <Group x={40} y={40}>
                  {/* 0. Boundary shape itself, selectable for visual resizing */}
                  {!previewMode && (
                    boundary.shape === 'circle' ? (
                      <Circle
                        id="boundary"
                        x={boundary.w / 2}
                        y={boundary.h / 2}
                        radius={boundary.w / 2}
                        fill={selectedId === 'boundary' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.025)'}
                        stroke={selectedId === 'boundary' ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)'}
                        strokeWidth={2}
                        dash={selectedId === 'boundary' ? [4, 4] : undefined}
                        draggable={false}
                        onClick={() => setSelectedId('boundary')}
                        onTap={() => setSelectedId('boundary')}
                        onTransform={(e) => {
                          const node = e.target
                          const scaleX = node.scaleX()
                          node.scaleX(1)
                          node.scaleY(1)
                          const newW = snap(Math.max(200, boundary.w * scaleX))
                          setBoundary(prev => ({
                            ...prev,
                            w: newW,
                            h: newW
                          }))
                        }}
                        onTransformEnd={(e) => {
                          const node = e.target
                          const scaleX = node.scaleX()
                          node.scaleX(1)
                          node.scaleY(1)
                          const newW = snap(Math.max(200, boundary.w * scaleX))
                          setBoundary(prev => ({
                            ...prev,
                            w: newW,
                            h: newW
                          }))
                        }}
                      />
                    ) : (
                      <Rect
                        id="boundary"
                        x={0}
                        y={0}
                        width={boundary.w}
                        height={boundary.h}
                        fill={selectedId === 'boundary' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.025)'}
                        stroke={selectedId === 'boundary' ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)'}
                        strokeWidth={2}
                        dash={selectedId === 'boundary' ? [4, 4] : undefined}
                        draggable={false}
                        onClick={() => setSelectedId('boundary')}
                        onTap={() => setSelectedId('boundary')}
                        onTransform={(e) => {
                          const node = e.target
                          const scaleX = node.scaleX()
                          const scaleY = node.scaleY()
                          const newX = snap(node.x())
                          const newY = snap(node.y())

                          node.scaleX(1)
                          node.scaleY(1)

                          const newW = snap(Math.max(200, node.width() * scaleX))
                          const newH = snap(Math.max(200, node.height() * scaleY))

                          node.x(0)
                          node.y(0)
                          node.width(newW)
                          node.height(newH)

                          const dx = -newX
                          const dy = -newY

                          if (dx !== 0 || dy !== 0) {
                            setDecorations(prev => prev.map(d => ({
                              ...d,
                              x: d.x + dx,
                              y: d.y + dy
                            })))
                            setTableLayouts(prev => {
                              const next = { ...prev }
                              for (const id in next) {
                                next[id] = {
                                  ...next[id],
                                  x: next[id].x + dx,
                                  y: next[id].y + dy
                                }
                              }
                              return next
                            })
                          }

                          setBoundary(prev => ({
                            ...prev,
                            w: newW,
                            h: newH
                          }))
                        }}
                        onTransformEnd={(e) => {
                          const node = e.target
                          const scaleX = node.scaleX()
                          const scaleY = node.scaleY()
                          const newX = snap(node.x())
                          const newY = snap(node.y())

                          node.scaleX(1)
                          node.scaleY(1)

                          const newW = snap(Math.max(200, node.width() * scaleX))
                          const newH = snap(Math.max(200, node.height() * scaleY))

                          node.x(0)
                          node.y(0)
                          node.width(newW)
                          node.height(newH)

                          const dx = -newX
                          const dy = -newY

                          if (dx !== 0 || dy !== 0) {
                            setDecorations(prev => prev.map(d => ({
                              ...d,
                              x: d.x + dx,
                              y: d.y + dy
                            })))
                            setTableLayouts(prev => {
                              const next = { ...prev }
                              for (const id in next) {
                                next[id] = {
                                  ...next[id],
                                  x: next[id].x + dx,
                                  y: next[id].y + dy
                                }
                              }
                              return next
                            })
                          }

                          setBoundary(prev => ({
                            ...prev,
                            w: newW,
                            h: newH
                          }))
                        }}
                      />
                  )
                )}

                {/* 1. Static decoration shapes */}
                {decorations.map(dec => {
                  const isSelected = selectedId === dec.id
                  return (
                    <Group key={dec.id}>
                      {/* Selectable Group */}
                      <Group
                        id={dec.id}
                        x={dec.x}
                        y={dec.y}
                        width={dec.w}
                        height={dec.h}
                        rotation={dec.rotation || 0}
                        draggable={!previewMode}
                        onClick={() => !previewMode && setSelectedId(dec.id)}
                        onTap={() => !previewMode && setSelectedId(dec.id)}
                        onDragStart={(e) => {
                          e.target.parent?.findOne('.delete-btn')?.opacity(0)
                        }}
                        onDragEnd={(e) => {
                          const newX = snap(e.target.x())
                          const newY = snap(e.target.y())
                          e.target.x(newX)
                          e.target.y(newY)
                          setDecorations(prev => prev.map(d => d.id === dec.id ? { ...d, x: newX, y: newY } : d))
                          e.target.parent?.findOne('.delete-btn')?.opacity(1)
                        }}
                        onTransformStart={(e) => {
                          e.target.parent?.findOne('.delete-btn')?.opacity(0)
                        }}
                        onTransformEnd={(e) => {
                          const node = e.target
                          const scaleX = node.scaleX()
                          const scaleY = node.scaleY()
                          const rotation = Math.round(node.rotation())
                          node.scaleX(1)
                          node.scaleY(1)

                          const newW = snap(Math.max(15, node.width() * scaleX))
                          const newH = snap(Math.max(15, node.height() * scaleY))
                          const newX = snap(node.x())
                          const newY = snap(node.y())

                          node.x(newX)
                          node.y(newY)

                          setDecorations(prev => prev.map(d => d.id === dec.id ? {
                            ...d,
                            x: newX,
                            y: newY,
                            w: newW,
                            h: newH,
                            rotation,
                          } : d))
                          node.parent?.findOne('.delete-btn')?.opacity(1)
                        }}
                      >
                        {dec.shape === 'circle' ? (
                          <Circle
                            x={dec.w / 2}
                            y={dec.h / 2}
                            radius={dec.w / 2}
                            fill={dec.color}
                            stroke={isSelected ? '#3b82f6' : '#cbd5e1'}
                            strokeWidth={isSelected ? 2 : 1}
                            opacity={0.65}
                          />
                        ) : dec.shape === 'text' ? (
                          <Rect
                            width={dec.w}
                            height={dec.h}
                            stroke={isSelected ? '#3b82f6' : '#cbd5e1'}
                            strokeWidth={1}
                            dash={isSelected ? [4, 4] : undefined}
                            opacity={isSelected ? 1 : 0}
                          />
                        ) : (
                          <Rect
                            width={dec.w}
                            height={dec.h}
                            cornerRadius={6}
                            fill={dec.color}
                            stroke={isSelected ? '#3b82f6' : '#cbd5e1'}
                            strokeWidth={isSelected ? 2 : 1}
                            opacity={0.65}
                          />
                        )}
                        
                        {dec.shape === 'text' ? (
                          dec.textOrientation === 'vertical' ? (
                            <Text
                              text={dec.name || 'Nhập nhãn...'}
                              x={dec.w / 2}
                              y={dec.h / 2}
                              width={dec.h}
                              height={dec.w}
                              offsetX={dec.h / 2}
                              offsetY={dec.w / 2}
                              rotation={90 - (dec.rotation || 0)}
                              align="center"
                              verticalAlign="middle"
                              fontSize={13}
                              fontStyle="bold"
                              fill={dec.color || '#334155'}
                            />
                          ) : (
                            <Text
                              text={dec.name || 'Nhập nhãn...'}
                              x={dec.w / 2}
                              y={dec.h / 2}
                              width={dec.w}
                              height={dec.h}
                              offsetX={dec.w / 2}
                              offsetY={dec.h / 2}
                              rotation={-(dec.rotation || 0)}
                              align="center"
                              verticalAlign="middle"
                              fontSize={13}
                              fontStyle="bold"
                              fill={dec.color || '#334155'}
                            />
                          )
                        ) : (
                          dec.name && (
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
                                fontSize={11}
                                fontStyle="bold"
                                fill="#334155"
                                ellipsis={true}
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
                                fontSize={11}
                                fontStyle="bold"
                                fill="#334155"
                                ellipsis={true}
                              />
                            )
                          )
                        )}
                      </Group>

                      {/* Sibling Delete Button */}
                      {isSelected && !previewMode && (
                        <Group
                          name="delete-btn"
                          x={dec.x}
                          y={dec.y}
                          rotation={dec.rotation || 0}
                        >
                          <Group
                            name="delete-btn-inner"
                            x={dec.w + 26}
                            y={dec.h / 2}
                            onClick={(e) => {
                              e.cancelBubble = true
                              handleDeleteDecoration(dec.id)
                            }}
                            onTap={(e) => {
                              e.cancelBubble = true
                              handleDeleteDecoration(dec.id)
                            }}
                            className="cursor-pointer"
                          >
                            <Circle
                              radius={10}
                              fill="#f43f5e"
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              shadowColor="#000000"
                              shadowBlur={4}
                              shadowOpacity={0.2}
                            />
                            <Text
                              text="×"
                              fontSize={14}
                              fontStyle="bold"
                              fill="#ffffff"
                              x={-5}
                              y={-8}
                              width={10}
                              align="center"
                            />
                          </Group>
                        </Group>
                      )}
                    </Group>
                  )
                })}

                {/* 2. Physical active tables */}
                {positionedTables.map(r => {
                  const layout = tableLayouts[r.id]
                  if (!layout) return null
                  const isSelected = selectedId === r.id
                  const isRoom = r.type === 'room'
                  
                  return (
                    <Group key={r.id}>
                      {/* Selectable Group */}
                      <Group
                        id={r.id}
                        x={layout.x}
                        y={layout.y}
                        width={layout.w}
                        height={layout.h}
                        rotation={layout.rotation || 0}
                        draggable={!previewMode}
                        onClick={() => !previewMode && setSelectedId(r.id)}
                        onTap={() => !previewMode && setSelectedId(r.id)}
                        onDragStart={(e) => {
                          e.target.parent?.findOne('.delete-btn')?.opacity(0)
                        }}
                        onDragEnd={(e) => {
                          const newX = snap(e.target.x())
                          const newY = snap(e.target.y())
                          e.target.x(newX)
                          e.target.y(newY)
                          setTableLayouts(prev => ({
                            ...prev,
                            [r.id]: { ...prev[r.id], x: newX, y: newY }
                          }))
                          e.target.parent?.findOne('.delete-btn')?.opacity(1)
                        }}
                        onTransformStart={(e) => {
                          e.target.parent?.findOne('.delete-btn')?.opacity(0)
                        }}
                        onTransformEnd={(e) => {
                          const node = e.target
                          const scaleX = node.scaleX()
                          const scaleY = node.scaleY()
                          const rotation = Math.round(node.rotation())
                          node.scaleX(1)
                          node.scaleY(1)

                          const newW = snap(Math.max(30, node.width() * scaleX))
                          const newH = snap(Math.max(30, node.height() * scaleY))
                          const newX = snap(node.x())
                          const newY = snap(node.y())

                          node.x(newX)
                          node.y(newY)

                          setTableLayouts(prev => ({
                            ...prev,
                            [r.id]: {
                              ...prev[r.id],
                              x: newX,
                              y: newY,
                              w: newW,
                              h: newH,
                              rotation,
                            }
                          }))
                          node.parent?.findOne('.delete-btn')?.opacity(1)
                        }}
                      >
                        {/* Bounding shape */}
                        {layout.shape === 'circle' ? (
                          <>
                            {/* Background Fill (Gradient Ring) */}
                            <Circle
                              x={layout.w / 2}
                              y={layout.h / 2}
                              radius={Math.min(layout.w, layout.h) / 2}
                              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                              fillLinearGradientEndPoint={{ x: 0, y: layout.h }}
                              fillLinearGradientColorStops={
                                isSelected
                                  ? [0, '#60a5fa', 1, '#3b82f6']
                                  : [0, '#4ade80', 1, '#10b981']
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
                              stroke={isSelected ? '#3b82f6' : '#e2e8f0'}
                              strokeWidth={isSelected ? 2 : 1}
                              shadowBlur={6}
                              shadowColor={isSelected ? '#3b82f6' : '#64748b'}
                              shadowOpacity={isSelected ? 0.25 : 0.08}
                            />
                          </>
                        ) : (
                          <>
                            {/* Clipped Group for beautiful rounded card with top status stripe */}
                            <Group
                              clipFunc={(ctx) => {
                                const inset = 1;
                                const r = 16 - inset;
                                const w = layout.w - inset * 2;
                                const h = layout.h - inset * 2;
                                ctx.beginPath();
                                ctx.moveTo(inset + r, inset);
                                ctx.arcTo(inset + w, inset, inset + w, inset + h, r);
                                ctx.arcTo(inset + w, inset + h, inset, inset + h, r);
                                ctx.arcTo(inset, inset + h, inset, inset, r);
                                ctx.arcTo(inset, inset, inset + w, inset, r);
                                ctx.closePath();
                              }}
                            >
                              {/* Background color of the card */}
                              <Rect
                                width={layout.w}
                                height={layout.h}
                                fill={isSelected ? '#eff6ff' : '#ffffff'}
                              />
                              {/* Top accent status color bar */}
                              <Rect
                                width={layout.w}
                                height={6}
                                fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                                fillLinearGradientEndPoint={{ x: layout.w, y: 0 }}
                                fillLinearGradientColorStops={
                                  isSelected
                                    ? [0, '#60a5fa', 1, '#3b82f6']
                                    : [0, '#4ade80', 1, '#10b981']
                                }
                              />
                            </Group>

                            {/* Sibling 2: Thin Outer Border for premium smooth corners */}
                            <Rect
                              width={layout.w}
                              height={layout.h}
                              cornerRadius={16}
                              stroke={isSelected ? '#3b82f6' : '#e2e8f0'}
                              strokeWidth={isSelected ? 2 : 1}
                              shadowBlur={6}
                              shadowColor={isSelected ? '#3b82f6' : '#64748b'}
                              shadowOpacity={isSelected ? 0.25 : 0.08}
                            />
                          </>
                        )}
                        
                        {/* Room/table name */}
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

                        {/* Capacity details */}
                        {r.capacity && (
                          <Text
                            text={`👥 Max: ${r.capacity} pax`}
                            x={10}
                            y={layout.h / 2 - 12}
                            width={layout.w - 20}
                            align="center"
                            fontSize={9}
                            fill="#64748b"
                          />
                        )}

                        {/* Status indicator pill */}
                        {(() => {
                          const statusText = "Trống";
                          const pillWidth = Math.min(layout.w - 24, statusText.length * 6 + 14);
                          return (
                            <Group x={layout.w / 2 - pillWidth / 2} y={layout.h - 26}>
                              <Rect
                                width={pillWidth}
                                height={18}
                                cornerRadius={9}
                                fill={isSelected ? '#eff6ff' : '#f0fdf4'}
                              />
                              <Text
                                text={statusText}
                                x={0}
                                y={3.5}
                                width={pillWidth}
                                align="center"
                                fontSize={9}
                                fontStyle="bold"
                                fill={isSelected ? '#1d4ed8' : '#15803d'}
                              />
                            </Group>
                          );
                        })()}
                      </Group>

                      {/* Sibling Delete Button */}
                      {isSelected && !previewMode && (
                        <Group
                          name="delete-btn"
                          x={layout.x}
                          y={layout.y}
                          rotation={layout.rotation || 0}
                        >
                          <Group
                            name="delete-btn-inner"
                            x={layout.w + 26}
                            y={layout.h / 2}
                            onClick={(e) => {
                              e.cancelBubble = true
                              handleRemoveTable(r.id)
                            }}
                            onTap={(e) => {
                              e.cancelBubble = true
                              handleRemoveTable(r.id)
                            }}
                            className="cursor-pointer"
                          >
                            <Circle
                              radius={10}
                              fill="#f43f5e"
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              shadowColor="#000000"
                              shadowBlur={4}
                              shadowOpacity={0.2}
                            />
                            <Text
                              text="×"
                              fontSize={14}
                              fontStyle="bold"
                              fill="#ffffff"
                              x={-5}
                              y={-8}
                              width={10}
                              align="center"
                            />
                          </Group>
                        </Group>
                      )}
                    </Group>
                  )
                })}
                </Group>

                {/* Transformer for visual resizing / rotation */}
                {!previewMode && (
                  <Transformer
                    ref={trRef}
                    rotateEnabled={selectedId !== 'boundary'}
                    boundBoxFunc={(oldBox, newBox) => {
                      const minSize = selectedId === 'boundary' ? 200 : 15
                      if (newBox.width < minSize || newBox.height < minSize) {
                        return oldBox
                      }
                      return newBox
                    }}
                  />
                )}
              </Layer>
            </Stage>
        </div>

        {/* FLOATING Inspector Card has been moved to Left Toolbox */}
      </div>
    </div>
  )
}

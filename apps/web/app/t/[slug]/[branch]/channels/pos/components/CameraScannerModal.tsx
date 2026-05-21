'use client'
import { useEffect, useRef, useState } from 'react'

interface CameraScannerModalProps {
  open: boolean
  onClose: () => void
  onScanSuccess: (decodedText: string) => void
}

interface CameraDevice {
  id: string
  label: string
}

export function CameraScannerModal({ open, onClose, onScanSuccess }: CameraScannerModalProps) {
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scannerRef = useRef<any>(null)
  const elementId = 'camera-scanner-viewfinder'

  useEffect(() => {
    if (!open) return

    let isMounted = true
    let html5QrcodeInstance: any = null

    async function initScanner() {
      try {
        // Dynamic import to prevent SSR module reference errors in Next.js
        const { Html5Qrcode } = await import('html5-qrcode')
        
        if (!isMounted) return

        const devices = await Html5Qrcode.getCameras()
        if (!isMounted) return

        if (devices && devices.length > 0) {
          setCameras(devices)
          // Find environment/back camera by default
          const backCam = devices.find((device) =>
            device.label.toLowerCase().includes('back') ||
            device.label.toLowerCase().includes('environment') ||
            device.label.toLowerCase().includes('rear')
          )
          const targetCamId = backCam ? backCam.id : devices[0].id
          setActiveCameraId(targetCamId)

          const html5Qrcode = new Html5Qrcode(elementId)
          html5QrcodeInstance = html5Qrcode
          scannerRef.current = html5Qrcode

          await html5Qrcode.start(
            targetCamId,
            {
              fps: 12,
              qrbox: (width, height) => {
                return {
                  width: Math.floor(width * 0.85),
                  height: Math.floor(height * 0.45),
                }
              },
              aspectRatio: 1.333333,
            },
            (decodedText) => {
              onScanSuccess(decodedText)
              if (html5Qrcode.isScanning) {
                html5Qrcode.stop().then(() => {
                  onClose()
                }).catch(() => {
                  onClose()
                })
              } else {
                onClose()
              }
            },
            () => {}
          )
        } else {
          setErrorMsg('Không tìm thấy camera nào trên thiết bị.')
        }
      } catch (err) {
        if (!isMounted) return
        console.error('Error starting camera scanner:', err)
        setErrorMsg('Không thể truy cập camera. Vui lòng cấp quyền truy cập camera trong cài đặt trình duyệt.')
      }
    }

    initScanner()

    return () => {
      isMounted = false
      if (html5QrcodeInstance && html5QrcodeInstance.isScanning) {
        html5QrcodeInstance.stop().catch((err: any) => console.error('Error stopping camera on unmount:', err))
      }
    }
  }, [open, onScanSuccess, onClose])

  const handleCameraChange = async (cameraId: string) => {
    setActiveCameraId(cameraId)
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop()
        const { Html5Qrcode } = await import('html5-qrcode')
        const html5Qrcode = new Html5Qrcode(elementId)
        scannerRef.current = html5Qrcode
        await html5Qrcode.start(
          cameraId,
          {
            fps: 12,
            qrbox: (width, height) => {
              return {
                width: Math.floor(width * 0.85),
                height: Math.floor(height * 0.45),
              }
            },
            aspectRatio: 1.333333,
          },
          (decodedText) => {
            onScanSuccess(decodedText)
            html5Qrcode.stop().then(() => onClose()).catch(() => onClose())
          },
          () => {}
        )
      } catch (err) {
        console.error('Error changing camera:', err)
        setErrorMsg('Lỗi khi thay đổi camera.')
      }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl transition-all border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-bold text-slate-800">Quét mã vạch / QR</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Camera Selector (if multiple exist) */}
        {cameras.length > 1 && (
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chọn camera:</span>
            <select
              value={activeCameraId || ''}
              onChange={(e) => handleCameraChange(e.target.value)}
              className="text-xs border border-slate-200 rounded px-2.5 py-1 bg-white focus:outline-none focus:border-primary text-slate-700 font-semibold cursor-pointer shadow-xs"
            >
              {cameras.map((cam, idx) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Viewfinder Area */}
        <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          <div id={elementId} className="w-full h-full object-cover" />
          
          {/* Aiming border overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[85%] h-[45%] border-2 border-emerald-500 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex flex-col justify-between p-2">
              <div className="flex justify-between w-full">
                <div className="h-4 w-4 border-t-2 border-l-2 border-emerald-400" />
                <div className="h-4 w-4 border-t-2 border-r-2 border-emerald-400" />
              </div>
              
              {/* Red laser animation line */}
              <div className="w-full h-[1.5px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />

              <div className="flex justify-between w-full">
                <div className="h-4 w-4 border-b-2 border-l-2 border-emerald-400" />
                <div className="h-4 w-4 border-b-2 border-r-2 border-emerald-400" />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center text-white z-10">
              <span className="text-3xl mb-3">📷</span>
              <p className="text-sm font-semibold max-w-[280px] leading-relaxed">{errorMsg}</p>
              <button
                onClick={onClose}
                className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold hover:bg-primary-dark transition-colors shadow-md"
              >
                Quay lại
              </button>
            </div>
          )}
        </div>

        {/* Info Banner */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500 leading-relaxed font-semibold">
            Đưa mã vạch của sản phẩm vào giữa khung ngắm màu xanh để quét tự động.
          </p>
        </div>
      </div>
    </div>
  )
}

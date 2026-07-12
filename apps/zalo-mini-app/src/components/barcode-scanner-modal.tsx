import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createCameraContext, getSetting, FacingMode } from 'zmp-sdk/apis';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import toast from 'react-hot-toast';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  placeholder?: string;
}

const safeStopCamera = (cameraInstance: any) => {
  if (!cameraInstance) return;
  try {
    const result = cameraInstance.stop();
    if (result && typeof result.catch === 'function') {
      result.catch((err: any) => console.log('Camera stop error:', err));
    }
  } catch (err) {
    console.error('Camera stop exception:', err);
  }
};

export function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Quét mã vạch',
  placeholder = 'Nhập mã sản phẩm hoặc SKU...'
}: BarcodeScannerModalProps) {
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanned, setScanned] = useState(false);

  // References
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInstanceRef = useRef<any>(null);

  // Initialize ZXing reader
  const codeReader = useMemo(() => new BrowserMultiFormatReader(), []);

  // Web Audio API beep sound generator
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // 1000Hz frequency
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime); // 15% volume
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1); // Beep for 100ms
    } catch (err) {
      console.warn('Cannot play audio beep:', err);
    }
  };

  // Check and initialize camera
  useEffect(() => {
    let active = true;

    const initCamera = async () => {
      try {
        const settings = await getSetting() as any;
        const cameraAllowed = settings?.authSetting?.['scope.camera'];

        if (cameraAllowed === false) {
          if (active) {
            setPermissionStatus('denied');
            setShowManualInput(true);
          }
          return;
        }

        if (active) {
          setPermissionStatus(cameraAllowed ? 'granted' : 'undetermined');
        }

        // Delay slightly to allow video DOM element to render
        setTimeout(async () => {
          if (!active || !videoRef.current) return;

          try {
            if (!cameraInstanceRef.current) {
              cameraInstanceRef.current = createCameraContext({
                videoElement: videoRef.current,
                mediaConstraints: {
                  width: 1280,
                  height: 720,
                  facingMode: FacingMode.BACK,
                  audio: false
                }
              });
            }

            await cameraInstanceRef.current.start();
            if (active) {
              setPermissionStatus('granted');
            }
          } catch (err) {
            console.error('Camera start failed:', err);
            if (active) {
              setPermissionStatus('denied');
              setShowManualInput(true);
              toast.error('Không thể kết nối camera. Đã chuyển sang nhập tay.');
            }
          }
        }, 300);

      } catch (err) {
        console.error('Permission check failed:', err);
        if (active) {
          setPermissionStatus('denied');
          setShowManualInput(true);
          toast.error('Có lỗi xảy ra khi kiểm tra quyền camera.');
        }
      }
    };

    if (visible) {
      setScanned(false);
      initCamera();
    } else {
      // Clean up camera resources on close
      if (cameraInstanceRef.current) {
        safeStopCamera(cameraInstanceRef.current);
        cameraInstanceRef.current = null;
      }
      setPermissionStatus('undetermined');
      setShowManualInput(false);
      setManualBarcode('');
    }

    return () => {
      active = false;
      if (cameraInstanceRef.current) {
        safeStopCamera(cameraInstanceRef.current);
        cameraInstanceRef.current = null;
      }
    };
  }, [visible]);

  // Decode barcode frame-by-frame
  const scanFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended || scanned) {
      return;
    }

    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) return;

      // Crop the center region (viewfinder box: 70% width, 55% height) for better scanning performance
      const cropW = Math.floor(vw * 0.7);
      const cropH = Math.floor(vh * 0.55);
      const sx = Math.floor((vw - cropW) / 2);
      const sy = Math.floor((vh - cropH) / 2);

      // Resize to a smaller canvas for faster base64 conversion and decoding
      canvas.width = 400;
      canvas.height = 300;

      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, 400, 300);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const result = await codeReader.decodeFromImage(undefined, dataUrl);
      if (result && !scanned) {
        setScanned(true);
        const barcodeVal = result.getText();
        
        playBeep();
        toast.success(`Đã quét: ${barcodeVal}`);
        onScan(barcodeVal);
        
        // Brief timeout before enabling next scan
        setTimeout(() => {
          setScanned(false);
        }, 1500);
      }
    } catch (err) {
      // NotFoundException is expected and thrown when no barcode is in the frame
      if (!(err instanceof NotFoundException)) {
        console.error('ZXing decoder error:', err);
      }
    }
  };

  // Scanning loop interval
  useEffect(() => {
    if (!visible || permissionStatus !== 'granted' || scanned) return;

    const interval = setInterval(() => {
      scanFrame();
    }, 250);

    return () => clearInterval(interval);
  }, [visible, permissionStatus, scanned]);

  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualBarcode.trim()) return;

    const barcodeVal = manualBarcode.trim();
    playBeep();
    toast.success(`Nhập tay: ${barcodeVal}`);
    onScan(barcodeVal);
    setManualBarcode('');
    setShowManualInput(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'flex-end',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <style>{`
        @keyframes scan {
          0% { transform: translateY(10px); }
          50% { transform: translateY(210px); }
          100% { transform: translateY(10px); }
        }
        .animate-laser {
          animation: scan 2.5s infinite ease-in-out;
        }
      `}</style>

      {/* Hidden canvas for video frames */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={{
        width: '100%',
        height: '80%',
        backgroundColor: '#fff',
        borderTopLeftRadius: '24px',
        borderTopRightRadius: '24px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 -10px 25px rgba(0,0,0,0.15)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #f1f5f9',
          backgroundColor: '#fff',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              backgroundColor: '#fff4e5',
              padding: '6px',
              borderRadius: '8px',
              border: '1px solid #ffe8cc',
              display: 'flex',
              alignItems: 'center'
            }}>
              {/* Barcode scan icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fa5908" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5v14M21 5v14M7 5v14M17 5v14M12 5v14" />
              </svg>
            </div>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#f1f5f9',
              borderRadius: '50%',
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b'
            }}
          >
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>✕</span>
          </button>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, position: 'relative', backgroundColor: '#0f172a' }}>
          
          {/* Permission loading / indeterminate */}
          {permissionStatus === 'undetermined' && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#f8fafc',
              zIndex: 5
            }}>
              <div style={{
                width: 40,
                height: 40,
                border: '3px solid #cbd5e1',
                borderTopColor: '#fa5908',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500, marginTop: 12 }}>
                Đang khởi tạo camera...
              </span>
            </div>
          )}

          {/* Camera Viewport (Always rendered to keep videoRef bound) */}
          <div style={{ 
            width: '100%', 
            height: '100%', 
            position: 'relative',
            display: permissionStatus === 'granted' ? 'block' : 'none'
          }}>
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
              autoPlay
              playsInline
              muted
            />

            {/* Viewfinder scanner overlay mask */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'none'
            }}>
              {/* Top mask */}
              <div style={{
                flex: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '16px'
              }}>
                <div style={{
                  backgroundColor: '#fa5908',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '100px',
                  fontSize: '11px',
                  fontWeight: 600,
                  marginBottom: 4
                }}>
                  Đặt mã vạch vào khung ngắm
                </div>
                <span style={{ fontSize: '9px', color: '#cbd5e1', textAlign: 'center' }}>
                  Giữ camera ổn định. Tiếng bíp phát ra khi nhận diện thành công.
                </span>
              </div>

              {/* Middle Row (Left Mask + Viewfinder box + Right Mask) */}
              <div style={{ display: 'flex', height: 220 }}>
                <div style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)' }} />
                
                {/* Viewfinder box (280px wide) */}
                <div style={{
                  width: 280,
                  height: 220,
                  position: 'relative',
                  boxSizing: 'border-box'
                }}>
                  {/* Corners */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 24, height: 24, borderTop: '4px solid #fa5908', borderLeft: '4px solid #fa5908', borderTopLeftRadius: 8 }} />
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 24, height: 24, borderTop: '4px solid #fa5908', borderRight: '4px solid #fa5908', borderTopRightRadius: 8 }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: 24, height: 24, borderBottom: '4px solid #fa5908', borderLeft: '4px solid #fa5908', borderBottomLeftRadius: 8 }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderBottom: '4px solid #fa5908', borderRight: '4px solid #fa5908', borderBottomRightRadius: 8 }} />
                  
                  {/* Laser line scanner */}
                  <div className="animate-laser" style={{
                    position: 'absolute',
                    left: '5%',
                    width: '90%',
                    height: '2.5px',
                    backgroundColor: '#fa5908',
                    borderRadius: '2px',
                    boxShadow: '0 0 8px #fa5908'
                  }} />
                </div>

                <div style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)' }} />
              </div>

              {/* Bottom mask */}
              <div style={{
                flex: 1,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                padding: '24px 16px',
                pointerEvents: 'auto'
              }}>
                {/* Toggle Keyboard / Manual input */}
                <button
                  onClick={() => setShowManualInput(!showManualInput)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '8px 16px',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  {/* Keyboard icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                    <line x1="6" y1="8" x2="6.01" y2="8" />
                    <line x1="10" y1="8" x2="10.01" y2="8" />
                    <line x1="14" y1="8" x2="14.01" y2="8" />
                    <line x1="18" y1="8" x2="18.01" y2="8" />
                    <line x1="6" y1="12" x2="6.01" y2="12" />
                    <line x1="18" y1="12" x2="18.01" y2="12" />
                    <line x1="7" y1="16" x2="17" y2="16" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                  {showManualInput ? 'Ẩn bàn phím nhập tay' : 'Không quét được? Nhập tay'}
                </button>
              </div>
            </div>
          </div>

          {/* Camera Denied fallback / Simulator mode */}
          {permissionStatus === 'denied' && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '24px',
              zIndex: 5,
              overflowY: 'auto'
            }}>
              {/* Camera warning box */}
              <div style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeeba',
                padding: '16px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 20
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#856404" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: 600, color: '#856404' }}>
                    Quyền Camera bị từ chối / Không khả dụng
                  </h4>
                  <p style={{ margin: 0, fontSize: '11px', color: '#b58105', lineHeight: 1.4 }}>
                    Thiết bị giả lập hoặc quyền bị chặn. Bạn hãy nhập tay mã vạch sản phẩm bên dưới.
                  </p>
                </div>
              </div>

              {/* Static Manual Input */}
              <div style={{
                backgroundColor: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
              }}>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: 8, display: 'block' }}>
                  Nhập mã vạch thủ công:
                </label>
                <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    backgroundColor: '#f8fafc'
                  }}>
                    {/* Barcode icon */}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                      <path d="M3 5v14M21 5v14M7 5v14M17 5v14M12 5v14" />
                    </svg>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        fontSize: '13px',
                        outline: 'none',
                        color: '#1e293b'
                      }}
                      autoFocus
                    />
                    {manualBarcode.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setManualBarcode('')}
                        style={{ border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: '14px', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!manualBarcode.trim()}
                    style={{
                      backgroundColor: manualBarcode.trim() ? '#fa5908' : '#e2e8f0',
                      color: manualBarcode.trim() ? '#fff' : '#94a3b8',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '12px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: manualBarcode.trim() ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    Xác nhận mã vạch
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Drawer: Collapsible Manual Input (Native camera mode overlay) */}
          {permissionStatus === 'granted' && showManualInput && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#fff',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              boxShadow: '0 -4px 10px rgba(0,0,0,0.1)',
              zIndex: 20
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                  Nhập mã vạch sản phẩm:
                </span>
                <button
                  onClick={() => setShowManualInput(false)}
                  style={{ border: 'none', background: 'transparent', color: '#fa5908', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Đóng
                </button>
              </div>
              <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc'
                }}>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      fontSize: '13px',
                      outline: 'none',
                      color: '#1e293b'
                    }}
                    autoFocus
                  />
                  {manualBarcode.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setManualBarcode('')}
                      style={{ border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: '14px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!manualBarcode.trim()}
                  style={{
                    backgroundColor: manualBarcode.trim() ? '#fa5908' : '#e2e8f0',
                    color: manualBarcode.trim() ? '#fff' : '#94a3b8',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: manualBarcode.trim() ? 'pointer' : 'default'
                  }}
                >
                  Xác nhận mã
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

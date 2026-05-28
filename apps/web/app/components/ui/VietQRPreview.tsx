'use client'
import { useState, useEffect } from 'react'

interface VietQRPreviewProps {
  bankCode: string
  accountNumber: string
  accountName: string
  amount?: number
  addInfo?: string
  template?: 'compact' | 'compact2' | 'qr_only'
  className?: string
}

export function VietQRPreview({
  bankCode,
  accountNumber,
  accountName,
  amount = 0,
  addInfo = '',
  template = 'compact2',
  className = '',
}: VietQRPreviewProps) {
  const [loading, setLoading] = useState(true)
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!bankCode || !accountNumber) {
      setImgUrl(null)
      return
    }

    // Build standard VietQR image link
    // https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<DESCRIPTION>&accountName=<ACCOUNT_NAME>
    const baseUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${template}.png`
    const params = new URLSearchParams()
    
    if (amount > 0) {
      params.append('amount', String(amount))
    }
    if (addInfo) {
      params.append('addInfo', addInfo)
    }
    if (accountName) {
      params.append('accountName', accountName)
    }

    const queryStr = params.toString()
    setImgUrl(queryStr ? `${baseUrl}?${queryStr}` : baseUrl)
    setLoading(true)
  }, [bankCode, accountNumber, accountName, amount, addInfo, template])

  if (!bankCode || !accountNumber) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50 text-slate-400 ${className}`}>
        <svg className="h-8 w-8 text-slate-350 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.9 2.9m-12.487-11.8a8.103 8.103 0 013.176-.328c.456.03.908.167 1.302.405a10.5 10.5 0 0010.5-.3m-3.437 9.892a5.006 5.006 0 000-7.072m-3.444 7.072a9.004 9.004 0 000-12.728" />
        </svg>
        <span className="text-xs font-medium">Nhập tên ngân hàng & số tài khoản để tạo QR</span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center p-4 bg-white rounded-2xl border border-slate-100/80 shadow-xs max-w-[240px] mx-auto w-full ${className}`}>
      <div className="relative w-full aspect-square bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center border border-slate-100">
        {loading && (
          <div className="absolute inset-0 z-25 flex items-center justify-center bg-white/95">
            <svg className="animate-spin h-6 w-6 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
        {imgUrl && imgUrl.trim() !== '' && (
          <img
            src={imgUrl || undefined}
            alt={`VietQR ${bankCode}`}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
            className="w-full aspect-square object-contain transition-opacity duration-300"
            style={{ opacity: loading ? 0 : 1 }}
          />
        )}
      </div>
      <div className="mt-3 text-center w-full min-w-0">
        <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase truncate">Ngân hàng: {bankCode}</p>
        <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">STK: {accountNumber}</p>
        {accountName && (
          <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5 max-w-full px-1">{accountName}</p>
        )}
      </div>
    </div>
  )
}

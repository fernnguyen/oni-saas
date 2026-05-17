'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  tenantId: string
  currentConnector: { id: string; type: string; status: string } | null
}

const TYPES = [
  { value: 'postgres_local', label: 'PostgreSQL (Shared)', icon: '🐘' },
  { value: 'postgres_remote', label: 'PostgreSQL (BYOD)', icon: '🐘' },
  { value: 'mysql_local', label: 'MySQL (Shared)', icon: '🐬' },
  { value: 'mysql_remote', label: 'MySQL (BYOD)', icon: '🐬' },
  { value: 'google_sheets', label: 'Google Sheets', icon: '📊' },
]

export function ConnectorSwitchAdmin({ tenantId, currentConnector }: Props) {
  const router = useRouter()
  const [switching, setSwitching] = useState(false)

  async function handleSwitch(type: string) {
    if (currentConnector?.type === type) return
    if (!confirm(`Chuyển connector của tenant sang "${type}"?`)) return

    setSwitching(true)
    try {
      const res = await fetch('/api/super/tenants/connector-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, type }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Lỗi')
      }
      toast.success(`Đã chuyển connector sang ${type}`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Lỗi')
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <span className="font-semibold text-slate-800 text-sm">Data Connector</span>
        </div>
        {currentConnector && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            currentConnector.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${currentConnector.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
            {currentConnector.status}
          </span>
        )}
      </div>
      <div className="p-4 space-y-2">
        {TYPES.map(t => {
          const isActive = currentConnector?.type === t.value
          return (
            <button
              key={t.value}
              disabled={switching || isActive}
              onClick={() => handleSwitch(t.value)}
              className={`w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-100 bg-white hover:border-slate-300'
              } disabled:opacity-60`}
            >
              <span className="text-lg">{t.icon}</span>
              <span className="text-xs font-semibold text-slate-800 flex-1">{t.label}</span>
              {isActive && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

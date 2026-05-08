'use client'

import React, { useState, useEffect } from 'react'

export interface NumberInputProps {
  label?: string
  value?: number | string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  suffix?: string
  min?: number
  max?: number
}

function formatVND(raw: string): string {
  if (!raw) return ''
  // Vietnamese format: period as thousands separator
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function stripFormatting(formatted: string): string {
  return formatted.replace(/\./g, '').replace(/[^0-9]/g, '')
}

export function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  suffix,
  min,
  max,
}: NumberInputProps) {
  const rawInitial = value !== undefined && value !== '' ? String(value).replace(/\./g, '') : ''
  const [displayValue, setDisplayValue] = useState(formatVND(rawInitial))

  // Sync when value prop changes externally
  useEffect(() => {
    const raw = value !== undefined && value !== '' ? stripFormatting(String(value)) : ''
    setDisplayValue(formatVND(raw))
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = stripFormatting(e.target.value)
    if (raw === '') {
      setDisplayValue('')
      onChange('')
      return
    }

    let numeric = parseInt(raw, 10)
    if (isNaN(numeric)) return

    if (min !== undefined && numeric < min) numeric = min
    if (max !== undefined && numeric > max) numeric = max

    const rawStr = String(numeric)
    setDisplayValue(formatVND(rawStr))
    onChange(rawStr)
  }

  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className={`relative ${className}`}>
        <input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className={[
            'w-full rounded-xl border border-slate-200 py-2 text-right text-sm',
            'focus:outline-none focus:ring-2 focus:ring-[#0268FF]/30',
            disabled ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'bg-white',
            suffix ? 'pl-3 pr-8' : 'px-3',
          ].join(' ')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

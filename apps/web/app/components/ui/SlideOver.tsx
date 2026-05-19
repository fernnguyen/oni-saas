'use client'

import React, { useEffect } from 'react'

export interface SlideOverProps {
  open: boolean
  onClose: () => void
  title: string
  width?: number
  footer?: React.ReactNode
  children: React.ReactNode
}

export function SlideOver({
  open,
  onClose,
  title,
  width = 480,
  footer,
  children,
}: SlideOverProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {/* Overlay */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 !m-0',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          'fixed bottom-0 right-0 top-0 z-50 flex flex-col bg-white shadow-xl !m-0',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{ width: '100%', maxWidth: width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Đóng"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex justify-end gap-3 border-t border-slate-200 p-4">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}

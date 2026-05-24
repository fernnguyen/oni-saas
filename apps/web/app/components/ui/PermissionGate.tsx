'use client'
import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

export function PermissionGate() {
  const params = useParams()
  const slug = params?.slug as string
  const branch = params?.branch as string

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-red-200 bg-red-50 py-16 text-center">
      <div className="mb-4 rounded-full bg-red-100 p-4">
        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-semibold text-slate-800">Không có quyền truy cập</h2>
      <p className="mb-6 max-w-sm text-sm text-slate-500">
        Bạn không được cấp quyền để xem nội dung của trang này. Vui lòng liên hệ quản trị viên nếu bạn cần hỗ trợ.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700"
      >
        Quay lại trang chủ
      </Link>
    </div>
  )
}

interface HasPermissionProps {
  permissions: string[]
  has: string | string[]
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Visual UI Gating Component: Hides or shows fallback UI based on permissions list.
 * Purely in-memory, fast, with zero network overhead.
 */
export function HasPermission({ permissions, has, fallback = null, children }: HasPermissionProps) {
  const list = permissions || []
  const hasAccess = Array.isArray(has)
    ? has.some((p) => list.includes(p))
    : list.includes(has)

  if (!hasAccess) {
    return <>{fallback}</>
  }

  return <>{children}</>
}


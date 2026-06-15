import React from 'react'
import { getSuperAdminUser } from '@/lib/server/auth'
import { redirect } from 'next/navigation'
import { NotificationsClient } from './NotificationsClient'

export default async function SuperNotificationsPage() {
  const user = await getSuperAdminUser()
  if (!user) {
    redirect('/admin-login')
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Superadmin</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Thông báo đẩy toàn hệ thống</h1>
        <p className="text-sm text-slate-500 mt-0.5">Phát thông báo tới tất cả người dùng và chi nhánh trong hệ thống.</p>
      </div>

      <NotificationsClient />
    </div>
  )
}

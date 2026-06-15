'use server'

import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { getSuperAdminUser } from '@/lib/server/auth'
import { realtimeEngine } from '@/lib/server/realtime'

export async function getTenantsList() {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('tenants')
    .select('id, name')
    .order('name')

  if (error) {
    console.error('Failed to fetch tenants:', error)
    throw error
  }
  return data || []
}

export async function getShopsList(tenantId: string) {
  const user = await getSuperAdminUser()
  if (!user) throw new Error('Unauthorized')

  if (!tenantId) return []

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('shops')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name')

  if (error) {
    console.error('Failed to fetch shops:', error)
    throw error
  }
  return data || []
}

export async function sendSystemBroadcastNotification(
  title: string,
  content: string,
  url?: string,
  targetTenantId?: string,
  targetShopId?: string
) {
  const user = await getSuperAdminUser()
  if (!user) {
    throw new Error('Unauthorized')
  }

  if (!title.trim() || !content.trim()) {
    throw new Error('Tiêu đề và nội dung không được để trống')
  }

  const admin = getSupabaseAdminClient()

  // 1. Nếu chỉ gửi đến 1 tổ chức (tenant) cụ thể
  if (targetTenantId) {
    try {
      await realtimeEngine.sendNotification({
        tenantId: targetTenantId,
        branchId: targetShopId || undefined,
        type: 'system_broadcast',
        title: title.trim(),
        content: content.trim(),
        metadata: {
          path: url?.trim() || null,
          priority: 'high',
        },
      })
      return {
        success: true,
        total: 1,
        successCount: 1,
        failCount: 0,
      }
    } catch (err: any) {
      console.error(`Failed to send broadcast to tenant ${targetTenantId}:`, err)
      return {
        success: false,
        total: 1,
        successCount: 0,
        failCount: 1,
      }
    }
  }

  // 2. Gửi toàn bộ hệ thống (tất cả các tenant)
  const { data: tenants, error: tenantsError } = await admin
    .from('tenants')
    .select('id, name')

  if (tenantsError) {
    console.error('Failed to fetch tenants:', tenantsError)
    throw new Error(`Lỗi truy vấn danh sách tổ chức: ${tenantsError.message}`)
  }

  if (!tenants || tenants.length === 0) {
    return { success: true, total: 0, successCount: 0, failCount: 0 }
  }

  let successCount = 0
  let failCount = 0

  const promises = tenants.map(async (tenant) => {
    try {
      await realtimeEngine.sendNotification({
        tenantId: tenant.id,
        type: 'system_broadcast',
        title: title.trim(),
        content: content.trim(),
        metadata: {
          path: url?.trim() || null,
          priority: 'high',
        },
      })
      successCount++
    } catch (err) {
      console.error(`Failed to send broadcast to tenant ${tenant.name} (${tenant.id}):`, err)
      failCount++
    }
  })

  await Promise.allSettled(promises)

  return {
    success: true,
    total: tenants.length,
    successCount,
    failCount,
  }
}

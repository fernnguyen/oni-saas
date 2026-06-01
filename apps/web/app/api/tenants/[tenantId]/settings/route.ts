import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

const schema = z.object({
  share_customers: z.boolean(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params
    const supabase = await getSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const admin = getSupabaseAdminClient()

    // Verify user is owner/admin of this tenant
    const { data: access } = await admin
      .from('user_tenants')
      .select('id, roles(code)')
      .eq('user_id', authData.user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!access) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const roleCode = Array.isArray((access as any).roles)
      ? (access as any).roles[0]?.code
      : (access as any).roles?.code
    if (roleCode !== 'owner' && roleCode !== 'admin') {
      return NextResponse.json({ message: 'Chỉ owner/admin mới được thay đổi cấu hình workspace' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ message: 'Giá trị không hợp lệ' }, { status: 422 })
    }

    const { error } = await admin
      .from('tenants')
      .update({ share_customers: parsed.data.share_customers })
      .eq('id', tenantId)

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }

    // Clear Next.js customer data cache for all shops under this tenant
    const { data: shops } = await admin
      .from('shops')
      .select('id')
      .eq('tenant_id', tenantId)

    if (shops && shops.length > 0) {
      const { invalidate } = await import('@/lib/server/cache')
      for (const shop of shops) {
        invalidate(shop.id, 'customers')
      }
    }

    return NextResponse.json({ success: true, share_customers: parsed.data.share_customers })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Server error' }, { status: 500 })
  }
}

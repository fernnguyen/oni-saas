import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseServerClient } from '@/lib/server/supabaseServer'
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { INDUSTRY_TYPES } from '@oni/core'

const schema = z.object({
  industry_type: z.enum(INDUSTRY_TYPES),
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
      return NextResponse.json({ message: 'Chỉ owner/admin mới được thay đổi' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ message: 'Giá trị không hợp lệ' }, { status: 422 })
    }

    const { error } = await admin
      .from('tenants')
      .update({ industry_type: parsed.data.industry_type })
      .eq('id', tenantId)

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, industry_type: parsed.data.industry_type })
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? 'Server error' }, { status: 500 })
  }
}

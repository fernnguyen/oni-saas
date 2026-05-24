import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { hasPermission } from '../../../../../lib/server/permissions';
import { listRoles, listPermissions, createCustomRole } from '../../../../../lib/server/roles';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const allowed = await hasPermission(user.id, tenantId, 'roles.view');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  try {
    const roles = await listRoles(tenantId);
    const permissions = await listPermissions();
    return NextResponse.json({ roles, permissions });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'Tên vai trò không được để trống').max(100),
  scope: z.enum(['workspace', 'shop']),
  permissionCodes: z.array(z.string()),
  description: z.string().max(255).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const allowed = await hasPermission(user.id, tenantId, 'roles.manage');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const json = await req.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    );
  }

  try {
    const role = await createCustomRole(tenantId, parsed.data);
    return NextResponse.json({ ok: true, role }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message || 'Không thể tạo vai trò';
    return NextResponse.json(
      { message: msg },
      { status: 500 },
    );
  }
}


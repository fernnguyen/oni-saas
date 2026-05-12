import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../../lib/server/supabaseServer';
import { hasPermission } from '../../../../../../lib/server/permissions';
import { updateCustomRole, deleteCustomRole } from '../../../../../../lib/server/roles';

const updateSchema = z.object({
  name: z.string().min(1, 'Tên vai trò không được để trống').max(100).optional(),
  permissionCodes: z.array(z.string()).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; roleId: string }> },
) {
  const { tenantId, roleId } = await params;
  const id = parseInt(roleId, 10);
  if (isNaN(id)) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const allowed = await hasPermission(user.id, tenantId, 'roles.manage');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const json = await req.json();
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.errors[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    );
  }

  try {
    await updateCustomRole(tenantId, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (err as any)?.message || 'Lỗi server';
    return NextResponse.json(
      { message: msg },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; roleId: string }> },
) {
  const { tenantId, roleId } = await params;
  const id = parseInt(roleId, 10);
  if (isNaN(id)) return NextResponse.json({ message: 'Invalid ID' }, { status: 400 });

  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const allowed = await hasPermission(user.id, tenantId, 'roles.manage');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  try {
    await deleteCustomRole(tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Không thể xóa vai trò' },
      { status: 400 },
    );
  }
}

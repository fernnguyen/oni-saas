import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { hasPermission } from '../../../../../lib/server/permissions';
import { createTenantUser, listTenantUsers } from '../../../../../lib/server/tenantUsers';

const baseSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  role: z.enum(['owner', 'admin', 'staff', 'viewer']),
  shop_id: z.string().uuid().optional(),
});

const workspaceSchema = baseSchema.extend({
  account_type: z.literal('workspace'),
  username: z.string().regex(/^[a-z0-9_]{3,30}$/, {
    message: 'Tên đăng nhập chỉ được dùng chữ thường, số, dấu gạch dưới (_), 3–30 ký tự',
  }),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  tenant_slug: z.string().min(1),
});

const personalSchema = baseSchema.extend({
  account_type: z.literal('personal'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});

const createSchema = z.discriminatedUnion('account_type', [workspaceSchema, personalSchema]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const allowed = await hasPermission(user.id, tenantId, 'users.view');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  try {
    const users = await listTenantUsers(tenantId);
    return NextResponse.json({ users });
  } catch (err: unknown) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Lỗi server' },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const allowed = await hasPermission(user.id, tenantId, 'users.invite');
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
    const data = parsed.data;
    const result = await createTenantUser(
      data.account_type === 'workspace'
        ? {
            accountType: 'workspace',
            tenantId,
            tenantSlug: data.tenant_slug,
            username: data.username,
            password: data.password,
            displayName: data.display_name,
            roleCode: data.role,
            shopId: data.shop_id,
          }
        : {
            accountType: 'personal',
            tenantId,
            email: data.email,
            password: data.password,
            displayName: data.display_name,
            roleCode: data.role,
            shopId: data.shop_id,
          },
    );
    return NextResponse.json({ ok: true, user: result }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể tạo người dùng';
    const status =
      message.includes('đã tồn tại') ||
      message.includes('đã là thành viên') ||
      message.includes('giới hạn')
        ? 400
        : 500;
    return NextResponse.json({ message }, { status });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { hasPermission } from '../../../../../lib/server/permissions';
import { createTenantUser, listTenantUsers, lookupTenantUserIdentity } from '../../../../../lib/server/tenantUsers';
import { isValidVNPhone } from '../../../../../lib/utils/phone';
import { checkRateLimit, rateLimitKey } from '../../../../../lib/server/rateLimit';

const baseSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  role: z.string().min(1, 'Vai trò không được để trống'),
  shop_id: z.string().uuid().optional(),
});

const workspaceSchema = baseSchema.extend({
  account_type: z.literal('workspace'),
  username: z.string().regex(/^[a-z0-9_]{3,30}$/, {
    message: 'Tên đăng nhập chỉ được dùng chữ thường, số, dấu gạch dưới (_), 3–30 ký tự',
  }),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),  // [M-1] unified to 8
  tenant_slug: z.string().min(1),
});

const emailSchema = baseSchema.extend({
  account_type: z.literal('email'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').optional(),
});

const phoneSchema = baseSchema.extend({
  account_type: z.literal('phone'),
  phone: z.string().refine(isValidVNPhone, 'Số điện thoại không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').optional(),
});

const personalSchema = baseSchema.extend({
  account_type: z.literal('personal'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').optional(),
});

const createSchema = z.discriminatedUnion('account_type', [workspaceSchema, emailSchema, phoneSchema, personalSchema]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const lookupAccountType = url.searchParams.get('lookup_account_type');
  const lookupIdentifier = url.searchParams.get('identifier');

  if (lookupAccountType || lookupIdentifier) {
    const allowed = await hasPermission(user.id, tenantId, 'users.invite');
    if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

    // [H-3] Rate limit identity lookups to prevent email/phone enumeration.
    // 20 lookups per user per minute is generous for normal use but blocks bulk probing.
    const rlAllowed = await checkRateLimit(rateLimitKey('identity_lookup', user.id), 20, 60);
    if (!rlAllowed) {
      return NextResponse.json(
        { message: 'Quá nhiều yêu cầu kiểm tra. Vui lòng thử lại sau.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    if ((lookupAccountType !== 'email' && lookupAccountType !== 'phone') || !lookupIdentifier) {
      return NextResponse.json({ message: 'Dữ liệu kiểm tra không hợp lệ' }, { status: 400 });
    }

    try {
      const result = await lookupTenantUserIdentity({
        tenantId,
        accountType: lookupAccountType,
        identifier: lookupIdentifier,
      });
      return NextResponse.json(result);
    } catch (err: unknown) {
      return NextResponse.json(
        { message: err instanceof Error ? err.message : 'Dữ liệu kiểm tra không hợp lệ' },
        { status: 400 },
      );
    }
  }

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
        : data.account_type === 'phone'
          ? {
              accountType: 'phone',
              tenantId,
              phone: data.phone,
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
      message.includes('giới hạn') ||
      message.includes('không hợp lệ') ||
      message.includes('Mật khẩu')
        ? 400
        : 500;
    return NextResponse.json({ message }, { status });
  }
}

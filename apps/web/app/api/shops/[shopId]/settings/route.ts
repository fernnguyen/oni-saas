import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../../../lib/server/supabaseAdmin';
import { assertUserShopAccess } from '../../../../../lib/server/shops';
import { getUserPermissions } from '../../../../../lib/server/permissions';
import { getShopsForTenant } from '../../../../../lib/server/shops';
import { getTenantForUser } from '../../../../../lib/server/tenants';

const DEFAULT_SETTINGS = {
  shop_name: '',
  currency: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
  tax_rate: 0,
  invoice_prefix: 'ORD',
  low_stock_threshold: 5,
  allow_negative_stock: false,
  auto_print_receipt: true,
  mute_pos_sound: false,
  default_price_type: 'retail',
  synced_from_sheet_at: null as string | null,
  updated_at: new Date().toISOString(),
};

const putSchema = z.object({
  shop_name: z.string().max(100).optional(),
  tax_id: z.string().max(50).optional(),
  wifi_info: z.string().max(100).optional(),
  bank_code: z.string().max(20).optional(),
  bank_account_number: z.string().max(50).optional(),
  bank_account_name: z.string().max(100).optional(),
  qr_template: z.enum(['compact', 'compact2', 'qr_only', 'print']).optional(),
  receipt_footer: z.string().max(500).optional(),
  address: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  currency: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  invoice_prefix: z.string().max(20).optional(),
  low_stock_threshold: z.number().int().min(0).optional(),
  allow_negative_stock: z.boolean().optional(),
  auto_print_receipt: z.boolean().optional(),
  mute_pos_sound: z.boolean().optional(),
  default_price_type: z.enum(['retail', 'wholesale', 'vip', 'staff']).optional(),
});

async function resolveAuth(req: NextRequest, shopId: string) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const hasAccess = await assertUserShopAccess(auth.user.id, shopId);
  if (!hasAccess) return null;

  const tenant = await getTenantForUser(auth.user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (tenant as any)?.id as string | undefined;
  if (!tenantId) return null;

  const permissions = await getUserPermissions(auth.user.id, tenantId, shopId);
  return { user: auth.user, permissions };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;

  const ctx = await resolveAuth(req, shopId);
  if (!ctx) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from('shop_settings')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();

  // Return defaults if no row yet — don't insert until user saves
  const settings = data ?? { ...DEFAULT_SETTINGS, shop_id: shopId };
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;

  const ctx = await resolveAuth(req, shopId);
  if (!ctx) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  if (!ctx.permissions.includes('shops.manage') && !ctx.permissions.includes('settings.manage')) {
    return NextResponse.json({ message: 'Không có quyền thay đổi cài đặt' }, { status: 403 });
  }

  const json = await req.json();
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu không hợp lệ', errors: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date().toISOString();
  const admin = getSupabaseAdminClient();

  const { address, phone, ...settingsData } = parsed.data;

  const { error } = await admin
    .from('shop_settings')
    .upsert(
      { shop_id: shopId, ...settingsData, updated_at: now },
      { onConflict: 'shop_id' },
    );

  if (address !== undefined || phone !== undefined || parsed.data.shop_name !== undefined) {
    const shopUpdate: any = {};
    if (address !== undefined) shopUpdate.address = address;
    if (phone !== undefined) shopUpdate.phone = phone;
    if (parsed.data.shop_name !== undefined) shopUpdate.name = parsed.data.shop_name;

    const { error: shopError } = await admin
      .from('shops')
      .update(shopUpdate)
      .eq('id', shopId);

    if (shopError) {
      console.error('[shop address PUT]', shopError.message);
    }
  }

  if (error) {
    console.error('[shop settings PUT]', error.message);
    return NextResponse.json({ message: 'Lưu cài đặt thất bại' }, { status: 500 });
  }

  const { data: updated } = await admin
    .from('shop_settings')
    .select('*')
    .eq('shop_id', shopId)
    .single();

  return NextResponse.json(updated);
}

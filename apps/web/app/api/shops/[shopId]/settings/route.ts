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
  skip_cleaning_process: false,
  skip_return_confirmation: false,
  default_price_type: 'retail',
  qr_auto_approve_session: false,
  enable_shift_management: false,
  strict_shift_lock: false,
  synced_from_sheet_at: null as string | null,
  loyalty_points_enabled: true,
  loyalty_money_to_point: 100000,
  loyalty_point_to_money: 1000,
  tier_evaluation_years: 3,
  tier_reward_type: 'discount_bill',
  membership_tiers: [
    { name: 'Đồng', threshold: 5000000, discount: 2, color: 'slate' },
    { name: 'Bạc', threshold: 15000000, discount: 5, color: 'sapphire' },
    { name: 'Vàng', threshold: 35000000, discount: 10, color: 'gold' }
  ],
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
  skip_cleaning_process: z.boolean().optional(),
  skip_return_confirmation: z.boolean().optional(),
  default_price_type: z.enum(['retail', 'wholesale', 'vip', 'staff']).optional(),
  resource_sub_types: z.string().optional(),
  qr_auto_approve_session: z.boolean().optional(),
  enable_shift_management: z.boolean().optional(),
  strict_shift_lock: z.boolean().optional(),
  loyalty_points_enabled: z.boolean().optional(),
  loyalty_money_to_point: z.number().min(1).optional(),
  loyalty_point_to_money: z.number().min(0).optional(),
  tier_evaluation_years: z.number().int().min(1).optional(),
  tier_reward_type: z.enum(['discount_bill', 'price_list']).optional(),
  membership_tiers: z.array(z.object({
    name: z.string().min(1),
    threshold: z.number().min(0),
    discount: z.number().min(0).max(100),
    color: z.string().optional()
  })).optional(),
});


async function resolveAuth(req: NextRequest, shopId: string) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const hasAccess = await assertUserShopAccess(auth.user.id, shopId);
  if (!hasAccess) return null;

  const tenant = await getTenantForUser(auth.user.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantId = (tenant as any)?.id as string | undefined;
  if (!tenantId) {
    const admin = getSupabaseAdminClient();
    const { data: shop } = await admin
      .from('shops')
      .select('tenant_id')
      .eq('id', shopId)
      .maybeSingle();
    tenantId = shop?.tenant_id;
  }
  if (!tenantId) return null;

  const permissions = await getUserPermissions(auth.user.id, tenantId, shopId);
  return { user: auth.user, permissions, tenantId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;

  const ctx = await resolveAuth(req, shopId);
  if (!ctx) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data: settingsData } = await admin
    .from('shop_settings')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();

  const { data: shopData } = await admin
    .from('shops')
    .select('address, phone')
    .eq('id', shopId)
    .maybeSingle();

  // Return defaults if no row yet — don't insert until user saves
  const settings = settingsData ?? { ...DEFAULT_SETTINGS, shop_id: shopId };
  if (shopData) {
    settings.address = shopData.address;
    settings.phone = shopData.phone;
  }
  
  // Inject CRM access flag
  const { checkFeatureAccess } = await import('@/lib/server/features');
  settings.has_crm_access = ctx.tenantId ? await checkFeatureAccess(ctx.tenantId, 'crm') : false;
  
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

  // Check CRM Access
  const { checkFeatureAccess } = await import('@/lib/server/features');
  const hasCrmAccess = ctx.tenantId ? await checkFeatureAccess(ctx.tenantId, 'crm') : false;

  const now = new Date().toISOString();
  const admin = getSupabaseAdminClient();

  const { address, phone, ...settingsData } = parsed.data;

  // Enforce CRM access gate: force crm features to be disabled and strip crm settings if tenant does not have access
  let finalSettingsData = { ...settingsData };
  if (!hasCrmAccess) {
    finalSettingsData = {
      ...finalSettingsData,
      loyalty_points_enabled: false,
    };
    delete finalSettingsData.membership_tiers;
    delete finalSettingsData.loyalty_money_to_point;
    delete finalSettingsData.loyalty_point_to_money;
    delete finalSettingsData.tier_evaluation_years;
    delete finalSettingsData.tier_reward_type;
  }

  const { error } = await admin
    .from('shop_settings')
    .upsert(
      { shop_id: shopId, ...finalSettingsData, updated_at: now },
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

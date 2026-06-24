import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '../../../../../../lib/server/supabaseAdmin';
import { getSuperAdminUser } from '../../../../../../lib/server/auth';
import { INDUSTRY_TYPES } from '@oni/core';

const DEFAULT_SETTINGS = {
  shop_name: '',
  currency: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
  tax_rate: 0,
  invoice_prefix: 'ORD',
  low_stock_threshold: 5,
  allow_negative_stock: true,
  auto_print_receipt: true,
  mute_pos_sound: false,
  skip_cleaning_process: false,
  skip_return_confirmation: false,
  housekeeping_workflow_mode: 'SIMPLE',
  default_price_type: 'retail',
  qr_auto_approve_session: false,
  enable_shift_management: false,
  strict_shift_lock: false,
  print_bilingual: false,
  show_brand_attribution: true,
  sepay_webhook_token: '',
  sepay_auth_method: 'token_query',
  sepay_hmac_key: '',
  sepay_api_key: '',
  sepay_bank_filter: '',
  sepay_transaction_type: 'all',
  default_max_debt_days: 30,
  default_max_debt_amount: 10000000,
  allow_sell_over_debt_limit: true,
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
  tax_id: z.string().max(50).optional().nullable(),
  wifi_info: z.string().max(100).optional().nullable(),
  bank_code: z.string().max(20).optional().nullable(),
  bank_account_number: z.string().max(50).optional().nullable(),
  bank_account_name: z.string().max(100).optional().nullable(),
  qr_template: z.enum(['compact', 'compact2', 'qr_only', 'print']).optional(),
  industry_type: z.enum(INDUSTRY_TYPES).optional(),
  sepay_webhook_token: z.string().max(255).optional().nullable(),
  sepay_auth_method: z.enum(['token_query', 'hmac', 'api_key', 'oauth', 'none']).optional(),
  sepay_hmac_key: z.string().max(255).optional().nullable(),
  sepay_api_key: z.string().max(255).optional().nullable(),
  sepay_bank_filter: z.string().max(100).optional().nullable(),
  sepay_transaction_type: z.enum(['all', 'in_only', 'out_only']).optional(),
  receipt_footer: z.string().max(500).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
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
  housekeeping_workflow_mode: z.enum(['SIMPLE', 'ENTERPRISE']).optional(),
  default_price_type: z.enum(['retail', 'wholesale', 'vip', 'staff']).optional(),
  resource_sub_types: z.string().optional().nullable(),
  qr_auto_approve_session: z.boolean().optional(),
  enable_shift_management: z.boolean().optional(),
  strict_shift_lock: z.boolean().optional(),
  print_bilingual: z.boolean().optional(),
  show_brand_attribution: z.boolean().optional(),
  default_max_debt_days: z.number().int().min(0).optional(),
  default_max_debt_amount: z.number().min(0).optional(),
  allow_sell_over_debt_limit: z.boolean().optional(),
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const superAdmin = await getSuperAdminUser();
  if (!superAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { shopId } = await params;
  const admin = getSupabaseAdminClient();

  const { data: shopData } = await admin
    .from('shops')
    .select('name, slug, address, phone, industry_type, tenant_id')
    .eq('id', shopId)
    .maybeSingle();

  if (!shopData) {
    return NextResponse.json({ message: 'Shop not found' }, { status: 404 });
  }

  const { data: settingsData } = await admin
    .from('shop_settings')
    .select('*')
    .eq('shop_id', shopId)
    .maybeSingle();

  const settings = settingsData ?? { ...DEFAULT_SETTINGS, shop_id: shopId };
  settings.shop_name = shopData.name;
  settings.address = shopData.address;
  settings.phone = shopData.phone;
  settings.industry_type = shopData.industry_type || 'retail';

  // Inject CRM access flag
  const { checkFeatureAccess } = await import('@/lib/server/features');
  settings.has_crm_access = shopData.tenant_id ? await checkFeatureAccess(shopData.tenant_id, 'crm') : false;

  // Fetch share_customers from tenants table
  let shareCustomers = false;
  if (shopData.tenant_id) {
    const { data: tenantData } = await admin
      .from('tenants')
      .select('share_customers')
      .eq('id', shopData.tenant_id)
      .maybeSingle();
    shareCustomers = tenantData?.share_customers ?? false;
  }
  settings.share_customers = shareCustomers;

  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const superAdmin = await getSuperAdminUser();
  if (!superAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { shopId } = await params;
  const admin = getSupabaseAdminClient();

  const { data: shopData } = await admin
    .from('shops')
    .select('tenant_id')
    .eq('id', shopId)
    .maybeSingle();

  if (!shopData) {
    return NextResponse.json({ message: 'Shop not found' }, { status: 404 });
  }

  const json = await req.json();
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Dữ liệu không hợp lệ', errors: parsed.error.flatten() }, { status: 400 });
  }

  // Check CRM Access
  const { checkFeatureAccess } = await import('@/lib/server/features');
  const hasCrmAccess = shopData.tenant_id ? await checkFeatureAccess(shopData.tenant_id, 'crm') : false;

  const now = new Date().toISOString();
  const { address, phone, industry_type, ...settingsData } = parsed.data;

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

  let retryCount = 0;
  let currentPayload = { shop_id: shopId, ...finalSettingsData, updated_at: now };
  let error: any = null;

  while (retryCount < 12) {
    const res = await admin
      .from('shop_settings')
      .upsert(currentPayload, { onConflict: 'shop_id' });

    if (!res.error) {
      error = null;
      break;
    }

    error = res.error;

    if (error.code === '42703' || error.message?.includes('column')) {
      const match = error.message.match(/column "([^"]+)"/);
      if (match && match[1]) {
        const missingCol = match[1];
        console.warn(`[super settings PUT] Column "${missingCol}" does not exist in shop_settings. Filtering it out and retrying.`);
        delete (currentPayload as any)[missingCol];
        retryCount++;
        continue;
      } else {
        let found = false;
        const advancedColumns = [
          'sepay_webhook_token',
          'sepay_auth_method',
          'sepay_hmac_key',
          'sepay_api_key',
          'sepay_bank_filter',
          'sepay_transaction_type'
        ];
        for (const col of advancedColumns) {
          if ((currentPayload as any)[col] !== undefined && (error.message.includes(col) || error.message.includes(`"${col}"`))) {
            console.warn(`[super settings PUT] Fallback column match: "${col}" does not exist. Removing and retrying.`);
            delete (currentPayload as any)[col];
            found = true;
          }
        }
        if (found) {
          retryCount++;
          continue;
        }
      }
    }
    break;
  }

  // Update shops table
  if (address !== undefined || phone !== undefined || parsed.data.shop_name !== undefined || industry_type !== undefined) {
    const shopUpdate: any = {};
    if (address !== undefined) shopUpdate.address = address;
    if (phone !== undefined) shopUpdate.phone = phone;
    if (parsed.data.shop_name !== undefined) shopUpdate.name = parsed.data.shop_name;
    if (industry_type !== undefined) shopUpdate.industry_type = industry_type;

    const { error: shopError } = await admin
      .from('shops')
      .update(shopUpdate)
      .eq('id', shopId);

    if (shopError) {
      console.error('[super shop address PUT]', shopError.message);
    }
  }

  if (error) {
    console.error('[super shop settings PUT]', error.message);
    return NextResponse.json({ message: 'Lưu cài đặt thất bại' }, { status: 500 });
  }

  // Insert audit log to track this operational change
  if (shopData.tenant_id) {
    await admin.from('audit_logs').insert({
      tenant_id: shopData.tenant_id,
      user_id: superAdmin.id,
      action: 'shop.settings_update',
      metadata: {
        shop_id: shopId,
        shop_name: parsed.data.shop_name || '',
        updated_fields: Object.keys(parsed.data),
      },
    });
  }

  const { data: updated } = await admin
    .from('shop_settings')
    .select('*')
    .eq('shop_id', shopId)
    .single();

  const responseData = {
    ...updated,
    share_customers: (await admin
      .from('tenants')
      .select('share_customers')
      .eq('id', shopData.tenant_id)
      .maybeSingle()
    ).data?.share_customers ?? false
  };

  return NextResponse.json(responseData);
}

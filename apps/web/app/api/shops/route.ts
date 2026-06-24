import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { hasPermission } from '../../../lib/server/permissions';
import { enforceLimit, isPlanLimitError, planLimitResponse } from '../../../lib/server/planLimits';
import { INDUSTRY_TYPES, getTimeChargeProductId } from '@oni/core';

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug chỉ chứa a-z, 0-9, dấu gạch ngang'),
  address: z.string().optional(),
  industry_type: z.enum(INDUSTRY_TYPES).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const json = await req.json();
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid input', errors: parsed.error.flatten() }, { status: 400 });
  }

  const { tenant_id, name, slug, address, industry_type } = parsed.data;

  const allowed = await hasPermission(auth.user.id, tenant_id, 'shops.create');
  if (!allowed) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  try {
    await enforceLimit('create_shop', { tenantId: tenant_id }, tenant_id);
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc('create_shop', {
    p_tenant_id: tenant_id,
    p_name: name,
    p_slug: slug,
    p_address: address ?? null,
    p_industry_type: industry_type ?? 'retail',
  });

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  // Create default shop settings with allow_negative_stock: true
  try {
    await admin.from('shop_settings').insert({
      shop_id: (data as any).id,
      shop_name: name,
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      tax_rate: 0,
      invoice_prefix: 'ORD',
      low_stock_threshold: 5,
      allow_negative_stock: true, // Enable negative stock by default for frictionless onboarding
      default_price_type: 'retail',
      auto_print_receipt: true,
      mute_pos_sound: false,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to create default shop settings:', err);
  }

  // Auto-init the Time Charge product for the new shop
  try {
    const { getConnectorForShop } = await import('../../../lib/server/connectorFactory');
    const connector = await getConnectorForShop((data as any).id, tenant_id);
    const resolvedIndustry = industry_type ?? 'retail';
    const prodId = getTimeChargeProductId(resolvedIndustry);
    
    const newProduct = {
      id: prodId,
      product_id: prodId,
      sku: prodId,
      name: resolvedIndustry === 'billiards' 
        ? 'Dịch vụ tiền giờ Billiards (Hệ thống)' 
        : resolvedIndustry === 'lodging'
        ? 'Dịch vụ tiền phòng (Hệ thống)'
        : 'Dịch vụ tiền giờ (Hệ thống)',
      active: 'TRUE',
      sell_price: '0',
      cost_price: '0',
      tax_rate: '0',
      input_tax_rate: '0',
      tax_group: 'dich_vu', // System service tax group under Circular 40/2021/TT-BTC
      product_type: 'service',
      branch_id: (data as any).id
    };
    await connector.create('products', newProduct);
  } catch (err) {
    console.error('Failed to auto-init TIME_CHARGE product during shop creation:', err);
  }


  return NextResponse.json({ shop: data }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const tenant_id = req.nextUrl.searchParams.get('tenant_id');
  if (!tenant_id) return NextResponse.json({ message: 'tenant_id required' }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('shops_view')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ shops: data ?? [] });
}

'use server';

import { z } from 'zod';
import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';
import { formatPhoneAsEmail, isValidVNPhone } from '../../../../lib/utils/phone';

const ONI_FAKE_EMAIL_RE = /^[^@]+@[^.]+\.oni\.vn$/i;

const schema = z.object({
  slug:          z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Chỉ dùng chữ thường, số và dấu gạch ngang'),
  name:          z.string().min(2).max(100),
  email:         z.string().min(1).refine(
    (e) => e.includes('@') || isValidVNPhone(e),
    { message: 'Email hoặc Số điện thoại không hợp lệ' }
  ).refine(
    (e) => !ONI_FAKE_EMAIL_RE.test(e),
    { message: 'Không thể đăng ký với định dạng này' },
  ),
  password:      z.string().min(8),
  plan_code:     z.string().optional(),
  industry_type: z.string().default('retail'),
});

export async function createTenantOnBehalf(formData: FormData) {
  try {
    const rawData = {
      slug: formData.get('slug') as string,
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      plan_code: formData.get('plan_code') as string,
      industry_type: formData.get('industry_type') as string,
    };

    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
      return { success: false, error: 'Dữ liệu không hợp lệ', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const { slug, name, email: rawEmail, password, industry_type } = parsed.data;

    const email = (!rawEmail.includes('@') && isValidVNPhone(rawEmail)) 
      ? formatPhoneAsEmail(rawEmail) 
      : rawEmail;

    const admin = getSupabaseAdminClient();

    // 1 — Check slug uniqueness
    const [{ count: tenantCount }, { count: reservedCount }] = await Promise.all([
      admin.from('tenants').select('*', { count: 'exact', head: true }).eq('slug', slug),
      admin.from('reserved_subdomains').select('*', { count: 'exact', head: true }).eq('subdomain', slug),
    ]);
    if ((tenantCount ?? 0) > 0 || (reservedCount ?? 0) > 0) {
      return { success: false, error: 'Subdomain đã được sử dụng hoặc bảo lưu. Hãy chọn tên khác.', field: 'slug' };
    }

    // 2 — Create auth user (Admin always sets email_confirm: true)
    const { data: userData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      const isDuplicate = authError.message.toLowerCase().includes('already');
      return { success: false, error: isDuplicate ? 'Email này đã được đăng ký.' : authError.message, field: isDuplicate ? 'email' : undefined };
    }

    const userId = userData.user.id;

    // 3 — Create tenant + owner membership + subscription
    const { data: tenant, error: tenantError } = await admin.rpc('create_tenant_with_owner', {
      p_name:     name,
      p_slug:     slug,
      p_owner_id: userId,
      p_industry_type: industry_type,
    });
    if (tenantError) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return { success: false, error: tenantError.message };
    }
    const tenantId = (tenant as any).id as string;

    // Fetch Target Plan ID
    let targetPlanId: number | null = null;
    const planCode = parsed.data.plan_code || 'plan_mini';
    const { data: defaultPlan } = await admin.from('plans').select('id').eq('code', planCode).maybeSingle();
    if (defaultPlan) {
      targetPlanId = defaultPlan.id;
    }

    if (targetPlanId) {
      const updateData: any = { plan_id: targetPlanId };
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);
      updateData.current_period_end = expirationDate.toISOString();
      
      await admin.from('subscriptions').update(updateData).eq('tenant_id', tenantId);
    }

    // 4 — Create default branch
    const { data: createdShop, error: shopError } = await admin.rpc('create_shop', {
      p_tenant_id: tenantId,
      p_name:      name,
      p_slug:      slug,
      p_address:   null,
      p_industry_type: industry_type,
    });
    if (shopError) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return { success: false, error: shopError.message };
    }

    // Default settings
    try {
      await admin.from('shop_settings').insert({
        shop_id: (createdShop as any).id,
        shop_name: name,
        currency: 'VND',
        timezone: 'Asia/Ho_Chi_Minh',
        tax_rate: 0,
        invoice_prefix: 'ORD',
        low_stock_threshold: 5,
        allow_negative_stock: true,
        default_price_type: 'retail',
        auto_print_receipt: true,
        mute_pos_sound: false,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to create default shop settings:', err);
    }

    // Auto-init the Time Charge product
    try {
      const { getTimeChargeProductId } = await import('@oni/core');
      const { getConnectorForShop } = await import('../../../../lib/server/connectorFactory');
      const connector = await getConnectorForShop((createdShop as any).id, tenantId);
      const resolvedIndustry = industry_type ?? 'retail';
      const prodId = getTimeChargeProductId(resolvedIndustry as any);
      
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
        tax_group: 'dich_vu',
        product_type: 'service',
        branch_id: (createdShop as any).id
      };
      await connector.create('products', newProduct);
    } catch (err) {
      console.error('Failed to auto-init TIME_CHARGE product during admin registration:', err);
    }

    // 5 — Local DB connector
    await admin.from('connectors').insert({
      tenant_id: tenantId,
      type: 'postgres_local',
      status: 'active',
      config: {
        is_system: true,
        read_only: true,
        worker_name: 'Database Hệ thống'
      }
    });

    return { success: true, data: { tenantId } };
  } catch (error: any) {
    console.error('Admin create tenant error:', error);
    return { success: false, error: error.message || 'Lỗi hệ thống' };
  }
}

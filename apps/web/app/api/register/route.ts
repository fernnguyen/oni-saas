import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { verifyTurnstileToken } from '../../../lib/server/turnstile';
import { INDUSTRY_TYPES } from '@oni/core';
import { normalizeVNPhone } from '../../../lib/utils/phone';

// Reject fake tenant emails — these are reserved for tenant user accounts
const ONI_FAKE_EMAIL_RE = /^[^@]+@[^.]+\.oni\.vn$/i;

const schema = z.object({
  slug:            z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Chỉ dùng chữ thường, số và dấu gạch ngang'),
  name:            z.string().min(2).max(100),
  phone:           z.string().optional(),
  password:        z.string().optional(),
  plan_code:       z.string().optional(),
  industry_type:   z.enum(INDUSTRY_TYPES).default('retail'),
  turnstile_token: z.string().optional(),
  invitation_code: z.string().optional(),
});

function generateTemporaryPassword() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Dữ liệu không hợp lệ', errors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { slug, name, phone, password, industry_type, turnstile_token, invitation_code } = parsed.data;

  try {
  const admin = getSupabaseAdminClient();

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const protocol   = rootDomain.startsWith('localhost') ? 'http' : 'https';

  const supabaseClient = await getSupabaseServerClient();
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ message: 'Vui lòng đăng nhập để thiết lập hệ thống.' }, { status: 401 });
  }

  const userId = user.id;
  const userMetadata =
    user.user_metadata && typeof user.user_metadata === 'object' && !Array.isArray(user.user_metadata)
      ? user.user_metadata
      : {};
  const metadataPhone = typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '';
  const effectivePhoneInput = phone?.trim() || metadataPhone.trim() || '';
  const normalizedPhone = effectivePhoneInput ? normalizeVNPhone(effectivePhoneInput) : null;

  // Bypass Turnstile for authenticated Zalo users (from Mini App)
  let userProvider = user.app_metadata?.provider || 'email';
  if (userProvider === 'email' && user.email?.startsWith('zalo_')) {
    userProvider = 'zalo';
  }

  if (userProvider !== 'zalo') {
    // Cloudflare Turnstile Verification
    const ip = req.headers.get('x-forwarded-for') || undefined;
    const isTurnstileValid = await verifyTurnstileToken(turnstile_token, ip);
    if (!isTurnstileValid) {
      return NextResponse.json(
        { message: 'Xác thực bảo mật không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.' },
        { status: 400 },
      );
    }
  }

  // 0 — Load global registration system settings
  const { data: settingsData } = await admin
    .from('system_settings')
    .select('config')
    .eq('id', 'global')
    .single();

  const config = settingsData?.config || {};
  const registrationMode = config.registration_mode || 'free'; // 'free' | 'code' | 'disabled'
  const requireEmailVerification = !!config.require_email_verification;

  if (registrationMode === 'disabled') {
    return NextResponse.json(
      { message: 'Tính năng đăng ký đang tạm khóa. Vui lòng liên hệ Admin để tạo tài khoản.' },
      { status: 403 }
    );
  }

  let codeData: any = null;
  if (invitation_code && invitation_code.trim()) {
    const trimmedCode = invitation_code.trim();

    // Query invitation code from DB
    const { data } = await admin
      .from('invitation_codes')
      .select('*')
      .ilike('code', trimmedCode)
      .maybeSingle();
    codeData = data;

    if (!codeData) {
      return NextResponse.json(
        { message: 'Mã mời không tồn tại hoặc không hợp lệ.', field: 'invitation_code' },
        { status: 422 }
      );
    }

    // Check expiration date
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return NextResponse.json(
        { message: 'Mã mời này đã hết hạn sử dụng.', field: 'invitation_code' },
        { status: 422 }
      );
    }

    // Check maximum usage count
    if (codeData.max_uses !== null && codeData.used_count >= codeData.max_uses) {
      return NextResponse.json(
        { message: 'Mã mời này đã đạt giới hạn sử dụng tối đa.', field: 'invitation_code' },
        { status: 422 }
      );
    }
  } else if (registrationMode === 'code') {
    return NextResponse.json(
      { message: 'Yêu cầu nhập mã mời để đăng ký thành viên.', field: 'invitation_code' },
      { status: 422 }
    );
  }

  const [{ count: tenantCount }, { count: reservedCount }] = await Promise.all([
    admin.from('tenants').select('*', { count: 'exact', head: true }).eq('slug', slug),
    admin.from('reserved_subdomains').select('*', { count: 'exact', head: true }).eq('subdomain', slug),
  ]);
  if ((tenantCount ?? 0) > 0 || (reservedCount ?? 0) > 0) {
    const isReserved = (reservedCount ?? 0) > 0;
    return NextResponse.json(
      { message: isReserved ? 'Tên miền này không hợp lệ hoặc đã được bảo lưu.' : 'Subdomain này đã được sử dụng. Hãy chọn tên khác.', field: 'slug' },
      { status: 409 }
    );
  }

  // 1.5 — Pre-check phone uniqueness using Auth API
  let e164Phone: string | null = null;
  if (normalizedPhone) {
    const clean = normalizedPhone.replace(/[^0-9+]/g, '');
    e164Phone = clean.startsWith('0') ? `+84${clean.slice(1)}` : (clean.startsWith('84') ? `+${clean}` : (clean.startsWith('+84') ? clean : `+84${clean}`));
    const phonePlus84 = e164Phone;
    const phone84 = phonePlus84.replace('+', '');
    
    let phoneExistsForAnotherUser = false;
    
    const { data: exists1 } = await admin.rpc('check_phone_exists', { p_phone: phonePlus84, p_exclude_user_id: userId });
    if (exists1) {
      phoneExistsForAnotherUser = true;
    } else {
      const { data: exists2 } = await admin.rpc('check_phone_exists', { p_phone: phone84, p_exclude_user_id: userId });
      if (exists2) {
        phoneExistsForAnotherUser = true;
      }
    }
    
    if (phoneExistsForAnotherUser) {
      return NextResponse.json(
        { message: 'Số điện thoại này đã được sử dụng bởi một tài khoản khác. Vui lòng chọn số khác.', field: 'phone' },
        { status: 409 }
      );
    }
  }

  // 3 — Create tenant + owner membership + subscription (one atomic RPC)
  const { data: tenant, error: tenantError } = await admin.rpc('create_tenant_with_owner', {
    p_name:     name,
    p_slug:     slug,
    p_owner_id: userId,
    p_industry_type: industry_type,
  });
  if (tenantError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ message: tenantError.message }, { status: 400 });
  }
  const tenantId = (tenant as any).id as string;

  // Update subscription to selected plan
  // Freemium model:
  // - No code → default plan_mini (free forever, no trial expiry)
  // - With code → plan + trial_days as defined by the invitation code
  let targetPlanId: number | null = null;
  let trialDays: number | null = null;

  if (codeData) {
    // Code overrides both plan and trial duration
    if (codeData.plan_id) {
      targetPlanId = codeData.plan_id;
    }
    if (codeData.trial_days !== null && codeData.trial_days !== undefined) {
      trialDays = codeData.trial_days;
    }
  }

  // If no code, always default to plan_mini (free forever)
  if (!targetPlanId) {
    const { data: miniPlan } = await admin.from('plans').select('id').eq('code', 'plan_mini').maybeSingle();
    if (miniPlan) {
      targetPlanId = miniPlan.id;
    }
  }

  if (targetPlanId) {
    const updateData: any = { plan_id: targetPlanId };

    if (trialDays !== null && trialDays > 0) {
      // Only set a period_end when there's an actual trial from a code
      // After trial ends, process_subscription_lifecycle() auto-downgrades to plan_mini
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + trialDays);
      updateData.current_period_end = expirationDate.toISOString();
    }
    // For plan_mini (freemium), current_period_end stays as the DB default (2099-12-31)
    // which signals "active forever" to the lifecycle function

    await admin.from('subscriptions').update(updateData).eq('tenant_id', tenantId);
  }

  // 4 — Create default branch (same slug as tenant)
  const { data: createdShop, error: shopError } = await admin.rpc('create_shop', {
    p_tenant_id: tenantId,
    p_name:      name,
    p_slug:      slug,
    p_address:   null,
    p_industry_type: industry_type,
  });
  if (shopError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ message: shopError.message }, { status: 400 });
  }

  // Create default shop settings with allow_negative_stock: true
  try {
    await admin.from('shop_settings').insert({
      shop_id: (createdShop as any).id,
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
    const { getTimeChargeProductId } = await import('@oni/core');
    const { getConnectorForShop } = await import('../../../lib/server/connectorFactory');
    const connector = await getConnectorForShop((createdShop as any).id, tenantId);
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
      branch_id: (createdShop as any).id
    };
    await connector.create('products', newProduct);
  } catch (err) {
    console.error('Failed to auto-init TIME_CHARGE product during registration:', err);
  }


  // 5 — Assign default Local DB connector (System worker, Read-only)
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

  // 6 — Handle Invitation Code Usage Records
  // Track every valid invitation code usage, including optional codes in free-registration mode.
  if (codeData && invitation_code) {
    const trimmedCode = invitation_code.trim();
    
    // Atomic safe increment
    try {
      const { error: rpcError } = await admin.rpc('increment_invitation_code_uses', { p_code: trimmedCode });
      if (rpcError) throw rpcError;
    } catch (e) {
      console.warn('increment_invitation_code_uses RPC failed, trying fallback:', e);
      // Fallback update
      const { data: current } = await admin.from('invitation_codes').select('used_count').ilike('code', trimmedCode).single();
      if (current) {
        await admin.from('invitation_codes').update({ used_count: current.used_count + 1 }).ilike('code', trimmedCode);
      }
    }

    // Log the use
    await admin.from('invitation_code_uses').insert({
      code: trimmedCode,
      tenant_id: tenantId,
      email: user.email || phone || 'unknown',
    });
  }

  const hasInitializedLoginPassword = Boolean(
    (userMetadata as Record<string, any>).has_login_password ||
    (userMetadata as Record<string, any>).temporary_password_initialized_at
  );
  const generatedTemporaryPassword =
    !password && userProvider === 'zalo' && normalizedPhone && !hasInitializedLoginPassword
      ? generateTemporaryPassword()
      : null;
  const effectivePassword = password?.trim() || generatedTemporaryPassword;
  const hasExistingPassword = hasInitializedLoginPassword && !generatedTemporaryPassword;

  let phoneLogin = normalizedPhone;

  if (normalizedPhone) {
    try {
      const nextUserMetadata = {
        ...userMetadata,
      } as Record<string, any>;

      if (effectivePassword) {
        nextUserMetadata.has_login_password = true;
        nextUserMetadata.temporary_password_initialized_at =
          nextUserMetadata.temporary_password_initialized_at || new Date().toISOString();
      }

      const updatePayload: {
        phone?: string;
        phone_confirm: boolean;
        password?: string;
        user_metadata?: Record<string, any>;
      } = {
        phone: e164Phone || undefined,
        phone_confirm: true
      };

      if (effectivePassword) {
        updatePayload.password = effectivePassword;
        updatePayload.user_metadata = nextUserMetadata;
      }

      // Always sync phone, but only initialize password once for Zalo users.
      const { error: userUpdateError } = await admin.auth.admin.updateUserById(userId, updatePayload);

      if (userUpdateError) {
        console.warn('Could not set user phone/password in Auth:', userUpdateError.message);
        phoneLogin = null;
      }
    } catch (e) {
      console.error('Failed to update user phone/password', e);
    }
  }

  const workspaceUrl = `${protocol}://${slug}.${rootDomain}`;



  return NextResponse.json({
    tenant_id: tenantId,
    workspace_url: workspaceUrl,
    email: user.email || 'unknown',
    slug,
    verification_required: false,
    phone_login: phoneLogin,
    phone: normalizedPhone,
    temporary_password: generatedTemporaryPassword,
    has_existing_password: hasExistingPassword,
    provider: userProvider
  }, { status: 201 });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: error.message || 'Lỗi hệ thống. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}

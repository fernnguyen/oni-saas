import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { getSupabaseServerClient } from '../../../lib/server/supabaseServer';
import { verifyTurnstileToken } from '../../../lib/server/turnstile';
import { INDUSTRY_TYPES } from '@oni/core';
import { formatPhoneAsEmail, isValidVNPhone } from '../../../lib/utils/phone';

// Reject fake tenant emails — these are reserved for tenant user accounts
const ONI_FAKE_EMAIL_RE = /^[^@]+@[^.]+\.oni\.vn$/i;

const schema = z.object({
  slug:            z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Chỉ dùng chữ thường, số và dấu gạch ngang'),
  name:            z.string().min(2).max(100),
  email:           z.string().min(1).refine(
    (e) => e.includes('@') || isValidVNPhone(e),
    { message: 'Email hoặc Số điện thoại không hợp lệ' }
  ).refine(
    (e) => !ONI_FAKE_EMAIL_RE.test(e),
    { message: 'Không thể đăng ký với định dạng này' },
  ),
  password:        z.string().min(8),
  plan_code:       z.string().optional(),
  industry_type:   z.enum(INDUSTRY_TYPES).default('retail'),
  turnstile_token: z.string().optional(),
  invitation_code: z.string().optional(),
});

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

  const { slug, name, email: rawEmail, password, industry_type, turnstile_token, invitation_code } = parsed.data;

  try {

  const email = (!rawEmail.includes('@') && isValidVNPhone(rawEmail)) 
    ? formatPhoneAsEmail(rawEmail) 
    : rawEmail;

  // Cloudflare Turnstile Verification
  const ip = req.headers.get('x-forwarded-for') || undefined;
  const isTurnstileValid = await verifyTurnstileToken(turnstile_token, ip);
  if (!isTurnstileValid) {
    return NextResponse.json(
      { message: 'Xác thực bảo mật không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.' },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();

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

  // 1 — Check slug uniqueness (tenant + reserved subdomains share global slug namespace)
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

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';
  const protocol   = rootDomain.startsWith('localhost') ? 'http' : 'https';

  // 2 — Create auth user (depending on whether email verification is required)
  let userId: string;
  let verificationRequired = false;

  if (requireEmailVerification && !email.endsWith('.oni.vn')) {
    const supabaseClient = await getSupabaseServerClient();
    // signUp automatically triggers confirmation email templates configured in Supabase Auth
    const { data: signUpData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${protocol}://${slug}.${rootDomain}/auth/callback`,
      }
    });

    if (authError) {
      const isDuplicate = authError.message.toLowerCase().includes('already');
      return NextResponse.json(
        { message: isDuplicate ? 'Email này đã được đăng ký.' : authError.message, field: isDuplicate ? 'email' : undefined },
        { status: isDuplicate ? 409 : 400 },
      );
    }

    if (!signUpData.user) {
      return NextResponse.json({ message: 'Không thể tạo tài khoản người dùng.' }, { status: 400 });
    }

    userId = signUpData.user.id;
    verificationRequired = true;
  } else {
    // Pre-confirmed user creation
    const { data: userData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      const isDuplicate = authError.message.toLowerCase().includes('already');
      return NextResponse.json(
        { message: isDuplicate ? 'Email này đã được đăng ký.' : authError.message, field: isDuplicate ? 'email' : undefined },
        { status: isDuplicate ? 409 : 400 },
      );
    }

    userId = userData.user.id;
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
  if (registrationMode === 'code' && invitation_code) {
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
      email: email,
    });
  }

  const workspaceUrl = `${protocol}://${slug}.${rootDomain}`;

  return NextResponse.json({
    tenant_id: tenantId,
    workspace_url: workspaceUrl,
    email,
    slug,
    verification_required: verificationRequired
  }, { status: 201 });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: error.message || 'Lỗi hệ thống. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}


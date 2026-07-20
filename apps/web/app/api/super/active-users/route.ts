export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminUser } from '@/lib/server/auth';
import { getSupabaseAdminClient } from '@/lib/server/supabaseAdmin';

// ─── GET /api/super/active-users ──────────────────────────────────────────────
//
// Returns users sorted by last_sign_in_at DESC.
// Query params:
//   tenant_id  — filter to users belonging to this tenant
//   limit      — max users to return (default 30, max 100)
//
// Data source: Supabase auth.users (via admin.auth.admin.listUsers)
// + user_tenants + user_shops for context.

export async function GET(req: NextRequest) {
  try {
    const user = await getSuperAdminUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp       = req.nextUrl.searchParams;
    const tenantId = sp.get('tenant_id') ?? undefined;
    const limit    = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '30')));

    const admin = getSupabaseAdminClient();

    // ── If filtering by tenant, get user_ids from user_tenants first ──────────
    let allowedUserIds: Set<string> | null = null;
    if (tenantId) {
      const { data: memberships } = await admin
        .from('user_tenants')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .limit(500);
      allowedUserIds = new Set((memberships ?? []).map((m: any) => m.user_id));
    }

    // ── Fetch recent auth users — sorted by last_sign_in_at server-side ───────
    // listUsers doesn't support server-side sort, so we fetch a page and sort in JS.
    // We fetch enough to find the top `limit` most-recently-active users.
    // For tenant-filtered queries: fetch up to allowedUserIds.size users individually
    // to avoid pulling all users. For global: fetch the latest page (perPage capped).

    let authUsers: any[] = [];

    if (tenantId && allowedUserIds && allowedUserIds.size <= 100) {
      // Tenant mode with small user set: fetch by individual IDs
      const fetches = await Promise.all(
        Array.from(allowedUserIds).map((uid) =>
          admin.auth.admin.getUserById(uid).then((r) => r.data?.user).catch(() => null),
        ),
      );
      authUsers = fetches.filter(Boolean);
    } else {
      // Global mode (or large tenant): fetch recent pages — listUsers returns newest first
      // We fetch up to 200 users from the most-recent page(s)
      const perPage = Math.min(200, Math.max(limit * 3, 60));
      const { data, error } = await admin.auth.admin.listUsers({ perPage, page: 1 });
      if (error) throw error;
      authUsers = data.users ?? [];

      // If tenant filter with many users, filter after fetch
      if (tenantId && allowedUserIds) {
        authUsers = authUsers.filter((u: any) => allowedUserIds!.has(u.id));
      }
    }

    // ── Sort by last_sign_in_at DESC, take top `limit` ────────────────────────
    authUsers.sort((a: any, b: any) => {
      const ta = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
      const tb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
      return tb - ta;
    });
    const topUsers = authUsers.slice(0, limit);

    if (topUsers.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // ── Enrich with tenant + shop context from user_tenants ───────────────────
    const userIds = topUsers.map((u: any) => u.id);

    const [membershipsRes, shopMembershipsRes] = await Promise.all([
      admin
        .from('user_tenants')
        .select('user_id, tenant_id, tenants(name, slug), roles(code)')
        .in('user_id', userIds),
      admin
        .from('user_shops')
        .select('user_id, shop_id, shops(name, slug), roles(code)')
        .in('user_id', userIds),
    ]);

    // Build membership maps
    const tenantsByUser = new Map<string, any[]>();
    for (const m of (membershipsRes.data ?? []) as any[]) {
      if (!tenantsByUser.has(m.user_id)) tenantsByUser.set(m.user_id, []);
      tenantsByUser.get(m.user_id)!.push({
        tenantId:   m.tenant_id,
        tenantName: m.tenants?.name ?? null,
        tenantSlug: m.tenants?.slug ?? null,
        role:       m.roles?.code ?? null,
        scope:      'tenant', // tenant-level access (all shops)
      });
    }

    const shopsByUser = new Map<string, any[]>();
    for (const m of (shopMembershipsRes.data ?? []) as any[]) {
      if (!shopsByUser.has(m.user_id)) shopsByUser.set(m.user_id, []);
      shopsByUser.get(m.user_id)!.push({
        shopId:   m.shop_id,
        shopName: m.shops?.name ?? null,
        shopSlug: m.shops?.slug ?? null,
        role:     m.roles?.code ?? null,
        scope:    'shop', // shop-level access only
      });
    }

    // ── Build response ────────────────────────────────────────────────────────
    const now = Date.now();

    const users = topUsers.map((u: any) => {
      const meta       = (u.user_metadata ?? {}) as Record<string, any>;
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      const diffMs     = lastSignIn ? now - lastSignIn.getTime() : null;

      // Online status heuristic:
      //   online   = signed in within last 30 minutes
      //   recent   = signed in within last 24 hours
      //   inactive = more than 24 hours ago
      //   never    = never signed in
      let onlineStatus: 'online' | 'recent' | 'inactive' | 'never';
      if (diffMs === null)                          onlineStatus = 'never';
      else if (diffMs < 30 * 60_000)               onlineStatus = 'online';
      else if (diffMs < 24 * 60 * 60_000)          onlineStatus = 'recent';
      else                                          onlineStatus = 'inactive';

      return {
        id:          u.id,
        email:       u.email ?? null,
        phone:       meta.phone ?? u.phone ?? null,
        displayName: meta.display_name ?? meta.full_name ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt:   u.created_at,
        onlineStatus,
        isSuperAdmin: u.app_metadata?.role === 'super_admin',
        tenants: tenantsByUser.get(u.id) ?? [],
        shops:   shopsByUser.get(u.id)  ?? [],
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error('[super/active-users]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

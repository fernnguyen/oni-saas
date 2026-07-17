import { getSupabaseAdminClient } from '../../../../lib/server/supabaseAdmin';

export type TenantMemberSummary = {
  userId: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  roleCode: string | null;
};

export async function loadTenantMemberSummaries(tenantId: string): Promise<TenantMemberSummary[]> {
  const admin = getSupabaseAdminClient();

  const { data: memberships } = await admin
    .from('user_tenants')
    .select('user_id, roles(code)')
    .eq('tenant_id', tenantId);

  const rows = (memberships ?? []) as Array<{ user_id: string; roles?: { code?: string | null } | null }>;

  const members = await Promise.all(
    rows.map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row.user_id);
      const user = data.user;
      const metadata = (user?.user_metadata ?? {}) as Record<string, any>;

      return {
        userId: row.user_id,
        email: user?.email ?? null,
        phone: (metadata.phone as string | undefined) ?? user?.phone ?? null,
        displayName:
          (metadata.display_name as string | undefined) ??
          (metadata.full_name as string | undefined) ??
          null,
        roleCode: row.roles?.code ?? null,
      } satisfies TenantMemberSummary;
    })
  );

  return members;
}

import { getSupabaseAdminClient } from '../../../lib/server/supabaseAdmin';
import { InvitationsClient } from './InvitationsClient';

export default async function SuperInvitationsPage() {
  const admin = getSupabaseAdminClient();

  // Fetch all invitation codes ordered by creation date
  const { data: codes = [] } = await admin
    .from('invitation_codes')
    .select('*')
    .order('created_at', { ascending: false });

  // Fetch all invitation code uses along with tenant details
  const { data: uses = [] } = await admin
    .from('invitation_code_uses')
    .select('*, tenants(slug, name)')
    .order('used_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Superadmin</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Quản lý mã mời</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tạo, cấp phát và theo dõi lịch sử sử dụng mã mời đăng ký thành viên.</p>
      </div>

      <InvitationsClient initialCodes={codes || []} initialUses={uses || []} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { TenantMemberSummary } from './memberDirectory';

type Props = {
  tenantId: string;
  members: TenantMemberSummary[];
};

export function TenantMembersAdminCard({ tenantId, members }: Props) {
  const [targetMember, setTargetMember] = useState<TenantMemberSummary | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFor, setSuccessFor] = useState<string | null>(null);

  async function handleResetPassword() {
    if (!targetMember) return;
    if (password.trim().length < 6) {
      setError('Mật khẩu tối thiểu 6 ký tự.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/super/tenants/${tenantId}/users/${targetMember.userId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Không thể đặt lại mật khẩu');
      }

      setSuccessFor(targetMember.userId);
      setTargetMember(null);
      setPassword('');
      setShowPassword(false);
    } catch (err: any) {
      setError(err?.message || 'Không thể đặt lại mật khẩu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-semibold text-slate-800 text-sm">Thành viên</span>
          </div>
          <span className="text-xs text-slate-400">{members.length} người</span>
        </div>

        <div className="p-4 space-y-2">
          {members.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">Chưa có thành viên</p>
          ) : (
            members.map((member) => (
              <div key={member.userId} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {member.displayName || member.email || member.phone || member.userId}
                      </p>
                      {member.roleCode ? (
                        <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {member.roleCode}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                      <p>Email: {member.email || 'Chưa có'}</p>
                      <p>SĐT: {member.phone || 'Chưa có'}</p>
                      <p className="font-mono text-[11px] text-slate-400">ID: {member.userId}</p>
                    </div>
                    {successFor === member.userId ? (
                      <p className="mt-2 text-xs font-medium text-green-600">Đã đặt lại mật khẩu thành công.</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetMember(member);
                      setPassword('');
                      setShowPassword(false);
                      setError(null);
                    }}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Reset password
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {targetMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Đặt lại mật khẩu</h3>
              <p className="mt-1 text-sm text-slate-500">
                Áp dụng cho mọi loại user. User đích: {targetMember.displayName || targetMember.email || targetMember.userId}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Mật khẩu mới</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-11 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400"
                  >
                    {showPassword ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setTargetMember(null);
                    setPassword('');
                    setShowPassword(false);
                    setError(null);
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
                >
                  {loading ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

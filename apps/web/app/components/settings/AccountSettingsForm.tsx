'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

interface Props {
  initialDisplayName: string;
  userEmail: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface TotpFactor {
  id: string;
  friendly_name: string;
  factor_type: string;
  status: string;
}

interface EnrollData {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function AccountSettingsForm({ initialDisplayName, userEmail }: Props) {
  const supabase = getSupabaseBrowserClient();

  // ── MFA Factors ─────────────────────────────────────────────────────────
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorsLoading, setFactorsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (data?.totp) setFactors(data.totp as TotpFactor[]);
      setFactorsLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifiedFactors = factors.filter((f) => f.status === 'verified');
  const has2FA = verifiedFactors.length > 0;

  // ── Helper: verify current password (+ optional TOTP) ───────────────────
  async function verifyIdentity(password: string, totpCode?: string): Promise<string | null> {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    });
    if (signInError) return 'Mật khẩu hiện tại không đúng.';

    if (totpCode !== undefined && verifiedFactors.length > 0) {
      const factor = verifiedFactors[0];
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (chErr || !ch) return 'Không thể tạo thử thách 2FA.';
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: ch.id,
        code: totpCode,
      });
      if (vErr) return 'Mã xác thực 2FA không đúng.';
    }

    return null;
  }

  // ── Profile ──────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [profileState, setProfileState] = useState<SaveState>('idle');
  const [profileError, setProfileError] = useState('');

  async function handleSaveProfile() {
    setProfileState('saving');
    setProfileError('');
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } });
    if (error) { setProfileError(error.message); setProfileState('error'); }
    else { setProfileState('saved'); setTimeout(() => setProfileState('idle'), 2500); }
  }

  // ── Password ─────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTotpCode, setPasswordTotpCode] = useState('');
  const [passwordState, setPasswordState] = useState<SaveState>('idle');
  const [passwordError, setPasswordError] = useState('');

  async function handleChangePassword() {
    setPasswordError('');
    if (!currentPassword) { setPasswordError('Vui lòng nhập mật khẩu hiện tại.'); return; }
    if (!newPassword) { setPasswordError('Vui lòng nhập mật khẩu mới.'); return; }
    if (newPassword.length < 8) { setPasswordError('Mật khẩu mới phải có ít nhất 8 ký tự.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Mật khẩu xác nhận không khớp.'); return; }
    if (has2FA && !passwordTotpCode) { setPasswordError('Vui lòng nhập mã xác thực 2FA.'); return; }

    setPasswordState('saving');
    const err = await verifyIdentity(currentPassword, has2FA ? passwordTotpCode : undefined);
    if (err) { setPasswordError(err); setPasswordState('error'); return; }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordError(error.message); setPasswordState('error'); }
    else {
      setPasswordState('saved');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordTotpCode('');
      setTimeout(() => setPasswordState('idle'), 2500);
    }
  }

  // ── 2FA Enroll ───────────────────────────────────────────────────────────
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [enrollPassword, setEnrollPassword] = useState('');
  const [enrollTotpCode, setEnrollTotpCode] = useState('');
  const [enrollState, setEnrollState] = useState<'idle' | 'confirm-password' | 'enrolling' | 'verifying' | 'saving' | 'error'>('idle');
  const [enrollError, setEnrollError] = useState('');

  async function handleConfirmEnrollPassword() {
    if (!enrollPassword) { setEnrollError('Vui lòng nhập mật khẩu.'); return; }
    setEnrollError('');
    setEnrollState('enrolling');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: userEmail, password: enrollPassword });
    if (signInError) { setEnrollError('Mật khẩu không đúng.'); setEnrollState('confirm-password'); return; }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator' });
    if (error || !data) {
      setEnrollError(error?.message ?? 'Không thể khởi tạo xác thực 2 yếu tố.');
      setEnrollState('error');
      return;
    }
    setEnrollData({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    setEnrollState('verifying');
  }

  async function handleVerify2FA() {
    if (!enrollData) return;
    if (enrollTotpCode.length !== 6) { setEnrollError('Vui lòng nhập mã 6 chữ số.'); return; }
    setEnrollError('');
    setEnrollState('saving');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.factorId, code: enrollTotpCode });
    if (error) { setEnrollError('Mã không đúng. Vui lòng thử lại.'); setEnrollState('verifying'); return; }
    const { data } = await supabase.auth.mfa.listFactors();
    if (data?.totp) setFactors(data.totp as TotpFactor[]);
    setEnrollData(null); setEnrollPassword(''); setEnrollTotpCode(''); setEnrollState('idle');
  }

  async function handleCancelEnroll() {
    if (enrollData) await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId }).catch(() => {});
    setEnrollData(null); setEnrollPassword(''); setEnrollTotpCode(''); setEnrollError(''); setEnrollState('idle');
  }

  // ── 2FA Unenroll ─────────────────────────────────────────────────────────
  const [unenrollFactorId, setUnenrollFactorId] = useState<string | null>(null);
  const [unenrollPassword, setUnenrollPassword] = useState('');
  const [unenrollTotpCode, setUnenrollTotpCode] = useState('');
  const [unenrollState, setUnenrollState] = useState<SaveState>('idle');
  const [unenrollError, setUnenrollError] = useState('');

  function openUnenroll(factorId: string) {
    setUnenrollFactorId(factorId);
    setUnenrollPassword(''); setUnenrollTotpCode(''); setUnenrollError(''); setUnenrollState('idle');
  }

  function closeUnenroll() {
    setUnenrollFactorId(null);
    setUnenrollPassword(''); setUnenrollTotpCode(''); setUnenrollError(''); setUnenrollState('idle');
  }

  async function handleUnenroll() {
    if (!unenrollFactorId) return;
    if (!unenrollPassword) { setUnenrollError('Vui lòng nhập mật khẩu.'); return; }
    if (unenrollTotpCode.length !== 6) { setUnenrollError('Vui lòng nhập mã 2FA 6 chữ số.'); return; }

    setUnenrollState('saving');
    setUnenrollError('');
    const err = await verifyIdentity(unenrollPassword, unenrollTotpCode);
    if (err) { setUnenrollError(err); setUnenrollState('error'); return; }

    const { error } = await supabase.auth.mfa.unenroll({ factorId: unenrollFactorId });
    if (error) { setUnenrollError(error.message); setUnenrollState('error'); return; }

    setFactors((prev) => prev.filter((f) => f.id !== unenrollFactorId));
    closeUnenroll();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

      {/* ── Left column ── */}
      <div className="space-y-6 lg:col-span-2">

        {/* Profile */}
        <Section title="Hồ sơ cá nhân" description="Tên hiển thị trong hệ thống">
          <Field label="Email" hint="Không thể thay đổi">
            <div className={`${inputCls} bg-slate-50 text-slate-400 cursor-not-allowed`}>{userEmail}</div>
          </Field>
          <Field label="Tên hiển thị">
            <input
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setProfileState('idle'); }}
              className={inputCls}
              placeholder="Nhập tên hiển thị"
              maxLength={60}
            />
          </Field>
          {profileError && <p className="text-sm text-red-600">{profileError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSaveProfile}
              disabled={profileState === 'saving'}
              className="cursor-pointer rounded-xl bg-[#0268FF] px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {profileState === 'saving' ? 'Đang lưu...' : 'Lưu tên'}
            </button>
            {profileState === 'saved' && <p className="text-sm text-green-600">Đã lưu thành công.</p>}
          </div>
        </Section>

        {/* Password */}
        <Section title="Đổi mật khẩu" description="Cần xác minh danh tính trước khi thay đổi mật khẩu">
          <Field label="Mật khẩu hiện tại">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPasswordState('idle'); setPasswordError(''); }}
              className={inputCls}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordState('idle'); setPasswordError(''); }}
              className={inputCls}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Xác nhận mật khẩu mới">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordState('idle'); setPasswordError(''); }}
              className={inputCls}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </Field>
          {has2FA && (
            <Field label="Mã xác thực 2FA" hint="Từ ứng dụng Authenticator">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={passwordTotpCode}
                onChange={(e) => { setPasswordTotpCode(e.target.value.replace(/\D/g, '')); setPasswordState('idle'); setPasswordError(''); }}
                className={`${inputCls} max-w-[180px] font-mono tracking-widest text-center`}
                placeholder="000000"
              />
            </Field>
          )}
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleChangePassword}
              disabled={passwordState === 'saving'}
              className="cursor-pointer rounded-xl bg-[#0268FF] px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {passwordState === 'saving' ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
            {passwordState === 'saved' && <p className="text-sm text-green-600">Mật khẩu đã được cập nhật.</p>}
          </div>
        </Section>
      </div>

      {/* ── Right column ── */}
      <div>
        <Section title="Xác thực 2 yếu tố" description="Bảo vệ tài khoản bằng ứng dụng Authenticator">
          {factorsLoading ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : unenrollFactorId ? (
            <UnenrollConfirm
              password={unenrollPassword}
              totpCode={unenrollTotpCode}
              onPasswordChange={(v) => { setUnenrollPassword(v); setUnenrollError(''); }}
              onTotpCodeChange={(v) => { setUnenrollTotpCode(v); setUnenrollError(''); }}
              onConfirm={handleUnenroll}
              onCancel={closeUnenroll}
              error={unenrollError}
              loading={unenrollState === 'saving'}
            />
          ) : enrollState === 'confirm-password' || enrollState === 'enrolling' ? (
            <EnrollPasswordConfirm
              password={enrollPassword}
              onPasswordChange={(v) => { setEnrollPassword(v); setEnrollError(''); }}
              onConfirm={handleConfirmEnrollPassword}
              onCancel={handleCancelEnroll}
              error={enrollError}
              loading={enrollState === 'enrolling'}
            />
          ) : enrollState === 'verifying' || enrollState === 'saving' ? (
            <EnrollFlow
              enrollData={enrollData}
              totpCode={enrollTotpCode}
              onTotpCodeChange={setEnrollTotpCode}
              onVerify={handleVerify2FA}
              onCancel={handleCancelEnroll}
              error={enrollError}
              loading={enrollState === 'saving'}
            />
          ) : verifiedFactors.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                2FA đang hoạt động
              </div>
              {verifiedFactors.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{f.friendly_name || 'Authenticator'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">TOTP</p>
                  </div>
                  <button
                    onClick={() => openUnenroll(f.id)}
                    className="cursor-pointer text-xs text-red-600 hover:text-red-700 hover:underline"
                  >
                    Gỡ bỏ
                  </button>
                </div>
              ))}
              {enrollError && enrollState === 'error' && (
                <p className="text-sm text-red-600">{enrollError}</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center">
              <p className="text-sm text-slate-500 mb-3">Chưa bật xác thực 2 yếu tố.</p>
              <button
                onClick={() => { setEnrollError(''); setEnrollState('confirm-password'); }}
                className="cursor-pointer rounded-xl bg-[#0268FF] px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Bật xác thực 2FA
              </button>
              {enrollError && enrollState === 'error' && (
                <p className="text-sm text-red-600 mt-2">{enrollError}</p>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// ── EnrollPasswordConfirm ───────────────────────────────────────────────────

function EnrollPasswordConfirm({
  password,
  onPasswordChange,
  onConfirm,
  onCancel,
  error,
  loading,
}: {
  password: string;
  onPasswordChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Xác minh mật khẩu trước khi bật xác thực 2 yếu tố.</p>
      <Field label="Mật khẩu hiện tại">
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className={inputCls}
          placeholder="••••••••"
          autoComplete="current-password"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && !loading && onConfirm()}
        />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={loading || !password}
          className="cursor-pointer rounded-xl bg-[#0268FF] px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? 'Đang xác minh...' : 'Tiếp tục'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}

// ── EnrollFlow ──────────────────────────────────────────────────────────────

function EnrollFlow({
  enrollData,
  totpCode,
  onTotpCodeChange,
  onVerify,
  onCancel,
  error,
  loading,
}: {
  enrollData: EnrollData | null;
  totpCode: string;
  onTotpCodeChange: (v: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  error: string;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-slate-800 mb-1">1. Quét mã QR</p>
        <p className="text-xs text-slate-400 mb-3">Dùng Google Authenticator, Authy hoặc bất kỳ ứng dụng TOTP nào.</p>
        {enrollData?.qrCode && (
          <div className="inline-block rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {/* qr_code is a data URI — render as img, not dangerouslySetInnerHTML */}
            <img src={enrollData.qrCode} alt="QR Code 2FA" className="h-40 w-40" />
          </div>
        )}
        {enrollData?.secret && (
          <div className="mt-3">
            <p className="text-xs text-slate-500 mb-1">Hoặc nhập thủ công:</p>
            <code className="text-xs bg-slate-100 rounded px-2 py-1 font-mono text-slate-700 break-all select-all">
              {enrollData.secret}
            </code>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800 mb-2">2. Nhập mã xác nhận</p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={totpCode}
          onChange={(e) => onTotpCodeChange(e.target.value.replace(/\D/g, ''))}
          className={`${inputCls} max-w-[180px] text-center text-lg font-mono tracking-widest`}
          placeholder="000000"
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={onVerify}
          disabled={loading || totpCode.length !== 6}
          className="cursor-pointer rounded-xl bg-[#0268FF] px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? 'Đang xác minh...' : 'Xác minh & Bật 2FA'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}

// ── UnenrollConfirm ─────────────────────────────────────────────────────────

function UnenrollConfirm({
  password,
  totpCode,
  onPasswordChange,
  onTotpCodeChange,
  onConfirm,
  onCancel,
  error,
  loading,
}: {
  password: string;
  totpCode: string;
  onPasswordChange: (v: string) => void;
  onTotpCodeChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
        Xác minh danh tính để tắt 2FA. Tài khoản sẽ kém bảo mật hơn.
      </div>
      <Field label="Mật khẩu hiện tại">
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className={inputCls}
          placeholder="••••••••"
          autoComplete="current-password"
          autoFocus
        />
      </Field>
      <Field label="Mã xác thực 2FA" hint="Mã hiện tại từ ứng dụng">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={totpCode}
          onChange={(e) => onTotpCodeChange(e.target.value.replace(/\D/g, ''))}
          className={`${inputCls} max-w-[180px] font-mono tracking-widest text-center`}
          placeholder="000000"
        />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="cursor-pointer rounded-xl bg-red-500 px-5 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
        >
          {loading ? 'Đang xử lý...' : 'Tắt 2FA'}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-[#0268FF] focus:outline-none focus:ring-2 focus:ring-[#0268FF]/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken, getSetting, authorize } from 'zmp-sdk/apis';
import { apiFetch } from '@/services/api';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

export default function LinkZaloPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Only check if Zalo is ALREADY LINKED (silently) to redirect past this screen
    // We do NOT fetch any Zalo profile data until user explicitly clicks the button
    checkIfAlreadyLinked();
  }, []);

  const checkIfAlreadyLinked = async () => {
    try {
      // Only proceed silently if user has previously granted permission
      const hasPermission = await new Promise<boolean>((resolve) => {
        getSetting({
          success: (data) => resolve(!!data.authSetting['scope.userInfo']),
          fail: () => resolve(false),
        });
      });

      if (!hasPermission) {
        // Not granted yet → show link screen, wait for user action
        setChecking(false);
        return;
      }

      const accessToken = await new Promise<string>((resolve, reject) => {
        getAccessToken({
          success: (token) => resolve(token as string),
          fail: () => reject('Cannot get access token'),
        });
      });

      const res = await apiFetch<any>('/api/auth/zalo/verify', {
        method: 'POST',
        body: JSON.stringify({ accessToken }),
      });

      if (res.status === 'LOGGED_IN') {
        // Already linked → skip this page entirely
        navigate('/select-branch', { replace: true });
        return;
      }

      // NOT_LINKED → show link screen, but DO NOT display any profile data
      setChecking(false);
    } catch (e) {
      console.warn('Check Zalo linked failed', e);
      setChecking(false);
    }
  };

  const handleLink = async () => {
    setLoading(true);
    try {
      // Step 1: Explicitly request permission → this shows the Zalo consent sheet
      await new Promise<void>((resolve, reject) => {
        authorize({
          scopes: ['scope.userInfo'],
          success: () => resolve(),
          fail: () => reject(new Error('Bạn cần cấp quyền để liên kết tài khoản Zalo')),
        });
      });

      // Step 2: Get access token after permission granted
      const accessToken = await new Promise<string>((resolve, reject) => {
        getAccessToken({
          success: (token) => resolve(token as string),
          fail: () => reject('Cannot get access token'),
        });
      });

      // Step 3: Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Vui lòng đăng nhập lại');
        navigate('/login', { replace: true });
        return;
      }

      // Step 4: Send to backend to link
      await apiFetch('/api/auth/zalo/link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ accessToken }),
      });

      toast.success('Liên kết thành công!');
      navigate('/select-branch', { replace: true });
    } catch (e: any) {
      if (e.message?.includes('đã được liên kết với một tài khoản khác')) {
        toast.error('Tài khoản Zalo này đã liên kết với người dùng khác. Vui lòng hủy liên kết ở tài khoản đó trước.');
      } else {
        toast.error(e.message || 'Lỗi khi liên kết tài khoản Zalo');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigate('/select-branch', { replace: true });
  };

  if (checking) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4" />
        <p className="text-subtitle">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card flex flex-col items-center text-center">
        {/* Zalo logo icon */}
        <div className="w-16 h-16 mb-5 rounded-2xl overflow-hidden flex items-center justify-center bg-blue-50 border border-blue-100 shadow-sm">
          <img src="/zalo.svg" alt="Zalo" className="w-10 h-10" />
        </div>

        <h2 className="text-xl font-bold mb-2">Liên kết tài khoản Zalo</h2>
        <p className="text-subtitle mb-8 text-sm px-4 leading-relaxed">
          Liên kết để đăng nhập tự động bằng Zalo cho các lần sau, không cần nhập mật khẩu.
        </p>

        <button
          onClick={handleLink}
          disabled={loading}
          className="auth-btn w-full mb-3 flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #0068FF 0%, #0052CC 100%)',
            color: 'white',
          }}
        >
          {loading ? (
            <>
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              <span>Đang xử lý...</span>
            </>
          ) : (
            <>
              <img src="/zalo.svg" alt="" className="w-5 h-5 brightness-0 invert" />
              <span className="font-semibold">Liên kết tài khoản Zalo</span>
            </>
          )}
        </button>

        <button
          onClick={handleSkip}
          disabled={loading}
          className="auth-btn bg-[var(--border)]/30 text-foreground w-full hover:bg-[var(--border)]/50"
        >
          Để sau
        </button>
      </div>
      <p className="mt-6 text-xs text-white/60">Phát triển bởi ONI Software</p>
    </div>
  );
}

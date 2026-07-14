import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken } from 'zmp-sdk/apis';
import { apiFetch } from '@/services/api';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

export default function LinkZaloPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [zaloProfile, setZaloProfile] = useState<any>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
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
        // Already linked, skip this page
        navigate('/select-branch', { replace: true });
        return;
      }
      
      if (res.zaloProfile) {
        setZaloProfile(res.zaloProfile);
      }
    } catch (e) {
      console.warn('Check Zalo linked failed', e);
    } finally {
      setChecking(false);
    }
  };

  const handleLink = async () => {
    setLoading(true);
    try {
      const accessToken = await new Promise<string>((resolve, reject) => {
        getAccessToken({
          success: (token) => resolve(token as string),
          fail: () => reject('Cannot get access token'),
        });
      });
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
         toast.error('Vui lòng đăng nhập lại');
         navigate('/login', { replace: true });
         return;
      }

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
      toast.error('Lỗi khi liên kết: ' + e.message);
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
        {zaloProfile?.avatar ? (
           <div className="w-20 h-20 mb-4 rounded-full overflow-hidden shadow-md">
             <img 
               src={zaloProfile.avatar} 
               alt={zaloProfile.name} 
               className="w-full h-full object-cover" 
             />
           </div>
        ) : (
           <div className="w-16 h-16 mb-4 rounded-2xl overflow-hidden flex items-center justify-center bg-blue-100">
             <img src="/zalo.svg" alt="Zalo" className="w-8 h-8" />
           </div>
        )}
        
        <h2 className="text-xl font-bold mb-2">Liên kết tài khoản</h2>
        <p className="text-subtitle mb-8 text-sm px-4">
          Bạn có muốn liên kết với tài khoản Zalo <strong>{zaloProfile?.name}</strong> để đăng nhập nhanh cho các lần sau?
        </p>
        
        <button 
          onClick={handleLink} 
          disabled={loading}
          className="auth-btn auth-btn-primary w-full mb-3"
        >
          {loading ? 'Đang xử lý...' : 'Liên kết ngay'}
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

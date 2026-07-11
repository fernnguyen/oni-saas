import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPhoneNumber, getAccessToken } from 'zmp-sdk/apis';
import toast from 'react-hot-toast';
import { loginWithZaloMiniApp } from '@/services/auth';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleRegisterWithZalo = async () => {
    setLoading(true);
    try {
      getPhoneNumber({
        success: async (data) => {
          try {
            const { token } = data;
            if (!token) throw new Error('Không nhận được token từ Zalo');
            
            // Get access token for the mini app user
            const accessToken = await getAccessToken({});
            
            // Call our backend API to authenticate and get session
            await loginWithZaloMiniApp(token, accessToken);
            
            toast.success('Đăng nhập thành công!');
            // Redirect to dashboard or branch selection
            navigate('/select-branch', { replace: true });
          } catch (error: any) {
            console.error('Lỗi khi gọi API:', error);
            toast.error(error?.message || 'Có lỗi xảy ra khi xác thực');
            setLoading(false);
          }
        },
        fail: (error) => {
          console.error('Từ chối cấp quyền số điện thoại', error);
          toast.error('Vui lòng cấp quyền số điện thoại để tiếp tục');
          setLoading(false);
        }
      });
    } catch (err) {
      console.error('Lỗi zmp-sdk:', err);
      toast.error('Không thể kết nối Zalo');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 mb-3 shadow-lg rounded-2xl overflow-hidden flex items-center justify-center">
            <img
              src="/logo.png"
              alt="ONI"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML =
                  '<div class="w-full h-full bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_srgb,var(--primary)_70%,#000)] flex items-center justify-center rounded-2xl"><span class="text-xl font-black text-white">ONI</span></div>';
              }}
            />
          </div>
          <h1 className="text-xl font-bold text-foreground">Bắt đầu hành trình số hóa</h1>
          <p className="text-sm text-subtitle mt-1 text-center">Thiết lập hệ thống quản lý chuyên nghiệp cho cửa hàng của bạn.</p>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleRegisterWithZalo}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M4 12a8 8 0 018-8" opacity="0.75" />
                </svg>
                <span>Đang kết nối...</span>
              </span>
            ) : (
              <>
                <img src="/zalo.svg" alt="Zalo" className="w-5 h-5" />
                <span>Đăng ký qua Zalo</span>
              </>
            )}
          </button>
          
          <p className="mt-6 text-center text-sm text-subtitle">
            Bằng việc tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của chúng tôi.
          </p>

          <p className="mt-8 text-center text-sm text-subtitle">
            Đã có tài khoản?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-[var(--primary)] font-semibold"
            >
              Đăng nhập ngay
            </button>
          </p>
        </div>
      </div>

      {/* Footer branding */}
      <p className="mt-6 text-xs text-white/60">Phát triển bởi ONI Software</p>
    </div>
  );
}

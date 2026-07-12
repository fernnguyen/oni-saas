'use client';

import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export function UnauthorizedWorkspace() {
  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/signin';
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-4 max-w-sm p-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm animate-in fade-in zoom-in-95 duration-250">
        <div className="mx-auto w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center border border-red-100 mb-2">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-1">
          <h2 className="text-slate-900 font-bold text-lg">Không có quyền truy cập</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Tài khoản của bạn chưa được thêm vào workspace này.
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={handleSignOut}
            className="w-full rounded-xl bg-red-650 hover:bg-red-700 text-white font-semibold py-2.5 px-4 text-sm transition-colors cursor-pointer shadow-sm hover:shadow active:scale-98"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}

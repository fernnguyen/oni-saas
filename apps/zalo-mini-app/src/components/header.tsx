import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useRouteHandle } from "@/hooks";
import { useTenantStore } from "@/stores/tenant-store";
import { useAuthStore } from "@/stores/auth-store";
import { getApiBaseUrl, getApiHeaders } from "@/lib/api-config";
import toast from "react-hot-toast";

interface Shop {
  id: string;
  name: string;
  slug?: string;
  address?: string;
  industry_type?: string;
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [handle] = useRouteHandle();
  
  const tenant = useTenantStore((s) => s.tenant);
  const shop = useTenantStore((s) => s.shop);
  const setShop = useTenantStore((s) => s.setShop);
  const logout = useAuthStore((s) => s.logout);
  const profile = useAuthStore((s) => s.profile);

  const title = typeof handle?.title === "string" ? handle.title : "";
  const showBack = location.key !== "default" && !handle?.noBack && !["/", "/orders", "/pos", "/cashbook", "/customers", "/settings"].includes(location.pathname);

  // Modal & Sidebar states
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [branches, setBranches] = useState<Shop[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<Shop | null>(null);

  const appVersion = import.meta.env.VITE_APP_VERSION || "v0.1.0-dev";

  // Fetch branches list when tenant ID is ready
  useEffect(() => {
    if (!tenant?.id) return;
    const fetchBranches = async () => {
      setLoadingBranches(true);
      try {
        const baseUrl = getApiBaseUrl();
        const headers = await getApiHeaders();
        const res = await fetch(`${baseUrl}/api/shops?tenant_id=${tenant.id}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setBranches(data.shops || []);
        }
      } catch (err) {
        console.error("Error fetching branches in Header:", err);
      } finally {
        setLoadingBranches(false);
      }
    };
    fetchBranches();
  }, [tenant?.id]);

  const handleSelectBranch = (selectedShop: Shop) => {
    setPendingBranch(selectedShop);
  };

  const confirmSwitchBranch = () => {
    if (!pendingBranch) return;
    setShop({
      id: pendingBranch.id,
      name: pendingBranch.name || "Chi nhánh",
      slug: pendingBranch.slug || pendingBranch.id,
      address: pendingBranch.address,
      industry_type: pendingBranch.industry_type,
    });
    const branchName = pendingBranch.name;
    setPendingBranch(null);
    setShowBranchModal(false);
    toast.success(`Đã chuyển sang chi nhánh: ${branchName}`);
    
    // Force a full reload to refresh all pages data for the new branch
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  const triggerLogout = () => {
    setShowSidebar(false);
    setShowLogoutConfirm(true);
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
    toast.success("Đã đăng xuất tài khoản");
  };

  return (
    <div className="w-full flex flex-col px-4 bg-primary text-primaryForeground pt-st relative z-40">
      <div className="w-full min-h-12 flex py-2 items-center justify-between">
        
        {showBack ? (
          // ── DETAIL SCREEN HEADER ──
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', padding: 6, display: 'flex', alignItems: 'center', color: 'white', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div className="text-lg font-bold truncate">{title}</div>
          </div>
        ) : (
          // ── MAIN TAB HEADER WITH HAMBURGER & BRANCH SELECTOR ──
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            
            {/* Hamburger Button */}
            <button
              type="button"
              onClick={() => setShowSidebar(true)}
              style={{ background: 'none', border: 'none', padding: 6, display: 'flex', alignItems: 'center', color: 'white', cursor: 'pointer' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Clickable Branch Selector Block */}
            <div
              onClick={() => setShowBranchModal(true)}
              style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', flex: 1, overflow: 'hidden' }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8, letterSpacing: '0.5px' }}>
                CHI NHÁNH
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {shop?.name || "Chọn chi nhánh"}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            {/* Removed right side title span */}
          </div>
        )}
      </div>

      {/* ════════════════════ SIDEBAR DRAWER (Left sliding menu) ════════════════════ */}
      {showSidebar && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1000, justifyContent: 'flex-start', alignItems: 'stretch' }}
          onClick={() => setShowSidebar(false)}
        >
          <div
            style={{
              width: 280,
              maxWidth: '85vw',
              background: 'white',
              color: '#1e293b',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
              animation: 'slideInLeft 0.25s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sidebar Header */}
            <div style={{ padding: 'calc(var(--safe-area-inset-top, 24px) + 16px) 20px 16px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-black text-lg">
                {tenant?.name?.charAt(0).toUpperCase() || "O"}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }} className="truncate">
                  {tenant?.name || "ONI SaaS"}
                </h3>
                <p style={{ margin: 0, fontSize: 10, opacity: 0.8 }} className="truncate">
                  {shop?.name || "Chưa chọn chi nhánh"}
                </p>
              </div>
            </div>

            {/* User Profile Card */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block' }} className="truncate">
                  {profile?.full_name || "Người dùng"}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }} className="truncate">
                  {profile?.email}
                </span>
              </div>
            </div>

            {/* Sidebar Navigation Links */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
              <div onClick={() => { setShowSidebar(false); navigate("/"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                Tổng quan
              </div>
              <div onClick={() => { setShowSidebar(false); navigate("/pos"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                Bán hàng (POS)
              </div>
              <div onClick={() => { setShowSidebar(false); navigate("/orders"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                Quản lý đơn hàng
              </div>
              <div onClick={() => { setShowSidebar(false); navigate("/cashbook"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                Sổ quỹ thu chi
              </div>
              <div onClick={() => { setShowSidebar(false); navigate("/customers"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Quản lý khách hàng
              </div>
              <div onClick={() => { setShowSidebar(false); navigate("/products"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                Quản lý sản phẩm
              </div>
              <div onClick={() => { setShowSidebar(false); navigate("/qr-orders"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><rect x="7" y="7" width="3" height="3" /><rect x="14" y="7" width="3" height="3" /><rect x="7" y="14" width="3" height="3" /><rect x="14" y="14" width="3" height="3" /></svg>
                Đơn đặt món QR
              </div>
              <div onClick={() => { setShowSidebar(false); navigate("/settings"); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                Cài đặt hệ thống
              </div>
            </div>

            {/* Sidebar Logout Footer */}
            <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
                Phiên bản {appVersion}
              </div>
              <button
                type="button"
                onClick={triggerLogout}
                style={{
                  width: '100%',
                  height: 40,
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  color: '#dc2626',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Đăng xuất
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ════════════════════ BRANCHES SELECT DIALOG MODAL ════════════════════ */}
      {showBranchModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100, alignItems: 'center' }} onClick={() => setShowBranchModal(false)}>
          <div className="modal-content modal-content-center" style={{ maxWidth: 360, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '0 0 12px', borderBottom: '1px solid #cbd5e1' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1e293b' }}>Chọn chi nhánh làm việc</h3>
              <button
                type="button"
                onClick={() => setShowBranchModal(false)}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loadingBranches ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b', fontSize: 13 }}>
                  Đang tải danh sách...
                </div>
              ) : branches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13 }}>
                  Không tìm thấy chi nhánh nào
                </div>
              ) : (
                branches.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => handleSelectBranch(b)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1.5px solid',
                      borderColor: shop?.id === b.id ? 'var(--primary)' : '#e2e8f0',
                      background: shop?.id === b.id ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10
                    }}
                  >
                    {/* Circle icon */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: shop?.id === b.id ? 'var(--primary)' : '#f1f5f9',
                        color: shop?.id === b.id ? 'white' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 12
                      }}
                    >
                      {b.name?.charAt(0).toUpperCase()}
                    </div>
                    
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                        {b.name}
                      </span>
                      {b.address && (
                        <span style={{ display: 'block', fontSize: 10, color: '#64748b' }} className="truncate">
                          {b.address}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── SUB-MODAL: CONFIRM BRANCH SWITCH ── */}
      {pendingBranch && (
        <div className="modal-backdrop" style={{ zIndex: 1200, alignItems: 'center' }} onClick={() => setPendingBranch(null)}>
          <div className="modal-content modal-content-center" style={{ maxWidth: 320, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '0 0 10px', borderBottom: '1px solid #cbd5e1' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#1e293b' }}>Xác nhận chuyển</h3>
              <button
                type="button"
                onClick={() => setPendingBranch(null)}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div style={{ margin: '14px 0', fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn chuyển sang làm việc tại chi nhánh <strong style={{ color: '#1e293b' }}>{pendingBranch.name}</strong> không?
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setPendingBranch(null)}
                style={{
                  flex: 1, height: 38, border: '1.5px solid #cbd5e1', borderRadius: 8,
                  background: 'white', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmSwitchBranch}
                style={{
                  flex: 1, height: 38, border: 'none', borderRadius: 8,
                  background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── SUB-MODAL: CONFIRM LOGOUT ── */}
      {showLogoutConfirm && (
        <div className="modal-backdrop" style={{ zIndex: 1200, alignItems: 'center' }} onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-content modal-content-center" style={{ maxWidth: 320, padding: 18 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '0 0 10px', borderBottom: '1px solid #cbd5e1' }}>
              <h3 style={{ fontSize: 15, fontStyle: 'normal', fontWeight: 700, margin: 0, color: '#ef4444' }}>Xác nhận đăng xuất</h3>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            
            <div style={{ margin: '14px 0', fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn đăng xuất khỏi tài khoản không?
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  flex: 1, height: 38, border: '1.5px solid #cbd5e1', borderRadius: 8,
                  background: 'white', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                style={{
                  flex: 1, height: 38, border: 'none', borderRadius: 8,
                  background: '#ef4444', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

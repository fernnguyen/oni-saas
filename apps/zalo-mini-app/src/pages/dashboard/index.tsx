import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useTenantStore } from '@/stores/tenant-store';

const SUMMARY_CARDS = [
  {
    label: 'Doanh thu hôm nay',
    value: '--',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    color: 'bg-green-50',
  },
  {
    label: 'Đơn hàng mới',
    value: '0',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
    color: 'bg-blue-50',
  },
  {
    label: 'Sản phẩm',
    value: '0',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    color: 'bg-purple-50',
  },
  {
    label: 'Khách hàng',
    value: '0',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    color: 'bg-amber-50',
  },
];

const QUICK_ACTIONS = [
  { label: 'Tạo đơn hàng', path: '/orders', icon: '📝' },
  { label: 'Xem sản phẩm', path: '/products', icon: '📦' },
  { label: 'Cài đặt', path: '/settings', icon: '⚙️' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const shop = useTenantStore((s) => s.shop);

  const userName = profile?.full_name || profile?.email || 'Người dùng';

  return (
    <div className="min-h-full bg-background pb-4">
      {/* Welcome */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-lg font-bold text-foreground">
          Xin chào, {userName} 👋
        </h2>
        {shop?.name && (
          <p className="text-sm text-subtitle mt-0.5">{shop.name}</p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {SUMMARY_CARDS.map((card) => (
          <div key={card.label} className="dashboard-card">
            <div className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center mb-3`}>
              {card.icon}
            </div>
            <p className="text-xl font-bold text-foreground">{card.value}</p>
            <p className="text-2xs text-subtitle mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Truy cập nhanh</h3>
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="dashboard-card flex flex-col items-center justify-center py-4 active:scale-95 transition-transform"
            >
              <span className="text-2xl mb-1.5">{action.icon}</span>
              <span className="text-2xs text-foreground font-medium text-center">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

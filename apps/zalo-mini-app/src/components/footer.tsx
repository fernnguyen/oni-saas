import TransitionLink from "./transition-link";
import { useRouteHandle } from "@/hooks";

function HomeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function OrdersIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function PosIcon({ active }: { active?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={active ? "var(--primary)" : "white"} stroke={active ? "white" : "white"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function CustomersIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SettingsIcon({ active }: { active?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#94a3b8"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV_ITEMS = [
  { name: "Tổng quan", path: "/", icon: HomeIcon },
  { name: "Đơn hàng", path: "/orders", icon: OrdersIcon },
  { name: "Bán hàng", path: "/pos", icon: PosIcon, isFab: true },
  { name: "Khách hàng", path: "/customers", icon: CustomersIcon },
  { name: "Cài đặt", path: "/settings", icon: SettingsIcon },
];

export default function Footer() {
  const [handle] = useRouteHandle();

  if (handle?.noFooter) return null;

  return (
    <div className="footer-nav">
      {NAV_ITEMS.map((item) => (
        <TransitionLink
          to={item.path}
          key={item.path}
          className={`footer-nav-item ${item.isFab ? 'footer-nav-fab' : ''}`}
        >
          {({ isActive }) => (
            <>
              {item.isFab ? (
                <div className="footer-fab-button">
                  <item.icon active={true} />
                </div>
              ) : (
                <div className="w-6 h-6 flex justify-center items-center">
                  <item.icon active={isActive} />
                </div>
              )}
              <div className={`text-2xs mt-0.5 ${item.isFab ? 'text-[var(--primary)] font-semibold' : isActive ? 'text-primary font-medium' : 'text-[#94a3b8]'}`}>
                {item.name}
              </div>
            </>
          )}
        </TransitionLink>
      ))}
    </div>
  );
}

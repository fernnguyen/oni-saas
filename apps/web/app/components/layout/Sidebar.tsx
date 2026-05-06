import Link from 'next/link';

const navItems = [
  { href: '/dashboard', label: 'Tổng quan' },
  { href: '/dashboard/products', label: 'Sản phẩm' },
  { href: '/dashboard/tenants', label: 'Gian hàng' },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-[#0F172A] text-slate-200 border-r border-slate-800">
      <div className="p-4 text-white font-bold text-xl border-b border-slate-800">ONI.vn</div>
      <nav className="flex-1 p-4 space-y-2">
        <div className="text-xs uppercase text-slate-500 font-bold mb-2">Quản lý</div>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-slate-800 hover:text-white">
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

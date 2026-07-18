import Link from 'next/link';
import Image from 'next/image';
import { ALL_SECTORS } from './industriesData';

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-20 border-t border-slate-850">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 md:grid-cols-4 lg:grid-cols-5 mb-16 pb-12 border-b border-slate-800">
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.png" alt="ONI.vn" width={44} height={44} className="rounded-xl border border-slate-800" />
              <span className="text-xl font-black tracking-tight text-white">ONI.vn</span>
            </Link>
            <p className="text-sm text-slate-500 font-medium max-w-sm leading-relaxed">
              Nền tảng quản lý bán hàng dành cho HKD, doanh nghiệp vừa và nhỏ
            </p>
            <div className="space-y-2 text-sm text-slate-400">
              <p className="font-semibold text-white">Đơn vị quản lý: HKD Phần mềm ONI</p>
              <p>Địa chỉ: Thôn 4, xã Quỳnh Văn, tỉnh Nghệ An</p>
              <p>
                Email:{' '}
                <a href="mailto:support@oni.vn" className="font-semibold text-slate-200 hover:text-white transition-colors">
                  support@oni.vn
                </a>
              </p>
            </div>
            {/* <div className="text-xs text-slate-500 font-bold">
              &copy; {new Date().getFullYear()} ONI.vn. Đã đăng ký bản quyền.
            </div> */}
          </div>
          
          {ALL_SECTORS.map((group) => (
            <div key={group.groupId} className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 border-b border-slate-800 pb-2">{group.groupLabel}</h4>
              <ul className="space-y-2.5 text-xs font-semibold">
                {group.items.map((item, idx) => (
                  <li key={idx}>
                    <Link href={item.href} className="hover:text-primary transition-colors hover:underline">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-500">
          <div className="flex flex-wrap gap-x-8 gap-y-2 justify-center">
            <Link href="/#features" className="hover:text-white transition-colors">Tính năng nghiệp vụ</Link>
            <Link href="/#pricing" className="hover:text-white transition-colors">Bảng giá</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Chính sách bảo mật</Link>
            <Link href="/support" className="hover:text-white transition-colors">Liên hệ hỗ trợ</Link>
            <a href="https://zalo.me/s/3208409885005498355" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Mở Zalo Mini App</a>
          </div>
          <div className="text-[10px] text-slate-600">
            Sản phẩm phục vụ Chuyển đổi số Hộ kinh doanh &amp; Doanh nghiệp Việt Nam.
          </div>
        </div>
      </div>
    </footer>
  );
}

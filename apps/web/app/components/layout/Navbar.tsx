import Link from 'next/link';
import Image from 'next/image';
import { IndustryDropdown } from './IndustryDropdown';
import { LoginButton } from '../../LoginButton';

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="ONI.vn" width={32} height={32} className="rounded-lg" />
          <span className="text-xl font-extrabold tracking-tight text-primary">ONI.vn</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-650">
          <IndustryDropdown />
          <Link href="/#features" className="hover:text-primary transition-colors">Tính năng</Link>
          <Link href="/#how" className="hover:text-primary transition-colors">Cách hoạt động</Link>
          <Link href="/#pricing" className="hover:text-primary transition-colors">Bảng giá</Link>
          <a href="https://zalo.me/g/owlxjd9bqfhocunnrjos" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors text-blue-600 font-bold">Cộng đồng Zalo</a>
        </div>
        <div className="flex items-center gap-3">
          <LoginButton />
          <Link href="/register" id="navbar-cta-register" className="whitespace-nowrap rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-primary-dark hover:shadow-lg transition-all">
            Bắt đầu<span className="hidden sm:inline"> bán hàng</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

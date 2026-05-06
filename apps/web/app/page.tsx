import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold">ONI.vn – Internal POS & Inventory</h1>
      <p className="max-w-xl text-center text-slate-600">
        Multi-tenant SaaS for small shops. Data lives in your own data source (Google Sheets, Supabase, ...).
      </p>
      <div className="flex gap-4">
        <Link href="/auth/signup" className="rounded bg-slate-900 px-4 py-2 text-white">
          Đăng ký
        </Link>
        <Link href="/auth/signin" className="rounded border border-slate-300 px-4 py-2">
          Đăng nhập
        </Link>
      </div>
    </main>
  );
}

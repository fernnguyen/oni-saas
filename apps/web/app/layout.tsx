import './globals.css';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/app/components/providers/QueryProvider';

export const metadata = {
  title: 'ONI.vn – Nền tảng quản lý bán hàng SaaS',
  description:
    'Hệ thống POS & quản lý kho đa chi nhánh. Dữ liệu thuộc về bạn — BYOD (Bring Your Own Database). AI, Zalo, Telegram tích hợp sẵn.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen bg-slate-50 text-slate-900"
        style={{ fontFamily: "'Inter', sans-serif" }}
        suppressHydrationWarning
      >
        <QueryProvider>
          {children}
          <Toaster position="bottom-left" richColors closeButton />
        </QueryProvider>
      </body>
    </html>
  );
}

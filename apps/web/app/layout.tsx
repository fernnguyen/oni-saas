import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/app/components/providers/QueryProvider';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://oni.vn';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ONI.vn – Phần mềm bán hàng POS - Đơn giản & Hiệu quả',
    template: '%s | ONI.vn',
  },
  description:
    'Phần mềm bán hàng POS, quản lý kho, chuỗi mua hàng và chăm sóc khách hàng đa chi nhánh. Tùy biến kết nối database riêng biệt (BYOD), tích hợp AI, Zalo & Telegram.',
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: siteUrl,
    siteName: 'ONI.vn',
    title: 'ONI.vn – Phần mềm bán hàng POS - Đơn giản & Hiệu quả',
    description:
      'Phần mềm bán hàng POS, quản lý kho, chuỗi mua hàng và chăm sóc khách hàng đa chi nhánh. Tùy biến kết nối database riêng biệt (BYOD), tích hợp AI, Zalo & Telegram.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ONI.vn – Phần mềm bán hàng POS - Đơn giản & Hiệu quả',
    description:
      'Phần mềm bán hàng POS, quản lý kho, chuỗi mua hàng và chăm sóc khách hàng đa chi nhánh. Tùy biến kết nối database riêng biệt (BYOD), tích hợp AI, Zalo & Telegram.',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/icons/apple-icon.png',
  },
  manifest: '/icons/manifest.json',
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
          <Toaster position="top-center" richColors />
        </QueryProvider>
      </body>
    </html>
  );
}

import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/app/components/providers/QueryProvider';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://oni.vn';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ONI.vn – Nền tảng quản trị doanh nghiệp SME',
    template: '%s | ONI.vn',
  },
  description:
    'Hệ thống POS & quản lý kho đa chi nhánh. Dữ liệu thuộc về bạn — BYOD (Bring Your Own Database). AI, Zalo, Telegram tích hợp sẵn.',
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: siteUrl,
    siteName: 'ONI.vn',
    title: 'ONI.vn – Nền tảng quản trị doanh nghiệp SME',
    description:
      'Hệ thống POS & quản lý kho đa chi nhánh. Dữ liệu thuộc về bạn — BYOD (Bring Your Own Database). AI, Zalo, Telegram tích hợp sẵn.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ONI.vn – Nền tảng quản trị doanh nghiệp SME',
    description:
      'Hệ thống POS & quản lý kho đa chi nhánh. Dữ liệu thuộc về bạn — BYOD (Bring Your Own Database). AI, Zalo, Telegram tích hợp sẵn.',
  },
  icons: {
    icon: [
      { url: '/logos/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logos/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/logos/apple-touch-icon.png',
  },
  manifest: '/logos/site.webmanifest',
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

import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'ONI.vn – Multi-tenant POS',
  description: 'Internal control POS / inventory for small businesses.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

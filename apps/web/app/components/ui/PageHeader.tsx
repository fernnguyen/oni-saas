'use client';

import Image from 'next/image';
import { useNavMode } from '../layout/NavModeContext';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const { isHorizontal } = useNavMode();

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {/* When horizontal nav is active, sidebar (with logo) is hidden — show mini logo here */}
        {isHorizontal && (
          <div className="hidden md:flex items-center gap-2 shrink-0 pr-3 border-r border-slate-200 mr-1">
            <Image src="/logo.png" alt="ONI Logo" width={26} height={26} className="rounded-md shrink-0" />
            <div className="flex flex-col justify-center leading-none gap-0.5">
              <span className="font-extrabold text-slate-900 text-xs tracking-wide leading-none">ONI.vn</span>
              <span className="text-[8px] font-black tracking-[0.2em] bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 bg-clip-text text-transparent uppercase leading-none">
                MINI ERP
              </span>
            </div>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

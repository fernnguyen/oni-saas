'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SetupModal } from '../../components/connectors/SetupModal';

interface Props {
  shop: { id: string; tenantId: string; name: string; slug: string };
  connectorStatus: string | null;
  connectorId: string | null;
}

export function ShopDashboard({ shop, connectorStatus }: Props) {
  const [showModal, setShowModal] = useState(connectorStatus !== 'active');
  const [connected, setConnected] = useState(connectorStatus === 'active');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-slate-900">{shop.name}</h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{shop.slug}.oni.vn</p>
        </div>
        <div className="flex items-center gap-3">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Đã kết nối
            </span>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              className="rounded-xl bg-[#0268FF] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0256CC]"
            >
              Cấu hình dữ liệu
            </button>
          )}
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-slate-600">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="p-6">
        {connected ? (
          <p className="text-slate-600">Chi nhánh đang hoạt động.</p>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-slate-500 mb-4">Chi nhánh chưa có nguồn dữ liệu.</p>
            <button
              onClick={() => setShowModal(true)}
              className="rounded-xl bg-[#0268FF] px-4 py-2 text-sm text-white hover:bg-[#0256CC]"
            >
              Bắt đầu cấu hình
            </button>
          </div>
        )}
      </main>

      {showModal && !connected && (
        <SetupModal
          shopId={shop.id}
          onConnected={() => { setConnected(true); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

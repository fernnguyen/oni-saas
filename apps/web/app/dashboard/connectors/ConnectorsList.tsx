'use client';

import { useState } from 'react';
import { SetupModal } from '../../components/connectors/SetupModal';

interface Shop {
  id: string;
  name: string;
  slug: string;
}

interface Connector {
  id: string;
  shop_id: string;
  type: string;
  status: string;
}

interface Props {
  shops: Shop[];
  connectors: Connector[];
}

export function ConnectorsList({ shops, connectors }: Props) {
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [localConnectors, setLocalConnectors] = useState(connectors);

  function getConnector(shopId: string) {
    return localConnectors.find((c) => c.shop_id === shopId);
  }

  function handleConnected() {
    setSelectedShop(null);
    window.location.reload();
  }

  if (shops.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h3 className="font-semibold text-slate-700">Chưa có chi nhánh nào</h3>
        <p className="mt-1 text-sm text-slate-400">Tạo chi nhánh trước khi kết nối dữ liệu.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shops.map((shop) => {
          const connector = getConnector(shop.id);
          const isConnected = !!connector && connector.status !== 'error';

          return (
            <div key={shop.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                    {shop.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">{shop.name}</div>
                    <div className="text-xs text-slate-400">{shop.slug}.oni.vn</div>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                  isConnected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-amber-500'}`} />
                  {isConnected ? 'Đã kết nối' : 'Chưa kết nối'}
                </span>
              </div>

              {connector ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <svg className="h-4 w-4 text-slate-400 shrink-0" viewBox="0 0 18 18" fill="none">
                      <rect width="18" height="18" rx="3" fill="#0F9D58"/>
                      <path d="M4 5h10v8H4z" fill="white" fillOpacity=".2"/>
                      <path d="M5 7h8M5 9h8M5 11h5" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    <span className="text-xs text-slate-600 truncate font-mono">
                      {connector.type === 'google_sheets' ? 'Google Sheets' : connector.type}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedShop(shop.id)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Đổi kết nối
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedShop(shop.id)}
                  className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
                >
                  + Kết nối ngay
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedShop && (
        <SetupModal
          shopId={selectedShop}
          onConnected={handleConnected}
          onClose={() => setSelectedShop(null)}
        />
      )}
    </>
  );
}

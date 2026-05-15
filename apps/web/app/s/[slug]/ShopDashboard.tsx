'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SetupModal } from '../../components/connectors/SetupModal';

interface Props {
  shop: { id: string; tenantId: string; name: string; slug: string };
  connectorStatus: string | null;
  connectorId: string | null;
  homePath: string;
}

const shopModules = [
  { href: '/channels/pos', label: 'Bán tại quầy', description: 'Mở giao diện POS cho nhân viên thao tác trực tiếp.' },
  { href: '/orders', label: 'Đơn hàng', description: 'Tạo đơn, theo dõi trạng thái và xử lý bán hàng hằng ngày.' },
  { href: '/customers', label: 'Khách hàng', description: 'Lưu lịch sử mua hàng và thông tin liên hệ cơ bản.' },
  { href: '/products', label: 'Sản phẩm', description: 'Quản lý danh mục, giá bán, SKU và hàng đang kinh doanh.' },
  { href: '/categories', label: 'Danh mục', description: 'Sắp xếp nhóm sản phẩm để lọc, báo cáo và quản lý nhanh hơn.' },
  { href: '/suppliers', label: 'Nhà cung cấp', description: 'Theo dõi đầu mối nhập hàng và thông tin giao dịch cơ bản.' },
  { href: '/employees', label: 'Nhân viên', description: 'Quản lý hồ sơ bán hàng nội bộ theo từng chi nhánh.' },
  { href: '/inventory', label: 'Kho', description: 'Kiểm tra tồn kho, nhập xuất và các cảnh báo số lượng.' },
  { href: '/reports', label: 'Báo cáo', description: 'Xem doanh thu, hiệu suất bán hàng và đối soát nhanh.' },
];

export function ShopDashboard({ shop, connectorStatus, homePath }: Props) {
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(connectorStatus !== 'active');
  const [connected, setConnected] = useState(connectorStatus === 'active' || searchParams.get('success') === 'connected');
  const error = searchParams.get('error');
  const success = searchParams.get('success');

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{shop.name}</h1>
          <p className="mt-1 text-xs text-slate-400 font-mono">{shop.slug}.oni.vn</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            connected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500'}`} />
            {connected ? 'Đã kết nối dữ liệu' : 'Chưa kết nối dữ liệu'}
          </span>
          {!connected && (
            <button
              onClick={() => setShowModal(true)}
              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark"
            >
              Cấu hình dữ liệu
            </button>
          )}
        </div>
      </section>

      {success === 'connected' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Kết nối Google Sheet thành công cho chi nhánh này.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          Kết nối chưa hoàn tất. Hãy mở lại cấu hình dữ liệu và thử lại.
        </div>
      )}
      {connected ? (
        <p className="text-slate-600">Chi nhánh đang hoạt động.</p>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-500 mb-4">Chi nhánh chưa có nguồn dữ liệu.</p>
          <button
            onClick={() => setShowModal(true)}
            className="rounded-xl bg-primary px-4 py-2 text-sm text-white hover:bg-primary-dark"
          >
            Bắt đầu cấu hình
          </button>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shopModules.map((module) => (
          <a
            key={module.href}
            href={`${homePath === '/' ? '' : homePath}${module.href}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-primary hover:bg-blue-50/40"
          >
            <div className="text-sm font-semibold text-slate-900">{module.label}</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{module.description}</p>
            <div className="mt-4 text-xs font-medium text-primary">Mở module →</div>
          </a>
        ))}
      </section>

      {showModal && !connected && (
        <SetupModal
          tenantId={shop.tenantId}
          onConnected={() => { setConnected(true); setShowModal(false); }}
          onClose={() => setShowModal(false)}
          returnTo={homePath}
        />
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { ConnectorManageModal } from '../connectors/ConnectorManageModal';
import { SetupModal } from '../connectors/SetupModal';

interface ConnectorData {
  connector_id: string;
  tenant_id: string;
  type: string;
  sheet_id: string;
  sheet_title: string;
  sheet_url: string;
  status: string;
  updated_at: string;
}

interface Props {
  tenantId: string;
  connector: ConnectorData | null;
  canManage: boolean;
  planCode?: string;
}

type ConnectorModal = 'closed' | 'manage' | 'setup';

function getConnectorIcon(type: string, className = "h-10 w-10") {
  if (type.startsWith('postgres')) {
    return <img src="/partners/postgresql.svg" className={`${className} object-contain`} alt="PostgreSQL" />;
  }
  if (type.startsWith('mysql')) {
    return <img src="/partners/mysql.svg" className={`${className} object-contain`} alt="MySQL" />;
  }
  if (type === 'google_sheets') {
    return <img src="/partners/google-sheet.svg" className={`${className} object-contain`} alt="Google Sheets" />;
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

const CONNECTOR_TYPES: Record<string, { label: string; description: string; badge?: string; warning?: string }> = {
  postgres_local: {
    label: 'PostgreSQL (Shared)',
    description: 'Database hệ thống ONI, không cần cấu hình',
    badge: 'Mặc định',
    warning: 'Sử dụng database chung của hệ thống ONI. Dữ liệu cũ (nếu có) trên Shared DB sẽ được giữ nguyên.',
  },
  postgres_remote: {
    label: 'PostgreSQL (BYOD)',
    description: 'Kết nối tới PostgreSQL riêng của bạn',
    warning: 'Bạn sẽ kết nối tới database riêng. Đảm bảo đã tạo schema đúng cấu trúc trước khi chuyển.',
  },
  mysql_local: {
    label: 'MySQL (Shared)',
    description: 'Database hệ thống ONI qua MySQL',
    badge: 'Legacy',
    warning: 'MySQL đang trong quá trình ngừng hỗ trợ. Khuyến khích sử dụng PostgreSQL.',
  },
  mysql_remote: {
    label: 'MySQL (BYOD)',
    description: 'Kết nối tới MySQL riêng của bạn',
    warning: 'Bạn sẽ kết nối tới MySQL riêng. Đảm bảo đã tạo schema đúng cấu trúc.',
  },
  google_sheets: {
    label: 'Google Sheets',
    description: 'Sử dụng Google Sheet làm database',
    warning: 'Google Sheets phù hợp cho dữ liệu nhỏ. Hiệu suất sẽ giảm khi dữ liệu lớn.',
  },
};

export function TenantSettingsForm({ tenantId, connector: initialConnector, canManage, planCode }: Props) {
  const isProOrEnterprise = planCode === 'plan_pro' || planCode === 'plan_enterprise';
  const confirm = useConfirm();
  const [connector, setConnector] = useState(initialConnector);
  const [connectorModal, setConnectorModal] = useState<ConnectorModal>('closed');
  const [switching, setSwitching] = useState(false);
  const [byodUri, setByodUri] = useState('');
  const [byodType, setByodType] = useState<'postgres_remote' | 'mysql_remote'>('postgres_remote');
  const [showByod, setShowByod] = useState(false);

  function handleConnectorStatusChange(status: string, title?: string) {
    if (!connector) return;
    setConnector({ ...connector, status, sheet_title: title ?? connector.sheet_title });
  }

  function handleConnected() {
    setConnectorModal('closed');
    window.location.reload();
  }

  const currentType = connector?.type || 'unknown';

  async function switchConnector(type: string, config?: Record<string, unknown>) {
    const meta = CONNECTOR_TYPES[type];
    const currentMeta = CONNECTOR_TYPES[currentType];

    const ok = await confirm({
      title: '⚠️ Chuyển đổi kết nối dữ liệu',
      description: [
        `Bạn đang chuyển từ "${currentMeta?.label ?? currentType}" sang "${meta?.label ?? type}".`,
        '',
        '• Dữ liệu ở connector cũ sẽ KHÔNG bị xóa và có thể khôi phục khi chuyển lại.',
        '• Connector mới sẽ bắt đầu với dữ liệu hiện có trên hệ thống đích (có thể trống).',
        '• Tất cả các chi nhánh sẽ chuyển sang connector mới ngay lập tức.',
        '',
        meta?.warning ?? '',
        '',
        'Chỉ thực hiện nếu bạn hiểu rõ thao tác này.',
      ].join('\n'),
      confirmLabel: 'Tôi hiểu, chuyển connector',
      variant: 'danger',
    });
    if (!ok) return;

    setSwitching(true);
    try {
      const endpoint = type === 'google_sheets'
        ? '/api/connectors/setup'
        : type === 'mysql_local'
        ? '/api/connectors/mysql/connect'
        : '/api/connectors/switch';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, type, config }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Lỗi khi chuyển connector');
      }

      toast.success('Đã chuyển connector thành công');
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi');
    } finally {
      setSwitching(false);
    }
  }

  async function handleByodConnect() {
    if (!byodUri.trim()) { toast.error('Vui lòng nhập connection URI'); return; }
    await switchConnector(byodType, { connection_uri: byodUri.trim() });
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Kết nối dữ liệu</h2>
          <p className="text-xs text-slate-400 mt-0.5">Cấu hình cơ sở dữ liệu cho workspace. Hỗ trợ Shared DB hoặc BYOD (Bring Your Own Database).</p>
        </div>
        <div className="px-6 py-5 space-y-5">
          {!isProOrEnterprise ? (
            <div className="space-y-6">
              {/* Simplified Active Connector display */}
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden p-1">
                    {getConnectorIcon('postgres_local', 'h-8 w-8')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Đang sử dụng</p>
                    <p className="text-sm font-bold text-slate-800 truncate">Shared DB tiêu chuẩn của ONI (PostgreSQL)</p>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Hoạt động
                    </span>
                  </div>
                </div>
              </div>

              {/* Centered Premium Upsell Block - Synchronized with Notification Settings */}
              <div className="border-t border-slate-100 pt-6 px-4 py-8 flex flex-col items-center text-center max-w-2xl mx-auto">
                {/* Visual Row of Partner Data Logos */}
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 p-3 shadow-sm transition-all hover:scale-105 hover:border-blue-300">
                    <img src="/partners/postgresql.svg" className="h-8 w-8 object-contain" alt="PostgreSQL" />
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 p-3 shadow-sm transition-all hover:scale-105 hover:border-blue-300">
                    <img src="/partners/mysql.svg" className="h-8 w-8 object-contain" alt="MySQL" />
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 p-3 shadow-sm transition-all hover:scale-105 hover:border-blue-300">
                    <img src="/partners/google-sheet.svg" className="h-8 w-8 object-contain" alt="Google Sheets" />
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-2">Kết nối dữ liệu riêng (Premium)</h3>
                
                <p className="text-xs text-slate-500 leading-relaxed max-w-lg mb-6">
                  Tính năng <strong>Kết nối dữ liệu riêng</strong> cho phép doanh nghiệp chủ động lưu trữ dữ liệu, dễ dàng truy vấn và tích hợp các công cụ báo cáo bên thứ ba.
                </p>

                {/* Features details breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-xl text-left mb-8">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1">PostgreSQL (BYOD)</span>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Kết nối trực tiếp tới máy chủ PostgreSQL riêng của bạn, bảo mật tuyệt đối và toàn quyền quản trị.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-wide mb-1">MySQL (BYOD)</span>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Đồng bộ hóa mượt mà với cơ sở dữ liệu MySQL doanh nghiệp sẵn có để vận hành hệ thống ổn định.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 flex flex-col items-start">
                    <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-1">Google Sheets Sync</span>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Tự động đồng bộ hai chiều dữ liệu đơn hàng và khách hàng lên bảng tính Google Sheets để phân tích tức thời.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-plan-modal'))}
                  className="cursor-pointer rounded-lg bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>Nâng cấp lên Pro</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Current Connector */}
              {connector ? (
                <ConnectorCard
                  connector={connector}
                  canManage={canManage}
                  onManage={() => {
                    setConnectorModal('manage');
                  }}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                  <p className="text-sm text-slate-500 mb-3">Chưa kết nối dữ liệu nào.</p>
                </div>
              )}

              {/* Info banner */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 flex items-start gap-2.5">
                <span className="text-base mt-0.5">ℹ️</span>
                <div className="text-xs text-blue-700 leading-relaxed">
                  <strong>Về việc chuyển đổi:</strong> Dữ liệu ở connector cũ sẽ <strong>không bị xóa</strong>. 
                  Khi chuyển lại connector cũ, dữ liệu đã lưu trước đó vẫn còn nguyên. 
                  Mỗi loại connector là một "kho" riêng biệt.
                </div>
              </div>

              {/* Connector Type Selector */}
              {canManage && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-3">Chọn loại kết nối</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {Object.entries(CONNECTOR_TYPES).map(([type, meta]) => {
                      const isActive = currentType === type;
                      const isByod = type === 'postgres_remote' || type === 'mysql_remote';

                      return (
                        <button
                          key={type}
                          type="button"
                          disabled={switching || isActive}
                          onClick={() => {
                            if (isActive) return;
                            if (isByod) {
                              setByodType(type as any);
                              setShowByod(true);
                              return;
                            }
                            if (type === 'google_sheets') {
                              setConnectorModal('setup');
                              return;
                            }
                            switchConnector(type);
                          }}
                          className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                            isActive
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          } disabled:opacity-50`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg shrink-0 flex items-center justify-center">
                              {getConnectorIcon(type, "h-8 w-8 rounded-lg")}
                            </span>
                            {meta.badge && (
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                meta.badge === 'Mặc định' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {meta.badge}
                              </span>
                            )}
                            {isActive && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                                Đang dùng
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-800 mt-1">{meta.label}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400 leading-tight">{meta.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* BYOD Connection URI Input */}
              {showByod && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
                  <p className="text-xs font-semibold text-blue-800 mb-2">
                    Kết nối {byodType === 'postgres_remote' ? 'PostgreSQL' : 'MySQL'} riêng
                  </p>
                  <input
                    value={byodUri}
                    onChange={e => setByodUri(e.target.value)}
                    placeholder={byodType === 'postgres_remote'
                      ? 'postgresql://user:pass@host:5432/dbname'
                      : 'mysql://user:pass@host:3306/dbname'
                    }
                    className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary mb-3"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleByodConnect}
                      disabled={switching || !byodUri.trim()}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
                    >
                      {switching ? 'Đang kết nối...' : 'Kết nối'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowByod(false); setByodUri(''); }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Connector modals */}
      {connectorModal === 'manage' && connector && (
        <ConnectorManageModal
          connector={{
            ...connector,
            shop_id: '',
            shop_name: 'Toàn bộ chi nhánh'
          }}
          canManage={canManage}
          onClose={() => setConnectorModal('closed')}
          onChangeSheet={() => setConnectorModal('setup')}
          onStatusChange={handleConnectorStatusChange}
        />
      )}
      {connectorModal === 'setup' && (
        <SetupModal
          tenantId={tenantId}
          onConnected={handleConnected}
          onClose={() => setConnectorModal(connector ? 'manage' : 'closed')}
        />
      )}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  canManage,
  onManage,
}: {
  connector: ConnectorData;
  canManage: boolean;
  onManage: () => void;
}) {
  const isError = connector.status === 'error';
  const typeLabel = CONNECTOR_TYPES[connector.type]?.label ?? connector.type;
  const isGsheet = connector.type === 'google_sheets';
  
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          {getConnectorIcon(connector.type, "h-10 w-10")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{typeLabel}</p>
          <p className="text-xs text-slate-400 font-mono truncate">
            {isGsheet ? (connector.sheet_title || connector.sheet_id) : 'Shared System DB'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`} />
            {isError ? 'Lỗi' : 'Hoạt động'}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>Cập nhật {formatRelative(connector.updated_at)}</span>
        {isGsheet && connector.sheet_url && (
          <a
            href={connector.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            Mở sheet
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
      {canManage && isGsheet && (
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <button
            onClick={onManage}
            className="cursor-pointer flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Quản lý kết nối
          </button>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
  } catch { return ''; }
}

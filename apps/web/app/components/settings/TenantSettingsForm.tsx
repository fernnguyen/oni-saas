'use client';

import { useState } from 'react';
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
}

type ConnectorModal = 'closed' | 'manage' | 'setup';

export function TenantSettingsForm({ tenantId, connector: initialConnector, canManage }: Props) {
  const [connector, setConnector] = useState(initialConnector);
  const [connectorModal, setConnectorModal] = useState<ConnectorModal>('closed');

  function handleConnectorStatusChange(status: string, title?: string) {
    if (!connector) return;
    setConnector({ ...connector, status, sheet_title: title ?? connector.sheet_title });
  }

  function handleConnected() {
    setConnectorModal('closed');
    window.location.reload();
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section
            id="connector"
            title="Kết nối dữ liệu"
            description="Cấu hình cơ sở dữ liệu chung cho tất cả chi nhánh trong workspace"
          >
            {connector ? (
              <ConnectorCard
                connector={connector}
                canManage={canManage}
                onManage={() => setConnectorModal('manage')}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm text-slate-500 mb-3">Chưa kết nối dữ liệu nào cho workspace này.</p>
                {canManage && (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setConnectorModal('setup')}
                      className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      + Kết nối Google Sheet
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/connectors/mysql/connect', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tenant_id: tenantId }),
                          });
                          if (res.ok) handleConnected();
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Sử dụng Local Database
                    </button>
                  </div>
                )}
              </div>
            )}
          </Section>
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

function Section({ id, title, description, children }: { id?: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div id={id} className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

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
  const isMysql = connector.type === 'mysql_local';
  
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm`}>
          {isMysql ? (
            <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 18 18" fill="none">
              <rect width="18" height="18" rx="3" fill="#0F9D58" />
              <path d="M4 5h10v8H4z" fill="white" fillOpacity=".2" />
              <path d="M5 7h8M5 9h8M5 11h5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {isMysql ? 'Database Hệ Thống' : (connector.sheet_title || 'Google Sheet')}
          </p>
          <p className="text-xs text-slate-400 font-mono truncate">
            {isMysql ? 'Shared Local DB' : connector.sheet_id}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isError ? 'bg-red-500' : 'bg-green-500'}`} />
            {isError ? 'Lỗi' : 'Hoạt động'}
          </span>
          {isMysql && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
              Chỉ đọc
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>Cập nhật {formatRelative(connector.updated_at)}</span>
        {!isMysql && (
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
      {canManage && !isMysql && (
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

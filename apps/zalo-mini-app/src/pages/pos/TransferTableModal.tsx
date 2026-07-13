/**
 * TransferTableModal.tsx
 * Modal to transfer or merge an active table session to another table.
 * Ported from mobile useTableManager handleTransferTable / handleMergeTable logic.
 */
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useTableStore } from '@/stores/table-store';
import type { ResourceFull, TableSession } from '@/stores/table-store';
import {
  updateLocationResource,
  updateOrder,
} from '@/services/shop-api';
import { formatCurrency } from '@/utils/format';
import { calculateBilling } from '@/utils/billing';

interface TransferTableModalProps {
  shopId: string;
  sourceTable: ResourceFull;
  session: TableSession;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransferTableModal({
  shopId,
  sourceTable,
  session,
  onClose,
  onSuccess,
}: TransferTableModalProps) {
  const resources = useTableStore((s) => s.resources);
  const tableCarts = useTableStore((s) => s.tableCarts);
  const updateResource = useTableStore((s) => s.updateResource);
  const setTableSession = useTableStore((s) => s.setTableSession);
  const removeTableSession = useTableStore((s) => s.removeTableSession);
  const setTableCart = useTableStore((s) => s.setTableCart);
  const clearTableCart = useTableStore((s) => s.clearTableCart);

  const [mode, setMode] = useState<'transfer' | 'merge'>('transfer');
  const [targetTableId, setTargetTableId] = useState<string>('');
  const [includeStayCost, setIncludeStayCost] = useState(false);
  const [saving, setSaving] = useState(false);

  // Available targets: occupied tables (for merge) or available tables (for transfer)
  const availableTargets = useMemo(() => {
    return resources.filter((r) => {
      if (r.id === sourceTable.id) return false;
      if (mode === 'transfer') return r.status === 'available';
      if (mode === 'merge') return r.status === 'occupied' && r.id !== sourceTable.id;
      return false;
    });
  }, [resources, sourceTable.id, mode]);

  const selectedTarget = availableTargets.find((r) => r.id === targetTableId);

  // Calculate current billing for merge cost display
  const currentBilling = useMemo(() => {
    if (!session.checkInTime) return null;
    return calculateBilling({
      rentalType: session.rentalType,
      checkInISO: session.checkInTime,
      hourlyRate: session.hourlyRate ?? 0,
      dailyRate: session.dailyRate ?? 0,
      overnightRate: session.overnightRate ?? 0,
      advancedPricing: session.advancedPricing,
    });
  }, [session]);

  const handleTransfer = async () => {
    if (!targetTableId || !session.orderId) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      // Build new metadata
      const oldMeta = session;
      const newMeta = {
        ...oldMeta,
        resource_id: targetTableId,
        resource_name: selectedTarget?.name ?? '',
        ...(includeStayCost ? {} : { check_in: now }),
      };

      // 1. Free source
      await updateLocationResource(shopId, sourceTable.id, {
        status: 'cleaning',
        current_order_id: '',
      });

      // 2. Occupy target
      await updateLocationResource(shopId, targetTableId, {
        status: 'occupied',
        current_order_id: session.orderId,
      });

      // 3. Update order metadata
      await updateOrder(shopId, session.orderId, {
        metadata: JSON.stringify(newMeta),
      });

      // 4. Move local state
      updateResource(sourceTable.id, { status: 'cleaning', current_order_id: '' });
      updateResource(targetTableId, { status: 'occupied', current_order_id: session.orderId });

      const movedSession: TableSession = {
        ...session,
        tableId: targetTableId,
        ...(includeStayCost ? {} : { checkInTime: now }),
      };
      setTableSession(targetTableId, movedSession);
      removeTableSession(sourceTable.id);

      // Move cart
      const sourceCart = tableCarts[sourceTable.id] ?? {};
      setTableCart(targetTableId, { ...(tableCarts[targetTableId] ?? {}), ...sourceCart });
      clearTableCart(sourceTable.id);

      toast.success(`Đã chuyển sang ${selectedTarget?.name}`);
      onSuccess();
    } catch (err) {
      console.error('Transfer error:', err);
      toast.error('Không thể chuyển bàn. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    zIndex: 1100, display: 'flex', alignItems: 'flex-end',
  };
  const sheetStyle: React.CSSProperties = {
    background: '#fff', borderRadius: '20px 20px 0 0',
    width: '100%', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', margin: 0 }}>
            Chuyển / Ghép bàn
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>
            Từ: <strong style={{ color: '#374151' }}>{sourceTable.name}</strong>
          </p>
        </div>

        {/* Mode Tabs */}
        <div style={{ display: 'flex', padding: '12px 20px 0', gap: 8 }}>
          {(['transfer', 'merge'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setTargetTableId(''); }}
              style={{
                flex: 1, height: 38, borderRadius: 10,
                border: '1.5px solid',
                borderColor: mode === m ? 'var(--primary, #3b82f6)' : '#e2e8f0',
                background: mode === m ? 'var(--primary, #3b82f6)' : '#f8fafc',
                color: mode === m ? '#fff' : '#64748b',
                fontSize: 13, fontWeight: 600,
              }}
            >
              {m === 'transfer' ? '🔄 Chuyển bàn' : '🔗 Ghép bàn'}
            </button>
          ))}
        </div>

        {/* Description */}
        <div style={{ padding: '8px 20px', background: '#f8fafc', margin: '10px 20px', borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
            {mode === 'transfer'
              ? 'Chuyển toàn bộ đơn hàng sang bàn khác đang trống.'
              : 'Ghép đơn hàng này vào một bàn đang sử dụng.'}
          </p>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
          {/* Merge billing info */}
          {mode === 'merge' && currentBilling && (
            <div style={{
              background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10,
              padding: '10px 14px', marginBottom: 14,
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#92400e', margin: '0 0 2px' }}>
                Tiền thuê hiện tại của {sourceTable.name}
              </p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#d97706', margin: 0 }}>
                {formatCurrency(currentBilling.cost)} ({currentBilling.label})
              </p>
              <p style={{ fontSize: 11, color: '#92400e', margin: '4px 0 0' }}>
                Khoản này sẽ được ghi vào bàn đích khi ghép.
              </p>
            </div>
          )}

          {/* Target table picker */}
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            {mode === 'transfer' ? 'Chọn bàn đích (đang trống):' : 'Chọn bàn để ghép vào:'}
          </p>

          {availableTargets.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '24px 0',
              color: '#94a3b8', fontSize: 13,
            }}>
              {mode === 'transfer' ? '😔 Không có bàn trống nào.' : '😔 Không có bàn đang sử dụng nào khác.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {availableTargets.map((table) => (
                <button
                  key={table.id}
                  onClick={() => setTargetTableId(table.id)}
                  style={{
                    padding: '10px 12px', borderRadius: 12,
                    border: `2px solid ${targetTableId === table.id ? 'var(--primary, #3b82f6)' : '#e2e8f0'}`,
                    background: targetTableId === table.id ? '#eff6ff' : '#f8fafc',
                    textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', margin: 0 }}>{table.name}</p>
                  {table.zone && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{table.zone}</p>}
                </button>
              ))}
            </div>
          )}

          {/* Include stay cost toggle (for transfer) */}
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px', background: '#f8fafc', borderRadius: 10,
              marginBottom: 6, cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={includeStayCost}
              onChange={(e) => setIncludeStayCost(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--primary, #3b82f6)' }}
            />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                Giữ nguyên thời gian check-in
              </p>
              <p style={{ fontSize: 11, color: '#64748b', margin: '1px 0 0' }}>
                Tính phí từ lúc mở bàn gốc (không reset đồng hồ)
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 46, borderRadius: 12,
              border: '1.5px solid #e2e8f0', background: '#f8fafc',
              fontSize: 14, fontWeight: 600, color: '#64748b',
            }}
          >
            Hủy
          </button>
          <button
            onClick={handleTransfer}
            disabled={!targetTableId || saving}
            style={{
              flex: 2, height: 46, borderRadius: 12,
              background: !targetTableId ? '#e2e8f0' : 'var(--primary, #3b82f6)',
              border: 'none',
              fontSize: 14, fontWeight: 700, color: !targetTableId ? '#94a3b8' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? '...' : mode === 'transfer' ? '🔄 Chuyển bàn' : '🔗 Ghép bàn'}
          </button>
        </div>
      </div>
    </div>
  );
}

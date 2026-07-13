/**
 * TableCheckInModal.tsx
 * Bottom-sheet modal to open/check-in a new table or room session.
 * Handles: customer selection, rental type, guest count, check-in time,
 * expected checkout, notes, and lodging guests (for hotel vertical).
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTableStore } from '@/stores/table-store';
import type { ResourceFull, TableSession, LodgingGuest } from '@/stores/table-store';
import { usePosStore } from '@/stores/pos-store';
import { useTenantStore } from '@/stores/tenant-store';
import { useAuthStore } from '@/stores/auth-store';
import {
  createOrder,
  updateLocationResource,
  getCustomers,
  createCustomer,
  type Customer,
} from '@/services/shop-api';
import { isoToDatetimeLocal, formatViDatetime } from '@/utils/billing';
import { formatCurrency } from '@/utils/format';
import { LodgingGuestsForm } from './LodgingGuestsForm';

const emptyGuest = (): LodgingGuest => ({
  name: '', id_type: 'CCCD', id_number: '',
  nationality: 'Việt Nam', dob: '', gender: '', address: '', note: '',
});

interface Props {
  table: ResourceFull;
  onClose: () => void;
  onSuccess: (session: TableSession) => void;
}

export default function TableCheckInModal({ table, onClose, onSuccess }: Props) {
  const shop = useTenantStore((s) => s.shop);
  const shopId = shop?.id ?? '';
  const profile = useAuthStore((s) => s.profile);
  const shopSettings = useTableStore((s) => s.shopSettings);
  const cachedCustomers = usePosStore((s) => s.customers);
  const setTableSession = useTableStore((s) => s.setTableSession);
  const updateResource = useTableStore((s) => s.updateResource);

  const isLodging =
    table.type === 'room' ||
    shop?.industry_type === 'hotel' ||
    shopSettings?.industry_type === 'hotel';

  // ── State ──
  const [tab, setTab] = useState<'info' | 'guests'>('info');
  const [rentalType, setRentalType] = useState<'hourly' | 'daily' | 'overnight'>(
    table.daily_rate ? 'daily' : table.overnight_rate ? 'overnight' : 'hourly'
  );
  const [numGuests, setNumGuests] = useState(1);
  const [note, setNote] = useState('');
  const [checkInTime, setCheckInTime] = useState(isoToDatetimeLocal(new Date().toISOString()));
  const [expectedCheckout, setExpectedCheckout] = useState('');
  const [saving, setSaving] = useState(false);

  // Customer
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [savingNewCust, setSavingNewCust] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lodging guests
  const [lodgingGuests, setLodgingGuests] = useState<LodgingGuest[]>([emptyGuest()]);

  // Update guest list size when numGuests changes
  useEffect(() => {
    setLodgingGuests((prev) => {
      if (prev.length < numGuests) {
        return [...prev, ...Array.from({ length: numGuests - prev.length }, emptyGuest)];
      }
      return prev.slice(0, numGuests);
    });
  }, [numGuests]);

  // Customer search (debounced)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!customerQuery.trim()) {
      setCustomerResults(cachedCustomers.slice(0, 8));
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await getCustomers(shopId, { search: customerQuery, limit: '8' });
        setCustomerResults(res.customers);
      } catch {
        const q = customerQuery.toLowerCase();
        setCustomerResults(
          cachedCustomers.filter(
            (c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
          ).slice(0, 8)
        );
      }
    }, 300);
  }, [customerQuery, shopId, cachedCustomers]);

  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) return;
    setSavingNewCust(true);
    try {
      const created = await createCustomer(shopId, { name: newCustName, phone: newCustPhone });
      setSelectedCustomer(created as Customer);
      setAddingCustomer(false);
      setNewCustName('');
      setNewCustPhone('');
      toast.success('Đã tạo khách hàng');
    } catch {
      toast.error('Không thể tạo khách hàng');
    } finally {
      setSavingNewCust(false);
    }
  };

  // Rate display
  const rateDisplay = useMemo(() => {
    if (rentalType === 'hourly') return table.hourly_rate ? `${formatCurrency(table.hourly_rate)}/giờ` : null;
    if (rentalType === 'daily') return table.daily_rate ? `${formatCurrency(table.daily_rate)}/ngày` : null;
    if (rentalType === 'overnight') return table.overnight_rate ? `${formatCurrency(table.overnight_rate)}/đêm` : null;
    return null;
  }, [rentalType, table]);

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const checkInISO = new Date(checkInTime).toISOString();

      const metadata: any = {
        resource_id: table.id,
        resource_name: table.name,
        check_in: checkInISO,
        num_guests: numGuests,
        rental_type: rentalType,
        expected_checkout: expectedCheckout ? new Date(expectedCheckout).toISOString() : undefined,
        advanced_pricing: (() => {
          try {
            const m = JSON.parse(table.metadata ?? '{}');
            return m.advanced_pricing;
          } catch {
            return undefined;
          }
        })(),
      };

      if (isLodging && lodgingGuests.length > 0) {
        metadata.guests_list = lodgingGuests.filter((g) => g.name);
      }

      // 1. Create order in_progress
      const order = await createOrder(shopId, {
        status: 'in_progress',
        channel: 'zalo',
        customer_id: selectedCustomer?.id,
        note,
        branch_id: shop?.id,
        metadata: JSON.stringify(metadata),
      } as any);

      const orderId = (order as any)?.id ?? (order as any)?.data?.id;
      if (!orderId) throw new Error('No order ID returned');

      // 2. Mark resource occupied
      await updateLocationResource(shopId, table.id, {
        status: 'occupied',
        current_order_id: orderId,
      });

      // 3. Update local state
      const session: TableSession = {
        tableId: table.id,
        orderId,
        rentalType,
        checkInTime: checkInISO,
        numGuests,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        customerPhone: selectedCustomer?.phone,
        note,
        expectedCheckout: expectedCheckout ? new Date(expectedCheckout).toISOString() : undefined,
        hourlyRate: table.hourly_rate,
        dailyRate: table.daily_rate,
        overnightRate: table.overnight_rate,
        advancedPricing: metadata.advanced_pricing,
        lodgingGuests: metadata.guests_list,
      };

      setTableSession(table.id, session);
      updateResource(table.id, { status: 'occupied', current_order_id: orderId });

      toast.success(`Đã mở ${table.name}`);
      onSuccess(session);
    } catch (err) {
      console.error('Check-in error:', err);
      toast.error('Không thể mở bàn. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  // ── Styles ──
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44,
    border: '1.5px solid #e2e8f0', borderRadius: 10,
    padding: '0 12px', fontSize: 13, color: '#0f172a',
    background: '#fff', boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#64748b',
    marginBottom: 4, display: 'block',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0',
          width: '100%', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 17, color: '#0f172a', margin: 0 }}>
                Mở bàn
              </p>
              <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>
                {table.name}{table.zone ? ` · ${table.zone}` : ''}
                {table.capacity ? ` · ${table.capacity} chỗ` : ''}
              </p>
            </div>
            {rateDisplay && (
              <div style={{
                background: '#eff6ff', borderRadius: 8, padding: '4px 10px',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>{rateDisplay}</span>
              </div>
            )}
          </div>

          {/* Tabs for lodging */}
          {isLodging && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {(['info', 'guests'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '6px 16px', borderRadius: 20,
                    border: '1.5px solid',
                    borderColor: tab === t ? 'var(--primary, #3b82f6)' : '#e2e8f0',
                    background: tab === t ? 'var(--primary, #3b82f6)' : '#f8fafc',
                    color: tab === t ? '#fff' : '#64748b',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {t === 'info' ? 'Thông tin' : 'Khách lưu trú'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {tab === 'info' ? (
            <>
              {/* Customer */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Khách hàng</label>
                {selectedCustomer ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10,
                    padding: '10px 14px',
                  }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', margin: 0 }}>{selectedCustomer.name}</p>
                      {selectedCustomer.phone && (
                        <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>{selectedCustomer.phone}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      style={{
                        background: 'none', border: 'none',
                        fontSize: 18, color: '#94a3b8', cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      style={inputStyle}
                      placeholder="Tìm khách hàng..."
                      value={customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value);
                        setShowCustomerDrop(true);
                      }}
                      onFocus={() => {
                        setShowCustomerDrop(true);
                        setCustomerResults(cachedCustomers.slice(0, 8));
                      }}
                    />
                    {showCustomerDrop && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.12)', zIndex: 50,
                        maxHeight: 200, overflowY: 'auto',
                      }}>
                        {customerResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c);
                              setCustomerQuery('');
                              setShowCustomerDrop(false);
                            }}
                            style={{
                              width: '100%', padding: '10px 14px', textAlign: 'left',
                              background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer',
                            }}
                          >
                            <p style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', margin: 0 }}>{c.name}</p>
                            {c.phone && <p style={{ fontSize: 11, color: '#94a3b8', margin: '1px 0 0' }}>{c.phone}</p>}
                          </button>
                        ))}
                        <button
                          onClick={() => { setAddingCustomer(true); setShowCustomerDrop(false); }}
                          style={{
                            width: '100%', padding: '10px 14px', textAlign: 'left',
                            background: '#f8fafc', border: 'none',
                            fontSize: 12, fontWeight: 600, color: '#3b82f6',
                            cursor: 'pointer',
                          }}
                        >
                          + Tạo khách hàng mới
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick add customer */}
              {addingCustomer && (
                <div style={{
                  background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12,
                  padding: 14, marginBottom: 14,
                }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 10 }}>
                    Thêm khách hàng mới
                  </p>
                  <input
                    style={{ ...inputStyle, marginBottom: 8 }}
                    placeholder="Họ và tên *"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                  />
                  <input
                    style={{ ...inputStyle, marginBottom: 10 }}
                    placeholder="Số điện thoại"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    type="tel"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setAddingCustomer(false)}
                      style={{
                        flex: 1, height: 38, borderRadius: 8,
                        border: '1.5px solid #e2e8f0', background: '#fff',
                        fontSize: 13, fontWeight: 600, color: '#64748b',
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleCreateCustomer}
                      disabled={savingNewCust || !newCustName.trim()}
                      style={{
                        flex: 1, height: 38, borderRadius: 8,
                        background: '#3b82f6', border: 'none',
                        fontSize: 13, fontWeight: 700, color: '#fff',
                        opacity: savingNewCust || !newCustName.trim() ? 0.6 : 1,
                      }}
                    >
                      {savingNewCust ? '...' : 'Tạo'}
                    </button>
                  </div>
                </div>
              )}

              {/* Rental type */}
              {isLodging && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Hình thức thuê</label>
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 3 }}>
                    {([
                      { value: 'hourly', label: 'Theo giờ' },
                      { value: 'daily', label: 'Theo ngày' },
                      { value: 'overnight', label: 'Qua đêm' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setRentalType(opt.value)}
                        style={{
                          flex: 1, height: 36, borderRadius: 8, border: 'none',
                          background: rentalType === opt.value ? '#fff' : 'transparent',
                          fontSize: 11, fontWeight: 600,
                          color: rentalType === opt.value ? '#0f172a' : '#94a3b8',
                          boxShadow: rentalType === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Guest count */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Số khách</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button
                    onClick={() => setNumGuests(Math.max(1, numGuests - 1))}
                    style={{
                      width: 40, height: 40, borderRadius: 10,
                      border: '1.5px solid #e2e8f0', background: '#f8fafc',
                      fontSize: 20, color: '#374151',
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', minWidth: 32, textAlign: 'center' }}>
                    {numGuests}
                  </span>
                  <button
                    onClick={() => setNumGuests(numGuests + 1)}
                    style={{
                      width: 40, height: 40, borderRadius: 10,
                      border: '1.5px solid #e2e8f0', background: '#f8fafc',
                      fontSize: 20, color: '#374151',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Check-in time */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Giờ check-in</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                />
              </div>

              {/* Expected checkout (optional) */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Dự kiến trả {table.type === 'room' ? 'phòng' : 'bàn'} (tuỳ chọn)</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={expectedCheckout}
                  onChange={(e) => setExpectedCheckout(e.target.value)}
                />
              </div>

              {/* Note */}
              <div>
                <label style={labelStyle}>Ghi chú</label>
                <textarea
                  style={{ ...inputStyle, height: 72, paddingTop: 10, resize: 'none' }}
                  placeholder="Ghi chú đặc biệt..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          ) : (
            /* Lodging Guests Tab */
            <LodgingGuestsForm
              guests={lodgingGuests}
              onChangeGuests={setLodgingGuests}
              guestCount={numGuests}
              onChangeGuestCount={setNumGuests}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 48, borderRadius: 12,
              border: '1.5px solid #e2e8f0', background: '#f8fafc',
              fontSize: 14, fontWeight: 600, color: '#64748b',
            }}
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              flex: 2, height: 48, borderRadius: 12,
              background: saving ? '#94a3b8' : 'var(--primary, #3b82f6)',
              border: 'none',
              fontSize: 14, fontWeight: 700, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Đang mở...
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Mở {table.type === 'room' ? 'phòng' : 'bàn'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

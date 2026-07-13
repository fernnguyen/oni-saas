/**
 * LodgingGuestsForm.tsx
 * Web-adapted port of mobile's LodgingGuestsForm component.
 * Manages a list of lodging guests with full CCCD/CMND/Passport info.
 */
import { useState } from 'react';
import type { LodgingGuest } from '@/stores/table-store';

interface LodgingGuestsFormProps {
  guests: LodgingGuest[];
  onChangeGuests: (guests: LodgingGuest[]) => void;
  guestCount: number;
  onChangeGuestCount: (count: number) => void;
}

const ID_TYPES = ['CCCD', 'CMND', 'Hộ chiếu'];
const GENDERS = ['Nam', 'Nữ', 'Khác'];

const emptyGuest = (): LodgingGuest => ({
  name: '',
  id_type: 'CCCD',
  id_number: '',
  expiry_date: '',
  nationality: 'Việt Nam',
  dob: '',
  gender: '',
  address: '',
  note: '',
});

function ConfirmDialog({
  open,
  title,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '20px 20px 16px',
          width: '100%',
          maxWidth: 320,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', marginBottom: 6 }}>{title}</p>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Hành động này không thể hoàn tác.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 40, borderRadius: 10,
              border: '1.5px solid #e2e8f0',
              background: '#f8fafc',
              fontSize: 13, fontWeight: 600, color: '#64748b',
            }}
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, height: 40, borderRadius: 10,
              background: '#ef4444',
              border: 'none',
              fontSize: 13, fontWeight: 600, color: '#fff',
            }}
          >
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

function GuestForm({
  guest,
  index,
  onUpdate,
  onDelete,
  canDelete,
}: {
  guest: LodgingGuest;
  index: number;
  onUpdate: (field: keyof LodgingGuest, value: string) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [expanded, setExpanded] = useState(!guest.name);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 42,
    border: '1.5px solid #e2e8f0',
    borderRadius: 10,
    padding: '0 12px',
    fontSize: 13,
    color: '#0f172a',
    background: '#fff',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    marginBottom: 4,
    display: 'block',
  };

  if (!expanded && guest.name) {
    return (
      <div
        style={{
          background: '#f8fafc',
          border: '1.5px solid #e2e8f0',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: '#fed7aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#ea580c',
              flexShrink: 0,
            }}
          >
            {index + 1}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {guest.name}
            </p>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              {guest.id_type}: {guest.id_number || 'Chưa nhập'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setExpanded(true)}
            style={{
              padding: '4px 10px', borderRadius: 8, border: '1.5px solid #fed7aa',
              background: '#fff7ed', fontSize: 11, fontWeight: 700, color: '#ea580c',
            }}
          >
            Sửa
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: '4px 10px', borderRadius: 8, border: '1.5px solid #fecdd3',
                background: '#fff1f2', fontSize: 11, fontWeight: 700, color: '#f43f5e',
              }}
            >
              Xóa
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e2e8f0',
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 26, height: 26, borderRadius: '50%',
              background: '#fed7aa',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#ea580c',
            }}
          >
            {index + 1}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#ea580c' }}>
            Khách lưu trú #{index + 1}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {guest.name && (
            <button
              onClick={() => setExpanded(false)}
              style={{
                padding: '4px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0',
                background: '#f8fafc', fontSize: 11, fontWeight: 600, color: '#64748b',
              }}
            >
              Thu gọn
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              style={{
                width: 30, height: 30, borderRadius: 8, border: '1.5px solid #fecdd3',
                background: '#fff1f2', fontSize: 14, color: '#f43f5e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              🗑
            </button>
          )}
        </div>
      </div>

      {/* Name */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Họ và tên *</label>
        <input
          style={inputStyle}
          placeholder="Nhập họ và tên..."
          value={guest.name}
          onChange={(e) => onUpdate('name', e.target.value)}
        />
      </div>

      {/* ID Type segmented */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Loại giấy tờ</label>
        <div
          style={{
            display: 'flex', background: '#f1f5f9', borderRadius: 10,
            padding: 3, gap: 3,
          }}
        >
          {ID_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onUpdate('id_type', type)}
              style={{
                flex: 1, height: 34, borderRadius: 8, border: 'none',
                background: guest.id_type === type ? '#fff' : 'transparent',
                fontSize: 12, fontWeight: 600,
                color: guest.id_type === type ? '#0f172a' : '#94a3b8',
                boxShadow: guest.id_type === type ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* ID Number */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Số giấy tờ</label>
        <input
          style={inputStyle}
          placeholder="Số CCCD / CMND / Hộ chiếu..."
          value={guest.id_number || ''}
          onChange={(e) => onUpdate('id_number', e.target.value)}
        />
      </div>

      {/* Expiry + Nationality */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Ngày hết hạn</label>
          <input
            type="date"
            style={inputStyle}
            value={guest.expiry_date || ''}
            onChange={(e) => onUpdate('expiry_date', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Quốc tịch</label>
          <input
            style={inputStyle}
            placeholder="Quốc tịch..."
            value={guest.nationality || 'Việt Nam'}
            onChange={(e) => onUpdate('nationality', e.target.value)}
          />
        </div>
      </div>

      {/* DOB + Gender */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Ngày sinh</label>
          <input
            type="date"
            style={inputStyle}
            value={guest.dob || ''}
            onChange={(e) => onUpdate('dob', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Giới tính</label>
          <select
            style={{ ...inputStyle, paddingRight: 8 }}
            value={guest.gender || ''}
            onChange={(e) => onUpdate('gender', e.target.value)}
          >
            <option value="">Chọn...</option>
            {GENDERS.map((g) => <option key={g} value={g}>{g === 'Khác' ? 'Không xác định' : g}</option>)}
          </select>
        </div>
      </div>

      {/* Address */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Địa chỉ</label>
        <input
          style={inputStyle}
          placeholder="Địa chỉ thường trú..."
          value={guest.address || ''}
          onChange={(e) => onUpdate('address', e.target.value)}
        />
      </div>

      {/* Note */}
      <div>
        <label style={labelStyle}>Ghi chú</label>
        <input
          style={inputStyle}
          placeholder="Ghi chú thêm..."
          value={guest.note || ''}
          onChange={(e) => onUpdate('note', e.target.value)}
        />
      </div>
    </div>
  );
}

export function LodgingGuestsForm({
  guests,
  onChangeGuests,
  guestCount,
  onChangeGuestCount,
}: LodgingGuestsFormProps) {
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const handleUpdate = (index: number, field: keyof LodgingGuest, value: string) => {
    const updated = [...guests];
    if (!updated[index]) updated[index] = emptyGuest();
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'id_number') updated[index].idCard = value;
    onChangeGuests(updated);
  };

  const handleAdd = () => {
    const updated = [...guests, emptyGuest()];
    onChangeGuests(updated);
    onChangeGuestCount(updated.length);
  };

  const handleDelete = (index: number) => {
    const updated = guests.filter((_, i) => i !== index);
    onChangeGuests(updated);
    onChangeGuestCount(Math.max(1, updated.length));
    setDeleteIndex(null);
  };

  return (
    <div>
      {guests.map((guest, i) => (
        <GuestForm
          key={i}
          guest={guest}
          index={i}
          onUpdate={(field, value) => handleUpdate(i, field, value)}
          onDelete={() => setDeleteIndex(i)}
          canDelete={guests.length > 1}
        />
      ))}

      {/* Add guest button */}
      <button
        onClick={handleAdd}
        style={{
          width: '100%', height: 44, borderRadius: 12,
          border: '1.5px dashed #fed7aa',
          background: '#fff7ed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 13, fontWeight: 600, color: '#ea580c',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 16 }}>＋</span>
        Thêm khách lưu trú
      </button>

      <ConfirmDialog
        open={deleteIndex !== null}
        title={`Xóa khách lưu trú #${(deleteIndex ?? 0) + 1}?`}
        onConfirm={() => deleteIndex !== null && handleDelete(deleteIndex)}
        onCancel={() => setDeleteIndex(null)}
      />
    </div>
  );
}

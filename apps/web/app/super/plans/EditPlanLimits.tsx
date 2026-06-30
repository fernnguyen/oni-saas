'use client';

import { useState } from 'react';
import { updatePlanLimits } from './actions';
import { toast } from 'sonner';

interface Props {
  planId: number;
  meta: any;
}

export function EditPlanLimits({ planId, meta }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [limits, setLimits] = useState({
    create_shop: meta.create_shop ?? -1,
    create_shop_user: meta.create_shop_user ?? -1,
    max_orders_per_month: meta.max_orders_per_month ?? -1,
    max_products: meta.max_products ?? -1,
    create_connector: meta.create_connector ?? -1,
    create_domain: meta.create_domain ?? -1,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLimits(prev => ({ ...prev, [e.target.name]: isNaN(val) ? -1 : val }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updatePlanLimits(planId, meta, limits);
      toast.success('Đã cập nhật giới hạn gói');
      setIsEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const fmtVal = (v: number | undefined) => v === undefined ? '—' : v === -1 ? '∞' : v;
  const displayLimits = [
    { key: 'create_shop', label: 'Chi nhánh tối đa', value: fmtVal(meta.create_shop) },
    { key: 'create_shop_user', label: 'Người dùng tối đa', value: fmtVal(meta.create_shop_user) },
    { key: 'max_orders_per_month', label: 'Đơn hàng tối đa/tháng', value: fmtVal(meta.max_orders_per_month) },
    { key: 'max_products', label: 'Sản phẩm tối đa', value: fmtVal(meta.max_products) },
    { key: 'create_connector', label: 'Connector/chi nhánh', value: fmtVal(meta.create_connector) },
    { key: 'create_domain', label: 'Custom domain', value: fmtVal(meta.create_domain) },
  ];

  if (isEditing) {
    return (
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4">
        <h3 className="font-bold mb-4 text-sm">Chỉnh sửa giới hạn (-1 là vô cực)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          {displayLimits.map((item) => (
            <div key={item.key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{item.label}</label>
              <input
                type="number"
                name={item.key}
                value={(limits as any)[item.key]}
                onChange={handleChange}
                className="w-full text-sm p-2 rounded-lg border border-slate-300"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu lại'}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300"
          >
            Hủy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm text-slate-800">Thông số giới hạn</h3>
        <button
          onClick={() => setIsEditing(true)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          Sửa thông số
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {displayLimits.map(({ label, value, key }) => (
          <div key={key} className="rounded-xl bg-slate-50 p-3 border border-slate-100">
            <div className="text-xs text-slate-400 mb-1">{label}</div>
            <div className="text-lg font-bold text-slate-900">{String(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

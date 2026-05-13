'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EditPlanDialogProps {
  tenantId: string;
  currentPlanId: number | null;
  currentPlanName: string | null;
  currentEndDate: string | null;
  currentNotes: string | null;
  plans: { id: number; name: string }[];
}

export function EditPlanDialog({ tenantId, currentPlanId, currentPlanName, currentEndDate, currentNotes, plans }: EditPlanDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Format the end date to YYYY-MM-DD for the input[type="date"]
  const initialEndDate = currentEndDate ? new Date(currentEndDate).toISOString().split('T')[0] : '';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    
    const response = await fetch(`/api/super/tenants/${tenantId}/plan`, {
      method: 'POST',
      body: formData,
    });

    setLoading(false);

    if (response.ok) {
      setIsOpen(false);
      router.refresh();
    } else {
      const data = await response.json();
      alert(`Error: ${data.error || 'Failed to update plan'}`);
    }
  }

  return (
    <>
    
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary transition-colors"
      >
        <strong>{currentPlanName ? `${currentPlanName}` : ' '}</strong>
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        Đổi gói
        
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Cập nhật gói dịch vụ</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gói dịch vụ</label>
                <select
                  name="plan_id"
                  defaultValue={currentPlanId ?? ''}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  <option value="" disabled>Chọn gói...</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Thời hạn kết thúc</label>
                <input
                  type="date"
                  name="end_date"
                  defaultValue={initialEndDate}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-slate-500 mt-1">Để trống nếu không có thời hạn.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
                <textarea
                  name="notes"
                  defaultValue={currentNotes ?? ''}
                  rows={3}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Ghi chú lý do thay đổi..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-60"
                >
                  {loading ? 'Đang lưu...' : 'Xác nhận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

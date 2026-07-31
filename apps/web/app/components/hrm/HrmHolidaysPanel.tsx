'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { SlideOver } from '@/app/components/ui/SlideOver';

interface Holiday {
  id: string;
  date: string;
  name: string;
}

export function HrmHolidaysPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['hrm-holidays', shopId, year],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/holidays?year=${year}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Lỗi tải ngày nghỉ');
      return payload.data as Holiday[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDate, name: newName }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Không thể thêm ngày nghỉ');
    },
    onSuccess: () => {
      toast.success('Đã thêm ngày nghỉ lễ');
      setIsAddModalOpen(false);
      setNewDate('');
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['hrm-holidays', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/holidays/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Không thể xóa ngày nghỉ');
    },
    onSuccess: () => {
      toast.success('Đã xóa ngày nghỉ lễ');
      queryClient.invalidateQueries({ queryKey: ['hrm-holidays', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newName) return;
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Quản lý ngày nghỉ lễ</h3>
          <p className="text-sm text-slate-500 mt-1">Thiết lập các ngày nghỉ lễ trong năm. Hệ thống sẽ bỏ qua đánh dấu Vắng đối với các ngày này.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Thêm ngày nghỉ
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500 animate-pulse">Đang tải danh sách...</div>
        ) : holidays.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarIcon className="mx-auto h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">Chưa có ngày nghỉ lễ nào cho năm {year}</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Ngày</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Tên ngày lễ</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {holidays.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {new Date(h.date).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {h.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => {
                        if (confirm('Bạn có chắc muốn xóa ngày nghỉ này?')) {
                          deleteMutation.mutate(h.id);
                        }
                      }}
                      className="text-slate-400 hover:text-red-600 transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SlideOver 
        open={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        title="Thêm ngày nghỉ lễ"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Thêm ngày nghỉ'}
            </button>
          </>
        }
      >
        <div className="text-sm text-slate-500 mb-6">
          Vui lòng nhập tên và chọn ngày cụ thể.
        </div>
        
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên ngày lễ</label>
            <input
              type="text"
              required
              placeholder="VD: Tết Nguyên Đán"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ngày</label>
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
        </form>
      </SlideOver>
    </div>
  );
}

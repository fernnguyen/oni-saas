'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HrmGeneralSettingsSkeleton } from './HrmContentSkeletons';

export function HrmGeneralSettingsPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState<number | ''>('');

  const { isLoading } = useQuery({
    queryKey: ['hrm-settings', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/settings`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Lỗi tải cấu hình');
      setMaxUploadSizeMb(payload.data?.maxUploadSizeMb ?? 10);
      return payload.data;
    },
    staleTime: 5 * 60_000,
    refetchOnMount: 'always',
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/hrm/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_upload_size_mb: Number(maxUploadSizeMb) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message ?? 'Không thể lưu cấu hình');
    },
    onSuccess: () => {
      toast.success('Đã lưu cấu hình chung');
      queryClient.invalidateQueries({ queryKey: ['hrm-settings', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <HrmGeneralSettingsSkeleton />;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Giới hạn dung lượng tải lên (Upload)</h3>
        <p className="text-sm text-slate-500 mt-1">
          Quy định dung lượng tối đa (MB) cho mỗi file tài liệu khi nhân viên hoặc quản lý upload lên hệ thống.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="number"
            min="1"
            max="100"
            value={maxUploadSizeMb}
            onChange={(e) => setMaxUploadSizeMb(e.target.value ? Number(e.target.value) : '')}
            className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <span className="text-sm font-medium text-slate-700">MB</span>
        </div>
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !maxUploadSizeMb}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  );
}

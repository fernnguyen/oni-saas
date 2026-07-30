'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, type Column } from '@/app/components/ui/DataTable';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SearchBar } from '@/app/components/ui/SearchBar';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';

interface HrmEmployeeSummary {
  id: string;
  employeeCode: string | null;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  joinedAt: string | null;
}

interface HrmEmployeeListResponse {
  data: HrmEmployeeSummary[];
  total: number;
  canManage: boolean;
}

const EMPTY_FORM = {
  name: '',
  employee_code: '',
  phone: '',
  job_title: '',
  employment_type: 'monthly',
  joined_at: '',
  email: '',
  address: '',
};

export function HrmEmployeesPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [slideOpen, setSlideOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const employeesQuery = useQuery({
    queryKey: ['hrm-employees', shopId, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/employees?${params}`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không tải được danh sách nhân viên.',
        );
      }
      return payload as HrmEmployeeListResponse;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/employees`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể thêm nhân viên.');
      }
      return payload;
    },
    onSuccess: () => {
      toast.success('Đã thêm nhân viên');
      setSlideOpen(false);
      setFormData(EMPTY_FORM);
      void queryClient.invalidateQueries({
        queryKey: ['hrm-employees', shopId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const columns = useMemo<Column<HrmEmployeeSummary>[]>(
    () => [
      {
        key: 'employeeCode',
        label: 'Mã NV',
        render: (row) => row.employeeCode || '—',
      },
      { key: 'name', label: 'Họ tên' },
      {
        key: 'jobTitle',
        label: 'Chức danh',
        render: (row) => row.jobTitle || '—',
      },
      {
        key: 'phone',
        label: 'Số điện thoại',
        render: (row) => row.phone || '—',
      },
      {
        key: 'joinedAt',
        label: 'Ngày vào làm',
        render: (row) => row.joinedAt || '—',
      },
      {
        key: 'employmentStatus',
        label: 'Trạng thái',
        render: (row) => (
          <TagBadge
            label={
              row.employmentStatus === 'probation'
                ? 'Thử việc'
                : row.employmentStatus === 'inactive'
                  ? 'Đã nghỉ'
                  : 'Đang làm'
            }
          />
        ),
      },
    ],
    [],
  );

  function updateForm(field: keyof typeof EMPTY_FORM, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Danh sách nhân viên
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {employeesQuery.data?.total ?? 0} nhân viên đang hoạt động
          </p>
        </div>
        {employeesQuery.data?.canManage && (
          <button
            type="button"
            onClick={() => {
              setFormData(EMPTY_FORM);
              setSlideOpen(true);
            }}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm nhân viên
          </button>
        )}
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Tìm theo tên, mã hoặc số điện thoại..."
      />

      <DataTable
        columns={columns}
        data={employeesQuery.data?.data ?? []}
        loading={employeesQuery.isLoading}
        rowKey={(row) => row.id}
        emptyState={
          <EmptyState
            title="Chưa có nhân viên"
            description="Thêm nhân viên đầu tiên để bắt đầu quản lý chấm công và tiền lương."
          />
        }
      />

      {employeesQuery.isError && (
        <p className="text-sm text-rose-600">
          {employeesQuery.error.message}
        </p>
      )}

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Thêm nhân viên"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !formData.name.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Lưu nhân viên'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Họ tên *
            </label>
            <input
              value={formData.name}
              onChange={(event) => updateForm('name', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Mã nhân viên
              </label>
              <input
                value={formData.employee_code}
                onChange={(event) =>
                  updateForm('employee_code', event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="NV001"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Số điện thoại
              </label>
              <input
                value={formData.phone}
                onChange={(event) => updateForm('phone', event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Chức danh
            </label>
            <input
              value={formData.job_title}
              onChange={(event) => updateForm('job_title', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Thu ngân, bán hàng, quản lý..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Hình thức lương
              </label>
              <select
                value={formData.employment_type}
                onChange={(event) =>
                  updateForm('employment_type', event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="monthly">Theo tháng</option>
                <option value="daily">Theo ngày</option>
                <option value="hourly">Theo giờ</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Ngày vào làm
              </label>
              <input
                type="date"
                value={formData.joined_at}
                onChange={(event) =>
                  updateForm('joined_at', event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(event) => updateForm('email', event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Địa chỉ
            </label>
            <textarea
              value={formData.address}
              onChange={(event) => updateForm('address', event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </SlideOver>
    </div>
  );
}

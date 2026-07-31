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
import { useConfirm } from '@/app/components/ui/ConfirmProvider';
import { formatHrmDate } from '@/lib/hrm/formatDate';
import type { HrmCustomField } from './HrmCustomFieldsPanel';

interface HrmEmployeeSummary {
  id: string;
  profileId: string | null;
  authUserId: string | null;
  employeeCode: string | null;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  employmentType: string;
  joinedAt: string | null;
  email: string | null;
  address: string | null;
  departmentId: string | null;
  departmentName: string | null;
  defaultShiftTemplateId: string | null;
  customData: Record<string, unknown>;
}

interface HrmDepartmentOption {
  id: string;
  name: string;
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
  department_id: '',
  default_shift_template_id: '',
  employment_type: 'monthly',
  employment_status: 'active',
  joined_at: '',
  email: '',
  address: '',
};

export function HrmEmployeesPanel({ shopId }: { shopId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [slideOpen, setSlideOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [linkedUserId, setLinkedUserId] = useState('');

  const employeesQuery = useQuery({
    queryKey: ['hrm-employees', shopId, debouncedSearch],
    staleTime: 0,
    refetchOnMount: 'always',
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

  const customFieldsQuery = useQuery({
    queryKey: ['hrm-custom-fields', shopId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/custom-fields`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error('Không tải được trường tùy chỉnh.');
      return payload as { data: HrmCustomField[]; canManage: boolean };
    },
  });
  const departmentsQuery = useQuery({
    queryKey: ['departments', shopId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/departments?limit=500`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error('Không tải được danh sách phòng ban.');
      }
      return payload as { data: HrmDepartmentOption[]; total: number };
    },
  });
  const shiftsQuery = useQuery({
    queryKey: ['hrm-shifts', shopId],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/shifts`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error('Không tải được danh sách ca làm việc.');
      }
      return payload as { data: any[] };
    },
  });
  const usersQuery = useQuery({
    queryKey: ['hrm-linkable-users', shopId],
    staleTime: 0,
    refetchOnMount: 'always',
    enabled: Boolean(
      employeesQuery.data?.canManage && editingId && slideOpen,
    ),
    queryFn: async () => {
      const response = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/hrm/users`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? 'Không tải được danh sách tài khoản.',
        );
      }
      return payload as {
        data: Array<{
          userId: string;
          username: string;
          displayName: string | null;
        }>;
      };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingId
        ? `/api/shops/${encodeURIComponent(shopId)}/hrm/employees/${encodeURIComponent(editingId)}`
        : `/api/shops/${encodeURIComponent(shopId)}/hrm/employees`;
      const response = await fetch(
        url,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editingId
              ? {
                  ...formData,
                  auth_user_id: linkedUserId || null,
                  custom_data: customData,
                }
              : {
                  ...formData,
                  custom_data: customData,
                },
          ),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Không thể thêm nhân viên.');
      }
      return payload;
    },
    onSuccess: () => {
      toast.success(editingId ? 'Đã cập nhật hồ sơ' : 'Đã thêm nhân viên');
      setSlideOpen(false);
      setFormData(EMPTY_FORM);
      setEditingId(null);
      setCustomData({});
      setLinkedUserId('');
      void queryClient.invalidateQueries({
        queryKey: ['hrm-employees', shopId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function confirmSaveEmployee() {
    const accepted = await confirm({
      title: editingId ? 'Lưu thay đổi hồ sơ?' : 'Thêm nhân viên mới?',
      description: editingId
        ? 'Thông tin phòng ban, tài khoản liên kết và hồ sơ mở rộng sẽ được cập nhật.'
        : 'Nhân viên mới sẽ được tạo trong chi nhánh hiện tại.',
      confirmLabel: editingId ? 'Lưu hồ sơ' : 'Thêm nhân viên',
    });
    if (accepted) saveMutation.mutate();
  }

  const canManage = employeesQuery.data?.canManage ?? false;
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
        key: 'departmentName',
        label: 'Phòng ban',
        render: (row) => row.departmentName || 'Chưa phân công',
      },
      {
        key: 'phone',
        label: 'Số điện thoại',
        render: (row) => row.phone || '—',
      },
      {
        key: 'joinedAt',
        label: 'Ngày vào làm',
        render: (row) => formatHrmDate(row.joinedAt),
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
      {
        key: 'actions',
        label: '',
        render: (row) =>
          canManage ? (
            <button
              type="button"
              onClick={() => openEdit(row)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Hồ sơ
            </button>
          ) : null,
      },
    ],
    [canManage],
  );

  function updateForm(field: keyof typeof EMPTY_FORM, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function openEdit(row: HrmEmployeeSummary) {
    setEditingId(row.id);
    setFormData({
      name: row.name,
      employee_code: row.employeeCode ?? '',
      phone: row.phone ?? '',
      job_title: row.jobTitle ?? '',
      department_id: row.departmentId ?? '',
      default_shift_template_id: row.defaultShiftTemplateId ?? '',
      employment_type: row.employmentType,
      employment_status: row.employmentStatus,
      joined_at: row.joinedAt ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
    });
    setCustomData(row.customData ?? {});
    setLinkedUserId(row.authUserId ?? '');
    setSlideOpen(true);
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
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setFormData(EMPTY_FORM);
              setEditingId(null);
              setCustomData({});
              setLinkedUserId('');
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
        title={editingId ? 'Hồ sơ nhân viên' : 'Thêm nhân viên'}
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
              onClick={() => void confirmSaveEmployee()}
              disabled={saveMutation.isPending || !formData.name.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu hồ sơ'}
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

          {editingId && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Trạng thái làm việc
                </label>
                <select
                  value={formData.employment_status}
                  onChange={(event) =>
                    updateForm('employment_status', event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="active">Đang làm</option>
                  <option value="probation">Thử việc</option>
                  <option value="inactive">Đã nghỉ</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tài khoản check-in
                </label>
                <select
                  value={linkedUserId}
                  onChange={(event) => setLinkedUserId(event.target.value)}
                  disabled={usersQuery.isLoading}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">Chưa liên kết tài khoản</option>
                  {usersQuery.data?.data.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.displayName || user.username} ({user.username})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

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

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Phòng ban / Bộ phận
            </label>
            <select
              value={formData.department_id}
              onChange={(event) =>
                updateForm('department_id', event.target.value)
              }
              disabled={departmentsQuery.isLoading}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="">Chưa phân công</option>
              {departmentsQuery.data?.data.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            {departmentsQuery.isError && (
              <p className="mt-1 text-xs text-rose-600">
                {departmentsQuery.error.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ca làm việc mặc định
            </label>
            <select
              value={formData.default_shift_template_id}
              onChange={(event) =>
                updateForm('default_shift_template_id', event.target.value)
              }
              disabled={shiftsQuery.isLoading}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="">Không phân ca mặc định</option>
              {shiftsQuery.data?.data.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({shift.startTime} - {shift.endTime})
                </option>
              ))}
            </select>
            {shiftsQuery.isError && (
              <p className="mt-1 text-xs text-rose-600">
                {shiftsQuery.error.message}
              </p>
            )}
          </div>

          {(customFieldsQuery.data?.data.length ?? 0) > 0 && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Thông tin tùy chỉnh
              </h3>
              {customFieldsQuery.data?.data.map((field) => (
                <label
                  key={field.id}
                  className="block text-sm font-medium text-slate-700"
                >
                  {field.label}
                  {field.required ? ' *' : ''}
                  {field.fieldType === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(customData[field.key])}
                      onChange={(event) =>
                        setCustomData({
                          ...customData,
                          [field.key]: event.target.checked,
                        })
                      }
                      className="ml-3"
                    />
                  ) : field.fieldType === 'select' ? (
                    <select
                      value={String(customData[field.key] ?? '')}
                      onChange={(event) =>
                        setCustomData({
                          ...customData,
                          [field.key]: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <option value="">Chọn...</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        field.fieldType === 'number'
                          ? 'number'
                          : field.fieldType === 'date'
                            ? 'date'
                            : 'text'
                      }
                      value={
                        Array.isArray(customData[field.key])
                          ? (customData[field.key] as string[]).join(', ')
                          : String(customData[field.key] ?? '')
                      }
                      onChange={(event) =>
                        setCustomData({
                          ...customData,
                          [field.key]:
                            field.fieldType === 'multiselect'
                              ? event.target.value
                                  .split(',')
                                  .map((value) => value.trim())
                                  .filter(Boolean)
                              : field.fieldType === 'number'
                                ? event.target.value === ''
                                  ? ''
                                  : Number(event.target.value)
                                : event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                      placeholder={
                        field.fieldType === 'multiselect'
                          ? 'Nhập các giá trị, cách nhau bằng dấu phẩy'
                          : undefined
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          )}

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

'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from 'use-debounce';
import { DataTable, Column } from '@/app/components/ui/DataTable';
import { SlideOver } from '@/app/components/ui/SlideOver';
import { TagBadge } from '@/app/components/ui/TagBadge';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { SearchBar } from '@/app/components/ui/SearchBar';

interface Props {
  shopId: string;
  shopName: string;
  canManage: boolean;
}

const EMPTY_FORM = {
  name: '',
  warehouse_id: '',
  manager_id: '',
};

export function DepartmentsClient({ shopId, shopName, canManage }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [formData, setFormData] = useState<Record<string, string>>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slideOpen, setSlideOpen] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState('');
  const [memberIsManager, setMemberIsManager] = useState(false);

  // 1. Fetch departments
  const { data: deptData, isLoading: deptsLoading, isFetching: deptsFetching } = useQuery({
    queryKey: ['departments', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/departments?limit=100`);
      if (!res.ok) throw new Error('Không tải được dữ liệu phòng ban');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // 1b. Fetch warehouses for dropdown
  const { data: whData } = useQuery({
    queryKey: ['warehouses', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/warehouses?limit=100`);
      if (!res.ok) throw new Error('Không tải được danh sách kho');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // 2. Fetch employees (for manager drop-down and assignment)
  const { data: empData, isLoading: empsLoading } = useQuery({
    queryKey: ['employees', shopId],
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/employees?limit=200`);
      if (!res.ok) throw new Error('Không tải được danh sách nhân viên');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // Helper map for manager/member names
  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    if (empData?.data) {
      empData.data.forEach((emp) => {
        map.set(emp.id || emp.employee_id, emp.name);
      });
    }
    return map;
  }, [empData]);

  // 3. Fetch members of selected department
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['department-members', shopId, selectedDeptId],
    enabled: !!selectedDeptId,
    queryFn: async () => {
      const res = await fetch(`/api/shops/${shopId}/departments/${selectedDeptId}/members`);
      if (!res.ok) throw new Error('Không tải được danh sách thành viên');
      return res.json() as Promise<{ data: Record<string, string>[]; total: number }>;
    },
  });

  // 4. Save department mutation
  const saveDeptMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const url = editingId
        ? `/api/shops/${shopId}/departments/${editingId}`
        : `/api/shops/${shopId}/departments`;
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Lưu phòng ban thất bại');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editingId ? 'Cập nhật phòng ban thành công!' : 'Tạo phòng ban thành công!');
      setSlideOpen(false);
      queryClient.invalidateQueries({ queryKey: ['departments', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 5. Delete department mutation
  const deleteDeptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shops/${shopId}/departments/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Xóa phòng ban thất bại');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã xóa phòng ban');
      queryClient.invalidateQueries({ queryKey: ['departments', shopId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 6. Add department member mutation
  const addMemberMutation = useMutation({
    mutationFn: async (payload: { user_id: string; is_manager: string }) => {
      const res = await fetch(`/api/shops/${shopId}/departments/${selectedDeptId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? 'Không thể thêm nhân viên vào phòng ban');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã thêm nhân viên vào phòng ban');
      setMemberUserId('');
      setMemberIsManager(false);
      queryClient.invalidateQueries({ queryKey: ['department-members', shopId, selectedDeptId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 7. Revoke department member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberRecordId: string) => {
      const res = await fetch(
        `/api/shops/${shopId}/departments/${selectedDeptId}/members/${memberRecordId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Không thể xóa nhân viên khỏi phòng ban');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã xóa nhân viên khỏi phòng ban');
      queryClient.invalidateQueries({ queryKey: ['department-members', shopId, selectedDeptId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 8. Toggle is_manager status mutation
  const toggleManagerMutation = useMutation({
    mutationFn: async ({ memberRecordId, is_manager }: { memberRecordId: string; is_manager: boolean }) => {
      const res = await fetch(
        `/api/shops/${shopId}/departments/${selectedDeptId}/members/${memberRecordId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_manager: is_manager ? 'TRUE' : 'FALSE' }),
        }
      );
      if (!res.ok) throw new Error('Không thể thay đổi quyền trưởng phòng');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Đã cập nhật vai trò trưởng phòng');
      queryClient.invalidateQueries({ queryKey: ['department-members', shopId, selectedDeptId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openEdit(row: Record<string, string>) {
    setFormData({
      name: row.name,
      warehouse_id: row.warehouse_id || '',
      manager_id: row.manager_id || '',
    });
    setEditingId(row.id);
    setSlideOpen(true);
  }

  function openCreate() {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setSlideOpen(true);
  }

  function openMembers(row: Record<string, string>) {
    setSelectedDeptId(row.id);
    setSelectedDeptName(row.name);
    setMemberUserId('');
    setMemberIsManager(false);
    setMembersDrawerOpen(true);
  }

  const filteredDepts = useMemo(() => {
    if (!deptData?.data) return [];
    if (!debouncedSearch) return deptData.data;
    const s = debouncedSearch.toLowerCase();
    return deptData.data.filter(
      (d) =>
        d.name.toLowerCase().includes(s) ||
        (d.manager_id && employeeMap.get(d.manager_id)?.toLowerCase().includes(s))
    );
  }, [deptData, debouncedSearch, employeeMap]);

  const columns = useMemo<Column<Record<string, string>>[]>(() => [
    { key: 'name', label: 'Tên phòng ban' },
    {
      key: 'warehouse_id',
      label: 'Kho hàng liên kết',
      render: (row) => {
        const wh = whData?.data?.find(w => w.id === row.warehouse_id);
        return wh ? (
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
            {wh.name}
          </span>
        ) : (
          <span className="text-slate-400 italic text-xs">Chưa liên kết</span>
        );
      }
    },
    {
      key: 'manager_id',
      label: 'Trưởng bộ phận',
      render: (row) => {
        const mgrName = row.manager_id ? employeeMap.get(row.manager_id) : null;
        return mgrName ? (
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary uppercase">
              {mgrName.substring(0, 2)}
            </div>
            <span className="text-sm font-medium text-slate-700">{mgrName}</span>
          </div>
        ) : (
          <span className="text-slate-400 italic text-xs">Chưa bổ nhiệm</span>
        );
      },
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => openMembers(row)}
            className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-all cursor-pointer"
          >
            Nhân sự ({deptData?.data ? 'Xem/Gán' : 0})
          </button>
          {canManage && (
            <>
              <button
                onClick={() => openEdit(row)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Sửa
              </button>
              <button
                onClick={() => {
                  if (confirm(`Bạn có chắc chắn muốn xóa phòng ban "${row.name}"?`)) {
                    deleteDeptMutation.mutate(row.id);
                  }
                }}
                className="rounded-lg border border-rose-100 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                Xóa
              </button>
            </>
          )}
        </div>
      ),
    },
  ], [employeeMap, canManage, deptData, whData]);

  // Dropdown list of employees not in the selected department
  const nonMemberEmployees = useMemo(() => {
    if (!empData?.data) return [];
    if (!membersData?.data) return empData.data;
    const memberUserIds = new Set(membersData.data.map((m) => m.user_id));
    return empData.data.filter((emp) => !memberUserIds.has(emp.id || emp.employee_id));
  }, [empData, membersData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{shopName}</div>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">Sơ đồ phòng ban (Cost Centers)</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filteredDepts.length} phòng ban đang hoạt động
            {deptsFetching && <span className="ml-2 text-xs text-slate-400 animate-pulse">Đang cập nhật...</span>}
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            + Thêm phòng ban
          </button>
        )}
      </div>

      {/* Search & List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Tìm phòng ban hoặc trưởng bộ phận..."
        />

        <DataTable
          columns={columns}
          data={filteredDepts}
          loading={deptsLoading}
          emptyState={
            <EmptyState
              title="Chưa có phòng ban nào"
              description="Hãy thiết lập phòng ban để làm nơi hạch toán chi phí (Cost Centers) và gán nhân viên."
            />
          }
          rowKey={(row) => row.id}
        />
      </div>

      {/* Form SlideOver */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Cấu hình phòng ban' : 'Tạo phòng ban mới'}
        footer={
          <div className="flex items-center gap-3 w-full justify-end">
            <button
              onClick={() => setSlideOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (!formData.name.trim()) {
                  toast.error('Vui lòng điền tên phòng ban');
                  return;
                }
                saveDeptMutation.mutate(formData);
              }}
              disabled={saveDeptMutation.isPending}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              {saveDeptMutation.isPending ? 'Đang lưu...' : 'Lưu phòng ban'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tên phòng ban *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
              placeholder="Ví dụ: Lễ tân, Buồng phòng, Bếp ăn, Kho..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kho hàng liên kết</label>
            <select
              value={formData.warehouse_id || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, warehouse_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none bg-white"
            >
              <option value="">-- Không liên kết kho --</option>
              {whData?.data?.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Trưởng bộ phận</label>
            <select
              value={formData.manager_id}
              onChange={(e) => setFormData((prev) => ({ ...prev, manager_id: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none bg-white"
            >
              <option value="">-- Chọn trưởng bộ phận --</option>
              {empData?.data?.map((emp) => (
                <option key={emp.id || emp.employee_id} value={emp.id || emp.employee_id}>
                  {emp.name} ({emp.employee_code || 'Chưa có mã'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </SlideOver>

      {/* Members Drawer */}
      <SlideOver
        open={membersDrawerOpen}
        onClose={() => setMembersDrawerOpen(false)}
        title={`Quản lý nhân sự: ${selectedDeptName || ''}`}
      >
        <div className="space-y-6">
          {/* Member assignment form */}
          {canManage && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gán nhân viên mới</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Chọn nhân viên</label>
                  <select
                    value={memberUserId}
                    onChange={(e) => setMemberUserId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {nonMemberEmployees.map((emp) => (
                      <option key={emp.id || emp.employee_id} value={emp.id || emp.employee_id}>
                        {emp.name} ({emp.employee_code || 'Chưa có mã'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isManagerCheckbox"
                      checked={memberIsManager}
                      onChange={(e) => setMemberIsManager(e.target.checked)}
                      className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <label htmlFor="isManagerCheckbox" className="text-sm text-slate-600 select-none cursor-pointer">
                      Trưởng phòng / Lãnh đạo bộ phận
                    </label>
                  </div>
                  <button
                    onClick={() => {
                      if (!memberUserId) {
                        toast.error('Vui lòng chọn nhân viên');
                        return;
                      }
                      addMemberMutation.mutate({
                        user_id: memberUserId,
                        is_manager: memberIsManager ? 'TRUE' : 'FALSE',
                      });
                    }}
                    disabled={addMemberMutation.isPending || !memberUserId}
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {addMemberMutation.isPending ? 'Đang thêm...' : 'Thêm vào'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Members list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thành viên phòng ban</h3>
            {membersLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-12 bg-slate-100 rounded-xl"></div>
                <div className="h-12 bg-slate-100 rounded-xl"></div>
              </div>
            ) : !membersData?.data || membersData.data.length === 0 ? (
              <div className="text-center py-8 text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-xl">
                Chưa gán nhân sự cho phòng ban này
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {membersData.data.map((member) => {
                  const empName = employeeMap.get(member.user_id) || 'Nhân viên';
                  const isManager = member.is_manager === 'TRUE';
                  return (
                    <div key={member.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold uppercase ${isManager ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {empName.substring(0, 2)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                            {empName}
                            {isManager && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold">
                                Trưởng phòng
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {canManage && (
                          <>
                            <button
                              onClick={() =>
                                toggleManagerMutation.mutate({
                                  memberRecordId: member.id,
                                  is_manager: !isManager,
                                })
                              }
                              title={isManager ? 'Bỏ quyền Trưởng phòng' : 'Bổ nhiệm Trưởng phòng'}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                isManager
                                  ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A1.75 1.75 0 0019 19.25l-5.83-5.83M11.42 15.17l2.43-2.43m-2.43 2.43H3.25A1.75 1.75 0 011.5 13.42V7.75A1.75 1.75 0 013.25 6h5.83m-3.25 3.25l5.83 5.83m0 0l2.43-2.43M18.75 12h-2.43m2.43-6h-2.43M21 9h-2.43M18.75 3a1.75 1.75 0 00-3.5 0v3h3.5V3z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Bạn có muốn xóa nhân viên ${empName} khỏi phòng ban?`)) {
                                  removeMemberMutation.mutate(member.id);
                                }
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 text-rose-500 hover:bg-rose-50 hover:border-rose-100 transition-all cursor-pointer"
                              title="Xóa khỏi phòng"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SlideOver>
    </div>
  );
}

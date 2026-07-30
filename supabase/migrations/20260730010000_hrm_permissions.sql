-- migration: 20260730010000_hrm_permissions
-- Register the HRM permission catalog in the Supabase control plane.

begin;

insert into public.permissions (code, name, group_code, group_name, sort_order) values
  ('hrm.view',               'Xem tổng quan nhân sự',        'hrm', 'Nhân sự', 1),
  ('hrm.employee.manage',    'Quản lý hồ sơ nhân viên',      'hrm', 'Nhân sự', 2),
  ('hrm.employee.transfer',  'Điều chuyển nhân viên',        'hrm', 'Nhân sự', 3),
  ('hrm.attendance.manage',  'Quản lý chấm công',            'hrm', 'Nhân sự', 4),
  ('hrm.payroll.view',       'Xem bảng lương',               'hrm', 'Nhân sự', 5),
  ('hrm.payroll.manage',     'Tính và chốt lương',           'hrm', 'Nhân sự', 6),
  ('hrm.payroll.pay',        'Chi trả lương',                'hrm', 'Nhân sự', 7),
  ('hrm.settings.manage',    'Thiết lập HRM',                'hrm', 'Nhân sự', 8)
on conflict (code) do nothing;

-- Owner remains the only system role receiving HRM permissions by default.
-- Custom roles can opt into individual permissions through the existing role UI.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'owner'
  and p.code in (
    'hrm.view',
    'hrm.employee.manage',
    'hrm.employee.transfer',
    'hrm.attendance.manage',
    'hrm.payroll.view',
    'hrm.payroll.manage',
    'hrm.payroll.pay',
    'hrm.settings.manage'
  )
on conflict do nothing;

commit;

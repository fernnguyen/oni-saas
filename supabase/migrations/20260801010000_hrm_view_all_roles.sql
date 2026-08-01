-- migration: 20260801010000_hrm_view_all_roles
-- Grant hrm.view to ALL system roles by default.
-- Rationale: Any authenticated user in a shop should be able to view HRM data
-- they are entitled to (their own attendance, leaves, etc.). Fine-grained access
-- is already enforced at the API layer (e.g. employees can only view their own
-- records unless they also have hrm.attendance.manage).
-- Admins can remove this permission from specific custom roles if needed.

begin;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.code = 'hrm.view'
on conflict do nothing;

commit;

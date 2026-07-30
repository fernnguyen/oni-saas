-- Register HRM as an optional tenant module.
-- Existing plans remain disabled by default; tenant-specific feature_flags can
-- explicitly enable or disable the module during pilot rollout.

begin;

insert into public.system_modules (code, name, description)
values (
  'hrm',
  'Quản lý nhân sự (HRM)',
  'Hồ sơ nhân viên, chấm công, tính lương và ghi nhận chi lương.'
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

update public.plans
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('hrm', false)
where not (coalesce(metadata, '{}'::jsonb) ? 'hrm');

commit;

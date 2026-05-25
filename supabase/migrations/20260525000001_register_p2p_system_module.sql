-- migration: 20260525000001_register_p2p_system_module
-- ONI.vn — Registers warehouse_p2p as a premium system module to allow feature flag mappings

insert into public.system_modules (code, name, description) values
  ('warehouse_p2p', 'Mua sắm & Phê duyệt doanh nghiệp (P2P)', 'Quản lý quy trình mua sắm chặt chẽ PR -> PO -> GRN đối chiếu 3 chiều, tự động hạch toán kho và công nợ.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

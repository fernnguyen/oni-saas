-- migration: 20260728100001_update_system_tax_groups_tt50
-- Cập nhật nhóm thuế theo Thông tư 50/2026/TT-BTC

-- Thêm 2 nhóm mới
INSERT INTO public.system_tax_groups (code, name, vat_rate, pit_rate) VALUES
  ('cho_thue',    'Hoạt động cho thuê tài sản (trừ bất động sản)', 5.0, 2.0),
  ('noi_dung_so', 'Nội dung thông tin số (game, phim, nhạc số, quảng cáo số)', 3.0, 1.5)
ON CONFLICT (code) DO NOTHING;

-- Cập nhật tên theo TT50 (nếu cần thiết để khớp hoàn toàn)
UPDATE public.system_tax_groups
SET name = 'Phân phối, cung cấp hàng hóa'
WHERE code = 'phan_phoi';

-- migration: 20260524000002_add_roles_description
-- ONI.vn — Add description column to roles table for detailed role function explanations

alter table public.roles
add column if not exists description text;

-- Add description for default system roles in DB to be accessible by listRoles or fallback
update public.roles
set description = 'Có toàn quyền vĩ mô, thanh toán gói dịch vụ và xem báo cáo tài chính tổng hợp toàn chuỗi.'
where code = 'owner';

update public.roles
set description = 'Quản trị nhân sự toàn hệ thống, tạo chi nhánh, cấu hình và đồng bộ danh mục sản phẩm chung.'
where code = 'admin';

update public.roles
set description = 'Vận hành máy POS bán hàng tại chi nhánh, tích điểm CRM cho khách. Không được tự ý hủy hóa đơn.'
where code = 'staff';

update public.roles
set description = 'Chỉ xem số liệu báo cáo doanh thu chi nhánh và lịch sử đơn hàng ở chế độ Đọc.'
where code = 'viewer';

Bước 1: Thiết lập nền tảng Supabase (Backend Core)
Đây là nơi lưu trữ thông tin quản trị (control-plane) cho tất cả shop:

Khởi tạo Project: Tạo một project Supabase mới trên console.

Setup Schema: Mở SQL Editor trong Supabase, copy và dán nội dung từ file packages/core/src/schema.sql vào rồi chạy. Việc này sẽ tạo các bảng tenants, user_tenants, connectors, domains, plans, audit_logs...

Cấu hình Auth: Trong Authentication settings, đảm bảo đã bật Email/Password provider.

Lấy Credentials: Copy SUPABASE_URL và ANON_KEY (hoặc SERVICE_ROLE_KEY nếu cần làm các tác vụ admin đặc quyền).

Bước 2: Thiết lập môi trường Next.js
Cấu hình Env: Trong folder apps/web, tạo file .env.local với nội dung:

text
NEXT_PUBLIC_SUPABASE_URL=YOUR_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
Cài đặt thư viện: Ở root, chạy lệnh:

bash
pnpm install
Khởi động: Chạy pnpm dev và truy cập http://localhost:3000 để thấy landing page đã dựng.

Bước 3: Phát triển Module "Control-plane" (Backend xử lý SaaS)
Thay vì code toàn bộ, hãy ưu tiên các nghiệp vụ cốt lõi để giữ hệ thống hoạt động:

Auth & Tenant: Hiện tại Next.js đã có SignIn/SignUp. Hãy test xem user đã được tạo trong auth.users chưa.

Tạo Shop (Tenant): Hoàn thiện logic RPC create_tenant_with_owner. Thử đăng nhập, tạo một gian hàng và kiểm tra xem record đã vào bảng tenants và user_tenants chưa.

Middleware: Cấu hình middleware.ts để chặn các route /dashboard/* nếu chưa có session.

Bước 4: Thiết lập "Data Adapter" (Cốt lõi sản phẩm)
Đây là phần quan trọng nhất để tạo sự khác biệt cho ONI.vn:

Triển khai interface: Hoàn thiện các method trong GoogleSheetsAdapter và SupabaseDbAdapter tại packages/adapters.

Làm Wizard Onboarding:

Bước 1: User chọn loại provider (Sheets/Supabase).

Bước 2: Gọi API connect (Google OAuth hoặc nhập connection string).

Bước 3: Verify: Backend thực hiện thao tác đọc/ghi test trên provider. Nếu thành công → lưu cấu hình vào bảng connectors và set trạng thái active.

Tích hợp UI: Kết nối form ở apps/web/app/onboarding với các API ở trên.

Bước 5: Phân quyền & Custom Domain (SaaS Ready)
Custom Domain: Code logic cho middleware.ts để đọc header host (request subdomain), truy vấn bảng domains (trong control DB) để xác định tenant_id, sau đó lưu tenant_id vào header hoặc context để truyền cho toàn bộ app.

Phân quyền (RBAC): Tích hợp bảng roles vào việc kiểm soát quyền truy cập trang (dùng HOC hoặc Server Component để check role trước khi render).

Lời khuyên cho lộ trình "Step-by-step":
Đừng làm tất cả cùng lúc: Hãy tập trung hoàn thiện Luồng khởi tạo gian hàng (đăng ký → tạo tenant → chọn provider) trước. Đây là "xương sống" để anh có khách hàng sử dụng.

Dữ liệu: Hãy dùng file PROJECT_STRUCTURE.md làm checklist công việc. Mỗi folder trong đó là một module, hãy làm xong folder nào thì check vào đó.

Data-source: Bắt đầu bằng Google Sheets trước vì nó là "đặc sản" của ONI.vn. Sau khi flow đó trơn tru, việc thêm Supabase, MongoDB hay các DB khác chỉ là việc implement thêm 1 file Adapter mới.


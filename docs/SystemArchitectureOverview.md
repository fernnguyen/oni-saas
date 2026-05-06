ONI.vn System Architecture Overview
1. Mục tiêu kiến trúc
Multi-tenant SaaS: Hỗ trợ hàng ngàn shop (tenants) trên cùng hệ thống.

Data Sovereignty: Dữ liệu nghiệp vụ nằm ở adapter người dùng chọn (Google Sheets, Supabase, v.v.), không nằm trong DB hệ thống chính.

Provider-Agnostic: Frontend/Mobile không cần biết dữ liệu đến từ đâu.

Pluggable Architecture: Dễ dàng thêm adapter mới (Google Sheets, Firestore, MongoDB, Custom SQL) dưới dạng plugin.

2. Các tầng hệ thống (Tiers)
A. Tầng Client (Frontend/Mobile)
Framework: Next.js (Web), Cross-platform Framework (Mobile).

Trách nhiệm: Xử lý UI/UX, gửi request đến Backend Control-Plane, và (nếu cần) kết nối trực tiếp tới provider data để tối ưu.

Không bao giờ: Lưu trực tiếp các secret key (như Google API key, Database URL).

B. Tầng Control-Plane (Next.js Backend)
Framework: Next.js App Router (Server Actions, Route Handlers, Middleware).

Database (App DB): Supabase Postgres.

Trách nhiệm:

Auth: Quản lý định danh (Supabase Auth).

SaaS Management: Tenant routing, subscription gating, feature flags, audit logs, custom domain mapping.

Connector Orchestration: Quản lý metadata của provider (đã connect chưa, type là gì, config ra sao).

Domain Logic: Middleware xác định tenant_id dựa trên subdomain (shop.oni.vn) hoặc custom domain.

C. Tầng Data-Plane (Adapters)
Cơ chế: Plug-in adapter qua Interface chung.

Interface chính: DataSourceAdapter (CRUD Products, Sales, Inventory, …).

Các Adapter hiện hữu:

GoogleSheetsAdapter: Ghi/đọc file Sheets.

SupabaseDbAdapter: Ghi/đọc vào bảng Postgres của tenant.

Tính chất: Stateless, gọi qua Backend Control-Plane, hoặc (nếu tối ưu) gọi trực tiếp từ client thông qua token giới hạn.

3. Luồng dữ liệu (Data Flow)
1. Luồng Request nghiệp vụ
Frontend gửi request tới /api/products (ví dụ).

Next.js Backend:

Xác thực session (Supabase Auth).

Truy vấn DB App lấy tenant_id, plan, connector_config.

Resolve DataSourceAdapter (ví dụ: Google Sheets).

Adapter thực hiện thao tác trên file Sheets/DB của shop.

Backend trả kết quả cho Frontend.

2. Luồng kết nối (Onboarding)
User chọn "Kết nối Google Sheets".

Next.js thực hiện OAuth flow.

Nhận refresh_token → Lưu vào connectors table (đã mã hóa).

Verify kết nối → Set status = active.

4. DB Schema Summary
tenants: Định nghĩa gian hàng.

connectors: Cấu hình adapter cho gian hàng.

user_tenants: RBAC (phân quyền user).

subscriptions: Gói dịch vụ (Gating tính năng).

domains: Map domain → tenant.

5. Directory Mapping (Project Map)
/apps/web: Ứng dụng chính (UI + Control-Plane API).

/packages/core: Type, Schema SQL, Helper chung.

/packages/adapters: Logic kết nối provider.

Ghi chú cho AI Agent: Khi được yêu cầu viết tính năng mới, hãy luôn tuân thủ nguyên tắc: dữ liệu nghiệp vụ thuộc về Adapter, mọi quản trị thuộc về Control-Plane. Không được hardcode URL của provider vào bất kỳ đâu ngoài connectors config.
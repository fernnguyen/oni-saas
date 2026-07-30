# ONI HRM Module — Implementation Plan

> Trạng thái: Architecture approved — sẵn sàng triển khai theo task list
> Đối tượng: Hộ kinh doanh nhỏ và SME
> Nguyên tắc: Module độc lập, plug-and-play, business data nằm tại PostgreSQL connector, không phá vỡ luồng ONI/POS hiện hữu

## 1. Mục tiêu

Xây dựng module HRM cơ bản nhưng sử dụng được trong thực tế, gồm:

- Quản lý hồ sơ nhân viên dựa trên danh mục `employees` hiện có.
- Phân biệt rõ nhân viên và người dùng có tài khoản ONI.
- Nhân viên thuộc một chi nhánh và một phòng ban tại một thời điểm.
- Chuyển nhân viên sang chi nhánh/phòng ban mới bằng nghiệp vụ có kiểm soát.
- Quản lý ca làm và chấm công.
- Tính lương tháng/ngày/giờ, phụ cấp, thưởng và khấu trừ cơ bản.
- Owner có thể trực tiếp tính, chốt và thanh toán lương.
- Ghi nhận chi lương sang sổ quỹ, có chống ghi trùng và truy vết.
- Dashboard và báo cáo HRM cơ bản.
- Có thể bật/tắt module theo tenant mà không ảnh hưởng các chức năng hiện hữu.

## 2. Ngoài phạm vi MVP

Không triển khai trong MVP:

- Tuyển dụng và quản lý ứng viên.
- Đào tạo, lộ trình nghề nghiệp hoặc đánh giá 360 độ.
- Quy trình duyệt lương nhiều cấp.
- Tự động tính thuế TNCN, bảo hiểm hoặc quyết toán pháp lý.
- Tích hợp máy vân tay, nhận diện khuôn mặt hoặc GPS.
- Tự động lấy hoa hồng POS vào bảng lương.
- Thay đổi kiến trúc Core, POS offline, sync worker hoặc LocalDB.

Các khả năng trên có thể được bổ sung sau qua sub-module hoặc feature flag riêng.

## 3. Quyết định kiến trúc đã chốt

### 3.1. Nhân viên khác người dùng

| Khái niệm | Nguồn dữ liệu | Ý nghĩa |
|---|---|---|
| Nhân viên | `employees` + `hrm_employee_profiles` | Người được quản lý công và lương |
| Người dùng | Supabase Auth + `tenant_user_profiles` | Danh tính đăng nhập ONI |
| Vai trò hệ thống | `roles`, `role_permissions` | Quyền thao tác trên ONI |
| Chức danh | HRM profile | Công việc của nhân viên, không tự cấp quyền |

Quy tắc:

- Tạo nhân viên không tự tạo tài khoản.
- Tạo tài khoản không tự tạo nhân viên.
- Liên kết nhân viên–tài khoản là tùy chọn.
- Một tài khoản được liên kết tối đa một nhân viên trong cùng tenant.
- Xóa hoặc khóa tài khoản không xóa hồ sơ công/lương.
- Nhân viên nghỉ việc không tự động xóa tài khoản; owner được nhắc xử lý quyền riêng.

### 3.2. Employee hiện tại vẫn là nguồn vận hành

- Không thay thế bảng `employees`.
- Không đổi URL hoặc response shape của API nhân viên hiện hữu.
- HRM tạo `hrm_employee_profiles` làm sidecar và định danh ổn định cho chấm công/lương.
- Màn hình nhân viên hiện tại tiếp tục hoạt động khi HRM bị tắt.
- Khi HRM bật, UI có thể đọc thêm dữ liệu sidecar nhưng CRUD cũ vẫn tương thích.

### 3.3. Phạm vi nhân viên

- Một nhân viên có một chi nhánh chính và một phòng ban tại một thời điểm.
- Owner có toàn quyền trong tenant.
- Tài khoản khác chỉ được chuyển nhân viên khi có `hrm.employee.transfer`.
- Lịch sử công/lương giữ nguyên shop/department tại thời điểm phát sinh.

### 3.4. Payroll dành cho owner

Luồng MVP:

```text
Nháp → Đã chốt → Đã thanh toán
```

- Owner có thể tạo kỳ lương, tính lại, điều chỉnh, chốt và thanh toán.
- Trước khi chốt, owner có thể sửa khoản cộng/trừ và phải nhập lý do.
- Sau khi chốt, kết quả là snapshot, không tự đổi theo cấu hình mới.
- Sau khi thanh toán, kỳ lương bất biến trong MVP.
- Sai sót sau thanh toán được điều chỉnh ở kỳ sau hoặc xử lý bằng nghiệp vụ sổ quỹ riêng.

### 3.5. Lưu trữ module

- Supabase tiếp tục là **control plane**: Auth, tenant, shop, membership, role/permission, subscription, feature flag và metadata connector.
- Shared PostgreSQL của ONI là **data plane** và system of record cho toàn bộ `hrm_*`.
- Employee, department, attendance, payroll, cashbook và payment fund cùng nằm trong shared PostgreSQL để giữ data locality và transaction xuyên nghiệp vụ.
- Không lưu bản sao bảng lương, chấm công hoặc hồ sơ HRM trong Supabase.
- `auth_user_id` trong HRM chỉ là liên kết logic tới Supabase Auth; không tạo foreign key xuyên database.
- Mọi bảng HRM bắt buộc có `tenant_id`; bảng có phạm vi chi nhánh dùng `branch_id` để thống nhất với connector hiện hữu.
- HRM MVP chỉ hỗ trợ shared PostgreSQL capability (`postgres_local` hoặc `postgres_remote`); không ghi operational HRM vào Supabase/MySQL/Google Sheets.

Shared data-plane inject `tenant_id` và `branch_id` vào mọi truy vấn. Vì vậy chuyển nhân viên giữa các chi nhánh trong cùng tenant là cập nhật phạm vi trong cùng PostgreSQL database, không phải copy dữ liệu giữa connector.

### 3.6. Entitlement và CTA nâng cấp

Feature key chính thức:

```text
hrm
```

Nguồn xác định entitlement bám theo control-plane ONI nhưng cần hỗ trợ kill switch rõ ràng:

1. Nếu tồn tại `feature_flags(tenant_id, key='hrm')`, lấy đúng `enabled=true|false`. `false` là explicit kill switch.
2. Chỉ khi không có row override mới đọc `plans.metadata.hrm` từ subscription active/past_due.
3. Không hard-code theo tên plan trong HRM.

Không thay đổi semantics của `checkFeatureAccess()` đang dùng bởi module khác. Tạo `getHrmEntitlement()` trả cả `enabled`, `source` và `reason`, hoặc bổ sung helper tri-state dùng riêng cho module.

Quy tắc UX:

- Menu HRM được hiển thị cho người có quyền xem navigation, kể cả khi tenant chưa được enable, nhưng có trạng thái khóa rõ ràng.
- Khi click module chưa enable, mở trải nghiệm CTA nâng cấp thống nhất với Plan Modal hiện hữu.
- Truy cập URL trực tiếp vẫn render trang “Module HRM chưa được kích hoạt”; không redirect mơ hồ và không query connector.
- Người có `settings.manage`, `tenants.manage` hoặc `billing.manage` thấy nút “Nâng cấp/Bật HRM”.
- Người không có quyền nâng cấp thấy hướng dẫn liên hệ owner.
- Nếu đã có entitlement nhưng connector không có PostgreSQL capability (`postgres_local|postgres_remote`), hiển thị CTA cấu hình PostgreSQL; đây là lỗi capability, không phải lỗi thanh toán.
- Tất cả API HRM phải trả lỗi chuẩn hóa trước khi truy cập data plane:

```text
403 HRM_PERMISSION_DENIED
402 HRM_MODULE_NOT_ENABLED
409 HRM_POSTGRES_REQUIRED
503 HRM_SCHEMA_NOT_READY
```

Ẩn/khóa menu chỉ là UX; server gate mới là lớp bảo vệ bắt buộc.

### 3.7. Ranh giới module và schema

- Không sửa interface Core chỉ để phục vụ HRM.
- HRM có repository/service riêng và chỉ được tạo sau khi control-plane guard xác nhận auth, tenant, permission và entitlement; sau đó mới đọc connector metadata, kiểm tra PostgreSQL capability/schema và khởi tạo repository.
- Không gọi `requireShopAccess()` làm bước đầu của HRM vì helper hiện tại khởi tạo connector trước khi HRM entitlement được xác nhận.
- `PostgresHrmRepository` nhận cấu hình đã giải mã ở server qua factory riêng, dùng `pg.Pool`/`PoolClient` của chính nó; không phụ thuộc private pool của `PostgresConnector` và không thay đổi `IDataConnector`.
- Route chỉ gọi composed wrapper `requireHrmAccess(shopId, permission?)`; wrapper lần lượt gọi `authorizeHrmControlPlane()` rồi repository capability/schema factory để tránh mỗi route tự ghép gate theo cách khác nhau.
- Các bảng `hrm_*` được export từ `schema_pg.ts` và do pipeline `db:push:pg --strict` hiện hữu quản lý như mọi bảng PostgreSQL khác.
- Không có migration runner, registry hoặc deployment step riêng cho HRM.
- Không tự chạy DDL trong request GET hoặc lúc application boot.
- Sau khi shared schema đã đạt version yêu cầu, enable/disable từng tenant chỉ cập nhật entitlement record ở Supabase.
- Tắt entitlement không xóa schema hoặc dữ liệu.

## 4. Cấu trúc module

### 4.1. UI dự kiến

```text
HRM
├── Tổng quan
├── Nhân viên       → dùng danh mục hiện tại, bổ sung HRM profile
├── Phòng ban       → dùng danh mục hiện tại
├── Chấm công
├── Bảng lương
├── Báo cáo
└── Cấu hình HRM
```

Chuẩn UI bắt buộc:

- List/table bám theo DataTable, toolbar, filter, skeleton và EmptyState hiện hữu.
- Create/edit hồ sơ, cấu hình lương và custom field dùng `SlideOver`.
- Action ngắn hoặc cần tập trung dùng modal dialog hiện hữu.
- Mọi mutation quan trọng dùng `useConfirm()` với async `onConfirm`, khóa đóng dialog khi đang xử lý.
- Success/error feedback dùng `sonner` toast.
- Icon chỉ dùng `lucide-react`.
- Không tạo thêm một bộ Button/Input/Dialog riêng trong module nếu component dùng chung đã đáp ứng.
- Payroll và attendance phải usable trên màn hình nhỏ, nhưng MVP web không thay đổi POS/mobile sync.

Các trang mới đặt dưới:

```text
apps/web/app/t/[slug]/[branch]/hrm/
```

API mới đặt dưới:

```text
apps/web/app/api/shops/[shopId]/hrm/
```

Logic server của module đặt dưới:

```text
apps/web/lib/server/hrm/
apps/web/lib/validators/hrm/
```

Domain logic thuần, không phụ thuộc HTTP/UI:

```text
apps/web/lib/hrm/domain/
```

PostgreSQL implementation nằm tại data-plane adapter:

```text
packages/adapters/src/hrm/PostgresHrmRepository.ts
packages/adapters/src/hrm/schema.ts
packages/adapters/src/hrm/PostgresHrmSchemaVerifier.ts
```

`PostgresHrmRepository` là module-local capability, không mở rộng hoặc thay đổi interface Core đang dùng bởi POS. Payroll calculator phải là pure function và không được đặt trong React component hoặc route handler.

## 5. Mô hình dữ liệu MVP

### 5.1. `hrm_employee_profiles`

Hồ sơ mở rộng và định danh HRM ổn định.

```text
id                    varchar(255) PK
tenant_id             varchar(255) NOT NULL
branch_id             varchar(255) NOT NULL
source_employee_id    varchar(255) NOT NULL
auth_user_id          uuid NULL
department_id         text NULL
job_title             text NULL
employment_status     active | probation | inactive
employment_type       monthly | daily | hourly
joined_at             date NULL
ended_at              date NULL
email                  text NULL
address                text NULL
bank_name              text NULL
bank_account_last4     varchar(4) NULL
bank_account_ciphertext text NULL
custom_data            jsonb NOT NULL DEFAULT {}
created_at             timestamptz
updated_at             timestamptz
```

Ràng buộc:

- Unique `(tenant_id, source_employee_id)`.
- Partial unique `(tenant_id, auth_user_id)` khi `auth_user_id IS NOT NULL`.
- Không có foreign key/cascade từ `auth_user_id` sang Supabase.
- `tenant_id`, `branch_id` và `source_employee_id` dùng cùng kiểu ID với connector hiện hữu.
- Không lưu số tài khoản đầy đủ dạng plaintext; ciphertext chỉ được giải mã server-side cho nghiệp vụ được cấp quyền.
- Dữ liệu lương không nằm trong bảng này.

### 5.2. `hrm_employee_transfers`

```text
id
tenant_id
profile_id
from_branch_id
to_branch_id
from_department_id
to_department_id
effective_at
transferred_by
note
created_at
```

### 5.3. `hrm_custom_field_definitions`

```text
id
tenant_id
branch_id NULL
key
label
field_type
options jsonb
required
active
sort_order
```

`branch_id = NULL` là field dùng toàn tenant; có giá trị là field riêng của chi nhánh. Giá trị custom field nằm trong `hrm_employee_profiles.custom_data` để tránh EAV phình dữ liệu.

### 5.4. `hrm_shift_templates`

```text
id
tenant_id
branch_id
name
start_time
end_time
break_minutes
late_grace_minutes
active
```

### 5.5. `hrm_attendance_days`

Một dòng cho mỗi nhân viên/ngày.

```text
id
tenant_id
branch_id
profile_id
department_id_snapshot NULL
work_date
shift_template_id NULL
clock_in NULL
clock_out NULL
worked_minutes
late_minutes
early_leave_minutes
overtime_minutes
status
source
note
updated_by
created_at
updated_at
```

Unique `(tenant_id, profile_id, work_date)`.

Trạng thái MVP:

```text
present | absent | paid_leave | unpaid_leave | holiday
```

### 5.6. `hrm_salary_configs`

```text
id
tenant_id
profile_id
salary_type             monthly | daily | hourly
base_amount             bigint
standard_work_days      integer NULL
standard_work_hours     numeric NULL
overtime_multiplier     numeric DEFAULT 1
recurring_allowances    jsonb DEFAULT []
effective_from          date
effective_to            date NULL
created_by
created_at
```

Tiền lưu bằng số nguyên VND để tránh sai số floating point.

### 5.7. `hrm_payroll_runs`

```text
id
tenant_id
branch_id
period_start
period_end
status                  draft | finalized | paid
standard_work_days
total_gross
total_allowances
total_deductions
total_net
version                 integer NOT NULL DEFAULT 1
calculated_at
finalized_at
paid_at
created_by
updated_at
```

Unique `(tenant_id, branch_id, period_start, period_end)`.

### 5.8. `hrm_payroll_items`

```text
id
tenant_id
payroll_run_id
profile_id
employee_name_snapshot
employee_code_snapshot
department_id_snapshot
salary_type_snapshot
base_amount_snapshot
work_units
regular_pay
overtime_pay
allowance_total
bonus_total
commission_total
deduction_total
net_pay
breakdown jsonb
manual_note
updated_by
```

Unique `(payroll_run_id, profile_id)`.

### 5.9. `hrm_cashbook_postings`

```text
id
tenant_id
branch_id
payroll_run_id
cashbook_transaction_id
fund_id
amount
posted_by
posted_at
```

Unique `payroll_run_id` để chống ghi chi lương hai lần.

### 5.10. `hrm_audit_logs`

Chỉ ghi các sự kiện quan trọng:

- Liên kết/hủy liên kết tài khoản.
- Chuyển chi nhánh/phòng ban.
- Sửa bảng công.
- Thay đổi cấu hình lương.
- Điều chỉnh/chốt/thanh toán bảng lương.
- Export bảng lương.

Không ghi snapshot toàn bộ record nếu không cần thiết.

### 5.11. Kiểm soát tăng trưởng dữ liệu

- Attendance dùng một dòng/nhân viên/ngày, không ghi một dòng cho mỗi lần UI refresh hoặc mỗi lần tính lương.
- Payroll item là snapshot theo kỳ; không nhân bản profile hoặc attendance vào JSON.
- Custom fields nằm trong `custom_data` thay vì EAV nhiều dòng.
- File import chỉ lưu kết quả và error summary cần thiết; không lưu file gốc vô hạn trong database.
- Audit chỉ ghi nghiệp vụ nhạy cảm, không ghi payload đầy đủ chứa lương/tài khoản ngân hàng.
- Index ưu tiên `(tenant_id, branch_id, ...)` và theo kỳ/ngày; dashboard không scan toàn bộ lịch sử.
- Thêm job đo row count/table size và cảnh báo, nhưng chưa tự xóa attendance/payroll trong MVP.

## 6. Công thức lương MVP

### 6.1. Lương tháng

```text
Lương theo công = Lương cơ bản / Số ngày công chuẩn × Số ngày công hưởng lương
```

### 6.2. Lương ngày

```text
Lương theo công = Mức lương ngày × Số ngày công hưởng lương
```

### 6.3. Lương giờ

```text
Lương theo công = Mức lương giờ × Tổng giờ công hợp lệ
```

### 6.4. Thực nhận

```text
Thực nhận =
  Lương theo công
  + Lương tăng ca
  + Phụ cấp định kỳ
  + Phụ cấp phát sinh
  + Thưởng
  + Hoa hồng nhập tay
  - Khấu trừ
```

Quy tắc:

- Kết quả làm tròn theo VND.
- Không tự tính thuế/bảo hiểm trong MVP.
- `commission_total` nhập tay trong MVP.
- Mỗi khoản chỉnh tay phải có mô tả trong `breakdown`.
- Calculator nhận input thuần và trả output thuần để unit test.

## 7. Phân quyền MVP

Permission code:

```text
hrm.view
hrm.employee.manage
hrm.employee.transfer
hrm.attendance.manage
hrm.payroll.view
hrm.payroll.manage
hrm.payroll.pay
hrm.settings.manage
```

Quy tắc:

- Owner có toàn bộ quyền HRM trong tenant.
- Không suy quyền từ `employee.role`, chức danh hoặc phòng ban.
- `hrm.payroll.view` mới được nhận dữ liệu lương từ API.
- `hrm.payroll.manage` được tính, chỉnh và chốt lương.
- `hrm.payroll.pay` và `cashbook.manage` mới được ghi sổ quỹ.
- Mọi API vẫn phải kiểm tra tenant/shop access hiện hữu.
- Menu ẩn không thay thế kiểm tra quyền server.

Không tạo role workflow nhiều tầng trong MVP. Custom role hiện hữu có thể được gán các permission trên khi cần mở rộng.

## 8. Nghiệp vụ chuyển chi nhánh/phòng ban

Endpoint dự kiến:

```text
POST /api/shops/[shopId]/hrm/employees/[profileId]/transfer
```

Input:

```json
{
  "target_branch_id": "...",
  "target_department_id": "...",
  "effective_date": "2026-08-01",
  "move_linked_user_access": false,
  "note": "Điều chuyển sang cơ sở mới"
}
```

Luồng:

1. Kiểm tra owner hoặc `hrm.employee.transfer`.
2. Kiểm tra source và target thuộc cùng tenant.
3. Kiểm tra phòng ban thuộc target shop.
4. Dùng tenant-scoped connector để khóa employee/profile cần chuyển.
5. Cập nhật `employees.branch_id`.
6. Cập nhật `hrm_employee_profiles.branch_id` và `department_id`.
7. Ghi `hrm_employee_transfers` trong cùng transaction.
8. Chỉ cập nhật `user_shops` ở control plane khi owner chọn rõ `move_linked_user_access`.
9. Nếu cập nhật quyền user thất bại, employee transfer vẫn được ghi nhận và tạo reconciliation item để retry; không rollback dữ liệu công/lương đã commit.

Không sửa lịch sử attendance/payroll cũ. Attendance giữ `branch_id` và `department_id_snapshot`; payroll item giữ snapshot tương ứng. Bản ghi mới sử dụng branch/department mới từ ngày hiệu lực.

MVP chỉ thực hiện điều chuyển có hiệu lực ngay tại thời điểm owner xác nhận. Lập lịch điều chuyển trong tương lai cần scheduler/reconciliation riêng và để sau MVP.

## 9. Tích hợp sổ quỹ

Luồng:

1. Payroll run phải ở trạng thái `finalized`.
2. Người thực hiện phải có `hrm.payroll.pay` và `cashbook.manage`.
3. Chọn quỹ thanh toán.
4. Tạo một phiếu chi tổng hợp cho kỳ lương của chi nhánh.
5. Cập nhật số dư quỹ bằng cùng quy ước của cashbook hiện tại.
6. Tạo `hrm_cashbook_postings`.
7. Chuyển payroll run thành `paid`.

Cashbook payload tương thích:

```text
type             = payment
category         = salary_payment
reference_id     = payroll_run_id
reference_name   = Bảng lương MM/YYYY
amount           = total_net
branch_id        = payroll_run.branch_id
fund_id          = quỹ được chọn
employee_id      = user thực hiện
note             = Chi lương kỳ ...
```

Chi tiết lương từng nhân viên không ghi vào cashbook để tránh lộ dữ liệu.

Yêu cầu kỹ thuật:

- Posting idempotent.
- Dùng PostgreSQL transaction thật; không dùng compensating rollback làm bảo đảm chính cho chi lương.
- Lock payroll run và payment fund bằng `SELECT ... FOR UPDATE`.
- Unique `hrm_cashbook_postings(payroll_run_id)` và unique reference phù hợp để chống double-submit.
- Không gọi API HTTP nội bộ từ server sang chính server.
- Module-local repository sử dụng shared PostgreSQL pool và luôn scope theo `tenant_id`/`branch_id`.
- Không đi qua `IDataConnector`, `RollbackContext`, cashbook route hoặc `resolveAndRecordPayment()` cho thao tác chi lương.
- `PostgresHrmRepository.payPayrollRun()` lấy một `PoolClient`, chạy `BEGIN/COMMIT/ROLLBACK` và ghi trực tiếp các bảng liên quan bằng parameterized SQL.
- Không thay đổi hành vi của endpoint cashbook hiện tại.
- Nếu một bước thất bại thì rollback toàn bộ: cashbook, fund balance, posting, payroll status và audit.

## 10. Chiến lược plug-and-play và tương thích ngược

### Module tắt

- Menu HRM hiển thị ở trạng thái khóa và dẫn tới CTA nâng cấp nếu người dùng có quyền navigation.
- Không chạy query HRM trên các trang cũ.
- Employee, department, POS, shift và cashbook chạy như hiện tại.
- Không yêu cầu HRM migration để các module hiện hữu hoạt động.
- API HRM dừng ở entitlement gate, không mở connector.

### Module bật

- Kiểm tra connector type `postgres_local|postgres_remote` và đủ bảng/cột HRM trước khi cho truy cập.
- Hiển thị nhóm menu HRM ở trạng thái hoạt động.
- Cho phép tạo sidecar profile từ employee hiện hữu.
- Nếu employee chưa có sidecar, tạo lazy hoặc chạy backfill an toàn.
- Không thay response mặc định của employee API cũ.

### Rollout

1. Backup shared PostgreSQL và xác nhận restore procedure.
2. Deploy code có module gate; feature/plan metadata mặc định không bật HRM.
3. Chạy regression khi toàn bộ tenant vẫn disabled.
4. Deploy chạy `db:push:pg --strict`; lần đầu Drizzle tạo các bảng HRM, những lần schema không đổi sẽ no-op.
5. Verify bảng/cột HRM chung rồi bật feature flag cho tenant nội bộ.
6. Hoàn thành một chu kỳ profile → công → lương → sổ quỹ.
7. Bật theo từng tenant pilot; không bulk enable.
8. Sau pilot mới thêm HRM vào metadata gói bán chính thức.

Rollback ứng dụng chỉ cần tắt feature flag; không xóa dữ liệu HRM.

### Production invariants

- Feature `hrm` mặc định `false`; deploy code không đồng nghĩa enable tenant.
- Không chạy DDL khi render page, gọi GET API hoặc khởi động app.
- Không alter/drop/rename bảng/cột hiện hữu trong release HRM MVP.
- Không backfill đồng bộ trong request người dùng; mọi backfill theo batch và retry được.
- Không thay đổi POS offline, mobile sync, employee API, department API hoặc cashbook API hiện hữu.
- Không sửa `packages/core/**` trong HRM MVP; domain HRM bắt đầu module-local trong web và adapter-local repository.
- Không tạo workspace package mới ở foundation. Chỉ extract package khi có ít nhất hai consumer runtime và standalone impact đã được kiểm chứng.
- Không log salary breakdown, bank account plaintext, connection URI hoặc Supabase service key.
- Không cho payroll payment fallback sang nhiều bước ngoài transaction.
- Deployment phải hoàn tất `db:push:pg --strict` và verify shared schema trước rollout; mỗi lần enable chỉ cần xác nhận schema đang ready, tenant allowlist và cách disable tức thời.
- Số liệu trước/sau payroll payment phải đối chiếu được qua payroll posting, cashbook và fund balance.

## 11. Implementation task list

### 11.1. Task execution contract

Actions/checklists dưới mỗi task là phạm vi nghiệp vụ. Bảng này khóa primary files, lệnh verify và kết quả đo được; implementation không được đánh dấu task hoàn tất nếu thiếu một trong ba.

| Task | Primary files dự kiến | Automated verify bắt buộc | Done đo được |
|---|---|---|---|
| HRM-000 | `docs/HRM-MODULE-IMPLEMENTATION.md` | `git diff --check` | Scope/non-goal được owner chấp nhận |
| HRM-001 | `package.json`, `vitest.config.*`, `tests/hrm/**` | `pnpm test:hrm`; `pnpm test:hrm:integration`; `pnpm test:hrm:regression` | Harness chạy được và baseline được lưu |
| HRM-002 | `apps/web/lib/server/hrm/entitlement.ts`, Supabase metadata migration | `pnpm test:hrm -- entitlement` | Flag true/false và plan fallback đúng |
| HRM-003 | `nav.tsx`, `Sidebar.tsx`, `NavHorizontal.tsx`, `Topbar.tsx`, `PlanBadge.tsx`, HRM locked state | `pnpm test:hrm -- entitlement-ui`; `pnpm lint`; `pnpm build` | Dọc/ngang/mobile/direct URL cho CTA đúng |
| HRM-101 | `schema_pg.ts`, `packages/adapters/src/hrm/schema.ts` | `pnpm test:hrm -- postgres`; `pnpm test:hrm:integration -- schema` | `db:push:pg` sở hữu HRM schema; physical verifier đạt |
| HRM-102 | Supabase permission migration, role management UI | `pnpm test:hrm -- permissions`; `pnpm test:hrm:regression -- roles` | Owner đủ quyền, role khác đúng 403 |
| HRM-103 | `apps/web/lib/server/hrm/access.ts` | `pnpm test:hrm -- access` | Disabled request mở 0 connector |
| HRM-104 | `apps/web/lib/server/hrm/backfill.ts`, operator route | `pnpm test:hrm:integration -- backfill` | Batch retry không tạo profile trùng |
| HRM-105 | `packages/adapters/src/hrm/PostgresHrmRepository.ts`, HRM factory | `pnpm test:hrm:integration -- repository` | Chỉ local/remote PG + schema ready tạo repo |
| HRM-106 | super-admin HRM enable API/UI, schema verifier | `pnpm test:hrm:integration -- enable-workflow` | Verify shared schema→enable/disable có audit |
| HRM-107 | `apps/web/lib/hrm/domain/**`, domain types | `pnpm test:hrm -- domain-contract`; `pnpm build` | Domain module thuần, chưa cần workspace package |
| HRM-201 | HRM employee service và `/api/shops/[shopId]/hrm/employees/**` | `pnpm test:hrm:integration -- employees`; regression employee | Merge sidecar đúng, API cũ không đổi |
| HRM-202 | user-link API và employee UI | `pnpm test:hrm:integration -- user-link`; `pnpm lint` | Link/unlink không đổi role hoặc xóa employee |
| HRM-203 | custom-field API và profile `SlideOver` | `pnpm test:hrm -- custom-fields`; `pnpm build` | Field động render/validate/export đúng |
| HRM-204 | transfer service/API | `pnpm test:hrm:integration -- transfer` | Atomic data-plane transfer, history giữ nguyên |
| HRM-205 | `apps/web/app/t/[slug]/[branch]/hrm/**`, navigation | `pnpm test:hrm -- navigation`; `pnpm lint`; `pnpm build` | UI đúng style và URL cũ không đổi |
| HRM-206 | employee import/export API/UI | `pnpm test:hrm:integration -- employee-import` | Preview/error report/retry không ghi đè mơ hồ |
| HRM-301 | shift repository/API/UI | `pnpm test:hrm:integration -- shifts` | CRUD và ca qua ngày đúng |
| HRM-302 | `apps/web/lib/hrm/domain/attendanceCalculator.ts` | `pnpm test:hrm -- attendance-calculator` | Boundary/timezone cases đạt |
| HRM-303 | attendance/import API | `pnpm test:hrm:integration -- attendance-api` | Snapshot branch/department và import atomic |
| HRM-304 | HRM attendance pages/components | `pnpm test:hrm -- attendance-ui`; `pnpm build` | Bảng công usable, mutation feedback đúng |
| HRM-401 | salary config repository/API/UI | `pnpm test:hrm:integration -- salary-config` | Effective history và payroll permission đúng |
| HRM-402 | `apps/web/lib/hrm/domain/payrollCalculator.ts` | `pnpm test:hrm -- payroll-calculator` | Công thức số nguyên và breakdown đạt |
| HRM-403 | payroll run repository/service/API | `pnpm test:hrm:integration -- payroll-run` | CAS version, snapshot và state machine đúng |
| HRM-404 | HRM payroll pages/components | `pnpm test:hrm -- payroll-ui`; `pnpm build` | Owner recalc/finalize/export theo style ONI |
| HRM-501 | PG payroll payment transaction + API/UI | `pnpm test:hrm:integration -- payroll-payment` | Real PG rollback và double-submit concurrency đạt |
| HRM-502 | HRM overview API/page | `pnpm test:hrm:integration -- overview`; `pnpm build` | Aggregate tenant/branch đúng permission |
| HRM-503 | HRM report API/page/export | `pnpm test:hrm:integration -- reports`; `pnpm build` | Báo cáo/export không lộ payroll |
| HRM-601 | `tests/hrm/unit/**`, `tests/hrm/integration/**` | Cả ba script HRM | Coverage các engine/gate/transaction bắt buộc |
| HRM-602 | `tests/hrm/regression/**` | `pnpm test:hrm:regression`; `pnpm lint`; `pnpm build` | Toàn bộ baseline cũ xanh khi HRM disabled |
| HRM-603 | pilot runbook/checklist và observability | Cả ba script + schema verify | Pilot hoàn tất một chu kỳ và rollback drill |
| HRM-604 | `docs/hrm/**`, import templates | `git diff --check`; link/template validation | Owner/operator docs khớp behavior đã pilot |

Quy ước integration:

- Test transaction payroll payment bắt buộc chạy trên PostgreSQL thật, disposable/isolated; mock không được dùng làm bằng chứng rollback/concurrency.
- Command phải từ chối chạy nếu `HRM_TEST_DATABASE_URL` trùng hoặc có dấu hiệu là production connector.
- `pnpm test:hrm -- <pattern>` trong bảng là contract cho script/filter được tạo ở HRM-001; tên cuối cùng có thể đổi nhưng CI phải có command tương đương, ổn định và được ghi lại.

## Milestone 0 — Contract và safety net

### HRM-000 — Khóa scope MVP

- [ ] Xác nhận các non-goal tại mục 2.
- [ ] Xác nhận owner là role mặc định có toàn quyền HRM.
- [ ] Xác nhận nhân viên chỉ có một shop/department hiện hành.
- [ ] Xác nhận không tự động tính thuế/bảo hiểm.
- [ ] Xác nhận POS commission chỉ nhập tay trong MVP.

**Done khi:** Product owner chấp nhận tài liệu scope.

### HRM-001 — Regression baseline

- [ ] Chọn và cấu hình test runner TypeScript dùng thống nhất cho HRM (ưu tiên Vitest), vì repo hiện chưa có root test script/config hoàn chỉnh.
- [ ] Thêm script `test:hrm`, `test:hrm:integration`, `test:hrm:regression` ở root.
- [ ] Đặt toàn bộ test mới dưới `tests/hrm/`; không tạo test/scratch file trong `apps/` hoặc `packages/`.
- [ ] Integration test chỉ dùng PostgreSQL disposable/isolated qua `HRM_TEST_DATABASE_URL`; guard cứng không cho trỏ production.
- [ ] Ghi nhận test hiện tại của employee CRUD.
- [ ] Ghi nhận test hiện tại của department CRUD.
- [ ] Ghi nhận test cashbook receipt/payment.
- [ ] Ghi nhận test POS order có `employee_id`.
- [ ] Tạo smoke checklist khi module `hrm=false`.

**Done khi:** Ba command test có thể chạy trong CI/local và baseline được ghi nhận trước khi source runtime thay đổi.

### HRM-002 — Module entitlement

- [ ] Đăng ký `plans.metadata.hrm` với mặc định `false` cho mọi plan hiện hữu.
- [ ] Cập nhật plan metadata normalization/default display để plan thiếu key cũ được hiểu là `false`, không tự enable.
- [ ] Dùng `feature_flags.key = 'hrm'` làm explicit override true/false cho tenant pilot, kill switch hoặc module bán rời.
- [ ] Tạo `getHrmEntitlement()` theo quy tắc: row flag → dùng true/false; không có row → fallback `plans.metadata.hrm`.
- [ ] Không đổi semantics `checkFeatureAccess()` toàn hệ thống và không hard-code plan.
- [ ] Truyền trạng thái entitlement vào navigation mà không query lặp trên client.
- [ ] Gate toàn bộ page loader và API HRM.
- [ ] Đảm bảo tenant chưa bật HRM không mở connector và không phát sinh query `hrm_*`.
- [ ] Chuẩn hóa lỗi `HRM_MODULE_NOT_ENABLED`.
- [ ] Test explicit false thắng plan=true và có thể disable tenant tức thời.

**Phụ thuộc:** HRM-000.
**Done khi:** Tắt flag thì menu ở trạng thái khóa/CTA và ONI hoạt động như trước; bật flag thì module chỉ mở sau khi capability/schema hợp lệ.

### HRM-003 — Locked navigation và upgrade CTA

- [ ] Thêm item/group HRM theo style navigation hiện hữu và dùng icon `lucide-react`.
- [ ] Khi chưa entitlement, item có trạng thái khóa nhưng vẫn click được.
- [ ] Reuse Plan Modal/event nâng cấp hiện hữu với context `feature=hrm` thay vì tạo checkout riêng.
- [ ] Highlight các plan có `metadata.hrm=true`; nếu HRM bán rời chưa có self-service checkout thì CTA chuyển sang liên hệ/nâng cấp module, không giả định một plan cố định.
- [ ] Wire đồng nhất cả `nav.tsx`, `Sidebar.tsx`, `NavHorizontal.tsx`, `Topbar.tsx` và `PlanBadge.tsx`; test cả menu dọc/ngang/mobile.
- [ ] Dùng permission có thật `tenants.manage`, không tiếp tục dùng chuỗi sai `org.manage` trong CTA.
- [ ] Direct URL render module upgrade state, không redirect vòng và không query connector.
- [ ] User có quyền billing/settings thấy CTA; user khác thấy “Liên hệ chủ cửa hàng”.
- [ ] Trường hợp connector không phải PostgreSQL hiển thị CTA cấu hình connector, không hiển thị CTA thanh toán.
- [ ] Viết test cho enabled, disabled, direct URL và user không có quyền nâng cấp.

**Phụ thuộc:** HRM-002.
**Done khi:** Tenant chưa mua hiểu rõ lý do bị khóa và có đúng hành động tiếp theo mà không lộ dữ liệu HRM.

## Milestone 1 — Foundation dữ liệu và quyền

### HRM-101 — Shared PostgreSQL schema

- [ ] Thêm schema Drizzle PostgreSQL cho các bảng `hrm_*`.
- [ ] Export HRM schema từ `schema_pg.ts` để pipeline `db:push:pg --strict` hiện hữu quản lý.
- [ ] Thêm index theo tenant/branch/profile/date/status; không tạo index global không có `tenant_id`.
- [ ] Không alter/drop/rename `employees`, `departments`, `cashbook`, `payment_funds`.
- [ ] Không thêm schema HRM vào Supabase migration.
- [ ] Viết physical verifier cho bảng/cột bắt buộc; không thêm migration runner/registry riêng.
- [ ] Thay đổi schema tương lai ưu tiên additive; rename/drop/backfill phải được review và xác nhận thủ công bởi `--strict`.

**Phụ thuộc:** HRM-000.
**Done khi:** `db:push:pg --strict` tạo HRM schema trên bản sao shared PostgreSQL có dữ liệu cũ, lần deploy sau no-op khi schema không đổi, và các flow cũ vẫn đọc/ghi bình thường.

### HRM-102 — Permission seed

- [ ] Seed tám permission HRM.
- [ ] Gán toàn bộ HRM permission cho owner.
- [ ] Cho phép custom role chọn permission HRM.
- [ ] Test non-owner không được xem payroll khi chưa cấp quyền.

**Phụ thuộc:** HRM-002.
**Done khi:** API trả 403 đúng và owner truy cập đầy đủ.

### HRM-103 — HRM control-plane access boundary

- [ ] Tạo `authorizeHrmControlPlane(shopId, permission?)` chỉ truy vấn Supabase control-plane.
- [ ] Thứ tự gate runtime: auth → tenant/shop membership → HRM permission/upgrade permission → entitlement.
- [ ] Không gọi `requireShopAccess()` ở bước này vì helper đó khởi tạo connector trước khi kiểm tra HRM entitlement.
- [ ] Tenant disabled phải dừng tại đây; không đọc connector metadata, không mở connection và không query `hrm_*`.
- [ ] Chuẩn hóa lỗi 402/403 theo mục 3.6 và trả context CTA an toàn.
- [ ] Viết unit test cho disabled, explicit kill switch, no-access, owner và upgrade-only user.

**Phụ thuộc:** HRM-002, HRM-102.

### HRM-104 — Employee sidecar backfill

- [ ] API/list job đọc employee hiện tại theo shop.
- [ ] Tạo profile còn thiếu theo cách idempotent.
- [ ] Không sửa employee hiện tại.
- [ ] Ghi thống kê created/skipped/error.
- [ ] Cho phép retry.
- [ ] Chạy theo batch, không chạy toàn tenant trong request page đầu tiên.
- [ ] Không tự động link employee với Supabase user.

**Phụ thuộc:** HRM-101, HRM-103, HRM-105, HRM-106.

### HRM-105 — PostgreSQL capability và HRM repository factory

- [ ] Tạo predicate `isPostgresConnectorType()` cho `postgres_local|postgres_remote`; không so sánh với type không tồn tại là `postgres`.
- [ ] Sau control-plane gate, lấy shared PostgreSQL pool và tạo `PostgresHrmRepository` bằng server-side adapter factory riêng.
- [ ] Repository dùng `pg.Pool`/`PoolClient`, parameterized SQL và luôn inject `tenant_id`/`branch_id`.
- [ ] Không dùng `IDataConnector` generic hoặc private pool của `PostgresConnector` cho transaction HRM.
- [ ] Kiểm tra physical schema (bảng/cột bắt buộc) trước khi trả repository cho API runtime.
- [ ] Chuẩn hóa lỗi `HRM_POSTGRES_REQUIRED` và `HRM_SCHEMA_NOT_READY`.
- [ ] Không đưa connection URI hoặc chi tiết connector vào response/log.
- [ ] Viết unit/integration test cho local PG, remote PG, wrong connector và schema missing.
- [ ] Tạo composed `requireHrmAccess()` dùng HRM-103 + HRM-105 và bắt buộc mọi HRM route gọi wrapper này.

**Phụ thuộc:** HRM-101, HRM-103.
**Done khi:** Tenant disabled không mở connection; tenant enabled chỉ nhận repository khi connector có PostgreSQL capability và schema đúng version.

### HRM-106 — Operator enable/disable workflow

- [ ] Dùng kết quả `db:push:pg --strict` hiện hữu làm deployment preflight; không thêm step migration HRM.
- [ ] Verify shared schema vật lý trước khi cho phép enable tenant.
- [ ] Chỉ cho bật flag HRM sau khi schema đạt version yêu cầu.
- [ ] Ghi control-plane audit cho verify, enable và disable tenant.
- [ ] Disable chỉ đổi entitlement; không drop/truncate bảng.
- [ ] Không tự chạy DDL trong GET/page render/application boot.
- [ ] Deploy shared schema khi toàn bộ tenant HRM còn disabled; thao tác này không mở quyền runtime.

**Phụ thuộc:** HRM-002, HRM-101, HRM-105.
**Done khi:** Shared schema được quản lý bởi deployment chung; mỗi tenant đi qua `not entitled → enabled` bằng entitlement record và rollback bằng disable mà không ảnh hưởng dữ liệu cũ.

### HRM-107 — HRM module-local domain boundary

- [ ] Bắt đầu domain thuần trong `apps/web/lib/hrm/domain/**`; không tạo workspace package ở foundation.
- [ ] Định nghĩa money/date/result types dùng chung cho attendance và payroll calculator.
- [ ] Không import Next.js, React, Supabase, `pg` hoặc adapter.
- [ ] Không sửa/chuyển domain type vào `packages/core`.
- [ ] Thêm domain contract test bảo đảm calculator có thể chạy thuần trong Node.
- [ ] Chỉ extract workspace package khi có ít nhất hai consumer runtime; PR extract phải kiểm tra `transpilePackages`, output tracing và standalone artifact.

**Phụ thuộc:** HRM-001.
**Done khi:** Domain module build/test độc lập, chưa chứa side effect/I/O và không thay đổi workspace dependency graph.

## Milestone 2 — Hồ sơ nhân viên và điều chuyển

### HRM-201 — HRM employee API

- [ ] List employee hiện tại và merge sidecar theo server.
- [ ] GET profile.
- [ ] PUT sidecar profile.
- [ ] Validate custom fields.
- [ ] Không trả salary config từ employee endpoint.
- [ ] Mọi query có `tenant_id`; query theo shop có thêm `branch_id`.
- [ ] Không làm thay đổi request/response của employee API hiện hữu.
- [ ] Mask field nhạy cảm nếu caller không có quyền tương ứng.

**Phụ thuộc:** HRM-104.

### HRM-202 — Phân biệt employee và user trên UI

- [ ] Hiển thị badge “Có tài khoản/Chưa có tài khoản”.
- [ ] Tạo action “Liên kết tài khoản”.
- [ ] Tạo action “Hủy liên kết”.
- [ ] Không tự cấp role/permission khi liên kết.
- [ ] Verify auth user thuộc cùng tenant trước khi lưu `auth_user_id`.
- [ ] Không tạo foreign key xuyên database.
- [ ] Xóa/khóa user chỉ unlink, không xóa employee hoặc lịch sử lương.
- [ ] Audit mọi thay đổi liên kết.

**Phụ thuộc:** HRM-201.

### HRM-203 — Hồ sơ mở rộng và custom fields

- [ ] Form email, địa chỉ, chức danh, trạng thái làm việc.
- [ ] Field definition CRUD.
- [ ] Render field động.
- [ ] Filter cơ bản.
- [ ] Export CSV/XLSX tôn trọng custom fields.
- [ ] Dùng `SlideOver`, DataTable, EmptyState và `sonner` theo component hiện hữu.
- [ ] Mutation cấu hình field dùng `useConfirm()` khi xóa/tắt field.

**Phụ thuộc:** HRM-201.

### HRM-204 — Điều chuyển shop/department

- [ ] Implement transfer service tại mục 8.
- [ ] Dùng tenant-scoped PostgreSQL connector cho source/target.
- [ ] Transaction cập nhật employee, HRM profile và transfer history.
- [ ] Chỉ hỗ trợ hiệu lực ngay trong MVP; reject ngày tương lai bằng validation rõ ràng.
- [ ] Lưu transfer history.
- [ ] Tùy chọn chuyển quyền shop của linked user.
- [ ] Tạo reconciliation retry nếu cập nhật `user_shops` thất bại sau khi data-plane commit.
- [ ] Test rollback khi update employee/profile/history thất bại.
- [ ] Test attendance/payroll snapshot cũ không đổi.

**Phụ thuộc:** HRM-201, HRM-202.
**Done khi:** Nhân viên xuất hiện ở shop mới, lịch sử cũ không đổi và không có hai profile HRM active.

### HRM-205 — HRM pages và navigation

- [ ] Thêm nhóm menu HRM theo kết quả HRM-003.
- [ ] Link lại trang employee hiện hữu.
- [ ] Link lại trang department hiện hữu.
- [ ] Không thay URL cũ.
- [ ] Breadcrumb, loading skeleton và empty state theo style ONI.
- [ ] Không thêm raw SVG; dùng icon `lucide-react`.

**Phụ thuộc:** HRM-003, HRM-201.

### HRM-206 — Import/export danh mục nhân viên

- [ ] Cung cấp file mẫu có version, field cơ bản và custom field đang active.
- [ ] Import theo hai bước: upload/parse → preview/confirm.
- [ ] Validate mã nhân viên, branch, department, email, ngày và custom field theo từng dòng.
- [ ] Phát hiện trùng trong file và trùng với employee hiện hữu.
- [ ] Owner chọn rõ create-only hoặc update-by-employee-code; không tự ghi đè mơ hồ.
- [ ] Trả file/error report theo dòng; không log dữ liệu nhạy cảm.
- [ ] Export áp dụng đúng filter hiện tại và quyền field/payroll.
- [ ] Test file rỗng, sai header, dữ liệu hỗn hợp, retry và import trùng.

**Phụ thuộc:** HRM-201, HRM-203.
**Done khi:** Owner có thể tải mẫu, preview và import an toàn mà không làm thay đổi employee ngoài các dòng đã xác nhận.

## Milestone 3 — Chấm công

### HRM-301 — Shift template

- [ ] CRUD ca làm HRM.
- [ ] Không sử dụng `shop_shifts` POS làm attendance.
- [ ] Validate ca qua ngày.
- [ ] Thiết lập grace period.

**Phụ thuộc:** HRM-103, HRM-105.

### HRM-302 — Attendance engine

- [ ] Pure function tính worked/late/early/overtime minutes.
- [ ] Xử lý thiếu clock-in/clock-out.
- [ ] Xử lý ca qua ngày.
- [ ] Unit test biên giờ và timezone.

**Phụ thuộc:** HRM-107, HRM-301.

### HRM-303 — Attendance API

- [ ] GET bảng công theo tháng.
- [ ] Upsert một ngày công.
- [ ] Bulk upsert.
- [ ] Audit chỉnh công.
- [ ] Chặn nhân viên thuộc shop khác.
- [ ] Snapshot `branch_id` và department tại ngày công.
- [ ] Import có dry-run/preview, báo lỗi theo dòng và chỉ commit dữ liệu sau khi owner xác nhận.

**Phụ thuộc:** HRM-302.

### HRM-304 — Attendance UI

- [ ] Bảng tháng theo nhân viên/ngày.
- [ ] Filter phòng ban.
- [ ] Nhập/sửa clock-in và clock-out.
- [ ] Chọn trạng thái nghỉ.
- [ ] Hiển thị tổng công, giờ và tăng ca.
- [ ] Import CSV cơ bản.
- [ ] Sửa công dùng `SlideOver` hoặc modal chuẩn; mutation quan trọng dùng `useConfirm()`.
- [ ] Toast success/error và loading state thống nhất.

**Phụ thuộc:** HRM-303.

## Milestone 4 — Payroll cơ bản

### HRM-401 — Salary configuration

- [ ] Cấu hình monthly/daily/hourly.
- [ ] Mức lương cơ bản.
- [ ] Số công chuẩn hoặc giờ chuẩn.
- [ ] Phụ cấp định kỳ dạng JSON.
- [ ] Effective date và lịch sử cấu hình.
- [ ] Chỉ API có quyền payroll mới đọc được.
- [ ] Không ghi dữ liệu lương vào employee API, shared client cache hoặc application log.
- [ ] Mask số tài khoản ngân hàng ở list view.

**Phụ thuộc:** HRM-102, HRM-201.

### HRM-402 — Payroll calculator

- [ ] Implement công thức mục 6 bằng số nguyên VND.
- [ ] Input/output thuần.
- [ ] Tính monthly/daily/hourly.
- [ ] Tính overtime.
- [ ] Cộng phụ cấp/thưởng/hoa hồng nhập tay.
- [ ] Trừ khấu trừ.
- [ ] Sinh breakdown snapshot.
- [ ] Unit test các trường hợp 0 công, đủ công, công lẻ và overtime.

**Phụ thuộc:** HRM-107, HRM-302, HRM-401.

### HRM-403 — Payroll run API

- [ ] Tạo kỳ lương draft.
- [ ] Tính/recalculate toàn kỳ.
- [ ] Không tạo hai kỳ trùng shop và khoảng ngày.
- [ ] Chỉnh từng payroll item trong draft.
- [ ] Yêu cầu lý do khi chỉnh tay.
- [ ] Finalize và khóa snapshot.
- [ ] Không cho sửa finalized/paid.
- [ ] Dùng compare-and-swap theo `version` để tránh hai tab recalculate/chốt cùng kỳ; conflict trả 409 và không ghi một phần.
- [ ] Recalculate và finalize idempotent theo trạng thái/version.

**Phụ thuộc:** HRM-304, HRM-402.

### HRM-404 — Payroll UI cho owner

- [ ] Chọn kỳ lương.
- [ ] Hiển thị công và cấu phần lương.
- [ ] Sửa phụ cấp/thưởng/khấu trừ.
- [ ] Hiển thị chênh lệch sau recalculation.
- [ ] Chốt bảng lương.
- [ ] Export Excel.
- [ ] Không triển khai màn hình approval nhiều cấp.
- [ ] Chốt lương dùng `useConfirm()` với tổng tiền và số nhân viên.
- [ ] Không hiển thị payroll qua toast, URL query hoặc client log.

**Phụ thuộc:** HRM-403.

## Milestone 5 — Sổ quỹ, dashboard và báo cáo

### HRM-501 — Cashbook posting

- [ ] Implement service tại mục 9.
- [ ] Kiểm tra `finalized`.
- [ ] Kiểm tra `hrm.payroll.pay` và `cashbook.manage`.
- [ ] Chọn fund.
- [ ] Tạo cashbook payment tổng hợp.
- [ ] Cập nhật fund balance.
- [ ] Lưu posting reference.
- [ ] Chuyển payroll thành paid.
- [ ] Thực thi tất cả bước bằng một PostgreSQL transaction và row lock.
- [ ] Implement `PostgresHrmRepository.payPayrollRun()` bằng một `PoolClient`; không dùng generic `IDataConnector`, `RollbackContext`, cashbook HTTP route hoặc `resolveAndRecordPayment()`.
- [ ] Dùng idempotency key/unique constraint để chống double-submit và retry.
- [ ] Ghi audit trong cùng transaction.
- [ ] Idempotency test.
- [ ] Rollback test.
- [ ] Concurrency test hai request thanh toán đồng thời.

**Phụ thuộc:** HRM-403.
**Done khi:** Một payroll run chỉ tạo được một phiếu chi và số dư quỹ khớp.

### HRM-502 — HRM overview

- [ ] Tổng nhân viên active.
- [ ] Có mặt/vắng/trễ hôm nay.
- [ ] Tổng công trong kỳ.
- [ ] Tổng lương draft/finalized/paid.
- [ ] Chi phí lương theo department.
- [ ] Cảnh báo nhân viên thiếu salary config.

**Phụ thuộc:** HRM-304, HRM-403.

### HRM-503 — Báo cáo

- [ ] Danh sách nhân viên theo shop/department.
- [ ] Báo cáo công tháng.
- [ ] Báo cáo tổng hợp lương.
- [ ] Báo cáo chi phí theo department.
- [ ] Export tôn trọng permission payroll.

**Phụ thuộc:** HRM-404, HRM-502.

## Milestone 6 — Regression, rollout và vận hành

### HRM-601 — Automated test suite

- [ ] Unit test attendance engine.
- [ ] Unit test payroll calculator.
- [ ] Permission tests.
- [ ] Entitlement/capability/schema-version gate tests.
- [ ] Transfer tests giữa các branch trong cùng tenant trên shared PostgreSQL.
- [ ] Payroll cashbook idempotency.
- [ ] Payroll cashbook transaction/concurrency.
- [ ] Migration chạy mới, chạy lại và upgrade version.
- [ ] Module-disabled tests.

**Phụ thuộc:** HRM-204, HRM-205, HRM-206, HRM-501, HRM-503.

### HRM-602 — Regression tests

- [ ] Employee CRUD hiện tại.
- [ ] Department CRUD hiện tại.
- [ ] Tenant user CRUD hiện tại.
- [ ] POS order/checkout.
- [ ] POS shift open/close.
- [ ] Manual cashbook receipt/payment.
- [ ] Mobile sync smoke test.
- [ ] Navigation/Plan Modal/CTA hiện hữu.
- [ ] Tenant không bật HRM không có thêm query connector.

**Done khi:** Không có regression trong các flow hiện hữu.

**Phụ thuộc:** HRM-001, HRM-601.

### HRM-603 — Pilot rollout

- [ ] Feature flag mặc định false.
- [ ] Backup shared PostgreSQL và xác nhận restore.
- [ ] Chạy deployment preflight + migration + schema verification một lần.
- [ ] Bật cho tenant test sau khi schema ready.
- [ ] Backfill employee sidecar.
- [ ] Tạo một kỳ công.
- [ ] Tạo, chốt và thanh toán bảng lương test.
- [ ] Đối chiếu cashbook.
- [ ] Tắt flag và xác nhận các module cũ tiếp tục hoạt động.
- [ ] Bật lại flag và xác nhận dữ liệu HRM còn nguyên.
- [ ] Theo dõi lỗi trong một chu kỳ pilot.

**Phụ thuộc:** HRM-106, HRM-501, HRM-503, HRM-601, HRM-602.

### HRM-604 — Documentation

- [ ] Hướng dẫn owner cấu hình HRM.
- [ ] Mẫu import employee/attendance.
- [ ] Hướng dẫn tính và thanh toán lương.
- [ ] Hướng dẫn điều chuyển chi nhánh.
- [ ] Hướng dẫn tắt module và xuất dữ liệu.

**Phụ thuộc:** HRM-206, HRM-304, HRM-404, HRM-501, HRM-603.

## Backlog sau MVP — POS revenue preview

Không thuộc execution graph hoặc Definition of Done của HRM MVP:

- [ ] Đặt sau sub-feature flag riêng.
- [ ] Tổng hợp order theo `employee_id`.
- [ ] Loại cancelled/failed/refunded và trừ đơn trả.
- [ ] Báo tỷ lệ order không map được employee.
- [ ] Chỉ hiển thị tham khảo, không tự đưa vào payroll.

## 12. Thứ tự thực hiện đề xuất

```text
M0 Safety
   ↓
M1 Entitlement + PostgreSQL Foundation
   ↓
M2 Employee/Profile/Transfer
   ↓
M3 Attendance
   ↓
M4 Payroll
   ↓
M5 Cashbook/Reports
   ↓
M6 Regression/Pilot
```

Không làm song song Payroll trước khi hoàn tất định danh nhân viên và attendance engine.

Các task UI của M2 có thể chạy song song với M3 engine sau khi API contract M2 được khóa.

### 12.1. Work packages và merge gate

Mỗi package là một PR/commit group có thể deploy độc lập khi entitlement vẫn mặc định `false`.

| Package | Tasks | Kết quả bắt buộc trước khi merge |
|---|---|---|
| WP-01 Safety baseline | HRM-000, HRM-001 | Regression baseline xanh; chưa có runtime change |
| WP-02 Entitlement UX | HRM-002, HRM-003 | Locked menu, direct URL CTA và API gate; không query connector khi disabled |
| WP-03 Permission foundation | HRM-102 | Owner đủ quyền; non-owner bị chặn ở server |
| WP-04A Server/domain boundary | HRM-103, HRM-107 | Control-plane gate không mở connector khi disabled; pure domain contract đạt |
| WP-04B PostgreSQL foundation | HRM-101, HRM-105 | Shared schema/repository local+remote PG đạt |
| WP-04C Operator enable workflow | HRM-106 | `db:push:pg`→verify→enable/disable có audit |
| WP-05 Employee foundation | HRM-104, HRM-201 | Backfill + employee API đạt; API cũ không đổi |
| WP-06 User link + transfer | HRM-202, HRM-204 | Link auth logic và chuyển branch có audit/rollback đạt |
| WP-07 Profile UI | HRM-203, HRM-205 | Custom fields, side-over và navigation thống nhất |
| WP-08 Employee import/export | HRM-206 | Template, preview, error report và retry đạt |
| WP-09 Attendance | HRM-301–304 | Import preview, bảng công và calculation tests đạt |
| WP-10 Payroll | HRM-401–404 | Snapshot/finalize/idempotency và permission tests đạt |
| WP-11 Cashbook/reporting | HRM-501–503 | Transaction chi lương, dashboard và export đạt |
| WP-12 Production hardening | HRM-601–604 | Full regression, pilot, rollback drill và tài liệu vận hành đạt |

Merge gate chung cho mọi package:

- `pnpm lint` và build/typecheck liên quan phải đạt.
- Test mới đặt trong `tests/`.
- Không ghi secret, connector URI, bank account đầy đủ hoặc payroll payload vào log.
- Không sửa response shape của API cũ nếu không có compatibility test.
- `git diff -- packages/core` phải rỗng; thay đổi Core là hard stop và cần quyết định kiến trúc mới.
- Không enable HRM mặc định trong cùng PR thêm code/schema.
- Mọi mutation UI có loading/error feedback; action destructive hoặc irreversible có `useConfirm()`.
- Trước khi sửa bất kỳ function/class/method hiện hữu, chạy GitNexus `impact(target, direction: "upstream")` và ghi blast radius vào task.
- Nếu impact là HIGH/CRITICAL, cảnh báo user và không sửa cho tới khi phạm vi/rủi ro được chấp nhận.
- Trước commit chạy GitNexus `detect_changes(scope: "compare", base_ref: "main")`; affected flows phải đúng phạm vi package.
- Git diff chỉ chứa phạm vi package; `git diff -- packages/core` phải rỗng.

## 13. Release slices

### Release A — HRM Directory

Bao gồm M0–M2:

- Module gate.
- Upgrade CTA và PostgreSQL capability gate.
- Connector migration/version registry.
- Hồ sơ nhân viên mở rộng.
- Employee–user link.
- Custom fields.
- Import/export nhân viên theo mẫu có preview.
- Điều chuyển shop/department.

### Release B — Timekeeping

Bao gồm M3:

- Ca làm HRM.
- Chấm công.
- Bảng công tháng.

### Release C — Payroll

Bao gồm M4–M5:

- Salary config.
- Payroll calculator.
- Owner finalize/pay.
- Cashbook posting.
- Dashboard và reports.

Mỗi release đều có thể deploy với feature flag tắt và bật thử cho tenant pilot.

## 14. Definition of Done cho HRM MVP

HRM MVP chỉ được xem là hoàn thành khi:

- [ ] Module tắt không làm thay đổi employee/department/POS/cashbook.
- [ ] Tenant chưa enable thấy CTA phù hợp và API không query connector.
- [ ] Tenant đã enable nhưng connector không phải PostgreSQL nhận hướng dẫn cấu hình và không ghi dữ liệu HRM.
- [ ] Không có dữ liệu HRM/payroll trong Supabase control-plane.
- [ ] Thay đổi `schema_pg.ts` của HRM là additive, qua `db:push:pg --strict` và không đổi bảng nghiệp vụ hiện hữu.
- [ ] Owner bật module và thấy menu HRM.
- [ ] Employee tồn tại mà không cần user account.
- [ ] User account tồn tại mà không cần employee.
- [ ] Liên kết employee–user là tùy chọn và không tự cấp quyền.
- [ ] Owner chuyển được employee sang shop/department mới.
- [ ] Lịch sử công/lương cũ không thay đổi sau transfer.
- [ ] Import employee/attendance đều có template, preview và lỗi theo dòng trước khi commit.
- [ ] Tạo được bảng công tháng.
- [ ] Tính được lương tháng/ngày/giờ.
- [ ] Thêm được phụ cấp, thưởng, hoa hồng nhập tay và khấu trừ.
- [ ] Chốt bảng lương tạo snapshot bất biến.
- [ ] Thanh toán lương tạo đúng một phiếu chi sổ quỹ.
- [ ] Hai request thanh toán đồng thời vẫn chỉ tạo một phiếu chi.
- [ ] Người không có quyền payroll không nhận dữ liệu lương từ API.
- [ ] UI dùng component/style hiện hữu: SlideOver, modal/confirm, toast, DataTable, EmptyState và Lucide icons.
- [ ] Regression suite hiện hữu đạt.
- [ ] Có pilot tenant hoàn thành một chu kỳ công–lương–sổ quỹ.

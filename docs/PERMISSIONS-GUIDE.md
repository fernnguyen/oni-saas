# Hướng dẫn Phân Quyền & UI Gating (Permissions & Visual Gating Guide)

Tài liệu này cung cấp hướng dẫn toàn diện cho các nhà phát triển về hệ thống phân quyền (RBAC) và giải pháp kiểm soát hiển thị trực quan (Visual Gating) 2 lớp trên hệ thống **ONI.vn**. 

---

## 1. Tổng quan Hệ thống Phân quyền (RBAC Overview)

Hệ thống phân quyền của ONI.vn hoạt động dựa trên mô hình vai trò (Role-based Access Control) phân cấp theo 2 phạm vi chính:

1.  **Phạm vi Doanh nghiệp (Tenant-scoped):**
    *   Các vai trò: `owner` (Chủ sở hữu), `admin` (Giám đốc điều hành).
    *   Người dùng có vai trò ở cấp Tenant sẽ có quyền truy cập vào **TẤT CẢ** các chi nhánh (shops) trong doanh nghiệp đó.
    *   Lưu trữ trong bảng: `user_tenants`.
2.  **Phạm vi Chi nhánh (Shop-scoped):**
    *   Các vai trò hệ thống: `staff` (Thu ngân), `viewer` (Cổ đông/Giám sát).
    *   Các vai trò tùy chỉnh (Custom roles) do doanh nghiệp tự tạo (ví dụ: `nhan-vien-bep`, `thu-kho`).
    *   Người dùng chỉ được thao tác giới hạn tại một chi nhánh cụ thể được chỉ định.
    *   Lưu trữ trong bảng: `user_shops`.

### Nguyên tắc Phân giải Quyền (DB Layer Resolution)
Quyền lợi của người dùng được phân giải thông qua hàm RPC của Supabase: `get_user_permissions(user_id, tenant_id, shop_id)`.
*   Nếu vai trò cấp Tenant của user là `owner` -> Trả về **TẤT CẢ** các quyền có trong hệ thống (`*`).
*   Nếu vai trò là `admin` hoặc vai trò custom ở cấp Tenant -> Trả về các quyền liên kết với vai trò đó.
*   Nếu chỉ có vai trò cấp Shop -> Trả về các quyền thuộc phạm vi chi nhánh cụ thể đó.

---

## 2. Kiểm tra Quyền ở Server-side (APIs & Server Pages)

Mọi hoạt động bảo mật cốt lõi phải được thực hiện và kiểm tra nghiêm ngặt tại Backend. Chúng ta sử dụng các thư viện hỗ trợ tại `apps/web/lib/server/permissions.ts`.

### 2.1. Lấy danh sách quyền của người dùng
Sử dụng `getUserPermissions` trong các Server Pages hoặc Server Layouts để lấy toàn bộ danh sách mã quyền dưới dạng mảng `string[]`.
```typescript
import { getUserPermissions } from '@/lib/server/permissions';

const permissions = await getUserPermissions(userId, tenantId, shopId);
// Trả về: ['orders.view', 'products.create', 'cashbook.view', ...]
```

### 2.2. Kiểm tra nhanh một quyền cụ thể (APIs Guarding)
Trong các Route Handlers (API), sử dụng hàm `hasPermission` để kiểm tra quyền hạn trước khi thực hiện truy vấn DB hoặc biến đổi dữ liệu.
```typescript
import { hasPermission } from '@/lib/server/permissions';

export async function POST(request: Request, { params }: { params: { tenantId: string } }) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Kiểm tra quyền quản lý vai trò
  const allowed = await hasPermission(user.id, params.tenantId, 'roles.manage');
  if (!allowed) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // Xử lý logic tiếp theo...
}
```

---

## 3. Kiểm tra Quyền ở Client-side (Global Context & Hooks)

Để tránh tình trạng **Prop Drilling** (phải truyền mảng `permissions` thủ công qua nhiều tầng components), hệ thống đã xây dựng cơ sở hạ tầng phân quyền toàn cục ở Client-side sử dụng React Context và Custom Hook.

### 3.1. Cơ chế Hoạt động (Infrastructure)
*   **`PermissionsProvider`:** Được nhúng tại `DashboardShell.tsx` (vỏ bọc ngoài cùng của mọi trang nghiệp vụ). Provider này nhận mảng `permissions` từ Server Layout và truyền xuống toàn bộ cây component.
*   **`usePermissions()` Hook:** Cho phép bất kỳ Client Component nào nằm bên dưới `DashboardShell` cũng có thể kiểm tra quyền hạn ngay lập tức với tốc độ phản hồi 0ms (hoàn toàn in-memory check, không tạo thêm DB request).
*   **`<HasPermission>` Component:** Wrapper component dùng trong JSX để ẩn hoặc hiện các phần tử giao diện dựa trên quyền.

---

## 4. Hướng dẫn Sử dụng trên UI (Visual Gating)

### Chế độ 1: Ẩn hoàn toàn (Hiding)
Áp dụng cho các nút bấm hành động tạo mới, xóa hoặc các luồng nghiệp vụ mà người dùng hoàn toàn không được phép chạm vào (ví dụ: nhân viên thu ngân không thể tạo phiếu thu chi trong Sổ Quỹ).

**Sử dụng Component `<HasPermission>` (Khuyên Dùng):**
Chỉ cần bọc các thẻ con bằng `<HasPermission>` và chỉ định mã quyền cần kiểm tra qua prop `has`.
```tsx
import { HasPermission } from '@/app/components/ui/PermissionGate';

export function CashbookHeader() {
  return (
    <div className="flex justify-between">
      <h1>Sổ quỹ</h1>
      
      {/* Nút tạo phiếu chỉ hiển thị nếu có quyền cashbook.manage */}
      <HasPermission has="cashbook.manage">
        <button onClick={openCreateModal} className="btn-primary">
          + Tạo Phiếu Thu/Chi
        </button>
      </HasPermission>
    </div>
  );
}
```

### Chế độ 2: Vô hiệu hóa trực quan & Khóa ổ khóa 🔒 (Visual Locking)
Áp dụng cho các ô nhập liệu (inputs), nút bật/tắt (toggles), hoặc biểu mẫu mà người dùng **được quyền xem** nhưng **không được phép chỉnh sửa**. 

Chúng ta sẽ làm mờ phần tử (`opacity-50`), tắt tương tác (`pointer-events-none`), thay đổi con trỏ chuột (`cursor-not-allowed`), và **thêm biểu tượng ổ khóa nhỏ `🔒`** cạnh tiêu đề hoặc trong nút bấm để thông báo trực quan cho người dùng.

**Sử dụng Hook `usePermissions()`:**
```tsx
import { usePermissions } from '@/app/components/ui/PermissionGate';

export function ShopSettingsForm() {
  const { hasPermission } = usePermissions();
  
  // Kiểm tra quyền quản lý cài đặt chi nhánh
  const canManage = hasPermission('settings.manage');

  return (
    <form className="space-y-4">
      {/* Ô cấu hình Địa chỉ chi nhánh */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium">
          Địa chỉ chi nhánh
          {!canManage && <span className="text-xs text-slate-400" title="Chỉ đọc">🔒</span>}
        </label>
        <input
          type="text"
          disabled={!canManage}
          className={`mt-1 block w-full rounded-lg border-slate-200 ${
            !canManage ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''
          }`}
          placeholder="Nhập địa chỉ..."
        />
      </div>

      {/* Nút Lưu cấu hình */}
      {canManage && (
        <button type="submit" className="btn-primary">
          Lưu thay đổi
        </button>
      )}
    </form>
  );
}
```

---

## 5. Mẫu Thiết kế Phân Quyền cho các Module (Examples)

### 5.1. Module Quản lý Khách hàng & Điều chỉnh Ví
Kiểm soát nút nạp tiền trực tiếp vào tài khoản khách hàng bằng mã quyền `crm.wallet_adjust`.
```tsx
<HasPermission has="crm.wallet_adjust">
  <button 
    onClick={() => setWalletModalOpen(true)}
    className="rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-100"
  >
    + Điều chỉnh Ví
  </button>
</HasPermission>
```

### 5.2. Module Đơn hàng & Đổi trả (Returns Flow)
Quyền thực hiện nghiệp vụ đổi trả hàng (`returns.manage`) trên trang chi tiết đơn hàng:
```tsx
import { usePermissions } from '@/app/components/ui/PermissionGate';

export function OrderDetailActions({ orderId }: { orderId: string }) {
  const { hasPermission } = usePermissions();
  const canReturn = hasPermission('returns.manage');

  return (
    <div className="flex gap-2">
      <button disabled={!canReturn} className="btn-secondary">
        {!canReturn && <span className="mr-1">🔒</span>}
        Yêu cầu Đổi trả
      </button>
    </div>
  );
}
```

---

## 6. Ghi chú Bảo mật dành cho Developers

> [!IMPORTANT]
> **Quy tắc Vàng:** UI Gating chỉ nhằm cải thiện **Trải nghiệm Người dùng (UX)** và ngăn người dùng click nhầm/click vô ích. Nó **KHÔNG THỂ** thay thế bảo mật ở tầng Backend.
> 
> Luôn luôn thực thi song song 2 lớp kiểm tra:
> 1.  **Lớp 1 (UI/UX Gating):** Dùng `<HasPermission>` và `usePermissions()` ở Client để ẩn/khóa các phần tử giao diện.
> 2.  **Lớp 2 (API & Database Protection):** Dùng `hasPermission()` ở API endpoint để xác thực yêu cầu, kết hợp Row Level Security (RLS) ở database.

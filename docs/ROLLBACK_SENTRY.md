# Tài liệu Kỹ thuật: Cơ chế Rollback & Giám sát Lỗi (Sentry)

Tài liệu này mô tả chi tiết cách hệ thống xử lý tính toàn vẹn dữ liệu (Data Integrity) trong các tiến trình gọi API song song, và cách chúng ta tập trung hoá việc theo dõi lỗi bằng Sentry.

---

## 1. Cơ chế Rollback (Compensating Transactions)

### Vấn đề
Hệ thống ONI sử dụng nhiều Connectors khác nhau, đặc biệt là Google Sheets, vốn **không hỗ trợ Transactions nguyên thuỷ (Native Transactions)** như các RDBMS (PostgreSQL/MySQL). 
Điều này dẫn đến tình trạng nếu một hàm `sync-batch` bị lỗi ở bước cuối cùng (vd: lỗi mạng khi update công nợ khách hàng), thì các dữ liệu đã được tạo ở những bước trước đó (tạo đơn hàng, tồn kho, thanh toán, sổ quỹ) sẽ tồn tại vĩnh viễn ở trạng thái "lơ lửng", làm sai lệch báo cáo kế toán và kho hàng (Silent Fail).

### Giải pháp: RollbackContext
Tại `packages/adapters/src/transaction.ts`, chúng ta xây dựng class `RollbackContext`. Đây là một cơ chế cho phép các developer đăng ký các hàm "Undo" (hành động bù trừ - Compensating Actions).

**Luồng hoạt động chuẩn:**
1. Khởi tạo `const tx = new RollbackContext()`.
2. Thực hiện các thao tác ghi (create/update/delete) xuống Connector.
3. Nếu thành công, thêm lệnh Undo vào Context thông qua `tx.add()`. 
4. Nếu có bất kỳ lỗi nào được `throw` ra trong quá trình thực thi, hệ thống sẽ tự nhảy vào block `catch`.
5. Tại `catch`, gọi `await tx.rollback()`. Hệ thống sẽ tự động thực thi tuần tự tất cả các lệnh Undo theo cấu trúc LIFO (Last-In, First-Out - hành động mới nhất sẽ bị hoàn tác đầu tiên).

**Mẫu (Pattern) tích hợp:**
```typescript
import { RollbackContext } from '@oni/adapters'

export async function processComplexWorkflow() {
  let tx: RollbackContext | undefined;
  try {
    tx = new RollbackContext()
    
    // 1. Tạo đơn hàng
    const order = await connector.create('orders', { ... })
    tx.add(async () => {
      // Soft delete: Connector tự set active = 'FALSE'
      await connector.delete('orders', order.order_id).catch(() => {})
    })

    // 2. Cập nhật tồn kho
    const oldQty = inv.stock_qty;
    await connector.update('inventory', inv.inventory_id, { stock_qty: newQty })
    tx.add(async () => {
      // Restore số cũ
      await connector.update('inventory', inv.inventory_id, { stock_qty: oldQty }).catch(() => {})
    })
    
    // Nếu thành công đến cuối -> return.
    return { success: true }
    
  } catch (error) {
    if (tx) await tx.rollback()
    throw error
  }
}
```

### Phạm vi đã áp dụng
Hiện tại, cơ chế này đã bảo vệ toàn diện các điểm nóng sau:
- **`POST /api/shops/[shopId]/orders/sync-batch`**: Các bước tạo hoá đơn (orders), sản phẩm hoá đơn (items), thanh toán (payments), sổ quỹ (cashbook), và trừ tồn kho (stock-movements) đều được bảo vệ. Nếu bước chốt trừ nợ khách hàng bị lỗi, *toàn bộ* hoá đơn và sổ quỹ sẽ bị xoá (`active: FALSE`).
- **`POST /api/shops/[shopId]/returns/[id]/process`**: Tiến trình hoàn trả cũng tương tự. Nếu việc cộng lại tồn kho hoặc tạo phiếu chi hoàn tiền bị lỗi, toàn bộ nghiệp vụ sẽ bị huỷ bỏ, phiếu trả hàng quay về trạng thái `pending`.

---

## 2. Giám sát Lỗi Tự động bằng Sentry

Thay vì phải mò mẫm trong console log để tìm nguyên nhân cho các lỗi HTTP 500, chúng ta tích hợp `@sentry/nextjs` để tự động bắt và cảnh báo lỗi.

### Cấu hình Cài đặt Chung
Để tiết kiệm chi phí băng thông cũng như tránh ồn ào (noise) ở môi trường dev, tính năng Sentry được đưa vào một **Global Feature Flag**.

**Cách bật/tắt:**
1. Đăng nhập bằng tài khoản **Super Admin**.
2. Truy cập thanh điều hướng bên trái -> `Quản lý hệ thống` -> `Cài đặt chung`.
3. Bật hoặc tắt tính năng **"Gửi log lỗi lên Sentry"**.

*Lưu ý: Thiết lập này được lưu trong bảng `system_settings` (id = 'global') và được cache tự động thông qua `unstable_cache` của Next.js với thời gian hiệu lực 1 giờ (có tự động revalidate khi bật/tắt trên giao diện) để không làm giảm tốc độ API.*

### Cơ chế Bắt lỗi
Mọi API sử dụng hàm `handleApiError` trong `apps/web/app/api/shops/_helpers.ts` đều đã được tích hợp Sentry.
Mã lỗi `4xx` (Validation, Authorization) sẽ *không* bị gửi đi. Hệ thống chỉ bắt các lỗi ngoại lệ không mong muốn (`HTTP 500`) bằng tiến trình chạy ngầm (fire-and-forget), không gây ảnh hưởng đến thời gian phản hồi (latency) của API.

# Kịch bản test – Phase 0 đồng bộ bàn/phòng/sân

Đi kèm [TABLE-SESSION-SYNC-PLAN.md](TABLE-SESSION-SYNC-PLAN.md) §2 Phase 0. File này gồm 2 phần:

1. **Test tự động** (server, chạy trong 1 giây): `pnpm test:table-sync`, gồm 31 case, file [tests/table-sync/phase0.test.ts](../tests/table-sync/phase0.test.ts).
2. **Test tay nhiều thiết bị** (phần dưới). Các tình huống mất mạng, hai máy và app thật thì unit test không thay được.

> Chạy cả hai trước khi merge. Test tay nên làm trên **staging** với một shop riêng dùng Postgres và có ít nhất 2 bàn (T1, T2) tính giờ, ví dụ 60.000đ/giờ.

---

## 0. Chuẩn bị

| Thứ cần | Ghi chú |
|---|---|
| Máy A | App mobile (Expo dev build) đăng nhập shop test |
| Máy B | Máy mobile thứ hai, **hoặc** web POS (Chrome) |
| Máy C (tuỳ chọn) | Zalo mini app, dùng cho TC-08 |
| Cách giả lập mất mạng | Mobile: bật chế độ máy bay. Web: DevTools → Network → **Offline** |
| Cách soi dữ liệu | SQL ở §4, hoặc màn quản lý đơn hàng |

**Quy ước kết quả:**
- ✅ = đạt
- ❌ = lỗi; ghi lại bước, ảnh chụp và `order_id`

Đơn bị gắn cờ là đơn có `metadata.needs_review = true` (xem SQL ở §4).

---

## 1. Kịch bản theo từng mục Phase 0

### TC-01 · Không còn "món tự biến mất" khi mở lại bàn (0.1)
1. Máy A mở **T1** và gọi 2 Bia.
2. Máy A tắt mạng, rồi đóng app. Phiên trên server vẫn còn đơn có món.
3. Máy B mở **T1** như một phiên mới (ví dụ sau khi bàn được trả bằng tay trên web).
4. Mở lại danh sách bàn trên máy B vài lần (mỗi lần như vậy là một lần GET và reconciler chạy).

**Mong đợi:**
- Đơn cũ của T1 **không bị huỷ**: vẫn `in_progress` và có `needs_review = true`.
- Phiên mới của máy B vẫn là phiên đang hoạt động của T1.
- Mở lại nhiều lần thì đơn cũ không bị ghi đè thêm (`review_flagged_at` không đổi).

### TC-02 · Thanh toán bình thường không để lại đơn treo (0.1, hồi quy)
1. Máy A mở T1, gọi món, đợi khoảng 2 phút rồi thanh toán.

**Mong đợi:**
- Có 1 đơn `completed`. Đơn `in_progress` của phiên đó (nếu thanh toán tạo đơn mới) phải bị `cancelled`, **không** bị gắn cờ.
- T1 về trạng thái trống (hoặc `dirty` nếu là phòng lưu trú).
- Lặp lại trên web POS và Zalo, kết quả giống nhau.

### TC-03 · Đơn đã thu tiền một phần không bao giờ bị huỷ tự động (0.1)
1. Tạo phiên T1, thu cọc/trả trước một phần (`paid_amount > 0`).
2. Trên web, trả bàn T1 bằng tay mà không thanh toán.

**Mong đợi:** đơn vẫn `in_progress` và có cờ `needs_review`, không bị `cancelled`.

### TC-04 · Hai phiên cùng một bàn (0.1)
1. Máy A và máy B cùng **offline**.
2. Cả hai mở T1 và gọi món khác nhau: A gọi Bia, B gọi Lạc.
3. Bật mạng máy A trước, rồi máy B.

**Mong đợi:**
- Máy B nhận xung đột "bàn đã có phiên khác" (modal xung đột hiện có).
- Không phiên nào bị huỷ âm thầm. Nếu reconciler thấy 2 đơn trên T1, đơn cũ hơn **có món** sẽ bị gắn cờ, còn đơn mới nhất vẫn gắn với bàn.
- Tổng số món trên server = Bia + Lạc, không mất món nào.

### TC-05 · Thanh toán đồng bộ đúng số lượng món (0.3)
1. Máy A mở T1, gọi 1 Bia (online, đã đồng bộ).
2. Máy A tắt mạng, tăng Bia lên 3, rồi thanh toán offline.
3. Bật mạng máy A.

**Mong đợi:**
- Đơn `completed` trên server có dòng Bia **qty = 3** (trước đây vẫn là 1).
- `total_amount` = tổng các dòng (tiền giờ + 3 Bia).
- Doanh thu trong báo cáo khớp với bill in ra.

### TC-06 · Đang mở bàn thì không ghi đè món của máy khác (0.3)
1. Máy A và máy B cùng online, cùng xem T1 có 1 Bia.
2. Máy B tăng Bia lên 4 (online).
3. Máy A, với giỏ cũ còn 1 Bia, đồng bộ lại khi chưa thanh toán (ví dụ tắt/bật mạng).

**Mong đợi:**
- Server vẫn là **4 Bia**: khi đơn còn `in_progress`, sync-batch không ghi đè dòng món.
- Dòng **tiền giờ** vẫn được cập nhật theo lần sync mới nhất.

### TC-07 · Phiên offline cũ không bị huỷ và không mất món (0.4)
1. Máy A mở T1 và gọi 1 Bia, rồi **tắt mạng**.
2. Máy A gọi thêm 2 Lạc (offline).
3. Máy B (online) thanh toán T1 và trả bàn.
4. Đợi vài phút, rồi bật mạng máy A.

**Mong đợi:**
- Máy A không đẩy Lạc vào phiên khác. Phiên cũ trên máy A được dọn như hiện nay.
- Trên server, **2 Lạc vẫn còn**:
  - nằm trên đơn cũ (gắn cờ `needs_review`), **hoặc**
  - nằm trên một đơn mới tạo có `review_reason = "Phiên offline có giờ vào trước lần trả bàn gần nhất"` và `reference_no` = mã đơn local của máy A.
- Response của sync-batch có `needs_review_order_id`.
- Máy A sync lại lần nữa thì **không** sinh thêm đơn hoặc món trùng.

### TC-08 · Zalo chuyển bàn không làm mất đơn (0.8)
1. Trên Zalo, mở T1, gọi món, đặt tên khách.
2. Chuyển T1 sang T2.

**Mong đợi:**
- Đơn vẫn là `in_progress`, có `metadata.resource_id = T2`, và vẫn còn `customer_name`, `rental_type`, `guests_list`, `advanced_pricing`.
- T2 ở trạng thái occupied, `current_order_id` = đơn đó. T1 về `cleaning`.
- Đơn **không** bị cancelled hay gắn cờ.
- Giả lập lỗi ở bước cập nhật order (ví dụ tắt mạng ngay khi bấm chuyển): T1 **vẫn giữ nguyên** và có toast báo lỗi.

### TC-09 · Mobile: giỏ cũ không lọt sang khách sau (0.5)
1. Máy A mở T1, gọi 2 Bia, rồi **tắt mạng** ngay (giỏ chưa đồng bộ).
2. Máy B thanh toán T1, rồi mở lại T1 cho khách mới và gọi 1 Coca.
3. Bật mạng máy A và mở T1.

**Mong đợi:**
- 2 Bia **không** xuất hiện trong đơn của khách mới. Đơn của khách mới chỉ có Coca.
- Máy A hiện modal xung đột bàn, liệt kê 2 Bia của phiên cũ để xử lý.
- Giỏ trên máy A chuyển sang hiển thị đơn hiện tại trên server (chỉ có Coca).

### TC-09b · Mobile: thêm món trực tiếp khi giữ mã tạm hoặc đơn đã đóng (bản vá đường `syncOrderItemsOnline`)
1. Máy A **offline** mở T1 (mã tạm `ORD-T-INPROG-…`) và gọi 2 Bia.
2. Máy B online mở T1 cho khách khác và gọi 1 Coca.
3. Bật mạng máy A và **thêm 1 món nữa** vào T1 trên máy A (đi thẳng qua `syncOrderItemsOnline`, không qua giỏ chờ).

**Mong đợi:**
- Đơn của máy B chỉ có Coca. Máy A hiện modal xung đột.
- Chọn **Gộp**: món của A được gộp vào đơn của B, tổng tiền được tính lại đúng cách (đã gồm tiền giờ).
- Chọn **Giữ server**: món của A bị bỏ và bàn vẫn là phiên của B.

**Biến thể – đơn đã đóng:**
1. Máy A mở T1 online (mã thật), rồi tắt mạng và gọi thêm món.
2. Máy B thanh toán T1, và **không** mở lại bàn.
3. Bật mạng máy A.

**Mong đợi:**
- Món **không** bị đẩy vào đơn đã completed.
- Trong modal, chọn **Gộp** hoặc **Thay thế**: server trả `action_taken = parked`. Món được cất vào một đơn `needs_review` và T1 **không** bị chiếm lại.
- Chọn **Giữ server**: trả `discarded` và T1 vẫn trống.

### TC-09c · resolve-conflict không phá đơn đã thu tiền
1. Tạo xung đột như TC-09b, nhưng đơn trên server đã thu cọc (`paid_amount > 0`).
2. Chọn **Thay thế**.

**Mong đợi:** server trả 409 "Đơn hiện tại đã thu tiền…". Đơn cũ không bị huỷ và món không bị xoá.

Khi thay thế một đơn **chưa** thu tiền: đơn cũ chuyển `cancelled` nhưng vẫn giữ dòng món để đối soát (trước đây các dòng bị xoá cứng).

### TC-10 · Mobile: không xoá món của máy khác (0.6)
1. Máy A và máy B cùng mở T1 (online).
2. Máy B thêm 1 Lạc.
3. Trong vòng khoảng 8 giây, trước khi máy A kịp tải lại, máy A thêm 1 Bia.

**Mong đợi:**
- Server có **cả Bia lẫn Lạc**. Lạc không bị máy A xoá.
- Sau tối đa khoảng 8 giây (vòng poll), máy A thấy cả hai món.
- Máy A xoá Bia (món mà máy A đã thấy): Bia bị xoá trên server, Lạc vẫn còn.

### TC-11 · Mobile: chốt giờ ra khi mở màn thanh toán (0.7)
1. Mở T1 bật tính theo phút, chờ khoảng 10 phút.
2. Mở màn thanh toán, chờ thêm 2 phút rồi mới bấm xác nhận.

**Mong đợi:**
- Số tiền giờ trên màn thanh toán **không nhảy** trong 2 phút chờ.
- `check_out` và tiền giờ của đơn đã lưu đúng bằng con số tại thời điểm mở màn.
- Không còn lỗi 400 "DATA_INTEGRITY" với khách lẻ.
- Chọn giờ ra thủ công thì dùng giờ đã chọn.
- **Bán lẻ (không bàn):** thanh toán bình thường, không bị ảnh hưởng.

### TC-12 · Web: không gửi món offline vào bàn đã thanh toán (0.10)
1. Web POS mở slide-over T1, chuyển DevTools sang **Offline**, thêm 2 món.
2. Máy khác thanh toán T1.
3. Bật mạng lại trên web.

**Mong đợi:**
- Có toast cảnh báo "Bàn đã được đóng/thanh toán trên máy chủ. 2 thao tác món offline chưa được gửi."
- Đơn đã completed **không** có thêm món.
- Hàng đợi `offline_table_actions:<orderId>` trong localStorage vẫn còn, không bị xoá.

### TC-13 · Web: không gửi trùng khi nhiều sự kiện cùng kích hoạt (0.10)
1. Web offline, thêm 3 món vào T1.
2. Bật mạng và ngay lập tức đóng/mở slide-over 2–3 lần.

**Mong đợi:** server có đúng 3 món, không bị nhân đôi.

**Biến thể:** trong lúc đang đồng bộ, thêm 1 món nữa. Món này không bị mất: nó được gửi ở lượt sau.

---

## 2. Hồi quy bán lẻ (bắt buộc, không được thay đổi)

| # | Kịch bản | Mong đợi |
|---|---|---|
| R-1 | Bán lẻ online: thanh toán tiền mặt, chuyển khoản, nhiều phương thức | Như cũ |
| R-2 | Bán lẻ offline 3 đơn, rồi bật mạng | Cả 3 đơn đồng bộ đủ món và đủ tiền, không trùng |
| R-3 | Bán lẻ đơn có 2 dòng cùng sản phẩm (khác biến thể hoặc topping) | Như cũ. Nhánh 0.3 chỉ chạy khi đơn **có `resource_id`** |
| R-4 | Ghi nợ khách lẻ | Vẫn bị chặn như cũ |
| R-5 | Đơn mang đi (`resource_id = takeaway`) | Như cũ. Reconciler và 0.3 bỏ qua takeaway |
| R-6 | Trả hàng và báo cáo doanh thu ngày | Số liệu không đổi so với trước khi deploy |

---

## 3. Ma trận mạng hai máy (tóm tắt)

| A | B | Thao tác | Kịch bản liên quan |
|---|---|---|---|
| Offline | Online | B thanh toán, A vẫn thêm món | TC-07, TC-09, TC-09b, TC-12 |
| Offline | Offline | Cùng mở một bàn | TC-04 |
| Online | Online | Cùng thêm/xoá món | TC-06, TC-10, TC-13 |
| Online | Online | Chuyển bàn (Zalo) | TC-08 |
| Offline | – | Thanh toán offline rồi sync | TC-05, TC-11 |

---

## 4. SQL soi kết quả (Postgres, schema tenant)

```sql
-- Đơn bị gắn cờ cần kiểm tra
SELECT order_id, order_no, status, total_amount, paid_amount,
       metadata::jsonb->>'resource_id'        AS table_id,
       metadata::jsonb->>'review_reason'      AS reason,
       metadata::jsonb->>'review_flagged_at'  AS flagged_at
FROM orders
WHERE metadata::jsonb->>'needs_review' = 'true'
ORDER BY created_at DESC;

-- Món của một đơn
SELECT product_name, qty, unit_price, line_total, active
FROM order_items WHERE order_id = '<order_id>';

-- Kiểm tra tổng đơn khớp với tổng dòng món
SELECT o.order_id, o.total_amount, SUM(i.line_total::numeric) AS lines_total
FROM orders o JOIN order_items i ON i.order_id = o.order_id
WHERE o.order_id = '<order_id>' AND COALESCE(i.active,'TRUE') <> 'FALSE'
GROUP BY o.order_id, o.total_amount;
```

> Tên bảng hoặc cột có thể khác tuỳ adapter. Với Sheets, xem trực tiếp tab `orders` và `order-items`.

---

## 5. Các phần chưa có trong Phase 0 (đừng báo lỗi nhầm)

- **0.9 (gom cấu hình giá):** chưa làm vì sẽ đổi số tiền tạm tính một số shop đang thấy, nên cần thông báo trước. Ba nơi trên web có thể vẫn hiển thị tạm tính khác nhau.
- **Màn xử lý đơn `needs_review`:** chưa có giao diện. Đơn gắn cờ chỉ xem được qua SQL hoặc danh sách đơn. Hộp xung đột làm ở Phase 4.
- **Xoá món giữa hai máy:** máy chưa từng thấy một món thì sẽ không xoá món đó. Ngược lại, món một máy đã xoá vẫn có thể bị máy kia (giỏ cũ) thêm lại khi đồng bộ. Phase 1 (thao tác delta) sẽ giải quyết.
- **Sửa số lượng món khi bàn còn mở trên nhiều máy:** vẫn là "ghi sau thắng" qua `PUT /order-items`. Phase 1 sẽ chuyển sang thao tác delta.

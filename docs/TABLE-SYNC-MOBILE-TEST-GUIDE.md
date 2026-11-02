# Hướng dẫn test tay: mobile + chạy lẫn với web (đồng bộ bàn)

Mục tiêu: kiểm tra trước khi phát hành
1. các bản vá Phase 0 trên app mobile;
2. web chạy **v2**, mobile chạy **luồng cũ** trên **cùng một shop**.

Kịch bản đầy đủ phía web xem ở [TABLE-SYNC-PHASE0-TEST-SCENARIOS.md](TABLE-SYNC-PHASE0-TEST-SCENARIOS.md).

---

> **Cập nhật 2026-11-02 (nhánh `fix/mobile-table-sync`):** mobile đã chạy **table sync v2**, giống web.
> - Mở bàn, gọi/sửa/xoá món, thanh toán và chuyển bàn đều đi qua `/table-sessions/*`.
> - Món gửi dạng delta, tiền giờ lấy từ báo giá server.
> - Gộp bàn tạm khoá ở v2.
> - Mọi lựa chọn trong bảng xung đột đều có bước xác nhận **Được / Mất**.
> - Thao tác bị server từ chối hiện trong **hộp xung đột v2**, mở từ nút "N xung đột".
>
> Ở M4/M4b với v2, món gọi offline vào bàn đã thanh toán sẽ vào **hộp xung đột v2**, không còn hiện bảng so sánh của luồng cũ.

## 0. Chuẩn bị (làm một lần)

| Thiết bị | Cách mở |
|---|---|
| **Web A** | Chrome thường, `http://cafe-linh-ka.localhost:3000`, vào **POS → sơ đồ bàn** |
| **Mobile M** | App Oni POS trên iOS Simulator (Expo Go) |
| **Terminal** | Chạy proxy, dùng để giả lập riêng mobile mất mạng |

1. Mở terminal ở thư mục dự án và chạy (để nguyên, đừng tắt):
   ```bash
   node scripts/dev/mobile-offline-proxy.mjs
   ```
   Màn hình hiện `📶 Mobile ONLINE`.
   - Bấm **Ctrl+C** để mobile mất mạng.
   - Chạy lại lệnh trên để mobile có mạng trở lại.
   - Web không bị ảnh hưởng.
2. Trên **Mobile M**, ở màn đăng nhập:
   - bấm bánh răng ⚙️ → **Địa chỉ server** = `http://localhost:3100` (cổng **3100**, không phải 3000) → **Lưu cấu hình**;
   - đăng nhập: gian hàng `cafe-linh-ka`, email `cafe@oni.vn`, mật khẩu của anh/chị;
   - vào màn POS / sơ đồ bàn.
3. Kiểm tra **Bàn 3** và **Bàn V1** đang **trống** trên cả hai máy.

> **Mobile mất mạng:** sau khi tắt proxy, đợi khoảng **15 giây**. App kiểm tra mạng 15 giây một lần; chấm trạng thái đồng bộ chuyển sang đỏ/offline.
> **Có mạng lại:** chạy lại proxy, đợi khoảng 15 giây để app tự đồng bộ.

Sau mỗi kịch bản, ghi **Đạt / Lỗi** (kèm ảnh chụp nếu lỗi). Có thể nhờ Claude kiểm tra DB sau từng bước.

---

## M1. Web mở bàn, mobile gọi thêm món

1. **Web A:** mở **Bàn 3** → bắt đầu sử dụng → gọi **1 Cafe Đen đá**.
2. **Mobile M:** mở **Bàn 3**.
   - ✅ Bàn hiện **đang có khách**, có sẵn Cafe Đen đá.
   - ❌ Lỗi nếu: mobile hiện bàn trống hoặc cho mở phiên mới.
3. **Mobile M:** gọi thêm **1 Cafe Nâu**.
4. **Web A:** đợi tối đa khoảng 12 giây.
   - ✅ Cafe Nâu hiện trên web, tổng **50.000đ**.
   - ❌ Lỗi nếu: món bị trùng, hoặc web mất Cafe Đen đá.

## M2. Mobile thanh toán bàn do web mở

1. **Mobile M:** thanh toán **Bàn 3**, tiền mặt.
2. **Web A:** đợi tối đa khoảng 12 giây.
   - ✅ Bàn 3 về **trống**.
3. **Web A:** mở lại **Bàn 3** cho khách mới.
   - ✅ Mở bình thường.
   - ❌ Lỗi nếu: báo "Bàn đang có phiên khác" hoặc "vừa được mở trên thiết bị khác".
4. Dọn dẹp: **Web A** huỷ bàn 3 (menu ⋯ → Huỷ phiên) hoặc để nguyên dùng cho M5.

## M3. Mobile mở bàn, web không mở chồng lên

1. **Mobile M:** mở **Bàn V1** → gọi **1 món** bất kỳ.
2. **Web A:** đợi sơ đồ cập nhật (tối đa khoảng 12 giây).
   - ✅ V1 hiện **đang có khách**.
   - Bấm V1: ✅ thấy món mobile vừa gọi, **không** hiện form mở bàn.
3. *(Nâng cao, tuỳ chọn)* Tạo tình huống web chưa kịp cập nhật:
   - **Mobile:** thanh toán V1.
   - **Web A:** **không** tải lại, bấm V1 khi web còn hiện "đang có khách".
   - ✅ Web tự cập nhật hoặc báo bàn đã đóng. Không tạo đơn trùng.

## M4. Món mobile gọi lúc mất mạng không lọt sang khách sau (bản vá chính)

Chuẩn bị: **Bàn V1** đang có khách do **mobile** mở (làm lại bước 1 của M3 nếu cần).

1. **Terminal:** bấm **Ctrl+C** để mobile mất mạng, đợi khoảng 15 giây.
2. **Mobile M:** gọi thêm **2 món** cho V1 (ví dụ 2 Bạc xỉu). App vẫn cho gọi và lưu trên máy.
3. **Web A:** thanh toán **V1** (tiền mặt). Sau đó mở lại **V1** cho **khách mới** và gọi **1 Coca** (hoặc món khác).
4. **Terminal:** chạy lại proxy để mobile có mạng. Đợi khoảng 15–20 giây, rồi mở **V1** trên mobile.
   - ✅ Đơn của **khách mới** trên web **chỉ có Coca**, **không** có 2 Bạc xỉu.
   - ✅ Mobile hiện **bảng xung đột bàn**, liệt kê 2 Bạc xỉu của phiên cũ.
   - ❌ Lỗi nếu: 2 Bạc xỉu xuất hiện trong đơn của khách mới.
5. Trong bảng xung đột, chọn **giữ đơn trên server** (bỏ món phiên cũ).
   - ✅ Mobile hiển thị V1 chỉ có Coca, giống web.

### M4b. Biến thể: web thanh toán nhưng **không** mở lại bàn

Làm như M4, nhưng ở bước 3 web **chỉ thanh toán**, không mở lại V1.
- ✅ Khi mobile có mạng: hiện bảng xung đột. Món **không** bị đẩy vào đơn đã thanh toán.
- Chọn **Gộp**: ✅ V1 vẫn **trống**, món được cất vào một đơn "cần kiểm tra". Claude kiểm tra được trong DB.

## M5. Mobile không xoá món do web thêm

1. Mở **Bàn 3** trên cả web và mobile, ví dụ đang có 1 Cafe Đen đá.
2. **Web A:** thêm **1 Lạc rang**. Ngay sau đó, trong vòng khoảng 5 giây, **trước khi mobile kịp cập nhật**, **Mobile M** thêm **1 Bia**.
3. Đợi khoảng 10 giây.
   - ✅ Cả hai máy có **Cafe Đen đá + Lạc rang + Bia**.
   - ❌ Lỗi nếu: Lạc rang biến mất (bị mobile xoá).
4. **Mobile M:** xoá **Bia**.
   - ✅ Bia mất trên cả hai máy, **Lạc rang vẫn còn**.

## M6. Tiền giờ đứng yên khi mở màn thanh toán (tuỳ chọn)

Quán cafe đang để giá giờ 0đ nên không thấy tiền giờ. Muốn test thì vào **Quản lý → Bàn** và đặt giá giờ cho Bàn 3, ví dụ 60.000đ/giờ, tính theo phút.

1. Mở Bàn 3 trên **mobile**, đợi khoảng 3 phút.
2. Mở **màn thanh toán**, ghi lại số tiền giờ. Đợi thêm 2 phút **không đóng màn**.
   - ✅ Tiền giờ **không nhảy**.
3. Thanh toán.
   - ✅ Tiền giờ trên hoá đơn đã lưu đúng bằng số đã ghi.
   - ✅ Không có lỗi "DATA_INTEGRITY".

## M7. Hồi quy bán lẻ trên mobile (bắt buộc)

1. **Mobile M:** bán một đơn **mang đi / bán lẻ** (không chọn bàn), thanh toán tiền mặt.
   - ✅ Như trước đây, đơn có trong danh sách đơn hàng.
2. Tắt proxy, bán thêm 1 đơn bán lẻ, rồi bật proxy lại.
   - ✅ Đơn tự đồng bộ lên, không trùng.

---

## Báo kết quả

Gửi theo mẫu, ví dụ:

```
M1 Đạt · M2 Đạt · M3 Đạt · M4 Lỗi (ảnh) · M4b Đạt · M5 Đạt · M6 bỏ qua · M7 Đạt
```

Kịch bản nào lỗi, Claude sẽ kiểm tra `orders`, `order_items`, `table_sessions`, `order_item_ops` và log server để tìm nguyên nhân.

## Dọn dẹp sau khi test

- **Mobile:** ⚙️ → đổi server về `https://oni.vn` **chỉ khi** muốn dùng app thật. Khi đó app ghi vào dữ liệu thật, cẩn thận.
- **Terminal:** Ctrl+C để tắt proxy.
- Nếu đã đổi giá giờ của Bàn 3 ở M6 thì đặt lại về 0.

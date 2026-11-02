# Kế hoạch sửa đồng bộ bàn trên mobile

Cập nhật 2026-11-02, sau khi PR #11 (web + server v2) đã được deploy. Dựa trên khảo sát `apps/mobile` đối chiếu với các lỗi đã sửa ở web và server. Tham chiếu chung: [TABLE-SESSION-SYNC-PLAN.md](TABLE-SESSION-SYNC-PLAN.md).

Viết tắt: **UTM** = `hooks/pos/useTableManager.ts`, **SM** = `lib/sync/SyncManager.ts`, **POS** = `app/(tabs)/pos.tsx`, **CCM** = `components/pos/CartCheckoutModal.tsx`.

## Đã làm
- Bảng xung đột: mọi lựa chọn đi qua bước xác nhận **Được / Mất**, liệt kê món, khách và số tiền cụ thể. Lựa chọn gây mất dữ liệu có nút đỏ ghi đúng hành động. Lỗi từ server hiện ngay trong bước xác nhận.
- Đã có từ PR #11: chặn lộ món sang phiên khác, chỉ xoá món đã thấy, chốt giờ thanh toán, "Để sau" không tự xoá, dải báo mất kết nối, icon Feather.

## Lỗi còn lại (theo mức độ)

### Mất dữ liệu
| # | Lỗi | Vị trí |
|---|---|---|
| 1 | Mobile offline gọi món vào đơn X; máy khác thanh toán X. Có mạng lại thì món offline bị **xoá âm thầm** ở 3 chỗ: self-heal, `pushOfflineOrders` (GUARD 1 trả `skipped`), và luồng tải dữ liệu về | UTM:473, SM:799, SM:202 |
| 2 | Mở bàn, thanh toán hoặc huỷ bàn xoá **mọi** đơn `in_progress` local của bàn, kể cả đơn đang chờ xử lý xung đột. Sau đó bấm "Gộp" sẽ gửi danh sách món rỗng | UTM:1992, 2652; POS:3415 |
| 3 | Quy tắc 12 giờ vẫn xoá phiên offline | UTM:467, SM:198, SM:1658 |
| 4 | Ghi đè số lượng tuyệt đối: snapshot lúc bấm "Gọi món" cũ thì `PUT` ghi đè số lượng máy khác vừa đổi, hoặc `POST` lại món máy khác vừa xoá | UTM:1012 |
| 5 | Gộp bàn: huỷ đơn nguồn kể cả khi đồng bộ món sang bàn đích thất bại | UTM:3351 |
| 6 | Huỷ bàn lúc offline không bao giờ được gửi lại, bàn tự "sống lại" | POS:3441 |
| 7 | Vòng poll ghi đè form khách lưu trú của bàn đang mở bằng dữ liệu của bàn khác | UTM:1369 |

### Sai tiền
| # | Lỗi |
|---|---|
| 8 | Thanh toán gửi giỏ local (có thể cũ tới 15 giây), không phải các dòng trên server. Món do máy khác thêm có thể không được tính tiền |
| 9 | Tiền giờ dùng công thức copy riêng: đêm tính theo ngày của máy; `daily_grace_hours` = 0 bị đổi thành 2; giá bàn đổi giữa phiên thì áp ngay; không có báo giá server |
| 10 | Chuỗi `check_in` naive phụ thuộc múi giờ máy; Hermes có thể không parse được "YYYY-MM-DD HH:mm:ss" |

### Trùng lặp
| # | Lỗi |
|---|---|
| 11 | Không có mutex theo bàn: bấm nhanh thì hai lượt đồng bộ cùng `POST` một món |
| 12 | Không có khoá idempotency cho `POST` món và cho "Gộp" của resolve-conflict; mã tạm đổi sau mỗi lần thử |
| 13 | Thanh toán chạy đua với SyncManager: timeout 15 giây rồi `pushOfflineOrders` có thể tạo hoặc trả tiền đơn hai lần |
| 14 | SQLite không lưu `variant_label` / `modifiers`, nên dòng có biến thể bị tạo lại |

### Thử lại vô hạn / trải nghiệm
| # | Lỗi |
|---|---|
| 15 | Lỗi 4xx bị thử lại mãi mãi; đọc body response hai lần nên mất thông báo lỗi |
| 16 | Chuyển bàn: 3 request chạy song song không kiểm tra kết quả (cùng lỗi đã sửa ở Zalo); vẫn chuyển được khi offline |
| 17 | Poll 15 giây gọi 3–4 API cho mỗi bàn, `setTables` mỗi lượt gây giật; các ref chỉ nằm trong bộ nhớ |

### Chạy lẫn với web v2
- Mobile thanh toán không gửi `session_id` / `quote_id`; `PUT` số lượng tuyệt đối ghi đè delta của web; mobile không nhận broadcast v2.

## Hướng sửa

### Đợt 1: chặn mất dữ liệu trong luồng cũ
Vẫn cần làm, vì shop không dùng Postgres và lúc v2 bị tắt đều chạy luồng này.
- **#1, #3:** không bao giờ xoá món local chưa gửi. Đơn đã đóng trên server thì đưa món vào **xung đột** (giống web/server 0.4).
- **#2:** mở, thanh toán hay huỷ bàn không xoá đơn local đang có xung đột chờ xử lý.
- **#5:** gộp bàn chỉ huỷ đơn nguồn khi đồng bộ món sang bàn đích thành công.
- **#6, #16:** huỷ bàn và chuyển bàn **cần có mạng**. Chuyển bàn chạy tuần tự: cập nhật đơn → chiếm bàn đích → trả bàn nguồn, kiểm tra kết quả từng bước.
- **#7:** chỉ cập nhật form khách cho đúng bàn đang mở.
- **#11, #13:** mutex theo bàn cho đồng bộ món; khoá thanh toán với SyncManager.
- **#12:** khoá idempotency cố định theo đơn local.
- **#15:** lỗi 4xx đưa vào xung đột thay vì thử lại mãi; đọc body một lần.

### Đợt 2: đưa mobile lên v2, dùng chung lõi với web
Đây là phần sửa tận gốc cho #4, #8, #9, #10, #12, #14 và lỗi chạy lẫn.
- **Lõi dùng chung:** `lib/pos/tableSyncV2.ts` (outbox trên SQLite hoặc AsyncStorage, transport `createFetchTableSyncTransport`) và hook `useTableSyncV2Mobile`. Thăm dò `changes`: nhận 200 thì dùng v2, còn lại dùng luồng cũ.
- **Giỏ hàng:** `projectTableLines(dòng server, thao tác đang chờ)`. +/−/xoá gửi `add_item` / `change_qty(delta)` / `remove_item`. "Lưu món" so với snapshot rồi gửi **delta**, không gửi số lượng tuyệt đối.
- **Mở bàn:** `POST /table-sessions/open`; nhận 409 thì tải lại; offline thì `enqueueOpen`.
- **Thanh toán:**
  - flush hàng đợi → `quote` → khoá tiền giờ trong CCM → payload dựng từ **dòng server**, metadata có `session_id` + `quote_id`;
  - offline thì "đóng tạm" với `computeTableTimeCharge`.
- **Chuyển bàn:** `/transfer`, chỉ khi online. **Gộp bàn:** tạm khoá ở v2, như web. **Huỷ bàn:** `/cancel`.
- **Realtime:** đăng ký thêm kênh `table_sync_<shopId>` → bắt kịp thay đổi → tải lại đúng bàn bị đổi. Bỏ poll 15 giây khi đang ở v2 (#17).
- **SyncManager:** bỏ qua đơn `in_progress` có `session_id`; không bao giờ xoá các đơn này.
- **Xung đột:** inbox v2 (`op_rejected`, `open_conflict`) hiện qua cùng bảng xung đột có bước xác nhận.

### Đợt 3: kiểm thử
- Unit test cho phần chuyển đổi giỏ ↔ thao tác và cho việc tính delta khi "Lưu món".
- Simulator: các kịch bản M1–M7 trong `TABLE-SYNC-MOBILE-TEST-GUIDE.md`, cộng thêm kịch bản cho lỗi #1, #2, #5, #11, #13.
- Build store: không thêm module native mới. Cần build vì thay đổi lớn; về kỹ thuật vẫn đẩy OTA được.

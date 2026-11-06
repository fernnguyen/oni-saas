# Kế hoạch bổ sung Bar/Bếp (Kitchen & Bar routing) cho ngành phòng/bàn

> Ngày lập: 2026-11-06 · Trạng thái: **đề xuất, chưa triển khai**
> Nguyên tắc số 1: **không đụng luồng bán lẻ** và hạn chế sửa bảng/luồng đang chạy ổn định (`orders`, `order_items`, `sync-batch`, `CheckoutModal`, POS bán lẻ).

---

## 1. Hiện trạng (đã khảo sát code)

### 1.1 Đã có — hệ phòng/bàn khá đầy đủ, nhưng chỉ ở tầng "bán & tính tiền"

| Mảng | Có gì | Nơi |
|---|---|---|
| Cấu hình ngành | 7 vertical: `retail`, `fashion` (product_grid) · `fnb`, `billiards`, `sports_court`, `service_hourly` (table_map) · `lodging` (room_map) | `packages/core/src/verticals.ts` |
| Tài nguyên | `location_resources` (bàn/sân/phòng/máy, zone, sơ đồ MapEditor) | `schema_pg.ts:390` |
| Phiên bàn | Table sync v2: `table_sessions`, `order_item_ops` (delta idempotent theo `op_id`), `table_sync_events` (change feed) + broadcast `table_sync_<shopId>` | `apps/web/lib/server/tableSync/*`, `packages/core/src/tableSync/client.ts` |
| Thao tác | mở bàn, thêm/sửa/xoá món (`add_item`/`change_qty`/`remove_item`), tính giờ, chuyển/gộp, huỷ, quote, đóng | `/api/shops/[shopId]/table-sessions/*` |
| Gọi món mobile | Draft ticket theo bàn, nút "Lưu vào bàn" gửi delta | commit `54de0e3`, `TableOrderTicketSheet.tsx` |
| QR gọi món | `qr_ordering_sessions`, `qr_order_requests` (pending → thu ngân accept) | `QRNotificationCenter.tsx` |
| Khác | đặt chỗ, tính giờ, minibar/housekeeping (lodging), BOM trừ kho khi thanh toán | |
| In | Chỉ **hoá đơn/tạm tính** (`apps/web/lib/pos/printBill.ts`, in qua trình duyệt). Mobile: cấu hình máy in BT/LAN trong settings nhưng **in test là giả lập**. |

### 1.2 Chưa có — toàn bộ tầng Bar/Bếp

- `features.kitchen_display = true` cho `fnb` **chỉ dùng để hiển thị marketing** (`solutions/[slug]`, `IndustrySwitcher`). Không có route, API, bảng nào.
- Không có **trạm chế biến** (bếp, bar, bếp nướng…), không có định tuyến món → trạm.
- Không có **phiếu bếp / phiếu bar** (chỉ có mục E31 trong `TABLE-SESSION-SYNC-PLAN.md` nhắc tới, chưa làm).
- `order_items` **không có trạng thái chế biến** (chờ/đang làm/xong/đã ra) và **không có ghi chú theo món** (chỉ có ghi chú đơn).
- Không có khái niệm "đã báo bếp" vs "chưa báo bếp", huỷ món sau khi đã báo, KDS màn hình.

**Kết luận:** đúng — hiện tại là phòng/bàn "cơ bản+" (phiên bàn, tính giờ, sync offline, QR khá chắc), còn Bar/Bếp truyền thống thì **chưa có gì ngoài 1 cờ cấu hình**.

---

## 2. Điểm móc nối tự nhiên (vì sao có thể làm mà ít đụng chạm)

`order_item_ops` của table sync v2 **chính là luồng delta món** mà bếp cần:
- `add_item` → dòng phiếu "+N"
- `change_qty` delta âm / `remove_item` → dòng phiếu **HUỶ**
- `op_id` idempotent → in lại khi mạng chập chờn **không bị in đôi** (đúng E31).
- Ops được áp trong transaction ở `service.ts` → sau commit sinh phiếu là đủ, **không cần sửa `orders`/`order_items`**.
- Broadcast + change feed đã có → KDS dùng lại cùng cơ chế (kênh riêng `kitchen_<shopId>`).

Mobile "Lưu vào bàn" và QR "accept" đều đã đi qua ops ⇒ là thời điểm "gửi bếp" sẵn có.

---

## 3. Thiết kế đề xuất

### 3.1 Phạm vi gate (bảo vệ bán lẻ)

Tính năng bật khi **cả 3** đúng:
1. Vertical có `posLayout !== 'product_grid'` (retail/fashion **không bao giờ** thấy).
2. Connector hỗ trợ table sync v2 (Postgres có `withTransaction`) — giống gate hiện tại.
3. Chi nhánh có **≥ 1 trạm đang hoạt động** (`prep_stations`). Không tạo trạm = hệ thống chạy y như hôm nay → không cần cờ shop_settings, không cần migration Supabase.

Mở `kitchen_display` thành opt-in cho cả `billiards`, `service_hourly` (karaoke/game hay có bar nước), `sports_court`; `lodging` để sau (room service).

### 3.2 Dữ liệu mới (chỉ **thêm bảng**, không sửa bảng cũ)

```
prep_stations          id, branch_id, name, kind('kitchen'|'bar'|'other'),
                       output('print'|'kds'|'both'), printer jsonb, is_active, sort_order
prep_station_routes    id, branch_id, station_id, target_type('category'|'product'), target_id
                       -- product ghi đè category; không khớp → trạm mặc định (cờ is_default)
kitchen_tickets        id, branch_id, ticket_no, station_id, session_id, order_id, resource_id,
                       resource_name, source('pos_web'|'pos_mobile'|'qr'), batch_id,
                       kind('order'|'void'), status('open'|'done'), print_count, printed_at,
                       created_by, created_at
kitchen_ticket_items   id, ticket_id, op_id (unique), order_item_id, line_key, product_name,
                       variant_label, modifiers, note, qty (âm = huỷ),
                       status('pending'|'preparing'|'ready'|'served'|'voided'),
                       started_at, ready_at, served_at
```

- Ghi chú theo món (ít đá, không hành…) đi vào **payload op + `kitchen_ticket_items.note`**, không thêm cột vào `order_items`. Nếu cần hiện trên hoá đơn thì đưa vào `modifiers` (đã có), để sau.
- Trạng thái chế biến nằm ở `kitchen_ticket_items`; POS đọc để hiện badge, không ghi ngược vào `order_items`.

### 3.3 Luồng

```
[Web/Mobile/QR] ──ops(batch_id)──▶ table-sessions/ops (tx áp món như hiện tại)
                                       │ sau commit
                                       ▼
                         kitchenRouter: op → station (route) → gom theo (batch_id, station)
                                       │
                     ┌─────────────────┴──────────────────┐
                     ▼                                    ▼
              kitchen_tickets(+items)            broadcast kitchen_<shopId>
                     │                                    │
          output=print: máy POS in phiếu         output=kds: màn hình bếp/bar
          (thiết bị "trạm in" của chi nhánh)     bump: pending→preparing→ready→served
                                                          │
                                         POS thấy badge "Xong – chờ ra món"
```

- **batch_id**: client gắn 1 batch cho mỗi lần "Lưu vào bàn"/"Gửi bếp" ⇒ 1 lần gửi = 1 phiếu/ trạm (không phải 1 phiếu/món).
- **Web ResourceSlideOver** hiện áp từng op ngay khi bấm món ⇒ thêm nút **"Gửi bếp (N)"**: món mới để trạng thái "chưa báo" ở client (giống draft mobile), bấm mới gửi ops. Hoặc chế độ đơn giản: tự gom ops trong 5–10s. *Cần chốt (Q2).*
- **Huỷ món đã báo bếp**: `remove_item`/delta âm trên món đã có ticket ⇒ yêu cầu quyền + lý do, sinh phiếu **HUỶ** cho đúng trạm. Món chưa báo thì xoá tự do như hiện tại.
- **Chuyển/gộp bàn**: ticket đang mở cập nhật `resource_name` + in "phiếu chuyển bàn" (phase sau).
- **Thanh toán/kho/BOM**: không đổi. Đóng bàn khi còn món chưa ra ⇒ chỉ cảnh báo, không chặn.

### 3.4 In phiếu — vấn đề thực tế lớn nhất

Web in qua `window.print` ⇒ mỗi lần in bật hộp thoại, và chỉ in được ở máy đang thao tác. Bếp/bar thường có máy in riêng. Lựa chọn:
- **A. "Thiết bị trạm in"** (khuyên dùng giai đoạn đầu): 1 máy (PC/tablet) ở quầy mở trang `/t/.../kitchen?station=…` chế độ kiosk, nghe realtime và tự in (Chrome `--kiosk-printing`) — không cần cài gì thêm, đồng thời là KDS.
- **B. Mobile in ESC/POS qua LAN/BT**: cần thư viện native thật (hiện đang giả lập) → việc riêng, làm sau.
- **C. Print agent** cài trên máy Windows → để sau, khi có nhu cầu nhiều máy in.

---

## 4. Lộ trình theo phase

| Phase | Nội dung | Đụng code cũ |
|---|---|---|
| **K0 – Cấu hình** | Bảng `prep_stations`, `prep_station_routes` (+ Drizzle schema_pg, connector Postgres). Trang Cài đặt → "Bar/Bếp": tạo trạm, gán danh mục/món, chọn output. Chỉ hiện với vertical table/room. | Thêm menu settings (gate vertical) |
| **K1 – Sinh phiếu server** | `kitchen_tickets(+items)`, `kitchenRouter` gọi sau commit trong `applyOps` (bỏ qua khi chi nhánh không có trạm). Idempotent theo `op_id`. API: list ticket, đổi status, reprint. Broadcast `kitchen_<shopId>`. Test như `pnpm test:table-sync`. | 1 hook nhỏ trong `tableSync/service.ts` sau commit; op payload thêm `batch_id`, `note` (optional) |
| **K2 – Màn hình Bar/Bếp web (KDS + trạm in)** | Route `/t/[slug]/[branch]/kitchen`: lọc theo trạm, thẻ phiếu theo bàn + thời gian chờ, bump món/phiếu, tự in phiếu (chế độ A). Template `printKitchenTicket` (khổ 58/80mm, chữ to, tên bàn, giờ, ghi chú, phiếu HUỶ). | Không |
| **K3 – Gửi bếp từ POS** | Web: trạng thái "chưa báo/đã báo" + nút "Gửi bếp"; mobile: "Lưu vào bàn" ⇒ gửi kèm `batch_id` (+ ghi chú món). Badge trạng thái món (chờ/đang làm/xong). QR accept ⇒ tự sinh phiếu. | `ResourceSlideOver`, mobile `pos.tsx`, `QRNotificationCenter` — chỉ nhánh table v2 |
| **K4 – Huỷ/đổi món & quyền** | Phiếu HUỶ, quyền `kitchen.void_sent_item`, lý do huỷ, log; cảnh báo đóng bàn khi còn món chưa ra; phiếu chuyển bàn. | Permission seed |
| **K5 – Báo cáo & mở rộng** | Thời gian ra món TB, món bị huỷ sau báo bếp, tải theo trạm; mobile in ESC/POS thật; room service cho lodging. | Không |

MVP hữu dụng = **K0 + K1 + K2 + K3 (mobile trước)** — quán nhỏ đã có thể "gọi món trên điện thoại → bar/bếp nhận phiếu".

**Điều chỉnh sau nghiên cứu đối thủ (§7–§8):**
- K0: chỉ định tuyến theo **danh mục** (ghi đè theo món để sau); có trạm mẫu theo ngành.
- K2: in từ trình duyệt **chỉ ra máy in mặc định** của thiết bị ⇒ MVP = 1 máy in/thiết bị (đủ cho đa số SME: 1 máy in bar). Hai máy in (bếp + bar) ⇒ 2 thiết bị mở trang trạm, hoặc chờ K3b.
- **K3b (ưu tiên ngay sau MVP) – Mobile in LAN ESC/POS**: app đã dùng `expo-dev-client` + EAS, màn cài đặt máy in BT/LAN đã có (đang giả lập) ⇒ thêm `react-native-tcp-socket` (cổng 9100). Cần **build native mới qua EAS**, không đẩy được bằng OTA.
- K4: lý do huỷ theo danh sách cố định + quyền; chưa làm PIN duyệt.
- Để sau (khi khách lớn cần): print agent nhiều máy in, in offline qua LAN, hold/fire theo course, expediter, báo hết món.

---

## 5. Không làm / ngoài phạm vi

- Không hỗ trợ đường legacy (MySQL/Sheets, table sync v1) — giống quyết định Sync v2.
- Không thêm cột vào `orders`/`order_items`; không sửa `sync-batch`, `CheckoutModal`, POS bán lẻ.
- Không trừ kho theo thời điểm chế biến (vẫn trừ khi thanh toán).
- Không quản lý công thức/định lượng trong bếp (BOM đã có, giữ nguyên).

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Hook sau commit lỗi làm hỏng thêm món | Router chạy best-effort sau commit, lỗi chỉ log + có job "sinh lại phiếu từ ops chưa có ticket" |
| In đôi khi mạng chập chờn | unique `op_id` trên `kitchen_ticket_items`; reprint là hành động riêng tăng `print_count` |
| Web áp op tức thì → nhiều phiếu lẻ | nút "Gửi bếp" / gom theo `batch_id` |
| Offline: món đã lưu offline chưa tới server ⇒ bếp chưa biết | UI hiện rõ "Chưa gửi bếp – đang offline"; khi sync thì phiếu ra (in kèm giờ gọi gốc `client_created_at`) |
| `ResourceSlideOver.tsx` 3.170 dòng | Tách component `KitchenSendBar`/badge ra file riêng, chỉ cắm vào |

## 7. Câu hỏi & đề xuất (đã nghiên cứu đối thủ — xem §8)

| # | Câu hỏi | Đề xuất cho SME (MVP) | Đường mở rộng (đã chừa sẵn trong model) |
|---|---|---|---|
| Q1 | In phiếu hay KDS? | **Cả hai, nhưng là MỘT khái niệm "Trạm"** (kiểu Loyverse: KDS chỉ là một loại "máy in"). MVP: trang **Màn hình Bar/Bếp** trên web (KDS-lite: danh sách phiếu, tích xong, chuông) **+ tự in phiếu** từ chính trang đó (1 máy in/thiết bị). Ngay sau MVP: **mobile in thẳng ESC/POS qua LAN** (mô hình KiotViet "in bar bếp trực tiếp từ điện thoại"), vì SME hay chỉ có điện thoại + 1 máy in bar. | Print agent nhiều máy in, in offline qua LAN, KDS nhiều màn hình + expo |
| Q2 | Gửi bếp thủ công hay tự gom? | **Thủ công là mặc định** — tất cả đối thủ đều có nút gửi rõ ràng (KiotViet "Thông báo nhà bếp", CukCuk "Gửi", Square "Send"). Mobile: nút "Lưu vào bàn" đổi thành **"Lưu & báo bếp"** khi chi nhánh có trạm (1 chạm, không thêm bước). Web: thanh **"Món mới chưa báo (N) · Gửi bếp"**. Thêm 1 cài đặt chi nhánh **"Tự báo bếp khi thêm món"** cho quán cafe bán nhanh. | Giữ/bắn món theo course (hold & fire của Square/Toast) — model có `batch_id`, sau thêm `course`, `held` |
| Q3 | Bật cho ngành nào? | **Mọi ngành có sơ đồ bàn/phòng**, nhưng **opt-in bằng việc tạo trạm** (không trạm = không đổi gì). Gợi ý trạm mẫu khi bật: `fnb` → Bếp + Bar; `billiards`/`service_hourly`/`sports_court` → **Quầy nước** (1 trạm); `lodging` → ẩn, để sau. | Room service cho lodging, trạm theo zone |
| Q4 | Huỷ món đã báo bếp | **Quyền + lý do bắt buộc** (giống KiotViet/CukCuk): quyền mới `kitchen.void_sent_item` mặc định cho Chủ/Quản lý; chọn lý do từ danh sách ngắn (Khách đổi ý · Nhập nhầm · Hết món · Ra chậm · Khác…), in **phiếu HUỶ** + KDS hiện gạch đỏ. Món **chưa báo** xoá tự do như hiện tại. Không làm luồng duyệt PIN quản lý ở MVP. | Duyệt bằng PIN quản lý, danh mục lý do tuỳ chỉnh, báo cáo huỷ món |
| Q5 | Có "đã ra món"? | MVP **2 trạng thái hiển thị: Chờ làm → Xong** (bếp/bar tích), POS thấy badge "Xong". Bảng vẫn có đủ `pending/preparing/ready/served/voided`. Cài đặt tắt sẵn **"Phục vụ xác nhận ra món"** (KiotViet "cung ứng") cho nhà hàng có phục vụ bàn. | Báo **hết món** từ bếp (Sapo/CukCuk), expediter, thời gian ra món |

## 8. Nghiên cứu đối thủ (tóm tắt, 2026-11-06)

| Đối thủ | Định tuyến | Gửi bếp | Đầu ra | Huỷ món đã báo | Trạng thái |
|---|---|---|---|---|---|
| **KiotViet FnB** | Theo **nhóm hàng** → máy in/mẫu in | Nút "Thông báo nhà bếp", khoá đến khi có thay đổi mới | Máy in chế biến 80mm và/hoặc màn hình bếp; **in trực tiếp từ điện thoại qua LAN** (+ app Proxy chạy ngầm để in khi mất Internet) | Phải có quyền "Xóa món đã gọi" + **chọn lý do**; mẫu in huỷ món | Chờ chế biến → Đã xong (chờ cung ứng) → cung ứng; lọc theo món/bàn |
| **MISA CukCuk** | Theo trạm bếp/bar | Bấm "Gửi" | App bếp/bar + máy in | Nhập **số lượng + lý do**, bếp nhận thông báo; vai trò "Kiểm soát order" | Chế biến, trả món; báo hết món cho phục vụ |
| **Sapo FnB** | Bếp/bar | Order tạo là chuyển xuống app Bar/Bếp | App Bar/Bếp, **chạy offline** rồi đồng bộ | (không có tài liệu) | Bếp nhận/từ chối món khi thiếu nguyên liệu → báo phục vụ |
| **Loyverse** (miễn phí, SME) | **Printer group = danh mục**; KDS cấu hình y như máy in | Lưu open ticket là gửi; món thêm sau = **phiếu mới** | Máy in bếp, KDS app, chuông | KDS hiện **gạch đỏ**, chuông kêu khi huỷ | Tích món = xong |
| **Square** | Kitchen routing categories, mỗi KDS một trạm | "Send"; coursing hold/fire | KDS Android + máy in | Sau khi gửi không xoá được, phải **void** (in void ticket) | Theo course |
| **Toast** (enterprise) | Prep station theo món, expediter | Fire theo course pacing | KDS + máy in trạm + expo | Quyền riêng/duyệt | Prep → expo fulfill |

**Bài học áp vào ONI:**
1. Mọi đối thủ định tuyến **theo danh mục/nhóm hàng** (món ghi đè) → `prep_station_routes` đúng hướng, MVP chỉ cần danh mục.
2. **"KDS = một loại máy in"** (Loyverse) → 1 khái niệm Trạm, cấu hình đơn giản cho SME.
3. **Món thêm sau = phiếu mới**, huỷ = phiếu huỷ/gạch đỏ → khớp `batch_id` + `op_id` của sync v2.
4. VN khác quốc tế ở **in từ điện thoại qua LAN + chịu mất mạng** (KiotViet Proxy, Sapo offline) → điểm phải có ở phase sau, model phải cho phép client in trước và server khử trùng theo `op_id`.
5. Coursing/expediter/hold-fire là đồ enterprise (Square/Toast) → **không làm cho SME**, chỉ chừa cột.

Nguồn: kiotviet.vn (màn hình bếp, in bar, huỷ món, máy in chế biến, order mới), helpv2.cukcuk.com/.vn (khách huỷ món), sapo.vn (app thu ngân/bar bếp), help.loyverse.com & support.loyverse.com (KDS configuration), squareup.com/help (8170, 7748), doc.toasttab.com.

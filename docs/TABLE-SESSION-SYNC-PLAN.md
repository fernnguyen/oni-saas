# Kế hoạch chuẩn hoá đồng bộ phiên Bàn / Phòng / Sân

> Trạng thái: **ĐỀ XUẤT – chưa triển khai** · Ngày: 2026-11-01
> Cập nhật 2026-11-01 (v2): đã xác nhận server production chạy **TZ = GMT+7**. Các câu hỏi mở đã được chốt ở §7. Có thêm §6: tham khảo cách các phần mềm khác xử lý.
> Phạm vi: các vertical có `location-resources` (billiards, karaoke, nhà hàng, sân thể thao, phòng giờ).
> **Không thay đổi hành vi retail.** Mọi chỗ dùng chung với retail đều được đánh dấu 🟠 và gate theo `resource_id`/`in_progress`. Những chỗ này cần anh/chị duyệt riêng trước khi merge.

---

## 0. Tóm tắt

Hiện trạng:
- Mỗi client (Web / Mobile / Zalo) tự tính tiền giờ bằng đồng hồ của máy mình.
- Món được đồng bộ bằng cách **so cả giỏ hàng rồi ghi đè** (absolute qty, DELETE những món "không thấy trong giỏ").
- Server tin tổng tiền client gửi lên, sau đó **tự huỷ đơn** khi thấy dữ liệu không khớp.

Kế hoạch đưa hệ thống về 4 nguyên tắc:

1. **Mọi thứ đều gắn với một phiên (`session_id`).** Máy tạo `session_id` ngay khi mở bàn, kể cả lúc offline. Thao tác của phiên này không bao giờ được ghi vào phiên khác.
2. **Món là chuỗi thao tác cộng dồn (delta), có id để chống trùng.** Không còn ghi đè cả giỏ. Hai máy (một máy offline, một máy online) cùng thêm món thì cả hai đều được giữ.
3. **Server có quyền cao nhất về thời gian và tiền giờ.** Server tính tiền giờ từ snapshot giá và giờ đã chuẩn hoá. Khi client offline, client dùng **đúng hàm đó với đúng snapshot đó** để tạm tính.
4. **Việc đã xảy ra ngoài đời thì không bị xoá tự động.** Tiền đã thu và món đã phục vụ là sự thật. Nếu có xung đột, server tạo **bản ghi điều chỉnh** và đẩy vào **Hộp xung đột** để thu ngân quyết định. Server không tự huỷ hay ghi đè.

Nguyên tắc 2 thực chất là mở rộng quyết định #7 trong [POS-OFFLINE-DESIGN.md](POS-OFFLINE-DESIGN.md) ("delta-based, không bao giờ set absolute") sang món của bàn. Luồng bàn hiện đang vi phạm quyết định này.

---

## 1. Mô hình "Server trust + Offline tolerance"

### 1.1 Ai có quyền quyết định cái gì

| Dữ liệu | Bên có quyền quyết định | Ghi chú |
|---|---|---|
| Bàn đang thuộc phiên nào (occupancy) | **Server** – ai ghi trước thì thắng, kiểm tra bằng compare-and-set theo `version` | Máy offline mở bàn thì phiên ở trạng thái *tạm* cho tới khi server xác nhận |
| `check_in`, `check_out` | **Server time**, hoặc giờ máy đã hiệu chỉnh (`device_now + clock_offset`) khi offline | Lưu cả `client_ts`, `server_received_at` và `time_source` |
| Snapshot giá (rate, advanced_pricing, overnight…) | **Lưu vào đơn lúc mở bàn** | Đổi giá giữa phiên không làm thay đổi giá của phiên đang chạy |
| Tiền giờ cuối cùng | **Server tính** bằng `@oni/core` (cùng hàm client dùng) | Client chỉ hiển thị con số tạm tính |
| Ý định thêm/bớt món | **Client** (thao tác có `op_id`) | Server ghép các thao tác lại, không ghi đè |
| Tiền đã thu lúc offline | **Client (sự thật ngoài đời)** | Server không sửa. Nếu lệch thì tạo bản ghi chênh lệch |
| Tổng đơn | **Server = Σ dòng món + tiền giờ − giảm giá** | Không lấy `total_amount` client gửi cho đơn bàn |

### 1.2 Các thực thể mới / mở rộng

Lưu trong DB của tenant (`schema_pg.ts` / mysql). Riêng connector Google Sheets: tạm thời dùng `metadata` và có khả năng hạn chế, xem §6.

```
location_resources  + version (int), current_session_id
orders              + session_id, version (int), pricing_snapshot (jsonb),
                      check_in_at_server, time_source, needs_review (bool)
order_item_ops      (MỚI) op_id PK (uuid do client sinh), session_id, order_id,
                      kind: add | inc | dec | void | note,
                      line_key (product+variant+modifiers đã sort), qty_delta,
                      unit_price_snapshot, device_id, client_ts, server_ts, source (pos|qr|merge)
table_conflicts     (MỚI) id, shop_id, resource_id, session_id, type, payload, status, resolved_by
```

Bảng `order_items` vẫn giữ nguyên để báo cáo, in hoá đơn và retail dùng. Với đơn bàn, server **tính lại** bảng này từ `order_item_ops` sau mỗi lô thao tác.

### 1.3 Đồng hồ

- Mỗi response API có header `x-server-now`. Client lưu `clock_offset = server_now − device_now` (trung bình động, bỏ outlier) xuống SQLite/IndexedDB để dùng khi offline.
- Offline: `check_in = device_now + clock_offset`, `time_source = 'device_offset'`.
- Phát hiện giờ máy bị chỉnh: nếu `device_now` lùi so với lần cuối ghi nhận, hoặc lệch hơn 2 phút so với lần đồng bộ gần nhất, thì hiện cảnh báo và gắn cờ cho phiên đó.
- Thời gian trôi trong lúc offline được tính bằng đồng hồ đơn điệu (monotonic) khi nền tảng hỗ trợ: web dùng `performance.now()`; mobile lưu cặp (wall, uptime) qua `expo-device`/native. Mục đích: khách chỉnh giờ máy cũng không làm sai tiền giờ.

---

## 2. Các thay đổi cụ thể theo phase

Ký hiệu tác động: ⚪ chỉ ảnh hưởng luồng bàn · 🟠 chạm code dùng chung với retail (gate + cần duyệt) · 👁 người dùng thấy thay đổi.

### Phase 0 – Cầm máu (≈ 3–5 ngày, rủi ro thấp, rollback bằng revert)

Mục tiêu: **ngừng mất dữ liệu** trước, chưa đổi kiến trúc.

| # | Thay đổi | File | Tác động |
|---|---|---|---|
| 0.1 | `cancelOrphanedInProgressOrdersForResource` và `reconcileShopTableSessions`: **không bao giờ huỷ** đơn còn món đang hoạt động hoặc có `paid_amount > 0`. Thay vào đó đặt `metadata.needs_review = true` và ghi log | [tableSessionReconciler.ts](../apps/web/lib/server/tableSessionReconciler.ts) | ⚪ Hết hẳn tình trạng "món tự biến mất". 👁 Có thể xuất hiện thêm bàn bị gắn cờ "cần kiểm tra" (hiện tạm một badge đơn giản trên TableMap) |
| 0.2 | Reconciler / guard: chỉ dùng `metadata.check_in` / `check_out` làm mốc phiên, không dùng `created_at` / `updated_at`. Server đang chạy GMT+7 nên hiện tại **không** bị lệch 7h; mục này chỉ để không phụ thuộc vào TZ của process | như trên | ⚪ Ưu tiên thấp |
| 0.3 | sync-batch, đơn có `resource_id` và đơn đã tồn tại trên server: **cập nhật qty/line_total** của dòng trùng `line_key` thay vì bỏ qua, và cập nhật dòng TIME_CHARGE. Đơn không có `resource_id` giữ nguyên code hiện tại | [sync-batch/route.ts:566-715](../apps/web/app/api/shops/[shopId]/orders/sync-batch/route.ts) | 🟠 Gate bằng `resolvedResourceId`, retail không đi vào nhánh mới. 👁 Tổng đơn bàn khớp với dòng món |
| 0.4 | sync-batch guard 2: khi phát hiện "phiên cũ" thì **không huỷ** `serverId`, chỉ trả `conflict` | sync-batch:337 | ⚪ |
| 0.5 | Mobile: trước khi đẩy giỏ đang chờ, so `check_in` / `order_id` của phiên local với phiên trên server. Lệch thì **không đẩy** mà lưu vào conflict local | [useTableManager.ts:1078](../apps/mobile/hooks/pos/useTableManager.ts) | ⚪ Hết lộ món sang khách sau |
| 0.6 | Mobile `syncOrderItemsOnline`: chỉ DELETE món mà **chính máy này đã từng thấy** (lưu tập `knownServerItemIds`). Không xoá món máy khác thêm | useTableManager.ts:855 | ⚪ Hết tình trạng hai máy xoá món của nhau |
| 0.7 | Mobile: **chốt một mốc `checkout_at` và một số tiền duy nhất** từ lúc mở màn thanh toán tới lúc lưu đơn | [CartCheckoutModal.tsx](../apps/mobile/components/pos/CartCheckoutModal.tsx), useTableManager.ts:2161 | ⚪ Hết lỗi đơn kẹt 400 khách lẻ |
| 0.8 | Zalo: chuyển bàn theo thứ tự *cập nhật order metadata (merge) → chiếm bàn đích → trả bàn nguồn*. Metadata dùng merge, không replace | [TransferTableModal.tsx:70-100](../apps/zalo-mini-app/src/pages/pos/TransferTableModal.tsx), TableSessionModal.tsx | ⚪ |
| 0.9 | Gom cách đọc cấu hình giá vào **một hàm `resolveTableBillingInput(resource, order)`** trong `@oni/core`. TMP / RSO / CM / mobile / Zalo đều gọi hàm này. Thứ tự ưu tiên: snapshot của đơn > resource. Bỏ kiểu `\|\|` | `packages/core` + 5 call site | ⚪ 👁 **Một số shop sẽ thấy số tiền tạm tính thay đổi** (đúng hơn). Cần thông báo trước |
| 0.10 | Web RSO: chạy `syncOfflineActions` **sau** khi kiểm tra trạng thái đơn đã đóng hay chưa. Mỗi lúc chỉ cho một luồng gửi lại (dùng mutex) | [ResourceSlideOver.tsx:336-379](../apps/web/app/t/[slug]/[branch]/channels/pos/components/ResourceSlideOver.tsx) | ⚪ Hết tình trạng gửi món vào đơn đã trả và gửi trùng |

> Phase 0 **không** đổi `TZ` server và **không** đổi `getGMT7Time` (24 file đang dùng, gồm cả báo cáo retail). Phase 0 chỉ ngừng dùng `created_at` làm mốc tính giờ trong code bàn.

### Phase 1 – Phiên và thao tác chống trùng (≈ 2–3 tuần)

| # | Thay đổi | Tác động |
|---|---|---|
| 1.1 | Migration: thêm cột và bảng như §1.2. Viết script backfill: đơn `in_progress` hiện có nhận `session_id` mới; `pricing_snapshot` lấy từ metadata hiện tại | ⚪ Chỉ thêm cột, không đổi cột cũ |
| 1.2 | Adapter: thêm phương thức tuỳ chọn `compareAndSet(entity, id, expectedVersion, patch)` (Postgres/MySQL dùng `UPDATE … WHERE version = $n`) và `withTransaction()` cho pg | 🟠 Chỉ **thêm** API mới vào `IDataConnector`, không sửa `update()` cũ |
| 1.3 | Bộ endpoint mới `/api/shops/[shopId]/table-sessions/*`:<br>`open` · `ops` (batch, idempotent theo `op_id`) · `transfer` · `merge` · `quote` · `close` · `changes?since=cursor` | ⚪ Endpoint cũ vẫn giữ cho retail và cho bản app cũ |
| 1.4 | **Outbox bền vững** trên client: thao tác ghi vào SQLite (mobile) / IndexedDB (web) **trước**, rồi mới gửi lên server. Gửi lần lượt theo từng phiên. Web dùng Web Locks/BroadcastChannel để mỗi lúc chỉ một tab gửi lại | ⚪ Hết mất queue khi kill app hoặc đóng tab |
| 1.5 | Server tự broadcast realtime sau mỗi lần ghi (thay vì để client tự broadcast), kèm `cursor`. Client vừa online lại thì gọi `changes?since=` để lấy phần còn thiếu | ⚪ Không còn phụ thuộc máy offline có kịp broadcast hay không |
| 1.6 | Web/Mobile chuyển luồng bàn sang endpoint mới, có feature flag **theo shop** (`shop_settings.table_sync_v2`) | Rollback bằng cách tắt flag |

#### Tiến độ Phase 1 (cập nhật 2026-11-02)

**Đã xong – nền tảng phía server (Postgres):**
- **1.1 – Schema:** thêm 3 bảng mới `table_sessions`, `order_item_ops`, `table_sync_events` trong [schema_pg.ts](../packages/adapters/src/schema_pg.ts).
  - `table_sessions` có unique index một phần: mỗi bàn chỉ có **một** phiên `open`.
  - **Không** thêm cột vào `orders` hay `order_items`, nên không ảnh hưởng retail.
  - Thêm migration Supabase tạo cột `shop_settings.table_sync_v2` (mặc định tắt).
- **1.2 – Adapter:** thêm `withTransaction()` tuỳ chọn vào `IDataConnector`. Đã có cho Postgres; `CachedDataConnector` chuyển tiếp. CRUD cũ không đổi.
- **1.3 – Endpoint** (chạy khi shop bật cờ **và** connector có transaction, nếu không trả 409 `table_sync_v2_disabled` / `table_sync_v2_unsupported`):
  - `POST /table-sessions/open`: idempotent theo `session_id` do client tạo. Bàn đã có phiên khác thì trả 409 `resource_occupied`, **không** tự huỷ hay gộp.
  - `POST /table-sessions/:id/ops`: thao tác delta `add_item` · `change_qty` · `remove_item` · `set_time_charge`.
    - Idempotent theo `op_id`. Các máy được xếp hàng bằng khoá dòng phiên. Cả lô dùng chung một transaction.
    - Thao tác gửi vào phiên đã đóng bị ghi `rejected: session_not_open`.
  - `GET /table-sessions/:id`: snapshot phiên, đơn, món, kèm `cursor`.
  - `GET /table-sessions/changes?since=`: feed thay đổi theo `seq`, có phân trang.
- **Test:** `pnpm test:table-sync`.
  - 13 unit test cho engine.
  - 8 integration test trên Postgres thật: 10 máy cộng đồng thời, retry trùng `op_id`, rollback, unique index, cô lập tenant, feed thay đổi.
  - Bản integration cần `TABLE_SYNC_TEST_PG_URI` trỏ tới một DB test.

**Còn lại của Phase 1:**
- 1.2 cho MySQL: hiện MySQL trả `table_sync_v2_unsupported`, nên shop MySQL vẫn ở luồng Phase 0.
- 1.3: `transfer`, `merge`. `quote` / `close` thuộc Phase 2.
- 1.4: outbox bền vững trên client.
- 1.5: server tự broadcast realtime.
- 1.6: web/mobile chuyển sang endpoint mới theo cờ.

> **Deploy:** `drizzle-kit push` trong deploy.sh sẽ **tạo thêm** 3 bảng trên Postgres production (chỉ thêm, không sửa bảng cũ). Cần chạy migration Supabase cho cột cờ.

### Phase 2 – Tiền giờ do server quyết định (≈ 1–2 tuần)

| # | Thay đổi | Tác động |
|---|---|---|
| 2.1 | `POST table-sessions/:id/quote` → server chốt `checkout_at` (giờ server), tính tiền bằng `calculateHourlyBilling` với `pricing_snapshot`, trả `quote_id` (hiệu lực 5 phút) | ⚪ 👁 Màn thanh toán hiển thị "đã chốt giờ lúc HH:mm" |
| 2.2 | `close` bắt buộc có `quote_id` khi online. Server kiểm tra tổng = quote + Σ món. Không khớp thì trả về số đúng, **không** báo lỗi 400 cứng | ⚪ |
| 2.3 | `close` lúc offline: client tính bằng cùng hàm, cùng snapshot, với `checkout_at = device_now + offset`. Khi sync, server tính lại:<br>• Thời lượng lệch ≤ 2 phút **và** tiền lệch ≤ 2.000đ: chấp nhận số của client, chỉ ghi log.<br>• Lệch lớn hơn: **vẫn giữ số tiền đã thu**, gắn `billing_discrepancy` và đẩy vào Hộp xung đột. Xem §7.1 | ⚪ Không bao giờ sửa số tiền khách đã trả |
| 2.4 | Thống nhất logic qua đêm / theo ngày vào `@oni/core` (hiện có 3 bản copy với cách đếm đêm khác nhau) | ⚪ 👁 Shop dùng giá qua đêm có thể thấy số khác. Cần thông báo |
| 2.5 | **Quyền giữ phiên (lease)**: máy thao tác gần nhất với phiên khi đang online sẽ giữ lease trong 10 phút, gia hạn bằng heartbeat. Server ghi `lease_device_id` + `lease_until`. Máy khác vẫn thêm món được (thao tác delta không xung đột), nhưng **đóng / chuyển / gộp** phải lấy lease trước. Khi online, lấy lease là tự động và gần như không cảm nhận được | ⚪ Giảm mạnh các ca E11/E12/E13 |
| 2.6 | **Chính sách thao tác khi offline** (xem §7.2):<br>• Thêm/bớt món: luôn cho phép.<br>• Đóng bàn: cho phép, kèm cảnh báo khi máy không giữ lease. Đơn được ghi là **"đóng tạm"**; server xác nhận khi sync.<br>• Chuyển / gộp bàn: chặn khi offline nếu máy không giữ lease | 👁 Thu ngân thấy nhãn "đóng tạm – chờ đồng bộ" |

### Phase 3 – Khoá chặt múi giờ (thu gọn vì server đã chạy GMT+7)

Server chạy GMT+7 nên `getGMT7Time()` (lưu giờ naive) và node-pg (đọc `timestamp` theo TZ của process) đang khớp với nhau. **Không migrate cột, không đổi `getGMT7Time`**, nên retail không bị ảnh hưởng.

Hiện TZ chỉ đúng **nhờ cấu hình OS của VPS**. Đổi máy chủ, chạy Docker, hay chạy trên máy dev đặt UTC đều sẽ lệch 7h. Cần làm:
- `scripts/deploy.sh`: thêm `TZ: 'Asia/Ho_Chi_Minh'` vào `base` env của ecosystem được sinh ra.
- Thêm kiểm tra lúc khởi động: nếu `new Date().getTimezoneOffset() !== -420` thì log lỗi và gửi Telegram.
- Code bàn ghi `check_in` / `check_out` theo **ISO đầy đủ** (có `Z` hoặc `+07:00`), không ghi chuỗi naive. Các chỗ cần sửa: QR order, reservation check-in, fallback ở `POST /orders` và sync-batch. Mục đích: client ở bất kỳ múi giờ nào cũng parse đúng.

### Phase 4 – Hộp xung đột, Zalo, reconciler

- UI **Hộp xung đột** (web + mobile): danh sách theo bàn, mỗi loại xung đột có sẵn các lựa chọn xử lý (xem §3).
- Zalo chuyển sang endpoint `table-sessions/*` và bỏ việc lưu phiên trong localStorage làm nguồn chân lý.
- Reconciler chuyển từ "chạy mỗi lần GET" sang **job định kỳ** (1 phút) và **chỉ báo cáo** (đẩy vào Hộp xung đột), không tự sửa dữ liệu có món hoặc có tiền.

### Phase 5 – Dọn legacy

- Dùng `get_mobile_version` để buộc cập nhật bản mobile cũ (bản chưa gửi `session_id` / `op_id`).
- Sau khoảng 30 ngày không còn request legacy cho luồng bàn: bỏ nhánh bàn trong sync-batch và chuyển cập nhật món bàn khỏi `PUT /order-items`.

### Phase 6 (tuỳ chọn, về sau) – Hub mạng nội bộ

Toast, Lightspeed và Sapo đều giải bài "mất internet nhưng vẫn còn mạng LAN" bằng **một máy hub trong quán** (xem §6). Có thể cho máy thu ngân web/Windows làm hub: các máy order đẩy thao tác qua LAN (WebSocket nội bộ hoặc WebRTC), hub giữ lease và đồng hồ chung, rồi đẩy lên cloud khi có mạng. Phase này chỉ làm khi Phase 1–4 đã ổn định và có nhu cầu thật, vì chi phí cao (phát hiện hub, bầu lại hub khi hub chết, bảo mật LAN).

---

## 3. Edge case: một máy offline, một máy online (và các trường hợp khác)

Quy ước: **A** = máy mất mạng, **B** = máy có mạng, **S1** = phiên hiện tại của bàn T, **S2** = phiên kế tiếp.

### 3.1 Món

| # | Tình huống | Hiện tại | Sau plan |
|---|---|---|---|
| E1 | A offline thêm 2 bia vào S1, B online thêm 1 nước vào S1 | Ai sync sau thì ghi đè hoặc xoá món của máy kia | Thao tác delta được ghép lại: đủ cả 2 bia + 1 nước. B nhận realtime khi A online lại |
| E2 | A và B cùng bấm +1 cho cùng một món | Cả hai ghi `qty = 3`, mất một lần bấm | Hai thao tác `inc +1` → `qty = 4` |
| E3 | A offline huỷ món X, B online tăng món X lên 3 | Kết quả không xác định | Thao tác `void` tham chiếu đúng dòng A đã thấy. Phần B tăng **sau** đó vẫn được giữ và báo cho A biết |
| E4 | Request thành công nhưng mất response, app gửi lại | Món bị tạo trùng | `op_id` trùng → server bỏ qua (idempotent) |
| E5 | App bị kill hoặc tab bị đóng khi còn món chưa gửi | Mất (queue chỉ nằm trong RAM hoặc localStorage) | Outbox lưu trên đĩa, mở app lại thì tự gửi tiếp |
| E6 | Lần mở bàn chưa lên server mà thao tác món đã lên | Món bị gắn vào đơn tạm hoặc sai đơn | Outbox gửi theo thứ tự trong từng phiên. Server trả `425 session_pending` thì client đợi rồi thử lại |
| E7 | Hai tab web trên cùng một máy | Gửi lại hai lần | Web Locks: mỗi lúc chỉ một tab gửi lại |

### 3.2 Vòng đời phiên

| # | Tình huống | Hiện tại | Sau plan |
|---|---|---|---|
| E8 | A offline thêm món cho S1, trong lúc đó B thanh toán S1 | Món bị gửi vào đơn đã đóng, hoặc bị mất | Server thấy S1 đã đóng nên **không gửi vào S1** → xung đột `late_items`. Thu ngân chọn: (a) tạo **đơn bổ sung** cho bàn / khách đó, (b) huỷ kèm lý do |
| E9 | B thanh toán S1 rồi mở S2 cho khách mới, sau đó A online lại với giỏ S1 | **Món S1 lộ sang S2, và món của S2 bị xoá** | `session_id` khác nhau nên tuyệt đối không gửi vào S2. Xử lý như E8 |
| E10 | A offline mở bàn T (thấy bàn trống), B online cũng mở T cho khách khác | Server tự huỷ một đơn (dù đã có món) | Không huỷ phiên nào. Hai phiên tạm thời **cùng tồn tại** trên bàn T, có badge xung đột `double_occupancy`. Gợi ý xử lý theo ngành: nhà hàng → gộp; billiards / karaoke / sân / phòng → chuyển phiên đến sau sang bàn trống (vì tiền giờ phải tính theo từng bàn). Xem §7.3 |
| E11 | A offline thanh toán S1 (đã thu tiền mặt), B online vẫn gọi thêm món cho S1 | Món của B nằm trên server nhưng không có trong tổng A đã thu, nên thất thu mà không ai biết | Server đóng S1 theo A tại `checkout_at`. Món B thêm **sau** mốc đó thành **khoản còn thiếu** → Hộp xung đột: thu thêm / chuyển công nợ / bỏ qua kèm lý do |
| E12 | Cả A (offline) và B (online) đều thanh toán S1 | Doanh thu bị cộng hai lần, thanh toán có thể bị nhân đôi | Lần đóng đầu tiên thắng. Lần thứ hai thành `duplicate_close` và thanh toán của nó vào **tài khoản treo** (không tính doanh thu) chờ hoàn tiền hoặc xác nhận |
| E13 | A offline chuyển bàn T1 → T2, B online mở T2 | Bàn nguồn bị trả trước nên đơn bị tự huỷ (Zalo) | Chuyển bàn là một thao tác compare-and-set duy nhất trên server. T2 đã có người thì thành xung đột `transfer_target_busy` |
| E14 | A offline gộp T1 + T2, B online thêm món cho T2 | Món của B ở lại trong đơn đã gộp và bị bỏ sót | Gộp = phiên T2 được đánh dấu `merged_into = S(T1)`. Thao tác đến muộn của T2 tự chuyển sang phiên đích (có ghi vết) |
| E15 | Bàn bị xoá hoặc đổi tên khi A đang offline | Lỗi, hoặc đơn mồ côi | Phiên vẫn tồn tại theo `session_id`. Bàn đã xoá thì đẩy vào xung đột `resource_missing` |
| E16 | Khách gọi món qua QR (online) vào S1 trong khi A (offline) đã thanh toán S1 | Món QR rơi vào đơn bị đóng muộn | Như E11: thành khoản còn thiếu |
| E17 | Đặt bàn tự check-in trùng thời điểm A offline mở bàn | Hai đơn trên một bàn | Như E10 |

### 3.3 Thời gian và tiền giờ

| # | Tình huống | Hiện tại | Sau plan |
|---|---|---|---|
| E18 | Đồng hồ máy A chậm 3 phút so với B | Hai máy hiện tiền giờ khác nhau. Lệch hơn 5 giây thì server có thể huỷ phiên | Mọi máy dùng `clock_offset`, nên hiển thị giống nhau. Server tính tiền theo giờ server |
| E19 | Khách hoặc nhân viên chỉnh giờ máy khi đang offline | Tiền giờ sai theo giờ máy | Phát hiện giờ bị lùi hoặc nhảy, tính thời gian trôi bằng đồng hồ đơn điệu, gắn cờ phiên |
| E20 | Đổi giá giờ trong lúc phiên đang chạy | Màn này tính giá mới, màn kia tính giá cũ | Tính theo snapshot lúc mở bàn. Giá mới chỉ áp cho phiên mở sau đó |
| E21 | A mở bàn lúc offline với bảng giá cache cũ | Không kiểm soát | Snapshot = bảng giá A có lúc đó (là giá khách được báo). Server gắn cờ nếu khác bảng giá hiện hành tại `check_in` |
| E22 | Màn thanh toán mở lâu, vượt qua mốc tròn giờ | Số trên màn ≠ số đã lưu, đơn kẹt 400 | Quote chốt `checkout_at`. Quá 5 phút thì yêu cầu lấy lại quote |
| E23 | Phiên vắt qua nửa đêm / qua đêm / nhiều ngày | 3 công thức khác nhau | Một hàm duy nhất trong core, tính ranh giới ngày theo `Asia/Ho_Chi_Minh` (không theo múi giờ của máy) |
| E24 | Phiên offline kéo dài hơn 12 giờ (nhà nghỉ) | Mobile xoá như dữ liệu cũ | Bỏ luật 12 giờ. Phiên chỉ đóng khi có thao tác đóng thật |

### 3.4 Các ràng buộc phía server khiến queue offline bị kẹt

| # | Tình huống | Hiện tại | Sau plan |
|---|---|---|---|
| E25 | Đơn offline sync lên khi kỳ thuế đã khoá sổ | 400, queue kẹt vĩnh viễn | Nhận đơn, đặt `needs_review` + xung đột `tax_locked`, chủ shop quyết định |
| E26 | Đơn offline sync lên khi ca làm việc đã đóng | 400, queue kẹt | Gắn vào ca theo `checkout_at`, hoặc xung đột `shift_closed` |
| E27 | Khách lẻ, tổng ≠ đã trả do tính lại | 400 `DATA_INTEGRITY_ERROR`, kẹt | Không còn xảy ra nhờ quote / ngưỡng ở 2.3. Nếu vẫn lệch thì đẩy vào xung đột thay vì báo lỗi |
| E28 | Lỗi 4xx thật (mất quyền, sai dữ liệu) | Web coi là offline và gửi lại mãi | Phân loại lỗi: lỗi mạng hoặc 5xx thì thử lại; 4xx thì đẩy vào xung đột và dừng thử lại |

### 3.5 Tương thích và vận hành

| # | Tình huống | Xử lý |
|---|---|---|
| E29 | App mobile bản cũ (chưa có `session_id` / `op_id`) vẫn đang được dùng | Server nhận diện payload legacy và đi nhánh cũ đã vá ở Phase 0 (không xoá, không huỷ). Buộc cập nhật ở Phase 5 |
| E30 | Shop dùng connector Google Sheets (không có transaction / compare-and-set) | Sync v2 chỉ bật cho Postgres/MySQL. Sheets giữ luồng Phase 0 và cảnh báo "khuyên dùng một thiết bị" cho ngành có bàn |
| E31 | In phiếu bếp lúc offline rồi gửi lại | Phiếu bếp gắn với `op_id`, gửi lại thì không in lại |
| E32 | Trừ kho khi có đơn bổ sung hoặc món đến muộn | Trừ kho theo thao tác đã được chấp nhận. Món bị huỷ trong Hộp xung đột thì không trừ |

---

## 4. Tác động tổng hợp

### 4.1 Ảnh hưởng tới retail

| Thành phần dùng chung | Phase | Cách cô lập |
|---|---|---|
| `orders/sync-batch/route.ts` | 0.3, 0.4, 2.x | Chỉ đi vào nhánh mới khi `resolvedResourceId` khác rỗng **và** không bắt đầu bằng `takeaway`. Test hồi quy retail bắt buộc |
| Web `CheckoutModal.tsx` (dùng chung với `POSClient`) | 0.9, 2.1 | Logic tiền giờ đã nằm trong nhánh `rental_type`/resource. Phần submit chung không đổi ở Phase 0 |
| `IDataConnector` | 1.2 | Chỉ thêm phương thức tuỳ chọn |
| `getGMT7Time` / cột timestamp | 3 | Không đổi. Chỉ pin `TZ` trong deploy và thêm kiểm tra lúc khởi động |
| Mobile `SyncManager.pushOfflineOrders` | 1.4 | Luồng bàn chuyển sang outbox riêng. Queue retail giữ nguyên |

### 4.2 Người dùng sẽ thấy gì khác

- Số tiền giờ tạm tính **giống nhau trên mọi màn hình và mọi máy**. Một số shop sẽ thấy con số thay đổi so với trước (0.9, 2.4), cần thông báo trước.
- Màn thanh toán ghi "đã chốt giờ lúc HH:mm".
- Có thêm **Hộp xung đột** và badge "cần kiểm tra" trên bàn. Trước đây hệ thống âm thầm xoá; giờ thu ngân phải quyết định. Đây là thay đổi về quy trình vận hành và cần hướng dẫn sử dụng (hdsd).
- Bàn mở lúc offline hiện nhãn "chưa đồng bộ" cho tới khi server xác nhận.

### 4.3 Rủi ro và cách giảm

| Rủi ro | Giảm thiểu |
|---|---|
| Hộp xung đột quá nhiều mục làm thu ngân bỏ qua | Tự xử lý các trường hợp an toàn (trùng `op_id`, lệch dưới ngưỡng). Chỉ đẩy vào hộp những gì liên quan tới tiền hoặc món |
| Migration thêm cột trên DB tenant lớn | Chỉ thêm cột nullable, backfill theo lô |
| Hai hệ thống (v1/v2) chạy song song lâu | Feature flag theo shop, có mốc thời gian dọn dẹp ở Phase 5 |
| Index GitNexus đang cũ (không thấy reconciler, `calculateHourlyBilling` báo 0 caller) | Chạy `node .gitnexus/run.cjs analyze` trước khi bắt đầu Phase 0 để `impact` / `detect_changes` cho kết quả đúng |

---

## 5. Kiểm thử và đo lường

- **Bộ test kịch bản hai thiết bị** (`tests/table-sync/`): giả lập A/B với outbox, đồng hồ lệch, mất response. Mỗi E1–E28 có ít nhất 1 test.
- Test hồi quy retail cho sync-batch: tạo đơn, trả nợ, đơn có thanh toán chia nhỏ, trả hàng.
- Mở rộng [tests/hourly-billing-and-cache.test.ts](../tests/hourly-billing-and-cache.test.ts) bằng bảng so sánh: cùng input thì web / mobile / Zalo / server ra cùng một số.
- **Đo trước/sau** (chạy ngay trong Phase 0): đếm số đơn bàn có `total_amount ≠ Σ line_total`, số đơn bị tự huỷ có món, số lần `skipped_stale_in_progress`. Đây là cơ sở để đánh giá plan có hiệu quả hay không.

---

## 6. Các phần mềm khác xử lý thế nào

Tài liệu công khai **không** hãng nào mô tả thuật toán gộp dữ liệu khi hai máy cùng sửa một bill lúc offline. Họ chủ yếu **tránh để xung đột xảy ra**, bằng 3 cách:

| Hãng | Cách làm | Điểm đáng học |
|---|---|---|
| **Toast** (Mỹ) | Khi offline, các máy **không thấy thay đổi của nhau**. Hãng khuyên mỗi nhân viên chỉ dùng một máy để nhập và sửa order. Offline **không cho đóng check**, khai tiền tip hay đối soát tiền mặt. Bản mới có "local sync": **một hub** nối dây mạng làm trung chuyển trong LAN. Xung đột được nhắc tới là chấm công trùng khi nhiều máy cùng offline | Chặn các thao tác nguy hiểm (đóng bill) khi offline, quy định máy nào sở hữu bill, dùng hub LAN |
| **Lightspeed K-Series** | Có **một "active device"** giữ dữ liệu. Mất internet nhưng còn LAN thì các máy phụ đẩy order về active device. Mất cả LAN thì chỉ còn active device bán được | Một nguồn chân lý cục bộ duy nhất |
| **Square** | Patent mô tả: máy offline không nhận được thay đổi của open ticket từ máy khác. Diễn đàn có nhiều phản ánh check làm lúc offline bị treo, phải void tay. API Orders dùng `idempotency_key` + `version` (optimistic concurrency) | Chống trùng + version, nhưng thực tế vẫn có lỗi phải xử lý tay |
| **Sapo FnB** (VN) | "Auto Offline": tự chuyển sang chế độ offline, khuyến nghị **mô hình mạng nội bộ** để máy order cầm tay vẫn gửi được về quầy. Tắt các tính năng cần internet (QR động, hoá đơn điện tử, đơn online, thêm khách vào đơn). Không công bố cách xử lý xung đột | Mạng nội bộ + giới hạn tính năng khi offline |
| **KiotViet FnB** | Có bán offline và tự đồng bộ khi có mạng lại. Chưa tìm thấy tài liệu về đồng bộ nhiều máy cho phòng/bàn | – |
| **HandyCafe / CafeTimer** (billiards, game) | Đồng hồ tính giờ chạy **trên một trạm cục bộ** (offline-first). Mỗi bàn có timer riêng, gộp chung bill đồ uống | Tiền giờ dùng **một đồng hồ duy nhất** |

**Rút ra cho ONI:**
1. Plan hiện tại (phiên + thao tác delta + chống trùng + version) **đi xa hơn** mức các hãng công bố: ONI gộp được món của hai máy offline/online, trong khi Toast/Square về cơ bản không gộp.
2. Bài học quan trọng nhất từ Toast / Lightspeed: **giới hạn quyền** khi offline thay vì cố gộp mọi thứ. Vì vậy plan bổ sung lease (2.5) và chính sách offline (2.6). Thêm món thì luôn cho; đóng / chuyển / gộp thì có điều kiện.
3. Tiền giờ phải theo **một đồng hồ** (HandyCafe: trạm cục bộ; ONI: server + bù lệch đồng hồ).
4. Hub LAN là bước tiến hoá về sau (Phase 6), không cần ngay.

Nguồn:
- [Toast – Offline mode](https://doc.toasttab.com/doc/platformguide/platformOfflineMode.html)
- [Toast – Offline mode with local sync](https://doc.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html)
- [Toast – Offline mode overview](https://doc.toasttab.com/doc/platformguide/adminOfflineModeOverview.html)
- [Lightspeed K – Offline POS functionality](https://k-series-support.lightspeedhq.com/hc/en-us/articles/53028167251867-Offline-POS-functionality)
- [Square patent US10147079B2](https://patents.google.com/patent/US10147079)
- [Square Community – Offline and Check Closing](https://community.squareup.com/t5/Orders-Menu-Items-Catalog/Offline-and-Check-Closing/td-p/614354)
- [Sapo – Auto Offline](https://www.sapo.vn/cap-nhat-tinh-nang/tinh-nang-auto-offline)
- [HandyCafe – Software for a billiards hall](https://handycafe.com/en/blog/software-for-a-billiards-hall)

---

## 7. Quyết định đã chốt

### 7.1 Ngưỡng chênh lệch tiền giờ khi đóng bàn offline
- **Chấp nhận số của client** khi thời lượng lệch ≤ **2 phút** và tiền lệch ≤ **2.000đ**. Trường hợp này chỉ ghi log. Có bù lệch đồng hồ thì sai số thực tế chỉ vài giây; 2 phút đủ phủ cả drift khi offline lâu.
- Lệch lớn hơn: giữ nguyên số tiền đã thu, đẩy vào Hộp xung đột kèm cả hai con số. Chủ shop xem log để biết nhân viên nào hay gặp lệch.
- Ngưỡng có thể chỉnh trong `shop_settings` (sau này).

### 7.2 Chính sách thao tác khi offline
| Thao tác | Máy đang giữ lease | Máy không giữ lease |
|---|---|---|
| Mở bàn | Cho phép (phiên tạm) | Cho phép (phiên tạm, có thể thành E10) |
| Thêm / bớt món | Cho phép | Cho phép (thao tác delta, không mất dữ liệu) |
| Đóng bàn, thu tiền | Cho phép, ghi "đóng tạm" | Cho phép **sau khi xác nhận cảnh báo** "Máy khác có thể đang phục vụ bàn này". Ghi "đóng tạm" |
| Chuyển / gộp bàn | Cho phép | **Chặn** |
| Huỷ phiên có món | Chặn khi offline | Chặn |

Lý do không chặn đóng bàn offline như Toast: ở VN, quán billiards / karaoke thu tiền mặt khi mất mạng là chuyện thường ngày. Chặn hẳn thì nhân viên sẽ ghi sổ tay rồi nhập sau, còn tệ hơn. Ghi "đóng tạm" kết hợp với E11/E12 đảm bảo không thất thu và không cộng trùng doanh thu.

### 7.3 Hai máy cùng mở một bàn (E10)
- **Không bao giờ tự động gộp hay huỷ.** Hai phiên cùng tồn tại, kèm badge xung đột.
- Gợi ý mặc định theo ngành (lấy từ `packages/core/src/verticals.ts`):
  - Nhà hàng / cafe: **gộp** (thường là cùng bàn khách, hai nhân viên cùng order).
  - Billiards, karaoke, sân, phòng theo giờ: **chuyển phiên đến sau sang bàn trống** (mỗi bàn chỉ có một đồng hồ tính giờ).
- Thu ngân bấm một nút để thực hiện gợi ý, hoặc chọn cách khác.

### 7.4 Connector Google Sheets
- Sync v2 (Phase 1+) **chỉ hỗ trợ Postgres/MySQL**, vì Sheets không có transaction hay compare-and-set nên không đảm bảo được lease và version.
- Shop dùng Sheets thuộc ngành có bàn vẫn nhận các bản vá Phase 0. UI hiện khuyến nghị "dùng một thiết bị cho sơ đồ bàn" và gợi ý chuyển sang gói dùng Postgres.

### 7.5 Múi giờ
Server đã chạy GMT+7. Thực hiện Phase 3 bản thu gọn (pin TZ, kiểm tra lúc khởi động, ghi `check_in` dạng ISO đầy đủ). Không migrate DB.

### 7.6 Còn cần anh/chị duyệt
- Các mục 🟠 ở Phase 0 (0.3, 0.4 trên `sync-batch`, đã gate theo `resource_id`).
- Thông báo cho shop về thay đổi số tiền tạm tính (0.9, 2.4) trước khi phát hành.

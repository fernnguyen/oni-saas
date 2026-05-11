# ONI Google Sheet Schema — v1

Google Sheet được dùng như một database khi user kết nối qua Service Account.
Mỗi tab = 1 entity. Hàng 1 = header. Hàng 2 trở đi = data.

---

## Quy tắc bất biến (không được vi phạm)

| # | Quy tắc |
|---|---------|
| 1 | **Oni đọc/ghi bằng tên header, không dùng index cột.** Thêm cột mới → append vào cuối tab → không phá data cũ. |
| 2 | **Không xóa / đổi tên header đã có.** Đổi tên = mất dữ liệu từ góc nhìn của Oni. |
| 3 | **Không sort dữ liệu thủ công trong sheet.** Oni dựa vào thứ tự row để update đúng dòng. |
| 4 | **ID do Oni generate.** Format đọc được: `P-001`, `C-001`, `ORD-2025-0001`. UUID không dùng trong sheet. |
| 5 | **Trường tính toán không lưu trong sheet.** `total_spent` của khách, `available_qty` của kho… Oni tính on-demand từ dữ liệu gốc. |
| 6 | **`Settings.schema_version`** phản ánh version schema. Khi Oni detect version cũ, nó tự append các cột còn thiếu. |

---

## Schema evolution — cách nâng cấp an toàn

Khi thêm tính năng mới cần thêm cột:
```
1. Append cột mới vào cuối tab tương ứng trong buildOniTemplateSheets()
2. Tăng ONI_SCHEMA_VERSION
3. Viết migration script: đọc header row của sheet thực → nếu thiếu cột thì batchUpdate append header
4. Data cũ ở các cột hiện có KHÔNG bị ảnh hưởng
```

---

## 1. Categories — Danh mục hàng hóa

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `category_id` | string | `CAT-001`, do Oni generate |
| `name` | string | Tên danh mục (vd: Áo thun, Đồ khô) |
| `parent_id` | string | `category_id` của danh mục cha, để trống nếu là root |
| `sort_order` | number | Thứ tự hiển thị |
| `active` | TRUE/FALSE | Đang sử dụng |

---

## 2. Suppliers — Nhà cung cấp

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `supplier_id` | string | `SUP-001` |
| `name` | string | Tên công ty / cá nhân |
| `phone` | string | |
| `email` | string | |
| `address` | string | |
| `payment_terms` | string | Điều khoản thanh toán (vd: "COD", "Net 30") |
| `note` | string | |

---

## 3. Products — Sản phẩm

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `product_id` | string | `P-001` |
| `sku` | string | Mã SKU duy nhất, do user đặt |
| `barcode` | string | Mã vạch, để trống nếu không có |
| `name` | string | Tên sản phẩm |
| `category_id` | string | Tham chiếu `Categories.category_id` |
| `unit` | string | Đơn vị tính (cái, kg, hộp, chai…) |
| `sell_price` | number | Giá bán lẻ mặc định (VND) |
| `cost_price` | number | Giá vốn — chỉ manager được xem |
| `min_price` | number | Giá sàn — nhân viên không được bán thấp hơn |
| `tax_rate` | number | % thuế GTGT riêng cho sản phẩm này (0 = dùng setting mặc định) |
| `weight` | number | Trọng lượng (gram), dùng cho tính phí ship |
| `stock_track` | TRUE/FALSE | Có theo dõi tồn kho không (service = FALSE) |
| `variant_id` | string | **Placeholder v1 — để trống.** Dùng khi nâng cấp tính năng biến thể (size/màu) |
| `active` | TRUE/FALSE | Đang bán |
| `image_url` | string | URL ảnh sản phẩm |
| `description` | string | Mô tả ngắn |

> **Về variant_id**: v1 mọi sản phẩm đều có `variant_id = ""`. Khi nâng cấp v2, tab `Variants` mới sẽ xuất hiện và `variant_id` được fill vào. Schema không thay đổi, data cũ không bị phá.

---

## 4. PriceLists — Bảng giá theo nhóm khách

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `price_id` | string | `PL-001` |
| `product_id` | string | |
| `sku` | string | Redundant với product_id nhưng giúp đọc sheet trực tiếp |
| `price_type` | string | `retail` / `wholesale` / `vip` / `staff` |
| `sell_price` | number | Giá áp dụng cho nhóm này |
| `effective_from` | date | YYYY-MM-DD, để trống = áp dụng ngay |
| `effective_to` | date | YYYY-MM-DD, để trống = không hết hạn |
| `active` | TRUE/FALSE | |

> Nếu cùng 1 SKU + price_type có nhiều dòng active, Oni lấy dòng có `effective_from` mới nhất.

---

## 5. Discounts — Khuyến mãi

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `discount_id` | string | `DC-001` |
| `name` | string | Tên chương trình (vd: "Giảm 10% tháng 6") |
| `type` | string | `percent` hoặc `fixed` (v1; `buy_x_get_y` dự kiến v2) |
| `value` | number | % nếu type=percent, số tiền nếu type=fixed |
| `min_qty` | number | Số lượng tối thiểu để áp dụng |
| `min_order_value` | number | Giá trị đơn tối thiểu để áp dụng |
| `applicable_type` | string | `all` / `sku` / `category` |
| `applicable_ref` | string | SKU hoặc `category_id` — để trống nếu `applicable_type = all` |
| `start_date` | date | YYYY-MM-DD |
| `end_date` | date | YYYY-MM-DD |
| `active` | TRUE/FALSE | |

---

## 6. Inventory — Tồn kho

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `inventory_id` | string | `INV-001` |
| `product_id` | string | |
| `sku` | string | |
| `variant_id` | string | Placeholder v1 — để trống |
| `branch_id` | string | |
| `stock_qty` | number | Số lượng hiện tại |
| `min_stock` | number | Ngưỡng cảnh báo hết hàng |
| `unit_cost` | number | Giá vốn trung bình tại thời điểm cập nhật |
| `last_received_at` | datetime | Lần nhập kho gần nhất |
| `last_updated` | datetime | ISO8601, Oni cập nhật sau mỗi giao dịch |

> `reserved_qty` và `available_qty` **không lưu** — tính on-demand từ StockMovements để tránh lệch số.

---

## 7. StockMovements — Nhập/Xuất kho (audit trail)

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `movement_id` | string | `SM-001` — ID nội bộ, do Oni generate |
| `movement_no` | string | Mã phiếu kho theo loại: `PN-001` / `PX-001` / `PTH-001` / `CKV-001` / `CKX-001` / `PDK-001` |
| `type` | string | `purchase_in` / `sale_out` / `transfer_in` / `transfer_out` / `adjustment` / `return_in` |
| `product_id` | string | |
| `sku` | string | |
| `variant_id` | string | Placeholder v1 |
| `qty` | number | Dương = vào kho, âm = ra kho |
| `unit_cost` | number | Giá vốn tại thời điểm giao dịch |
| `branch_id` | string | Chi nhánh thực hiện |
| `supplier_id` | string | Tham chiếu `Suppliers.supplier_id` (dùng khi type=purchase_in) |
| `reference_no` | string | Tham chiếu phiếu nguồn: `RET-007` (từ phiếu trả), `ORD-042` (từ đơn bán), `PN-001` (số phiếu nhập) |
| `employee_id` | string | Người thực hiện |
| `reason` | string | Lý do (đặc biệt dùng cho type=adjustment) |
| `created_at` | datetime | |

**Quy tắc `movement_no`:**

| `type` | Prefix | Ý nghĩa |
|--------|--------|---------|
| `purchase_in` | `PN` | Phiếu Nhập hàng từ NCC |
| `sale_out` | `PX` | Phiếu Xuất bán |
| `return_in` | `PTH` | Phiếu Trả Hàng về kho |
| `transfer_in` | `CKV` | Chuyển Kho Vào |
| `transfer_out` | `CKX` | Chuyển Kho Xuất |
| `adjustment` | `PDK` | Phiếu Điều Kho |

**Trace chain:** `StockMovements.reference_no` → `Returns.return_no` hoặc `Orders.order_no` — cho phép tra ngược từ biến động kho về phiếu/đơn gốc.

---

## 8. Customers — Khách hàng

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `customer_id` | string | `C-001` |
| `customer_code` | string | Mã ngắn do user đặt (vd: `KH001`) |
| `name` | string | |
| `phone` | string | |
| `email` | string | |
| `address` | string | |
| `birthday` | date | YYYY-MM-DD, dùng cho sinh nhật/khuyến mãi |
| `customer_type` | string | `retail` / `wholesale` / `vip` / `agency` |
| `credit_limit` | number | Hạn mức nợ tối đa được phép |
| `debt_amount` | number | Tổng công nợ hiện tại (Oni cập nhật sau mỗi đơn) |
| `loyalty_points` | number | Điểm tích lũy |
| `note` | string | |
| `created_at` | datetime | |

> `total_orders` và `total_spent` **không lưu** — tính từ bảng Orders khi cần báo cáo.

---

## 9. Orders — Đơn hàng

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `order_id` | string | `ORD-2025-0001` |
| `order_no` | string | Số đơn hiển thị cho user (có thể trùng với order_id) |
| `created_at` | datetime | |
| `status` | string | `draft` / `confirmed` / `processing` / `completed` / `cancelled` / `refunded` |
| `customer_id` | string | |
| `customer_name` | string | Snapshot tên khách tại thời điểm đặt |
| `branch_id` | string | |
| `employee_id` | string | Nhân viên tạo đơn |
| `channel` | string | `pos` / `online` / `phone` / `zalo` |
| `subtotal` | number | Tổng trước giảm giá và phí |
| `discount_amount` | number | Tổng giảm giá |
| `shipping_fee` | number | Phí giao hàng (0 nếu bán trực tiếp) |
| `tax_amount` | number | Thuế |
| `total_amount` | number | Tổng phải thanh toán |
| `paid_amount` | number | Đã trả |
| `debt_amount` | number | Còn nợ = total_amount - paid_amount |
| `is_return` | TRUE/FALSE | Đơn trả hàng |
| `original_order_id` | string | Trỏ về đơn gốc nếu `is_return = TRUE` |
| `points_earned` | number | Điểm tích lũy từ đơn này |
| `points_redeemed` | number | Điểm đã dùng để giảm giá |
| `note` | string | |
| `updated_at` | datetime | |

> **Đơn trả hàng**: tạo đơn mới với `is_return = TRUE`, `original_order_id` = đơn gốc. OrderItems của đơn trả có `qty` âm. StockMovements có entry `return_in`.

---

## 10. OrderItems — Chi tiết đơn hàng

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `item_id` | string | `ITEM-001` |
| `order_id` | string | |
| `order_no` | string | Redundant, giúp filter trực tiếp trên sheet |
| `line_no` | number | Thứ tự dòng trong đơn (1, 2, 3…) |
| `product_id` | string | |
| `sku` | string | |
| `variant_id` | string | Placeholder v1 |
| `product_name` | string | Snapshot tên sản phẩm tại thời điểm đặt |
| `qty` | number | Âm nếu là đơn trả |
| `unit_price` | number | Giá bán tại thời điểm đặt |
| `discount_pct` | number | % giảm giá trên dòng này |
| `line_discount` | number | Số tiền giảm (= qty × unit_price × discount_pct / 100) |
| `tax_rate` | number | % thuế của sản phẩm này |
| `tax_amount` | number | |
| `line_total` | number | = qty × unit_price - line_discount + tax_amount |
| `employee_id` | string | Nhân viên bán (dùng cho tính hoa hồng theo dòng) |

---

## 11. Payments — Thanh toán

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `payment_id` | string | `PAY-001` |
| `order_id` | string | |
| `order_no` | string | |
| `method` | string | `cash` / `card` / `bank_transfer` / `momo` / `vnpay` / `zalopay` / `debt` |
| `amount` | number | |
| `paid_at` | datetime | |
| `cashier_id` | string | Nhân viên nhận tiền |
| `reference_no` | string | Mã giao dịch ngân hàng / ví điện tử |
| `note` | string | |

> 1 đơn hàng có thể có **nhiều dòng payment** (split payment, trả nhiều đợt, mix cash + chuyển khoản).

---

## 12. Branches — Chi nhánh

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `branch_id` | string | `BR-001` |
| `name` | string | |
| `address` | string | |
| `phone` | string | |
| `manager_id` | string | `employee_id` của quản lý chi nhánh |
| `active` | TRUE/FALSE | |

---

## 13. Employees — Nhân viên

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `employee_id` | string | `EMP-001` |
| `employee_code` | string | Mã ngắn (vd: `NV001`) |
| `name` | string | |
| `phone` | string | |
| `role` | string | `owner` / `manager` / `sales` / `cashier` / `warehouse` |
| `branch_id` | string | |
| `commission_pct` | number | % hoa hồng trên doanh số (v2 sẽ thêm tab EmployeeCommissions cho hoa hồng theo danh mục) |
| `active` | TRUE/FALSE | |
| `hire_date` | date | YYYY-MM-DD |
| `note` | string | |

---

## 14. Settings — Cài đặt hệ thống

| key | Giá trị mặc định | Mô tả |
|-----|-----------------|-------|
| `schema_version` | `1` | **Không sửa** — Oni dùng để detect schema cũ |
| `shop_name` | _(trống)_ | Tên cửa hàng |
| `currency` | `VND` | Đơn vị tiền tệ |
| `tax_rate` | `0` | Thuế GTGT mặc định (%) |
| `invoice_prefix` | `ORD` | Tiền tố số đơn → `ORD-2025-0001` |
| `low_stock_threshold` | `5` | Cảnh báo khi tồn kho < giá trị này |
| `allow_negative_stock` | `false` | Cho phép bán khi hết hàng |
| `default_price_type` | `retail` | Loại giá mặc định khi tạo đơn |

---

## 14. Returns — Phiếu trả hàng

| Cột             | Kiểu     | Mô tả                                                        |
|-----------------|----------|--------------------------------------------------------------|
| `return_id`     | string   | `RET-001`, do Oni generate                                   |
| `return_no`     | string   | Số phiếu hiển thị                                            |
| `order_id`      | string   | **Bắt buộc** — tham chiếu `Orders.order_id`                  |
| `order_no`      | string   | Số đơn hàng gốc (snapshot)                                   |
| `customer_id`   | string   | Tham chiếu `Customers.customer_id`                           |
| `customer_name` | string   | Snapshot tên khách                                           |
| `reason`        | string   | `defective / damaged / wrong_item / changed_mind / other`    |
| `status`        | string   | `pending / approved / processed / rejected`                  |
| `total_refund`  | number   | Tổng tiền hoàn lại                                           |
| `refund_method` | string   | `cash / bank_transfer / store_credit / none`                 |
| `processed_by`  | string   | `employee_id` người xử lý                                   |
| `processed_at`  | datetime |                                                              |
| `note`          | string   |                                                              |
| `created_at`    | datetime |                                                              |

---

## 15. ReturnItems — Chi tiết phiếu trả

| Cột             | Kiểu    | Mô tả                                                          |
|-----------------|---------|----------------------------------------------------------------|
| `item_id`       | string  | `RI-001`                                                       |
| `return_id`     | string  | **Bắt buộc** — tham chiếu `Returns.return_id`                  |
| `return_no`     | string  | Số phiếu (snapshot)                                            |
| `order_item_id` | string  | Tham chiếu `OrderItems.item_id` (nếu có)                       |
| `product_id`    | string  | **Bắt buộc**                                                   |
| `product_name`  | string  | Snapshot tên sản phẩm                                          |
| `sku`           | string  |                                                                |
| `qty_returned`  | number  | Số lượng trả về                                                |
| `unit_price`    | number  | Đơn giá (lấy từ đơn gốc)                                      |
| `line_total`    | number  | = qty_returned × unit_price                                    |

> **Luồng kho**: khi phiếu chuyển sang `processed`, hệ thống tự tạo `StockMovements` type=`return_in` cho mỗi dòng ReturnItems và tăng `Inventory.stock_qty` tương ứng.

---

## Settings — Cài đặt hệ thống

| key | Giá trị mặc định | Mô tả |
|-----|-----------------|-------|
| `schema_version` | `1` | **Không sửa** — Oni dùng để detect schema cũ |
| `shop_name` | _(trống)_ | Tên cửa hàng |
| `currency` | `VND` | Đơn vị tiền tệ |
| `tax_rate` | `0` | Thuế GTGT mặc định (%) |
| `invoice_prefix` | `ORD` | Tiền tố số đơn → `ORD-2025-0001` |
| `low_stock_threshold` | `5` | Cảnh báo khi tồn kho < giá trị này |
| `allow_negative_stock` | `false` | Cho phép bán khi hết hàng |
| `default_price_type` | `retail` | Loại giá mặc định khi tạo đơn |

---

## Roadmap nâng cấp schema (v2+)

| Tính năng | Thay đổi schema |
|-----------|----------------|
| Biến thể sản phẩm (size/màu) | Thêm tab `Variants`; fill `variant_id` vào Products/Inventory/OrderItems |
| Hoa hồng theo danh mục | Thêm tab `EmployeeCommissions (employee_id, category_id, commission_pct)` |
| Đơn nhập hàng có cấu trúc | Thêm tab `PurchaseOrders` + `PurchaseOrderItems`; StockMovements vẫn giữ |
| Giao hàng | Thêm cột `shipping_address`, `tracking_no`, `delivery_date` vào cuối Orders |
| Khuyến mãi mua X tặng Y | Thêm cột `get_sku`, `get_qty` vào cuối Discounts; thêm giá trị `buy_x_get_y` cho `type` |

Mọi nâng cấp đều là **append-only** — data cũ không bị ảnh hưởng.

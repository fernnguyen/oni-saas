# Quy trình Trả hàng & Kho (Returns & Inventory Flow)

## 1. Tổng quan nghiệp vụ

Phiếu trả hàng ghi nhận việc khách hàng hoàn trả sản phẩm. Khi phiếu được **xử lý (processed)**, hệ thống tự động tạo phiếu nhập kho (`stock-movement` type=`return_in`) và cập nhật tồn kho tương ứng.

```
Đơn hàng hoàn thành
       │
       ▼
[Tạo phiếu trả] ──► status: pending
       │
       ▼
[Thêm sản phẩm trả] (return-items)
       │
       ▼
[Duyệt] ─────────► status: approved
  hoặc             hoặc
[Từ chối] ────────► status: rejected (kết thúc)
       │
       ▼
[Xử lý & nhập kho] ──► status: processed
       │
       ├─► Tạo stock-movement (type=return_in) mỗi sản phẩm
       └─► Cập nhật inventory.stock_qty += qty_returned
```

## 2. Trạng thái phiếu trả hàng

| Trạng thái  | Mô tả                                          | Hành động tiếp theo                    |
|-------------|------------------------------------------------|----------------------------------------|
| `pending`   | Phiếu mới tạo, chờ duyệt                       | Duyệt / Từ chối / Xử lý thẳng         |
| `approved`  | Đã duyệt, chưa nhập kho                         | Xử lý & nhập kho                       |
| `rejected`  | Từ chối, không xử lý                            | Không làm gì thêm (chỉ xóa nếu cần)   |
| `processed` | Đã nhập kho, kho đã cập nhật                    | Không thể xóa, tạo điều chỉnh nếu sai  |

**Lưu ý:** Không cho phép xóa phiếu `processed`. Nếu nhập nhầm, tạo stock-movement `adjustment` để sửa tồn kho.

## 3. Data model

### `returns` (tab: Returns)

| Field           | Type     | Mô tả                                          |
|-----------------|----------|------------------------------------------------|
| `return_id`     | string   | ID tự động (prefix `RET-`)                     |
| `return_no`     | string   | Số phiếu hiển thị (= return_id nếu rỗng)       |
| `order_id`      | string   | **Bắt buộc** — ID đơn hàng gốc                 |
| `order_no`      | string   | Số đơn hàng gốc (hiển thị)                     |
| `customer_id`   | string   | ID khách hàng                                  |
| `customer_name` | string   | Tên khách hàng                                 |
| `reason`        | enum     | `defective / damaged / wrong_item / changed_mind / other` |
| `status`        | enum     | `pending / approved / processed / rejected`    |
| `total_refund`  | decimal  | Tổng tiền hoàn lại                             |
| `refund_method` | enum     | `cash / bank_transfer / store_credit / none`   |
| `processed_by`  | string   | Employee ID người xử lý                        |
| `processed_at`  | datetime | Thời điểm xử lý                                |
| `note`          | string   | Ghi chú                                        |

### `return-items` (tab: ReturnItems)

| Field           | Type     | Mô tả                                          |
|-----------------|----------|------------------------------------------------|
| `item_id`       | string   | ID tự động (prefix `RI-`)                      |
| `return_id`     | string   | **Bắt buộc** — liên kết với phiếu trả          |
| `return_no`     | string   | Số phiếu (để tra cứu nhanh)                    |
| `order_item_id` | string   | ID dòng sản phẩm trong đơn gốc (nếu có)        |
| `product_id`    | string   | **Bắt buộc** — ID sản phẩm                     |
| `product_name`  | string   | Tên sản phẩm                                   |
| `sku`           | string   | Mã SKU                                         |
| `qty_returned`  | decimal  | **Bắt buộc** — số lượng trả                    |
| `unit_price`    | decimal  | Đơn giá (lấy từ đơn hàng gốc)                 |
| `line_total`    | decimal  | = qty_returned × unit_price                    |

## 4. Side-effects khi xử lý phiếu trả

Endpoint: `POST /api/shops/[shopId]/returns/[id]/process`

Chuỗi thao tác (tất cả thực hiện qua connector, không phụ thuộc loại data source):

```
1. Kiểm tra phiếu tồn tại và chưa processed/rejected
2. Lấy toàn bộ return-items (limit 200)
3. Với mỗi item:
   a. Tạo stock-movement:
      - type: 'return_in'
      - product_id: item.product_id
      - qty: item.qty_returned
      - unit_cost: item.unit_price
      - reference_no: return_no hoặc return_id
      - reason: 'Trả hàng: <return_no>'
   b. Tìm inventory row (fallback 3 bước: branch_id → '' → không lọc)
   c. Nếu tìm thấy: stock_qty += qty_returned
      Nếu không: tạo inventory row mới (stock_qty = qty_returned)
4. Cập nhật phiếu trả: status='processed', processed_at=now
5. Invalidate caches: returns, stock-movements, inventory
```

## 5. Connector-agnostic design

Toàn bộ logic trả hàng và nhập kho hoạt động qua interface `IDataConnector`:

```typescript
interface IDataConnector {
  list(entity, options): Promise<ListResult>
  findById(entity, id): Promise<Row | null>
  create(entity, data): Promise<Row>
  update(entity, id, data): Promise<Row>
  delete(entity, id): Promise<void>
}
```

Để hỗ trợ connector mới (ví dụ: Supabase native, WooCommerce):
1. Implement `IDataConnector`
2. Thêm `returns` và `return-items` vào mapping của connector đó
3. Logic nghiệp vụ trong API routes **không cần thay đổi**

## 6. Google Sheets — cấu trúc tab

### Tab: Returns
```
return_id | return_no | order_id | order_no | customer_id | customer_name |
reason | status | total_refund | refund_method | processed_by | processed_at | note | created_at
```

### Tab: ReturnItems
```
item_id | return_id | return_no | order_item_id | product_id | product_name |
sku | qty_returned | unit_price | line_total
```

## 7. Phân quyền

| Permission        | Role               | Mô tả                               |
|-------------------|--------------------|--------------------------------------|
| `returns.view`    | owner, admin, staff, viewer | Xem danh sách phiếu trả      |
| `returns.create`  | owner, admin, staff         | Tạo phiếu trả, thêm sản phẩm|
| `returns.approve` | owner, admin                | Duyệt / Xử lý / Từ chối     |

## 8. Tác động đến báo cáo

- **Báo cáo tổng quan**: phiếu trả được hiển thị trong KPI "Trả hàng" và tỷ lệ hoàn tiền
- **Báo cáo kế toán**: `total_refund` trừ vào doanh thu thuần theo tháng
- **Tồn kho**: mỗi sản phẩm trả tăng `stock_qty` trong tab Inventory
- **StockMovements**: lưu lịch sử nhập kho từ trả hàng với type=`return_in`

## 9. Lưu ý vận hành

- **Không xóa phiếu đã processed**: kho đã được cập nhật. Nếu sai, dùng stock-movement `adjustment`.
- **total_refund** không tự tính từ return-items — phải nhập tay hoặc tính trước khi tạo phiếu.
  (Lý do: linh hoạt cho trường hợp hoàn một phần, phí vận chuyển, v.v.)
- **order_id bắt buộc** nhưng hệ thống không kiểm tra đơn có tồn tại không (để tránh strict coupling giữa các connector). Nhân viên cần nhập đúng.

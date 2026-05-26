# HƯỚNG DẪN P2P - BƯỚC 3: QUY TRÌNH PHÊ DUYỆT ĐỀ XUẤT 2 CẤP (PR APPROVAL)

Quy trình phê duyệt 2 cấp là chốt chặn tài chính quan trọng của doanh nghiệp giúp kiểm soát ngân sách hoạt động của từng chi nhánh, tránh tình trạng mua sắm lãng phí hoặc sai lệch đơn giá mua từ bộ phận mua sắm.

Mỗi phiếu đề xuất PR sau khi điền giá mua bắt buộc phải đi qua 2 trạm kiểm soát nghiêm ngặt.

---

## 1. HƯỚNG DẪN DÀNH CHO KẾ TOÁN TRƯỞNG (PHÊ DUYỆT CẤP 1)
Kế toán trưởng chịu trách nhiệm kiểm soát dòng tiền và ngân sách chi tiêu của chi nhánh:
1.  Truy cập menu **[Mua sắm]** -> Chọn **[Đề xuất mua hàng (PR)]**.
2.  Lọc danh sách phiếu đang ở trạng thái **[Chờ Kế toán duyệt (Pending KTT)]**.
3.  Click mở chi tiết phiếu để đối soát:
    *   Kiểm tra tổng số tiền dự kiến có nằm trong hạn mức chi tiêu của chi nhánh tháng này không.
    *   Đối chiếu đơn giá mua dự kiến của nhà cung cấp xem có bị cao hơn giá vốn thị trường không.
4.  **Hành động quyết định:**
    *   Bấm **[Phê duyệt cấp 1]**: Để ký duyệt tài chính. Trạng thái phiếu tự động chuyển sang **[Chờ BGĐ duyệt (Pending BGĐ)]**.
    *   Bấm **[Từ chối / Trả lại]**: Điền lý do từ chối (ví dụ: *"Tổng chi phí vượt quá ngân sách chi nhánh tháng 5, yêu cầu giảm số lượng hoặc thương thảo lại giá"*). Phiếu sẽ bị trả về cho bộ phận lập đề xuất sửa đổi.
5.  `[HÌNH ẢNH: Nút bấm chức năng "Phê duyệt cấp 1" và nút "Từ chối" hiển thị nổi bật trên màn hình của Kế toán trưởng]`

---

## 2. HƯỚNG DẪN DÀNH CHO BAN GIÁM ĐỐC / CHỦ DOANH NGHIỆP (PHÊ DUYỆT CẤP 2)
Ban Giám Đốc (BGĐ) hoặc Owner giữ vai trò phê duyệt kế hoạch hoạt động tối cao trước khi thực tế đặt hàng:
1.  Truy cập danh sách PR, lọc các phiếu đang ở trạng thái **[Chờ BGĐ duyệt (Pending BGĐ)]** (đây là các phiếu đã được Kế toán trưởng thông qua tài chính).
2.  Mở chi tiết phiếu PR, kiểm tra nhanh lý do mua sắm và xác nhận lại nhu cầu hoạt động thực tế.
3.  **Hành động quyết định:**
    *   Bấm **[Phê duyệt tối cao (Approve)]**: Để ký duyệt chính thức cho phép đặt mua hàng. Trạng thái phiếu chuyển sang **[Đã duyệt (Approved)]**.
    *   Bấm **[Từ chối / Reject]**: Để hủy bỏ hoàn toàn đề xuất mua sắm này nếu thấy chưa thực sự cần thiết hoạt động trong thời điểm hiện tại.
4.  `[HÌNH ẢNH: Nút bấm "Phê duyệt tối cao (Approve)" màu xanh lá hiển thị trên giao diện của Giám đốc chi nhánh]`

---

## 3. CÁC TÌNH HUỐNG LỖI THƯỜNG GẶP & CÁCH XỬ LÝ (FAILED CASES)

### Tình huống: Kế toán trưởng không thấy nút Duyệt hiển thị trên màn hình chi tiết phiếu
*   **Hiện tượng:** Phiếu PR đang báo trạng thái chờ kế toán duyệt nhưng khi Kế toán trưởng mở ra thì không thấy các nút chức năng Duyệt hay Từ chối đâu cả.
*   **Nguyên nhân:** Có 2 nguyên nhân thường gặp:
    1.  Tài khoản đăng nhập của Kế toán trưởng đang bị gán sai vai trò thành *Staff* (nhân viên) ở cấp chi nhánh, dẫn đến hệ thống áp dụng cơ chế khóa trực quan ẩn nút bấm bảo mật.
    2.  Phiếu PR thực chất đang ở trạng thái nháp *Draft* hoặc đang ở khâu điền giá *Pending Pricing* (chưa thực sự gửi duyệt tài chính).
*   **Cách xử lý:** 
    1.  Kiểm tra xem trạng thái của phiếu ở góc trên cùng hiển thị chính xác là chữ gì. Nếu là *Draft*, yêu cầu bộ phận mua hàng bấm *Gửi duyệt* trước.
    2.  Yêu cầu Quản trị viên hệ thống vào menu Thành viên rà soát lại vai trò tài khoản của bạn, đảm bảo được phân quyền chính xác là **[Kế toán trưởng (chief_accountant)]** hoặc có quyền `purchasing.manage`.
    3.  Bấm tải lại trang, các nút phê duyệt bảo mật sẽ xuất hiện đầy đủ.

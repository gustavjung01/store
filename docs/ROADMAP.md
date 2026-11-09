# STORE — ROADMAP

## P0 — Khởi tạo và quyết định nền tảng
- [x] Có commit đầu tiên và `main` hoạt động.
- [x] Đưa AGENTS/Project Instructions/spec vào repo.
- [ ] Nhận một Excel tồn **mẫu đã ẩn số liệu nhạy cảm** để xác minh cột và kiểu mã.
- [ ] Chốt stack, database riêng, hosting, phương án đăng nhập và chi phí.
- [ ] Chốt trường sản phẩm sẵn có: chỉ mã CTY/tồn hay còn tên/đơn vị tính/SKU.

**Nghiệm thu:** Có mô hình dữ liệu, mô tả luồng nhập và màn hình chính được duyệt; không dùng mã/hàng bịa.

## P1 — MVP tra cứu
- [ ] Đăng nhập / phân quyền viewer, admin.
- [ ] Danh mục mã CTY + tồn gần nhất + dấu thời gian nhập.
- [ ] Tìm chính xác mã CTY, tìm gần đúng theo SKU/tên khi có dữ liệu.
- [ ] Responsive điện thoại (360/390px) và desktop; trạng thái chưa có dữ liệu / lỗi rõ ràng.
- [ ] Test quyền truy cập và tra cứu mã có số 0 đầu.

**Nghiệm thu:** Từ điện thoại, nhập mã và thấy kết quả đúng, ngày cập nhật rõ ràng; không rò rỉ dữ liệu cho người chưa được cấp quyền.

## P2 — Import Excel đáng tin cậy
- [ ] Upload `.xlsx`, chọn sheet, mapping hai cột bắt buộc.
- [ ] Preview số dòng đúng/lỗi/mới/trùng và chênh lệch trước/sau.
- [ ] Xác nhận rồi mới ghi DB transaction; nhập 0 hợp lệ, không tự zero mã vắng trong file.
- [ ] Lưu batch, nhật ký và phục hồi bản tồn trước theo batch.
- [ ] Thông báo rõ số mã thêm/sửa/lỗi; test dữ liệu xấu.

**Nghiệm thu:** File hợp lệ cập nhật đúng; file lỗi không làm tồn bị cập nhật một phần; hoàn tác hoạt động.

## P3 — Vận hành và tối ưu
- [ ] Kiểm thử trên điện thoại thật, mạng yếu, bảng hàng lớn.
- [ ] Lọc hết hàng, mã mới, thời điểm cập nhật; sao chép mã nhanh.
- [ ] Xuất báo cáo kiểm tra tồn nếu cần.
- [ ] Backup, monitoring, quyền, tài liệu vận hành.
- [ ] Chỉ deploy production sau khi Owner duyệt.

**Ngoài MVP:** bán hàng, trừ tồn theo đơn, đồng bộ ERP, đa kho, barcode, quét mã, đặt hàng, giá bán; chỉ làm khi có yêu cầu cụ thể.

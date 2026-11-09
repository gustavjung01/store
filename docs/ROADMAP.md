# STORE — ROADMAP

## P0 — Khởi tạo, cấu hình và quyết định nền tảng
- [x] Có commit đầu tiên và `main` hoạt động.
- [x] Đưa AGENTS/Project Instructions/spec vào repo.
- [x] Owner chọn **PWA**, **Neon PostgreSQL riêng**, **IndexedDB** cho tra cứu nhanh.
- [x] Owner chọn **nhiều loại giá**, hiển thị **một giá mặc định**, có mục **Xem tất cả giá**.
- [x] Đã tạo Vercel project STORE trong workspace `gustavjung01`, không Git Integration.
- [ ] Merge/review workflow triển khai bằng comment PR (#1), cấu hình GitHub Environment và `VERCEL_TOKEN`; test preview.
- [ ] Review/merge PWA frontend scaffold; test trên GitHub CI và thiết bị thật.
- [ ] Nhận Excel danh mục và Excel tồn mẫu đã ẩn số liệu nhạy cảm để xác minh mapping, kiểu mã và tên các loại giá.
- [ ] Chốt Neon Auth/backend, schema, chính sách cache offline, quyền read-only ảnh R2 và chi phí.

**Nghiệm thu:** Mô hình dữ liệu, luồng import và màn hình chính được duyệt; không dùng mã/hàng bịa; chưa auto-deploy.

## P1 — MVP tra cứu giá và tồn
- [ ] Đăng nhập / phân quyền viewer, admin; API bảo mật nguồn Neon.
- [ ] Danh mục mã CTY + SKU/tên/ĐVT nếu Excel có dữ liệu.
- [ ] Mỗi mã có nhiều giá; admin chọn một loại giá mặc định, nhân viên mở xem tất cả giá.
- [ ] Tồn kho gần nhất + dấu thời gian riêng; `0` khác `NULL`.
- [ ] Tra mã chính xác nhanh bằng IndexedDB sau login; gợi ý SKU/tên; đồng bộ incremental hoặc snapshot được version.
- [ ] Xóa dữ liệu cache trên logout, hiển thị cảnh báo khi offline/cache cũ.
- [ ] Mobile 360/390px, desktop, dữ liệu trống, mạng yếu, bảo mật.
- [ ] Ảnh sản phẩm từ R2 theo mapping read-only được Owner cho phép.

**Nghiệm thu:** Người dùng có quyền nhập mã và thấy giá mặc định + tồn đúng nguồn; xem được giá khác; không rò rỉ dữ liệu.

## P2 — Import Excel đáng tin cậy
- [ ] Admin tải `.xlsx` danh mục + mapping các cột giá, đơn vị, tên, SKU.
- [ ] Admin tải `.xlsx` tồn chỉ cần mã CTY + số tồn.
- [ ] Chọn sheet/dòng header/mapping, xem preview mã mới/trùng/lỗi và giá/tồn cũ → mới.
- [ ] Xác nhận mới ghi transaction; không tự zero mã vắng file, không tự xóa giá cũ khi ô trống.
- [ ] Audit batch, quyền admin, rollback an toàn; kiểm thử dữ liệu lỗi.

**Nghiệm thu:** Import danh mục/giá không đổi tồn; import tồn không sửa giá; file lỗi không ghi dở; rollback hoạt động.

## P3 — Vận hành và tối ưu
- [ ] Đo tốc độ IndexedDB và đồng bộ trên điện thoại thật.
- [ ] Lọc hết hàng, mã mới, sao chép mã, trạng thái sync rõ.
- [ ] Backup, monitoring, kiểm toán quyền và tài liệu vận hành.
- [ ] Chỉ deploy production sau khi Owner duyệt rõ ràng.

**Ngoài MVP:** bán hàng/trừ tồn theo đơn, ERP, đa kho, barcode, đặt hàng, kế toán, xuất hóa đơn.

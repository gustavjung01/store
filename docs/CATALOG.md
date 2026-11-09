# STORE — Danh mục sản phẩm chuẩn

## Tạo từng sản phẩm

Admin đăng nhập STORE, vào **Danh mục**, bấm **Tạo sản phẩm**. Nhập mã CTY chính xác và tên hàng đầy đủ. SKU, đơn vị tính, nhóm hàng tùy chọn. Sau khi lưu, API kiểm quyền Admin, khóa version catalogue trong transaction, ghi sản phẩm và nhật ký rồi PWA đồng bộ lại.

- Mã CTY được xử lý là **text**, kể cả `000001`.
- Không sửa mã CTY của sản phẩm đã có để giữ quan hệ giá, tồn, lịch sử import.
- Đã tồn tại mã sẽ được cảnh báo, không tự tạo mã trùng.
- Sửa tên, SKU, đơn vị tính, nhóm hàng **không làm thay đổi số tồn hoặc giá**.
- Không tự đặt giá, tồn hoặc thông tin hàng hóa chưa được Owner cung cấp.
- Tồn `0` khác `NULL`; thời điểm tồn là thời gian nhập Excel.

## Hai tình huống nhập Excel

| Tình huống | Hành vi |
|---|---|
| Excel danh mục: mã mới + tên rõ ràng | Cho xem trước và xác nhận tạo sản phẩm |
| Excel danh mục: mã mới không tên | Chặn; yêu cầu cung cấp tên |
| Excel danh mục: mã cũ đã có tên, ô tên trống | Giữ tên cũ; có thể cập nhật giá |
| Excel tồn: chỉ mã CTY + số lượng | Cho tạo mã tạm, số tồn có thời điểm nhập; phải bổ sung tên sau |
| Admin sửa sản phẩm đang có tồn | Giữ nguyên số tồn, giá và mã CTY |
| Rollback Excel sau khi admin sửa tên | Chặn để không ghi đè lại thông tin vừa chỉnh sửa |

## API + kiểm thử

- `POST /admin/catalog/products`: tạo mới.
- `PATCH /admin/catalog/products`: sửa thông tin với mã CTY không đổi.
- `GET /admin/catalog/edits`: 20 thay đổi thủ công gần nhất.
- Các endpoint đều yêu cầu JWT Neon hợp lệ + `app_members.role='admin'`.
- Body ghi chứa `expectedVersion` từ snapshot đã đồng bộ; xung đột thì trả **409**, phải tải lại danh mục.
- `db/migrations/0003_catalog_edit_audit.sql`: bảng `catalog_edits` và cột `import_batches.applied_version`.
- PostgreSQL integration CI kiểm tra: tạo và sửa có audit, mã trùng bị chặn, version cũ bị chặn, giữ tồn, import thiếu tên bị chặn và rollback Excel sau chỉnh sửa bị chặn.

## Đưa lên vận hành

Phải kiểm thử tài khoản Admin và Excel công ty thật trước khi nhập dữ liệu. Chỉ áp migration trên Neon dev trong quá trình phát triển. Không áp Neon main hoặc deploy production Vercel nếu Owner chưa yêu cầu rõ.

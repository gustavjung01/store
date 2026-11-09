# STORE — Quy tắc ĐVT và quy cách bán sỉ (09/11/2026)

## Nguyên tắc nghiệp vụ

- **Thùng** là lựa chọn được điền sẵn khi **Admin tạo sản phẩm mới**, không phải giá trị tự gán cho toàn bộ danh mục.
- Khi **import danh mục Excel**, Admin có thể chọn ĐVT mặc định cho **mã mới** (đề xuất Thùng). Cột ĐVT đã mapping và có dữ liệu sẽ ưu tiên. Mã cũ không bị tự đổi ĐVT khi cột không chọn/ô trống.
- Khi **import tồn** (chỉ mã CTY + số tồn), số lượng được giữ **nguyên số** theo ĐVT của từng mã. Mã mới từ import tồn không có ĐVT sẽ để NULL chờ Admin xác minh; **không tự hiểu là Thùng**.
- Thay ĐVT không bao giờ tự chuyển số tồn hay giá. Với sản phẩm đang có tồn, UI cảnh báo và yêu cầu xác nhận đã đối chiếu nguồn thực tế.
- Tồn Excel là **snapshot theo lần nhập**, không realtime. Giá và tồn là hai dữ liệu độc lập; không quy đoán giá bán theo thùng từ ĐVT tồn nếu chính sách giá chưa xác nhận.

## Quy cách cấu trúc

Migration phát triển `db/migrations/0004_product_packaging.sql` thêm `products.product_spec JSONB NOT NULL DEFAULT '{}'`.

| Trường | Ý nghĩa |
| --- | --- |
| `pieceUnit` | ĐVT sản phẩm lẻ: quyển, cái, bộ… |
| `unitsPerCarton` | Số sản phẩm lẻ trong một thùng, nếu đã xác minh |
| `packUnit` | Tên đơn vị đóng gói: lốc, hộp… |
| `unitsPerPack` | Số sản phẩm lẻ trong lốc/hộp |
| `packsPerCarton` | Số lốc/hộp trong một thùng |
| `paperSize`, `pages`, `ruling`, `gsm`, `coverType` | Thuộc tính hàng hóa |
| `packagingNote` | Ghi chú xác minh quy cách |

Mọi thông số tùy chọn đều phải từ nguồn thực tế, không lấy từ ví dụ/mockup. Số lượng phải nguyên dương. Nếu khai đủ ba trường `unitsPerPack`, `packsPerCarton`, `unitsPerCarton` thì phải nhất quán (`SP/lốc × lốc/thùng = SP/thùng`).

Nếu `unitsPerCarton` chưa có nhưng đã có cả `unitsPerPack` và `packsPerCarton` hợp lệ, UI được **tính toán để hiển thị** số SP/thùng, không tự điền giá trị đó vào DB. Khi chưa có `pieceUnit` hoặc quy cách hợp lệ, không tính số sản phẩm tương đương.

## Hiển thị tra cứu

- ĐVT tồn `Thùng`: nếu có đơn vị lẻ và số SP/thùng, `n` thùng ⇒ `n × SP/thùng` SP lẻ, chỉ khi kết quả nằm trong số nguyên an toàn.
- ĐVT tồn trùng `pieceUnit`: có thể chia `n` SP lẻ ra số thùng nguyên + SP lẻ.
- ĐVT khác (ví dụ Hộp) mà không có quy tắc quy đổi chính xác: chỉ hiển thị quy cách, **không** tự quy đổi tồn.
- `NULL` tồn = chưa cập nhật, khác `0` = hết hàng. Không đưa số liệu từ mockup vào sản phẩm thật.

## Excel: preview → xác nhận → audit → hoàn tác

1. Admin chọn file/sheet và mapping mã CTY, trường tên/ĐVT/giá và những cột quy cách có thật trong file.
2. Cột không mapping hoặc ô quy cách trống không ghi đè thuộc tính cũ. Trường quy cách đã chọn phải đúng kiểu, nguyên dương khi là số.
3. Backend kết hợp dữ liệu cũ và phần cập nhật để kiểm mâu thuẫn. Preview hiển thị ĐVT và số SP/thùng trước/sau; cảnh báo mã chưa có ĐVT và mã có tồn đang đổi ĐVT.
4. Confirm khóa version/transaction, ghi cả import rows và snapshot sản phẩm trước thay đổi. Rollback batch gần nhất khôi phục `product_spec`, ĐVT và dữ liệu liên quan; vẫn bảo vệ chỉnh sửa tay sau import.
5. Mã công ty luôn là text, không mất 0 đầu; mã thiếu trong Excel tồn không tự về 0.

## Release gate

- PR CI chạy TypeScript, unit tests, build, function bundle và PostgreSQL integration (DB cô lập, **không** Neon production).
- Chỉ sau review mới áp migration lên **Neon dev** và triển khai function dev tương ứng rồi UAT bằng file Excel công ty thực.
- **Không deploy production hoặc chạy migration Neon main** trước khi Owner cho phép rõ. Deploy riêng frontend trước khi backend/schema hỗ trợ spec sẽ gây lỗi tra cứu, cần phối hợp migration/backend/frontend.

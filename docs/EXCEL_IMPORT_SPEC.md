# STORE — ĐẶC TẢ NHẬP EXCEL TỒN KHO

## 1. Đầu vào

File `.xlsx` (nhiều sheet nếu cần); mặc định người nhập chọn sheet và ánh xạ 2 cột:

| Trường hệ thống | Cột Excel thường gặp | Bắt buộc |
|---|---|---|
| `company_code` | Mã CTY / Mã công ty / Mã hàng | Có |
| `quantity` | Tồn / SL tồn / Số lượng tồn | Có |

Có thể có thêm tên, SKU, đơn vị tính; không tự giả định chúng tồn tại. Tên cột thực tế chờ file mẫu từ Owner.

## 2. Ví dụ minh họa — không phải số liệu công ty

| Mã CTY | Số tồn |
|---|---:|
| DEMO-001 | 25 |
| 000123 | 0 |
| DEMO-002 | 8 |

Mã `000123` phải được lưu dạng chuỗi giữ đủ số 0 đầu. Nếu Excel đã lưu thành số 123, ứng dụng phải cảnh báo khả năng mất số 0, không tự tái tạo mã.

## 3. Chuẩn hóa và xác thực

- Bỏ khoảng trắng đầu/cuối mã; loại ký tự khoảng trắng vô hình thông dụng; so sánh mã theo quy chuẩn thống nhất nhưng vẫn lưu bản gốc dùng để hiển thị.
- Trùng mã sau chuẩn hóa: cảnh báo và **chặn xác nhận** cho đến khi được xử lý; không tự cộng số lượng.
- Quantity: số nguyên >= 0; số âm, text không hợp lệ, ô trống = lỗi; zero = hợp lệ.
- Mã mới: xuất hiện trong preview dưới nhãn `Tạo mã mới`; chỉ thêm khi admin xác nhận.
- Dòng không có mã CTY: bỏ qua nếu hoàn toàn trống; nếu có số tồn mà thiếu mã thì báo lỗi.
- Không dựa vào tên sản phẩm để suy đoán mã CTY.

## 4. Chế độ cập nhật

- **Update rows (mặc định):** chỉ mã xuất hiện trong file được cập nhật. Các mã không có trong file giữ nguyên tồn trước đó.
- **Full snapshot (chọn riêng):** chỉ sau khi Owner phê duyệt, cho phép xử lý mã vắng file theo quy tắc rõ ràng; bắt buộc cảnh báo trước khi đưa về 0.
- Mỗi lượt cập nhật phải có preview theo mã: `tồn cũ → tồn mới`, số mã mới, số mã thay đổi, số lỗi và tên file.
- Ghi atomically trong transaction; lưu nhật ký batch và biến động số tồn để rollback.

## 5. Các bài test phải có

1. Mã có số 0 đầu không bị đổi.
2. `0` hiển thị hết hàng, không bị coi là ô trống.
3. Lỗi số âm, thập phân, text, ô trắng có thông báo cụ thể.
4. Mã trùng bị nhận diện sau chuẩn hóa.
5. Mã thiếu khỏi file không tự về 0.
6. Preview không làm thay đổi dữ liệu thật.
7. DB lỗi ở giữa import không gây cập nhật nửa chừng.
8. Rollback phục hồi được số tồn cũ, có audit người thao tác.
9. Chỉ admin có thể thực hiện import và rollback.

## 6. Triển khai kỹ thuật

Backend và giao diện cho tồn kho và danh mục/nhiều loại giá: [IMPORT_IMPLEMENTATION.md](IMPORT_IMPLEMENTATION.md). Bản này bảo toàn mã không nằm trong Excel và giá cũ khi ô giá trống, không bật chế độ full snapshot tự đưa mã thiếu về 0. Bộ test đã dùng **dữ liệu kiểm thử tổng hợp**, không phải mã/số tồn công ty.

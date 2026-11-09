# STORE — QUY TẮC BẮT BUỘC CHO AI / CODEX / DEVELOPER

Áp dụng cho mọi tác vụ trong repository `https://github.com/gustavjung01/store`.

## 1. Mục tiêu và phạm vi

Xây dựng **STORE — ứng dụng tra cứu tồn kho để báo khách nhanh khi bán hàng**, tối ưu cho điện thoại và máy tính.

- Người bán tra cứu mã công ty (mã CTY), SKU nếu có, hoặc tên hàng; nhìn thấy số tồn và thời điểm cập nhật.
- Quản trị viên cập nhật tồn **thủ công bằng file Excel** của công ty; tối thiểu phải nhận diện được **mã CTY** và **số tồn**.
- Đây là **tồn tại lần nhập Excel gần nhất**, KHÔNG phải số liệu realtime từ hệ thống ERP, trừ khi sau này được tích hợp và ghi rõ.
- Không tự biến sản phẩm thành hệ thống quản lý bán hàng, ERP, kế toán, xuất hóa đơn, đặt hàng hoặc trừ tồn theo đơn bán nếu Owner chưa yêu cầu.

## 2. Ranh giới repo / dữ liệu

- **Chỉ một repo:** `gustavjung01/store`. Phát triển trực tiếp trong repo này qua nhánh và pull request; KHÔNG áp dụng cơ chế repo phụ → repo chính của FBMN.
- Không sửa hay đồng bộ code của `alibaba240185/fbmn` hoặc `meyecarpenter23842/fbmn`; không liên kết database hay dùng chung secrets của FBMN.
- FBMN chỉ là **tham khảo nghiệp vụ** nhập Excel mã CTY / tồn. Không sao chép code, schema, UI hoặc chính sách khi chưa được yêu cầu và kiểm chứng.
- Không giả định bất cứ mã hàng, tên hàng, tồn kho hay chính sách nào là thật nếu chưa có dữ liệu từ Owner.

## 3. Đọc trước mỗi thay đổi

1. Đọc `AGENTS.md`, `README.md`, `docs/ROADMAP.md` và tài liệu liên quan.
2. Kiểm tra file hiện hữu, nhánh `main`, commit HEAD, tình trạng Git và các thay đổi chưa commit.
3. Xác định mục tiêu, phạm vi file và điều kiện nghiệm thu trước khi sửa.
4. Ưu tiên thay đổi nhỏ, chạy kiểm thử thích hợp; không thay đổi module không liên quan.

## 4. Quy trình Git trực tiếp

1. Repo chưa có commit: Owner/người có quyền ghi tạo commit khởi tạo. Sau đó mới dùng branch/PR.
2. Tạo branch từ `main`, đặt tên `feat/...`, `fix/...`, `docs/...`.
3. Commit có ý nghĩa, mở PR vào `main`; kiểm tra diff, typecheck/lint/test/build (tùy stack hiện hữu), review và sửa lỗi.
4. Khi đạt yêu cầu mới squash merge PR vào `main`; không force push, không xóa lịch sử và không bỏ qua bảo vệ nhánh.
5. **Không tự deploy production, thay đổi môi trường production hoặc chạy migration DB** khi chưa có sự cho phép rõ ràng của Owner.
6. Bàn giao ngắn: branch, PR URL, commit SHA, file đổi, test thực chạy, vấn đề tồn đọng, trạng thái deploy/migration.

## 5. Nghiệp vụ bắt buộc

### Tra cứu
- Ưu tiên một ô tìm kiếm lớn và phản hồi nhanh cho mobile: mã CTY chính xác, sau đó tìm gần đúng theo SKU / tên hàng.
- Bảng / thẻ kết quả tối thiểu: `mã CTY`, `tên hàng` (nếu có), `số tồn`, `đơn vị tính` (nếu có), `cập nhật lúc`.
- Phân biệt rõ `còn hàng` (> 0), `hết hàng` (= 0), `chưa có dữ liệu` (NULL/chưa từng cập nhật). Không đồng nhất NULL với 0.
- Có thể sao chép mã CTY nhanh; không tự hiển thị giá, chiết khấu, đặt hàng nếu chưa có dữ liệu và yêu cầu.

### Excel / cập nhật tồn
- Excel đầu vào ưu tiên `.xlsx`; cột bắt buộc là `mã CTY` và `số tồn`; cho phép chọn sheet, chọn dòng tiêu đề và **mapping cột** thay vì bắt buộc một tên cột cứng.
- Xử lý mã CTY như **chuỗi**, giữ số 0 đầu, loại khoảng trắng thừa; cảnh báo khi Excel đã làm mất số 0 đầu. Không gộp các mã chỉ vì tên gần giống.
- Số tồn phải là số nguyên >= 0 theo mặc định; `0` hợp lệ, ô trống không được tự biến thành 0, số âm/sai định dạng phải báo lỗi. Nếu công ty dùng đơn vị lẻ thì bổ sung theo yêu cầu riêng.
- Phát hiện mã trùng trong file, mã mới, dòng lỗi, mã không còn trong file, thay đổi số tồn; có màn hình **xem trước chênh lệch** và chỉ ghi sau thao tác XÁC NHẬN.
- Cho phép khởi tạo mã mới từ Excel sau khi quản trị viên xác nhận; nếu file chỉ có mã + tồn, tên hàng hiển thị `Chưa có tên hàng`, không tự bịa.
- Mặc định cập nhật **chỉ các mã có trong file**; không tự đặt các mã thiếu trong file thành 0. Nếu muốn nhập snapshot đầy đủ và đưa mã thiếu về 0 thì phải chọn chế độ riêng và xác nhận rõ.
- Áp dụng ghi trong một transaction: hoặc cả lượt nhập hợp lệ được ghi, hoặc rollback, không để cập nhật dở. Lưu người nhập, thời gian, số dòng, file name, tổng kết lỗi và giá trị trước/sau để truy vết và có khả năng hoàn tác.
- Chỉ công bố "cập nhật thành công" khi DB xác nhận commit, không công bố sau bước preview.

## 6. Mô hình dữ liệu tối thiểu (đề xuất, chưa chốt stack)

- `products`: id, company_code (unique), sku (optional), name (optional), unit (optional), category (optional), created_at, updated_at.
- `inventory`: product_id (unique), quantity (nullable until first import), last_import_batch_id, updated_at.
- `import_batches`: id, filename, imported_by, created_at, mode, row_count, updated_count, inserted_count, rejected_count, status.
- `import_rows` / `inventory_movements`: import_batch_id, company_code, previous_quantity, new_quantity, outcome / error để audit và rollback.
- `users`: tài khoản + vai trò; phân quyền tối thiểu `admin` (import) và `viewer` (tra cứu).
- Giữ tách biệt dữ liệu sản phẩm, tồn kho hiện tại và lịch sử nhập.

## 7. UI / UX

- Giao diện tiếng Việt, ưu tiên mobile-first, dùng được khi đi thị trường; ô search dễ chạm, chữ số tồn nổi bật, thao tác ít bước.
- Desktop có thể dùng bảng; mobile ưu tiên thẻ ngắn, không tràn ngang, không che ô tìm kiếm.
- Hiển thị nhãn `Dữ liệu nhập lúc ...` tại vị trí rõ ràng. Nếu offline hoặc dữ liệu chưa đồng bộ phải cảnh báo "dữ liệu lưu tạm", không giả vờ realtime.
- Trạng thái loading, empty, error, upload preview, import success/fail phải tách bạch; không hiển thị thông báo thành công giả.
- Không tự dùng branding/màu tím/giao diện FBMN. Giao diện STORE được thiết kế độc lập, tối giản và thống nhất sau khi Owner duyệt.

## 8. Quyền truy cập, bảo mật, chất lượng

- Không để dữ liệu tồn kho công khai. Chức năng xem cần đăng nhập hoặc cơ chế truy cập được Owner phê duyệt; chỉ `admin` được import.
- Không ghi secrets / token / thông tin tài khoản / dữ liệu tồn thực tế vào repo, log công khai hay dữ liệu demo.
- Kiểm tra đầu vào và quyền tại server, giới hạn kích cỡ file, không thực thi macro Excel, tránh SQL injection và formula injection khi xuất dữ liệu.
- Không tái sử dụng database, bucket, API keys, tài khoản production của FBMN.
- Test tối thiểu: nhập hợp lệ, mã trùng, mã có số 0 đầu, tồn 0, ô trống, số âm, số lượng sai kiểu, mã mới, thiếu mã, rollback, phân quyền, tìm kiếm mobile.

## 9. Thiết kế và triển khai

- Vì repo khởi tạo trống, **chưa có stack được phê duyệt**. Khi bắt đầu code, đề xuất giải pháp nhỏ gọn (ví dụ React/Next.js + TypeScript + DB độc lập) và giải thích chi phí/ưu nhược; chỉ chốt theo quyết định của Owner.
- Viết schema, migration, API, giao diện và test theo từng giai đoạn trong `docs/ROADMAP.md`, không xây đại hệ thống trước khi nghiệp vụ chính chạy tốt.
- Mọi thông tin, cấu hình hoặc số tồn chưa được kiểm chứng phải gắn nhãn `giả định` hoặc `dữ liệu demo`.

**Nguyên tắc cuối:** Tra mã nhanh → kiểm tra tồn đáng tin cậy → nhập Excel an toàn → truy vết được → triển khai theo phê duyệt của Owner, trong duy nhất repo STORE.

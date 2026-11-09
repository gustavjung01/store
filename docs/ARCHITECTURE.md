# STORE — Kiến trúc bộ khung PWA (09/11/2026)

## Quyết định được Owner đưa ra

- Frontend: PWA cho iPhone/Android/desktop, mobile-first.
- Lưu dữ liệu gốc: Neon PostgreSQL riêng cho STORE; backend ưu tiên Neon Functions/Data API tùy khả năng được xác minh.
- Tra cứu nhanh: IndexedDB sau khi xác thực thành công.
- Danh mục + nhiều loại giá: nhập Excel và mapping; admin cấu hình **một loại giá mặc định**.
- Xem sản phẩm: giá mặc định + tồn; bấm **Xem tất cả giá** để xem các loại giá khác.
- Số tồn: Excel mã CTY + số lượng, không suy đoán mã thiếu khỏi file bằng 0.
- Ảnh: truy xuất từ R2 FBMN theo mã/ánh xạ nhưng **chỉ đọc**, không dùng chung DB/secrets và không thao tác bucket.
- Hosting frontend: Vercel project `store` thuộc `gustavjung01`. Không liên kết Git để auto-deploy.
- Deploy: comment PR, thông qua workflow đã chờ review ở PR #1.

## Bộ khung hiện có

- Vite + React + TypeScript; viewport mobile + manifest PWA + service worker chỉ cache **app shell tĩnh**.
- Giao diện tra mã, thẻ kết quả, trạng thái còn/hết/chưa có dữ liệu, khung giá mặc định và danh sách giá; không sử dụng dữ liệu bịa.
- Thư viện quy tắc domain độc lập với UI; mã CTY được xử lý như chuỗi, giữ `000123` khác `123`.
- IndexedDB `src/cache.ts`: hỗ trợ thay snapshot trong transaction, tìm mã chính xác theo index, phân tách theo session scope và xóa cache khi đăng xuất.
- **Chưa nối IndexedDB vào UI**: cố ý chặn đọc dữ liệu riêng tư trước khi có xác thực thật.
- CI GitHub Actions `.github/workflows/ci.yml` chỉ kiểm tra PR, **không deploy**.

## Phần bắt buộc tiếp theo

1. Neon: tạo project riêng STORE theo ủy quyền mới, chốt Auth, phân quyền `admin/viewer`, API chỉ trả dữ liệu được phép xem. Không để `DATABASE_URL` / Neon owner token ở frontend.
2. Chốt schema tối thiểu `products`, `price_types`, `product_prices`, `inventory`, `import_batches`, `import_rows` + roles.
3. Thiết kế `GET /catalog/snapshot` hoặc API đồng bộ có version (đúng quyền) để cập nhật IndexedDB chỉ sau đăng nhập; dấu thời gian/phiên bản riêng cho danh mục/giá/tồn.
4. Logout: xóa cache IndexedDB của session, clear dữ liệu đang hiển thị. Trên thiết bị dùng chung cần thêm cơ chế bảo vệ phiên và chính sách dữ liệu offline.
5. Import Excel danh mục (có giá) và tồn (mã CTY + số tồn) là hai quy trình riêng; preview, validation, atomic transaction, audit và rollback.
6. Chuẩn ảnh R2: xác minh định dạng tên/mã ảnh và quyền read-only được Owner cấp, không dùng secret FBMN.
7. Test mobile thật 360/390px, iOS install icon, offline shell và phân quyền; thêm PNG icon iOS nếu cần.
8. Thêm `package-lock.json` sau khi `npm install` trên môi trường có truy cập npm, rồi chuyển workflow sang `npm ci` hoàn toàn.

## Nguyên tắc dữ liệu

- `NULL` tồn = chưa có dữ liệu, `0` = hết hàng, dương = còn hàng.
- `NULL` giá = chưa có giá, `0` giá là giá trị số hợp lệ về mặt kỹ thuật (kiểm tra quy tắc kinh doanh ở import).
- Không lấy giá khác tự bù vào loại mặc định; không tự đổi cấu hình giá mặc định.
- IndexedDB chỉ là cache và có thể cũ. Luôn hiển thị trạng thái offline/cached và timestamp khi thực sự kết nối dữ liệu.
- Chưa có API/đăng nhập nên UI hiện tại chỉ là **bộ khung chức năng**, không thể tra giá/tồn thật.

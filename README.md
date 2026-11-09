# STORE — Tra giá và tồn kho trên điện thoại

Repository duy nhất: https://github.com/gustavjung01/store

Ứng dụng **PWA React/TypeScript**, dữ liệu gốc tại Neon riêng STORE, bộ nhớ tra cứu tại IndexedDB. Mã CTY được nhập dạng text, số tồn chỉ là **snapshot theo Excel**, không phải realtime.

## Giao diện PWA

- Màn tra cứu dùng khung ứng dụng `100dvh`: header và thanh điều hướng mobile cố định trong shell, chỉ nội dung cuộn; hỗ trợ safe-area và bàn phím.
- Các nút, form, màu trạng thái dùng [STORE UI contract](docs/STORE_UI_CONTRACT.md), tham khảo nguyên tắc hình học FBMN nhưng giữ thương hiệu và dữ liệu riêng.
- **Chỉ khi cài PWA vào màn hình chính** mới có chế độ standalone theo hỗ trợ của iOS/Android; mở trong tab trình duyệt không thể tự ẩn address bar.
- Giai đoạn này chỉ chỉnh UI; logic nhập Excel và Neon không thay đổi.

## Người dùng

- Một ô tìm kiếm mã CTY, SKU, tên sản phẩm.
- **Danh mục**: xem toàn bộ mã, lọc mã thiếu tên; Admin tạo/sửa sản phẩm với **mã CTY + tên hàng bắt buộc**, SKU/ĐVT/nhóm hàng tùy chọn. Sửa tên không làm đổi số tồn/giá.
- Hiện tên, ĐVT, **giá mặc định**, tồn kho và thời gian nhập Excel.
- Nút **Xem tất cả giá** để mở các bảng giá khác; không tự tạo giá.
- Admin import `.xlsx` theo sheet và mapping cột; xem trước thay đổi, xác nhận nhập, lịch sử và hoàn tác lượt gần nhất. **Import danh mục sẽ chặn mã chưa có tên**; nhập tồn vẫn có thể tạo mã tạm chưa có tên để admin hoàn thiện sau.
- Dữ liệu riêng tư cần Neon Auth và tài khoản được cấp quyền `viewer/admin`.
- Nếu tài khoản do quản trị viên tạo chưa có mật khẩu: dùng **Chưa có mật khẩu / Quên mật khẩu?**, nhận email Neon Auth và thiết lập qua liên kết một lần; không lưu mật khẩu vào repo.

## Lập trình

Node.js >=22.12 và npm:

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Để dùng đăng nhập và dữ liệu thật, cấu hình `VITE_NEON_AUTH_URL` và `VITE_STORE_API_URL` theo `.env.example`. **Không bao giờ dùng DB URL, Neon API key hoặc Vercel token trong frontend.**

Hiện Neon Auth và schema đã được chuẩn bị trên **nhánh Neon phát triển**; backend Function đã triển khai và kiểm tra HTTP trên **Neon dev branch**; production tích hợp cần nghiệm thu và duyệt migration riêng. Không có file Excel, tài khoản hay giá/tồn thật trong repo.

## Hạ tầng

- Vercel project `store` của `gustavjung01`: production triển khai theo GitHub comment `/deploy production` của Owner, không có auto-deploy.
- Neon project `patient-feather-65846936`, nhánh `dev-store-auth-catalog`: Auth bật, migration mẫu `db/migrations/0001_store_catalog.sql` đã kiểm thử. Neon `main` chưa bị migrate.
- Backend nguồn tại `server/api.ts` + config `neon.ts`. JWT và quyền được kiểm ở server, không tin client.
- CRUD danh mục: `src/CatalogManager.tsx`, `server/catalogService.ts`, migration `0003_catalog_edit_audit.sql` và audit `catalog_edits`. Không đổi mã CTY sau khi tạo. Chưa áp migration này lên Neon production.
- Source import tại `server/importValidation.ts`, `server/importService.ts`, `src/ExcelImport.tsx`, migration `0002_excel_imports.sql`. Chưa có dữ liệu công ty để import thử.
- Tài liệu [quy trình Excel](docs/IMPORT_IMPLEMENTATION.md), giới hạn 3000 dòng mỗi lần, file tối đa 2 MB.
- IndexedDB chỉ đọc sau khi user có session và được API kiểm quyền; xóa khi logout.

Tài liệu: [AGENTS.md](AGENTS.md), [ROADMAP](docs/ROADMAP.md), [Excel](docs/EXCEL_IMPORT_SPEC.md), [Kiến trúc](docs/ARCHITECTURE.md), [Neon API/Auth](docs/NEON_AUTH_API.md), [Deploy](docs/DEPLOYMENT.md).

**Không tự deploy/migrate production, không ghi đè dữ liệu và không thao tác FBMN.**

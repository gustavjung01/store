# STORE — Tra giá và tồn kho trên điện thoại

Repository duy nhất: https://github.com/gustavjung01/store

Ứng dụng **PWA React/TypeScript**, dữ liệu gốc tại Neon riêng STORE, bộ nhớ tra cứu tại IndexedDB. Mã CTY được nhập dạng text, số tồn chỉ là **snapshot theo Excel**, không phải realtime.

## Người dùng

- Một ô tìm kiếm mã CTY, SKU, tên sản phẩm.
- Hiện tên, ĐVT, **giá mặc định**, tồn kho và thời gian nhập Excel.
- Nút **Xem tất cả giá** để mở các bảng giá khác; không tự tạo giá.
- Dữ liệu riêng tư cần Neon Auth và tài khoản được cấp quyền `viewer/admin`.

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

Hiện Neon Auth và schema đã được chuẩn bị trên **nhánh Neon phát triển**; backend Function/production tích hợp cần nghiệm thu riêng. Không có file Excel, tài khoản hay giá/tồn thật trong repo.

## Hạ tầng

- Vercel project `store` của `gustavjung01`: production triển khai theo GitHub comment `/deploy production` của Owner, không có auto-deploy.
- Neon project `patient-feather-65846936`, nhánh `dev-store-auth-catalog`: Auth bật, migration mẫu `db/migrations/0001_store_catalog.sql` đã kiểm thử. Neon `main` chưa bị migrate.
- Backend nguồn tại `server/api.ts` + config `neon.ts`. JWT và quyền được kiểm ở server, không tin client.
- IndexedDB chỉ đọc sau khi user có session và được API kiểm quyền; xóa khi logout.

Tài liệu: [AGENTS.md](AGENTS.md), [ROADMAP](docs/ROADMAP.md), [Excel](docs/EXCEL_IMPORT_SPEC.md), [Kiến trúc](docs/ARCHITECTURE.md), [Neon API/Auth](docs/NEON_AUTH_API.md), [Deploy](docs/DEPLOYMENT.md).

**Không tự deploy/migrate production, không ghi đè dữ liệu và không thao tác FBMN.**

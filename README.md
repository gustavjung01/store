# STORE — Tra giá và tồn kho khi đi thị trường

Repository: https://github.com/gustavjung01/store

**Trạng thái:** Đang xây dựng PWA. Bộ khung frontend đã được mở qua PR, **chưa có Neon/Auth/Excel thực tế và chưa deploy production**.

## Mục tiêu

Mở ứng dụng trên điện thoại, nhập **mã CTY / SKU / tên**, xem **tên hàng + ảnh + giá mặc định + số tồn**. Khi cần, mở **Xem tất cả giá**. Tồn là snapshot theo lần nhập Excel gần nhất, **không phải realtime**.

- Danh mục và nhiều loại giá import từ Excel; loại giá mặc định do admin cấu hình.
- Tồn nhập riêng bằng Excel có hai cột tối thiểu mã CTY + số lượng.
- Neon PostgreSQL là nguồn dữ liệu gốc. IndexedDB tăng tốc tìm kiếm sau đăng nhập/đồng bộ; cache không phải dữ liệu gốc.
- Đọc ảnh R2 được Owner cho phép theo mã; không dùng chung DB/secrets FBMN.

## Chạy bộ khung tại máy phát triển

Yêu cầu Node.js **22.12+** và npm.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

Chưa có dữ liệu công ty nên UI cố ý hiển thị placeholder và trạng thái **chưa đồng bộ Neon**, không dựng dữ liệu mẫu giả.

**Bảo mật:** `src/cache.ts` chuẩn bị IndexedDB nhưng giao diện chưa đọc/ghi cache cho tới khi có đăng nhập và phân quyền. Service worker chỉ cache bộ vỏ ứng dụng tĩnh.

## Tài liệu

- [AGENTS.md](AGENTS.md): quy tắc bắt buộc.
- [CHATGPT_PROJECT_INSTRUCTIONS.md](CHATGPT_PROJECT_INSTRUCTIONS.md): chỉ dẫn project.
- [docs/ROADMAP.md](docs/ROADMAP.md): giai đoạn và nghiệm thu.
- [docs/EXCEL_IMPORT_SPEC.md](docs/EXCEL_IMPORT_SPEC.md): import tồn kho.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): lựa chọn PWA/Neon/IndexedDB/giá.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): workflow deploy comment (được đề xuất ở PR riêng).

## Deploy

Vercel project STORE thuộc `gustavjung01`, **không kết nối Git Integration**, nên push/merge GitHub không tự deploy. GitHub CI PR chỉ chạy kiểm thử.

Workflow deploy qua comment do Owner duyệt ở PR #1; cần cấu hình token riêng qua GitHub Environments, không gửi bí mật qua chat. **Không deploy hay migrate DB production khi chưa được Owner phê duyệt.**

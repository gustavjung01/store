# STORE — Tra cứu tồn kho bán hàng

Repository: https://github.com/gustavjung01/store

**Trạng thái:** Bộ tài liệu khởi tạo cho dự án, **chưa có phần mềm**. Tài liệu khởi tạo ngày 09/11/2026.

## Mục tiêu

Ứng dụng tra mã CTY / SKU / tên hàng, xem tồn và thời điểm cập nhật nhanh trên điện thoại. Tồn được nhập thủ công từ Excel công ty và có preview, đối soát, audit, hoàn tác.

## Tài liệu

- [`AGENTS.md`](AGENTS.md): Quy tắc bắt buộc cho AI, Codex và developer.
- [`CHATGPT_PROJECT_INSTRUCTIONS.md`](CHATGPT_PROJECT_INSTRUCTIONS.md): Nội dung dùng khi tạo một ChatGPT Project riêng.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): Các giai đoạn xây dựng / tiêu chí nghiệm thu.
- [`docs/EXCEL_IMPORT_SPEC.md`](docs/EXCEL_IMPORT_SPEC.md): Đặc tả dữ liệu và xử lý nhập Excel.

## Bắt đầu

1. Đọc `AGENTS.md`, `docs/ROADMAP.md` và `docs/EXCEL_IMPORT_SPEC.md` trước khi thay đổi.
2. Tạo ChatGPT Project mới và dán nội dung từ `CHATGPT_PROJECT_INSTRUCTIONS.md` vào Project Instructions.
3. Nhận file Excel mẫu đã ẩn dữ liệu nhạy cảm để xác nhận đúng cột mã CTY và số tồn.
4. Chọn stack và kiến trúc DB riêng cho STORE; thống nhất wireframe tra cứu / nhập file.
5. Phát triển qua branch/PR theo các chặng trong roadmap; không tự deploy production khi chưa được phê duyệt.

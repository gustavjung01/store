# STORE — ROADMAP

## P0 — Khởi tạo
- [x] Repo và tài liệu baseline.
- [x] PWA React/TypeScript, IndexedDB, Neon riêng, Vercel chính chủ.
- [x] Giá mặc định và mục **Xem tất cả giá**.
- [x] GitHub Actions comment-only production, đã chạy deploy PWA shell thành công.
- [x] Neon project STORE riêng; nhánh dev `dev-store-auth-catalog` có Auth và migration.
- [ ] Excel danh mục và tồn mẫu đã ẩn số liệu nhạy cảm, chốt đúng mapping giá/tồn.
- [ ] Chốt phương thức cấp tài khoản nhân viên, email delivery, quyền viewer/admin.

## P1 — Tra cứu giá và tồn (đang triển khai)
- [x] PWA UI mobile-first cho mã CTY/SKU/tên, một giá mặc định, mở giá khác, tồn/NULL/0.
- [x] Code Auth login/logout, JWT, phân quyền qua API, đồng bộ IndexedDB; đang chờ kiểm thử end-to-end.
- [x] Migration PostgreSQL trên **Neon dev branch**: danh mục/giá/tồn/audit.
- [x] Source API Neon Functions read-only: `/me`, `/catalog/snapshot`, `/catalog/lookup`.
- [x] Deploy Function trên Neon **dev branch**; HTTPS health 200, chưa login 401; SQL tra cứu đã chạy không lỗi trên bảng trống.
- [ ] Test đầy đủ 403, phân quyền viewer/admin và trả sản phẩm thực sau khi Owner cấp tài khoản/dữ liệu.
- [ ] Có tài khoản được duyệt và dữ liệu danh mục thật để kiểm nghiệm tra cứu.
- [ ] Duyệt migration production Neon và cấu hình Auth/Function trên production theo Owner.
- [ ] Test mobile thật và offline/cache/logout; kiểm thử phân quyền e2e.

## P2 — Import Excel an toàn
- [ ] Admin import `.xlsx` danh mục và nhiều loại giá; chọn sheet, mapping, preview.
- [ ] Admin import tồn bằng mã CTY + số lượng; kiểm tra 0/NULL, trùng, âm, mã mới.
- [ ] Ghi nguyên tử + lịch sử trước/sau, rollback; không tự zero các mã thiếu.
- [ ] Đồng bộ version cache sau mỗi lần nhập được xác nhận.

## P3 — Vận hành
- [ ] Phân quyền production, backup, giám sát, kiểm tra thiết bị thật, R2 ảnh READ-ONLY.
- [ ] Kiểm thử performance và lưu cache có giới hạn/rotation.
- [ ] Không đưa data thật lên production trước khi Owner phê duyệt.

**Ngoài MVP:** trừ tồn theo đơn, ERP, đa kho, kế toán, hóa đơn.

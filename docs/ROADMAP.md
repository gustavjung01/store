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
- [x] Đã viết màn Danh mục và API admin tạo/sửa mã CTY với tên bắt buộc, SKU/ĐVT/nhóm và nhật ký chỉnh sửa; có test PostgreSQL.
- [ ] Nghiệm thu màn Danh mục qua tài khoản Admin, dữ liệu danh mục thật và điện thoại.
- [ ] Có file danh mục công ty thật để kiểm nghiệm mã/tên/giá.
- [ ] Duyệt migration production Neon và cấu hình Auth/Function trên production theo Owner.
- [ ] Test mobile thật và offline/cache/logout; kiểm thử phân quyền e2e.

## UI — Calm dark mode & minimal header (09/11/2026)
- [x] Topbar chỉ logo STORE, switch Sáng/Tối ở chính giữa và Đăng xuất; không email, breadcrumbs, trạng thái kết nối hay shortcut phụ.
- [x] Dark palette dịu, áp dụng auth, tra cứu, danh mục, Excel, preview, toast, dialog; color-scheme cho native controls.
- [x] Nhớ theme theo thiết bị và khởi tạo trước first paint, nâng phiên bản PWA shell cache; không đụng DB/import.
- [ ] Test CI PR và UAT thật tại 320/360/390/768/1280px, iOS/Android installed PWA.

## UI — Mobile app shell (09/11/2026)
- [x] Đọc quy chuẩn UI FBMN và chuẩn hóa contract riêng STORE: token, geometry, text/status, giảm hiệu ứng và giữ độc lập thương hiệu.
- [x] Đã code shell PWA full-height, bottom navigation trong viewport, safe area, chế độ typing, tra cứu có chọn kết quả và editor danh mục dạng dialog.
- [x] Kiểm thử contract tĩnh tại `tests/ui-shell.test.mjs`; CI PR cần xác minh typecheck/test/build.
- [ ] UAT 360/390/768/1280/1440 và điện thoại iOS/Android thực tế, kiểm installed standalone, keyboard, scroll, auth, modal, offline, overflow.
- [ ] Chỉ sau khi UI được nghiệm thu mới tiến hành cải thiện UI/luồng nhập Excel và thuộc tính quy cách.

## P1.5 — Quy cách bán sỉ / ĐVT thùng (09/11/2026)
- [x] Code ĐVT Thùng điền sẵn cho mã mới Admin tạo, tùy chỉnh từng mã; không đổi mã/tồn cũ.
- [x] Code JSONB quy cách thùng/lốc, khổ giấy, số trang, GSM, loại kẻ, bìa; chặn dữ liệu mâu thuẫn.
- [x] Code hiển thị quy cách và quy đổi khi đủ điều kiện; không tự suy đoán.
- [x] Code Excel danh mục mapping quy cách + ĐVT mặc định cho mã mới; preview/transaction/rollback khôi phục thông số.
- [ ] CI PR + UAT thiết bị thật, file Excel công ty thực, phân quyền admin/viewer.
- [ ] Áp migration `0004_product_packaging.sql` vào **Neon dev** sau review, trước khi cập nhật API dev.
- [ ] Không migration/deploy production trước khi Owner duyệt riêng.
- Chi tiết: [Quy tắc đơn vị và quy cách bán sỉ](WHOLESALE_UNITS.md).

## UI — Ghép cột Excel trực quan theo mẫu FBMN (10/11/2026)
- [x] Giao diện STORE riêng: chọn file/sheet, tự gợi ý cột có tên rõ, dropdown trên từng cột kèm 5 dòng mẫu và phân trang; giữ mã CTY khi xem cột khác.
- [x] Tên sản phẩm/ĐVT/quy cách có thể chọn theo cột, cột không cần cập nhật = Bỏ qua. Không tự ghép giá từ tên PDF.
- [x] Dùng API preview, transaction, audit và rollback hiện có; chưa đổi DB hay backend.
- [ ] Nghiệm thu trên thiết bị thật và file Excel công ty; xác nhận preview của từng thông số trước khi ghi.

## UI — Thẻ tra cứu đầy đủ thuộc tính (10/11/2026)
- [x] Tra cứu hiển thị SKU, nhóm hàng, 5 thông số và 6 trường đóng gói dù một số trường chưa có dữ liệu; phân biệt `Chưa cập nhật` với giá trị thật.
- [x] Chỉ hiển thị quy đổi thùng dựa trên dữ liệu quy cách hợp lệ đã lưu; không suy đoán từ tên hàng, không sửa API hoặc DB.
- [ ] CI xanh và UAT mobile/desktop sau khi triển khai; đối chiếu file danh mục thật cho các mã còn thiếu thông số.

## P2 — Import Excel an toàn
- [x] Đã viết và CI kiểm thử UI/API admin import `.xlsx` danh mục và nhiều loại giá; chọn sheet, mapping, preview. Chưa xác nhận bằng Excel thật.
- [x] Đã viết validation tồn mã CTY + số lượng; kiểm tra 0/NULL, trùng, âm, mã mới; test unit thành công.
- [x] Đã viết backend transaction + audit + rollback gần nhất và migration trên Neon dev; cần kiểm thử e2e có tài khoản admin trước production.
- [x] Backend tăng version sau confirm/rollback và PWA tải lại khi admin xác nhận; còn cần kiểm thử IndexedDB bằng tài khoản thực.
- [x] Import danh mục chặn tạo sản phẩm mới thiếu tên; inventory-only vẫn có thể tạo mã tạm, cho phép hoàn thiện tên thủ công. Chặn rollback Excel nếu danh mục đã được chỉnh sửa thủ công sau đó.

## P3 — Vận hành
- [ ] Phân quyền production, backup, giám sát, kiểm tra thiết bị thật, R2 ảnh READ-ONLY.
- [ ] Kiểm thử performance và lưu cache có giới hạn/rotation.
- [ ] Không đưa data thật lên production trước khi Owner phê duyệt.

**Ngoài MVP:** trừ tồn theo đơn, ERP, đa kho, kế toán, hóa đơn.

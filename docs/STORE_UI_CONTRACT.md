# STORE — UI contract / PWA shell (09/11/2026)

## Tham chiếu và ranh giới

Đã **đọc để tham khảo nguyên tắc** `meyecarpenter23842/fbmn/docs/futurebook-ui-contract.md` và `docs/admin-ui-design-system.md`. Không liên kết hai dự án, không copy component/code, database, secret, màu thương hiệu hoặc tài sản FBMN. STORE có token và UX độc lập tại `src/store-ui.css`.

Phạm vi giai đoạn này: **chỉ UI/PWA và màn tra cứu, danh mục**. Giữ nguyên `src/ExcelImport.tsx`, mapping, import transaction, quyền, API, Neon và dữ liệu. Không có tác vụ deploy production.

## Cơ sở giao diện

| Hạng mục | Quy ước STORE |
| --- | --- |
| Brand | Xanh cobalt `#3158cf`, canvas `#f5f7fb`, chữ `#18263c`; không sao chép tím/brand FBMN |
| Control | Button 36px desktop, tối thiểu 44px mobile; input/select 40px, trừ search 48–50px |
| Type | Label/control 13px trở lên; ô nhập mobile 16px để tránh Safari tự zoom |
| Shapes | Control 9px, card 14px, modal 15px |
| States | Focus ring nhìn thấy, disabled rõ, còn/hết/chưa nhập tách bạch cả text lẫn màu |
| Spacing | 4/8/12/16/24/32px; mỗi cụm một CTA chính |
| Motion | Button 190ms, dialog mở 280ms; tôn trọng reduced-motion |
| Table | Bảng Excel chỉ cuộn ngang **bên trong bảng**, không làm viewport tràn |
| Form sản phẩm | Modal desktop, full-height trên mobile; Esc, đóng ngoài, xác nhận nếu đang sửa dở, tab trap cơ bản |
| Feedback | Toast cố định cho lưu thành công; validation error cạnh form |

## PWA giống app — giới hạn kỹ thuật cần hiểu đúng

- **Cài PWA vào màn hình chính** với `display: standalone` mới bỏ chrome thanh địa chỉ theo mức hệ điều hành hỗ trợ. Khi mở qua tab Safari/Chrome, website **không thể tự khóa/ẩn thanh công cụ của trình duyệt**.
- App chính dùng `100dvh`, sidebar desktop; header và navigation mobile nằm **ngoài vùng cuộn**, chỉ `.main` tự cuộn. Hỗ trợ `safe-area-inset-top/bottom` cho tai thỏ và thanh home.
- Khi người dùng đặt focus vào ô nhập/select, ẩn bottom navigation để không đè bàn phím. Không chặn zoom hỗ trợ tiếp cận, không vô hiệu hóa kéo cuộn trong form/danh sách.
- `overscroll-behavior: contain` dùng trong nội dung, không ngăn scroll người dùng. Không ngăn orientation của hệ điều hành, dù manifest có `orientation: portrait` (hỗ trợ tùy nền tảng).
- Trang đăng nhập và khôi phục mật khẩu vẫn cuộn tự nhiên ngoài shell; không cho xem dữ liệu nếu chưa được xác thực; offline giữ cảnh báo dữ liệu lưu trên máy, không nói tồn realtime.
- Service worker chỉ cache app shell công khai, không cache API/tồn/giá/Neon; IndexedDB có scope xác thực như cũ.

## Luồng tra cứu và danh mục

- Ô tìm kiếm ưu tiên mã công ty; khi nhiều kết quả hiển thị danh sách chọn sản phẩm; không bịa thẻ sản phẩm/giá khi trống.
- Thẻ thực hiển thị tên, mã CTY, đơn vị, tồn và trạng thái, thời điểm tồn, giá mặc định, tùy chọn mở tất cả giá. Số tồn từ snapshot Excel, **không realtime**.
- Menu mobile dưới màn hình chỉ có Tra cứu, Danh mục, Nhập Excel (admin); desktop giữ navigation trong sidebar. Trên mobile, đăng xuất không được ẩn với role viewer.
- Form danh mục mở trong dialog để không đẩy danh sách dài; không sửa mã CTY, lịch sử hay giá/tồn khi chỉnh tên.

## Kiểm thử bắt buộc trước release

- CI: typecheck, unit tests, bundle/build, PostgreSQL import integration (không thay nghiệp vụ).
- **UAT còn phải làm trên thiết bị thật**: Android Chrome và iPhone Safari/PWA đã cài, các viewport 360/390/768/1280/1440; keyboard mở/đóng, safe areas, trạng thái offline, nhiều kết quả, không kết quả, role viewer/admin, login/logout, focus/Tab/Esc, long text, modal, scroll ngang Excel **chỉ trong bảng**.
- Screenshot trước/sau, test PWA standalone và kiểm browser console chỉ có giá trị khi thực sự chạy; **CI tĩnh không thay thế UAT**.
- Phần **nhập Excel/quy cách** là PR kế tiếp sau khi UI đạt nghiệm thu, không gộp vào PR này.


## Chế độ Sáng/Tối — Neon-style dịu (09/11/2026)

- Thanh trên gồm đúng **logo STORE bên trái, switch ở chính giữa, Đăng xuất bên phải**. Trên desktop điều hướng giữ ở sidebar, mobile ở dock. Không hiển thị breadcrumb, email, badge online hoặc shortcut trên topbar.
- Bảng màu dark: canvas `#0d1118`; card `#171f29`; input `#111923`; border `#303b49`; chữ `#d7dfe8`; nhấn sage muted `#79a99d`. Không nền trắng hoặc glow trong dark mode.
- Các lớp dark override độc lập trong `src/store-theme.css` tải cuối cùng, phủ auth, tra cứu, giá/tồn, danh mục, file Excel, preview, input, thông báo và modal. UI cơ bản/geometry trong `src/store-ui.css`.
- Khởi tạo dark/light ngay trong HTML theo `localStorage['store-theme']` hoặc `prefers-color-scheme` khi chưa từng chọn; cập nhật `data-theme`, `color-scheme`, meta theme-color trước paint. Không lưu hay đọc dữ liệu cá nhân bằng theme.
- Giao diện tối cần kiểm UAT 320/360/390/768/1280, thiết bị mobile, PWA cài đặt, bàn phím, tab/keyboard focus, không mảng trắng/flash khi reload, đủ tương phản, không glow rực.

# STORE — Nhập Excel danh mục/giá và tồn (bản phát triển)

## Phạm vi

Quy trình **admin-only**, trên repository STORE, không ghi trực tiếp vào DB hoặc R2 của FBMN:

1. Admin chọn file `.xlsx` tối đa 2 MB, sheet và dòng tiêu đề.
2. Chọn cột **mã CTY** (bắt buộc), nhập tồn thì chọn **số tồn** (bắt buộc); nhập danh mục thì tùy chọn **tên/SKU/ĐVT**, nhiều cột giá và một giá mặc định.
3. Client đọc Excel, phát hiện mã CTY dạng số (có nguy cơ đã mất số 0 đầu), mã trùng, tồn trống/âm/không nguyên, giá sai định dạng, cột mapping trùng. Không chạy macro.
4. Gửi dữ liệu đã mapping lên `POST /admin/import/preview`. Server **xác thực JWT + role admin**, kiểm tra lại toàn bộ và đọc chênh lệch so với Neon. Có mã mới, mã thay đổi, mã không đổi và số mã vắng file (giữ nguyên).
5. Server tạo lượt nhập `pending` với `base_version` và payload chuẩn hóa; bản xem trước hết hạn sau 20 phút.
6. Chỉ sau thao tác xác nhận, `POST /admin/import/commit` mở transaction, khóa `catalog_state` và yêu cầu version khớp bản preview, ghi các mã trong file cùng lịch sử trước/sau. Lỗi ở một bước sẽ rollback toàn bộ.
7. `POST /admin/import/rollback` cho admin hoàn tác **lượt nhập đang applied mới nhất**, khôi phục thông tin, giá, số tồn, dấu thời gian, loại giá mới và giá mặc định. Nhật ký vẫn giữ nguyên. Không hoàn tác batch cũ nếu đã có batch mới áp dụng.
8. `GET /admin/imports` trả lịch sử 30 lần gần nhất.

Dữ liệu tồn là **snapshot từ file Excel**, không phải tồn realtime. Mã không xuất hiện trong Excel **giữ nguyên tồn**; ô giá trống **giữ giá cũ**. Giá 0 được chấp nhận, tồn 0 được chấp nhận, số âm/giá âm lỗi. Mã CTY là TEXT, không tự tạo mã từ tên hàng.

## Giới hạn kỹ thuật và an toàn

- Mỗi lượt tối đa **3000 dòng**, body request tối đa 1.9 MB (file đầu vào tối đa 2 MB). File nhiều dòng chia thành nhiều lượt; mỗi lượt có preview riêng.
- Preview/commit yêu cầu cùng người đã xem trước; trạng thái `pending` + version DB bảo vệ thay đổi đồng thời.
- Backend chỉ cấp quyền khi `app_members.role = 'admin' AND active = true`. Không có endpoint tự đăng ký/ tự nâng quyền.
- Bảo vệ thêm: chỉ hoàn tác lượt nhập mới nhất; import khác diễn ra sau sẽ khóa hoàn tác lượt cũ.
- Danh mục nhập giá theo `price_types` động; tên giá lấy từ cột Excel, ID chuẩn hóa. Nếu ID trùng nhưng nhãn khác, preview từ chối.
- Excel cell mã CTY dạng **number bị chặn**. Admin phải xuất lại cột dạng Text; không cố đoán số 0 bị mất.
- PWA giữ IndexedDB theo user sau login; admin cần bấm đồng bộ lại sau xác nhận/rollback. Backend tăng `catalog_state.version` khi áp dụng/hoàn tác.
- Bản này chưa có file Excel thật từ Owner nên **chưa xác nhận mapping phù hợp file công ty**. Cần thử nghiệm bằng file mẫu trước khi phát hành production.
- Cần kiểm thử quyền admin/viewer bằng tài khoản được cấp, import/rollback end-to-end Neon dev, lỗi mạng và đồng bộ trên điện thoại thật.
- Neon `main` và Vercel production **không được migration/deploy tự động**. Chỉ mã và migrations được review/merge trên GitHub.

## API

| Method | Đường dẫn | Quyền |
|---|---|---|
| POST | `/admin/import/preview` | admin |
| POST | `/admin/import/commit` | admin, xác nhận batch đã preview |
| POST | `/admin/import/rollback` | admin, batch mới nhất |
| GET | `/admin/imports` | admin |

Cấu trúc PostgreSQL ở `db/migrations/0001_store_catalog.sql` và `0002_excel_imports.sql`. Không có dữ liệu công ty hardcode trong repo.

## Chuẩn tên sản phẩm (Danh mục)

- Danh mục chuẩn là **mã CTY (Text, giữ số 0 đầu)** + **tên hàng đầy đủ**, kèm SKU/đơn vị tính/nhóm hàng khi có. Mã CTY duy nhất và **không đổi sau khi tạo**. Giá/tồn quản lý độc lập.
- Trang **Danh mục** cho viewer xem danh sách, còn Admin được tạo mới hoặc bổ sung/sửa tên của mã tạm do nhập tồn. Có tìm kiếm mã, SKU, tên, thống kê mã thiếu tên và nhật ký chỉnh sửa.
- Excel nhập danh mục có thể bỏ trống tên **chỉ khi mã đó đã có tên ở STORE**, để cập nhật giá không đổi tên cũ. Nếu một mã mới/đang thiếu tên không có tên trong Excel, toàn bộ preview bị từ chối (có số dòng) để tránh tạo sản phẩm không chuẩn.
- **Riêng Excel tồn** vẫn được phép tạo mã tạm chưa có tên (vì nhiều file tồn chỉ có mã + số lượng). Trang Danh mục sẽ đánh dấu để Admin bổ sung.
- Mọi chỉnh sửa thủ công tăng version `catalog_state` và ghi `catalog_edits` (người sửa, trước/sau); Excel rollback bị chặn nếu có chỉnh sửa thủ công sau batch nhằm tránh mất thông tin do người quản lý vừa sửa.
- Migration bổ sung **`0003_catalog_edit_audit.sql`** chỉ dành cho Neon dev trước khi Owner duyệt production. Không được phép tự đổi tên thật hoặc tạo dữ liệu sản phẩm giả.

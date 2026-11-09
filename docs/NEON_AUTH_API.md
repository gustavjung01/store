# STORE — Neon Auth, database, API và IndexedDB

## Trạng thái xác minh

- Project Neon riêng STORE: `patient-feather-65846936` (Singapore).
- Nhánh Neon phát triển: `dev-store-auth-catalog` (`br-lucky-violet-aznxmc4n`).
- Neon Auth **đã bật trên nhánh phát triển**, provider Managed Better Auth, email/mật khẩu; **đã khóa tự đăng ký**.
- Đã thêm trusted origin `https://store-nu-opal.vercel.app` cho Auth ở nhánh phát triển.
- Migration `db/migrations/0001_store_catalog.sql` đã được áp dụng **thành công trên nhánh phát triển** (Neon `main` vẫn chưa có các bảng).
- API Neon Functions **đã deploy thành công trên nhánh phát triển** với slug `storeapi`; GitHub Actions đã kiểm thử HTTPS `/health` => **200**, `/me` không JWT => **401**. Chưa có tài khoản được cấp quyền để kiểm thử luồng viewer/admin.
- Chưa đưa Auth URL hay API URL vào Vercel production, vì Neon production chưa sẵn sàng.

## Database schema

- `app_members`: ánh xạ user id của Neon Auth sang vai trò `viewer/admin` và trạng thái active. **Mặc định không ai có quyền đọc** cho tới khi admin cấp.
- `products`: mã CTY dạng TEXT với generated key chuẩn hóa để tra cứu, SKU/tên/đơn vị/ảnh. Không bịa danh mục.
- `price_types`: loại giá do công ty nhập từ Excel.
- `product_prices`: giá từng sản phẩm theo loại giá, giá `0` khác giá chưa có.
- `price_settings`: singleton chọn loại giá mặc định.
- `inventory`: số tồn theo lần nhập Excel (`NULL` chưa nhập, `0` hết hàng), thời gian nhập.
- `catalog_state`: version/updated_at cho luồng đồng bộ.
- `import_batches` / `import_rows`: chuẩn bị lưu audit và số lượng trước/sau để import/rollback khi hoàn thiện P2.

Truy cập từ client tới DB bằng URL/password PostgreSQL **bị cấm**. Chỉ backend Neon Functions dùng `DATABASE_URL` được Neon inject, cùng `NEON_AUTH_BASE_URL` và `NEON_AUTH_JWKS_URL`.

## Backend API (đều dùng GET, ngoại trừ CORS OPTIONS)

Function dev URL: `https://br-lucky-violet-aznxmc4n-storeapi.compute.c-3.ap-southeast-1.aws.neon.tech/` (public endpoint, dữ liệu phải qua JWT + membership).

Function tại `server/api.ts` với slug `storeapi` trong `neon.ts`.

| Endpoint | Phản hồi |
|---|---|
| `GET /health` | Trạng thái dịch vụ, không trả dữ liệu sản phẩm |
| `GET /me` | `{ role: 'viewer' \| 'admin' }` với user đã được duyệt |
| `GET /catalog/snapshot?limit=500&after=...` | Trang sản phẩm + các loại giá + loại giá mặc định + số tồn, `nextCursor` |
| `GET /catalog/lookup?code=...` | Tra mã CTY chính xác, `product: null` khi chưa có |

Yêu cầu header `Authorization: Bearer <short-lived-Neon-Auth-JWT>` cho tất cả ngoại trừ `/health`.
Function xác thực JWT qua JWKS (EdDSA + issuer) và kiểm tra `app_members.active=true`. Không có quyền: `403`, sai/hết hạn JWT: `401`, schema/backend lỗi: `503`; không dùng cache HTTP/CDN chứa giá hay tồn.

**Không có API ghi/import giá và tồn ở giai đoạn này.** Khi thêm P2, bắt buộc kiểm tra admin, preview/validation, transaction, audit và rollback; không tự zero mã thiếu.

## Kết nối PWA

1. Trên máy dev hoặc môi trường được duyệt, đặt **public** `VITE_NEON_AUTH_URL` (branch Auth URL) và `VITE_STORE_API_URL` (invocation URL Function trên cùng branch) theo `.env.example`.
2. Khi người dùng đăng nhập thành công, PWA gọi `authClient.token()` để lấy JWT, gọi `GET /me` để kiểm tra đã được cấp quyền, **sau đó** mới đọc cache IndexedDB và tải phân trang snapshot từ API.
3. Snapshot được lưu trong IndexedDB theo hash SHA-256 của Neon Auth URL + Function URL + user ID. Tìm chính xác mã CTY dùng IndexedDB index; fallback tìm tên trong danh mục đã đồng bộ.
4. Đăng xuất chủ động xóa cache phiên và xóa dữ liệu trên màn hình. Trên máy dùng chung, luôn đăng xuất; offline mới mở lại app không tự khôi phục cache riêng tư khi không thể xác minh phiên.
5. Số tồn hiển thị theo thời gian nhập Excel riêng trên từng hàng; cache có nhãn thời gian đồng bộ và **không phải tồn realtime**.

## Hướng dẫn cấp quyền

Sau khi Owner đã cấp một tài khoản thực tế qua Neon Auth và đã xác minh user ID trong `neon_auth.user`, admin DB mới được cấp quyền:

```sql
-- Chỉ minh họa cú pháp, KHÔNG tự chạy với id bịa:
INSERT INTO public.app_members(user_id, role, active)
VALUES ('<verified-auth-user-id>', 'viewer', true)
ON CONFLICT (user_id)
DO UPDATE SET role = EXCLUDED.role, active = EXCLUDED.active;
```

Không tự tạo tài khoản admin, không tự gán quyền cho user mới. Việc bật signup trực tiếp trên production cần quy trình quản lý tài khoản riêng.

## Triển khai an toàn

- Trên nhánh Neon dev, Function đã deploy bằng bản bundle build từ commit trên PR và kiểm tra hoạt động qua HTTP. Khi thay code API, cập nhật Function trên **cùng nhánh dev**; không chạy `neon deploy` khi liên kết `main` Neon.
- Neon Functions sử dụng `@neon/functions` + `pg` pool và JWT `jose`.
- Trước production, kiểm thử đầy đủ: 401 chưa login, 403 chưa cấp quyền, đúng quyền viewer/admin, tìm mã có 0 đầu, phân trang, logout/cache, offline; cấu hình email delivery production và kiểm tra HTTPS/CORS.
- **Không áp migration/enable auth lên Neon main, không thay Vercel production env, không deploy production** trước khi Owner duyệt bước chuyển production.

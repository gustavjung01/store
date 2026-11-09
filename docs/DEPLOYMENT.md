# STORE — Triển khai thủ công qua comment GitHub

## Mục tiêu

- Không deploy khi push, mở PR hoặc merge.
- Chỉ chủ repository GitHub `gustavjung01` có thể yêu cầu deploy bằng comment **chính xác** trong một pull request của `gustavjung01/store`.
- GitHub Actions **luôn lấy mã từ `main`**, không chạy mã từ nhánh PR để tránh lộ Vercel token khi PR chưa review.
- Không deploy hay migration database khi thiết lập workflow. Chỉ comment sau khi app build được, project và secrets đã được cấu hình đúng.

## Vercel

Dùng project STORE trên **tài khoản Vercel do Owner xác nhận**. Không dùng project/tokens của FBMN.

**Không kết nối Vercel Git Integration** cho project này. Project Vercel chỉ dùng để nhận các lần deploy bằng CLI từ GitHub Actions. Cách này tắt auto-deploy từ nguồn, không dựa vào Ignored Build Step. Cần giữ repo không kết nối Git cả về sau; kết nối lại có thể bật auto-deploy.

Project được tạo chỉ từ tài liệu không tạo ra trang web: repository hiện chưa có source PWA để build.

## Cấu hình GitHub

Vào GitHub: `Settings → Environments` tạo `preview` và `production`.

- Với `production`: **bật Required reviewers**, chỉ Owner / người được Owner chỉ định mới duyệt; giới hạn deployment branches về `main` nếu phù hợp cấu hình workflow. Không bật production deploy cho đến khi cấu hình xong.
- Với `preview`: có thể yêu cầu reviewer nếu cần.

Thêm **GitHub Actions variables** (cấp repo hoặc theo environment, dùng đúng project STORE):

| Variable | Ý nghĩa |
| --- | --- |
| `VERCEL_ORG_ID` | ID team/account sở hữu project STORE trên Vercel |
| `VERCEL_PROJECT_ID` | ID project STORE đúng tài khoản |
| `VERCEL_CLI_VERSION` | Phiên bản CLI chính xác đã kiểm tra, dạng X.Y.Z |

Thêm **GitHub Actions secret** `VERCEL_TOKEN` (ưu tiên secret riêng của từng environment). Token phải thuộc đúng tài khoản Vercel và chỉ cấp quyền cần thiết cho project STORE. Không gửi token trong chat hoặc commit.

**Không dùng** Vercel ID / token từ project hoặc tài khoản FBMN. Không ghi Neon DB secrets vào workflow này.

## Sử dụng

Khi workflow đã được merge vào `main`, đăng một comment trên bất kỳ PR nào của repo bằng đúng một trong hai lệnh:

- `/deploy preview` — build và deploy bản preview từ HEAD của `main`.
- `/deploy production` — yêu cầu duyệt GitHub environment `production` rồi build và deploy production từ HEAD của `main`.

Không có trigger `push`, `pull_request` hoặc `workflow_run`. Comment của người khác, comment trong issue thường, và lệnh sai cú pháp không deploy.

Vào tab `Actions → Manual Vercel deploy by PR comment` xem run/log và link Vercel deployment. Nếu vừa merge PR, comment trên PR đã merge vẫn kích hoạt được workflow.

**Lưu ý:** Đây là cách deploy mã đã merge ở `main`; không dùng để chạy code PR chưa merge. Chưa có bảo đảm kiểm thử build cho đến khi app PWA và bộ test được tạo. Luôn review diff / CI trước khi merge PR code. Khi import Excel, rollback và migration Neon phải có cơ chế phê duyệt riêng, không thực hiện qua comment deploy.

## Kiểm chứng sau cấu hình

1. `git push` và merge không tạo Vercel deployment mới.
2. Comment sai lệnh / từ tài khoản khác không triển khai.
3. Comment `/deploy preview` của `gustavjung01` chạy Actions và trả URL preview khi app đã sẵn sàng.
4. Comment `/deploy production` chờ reviewer và deploy đúng `main` / project STORE.
5. Không có secrets trong logs/artifacts.

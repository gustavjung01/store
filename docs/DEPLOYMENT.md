# STORE — Triển khai Vercel bằng comment PR (không auto-deploy)

## Project đích đã xác minh

- Vercel account/team: `gustavjung01's projects`
- Team ID: `team_964e6EsImAKgZe01NQmUNF7F`
- Project: `store`
- Project ID: `prj_3HViKj8ak29achpJuvToi3fjPoEB`
- Project: https://vercel.com/gustavjung01s-projects/store
- Framework: Vite React/TypeScript (source sẽ được thêm qua PR riêng)
- Không kết nối Git Integration. Vercel không tự deploy khi push/merge. Chỉ GitHub Actions có thể chủ động gọi CLI khi có lệnh comment.
- Production hiện **chưa có deployment**; không chạy lệnh cho tới khi PWA có trên `main`.

Project ID và team ID là định danh công khai, đã được pin thẳng trong workflow để không thể vô tình hướng tới workspace FBMN. **Không dùng project `store` của workspace `alibaba240185`.**

## Chỉ còn thao tác credentials trong GitHub

Các công cụ kết nối không cấp quyền ghi GitHub Actions Secrets / Environments; do vậy Owner phải đặt trực tiếp trên GitHub (không gửi token qua chat).

1. Trên Vercel `gustavjung01`, tạo **access token riêng cho STORE** theo quyền tối thiểu khả dụng và chính sách Vercel.
2. GitHub `gustavjung01/store` → `Settings → Environments`: tạo `preview` và `production`.
3. Trong environment `preview`, tạo secret `VERCEL_TOKEN` từ token trên. Không commit token, không thêm dưới tên `VITE_*`.
4. Trong environment `production`, chỉ thêm `VERCEL_TOKEN` khi sẵn sàng ra mắt; bật **Required reviewers** (nếu GitHub plan của repo cho phép) để duyệt từng lượt production.
5. Để bảo vệ production thêm một lớp, workflow **mặc định khóa production**. Owner phải đặt GitHub repository/environment variable `ENABLE_STORE_PRODUCTION_DEPLOY=true` khi chủ động cho phép phát hành. Khi thiếu/khác `true`, lệnh production sẽ thất bại an toàn.
6. Vercel project phải giữ trạng thái **không kết nối Git**. Nếu ai kết nối lại Git, cơ chế auto-deploy có thể bật trở lại.

Không cần khai báo `VERCEL_ORG_ID` hay `VERCEL_PROJECT_ID` trên GitHub: ID STORE đã được pin trong workflow. Vercel CLI pin `65.12.1`, GitHub checkout và setup-node pin commit SHA.

## Lệnh comment

Sau khi merge workflow vào nhánh `main`, Owner GitHub `gustavjung01` comment chính xác trong **một pull request của STORE**, có thể là PR đã merge:

- `/deploy preview` — chỉ deploy preview từ **HEAD của main**.
- `/deploy production` — chỉ deploy production khi `ENABLE_STORE_PRODUCTION_DEPLOY=true`, có secret đúng environment, và reviewer phê duyệt nếu đã cấu hình.

Workflow không có trigger push/PR/merge. Chỉ một người dùng GitHub ID `276658950` (`gustavjung01`, role OWNER) mới được thực hiện. Comment trên issue thông thường và các lệnh không đúng ký tự không chạy.

**Lưu ý an toàn:** Workflow dùng code `main` thay vì code chưa review trên nhánh PR; token Vercel chỉ có ở bước deploy. Các workflow CI kiểm tra code có thể chạy khi mở PR nhưng **không deploy Vercel**.

## Kiểm tra nghiệm thu

1. Git push/merge không tạo Vercel deployment.
2. Comment người khác hoặc comment sai cú pháp không deploy.
3. `/deploy preview` chạy tests/build và trả Vercel URL của **project STORE đúng tài khoản**.
4. Production mặc định bị chặn nếu chưa bật flag; khi bật yêu cầu đủ credentials/review.
5. Không có secrets hoặc dữ liệu Neon/R2 thật trong repo/log.
6. Không có migration DB, import dữ liệu thật hoặc thao tác trên FBMN.

**Giới hạn hiện tại:** Chưa cấu hình `VERCEL_TOKEN` qua công cụ; chưa chạy Actions end-to-end và chưa deploy bất kỳ môi trường nào. Sau khi có mã PWA trên `main` và thiết lập secret, mới test preview bằng comment.
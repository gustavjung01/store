# STORE — Deploy Production bằng comment GitHub (không có Preview)

## Cấu hình đích đã cố định

- Vercel workspace: `gustavjung01's projects`
- Vercel team ID: `team_964e6EsImAKgZe01NQmUNF7F`
- Project: `store`
- Vercel project ID: `prj_3HViKj8ak29achpJuvToi3fjPoEB`
- Vercel dashboard: https://vercel.com/gustavjung01s-projects/store
- Repo duy nhất: https://github.com/gustavjung01/store
- **Không kết nối Git Integration**; không tự triển khai khi push/merge.
- **Chỉ một môi trường deploy: Production.** Không tạo /deploy preview.

## Owner cần thêm đúng một secret

Vercel CLI cần token để xác thực vào dự án Vercel từ GitHub Actions. Tạo Vercel Access Token trong tài khoản `gustavjung01`, giới hạn scope và thời hạn phù hợp.

Vào GitHub repo STORE → **Settings → Environments → New environment**:

1. Tạo environment tên `production`.
2. Trong **Environment secrets**, tạo `VERCEL_TOKEN` và dán giá trị token Vercel vào đây.
3. Khuyến nghị cấu hình **Required reviewers** và hạn chế quyền triển khai `main` nếu gói GitHub hỗ trợ. Nếu dùng duy nhất một tài khoản Owner, cần hiểu quy định GitHub về tự duyệt để tránh bị chặn vô ý.
4. Không gửi token qua ChatGPT, không commit vào repo hay lưu dưới tên bắt đầu bằng `VITE_`.

**Không cần thêm VERCEL_ORG_ID và VERCEL_PROJECT_ID vào GitHub**: hai mã này đã được pin chính xác trong workflow. Không dùng token hoặc môi trường FBMN.

Công cụ GitHub ở phiên này chưa có quyền ghi vào GitHub Actions Secrets / Environments, vì vậy Owner phải đặt secret trực tiếp trong trang GitHub.

## Chỉ deploy sau một comment của Owner

Sau khi PR chứa workflow được review và merge vào `main`, Owner GitHub `gustavjung01` (ID `276658950`) comment chính xác:

```text
/deploy production
```

Comment trên pull request STORE bất kỳ, kể cả PR đã merge. Workflow `issue_comment` chỉ chạy khi lệnh khớp tuyệt đối, comment từ Owner, trên PR (không phải issue thường).

Workflow sẽ checkout **HEAD của `main`**, không checkout branch PR; kiểm tra typecheck/test/build và chạy Vercel CLI đã pin phiên bản `65.12.1`:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

Kết quả và commit SHA được ghi tại `Actions → Deploy STORE to Vercel Production by comment`. Khi token chưa cấu hình, workflow thất bại an toàn trước bước deploy.

## Điều kiện nghiệm thu

- Push, merge hoặc mở PR không tạo deployment.
- Không có preview flow.
- Không có token hoặc comment không phải Owner => không deploy.
- Comment của Owner deploy **production duy nhất** vào project STORE đúng team.
- Không chạy migrations Neon/động đến R2 FBMN.
- Kiểm tra chức năng và quyền trên production trước khi sử dụng dữ liệu thật.

**Trạng thái hiện tại:** Chưa có token, chưa chạy comment deploy, chưa có deployment. Cần merge các PR sau review và Owner gắn VERCEL_TOKEN vào production environment.

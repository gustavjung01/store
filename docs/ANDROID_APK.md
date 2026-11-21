# STORE Android APK — shared Neon backend

This Android WebView wrapper loads **https://store-nu-opal.vercel.app/**.
It accesses the **same STORE production website**, and therefore the same
configured Neon Auth/API/DB as the web version. No separate inventory database,
duplicated Excel imports, DB credentials, or API secrets are bundled in the APK.

- Android ID `vn.store.inventory`, minimum Android 8 (API 26).
- Native file chooser supports choosing company Excel files.
- HTTPS only, no mixed content, backups disabled. Neon Auth needs cross-origin cookies.
- Fresh network authentication and `app_members` role verification still apply.
- Stock is the Excel import snapshot, not realtime stock.

## Build/release

GitHub Actions `Build STORE Android APK` builds Android on pull requests,
attaches installable `store-android-test.apk` and checksums, and publishes a
public GitHub Release only after merge to main. This is a debug-signed
internal testing build, **not a permanent release signature**. Production
distribution must use a durable keystore stored in protected secrets.

## Independent user accounts, shared data

Self-signup for STORE Neon Auth is disabled. The authorized administrator creates
an Auth identity for each employee on the **same environment**. After verifying
its actual Auth user ID, grant an `active` membership in `public.app_members`
with role `viewer` (read-only) or `admin` (Excel imports). Do not guess user
IDs or grant admin automatically. Employees use their own email/password,
and can use the **Chưa có mật khẩu / Quên mật khẩu?** email flow to set a password.

The backend checks short-lived JWT + membership before serving inventory.
No user provisioning or production DB migration is part of packaging this APK.

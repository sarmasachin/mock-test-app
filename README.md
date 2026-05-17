# MockTestApp (Kotlin + Jetpack Compose)

This repository is a starter for your Mock Test app. Right now it contains the animated **Login / Signup** screen (diagonal split + flip/reveal) similar to the reference images.

## Open & Run (Android Studio)
1. Open **Android Studio** → **Open** → select this folder: `MockTestApp`
2. Let Gradle sync finish.
3. Run the `app` configuration on an emulator/device.

## What’s included
- Jetpack Compose + Material 3
- One-activity app with `AuthRoute`:
  - Login form
  - Signup form
  - Animated diagonal panel transition between the two

## Next steps
- Wire Login/Signup to Room + ViewModel
- Build Home bottom tabs: Home, News, Result, Profile
- Build Test engine screens

## Local API & admin panel

- **API (Node):** from `server/`, run `npm start` — default base URL `http://127.0.0.1:3000/v1`
- **Admin (Vite):** from `admin-web/`, run `npm run dev` — open **`http://localhost:5173/admin/`** (the trailing `/admin/` path is required)

### Admin login without email OTP (local only)

For local development you can skip the email OTP step after a correct admin password:

1. In **`server/.env`** (not committed — see below), set:
   - `ADMIN_DEV_PASSWORD_LOGIN=true`
2. Restart the API server.

The admin UI then completes login on the first step when the API returns `devPasswordBypass`. On **any production or public server**, **omit** `ADMIN_DEV_PASSWORD_LOGIN` or set it to **`false`** so the normal password → email OTP flow is used (same code path; bypass is off when the variable is unset).

Details and commented defaults: `server/.env.example`.

### Git: never push local secrets

- **`server/.env`** and **`admin-web/.env`** are listed in `.gitignore` — **do not commit or force-add them** (`git add -f` on `.env` files).
- Keep **`ADMIN_DEV_PASSWORD_LOGIN`** and all SMTP/database secrets **only** in your local `.env` files.
- Before every push, run `git status` and confirm no `.env` paths appear as staged.

If the bypass-related **code** in `server/src/routes/auth.js` and `admin-web/src/App.tsx` is in your branch, production stays safe **as long as** the production `server/.env` **never** sets `ADMIN_DEV_PASSWORD_LOGIN` to a truthy value.


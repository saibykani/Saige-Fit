# Saige Fit — AI Fitness & Nutrition Coach

Monorepo:

| Path | What |
|---|---|
| `mobile/` | Expo (React Native, TypeScript, Expo Router, TanStack Query, Zustand) |
| `backend/` | FastAPI. Owns all secrets, AI orchestration and the calculation engines |
| `supabase/migrations/` | PostgreSQL schema (0001) + RLS and storage policies (0002) |

## Architecture rules
- The mobile app holds **only** the Supabase URL and anon key. Service-role and AI keys stay in `backend/.env`.
- The backend identifies users **only** from the verified Supabase JWT, never from request bodies.
- Nutrition numbers come from database records scaled by `nutrition_engine`. AI is used to *identify* foods and estimate portions, never to invent calories. Scan results are always labelled estimates and editable.
- Calorie targets are computed server-side (`fitness_engine`) with safety floors, a deficit cap and no deficit for underweight users.
- Every private table has RLS (`user_id = auth.uid()`); storage paths are `<user_id>/<file>`.
- Plan entitlements are rows in `plan_entitlements`, not code constants. Prices are never hardcoded.

## Setup
```bash
# Database: create a Supabase project, then apply migrations in order
supabase db push          # or paste supabase/migrations/*.sql into the SQL editor

# Backend
cd backend
python -m venv .venv && .venv/Scripts/activate      # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env                                 # fill in values
uvicorn app.main:app --reload                        # http://localhost:8000/docs
pytest

# Mobile
cd mobile
npm install
# .env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL
npx expo start
npm run typecheck
```

### Environment variables
Backend (`backend/.env.example`): `ENVIRONMENT`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `VISION_MODEL`, `CHAT_MODEL`, `USDA_API_KEY`,
`CORS_ORIGINS`, `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_AI`, `MAX_UPLOAD_MB`.
Mobile: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.
Use separate Supabase projects and `.env` files for development, staging and production.

## Tests
```bash
cd backend && pytest                      # 442 tests
cd supabase/tests && npm i && for f in *.test.mjs; do node $f; done   # 42 tests on real Postgres (PGlite)
cd mobile && npm run typecheck
```
APK build steps: [docs/BUILD_APK.md](docs/BUILD_APK.md). API: [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

## Status (honest)
**Built and covered by automated tests (backend + DB):** profile/onboarding persistence, consent, export/delete account,
barcode (Open Food Facts) + USDA import, custom/favorite foods, meals, hydration, weight/measurements/photos, analytics,
notification settings, subscriptions/entitlements, exercise library + workout generator + sessions/PRs, diet planner +
shopping list + recommendations, recipes, AI coach with safety rules, weekly report.

**Built, typechecks, but NOT yet run on a device/emulator:** the entire mobile app (auth, 7-step onboarding, home, food
journal, scanner, water, workouts, planner, recipes, progress, coach, analytics, settings, paywall).
Animations, layout and permission flows have not been visually verified.

**Not verified / not done:**
- The real Claude vision and chat calls and the Open Food Facts/USDA calls have never been run (no keys/network in dev); tests use fakes.
- Google/Apple sign-in needs provider setup in Supabase and store credentials.
- Billing is architecture-only: `/v1/subscription/verify` returns 501 until Google Play / App Store credentials exist. Prices are not hardcoded.
- Food values are approximate reference data; import licensed IFCT/USDA data before launch.
- Exercise media are placeholders (no licensed videos); push notifications are scheduled locally.
- APK: a debug-signed release APK (arm64) builds with Gradle (see docs/BUILD_APK.md); it has placeholder Supabase/API values until `mobile/.env` is set, and it has not been run on a device.
- Web: `npx expo export -p web` produces a static site (Vercel config in `mobile/vercel.json`, backend deploys from `backend/`). Welcome, login and register screens were checked in headless Chromium; other screens, camera scan and the step counter were not. On web the session is kept in localStorage.

## Android APK download
Direct link (served from the website): https://saige-fit-app.vercel.app/saige-fit.apk
The file lives at `mobile/public/saige-fit.apk`. Debug-signed, arm64, real login and backend (no demo mode); for testing only.

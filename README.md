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
cd backend && pytest                      # 54 tests: engines, API, scanner, meals, dashboard, auth
cd supabase/tests && npm i && npm test    # 12 tests: migrations + RLS isolation on real Postgres (PGlite)
cd mobile && npm run typecheck
```

## Status (honest)
| Phase | State |
|---|---|
| 1 Foundation | Schema, RLS, JWT auth, rate limiting, design system, tabs: done and tested. Auth screens and onboarding UI **not built** |
| 2 Fitness engine | Targets engine + `/v1/profile/targets` + `/v1/dashboard` done and tested. Saving the profile from onboarding is **not built** |
| 3 Food intelligence | Done server-side and tested with fakes: vision identification pipeline (`/v1/scan`: file validation, consent, entitlement, rate limit), DB matching, engine-computed nutrition, `/v1/meals`, `/v1/foods/search`, 31-food curated seed. **Not done:** mobile camera/gallery/results UI, barcode (Open Food Facts), USDA/IFCT import. **The real Claude vision call has never been run** (no API key in this environment); only a fake client was tested |
| 4-8 | Diet planner, workouts, progress, hydration endpoints, AI chat, notifications, subscriptions, store prep: **not started** |

Curated food values are approximate reference figures, not licensed lab data. Replace or extend them with IFCT and USDA imports before launch.

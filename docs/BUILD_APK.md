# Building the Android APK

Requirements: **Node 20 or 22** (Node 24 breaks Expo SDK 52's config loading), JDK 17, Android SDK (build-tools 34+).

1. `cd mobile && cp .env.example .env` and fill in the three `EXPO_PUBLIC_*` values. They are baked into the app at
   build time, so the APK talks to your Supabase project and your deployed backend (it cannot reach `localhost`).
2. `npm install`
3. `npx expo prebuild --platform android`
4. `cd android && ./gradlew assembleRelease`  (on Windows: `gradlew.bat assembleRelease`)
5. APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`. It is signed with the debug key, so it is fine for
   sideloading and testing. For Play Store, create a release keystore and use an AAB (`./gradlew bundleRelease`).

Cloud alternative (no local SDK): `npx eas-cli build -p android --profile preview` (needs a free Expo account).

Backend must be deployed first (any host that runs `uvicorn app.main:app`), with the Supabase migrations applied and
Google/Apple providers enabled in Supabase Auth if you want social sign-in.

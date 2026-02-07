# NBSC Portal — Android (Capacitor) Build Guide

This project is a React (Vite) frontend + Node/Express backend.
To build an installable Android app (APK/AAB), we wrap the *frontend* with Capacitor.

## Prerequisites (on your computer)
- Node.js LTS installed
- Android Studio installed (includes Android SDK)
- Java JDK 17 (Android Studio usually bundles it)

## Step 1 — Configure backend URL (IMPORTANT)
Android cannot use `localhost` for your backend unless the backend runs on the same phone (it doesn't).
So you must either:

A) Host the backend online (recommended), then set API base URL to `https://YOUR-DOMAIN`
or
B) Run backend on an office PC/server, then use its LAN IP like `http://192.168.1.50:4000`

### Where to change API base
Edit:
`frontend/src/lib/api.js`
Set the base URL to your server URL.

## Step 2 — Install frontend dependencies
```bash
cd CoopApp/frontend
npm install
```

## Step 3 — Initialize Capacitor and add Android
```bash
npx cap init "NBSC Portal" "com.nbstaffcooperative.portal" --web-dir=dist
npx cap add android
```

## Step 4 — Build the web app and sync to Android
```bash
npm run build
npx cap sync android
```

## Step 5 — Open in Android Studio and build APK
```bash
npx cap open android
```

In Android Studio:
- Build > Build Bundle(s) / APK(s) > Build APK(s)

The generated APK will be under:
`android/app/build/outputs/apk/`

## Common Issues
- **Blank screen**: usually wrong API URL or blocked HTTP.
  - Prefer HTTPS for hosted backend.
  - If using HTTP LAN IP, you may need Android network security config (ask if you hit this).
- **CORS**: configure backend CORS to allow your app origin.


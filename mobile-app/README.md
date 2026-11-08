# mobile-app — skeleton, **not** part of the judged demo

This directory has a manifest and a Firebase experiment. It is not a working
application, and the numbers below are the honest inventory rather than a
roadmap claim.

## What actually exists

| File | Lines | State |
|---|---|---|
| `App.tsx` | 0 | **empty** — no entry component |
| `src/screens/DiseaseDetectionScreen.tsx` | 0 | **empty** |
| `src/screens/FirebaseTestScreen.tsx` | 160 | a developer screen that exercises Firebase Auth only |
| `src/contexts/AuthContext.tsx` | 63 | Firebase Auth sign-in; no Kisan360 API token |
| `src/contexts/LocationContext.tsx`, `ThemeContext.tsx` | ~48 / ~36 | device scaffolding |
| `src/services/*` | ~93 total | firebase, storage, notifications, logger |
| `src/navigation/RootNavigator.tsx` | 26 | two screens wired |

There is **no API client, no camera capture, no price, decision, lot, offer or
payment screen.** `grep -r "localhost\|API_URL\|axios" mobile-app/` returns
nothing.

The evaluated product is the web app: **`web-app` + `backend` + `ml-service`**,
which is installable as a PWA (`web-app/public/manifest.json` + service worker)
and therefore works from a phone home screen today. That is the offline/mobile
path the demo relies on.

## What "wiring it up" actually costs

It is a build, not a connection. To make this app match a fifth of the web app:

1. **API client** (`src/services/api.ts`) — base URL from `expo-constants` or
   `EXPO_PUBLIC_API_URL`, bearer token in `expo-secure-store`, and the same
   contract the web app uses (below).
2. **Auth** — replace the Firebase-only flow with `POST /api/auth/demo-login`
   (or Firebase ID tokens, which the API already accepts when the service
   account is configured), then keep the token in secure storage.
3. **Screens** — price lookup, the net-realization decision, lot creation,
   offers, and payment status. The web app is the reference for every one, and
   `docs/SIH26132_COVERAGE.md` names the endpoint behind each screen.
4. **Camera grading** — `expo-camera` capture → `POST /api/grade-assessment`
   with the image plus the AGMARK questionnaire answers; the trained TF.js model
   runs in the browser today, so a native path either ships the same model via
   `react-native-fast-tflite` or relies on the rule engine.
5. **Verification** — an emulator or a device. Nothing in this repo can test it;
   that is the reason it stayed a skeleton while the web app got the effort.

## Endpoint contract to implement against

```
POST /api/auth/demo-login                 { role, district }        → { token, user }
GET  /api/market/prices?crop=&district=                            → current mandi prices
GET  /api/market/net-realization?crop=&district=&quantity=          → ranked mandis, net ₹/q
GET  /api/market/farm-context                                       → crop/calendar context
POST /api/lots                            { crop, quantity, unit, district, … }
POST /api/offers                          { lotId, buyerId, pricePerQuintal }
POST /api/payments/:id/simulate-release   |  /simulate-failure
POST /api/grievances                      { … }                     → dispute path
POST /api/grade-assessment                { crop, imageDataUrl, questionnaire }
```

Every one of these is exercised by the backend suite (`backend/tests/`), so the
contract is pinned by tests rather than by this list.

## If you want to run the skeleton anyway

```bash
cd mobile-app && npm install     # Expo SDK 49 (2023) — expect peer-dep warnings
npm start                        # needs Expo Go or an emulator; nothing else works
```

Note: the repo root also carries a `package.json` + `package-lock.json` with a
*different, stale* Expo dependency set. Nothing in CI, Render, Netlify or the
Procfile reads it. Prefer this directory's manifest and ignore the root one.

# Dependency security posture

Recorded 2026-09-23 with `npm audit --omit=dev` in `backend/` and `web-app/`.
Kept as evidence rather than as a badge: the point is that the remaining
findings are known, scoped, and deliberately deferred, not that the count is
zero.

## Backend — 10 remaining (4 moderate, 5 high, 1 critical)

`npm audit fix` (non-breaking) was applied first: **17 → 10**. That pass cleared
the packages on the request path — `express`, `body-parser`, `qs` — which were
the ones that actually mattered, since they parse every inbound request.

| Package | Severity | Why it is still here |
|---|---|---|
| `protobufjs` | critical | Transitive via `google-gax` ← `firebase-admin` |
| `firebase-admin`, `@google-cloud/firestore`, `@grpc/grpc-js`, `google-gax` | high | Same chain; the fix is a **breaking** major bump of `firebase-admin` |

**Exposure assessment (deliberate, not optimistic).** These are reachable only
when the Firebase Admin SDK talks to Google's servers to verify an ID token. The
protobuf parsing happens on responses from Google's own APIs, not on
attacker-supplied input, so the prototype-pollution class of advisory is not
reachable from a request to this API. Our demo authentication path
(`POST /api/auth/demo-login`) does not touch Firebase at all.

**Decision:** deferred until after the event. `npm audit fix --force` would jump
`firebase-admin` a major version in the middle of a demo freeze, and a broken
auth dependency is a far larger risk than an unreachable parser advisory.

## Web — 3 remaining (1 moderate, 2 high), all `react-router`

Advisory: *"React Router: RSC Mode CSRF Bypass Allows Action Execution Before
400 Response"* (GHSA-qwww-vcr4-c8h2), affecting `react-router` pulled in by
`react-router-dom`.

**Exposure assessment.** The advisory concerns RSC/SSR mode. This is a
client-only SPA compiled to static files — there is no RSC rendering path, no
server-side router, and no action execution to bypass. The same reasoning says
the upgrade is not free: `react-router` 7 is a major with API changes across a
router the whole app is built on.

**Decision:** deferred. Worth revisiting with a dedicated upgrade pass and a full
route-by-route regression, not as part of a pre-demo cleanup.

## What would change these answers

- Adding SSR/RSC, or any server-side rendering of routes → the router finding
  becomes live and must be fixed first.
- Using the Firebase Admin SDK on user-supplied payloads (rather than Google API
  responses) → the protobuf chain becomes reachable.
- A `firebase-admin` 14 upgrade with the full suite green → clears 6 of the 10.

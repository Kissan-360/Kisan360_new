# Kisan360 — GitHub Org Setup Runbook (Team Lead)

Goal: move `rianhussain007/Kisan360_new` into a shared org with a protected `main`
and a Kanban board, so six people can merge via reviewed PRs without breaking the demo.
Only the **Team Lead (GitHub Owner)** can do the org steps below; do them in order.
Timebox: ~30 minutes. Skip nothing — each step protects the demo.

## 1. Create the organization

1. Go to https://github.com/organizations/new
2. Name: `kisan360-sih2026` (free tier is enough). Verify-email, select "free", create.
3. Invite the other 5 members: org page → **People → Invite member** with **Member** role.
   Keep **Owner** for the Team Lead only.

## 2. Transfer (or recreate) the repository inside the org

Preferred — transfer (keeps history/PRs/issues):

1. `rianhussain007/Kisan360_new` → **Settings → Danger Zone → Transfer ownership**.
   Type the repo name to confirm, target: `kisan360-sih2026`.

Fallback — if transfer is not possible:

1. `git remote add upstream https://github.com/rianhussain007/Kisan360_new.git`
2. Create a new **empty** repo `kisan360-sih2026/kisan360`, then push all branches/tags.

After transfer, every member clones the **org repo**:

```bash
git clone https://github.com/kisan360-sih2026/kisan360.git
```

Update the local remote on this machine:

```bash
git remote set-url origin https://github.com/kisan360-sih2026/kisan360.git
git remote -v          # confirm
```

## 3. Default branch `main` + branch protection

1. Repo → **Settings → Branches → Default branch** → switch to `main` (rename `master` → `main` first if needed).
2. **Add branch protection rule** for `main`:
   - ✅ Require a pull request before merging
   - ✅ Require approvals → **1**
   - ✅ Require status checks? (add later once CI exists — not required pre-demo)
   - ✅ Block force pushes / deletions
3. Do the same for any long-lived release branch later.

## 4. Project board (Kanban)

Repo → **Projects → New project** (Board layout). Columns:

```
Backlog | In Progress | In Review | Done
```

One card per task from the Day-by-Day plan (see Team Implementation Plan §4). Move a card when work starts/merges. Update the card list daily at standup.

## 5. Branch & PR conventions

- Branch name: `role/short-description` — e.g. `ml/net-realization-core`, `frontend/lot-ui`, `backend/payment-machine`.
- Every change lands via PR into `main`, tagged with the module owner for review.
- Never merge a half-working feature: `main` must stay demo-able at all times.
- After each merge, the merger updates the "known-good state" note in `README.md`.

```bash
git checkout -b backend/my-change main
# …work + commits…
git push -u origin backend/my-change      # then open PR in the browser
```

## 6. First-day checklist

- [ ] Org created; 6 members invited
- [ ] Repo lives at `kisan360-sih2026/kisan360` (transfer done)
- [ ] Default branch = `main`; 1-review protection on
- [ ] Kanban board with one card per day/role task
- [ ] Each member cloned the org repo, not the personal fork
- [ ] `.env.example` committed; real `.env` shared privately (team channel), never in git
- [ ] This machine's `origin` points at the org repo
- [ ] Branch `backend/team-lead-core` (work in progress) merged via PR once reviewed

#!/usr/bin/env python3
"""
Open the Kisan360 PR via GitHub API using the stored git credential.
Usage: python scripts/create-pr.py
Does not print the token.
"""
import json
import subprocess
import urllib.request

REPO = "Kissan-360/Kisan360_new"
HEAD = "feat/agentic-platform-phase0-4"
BASE = "backend/team-lead-core"

def get_token() -> str:
    inp = "protocol=https\nhost=github.com\n\n"
    out = subprocess.check_output(["git", "credential", "fill"], input=inp.encode(), cwd=".").decode()
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("No stored GitHub credential found (git credential fill returned no password).")

def main():
    token = get_token()
    body = {
        "title": "feat(agentic): Phase 0-19 Kisan360 agentic pipeline + mobile + corpus",
        "head": HEAD,
        "base": BASE,
        "body": (
            "## Summary\n"
            "Phases 0-19 of the Kisan360 agentic advisory platform: classify -> plan -> retrieve -> generate -> validate with Groq Llama 3.3-70B, MobileNetV2 disease, live weather/commodity, React + React Native, Render-ready.\n\n"
            "## Verified\n"
            "- python eval_agent.py 8/8\n"
            "- node eval-intents.js 11/11, e2e-agent.js 9/9, smoke-agent.js ALL PASS\n"
            "- npm test 639 passed (29 suites)\n"
            "- web build OK (44 precache, lazy chunks) · mobile tsc 0\n"
            "- live E2E backend+calc 5/5 (docs/E2E_LIVE_RESULTS.md)\n\n"
            "## Highlights\n"
            "- Agent-first advisory + ask-mode, weather/net-realization/schemes/FPO tools, number-grounding validator\n"
            "- Chat photo -> disease inline, onboarding in EN/MR/HI, WhatsApp share\n"
            "- Mobile: Decision->Lot, Trade+payments, FPO pooling, live camera disease, demo auth\n"
            "- Corpus 217 docs, LangGraph wrapper, model cards, demo script, release v1.1.0-agentic\n"
        ),
    }
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/pulls",
        data=json.dumps(body).encode(),
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
            print(f"PR_CREATED: {data['html_url']} NUMBER:{data['number']}")
    except urllib.error.HTTPError as e:
        print(f"PR_FAILED: {e.code} {e.reason}")
        print(e.read().decode()[:1000])
        # Common cause: PR already exists for this base/head — fetch existing
        try:
            req2 = urllib.request.Request(
                f"https://api.github.com/repos/{REPO}/pulls?head={HEAD}",
                headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}"},
            )
            with urllib.request.urlopen(req2, timeout=30) as resp2:
                existing = json.load(resp2)
                for pr in existing:
                    print(f"EXISTING_PR: {pr['html_url']} NUMBER:{pr['number']} state:{pr['state']}")
        except Exception as e2:
            print(f"list_failed: {e2}")

if __name__ == "__main__":
    main()

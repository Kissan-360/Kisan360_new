#!/usr/bin/env python3
import json, subprocess, urllib.request

REPO = "Kissan-360/Kisan360_new"

def get_token():
    inp = "protocol=https\nhost=github.com\n\n"
    out = subprocess.check_output(["git", "credential", "fill"], input=inp.encode(), cwd=".").decode()
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("no token")

def api(method, path, token, data=None):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        data=json.dumps(data).encode() if data else None,
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)

token = get_token()
prs = api("GET", f"/repos/{REPO}/pulls?state=open", token)
for pr in prs:
    print(f"OPEN: {pr['number']} {pr['title']} {pr['head']['ref']} -> {pr['base']['ref']}")
    merged = api("PUT", f"/repos/{REPO}/pulls/{pr['number']}/merge", token, {
        "merge_method": "squash",
        "commit_title": pr["title"],
        "commit_message": "Squash merge Phase 0-50.",
    })
    print(f"MERGED #{pr['number']}: sha={merged.get('sha')} merged={merged.get('merged')}")

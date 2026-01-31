#!/usr/bin/env python3
import os
import json
import hmac
import hashlib
import sys
from urllib import request, error

# ─── LOAD .env ──────────────────────────────────────────────────────
# pip install python-dotenv  (only needed once)
from dotenv import load_dotenv
load_dotenv()  # this will read a .env file in the same dir

SHARED_SECRET = os.getenv("SHARED_SECRET")
if not SHARED_SECRET:
    print("Error: SHARED_SECRET not set in environment or .env file", file=sys.stderr)
    sys.exit(1)

USER_ID     = os.getenv("USER_ID", "user123")
PROJECT_ID  = os.getenv("PROJECT_ID", "project789")
ENDPOINT    = os.getenv("ENDPOINT", "http://localhost:3000/build-preview-for-new-project")
PROMPT_FILE = os.getenv("PROMPT_FILE", "test-prompt.txt")
# ────────────────────────────────────────────────────────────────────

def main():
    # 1) Read prompt
    try:
        with open(PROMPT_FILE, "r", encoding="utf-8") as f:
            prompt = f.read()
    except FileNotFoundError:
        print(f"Error: cannot find {PROMPT_FILE}", file=sys.stderr)
        sys.exit(1)

    # 2) Build JSON body (no ASCII-escaping of Unicode)
    body = {
        "userId":    USER_ID,
        "projectId": PROJECT_ID,
        "prompt":    prompt
    }
    payload = json.dumps(
        body,
        separators=(',',':'),
        ensure_ascii=False
    ).encode("utf-8")

    # 3) Compute HMAC-SHA256
    sig = hmac.new(
        SHARED_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()

    # 4) Send HTTP POST
    req = request.Request(
        ENDPOINT,
        data=payload,
        headers={
            "Content-Type":      "application/json",
            "x-sheen-signature": sig
        },
        method="POST"
    )

    try:
        with request.urlopen(req) as resp:
            resp_body = resp.read().decode("utf-8")
            print(f"→ HTTP {resp.status}")
            print(resp_body)
    except error.HTTPError as e:
        print(f"→ HTTP {e.code}", file=sys.stderr)
        print(e.read().decode("utf-8"), file=sys.stderr)
        sys.exit(1)
    except error.URLError as e:
        print(f"Request failed: {e.reason}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

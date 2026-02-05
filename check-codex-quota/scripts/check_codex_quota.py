#!/usr/bin/env python3
"""
Query OpenAI Codex quota for a single account.

Usage:
    python check_codex_quota.py <access_token> [--account-id <id>] [--json]
    
Options:
    --account-id    ChatGPT account ID (extracted from token if not provided)
    --json          Output raw JSON instead of formatted table
"""

import sys
import json
import argparse
import base64
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime

USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"

def decode_jwt_payload(token: str) -> dict:
    """Decode JWT token payload without verification."""
    try:
        parts = token.split('.')
        if len(parts) < 2:
            return {}
        
        payload_b64 = parts[1]
        # Add padding if needed
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += '=' * padding
        
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes.decode('utf-8'))
    except Exception:
        return {}

def extract_account_id(token: str) -> str:
    """Extract ChatGPT account ID from access token."""
    payload = decode_jwt_payload(token)
    auth_data = payload.get("https://api.openai.com/auth", {})
    return auth_data.get("chatgpt_account_id", "")

def extract_email(token: str) -> str:
    """Extract email from access token."""
    payload = decode_jwt_payload(token)
    profile = payload.get("https://api.openai.com/profile", {})
    return profile.get("email", "")

def extract_plan(token: str) -> str:
    """Extract plan type from access token."""
    payload = decode_jwt_payload(token)
    auth_data = payload.get("https://api.openai.com/auth", {})
    return auth_data.get("chatgpt_plan_type", "")

def fetch_quota(access_token: str, account_id: str = None) -> dict:
    """Fetch quota from OpenAI Codex API."""
    if not account_id:
        account_id = extract_account_id(access_token)
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    
    if account_id:
        headers["ChatGPT-Account-Id"] = account_id
    
    req = Request(USAGE_URL, headers=headers, method="GET")
    
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}", "message": error_body[:200]}
    except URLError as e:
        return {"error": "Network error", "message": str(e.reason)}

def parse_quota(data: dict, token: str) -> dict:
    """Parse quota data from API response."""
    result = {
        "email": extract_email(token),
        "plan": data.get("plan_type") or extract_plan(token),
        "windows": []
    }
    
    rate_limit = data.get("rate_limit", {})
    
    # Primary window (5-hour session quota)
    primary = rate_limit.get("primary_window", {})
    if primary:
        used = primary.get("used_percent", 0) or 0
        reset_at = primary.get("reset_at")
        reset_dt = datetime.fromtimestamp(reset_at) if reset_at else None
        reset_hours = (reset_at - datetime.now().timestamp()) / 3600 if reset_at else None
        
        result["windows"].append({
            "name": "primary (5h)",
            "used_pct": used,
            "remaining_pct": 100 - used,
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": round(reset_hours, 1) if reset_hours else None,
            "limit_reached": rate_limit.get("limit_reached", False)
        })
    
    # Secondary window (weekly quota)
    secondary = rate_limit.get("secondary_window", {})
    if secondary:
        used = secondary.get("used_percent", 0) or 0
        reset_at = secondary.get("reset_at")
        reset_dt = datetime.fromtimestamp(reset_at) if reset_at else None
        reset_hours = (reset_at - datetime.now().timestamp()) / 3600 if reset_at else None
        
        result["windows"].append({
            "name": "weekly",
            "used_pct": used,
            "remaining_pct": 100 - used,
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": round(reset_hours, 1) if reset_hours else None
        })
    
    # Code review quota (if exists)
    code_review = data.get("code_review_rate_limit", {})
    if code_review and code_review.get("primary_window"):
        primary = code_review["primary_window"]
        used = primary.get("used_percent", 0) or 0
        reset_at = primary.get("reset_at")
        reset_dt = datetime.fromtimestamp(reset_at) if reset_at else None
        reset_hours = (reset_at - datetime.now().timestamp()) / 3600 if reset_at else None
        
        result["windows"].append({
            "name": "code_review",
            "used_pct": used,
            "remaining_pct": 100 - used,
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": round(reset_hours, 1) if reset_hours else None
        })
    
    return result

def format_output(quota: dict) -> str:
    """Format quota as readable output."""
    lines = []
    lines.append(f"📧 Email: {quota['email']}")
    lines.append(f"📋 Plan: {quota['plan']}")
    lines.append("")
    lines.append(f"{'Window':<20} {'Used':>8} {'Remain':>8} {'Reset In':>12}")
    lines.append("-" * 52)
    
    for w in quota["windows"]:
        reset_str = f"{w['reset_hours']:.1f}h" if w.get('reset_hours') else "-"
        status = " ⚠️" if w.get('limit_reached') else ""
        lines.append(
            f"{w['name']:<20} {w['used_pct']:>7}% {w['remaining_pct']:>7}% {reset_str:>12}{status}"
        )
    
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Check OpenAI Codex quota")
    parser.add_argument("token", help="OAuth access token")
    parser.add_argument("--account-id", help="ChatGPT account ID")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    
    args = parser.parse_args()
    
    data = fetch_quota(args.token, args.account_id)
    
    if "error" in data:
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)
    
    quota = parse_quota(data, args.token)
    
    if args.json:
        print(json.dumps(quota, indent=2))
    else:
        print(format_output(quota))

if __name__ == "__main__":
    main()

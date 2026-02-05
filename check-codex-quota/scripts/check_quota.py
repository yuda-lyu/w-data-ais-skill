#!/usr/bin/env python3
"""
Query OpenAI Codex quota for a single account.

Usage:
    python check_quota.py <access_token> <account_id> [--json]
    
Options:
    --json          Output raw JSON instead of formatted table
"""

import sys
import json
import argparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime

USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"

def fetch_quota(access_token: str, account_id: str) -> dict:
    """Fetch quota from ChatGPT API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "ChatGPT-Account-Id": account_id,
        "User-Agent": "Mozilla/5.0"
    }
    
    req = Request(USAGE_URL, headers=headers, method="GET")
    
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}", "message": error_body[:200]}
    except URLError as e:
        return {"error": "Network error", "message": str(e.reason)}

def parse_quota(data: dict) -> dict:
    """Parse quota from API response."""
    result = {
        "plan_type": data.get("plan_type"),
        "session_quota": None,  # 5-hour window
        "weekly_quota": None,
    }
    
    rate_limit = data.get("rate_limit", {})
    
    # Primary window = 5-hour session quota
    primary = rate_limit.get("primary_window", {})
    if primary:
        used_pct = primary.get("used_percent", 0) or 0
        reset_at = primary.get("reset_at")
        reset_dt = None
        reset_hours = None
        if reset_at:
            try:
                reset_dt = datetime.fromtimestamp(reset_at)
                reset_hours = round((reset_at - datetime.now().timestamp()) / 3600, 1)
            except:
                pass
        
        result["session_quota"] = {
            "label": "5h Session",
            "remaining_pct": 100 - used_pct,
            "used_pct": used_pct,
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": reset_hours,
            "window_seconds": primary.get("limit_window_seconds")
        }
    
    # Secondary window = weekly quota
    secondary = rate_limit.get("secondary_window", {})
    if secondary:
        used_pct = secondary.get("used_percent", 0) or 0
        reset_at = secondary.get("reset_at")
        reset_dt = None
        reset_hours = None
        if reset_at:
            try:
                reset_dt = datetime.fromtimestamp(reset_at)
                reset_hours = round((reset_at - datetime.now().timestamp()) / 3600, 1)
            except:
                pass
        
        result["weekly_quota"] = {
            "label": "Weekly",
            "remaining_pct": 100 - used_pct,
            "used_pct": used_pct,
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": reset_hours,
            "window_seconds": secondary.get("limit_window_seconds")
        }
    
    # Check limit reached
    result["limit_reached"] = rate_limit.get("limit_reached", False)
    result["allowed"] = rate_limit.get("allowed", True)
    
    return result

def format_output(quota: dict) -> str:
    """Format quota as readable output."""
    lines = []
    
    lines.append(f"Plan: {quota.get('plan_type', 'unknown')}")
    lines.append(f"Limit Reached: {'Yes ⚠️' if quota.get('limit_reached') else 'No ✅'}")
    lines.append("")
    lines.append(f"{'Quota Type':<15} {'Used':>8} {'Remain':>8} {'Reset In':>12}")
    lines.append("-" * 48)
    
    if quota.get("session_quota"):
        q = quota["session_quota"]
        reset_str = f"{q['reset_hours']:.1f}h" if q['reset_hours'] else "-"
        lines.append(
            f"{q['label']:<15} {q['used_pct']:>7}% {q['remaining_pct']:>7}% {reset_str:>12}"
        )
    
    if quota.get("weekly_quota"):
        q = quota["weekly_quota"]
        reset_str = f"{q['reset_hours']:.1f}h" if q['reset_hours'] else "-"
        lines.append(
            f"{q['label']:<15} {q['used_pct']:>7}% {q['remaining_pct']:>7}% {reset_str:>12}"
        )
    
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Check OpenAI Codex quota")
    parser.add_argument("token", help="OAuth access token")
    parser.add_argument("account_id", help="ChatGPT Account ID")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    
    args = parser.parse_args()
    
    data = fetch_quota(args.token, args.account_id)
    
    if "error" in data:
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)
    
    quota = parse_quota(data)
    
    if args.json:
        print(json.dumps(quota, indent=2))
    else:
        print(format_output(quota))

if __name__ == "__main__":
    main()

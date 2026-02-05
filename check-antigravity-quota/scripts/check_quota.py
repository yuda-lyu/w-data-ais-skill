#!/usr/bin/env python3
"""
Query Google Antigravity quota for a single account.

Usage:
    python check_quota.py <access_token> [--json] [--project-id <id>]
    
Options:
    --json          Output raw JSON instead of formatted table
    --project-id    Optional project ID for the API call
"""

import sys
import json
import argparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime

BASE_URL = "https://cloudcode-pa.googleapis.com"
FETCH_MODELS_PATH = "/v1internal:fetchAvailableModels"

def fetch_quota(access_token: str, project_id: str = None) -> dict:
    """Fetch model quotas from Antigravity API."""
    url = f"{BASE_URL}{FETCH_MODELS_PATH}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "User-Agent": "antigravity",
        "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1"
    }
    
    body = json.dumps({"project": project_id} if project_id else {}).encode()
    
    req = Request(url, data=body, headers=headers, method="POST")
    
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}", "message": error_body}
    except URLError as e:
        return {"error": "Network error", "message": str(e.reason)}

def parse_reset_time(reset_time_str):
    """Parse reset time from ISO string or epoch ms."""
    if not reset_time_str:
        return None, None
    try:
        # Try ISO format first (e.g., "2026-02-05T17:43:36Z")
        if isinstance(reset_time_str, str) and 'T' in reset_time_str:
            reset_dt = datetime.fromisoformat(reset_time_str.replace('Z', '+00:00'))
            reset_hours = (reset_dt.timestamp() - datetime.now().timestamp()) / 3600
            return reset_dt, round(reset_hours, 1)
        # Try epoch ms
        reset_ts = int(reset_time_str) / 1000
        reset_dt = datetime.fromtimestamp(reset_ts)
        reset_hours = (reset_ts - datetime.now().timestamp()) / 3600
        return reset_dt, round(reset_hours, 1)
    except:
        return None, None

def extract_quotas(data: dict) -> list:
    """Extract quota info from API response."""
    results = []
    models = data.get("models", {})
    
    for model_id, model_info in models.items():
        # Skip internal models
        lower_id = model_id.lower()
        if "chat_" in lower_id or "tab_" in lower_id:
            continue
            
        quota_info = model_info.get("quotaInfo", {})
        remaining = quota_info.get("remainingFraction")
        reset_time_str = quota_info.get("resetTime")
        
        # remainingFraction=None means 0% remaining (exhausted)
        if remaining is None:
            remaining = 0.0
        
        reset_dt, reset_hours = parse_reset_time(reset_time_str)
        
        results.append({
            "model": model_id,
            "remaining_pct": round(remaining * 100, 1),
            "used_pct": round((1 - remaining) * 100, 1),
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": reset_hours
        })
    
    # Sort by usage (highest first)
    results.sort(key=lambda x: x["used_pct"], reverse=True)
    return results

def format_table(quotas: list) -> str:
    """Format quotas as a readable table."""
    if not quotas:
        return "No quota data available."
    
    lines = []
    lines.append(f"{'Model':<40} {'Used':>8} {'Remain':>8} {'Reset In':>12}")
    lines.append("-" * 72)
    
    for q in quotas:
        reset_str = f"{q['reset_hours']:.1f}h" if q['reset_hours'] else "-"
        lines.append(
            f"{q['model']:<40} {q['used_pct']:>7.1f}% {q['remaining_pct']:>7.1f}% {reset_str:>12}"
        )
    
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Check Google Antigravity quota")
    parser.add_argument("token", help="OAuth access token")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--project-id", help="Optional project ID")
    
    args = parser.parse_args()
    
    data = fetch_quota(args.token, args.project_id)
    
    if "error" in data:
        print(json.dumps(data, indent=2), file=sys.stderr)
        sys.exit(1)
    
    quotas = extract_quotas(data)
    
    if args.json:
        print(json.dumps(quotas, indent=2))
    else:
        print(format_table(quotas))

if __name__ == "__main__":
    main()

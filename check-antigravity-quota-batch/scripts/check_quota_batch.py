#!/usr/bin/env python3
"""
Batch query Google Antigravity quota for multiple accounts.

Usage:
    python check_quota_batch.py <auth_profiles_path> [--json] [--provider google-antigravity]
    
Examples:
    python check_quota_batch.py ~/.openclaw/agents/main/agent/auth-profiles.json
    python check_quota_batch.py ~/.openclaw/agents/main/agent/auth-profiles.json --json
"""

import sys
import os
import json
import argparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

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
    
    results.sort(key=lambda x: x["used_pct"], reverse=True)
    return results

def load_accounts(profiles_path: str, provider: str = "google-antigravity") -> list:
    """Load accounts from auth-profiles.json."""
    with open(os.path.expanduser(profiles_path)) as f:
        data = json.load(f)
    
    accounts = []
    for key, profile in data.get("profiles", {}).items():
        if profile.get("provider") == provider:
            email = profile.get("email") or key.split(":")[-1]
            accounts.append({
                "email": email,
                "access_token": profile.get("access"),
                "project_id": profile.get("projectId"),
                "expires": profile.get("expires")
            })
    
    return accounts

def query_account(account: dict) -> dict:
    """Query quota for a single account."""
    result = {
        "email": account["email"],
        "project_id": account.get("project_id"),
        "token_expires": datetime.fromtimestamp(account["expires"] / 1000).isoformat() if account.get("expires") else None
    }
    
    # Check if token expired
    if account.get("expires"):
        if account["expires"] < datetime.now().timestamp() * 1000:
            result["error"] = "Token expired"
            result["quotas"] = []
            return result
    
    data = fetch_quota(account["access_token"], account.get("project_id"))
    
    if "error" in data:
        result["error"] = data["error"]
        result["quotas"] = []
    else:
        result["quotas"] = extract_quotas(data)
    
    return result

def format_report(results: list) -> str:
    """Format batch results as readable report."""
    lines = []
    
    for r in results:
        lines.append(f"\n{'='*60}")
        lines.append(f"📧 {r['email']}")
        if r.get("error"):
            lines.append(f"   ❌ Error: {r['error']}")
            continue
        
        if not r["quotas"]:
            lines.append("   (no quota data)")
            continue
        
        lines.append(f"   {'Model':<35} {'Used':>7} {'Remain':>7} {'Reset':>8}")
        lines.append(f"   {'-'*57}")
        
        for q in r["quotas"][:10]:  # Top 10 per account
            reset_str = f"{q['reset_hours']:.0f}h" if q['reset_hours'] else "-"
            lines.append(
                f"   {q['model']:<35} {q['used_pct']:>6.1f}% {q['remaining_pct']:>6.1f}% {reset_str:>8}"
            )
    
    # Summary
    lines.append(f"\n{'='*60}")
    lines.append("📊 Summary")
    lines.append(f"   Total accounts: {len(results)}")
    lines.append(f"   Errors: {sum(1 for r in results if r.get('error'))}")
    
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Batch check Antigravity quota")
    parser.add_argument("profiles_path", help="Path to auth-profiles.json")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--provider", default="google-antigravity", help="Provider filter")
    
    args = parser.parse_args()
    
    accounts = load_accounts(args.profiles_path, args.provider)
    
    if not accounts:
        print(f"No {args.provider} accounts found", file=sys.stderr)
        sys.exit(1)
    
    # Query in parallel
    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(query_account, acc): acc for acc in accounts}
        for future in as_completed(futures):
            results.append(future.result())
    
    # Sort by email
    results.sort(key=lambda x: x["email"])
    
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(format_report(results))

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Batch query AI model quota for all accounts (Google Antigravity + OpenAI Codex).

Usage:
    python check_quota_batch.py <auth_profiles_path> [--json]
    
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

# API Endpoints
ANTIGRAVITY_URL = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels"
CODEX_URL = "https://chatgpt.com/backend-api/wham/usage"

# Model display order (models not in list will appear at the end)
MODEL_ORDER = [
    "claude-opus-4-5-thinking",
    "claude-sonnet-4-5-thinking",
    "claude-sonnet-4-5",
    "gemini-3-pro-high",
    "gemini-3-pro-low",
    "gemini-3-pro-image",
    "gemini-3-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-thinking",
    "gemini-2.5-flash-lite",
    "gpt-oss-120b-medium",
]

def get_model_sort_key(model_name: str) -> int:
    """Get sort key for model based on MODEL_ORDER."""
    try:
        return MODEL_ORDER.index(model_name)
    except ValueError:
        return len(MODEL_ORDER)  # Unknown models go to the end

def parse_reset_time(reset_time_str):
    """Parse reset time from ISO string or epoch."""
    if not reset_time_str:
        return None, None
    try:
        # ISO format (e.g., "2026-02-05T17:43:36Z")
        if isinstance(reset_time_str, str) and 'T' in reset_time_str:
            reset_dt = datetime.fromisoformat(reset_time_str.replace('Z', '+00:00'))
            reset_hours = (reset_dt.timestamp() - datetime.now().timestamp()) / 3600
            return reset_dt, round(reset_hours, 1)
        # Epoch seconds or ms
        ts = float(reset_time_str)
        if ts > 1e12:  # milliseconds
            ts = ts / 1000
        reset_dt = datetime.fromtimestamp(ts)
        reset_hours = (ts - datetime.now().timestamp()) / 3600
        return reset_dt, round(reset_hours, 1)
    except:
        return None, None

# ============ Google Antigravity ============

def fetch_antigravity_quota(access_token: str, project_id: str = None) -> dict:
    """Fetch model quotas from Antigravity API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "User-Agent": "antigravity",
        "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1"
    }
    
    body = json.dumps({"project": project_id} if project_id else {}).encode()
    req = Request(ANTIGRAVITY_URL, data=body, headers=headers, method="POST")
    
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode()[:200] if e.fp else ""
        return {"error": f"HTTP {e.code}", "message": error_body}
    except URLError as e:
        return {"error": "Network error", "message": str(e.reason)}

def extract_antigravity_quotas(data: dict) -> list:
    """Extract quota info from Antigravity API response."""
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
    
    # Sort by predefined model order
    results.sort(key=lambda x: get_model_sort_key(x["model"]))
    return results

def query_antigravity_account(account: dict) -> dict:
    """Query quota for a single Antigravity account."""
    result = {
        "provider": "google-antigravity",
        "email": account["email"],
        "project_id": account.get("project_id"),
    }
    
    # Check if token expired
    if account.get("expires"):
        if account["expires"] < datetime.now().timestamp() * 1000:
            result["error"] = "Token expired"
            result["quotas"] = []
            return result
    
    data = fetch_antigravity_quota(account["access_token"], account.get("project_id"))
    
    if "error" in data:
        result["error"] = data["error"]
        result["quotas"] = []
    else:
        result["quotas"] = extract_antigravity_quotas(data)
    
    return result

# ============ OpenAI Codex ============

def fetch_codex_quota(access_token: str, account_id: str) -> dict:
    """Fetch quota from ChatGPT API."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "ChatGPT-Account-Id": account_id,
        "User-Agent": "Mozilla/5.0"
    }
    
    req = Request(CODEX_URL, headers=headers, method="GET")
    
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode()[:200] if e.fp else ""
        return {"error": f"HTTP {e.code}", "message": error_body}
    except URLError as e:
        return {"error": "Network error", "message": str(e.reason)}

def extract_codex_quotas(data: dict) -> list:
    """Extract quota info from Codex API response."""
    results = []
    rate_limit = data.get("rate_limit", {})
    
    # Primary window = 5-hour session quota
    primary = rate_limit.get("primary_window", {})
    if primary:
        used_pct = primary.get("used_percent", 0) or 0
        reset_at = primary.get("reset_at")
        reset_dt, reset_hours = parse_reset_time(reset_at)
        
        results.append({
            "model": "codex-session-5h",
            "remaining_pct": 100 - used_pct,
            "used_pct": used_pct,
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": reset_hours
        })
    
    # Secondary window = weekly quota
    secondary = rate_limit.get("secondary_window", {})
    if secondary:
        used_pct = secondary.get("used_percent", 0) or 0
        reset_at = secondary.get("reset_at")
        reset_dt, reset_hours = parse_reset_time(reset_at)
        
        results.append({
            "model": "codex-weekly",
            "remaining_pct": 100 - used_pct,
            "used_pct": used_pct,
            "reset_time": reset_dt.isoformat() if reset_dt else None,
            "reset_hours": reset_hours
        })
    
    # Keep order: session-5h first, then weekly (no sorting needed, already in order)
    return results

def query_codex_account(account: dict) -> dict:
    """Query quota for a single Codex account."""
    result = {
        "provider": "openai-codex",
        "email": account.get("email", account.get("account_id", "unknown")),
        "account_id": account.get("account_id"),
        "plan_type": None,
    }
    
    # Check if token expired
    if account.get("expires"):
        if account["expires"] < datetime.now().timestamp() * 1000:
            result["error"] = "Token expired"
            result["quotas"] = []
            return result
    
    data = fetch_codex_quota(account["access_token"], account["account_id"])
    
    if "error" in data:
        result["error"] = data["error"]
        result["quotas"] = []
    else:
        result["quotas"] = extract_codex_quotas(data)
        result["plan_type"] = data.get("plan_type")
        result["limit_reached"] = data.get("rate_limit", {}).get("limit_reached", False)
    
    return result

# ============ Main ============

def load_all_accounts(profiles_path: str) -> tuple:
    """Load all accounts from auth-profiles.json."""
    with open(os.path.expanduser(profiles_path)) as f:
        data = json.load(f)
    
    antigravity_accounts = []
    codex_accounts = []
    
    for key, profile in data.get("profiles", {}).items():
        provider = profile.get("provider")
        
        if provider == "google-antigravity":
            email = profile.get("email") or key.split(":")[-1]
            antigravity_accounts.append({
                "email": email,
                "access_token": profile.get("access"),
                "project_id": profile.get("projectId"),
                "expires": profile.get("expires")
            })
        
        elif provider == "openai-codex":
            # Extract email from JWT if possible
            email = key.split(":")[-1] if ":" in key else None
            codex_accounts.append({
                "email": email,
                "access_token": profile.get("access"),
                "account_id": profile.get("accountId"),
                "expires": profile.get("expires")
            })
    
    return antigravity_accounts, codex_accounts

def format_report(results: list) -> str:
    """Format batch results as readable report."""
    lines = []
    
    # Group by provider
    antigravity_results = [r for r in results if r["provider"] == "google-antigravity"]
    codex_results = [r for r in results if r["provider"] == "openai-codex"]
    
    if antigravity_results:
        lines.append("\n" + "=" * 60)
        lines.append("🌐 Google Antigravity Accounts")
        lines.append("=" * 60)
        
        for r in antigravity_results:
            lines.append(f"\n📧 {r['email']}")
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
    
    if codex_results:
        lines.append("\n" + "=" * 60)
        lines.append("🤖 OpenAI Codex Accounts")
        lines.append("=" * 60)
        
        for r in codex_results:
            lines.append(f"\n📧 {r['email']} (Plan: {r.get('plan_type', 'unknown')})")
            if r.get("limit_reached"):
                lines.append("   ⚠️ LIMIT REACHED")
            if r.get("error"):
                lines.append(f"   ❌ Error: {r['error']}")
                continue
            
            if not r["quotas"]:
                lines.append("   (no quota data)")
                continue
            
            lines.append(f"   {'Quota Type':<35} {'Used':>7} {'Remain':>7} {'Reset':>8}")
            lines.append(f"   {'-'*57}")
            
            for q in r["quotas"]:
                reset_str = f"{q['reset_hours']:.0f}h" if q['reset_hours'] else "-"
                lines.append(
                    f"   {q['model']:<35} {q['used_pct']:>6.1f}% {q['remaining_pct']:>6.1f}% {reset_str:>8}"
                )
    
    # Summary
    lines.append(f"\n{'='*60}")
    lines.append("📊 Summary")
    lines.append(f"   Google Antigravity: {len(antigravity_results)} accounts")
    lines.append(f"   OpenAI Codex: {len(codex_results)} accounts")
    lines.append(f"   Total: {len(results)} accounts")
    lines.append(f"   Errors: {sum(1 for r in results if r.get('error'))}")
    
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Batch check all AI account quotas")
    parser.add_argument("profiles_path", help="Path to auth-profiles.json")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    
    args = parser.parse_args()
    
    antigravity_accounts, codex_accounts = load_all_accounts(args.profiles_path)
    
    total = len(antigravity_accounts) + len(codex_accounts)
    if total == 0:
        print("No accounts found in auth-profiles.json", file=sys.stderr)
        sys.exit(1)
    
    # Query all accounts in parallel
    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = []
        
        for acc in antigravity_accounts:
            futures.append(executor.submit(query_antigravity_account, acc))
        
        for acc in codex_accounts:
            futures.append(executor.submit(query_codex_account, acc))
        
        for future in as_completed(futures):
            results.append(future.result())
    
    # Sort by provider then email
    results.sort(key=lambda x: (x["provider"], x.get("email", "")))
    
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(format_report(results))

if __name__ == "__main__":
    main()

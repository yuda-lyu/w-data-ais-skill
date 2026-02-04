#!/usr/bin/env python3
"""
台股調研任務初始化腳本
建立目錄結構和 progress.json
"""

import json
import os
from datetime import datetime

def init_task(base_path: str = None):
    if base_path is None:
        base_path = os.path.expanduser("~/.openclaw/workspace/tasks/stock-research")
    
    # 建立目錄結構
    dirs = [
        base_path,
        f"{base_path}/raw/mops",
        f"{base_path}/raw/cnyes",
        f"{base_path}/raw/statementdog",
        f"{base_path}/raw/moneydj",
        f"{base_path}/raw/goodinfo",
    ]
    
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        print(f"[OK] {d}")
    
    # 建立 progress.json
    today = datetime.now()
    progress = {
        "task_id": f"stock-research-{today.strftime('%Y-%m-%d')}",
        "mode": "parallel",
        "target_date": f"{today.year - 1911}/{today.month:02d}/{today.day:02d}",
        "started_at": today.isoformat() + "Z",
        "agents": {
            "mops": {"status": "pending"},
            "cnyes": {"status": "pending"},
            "statementdog": {"status": "pending"},
            "moneydj": {"status": "pending"},
            "goodinfo": {"status": "pending"},
        },
        "phase4_complete": False,
        "last_updated": None
    }
    
    progress_path = f"{base_path}/progress.json"
    with open(progress_path, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)
    print(f"[OK] {progress_path}")
    
    print(f"\n✅ 任務初始化完成：{base_path}")
    return base_path

if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else None
    init_task(path)

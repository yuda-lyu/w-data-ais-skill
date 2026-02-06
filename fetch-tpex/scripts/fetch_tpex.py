#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import datetime as dt
import json
import os
import sys
from typing import Any, Dict, List, Optional

import requests

TPEX_URL = "https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php"


def to_roc(date_yyyymmdd: str) -> str:
    d = dt.datetime.strptime(date_yyyymmdd, "%Y%m%d").date()
    roc_year = d.year - 1911
    return f"{roc_year:03d}/{d.month:02d}/{d.day:02d}"


def parse_float(s: Any) -> Optional[float]:
    if s is None:
        return None
    s = str(s).strip().replace(",", "")
    if s in ("", "--", "-", "N/A"):
        return None
    # TPEX change can include trailing spaces
    try:
        return float(s)
    except Exception:
        return None


def parse_int(s: Any) -> Optional[int]:
    if s is None:
        return None
    s = str(s).strip().replace(",", "")
    if s in ("", "--", "-", "N/A"):
        return None
    try:
        return int(float(s))
    except Exception:
        return None


def fetch_table(date_yyyymmdd: str, timeout: int = 30) -> Dict[str, Any]:
    roc = to_roc(date_yyyymmdd)
    params = {"l": "zh-tw", "d": roc, "s": "0,asc,0", "o": "json"}
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(TPEX_URL, params=params, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.json()


def extract_prices(j: Dict[str, Any], codes: List[str], date_yyyymmdd: str) -> Dict[str, Any]:
    stat = j.get("stat")
    if str(stat).upper() != "OK": 
        return {
            "source": "tpex",
            "fetchTime": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "date": date_yyyymmdd,
            "dateROC": to_roc(date_yyyymmdd),
            "stocks": [],
            "error": {"type": "non-trading", "message": "TPEX stat not OK", "details": str(stat)},
        }

    tables = j.get("tables") or []
    if not tables or not isinstance(tables, list) or not isinstance(tables[0], dict):
        return {
            "source": "tpex",
            "fetchTime": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "date": date_yyyymmdd,
            "dateROC": to_roc(date_yyyymmdd),
            "stocks": [],
            "error": {"type": "parse", "message": "Unexpected TPEX tables format", "details": None},
        }

    t0 = tables[0]
    fields = t0.get("fields") or []
    data = t0.get("data") or []

    # indices by field names
    def idx(name: str) -> int:
        try:
            return fields.index(name)
        except ValueError:
            return -1

    i_code = idx("代號")
    i_name = idx("名稱")
    i_close = idx("收盤")
    i_change = idx("漲跌")
    i_open = idx("開盤")
    i_high = idx("最高")
    i_low = idx("最低")
    i_vol = idx("成交股數")

    if min(i_code, i_name, i_open, i_close) < 0:
        return {
            "source": "tpex",
            "fetchTime": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "date": date_yyyymmdd,
            "dateROC": to_roc(date_yyyymmdd),
            "stocks": [],
            "error": {"type": "parse", "message": "Missing expected fields", "details": fields},
        }

    wanted = set(codes)
    found: Dict[str, Dict[str, Any]] = {}

    for row in data:
        if not isinstance(row, list) or len(row) <= max(i_code, i_low, i_high, i_close, i_open):
            continue
        code = str(row[i_code]).strip()
        if code not in wanted:
            continue
        open_ = parse_float(row[i_open])
        close_ = parse_float(row[i_close])
        high_ = parse_float(row[i_high])
        low_ = parse_float(row[i_low])
        chg = parse_float(row[i_change]) if i_change >= 0 else None
        vol = parse_int(row[i_vol]) if i_vol >= 0 else None

        chg_pct = None
        if open_ is not None and close_ is not None and open_ != 0:
            chg_pct = (close_ - open_) / open_ * 100

        found[code] = {
            "code": code,
            "name": str(row[i_name]).strip(),
            "open": open_,
            "high": high_,
            "low": low_,
            "close": close_,
            "change": chg,
            "changePercent": None if chg_pct is None else round(chg_pct, 2),
            "volume": vol,
        }

    missing = [c for c in codes if c not in found]

    out = {
        "source": "tpex",
        "fetchTime": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "date": date_yyyymmdd,
        "dateROC": to_roc(date_yyyymmdd),
        "stocks": [found.get(c) for c in codes],
        "error": None,
    }

    if missing:
        out["error"] = {
            "type": "not-found",
            "message": "Some codes not found in TPEX table",
            "details": missing,
        }

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("date", help="YYYYMMDD")
    ap.add_argument("codes", nargs="+", help="stock codes (e.g., 6499 6610)")
    ap.add_argument("--json", action="store_true", help="output JSON only")
    args = ap.parse_args()

    try:
        j = fetch_table(args.date)
        out = extract_prices(j, args.codes, args.date)
    except Exception as e:
        out = {
            "source": "tpex",
            "fetchTime": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "date": args.date,
            "dateROC": to_roc(args.date),
            "stocks": [],
            "error": {"type": "exception", "message": str(e), "details": repr(e)},
        }

    if args.json:
        print(json.dumps(out, ensure_ascii=False))
        return

    # pretty
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

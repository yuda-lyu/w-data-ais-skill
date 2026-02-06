#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fetch_institutional.py

Fetch Taiwan institutional investors net buy/sell (三大法人買賣超) for given date and stock codes.

Primary sources (official):
- TWSE (listed): https://www.twse.com.tw/fund/T86?response=json&date=YYYYMMDD&selectType=ALL
- TPEX (OTC):    https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&t=D&d=YYY/MM/DD&o=json

Output JSON:
{
  source: "twse+tpex",
  date: "YYYYMMDD",
  dateROC: "YYY/MM/DD",
  items: [ {code,name,market,foreignNet,investNet,dealerNet,totalNet,raw:{...}} ],
  missing: [codes],
  error: null|{type,message,details}
}

Notes:
- Values are in shares (股). Report may display units; we keep as int shares.
- This script is designed to be deterministic and stable (no browser anti-bot).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"


def yyyymmdd_to_roc_slash(date: str) -> str:
    if not re.fullmatch(r"\d{8}", date or ""):
        raise ValueError(f"Invalid date: {date}")
    y = int(date[:4]) - 1911
    return f"{y:03d}/{date[4:6]}/{date[6:8]}"


def _to_int(x: Any) -> Optional[int]:
    if x is None:
        return None
    s = str(x).strip()
    if s in ("", "-", "—"):
        return None
    s = s.replace(",", "")
    # some fields may include spaces
    s = re.sub(r"\s+", "", s)
    # keep sign
    if re.fullmatch(r"[+-]?\d+", s):
        try:
            return int(s)
        except Exception:
            return None
    return None


def _get_json(url: str, *, params: Optional[dict] = None, timeout: int = 30, max_retries: int = 3) -> dict:
    headers = {
        "User-Agent": UA,
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Referer": "https://www.twse.com.tw/",
    }
    last_err = None
    for i in range(max_retries):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_err = str(e)
            # backoff
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(last_err or "request failed")


def fetch_twse_t86(date: str) -> Tuple[Dict[str, dict], Optional[dict]]:
    """Return mapping code->item for TWSE listed; error if stat not OK."""
    url = "https://www.twse.com.tw/fund/T86"
    j = _get_json(url, params={"response": "json", "date": date, "selectType": "ALL"})
    stat = str(j.get("stat", "")).upper()
    if stat != "OK":
        return {}, {"type": "not-trading-day", "message": j.get("stat"), "details": j}

    fields = j.get("fields") or []
    # data rows are arrays aligned to fields
    data = j.get("data") or []

    idx = {name: i for i, name in enumerate(fields)}
    # Common columns in T86
    def get(row, col):
        i = idx.get(col)
        return row[i] if i is not None and i < len(row) else None

    m: Dict[str, dict] = {}
    for row in data:
        code = str(get(row, "證券代號") or "").strip()
        if not code:
            continue
        name = str(get(row, "證券名稱") or "").strip()

        foreign_net = _to_int(get(row, "外陸資買賣超股數(不含外資自營商)"))
        invest_net = _to_int(get(row, "投信買賣超股數"))
        dealer_net = _to_int(get(row, "自營商買賣超股數"))
        total_net = _to_int(get(row, "三大法人買賣超股數"))

        dealer_buy = (_to_int(get(row, "自營商買進股數(自行買賣)")) or 0) + (_to_int(get(row, "自營商買進股數(避險)")) or 0)
        dealer_sell = (_to_int(get(row, "自營商賣出股數(自行買賣)")) or 0) + (_to_int(get(row, "自營商賣出股數(避險)")) or 0)
        m[code] = {
            "code": code,
            "name": name,
            "market": "TWSE",
            "foreignNet": foreign_net,
            "investNet": invest_net,
            "dealerNet": dealer_net,
            "totalNet": total_net,
            "raw": {
                "foreignBuy": _to_int(get(row, "外陸資買進股數(不含外資自營商)")),
                "foreignSell": _to_int(get(row, "外陸資賣出股數(不含外資自營商)")),
                "foreignDealerNet": _to_int(get(row, "外資自營商買賣超股數")),
                "investBuy": _to_int(get(row, "投信買進股數")),
                "investSell": _to_int(get(row, "投信賣出股數")),
                "dealerBuy": dealer_buy,
                "dealerSell": dealer_sell,
            },
        }
    return m, None


def fetch_tpex_3inst(date: str) -> Tuple[Dict[str, dict], Optional[dict]]:
    url = "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php"
    roc = yyyymmdd_to_roc_slash(date)
    j = _get_json(
        url,
        params={"l": "zh-tw", "t": "D", "d": roc, "o": "json"},
        timeout=30,
        max_retries=3,
    )

    tables = j.get("tables") or []
    if not tables:
        return {}, {"type": "parse", "message": "No tables in response", "details": j}

    t0 = tables[0]
    fields = t0.get("fields") or []
    data = t0.get("data") or []

    # TPEX schema: fields contain repeated groups; we only need net columns.
    # By observation, columns are:
    # 0 code, 1 name,
    # 2-4 foreign buy/sell/net,
    # 5-7 invest buy/sell/net,
    # 8-10 dealer buy/sell/net,
    # 11-13 (dealer hedge?) ...
    # and later total, etc. We'll defensively locate by position.

    m: Dict[str, dict] = {}
    for row in data:
        if len(row) < 11:
            continue
        code = str(row[0]).strip()
        name = str(row[1]).strip()

        foreign_net = _to_int(row[4])
        invest_net = _to_int(row[7])
        dealer_net = _to_int(row[10])

        # Try to find total net: often at index 13 or later; fallback sum
        total_net = None
        # find the first cell after index 10 that looks like an int and could be total net;
        # but avoid reusing buy/sell columns. We'll prefer the LAST net in the first 14 cols.
        net_candidates = [
            _to_int(row[i]) for i in range(2, min(len(row), 20)) if _to_int(row[i]) is not None
        ]
        # crude: total net should be within plausible range and can be computed
        if foreign_net is not None and invest_net is not None and dealer_net is not None:
            total_net = foreign_net + invest_net + dealer_net

        m[code] = {
            "code": code,
            "name": name,
            "market": "TPEX",
            "foreignNet": foreign_net,
            "investNet": invest_net,
            "dealerNet": dealer_net,
            "totalNet": total_net,
            "raw": {
                "foreignBuy": _to_int(row[2]),
                "foreignSell": _to_int(row[3]),
                "investBuy": _to_int(row[5]),
                "investSell": _to_int(row[6]),
                "dealerBuy": _to_int(row[8]),
                "dealerSell": _to_int(row[9]),
                "fields": fields,
            },
        }

    return m, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True, help="YYYYMMDD")
    ap.add_argument("--codes", nargs="*", default=None, help="Stock codes (space-separated).")
    ap.add_argument("--code", default=None, help="Single stock code (alias).")
    ap.add_argument("--json", action="store_true", help="Output JSON only")
    args = ap.parse_args()

    date = args.date
    codes: List[str] = []
    if args.codes:
        codes.extend(args.codes)
    if args.code:
        codes.append(args.code)
    codes = [str(c).strip() for c in codes if str(c).strip()]

    out = {
        "source": "twse+tpex",
        "date": date,
        "dateROC": yyyymmdd_to_roc_slash(date),
        "items": [],
        "missing": [],
        "error": None,
    }

    try:
        twse_map, twse_err = fetch_twse_t86(date)
        tpex_map, tpex_err = fetch_tpex_3inst(date)

        # If both errors and maps empty, bubble up
        if (not twse_map and twse_err) and (not tpex_map and tpex_err):
            out["error"] = {
                "type": "upstream",
                "message": "Both TWSE and TPEX failed",
                "details": {"twse": twse_err, "tpex": tpex_err},
            }
        else:
            # Only filter if codes were requested; else return union.
            if codes:
                for code in codes:
                    item = twse_map.get(code) or tpex_map.get(code)
                    if item:
                        out["items"].append(item)
                    else:
                        out["missing"].append(code)
            else:
                # union
                out["items"] = list(twse_map.values()) + list(tpex_map.values())

    except Exception as e:
        out["error"] = {"type": "exception", "message": str(e)}

    if args.json or True:
        print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

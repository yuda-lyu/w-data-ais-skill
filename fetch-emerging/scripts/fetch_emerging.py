#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Fetch emerging-market (興櫃) daily OHLC from Goodinfo ShowK_Chart.

CLI:
  python3 fetch_emerging.py --date YYYYMMDD --stockNo XXXX

It works by:
  1) GET ShowK_Chart.asp?STOCK_ID= (triggers anti-bot JS redirect)
  2) Parse the JS snippet that sets CLIENT_KEY and redirects
  3) Synthesize CLIENT_KEY cookie, follow redirect once
  4) Visit ShowK_Chart.asp?...CHT_CAT=DATE...
  5) Fetch /tw/data/ShowK_Chart.asp?STEP=DATA... (HTML table)
  6) Parse row for the requested ROC date and extract open/high/low/close

No third-party deps (stdlib + requests).
"""

from __future__ import annotations

import argparse
import datetime as dt
import html as html_lib
import json
import re
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import requests


BASE = "https://goodinfo.tw/tw/"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


def roc_date(yyyymmdd: str) -> str:
    y = int(yyyymmdd[0:4])
    m = int(yyyymmdd[4:6])
    d = int(yyyymmdd[6:8])
    return f"{y-1911:03d}/{m:02d}/{d:02d}"


def goodinfo_short_date(yyyymmdd: str) -> str:
    """Goodinfo daily table uses YY/MM/DD (Gregorian 2-digit year), e.g. 26/02/04."""
    y = int(yyyymmdd[0:4]) % 100
    m = int(yyyymmdd[4:6])
    d = int(yyyymmdd[6:8])
    return f"{y:02d}/{m:02d}/{d:02d}"


def json_out(obj: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def http_get(session: requests.Session, url: str, headers: Dict[str, str], tries: int = 5) -> requests.Response:
    last_err: Optional[BaseException] = None
    for i in range(tries):
        try:
            resp = session.get(url, headers=headers, timeout=30)
            return resp
        except BaseException as e:
            last_err = e
            time.sleep(1.2 * (i + 1))
    raise last_err  # type: ignore[misc]


def _strip_tags(s: str) -> str:
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return html_lib.unescape(s).strip()


def ensure_goodinfo_session(stock_no: str) -> requests.Session:
    """Bypass the initial JS redirect anti-bot by synthesizing CLIENT_KEY."""

    s = requests.Session()

    url = f"{BASE}ShowK_Chart.asp?STOCK_ID={stock_no}"
    h0 = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Referer": BASE,
        "Connection": "keep-alive",
    }

    r = http_get(s, url, h0)

    # If we got the redirect/anti-bot page, it includes setCookie('CLIENT_KEY', 'ver|a|b|' + ...)
    if "setCookie('CLIENT_KEY'" in r.text and "window.location.replace" in r.text:
        m = re.search(r"setCookie\('CLIENT_KEY'\s*,\s*'([^']+)'\s*\+", r.text)
        red = re.search(r"window\.location\.replace\('([^']+)'\)", r.text)
        if not m or not red:
            raise RuntimeError("anti-bot page detected but cannot parse redirect/cookie seed")

        parts = m.group(1).split("|")
        if len(parts) < 3:
            raise RuntimeError("anti-bot cookie seed has unexpected format")

        ver, a, b = parts[0], parts[1], parts[2]

        # JS GetTimezoneOffset() returns minutes between UTC and local time.
        # We don't know user locale here; offset=0 works in practice as long as the
        # day-number is consistent.
        tz_offset_min = 0
        day = time.time() / 86400.0 - tz_offset_min / 1440.0
        client_key = f"{ver}|{a}|{b}|{tz_offset_min}|{day}|{day}"

        s.cookies.set("CLIENT_KEY", client_key, domain="goodinfo.tw", path="/")

        # Follow the redirect once to let Goodinfo accept the cookie.
        red_url = urljoin(url, red.group(1))
        _ = http_get(s, red_url, h0)

    return s


def fetch_daily_table_html(session: requests.Session, stock_no: str) -> str:
    """Fetch the AJAX HTML that contains the daily table."""

    show_url = f"{BASE}ShowK_Chart.asp?STOCK_ID={stock_no}&CHT_CAT=DATE&PRICE_ADJ=F"

    # Visit chart page first (some setups require it before calling /tw/data/...)
    http_get(
        session,
        show_url,
        {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            "Referer": BASE,
            "Connection": "keep-alive",
        },
    )

    data_url = (
        "https://goodinfo.tw/tw/data/ShowK_Chart.asp?STEP=DATA"
        f"&STOCK_ID={stock_no}&CHT_CAT=DATE&PRICE_ADJ=F"
        "&SHEET=%E5%80%8B%E8%82%A1%E8%82%A1%E5%83%B9%E3%80%81%E6%B3%95%E4%BA%BA%E8%B2%B7%E8%B3%A3%E5%8F%8A%E8%9E%8D%E8%B3%87%E5%88%B8"
    )

    r = http_get(
        session,
        data_url,
        {
            "User-Agent": UA,
            "Accept": "*/*",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            "Referer": show_url,
            "X-Requested-With": "XMLHttpRequest",
            "Connection": "keep-alive",
        },
    )

    # Content is HTML fragment
    r.encoding = "utf-8"
    return r.text


def parse_ohlc_from_table(html_text: str, target_roc_date: str) -> Tuple[List[str], List[str]]:
    """Return (fields, row) for the target date.

    fields: [交易日期, 開盤, 最高, 最低, 收盤]
    row: [ROCDate, open, high, low, close]
    """

    # Locate the data table by finding the header keywords.
    idx = html_text.find("交易")
    if idx == -1:
        raise ValueError("cannot locate data table (missing 交易日期)")

    # Find the first <table ...> after the header keywords.
    table_m = re.search(r"<table[^>]*>.*?</table>", html_text, flags=re.S)
    if not table_m:
        raise ValueError("cannot locate any <table> in response")

    # There are multiple tables (controls + data). Pick the first table that contains "交易" and "開盤".
    tables = re.findall(r"<table[^>]*>.*?</table>", html_text, flags=re.S)
    data_table = None
    for t in tables:
        if "交易" in t and "開盤" in t and "最高" in t and "最低" in t and "收盤" in t:
            data_table = t
            break
    if not data_table:
        raise ValueError("cannot find the OHLC data table")

    # Parse header fields
    header_tr = re.search(r"<tr[^>]*class='bg_h2[^']*'[^>]*>.*?</tr>", data_table, flags=re.S)
    if not header_tr:
        # fallback: first tr that contains 開盤
        header_tr = re.search(r"<tr[^>]*>.*?開盤.*?</tr>", data_table, flags=re.S)
    if not header_tr:
        raise ValueError("cannot locate header row")

    ths = re.findall(r"<th[^>]*>(.*?)</th>", header_tr.group(0), flags=re.S)
    fields_all = [_strip_tags(x).replace("\n", "") for x in ths]

    # Map field index
    def find_idx(name: str) -> int:
        for i, f in enumerate(fields_all):
            if name in f:
                return i
        return -1

    i_date = find_idx("交易")
    i_open = find_idx("開盤")
    i_high = find_idx("最高")
    i_low = find_idx("最低")
    i_close = find_idx("收盤")
    if min(i_date, i_open, i_high, i_low, i_close) < 0:
        raise ValueError(f"missing required columns: {fields_all}")

    # Parse data rows
    trs = re.findall(r"<tr[^>]*>(.*?)</tr>", data_table, flags=re.S)
    for tr in trs:
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, flags=re.S)
        if not tds:
            continue
        cells = [_strip_tags(x).replace("\n", " ") for x in tds]
        if len(cells) <= max(i_close, i_low, i_high, i_open, i_date):
            continue
        cell_date = cells[i_date].lstrip("'")
        if cell_date == target_roc_date:
            fields = ["交易日期", "開盤", "最高", "最低", "收盤"]
            row = [cell_date, cells[i_open], cells[i_high], cells[i_low], cells[i_close]]
            return fields, row

    raise KeyError(f"date {target_roc_date} not found")


def to_float(x: str) -> Optional[float]:
    x = x.strip().replace(",", "")
    if x in ("", "-", "--"):
        return None
    try:
        return float(x)
    except ValueError:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True, help="YYYYMMDD")
    ap.add_argument("--stockNo", required=True, help="Stock code, e.g. 6610")
    args = ap.parse_args()

    date = str(args.date)
    stock_no = str(args.stockNo)

    out: Dict[str, Any] = {
        "source": "goodinfo",
        "market": "emerging",
        "date": date,
        "dateROC": roc_date(date),
        "stock": {"code": stock_no},
        "ohlc": None,
        "raw": None,
        "error": None,
    }

    try:
        s = ensure_goodinfo_session(stock_no)
        html_text = fetch_daily_table_html(s, stock_no)
        fields, row = parse_ohlc_from_table(html_text, goodinfo_short_date(date))

        o, h, l, c = map(to_float, row[1:5])
        if None in (o, h, l, c):
            raise ValueError(f"OHLC has empty values: {row}")

        out["ohlc"] = {"open": o, "high": h, "low": l, "close": c}
        out["raw"] = {"fields": fields, "row": row}
        json_out(out)
        return

    except KeyError as e:
        out["error"] = {"type": "not-found", "message": str(e), "details": None}
    except requests.RequestException as e:
        out["error"] = {"type": "network", "message": str(e), "details": None}
    except Exception as e:
        msg = str(e)
        etype = "unknown"
        if "anti-bot" in msg or "CLIENT_KEY" in msg:
            etype = "anti-bot"
        elif "parse" in msg or "table" in msg or "columns" in msg:
            etype = "parse"
        out["error"] = {"type": etype, "message": msg, "details": None}

    json_out(out)
    sys.exit(2)


if __name__ == "__main__":
    main()

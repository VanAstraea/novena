"""dtk-export: write your Arknights roster to a file you can import into Doctor's Toolkit.

Runs on YOUR computer only. It logs in to your game account with the same unofficial method other community tools
use (ArkPRTS, Yostar email code for EN/JP/KR), reads your account once, and writes a JSON file. Nothing is sent
anywhere else, and the website never sees your login.

ACCOUNT RISK: the login is unofficial. It only reads your data, but it isn't sanctioned by Yostar or Hypergryph.
Entering your roster by hand on the website is the risk-free option.

    pip install arkprts
    python dtk_export.py --server en                # asks for your email, then the code Yostar emails you
    python dtk_export.py --server en --raw sync.json  # also keep the raw game data
    python dtk_export.py --from-file sync.json       # convert a syncData JSON you already have, no login

Your email and code are typed at the prompt and never stored. Nothing is kept after the export unless you pass
--remember, which saves the resulting token in ~/.dtk/credentials.json so the next export skips the email step.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROSTER_APP = "doctors-toolkit-roster"
UNIEQUIP = "https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/{server}/gamedata/excel/uniequip_table.json"
CREDENTIALS = Path.home() / ".dtk" / "credentials.json"
WARNING = ("This logs in to your game account with an unofficial method (read-only). It isn't sanctioned by\n"
           "Yostar or Hypergryph and carries some account risk. Manual entry on the website is risk-free.")


def module_letters(server: str) -> dict[str, str]:
    """Module id -> X/Y/A/D, from the public game tables (the site stores modules by letter)."""
    req = urllib.request.Request(UNIEQUIP.format(server=server), headers={"User-Agent": "dtk-export"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        table = json.loads(resp.read())
    return {mid: e["typeIcon"].rsplit("-", 1)[-1].upper() for mid, e in table["equipDict"].items() if e.get("type") != "INITIAL"}


def convert(raw: dict, server: str, letters: dict[str, str]) -> dict:
    user = raw.get("user", raw)
    ops = []
    for c in (user.get("troop") or {}).get("chars", {}).values():
        forms = [{"charId": k, **v} for k, v in c["tmpl"].items()] if c.get("tmpl") else [c]
        for f in forms:
            modules = {}
            for mid, st in (f.get("equip") or {}).items():
                if mid in letters and not st.get("locked", 1):
                    modules[letters[mid]] = int(st.get("level", 0))
            ops.append({"id": f["charId"], "elite": int(c.get("evolvePhase", 0)), "level": int(c.get("level", 1)),
                        "pot": int(c.get("potentialRank", 0)) + 1, "skillLevel": int(c.get("mainSkillLvl", 1)),
                        "masteries": [int(s.get("specializeLevel", 0)) for s in f.get("skills") or []], "modules": modules})
    status = user.get("status") or {}
    depot = {k: int(v) for k, v in (user.get("inventory") or {}).items() if int(v) > 0}
    if status.get("gold"):
        depot["4001"] = int(status["gold"])
    savings = {"orundum": int(status.get("diamondShard") or 0),
               "prime": int(status.get("freeDiamond") or 0) + int(status.get("payDiamond") or 0),
               "permits": int(status.get("gachaTicket") or 0) + 10 * int(status.get("tenGachaTicket") or 0),
               "card": (status.get("monthlySubscriptionEndTime") or 0) > datetime.now(timezone.utc).timestamp()}
    return {"app": ROSTER_APP, "version": 1, "server": server, "exported": datetime.now(timezone.utc).isoformat(),
            "ops": ops, "depot": depot, "savings": savings}


async def fetch(server: str, remember: bool) -> dict:
    try:
        import arkprts
    except ImportError:
        sys.exit("This needs ArkPRTS: pip install arkprts")
    saved = json.loads(CREDENTIALS.read_text()) if CREDENTIALS.exists() else {}
    creds = saved.get(server)
    if not creds:
        auth = arkprts.YostarAuth(server)
        try:
            email = input("Yostar account email: ").strip()
            await auth.send_email_code(email)
            code = input(f"A code was sent to {email}. Enter it: ").strip()
            uid, token = await auth.get_token_from_email_code(email, code)
        finally:
            await auth.network.close()
        creds = {"channel_uid": uid, "token": token}
        if remember:
            CREDENTIALS.parent.mkdir(parents=True, exist_ok=True)
            saved[server] = creds
            CREDENTIALS.write_text(json.dumps(saved))
    client = await arkprts.Client.from_token(creds["channel_uid"], creds["token"], server, assets=False)
    try:
        return await client.get_raw_data()
    finally:
        await client.network.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Export your Arknights roster for Doctor's Toolkit.")
    ap.add_argument("--server", default="en", choices=["en", "jp", "kr"])
    ap.add_argument("--out", type=Path, default=None, help="output file (default dtk-roster-<server>-<date>.json)")
    ap.add_argument("--raw", type=Path, help="also save the raw game data here")
    ap.add_argument("--from-file", type=Path, help="convert an existing syncData JSON instead of logging in")
    ap.add_argument("--remember", action="store_true", help="keep the login token in ~/.dtk for next time")
    args = ap.parse_args()

    if args.from_file:
        raw = json.loads(args.from_file.read_text(encoding="utf-8"))
    else:
        print(WARNING, "\n")
        if input("Continue? [y/N] ").strip().lower() != "y":
            sys.exit("Stopped. Nothing was sent.")
        raw = asyncio.run(fetch(args.server, args.remember))
        if args.raw:
            args.raw.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    roster = convert(raw, args.server, module_letters(args.server))
    out = args.out or Path(f"dtk-roster-{args.server}-{datetime.now().date()}.json")
    out.write_text(json.dumps(roster, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {len(roster['ops'])} operators and {len(roster['depot'])} depot items to {out}.")
    print("Import it on the website: My account > Import / export.")


if __name__ == "__main__":
    main()

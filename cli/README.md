# dtk-export (optional)

A small script that exports your roster, depot and savings from the game to a file you import on the Doctor's Toolkit
website (**My account → Import / export**). It runs on your own computer; the website never sees your login.

> **Account risk.** The script logs in with an unofficial method (ArkPRTS, the same approach other community tools
> use). It only reads your data, but it isn't sanctioned by Yostar or Hypergryph. Entering your roster by hand on the
> website is the recommended, risk-free path.

```bash
pip install arkprts
python dtk_export.py --server en
```

It asks for your Yostar account email, then the one-time code Yostar emails you (your game account needs an email
linked to it). The email and code are never stored. Pass `--remember` to keep the resulting token in
`~/.dtk/credentials.json` so the next export skips the email step; delete that file to forget it.

Already have a syncData JSON from another tool? Convert it without logging in:

```bash
python dtk_export.py --from-file sync.json --server en
```

Servers: `en`, `jp`, `kr`. (The website also imports raw syncData files and Krooster exports directly.)

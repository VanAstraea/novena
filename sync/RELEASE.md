**Novena Sync** is the optional desktop companion for [Novena](https://vanastraea.github.io/novena/). It signs in to
your Arknights account on your own computer, reads it, and hands Novena your roster with one click: operators and the
outfits they wear, the depot, recruitment slots, your base and sanity. Your sign-in never leaves your computer.

**Download** the zip for your system below, unzip it and run Novena Sync. Then, on Novena, open
*My account → Roster → Sync / Import* and press *Connect to Novena Sync*.

**Before you sync**
- Signing in, and every sync, signs the game out on your phone or PC: the game allows one session at a time.
  Play, close the game, then sync. Once or twice a day is plenty, and reopening the game needs no new code.
- It's read-only: it never changes or plays anything in the game.
- It uses the community's unofficial client, which isn't approved by Yostar. Entering your roster by hand on the
  website is the risk-free option.

**Windows says "unknown publisher"?** The app isn't code-signed yet (signing costs money). Choose *More info → Run
anyway*. To check a download is exactly what this repository built, compare its SHA-256 with the `SHA256SUMS` file
attached here (`certutil -hashfile novena-sync-windows.zip SHA256` on Windows, `shasum -a 256` on macOS).

**What it keeps** from the game data, and nothing else, is listed in
[`sync/novena_sync/payload.py`](https://github.com/VanAstraea/novena/blob/main/sync/novena_sync/payload.py).
Unofficial fan tool, not affiliated with Hypergryph, Yostar or Gryphline. MIT License.

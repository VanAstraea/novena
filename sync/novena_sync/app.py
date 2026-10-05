"""The window: sign in once, then sync with one click here or from Novena in your browser."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import threading
import time
import tkinter as tk
from concurrent.futures import Future
from pathlib import Path
from tkinter import ttk
from typing import Any, Callable, Coroutine
import webbrowser

from . import SERVERS, VERSION, account, payload
from .bridge import COOLDOWN, PORT, Bridge
from .settings import Settings

NOVENA_URL = "https://vanastraea.github.io/novena/roster?tab=import"
INK, PANEL, LINE, TEXT, MUTED, GOLD = "#0d0c0b", "#161412", "#4b3d2f", "#f6f1e8", "#b9afa2", "#dfb768"
NOTICE = (
    "Novena Sync signs in to your game account on this computer and reads it. It never changes anything in the game, "
    "never plays it for you, and never sends your account anywhere except to Novena in your own browser.\n\n"
    "The sign-in is unofficial: it uses the same community-made method as other Arknights tools (ArkPRTS). Yostar's "
    "terms don't allow third-party tools, so there is some risk to your account.\n\n"
    "Signing in, and every sync, signs you out of the game on your phone or PC (the game allows one session at a "
    "time). Sync after you've finished playing, never mid-stage, and only as often as you need: once or twice a day is "
    "plenty, and every sync is a sign-in Yostar can see.\n\n"
    "Your email and the code Yostar sends are never stored. The session they create is kept in your computer's "
    "credential store until you sign out. Entering your roster by hand on the website is the risk-free option."
)


if sys.platform == "win32":  # crisp text on scaled displays; sizes below are scaled to match
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass


def resource(rel: str) -> Path:
    """A file shipped with the app: next to the package when run from source, unpacked by PyInstaller when built."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base / rel


class AsyncRunner:
    """ArkPRTS is async; the window isn't. One background event loop runs the network calls."""

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        threading.Thread(target=self.loop.run_forever, name="network", daemon=True).start()

    def submit(self, coro: Coroutine[Any, Any, Any]) -> Future:
        return asyncio.run_coroutine_threadsafe(coro, self.loop)


class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.settings = Settings.load()
        self.vault = account.Vault()
        self.runner = AsyncRunner()
        self.last_sync: dict[str, float] = {}
        self.bridge = Bridge(self.settings, self.settings.save, self._sync_blocking, self._signed_in, self._event_threadsafe)
        self.bridge_error = ""
        try:
            self.bridge.start()
        except OSError:
            self.bridge_error = f"Port {PORT} is busy (is Novena Sync already open?). Browser syncs are unavailable; files still work."

        root.title("Novena Sync")
        root.configure(bg=INK)
        self.scale = max(1.0, float(root.tk.call("tk", "scaling")) / (96 / 72))
        self.wrap = int(430 * self.scale)
        root.minsize(int(500 * self.scale), int(600 * self.scale))
        self._style()
        icon = resource("assets/window.png")
        if icon.exists():
            self._icon = tk.PhotoImage(file=str(icon))
            root.iconphoto(True, self._icon)
        self.body = ttk.Frame(root, padding=22, style="Ink.TFrame")
        self.body.pack(fill="both", expand=True)
        self.render()
        self._tick()

    # --- look ------------------------------------------------------------------------------------------------------
    def _style(self) -> None:
        s = ttk.Style(self.root)
        s.theme_use("clam")
        s.configure(".", background=INK, foreground=TEXT, fieldbackground=PANEL, bordercolor=LINE, font=("Segoe UI", 10))
        s.configure("Ink.TFrame", background=INK)
        s.configure("Panel.TFrame", background=PANEL)
        s.configure("TLabel", background=INK, foreground=TEXT)
        s.configure("Panel.TLabel", background=PANEL, foreground=TEXT)
        s.configure("Muted.TLabel", background=INK, foreground=MUTED)
        s.configure("PanelMuted.TLabel", background=PANEL, foreground=MUTED)
        s.configure("Title.TLabel", background=INK, foreground=TEXT, font=("Georgia", 20, "bold"))
        s.configure("Head.TLabel", background=PANEL, foreground=GOLD, font=("Segoe UI", 9, "bold"))
        s.configure("Code.TLabel", background=PANEL, foreground=TEXT, font=("Consolas", 22, "bold"))
        s.configure("TButton", background=PANEL, foreground=TEXT, bordercolor=LINE, padding=(12, 6))
        s.map("TButton", background=[("active", "#2b231b"), ("disabled", INK)], foreground=[("disabled", "#6e6559")])
        s.configure("Gold.TButton", background=GOLD, foreground="#17110a", bordercolor=GOLD, font=("Segoe UI", 10, "bold"))
        s.map("Gold.TButton", background=[("active", "#f2d599"), ("disabled", "#5a4d2c")])
        s.configure("TCheckbutton", background=INK, foreground=TEXT)
        s.configure("Panel.TCheckbutton", background=PANEL, foreground=TEXT)
        s.map("TCheckbutton", background=[("active", INK)])
        s.map("Panel.TCheckbutton", background=[("active", PANEL)])
        s.configure("TEntry", fieldbackground="#1e1a16", foreground=TEXT, insertcolor=TEXT, padding=6)
        s.configure("TCombobox", fieldbackground="#1e1a16", foreground=TEXT, background=PANEL, arrowcolor=TEXT)
        s.map("TCombobox", fieldbackground=[("readonly", "#1e1a16")], foreground=[("readonly", TEXT)],
              selectbackground=[("readonly", "#1e1a16")], selectforeground=[("readonly", TEXT)])
        self.root.option_add("*TCombobox*Listbox.background", PANEL)
        self.root.option_add("*TCombobox*Listbox.foreground", TEXT)

    def panel(self, title: str) -> ttk.Frame:
        f = ttk.Frame(self.body, padding=14, style="Panel.TFrame")
        f.pack(fill="x", pady=(0, 12))
        ttk.Label(f, text=title.upper(), style="Head.TLabel").pack(anchor="w", pady=(0, 8))
        return f

    # --- screens ---------------------------------------------------------------------------------------------------
    def render(self) -> None:
        for w in self.body.winfo_children():
            w.destroy()
        ttk.Label(self.body, text="Novena Sync", style="Title.TLabel").pack(anchor="w")
        ttk.Label(self.body, text="Read-only. Your sign-in stays on this computer.", style="Muted.TLabel").pack(anchor="w", pady=(0, 14))
        if not self.settings.accepted:
            return self.render_notice()
        self.render_account()
        self.render_sync()
        self.render_browser()
        ttk.Label(self.body, text=f"Unofficial fan tool, not affiliated with Hypergryph or Yostar. v{VERSION}",
                  style="Muted.TLabel").pack(anchor="w", side="bottom")

    def render_notice(self) -> None:
        f = self.panel("Before you start")
        ttk.Label(f, text=NOTICE, style="Panel.TLabel", wraplength=self.wrap, justify="left").pack(anchor="w")
        agreed = tk.BooleanVar(value=False)
        go = ttk.Button(f, text="Continue", style="Gold.TButton", state="disabled", command=self._accept)
        ttk.Checkbutton(f, text="I understand the risk", variable=agreed, style="Panel.TCheckbutton",
                        command=lambda: go.configure(state="normal" if agreed.get() else "disabled")).pack(anchor="w", pady=(12, 8))
        go.pack(anchor="w")

    def _accept(self) -> None:
        self.settings.accepted = True
        self.settings.save()
        self.render()

    def render_account(self) -> None:
        f = self.panel("Account")
        row = ttk.Frame(f, style="Panel.TFrame")
        row.pack(fill="x")
        ttk.Label(row, text="Server", style="Panel.TLabel").pack(side="left")
        names = list(SERVERS.values())
        box = ttk.Combobox(row, values=names, state="readonly", width=16)
        box.set(SERVERS[self.settings.server])
        box.pack(side="left", padx=8)
        box.bind("<<ComboboxSelected>>", lambda _: self._set_server(list(SERVERS)[names.index(box.get())]))
        session = self.vault.get(self.settings.server)
        if session:
            ttk.Label(f, text=f"Signed in (account ending …{str(session['channel_uid'])[-4:]})", style="Panel.TLabel").pack(anchor="w", pady=(10, 6))
            ttk.Button(f, text="Sign out", command=self._sign_out).pack(anchor="w")
            if not self.vault.persistent:
                ttk.Label(f, text="No credential store found: you'll sign in again next launch.", style="PanelMuted.TLabel").pack(anchor="w", pady=(6, 0))
            return
        ttk.Label(f, text="Yostar account email", style="PanelMuted.TLabel").pack(anchor="w", pady=(10, 2))
        email = ttk.Entry(f, width=40)
        email.pack(anchor="w")
        send = ttk.Button(f, text="Send code")
        send.pack(anchor="w", pady=(6, 0))
        ttk.Label(f, text="Code from the email", style="PanelMuted.TLabel").pack(anchor="w", pady=(10, 2))
        code = ttk.Entry(f, width=12)
        code.pack(anchor="w")
        sign = ttk.Button(f, text="Sign in", style="Gold.TButton")
        sign.pack(anchor="w", pady=(6, 0))
        self.account_msg = ttk.Label(f, text="Your account needs an email linked to it in the game's settings.", style="PanelMuted.TLabel", wraplength=self.wrap)
        self.account_msg.pack(anchor="w", pady=(8, 0))
        server = self.settings.server
        msg = self.account_msg
        send.configure(command=lambda: self._run(account.send_code(server, email.get().strip()), send, msg,
                                                 lambda _: msg.configure(text=f"Code sent to {email.get().strip()}. Check your inbox.")))
        sign.configure(command=lambda: self._run(account.sign_in(self.vault, server, email.get().strip(), code.get()), sign, msg,
                                                 lambda _: self.render()))

    def render_sync(self) -> None:
        f = self.panel("Sync")
        signed = self.vault.get(self.settings.server) is not None
        self.sync_btn = ttk.Button(f, text="Sync now", style="Gold.TButton", command=self._sync_click, state="normal" if signed else "disabled")
        self.sync_btn.pack(anchor="w")
        self.sync_msg = ttk.Label(f, text=self._last_text() if signed else "Sign in above first.", style="PanelMuted.TLabel", wraplength=self.wrap, justify="left")
        self.sync_msg.pack(anchor="w", pady=(8, 6))
        ttk.Label(f, text="Each sync signs you out of the game elsewhere. Play, close the game, then sync: once or twice a day is plenty. Reopening the game needs no new code.",
                  style="PanelMuted.TLabel", wraplength=self.wrap, justify="left").pack(anchor="w", pady=(0, 6))
        opts = ttk.Frame(f, style="Panel.TFrame")
        opts.pack(fill="x")
        keep = tk.BooleanVar(value=self.settings.save_file)
        ttk.Checkbutton(opts, text="Also save it as a file", variable=keep, style="Panel.TCheckbutton",
                        command=lambda: self._set("save_file", keep.get())).pack(side="left")
        ttk.Button(opts, text="Open folder", command=self._open_folder).pack(side="right")

    def render_browser(self) -> None:
        f = self.panel("Sync from Novena in your browser")
        if self.bridge_error:
            ttk.Label(f, text=self.bridge_error, style="PanelMuted.TLabel", wraplength=self.wrap).pack(anchor="w")
            return
        ttk.Label(f, text="On Novena, open My account → Import, choose Novena Sync and enter this code once:",
                  style="Panel.TLabel", wraplength=self.wrap, justify="left").pack(anchor="w")
        self.code_lbl = ttk.Label(f, text=self._pretty(self.bridge.code), style="Code.TLabel")
        self.code_lbl.pack(anchor="w", pady=6)
        allow = tk.BooleanVar(value=self.settings.allow_browser)
        ttk.Checkbutton(f, text="Let paired pages ask for a sync while this app is open", variable=allow, style="Panel.TCheckbutton",
                        command=lambda: self._set("allow_browser", allow.get())).pack(anchor="w")
        row = ttk.Frame(f, style="Panel.TFrame")
        row.pack(fill="x", pady=(8, 0))
        self.paired_lbl = ttk.Label(row, style="PanelMuted.TLabel")
        self.paired_lbl.pack(side="left")
        self.forget_btn = ttk.Button(row, text="Forget all", command=self._forget_pages)
        self.forget_btn.pack(side="right")
        self._show_paired()
        ttk.Button(row, text="Open Novena", command=lambda: webbrowser.open(NOVENA_URL)).pack(side="right", padx=6)

    # --- actions ---------------------------------------------------------------------------------------------------
    def _run(self, coro: Coroutine[Any, Any, Any], button: ttk.Button, msg: ttk.Label, done: Callable[[Any], None]) -> None:
        """Run a network step without freezing the window; report its outcome in plain words."""
        button.configure(state="disabled")

        def finished(fut: Future) -> None:
            def ui() -> None:
                if button.winfo_exists():
                    button.configure(state="normal")
                try:
                    result = fut.result()
                except (account.SyncError, account.SignInNeeded) as e:
                    return self._say(msg, str(e))
                except Exception as e:  # anything unexpected still reaches the player
                    return self._say(msg, f"Something went wrong: {e}")
                done(result)
            self.root.after(0, ui)

        self.runner.submit(coro).add_done_callback(finished)

    @staticmethod
    def _say(label: ttk.Label, text: str) -> None:
        if label.winfo_exists():
            label.configure(text=text)

    def _show_paired(self) -> None:
        n = len(self.settings.paired)
        if getattr(self, "paired_lbl", None) is not None and self.paired_lbl.winfo_exists():
            self.paired_lbl.configure(text=f"{n} paired page{'s' if n != 1 else ''}")
            self.forget_btn.configure(state="normal" if n else "disabled")

    def _set_server(self, server: str) -> None:
        self._set("server", server)
        self.render()

    def _set(self, key: str, value: Any) -> None:
        setattr(self.settings, key, value)
        self.settings.save()

    def _sign_out(self) -> None:
        self.vault.forget(self.settings.server)
        self.render()

    def _forget_pages(self) -> None:
        self.settings.paired.clear()
        self.settings.save()
        self.render()

    def _signed_in(self) -> list[str]:
        return [s for s in SERVERS if self.vault.get(s)]

    async def _sync(self, server: str) -> dict[str, Any]:
        raw = await account.read_account(self.vault, server)
        data = payload.minimize(raw, server)
        if os.environ.get("NOVENA_SHAPE"):  # keys and types only, never values: for checking the parts Novena reads
            Path(self.settings.folder).mkdir(parents=True, exist_ok=True)
            (Path(self.settings.folder) / f"novena-sync-{server}-shape.json").write_text(json.dumps(payload.shape(raw), indent=1), encoding="utf-8")
        if self.settings.save_file:
            payload.save(data, Path(self.settings.folder))
        self.last_sync[server] = time.time()
        self.last_summary = payload.summary(data)
        return data

    def _sync_blocking(self, server: str) -> dict[str, Any]:
        """Called by the bridge from its own thread."""
        return self.runner.submit(self._sync(server)).result(timeout=90)

    def _confirm(self) -> bool:
        """Before a sync: it signs the player out of the game on their other devices. "Don't ask again" remembers."""
        if not self.settings.confirm_sync:
            return True
        win = tk.Toplevel(self.root, bg=INK, padx=int(18 * self.scale), pady=int(16 * self.scale))
        win.title("Sync now?")
        win.transient(self.root)
        win.resizable(False, False)
        ok = tk.BooleanVar(value=False)
        again = tk.BooleanVar(value=False)
        ttk.Label(win, text="This signs you out of Arknights on your phone or PC (the game allows one session at a time). "
                  "If you're in a stage, finish it first.", wraplength=self.wrap, justify="left").pack(anchor="w")
        ttk.Checkbutton(win, text="Don't ask again", variable=again).pack(anchor="w", pady=(10, 10))
        row = ttk.Frame(win, style="Ink.TFrame")
        row.pack(anchor="e")
        ttk.Button(row, text="Cancel", command=win.destroy).pack(side="right")
        ttk.Button(row, text="Sync now", style="Gold.TButton", command=lambda: (ok.set(True), win.destroy())).pack(side="right", padx=(0, 8))
        win.grab_set()
        self.root.wait_window(win)
        if ok.get() and again.get():
            self._set("confirm_sync", False)
        return ok.get()

    def _sync_click(self) -> None:
        server = self.settings.server
        if not self._confirm():
            return

        def done(data: dict[str, Any]) -> None:
            self.bridge.remember(server, data)
            self._say(self.sync_msg, self._last_text())
        self._run(self._sync(server), self.sync_btn, self.sync_msg, done)

    def _event_threadsafe(self, text: str) -> None:
        """The bridge paired a page or synced for one: update the labels without redrawing (keeps anything typed)."""
        def ui() -> None:
            self._show_paired()
            if getattr(self, "sync_msg", None) is not None and self.sync_msg.winfo_exists():
                self.sync_msg.configure(text=f"{text}\n{self._last_text()}")
        self.root.after(0, ui)

    def _open_folder(self) -> None:
        folder = Path(self.settings.folder)
        folder.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(folder)  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(folder)])

    # --- small helpers ---------------------------------------------------------------------------------------------
    @staticmethod
    def _pretty(code: str) -> str:
        return f"{code[:3]} {code[3:]}"

    def _last_text(self) -> str:
        t = self.last_sync.get(self.settings.server)
        if not t:
            return "Not synced yet this session."
        where = f" Saved to {Path(self.settings.folder) / f'novena-sync-{self.settings.server}.json'}." if self.settings.save_file else ""
        return f"Last sync {time.strftime('%H:%M', time.localtime(t))}: {getattr(self, 'last_summary', '')}.{where}"

    def _tick(self) -> None:
        """Keep the pairing code fresh on screen and the button honest about the cooldown."""
        if getattr(self, "code_lbl", None) is not None and self.code_lbl.winfo_exists():
            self.code_lbl.configure(text=self._pretty(self.bridge.code))
        btn = getattr(self, "sync_btn", None)
        if btn is not None and btn.winfo_exists():
            cached = self.bridge.cache.get(self.settings.server)
            wait = int(COOLDOWN - (self.bridge.clock() - cached[0])) if cached else 0
            if wait > 0:
                btn.configure(text=f"Sync again in {wait // 60}:{wait % 60:02d}", state="disabled")
            elif str(btn.cget("text")).startswith("Sync again"):
                btn.configure(text="Sync now", state="normal" if self.vault.get(self.settings.server) else "disabled")
        self.root.after(1000, self._tick)


def main() -> None:
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()

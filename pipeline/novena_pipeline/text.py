"""Game rich text to the small safe markup the site renders.

The game marks values and keywords with tags: `<@ba.vup>+20%</>` (a highlighted value), `<$ba.stun>Stun</>` (a term
with a glossary entry). Skill descriptions are templates over a blackboard: `{atk:0%}`, `{-cost}`,
`{attack@atk_scale:0.0}`. The output escapes everything and keeps two tags:

    <b>…</b>                      a highlighted value
    <i data-t="ba.stun">…</i>     a glossary term (the site looks the term up in terms.json)
"""

from __future__ import annotations

import html
import re

_TAG = re.compile(r"<([@$])([\w.\-]+)>|</>")
_TEMPLATE = re.compile(r"\{(-?)([^{}:]+)(?::([^{}]+))?\}")


def fmt_number(value: float, spec: str | None) -> str:
    pct = bool(spec) and spec.endswith("%")
    if pct:
        value *= 100
    decimals = 0
    if spec and "." in spec:
        decimals = len(spec.rstrip("%").split(".", 1)[1])
    if spec:
        out = f"{value:.{decimals}f}"
    else:
        out = f"{value:.4f}".rstrip("0").rstrip(".")
    if out in ("-0", "-0.0"):
        out = out[1:]
    return out + ("%" if pct else "")


def fill(text: str, blackboard: dict[str, float]) -> str:
    """Replace {key:format} with the blackboard's values (keys match case-insensitively)."""
    bb = {k.lower(): v for k, v in blackboard.items()}

    def sub(m: re.Match) -> str:
        neg, key, spec = m.group(1), m.group(2).strip().lower(), m.group(3)
        if key not in bb or bb[key] is None:
            return m.group(0)
        v = bb[key]
        if isinstance(v, str):
            return v
        return fmt_number(-v if neg else v, spec)

    return _TEMPLATE.sub(sub, text or "")


def markup(text: str | None) -> str:
    """Rich text -> escaped text with <b> and <i data-t> only. Unknown tags are dropped, their text kept."""
    if not text:
        return ""
    out: list[str] = []
    stack: list[str] = []
    pos = 0
    for m in _TAG.finditer(text):
        out.append(html.escape(text[pos:m.start()], quote=False))
        pos = m.end()
        if m.group(0) == "</>":
            if stack:
                out.append(stack.pop())
            continue
        kind, name = m.group(1), m.group(2)
        if kind == "$":
            out.append(f'<i data-t="{html.escape(name)}">')
            stack.append("</i>")
        else:
            out.append("<b>")
            stack.append("</b>")
    out.append(html.escape(text[pos:], quote=False))
    out.extend(reversed(stack))
    return "".join(out).replace("\\n", "\n").strip()


def plain(text: str | None) -> str:
    """Rich text with every tag removed."""
    return _TAG.sub("", text or "").replace("\\n", "\n").strip()


def blackboard(entries: list[dict] | None) -> dict[str, float]:
    return {e["key"]: (e.get("value") if e.get("valueStr") is None else e["valueStr"]) for e in entries or []}

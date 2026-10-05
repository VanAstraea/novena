"""Unofficial English for CN content that Global hasn't named yet (events, banners, Contingency Contract seasons,
modules). Translated for Novena; the site marks them "unofficial", and the official name replaces each one as soon as
the game tables of this server carry it. Names nobody has translated yet stay in Chinese, and the build lists them.

To add one: the Chinese name exactly as the CN tables give it, then the English.
"""

from __future__ import annotations

TRANSLATIONS: dict[str, str] = {
    # events
    "黑色博士坠落": "Black Doctor Down",  # April Fools, after 黑鹰坠落 (Black Hawk Down)
    "泡影苍霆": "Fleeting Azure Thunder",
    "阵地足球锦标": "Trench Football Championship",
    "丛林症结": "Crux of the Jungle",
    "直到大地变成一颗酸橙": "Until the Earth Turns into a Lime",
    "奇象巡展": "Marvels on Tour",
    "月行水上": "The Moon Walks on Water",
    "逐影集趣": "Chasing Shadows",
    # banners
    "适合多种场合的强力干员": "Strong Operators for Every Occasion",
    "定向甄选": "Targeted Selection",
    "幽境狩人": "Hunters of the Netherrealm",
    "承诺": "Promise",
    "石白深蓝之夜": "A Night of Stone White and Deep Blue",
    "砺火成锋": "Forged Sharp in Fire",
    "车辙与风的归所": "Where Wheel Tracks and the Wind Come Home",
    # Contingency Contract
    "涤墨作战": "Battleplan Inkwash",
    # modules
    "“新车和新生活”": "“A New Car and a New Life”",
    "罗德岛制式双刀": "Rhodes Island Standard Twin Blades",
    "新合同": "New Contract",
    "“独属自己的一隅”": "“A Corner of One's Own”",
    "欲雪时": "When Snow Is Near",
    "剑舞": "Sword Dance",
    "“老朋友”": "“Old Friends”",
    "沟通小助手": "Little Communication Helper",
    "“致我们的老大”": "“To Our Boss”",
}

PREFIXES = {"Rhodes Island Epic ": "Rhodes Island Epic: "}  # CN keeps some English in a title; translate the rest
SUFFIXES = {"特限证章": "Exclusive Badge", "复刻": " (Rerun)"}  # "<operator>特限证章": the operator shows beside it


def english(name_cn: str | None) -> str | None:
    """The unofficial English for a CN name, or None when nobody has translated it yet."""
    if not name_cn:
        return None
    if name_cn in TRANSLATIONS:
        return TRANSLATIONS[name_cn]
    for cn, en in PREFIXES.items():
        if name_cn.startswith(cn) and (rest := english(name_cn[len(cn):])):
            return en + rest
    if name_cn.endswith("特限证章"):
        return SUFFIXES["特限证章"]
    if name_cn.endswith("复刻") and (base := english(name_cn[: -len("复刻")])):
        return base + SUFFIXES["复刻"]
    return None

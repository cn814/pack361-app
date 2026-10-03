"""Build the Pack 361 roster import from Scoutbook Plus + TroopWebHost data.

Inputs (in imports/, git-ignored because they contain family data):
  scoutbook_youth_<date>.csv     current registered scouts + dens (Scoutbook Plus roster)
  scoutbook_leaders_<date>.csv   registered adults: email, phone, YPT expiration
  twh_adults_<date>.txt          TroopWebHost active adults: name|positions|phone|email(s)
  twh_scouts_<date>.txt          TroopWebHost active scouts: name|last rank|den|phone|parent email(s)

Rules:
  * A scout is imported only if registered in Scoutbook Plus (that decides the den).
  * Parents come from TroopWebHost: the email(s) on a scout's TWH record link that
    scout to the adults with those emails. Scouts sharing an email are siblings.
  * If a scout has no email in TWH, adults with the same last name are used,
    but only when exactly one family matches.
  * Leader roles/den assignments come from TroopWebHost positions (they match
    the public website); YPT dates come from Scoutbook Plus.
Outputs:
  imports/roster_import.sql      run in the Supabase SQL Editor after the migration
  imports/roster_review.md       everything that needs a human decision
Usage: python build_roster_import.py <imports_dir> <date>
"""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

RANK_BY_LABEL = {"lion": "lion", "tiger": "tiger", "wolf": "wolf", "bear": "bear",
                 "webelos": "webelos", "aol": "aol"}

# TroopWebHost position text -> (app role, dens led as (rank, number), title)
LEADER_RULES = [
    (r"Cubmaster", "cubmaster"),
    (r"Committee Chair", "committee"),
    (r"Chartered Organization", "committee"),
    (r"Treasurer|Committee Member|Fundraising|Communicator|Membership|Advancement Chair|Quartermaster|Webmaster", "committee"),
    (r"Den Leader", "den_leader"),
]
DEN_LEADER_PATTERNS = [
    (r"Lions (Asst\. )?Den Leader", [("lion", 6)]),
    (r"Tigers (Asst\. )?Den Leader", [("tiger", 2)]),
    (r"Wolves (Asst\. )?Den Leader", [("wolf", 1)]),
    (r"Bears (Asst\. )?Den Leader", [("bear", 5)]),
    (r"AOLs and Weblos Den Leader", [("webelos", 4), ("aol", 3), ("aol", 8)]),
]
ADMIN_EMAILS = {"cnealen@gmail.com"}   # first admin; add others in the dashboard

# Name and email corrections between Scoutbook and TroopWebHost. They name real families, so they
# live in imports/roster_fixes.json (not committed; /imports is ignored). Format:
#   {"name_fixes": [[["first", "last"], ["first", "last"]], ...],
#    "email_aliases": {"typed@example.com": "record@example.com"},
#    "twh_duplicates": [["first", "last"], ...]}
_FIXES_FILE = Path(__file__).resolve().parents[2] / "imports" / "roster_fixes.json"
_fixes = json.loads(_FIXES_FILE.read_text()) if _FIXES_FILE.exists() else {}
NAME_FIXES = {tuple(a): tuple(b) for a, b in _fixes.get("name_fixes", [])}
EMAIL_ALIASES = dict(_fixes.get("email_aliases", {}))
TWH_DUPLICATES = {tuple(x) for x in _fixes.get("twh_duplicates", [])}


def norm(s: str) -> str:
    s = re.sub(r'"[^"]*"', "", s or "")
    return re.sub(r"\s+", " ", s).strip().lower()


def first_token(s: str) -> str:
    return norm(s).split(" ")[0] if norm(s) else ""


def emails(s: str) -> list[str]:
    out = []
    for e in re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", s or ""):
        e = EMAIL_ALIASES.get(e.lower(), e.lower())
        if e not in out:
            out.append(e)
    return out


def phone(s: str) -> str:
    d = re.sub(r"\D", "", (s or "").split("  ")[0])[:10]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}" if len(d) == 10 else ""


def q(v) -> str:
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def main(imp: Path, date: str) -> None:
    sb_youth = list(csv.DictReader(open(imp / f"scoutbook_youth_{date}.csv", encoding="utf-8")))
    sb_leaders = {r["email"].lower(): r for r in csv.DictReader(open(imp / f"scoutbook_leaders_{date}.csv", encoding="utf-8"))}

    twh_adults = {}
    for line in open(imp / f"twh_adults_{date}.txt", encoding="utf-8"):
        name, pos, ph, em = (line.rstrip("\n").split("|") + ["", "", ""])[:4]
        last, first = [p.strip() for p in name.split(",", 1)]
        for e in emails(em)[:1]:                      # primary email only
            if e in twh_adults:
                continue                              # duplicate record
            twh_adults[e] = dict(first=first, last=last, positions=pos.strip(), phone=phone(ph), email=e)

    twh_scouts = []
    for line in open(imp / f"twh_scouts_{date}.txt", encoding="utf-8"):
        name, rank, _den, ph, em = (line.rstrip("\n").split("|") + [""] * 4)[:5]
        last, first = [p.strip() for p in name.split(",", 1)]
        if (norm(first), norm(last)) in TWH_DUPLICATES:
            continue
        twh_scouts.append(dict(first=first, last=last, emails=emails(em), phone=phone(ph)))

    review = []

    # ---- match Scoutbook youth to TWH scouts -------------------------------
    def find_twh(first, last):
        f, l = first_token(first), norm(last)
        f, l = NAME_FIXES.get((f, l), (f, l))
        exact = [t for t in twh_scouts if first_token(t["first"]) == f and norm(t["last"]) == l]
        if exact:
            return exact
        if len(l) == 1:                               # "Tyson C" style (Roster Lite)
            return [t for t in twh_scouts if first_token(t["first"]) == f and norm(t["last"]).startswith(l)]
        return []

    scouts = []
    for y in sb_youth:
        if y["position"] == "Den Chief":
            continue
        m = find_twh(y["first_name"], y["last_name"])
        twh = None
        if len(m) == 1:
            twh = m[0]
        elif len(m) > 1:
            with_email = [t for t in m if t["emails"]]
            twh = with_email[0] if with_email else m[0]
        rank_label, num = y["den"].split()
        s = dict(first=y["first_name"], last=(twh["last"] if twh and len(y["last_name"]) == 1 else y["last_name"]),
                 bsa=y["bsa_member_id"], rank=RANK_BY_LABEL[rank_label.lower()], den_no=int(num),
                 emails=list(twh["emails"]) if twh else [], twh=bool(twh),
                 twh_last=twh["last"] if twh else y["last_name"], linked_by="email")
        if not twh:
            review.append(f"- Scout **{y['first_name']} {y['last_name']}** ({y['den']}) is registered in Scoutbook but not found in TroopWebHost, so no parent email yet.")
        scouts.append(s)

    matched_twh = {id(t) for y in sb_youth for t in find_twh(y["first_name"], y["last_name"])}
    unregistered = [t for t in twh_scouts if id(t) not in matched_twh]
    # a registered scout with no email but an unregistered TWH sibling (same last name) that has one
    for s in scouts:
        if not s["emails"]:
            sib = [t for t in unregistered if norm(t["last"]) == norm(s["twh_last"]) and t["emails"]]
            if len(sib) == 1:
                s["emails"] = list(sib[0]["emails"])
                s["linked_by"] = f"sibling record {sib[0]['first']} {sib[0]['last']} in TWH"
    for t in unregistered:
        if True:
            review.append(f"- TroopWebHost scout **{t['first']} {t['last']}** is active in TWH but not registered in Scoutbook Plus: not imported (former scout, or registration pending?).")

    # ---- group into families via shared parent emails ----------------------
    parent = list(range(len(scouts)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    by_email = defaultdict(list)
    for i, s in enumerate(scouts):
        for e in s["emails"]:
            by_email[e].append(i)
    for idxs in by_email.values():
        for j in idxs[1:]:
            parent[root(j)] = root(idxs[0])

    # scouts without any email: attach by last name to exactly one existing family
    for i, s in enumerate(scouts):
        if s["emails"]:
            continue
        same = {root(j) for j, o in enumerate(scouts) if j != i and o["emails"] and norm(o["twh_last"]) == norm(s["twh_last"])}
        adult_matches = [a for a in twh_adults.values() if norm(a["last"]) == norm(s["twh_last"])]
        if len(same) == 1:
            parent[root(i)] = same.pop()
            s["linked_by"] = "last name (sibling already linked)"
        elif not same and adult_matches:
            fam_emails = sorted({a["email"] for a in adult_matches})
            if len({norm(a["first"]) for a in adult_matches}) <= 2:
                s["emails"] = fam_emails
                s["linked_by"] = "last name only: " + ", ".join(f"{a['first']} {a['last']}" for a in adult_matches)
                for e in fam_emails:
                    by_email[e].append(i)
            else:
                review.append(f"- Scout **{s['first']} {s['last']}** has no parent email; several {s['last']} adults exist, so it is not linked.")

    # re-union after last-name linking
    for idxs in by_email.values():
        for j in idxs[1:]:
            parent[root(j)] = root(idxs[0])

    families = defaultdict(lambda: dict(scouts=[], emails=set()))
    for i, s in enumerate(scouts):
        f = families[root(i)]
        f["scouts"].append(s)
        f["emails"].update(s["emails"])

    # ---- adults --------------------------------------------------------------
    email_family = {}
    for key, f in families.items():
        for e in f["emails"]:
            email_family[e] = key

    adults, skipped = [], []
    for e, a in twh_adults.items():
        role = "parent"
        for pat, r in LEADER_RULES:
            if re.search(pat, a["positions"]):
                role = r
                break
        if e in ADMIN_EMAILS:
            role = "admin"
        sb = sb_leaders.get(e)
        dens_led = []
        for pat, dens in DEN_LEADER_PATTERNS:
            mm = re.search(pat, a["positions"])
            if mm:
                title = "Assistant Den Leader" if "Asst" in mm.group(0) else "Den Leader"
                dens_led += [(r, n, title) for r, n in dens]
        fam = email_family.get(e)
        if fam is None:
            # spouse whose email isn't on the scout record: same last name as exactly one family
            cands = {k for k, f in families.items() if any(norm(s["last"]) == norm(a["last"]) for s in f["scouts"])}
            if len(cands) == 1:
                fam = cands.pop()
        if fam is None and role == "parent":
            skipped.append(f"{a['first']} {a['last']}")
            continue
        adults.append(dict(a, role=role, family=fam, dens=dens_led,
                           ypt=(sb or {}).get("ypt_expires_on", ""), bsa=(sb or {}).get("bsa_member_id", ""),
                           title=a["positions"] or None))

    for key, f in families.items():
        if not any(a["family"] == key for a in adults):
            names = ", ".join(f"{s['first']} {s['last']}" for s in f["scouts"])
            review.append(f"- Family of **{names}** has no adult with a login email: nobody can see these scouts until a parent email is added.")

    # ---- SQL ---------------------------------------------------------------
    fam_ids = {k: f"fam_{n:03d}" for n, k in enumerate(families)}
    out = ["-- Pack 361 roster import (generated). Run in Supabase SQL Editor after the migration + seed.",
           "-- Contains family contact data: do not commit.",
           "begin;",
           "create temp table _fam (tag text primary key, id uuid default gen_random_uuid()) on commit drop;"]
    for key, f in families.items():
        name = sorted({s["last"] for s in f["scouts"]})
        out.append(f"insert into _fam (tag) values ({q(fam_ids[key])});")
        out.append(f"insert into public.families (id, family_name) select id, {q(' / '.join(name))} from _fam where tag = {q(fam_ids[key])};")
    out.append("insert into public.dens (rank, number) values ('lion',6),('tiger',2),('wolf',1),('bear',5),('webelos',4),('aol',3),('aol',8) on conflict (rank, number) do nothing;")
    for key, f in families.items():
        for s in f["scouts"]:
            out.append(
                "insert into public.scouts (family_id, den_id, first_name, last_name, bsa_member_id) "
                f"select (select id from _fam where tag = {q(fam_ids[key])}), "
                f"(select id from public.dens where rank = {q(s['rank'])} and number = {s['den_no']}), "
                f"{q(s['first'])}, {q(s['last'])}, {q(s['bsa'])} on conflict (bsa_member_id) do nothing;")
    for a in adults:
        fam_sql = f"(select id from _fam where tag = {q(fam_ids[a['family']])})" if a["family"] is not None else "null"
        out.append(
            "insert into public.adults (family_id, first_name, last_name, email, phone, role, position_title, bsa_member_id, ypt_expires_on) "
            f"values ({fam_sql}, {q(a['first'])}, {q(a['last'])}, {q(a['email'])}, {q(a['phone'])}, {q(a['role'])}, "
            f"{q(a['title'])}, {q(a['bsa'])}, {q(a['ypt'])}) "
            "on conflict (email) do update set family_id = coalesce(excluded.family_id, public.adults.family_id), "
            "role = excluded.role, position_title = excluded.position_title, phone = coalesce(excluded.phone, public.adults.phone), "
            "bsa_member_id = coalesce(excluded.bsa_member_id, public.adults.bsa_member_id), ypt_expires_on = excluded.ypt_expires_on;")
        for r, n, title in a["dens"]:
            out.append("insert into public.den_leaders (den_id, adult_id, title) "
                       f"select d.id, a.id, {q(title)} from public.dens d, public.adults a "
                       f"where d.rank = {q(r)} and d.number = {n} and a.email = {q(a['email'])} on conflict do nothing;")
    out.append("commit;")
    (imp / "roster_import.sql").write_text("\n".join(out) + "\n", encoding="utf-8")

    summary = [f"# Roster import review ({date})", "",
               f"- Scouts imported: **{len(scouts)}** in **{len(families)}** families",
               f"- Adults imported: **{len(adults)}** "
               f"({sum(a['role'] != 'parent' for a in adults)} leaders/committee, {sum(a['role'] == 'parent' for a in adults)} parents)",
               f"- Den leader assignments: **{sum(len(a['dens']) for a in adults)}**", "",
               "## Needs a decision", ""] + (review or ["- Nothing."]) + [
               "", "## Linked by last name only (please verify)", ""] + [
               f"- {s['first']} {s['last']} ({s['rank'].title()} {s['den_no']}): {s['linked_by']}"
               for s in scouts if s["linked_by"] != "email"] + [
               "", f"## Not imported: {len(skipped)} TWH adults with no registered scout and no leader role", "",
               ", ".join(sorted(skipped)) or "none",
               "", "These look like families of former scouts. Add any who should have access."]
    (imp / "roster_review.md").write_text("\n".join(summary) + "\n", encoding="utf-8")
    print("\n".join(summary))


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2])

#!/usr/bin/env python3
"""Temps de travail et versions de Lucie, LUS DANS L'HISTORIQUE GIT (Charles, 30 octobre 2026 : « mets à jour mon
temps de travail sur ce projet et le nombre de versions »). Aucun registre d'heures n'existe : le temps se déduit de
l'heure des commits. Une SÉANCE = des commits espacés de moins de 90 minutes ; sa durée = du premier au dernier,
plus 30 minutes (la mise en route avant le premier). Ce qui ne laisse pas de commit (réflexion, essais à l'écran,
réunions) n'est pas compté : c'est un MINIMUM. Les commits automatiques (« Lucie (auto-fix) ») sont écartés.
Usage : python3 scripts/temps-et-versions.py   (depuis la racine du dépôt)"""
import collections, datetime as dt, re, subprocess
from zoneinfo import ZoneInfo

TZ, ECART, MARGE = ZoneInfo('Europe/Brussels'), 90 * 60, 30 * 60
git = lambda *a: subprocess.run(['git', *a], capture_output=True, text=True, check=True).stdout

commits = [l.split('|', 1) for l in git('log', '--no-merges', '--format=%at|%an').splitlines()]
ts = sorted(int(t) for t, a in commits if a != 'Lucie (auto-fix)')
seances, deb, fin = [], ts[0], ts[0]
for t in ts[1:]:
    if t - fin > ECART: seances.append((deb, fin)); deb = t
    fin = t
seances.append((deb, fin))
mois = collections.defaultdict(float)
for d, f in seances: mois[dt.datetime.fromtimestamp(d, TZ).strftime('%Y-%m')] += (f - d + MARGE) / 3600
jours = {dt.datetime.fromtimestamp(t, TZ).date() for t in ts}

vers = re.findall(r'^\+(\d+\.\d+\.\d+)\s*$', git('log', '-p', '--format=', '--', 'VERSION'), re.M)
print(f"Du {dt.datetime.fromtimestamp(ts[0], TZ):%d/%m/%Y} au {dt.datetime.fromtimestamp(ts[-1], TZ):%d/%m/%Y}")
print(f"Temps (minimum) : {round(sum(mois.values()))} h en {len(seances)} séances, {len(jours)} jours actifs")
for k in sorted(mois): print(f"  {k} : {round(mois[k])} h")
print(f"Versions publiées : {len(vers)} changements de VERSION, {len(set(vers))} numéros distincts ; actuelle : {open('VERSION').read().strip()}")
print(f"Commits : {len(ts)} (hors fusions et corrections automatiques)")

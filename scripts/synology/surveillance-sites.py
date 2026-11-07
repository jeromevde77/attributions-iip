#!/usr/bin/env python3
"""
Surveille de l'EXTÉRIEUR que les sites de Lucie répondent, et prévient sur le
téléphone (ntfy) quand l'un tombe, puis quand il revient.

Pourquoi depuis le Synology : Beszel et lucie-disque tournent sur le VPS. Si le
VPS tombe ou se fige (5 novembre 2026, onze minutes), aucun des deux ne peut
prévenir. Ce script, lui, est ailleurs.

Usage (Synology, planificateur de tâches, toutes les 5 minutes) :
  python3 surveillance-sites.py <sujet-ntfy>
  python3 surveillance-sites.py <sujet-ntfy> --essai   # notification de test

Une panne n'est signalée qu'après DEUX échecs de suite (10 minutes) : un
redémarrage de conteneur ou une coupure de quelques secondes ne réveille
personne. Le retour est signalé dès le premier succès.

État : etat-sites.json ; journal : journal-sites.log, à côté de ce script.
Python 3.8 (DSM 7) : bibliothèque standard seulement.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

SITES = {
    "www": "https://www.lucie-iip.be",
    "etudiants": "https://etudiants.lucie-iip.be",
    "enseignants": "https://enseignants.lucie-iip.be",
    "dev": "https://dev.lucie-iip.be",
    "monitor": "https://monitor.lucie-iip.be",
}
ECHECS_AVANT_ALERTE = 2
DELAI = 20  # secondes par site

ICI = Path(__file__).resolve().parent
ETAT = ICI / "etat-sites.json"
JOURNAL = ICI / "journal-sites.log"


def noter(ligne):
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now():%Y-%m-%d %H:%M}  {ligne}\n")


def prevenir(sujet, titre, message, priorite="high"):
    if not sujet:
        print(f"{titre}\n{message}")
        return
    requete = urllib.request.Request(
        f"https://ntfy.sh/{sujet}", data=message.encode("utf-8"),
        headers={"Title": titre.encode("ascii", "ignore").decode(),
                 "Priority": priorite, "Tags": "globe_with_meridians"})
    try:
        urllib.request.urlopen(requete, timeout=30).close()
    except Exception as e:
        noter(f"ERREUR  notification ntfy non envoyée : {e}")


def sonder(url):
    """None si le site répond (2xx/3xx), sinon la raison de l'échec."""
    requete = urllib.request.Request(url, headers={"User-Agent": "lucie-surveillance"})
    try:
        with urllib.request.urlopen(requete, timeout=DELAI) as r:
            return None if r.status < 400 else f"HTTP {r.status}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return str(getattr(e, "reason", e))[:80]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    sujet = args[0] if args else None
    if "--essai" in sys.argv:
        prevenir(sujet, "Lucie - essai surveillance", "La surveillance des sites depuis le Synology est en place.", "default")
        noter("essai  notification de test envoyée")
        return 0

    try:
        etat = json.loads(ETAT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        etat = {}

    tombes, revenus = [], []
    for nom, url in SITES.items():
        avant = etat.get(nom, {"echecs": 0, "signale": False})
        raison = sonder(url)
        if raison is None:
            if avant["signale"]:
                revenus.append(nom)
            etat[nom] = {"echecs": 0, "signale": False}
        else:
            echecs = avant["echecs"] + 1
            signale = avant["signale"]
            if echecs >= ECHECS_AVANT_ALERTE and not signale:
                tombes.append(f"{nom} ({raison})")
                signale = True
            etat[nom] = {"echecs": echecs, "signale": signale, "raison": raison}

    ETAT.write_text(json.dumps(etat, indent=1), encoding="utf-8")

    if tombes:
        noter("PANNE  " + ", ".join(tombes))
        prevenir(sujet, "Lucie - site injoignable", "Ne répond plus depuis 10 min : " + ", ".join(tombes), "urgent")
    if revenus:
        noter("RETOUR  " + ", ".join(revenus))
        prevenir(sujet, "Lucie - site revenu", "Répond de nouveau : " + ", ".join(revenus), "default")
    return 0


if __name__ == "__main__":
    sys.exit(main())

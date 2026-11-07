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

Deux sortes de contrôles :
- les PAGES (nginx répond) ;
- les API (le backend répond {"ok": true}). Indispensable : nginx sert la page
  avec un 200 même quand le backend est mort — Lucie afficherait une page
  blanche sans qu'aucun contrôle de page ne le voie.
Et une fois par jour, les CERTIFICATS HTTPS : alerte s'il en reste moins de
JOURS_CERTIFICAT jours (Caddy renouvelle à 30 jours : un certificat à 14 jours
de sa fin, c'est un renouvellement qui échoue).

État : etat-sites.json ; journal : journal-sites.log, à côté de ce script.
Python 3.8 (DSM 7) : bibliothèque standard seulement.
"""

import json
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# nom → (adresse, "page" | "api")
SITES = {
    "www": ("https://www.lucie-iip.be", "page"),
    "www-api": ("https://www.lucie-iip.be/api/health", "api"),
    "etudiants": ("https://etudiants.lucie-iip.be", "page"),
    "enseignants": ("https://enseignants.lucie-iip.be", "page"),
    "portail-api": ("https://etudiants.lucie-iip.be/api/portail/sante", "api"),
    "dev": ("https://dev.lucie-iip.be", "page"),
    "dev-api": ("https://dev.lucie-iip.be/api/health", "api"),
    "portail-dev-api": ("https://etudiants-dev.lucie-iip.be/api/portail/sante", "api"),
    "monitor": ("https://monitor.lucie-iip.be", "page"),
}
CERTIFICATS = ["lucie-iip.be", "www.lucie-iip.be", "dev.lucie-iip.be",
               "etudiants.lucie-iip.be", "etudiants-dev.lucie-iip.be",
               "enseignants.lucie-iip.be", "enseignants-dev.lucie-iip.be",
               "monitor.lucie-iip.be"]
JOURS_CERTIFICAT = 14
ECHECS_AVANT_ALERTE = 2
DELAI = 20  # secondes par contrôle

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


def sonder(url, sorte):
    """None si ça répond comme il faut, sinon la raison de l'échec.
    page : 2xx/3xx. api : 200 ET un JSON {"ok": true}."""
    requete = urllib.request.Request(url, headers={"User-Agent": "lucie-surveillance"})
    try:
        with urllib.request.urlopen(requete, timeout=DELAI) as r:
            if r.status >= 400:
                return f"HTTP {r.status}"
            if sorte == "api":
                try:
                    if json.loads(r.read(65536)).get("ok") is not True:
                        return "le backend ne dit pas ok"
                except ValueError:
                    return "réponse non JSON (backend absent ?)"
            return None
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return str(getattr(e, "reason", e))[:80]


def jours_restants(hote):
    """Jours avant l'expiration du certificat HTTPS de hote (ou la raison de l'échec)."""
    try:
        contexte = ssl.create_default_context()
        with socket.create_connection((hote, 443), timeout=DELAI) as brut:
            with contexte.wrap_socket(brut, server_hostname=hote) as tls:
                fin = ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"])
        return int((fin - time.time()) // 86400)
    except Exception as e:
        return str(getattr(e, "reason", e))[:80]


def controler_certificats(sujet, etat):
    """Une fois par jour au plus (le script tourne toutes les 5 minutes)."""
    if time.time() - etat.get("_certificats", 0) < 86400:
        return
    etat["_certificats"] = time.time()
    proches = []
    for hote in CERTIFICATS:
        j = jours_restants(hote)
        if isinstance(j, str):
            proches.append(f"{hote} (illisible : {j})")
        elif j < JOURS_CERTIFICAT:
            proches.append(f"{hote} ({j} j)")
    if proches:
        noter("CERTIFICAT  " + ", ".join(proches))
        prevenir(sujet, "Lucie - certificat HTTPS",
                 "Expire bientôt ou illisible : " + ", ".join(proches)
                 + ". Caddy ne renouvelle plus ? Voir docker logs lucie-caddy.", "high")


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
    for nom, (url, sorte) in SITES.items():
        avant = etat.get(nom, {"echecs": 0, "signale": False})
        raison = sonder(url, sorte)
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

    controler_certificats(sujet, etat)
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

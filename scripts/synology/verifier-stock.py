#!/usr/bin/env python3
"""
Surveille le stock des VPS OVH (VPS-2 et VPS-3) et prévient sur le téléphone
dès qu'un modèle redevient disponible dans un datacenter européen.

Route publique de l'API OVH, sans clé :
  GET /1.0/vps/order/rule/datacenter/aggregated?ovhSubsidiary=FR&planCodes=…
Elle donne le stock pour une NOUVELLE commande ; la mise à niveau sur place
dépend du même stock dans le datacenter du VPS. Le support OVH reste la
réponse sûre pour un datacenter précis.

Usage (Synology, planificateur de tâches, chaque matin) :
  python3 verifier-stock.py <sujet-ntfy>
Le sujet ntfy est le nom du canal auquel le téléphone est abonné dans l'app
ntfy ; quiconque le connaît peut y écrire et le lire : il se garde comme un
mot de passe. Sans sujet, le script ne fait que tenir le journal (et, sur un
Mac, affiche une notification locale).

Option --essai : envoie une notification de test et s'arrête.
Journal : journal.log, à côté de ce script.
"""

import json
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

MODELES = {
    "vps-2025-model2": "VPS-2 (gamme 2026)",
    "vps-2025-model3": "VPS-3 (gamme 2026)",
    "vps-2027-model2": "VPS-2 (gamme 2027)",
    "vps-2027-model3": "VPS-3 (gamme 2027)",
}
# Les datacenters où un VPS peut servir Lucie (Europe). Les autres sont ignorés.
EUROPE = {"GRA", "SBG", "EU-WEST-RBX", "DE", "UK", "WAW", "EU-SOUTH-MIL"}

URL = ("https://eu.api.ovh.com/1.0/vps/order/rule/datacenter/aggregated"
       "?ovhSubsidiary=FR&planCodes=" + ",".join(MODELES))
JOURNAL = Path(__file__).with_name("journal.log")


def noter(ligne):
    horodatage = datetime.now().strftime("%Y-%m-%d %H:%M")
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(f"{horodatage}  {ligne}\n")
    print(ligne)


def prevenir(titre, message, sujet=None):
    if sujet:
        requete = urllib.request.Request(
            f"https://ntfy.sh/{sujet}", data=message.encode("utf-8"),
            # En-têtes HTTP en ASCII : le titre reste sans accents
            headers={"Title": titre.encode("ascii", "ignore").decode(),
                     "Priority": "high", "Tags": "computer"})
        try:
            urllib.request.urlopen(requete, timeout=30).close()
        except Exception as e:
            noter(f"ERREUR  notification ntfy non envoyée : {e}")
    if sys.platform == "darwin":
        # display notification : le texte passe en argument, jamais dans le script AppleScript
        script = ('on run argv\n'
                  'display notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"\n'
                  'end run')
        subprocess.run(["osascript", "-e", script, titre, message], check=False)


def main():
    args = [a for a in sys.argv[1:] if a != "--essai"]
    sujet = args[0] if args else None
    if "--essai" in sys.argv:
        prevenir("Essai stock VPS OVH", "La surveillance du stock OVH est en place.", sujet)
        noter("essai  notification de test envoyée")
        return 0

    try:
        with urllib.request.urlopen(URL, timeout=30) as r:
            donnees = json.load(r)
    except Exception as e:  # réseau coupé, API indisponible : on réessaiera demain
        noter(f"ERREUR  API OVH injoignable : {e}")
        return 1

    disponibles = []
    for modele in donnees.get("models", []):
        nom = MODELES.get(modele.get("planCode"), modele.get("planCode"))
        dcs = sorted({d["datacenter"] for d in modele.get("datacenters", [])
                      if d.get("datacenter") in EUROPE
                      and d.get("linuxStatus", d.get("status")) != "out-of-stock"})
        if dcs:
            disponibles.append(f"{nom} : {', '.join(dcs)}")

    if disponibles:
        resume = " | ".join(disponibles)
        noter(f"DISPONIBLE  {resume}")
        prevenir("VPS OVH disponible", resume, sujet)
    else:
        noter("rupture  VPS-2 et VPS-3 en rupture dans tous les datacenters européens")
    return 0


if __name__ == "__main__":
    sys.exit(main())

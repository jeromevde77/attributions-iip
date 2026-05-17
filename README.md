# Attributions IIP — v2

Application web pour la gestion des attributions des professeurs à l'Institut Prigogine.
Migration des classeurs Excel `Attributions.xlsm` + `BD_UE_COURS.xlsx` vers une application partageable.

## 🎯 Pour démarrer

| Document | À lire |
|---|---|
| **`GUIDE-INSTALLATION-SYNOLOGY.md`** | **À LIRE EN PREMIER** — guide pas-à-pas pour déployer sur votre Synology |
| `MAQUETTE-V2.html` | Ouvrir dans un navigateur pour visualiser l'interface avant installation (aucune installation requise) |
| `CHANGELOG.md` | Détail des fonctionnalités v1 → v2 |

## 🚀 Démarrage rapide

```bash
# Sur le Synology, dans /volume1/docker/attributions-app/
cp .env.example .env && nano .env       # JWT_SECRET, HTTP_PORT, CORS_ORIGIN
sudo docker compose up -d --build
sudo docker compose exec backend npm run init-db
sudo docker compose exec backend npm run import-excel
sudo docker compose exec backend node scripts/seed-admin.js \
    votre@email.be MotDePasse "Votre Nom"
```

Application accessible sur **http://nas-ip:8080**

## ✨ Fonctionnalités v2

### Pages utilisateur
- **Tableau de bord** — KPIs, graphique de répartition par section, coût dotation, quadrimestres
- **Attributions** — Grille type Excel avec :
  - Édition inline des périodes/autonomie (calculs auto Total, Heures, Coût)
  - Filtres (Section, Professeur, Contrat, Type, recherche libre)
  - Création via formulaire structuré (UE → cours en cascade)
  - Suppression avec confirmation
  - Export Excel complet
- **Planning hebdomadaire** — Grille 43 semaines avec édition inline et calcul de solde
- **Professeurs** — Annuaire avec détail par enseignant (modal + liste de ses attributions)
- **Pilotage** — Tableaux SUMIFS reproduits en SQL : par section×niveau, par section×statut, par section×ETP, DOC2-3 avec colonne Écart
- **Utilisateurs** (admin only) — Création, changement de rôle, réinitialisation de mot de passe, désactivation

### Mécanique métier (= Excel)
| Excel | Application |
|---|---|
| `VLOOKUP` vers BD_UE_COURS | JOIN SQL automatique |
| `Total = Périodes + Autonomie` | Colonne calculée (GENERATED) |
| `Heures = Total × 50/60` | Colonne calculée |
| `Coût dotation = Total × 1.5 (SUP) ou × 1.25 (DS)` | Vue SQL |
| `Coût Q1/Q2 = répartition 40/60% si Q1/Q2` | Vue SQL |
| `Ancienneté CC = 360 si total>399, 180 si >39` | Vue SQL |
| `SUMIFS Tableau_pilotage` | `GROUP BY` SQL |
| `Charge HELB = Heures / 750 (MFP) ou 480 (MA) × 10` | Vue SQL |

## 🛡 Sécurité

- Authentification JWT (expiration 12h)
- Hash bcryptjs (10 rounds)
- 3 rôles : admin, éditeur, consultation
- Audit log automatique (toutes les modifs sont tracées)
- En-têtes Helmet
- HTTPS via reverse proxy DSM (voir guide)

## 🗂 Structure du projet

```
attributions-app/
├── GUIDE-INSTALLATION-SYNOLOGY.md   ⭐ guide pas-à-pas
├── MAQUETTE-V2.html                 ⭐ aperçu visuel
├── CHANGELOG.md
├── README.md                        (ce fichier)
├── docker-compose.yml
├── .env.example
├── backend/                         Express + SQLite + JWT
│   ├── Dockerfile
│   ├── src/
│   │   ├── server.js
│   │   ├── db/{index.js, schema.sql}
│   │   ├── middleware/auth.js
│   │   └── routes/
│   │       ├── auth.js              POST /login, GET /me
│   │       ├── attributions.js      CRUD attributions
│   │       ├── referentiels.js      UE, cours, profs, locaux
│   │       ├── pilotage.js          Tableaux d'agrégation
│   │       ├── planning.js          Planning hebdomadaire
│   │       ├── exports.js           DOC2-3, Excel
│   │       └── users.js             Gestion utilisateurs
│   ├── scripts/
│   │   ├── init-db.js
│   │   ├── import-from-excel.js
│   │   └── seed-admin.js
│   └── data/
│       ├── Attributions.xlsm        (à fournir)
│       ├── BD_UE_COURS.xlsx         (à fournir)
│       └── attributions.db          (créé automatiquement)
└── frontend/                        React + Vite + Tailwind
    ├── Dockerfile, nginx.conf
    └── src/
        ├── App.jsx                  routing
        ├── lib/api.js               wrapper fetch + JWT
        ├── components/
        │   └── AttributionForm.jsx  modale création
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── Attributions.jsx
            ├── Planning.jsx
            ├── Professeurs.jsx
            ├── Pilotage.jsx
            └── Users.jsx
```

## 🧪 Données validées

Sur vos fichiers Excel réels :
- 435 attributions importées
- 131 professeurs
- 120 UE, 236 cours, 259 AA
- 514 lignes de planning hebdomadaire
- 11 sections
- Top calculs cohérents : Prof A 448 IIP, Prof B 419+61h, Prof C 413, Prof D 364

## 📞 Support

En cas de problème, voir la section **Dépannage** de `GUIDE-INSTALLATION-SYNOLOGY.md`.

Pour signaler un comportement bizarre, vérifier d'abord les logs :
```bash
sudo docker compose logs backend
```

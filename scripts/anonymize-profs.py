#!/usr/bin/env python3
"""
Génère un fichier SQL d'anonymisation des professeurs pour l'environnement dev.
- Noms/prénoms fictifs (Faker fr_FR)
- Dates de naissance (25-65 ans)
- Emails fictifs
- Titres de capacité réalistes selon la section
- Matricule fictif (11 chiffres)
"""
import random, datetime, json, sys, unicodedata, unicodedata
from faker import Faker
import openpyxl

fake = Faker('fr_FR')
random.seed(42)  # reproductible
Faker.seed(42)

# ── Titres par discipline ────────────────────────────────────────────────────
TITRES = {
    'TIM': [  # Technologue en imagerie médicale
        ("Master en sciences biomédicales",
         "Bachelier en technologie médicale – imagerie médicale"),
        ("Master en radiobiologie",
         "Agrégé de l'enseignement secondaire supérieur en sciences"),
        ("Master en sciences de la santé publique",
         "Bachelier en soins infirmiers"),
        ("Docteur en médecine",
         "Master en physique médicale"),
        ("Master en biologie clinique",
         "Bachelier technologue en imagerie médicale"),
    ],
    'Psychomotricité': [
        ("Master en psychomotricité",
         "Bachelier en psychomotricité"),
        ("Master en psychologie clinique",
         "Bachelier en kinésithérapie"),
        ("Master en sciences de l'éducation",
         "Bachelier en psychomotricité"),
        ("Master en neuropsychologie",
         "Bachelier en ergothérapie"),
        ("Docteur en sciences psychologiques",
         "Master en psychomotricité"),
    ],
    'Optométrie': [
        ("Master en sciences optiques",
         "Bachelier en optométrie"),
        ("Master en optique et optométrie",
         "Bachelier en optique-optométrie"),
        ("Docteur en sciences",
         "Master en optométrie clinique"),
        ("Master en médecine",
         "Bachelier en soins optométriques"),
        ("Master en biophysique",
         "Bachelier en optométrie"),
    ],
    'Optique': [  # secondaire
        ("Brevet d'enseignement supérieur en optique",
         "Certificat de qualification en optique-lunetterie"),
        ("Bachelier en optométrie",
         "CESS – option sciences"),
        ("Master en optique",
         "Brevet technique en optique"),
    ],
    'FID-Guidance': [
        ("Master en psychologie",
         "Bachelier en éducation spécialisée"),
        ("Master en sciences de l'éducation",
         "Agrégé de l'enseignement secondaire inférieur"),
        ("Master en logopédie",
         "Bachelier en guidance"),
        ("Master en orthopédagogie",
         "Bachelier en psychologie"),
    ],
    'FID-Péda': [
        ("Master en sciences de l'éducation",
         "Agrégé de l'enseignement secondaire supérieur"),
        ("Master en pédagogie",
         "Bachelier en éducation"),
        ("Master en didactique",
         "Agrégé de l'enseignement secondaire inférieur"),
    ],
    'ATNUP': [  # Administration, gestion
        ("Master en gestion des ressources humaines",
         "Bachelier en gestion d'entreprise"),
        ("Master en droit social",
         "Agrégé de l'enseignement secondaire supérieur en droit"),
        ("Master en sciences du travail",
         "Bachelier en secrétariat de direction"),
        ("Master en management",
         "Bachelier en comptabilité"),
    ],
    'SAR': [  # Soins, accompagnement
        ("Master en soins infirmiers",
         "Bachelier en soins infirmiers"),
        ("Master en santé communautaire",
         "Bachelier en sage-femme"),
        ("Docteur en médecine",
         "Master en sciences infirmières"),
    ],
    'ME': [  # Mécanique/Électronique
        ("Master en ingénierie industrielle",
         "Bachelier en électromécanique"),
        ("Master en électronique",
         "Bachelier en automatisation"),
        ("Ingénieur civil électricien",
         "Master en génie électrique"),
    ],
    'RESTART': [
        ("Master en sciences de l'éducation",
         "Bachelier en travail social"),
        ("Master en insertion socioprofessionnelle",
         "Bachelier en éducation"),
    ],
    'Soins_plaies': [
        ("Master en sciences infirmières",
         "Bachelier en soins infirmiers, spécialisation plaies et cicatrisation"),
        ("Master en dermatologie (sciences médicales)",
         "Bachelier en soins infirmiers"),
    ],
    'A': [
        ("Master en sciences de la motricité",
         "Bachelier en kinésithérapie"),
    ],
}
DEFAULT_TITRES = [
    ("Master en sciences",
     "Bachelier en éducation"),
    ("Master en didactique",
     "Agrégé de l'enseignement secondaire supérieur"),
]

# ── Charger les profs existants ──────────────────────────────────────────────
wb = openpyxl.load_workbook('/mnt/user-data/uploads/Attributions.xlsm',
                             read_only=True, data_only=True)
ws_coord = wb['Coordonnées_professeurs']
ws_attr  = wb['Attributions']

# Map nom_reel -> {sections}
prof_sections = {}
for r in ws_attr.iter_rows(min_row=2, values_only=True):
    if r[33] and r[0]:
        key = str(r[33]).strip()
        if key not in prof_sections:
            prof_sections[key] = set()
        prof_sections[key].add(str(r[0]).strip())

profs_reels = []
for r in ws_coord.iter_rows(min_row=2, values_only=True):
    if r[0] and str(r[0]).strip() not in ('', '-', 'None'):
        nom   = str(r[0]).strip()
        prenom = str(r[1]).strip() if r[1] else ''
        statut = str(r[6]).strip() if r[6] else 'EXP'
        profs_reels.append({
            'nom_reel': nom,
            'prenom_reel': prenom,
            'nom_complet_reel': f"{nom} {prenom}",
            'statut': statut,
            'sections': sorted(prof_sections.get(f"{nom} {prenom}", set())),
        })

print(f"Trouvé {len(profs_reels)} professeurs réels", file=sys.stderr)

# ── Générer les données anonymes ─────────────────────────────────────────────
today = datetime.date.today()

def gen_naissance():
    age = random.randint(25, 65)
    annee = today.year - age
    mois = random.randint(1, 12)
    jour = random.randint(1, 28)
    return datetime.date(annee, mois, jour)

def gen_matricule():
    return ''.join([str(random.randint(0, 9)) for _ in range(11)])

def gen_titres(sections):
    """Choisir des titres cohérents avec la section principale."""
    for s in sections:
        if s in TITRES:
            pair = random.choice(TITRES[s])
            return pair[0], pair[1]
    return random.choice(DEFAULT_TITRES)

def genre_prenom(prenom):
    """Approximer le genre à partir du prénom pour cohérence."""
    return 'F'  # Faker donnera le bon genre

def normalize(s):
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn").lower()

# Éviter les doublons de noms fictifs
noms_utilises = set()
def gen_nom_unique():
    for _ in range(100):
        n = fake.last_name().upper()
        p = fake.first_name()
        cle = f"{n} {p}"
        if cle not in noms_utilises:
            noms_utilises.add(cle)
            return n, p
    return fake.last_name().upper(), fake.first_name()

# ── Produire le SQL ──────────────────────────────────────────────────────────
print("-- Anonymisation des professeurs pour l'environnement dev")
print("-- Généré automatiquement — NE PAS appliquer en production")
print("-- Chaque professeur conserve ses attributions")
print()
print("BEGIN TRANSACTION;")
print()

mappings = []
for prof in profs_reels:
    nom_fictif, prenom_fictif = gen_nom_unique()
    naissance = gen_naissance()
    matricule = gen_matricule()
    email_fictif = f"{normalize(prenom_fictif)}.{normalize(nom_fictif)}@lucie-dev.be"
    t1, t2 = gen_titres(prof['sections'])
    # Statut EA12 : CC -> 'T' (temporaire), EXP -> 'T' ou 'TPr'
    statut_ea12 = random.choice(['T', 'TPr']) if prof['statut'] == 'EXP' else 'T'

    mappings.append({
        'nom_reel': prof['nom_reel'],
        'prenom_reel': prof['prenom_reel'],
        'nom_fictif': nom_fictif,
        'prenom_fictif': prenom_fictif,
    })

    print(f"-- {prof['nom_reel']} {prof['prenom_reel']} → {nom_fictif} {prenom_fictif}")
    print(f"UPDATE professeur SET")
    print(f"  nom              = '{nom_fictif}',")
    print(f"  prenom           = '{prenom_fictif}',")
    print(f"  nom_complet      = '{nom_fictif} {prenom_fictif}',")
    print(f"  adresse_mail     = '{email_fictif}',")
    print(f"  mail_prive       = '',")
    print(f"  date_naissance   = '{naissance.isoformat()}',")
    print(f"  matricule        = '{matricule}',")
    print(f"  titre1           = '{t1}',")
    print(f"  titre2           = '{t2}',")
    print(f"  statut_ea12      = '{statut_ea12}'")
    print(f"WHERE nom = '{prof['nom_reel']}' AND prenom = '{prof['prenom_reel']}';")
    print()

print("COMMIT;")
print()
print("-- Mapping de référence (pour déboguer si besoin)")
print("/*")
for m in mappings:
    print(f"  {m['nom_reel']} {m['prenom_reel']}  →  {m['nom_fictif']} {m['prenom_fictif']}")
print("*/")

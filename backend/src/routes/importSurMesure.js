/**
 * importSurMesure.js — Importer un classeur en choisissant soi-même les
 * correspondances de colonnes.
 *
 * Les imports existants devinent les en-têtes en dur : ils cassent dès qu'un
 * intitulé change, comme cela s'est produit avec « PréEtud » et « Localité ».
 * Ici, on désigne à gauche le champ de Lucie qui REÇOIT, à droite la colonne du
 * document qui FOURNIT. Le réglage s'enregistre en profil, partagé par
 * l'établissement, pour ne pas être refait à chaque fois.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = express.Router();

/**
 * Ce que l'on peut alimenter, et par quelle clé rapprocher les lignes.
 *
 * Une cible déclare ses champs : ceux qui IDENTIFIENT la ligne existante
 * (« cle ») et ceux qu'on peut remplir. Rien n'est créé sans identification :
 * un import qui se trompe de clé duplique des dossiers.
 */
export const CIBLES = [
  {
    cle: 'etudiant',
    libelle: 'Étudiants — signalétique',
    description: "Complète les dossiers existants : adresse, naissance, contact.",
    table: 'etudiant',
    // Le numéro national d'abord : c'est le seul identifiant stable, le
    // matricule eCampus étant réattribué chaque rentrée.
    cles: [
      { champ: 'num_national', libelle: 'Numéro national', normaliser: 'chiffres' },
      { champ: 'email_ecole', libelle: 'Courriel école', normaliser: 'minuscules' },
      { champ: 'id_ecampus', libelle: 'Matricule eCampus', normaliser: 'texte' },
    ],
    champs: [
      { champ: 'nom', libelle: 'Nom' },
      { champ: 'prenom', libelle: 'Prénom' },
      { champ: 'titre', libelle: 'Titre (M./Mme)' },
      { champ: 'date_naissance', libelle: 'Date de naissance', type: 'date' },
      { champ: 'lieu_naissance', libelle: 'Lieu de naissance' },
      { champ: 'nationalite', libelle: 'Nationalité' },
      { champ: 'num_national', libelle: 'Numéro national' },
      { champ: 'id_ecampus', libelle: 'Matricule eCampus' },
      { champ: 'adresse', libelle: 'Adresse' },
      { champ: 'cp', libelle: 'Code postal' },
      { champ: 'localite', libelle: 'Localité' },
      { champ: 'gsm', libelle: 'Téléphone' },
      { champ: 'email_ecole', libelle: 'Courriel école' },
      { champ: 'email_perso', libelle: 'Courriel personnel' },
    ],
  },
];

(function migrer() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS import_profil (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        nom         TEXT NOT NULL,
        cible       TEXT NOT NULL,
        cle_choisie TEXT,
        corresp     TEXT NOT NULL,
        cree_par    TEXT,
        cree_le     TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
  } catch (e) { console.error('[importSurMesure] migration', e.message); }
})();

// ── Ce qu'on peut alimenter ─────────────────────────────────────────────────
r.get('/cibles', authRequired, (req, res) => res.json(CIBLES));

// ── Profils enregistrés ─────────────────────────────────────────────────────
r.get('/profils', authRequired, (req, res) => {
  const { cible } = req.query;
  const lignes = cible
    ? db.prepare('SELECT * FROM import_profil WHERE cible = ? ORDER BY nom').all(cible)
    : db.prepare('SELECT * FROM import_profil ORDER BY cible, nom').all();
  res.json(lignes.map(p => ({ ...p, corresp: JSON.parse(p.corresp || '{}') })));
});

r.post('/profils', authRequired, roleRequired('admin', 'directeur',
       'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { nom, cible, cle_choisie, corresp } = req.body || {};
  if (!nom || !cible || !corresp) {
    return res.status(400).json({ error: 'nom, cible et correspondances requis' });
  }
  // Un profil du même nom pour la même cible se remplace : on le règle, on
  // l'enregistre à nouveau, il ne s'en crée pas un second.
  const existant = db.prepare('SELECT id FROM import_profil WHERE nom = ? AND cible = ?')
    .get(nom, cible);
  if (existant) {
    db.prepare(`UPDATE import_profil SET cle_choisie = ?, corresp = ? WHERE id = ?`)
      .run(cle_choisie || null, JSON.stringify(corresp), existant.id);
    return res.json({ ok: true, id: existant.id, remplace: true });
  }
  const info = db.prepare(`
    INSERT INTO import_profil (nom, cible, cle_choisie, corresp, cree_par)
    VALUES (?,?,?,?,?)`).run(nom, cible, cle_choisie || null,
      JSON.stringify(corresp), req.user?.email || req.user?.nom || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

r.delete('/profils/:id', authRequired, roleRequired('admin', 'directeur',
         'directeur_adjoint', 'editeur'), (req, res) => {
  db.prepare('DELETE FROM import_profil WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/** Les dates arrivent sous quatre formes ; une valeur illisible ne vaut rien. */
const MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};
function versDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const num = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})$/.exec(s);
  if (num) {
    const a = num[3].length === 2 ? (Number(num[3]) > 30 ? '19' : '20') + num[3] : num[3];
    return `${a}-${num[2].padStart(2, '0')}-${num[1].padStart(2, '0')}`;
  }
  const l = /^(\d{1,2})\s*(?:er)?\s+([a-zéûôùîà]+)\s+(\d{4})$/i.exec(s);
  if (l) {
    const m = MOIS[l[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (m) return `${l[3]}-${String(m).padStart(2, '0')}-${l[1].padStart(2, '0')}`;
  }
  return null;
}

const normaliser = (v, mode) => {
  const s = String(v ?? '').trim();
  if (mode === 'chiffres') return s.replace(/[^0-9]/g, '');
  if (mode === 'minuscules') return s.toLowerCase();
  return s;
};

// ── Exécution ───────────────────────────────────────────────────────────────
r.post('/executer', authRequired, roleRequired('admin', 'directeur',
       'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { cible, cle_choisie, lignes, simulation, ecraser } = req.body || {};
  const decl = CIBLES.find(c => c.cle === cible);
  if (!decl) return res.status(400).json({ error: 'cible inconnue' });
  if (!Array.isArray(lignes) || !lignes.length) {
    return res.status(400).json({ error: 'aucune ligne' });
  }

  const declCle = decl.cles.find(k => k.champ === cle_choisie);
  if (!declCle) {
    return res.status(400).json({
      error: "Indiquez la colonne qui identifie la ligne : sans elle, l'import "
           + 'ne saurait pas quel dossier compléter.',
    });
  }

  // Index des lignes existantes, par la clé retenue.
  const index = {};
  for (const row of db.prepare(`SELECT * FROM ${decl.table}`).all()) {
    const k = normaliser(row[declCle.champ], declCle.normaliser);
    if (k) index[k] = row;
  }

  const autorises = new Set(decl.champs.map(c => c.champ));
  const rapport = { retrouves: 0, inconnus: [], modifications: [], champs: {},
                    illisibles: [] };

  const appliquer = db.transaction(() => {
    for (const l of lignes) {
      const k = normaliser(l[declCle.champ], declCle.normaliser);
      if (!k) continue;
      const actuel = index[k];
      if (!actuel) { rapport.inconnus.push({ cle: k, nom: l.nom || null }); continue; }
      rapport.retrouves++;

      const maj = {};
      for (const [champ, brut] of Object.entries(l)) {
        if (!autorises.has(champ)) continue;
        if (brut == null || String(brut).trim() === '') continue;

        const declChamp = decl.champs.find(c => c.champ === champ);
        let valeur = String(brut).trim();
        if (declChamp?.type === 'date') {
          const d = versDate(brut);
          if (!d) { rapport.illisibles.push(`${champ} : ${valeur}`); continue; }
          valeur = d;
        }

        // On COMPLÈTE : une valeur déjà présente n'est pas écrasée sans
        // demande explicite. Une liste importée n'est pas plus fiable que ce
        // qu'un secrétariat a corrigé à la main.
        const dejaLa = actuel[champ] != null && String(actuel[champ]).trim() !== '';
        if (dejaLa && !ecraser) continue;
        if (String(actuel[champ] ?? '') === valeur) continue;

        maj[champ] = valeur;
        rapport.champs[champ] = (rapport.champs[champ] || 0) + 1;
      }
      if (!Object.keys(maj).length) continue;

      rapport.modifications.push({
        id: actuel.id, libelle: [actuel.nom, actuel.prenom].filter(Boolean).join(' ') || k,
        champs: Object.keys(maj),
      });
      if (!simulation) {
        db.prepare(`UPDATE ${decl.table} SET ${Object.keys(maj).map(c => `${c} = ?`).join(', ')}
                    WHERE id = ?`).run(...Object.values(maj), actuel.id);
      }
    }
    if (simulation) throw new Error('SIMULATION');
  });

  try { appliquer(); } catch (e) {
    if (e.message !== 'SIMULATION') {
      console.error('[importSurMesure]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.json({
    ok: true, simulation: !!simulation,
    lignes_lues: lignes.length,
    retrouves: rapport.retrouves,
    champs: rapport.champs,
    modifications: rapport.modifications.slice(0, 60),
    nb_modifications: rapport.modifications.length,
    inconnus: rapport.inconnus.slice(0, 20),
    nb_inconnus: rapport.inconnus.length,
    illisibles: [...new Set(rapport.illisibles)].slice(0, 10),
    nb_illisibles: rapport.illisibles.length,
  });
});

export default r;

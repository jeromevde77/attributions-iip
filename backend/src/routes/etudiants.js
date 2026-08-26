// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Module Étudiants : base étudiants, inscriptions, résultats et PAE
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';

import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

export function migrerEtudiants(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      id_ecampus     TEXT UNIQUE,
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      date_naissance TEXT,
      email_ecole    TEXT,
      email_perso    TEXT,
      num_national   TEXT,
      gsm            TEXT,
      adresse        TEXT,
      localite       TEXT,
      cp             TEXT,
      titre          TEXT,
      actif          INTEGER NOT NULL DEFAULT 1,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_etudiant_nom ON etudiant(nom, prenom);

    CREATE TABLE IF NOT EXISTS etudiant_inscription (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      groupe         TEXT,
      statut         TEXT DEFAULT 'inscrit',
      resultat       TEXT,        -- 'reussi' | 'ajourne' | 'absent' | null
      mention        TEXT,        -- A, B, C, D, E
      points         REAL,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire, ue_num)
    );
    CREATE INDEX IF NOT EXISTS idx_inscription_etud
      ON etudiant_inscription(etudiant_id, annee_scolaire);
    `);
    console.log('[migration] Tables etudiant + etudiant_inscription créées');

    // Pièces du dossier individuel de l'apprenant (circulaire n° 9764 du 13/07/2026)
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_piece (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id  INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      type_piece   TEXT NOT NULL,
      statut       TEXT NOT NULL DEFAULT 'manquant',   -- manquant | recu | na
      commentaire  TEXT,
      maj_le       TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, type_piece)
    );`);

    // Colonnes réglementaires sur l'inscription (fiche d'inscription/reçu)
    const addCol = (t, def) => { try { dbx.exec('ALTER TABLE ' + t + ' ADD COLUMN ' + def); } catch {} };
    addCol('etudiant_inscription', "date_inscription TEXT");
    addCol('etudiant_inscription', "admission_type TEXT"); // 'titre' | 'test' | null
    addCol('etudiant_inscription', "dispense_complete INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "codiplomation_ch INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "di_specifique REAL");
    addCol('etudiant_inscription', "ects REAL");
    console.log('[migration] etudiant_piece + colonnes fiche inscription');
  } catch (e) { console.error('[migration] etudiants :', e.message); }
}

// Les 5 pièces réglementaires (circulaire dossiers apprenants EA)
export const PIECES_APPRENANT = [
  { type: 'identite',          libelle: "Copie du document d'identité" },
  { type: 'titre_cpr',         libelle: 'Titre correspondant aux capacités préalables requises (ou valorisation des acquis)' },
  { type: 'fiche_inscription', libelle: "Fiche d'inscription / reçu" },
  { type: 'decision_ce',       libelle: 'Décision favorable du Conseil des études (réinscription UE déjà réussie)' },
  { type: 'exoneration_di',    libelle: "Documents d'exonération du droit d'inscription" },
];

// ── Liste des étudiants ───────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const { section, q } = req.query;

  // Tous les étudiants actifs, avec leurs inscriptions toutes années confondues.
  // La section affichée vient des UE de leurs inscriptions (dernière année connue).
  let sql = `
    SELECT e.id, e.nom, e.prenom, e.email_ecole, e.id_ecampus,
           GROUP_CONCAT(DISTINCT u.section) AS sections,
           COUNT(DISTINCT i.ue_num) AS nb_ue,
           MAX(i.annee_scolaire) AS derniere_annee
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE e.actif = 1
  `;
  const params = [];

  if (section) { sql += ` AND u.section = ?`; params.push(section); }
  if (q) {
    sql += ` AND (e.nom LIKE ? OR e.prenom LIKE ? OR e.id_ecampus LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ` GROUP BY e.id ORDER BY e.nom, e.prenom`;

  res.json(db.prepare(sql).all(...params));
});

// ── Fiche étudiant avec inscriptions ─────────────────────────────────────────
r.get('/:id', authRequired, (req, res) => {
  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!etudiant) return res.status(404).json({ error: 'étudiant introuvable' });

  // Toutes les inscriptions, toutes années — le front groupe par année.
  const inscriptions = db.prepare(`
    SELECT i.*, u.ue_nom, u.ue_niv, u.ue_quad, u.section
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ?
    ORDER BY i.annee_scolaire DESC, u.section, i.ue_num
  `).all(etudiant.id);

  res.json({ ...etudiant, inscriptions });
});

// ── Encoder un résultat ───────────────────────────────────────────────────────
r.patch('/inscription/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { resultat, mention, points } = req.body;
  const RESULTATS = ['reussi', 'ajourne', 'absent', null];
  if (resultat !== undefined && !RESULTATS.includes(resultat)) {
    return res.status(400).json({ error: 'resultat invalide' });
  }
  db.prepare(`
    UPDATE etudiant_inscription SET resultat = ?, mention = ?, points = ? WHERE id = ?
  `).run(resultat ?? null, mention ?? null, points ?? null, Number(req.params.id));
  res.json({ ok: true });
});

// ── Générer le PAE pour une année ─────────────────────────────────────────────
// Logique : UEs organisées cette année dont les prérequis sont satisfaits
// (l'étudiant les a réussies l'année précédente ou elles n'ont pas de prérequis)
r.get('/:id/pae', authRequired, (req, res) => {
  const profId = Number(req.params.id);
  const annee = req.query.annee;
  const anneePrecedente = req.query.annee_precedente;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(profId);
  if (!etudiant) return res.status(404).json({ error: 'étudiant introuvable' });

  // UEs réussies explicitement (toutes années — un résultat encodé n'expire pas)
  const reussiesExplicites = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND resultat = 'reussi'
    `).all(profId).map(r => r.ue_num)
  );

  // UEs déjà suivies (toutes années confondues)
  const dejaSuivies = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ?
    `).all(profId).map(r => r.ue_num)
  );

  // Inférence par le graphe des prérequis : être inscrit à une UE prouve
  // la réussite de ses prérequis (condition d'accès), transitivement.
  // Ex. inscrite en 251 (2025-2026) → 248, et les prérequis de 248, réputés acquis.
  const tousPrereq = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = new Map();
  for (const p of tousPrereq) {
    if (!prereqDe.has(p.ue_num)) prereqDe.set(p.ue_num, []);
    prereqDe.get(p.ue_num).push(p.prerequis_num);
  }
  const reputeesAcquises = new Set();
  const pile = [...dejaSuivies];
  while (pile.length) {
    const ue = pile.pop();
    for (const pr of (prereqDe.get(ue) || [])) {
      if (!reputeesAcquises.has(pr)) { reputeesAcquises.add(pr); pile.push(pr); }
    }
  }

  // Ensemble effectif des acquis : explicite ∪ inféré
  const reussies = new Set([...reussiesExplicites, ...reputeesAcquises]);

  // Sections de l'étudiant — déduites de ses inscriptions passées
  const sectionsEtudiant = db.prepare(`
    SELECT DISTINCT u.section
    FROM etudiant_inscription i
    JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ? AND u.section IS NOT NULL
  `).all(profId).map(r => r.section);

  // UEs organisées cette année — uniquement dans les sections de l'étudiant
  let organisees = [];
  if (sectionsEtudiant.length) {
    const placeholders = sectionsEtudiant.map(() => '?').join(',');
    organisees = db.prepare(`
      SELECT o.ue_num, o.section, o.num_organisation, o.date_debut, o.date_fin,
             u.ue_nom, u.ue_niv, u.ue_quad
      FROM organisation_ue o
      LEFT JOIN ue u ON u.ue_num = o.ue_num AND u.annee_scolaire = ?
      WHERE o.annee_scolaire = ? AND o.section IN (${placeholders})
      ORDER BY u.section, o.ue_num
    `).all(annee, annee, ...sectionsEtudiant);
  }

  // Pour chaque UE organisée, vérifier les prérequis
  const pae = [];
  for (const ue of organisees) {
    const prerequis = db.prepare(`
      SELECT p.prerequis_num AS ue_num_requis, u.ue_nom
      FROM ue_prerequis p
      LEFT JOIN ue u ON u.ue_num = p.prerequis_num AND u.annee_scolaire = ?
      WHERE p.ue_num = ?
    `).all(annee, ue.ue_num);

    const prerequis_ok = prerequis.every(p => reussies.has(p.ue_num_requis));
    const deja_reussie = reussies.has(ue.ue_num);

    pae.push({
      ...ue,
      prerequis,
      prerequis_ok,
      deja_reussie,
      reputee_acquise: !reussiesExplicites.has(ue.ue_num) && reputeesAcquises.has(ue.ue_num),
      deja_suivie: dejaSuivies.has(ue.ue_num),
      accessible: prerequis_ok && !deja_reussie,
      // Circulaire 9764 : la réinscription dans une UE déjà réussie est possible
      // avec décision favorable du Conseil des études (pièce au dossier).
      reinscriptible_ce: prerequis_ok && deja_reussie,
    });
  }

  res.json({
    etudiant,
    annee,
    annee_precedente: anneePrecedente,
    sections: sectionsEtudiant,
    pae,
    accessibles: pae.filter(u => u.accessible).length,
    reference: 'PAE — Plan Annuel de l\'Étudiant. Basé sur les prérequis de la section et les UE organisées.'
  });
});

// ── Dossier individuel : les 5 pièces réglementaires ─────────────────────────
r.get('/:id/pieces', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const existantes = db.prepare(
    'SELECT type_piece, statut, commentaire, maj_le FROM etudiant_piece WHERE etudiant_id = ?'
  ).all(etudId);
  const map = Object.fromEntries(existantes.map(p => [p.type_piece, p]));
  res.json(PIECES_APPRENANT.map(p => ({
    ...p,
    statut: map[p.type]?.statut || 'manquant',
    commentaire: map[p.type]?.commentaire || null,
    maj_le: map[p.type]?.maj_le || null,
  })));
});

r.put('/:id/pieces/:type', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { statut, commentaire } = req.body;
  if (!['manquant', 'recu', 'na'].includes(statut)) {
    return res.status(400).json({ error: 'statut invalide (manquant|recu|na)' });
  }
  if (!PIECES_APPRENANT.some(p => p.type === req.params.type)) {
    return res.status(400).json({ error: 'type de pièce inconnu' });
  }
  db.prepare(`
    INSERT INTO etudiant_piece (etudiant_id, type_piece, statut, commentaire, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(etudiant_id, type_piece) DO UPDATE SET
      statut = excluded.statut, commentaire = excluded.commentaire, maj_le = datetime('now')
  `).run(Number(req.params.id), req.params.type, statut, commentaire || null);
  res.json({ ok: true });
});

// ── Fiche d'inscription / reçu (HTML imprimable, contenu circulaire 9764) ────
r.get('/:id/fiche-inscription', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const etab = (() => {
    try {
      return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'etablissement_nom'").get()?.valeur
        || 'Institut Ilya Prigogine';
    } catch { return 'Institut Ilya Prigogine'; }
  })();

  const inscriptions = db.prepare(`
    SELECT i.*, u.ue_nom, u.section
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY u.section, i.ue_num
  `).all(etudId, annee);

  // Historique des études antérieures dans l'établissement (exigence circulaire)
  const historique = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.resultat, u.ue_nom
    FROM etudiant_inscription i
    LEFT JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
    WHERE i.etudiant_id = ? AND i.annee_scolaire < ?
    ORDER BY i.annee_scolaire DESC, i.ue_num
  `).all(etudId, annee);

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const resLabel = { reussi: 'Réussi', ajourne: 'Ajourné', absent: 'Absent' };

  const lignes = inscriptions.map(i => `
    <tr>
      <td>${i.ue_num}</td>
      <td>${esc(i.ue_nom || '')}${i.codiplomation_ch ? ' <b>(CH)</b>' : ''}</td>
      <td>${esc(i.section || '')}</td>
      <td>${esc(i.date_inscription || '')}</td>
      <td>${i.admission_type === 'titre' ? 'Titre' : i.admission_type === 'test' ? 'Test' : '—'}</td>
      <td>${i.dispense_complete ? 'Dispense complète' : '—'}</td>
      <td style="text-align:right">${i.di_specifique != null ? Number(i.di_specifique).toFixed(2) + ' €' : '—'}</td>
      <td style="text-align:right">${i.ects != null ? i.ects : '—'}</td>
    </tr>`).join('');

  const lignesHisto = historique.map(h => `
    <tr>
      <td>${esc(h.annee_scolaire)}</td>
      <td>${h.ue_num}</td>
      <td>${esc(h.ue_nom || '')}</td>
      <td>${resLabel[h.resultat] || '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Fiche d'inscription — ${esc(e.nom)} ${esc(e.prenom)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1B2B4B; margin: 32px; }
  h1 { font-size: 17px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 18px 0 6px; }
  .etab { font-size: 13px; font-weight: 600; }
  .meta { color: #556; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 7px; text-align: left; }
  th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  .sig { margin-top: 34px; display: flex; gap: 60px; }
  .sig div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 11px; }
  .footer { margin-top: 22px; font-size: 10px; color: #64748b; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<div class="etab">${esc(etab)} — Enseignement pour Adultes</div>
<h1>Fiche d'inscription / reçu — ${esc(annee)}</h1>
<div class="meta">
  ${esc(e.titre || '')} <b>${esc(e.nom)} ${esc(e.prenom)}</b>
  ${e.date_naissance ? ' · né(e) le ' + esc(e.date_naissance) : ''}
  ${e.num_national ? ' · RN ' + esc(e.num_national) : ''}<br>
  ${esc([e.adresse, e.cp, e.localite].filter(Boolean).join(', '))}
  ${e.email_ecole ? ' · ' + esc(e.email_ecole) : ''}
</div>

<h2>Unités d'enseignement — inscription ${esc(annee)}</h2>
<table>
  <thead><tr>
    <th>UE</th><th>Intitulé</th><th>Section</th><th>Date d'inscription</th>
    <th>Admission</th><th>Valorisation</th><th>DI spécifique</th><th>ECTS</th>
  </tr></thead>
  <tbody>${lignes || '<tr><td colspan="8" style="text-align:center;color:#94a3b8">Aucune UE inscrite pour cette année</td></tr>'}</tbody>
</table>

${historique.length ? `
<h2>Historique des études antérieures au sein de l'établissement</h2>
<table>
  <thead><tr><th>Année</th><th>UE</th><th>Intitulé</th><th>Résultat</th></tr></thead>
  <tbody>${lignesHisto}</tbody>
</table>` : ''}

<div class="sig">
  <div>Signature de l'apprenant</div>
  <div>Pour l'établissement</div>
</div>
<div class="footer">
  Mention « CH » : UE suivie dans le cadre d'un programme d'études en codiplômation.
  Document imprimé le ${new Date().toLocaleDateString('fr-BE')} — ${esc(etab)}.
</div>
</body></html>`;

  res.json({ html, nom: 'fiche_inscription_' + (e.nom || 'etudiant') + '_' + annee + '.html' });
});

// ── Ajouter un étudiant manuellement ─────────────────────────────────────────
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, prenom, annee, ue_nums, ...rest } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom requis' });

  const info = db.prepare(`
    INSERT INTO etudiant (nom, prenom, email_ecole, email_perso, date_naissance,
                         num_national, gsm, adresse, localite, cp, titre)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(nom, prenom, rest.email_ecole||null, rest.email_perso||null,
         rest.date_naissance||null, rest.num_national||null, rest.gsm||null,
         rest.adresse||null, rest.localite||null, rest.cp||null, rest.titre||null);

  const id = Number(info.lastInsertRowid);

  // Inscriptions initiales
  if (annee && Array.isArray(ue_nums)) {
    const ins = db.prepare(
      'INSERT OR IGNORE INTO etudiant_inscription (etudiant_id,annee_scolaire,ue_num) VALUES (?,?,?)'
    );
    for (const n of ue_nums) ins.run(id, annee, Number(n));
  }

  res.json({ ok: true, id });
});

// ── Import depuis le fichier eCampus Excel ───────────────────────────────────
// Le frontend lit le fichier XLS/XLSX avec SheetJS et envoie les données en JSON.
// La colonne Code_UE contient directement le ue_num Lucie.
r.post('/import-excel', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const { annee, etudiants: etudiantsData, inscriptions: inscriptionsData } = req.body;
  if (!annee || !Array.isArray(etudiantsData)) {
    return res.status(400).json({ error: 'annee et etudiants requis' });
  }

  try {
    const insEtud = db.prepare(`
      INSERT INTO etudiant (id_ecampus,nom,prenom,email_ecole,email_perso,
        date_naissance,num_national,gsm,adresse,localite,cp,titre)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id_ecampus) DO UPDATE SET
        nom=excluded.nom, prenom=excluded.prenom,
        email_ecole=excluded.email_ecole, email_perso=excluded.email_perso
    `);
    const insInsc = db.prepare(`
      INSERT OR IGNORE INTO etudiant_inscription (etudiant_id,annee_scolaire,ue_num,groupe)
      SELECT id,?,?,? FROM etudiant WHERE id_ecampus=? LIMIT 1
    `);

    let etudiants_crees=0, inscriptions_creees=0;
    const tx = db.transaction(() => {
      for (const e of etudiantsData) {
        const r = insEtud.run(e.id_ecampus||null, e.nom||'', e.prenom||'',
          e.email_ecole||null, e.email_perso||null, e.date_naissance||null,
          e.num_national||null, e.gsm||null, e.adresse||null,
          e.localite||null, e.cp||null, e.titre||null);
        if (r.changes) etudiants_crees++;
      }
      for (const i of inscriptionsData) {
        if (!i.ue_num || isNaN(Number(i.ue_num))) continue;
        const r = insInsc.run(annee, Number(i.ue_num), i.groupe||null, i.id_ecampus);
        if (r.changes) inscriptions_creees++;
      }
    });
    tx();

    res.json({ ok:true, etudiants: etudiantsData.length, etudiants_crees,
               inscriptions: inscriptionsData.length, inscriptions_creees, annee });
  } catch(e) {
    console.error('Import étudiants:', e);
    res.status(500).json({ error: e.message });
  }
});


export default r;

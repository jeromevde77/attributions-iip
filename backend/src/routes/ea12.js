import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { Packer } from 'docx';
import { buildEA12bis } from '../services/ea12_build.js';

const r = Router();

/* ---------- Helpers ---------- */

// Construit l'objet `data` attendu par le générateur à partir de la base.
function construireData(ea12Row, donnees) {
  const prof = db.prepare('SELECT * FROM professeur WHERE id = ?').get(ea12Row.professeur_id) || {};
  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};

  // Attributions du prof pour l'année, agrégées par (codification, cours, type)
  const lignes = db.prepare(`
    SELECT codification_unite, nom_cours, type_cours, niveau,
           SUM(COALESCE(total_attribue_professeur, periodes_attribuees, 0)) AS periodes
    FROM v_attribution_complete
    WHERE professeur_id = ? AND annee_scolaire = ?
    GROUP BY codification_unite, nom_cours, type_cours
    ORDER BY codification_unite, nom_cours
  `).all(ea12Row.professeur_id, ea12Row.annee_scolaire);

  // Déterminer TC/TL : tout TC sauf si la section du prof est de niveau Master -> TL.
  // (règle IIP validée : tout le supérieur est TC, Master = TL)
  const attributions = lignes
    .filter(l => l.periodes && l.periodes > 0)
    .map(l => ({
      ue: l.codification_unite || '',
      f: 'D',                            // dotation (défaut IIP)
      denomination: l.nom_cours || '',
      cla: l.type_cours || '',
      periode_occ: '',
      tctl: 'TC',                        // TODO Master->TL quand niveau dispo
      nb_periodes: l.periodes ? String(Math.round(l.periodes)) : '',
      titre: '', sit_adm: '', di: '', oe: '',
    }));

  return {
    annee: ea12Row.annee_scolaire,
    doc_num: donnees.doc_num || '',
    dernier_doc12: donnees.dernier_doc12 || '',
    etab,
    matricule: prof.matricule || donnees.matricule || '',
    prof_nom: prof.nom || '',
    prof_prenom: prof.prenom || '',
    titre1: prof.titre1 || donnees.titre1 || '',
    titre2: prof.titre2 || donnees.titre2 || '',
    titre3: donnees.titre3 || '',
    statut: prof.statut_ea12 || donnees.statut || '',
    // Champs de situation (saisis dans l'éditeur)
    pas_cumul: donnees.pas_cumul || false,
    prest_sec: donnees.prest_sec || false,
    prest_sup: donnees.prest_sup ?? true,
    prest_exp: donnees.prest_exp || false,
    jours: donnees.jours || null,
    date_evenement: donnees.date_evenement || '',
    semaines: donnees.semaines || '',
    justif: donnees.justif || '',
    observations: donnees.observations || '',
    resume: donnees.resume || {},
    attributions: donnees.attributions_override || attributions,
  };
}

/* ---------- CRUD ---------- */

// Lister les EA12 (option filtrage par prof ou année)
r.get('/', authRequired, (req, res) => {
  const { professeur_id, annee } = req.query;
  let sql = `SELECT e.*, p.nom AS prof_nom, p.prenom AS prof_prenom
             FROM ea12 e JOIN professeur p ON p.id = e.professeur_id WHERE 1=1`;
  const args = [];
  if (professeur_id) { sql += ' AND e.professeur_id = ?'; args.push(professeur_id); }
  if (annee) { sql += ' AND e.annee_scolaire = ?'; args.push(annee); }
  sql += ' ORDER BY e.modifie_le DESC';
  res.json(db.prepare(sql).all(...args));
});

// Lire un EA12
r.get('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  row.donnees = JSON.parse(row.donnees_json || '{}');
  res.json(row);
});

// Créer un EA12 (brouillon)
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { professeur_id, annee_scolaire, variante = 'bis', donnees = {} } = req.body || {};
  if (!professeur_id || !annee_scolaire) return res.status(400).json({ error: 'professeur_id et annee_scolaire requis' });
  const info = db.prepare(`INSERT INTO ea12 (professeur_id, annee_scolaire, variante, donnees_json, cree_par)
                           VALUES (?, ?, ?, ?, ?)`)
    .run(professeur_id, annee_scolaire, variante, JSON.stringify(donnees), req.user?.id || null);
  res.json({ id: info.lastInsertRowid });
});

// Mettre à jour un EA12
r.put('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { donnees, variante, statut_doc } = req.body || {};
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  db.prepare(`UPDATE ea12 SET donnees_json = ?, variante = ?, statut_doc = ?, modifie_le = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(donnees ?? JSON.parse(row.donnees_json)), variante || row.variante, statut_doc || row.statut_doc, req.params.id);
  res.json({ ok: true });
});

// Supprimer un EA12
r.delete('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  db.prepare('DELETE FROM ea12 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Génération du document ---------- */

// Générer le .docx d'un EA12 enregistré
r.get('/:id/document', authRequired, async (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const donnees = JSON.parse(row.donnees_json || '{}');
  const data = construireData(row, donnees);
  try {
    const buf = await Packer.toBuffer(buildEA12bis(data));
    // Marquer comme généré
    db.prepare("UPDATE ea12 SET statut_doc = 'genere', modifie_le = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    const fname = `EA12_${data.prof_nom}_${data.prof_prenom}_${row.annee_scolaire}.docx`.replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  } catch (e) {
    console.error('[ea12] génération échouée :', e);
    res.status(500).json({ error: 'Génération du document échouée : ' + e.message });
  }
});

// Aperçu des données qui seront utilisées (pour pré-remplir l'éditeur)
r.get('/:id/apercu', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const donnees = JSON.parse(row.donnees_json || '{}');
  res.json(construireData(row, donnees));
});

export default r;

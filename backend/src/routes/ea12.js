import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { buildEA12Html } from '../services/ea12_html.js';

const r = Router();

/* UN EA12 TRANSMIS NE SE MODIFIE PLUS, IL SE RECTIFIE (3.5.228, circ. 9760 V.1.2-1.3.1) : la transmission à GEDI se note
   (`transmis_le`, `transmis_par`) ; ensuite le document ne se modifie ni ne se supprime — on crée un RECTIFICATIF, qui prend le
   numéro suivant et garde le lien (`remplace_id`). */
try {
  const cols = db.prepare("PRAGMA table_info(ea12)").all().map(c => c.name);
  for (const [c, t] of [['transmis_le', 'TEXT'], ['transmis_par', 'TEXT'], ['remplace_id', 'INTEGER']]) if (cols.length && !cols.includes(c)) db.exec(`ALTER TABLE ea12 ADD COLUMN ${c} ${t}`);
} catch (e) { console.error('[migration] ea12 transmis :', e.message); }
const LIGNES_CC = `FROM v_attribution_complete v
    WHERE professeur_id = ? AND annee_scolaire = ?
      AND UPPER(COALESCE((SELECT a.statut_exception FROM attribution a WHERE a.id = v.id),
                         (SELECT p.statut FROM professeur p WHERE p.id = v.professeur_id), '')) <> 'EXP'`;

/* ---------- Helpers ---------- */

// Convertit une date ISO (AAAA-MM-JJ) en JJ/MM/AAAA (format officiel EA12).
function dateFr(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

// Construit l'objet `data` attendu par le générateur à partir de la base.
export function construireDataEA12(ea12Row, donnees) { return construireData(ea12Row, donnees); }
function construireData(ea12Row, donnees) {
  const prof = db.prepare('SELECT * FROM professeur WHERE id = ?').get(ea12Row.professeur_id) || {};
  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};

  // Attributions du prof pour l'année, agrégées par (codification, cours, type)
  const lignes = db.prepare(`
    SELECT codification_unite, nom_cours, type_cours, niveau, MIN(section) AS section,
           CASE WHEN UPPER(COALESCE(cours_ept_ad, '')) = 'EPT' THEN 1 ELSE 0 END AS ept,
           SUM(COALESCE(total_attribue_professeur, periodes_attribuees, 0)) AS periodes
    FROM v_attribution_complete v
    WHERE professeur_id = ? AND annee_scolaire = ?
      /* LES PÉRIODES D'EXPERT NE VONT PAS SUR CET EA12 (Charles, 27 septembre
         2026) : elles ont le leur (A1 ter) et leur contrat. Le statut d'une
         ligne est celui de son exception, sinon celui du membre. */
      AND UPPER(COALESCE((SELECT a.statut_exception FROM attribution a WHERE a.id = v.id),
                         (SELECT p.statut FROM professeur p WHERE p.id = v.professeur_id), '')) <> 'EXP'
    GROUP BY codification_unite, nom_cours, type_cours, ept
    ORDER BY codification_unite, nom_cours, ept
  `).all(ea12Row.professeur_id, ea12Row.annee_scolaire);

  // Déterminer TC/TL : tout TC sauf si la section du prof est de niveau Master -> TL.
  // (règle IIP validée : tout le supérieur est TC, Master = TL)
  const attributions = lignes
    .filter(l => l.periodes && l.periodes > 0)
    .map(l => ({
      ue: l.codification_unite || '',
      /* SOURCE DE FINANCEMENT (circ. 9760, p.204 et 211-212) : D par défaut
         (dotation) ; pour les UE du brevet d'assistant en soins infirmiers,
         toujours « BAESI » — c'est la section AeSI, ouverte en 2026-2027. */
      f: l.section === 'AeSI' ? 'BAESI' : 'D',
      /* L'EXPERTISE PÉDAGOGIQUE ET TECHNIQUE SUR SA PROPRE LIGNE (3.5.232, circ. 9760 V.1.3.9.1) : les périodes d'EPT se séparent
         de celles de la fonction à laquelle elles sont rattachées, et leur libellé est précédé de « EPT ». La ligne de l'attribution
         le dit (`cours_ept_ad = 'EPT'`, colonne EPT/AD des attributions). */
      denomination: l.ept ? `EPT ${l.nom_cours || ''}`.trim() : (l.nom_cours || ''),
      cla: l.type_cours || '',
      periode_occ: '',
      tctl: 'TC',                        // TODO Master->TL quand niveau dispo
      nb_periodes: l.periodes ? String(Math.round(l.periodes)) : '',
      titre: '', sit_adm: '', di: '', oe: '',
    }));

  return {
    annee: ea12Row.annee_scolaire,
    doc_num: ea12Row.num_doc ? String(ea12Row.num_doc) : '',
    /* CHAQUE DOC12 PORTE LA DATE DU PRÉCÉDENT (circ. 9760). À défaut d'une
       date saisie, celle du document précédent de la même personne et de la
       même année, s'il existe. */
    dernier_doc12: dateFr(donnees.dernier_doc12) || (() => {
      // « Même année scolaire ou non » (circ. 9760) : le précédent, cette année ou une année d'avant ; la date de transmission
      // quand elle est notée, sinon la dernière modification.
      const prec = db.prepare(`SELECT COALESCE(transmis_le, modifie_le) AS d FROM ea12 WHERE professeur_id = ? AND id <> ?
        AND (annee_scolaire < ? OR (annee_scolaire = ? AND num_doc < ?)) ORDER BY annee_scolaire DESC, num_doc DESC LIMIT 1`)
        .get(ea12Row.professeur_id, ea12Row.id || 0, ea12Row.annee_scolaire, ea12Row.annee_scolaire, ea12Row.num_doc || 0);
      return prec?.d ? dateFr(String(prec.d).slice(0, 10)) : '';
    })(),
    transitoire_baesi: !!donnees.transitoire_baesi,
    etab,
    matricule: prof.matricule || donnees.matricule || '',
    prof_nom: prof.nom || '',
    /* LE PREMIER PRÉNOM DE L'ÉTAT CIVIL SEULEMENT (circ. 9760) : « Marie
       Anne Claire » s'écrit « Marie » ; un prénom composé à trait d'union
       (« Jean-Éric ») reste entier. */
    prof_prenom: String(prof.prenom || '').trim().split(/\s+/)[0] || '',
    titre1: donnees.titre1_override ?? prof.titre1 ?? '',
    titre2: donnees.titre2_override ?? prof.titre2 ?? '',
    derogation_titre: !!donnees.derogation_titre,
    statut: donnees.statut_override || prof.statut_ea12 || donnees.statut || '',
    pas_cumul: donnees.pas_cumul || false,
    prest_sec: donnees.prest_sec || false,
    prest_sup: donnees.prest_sup ?? true,
    prest_exp: donnees.prest_exp || false,
    prest_acs: donnees.prest_acs || false,
    cumul_a2: donnees.cumul_a2 || false,
    transmission_tardive: donnees.transmission_tardive || false,
    jours: donnees.jours || etab.jours_fonctionnement || null,
    date_evenement: dateFr(donnees.date_evenement) || '',
    semaines: donnees.semaines || '',
    type_evenement: donnees.type_evenement || '',
    type_evenement_autres: donnees.type_evenement_autres || '',
    justifs: donnees.justifs || (donnees.justif ? [donnees.justif] : []),
    justif_autres: donnees.justif_autres || '',
    type_absence: donnees.type_absence || '',
    motif_absence: donnees.motif_absence || '',
    date_debut_absence: dateFr(donnees.date_debut_absence) || '',
    date_fin_absence: dateFr(donnees.date_fin_absence) || '',
    observations: donnees.observations || '',
    attributions: donnees.attributions_override || attributions,
    oe_slots: donnees.oe_slots || [],
  };
}

/* ---------- CRUD ---------- */

// Lister les EA12 (option filtrage par prof ou année)
/* QUI PRODUIT L'EA12 : la direction, la direction adjointe et le secrétariat
   (`editeur` couvre le secrétariat, `admin` la direction — roleRequired). Les
   routes du document n'exigeaient qu'une connexion : la pièce porte le
   matricule et les titres d'un membre du personnel (27 septembre 2026). */
r.get('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { professeur_id, annee } = req.query;
  let sql = `SELECT e.*, p.nom AS prof_nom, p.prenom AS prof_prenom
             FROM ea12 e JOIN professeur p ON p.id = e.professeur_id WHERE 1=1`;
  const args = [];
  if (professeur_id) { sql += ' AND e.professeur_id = ?'; args.push(professeur_id); }
  if (annee) { sql += ' AND e.annee_scolaire = ?'; args.push(annee); }
  sql += ' ORDER BY e.modifie_le DESC';
  res.json(db.prepare(sql).all(...args));
});

/* LE CONTRÔLE DE RENTRÉE (3.5.228, circ. 9760 V.1.2 : un Doc12 par membre et par rentrée, même sans changement) : qui porte des
   périodes de chargé de cours cette année sans aucun EA12, et quels EA12 ne sont pas encore notés transmis. */
r.get('/controle', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const profs = db.prepare(`SELECT DISTINCT professeur_id AS id FROM v_attribution_complete WHERE annee_scolaire = ? AND professeur_id IS NOT NULL`).all(annee);
  const per = db.prepare(`SELECT SUM(COALESCE(total_attribue_professeur, periodes_attribuees, 0)) n ${LIGNES_CC}`);
  const p = db.prepare('SELECT id, nom, prenom FROM professeur WHERE id = ?');
  const sans = [], nonTransmis = [];
  for (const { id } of profs) {
    const n = Math.round(per.get(id, annee)?.n || 0);
    if (!n) continue;
    const docs = db.prepare('SELECT id, num_doc, transmis_le FROM ea12 WHERE professeur_id = ? AND annee_scolaire = ?').all(id, annee);
    const x = p.get(id); if (!x) continue;
    const nom = `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim();
    if (!docs.length) sans.push({ id, nom, periodes: n });
    else if (!docs.some(d => d.transmis_le)) nonTransmis.push({ id, nom, periodes: n, docs: docs.length });
  }
  const tri = (a, b) => a.nom.localeCompare(b.nom, 'fr');
  res.json({ annee, sans_ea12: sans.sort(tri), non_transmis: nonTransmis.sort(tri) });
});

// Noter la transmission à GEDI (le document se verrouille).
r.post('/:id/transmis', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || '')) ? req.body.date : new Date().toISOString().slice(0, 10);
  db.prepare('UPDATE ea12 SET transmis_le = ?, transmis_par = ? WHERE id = ?').run(d, req.user?.nom || req.user?.email || null, row.id);
  res.json({ ok: true, transmis_le: d });
});

// Le rectificatif : une copie du document, au numéro suivant, liée à celui qu'elle corrige.
r.post('/:id/rectificatif', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const m = db.prepare('SELECT COALESCE(MAX(num_doc), 0) m FROM ea12 WHERE professeur_id = ? AND annee_scolaire = ?').get(row.professeur_id, row.annee_scolaire).m;
  const donnees = { ...JSON.parse(row.donnees_json || '{}'), dernier_doc12: row.transmis_le || null };
  const info = db.prepare(`INSERT INTO ea12 (professeur_id, annee_scolaire, variante, num_doc, donnees_json, cree_par, remplace_id) VALUES (?,?,?,?,?,?,?)`)
    .run(row.professeur_id, row.annee_scolaire, row.variante, m + 1, JSON.stringify(donnees), req.user?.id || null, row.id);
  res.json({ id: Number(info.lastInsertRowid), num_doc: m + 1 });
});

// Lire un EA12
r.get('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  row.donnees = JSON.parse(row.donnees_json || '{}');
  res.json(row);
});

// Créer un EA12 (brouillon) — le n° de document est attribué automatiquement
// (compteur par professeur et par année, figé à la création).
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { professeur_id, annee_scolaire, variante = 'bis', donnees = {} } = req.body || {};
  if (!professeur_id || !annee_scolaire) return res.status(400).json({ error: 'professeur_id et annee_scolaire requis' });
  // Prochain numéro pour ce prof/année = (max existant) + 1
  const row = db.prepare(`SELECT COALESCE(MAX(num_doc), 0) AS m FROM ea12
                          WHERE professeur_id = ? AND annee_scolaire = ?`).get(professeur_id, annee_scolaire);
  const numDoc = (row?.m || 0) + 1;
  const info = db.prepare(`INSERT INTO ea12 (professeur_id, annee_scolaire, variante, num_doc, donnees_json, cree_par)
                           VALUES (?, ?, ?, ?, ?, ?)`)
    .run(professeur_id, annee_scolaire, variante, numDoc, JSON.stringify(donnees), req.user?.id || null);
  res.json({ id: info.lastInsertRowid, num_doc: numDoc });
});

// Mettre à jour un EA12
r.put('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { donnees, variante, statut_doc } = req.body || {};
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  if (row.transmis_le) return res.status(409).json({ error: `Ce Doc12 a été transmis le ${dateFr(row.transmis_le)} : il ne se modifie plus. Créez un rectificatif.` });
  db.prepare(`UPDATE ea12 SET donnees_json = ?, variante = ?, statut_doc = ?, modifie_le = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(donnees ?? JSON.parse(row.donnees_json)), variante || row.variante, statut_doc || row.statut_doc, req.params.id);
  res.json({ ok: true });
});

// Supprimer un EA12
r.delete('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const row = db.prepare('SELECT transmis_le FROM ea12 WHERE id = ?').get(req.params.id);
  if (row?.transmis_le) return res.status(409).json({ error: `Ce Doc12 a été transmis le ${dateFr(row.transmis_le)} : il ne se supprime pas. Un rectificatif le remplace.` });
  db.prepare('DELETE FROM ea12 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Génération du document ---------- */

// Générer le .docx d'un EA12 enregistré
r.get('/:id/document', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const donnees = JSON.parse(row.donnees_json || '{}');
  const data = construireData(row, donnees);
  try {
    /* LE MODÈLE OFFICIEL, REMPLI — ET NON UN WORD RECONSTRUIT (Charles, 27
       septembre 2026 : « il doit être la copie conforme, mais éditable »).
       La reconstruction `buildEA12bis` imitait le formulaire ; celui-ci EST le
       formulaire de la FWB, dans lequel Lucie écrit. */
    const { remplirModeleOfficiel } = await import('../services/ea12_fill_officiel.js');
    const buf = await remplirModeleOfficiel(data);
    // Marquer comme généré
    db.prepare("UPDATE ea12 SET statut_doc = 'genere', modifie_le = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    const fname = `EA12_${data.prof_nom}_${data.prof_prenom}_${row.annee_scolaire}.docx`.replace(/\s+/g, '_');
    const out = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    res.status(200);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Length', out.length);
    res.end(out);  // octets bruts, sans transformation Express
  } catch (e) {
    console.error('[ea12] génération échouée :', e);
    res.status(500).json({ error: 'Génération du document échouée : ' + e.message });
  }
});

// Générer le PDF d'un EA12 (Word officiel converti via LibreOffice — fidélité FWB)
r.get('/:id/document-pdf', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const donnees = JSON.parse(row.donnees_json || '{}');
  const data = construireData(row, donnees);
  try {
    const { remplirModeleOfficiel } = await import('../services/ea12_fill_officiel.js');
    const { docxToPdf } = await import('../services/docx-to-pdf.js');
    const { archiverDocument } = await import('../services/document-archive.js');

    let docx, pdf;
    try { docx = await remplirModeleOfficiel(data); }
    catch (e1) { throw new Error('remplissage du modèle : ' + e1.message); }
    try { pdf = await docxToPdf(Buffer.isBuffer(docx) ? docx : Buffer.from(docx)); }
    catch (e2) { throw new Error('conversion PDF (LibreOffice) : ' + e2.message); }

    db.prepare("UPDATE ea12 SET statut_doc = 'genere', modifie_le = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    const fname = `EA12_${data.prof_nom}_${data.prof_prenom}_${row.annee_scolaire}.pdf`.replace(/\s+/g, '_');

    // Archivage (traçabilité Option B)
    try {
      archiverDocument({
        type_doc: 'ea12', professeur_id: row.professeur_id,
        prof_nom: data.prof_nom, prof_prenom: data.prof_prenom,
        annee_scolaire: row.annee_scolaire, nom_fichier: fname, pdf,
        genere_par: req.user?.email || req.user?.identifiant || null,
      });
    } catch (archErr) { console.error('[ea12] archivage (non bloquant) :', archErr.message); }

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  } catch (e) {
    console.error('[ea12] génération PDF échouée :', e);
    res.status(500).json({ error: 'Génération du PDF échouée — ' + e.message });
  }
});

// Aperçu des données qui seront utilisées (pour pré-remplir l'éditeur)
r.get('/:id/apercu', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const donnees = JSON.parse(row.donnees_json || '{}');
  res.json(construireData(row, donnees));
});

// Génère le formulaire EA12 en HTML prêt pour window.print()
r.get('/:id/imprimer', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const row = db.prepare('SELECT * FROM ea12 WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'EA12 introuvable' });
  const donnees = JSON.parse(row.donnees_json || '{}');
  const data = construireData(row, donnees);
  try {
    const html = buildEA12Html(data);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('[ea12] génération HTML échouée :', e);
    res.status(500).json({ error: 'Génération HTML échouée : ' + e.message });
  }
});

export default r;

/**
 * LE CARNET DE COTES — routes (`/api/mes-cours/carnet`). Le métier vit dans
 * `lib/carnet.js` ; l'accès est celui de Mes cours (`accesCours`) : le professeur
 * de ce cours, ou la coordination de sa section. Le carnet d'un cours est COMMUN
 * à ceux qui y ont accès — deux professeurs d'un même cours partagent leurs
 * évaluations — et chaque évaluation, chaque note, garde le nom de qui l'a posée.
 */
import { Router } from 'express';
import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { accesCours, acquisDuCours } from './mesCours.js';
import { migrerCarnet, lireValeur, propositions, evaluationsDuCours, notesDuCarnet, MENTIONS_CARNET } from '../lib/carnet.js';

try { migrerCarnet(); } catch (e) { console.error('[migration] carnet :', e.message); }

const r = Router();
const qui = req => req.user?.email || req.user?.nom || null;
const REFUS = "Ce cours n'est ni dans vos attributions, ni dans votre section.";

function contexte(req, annee) {
  const code = req.params.coursCode;
  const d = accesCours(req, code, annee);
  if (!d) return null;
  return { code, d, acquis: acquisDuCours(code, d.ueNum, annee) };
}

/** Une évaluation proposée par l'écran, vérifiée. */
function lireEvaluation(b, acquis) {
  const intitule = String(b?.intitule ?? '').trim();
  if (!intitule) return { erreur: 'Une évaluation se nomme (« Test 1 », « Travail de groupe »…).' };
  if (intitule.length > 80) return { erreur: 'Intitulé trop long (80 caractères au plus).' };
  const sur = Number(String(b?.sur ?? 20).replace(',', '.'));
  if (!(sur > 0 && sur <= 1000)) return { erreur: 'Le maximum (« sur ») est un nombre positif.' };
  const poids = Number(String(b?.poids ?? 1).replace(',', '.'));
  if (!(poids >= 0 && poids <= 100)) return { erreur: 'Le poids est un nombre entre 0 et 100.' };
  const date = b?.date ? String(b.date).slice(0, 10) : null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { erreur: 'Date invalide.' };
  const session = Number(b?.session) === 2 ? 2 : 1;
  const codes = new Set(acquis.map(a => a.aa_code));
  const aa = (Array.isArray(b?.aa) ? b.aa : []).map(x => ({ aa_code: String(x?.aa_code ?? ''), poids: Number(String(x?.poids ?? 1).replace(',', '.')) }));
  const etrangers = aa.filter(x => !codes.has(x.aa_code));
  if (etrangers.length) return { erreur: `Acquis inconnu(s) pour ce cours : ${etrangers.map(x => x.aa_code).join(', ')}.` };
  if (aa.some(x => !(x.poids > 0 && x.poids <= 100))) return { erreur: 'Le poids d’un acquis est un nombre positif.' };
  return { intitule, sur, poids, date, session, aa };
}

// ── Le carnet d'un cours : évaluations, notes, propositions ─────────────────
r.get('/:coursCode', authRequired, (req, res) => {
  const annee = String(req.query.annee || anneeDeTravail(req));
  const c = contexte(req, annee);
  if (!c) return res.status(403).json({ error: REFUS });
  const evaluations = evaluationsDuCours(c.code, annee);
  const notes = notesDuCarnet(evaluations);
  const ids = c.d.etudiants.map(e => e.id);
  const codes = c.acquis.map(a => a.aa_code);
  const props = { 1: propositions({ evaluations, notes, acquis: codes, etudiants: ids, session: 1 }),
    2: propositions({ evaluations, notes, acquis: codes, etudiants: ids, session: 2 }) };
  // L'an dernier a-t-il un carnet ? « Reprendre l'an dernier » n'est proposé que s'il y a quelque chose à reprendre.
  const precedent = evaluations.length ? null : db.prepare(`SELECT annee_scolaire AS a, COUNT(*) n FROM carnet_evaluation
    WHERE cours_code = ? AND annee_scolaire < ? GROUP BY annee_scolaire ORDER BY annee_scolaire DESC LIMIT 1`).get(c.code, annee) || null;
  res.json({
    annee, cours_code: c.code, ue_num: c.d.ueNum, acquis: c.acquis, mentions: MENTIONS_CARNET, precedent,
    evaluations: evaluations.map(e => ({ id: e.id, intitule: e.intitule, date: e.date, sur: e.sur, poids: e.poids,
      session: e.session, aa: e.aa, cree_par: e.cree_par, modifie_par: e.modifie_par,
      notees: [...(notes.get(e.id)?.values() || [])].filter(n => n.points != null || n.mention).length })),
    etudiants: c.d.etudiants.map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus, groupe: e.groupe || '',
      notes: Object.fromEntries(evaluations.map(ev => [ev.id, notes.get(ev.id)?.get(e.id) || null]).filter(([, v]) => v)),
      propositions: { 1: props[1].get(e.id)?.aa || {}, 2: props[2].get(e.id)?.aa || {} },
      moyenne: { 1: props[1].get(e.id)?.moyenne ?? null, 2: props[2].get(e.id)?.moyenne ?? null } })),
  });
});

r.post('/:coursCode/evaluations', authRequired, (req, res) => {
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const c = contexte(req, annee);
  if (!c) return res.status(403).json({ error: REFUS });
  const v = lireEvaluation(req.body, c.acquis);
  if (v.erreur) return res.status(400).json({ error: v.erreur });
  const id = db.transaction(() => {
    const ordre = (db.prepare('SELECT MAX(ordre) m FROM carnet_evaluation WHERE annee_scolaire = ? AND cours_code = ?').get(annee, c.code)?.m ?? 0) + 1;
    const nid = db.prepare(`INSERT INTO carnet_evaluation (annee_scolaire, cours_code, ue_num, intitule, date, sur, poids, session, ordre, cree_par)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(annee, c.code, c.d.ueNum, v.intitule, v.date, v.sur, v.poids, v.session, ordre, qui(req)).lastInsertRowid;
    const lien = db.prepare('INSERT INTO carnet_evaluation_aa (evaluation_id, aa_code, poids) VALUES (?,?,?)');
    for (const a of v.aa) lien.run(nid, a.aa_code, a.poids);
    return nid;
  })();
  res.json({ ok: true, id });
});

function evaluationDuCours(id, code, annee) {
  return db.prepare('SELECT * FROM carnet_evaluation WHERE id = ? AND cours_code = ? AND annee_scolaire = ?').get(Number(id), code, annee);
}

r.put('/:coursCode/evaluations/:id', authRequired, (req, res) => {
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const c = contexte(req, annee);
  if (!c) return res.status(403).json({ error: REFUS });
  const ev = evaluationDuCours(req.params.id, c.code, annee);
  if (!ev) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const v = lireEvaluation(req.body, c.acquis);
  if (v.erreur) return res.status(400).json({ error: v.erreur });
  // Baisser le maximum sous des points déjà donnés les rendrait incohérents : refusé, nommé.
  const trop = db.prepare('SELECT COUNT(*) n FROM carnet_note WHERE evaluation_id = ? AND points > ?').get(ev.id, v.sur).n;
  if (trop) return res.status(409).json({ error: `${trop} note(s) dépassent ${v.sur} : corrigez-les avant de baisser le maximum.` });
  db.transaction(() => {
    db.prepare(`UPDATE carnet_evaluation SET intitule = ?, date = ?, sur = ?, poids = ?, session = ?, modifie_par = ?, modifie_le = datetime('now')
      WHERE id = ?`).run(v.intitule, v.date, v.sur, v.poids, v.session, qui(req), ev.id);
    db.prepare('DELETE FROM carnet_evaluation_aa WHERE evaluation_id = ?').run(ev.id);
    const lien = db.prepare('INSERT INTO carnet_evaluation_aa (evaluation_id, aa_code, poids) VALUES (?,?,?)');
    for (const a of v.aa) lien.run(ev.id, a.aa_code, a.poids);
  })();
  res.json({ ok: true });
});

r.delete('/:coursCode/evaluations/:id', authRequired, (req, res) => {
  const annee = String(req.query.annee || anneeDeTravail(req));
  const c = contexte(req, annee);
  if (!c) return res.status(403).json({ error: REFUS });
  const ev = evaluationDuCours(req.params.id, c.code, annee);
  if (!ev) return res.status(404).json({ error: 'Évaluation introuvable.' });
  db.transaction(() => {
    db.prepare('DELETE FROM carnet_note WHERE evaluation_id = ?').run(ev.id);
    db.prepare('DELETE FROM carnet_evaluation_aa WHERE evaluation_id = ?').run(ev.id);
    db.prepare('DELETE FROM carnet_evaluation WHERE id = ?').run(ev.id);
  })();
  res.json({ ok: true });
});

// ── Les notes d'une évaluation : [{ etudiant_id, valeur }] — « 12,5 », « PP », vide ──
r.put('/:coursCode/evaluations/:id/notes', authRequired, (req, res) => {
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const c = contexte(req, annee);
  if (!c) return res.status(403).json({ error: REFUS });
  const ev = evaluationDuCours(req.params.id, c.code, annee);
  if (!ev) return res.status(404).json({ error: 'Évaluation introuvable.' });
  const miens = new Map(c.d.etudiants.map(e => [e.id, e]));
  const lignes = Array.isArray(req.body?.notes) ? req.body.notes : [];
  const erreurs = [];
  const lues = [];
  for (const l of lignes) {
    const id = Number(l?.etudiant_id);
    if (!miens.has(id)) { erreurs.push(`étudiant ${id} hors de la liste de ce cours`); continue; }
    const v = lireValeur(l?.valeur, ev.sur);
    if (v.erreur) { const e = miens.get(id); erreurs.push(`${String(e.nom || '').toUpperCase()} ${e.prenom || ''} : ${v.erreur}`); continue; }
    lues.push({ id, ...v });
  }
  // Tout ou rien : une colonne à moitié enregistrée ne se relit pas.
  if (erreurs.length) return res.status(400).json({ error: erreurs.slice(0, 6).join(' · ') + (erreurs.length > 6 ? ` · … et ${erreurs.length - 6} autre(s)` : ''), erreurs });
  const poser = db.prepare(`INSERT INTO carnet_note (evaluation_id, etudiant_id, points, mention, saisi_par, saisi_le)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(evaluation_id, etudiant_id) DO UPDATE SET points = excluded.points, mention = excluded.mention,
      saisi_par = excluded.saisi_par, saisi_le = excluded.saisi_le`);
  const oter = db.prepare('DELETE FROM carnet_note WHERE evaluation_id = ? AND etudiant_id = ?');
  let n = 0;
  db.transaction(() => {
    for (const x of lues) {
      if (x.points == null && !x.mention) n += oter.run(ev.id, x.id).changes;
      else { poser.run(ev.id, x.id, x.points, x.mention, qui(req)); n++; }
    }
  })();
  res.json({ ok: true, ecrites: n });
});

// ── Reprendre l'an dernier : la STRUCTURE (intitulés, maximums, poids, acquis), jamais les notes ──
r.post('/:coursCode/reprendre', authRequired, (req, res) => {
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const c = contexte(req, annee);
  if (!c) return res.status(403).json({ error: REFUS });
  if (evaluationsDuCours(c.code, annee).length) return res.status(409).json({ error: 'Ce carnet a déjà des évaluations : la reprise ne se fait que sur un carnet vide.' });
  const prec = db.prepare(`SELECT MAX(annee_scolaire) a FROM carnet_evaluation WHERE cours_code = ? AND annee_scolaire < ?`).get(c.code, annee)?.a;
  if (!prec) return res.status(404).json({ error: 'Aucun carnet les années précédentes pour ce cours.' });
  const codes = new Set(c.acquis.map(a => a.aa_code));
  let n = 0, aaPerdus = 0;
  db.transaction(() => {
    for (const e of evaluationsDuCours(c.code, prec)) {
      const nid = db.prepare(`INSERT INTO carnet_evaluation (annee_scolaire, cours_code, ue_num, intitule, date, sur, poids, session, ordre, cree_par)
        VALUES (?,?,?,?,NULL,?,?,?,?,?)`).run(annee, c.code, c.d.ueNum, e.intitule, e.sur, e.poids, e.session, e.ordre, qui(req)).lastInsertRowid;
      for (const a of e.aa) {
        if (codes.has(a.aa_code)) db.prepare('INSERT INTO carnet_evaluation_aa (evaluation_id, aa_code, poids) VALUES (?,?,?)').run(nid, a.aa_code, a.poids);
        else aaPerdus++;
      }
      n++;
    }
  })();
  res.json({ ok: true, reprises: n, depuis: prec, acquis_disparus: aaPerdus });
});

// ── Le carnet en Excel ───────────────────────────────────────────────────────
r.get('/:coursCode/excel', authRequired, async (req, res) => {
  const annee = String(req.query.annee || anneeDeTravail(req));
  const c = contexte(req, annee);
  if (!c) return res.status(403).json({ error: REFUS });
  const evaluations = evaluationsDuCours(c.code, annee);
  const notes = notesDuCarnet(evaluations);
  const ids = c.d.etudiants.map(e => e.id);
  const codes = c.acquis.map(a => a.aa_code);
  const p = propositions({ evaluations, notes, acquis: codes, etudiants: ids, session: 1 });
  const wb = new ExcelJS.Workbook();
  const f = wb.addWorksheet('Carnet');
  const cles = codes.length ? codes : [''];
  f.addRow(['Nom', 'Prénom', 'Matricule', 'Groupe', ...evaluations.map(e => `${e.intitule} (/${e.sur}${e.poids !== 1 ? `, ×${e.poids}` : ''}${e.session === 2 ? ', S2' : ''})`),
    'Moyenne /20', ...cles.map(k => (k ? `Proposition ${k}` : 'Proposition du cours'))]).font = { bold: true };
  for (const e of c.d.etudiants) {
    const x = p.get(e.id);
    f.addRow([String(e.nom || '').toUpperCase(), e.prenom || '', e.id_ecampus || '', e.groupe || '',
      ...evaluations.map(ev => { const n = notes.get(ev.id)?.get(e.id); return n ? (n.mention || n.points) : ''; }),
      x?.moyenne ?? '', ...cles.map(k => x?.aa?.[k]?.note ?? '')]);
  }
  f.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  f.columns.forEach((col, i) => { col.width = i < 2 ? 18 : 14; });
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Carnet_${c.code.replace(/[^A-Za-z0-9_.-]+/g, '_')}_${annee}.xlsx"`);
  res.end(Buffer.from(buf));
});

export default r;

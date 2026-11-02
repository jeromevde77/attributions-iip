/**
 * LES VISITES DE STAGE ET LA FICHE DE TRANSPORT — routes (`/api/visites-stage`). Métier : `lib/visitesStage.js`.
 * Le professeur de stage voit et pose ses visites ; le secrétariat, la coordination (ses sections) et la direction
 * celles de tous ; la règle de départ remboursé et le taux se règlent par la direction et le secrétariat (le taux :
 * la direction).
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, NIVEAU_DIRECTION } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';
import { nomEcranDuCompte } from '../lib/nom.js';
import { anneeDeTravail } from '../helpers/annee.js';
import {
  migrerVisites, profDuCompte, gere, REGLENT, DEPARTS, REGLES, STATUTS, stageAccessible, stagesASuivre, visites,
  regleDe, taux, ecrireTaux, ecrireRegle, personnesDeStage, adresseDepart, kmPropose, ecrireVisite, supprimerVisite,
  fiche, signer, moisAvecVisites,
} from '../lib/visitesStage.js';

try { migrerVisites(); } catch (e) { console.error('[migration] visites de stage :', e.message); }

const r = Router();
const MOIS = /^\d{4}-\d{2}$/;

/** La personne dont on lit la fiche : soi, ou — pour la gestion — celle qu'on désigne. */
function cible(req, res) {
  const demande = Number(req.params.profId || req.query.prof) || null;
  const moi = profDuCompte(req.user.id);
  if (demande && demande !== moi) {
    if (!gere(req.user)) { res.status(403).json({ error: 'Vous ne lisez que votre propre fiche.' }); return null; }
    // La coordination : une personne qui suit au moins un stage de ses sections.
    if (!stagesASuivre(req.user, anneeDeTravail(req), demande).length && !NIVEAU_DIRECTION.includes(req.user.role)
        && !REGLENT.includes(req.user.role)) { res.status(404).json({ error: 'Personne introuvable dans vos sections.' }); return null; }
    return demande;
  }
  if (!moi && !demande) { res.status(409).json({ error: 'Ce compte n’est relié à aucune fiche de professeur.' }); return null; }
  return demande || moi;
}

r.get('/moi', authRequired, (req, res) => {
  const pid = profDuCompte(req.user.id);
  res.json({ professeur_id: pid, relie: !!pid, gestion: gere(req.user), regle_modifiable: REGLENT.includes(req.user.role),
    taux_modifiable: NIVEAU_DIRECTION.includes(req.user.role), direction: NIVEAU_DIRECTION.includes(req.user.role),
    regle: pid ? regleDe(pid) : null, taux: taux(), departs: DEPARTS, regles: REGLES, statuts: STATUTS,
    ecole: db.prepare('SELECT adresse FROM etablissement WHERE id = 1').get()?.adresse || '',
    domicile: pid ? adresseDepart(pid, 'domicile') : '' });
});

r.get('/stages', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  res.json({ annee, stages: stagesASuivre(req.user, annee, req.query.prof) });
});

r.get('/', authRequired, (req, res) => {
  res.json({ visites: visites(req.user, { du: req.query.du, au: req.query.au, profId: req.query.prof }) });
});

r.get('/km', authRequired, (req, res) => {
  const s = stageAccessible(req.user, req.query.stage);
  if (!s) return res.status(404).json({ error: 'Stage introuvable.' });
  const pid = s.professeur_id || profDuCompte(req.user.id);
  res.json({ km_ar: kmPropose(pid, s.lieu_id, String(req.query.depart || 'ecole')) });
});

r.post('/', authRequired, (req, res) => {
  const x = ecrireVisite(req.user, null, req.body || {});
  if (x.error) return res.status(x.code).json({ error: x.error });
  res.json(x);
});
r.put('/taux', authRequired, (req, res) => {
  if (!NIVEAU_DIRECTION.includes(req.user.role)) return res.status(403).json({ error: 'La direction règle le taux.' });
r.put('/:id', authRequired, (req, res) => {
  const x = ecrireVisite(req.user, req.params.id, req.body || {});
  if (x.error) return res.status(x.code).json({ error: x.error });
  res.json(x);
});
r.delete('/:id', authRequired, (req, res) => {
  const x = supprimerVisite(req.user, req.params.id);
  if (x.error) return res.status(x.code).json({ error: x.error });
  res.json(x);
});

// ── Règles de départ et taux ────────────────────────────────────────────────
r.get('/regles', authRequired, (req, res) => {
  if (!gere(req.user)) return res.status(403).json({ error: 'Réservé au secrétariat, à la coordination et à la direction.' });
  const annee = req.query.annee || anneeDeTravail(req);
  res.json({ annee, personnes: personnesDeStage(req.user, annee), taux: taux(), regles: REGLES });
});
r.put('/regles/:profId', authRequired, (req, res) => {
  if (!REGLENT.includes(req.user.role)) return res.status(403).json({ error: 'La direction ou le secrétariat règle le remboursement.' });
  try {
    const u = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(req.user.id);
    ecrireRegle(Number(req.params.profId), String(req.body?.regle || ''), req.body?.remarque, nomEcranDuCompte(u?.nom_complet, u?.email));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
  res.json({ ok: true, taux: ecrireTaux(req.body?.taux) });
});

// ── La fiche de transport ───────────────────────────────────────────────────
r.get('/fiche/:profId/mois', authRequired, (req, res) => {
  const pid = cible(req, res); if (pid == null) return;
  res.json({ mois: moisAvecVisites(pid) });
});
r.get('/fiche/:profId/:mois', authRequired, (req, res) => {
  if (!MOIS.test(req.params.mois)) return res.status(400).json({ error: 'Mois attendu : AAAA-MM.' });
  const pid = cible(req, res); if (pid == null) return;
  res.json(fiche(pid, req.params.mois));
});
r.post('/fiche/:profId/:mois/signer', authRequired, (req, res) => {
  if (!MOIS.test(req.params.mois)) return res.status(400).json({ error: 'Mois attendu : AAAA-MM.' });
  const pid = cible(req, res); if (pid == null) return;
  const x = signer(req.user, pid, req.params.mois, String(req.body?.etape || ''));
  if (x.error) return res.status(x.code).json({ error: x.error });
  res.json(x);
});

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const eur = n => n == null ? '' : n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const km = n => n == null ? '—' : n.toLocaleString('fr-BE', { maximumFractionDigits: 1 });
const jma = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const STYLES = `.ft{font-size:9.5pt}.ft table{width:100%;border-collapse:collapse}.ft th{font-size:8pt;text-transform:uppercase;letter-spacing:.04em;color:#475569;text-align:left;border-bottom:.3mm solid #1B2B4B;padding:1.2mm}
.ft td{padding:1.2mm;border-bottom:.2mm solid #D8DCE4;vertical-align:top}.ft .n{text-align:right;white-space:nowrap}.ft .m{color:#64748B;font-size:8pt}
.ft tr.tot td{font-weight:700;border-top:.3mm solid #1B2B4B}.ft .sig{margin-top:8mm}.ft .sig td{width:50%;vertical-align:top;border:.2mm solid #D8DCE4;padding:3mm;height:18mm}
.ft p{margin:2mm 0}.ft p.regle{font-size:8pt;color:#475569}`;

r.get('/fiche/:profId/:mois/document', authRequired, (req, res) => {
  if (!MOIS.test(req.params.mois)) return res.status(400).json({ error: 'Mois attendu : AAAA-MM.' });
  const pid = cible(req, res); if (pid == null) return;
  const f = fiche(pid, req.params.mois);
  const ETAPES = { personne: 'La personne — certifie les déplacements', direction: 'La direction — approuve' };
  const sig = e => { const s = f.signatures.find(x => x.etape === e && x.valable);
    return `<td><b>${ETAPES[e]}</b><br>${s ? `${esc(s.par_nom)}<br><span class="m">signé dans Lucie le ${esc(String(s.le).slice(0, 16))}</span>` : '<span class="m">à signer</span>'}</td>`; };
  const lignes = f.lignes.map(l => `<tr>
    <td>${jma(l.date)}${l.heure_debut ? `<br><span class="m">${esc(l.heure_debut)}${l.heure_fin ? `–${esc(l.heure_fin)}` : ''}</span>` : ''}</td>
    <td>${esc(l.etudiant)}</td>
    <td>${esc(l.lieu)}<br><span class="m">${esc(l.adresse)}</span></td>
    <td>${esc(DEPARTS[l.depart])}<br><span class="m">${esc(l.depart_adresse)}</span></td>
    <td class="n">${km(l.km_ar)}</td><td class="n">${f.regle === 'aucun' ? '' : eur(l.montant)}</td></tr>`).join('');
  const corps = `<div class="ft">
    <p>Remboursement : <b>${esc(f.regle_libelle)}</b>${f.regle !== 'aucun' ? ` · taux : <b>${f.taux ? f.taux.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' € / km' : 'à régler'}</b>` : ''}.</p>
    <table><thead><tr><th>Date</th><th>Étudiant</th><th>Lieu de stage</th><th>Départ</th><th class="n">km A/R</th><th class="n">Montant</th></tr></thead>
    <tbody>${lignes || '<tr><td colspan="6" class="m">Aucune visite faite ce mois-là.</td></tr>'}
    <tr class="tot"><td colspan="4">Total du mois · ${f.lignes.length} visite(s)</td><td class="n">${km(f.km)}</td><td class="n">${f.regle === 'aucun' ? '' : eur(f.total)}</td></tr></tbody></table>
    ${f.problemes.length ? `<p class="regle"><b>À compléter :</b> ${esc(f.problemes.join(' ; '))}.</p>` : ''}
    <p class="regle">Visites de stage encodées dans Lucie et marquées « faites » par le professeur de stage. Les kilomètres sont ceux de l’aller-retour entre le départ indiqué et le lieu de stage.</p>
    <table class="sig"><tr>${sig('personne')}${sig('direction')}</tr></table></div>`;
  const mois = new Date(`${f.mois}-15T12:00:00Z`).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
  res.json({ html: envelopperDocument({ html: corps, titre: `Fiche de transport — ${f.professeur} — ${f.mois}`, styles: STYLES,
    entete: { titre: 'Fiche de transport — visites de stage', sous: f.professeur, ligne: mois } }),
    titre: `Fiche de transport — ${f.professeur}`, nom_fichier: `Fiche_transport_${f.professeur.replace(/\W+/g, '_')}_${f.mois}.pdf` });
});

export default r;

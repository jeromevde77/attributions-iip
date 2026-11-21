/* (CS) L'ÉVALUATION DU PERSONNEL — les routes (3.5.605, lib/evaluationPersonnel.js). Montée SANS module : chaque route juge le rôle
   de l'utilisateur SUR L'ÉVALUATION demandée (évalué, évaluateur, gestionnaire). Toute route, hors le déverrouillage, exige le code
   redemandé (15 minutes glissantes). Le mode « voir comme » n'y entre jamais : il montrerait l'évaluation d'un autre. */
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import base from '../db/index.js';
import * as E from '../lib/evaluationPersonnel.js';
import { envelopperDocument } from '../lib/document.js';
import { rendrePdf } from '../services/pdf.js';
import { piedGabaritPdf, BANDE_PIED_MM } from '../lib/document.js';
import { piedDocument } from './parametres.js';
import { logoCourant } from '../lib/identite.js';

const r = Router();
E.migrerEvaluations();

const pasDApercu = (req, res, next) => (req.user?.preview
  ? res.status(403).json({ error: 'Les évaluations ne s’ouvrent pas en « voir comme ».' }) : next());
const faute = (res, e) => res.status(e.statut || 500).json({ error: e.message });

// ── Le déverrouillage ────────────────────────────────────────────────────────
r.get('/deverrou', authRequired, pasDApercu, (req, res) => {
  const ouvert = E.deverrouille(req.user.id);
  res.json({ ouvert, duree_min: E.DUREE_DEVERROU_MIN, cle: E.clePresente(), ...E.modeDeverrou(req.user.id) });
});
r.post('/deverrou/code', authRequired, pasDApercu, async (req, res) => {
  try { const x = await E.envoyerCodeDeverrou(req.user.id); res.status(x.erreur ? 400 : 200).json(x.erreur ? { error: x.erreur } : x); }
  catch (e) { faute(res, e); }
});
r.post('/deverrou', authRequired, pasDApercu, (req, res) => {
  const x = E.verifierDeverrou(req.user.id, req.body?.code);
  E.journaliser(req, null, x.ok ? 'deverrouillage' : 'deverrouillage_refuse');
  res.status(x.ok ? 200 : 401).json(x.ok ? { ok: true } : { error: x.erreur });
});

// Tout le reste : compte, pas d'aperçu, code récent.
r.use(authRequired, pasDApercu, (req, res, next) => (E.deverrouille(req.user.id) ? next()
  : res.status(401).json({ error: 'Code requis pour ouvrir les évaluations.', reauth: true })));

const evaluationPour = (req, res) => {
  const ev = E.ligne(req.params.id);
  const role = E.roleSur(ev, req.user);
  if (!ev || !role) {
    // 404, pas 403 : « interdit » dirait qu'elle existe. La tentative s'écrit quand même au journal.
    if (ev) E.journaliser(req, ev.id, 'acces_refuse');
    res.status(404).json({ error: 'Évaluation introuvable.' });
    return null;
  }
  return ev;
};

r.get('/', (req, res) => {
  try { res.json({ gestionnaire: E.estGestionnaire(req.user), evaluations: E.mesEvaluations(req.user) }); } catch (e) { faute(res, e); }
});

// ── La gestion (direction) ───────────────────────────────────────────────────
r.get('/gestion/comptes', (req, res) => {
  if (!E.estGestionnaire(req.user)) return res.status(403).json({ error: 'Réservé à la direction.' });
  res.json(base.prepare("SELECT id, nom_complet, email, role FROM utilisateur WHERE COALESCE(actif,1) = 1 ORDER BY nom_complet").all());
});
r.get('/gestion/referentiels', (req, res) => {
  if (!E.estGestionnaire(req.user)) return res.status(403).json({ error: 'Réservé à la direction.' });
  res.json(E.referentiels());
});
r.post('/gestion/referentiels', (req, res) => {
  try { const x = E.publierReferentiel(req.body || {}, req.user); E.journaliser(req, null, 'referentiel_publie', `${req.body?.fonction} v${x.version}`); res.json(x); }
  catch (e) { faute(res, e); }
});
r.get('/gestion/conservation', (req, res) => res.json({ ans: E.conservationAns() }));
r.put('/gestion/conservation', (req, res) => {
  try { E.poserConservation(req.body?.ans ?? null, req.user); E.journaliser(req, null, 'conservation', String(req.body?.ans ?? '')); res.json({ ok: true }); }
  catch (e) { faute(res, e); }
});
r.post('/', (req, res) => {
  try { const x = E.creer(req.body || {}, req.user); E.journaliser(req, x.id, 'creation'); res.json(x); } catch (e) { faute(res, e); }
});

// ── Une évaluation ───────────────────────────────────────────────────────────
r.get('/:id', (req, res) => {
  const ev = evaluationPour(req, res); if (!ev) return;
  try { const x = E.lireEvaluation(ev, req.user); E.journaliser(req, ev.id, 'lecture'); res.json(x); } catch (e) { faute(res, e); }
});
/* La grille de l'AUTRE partie, demandée explicitement : refusée avant la synthèse, et la tentative journalisée (critère 1). */
r.get('/:id/grille/:partie', (req, res) => {
  const ev = evaluationPour(req, res); if (!ev) return;
  const role = E.roleSur(ev, req.user);
  const mienne = (req.params.partie === 'auto' && role === 'evalue') || (req.params.partie === 'evaluateur' && role === 'evaluateur');
  if (!mienne && !['synthese', 'entretien', 'validee', 'archivee'].includes(ev.etat)) {
    E.journaliser(req, ev.id, 'aveugle_refuse', req.params.partie);
    return res.status(403).json({ error: 'La grille de l’autre partie ne se lit qu’une fois les deux grilles soumises.' });
  }
  try { E.journaliser(req, ev.id, 'lecture_grille', req.params.partie); res.json(E.lireEvaluation(ev, req.user).parties[req.params.partie] || null); }
  catch (e) { faute(res, e); }
});
const geste = (nom, fn) => (req, res) => {
  const ev = evaluationPour(req, res); if (!ev) return;
  try { const x = fn(ev, req); E.journaliser(req, ev.id, nom, typeof x === 'string' ? x : null); res.json({ ok: true, ...(typeof x === 'object' && x ? x : {}) }); }
  catch (e) { E.journaliser(req, ev.id, `${nom}_refuse`, e.message); faute(res, e); }
};
r.put('/:id', geste('brouillon', (ev, req) => E.modifierBrouillon(ev, req.body || {}, req.user)));
r.delete('/:id', geste('suppression_brouillon', (ev, req) => E.supprimerBrouillon(ev, req.user)));
r.post('/:id/ouvrir', geste('ouverture', (ev, req) => E.ouvrir(ev, req.user)));
r.put('/:id/grille', geste('enregistrement_grille', (ev, req) => E.enregistrerGrille(ev, req.user, req.body?.contenu)));
r.post('/:id/soumettre', geste('soumission', (ev, req) => E.soumettre(ev, req.user)));
r.post('/:id/reouvrir', geste('reouverture', (ev, req) => { E.reouvrirGrille(ev, req.user, req.body?.partie, req.body?.motif); return `${req.body?.partie} — ${req.body?.motif}`; }));
r.post('/:id/entretien', geste('entretien', (ev, req) => E.poserEntretien(ev, req.user, req.body?.date)));
r.put('/:id/compte-rendu', geste('compte_rendu', (ev, req) => E.enregistrerCompteRendu(ev, req.user, req.body || {})));
r.post('/:id/valider', geste('validation', (ev, req) => E.valider(ev, req.user)));
r.post('/:id/archiver', geste('archivage', (ev, req) => E.archiver(ev, req.user)));
r.get('/:id/journal', (req, res) => {
  const ev = evaluationPour(req, res); if (!ev) return;
  if (!E.estGestionnaire(req.user)) return res.status(403).json({ error: 'Le journal se lit par la direction.' });
  E.journaliser(req, ev.id, 'lecture_journal');
  res.json(E.journalDe(ev.id));
});

// ── Le compte rendu en PDF (validé seulement) ────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = s => esc(s).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const dateFr = d => (d ? new Date(String(d).replace(' ', 'T') + (String(d).length <= 10 ? 'T12:00:00' : 'Z')).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
const prenomNom = n => { const m = String(n || '').trim().split(/\s+/); const nom = m.filter(x => x.length > 1 && x === x.toUpperCase()); const pr = m.filter(x => !nom.includes(x)); return nom.length && pr.length ? `${pr.join(' ')} ${nom.join(' ')}` : String(n || ''); };

function documentEvaluation(x) {
  const s = x.synthese || { lignes: [], comptes: {} };
  const cr = x.compte_rendu || {};
  const valeur = v => (v == null ? '—' : esc(v));
  const CLASSE = { concordant: 'Concordant', proche: 'Proche', divergent: 'Divergent', clarifier: 'À clarifier', incomplet: '—', une_lecture: 'Une lecture' };
  const lignesNum = s.lignes.filter(l => !l.texte);
  const html = `
  <div class="doc-titre-bloc"></div>
  <table class="carac"><tr><td><b>Membre du personnel évalué</b><br>${esc(prenomNom(x.evalue.nom))}</td><td><b>Évaluateur</b><br>${esc(prenomNom(x.evaluateur.nom))}</td></tr>
    <tr><td><b>Période</b><br>${esc(x.periode)}</td><td><b>Référentiel</b><br>${esc(x.referentiel?.titre)} (version ${esc(x.referentiel?.version)})</td></tr>
    <tr><td><b>Entretien</b><br>${dateFr(x.dates.entretien_le)}</td><td><b>Référence</b><br>${esc(x.reference)}</td></tr></table>
  <h2>La synthèse des écarts</h2>
  <p class="mention">${s.comptes.concordant || 0} concordant(s) · ${s.comptes.proche || 0} proche(s) · ${s.comptes.divergent || 0} divergent(s) · ${s.comptes.clarifier || 0} à clarifier. Aucune note globale n’est calculée.</p>
  <table class="grille"><thead><tr><th>Critère</th><th>Auto-évaluation</th><th>Évaluateur</th><th>Écart</th><th>Lecture</th></tr></thead><tbody>
    ${lignesNum.map(l => `<tr><td><span class="sec">${esc(l.section)}</span><br>${esc(l.libelle)}</td><td class="c">${valeur(l.auto)}</td><td class="c">${valeur(l.eval)}</td><td class="c">${l.ecart ?? '—'}</td><td>${CLASSE[l.classe] || ''}</td></tr>`).join('')}
  </tbody></table>
  <h2>Le compte rendu</h2>
  <h3>Points forts</h3>${para(cr.points_forts)}
  <h3>Points de développement</h3>${para(cr.points_developpement)}
  <h3>Plan de développement</h3>
  <table class="grille"><thead><tr><th>Axe (en comportements)</th><th>Moyens</th><th>Échéance</th></tr></thead><tbody>
    ${(cr.plan || []).filter(a => String(a.axe || '').trim()).map(a => `<tr><td>${esc(a.axe)}</td><td>${esc(a.moyens)}</td><td>${esc(a.echeance)}</td></tr>`).join('')}
  </tbody></table>
  <h3>Observations du membre du personnel${cr.desaccord ? ' — désaccord exprimé' : ''}</h3>${cr.observations ? para(cr.observations) : '<p class="mention">Aucune observation.</p>'}
  <div class="valid"><div><b>Validé par l’évaluateur</b><br>${esc(prenomNom(x.evaluateur.nom))}<br>${dateFr(x.dates.valide_evaluateur_le)}</div>
    <div><b>Validé par le membre du personnel</b><br>${esc(prenomNom(x.evalue.nom))}<br>${dateFr(x.dates.valide_evalue_le)}</div></div>
  <p class="mention">Document confidentiel. Validations faites dans Lucie, authentifiées et horodatées. Référence ${esc(x.reference)}.</p>`;
  const styles = `.carac{width:100%;border-collapse:collapse;margin:3mm 0 5mm}.carac td{border:0.3mm solid #D8DCE4;padding:2mm 3mm;font-size:9pt;vertical-align:top;width:50%}
    h2{font-size:12pt;color:#0E2A4F;margin:6mm 0 2mm}h3{font-size:10pt;color:#0E2A4F;margin:4mm 0 1mm}p{font-size:9.5pt;margin:0 0 2mm}
    .grille{width:100%;border-collapse:collapse;font-size:8.5pt}.grille th{background:#EEF2F7;text-align:left;padding:1.5mm 2mm;border-bottom:0.3mm solid #C9D1DC}
    .grille td{padding:1.5mm 2mm;border-bottom:0.2mm solid #E4E7EC;vertical-align:top}.grille td.c{text-align:center;white-space:nowrap}.grille tr{break-inside:avoid}
    .sec{color:#6B7280;font-size:7.5pt}.mention{color:#6B7280;font-size:8.5pt}.valid{display:flex;gap:10mm;margin:6mm 0 3mm;break-inside:avoid}.valid div{flex:1;border:0.3mm solid #D8DCE4;border-radius:2mm;padding:3mm;font-size:9pt}`;
  return envelopperDocument({ html, titre: `Évaluation du personnel — ${x.periode}`, styles,
    entete: { titre: 'Compte rendu d’évaluation', sous: `${prenomNom(x.evalue.nom)} · période ${x.periode}`, mention: 'Confidentiel' } });
}
r.get('/:id/document', async (req, res) => {
  const ev = evaluationPour(req, res); if (!ev) return;
  if (!['validee', 'archivee'].includes(ev.etat)) return res.status(409).json({ error: 'Le PDF sort une fois le compte rendu validé par les deux parties.' });
  try {
    const x = E.lireEvaluation(ev, req.user);
    const pdf = await rendrePdf(documentEvaluation(x), { pagination: 'si-plusieurs',
      pied: n => piedGabaritPdf(logoCourant(), piedDocument(), n),
      marges: { top: '12mm', right: '15mm', bottom: `${BANDE_PIED_MM}mm`, left: '15mm' } });
    E.journaliser(req, ev.id, 'export_pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Evaluation_${String(x.periode).replace(/[^0-9A-Za-z]/g, '')}_${ev.id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  } catch (e) { faute(res, e); }
});

export default r;

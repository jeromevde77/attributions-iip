// Lucie — TEMPS DE TRAVAIL DU SECRÉTARIAT (3.5.039). Règles et générateur : lib/tempsTravail.js.
// Qui : la direction et la direction adjointe gèrent tout (désigner, générer, contrôler, signer) ; une personne
// désignée lit et complète SON année et SES relevés, et lit le planning de l'équipe (présences et congés).
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { nomEcranDuCompte } from '../lib/nom.js';
import { envelopperDocument } from '../lib/document.js';
import { anneeDeTravail } from '../helpers/annee.js';
import {
  migrerTempsTravail, reglage, ecrireReglage, genererAnnee, anneeDe, modifierSemaine, releve, ecrireEcart, ficheConges,
  signer, planningEquipe, anneeEquipe, semaineEquipe, periodesDeConge, fixerConges, FORMULES, ABSENCES, REGLES, hm, semainesDeLAnnee, semainesDeConge, JOURS, plusJours,
} from '../lib/tempsTravail.js';

try { migrerTempsTravail(); } catch (e) { console.error('[temps de travail] migration', e.message); }

const r = Router();
const GERER = ['admin', 'directeur', 'directeur_adjoint'];
const gere = u => GERER.includes(u?.role);
const designe = uid => !!db.prepare('SELECT 1 FROM tt_personne WHERE utilisateur_id = ? AND actif = 1').get(uid);
const annee = req => String(req.query.annee || req.body?.annee || anneeDeTravail(req));
const nomDe = u => { const x = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(u.id); return nomEcranDuCompte(x?.nom_complet, x?.email) || u.email; };
const faute = (res, e) => res.status(e.status || 500).json({ error: e.message, bilan: e.bilan });
/** La personne dont on parle : soi, ou n'importe qui pour la direction. */
function cible(req, res) {
  const uid = Number(req.params.uid || req.query.uid || req.body?.uid || req.user.id);
  if (uid !== req.user.id && !gere(req.user)) { res.status(404).json({ error: 'Introuvable.' }); return null; }
  if (!designe(uid) && !gere(req.user)) { res.status(404).json({ error: 'Vous n’êtes pas dans le module du temps de travail.' }); return null; }
  return uid;
}

// Ce que l'écran doit savoir : suis-je dans le module, puis-je le gérer.
r.get('/moi', authRequired, (req, res) => {
  res.json({ gere: gere(req.user), designe: designe(req.user.id), annee: annee(req), formules: FORMULES, absences: ABSENCES,
    regles: REGLES, reglage: reglage(annee(req)) });
});

// Les personnes désignées (direction) — et les comptes qu'on peut désigner.
r.get('/personnes', authRequired, (req, res) => {
  if (!gere(req.user)) return res.status(403).json({ error: 'Réservé à la direction et à la direction adjointe.' });
  const an = annee(req);
  const personnes = db.prepare(`SELECT p.*, u.nom_complet, u.email, u.role FROM tt_personne p JOIN utilisateur u ON u.id = p.utilisateur_id
    ORDER BY u.nom_complet`).all().map(p => {
    const sem = anneeDe(p.utilisateur_id, an);
    return { ...p, nom: nomEcranDuCompte(p.nom_complet, p.email), genere: sem.length > 0,
      total: sem.reduce((s, x) => s + x.minutes, 0), cible: Math.round(REGLES.hebdo * p.fraction) * (52 - REGLES.congesAnnuels) };
  });
  const comptes = db.prepare("SELECT id, nom_complet, email, role FROM utilisateur WHERE actif = 1 ORDER BY nom_complet").all()
    .map(u => ({ id: u.id, nom: nomEcranDuCompte(u.nom_complet, u.email), role: u.role }));
  res.json({ personnes, comptes });
});

r.put('/personnes/:uid', authRequired, (req, res) => {
  if (!gere(req.user)) return res.status(403).json({ error: 'Réservé à la direction et à la direction adjointe.' });
  const uid = Number(req.params.uid); const b = req.body || {};
  const fraction = Number(b.fraction ?? 1), formule = b.formule || '5j';
  if (!(fraction > 0 && fraction <= 1)) return res.status(400).json({ error: 'La fraction de temps plein est entre 0 et 1.' });
  if (!FORMULES[formule]) return res.status(400).json({ error: 'Formule inconnue.' });
  db.prepare(`INSERT INTO tt_personne (utilisateur_id, fraction, formule, actif, maj_par) VALUES (?,?,?,?,?)
    ON CONFLICT(utilisateur_id) DO UPDATE SET fraction = excluded.fraction, formule = excluded.formule, actif = excluded.actif,
    maj_par = excluded.maj_par, maj_le = datetime('now')`).run(uid, fraction, formule, b.actif === false ? 0 : 1, nomDe(req.user));
  res.json({ ok: true });
});

r.get('/reglage', authRequired, (req, res) => res.json(reglage(annee(req))));
r.put('/reglage', authRequired, (req, res) => {
  if (!gere(req.user)) return res.status(403).json({ error: 'Réservé à la direction et à la direction adjointe.' });
  res.json(ecrireReglage(annee(req), req.body || {}));
});

// LES CONGÉS DE L'ANNÉE (3.5.055) : ceux que la direction a fixés, sinon le calendrier de l'école.
r.get('/conges-annee', authRequired, (req, res) => {
  if (!gere(req.user) && !designe(req.user.id)) return res.status(404).json({ error: 'Introuvable.' });
  const an = annee(req); const p = periodesDeConge(an); const c = semainesDeConge(an);
  // 13 semaines de congé au total, été compris ; 39 semaines de travail, 1 404 h par temps plein (3.5.056).
  const a2 = an.split('-')[1]; const ete = [...c.keys()].filter(l => l >= `${a2}-06-15` && l <= `${a2}-08-31`).length;
  res.json({ ...p, semaines_conge: c.size - ete, semaines_ete: ete, semaines_total: c.size, semaines_travail: 52 - REGLES.congesAnnuels,
    heures: (52 - REGLES.congesAnnuels) * 36, reglage: reglage(an) });
});
r.put('/conges-annee', authRequired, (req, res) => {
  if (!gere(req.user)) return res.status(403).json({ error: 'Réservé à la direction et à la direction adjointe.' });
  try { fixerConges(annee(req), req.body?.periodes || [], nomDe(req.user)); const an = annee(req); res.json({ ...periodesDeConge(an), semaines_conge: semainesDeConge(an).size }); }
  catch (e) { faute(res, e); }
});

// Le calendrier de l'année : semaines, congés scolaires, fenêtre d'été (pour choisir l'été).
r.get('/calendrier', authRequired, (req, res) => {
  const an = annee(req); const c = semainesDeConge(an);
  res.json({ semaines: semainesDeLAnnee(an).map(l => ({ lundi: l, conge: c.get(l) || null })), reglage: reglage(an) });
});

// LE GÉNÉRATEUR : simulation (ecrire absent) puis écriture — la direction seule écrit.
r.post('/generer/:uid', authRequired, (req, res) => {
  const uid = cible(req, res); if (uid == null) return;
  const ecrire = !!req.body?.ecrire;
  if (ecrire && !gere(req.user)) return res.status(403).json({ error: 'La direction ou la direction adjointe enregistre l’année.' });
  try { res.json(genererAnnee(uid, annee(req), req.body || {}, { ecrire, par: nomDe(req.user) })); }
  catch (e) { faute(res, e); }
});

r.get('/annee/:uid', authRequired, (req, res) => {
  const uid = cible(req, res); if (uid == null) return;
  const an = annee(req), sem = anneeDe(uid, an);
  const p = db.prepare('SELECT * FROM tt_personne WHERE utilisateur_id = ?').get(uid);
  const cibleA = p ? Math.round(REGLES.hebdo * p.fraction) * (52 - REGLES.congesAnnuels) : 0;
  res.json({ personne: p, semaines: sem, total: sem.reduce((s, x) => s + x.minutes, 0), cible: cibleA });
});

r.put('/annee/:uid/semaine/:lundi', authRequired, (req, res) => {
  if (!gere(req.user)) return res.status(403).json({ error: 'La direction ou la direction adjointe modifie l’année.' });
  try { res.json(modifierSemaine(Number(req.params.uid), annee(req), req.params.lundi, req.body?.jours || [], nomDe(req.user))); }
  catch (e) { faute(res, e); }
});

r.get('/releve/:uid/:mois', authRequired, (req, res) => {
  const uid = cible(req, res); if (uid == null) return;
  res.json(releve(uid, annee(req), req.params.mois));
});

// Un écart : la personne pour elle-même, ou la direction.
r.put('/ecart/:uid/:jour', authRequired, (req, res) => {
  const uid = cible(req, res); if (uid == null) return;
  try { ecrireEcart(uid, req.params.jour, req.body, nomDe(req.user)); res.json(releve(uid, annee(req), req.params.jour.slice(0, 7))); }
  catch (e) { faute(res, e); }
});

r.get('/conges/:uid', authRequired, (req, res) => {
  const uid = cible(req, res); if (uid == null) return;
  res.json(ficheConges(uid, annee(req)));
});

r.post('/signer/:uid', authRequired, (req, res) => {
  const uid = Number(req.params.uid);
  if (uid !== req.user.id && !gere(req.user)) return res.status(404).json({ error: 'Introuvable.' });
  const { objet, periode, etape } = req.body || {};
  try { signer(uid, objet, periode, etape, req.user, nomDe(req.user), annee(req)); res.json({ ok: true }); }
  catch (e) { faute(res, e); }
});

// Le planning de l'équipe : toute personne désignée et la direction.
r.get('/equipe/:mois', authRequired, (req, res) => {
  if (!gere(req.user) && !designe(req.user.id)) return res.status(404).json({ error: 'Introuvable.' });
  res.json(planningEquipe(annee(req), req.params.mois));
});

// L'année de l'équipe, semaine par semaine, et une semaine jour par jour. La direction voit les heures ; une personne
// désignée ne voit des autres que leur présence et leurs congés — ses propres heures, elle les a dans son année.
r.get('/equipe-annee', authRequired, (req, res) => {
  if (!gere(req.user) && !designe(req.user.id)) return res.status(404).json({ error: 'Introuvable.' });
  res.json(anneeEquipe(annee(req), { heures: gere(req.user) }));
});
r.get('/equipe-semaine/:lundi', authRequired, (req, res) => {
  if (!gere(req.user) && !designe(req.user.id)) return res.status(404).json({ error: 'Introuvable.' });
  res.json(semaineEquipe(annee(req), req.params.lundi, { heures: gere(req.user) }));
});

// Le tableau de bord de la direction : chaque personne, son année, son solde, ses relevés à signer.
r.get('/suivi', authRequired, (req, res) => {
  if (!gere(req.user)) return res.status(403).json({ error: 'Réservé à la direction et à la direction adjointe.' });
  const an = annee(req), mois = String(req.query.mois || new Date().toISOString().slice(0, 7));
  const gens = db.prepare(`SELECT p.utilisateur_id AS id, p.fraction, p.formule, u.nom_complet, u.email FROM tt_personne p
    JOIN utilisateur u ON u.id = p.utilisateur_id WHERE p.actif = 1 ORDER BY u.nom_complet`).all();
  res.json(gens.map(g => {
    const rel = releve(g.id, an, mois), fc = ficheConges(g.id, an), sem = anneeDe(g.id, an);
    return { id: g.id, nom: nomEcranDuCompte(g.nom_complet, g.email), formule: g.formule, fraction: g.fraction, genere: sem.length > 0,
      solde: rel.solde, releve: rel.signatures.filter(s => s.valable).map(s => s.etape),
      conges: fc.signatures.filter(s => s.valable).map(s => s.etape), defauts: rel.jours.filter(j => j.controles.length).length };
  }));
});

// ── Les deux pièces : le relevé du mois, la fiche de congés ──
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ETAPES = { personne: 'La personne', adjoint: 'La direction adjointe (contrôle)', direction: 'La direction (accord)' };
const blocSignatures = (sig, ordre) => `<table class="sig"><tr>${ordre.map(e => {
  const s = sig.find(x => x.etape === e && x.valable);
  return `<td><b>${ETAPES[e]}</b><br>${s ? `${esc(s.par_nom)}<br><span class="m">signé dans Lucie le ${esc(String(s.le).slice(0, 16).replace('T', ' '))}</span>` : '<span class="m">à signer</span>'}</td>`;
}).join('')}</tr></table>`;
const STYLES = `.tt{font-size:9.5pt}.tt table{width:100%;border-collapse:collapse}.tt th{font-size:8pt;text-transform:uppercase;letter-spacing:.04em;color:#475569;text-align:left;border-bottom:.3mm solid #1B2B4B;padding:1.2mm}
.tt td{padding:1mm 1.2mm;border-bottom:.2mm solid #D8DCE4}.tt .n{text-align:right;white-space:nowrap}.tt .m{color:#64748B;font-size:8pt}
.tt tr.tot td{font-weight:700;border-top:.3mm solid #1B2B4B}.tt .sig{margin-top:8mm}.tt .sig td{width:33%;vertical-align:top;border:.2mm solid #D8DCE4;padding:3mm;height:18mm}
.tt p.regle{font-size:8pt;color:#475569;margin:3mm 0}`;

r.get('/releve/:uid/:mois/document', authRequired, (req, res) => {
  const uid = cible(req, res); if (uid == null) return;
  const an = annee(req), rel = releve(uid, an, req.params.mois);
  const u = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(uid);
  const nom = nomEcranDuCompte(u?.nom_complet, u?.email);
  const ETAT = { prevu: '', libre: 'jour libre', conge: 'congé scolaire', ete: 'vacances d’été', ferie: 'férié', reel: 'réel encodé', absence: 'absence', hors: '' };
  const lignes = rel.jours.filter(j => j.prevu || j.reel || j.etat !== 'libre').map(j => `<tr>
    <td>${j.jour_semaine} ${j.jour.slice(8)}/${j.jour.slice(5, 7)}</td>
    <td>${j.plan ? `${esc(j.plan.debut)}–${esc(j.plan.fin)}` : ''}</td>
    <td>${j.saisie?.type === 'reel' ? `${esc(j.saisie.debut)}–${esc(j.saisie.fin)}` : j.saisie?.type === 'absence' ? esc(ABSENCES[j.saisie.motif]?.libelle) : ''}${j.ferie ? esc(j.ferie) : ''}</td>
    <td class="m">${ETAT[j.etat] || ''}</td><td class="n">${j.prevu ? hm(j.prevu) : ''}</td><td class="n">${j.reel || j.prevu ? hm(j.reel) : ''}</td>
    <td class="n">${j.ecart ? hm(j.ecart) : ''}</td></tr>`).join('');
  const corps = `<div class="tt">
    <table><thead><tr><th>Jour</th><th>Prévu</th><th>Réel / absence</th><th></th><th class="n">Prévu</th><th class="n">Presté</th><th class="n">Écart</th></tr></thead>
    <tbody>${lignes}<tr class="tot"><td colspan="4">Total du mois</td><td class="n">${hm(rel.prevu)}</td><td class="n">${hm(rel.reel)}</td><td class="n">${hm(rel.ecart)}</td></tr></tbody></table>
    <p class="regle">Solde depuis le début de l’année, à la fin du mois : <b>${hm(rel.solde)}</b> (à ramener à zéro en fin de période). Un jour férié pendant une semaine de travail compte pour ses heures prévues. Pause d’au moins 15 min au-delà de 6 h, jamais plus de 6 h d’affilée (loi du 16 mars 1971, art. 38quater).</p>
    ${blocSignatures(rel.signatures, ['personne', 'adjoint', 'direction'])}</div>`;
  res.json({ html: envelopperDocument({ html: corps, titre: `Relevé des heures — ${nom} — ${req.params.mois}`, styles: STYLES,
    entete: { titre: 'Relevé mensuel des heures', sous: `${nom} · ${req.params.mois}`, ligne: `Année ${an}` } }),
    titre: `Relevé des heures — ${nom}`, nom_fichier: `Releve_heures_${nom.replace(/\W+/g, '_')}_${req.params.mois}.pdf` });
});

r.get('/conges/:uid/document', authRequired, (req, res) => {
  const uid = cible(req, res); if (uid == null) return;
  const an = annee(req), fc = ficheConges(uid, an);
  const u = db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(uid);
  const p = db.prepare('SELECT * FROM tt_personne WHERE utilisateur_id = ?').get(uid);
  const nom = nomEcranDuCompte(u?.nom_complet, u?.email);
  const sem = anneeDe(uid, an), travail = sem.filter(s => s.statut === 'travail');
  const fmt = d => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const corps = `<div class="tt">
    <p>Formule : <b>${esc(FORMULES[p?.formule] || '')}</b> · ${Math.round((p?.fraction || 1) * 100)} % d’un temps plein.</p>
    <table><thead><tr><th>Période</th><th>Du</th><th>Au</th></tr></thead><tbody>
    ${fc.periodes.map(x => `<tr><td>${esc(x.libelle)}</td><td>${fmt(x.du)}</td><td>${fmt(x.au)}</td></tr>`).join('')}
    <tr class="tot"><td>Semaines de congé</td><td colspan="2">${fc.semaines_conge}</td></tr>
    <tr class="tot"><td>Semaines de travail · heures dues</td><td colspan="2">${travail.length} · ${hm(travail.reduce((s, x) => s + x.minutes, 0))}</td></tr>
    </tbody></table>
    <p class="regle">Congés scolaires fixés par l’école et cinq semaines consécutives d’été. 36 h de travail effectif par semaine pour un temps plein (circulaire 9760, point 1.3.8). Les jours fériés pendant les semaines de travail ne sont pas à récupérer.</p>
    ${blocSignatures(fc.signatures, ['adjoint', 'direction'])}</div>`;
  res.json({ html: envelopperDocument({ html: corps, titre: `Fiche de congés — ${nom} — ${an}`, styles: STYLES,
    entete: { titre: 'Fiche de congés', sous: nom, ligne: `Année ${an}` } }),
    titre: `Fiche de congés — ${nom}`, nom_fichier: `Fiche_conges_${nom.replace(/\W+/g, '_')}_${an}.pdf` });
});

export default r;
export { JOURS, plusJours };

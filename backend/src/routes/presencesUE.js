/**
 * LES PRÉSENCES PAR UE — le module de l'administration (Charles, 28 octobre
 * 2026 : « un module admin qui permet de choisir une UE, de voir les données sous
 * forme de tableau, de savoir les changer ; après le premier dixième, une colonne
 * pour la régularité »). Monté sur `/api/presences-ue` ; direction et secrétariat.
 *
 * Les présences s'écrivent par la seule porte, `ecrirePresences()` (journal en
 * ajout seul, au nom de la personne connectée) ; la régularité, par
 * `lib/regularite.js`. Et pour Pilotage (axe Gestion), une ligne par UE : taux de
 * présence, réguliers au 1/10 et au 5/10, séances non encodées, alertes.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { ecrirePresences, MOTIFS_JUSTIFIES, STATUTS_PRESENCE } from '../lib/cep.js';
import { periodesDI } from '../lib/periodesUE.js';
import { migrerRegularite, presencesDeLUE, marquerRegularite, uesAvecHoraire, SEUIL_REGULARITE, jalonsChoisis, NOM_DIXIEME } from '../lib/regularite.js';

try { migrerRegularite(); } catch (e) { console.error('[migration] régularité :', e.message); }

const r = Router();
const EDITEUR = roleRequired('admin', 'editeur');
const qui = req => req.user?.nom_complet || req.user?.nom || req.user?.email || null;
const anneeDe = req => String(req.query.annee || req.body?.annee || anneeDeTravail(req));

r.get('/ues', authRequired, EDITEUR, (req, res) => {
  try { res.json({ ues: uesAvecHoraire(anneeDe(req)) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/ue/:ue', authRequired, EDITEUR, (req, res) => {
  try {
    const annee = anneeDe(req);
    const choisis = jalonsChoisis(req.query.jalons);
    const x = presencesDeLUE(req.params.ue, annee, choisis);
    res.json({ annee, ue_num: Number(req.params.ue), titre: x.opts.titre, sous: x.opts.sous, cours: x.opts.cours,
      jalons: x.jalons, choisis, libelles_jalons: Object.fromEntries(choisis.map(j => [j, NOM_DIXIEME(j)])), seuil: SEUIL_REGULARITE, dixieme: x.g.dixieme,
      motifs: MOTIFS_JUSTIFIES, statuts: STATUTS_PRESENCE, aujourdhui: new Date().toISOString().slice(0, 10),
      seances: x.g.seances.map(s => ({ id: s.id, date: s.date, heure_debut: s.heure_debut, heure_fin: s.heure_fin,
        cours_code: s.cours_code, sous_groupe: s.sous_groupe, annule: !!s.annule })),
      lignes: x.g.lignes.map(l => ({ etudiant: l.etudiant, cases: l.cases.map(c => ({ statut: c.statut, motif: c.motif, retard: !!c.retard })),
        present: l.present, justifie: l.justifie, absent: l.absent, du: l.du, non_encodees: l.non_encodees,
        taux_injustifie: l.taux_injustifie, regularite: l.regularite })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/ue/:ue/presences', authRequired, EDITEUR, (req, res) => {
  const annee = anneeDe(req);
  const x = presencesDeLUE(req.params.ue, annee);
  const seances = new Map(x.g.seances.map(s => [s.id, s]));
  const inscrits = new Set(x.g.lignes.map(l => l.etudiant.id));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const lignes = [];
  for (const l of Array.isArray(req.body?.lignes) ? req.body.lignes : []) {
    const s = seances.get(Number(l?.seance_id));
    if (!s) return res.status(400).json({ error: 'Une séance ne fait pas partie de cette UE.' });
    if (s.annule) return res.status(409).json({ error: `La séance du ${s.date} est annulée : pas de présence.` });
    if (s.date > aujourdhui) return res.status(409).json({ error: `La séance du ${s.date} n’a pas encore eu lieu.` });
    if (!inscrits.has(Number(l?.etudiant_id))) return res.status(400).json({ error: 'Un étudiant n’est pas inscrit à cette UE.' });
    lignes.push({ seance_id: s.id, etudiant_id: Number(l.etudiant_id), statut: l.statut || null, motif: l.motif || null, retard: !!l.retard });
  }
  if (!lignes.length) return res.status(400).json({ error: 'Rien à enregistrer.' });
  const out = ecrirePresences(lignes, qui(req));
  if (out.erreur) return res.status(400).json({ error: out.erreur });
  res.json({ ok: true, ...out });
});

/* REMPLIR LES CASES VIDES EN « PRÉSENT » (3.5.016, Charles : le secrétariat rattrape les séances d'avant Toussaint).
   Deux portées : une séance (`seance_id`), ou toutes les séances tenues de l'UE jusqu'à une date (`jusquau`). On ne
   touche JAMAIS une case déjà encodée, ni une dispense, ni une séance annulée ou à venir, ni une séance d'avant
   l'inscription de l'étudiant. Ce que l'horaire ne permet pas de savoir ne se devine pas : une séance d'un
   sous-groupe (qui n'en est pas ?) et une UE donnée en plusieurs organisations (qui suit quelle séance ?) restent à
   la main. `simuler` rend ce qui serait écrit, sans rien écrire. */
r.post('/ue/:ue/remplir', authRequired, EDITEUR, (req, res) => {
  const annee = anneeDe(req);
  const ue = Number(req.params.ue);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const seanceId = req.body?.seance_id ? Number(req.body.seance_id) : null;
  const jusquau = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.jusquau || '')) ? String(req.body.jusquau) : null;
  if (!seanceId && !jusquau) return res.status(400).json({ error: 'Une séance, ou une date « jusqu’au ».' });
  const orgs = db.prepare(`SELECT COUNT(DISTINCT COALESCE(num_organisation, 1)) n FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ?`).get(annee, ue).n;
  if (orgs > 1) return res.status(409).json({ error: `L’UE ${ue} est donnée en ${orgs} organisations : l’horaire ne dit pas quelle séance est suivie par qui. Ses présences s’encodent case par case.` });
  const x = presencesDeLUE(ue, annee);
  const inscr = new Map(db.prepare(`SELECT etudiant_id, MIN(date_inscription) d FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ? GROUP BY etudiant_id`)
    .all(annee, ue).map(r0 => [r0.etudiant_id, r0.d ? String(r0.d).slice(0, 10) : null]));
  const borne = jusquau && jusquau < aujourdhui ? jusquau : aujourdhui;
  const lignes = [], seancesTouchees = new Set();
  let sousGroupes = 0;
  x.g.seances.forEach((s, i) => {
    if (seanceId ? s.id !== seanceId : s.date > borne) return;
    if (s.annule || s.date > aujourdhui) return;
    if (s.sous_groupe != null && s.sous_groupe !== '') { sousGroupes++; return; }
    for (const l of x.g.lignes) {
      const c = l.cases[i];
      if (c?.statut) continue;                          // déjà encodée, dispensée ou non concernée
      const ins = inscr.get(l.etudiant.id);
      if (ins && s.date < ins) continue;                // pas encore inscrit ce jour-là
      lignes.push({ seance_id: s.id, etudiant_id: l.etudiant.id, statut: 'present', motif: null, retard: false });
      seancesTouchees.add(s.id);
    }
  });
  const resume = { cases: lignes.length, seances: seancesTouchees.size, sous_groupes: sousGroupes, jusquau: seanceId ? null : borne };
  if (seanceId && sousGroupes) return res.status(409).json({ error: 'Séance d’un sous-groupe : Lucie ne sait pas quels étudiants en font partie. Encodez-la case par case.' });
  if (req.body?.simuler) return res.json({ simulation: true, ...resume });
  if (!lignes.length) return res.json({ ok: true, ecrites: 0, ...resume });
  const out = ecrirePresences(lignes, qui(req));
  if (out.erreur) return res.status(400).json({ error: out.erreur });
  res.json({ ok: true, ...out, ...resume });
});

r.put('/ue/:ue/regularite', authRequired, EDITEUR, (req, res) => {
  const x = marquerRegularite(req.params.ue, anneeDe(req), req.body?.etudiant_id, Number(req.body?.jalon), String(req.body?.valeur || ''), qui(req));
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  res.json(x);
});

/* PILOTAGE (axe Gestion) : une ligne par UE, le comptage au 1/10 par section, les alertes. */
r.get('/pilotage', authRequired, EDITEUR, (req, res) => {
  try {
    const annee = anneeDe(req);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const horsCursus = new Set();
    try { for (const u of db.prepare('SELECT DISTINCT ue_num FROM ue WHERE annee_scolaire = ? AND COALESCE(hors_cursus, 0) = 1').all(annee)) horsCursus.add(u.ue_num); } catch { /* colonne absente */ }
    /* LA PEP ESTIMÉE (3.1.441, Charles : « à côté », la PEP officielle reste celle d'eProm) :
       réguliers au 1er dixième × périodes de l'UE (périodes professeur du dossier, autonomie
       comprise, hors Z — celles du droit d'inscription). Une ESTIMATION, nommée comme telle. */
    const ueRef = db.prepare(`SELECT ue_tot_prf AS tot_prf, ue_per_cours AS per_cours, ue_aut AS aut FROM ue
      WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`);
    const ues = uesAvecHoraire(annee).map(u => {
      const x = presencesDeLUE(u.ue_num, annee);
      const L = x.g.lignes;
      const du = L.reduce((a, l) => a + l.du, 0), pj = L.reduce((a, l) => a + l.present + l.justifie, 0);
      const compte = j => ({ R: L.filter(l => l.regularite[j].valeur === 'R').length, IR: L.filter(l => l.regularite[j].valeur === 'IR').length,
        marques: L.filter(l => l.regularite[j].marque).length, atteint: !!x.jalons[j] && x.jalons[j] <= aujourdhui });
      const nonEnc = L.reduce((a, l) => a + l.non_encodees, 0);
      return { ue_num: u.ue_num, ue_nom: u.ue_nom, sections: u.sections, hors_cursus: horsCursus.has(u.ue_num), inscrits: L.length,
        seances: u.seances, seances_tenues: x.g.seances.filter(s => !s.annule && s.date <= aujourdhui).length,
        taux_presence: du ? Math.round((pj / du) * 1000) / 10 : null, non_encodees: nonEnc,
        jalons: x.jalons, au10: compte(10), au50: compte(50) };
    }).map(u => {
      // Sans total au référentiel, la somme des périodes de ses cours (hors Z, rangées ailleurs).
      const periodes = periodesDI(ueRef.get(u.ue_num, annee) || {})
        || Number(db.prepare(`SELECT SUM(COALESCE(cours_per, 0)) n FROM cours WHERE ue_num = ? AND annee_scolaire = ?`).get(u.ue_num, annee)?.n) || 0;
      return { ...u, periodes, pep_estimee: u.au10.atteint && periodes ? u.au10.R * periodes : null };
    });
    // Le comptage au 1/10 par section : une UE hors cursus est un groupe mixte, elle se compte à part.
    const parSection = {};
    for (const u of ues) {
      if (!u.au10.atteint) continue;
      const cle = u.hors_cursus ? 'Hors cursus (groupes mixtes)' : (String(u.sections || '').split(',')[0] || 'Sans section');
      const s = (parSection[cle] ||= { section: cle, ues: 0, reguliers: 0, irreguliers: 0, pep_estimee: 0 });
      s.ues++; s.reguliers += u.au10.R; s.irreguliers += u.au10.IR; s.pep_estimee += u.pep_estimee || 0;
    }
    const alertes = [];
    for (const u of ues) {
      if (u.non_encodees) alertes.push({ ue_num: u.ue_num, ue_nom: u.ue_nom, niveau: 'surveiller', texte: `${u.non_encodees} présence(s) non encodée(s) sur des séances tenues` });
      if (u.au10.atteint && u.inscrits && u.au10.IR / u.inscrits > 0.2) alertes.push({ ue_num: u.ue_num, ue_nom: u.ue_nom, niveau: 'corriger', texte: `${u.au10.IR} irrégulier(s) sur ${u.inscrits} au 1er dixième` });
      if (!u.seances_tenues && u.jalons[10] && u.jalons[10] <= aujourdhui) alertes.push({ ue_num: u.ue_num, ue_nom: u.ue_nom, niveau: 'surveiller', texte: 'premier dixième passé sans séance tenue' });
    }
    res.json({ annee, seuil: SEUIL_REGULARITE, ues, sections: Object.values(parSection), alertes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;

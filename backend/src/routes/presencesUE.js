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
import { migrerRegularite, presencesDeLUE, marquerRegularite, uesAvecHoraire, JALONS, SEUIL_REGULARITE } from '../lib/regularite.js';

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
    const x = presencesDeLUE(req.params.ue, annee);
    res.json({ annee, ue_num: Number(req.params.ue), titre: x.opts.titre, sous: x.opts.sous, cours: x.opts.cours,
      jalons: x.jalons, libelles_jalons: JALONS, seuil: SEUIL_REGULARITE, dixieme: x.g.dixieme,
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
    });
    // Le comptage au 1/10 par section : une UE hors cursus est un groupe mixte, elle se compte à part.
    const parSection = {};
    for (const u of ues) {
      if (!u.au10.atteint) continue;
      const cle = u.hors_cursus ? 'Hors cursus (groupes mixtes)' : (String(u.sections || '').split(',')[0] || 'Sans section');
      const s = (parSection[cle] ||= { section: cle, ues: 0, reguliers: 0, irreguliers: 0 });
      s.ues++; s.reguliers += u.au10.R; s.irreguliers += u.au10.IR;
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

/* REPRENDRE UNE SECTION D'UNE ANNÉE PASSÉE (3.5.514, Charles, 17 novembre 2026 : « importer en 25-26 les étudiants d'ATNUP, leurs
   notes, et créer un diplôme » ; tranché : les 39 inscrits de l'organisation 1 ; seul le résultat global du jury est connu — « on peut
   temporairement mettre la même note dans toutes les UE »).
   Deux fichiers lus par l'écran : la liste des inscrits (identité complète) et la liste des diplômés (résultat global sur 20 ou sur 100).
   Pour chacun : la fiche est retrouvée ou créée (`trouverOuCreerEtudiant` : numéro national, matricules, nom + prénom + naissance),
   sa section de rattachement posée si elle manque, et il est inscrit aux UE choisies dans l'organisation choisie. Un diplômé reçoit
   « réussi » et la même cote (son résultat global sur 20) dans chaque UE — c'est de là que le centre de diplomation calcule sa mention.
   Les autres sont inscrits sans résultat. Simulation d'abord, tout ou rien ensuite ; le journal des modifications garde chaque geste.
   Réservé aux années ANTÉRIEURES à l'année de travail : une année vivante se compose par le PAE (`ecrireProgramme`). */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { trouverOuCreerEtudiant } from '../lib/etudiantUnique.js';
import { rapprocher, normDate } from './importHistorique.js';

const r = Router();

const anneeActive = () => db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get()?.valeur
  || db.prepare('SELECT MAX(annee_scolaire) a FROM attribution').get()?.a || null;
const txt = v => (v == null ? '' : String(v).replace(/ /g, ' ').trim());
const sansAccent = s => txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { section, annee, organisation = 1, ues = [], etudiants = [], simulation = true } = req.body || {};
  if (!section || !/^\d{4}-\d{4}$/.test(String(annee || ''))) return res.status(400).json({ error: 'Section et année requises.' });
  const act = anneeActive();
  if (act && String(annee) >= String(act)) {
    return res.status(409).json({ error: `L'année ${annee} n'est pas une année passée (année de travail : ${act}). Une année vivante se compose par le PAE.` });
  }
  if (!db.prepare('SELECT 1 FROM section WHERE code = ?').get(section)) return res.status(400).json({ error: `Section inconnue : ${section}.` });
  const nums = [...new Set((ues || []).map(Number).filter(Number.isFinite))];
  if (!nums.length) return res.status(400).json({ error: 'Aucune unité choisie.' });
  const inconnues = nums.filter(u => !db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(u, annee));
  if (inconnues.length) return res.status(400).json({ error: `Unités absentes du référentiel ${annee} : ${inconnues.join(', ')}.` });
  if (!Array.isArray(etudiants) || !etudiants.length) return res.status(400).json({ error: 'Aucun étudiant.' });
  const org = Math.max(1, Math.round(Number(organisation) || 1));

  const lignes = [], refus = [];
  for (const e of etudiants) {
    const p = {
      id_ecampus: txt(e.id_ecampus) || null, nom: txt(e.nom), prenom: txt(e.prenom),
      sexe: /^f/i.test(txt(e.sexe)) ? 'F' : /^[hm]/i.test(txt(e.sexe)) ? 'M' : null,
      titre: /^f/i.test(txt(e.sexe)) ? 'Mme' : /^[hm]/i.test(txt(e.sexe)) ? 'M.' : null,
      date_naissance: normDate(txt(e.date_naissance)) || null, lieu_naissance: txt(e.lieu_naissance) || null,
      nationalite: txt(e.nationalite) || null, num_national: txt(e.num_national) || null,
      adresse: txt(e.adresse) || null, cp: txt(e.cp) || null, localite: txt(e.localite).replace(/^\d{4}\s+/, '') || null,
      email_perso: txt(e.email_perso) || null, email_ecole: txt(e.email_ecole).toLowerCase() || null, gsm: txt(e.gsm) || null,
    };
    if (!p.nom || !p.prenom) { refus.push(`ligne sans nom ou prénom (${p.id_ecampus || '?'})`); continue; }
    const pts = e.points == null || e.points === '' ? null : Number(String(e.points).replace(',', '.'));
    if (e.reussi && !(pts >= 10 && pts <= 20)) { refus.push(`${p.nom.toUpperCase()} ${p.prenom} : résultat global ${e.points ?? 'absent'} (sur 20 attendu, au moins 10)`); continue; }
    const deja = rapprocher(p);
    lignes.push({ p, reussi: !!e.reussi, points: e.reussi ? Math.round(pts * 100) / 100 : null, mention: txt(e.mention) || null,
      existant: deja ? { id: deja.id, methode: deja.methode } : null });
  }
  // Deux lignes pour une même personne dans le fichier : refusé, on ne devine pas laquelle est la bonne.
  const vus = new Map();
  for (const l of lignes) { const k = `${sansAccent(l.p.nom)}|${sansAccent(l.p.prenom)}|${l.p.date_naissance || ''}`; if (vus.has(k)) refus.push(`${l.p.nom.toUpperCase()} ${l.p.prenom} figure deux fois`); vus.set(k, 1); }
  // Les inscriptions qui existent déjà avec un autre résultat : nommées, jamais écrasées.
  const conflits = [];
  for (const l of lignes.filter(x => x.existant)) {
    for (const u of nums) {
      const i = db.prepare('SELECT resultat, points FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?').get(l.existant.id, annee, u);
      if (i?.resultat && (!l.reussi || i.resultat !== 'reussi')) conflits.push(`${l.p.nom.toUpperCase()} ${l.p.prenom}, UE ${u} : déjà « ${i.resultat} »`);
    }
  }
  const avert = [];
  const ei = nums.find(u => db.prepare('SELECT is_epreuve_integree FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(u, annee)?.is_epreuve_integree);
  if (!ei) avert.push("Aucune des unités choisies n'est marquée « épreuve intégrée » dans le référentiel : le centre de diplomation ne proposera pas le certificat tant qu'elle ne l'est pas.");

  const rapport = {
    simulation: !!simulation, section, annee, organisation: org, ues: nums,
    etudiants: lignes.map(l => ({ nom: l.p.nom, prenom: l.p.prenom, date_naissance: l.p.date_naissance, existant: !!l.existant, methode: l.existant?.methode || null,
      reussi: l.reussi, points: l.points, mention: l.mention })),
    nouveaux: lignes.filter(l => !l.existant).length, existants: lignes.filter(l => l.existant).length, reussis: lignes.filter(l => l.reussi).length,
    refus, conflits, avertissements: avert,
  };
  if (simulation || refus.length || conflits.length) return res.status(simulation ? 200 : 409).json(rapport);

  const insc = db.prepare(`INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points, num_organisation, date_inscription)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = COALESCE(excluded.resultat, etudiant_inscription.resultat),
      points = COALESCE(excluded.points, etudiant_inscription.points),
      num_organisation = COALESCE(etudiant_inscription.num_organisation, excluded.num_organisation)`);
  const debut = `${String(annee).slice(0, 4)}-09-01`;
  try {
    db.transaction(() => {
      for (const l of lignes) {
        const { id } = trouverOuCreerEtudiant(l.p, { annee, source: `reprise ${section} ${annee}` });
        db.prepare("UPDATE etudiant SET section_rattachement = ? WHERE id = ? AND COALESCE(section_rattachement, '') = ''").run(section, id);
        for (const u of nums) insc.run(id, annee, u, l.reussi ? 'reussi' : null, l.reussi ? l.points : null, org, debut);
      }
    })();
  } catch (e) { return res.status(500).json({ error: e.message }); }
  res.json({ ...rapport, simulation: false, ecrit: true });
});

/* RETIRER DES UNITÉS POSÉES PAR ERREUR (3.5.515 — ATNUP 2025-2026 : les UE 225 et 226, formations complémentaires, cochées avec les
   autres). Les mêmes fichiers ; pour chaque étudiant retrouvé, l'inscription de l'année aux unités choisies est retirée — SEULEMENT si
   elle vient de la reprise (date d'inscription du 1er septembre de l'année, posée par elle) et ne porte ni note détaillée, ni décision de
   séance. Le reste est nommé, jamais touché. Simulation d'abord ; le journal des modifications garde chaque retrait. */
r.post('/retirer', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, ues = [], etudiants = [], simulation = true } = req.body || {};
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) return res.status(400).json({ error: 'Année requise.' });
  const act = anneeActive();
  if (act && String(annee) >= String(act)) return res.status(409).json({ error: `L'année ${annee} n'est pas une année passée.` });
  const nums = [...new Set((ues || []).map(Number).filter(Number.isFinite))];
  if (!nums.length || !Array.isArray(etudiants) || !etudiants.length) return res.status(400).json({ error: 'Unités et étudiants requis.' });
  const debut = `${String(annee).slice(0, 4)}-09-01`;
  const aRetirer = [], gardes = [];
  for (const e of etudiants) {
    const t = rapprocher({ num_national: txt(e.num_national), id_ecampus: txt(e.id_ecampus), nom: txt(e.nom), prenom: txt(e.prenom), date_naissance: normDate(txt(e.date_naissance)) });
    if (!t) continue;
    for (const u of nums) {
      const i = db.prepare('SELECT id, date_inscription FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?').get(t.id, annee, u);
      if (!i) continue;
      const qui = `${txt(e.nom).toUpperCase()} ${txt(e.prenom)}, UE ${u}`;
      const notes = db.prepare('SELECT 1 FROM etudiant_note_detail WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? LIMIT 1').get(t.id, annee, u);
      let seance = null; try { seance = db.prepare('SELECT 1 FROM deliberation_resultat WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? LIMIT 1').get(t.id, annee, u); } catch { seance = null; }
      if (i.date_inscription !== debut) gardes.push(`${qui} : inscription d'une autre origine`);
      else if (notes) gardes.push(`${qui} : porte des notes`);
      else if (seance) gardes.push(`${qui} : décidée en séance`);
      else aRetirer.push({ id: i.id, qui });
    }
  }
  if (!simulation) {
    try { db.transaction(() => { for (const x of aRetirer) db.prepare('DELETE FROM etudiant_inscription WHERE id = ?').run(x.id); })(); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }
  res.json({ simulation: !!simulation, retirees: aRetirer.length, gardes, detail: aRetirer.map(x => x.qui) });
});

export default r;

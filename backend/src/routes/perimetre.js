/**
 * LE CENTRE D'IMPRESSION CENTRAL — le périmètre.
 *
 * Les boutons d'impression se sont accumulés au fil des écrans : dix-huit
 * endroits produisent des documents, chacun avec sa mécanique et ses options.
 * On ne savait plus où sortir quoi, et la même pièce s'obtenait différemment
 * selon le chemin pris.
 *
 * Ce module ne fabrique aucun document : il répond à la seule question que les
 * écrans ne savaient pas poser — QUI est concerné. Deux axes qui se croisent :
 *
 *   le PÉRIMÈTRE — une section, des unités, des cours pris dans des unités
 *   différentes — qui construit la liste des étudiants ;
 *
 *   la SÉLECTION — tous, ou seulement ceux qu'on coche — qui la restreint.
 *
 * UN COURS NE DÉSIGNE QUE DES PERSONNES. Les pièces de délibération sont des
 * pièces d'unité : une attestation, une motivation, un procès-verbal existent
 * par UE et jamais par cours. Choisir un cours sert donc à trouver ceux qui le
 * suivent ; les documents sortiront pour leur unité. L'écran doit le dire, sans
 * quoi on croira imprimer « les attestations du cours 286.2 », qui n'existent
 * pas.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { decisionDeSession } from './acquis.js';

const r = Router();

/** De quoi composer un périmètre : sections, unités, et leurs cours. */
r.get('/arborescence', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);

  let unites = db.prepare(`
    SELECT ue_num, ue_nom, section FROM ue
    WHERE annee_scolaire = ? ORDER BY section, ue_num`).all(annee);
  if (perim) unites = unites.filter(u => !u.section || perim.includes(u.section));

  const cours = db.prepare(`
    SELECT ue_num, cours_code, cours_nom FROM cours
    WHERE annee_scolaire = ? AND cours_code IS NOT NULL
    ORDER BY ue_num, cours_code`).all(annee);
  const parUE = {};
  for (const c of cours) (parUE[c.ue_num] = parUE[c.ue_num] || []).push(c);

  const sections = [...new Set(unites.map(u => u.section).filter(Boolean))].sort();

  res.json({
    annee, sections,
    unites: unites.map(u => ({ ...u, cours: parUE[u.ue_num] || [] })),
  });
});

/**
 * Les étudiants d'un périmètre, avec les unités qui les concernent et leur
 * décision pour la session demandée — c'est ce qui permet de cocher en
 * connaissance de cause plutôt qu'à l'aveugle.
 */
r.post('/etudiants', authRequired, (req, res) => {
  const annee = req.body?.annee || anneeDeTravail(req);
  const session = Number(req.body?.session) === 2 ? 2 : 1;
  const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
  const ueNums = Array.isArray(req.body?.ue_nums) ? req.body.ue_nums.map(Number) : [];
  const coursCodes = Array.isArray(req.body?.cours_codes) ? req.body.cours_codes : [];
  const perim = getUserSections(req.user);

  // Les unités du périmètre : celles nommées, celles des sections nommées, et
  // celles auxquelles appartiennent les cours nommés.
  const ues = new Set(ueNums);
  if (sections.length) {
    const marques = sections.map(() => '?').join(',');
    for (const u of db.prepare(`SELECT ue_num FROM ue
      WHERE annee_scolaire = ? AND section IN (${marques})`).all(annee, ...sections)) {
      ues.add(u.ue_num);
    }
  }
  const coursParUE = {};
  if (coursCodes.length) {
    const marques = coursCodes.map(() => '?').join(',');
    for (const c of db.prepare(`SELECT ue_num, cours_code FROM cours
      WHERE annee_scolaire = ? AND cours_code IN (${marques})`).all(annee, ...coursCodes)) {
      ues.add(c.ue_num);
      (coursParUE[c.ue_num] = coursParUE[c.ue_num] || []).push(c.cours_code);
    }
  }
  if (!ues.size) return res.json({ etudiants: [], unites: [], session, annee });

  // Le périmètre de l'utilisateur s'applique toujours, quoi qu'il demande.
  let liste = [...ues];
  if (perim) {
    const marques = liste.map(() => '?').join(',');
    const ok = new Set(db.prepare(`SELECT ue_num FROM ue
      WHERE annee_scolaire = ? AND ue_num IN (${marques})
        AND (section IS NULL OR section IN (${perim.map(() => '?').join(',')}))`)
      .all(annee, ...liste, ...perim).map(x => x.ue_num));
    liste = liste.filter(n => ok.has(n));
  }
  if (!liste.length) return res.json({ etudiants: [], unites: [], session, annee });

  const marques = liste.map(() => '?').join(',');
  const inscrits = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, e.nom, e.prenom
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num IN (${marques})
    ORDER BY e.nom, e.prenom, i.ue_num`).all(annee, ...liste);

  // QUAND UN COURS EST NOMMÉ, il restreint les étudiants de SON unité à ceux
  // qui le suivent — les autres unités du périmètre restent entières.
  const suitLeCours = (etudId, ueNum) => {
    const codes = coursParUE[ueNum];
    if (!codes || !codes.length) return true;
    const m = codes.map(() => '?').join(',');
    try {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM etudiant_note_detail
        WHERE etudiant_id = ? AND ue_num = ? AND cours_code IN (${m})`)
        .get(etudId, ueNum, ...codes).n;
      return n > 0;
    } catch { return true; }
  };

  const parEtud = new Map();
  for (const i of inscrits) {
    if (!suitLeCours(i.etudiant_id, i.ue_num)) continue;
    if (!parEtud.has(i.etudiant_id)) {
      parEtud.set(i.etudiant_id, {
        id: i.etudiant_id, nom: i.nom, prenom: i.prenom, unites: [],
      });
    }
    const d = decisionDeSession(i.etudiant_id, i.ue_num, annee, session);
    parEtud.get(i.etudiant_id).unites.push({
      ue_num: i.ue_num, resultat: d.resultat, points: d.points,
    });
  }

  const etudiants = [...parEtud.values()].map(e => ({
    ...e,
    // Ce qui se dit d'un coup d'œil : a-t-il quelque chose à recevoir pour
    // cette session ?
    decide: e.unites.some(u => u.resultat),
    reussites: e.unites.filter(u => u.resultat === 'reussi').length,
    echecs: e.unites.filter(u => u.resultat === 'ajourne' || u.resultat === 'refuse').length,
  }));

  const nomsUE = Object.fromEntries(db.prepare(`SELECT ue_num, ue_nom FROM ue
    WHERE annee_scolaire = ? AND ue_num IN (${marques})`).all(annee, ...liste)
    .map(u => [u.ue_num, u.ue_nom]));

  res.json({
    annee, session,
    unites: liste.sort((a, b) => a - b).map(n => ({
      ue_num: n, ue_nom: nomsUE[n] || null,
      cours_filtrants: coursParUE[n] || [],
    })),
    etudiants,
  });
});

export default r;

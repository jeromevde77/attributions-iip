// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Répartition des périodes entre années civiles
//
// La dotation est CIVILE, l'enseignement est ACADÉMIQUE : une année scolaire
// se déclare donc sur deux années civiles. Le document 2 le traduit par quatre
// colonnes, par activité d'enseignement :
//
//   col. 16 / 17 — périodes PRÉVUES, 1re et 2e année civile
//                  leur somme atteint la colonne 15 (dossier pédagogique)
//                  lorsque la branche est entièrement organisée sur l'année
//   col. 18 / 19 — périodes RÉELLEMENT organisées, dédoublements compris
//                  ce sont elles qui se décomptent de la dotation organique
//
// La règle des 40-60 est une commodité d'usage, non une norme : elle sert de
// proposition, et s'ajuste. Une UE du premier quadrimestre dont l'examen tombe
// en janvier doit porter quelques périodes sur la seconde année civile, faute
// de quoi l'UE serait réputée fermée alors qu'elle ne l'est pas.
//
// L'autonomie fait l'objet d'une ligne distincte au sein de chaque UE :
// l'arrêté du 22/11/2002 la range hors des cas généraux.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { niveauxEffectifs } from './capitalisation.js';

const r = Router();

// Clé de répartition par défaut, ajustable ligne à ligne
const PART_C1 = 0.4;

export function migrerRepartition(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS repartition_periodes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire  TEXT NOT NULL,
      ue_num          INTEGER NOT NULL,
      num_organisation INTEGER NOT NULL DEFAULT 1,
      cours_code      TEXT,                       -- NULL pour la ligne d'autonomie
      nature          TEXT NOT NULL DEFAULT 'cours',   -- cours | autonomie
      prevu_c1        REAL, prevu_c2 REAL,        -- colonnes 16 et 17
      reel_c1         REAL, reel_c2 REAL,         -- colonnes 18 et 19
      remarque        TEXT,
      maj_le          TEXT DEFAULT (datetime('now')),
      UNIQUE(annee_scolaire, ue_num, num_organisation, cours_code, nature)
    );
    CREATE INDEX IF NOT EXISTS idx_repartition
      ON repartition_periodes(annee_scolaire, ue_num);
    `);
    console.log('[migration] repartition_periodes créée');
  } catch (e) { console.error('[migration] répartition :', e.message); }
}

const arrondi = n => Math.round((Number(n) || 0) * 100) / 100;
const anneesCiviles = (annee) => {
  const a1 = Number(String(annee).slice(0, 4));
  return [a1, a1 + 1];
};

/**
 * Part revenant à la première année civile d'après les dates réelles.
 * Sert d'indication : la proposition retenue reste la clé 40-60, mais l'écart
 * entre les deux se voit, et c'est souvent lui qui appelle un ajustement.
 */
function partReelleC1(dateDebut, dateFin, a1) {
  if (!dateDebut || !dateFin) return null;
  const d = new Date(dateDebut + 'T00:00:00Z'), f = new Date(dateFin + 'T00:00:00Z');
  if (isNaN(d) || isNaN(f) || f <= d) return null;
  const bascule = new Date(Date.UTC(a1, 11, 31, 23, 59, 59));
  if (f <= bascule) return 1;
  if (d >= bascule) return 0;
  return Math.max(0, Math.min(1, (bascule - d) / (f - d)));
}

// ── Lignes de répartition d'une année académique ───────────────────────────
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee;
  const section = req.query.section;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const perim = getUserSections(req.user);
  if (section && perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const [a1, a2] = anneesCiviles(annee);

  // Organisations de l'année, avec leurs dates
  const clauses = ['o.annee_scolaire = ?'];
  const params = [annee];
  if (section) { clauses.push('o.section = ?'); params.push(section); }
  else if (perim) {
    clauses.push(`o.section IN (${perim.map(() => '?').join(',') || "''"})`);
    params.push(...perim);
  }

  // Le pot de financement suit l'UE : conseiller qualité, congé-formation et
  // inclusion sont des ENVELOPPES FERMÉES, distinctes de la dotation organique.
  // Les confondre ferait porter à la dotation des périodes qu'elle ne finance
  // pas — et masquerait un dépassement d'enveloppe.
  const orgs = db.prepare(`
    SELECT o.id, o.ue_num, o.section, o.num_organisation, o.date_debut, o.date_fin,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = o.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT ue_aut FROM ue u WHERE u.ue_num = o.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_autonomie,
           (SELECT ue_niv FROM ue u WHERE u.ue_num = o.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_niv,
           (SELECT ue_quad FROM ue u WHERE u.ue_num = o.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_quad,
           (SELECT COALESCE(u.pot_code,
                     CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
                          WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
                          WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
                          ELSE 'organique' END)
              FROM ue u WHERE u.ue_num = o.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS pot
    FROM organisation_ue o
    WHERE ${clauses.join(' AND ')}
    ORDER BY o.section, o.ue_num, o.num_organisation
  `).all(...params);
  if (!orgs.length) return res.json({ annee, annees_civiles: [a1, a2], ues: [], synthese: null });

  const listeUe = [...new Set(orgs.map(o => o.ue_num))];

  // Année d'études au sens de la SECTION : c'est celle qui fait foi, le
  // référentiel pouvant porter une valeur générique pour une UE partagée.
  const sectionsVues = [...new Set(orgs.map(o => o.section).filter(Boolean))];
  let nivEffectif = {};
  try {
    nivEffectif = sectionsVues.length ? niveauxEffectifs(sectionsVues, annee) : {};
  } catch { /* le schéma de capitalisation peut manquer : on gardera ue_niv */ }

  // Cours du référentiel, avec leurs périodes du dossier pédagogique
  const coursRef = db.prepare(`
    SELECT ue_num, cours_code, MIN(cours_nom) AS cours_nom, MAX(cours_per) AS cours_per,
           MAX(ct_pp) AS type_cours
    FROM cours WHERE ue_num IN (${listeUe.join(',')}) AND cours_code IS NOT NULL
    GROUP BY ue_num, cours_code
  `).all();

  // Périodes réellement attribuées, par cours — ce sont elles qu'on répartit.
  // Les attributions HELB sont ÉCARTÉES : elles ne se décomptent pas de la
  // dotation de l'établissement, les inclure gonflerait la déclaration.
  const attrib = db.prepare(`
    SELECT ue_num, code_cours,
           ROUND(SUM(COALESCE(periodes_attribuees, 0)), 1) AS periodes,
           ROUND(SUM(COALESCE(autonomie_attribuee, 0)), 1) AS autonomie
    FROM attribution
    WHERE annee_scolaire = ? AND ue_num IN (${listeUe.join(',')})
      AND COALESCE(contrat_mdp, 'IIP') = 'IIP'
    GROUP BY ue_num, code_cours
  `).all(annee);

  // Ce qui relève de la HELB, gardé de côté pour l'afficher sans le compter :
  // le voir rassure sur le fait qu'il n'a pas été oublié, mais égaré.
  const helb = db.prepare(`
    SELECT ue_num, ROUND(SUM(COALESCE(periodes_attribuees, 0)
                          + COALESCE(autonomie_attribuee, 0)), 1) AS periodes
    FROM attribution
    WHERE annee_scolaire = ? AND ue_num IN (${listeUe.join(',')})
      AND contrat_mdp = 'HELB'
    GROUP BY ue_num
  `).all(annee);
  const helbDe = Object.fromEntries(helb.map(h => [h.ue_num, h.periodes]));
  const attribDe = {};
  for (const a of attrib) attribDe[`${a.ue_num}|${a.code_cours || ''}`] = a;

  // Total réellement attribué par UE, indépendamment du code de cours. Il sert
  // de garde-fou : une attribution sans code d'activité, ou portant un code
  // absent du référentiel, ne figurerait dans aucune ligne du tableau et ses
  // périodes disparaîtraient de la déclaration.
  const totalAttribueUe = Object.fromEntries(db.prepare(`
    SELECT ue_num, ROUND(SUM(COALESCE(periodes_attribuees, 0)), 1) AS periodes,
                   ROUND(SUM(COALESCE(autonomie_attribuee, 0)), 1) AS autonomie,
                   ROUND(SUM(COALESCE(total_attribue_professeur, 0)), 1) AS total_pilotage,
                   MAX(COALESCE(quadrimestre_attribue, '')) AS quadri
    FROM attribution
    WHERE annee_scolaire = ? AND ue_num IN (${listeUe.join(',')})
      AND COALESCE(contrat_mdp, 'IIP') = 'IIP'
    GROUP BY ue_num
  `).all(annee).map(x => [x.ue_num, x]));

  // Répartitions déjà saisies
  const saisies = {};
  for (const s of db.prepare(
    'SELECT * FROM repartition_periodes WHERE annee_scolaire = ?'
  ).all(annee)) {
    saisies[`${s.ue_num}|${s.num_organisation}|${s.cours_code || ''}|${s.nature}`] = s;
  }

  const ues = orgs.map(o => {
    const part = partReelleC1(o.date_debut, o.date_fin, a1);
    const lignes = [];

    const ajouter = (cours_code, libelle, nature, prevuTotal, reelTotal, typeCours) => {
      const cle = `${o.ue_num}|${o.num_organisation}|${cours_code || ''}|${nature}`;
      const s = saisies[cle];
      // Proposition : la clé 40-60 par défaut. Mais lorsque les dates placent
      // l'organisation entièrement dans une seule année civile, proposer 40-60
      // serait proposer une erreur : on suit alors les dates.
      const cleProposee = (part != null && (part >= 0.999 || part <= 0.001)) ? part : PART_C1;
      // Des périodes ne se comptent pas en fractions : la répartition est
      // entière. On arrondit la première année civile et on déduit la seconde,
      // pour que la somme retombe exactement sur le total.
      const propPrevuC1 = Math.round((prevuTotal || 0) * cleProposee);
      const propReelC1 = Math.round((reelTotal || 0) * cleProposee);
      lignes.push({
        cours_code, libelle, nature, type_cours: typeCours || null,
        prevu_total: arrondi(prevuTotal), reel_total: arrondi(reelTotal),
        prevu_c1: s?.prevu_c1 ?? propPrevuC1,
        prevu_c2: s?.prevu_c2 ?? Math.round((prevuTotal || 0) - propPrevuC1),
        reel_c1: s?.reel_c1 ?? propReelC1,
        reel_c2: s?.reel_c2 ?? Math.round((reelTotal || 0) - propReelC1),
        saisi: !!s,
        remarque: s?.remarque || null,
        part_dates: part,
      });
    };

    for (const c of coursRef.filter(x => x.ue_num === o.ue_num)) {
      const a = attribDe[`${o.ue_num}|${c.cours_code}`] || {};
      ajouter(c.cours_code, c.cours_nom, 'cours', c.cours_per, a.periodes, c.type_cours);
    }

    // L'autonomie, hors des cas généraux, sur sa propre ligne
    const t = totalAttribueUe[o.ue_num] || {};
    const autonomieAttribuee = Number(t.autonomie || 0);
    if (o.ue_autonomie || autonomieAttribuee) {
      ajouter(null, 'Autonomie', 'autonomie', o.ue_autonomie, autonomieAttribuee, null);
    }

    // Ce qui reste attribué sans avoir trouvé d'activité : plutôt que de le
    // perdre, on lui donne sa ligne. Un total déclaré inférieur au total
    // attribué serait une sous-déclaration pure et simple.
    const repriseCours = lignes.filter(l => l.nature === 'cours')
      .reduce((s, l) => s + Number(l.reel_total || 0), 0);
    const orphelines = arrondi(Number(t.periodes || 0) - repriseCours);
    if (orphelines > 0.05) {
      ajouter('—', 'Périodes sans activité identifiée', 'cours', 0, orphelines, null);
    }

    const somme = (champ) => arrondi(lignes.reduce((s, l) => s + Number(l[champ] || 0), 0));
    const attribueUe = arrondi(Number(t.periodes || 0) + Number(t.autonomie || 0));

    return {
      ...o,
      part_dates: part,
      attribue_ue: attribueUe,
      niveau: nivEffectif[o.ue_num] || o.ue_niv || null,
      // Quadrimestre de rattachement retenu par la simulation de Pilotage :
      // celui de l'attribution s'il est précisé, sinon celui du référentiel.
      quadri_simulation: t.quadri || o.ue_quad || null,
      total_pilotage: arrondi(Number(t.total_pilotage || 0)),
      quadrimestre: t.quadri || o.ue_quad || null,
      periodes_helb: helbDe[o.ue_num] || 0,
      lignes,
      totaux: {
        prevu_total: somme('prevu_total'), reel_total: somme('reel_total'),
        prevu_c1: somme('prevu_c1'), prevu_c2: somme('prevu_c2'),
        reel_c1: somme('reel_c1'), reel_c2: somme('reel_c2'),
      },
    };
  });

  // Contrôles réglementaires
  const anomalies = [];

  // La clé 40-60 est une commodité. Quand les dates de l'organisation tiennent
  // entièrement dans une seule année civile, elle est manifestement fausse : la
  // circulaire prescrit alors zéro dans l'autre colonne. On le dit plutôt que
  // de proposer 40-60 en silence.
  for (const u of ues) {
    if (u.part_dates == null) continue;
    const entierementC1 = u.part_dates >= 0.999;
    const entierementC2 = u.part_dates <= 0.001;
    if (!entierementC1 && !entierementC2) continue;
    const aTort = u.lignes.some(l => (entierementC1 ? l.prevu_c2 : l.prevu_c1) > 0.01
                                  || (entierementC1 ? l.reel_c2 : l.reel_c1) > 0.01);
    if (aTort) {
      anomalies.push({
        ue_num: u.ue_num, cours: 'toute l\'unité',
        niveau: 'attention',
        message: `L'organisation se tient entièrement ${entierementC1 ? 'sur ' + a1 : 'sur ' + a2}`
               + ` (${u.date_debut} → ${u.date_fin}), mais des périodes figurent sur l'autre année`
               + ` civile. Ce n'est justifié que si des périodes y sont réellement organisées —`
               + ` une séance ou une épreuve surveillée, par exemple.`,
      });
    }
  }
  for (const u of ues) {
    for (const l of u.lignes) {
      const sommePrevu = arrondi((l.prevu_c1 || 0) + (l.prevu_c2 || 0));
      if (l.prevu_total && Math.abs(sommePrevu - l.prevu_total) > 0.01) {
        anomalies.push({
          ue_num: u.ue_num, cours: l.cours_code || l.libelle,
          message: `Prévu réparti ${sommePrevu} au lieu de ${l.prevu_total} — la somme des `
                 + `colonnes 16 et 17 doit atteindre le dossier pédagogique.`,
        });
      }
      // La colonne 18 compte les DÉDOUBLEMENTS : sans dédoublement on organise
      // exactement le prévu (multiple 1), avec deux groupes on organise le
      // double. Un rapport non entier n'a donc pas de sens.
      //
      // Ce contrôle ne vaut QUE sur des valeurs déclarées. Sur les propositions
      // automatiques, il compare 40 % du dossier pédagogique à 40 % des
      // périodes attribuées — deux totaux différents dont le rapport n'a aucune
      // raison d'être entier. Le signaler alors n'apprenait rien.
      if (!l.saisi) continue;

      for (const [p, r0, col] of [[l.prevu_c1, l.reel_c1, '18'], [l.prevu_c2, l.reel_c2, '19']]) {
        if (!p || !r0) continue;
        const q = r0 / p;
        if (Math.abs(q - Math.round(q)) > 0.01) {
          anomalies.push({
            ue_num: u.ue_num, cours: l.cours_code || l.libelle,
            niveau: 'attention',
            message: `Colonne ${col} : ${r0} période(s) organisées pour ${p} prévue(s), `
                   + `soit un rapport de ${Math.round(q * 100) / 100}. Cette colonne compte les `
                   + `dédoublements : le rapport vaut 1 sans dédoublement, 2 avec deux groupes, `
                   + `et ainsi de suite. Une valeur intermédiaire signale une erreur de saisie, `
                   + `ou une suppression de dédoublement — que la circulaire n'admet qu'au `
                   + `cinquième dixième.`,
          });
        }
      }
    }
  }

  // Le réel réparti doit égaler ce qui est attribué : c'est LE contrôle qui
  // compte, puisqu'un écart signifie qu'on déclare autre chose que ce qu'on
  // organise réellement.
  for (const u of ues) {
    const reparti = arrondi(u.totaux.reel_c1 + u.totaux.reel_c2);
    if (Math.abs(reparti - u.attribue_ue) > 0.05) {
      anomalies.push({
        ue_num: u.ue_num, cours: 'bouclage',
        niveau: 'grave',
        message: `${reparti} période(s) réparties pour ${u.attribue_ue} attribuée(s) — `
               + `écart de ${arrondi(reparti - u.attribue_ue)}. La déclaration ne correspondrait `
               + `pas à ce qui est organisé.`,
      });
    }
    // Écart entre la somme des deux colonnes et le total consolidé de Pilotage
    if (u.total_pilotage && Math.abs(u.attribue_ue - u.total_pilotage) > 0.05) {
      anomalies.push({
        ue_num: u.ue_num, cours: 'cohérence',
        niveau: 'attention',
        message: `Périodes + autonomie donnent ${u.attribue_ue}, alors que le total consolidé `
               + `utilisé par Pilotage vaut ${u.total_pilotage}. Ces deux valeurs devraient `
               + `coïncider.`,
      });
    }
  }

  const totalGeneral = (champ, filtre = () => true) =>
    arrondi(ues.filter(filtre).reduce((s, u) => s + u.totaux[champ], 0));

  const organique = u => (u.pot || 'organique') === 'organique';

  // Ce que consomme chaque enveloppe, pour vérifier qu'elle est respectée
  const parPot = {};
  for (const u of ues) {
    const p = u.pot || 'organique';
    const k = (parPot[p] = parPot[p] || { pot: p, reel_c1: 0, reel_c2: 0, ues: 0 });
    k.reel_c1 += u.totaux.reel_c1; k.reel_c2 += u.totaux.reel_c2; k.ues++;
  }
  const enveloppes = Object.values(parPot).map(k => ({
    ...k, reel_c1: arrondi(k.reel_c1), reel_c2: arrondi(k.reel_c2),
    total: arrondi(k.reel_c1 + k.reel_c2),
  })).sort((a, b) => (a.pot === 'organique' ? -1 : b.pot === 'organique' ? 1 : a.pot.localeCompare(b.pot)));

  res.json({
    annee, annees_civiles: [a1, a2], ues, anomalies,
    // Sous-totaux par section : la déclaration se prépare section par section,
    // et c'est à ce niveau que les écarts se repèrent le plus vite.
    sections: (() => {
      const par = {};
      for (const u of ues) {
        const s = u.section || '(sans section)';
        const k = (par[s] = par[s] || {
          section: s, ues: 0,
          prevu_total: 0, reel_total: 0,
          prevu_c1: 0, prevu_c2: 0, reel_c1: 0, reel_c2: 0,
          attribue: 0, hors_organique: 0,
        });
        k.ues++;
        for (const champ of ['prevu_total', 'reel_total', 'prevu_c1', 'prevu_c2', 'reel_c1', 'reel_c2']) {
          k[champ] += u.totaux[champ];
        }
        k.attribue += u.attribue_ue || 0;
        if ((u.pot || 'organique') !== 'organique') k.hors_organique += u.totaux.reel_c1 + u.totaux.reel_c2;
      }
      return Object.values(par).map(k => {
        const arr = {};
        for (const [cle, v] of Object.entries(k)) {
          arr[cle] = typeof v === 'number' ? arrondi(v) : v;
        }
        arr.boucle = Math.abs((arr.reel_c1 + arr.reel_c2) - arr.attribue) <= 0.05;
        return arr;
      }).sort((a, b) => a.section.localeCompare(b.section));
    })(),

    enveloppes,
    // Bouclage général, affiché en tête : la somme de ce qui est réparti doit
    // égaler la somme de ce qui est attribué.
    controle: (() => {
      const attribue = arrondi(ues.reduce((s, u) => s + (u.attribue_ue || 0), 0));
      const reparti = arrondi(ues.reduce((s, u) => s + u.totaux.reel_c1 + u.totaux.reel_c2, 0));
      const pilotage = arrondi(ues.reduce((s, u) => s + (u.total_pilotage || 0), 0));
      return {
        attribue, reparti, pilotage,
        ecart: arrondi(reparti - attribue),
        boucle: Math.abs(reparti - attribue) <= 0.05,
      };
    })(),
    synthese: {
      // La synthèse porte sur la DOTATION ORGANIQUE seule : les enveloppes
      // fermées ont leur propre compte, plus bas.
      prevu_c1: totalGeneral('prevu_c1', organique), prevu_c2: totalGeneral('prevu_c2', organique),
      reel_c1: totalGeneral('reel_c1', organique), reel_c2: totalGeneral('reel_c2', organique),
      reel_total: totalGeneral('reel_total', organique),
      hors_organique: arrondi(enveloppes.filter(e => e.pot !== 'organique')
        .reduce((s, e) => s + e.total, 0)),
    },
  });
});

// ── Enregistrement ──────────────────────────────────────────────────────────
r.put('/', authRequired, roleRequired('admin', 'editeur', 'secretariat'), (req, res) => {
  const { annee, lignes } = req.body;
  if (!annee || !Array.isArray(lignes)) {
    return res.status(400).json({ error: 'annee et lignes requises' });
  }
  const up = db.prepare(`
    INSERT INTO repartition_periodes
      (annee_scolaire, ue_num, num_organisation, cours_code, nature,
       prevu_c1, prevu_c2, reel_c1, reel_c2, remarque, maj_le)
    VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(annee_scolaire, ue_num, num_organisation, cours_code, nature) DO UPDATE SET
      prevu_c1 = excluded.prevu_c1, prevu_c2 = excluded.prevu_c2,
      reel_c1 = excluded.reel_c1, reel_c2 = excluded.reel_c2,
      remarque = excluded.remarque, maj_le = datetime('now')
  `);
  let n = 0;
  db.transaction(() => {
    for (const l of lignes) {
      up.run(annee, Number(l.ue_num), Number(l.num_organisation || 1),
             l.cours_code || null, l.nature || 'cours',
             // Entiers : une demi-période ne se déclare pas.
             l.prevu_c1 != null ? Math.round(Number(l.prevu_c1)) : null,
             l.prevu_c2 != null ? Math.round(Number(l.prevu_c2)) : null,
             l.reel_c1 != null ? Math.round(Number(l.reel_c1)) : null,
             l.reel_c2 != null ? Math.round(Number(l.reel_c2)) : null,
             l.remarque || null);
      n++;
    }
  })();
  res.json({ ok: true, enregistrees: n });
});

// ── Dotation d'une année CIVILE ─────────────────────────────────────────────
// Elle additionne la seconde moitié de l'année académique précédente et la
// première de l'année en cours — c'est ce que la Fédération intègre en avril.
r.get('/annee-civile/:annee', authRequired, (req, res) => {
  const civile = Number(req.params.annee);
  if (!civile) return res.status(400).json({ error: 'année civile invalide' });

  const precedente = `${civile - 1}-${civile}`;
  const courante = `${civile}-${civile + 1}`;

  // Seules les UE de la dotation ORGANIQUE entrent dans ce total : les
  // enveloppes fermées — conseiller qualité, congé-formation, inclusion — sont
  // financées à part et ont leur propre plafond.
  const POT_UE = `COALESCE(u.pot_code,
    CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
         WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
         WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
         ELSE 'organique' END)`;

  const somme = (anneeScolaire, champ) => db.prepare(`
    SELECT ROUND(SUM(COALESCE(rp.${champ}, 0)), 1) AS total
    FROM repartition_periodes rp
    WHERE rp.annee_scolaire = ?
      AND COALESCE((SELECT ${POT_UE} FROM ue u WHERE u.ue_num = rp.ue_num
                    ORDER BY u.annee_scolaire DESC LIMIT 1), 'organique') = 'organique'
  `).get(anneeScolaire)?.total || 0;

  const sommePot = (anneeScolaire, champ) => db.prepare(`
    SELECT COALESCE((SELECT ${POT_UE} FROM ue u WHERE u.ue_num = rp.ue_num
                     ORDER BY u.annee_scolaire DESC LIMIT 1), 'organique') AS pot,
           ROUND(SUM(COALESCE(rp.${champ}, 0)), 1) AS total
    FROM repartition_periodes rp WHERE rp.annee_scolaire = ?
    GROUP BY pot
  `).all(anneeScolaire);

  const janvierJuin = somme(precedente, 'reel_c2');
  const septembreDecembre = somme(courante, 'reel_c1');

  // Consommation des enveloppes fermées sur la même année civile, et
  // comparaison avec le pot disponible : c'est le dépassement qu'on veut voir.
  const parPot = {};
  for (const [an, champ] of [[precedente, 'reel_c2'], [courante, 'reel_c1']]) {
    for (const l of sommePot(an, champ)) {
      if (l.pot === 'organique') continue;
      parPot[l.pot] = arrondi((parPot[l.pot] || 0) + Number(l.total || 0));
    }
  }
  const pots = db.prepare(
    'SELECT code, label, periodes_b, illimite FROM enveloppe_externe WHERE annee_civile = ?'
  ).all(civile);

  const enveloppes = Object.entries(parPot).map(([code, consomme]) => {
    const e = pots.find(p => p.code === code);
    const disponible = e?.illimite ? null : (e?.periodes_b ?? null);
    return {
      code, label: e?.label || code, consomme, disponible,
      illimite: !!e?.illimite,
      depasse: disponible != null && consomme > disponible,
      solde: disponible != null ? arrondi(disponible - consomme) : null,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));

  res.json({
    annee_civile: civile,
    janvier_juin: { annee_scolaire: precedente, periodes: janvierJuin },
    septembre_decembre: { annee_scolaire: courante, periodes: septembreDecembre },
    total: arrondi(janvierJuin + septembreDecembre),
    enveloppes,
    avertissement: enveloppes.some(e => e.depasse)
      ? "Une enveloppe est dépassée : le surplus retombe sur la dotation organique."
      : null,
  });
});

export default r;

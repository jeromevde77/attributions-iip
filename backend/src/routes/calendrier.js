import express from 'express';
import db from '../db/index.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = express.Router();

/**
 * LE CALENDRIER DES SESSIONS — toute une section sur une page.
 *
 * Ces dates existaient déjà, mais chacune derrière une porte différente : la
 * date de délibération et la visite des copies dans l'écran de délibération de
 * l'unité, la seconde session dans un volet de ce même écran, cours par cours.
 * Pour fixer le calendrier d'une section — trente unités, cent cours —, il
 * fallait donc ouvrir trente délibérations, et une délibération est un acte de
 * Conseil : ce n'est pas le lieu où l'on tape des dates à la chaîne.
 *
 * Or ces dates se posent EN GROS et se corrigent EN GROS : la visite des
 * copies est le même jour pour toute la section, la délibération se tient sur
 * deux après-midi, et une salle qui change les change toutes.
 *
 * D'où cette page : les unités, leurs cours, leurs dates, et la possibilité
 * d'en appliquer une à tout ce qu'on a coché.
 *
 * CE QUI EST GARDÉ DE LA RÈGLE : une séance clôturée porte sa date au
 * procès-verbal. On peut la corriger ici — une coquille se corrige —, mais
 * seulement en écrivant pourquoi, et la mention reste au dossier.
 */
(function migrerCalendrier() {
  try {
    db.exec(`
      -- L'ÉPREUVE DE PREMIÈRE SESSION, qui n'était notée nulle part. La
      -- seconde session avait sa table (deliberation_session2) parce que les
      -- notifications d'ajournement en avaient besoin ; la première n'était
      -- demandée par aucun document, et n'existait donc pas. Elle manquait
      -- pourtant à tout le monde : c'est la date que l'étudiant cherche.
      CREATE TABLE IF NOT EXISTS epreuve_session1 (
        ue_num         INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        cours_code     TEXT    NOT NULL,
        s1_date        TEXT,
        s1_heure       TEXT,
        s1_local       TEXT,
        s1_adresse     TEXT,
        maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
        maj_par        TEXT,
        PRIMARY KEY (ue_num, annee_scolaire, cours_code)
      );
      -- LA CORRECTION D'UNE DATE APRÈS CLÔTURE LAISSE SA TRACE. Sans elle,
      -- une date de procès-verbal deviendrait modifiable en silence — et
      -- c'est précisément ce qu'un recours viendrait chercher.
      CREATE TABLE IF NOT EXISTS calendrier_correction (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ue_num         INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        session        INTEGER NOT NULL DEFAULT 1,
        avant          TEXT,
        apres          TEXT,
        motif          TEXT,
        le             TEXT DEFAULT CURRENT_TIMESTAMP,
        par            TEXT
      );
    `);
  } catch (e) { console.error('[migration] calendrier :', e.message); }
})();

const CHAMPS_SEANCE = ['date_seance', 'heure_seance',
  'visite_date', 'visite_heure', 'visite_local'];
const CHAMPS_S1 = ['s1_date', 's1_heure', 's1_local', 's1_adresse'];
const CHAMPS_S2 = ['s2_date', 's2_heure', 's2_local', 's2_adresse'];

/** L'unité est-elle dans le périmètre de celui qui regarde ? */
function horsPerimetre(req, section) {
  const perim = getUserSections(req.user);
  return !!(perim && section && !perim.includes(section));
}

/**
 * TOUT LE CALENDRIER D'UNE SECTION, en une seule lecture.
 *
 * On rend les deux sessions de chaque unité côte à côte : c'est ainsi qu'on
 * lit un calendrier — juin et septembre sur la même ligne —, et non en
 * changeant d'onglet pour comparer deux dates.
 */
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const section = req.query.section || null;

  const perim = getUserSections(req.user);
  if (section && horsPerimetre(req, section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  const ues = db.prepare(`
    SELECT ue_num, ue_nom, section FROM ue
    WHERE annee_scolaire = ?${section ? ' AND section = ?' : ''}
    ORDER BY ue_num
  `).all(...(section ? [annee, section] : [annee]))
    .filter(u => !perim || !u.section || perim.includes(u.section));
  if (!ues.length) return res.json({ annee, section, ues: [] });

  const dans = ues.map(() => '?').join(',');
  const nums = ues.map(u => u.ue_num);

  const cours = db.prepare(`
    SELECT cours_code, ue_num, cours_nom, cours_per FROM cours
    WHERE annee_scolaire = ? AND ue_num IN (${dans}) ORDER BY cours_num, cours_code
  `).all(annee, ...nums);

  const seances = db.prepare(`
    SELECT ue_num, session, cloturee, ${CHAMPS_SEANCE.join(', ')}
    FROM deliberation_seance WHERE annee_scolaire = ? AND ue_num IN (${dans})
  `).all(annee, ...nums);
  const parSeance = {};
  for (const s of seances) (parSeance[s.ue_num] ||= {})[s.session || 1] = s;

  const s1 = db.prepare(`SELECT ue_num, cours_code, ${CHAMPS_S1.join(', ')}
    FROM epreuve_session1 WHERE annee_scolaire = ? AND ue_num IN (${dans})`).all(annee, ...nums);
  const s2 = db.prepare(`SELECT ue_num, cours_code, ${CHAMPS_S2.join(', ')}
    FROM deliberation_session2 WHERE annee_scolaire = ? AND ue_num IN (${dans})`).all(annee, ...nums);
  const cle = x => `${x.ue_num}|${x.cours_code}`;
  const parS1 = Object.fromEntries(s1.map(x => [cle(x), x]));
  const parS2 = Object.fromEntries(s2.map(x => [cle(x), x]));

  // Qui donne le cours : c'est la première question devant un calendrier —
  // « qui dois-je prévenir si je déplace cette épreuve ? »
  const profs = {};
  try {
    for (const l of db.prepare(`
      SELECT a.code_cours AS code,
             GROUP_CONCAT(DISTINCT p.nom || ' ' || COALESCE(p.prenom,'')) AS noms
      FROM attribution a JOIN professeur p ON p.id = a.professeur_id
      WHERE a.annee_scolaire = ? AND a.code_cours IS NOT NULL
        AND a.professeur_id IS NOT NULL
      GROUP BY a.code_cours
    `).all(annee)) profs[l.code] = l.noms;
  } catch { /* le calendrier vaut sans les noms */ }

  res.json({
    annee, section,
    ues: ues.map(u => ({
      ue_num: u.ue_num, ue_nom: u.ue_nom, section: u.section,
      seance_s1: parSeance[u.ue_num]?.[1] || null,
      seance_s2: parSeance[u.ue_num]?.[2] || null,
      cours: cours.filter(c => c.ue_num === u.ue_num).map(c => ({
        cours_code: c.cours_code, cours_nom: c.cours_nom, cours_per: c.cours_per,
        professeurs: profs[c.cours_code] || '',
        s1: parS1[`${u.ue_num}|${c.cours_code}`] || null,
        s2: parS2[`${u.ue_num}|${c.cours_code}`] || null,
      })),
    })),
  });
});

/**
 * POSER DES DATES — une, ou deux cents.
 *
 * Une seule route pour la correction d'une case et pour l'application en
 * masse : c'est la même écriture, et deux routes auraient divergé.
 *
 * Rien n'est écrit tant qu'une séance close s'y oppose sans motif : on répond
 * 409 en NOMMANT les unités concernées, pour qu'on sache exactement ce qu'on
 * s'apprête à corriger avant d'écrire pourquoi.
 */
r.put('/', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'),
      (req, res) => {
  const annee = req.body?.annee || anneeDeTravail(req);
  const motif = String(req.body?.motif || '').trim();
  const seances = Array.isArray(req.body?.seances) ? req.body.seances : [];
  const epreuves = Array.isArray(req.body?.epreuves) ? req.body.epreuves : [];
  if (!seances.length && !epreuves.length) {
    return res.status(400).json({ error: 'rien à poser' });
  }

  const sectionDe = n => db.prepare(`SELECT section FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(Number(n), annee)?.section;

  // ── 1. CE QUI SE HEURTE À UNE SÉANCE CLOSE ───────────────────────────────
  const closes = [];
  for (const s of seances) {
    const ue = Number(s.ue_num);
    const ses = Number(s.session) === 2 ? 2 : 1;
    if (horsPerimetre(req, sectionDe(ue))) {
      return res.status(403).json({ error: `unité ${ue} hors de votre périmètre` });
    }
    const touche = CHAMPS_SEANCE.some(c => c in s);
    if (!touche) continue;
    const l = db.prepare(`SELECT cloturee FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ? AND session = ?`).get(ue, annee, ses);
    if (l?.cloturee) closes.push({ ue_num: ue, session: ses });
  }
  // LE MOTIF EST EXIGÉ, ET IL EST EXIGÉ D'ABORD. Corriger la date d'un acte
  // signé se justifie — une coquille, une salle changée la veille — mais cela
  // se dit, et cela reste au dossier.
  if (closes.length && motif.length < 5) {
    return res.status(409).json({
      error: 'séance(s) clôturée(s)',
      detail: `${closes.length} séance(s) déjà clôturée(s) : leur date figure au `
            + 'procès-verbal. Dites en une phrase pourquoi vous la corrigez — '
            + 'la mention reste au dossier.',
      closes,
    });
  }

  // ── 2. L'ÉCRITURE ────────────────────────────────────────────────────────
  const majSeance = (ue, ses, champs) => {
    const avant = db.prepare(`SELECT ${CHAMPS_SEANCE.join(', ')}, cloturee
      FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND session = ?`)
      .get(ue, annee, ses);
    if (!avant) {
      const cols = Object.keys(champs);
      db.prepare(`INSERT INTO deliberation_seance
        (ue_num, annee_scolaire, session${cols.length ? ', ' + cols.join(', ') : ''}, maj_le, maj_par)
        VALUES (?,?,?${cols.map(() => ',?').join('')}, datetime('now'), ?)`)
        .run(ue, annee, ses, ...cols.map(c => champs[c]), req.user?.email || null);
      return { cree: true };
    }
    const cols = Object.keys(champs);
    if (cols.length) {
      db.prepare(`UPDATE deliberation_seance SET ${cols.map(c => `${c} = ?`).join(', ')},
        maj_le = datetime('now'), maj_par = ?
        WHERE ue_num = ? AND annee_scolaire = ? AND session = ?`)
        .run(...cols.map(c => champs[c]), req.user?.email || null, ue, annee, ses);
    }
    if (avant.cloturee) {
      db.prepare(`INSERT INTO calendrier_correction
        (ue_num, annee_scolaire, session, avant, apres, motif, par) VALUES (?,?,?,?,?,?,?)`)
        .run(ue, annee, ses,
          JSON.stringify(Object.fromEntries(cols.map(c => [c, avant[c]]))),
          JSON.stringify(champs), motif, req.user?.email || null);
    }
    return { cree: false, close: !!avant.cloturee };
  };

  const poserEpreuve = (e) => {
    const ue = Number(e.ue_num);
    const ses = Number(e.session) === 2 ? 2 : 1;
    const table = ses === 2 ? 'deliberation_session2' : 'epreuve_session1';
    const liste = ses === 2 ? CHAMPS_S2 : CHAMPS_S1;
    const champs = {};
    for (const c of liste) if (c in e) champs[c] = e[c] === '' ? null : e[c];
    if (!Object.keys(champs).length) return;
    const cols = Object.keys(champs);
    db.prepare(`INSERT INTO ${table}
      (ue_num, annee_scolaire, cours_code, ${cols.join(', ')})
      VALUES (?,?,?${cols.map(() => ',?').join('')})
      ON CONFLICT(ue_num, annee_scolaire, cours_code) DO UPDATE SET
        ${cols.map(c => `${c} = excluded.${c}`).join(', ')}`)
      .run(ue, annee, String(e.cours_code), ...cols.map(c => champs[c]));
  };

  let nSeances = 0, nEpreuves = 0;
  try {
    db.transaction(() => {
      for (const s of seances) {
        const champs = {};
        for (const c of CHAMPS_SEANCE) if (c in s) champs[c] = s[c] === '' ? null : s[c];
        if (!Object.keys(champs).length) continue;
        majSeance(Number(s.ue_num), Number(s.session) === 2 ? 2 : 1, champs);
        nSeances++;
      }
      for (const e of epreuves) {
        if (horsPerimetre(req, sectionDe(Number(e.ue_num)))) {
          throw new Error(`unité ${e.ue_num} hors de votre périmètre`);
        }
        poserEpreuve(e); nEpreuves++;
      }
    })();
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  res.json({ ok: true, annee, seances: nSeances, epreuves: nEpreuves,
             corrections_apres_cloture: closes.length });
});

/** Les corrections faites après clôture — pour qu'elles se lisent. */
r.get('/corrections', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  res.json(db.prepare(`SELECT * FROM calendrier_correction
    WHERE annee_scolaire = ? ORDER BY le DESC LIMIT 200`).all(annee));
});

export default r;

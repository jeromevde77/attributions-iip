// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Stages et activités professionnelles de formation
// (RDE, titre XIII, art. 50 à 56 ; décret du 16 avril 1991, art. 46 et 72 § 3)
//
// Deux objets distincts, qu'il serait tentant de confondre :
//
//   LE LIEU — l'établissement d'accueil, avec son adresse. Il vit d'une année
//   sur l'autre et sert à plusieurs étudiants. C'est lui qui figure au
//   supplément au diplôme, d'où l'exigence sur l'adresse complète.
//
//   LE STAGE — la période effectuée par un étudiant dans ce lieu, pour une UE
//   donnée, avec son maître de stage, ses dates et son évaluation.
//
// Les articles 51 et 52 commandent la structure : rien ne commence sans
// autorisation écrite ET convention signée. Le module suit donc ces deux jalons
// séparément, et refuse de considérer un stage comme démarré tant que les deux
// ne sont pas posés.
//
// L'article 55 ajoute des pièces dont l'absence est bloquante : le casier
// judiciaire modèle 2 avant le premier dixième, sous peine d'exclusion de l'UE.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { getParam } from './parametres.js';

const r = Router();

const ECRITURE = ['admin', 'directeur', 'directeur_adjoint', 'editeur',
                  'secretariat', 'coordination'];

export function migrerStages(dbx) {
  try {
    dbx.exec(`
    -- Le lieu d'accueil. Son adresse figure au supplément au diplôme : elle
    -- doit donc être complète et stable, non ressaisie à chaque convention.
    CREATE TABLE IF NOT EXISTS stage_lieu (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      nom             TEXT NOT NULL,
      service         TEXT,                 -- service ou département d'accueil
      adresse         TEXT,
      cp              TEXT,
      localite        TEXT,
      pays            TEXT DEFAULT 'Belgique',
      secteur         TEXT,                 -- hôpital, cabinet, école, entreprise…
      num_entreprise  TEXT,
      site_web        TEXT,
      contact_nom     TEXT,
      contact_fonction TEXT,
      contact_tel     TEXT,
      contact_email   TEXT,
      agrement        TEXT,                 -- numéro ou référence d'agrément
      remarques       TEXT,
      actif           INTEGER NOT NULL DEFAULT 1,
      cree_par        TEXT,
      cree_le         TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stage_lieu_nom ON stage_lieu(nom);

    -- Le stage d'un étudiant : une période, un lieu, une UE.
    CREATE TABLE IF NOT EXISTS stage (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id       INTEGER NOT NULL,
      annee_scolaire    TEXT NOT NULL,
      ue_num            INTEGER,
      section           TEXT,
      lieu_id           INTEGER REFERENCES stage_lieu(id),
      -- Encadrement
      maitre_stage      TEXT,               -- le tuteur désigné par l'entreprise
      maitre_fonction   TEXT,
      maitre_email      TEXT,
      maitre_tel        TEXT,
      professeur_id     INTEGER,            -- le professeur de stage, côté IIP
      -- Période
      date_debut        TEXT,
      date_fin          TEXT,
      heures_prevues    REAL,
      heures_effectuees REAL,
      fractionne        INTEGER NOT NULL DEFAULT 0,
      -- Les deux jalons de l'article 51 : sans eux, rien ne commence
      autorisation_le   TEXT,
      convention_le     TEXT,
      convention_ref    TEXT,
      -- Pièces exigées par l'article 55
      casier_le         TEXT,               -- extrait modèle 2, moins de six mois
      medecine_le       TEXT,
      vaccination_ok    INTEGER,
      -- Suivi
      statut            TEXT NOT NULL DEFAULT 'prevu',
        -- prevu | autorise | en_cours | termine | rompu | annule
      evaluation_tuteur TEXT,
      note_tuteur       REAL,
      remarques         TEXT,
      cree_par          TEXT,
      maj_le            TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stage_etudiant ON stage(etudiant_id, annee_scolaire);
    CREATE INDEX IF NOT EXISTS idx_stage_lieu ON stage(lieu_id);
    `);
    // LE RÉPERTOIRE D'UNE SECTION (Charles, 3 octobre 2026 : « pour les
    // stages de psychomotricité, je veux qu'on puisse sélectionner… j'aurai
    // le même pour les autres »). Un lieu appartient au répertoire d'une
    // section, pour certaines UE ; « demande » dit comment on y sollicite un
    // stage (téléphone, courriel, formulaire).
    for (const col of ['section TEXT', 'ues TEXT', 'demande TEXT']) {
      try { dbx.exec(`ALTER TABLE stage_lieu ADD COLUMN ${col}`); } catch { /* déjà là */ }
    }
    // L'INTITULÉ ET LE DOMAINE D'UN STAGE (8 octobre 2026, relevé des stages de TIM
    // pour le supplément au diplôme) : « 3e année – Stage 5 », « Angiographie /
    // Échographie » — le même hôpital accueille des stages de domaines différents.
    for (const col of ['intitule TEXT', 'domaine TEXT']) {
      try { dbx.exec(`ALTER TABLE stage ADD COLUMN ${col}`); } catch { /* déjà là */ }
    }
    console.log('[migration] stages : lieux et périodes');
  } catch (e) { console.error('[migration] stages :', e.message); }
}

const perimetre = req => getUserSections(req.user);

// ── Lieux de stage ──────────────────────────────────────────────────────────
r.get('/lieux', authRequired, (req, res) => {
  const q = (req.query.q || '').trim();
  const params = [];
  let sql = 'SELECT * FROM stage_lieu WHERE actif = 1';
  if (q) {
    sql += ' AND (nom LIKE ? OR localite LIKE ? OR secteur LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  // Les lieux du répertoire de la section, et de l'UE, d'abord.
  const sec = String(req.query.section || '').trim(), ue = String(req.query.ue || '').trim();
  sql += ` ORDER BY (section = ?) DESC, (',' || COALESCE(ues,'') || ',' LIKE ?) DESC, nom`;
  params.push(sec, `%,${ue},%`);
  const lieux = db.prepare(sql).all(...params);

  // Combien d'étudiants y sont passés : un lieu très fréquenté se distingue
  // d'un lieu ponctuel, et cela guide le choix.
  for (const l of lieux) {
    l.nb_stages = db.prepare('SELECT COUNT(*) n FROM stage WHERE lieu_id = ?').get(l.id).n;
  }
  res.json(lieux);
});

/* IMPORTER UN RÉPERTOIRE DE LIEUX — simulation d'abord (rien ne s'écrit sans
 * qu'on ait vu ce qui sera écrit). L'écran lit le classeur et envoie ses
 * lignes ; un lieu déjà connu dans la section (même nom) est complété, pas
 * doublé. L'adresse « rue n°, 1050 Ixelles » se range en adresse, CP, localité. */
function decouperAdresse(brut) {
  const t = String(brut || '').replace(/\s+/g, ' ').trim();
  const m = /^(.*?)[,\s-]+(\d{4})\s+([^,]+?)\s*$/.exec(t);
  if (m) return { adresse: m[1].replace(/,\s*$/, '').trim(), cp: m[2], localite: m[3].trim() };
  // « Rue du Foyer Schaerbeekois 36, 1030 » : le code postal seul, en fin d'adresse.
  const c = /^(.*?),\s*(\d{4})\s*$/.exec(t);
  if (c) return { adresse: c[1].trim(), cp: c[2], localite: null };
  return { adresse: t || null, cp: null, localite: null };
}
r.post('/lieux/import', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const { section, ues, lignes, simulation = true } = req.body || {};
  if (!section) return res.status(400).json({ error: 'Choisissez la section du répertoire.' });
  const perim = perimetre(req);
  if (perim && !perim.includes(section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  if (!Array.isArray(lignes) || !lignes.length) return res.status(400).json({ error: 'Aucune ligne à importer.' });
  const uesTxt = (Array.isArray(ues) ? ues : String(ues || '').split(/[,;\s]+/)).map(x => String(x).trim()).filter(Boolean).join(',') || null;
  // Même nom ET même service dans la section : un lieu à deux services en fait deux.
  const existe = db.prepare("SELECT id, ues FROM stage_lieu WHERE lower(trim(nom)) = lower(trim(?)) AND COALESCE(section, '') = ? AND lower(COALESCE(service, '')) = lower(?)");
  const rapport = { crees: [], completes: [], ignores: [] };
  const ecrire = db.transaction(() => {
    for (const l of lignes) {
      const nom = String(l.nom || '').trim();
      if (!nom) { rapport.ignores.push({ ...l, motif: "pas de nom d'organisme" }); continue; }
      if (/^nom de l/i.test(nom)) { rapport.ignores.push({ nom, motif: "ligne d'en-tête répétée" }); continue; }
      const a = decouperAdresse(l.adresse);
      const service = String(l.service || '').trim() || null;
      const fiche = { nom, service, secteur: String(l.type || '').trim() || null, contact_nom: String(l.responsable || '').trim() || null,
        demande: String(l.demande || '').trim() || null, ...a };
      const deja = existe.get(nom, section, service || '');
      if (deja) {
        rapport.completes.push({ nom, ...a });
        if (!simulation) {
          const toutes = [...new Set([...(deja.ues || '').split(','), ...(uesTxt || '').split(',')].filter(Boolean))].join(',') || null;
          db.prepare(`UPDATE stage_lieu SET secteur = COALESCE(?, secteur), contact_nom = COALESCE(?, contact_nom),
            demande = COALESCE(?, demande), adresse = COALESCE(?, adresse), cp = COALESCE(?, cp),
            localite = COALESCE(?, localite), ues = ?, actif = 1 WHERE id = ?`)
            .run(fiche.secteur, fiche.contact_nom, fiche.demande, fiche.adresse, fiche.cp, fiche.localite, toutes, deja.id);
        }
      } else {
        rapport.crees.push({ nom: service ? `${nom} — ${service}` : nom, ...a, secteur: fiche.secteur });
        if (!simulation) {
          db.prepare(`INSERT INTO stage_lieu (nom, service, secteur, contact_nom, demande, adresse, cp, localite, section, ues, cree_par)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(fiche.nom, fiche.service, fiche.secteur, fiche.contact_nom, fiche.demande,
            fiche.adresse, fiche.cp, fiche.localite, section, uesTxt, req.user?.email || null);
        }
      }
    }
  });
  ecrire();
  res.json({ simulation: !!simulation, section, ues: uesTxt, ...rapport });
});

r.post('/lieux', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const l = req.body || {};
  if (!l.nom) return res.status(400).json({ error: 'nom requis' });
  const champs = ['nom', 'service', 'adresse', 'cp', 'localite', 'pays', 'secteur',
                  'num_entreprise', 'site_web', 'contact_nom', 'contact_fonction',
                  'contact_tel', 'contact_email', 'agrement', 'remarques'];
  const info = db.prepare(`
    INSERT INTO stage_lieu (${champs.join(',')}, cree_par)
    VALUES (${champs.map(() => '?').join(',')}, ?)
  `).run(...champs.map(k => l[k] ?? null), req.user?.email || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/lieux/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const l = req.body || {};
  const champs = ['nom', 'service', 'adresse', 'cp', 'localite', 'pays', 'secteur',
                  'num_entreprise', 'site_web', 'contact_nom', 'contact_fonction',
                  'contact_tel', 'contact_email', 'agrement', 'remarques', 'actif'];
  const presents = champs.filter(k => k in l);
  if (!presents.length) return res.json({ ok: true, inchange: true });
  db.prepare(`UPDATE stage_lieu SET ${presents.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...presents.map(k => l[k] ?? null), Number(req.params.id));
  res.json({ ok: true });
});

r.delete('/lieux/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM stage WHERE lieu_id = ?').get(Number(req.params.id)).n;
  if (n) {
    // Un lieu qui a accueilli des étudiants figure dans leurs suppléments au
    // diplôme : l'effacer romprait la référence. On le désactive.
    db.prepare('UPDATE stage_lieu SET actif = 0 WHERE id = ?').run(Number(req.params.id));
    return res.json({
      ok: true, desactive: true,
      message: `Ce lieu a accueilli ${n} stage(s) : il est retiré de la liste sans être `
             + `supprimé, pour que les dossiers déjà constitués restent lisibles.`,
    });
  }
  db.prepare('DELETE FROM stage_lieu WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true, supprime: true });
});

/* IMPORTER UN RELEVÉ DE STAGES EFFECTUÉS (Charles, 8 octobre 2026 : « je dois intégrer
 * ceci pour compléter les suppléments au diplôme »). Le relevé d'une section — une
 * ligne par stage : année et numéro, étudiant, domaine, établissement, adresse,
 * période, heures, maître de stage et ses coordonnées — devient les stages des
 * dossiers. Simulation d'abord ; tout ou rien.
 *   · L'étudiant se retrouve par son NOM et son PRÉNOM (le relevé ne porte pas de
 *     matricule), ceux de la section d'abord ; un homonyme ou un inconnu est nommé,
 *     jamais deviné.
 *   · Le lieu se retrouve par son nom dans la section ; sinon il se crée, adresse
 *     découpée (rue, CP, localité) — elle figure au supplément.
 *   · L'année scolaire se déduit du début du stage (septembre ouvre l'année).
 *   · Un stage déjà là — même étudiant, même lieu, même premier jour — n'est pas
 *     doublé : réimporter le relevé complété ne fait que l'ajouter. */
const sansAccents = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sacDe = (...p) => sansAccents(p.join(' ')).replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
function versIso(v) {
  const t = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (m) { const a = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
const anneeDe = iso => { const y = Number(iso.slice(0, 4)), mo = Number(iso.slice(5, 7)); return mo >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
r.post('/import-releve', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const { section, lignes, simulation = true } = req.body || {};
  if (!section) return res.status(400).json({ error: 'Choisissez la section du relevé.' });
  const perim = perimetre(req);
  if (perim && !perim.includes(section)) return res.status(403).json({ error: 'Section hors de votre périmètre.' });
  if (!Array.isArray(lignes) || !lignes.length) return res.status(400).json({ error: 'Aucune ligne à importer.' });

  // Les étudiants : ceux de la section d'abord (rattachement ou inscription), puis tous.
  const tous = db.prepare('SELECT id, nom, prenom, section_rattachement FROM etudiant').all();
  const deLaSection = new Set(db.prepare(`SELECT DISTINCT i.etudiant_id id FROM etudiant_inscription i
      WHERE i.ue_num IN (SELECT ue_num FROM ue WHERE section = ?)`).all(section).map(x => x.id));
  for (const e of tous) if (e.section_rattachement === section) deLaSection.add(e.id);
  const parSac = new Map(), parNom = new Map();
  const cleNom = t => sansAccents(t).replace(/[^a-z]+/g, ' ').trim();
  const motsPrenom = t => sansAccents(t).replace(/[^a-z]+/g, ' ').trim().split(' ').filter(w => w.length >= 2);
  for (const e of tous) {
    const k = sacDe(e.nom, e.prenom); (parSac.get(k) || parSac.set(k, []).get(k)).push(e);
    const n = cleNom(e.nom); (parNom.get(n) || parNom.set(n, []).get(n)).push(e);
  }
  // Une lettre d'écart au plus (ajoutée, ôtée ou changée) : « Emanuel » / « Emmanuel ».
  const procheDe = (a, b) => {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, ecarts = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++ecarts > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return ecarts + (a.length - i) + (b.length - j) <= 1;
  };
  const unSeul = c => { const sec = c.filter(e => deLaSection.has(e.id)); const l = sec.length ? sec : c; return l.length === 1 ? l[0] : (l.length ? 'homonymes' : null); };
  /* LE PRÉNOM D'eCAMPUS PORTE DES INITIALES (« Midrelle S », « Axelle C, H. ») que le
   * relevé n'a pas (Charles, 8 octobre 2026 : « il ne trouve pas les étudiants »).
   * Le nom identique, puis le premier prénom du relevé parmi ceux de Lucie ; à
   * défaut, l'unique étudiant de ce nom dans la section dont le prénom commence
   * pareil (« Emanuel » / « Emmanuel »). */
  const trouver = (nom, prenom) => {
    const exact = unSeul(parSac.get(sacDe(nom, prenom)) || []);
    if (exact && exact !== 'homonymes') return { e: exact };
    const memeNom = parNom.get(cleNom(nom)) || [];
    const p1 = motsPrenom(prenom)[0] || '';
    const parPrenom = unSeul(memeNom.filter(e => p1 && motsPrenom(e.prenom).includes(p1)));
    if (parPrenom && parPrenom !== 'homonymes') return { e: parPrenom };
    const sec = memeNom.filter(e => deLaSection.has(e.id));
    if (sec.length === 1 && p1.length >= 3 && procheDe(motsPrenom(sec[0].prenom)[0] || '', p1)) return { e: sec[0] };
    return { e: null, motif: exact === 'homonymes' || parPrenom === 'homonymes' ? 'homonymes' : 'introuvable' };
  };
  const lieuExiste = db.prepare("SELECT id FROM stage_lieu WHERE lower(trim(nom)) = lower(trim(?)) AND COALESCE(section, '') = ? ORDER BY (service IS NULL) DESC LIMIT 1");
  const stageExiste = db.prepare('SELECT id FROM stage WHERE etudiant_id = ? AND lieu_id = ? AND date_debut = ?');
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const rapport = { a_creer: 0, deja: 0, lieux_crees: [], inconnus: [], illisibles: [], par_annee: {} };
  const lieuxNeufs = new Map();
  const ecrire = db.transaction(() => {
    for (const l of lignes) {
      const nom = String(l.nom || '').trim(), prenom = String(l.prenom || '').trim();
      const etab = String(l.etablissement || '').trim();
      if (!nom || !etab) continue;
      const debut = versIso(l.debut), fin = versIso(l.fin);
      if (!debut) { rapport.illisibles.push(`${nom} ${prenom} — date de début « ${l.debut} »`); continue; }
      const t = trouver(nom, prenom);
      if (!t.e) { rapport.inconnus.push({ nom: `${nom.toUpperCase()} ${prenom}`, motif: t.motif }); continue; }
      let lieuId = lieuExiste.get(etab, section)?.id || lieuxNeufs.get(sansAccents(etab)) || null;
      if (!lieuId) {
        const a = decouperAdresse(l.adresse);
        rapport.lieux_crees.push({ nom: etab, ...a });
        if (!simulation) {
          lieuId = Number(db.prepare(`INSERT INTO stage_lieu (nom, adresse, cp, localite, section, cree_par) VALUES (?,?,?,?,?,?)`)
            .run(etab, a.adresse, a.cp, a.localite, section, req.user?.email || null).lastInsertRowid);
        } else lieuId = -(rapport.lieux_crees.length);
        lieuxNeufs.set(sansAccents(etab), lieuId);
      }
      if (lieuId > 0 && stageExiste.get(t.e.id, lieuId, debut)) { rapport.deja++; continue; }
      const annee = anneeDe(debut);
      rapport.a_creer++; rapport.par_annee[annee] = (rapport.par_annee[annee] || 0) + 1;
      if (simulation) continue;
      const contact = String(l.maitre_contact || '').trim();
      const heures = Number(String(l.heures || '').replace(',', '.')) || null;
      const termine = fin && fin < aujourdhui;
      db.prepare(`INSERT INTO stage (etudiant_id, annee_scolaire, section, lieu_id, maitre_stage, maitre_email, maitre_tel,
          date_debut, date_fin, heures_prevues, heures_effectuees, statut, intitule, domaine, cree_par)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(t.e.id, annee, section, lieuId, String(l.maitre || '').trim() || null,
        /@/.test(contact) ? contact : null, contact && !/@/.test(contact) ? contact : null, debut, fin, heures,
        termine ? heures : null, termine ? 'termine' : 'prevu', String(l.intitule || '').trim() || null,
        String(l.domaine || '').trim() || null, `import relevé (${req.user?.email || '?'})`);
    }
  });
  ecrire();
  res.json({ simulation: !!simulation, section, ...rapport });
});

// ── Stages d'un étudiant ────────────────────────────────────────────────────
r.get('/etudiant/:id', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const stages = db.prepare(`
    SELECT s.*, l.nom AS lieu_nom, l.adresse, l.cp, l.localite, l.pays, l.secteur,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = s.ue_num
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT nom || ' ' || COALESCE(prenom,'') FROM professeur p WHERE p.id = s.professeur_id) AS professeur
    FROM stage s
    LEFT JOIN stage_lieu l ON l.id = s.lieu_id
    WHERE s.etudiant_id = ?
    ORDER BY s.annee_scolaire DESC, s.date_debut
  `).all(etudId);

  // Ce qui manque avant que le stage puisse commencer (art. 51 et 55) — sans objet
  // pour un stage terminé, rompu ou annulé (les stages repris d'un relevé, entre autres).
  for (const s of stages) {
    s.blocages = [];
    if (['termine', 'rompu', 'annule'].includes(s.statut)) { s.pret = true; continue; }
    if (!s.autorisation_le) s.blocages.push("autorisation écrite du professeur de stage");
    if (!s.convention_le) s.blocages.push("convention signée");
    if (s.casier_le) {
      const six = new Date(s.casier_le + 'T00:00:00Z');
      six.setUTCMonth(six.getUTCMonth() + 6);
      if (s.date_debut && new Date(s.date_debut + 'T00:00:00Z') > six) {
        s.blocages.push("extrait de casier judiciaire de plus de six mois au début du stage");
      }
    }
    s.pret = s.blocages.length === 0;
  }

  /* LE MINIMUM D'HEURES DE STAGE DE LA SECTION (Charles, 8 octobre 2026 : « la somme
     totale pour vérifier qu'on a respecté le minimum de 600 h en TIM — différent
     ailleurs ») : un réglage par section (`stages_heures_min`), TIM 600 par défaut. */
  const sec = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(etudId)?.s
    || stages.find(x => x.section)?.section || null;
  res.json({ stages, section: sec, minimum: sec ? (minimaStages()[sec] ?? null) : null });
});

function minimaStages() {
  try { return { TIM: 600, ...JSON.parse(getParam('stages_heures_min', '{}') || '{}') }; } catch { return { TIM: 600 }; }
}
// Le régler : la direction, section par section (0 ou vide = pas de minimum).
r.put('/minimum', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
  const section = String(req.body?.section || '').trim();
  if (!section) return res.status(400).json({ error: 'section requise' });
  const m = minimaStages();
  const h = Number(req.body?.heures);
  if (Number.isFinite(h) && h > 0) m[section] = h; else m[section] = null;
  db.prepare(`INSERT INTO parametre (cle, valeur) VALUES ('stages_heures_min', ?)
    ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).run(JSON.stringify(m));
  res.json({ ok: true, section, heures: m[section] });
});

r.post('/', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const s = req.body || {};
  if (!s.etudiant_id || !s.annee_scolaire) {
    return res.status(400).json({ error: 'etudiant_id et annee_scolaire requis' });
  }
  const perim = perimetre(req);
  if (perim && s.section && !perim.includes(s.section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }
  const champs = ['etudiant_id', 'annee_scolaire', 'ue_num', 'section', 'lieu_id',
                  'maitre_stage', 'maitre_fonction', 'maitre_email', 'maitre_tel',
                  'professeur_id', 'date_debut', 'date_fin', 'heures_prevues',
                  'statut', 'remarques'];
  const info = db.prepare(`
    INSERT INTO stage (${champs.join(',')}, cree_par)
    VALUES (${champs.map(() => '?').join(',')}, ?)
  `).run(...champs.map(k => s[k] ?? null), req.user?.email || null);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

r.put('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const s = req.body || {};
  const champs = ['ue_num', 'section', 'lieu_id', 'maitre_stage', 'maitre_fonction',
                  'maitre_email', 'maitre_tel', 'professeur_id', 'date_debut', 'date_fin',
                  'heures_prevues', 'heures_effectuees', 'fractionne', 'autorisation_le',
                  'convention_le', 'convention_ref', 'casier_le', 'medecine_le',
                  'vaccination_ok', 'statut', 'evaluation_tuteur', 'note_tuteur', 'remarques', 'intitule', 'domaine'];
  const presents = champs.filter(k => k in s);
  if (!presents.length) return res.json({ ok: true, inchange: true });

  db.prepare(`
    UPDATE stage SET ${presents.map(k => `${k} = ?`).join(', ')}, maj_le = datetime('now')
    WHERE id = ?
  `).run(...presents.map(k => s[k] ?? null), Number(req.params.id));

  // Rappel plutôt qu'interdiction : c'est le professeur de stage qui juge.
  const apres = db.prepare('SELECT * FROM stage WHERE id = ?').get(Number(req.params.id));
  let rappel = null;
  if (['en_cours', 'termine'].includes(apres.statut)
      && (!apres.autorisation_le || !apres.convention_le)) {
    rappel = "Aucun stage ne peut débuter sans autorisation écrite du professeur de stage "
           + "ni convention signée (art. 51). Le non-respect entraîne l'annulation du stage.";
  }
  res.json({ ok: true, rappel });
});

r.delete('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  db.prepare('DELETE FROM stage WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Vue d'ensemble, pour la coordination de stage ───────────────────────────
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee;
  const section = req.query.section;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const perim = perimetre(req);
  if (section && perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }

  const clauses = ['s.annee_scolaire = ?'];
  const params = [annee];
  if (section) { clauses.push('s.section = ?'); params.push(section); }
  else if (perim) {
    clauses.push(`s.section IN (${perim.map(() => '?').join(',') || "''"})`);
    params.push(...perim);
  }

  const stages = db.prepare(`
    SELECT s.*, e.nom AS etud_nom, e.prenom AS etud_prenom, e.id_ecampus,
           l.nom AS lieu_nom, l.localite, l.secteur,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = s.ue_num
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM stage s
    JOIN etudiant e ON e.id = s.etudiant_id
    LEFT JOIN stage_lieu l ON l.id = s.lieu_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY s.section, e.nom, s.date_debut
  `).all(...params);

  const manquants = stages.filter(s => !s.autorisation_le || !s.convention_le).length;
  res.json({
    annee, stages,
    synthese: {
      total: stages.length,
      sans_lieu: stages.filter(s => !s.lieu_id).length,
      sans_convention: manquants,
      en_cours: stages.filter(s => s.statut === 'en_cours').length,
      termines: stages.filter(s => s.statut === 'termine').length,
    },
  });
});

export default r;

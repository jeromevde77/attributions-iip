// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Description d'unité d'enseignement (DUE)
//
// La DUE était un document Word recopié d'année en année. Le volume horaire y
// divergeait du référentiel, les acquis d'apprentissage n'étaient plus ceux du
// dossier pédagogique, et personne ne savait quelle version faisait foi.
//
// Ici, la DUE se scinde en deux :
//
//   — ce que Lucie SAIT déjà : numéro et nom de l'unité, section, ECTS,
//     périodes, quadrimestre, prérequis, niveau, la liste des cours et celle
//     des acquis avec leur libellé, les titulaires tirés des attributions.
//     Ces champs ne se stockent jamais : ils sont relus à chaque ouverture, de
//     sorte qu'une correction du référentiel se propage d'elle-même ;
//
//   — ce que l'enseignant RÉDIGE : finalités particulières, programme,
//     méthodes, supports, modalités d'évaluation, critères, degré de maîtrise.
//     Cela seul est conservé, dans `contenu`.
//
// Qui écrit : les titulaires d'un cours de l'unité, tant que la DUE est en
// préparation. La direction valide ; la DUE passe alors en lecture seule et
// devient la version officielle. Elle peut la rouvrir.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopper } from './attestations.js';
import { identiteEtablissement } from './config.js';

const r = Router();

const NIVEAU_DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

export function migrerDUE(dbx) {
  try {
    dbx.exec(`
      CREATE TABLE IF NOT EXISTS due (
        ue_num         INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        contenu        TEXT    NOT NULL DEFAULT '{}',
        statut         TEXT    NOT NULL DEFAULT 'preparation',
        maj_le         TEXT,
        maj_par        TEXT,
        valide_le      TEXT,
        valide_par     TEXT,
        PRIMARY KEY (ue_num, annee_scolaire)
      );
    `);
    console.log('[migration] due créée');
  } catch (e) { console.error('[migration] due :', e.message); }
}

// ── Qui peut quoi ────────────────────────────────────────────────────────────

// Un professeur accède à la DUE des unités où il a une attribution. La
// coordination et le secrétariat lisent tout ; seule la direction valide.
function droitsSurLUE(user, ueNum, annee) {
  const direction = NIVEAU_DIRECTION.includes(user?.role);
  if (direction) return { lire: true, ecrire: true, valider: true, titulaire: false };

  let titulaire = false;
  if (user?.role === 'professeur') {
    const u = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(user.id);
    if (u?.professeur_id) {
      titulaire = !!db.prepare(`
        SELECT 1 FROM attribution
        WHERE professeur_id = ? AND ue_num = ? AND annee_scolaire = ? LIMIT 1
      `).get(u.professeur_id, ueNum, annee);
    }
    return { lire: titulaire, ecrire: titulaire, valider: false, titulaire };
  }

  // Secrétariat, coordination, consultation : lecture seule.
  return { lire: true, ecrire: false, valider: false, titulaire: false };
}

// ── La part automatique ──────────────────────────────────────────────────────

// Le référentiel exprime le volume en périodes ; la DUE l'annonce aussi en
// heures. Une période vaut 50 minutes : les heures s'en déduisent à 1,2 près,
// la même constante que partout ailleurs dans Lucie.
const enHeures = per => (per == null ? null : Math.round(Number(per) / 1.2));

/**
 * LE DOSSIER PÉDAGOGIQUE, DÉCOUPÉ.
 *
 * Le modèle Word disait, à trois endroits, « copier le contenu du DP » — et
 * c'est exactement ce que chacun faisait, à la main, en recopiant un texte
 * officiel qui figure déjà dans Lucie. L'import du dossier pédagogique dépose
 * ses sections dans `ue.ue_det`, sous des titres « ## ». On les redonne ici
 * telles quelles, à charge pour l'écran de les proposer d'un clic.
 *
 * Le degré de maîtrise n'est pas une section à lui seul : le dossier le loge à
 * la fin des acquis, après la phrase « Pour la détermination du degré de
 * maîtrise… ». On coupe donc là.
 */
function sectionsDuDP(ueDet) {
  if (!ueDet) return null;
  const parts = {};
  let titre = null, corps = [];
  const poser = () => { if (titre) parts[titre] = corps.join('\n').trim(); };
  for (const l of String(ueDet).split('\n')) {
    const m = l.match(/^##\s+(.*)$/);
    if (m) { poser(); titre = m[1].trim().toLowerCase(); corps = []; }
    else if (titre) corps.push(l);
  }
  poser();

  const acquisBrut = parts["acquis d'apprentissage"] || '';
  // Les dossiers en PDF isolent déjà le degré de maîtrise ; les anciens
  // imports .docx le laissaient à la queue des acquis, après « Pour la
  // détermination / Pour déterminer le degré de maîtrise ». On coupe alors là.
  const coupe = parts['degré de maîtrise'] ? -1
    : acquisBrut.search(/pour (la d[ée]termination du|d[ée]terminer le) degr[ée] de ma[îi]trise/i);
  const dp = {
    finalites: parts['finalités'] || null,
    capacites: parts['capacités préalables'] || null,
    acquis: (coupe > 0 ? acquisBrut.slice(0, coupe) : acquisBrut).trim() || null,
    degre_maitrise: parts['degré de maîtrise']
      || (coupe > 0 ? acquisBrut.slice(coupe).trim() : null),
    programme: parts['programme'] || null,
  };
  return Object.values(dp).some(Boolean) ? dp : null;
}

function partieAutomatique(ueNum, annee) {
  const ue = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, annee);
  if (!ue) return null;

  const cours = db.prepare(`
    SELECT cours_code, cours_nom, cours_per, heures, ct_pp, quadrimestre_cours
    FROM cours WHERE ue_num = ? AND annee_scolaire = ?
    ORDER BY cours_num, cours_code
  `).all(ueNum, annee);

  const acquis = db.prepare(
    'SELECT aa_code, aa_num, description FROM aa WHERE ue_num = ? ORDER BY aa_num, aa_code')
    .all(ueNum);

  // Le rattachement acquis ↔ cours vient de la pondération : c'est la somme
  // des acquis qui fait le cours, et cette table seule en tient le compte.
  const liens = db.prepare(
    'SELECT cours_code, aa_code, poids FROM aa_ponderation WHERE ue_num = ?').all(ueNum);
  const parCours = {};
  for (const l of liens) (parCours[l.cours_code] = parCours[l.cours_code] || []).push(l.aa_code);

  const periodes = ue.ue_per_etudiants ?? cours.reduce((n, c) => n + (c.cours_per || 0), 0);

  // LE RESPONSABLE DE L'UNITÉ.
  //
  // Le champ était libre : chacun y écrivait ce qu'il voulait, et rien ne
  // garantissait que la personne citée enseignât seulement dans l'unité. Il se
  // choisit désormais parmi les titulaires, et Lucie propose d'office celui
  // qui y porte le plus de périodes — c'est en général lui qui répond de
  // l'unité. La proposition n'est qu'un défaut : le choix reste ouvert.
  const enseignants = db.prepare(`
    SELECT p.id, p.nom, p.prenom,
           SUM(COALESCE(a.periodes_attribuees, 0)) AS periodes,
           COUNT(DISTINCT a.code_cours)            AS nb_cours,
           GROUP_CONCAT(DISTINCT a.code_cours)     AS cours
    FROM attribution a JOIN professeur p ON p.id = a.professeur_id
    WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.professeur_id IS NOT NULL
    GROUP BY p.id, p.nom, p.prenom
    ORDER BY periodes DESC, nb_cours DESC, p.nom
  `).all(ueNum, annee);

  return {
    responsable_propose: enseignants[0]?.id ?? null,
    dp: sectionsDuDP(ue.ue_det),
    ue: {
      ue_num: ue.ue_num, ue_nom: ue.ue_nom, ue_code_fwb: ue.ue_code_fwb,
      section: ue.section, ects: ue.ects, niveau: ue.ue_niveau, niv: ue.ue_niv,
      quadrimestre: ue.ue_quad, prerequise: ue.ue_prerequise,
      et_ref: ue.et_ref, periodes, heures: enHeures(periodes),
    },
    cours: cours.map(c => ({
      ...c, heures: c.heures ?? enHeures(c.cours_per),
      acquis: parCours[c.cours_code] || [],
    })),
    acquis,
    enseignants,
    etablissement: identiteEtablissement(),
  };
}

function lireDUE(ueNum, annee) {
  const l = db.prepare('SELECT * FROM due WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, annee);
  let contenu = {};
  if (l?.contenu) { try { contenu = JSON.parse(l.contenu); } catch { /* illisible */ } }
  return {
    contenu,
    statut: l?.statut || 'preparation',
    maj_le: l?.maj_le || null, maj_par: l?.maj_par || null,
    valide_le: l?.valide_le || null, valide_par: l?.valide_par || null,
  };
}

// ── Les unités auxquelles j'ai accès ─────────────────────────────────────────

r.get('/', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const direction = NIVEAU_DIRECTION.includes(req.user.role);

  let ues;
  if (req.user.role === 'professeur') {
    const u = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(req.user.id);
    if (!u?.professeur_id) return res.json({ annee, ues: [] });
    ues = db.prepare(`
      SELECT DISTINCT u.ue_num, u.ue_nom, u.section, u.ects, u.ue_quad
      FROM ue u JOIN attribution a
        ON a.ue_num = u.ue_num AND a.annee_scolaire = u.annee_scolaire
      WHERE a.professeur_id = ? AND u.annee_scolaire = ?
      ORDER BY u.ue_num
    `).all(u.professeur_id, annee);
  } else {
    ues = db.prepare(`
      SELECT ue_num, ue_nom, section, ects, ue_quad FROM ue
      WHERE annee_scolaire = ? ORDER BY ue_num
    `).all(annee);
  }

  const etats = {};
  for (const d of db.prepare(
    'SELECT ue_num, statut, maj_le, valide_le FROM due WHERE annee_scolaire = ?').all(annee)) {
    etats[d.ue_num] = d;
  }

  res.json({
    annee, peut_valider: direction,
    ues: ues.map(u => ({
      ...u,
      statut: etats[u.ue_num]?.statut || 'preparation',
      maj_le: etats[u.ue_num]?.maj_le || null,
      valide_le: etats[u.ue_num]?.valide_le || null,
    })),
  });
});

// ── Une DUE ──────────────────────────────────────────────────────────────────

r.get('/:ueNum', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  const droits = droitsSurLUE(req.user, ueNum, annee);
  if (!droits.lire) {
    return res.status(403).json({ error: "Cette unité d'enseignement ne figure pas dans vos attributions." });
  }
  const auto = partieAutomatique(ueNum, annee);
  if (!auto) return res.status(404).json({ error: `L'unité ${ueNum} n'existe pas en ${annee}` });

  const d = lireDUE(ueNum, annee);
  res.json({
    annee, ...auto, ...d,
    droits: { ...droits, ecrire: droits.ecrire && d.statut !== 'validee' },
  });
});

r.put('/:ueNum', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  const droits = droitsSurLUE(req.user, ueNum, annee);
  if (!droits.ecrire) {
    return res.status(403).json({ error: "Vous n'êtes pas titulaire d'un cours de cette unité." });
  }
  const actuel = lireDUE(ueNum, annee);
  if (actuel.statut === 'validee' && !droits.valider) {
    return res.status(409).json({
      error: 'Cette DUE a été validée par la direction : elle est en lecture seule. '
           + 'Demandez sa réouverture pour la modifier.',
    });
  }

  const contenu = req.body?.contenu;
  if (!contenu || typeof contenu !== 'object') {
    return res.status(400).json({ error: 'contenu requis' });
  }

  db.prepare(`
    INSERT INTO due (ue_num, annee_scolaire, contenu, statut, maj_le, maj_par)
    VALUES (?,?,?,?,datetime('now'),?)
    ON CONFLICT(ue_num, annee_scolaire) DO UPDATE SET
      contenu = excluded.contenu, maj_le = excluded.maj_le, maj_par = excluded.maj_par
  `).run(ueNum, annee, JSON.stringify(contenu), actuel.statut, req.user.nom || req.user.email);

  res.json({ ok: true, ...lireDUE(ueNum, annee) });
});

// La validation fige. La réouverture la défait — les deux sont réservées à la
// direction, et l'une comme l'autre laissent la trace de qui a agi.
r.post('/:ueNum/valider', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  if (!droitsSurLUE(req.user, ueNum, annee).valider) {
    return res.status(403).json({ error: 'Seule la direction valide une DUE.' });
  }
  const rouvrir = !!req.body?.rouvrir;
  const qui = req.user.nom || req.user.email;

  db.prepare(`
    INSERT INTO due (ue_num, annee_scolaire, contenu, statut, valide_le, valide_par)
    VALUES (?,?,'{}',?,?,?)
    ON CONFLICT(ue_num, annee_scolaire) DO UPDATE SET
      statut = excluded.statut, valide_le = excluded.valide_le, valide_par = excluded.valide_par
  `).run(ueNum, annee, rouvrir ? 'preparation' : 'validee',
    rouvrir ? null : new Date().toISOString().slice(0, 10), rouvrir ? null : qui);

  res.json({ ok: true, ...lireDUE(ueNum, annee) });
});

// ── Le document ──────────────────────────────────────────────────────────────

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const METHODES = [
  ['ex_cathedra', 'Cours ex cathedra'], ['exercices', "Réalisation d'exercices"],
  ['etude_cas', 'Étude de cas'], ['problemes', 'Apprentissage par problèmes'],
  ['classe_inversee', 'Classe inversée'], ['groupe', 'Collaboration en groupe'],
  ['pairs', 'Apprentissage par les pairs'], ['situation', 'Mise en situation'],
  ['pratique', 'Pratique'], ['debats', 'Débats'], ['jeux_roles', 'Jeux de rôles'],
  ['simulation', 'Simulation'], ['hybridation', 'Hybridation'],
];
const EPREUVES = [['ecrit', 'Écrit'], ['oral', 'Oral'], ['pratique', 'Pratique'],
  ['travail', 'Travail'], ['continue', 'Évaluation continue']];

const NOTE_UE_DEFAUT =
  "Les notes de chaque activité d'apprentissage de l'UE s'additionnent en une moyenne "
  + "pondérée, mais uniquement si chaque activité et chaque acquis atteint 10/20. "
  + "Si une seule note est inférieure à 10/20, l'unité est considérée comme non acquise (NA) "
  + "et ne génère aucune moyenne, sauf décision de délibération du Conseil des études.";

function bloc(titre, corps) {
  return `<div class="bloc"><div class="bloc-t">${esc(titre)}</div>
    <div class="bloc-c">${corps}</div></div>`;
}
const para = t => String(t || '').split(/\n+/).filter(Boolean)
  .map(l => `<p>${esc(l)}</p>`).join('') || '<p class="vide">à compléter</p>';

export function documentDUE(ueNum, annee) {
  const auto = partieAutomatique(ueNum, annee);
  if (!auto) return null;
  const { contenu, statut, valide_le } = lireDUE(ueNum, annee);
  const u = auto.ue;
  const c = contenu || {};

  // Le responsable est enregistré par son identifiant : le document doit donc
  // le renommer. Un ancien texte libre est conservé tel quel.
  // Ce que l'enseignant n'a pas encore rédigé est repris du dossier
  // pédagogique : c'est le texte officiel, et une DUE qui l'affiche vaut
  // mieux qu'une DUE vide. Dès qu'il écrit, c'est son texte qui vaut.
  const dp = auto.dp || {};
  const rediges = {
    finalites:      c.finalites      || dp.finalites,
    programme:      c.programme      || dp.programme,
    degre_maitrise: c.degre_maitrise || dp.degre_maitrise,
    criteres:       c.criteres,
  };

  const idResp = c.responsable ?? auto.responsable_propose;
  const resp = auto.enseignants.find(e => String(e.id) === String(idResp));
  const nomResp = resp ? `${resp.prenom} ${resp.nom}`
    : (typeof c.responsable === 'string' && !/^\d+$/.test(c.responsable) ? c.responsable : null);

  const ident = [
    ['Cursus', c.cursus || auto.ue.section],
    ['Section', u.section],
    ["Bloc d'études", c.bloc ? `Bloc ${c.bloc}` : null],
    ['Situation dans la formation', u.quadrimestre],
    ['Unité prérequise', u.prerequise || 'Aucune'],
    ['Volume horaire / an', u.periodes ? `${u.periodes} périodes — soit ${u.heures} h` : null],
    ['Crédits ECTS', u.ects],
    ["Langue d'enseignement", c.langue_ens || 'Français'],
    ["Langue d'évaluation", c.langue_eval || 'Français'],
    ['Niveau du cadre européen des certifications', c.niveau_cec
      || (u.niveau === 'SUP' ? 'Niveau 6 (TC)' : null)],
    ["Responsable de l'unité", nomResp],
    ['Co-diplomation HELB', c.codiplomation ? 'Oui' : 'Non'],
  ].filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');

  const titulaires = auto.enseignants.length
    ? auto.enseignants.map(e =>
      `<li>${esc(e.prenom)} ${esc(e.nom)}${e.cours ? ` — ${esc(e.cours)}` : ''}</li>`).join('')
    : '<li class="vide">aucune attribution encodée pour cette unité</li>';

  const listeCours = auto.cours.length ? auto.cours.map(x => `
    <tr><td>${esc(x.cours_code)}</td><td>${esc(x.cours_nom)}</td>
        <td class="n">${x.cours_per ?? ''}</td><td class="n">${x.heures ?? ''}</td>
        <td>${esc((x.acquis || []).join(', '))}</td></tr>`).join('')
    : '<tr><td colspan="5" class="vide">aucun cours rattaché</td></tr>';

  const listeAA = auto.acquis.length ? auto.acquis.map(a => `
    <li><b>${esc(a.aa_code)}</b> — ${esc(a.description || 'libellé à encoder dans le référentiel')}</li>`).join('')
    : '<li class="vide">aucun acquis encodé pour cette unité</li>';

  const methodes = METHODES
    .filter(([k]) => c.methodes?.[k])
    .map(([, l]) => `<span class="puce">${esc(l)}</span>`).join(' ')
    + (c.methode_autre ? ` <span class="puce">${esc(c.methode_autre)}</span>` : '');

  const supports = auto.cours.map(x => {
    const s = c.supports?.[x.cours_code] || {};
    return `<tr><td>${esc(x.cours_nom)}</td><td>${esc(s.type || '')}</td>
      <td class="n">${s.obligatoire ? 'Obligatoire' : '—'}</td></tr>`;
  }).join('');

  const evaluation = ['s1', 's2'].map(sess => `
    <tr class="sess"><td colspan="${EPREUVES.length + 1}">
      ${sess === 's1' ? 'Première session' : 'Seconde session'}</td></tr>
    ${auto.cours.map(x => {
    const e = c.evaluation?.[x.cours_code]?.[sess] || {};
    return `<tr><td>${esc(x.cours_nom)}</td>${EPREUVES
      .map(([k]) => `<td class="n">${e[k] ? '✔' : ''}</td>`).join('')}</tr>`;
  }).join('')}`).join('');

  const corps = `
  <div class="attestation">
    <div class="entete">
      <div class="nom">${esc(auto.etablissement.nom)}</div>
      <div class="sous">Description d'unité d'enseignement</div>
    </div>

    <div class="titre-ue">UE ${u.ue_num} — ${esc(u.ue_nom)}
      <span class="millesime">${esc(annee)}</span></div>
    <div class="etat ${statut === 'validee' ? 'ok' : 'brouillon'}">
      ${statut === 'validee'
    ? `Validée par la direction le ${esc(valide_le || '')}`
    : 'En préparation — document non encore validé par la direction'}
    </div>

    <table class="doc ident">${ident}</table>

    ${bloc("Titulaires des activités d'apprentissage", `<ul class="serre">${titulaires}</ul>`)}

    ${bloc('Finalités générales', `<p>Conformément à l'article 7 du décret de la Communauté
      française du 16 avril 1991 organisant l'enseignement pour adultes, cette unité
      d'enseignement doit concourir à l'épanouissement individuel en promouvant une meilleure
      insertion professionnelle, sociale, culturelle et scolaire, et répondre aux besoins et
      demandes en formation émanant des entreprises, des administrations, de l'enseignement
      et, d'une manière générale, des milieux socio-économiques et culturels.</p>`)}

    ${bloc('Finalités particulières', para(rediges.finalites))}

    ${bloc("Acquis d'apprentissage", `<p>Pour atteindre le seuil de réussite, l'étudiant sera
      capable de :</p><ul class="serre">${listeAA}</ul>`)}

    ${bloc("Activités d'apprentissage de l'unité", `<table class="doc">
      <tr><th>Code</th><th>Intitulé</th><th class="n">Périodes</th><th class="n">Heures</th>
          <th>Acquis évalués</th></tr>${listeCours}</table>`)}

    ${bloc('Programme', para(rediges.programme))}

    ${bloc("Méthodes d'apprentissage", methodes || '<p class="vide">à compléter</p>')}

    ${bloc('Supports de cours', `<table class="doc">
      <tr><th>Activité</th><th>Type de support</th><th class="n">Statut</th></tr>${supports}</table>
      <p class="fin">L'existence d'un support de cours obligatoire ne dispense pas
      l'étudiant de la prise de notes.</p>`)}

    ${bloc("Modalités d'évaluation", `<table class="doc">
      <tr><th>Activité</th>${EPREUVES.map(([, l]) => `<th class="n">${esc(l)}</th>`).join('')}</tr>
      ${evaluation}</table>
      <p class="fin">${esc(c.note_ue || NOTE_UE_DEFAUT)}</p>`)}

    ${bloc("Critères d'évaluation", para(rediges.criteres))}

    ${bloc('Degré de maîtrise', para(rediges.degre_maitrise))}
  </div>`;

  return envelopper(corps, `DUE ${ueNum} — ${annee}`) + STYLE_DUE;
}

// Le gabarit commun porte l'en-tête, les filets dorés et le pied ; la DUE y
// ajoute ses propres blocs. La feuille est concaténée après coup pour que ces
// règles l'emportent sur celles de l'enveloppe.
const STYLE_DUE = `<style>
  .titre-ue { font-size: 13pt; font-weight: 700; color:#1B2B4B; margin: 4mm 0 1mm; }
  .titre-ue .millesime { font-weight: 400; color:#7a8699; font-size: 10pt; }
  .etat { display:inline-block; padding:1mm 3mm; border-radius:2mm; font-size:8pt;
          margin-bottom:3mm; }
  .etat.ok { background:#ecfdf5; border:0.3mm solid #6ee7b7; color:#065f46; }
  .etat.brouillon { background:#fff7ed; border:0.3mm solid #fdba74; color:#9a3412; }
  .bloc { margin: 3mm 0; break-inside: avoid; }
  .bloc-t { background:#1B2B4B; color:#fff; font-size:8.5pt; font-weight:700;
            text-transform:uppercase; letter-spacing:.04em; padding:1.2mm 3mm; }
  .bloc-c { border:0.25mm solid #d8dde6; border-top:0; padding:2.5mm 3mm; font-size:9pt; }
  .bloc-c p { margin: 0 0 1.5mm; }
  table.doc.ident th { width: 52mm; text-align:left; }
  .serre { margin:0; padding-left:5mm; }
  .serre li { margin-bottom:0.8mm; }
  .puce { display:inline-block; border:0.25mm solid #C9A227; border-radius:2mm;
          padding:0.5mm 2mm; margin:0.5mm 0.5mm 0 0; font-size:8pt; }
  .vide { color:#9aa3b2; font-style:italic; }
  .fin { font-size:8pt; color:#4b5563; margin-top:1.5mm; }
  tr.sess td { background:#f1f4f9; font-weight:700; font-size:8pt; }
</style>`;

r.get('/:ueNum/document', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  if (!droitsSurLUE(req.user, ueNum, annee).lire) {
    return res.status(403).json({ error: "Cette unité ne figure pas dans vos attributions." });
  }
  const html = documentDUE(ueNum, annee);
  if (!html) return res.status(404).json({ error: `L'unité ${ueNum} n'existe pas en ${annee}` });
  res.json({ html });
});

export default r;

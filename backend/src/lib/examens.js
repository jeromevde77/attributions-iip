// ─────────────────────────────────────────────────────────────────────────────
// LES PIÈCES D'EXAMEN (3.5.226, Charles, 8 novembre 2026 : « le secrétariat souhaite sortir des documents pour les examens : liste
// de présence avec la date de l'examen, le professeur, le surveillant, le nombre d'étudiants, etc. — pense à tout ce qu'il faut »).
//
// La règle est celle de la PROCÉDURE POUR L'ORGANISATION DES EXAMENS 2026-2027 publiée dans Documentation (et non l'ancien Word
// 006 de 2024-2025) : l'enveloppe contient le plan d'installation, les questionnaires, le registre de présences propre au cours
// et des modèles de PV d'incident ; la liste des aménagements raisonnables y est insérée par le secrétariat ; durée universelle
// de 2 h (conçu pour 1 h 30, tiers-temps inclus) ; présences A / P dès le lancement ; registre de dépôt signé à la remise ;
// retardataire refusé après 15 minutes, sortie pas avant 30 ; copies archivées après la visite des copies.
//
// Une épreuve = une ligne du calendrier des sessions (`epreuve_session1` / `deliberation_session2`) ; ce que le calendrier ne
// porte pas (surveillants, durée, écrit ou oral, matériel, consignes, copies de réserve) vit dans `epreuve_detail`. Les étudiants :
// inscrits de l'unité en 1re session, ajournés qui représentent CE cours en 2e (`aRepresenterParCours`, la règle de la liste
// des ajournés). Les aménagements : les MESURES accordées seulement (secret professionnel), la règle de Mes cours.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { aRepresenterParCours } from '../routes/acquis.js';
import { sansDispenses } from './cep.js';
import { qrSvg } from './authentique.js';

export function migrerExamens(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS epreuve_detail (
    annee_scolaire TEXT NOT NULL,
    session        INTEGER NOT NULL,
    ue_num         INTEGER NOT NULL,
    cours_code     TEXT NOT NULL DEFAULT '',
    type           TEXT NOT NULL DEFAULT 'ecrit',     -- ecrit | oral
    duree_min      INTEGER NOT NULL DEFAULT 120,      -- 2 h pour tous (procédure 2026-2027, enseignement universel)
    surveillants   TEXT,                              -- noms, séparés par des virgules
    materiel       TEXT,
    consignes      TEXT,
    copies_reserve INTEGER NOT NULL DEFAULT 3,
    questionnaire_recu_le TEXT,                       -- le secrétariat a reçu le questionnaire (procédure : un mois avant)
    maj_par        TEXT,
    maj_le         TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (annee_scolaire, session, ue_num, cours_code)
  )`);
  /* LA GRILLE DE L'EXAMEN (3.5.240, Charles : « créer la grille complète de l'examen : autant de lignes que de questions, attribuées
     à un AA, avec somme automatique »). Une ligne par question : numéro, intitulé, acquis, points. Gardée par épreuve, pour la
     reprendre et la retoucher ; la page de garde la lit. */
  dbx.exec(`CREATE TABLE IF NOT EXISTS examen_grille (
    annee_scolaire TEXT NOT NULL, session INTEGER NOT NULL, ue_num INTEGER NOT NULL, cours_code TEXT NOT NULL DEFAULT '',
    questions TEXT NOT NULL DEFAULT '[]', maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (annee_scolaire, session, ue_num, cours_code))`);
}
try { migrerExamens(); try { db.exec('ALTER TABLE epreuve_detail ADD COLUMN questionnaire_recu_le TEXT'); } catch { /* déjà là */ } } catch (e) { console.error('[migration] epreuve_detail :', e.message); }

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nomP = x => `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim();
const essai = (f, d) => { try { return f(); } catch { return d; } };
export const cle = e => `${e.session}|${e.ue_num}|${e.cours_code || ''}`;
const plusMinutes = (h, m) => {
  const [a, b] = String(h || '').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(a)) return '';
  const t = a * 60 + (b || 0) + m;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const jourLong = v => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const court = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

/** Les épreuves datées d'une session, avec leurs détails, leurs étudiants et leurs aménagements. `sections` : le périmètre (null = tout). */
export function epreuves({ annee, session = 1, section = null, du = null, au = null, sections = null, cles = null }) {
  const s2 = Number(session) === 2;
  const t = s2 ? 'deliberation_session2' : 'epreuve_session1', k = s2 ? 's2' : 's1';
  let l = essai(() => db.prepare(`SELECT e.ue_num, COALESCE(e.cours_code, '') AS cours_code, e.${k}_date AS date, e.${k}_heure AS heure,
      e.${k}_local AS local, e.${k}_adresse AS adresse,
      e.${k}_visite_date AS visite_date, e.${k}_visite_heure AS visite_heure, e.${k}_visite_local AS visite_local,
      (SELECT u.ue_nom FROM ue u WHERE u.ue_num = e.ue_num AND u.annee_scolaire = e.annee_scolaire LIMIT 1) AS ue_nom,
      (SELECT u.section FROM ue u WHERE u.ue_num = e.ue_num AND u.annee_scolaire = e.annee_scolaire LIMIT 1) AS section,
      (SELECT u.ue_niv FROM ue u WHERE u.ue_num = e.ue_num AND u.annee_scolaire = e.annee_scolaire LIMIT 1) AS niveau,
      (SELECT c.cours_nom FROM cours c WHERE c.cours_code = e.cours_code AND c.annee_scolaire = e.annee_scolaire LIMIT 1) AS cours_nom
    FROM ${t} e WHERE e.annee_scolaire = ? AND e.${k}_date IS NOT NULL AND e.${k}_date <> ''
    ORDER BY e.${k}_date, e.${k}_heure, e.ue_num, e.cours_code`).all(annee), []);
  /* UNE ÉPREUVE D'UNE UE QUI N'EXISTE PAS CETTE ANNÉE NE SORT PAS (3.5.298, Charles : « cette 901 n'existe pas ») : le calendrier
     garde des lignes d'unités retirées du référentiel de l'année ; aucun écran ne les montre, la liste des examens non plus. */
  l = l.filter(e => e.ue_nom != null || e.section != null);
  l = l.map(e => ({ ...e, session: s2 ? 2 : 1 }));
  if (section) l = l.filter(e => e.section === section);
  if (Array.isArray(sections)) l = l.filter(e => !e.section || sections.includes(e.section));
  if (du) l = l.filter(e => String(e.date).slice(0, 10) >= du);
  if (au) l = l.filter(e => String(e.date).slice(0, 10) <= au);
  if (Array.isArray(cles)) { const g = new Set(cles); l = l.filter(e => g.has(cle(e))); }

  const det = db.prepare('SELECT * FROM epreuve_detail WHERE annee_scolaire = ? AND session = ? AND ue_num = ? AND cours_code = ?');
  const profs = db.prepare(`SELECT DISTINCT pr.nom, pr.prenom FROM attribution a JOIN professeur pr ON pr.id = a.professeur_id
    WHERE a.annee_scolaire = ? AND a.ue_num = ? AND (? = '' OR a.code_cours = ?) ORDER BY pr.nom`);
  const inscrits = db.prepare(`SELECT e.id, e.nom, e.prenom, e.id_ecampus FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? AND COALESCE(i.statut, '') NOT IN ('abandon', 'desinscrit')
    ORDER BY e.nom COLLATE NOCASE, e.prenom COLLATE NOCASE`);
  const ajournes = {};
  const amenagements = mesuresParEtudiant(annee);
  return l.map(e => {
    let etudiants;
    if (s2) {
      if (!ajournes[e.ue_num]) ajournes[e.ue_num] = essai(() => aRepresenterParCours(e.ue_num, annee, 1) || {}, {});
      const par = ajournes[e.ue_num];
      etudiants = e.cours_code ? (par[e.cours_code] || []) : [...new Map(Object.values(par).flat().map(x => [x.id, x])).values()];
    } else etudiants = essai(() => inscrits.all(annee, e.ue_num), []);
    etudiants = essai(() => sansDispenses(etudiants, annee, e.ue_num, e.cours_code), etudiants);
    const d = essai(() => det.get(annee, e.session, e.ue_num, e.cours_code), null) || {};
    const lesEtudiants = etudiants.map(x => ({ id: x.id, nom: nomP(x), matricule: x.id_ecampus || x.matricule || '',
      ar: (amenagements.get(x.id) || []).filter(m => (!m.ue_num || Number(m.ue_num) === Number(e.ue_num)) && (!m.ues || m.ues.includes(Number(e.ue_num)))) }));
    const duree = Number(d.duree_min) || 120;
    return {
      ...e, annee, cle: cle(e),
      type: d.type || 'ecrit', duree_min: duree, heure_fin: plusMinutes(e.heure, duree),
      surveillants: d.surveillants || '', materiel: d.materiel || '', consignes: d.consignes || '',
      copies_reserve: d.copies_reserve ?? 3, questionnaire_recu_le: d.questionnaire_recu_le || null,
      professeurs: essai(() => profs.all(annee, e.ue_num, e.cours_code, e.cours_code), []).map(nomP).join(', '),
      etudiants: lesEtudiants,
      ar: lesEtudiants.filter(x => x.ar.length),
    };
  });
}

/** Les mesures accordées par étudiant (la règle de Mes cours et de l'espace enseignant, 3.5.223). */
export function mesuresParEtudiant(annee) {
  const out = new Map();
  essai(() => {
    let unites = () => null;
    try { const q = db.prepare('SELECT ue_num FROM amenagement_ue WHERE dossier_id = ?'); unites = id => { const r = q.all(id).map(x => Number(x.ue_num)); return r.length ? r : null; }; } catch { /* */ }
    for (const x of db.prepare(`SELECT d.id AS dossier_id, d.etudiant_id, m.libelle, m.precisions, m.ue_num FROM amenagement_dossier d
        JOIN amenagement_mesure m ON m.dossier_id = d.id WHERE d.annee_scolaire = ? AND d.statut IN ('accepte','partiel','recours') AND m.accorde = 1`).all(annee)) {
      (out.get(x.etudiant_id) || out.set(x.etudiant_id, []).get(x.etudiant_id)).push({ libelle: x.libelle, precisions: x.precisions || null, ue_num: x.ue_num || null, ues: unites(x.dossier_id) });
    }
  }, null);
  return out;
}

/** Écrire le détail d'une épreuve. */
export function ecrireDetail({ annee, session, ue_num, cours_code = '', type, duree_min, surveillants, materiel, consignes, copies_reserve, questionnaire_recu_le }, par) {
  const s = Number(session) === 2 ? 2 : 1;
  const d = essai(() => db.prepare('SELECT * FROM epreuve_detail WHERE annee_scolaire = ? AND session = ? AND ue_num = ? AND cours_code = ?').get(annee, s, Number(ue_num), cours_code || ''), null) || {};
  const v = {
    type: ['ecrit', 'oral'].includes(type) ? type : (d.type || 'ecrit'),
    duree_min: duree_min !== undefined ? Math.max(10, Math.min(600, Number(duree_min) || 120)) : (d.duree_min || 120),
    surveillants: surveillants !== undefined ? String(surveillants || '').slice(0, 300) || null : (d.surveillants ?? null),
    materiel: materiel !== undefined ? String(materiel || '').slice(0, 1000) || null : (d.materiel ?? null),
    consignes: consignes !== undefined ? String(consignes || '').slice(0, 2000) || null : (d.consignes ?? null),
    copies_reserve: copies_reserve !== undefined ? Math.max(0, Math.min(50, Number(copies_reserve) || 0)) : (d.copies_reserve ?? 3),
    questionnaire_recu_le: questionnaire_recu_le !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(String(questionnaire_recu_le || '')) ? questionnaire_recu_le : null) : (d.questionnaire_recu_le ?? null),
  };
  db.prepare(`INSERT INTO epreuve_detail (annee_scolaire, session, ue_num, cours_code, type, duree_min, surveillants, materiel, consignes, copies_reserve, questionnaire_recu_le, maj_par, maj_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(annee_scolaire, session, ue_num, cours_code) DO UPDATE SET type = excluded.type, duree_min = excluded.duree_min,
      surveillants = excluded.surveillants, materiel = excluded.materiel, consignes = excluded.consignes,
      copies_reserve = excluded.copies_reserve, questionnaire_recu_le = excluded.questionnaire_recu_le, maj_par = excluded.maj_par, maj_le = excluded.maj_le`)
    .run(annee, s, Number(ue_num), cours_code || '', v.type, v.duree_min, v.surveillants, v.materiel, v.consignes, v.copies_reserve, v.questionnaire_recu_le, par);
  return v;
}

// ── LES PIÈCES ─────────────────────────────────────────────────────────────
export const PIECES = [
  { id: 'enveloppe', libelle: 'L’enveloppe complète', aide: 'Dans l’ordre de l’enveloppe : fiche de l’épreuve, aménagements, registre de présences, plan d’installation, PV d’incident, et les feuilles de brouillon des étudiants dont l’aménagement les prévoit.' },
  { id: 'fiche', libelle: 'Fiche de l’épreuve (à coller sur l’enveloppe)' },
  { id: 'registre', libelle: 'Registre de présences et de dépôt' },
  { id: 'plan', libelle: 'Plan d’installation' },
  { id: 'ar', libelle: 'Aménagements raisonnables de l’épreuve' },
  { id: 'incident', libelle: 'PV d’incident (modèle prérempli)' },
  { id: 'archivage', libelle: 'Feuille d’archivage et étiquette' },
  { id: 'garde', libelle: 'Pages de garde nominatives' },
  // LES BROUILLONS (3.5.721, la direction : « 3 feuilles de brouillon avec QR code, date, nom de l'examen, professeur »).
  { id: 'brouillon', libelle: 'Feuilles de brouillon (aménagement raisonnable)', aide: 'Trois feuilles nominatives avec QR, pour les seuls étudiants dont l’aménagement accordé prévoit des feuilles de brouillon.' },
  { id: 'recap', libelle: 'Calendrier récapitulatif (une ligne par épreuve)' },
  // QUI A BESOIN DE QUOI (3.5.722, Charles : « intégrer les AR dans les consignes d'examen ; une liste de qui a besoin de quoi »).
  { id: 'besoins', libelle: 'Aménagements raisonnables : qui a besoin de quoi', aide: 'Pour le secrétariat : toutes les épreuves choisies, par date, chaque étudiant avec ses mesures et ce qu’il faut préparer, et le total par besoin.' },
  // AUX VALVES (3.5.709, AEVALIOTIS Mati : « le récapitulatif des horaires d'examens avec les locaux, à afficher pour les étudiants »).
  { id: 'valves', libelle: 'Affiche aux valves (pour les étudiants)', aide: 'Par section et par jour : l’heure, le bloc, l’UE et l’épreuve, le local. Ni noms, ni aménagements.' },
];
const DANS_ENVELOPPE = ['fiche', 'ar', 'registre', 'plan', 'incident', 'brouillon'];

const ses = e => (e.session === 2 ? '2e session' : '1re session');
const epreuveNom = e => (e.cours_code ? `${e.cours_code} — ${e.cours_nom || ''}` : 'Unité entière');
const horaire = e => `${e.heure ? String(e.heure).slice(0, 5) : '__:__'} → ${e.heure_fin || '__:__'} (${Math.floor(e.duree_min / 60)} h${e.duree_min % 60 ? String(e.duree_min % 60).padStart(2, '0') : ''})`;
function cartouche(e, plus = []) {
  const lignes = [
    ['Session', `${ses(e)} · année académique ${e.annee}`],
    ['Section', `${esc(e.section || '—')}${e.niveau ? ` · bloc ${esc(e.niveau)}` : ''}`],
    ['Unité', `UE ${e.ue_num} — ${esc(e.ue_nom || '')}`],
    ['Épreuve', `${esc(epreuveNom(e))} · ${e.type === 'oral' ? 'oral' : 'écrit'}`],
    ['Date', `<b>${esc(jourLong(e.date))}</b>`],
    ['Horaire', `<b>${esc(horaire(e))}</b>`],
    ['Local', `${esc(e.local || '—')}${e.adresse ? ` · ${esc(e.adresse)}` : ''}`],
    ['Professeur(s)', esc(e.professeurs || '—')],
    ['Surveillant(s)', esc(e.surveillants || '…………………………………………')],
    ['Étudiants', `<b>${e.etudiants.length}</b>${e.ar.length ? ` · dont ${e.ar.length} avec aménagement` : ''}`],
    ...plus,
  ];
  return `<table class="cartouche">${lignes.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}</table>`;
}
const saut = k => (k ? ' style="break-before:page;page-break-before:always"' : '');

/* LES AR DANS LES CONSIGNES D'EXAMEN (3.5.722, Charles, 25 novembre 2026 : « intégrer les AR dans les consignes d'examen ; qu'on ait
   une liste de qui a besoin de quoi »). Chaque mesure accordée se traduit en ce qu'il faut PRÉPARER ou FAIRE en salle. La mesure se
   reconnaît à ses mots ; une mesure que rien ne reconnaît garde son libellé (« voir la mesure »). */
const BESOINS = [
  { k: 'temps', re: /temps suppl|tiers[- ]temps/i, t: 'Temps supplémentaire', faire: 'Prévoir l’heure de fin propre à l’étudiant et la surveillance jusqu’à cette heure' },
  { k: 'local', re: /local isol|effectif r[ée]duit/i, t: 'Local isolé ou à effectif réduit', faire: 'Réserver un local à part et un surveillant' },
  { k: 'questionnaire', re: /questionnaire adapt|police a[ée]r|interligne/i, t: 'Questionnaire adapté', faire: 'Imprimer le questionnaire adapté (police aérée, interligne 1,5, recto seul)' },
  { k: 'brouillon', re: /brouillon/i, t: 'Feuilles de brouillon', faire: 'Trois feuilles de brouillon nominatives (dans l’enveloppe)' },
  { k: 'bruit', re: /anti-bruit|bouchon|casque|boule/i, t: 'Dispositif anti-bruit', faire: 'Autoriser bouchons ou dispositif anti-bruit ; vérifier qu’il n’a aucune connectivité' },
  { k: 'ordinateur', re: /ordinateur|synth[èe]se vocale|correcteur/i, t: 'Ordinateur', faire: 'Prévoir un ordinateur (correcteur, synthèse vocale), sans accès au réseau' },
  { k: 'lecture', re: /lues|reformul/i, t: 'Consignes lues ou reformulées', faire: 'Lire ou reformuler oralement les consignes à l’étudiant' },
  { k: 'oral', re: /orale plut[ôo]t|ou l’inverse|ou l'inverse/i, t: 'Évaluation orale ou écrite', faire: 'Organiser l’autre modalité avec le professeur' },
  { k: 'calc', re: /calculatrice|aide-m[ée]moire/i, t: 'Calculatrice ou aide-mémoire', faire: 'Autoriser la calculatrice ou l’aide-mémoire de formules' },
  { k: 'pause', re: /pause|se lever|courte sortie/i, t: 'Pauses ou sorties', faire: 'Autoriser pauses, se lever ou une courte sortie accompagnée' },
  { k: 'place', re: /place r[ée]serv/i, t: 'Place réservée', faire: 'Réserver la place de l’étudiant dans le plan d’installation' },
  { k: 'calendrier', re: /calendrier/i, t: 'Calendrier aménagé', faire: 'Vérifier la date convenue avec l’étudiant' },
  { k: 'ortho', re: /syntaxe|orthographe/i, t: 'Tolérance orthographe', faire: 'À la correction : tolérance pour la syntaxe et l’orthographe' },
];
export function besoinDe(m) {
  const txt = `${m.libelle || ''} ${m.precisions || ''}`;
  const b = BESOINS.find(x => x.re.test(txt));
  return b ? { k: b.k, t: b.t, faire: b.faire } : { k: `autre:${m.libelle}`, t: m.libelle, faire: 'Voir la mesure' };
}
/** Les besoins d'une épreuve : [{ k, t, faire, etudiants: [{ n, nom, precisions }] }], dans l'ordre de BESOINS. */
export function besoinsEpreuve(e) {
  const par = new Map();
  e.etudiants.forEach((x, i) => {
    for (const m of x.ar || []) {
      const b = besoinDe(m);
      if (!par.has(b.k)) par.set(b.k, { ...b, etudiants: [] });
      const l = par.get(b.k).etudiants;
      if (!l.some(y => y.n === i + 1)) l.push({ n: i + 1, nom: x.nom, precisions: m.precisions || null });
    }
  });
  const rang = k => { const i = BESOINS.findIndex(b => b.k === k); return i < 0 ? 99 : i; };
  return [...par.values()].sort((a, b) => rang(a.k) - rang(b.k));
}

function fiche(e) {
  const copies = e.etudiants.length + Number(e.copies_reserve || 0);
  return `<h2>Fiche de l’épreuve</h2>
    ${cartouche(e, [['Questionnaires', `<b>${copies}</b> exemplaires (${e.etudiants.length} étudiants + ${e.copies_reserve} de réserve)`],
      ['Matériel autorisé', esc(e.materiel || 'Latte, calculatrice si autorisée, stylos, feutres, mouchoirs, bouteille d’eau, en-cas léger — trousses interdites')],
      ...(e.consignes ? [['Consignes', esc(e.consignes)]] : [])])}
    ${(() => {
      const bs = besoinsEpreuve(e);
      if (!bs.length) return '';
      return `<h3>Aménagements raisonnables à prévoir</h3>
        <table class="grille"><thead><tr><th style="width:42mm">Besoin</th><th>À préparer ou à faire</th><th style="width:30mm">N° au registre</th></tr></thead>
        <tbody>${bs.map(b => `<tr><td><b>${esc(b.t)}</b> (${b.etudiants.length})</td><td>${esc(b.faire)}</td><td>${b.etudiants.map(x => x.n).join(', ')}</td></tr>`).join('')}</tbody></table>
        <p class="mention">Les noms et les mesures sont dans la liste des aménagements, à l’intérieur de l’enveloppe (secret professionnel).</p>`;
    })()}
    <h3>Contenu de l’enveloppe</h3>
    <ul class="cases">
      <li>☐ Les questionnaires (${copies})</li>
      <li>☐ Le registre de présences et de dépôt</li>
      <li>☐ Le plan d’installation</li>
      ${e.ar.length ? `<li>☐ La liste des aménagements raisonnables (${e.ar.length} étudiant${e.ar.length > 1 ? 's' : ''})</li>` : ''}
      ${(() => { const bs = besoinsEpreuve(e); const q = bs.find(b => b.k === 'questionnaire'); const br = bs.find(b => b.k === 'brouillon');
        return `${q ? `<li>☐ Les questionnaires adaptés (${q.etudiants.length})</li>` : ''}${br ? `<li>☐ Les feuilles de brouillon nominatives (${br.etudiants.length * 3})</li>` : ''}`; })()}
      <li>☐ Des modèles de PV d’incident</li>
    </ul>
    <h3>Rappels de la procédure</h3>
    <ul class="rappels">
      <li>Enveloppe à retirer au secrétariat <b>30 minutes</b> avant l’épreuve ; local prêt 25 minutes avant ; portes ouvertes 15 minutes avant.</li>
      <li>Heure de début <b>et</b> de fin écrites au tableau ; une rangée sur deux, une place sur deux ; copies face retournée.</li>
      <li>Présences (A / P) dès le lancement ; retardataire refusé après 15 minutes ; aucune sortie avant 30 minutes.</li>
      <li>Questions des étudiants : pendant les 15 premières minutes, après 45 minutes, après 1 h 15.</li>
      <li>Fraude ou incident : PV d’incident, transmis à la coordination de cursus et à la direction.</li>
    </ul>
    <table class="signatures"><tr><td>Remise par le secrétariat<br>(nom, date, heure)</td><td>Retrait par le professeur ou le surveillant<br>(nom, heure, signature)</td><td>Retour de l’enveloppe<br>(heure, nombre de copies)</td></tr></table>`;
}

function registre(e) {
  return `<h2>Registre de présences et de dépôt</h2>
    ${cartouche(e)}
    ${e.etudiants.length ? `<table class="grille"><thead><tr><th class="n">N°</th><th>Étudiant</th><th style="width:26mm">Matricule</th>
      <th style="width:12mm">A / P</th><th style="width:14mm">AR</th><th style="width:17mm">Heure de remise</th><th style="width:42mm">Signature au dépôt</th></tr></thead>
      <tbody>${e.etudiants.map((x, i) => `<tr><td class="n">${i + 1}</td><td>${esc(x.nom)}</td><td>${esc(x.matricule)}</td><td></td><td class="c"><b>${x.ar.length ? '×' : ''}</b></td><td></td><td></td></tr>`).join('')}</tbody></table>`
      : '<p class="vide">Aucun étudiant pour cette épreuve.</p>'}
    ${recapAR(e.etudiants)}
    <table class="totaux"><tr><td>Présents : ……</td><td>Absents : ……</td><td>Notes de présence : ……</td><td>Copies remises : ……</td></tr></table>
    <p class="mention">Le registre est le document officiel de présence à l’épreuve. Un étudiant en note de présence signe avant le lancement et quitte la salle avant le début : il ne peut prendre connaissance des questions.</p>
    <table class="signatures"><tr><td>Professeur<br>(nom et signature)</td><td>Surveillant(s)<br>(nom et signature)</td></tr></table>`;
}

/* LES AR EN FIN DE LISTE (3.5.721, mémo de la direction du 25 novembre 2026 : « indiquer par une croix les étudiants bénéficiant
   AR et, à la fin de la liste, reprendre les AR des étudiants concernés »). Les MESURES accordées seulement (secret professionnel). */
export function recapAR(etudiants) {
  const avec = etudiants.map((x, i) => ({ x, n: i + 1 })).filter(({ x }) => x.ar?.length);
  if (!avec.length) return '';
  return `<div style="break-inside: avoid; margin-top: 4mm"><h3 style="font-size: 10pt; margin: 0 0 1.5mm">Aménagements raisonnables des étudiants marqués ×</h3>
    <table class="grille" style="width:100%;border-collapse:collapse"><thead><tr><th class="n" style="border:0.2mm solid #B8C0CC;padding:1.2mm 1.5mm;vertical-align:top;font-size:8.5pt;text-align:left;width:9mm">N°</th><th style="border:0.2mm solid #B8C0CC;padding:1.2mm 1.5mm;vertical-align:top;font-size:8.5pt;text-align:left;width:55mm">Étudiant</th><th style="border:0.2mm solid #B8C0CC;padding:1.2mm 1.5mm;vertical-align:top;font-size:8.5pt;text-align:left">Mesures accordées</th></tr></thead>
    <tbody>${avec.map(({ x, n }) => `<tr><td class="n" style="border:0.2mm solid #B8C0CC;padding:1.2mm 1.5mm;vertical-align:top;font-size:8.5pt;text-align:left">${n}</td><td style="border:0.2mm solid #B8C0CC;padding:1.2mm 1.5mm;vertical-align:top;font-size:8.5pt;text-align:left">${esc(x.nom)}</td><td style="border:0.2mm solid #B8C0CC;padding:1.2mm 1.5mm;vertical-align:top;font-size:8.5pt;text-align:left">${x.ar.map(m => `${esc(m.libelle)}${m.precisions ? ` — ${esc(m.precisions)}` : ''}`).join('<br>')}</td></tr>`).join('')}</tbody></table>
    <p style="font-size:8pt;color:#555;margin:1.5mm 0 0">Seules les mesures accordées figurent ici (secret professionnel) : cette liste revient avec l’enveloppe.</p></div>`;
}

function plan(e) {
  const n = e.etudiants.length;
  const parRang = 6, rangs = Math.max(1, Math.ceil(n / parRang));
  let k = 0;
  const lignes = Array.from({ length: rangs }, (_, r) => `<tr><th>Rangée ${r * 2 + 1}</th>${Array.from({ length: parRang }, () => {
    const x = e.etudiants[k++]; return `<td>${x ? `<b>${k}</b><br>${esc(x.nom)}` : ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<h2>Plan d’installation</h2>
    ${cartouche(e)}
    <p class="mention">Une rangée sur deux, une place sur deux ; si deux groupes partagent la salle, on alterne les groupes. Proposition dans l’ordre alphabétique (le numéro est celui du registre) : à adapter au local, puis à afficher à l’entrée.</p>
    <div class="tableau-salle">TABLEAU</div>
    <table class="plan">${lignes}</table>`;
}

function listeAR(e) {
  return `<h2>Aménagements raisonnables — ${esc(epreuveNom(e))}</h2>
    ${cartouche(e)}
    ${e.ar.length ? `<table class="grille"><thead><tr><th class="n">N°</th><th style="width:42mm">Étudiant</th><th>Mesures accordées pour cette épreuve</th><th style="width:62mm">À préparer ou à faire</th><th style="width:10mm">Fait</th></tr></thead>
      <tbody>${e.ar.map(x => `<tr><td class="n">${e.etudiants.indexOf(x) + 1}</td><td>${esc(x.nom)}</td><td>${x.ar.map(m => `${esc(m.libelle)}${m.precisions ? ` — ${esc(m.precisions)}` : ''}`).join('<br>')}</td><td>${[...new Set(x.ar.map(m => besoinDe(m).faire))].map(esc).join('<br>')}</td><td class="c">☐</td></tr>`).join('')}</tbody></table>`
      : '<p class="vide">Aucun aménagement raisonnable accordé pour cette épreuve.</p>'}
    <p class="mention">Seules les mesures accordées figurent ici. La situation de l’étudiant reste couverte par le secret professionnel : ce document ne se laisse pas en salle et revient avec l’enveloppe.</p>`;
}

function incident(e) {
  return `<h2>Procès-verbal d’incident</h2>
    ${cartouche(e)}
    <table class="formulaire">
      <tr><th>Nature</th><td>☐ Suspicion de fraude &nbsp; ☐ Malaise ou problème médical &nbsp; ☐ Alarme incendie &nbsp; ☐ Autre : ……………………</td></tr>
      <tr><th>Étudiant concerné</th><td>Nom, prénom : …………………………………………… Matricule : ……………………</td></tr>
      <tr><th>Heure des faits</th><td>…… h …… &nbsp;&nbsp; Heure de sortie de l’étudiant : …… h ……</td></tr>
      <tr><th>Les faits</th><td class="haut"></td></tr>
      <tr><th>Élément saisi</th><td class="moyen"></td></tr>
      <tr><th>Questions non encore complétées</th><td class="moyen"></td></tr>
      <tr><th>Étudiant informé du soupçon</th><td>☐ oui &nbsp; ☐ non — remarques de l’étudiant :</td></tr>
    </table>
    <table class="signatures"><tr><td>L’étudiant</td><td>Le surveillant</td><td>Le professeur</td></tr></table>
    <p class="mention">À transmettre à la coordination de cursus et à la direction dès la fin de l’épreuve. En cas de fraude : ajournement en 1re session, refus en 2e session (RDE). Une épreuve interrompue se reprogramme avec la coordination et la direction.</p>`;
}

function archivage(e) {
  const etiquette = `<div class="etiquette">
      <div class="et-ligne"><span>Année académique</span><b>${esc(e.annee)}</b></div>
      <div class="et-ligne"><span>Section</span><b>${esc(e.section || '')}</b></div>
      <div class="et-ligne"><span>Type de document</span><b>Examen · ${ses(e)}</b></div>
      <div class="et-ligne"><span>Unité</span><b>UE ${e.ue_num} — ${esc(e.ue_nom || '')}</b></div>
      <div class="et-ligne"><span>Épreuve</span><b>${esc(court(e.date))} · ${esc(epreuveNom(e))}</b></div>
      <div class="et-ligne"><span>Professeur(s)</span><b>${esc(e.professeurs || '')}</b></div>
    </div>`;
  return `<h2>Feuille d’archivage</h2>
    ${cartouche(e, [['Copies corrigées', '……… exemplaires']])}
    <h3>Remise par le professeur, après la visite des copies</h3>
    <table class="signatures"><tr><td>Nom du professeur chargé du cours</td><td>Date et signature</td></tr></table>
    <h3>Cadre réservé à l’administration — l’enveloppe comprend</h3>
    <ul class="cases"><li>☐ Les copies des examens</li><li>☐ Le correctif du professeur</li><li>☐ Le registre de présences et de dépôt</li><li>☐ Les éventuels PV d’incident</li></ul>
    <table class="signatures"><tr><td>Date et signature du secrétariat pour réception</td></tr></table>
    <h3>Étiquettes d’archive (à découper)</h3>
    <div class="etiquettes">${etiquette}${etiquette}</div>`;
}

export function acquisDe(e) {
  return essai(() => db.prepare(`SELECT p.aa_code, MAX(p.poids) AS poids, (SELECT a.description FROM aa a WHERE a.aa_code = p.aa_code) AS description
    FROM aa_ponderation p WHERE p.annee_scolaire = ? AND p.ue_num = ? AND (? = '' OR p.cours_code = ?)
    GROUP BY p.aa_code ORDER BY p.aa_code`).all(e.annee, e.ue_num, e.cours_code, e.cours_code), [])
    .filter((x, i, t) => t.findIndex(y => y.aa_code === x.aa_code) === i);
}
/** Nettoie une grille de questions : numéro, intitulé, acquis (parmi `permis` s'il est donné), points (au demi-point). */
export function nettoyerGrille(questions, permis = null) {
  return (Array.isArray(questions) ? questions : []).slice(0, 200).map((q, i) => ({
    num: String(q?.num || `Q${i + 1}`).trim().slice(0, 12),
    libelle: String(q?.libelle || '').trim().slice(0, 300),
    aa_code: permis && !permis.has(String(q?.aa_code || '')) ? '' : String(q?.aa_code || '').slice(0, 30),
    points: Number(q?.points) > 0 ? Math.round(Number(q.points) * 2) / 2 : 0,
  })).filter(q => q.libelle || q.aa_code || q.points);
}
export function lireGrille(e) {
  const r = essai(() => db.prepare('SELECT questions FROM examen_grille WHERE annee_scolaire = ? AND session = ? AND ue_num = ? AND cours_code = ?')
    .get(e.annee, Number(e.session) === 2 ? 2 : 1, e.ue_num, e.cours_code || ''), null);
  return r ? essai(() => JSON.parse(r.questions), []) : null;
}
export function ecrireGrille(e, questions, par) {
  db.prepare(`INSERT INTO examen_grille (annee_scolaire, session, ue_num, cours_code, questions, maj_par) VALUES (?,?,?,?,?,?)
    ON CONFLICT(annee_scolaire, session, ue_num, cours_code) DO UPDATE SET questions = excluded.questions, maj_par = excluded.maj_par, maj_le = datetime('now')`)
    .run(e.annee, Number(e.session) === 2 ? 2 : 1, e.ue_num, e.cours_code || '', JSON.stringify(questions), par || null);
}
/** Les acquis vus par la grille : chacun avec ses questions et la somme de ses points. */
export function acquisDeLaGrille(acquis, questions) {
  return acquis.map(a => {
    const qs = questions.filter(q => q.aa_code === a.aa_code);
    return { ...a, questions: qs.map(q => q.num).join(', '), points: qs.reduce((t, q) => t + q.points, 0) || null };
  }).filter(a => a.points);
}

export function garde(e) {
  // La grille de l'examen (3.5.240) quand elle existe ; sinon les acquis choisis (3.5.234), sinon tous ceux du cours.
  const grille = Array.isArray(e.grille) ? e.grille : (Array.isArray(e.aa_choisis) ? null : lireGrille(e));
  const aa = grille?.length ? acquisDeLaGrille(acquisDe(e), grille) : Array.isArray(e.aa_choisis) ? e.aa_choisis : acquisDe(e);
  const totalG = (grille || []).reduce((t, q) => t + q.points, 0);
  const fmt = n => String(n).replace('.', ',');
  const tableGrille = grille?.length ? `<h3>Grille de correction</h3>
    <table class="grille"><thead><tr><th style="width:12mm">N°</th><th>Question</th><th style="width:24mm">Acquis</th><th style="width:26mm">Points</th></tr></thead>
      <tbody>${grille.map(q => `<tr><td>${esc(q.num)}</td><td class="petit">${esc(q.libelle)}</td><td>${esc(q.aa_code || '—')}</td><td>…… / ${fmt(q.points)}</td></tr>`).join('')}
      <tr><td colspan="3"><b>Total</b>${totalG && totalG !== 20 ? ` <span class="petit">(ramené sur 20 : × ${fmt(Math.round(20 / totalG * 1000) / 1000)})</span>` : ''}</td><td><b>…… / ${fmt(totalG)}</b></td></tr></tbody></table>` : '';
  // L'ÉTABLISSEMENT DE LA SECTION en tête de la page que reçoit l'étudiant (l'en-tête du document ne paraît qu'en première page).
  const etab = essai(() => db.prepare(`SELECT etab_nom FROM etablissement WHERE id = COALESCE((SELECT etablissement_id FROM section WHERE code = ?), 1)`).get(e.section)?.etab_nom, null)
    || essai(() => db.prepare('SELECT etab_nom FROM etablissement WHERE id = 1').get()?.etab_nom, null) || 'Institut Ilya Prigogine';
  const tete = x => `<div class="etab">${esc(etab)}</div><h2>Examen — ${ses(e)}</h2>
    <table class="cartouche">
      <tr><th>Section</th><td>${esc(e.section || '')}${e.niveau ? ` · bloc ${esc(e.niveau)}` : ''}</td></tr>
      <tr><th>Unité</th><td>UE ${e.ue_num} — ${esc(e.ue_nom || '')}</td></tr>
      <tr><th>Épreuve</th><td>${esc(epreuveNom(e))}</td></tr>
      <tr><th>Professeur(s)</th><td>${esc(e.professeurs || '')}</td></tr>
      <tr><th>Date et horaire</th><td>${esc(court(e.date))} · ${esc(horaire(e))}</td></tr>
    </table>
    ${e.pages ? `<p class="mention">Cet examen compte <b>${esc(e.pages)}</b> page(s), cette page comprise.</p>` : ''}
    <table class="identite"><tr><th>Nom et prénom</th><td><b>${esc(x ? x.nom : '')}</b></td><th>Matricule</th><td><b>${esc(x ? x.matricule : '')}</b></td></tr></table>
    <p class="mention">Indiquez votre nom, votre prénom et votre matricule en haut à droite de chaque page. Impression recto : le verso sert de brouillon. Durée : 2 heures pour tous (l’épreuve est conçue pour 1 h 30).</p>
    <h3>Matériel autorisé et consignes</h3>
    <div class="cadre">${esc(e.materiel || '')}${e.consignes ? `<br>${esc(e.consignes)}` : ''}</div>
    ${tableGrille}
    <h3>Résultat par acquis d’apprentissage</h3>
    ${aa.length ? `<table class="grille"><thead><tr><th style="width:24mm">Acquis</th><th>Énoncé</th><th style="width:22mm">Questions</th><th style="width:22mm">Points</th><th style="width:18mm">/ 20</th></tr></thead>
      <tbody>${aa.map(a => `<tr><td>${esc(a.aa_code)}</td><td class="petit">${esc(String(a.description || '').slice(0, 220))}</td><td>${esc(a.questions || '')}</td><td>…… / ${esc(a.points ? fmt(a.points) : '……')}</td><td></td></tr>`).join('')}
      ${aa.some(a => a.points) ? `<tr><td colspan="3"><b>Total</b></td><td><b>…… / ${fmt(aa.reduce((t, a) => t + (Number(a.points) || 0), 0))}</b></td><td><b>…… / 20</b></td></tr>` : ''}</tbody></table>`
      : '<p class="vide">Aucun acquis pondéré pour ce cours cette année (Organisation → l’unité → Pondérer).</p>'}`;
  const liste = e.etudiants.length ? e.etudiants : [null];
  return liste.map((x, k) => `<section class="piece"${saut(k)}>${tete(x)}</section>`).join('');
}

/* LES FEUILLES DE BROUILLON : trois par étudiant, à son nom, dans l'ordre du registre. Le QR dit l'épreuve, le matricule et
   la feuille (« IIP · 2026-2027 · S1 · UE 250 · 250.1 · 12345 · 2/3 ») : une feuille trouvée sur une table se rend à qui elle revient. */
export const prevoitBrouillon = x => (x?.ar || []).some(m => /brouillon/i.test(`${m.libelle || ''} ${m.precisions || ''}`));
export function brouillon(e) {
  // SEULEMENT POUR LES ÉTUDIANTS DONT L'AMÉNAGEMENT LE PRÉVOIT (Charles, 25 novembre 2026) : une mesure accordée qui parle de brouillon.
  const liste = e.etudiants.map((x, i) => ({ x, i })).filter(({ x }) => prevoitBrouillon(x));
  if (!liste.length) return '';
  const pages = [];
  liste.forEach(({ x, i }) => {
    for (let k = 1; k <= 3; k++) {
      const code = ['IIP', e.annee || '', `S${e.session}`, `UE ${e.ue_num}`, e.cours_code || 'unité', x?.matricule || '—', `${k}/3`].join(' · ');
      let qr = '';
      try { qr = qrSvg(code); } catch { /* */ }
      pages.push(`<div style="display:flex;gap:4mm;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <h2 style="margin:0 0 2mm">Brouillon — feuille ${k} / 3</h2>
          <table class="cartouche" style="width:100%">
            <tr><th>Épreuve</th><td>UE ${e.ue_num} — ${esc(epreuveNom(e))} · ${ses(e)}</td></tr>
            <tr><th>Date et horaire</th><td>${esc(court(e.date))} · ${esc(horaire(e))}${e.local ? ` · ${esc(e.local)}` : ''}</td></tr>
            <tr><th>Professeur(s)</th><td>${esc(e.professeurs || '')}</td></tr>
          </table>
          <table class="identite" style="width:100%"><tr><th>Nom et prénom</th><td><b>${esc(x ? x.nom : '')}</b></td><th>N°</th><td><b>${x ? i + 1 : ''}</b></td><th>Matricule</th><td><b>${esc(x ? x.matricule : '')}</b></td></tr></table>
        </div>
        <div style="width:26mm;flex:none;text-align:center">${qr ? `<div style="width:26mm;height:26mm">${qr}</div>` : ''}<div style="font-size:6.5pt;color:#555;margin-top:0.8mm">${esc(code)}</div></div>
      </div>
      <p class="mention">Le brouillon n’est pas corrigé. Il se remet avec la copie, à la fin de l’épreuve.</p>
      <div style="height:188mm;border:0.2mm solid #D8DCE4;border-radius:1.5mm;background-image:repeating-linear-gradient(to bottom, transparent 0, transparent 7.5mm, #EEF1F5 7.5mm, #EEF1F5 7.8mm)"></div>`);
    }
  });
  return pages.map((b, k) => `<section class="piece"${saut(k)}>${b}</section>`).join('');
}

function besoins(liste) {
  const lignes = [];
  const totaux = new Map();
  for (const e of liste) {
    e.etudiants.forEach((x, i) => {
      if (!x.ar?.length) return;
      for (const m of x.ar) {
        const b = besoinDe(m);
        lignes.push({ e, n: i + 1, nom: x.nom, m, b });
        if (!totaux.has(b.k)) totaux.set(b.k, { t: b.t, faire: b.faire, n: 0, epreuves: new Set() });
        const t = totaux.get(b.k); t.n++; t.epreuves.add(cle(e));
      }
    });
  }
  if (!lignes.length) return `<h2>Aménagements raisonnables : qui a besoin de quoi</h2><p class="vide">Aucun aménagement raisonnable accordé pour les épreuves choisies.</p>`;
  return `<h2>Aménagements raisonnables : qui a besoin de quoi</h2>
    <h3>Ce qu’il faut préparer</h3>
    <table class="grille"><thead><tr><th style="width:50mm">Besoin</th><th>À préparer ou à faire</th><th class="c" style="width:18mm">Étudiants</th><th class="c" style="width:18mm">Épreuves</th></tr></thead>
    <tbody>${[...totaux.values()].map(t => `<tr><td><b>${esc(t.t)}</b></td><td>${esc(t.faire)}</td><td class="c">${t.n}</td><td class="c">${t.epreuves.size}</td></tr>`).join('')}</tbody></table>
    <h3>Épreuve par épreuve</h3>
    <table class="grille"><thead><tr><th style="width:20mm">Date</th><th style="width:22mm">Horaire</th><th style="width:22mm">Local</th><th>Épreuve</th><th class="n">N°</th><th style="width:38mm">Étudiant</th><th>Mesure</th><th>À préparer ou à faire</th><th style="width:9mm">Fait</th></tr></thead>
    <tbody>${lignes.map(({ e, n, nom, m, b }) => `<tr><td>${esc(court(e.date))}</td><td>${esc(horaire(e))}</td><td>${esc(e.local || '')}</td><td>UE ${e.ue_num} · ${esc(epreuveNom(e))}</td><td class="n">${n}</td><td>${esc(nom)}</td>
      <td>${esc(m.libelle)}${m.precisions ? ` — ${esc(m.precisions)}` : ''}</td><td>${esc(b.faire)}</td><td class="c">☐</td></tr>`).join('')}</tbody></table>
    <p class="mention">N° = le numéro de l’étudiant au registre de l’épreuve. Seules les mesures accordées figurent ici (secret professionnel) : document interne au secrétariat.</p>`;
}

function recap(liste) {
  return `<h2>Calendrier des épreuves</h2>
    <table class="grille"><thead><tr><th>Date</th><th>Horaire</th><th>Local</th><th>UE</th><th>Épreuve</th><th>Professeur(s)</th><th>Surveillant(s)</th><th class="c">Étud.</th><th class="c">AR</th><th class="c">Copies</th></tr></thead>
    <tbody>${liste.map(e => `<tr><td>${esc(court(e.date))}</td><td>${esc(horaire(e))}</td><td>${esc(e.local || '')}</td><td>${e.ue_num}</td><td>${esc(epreuveNom(e))}${e.type === 'oral' ? ' (oral)' : ''}</td>
      <td>${esc(e.professeurs)}</td><td>${esc(e.surveillants)}</td><td class="c">${e.etudiants.length}</td><td class="c">${e.ar.length || ''}</td><td class="c">${e.etudiants.length + Number(e.copies_reserve || 0)}</td></tr>`).join('')}</tbody></table>`;
}

/* L'AFFICHE AUX VALVES : une page par section, les épreuves jour par jour, en grand — ce qu'un étudiant cherche devant le panneau. */
function valves(liste) {
  const parSection = new Map();
  for (const e of liste) { const k = e.section || 'Autres'; if (!parSection.has(k)) parSection.set(k, []); parSection.get(k).push(e); }
  return [...parSection.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([sec, l], i) => {
    const parJour = new Map();
    for (const e of l) { const k = String(e.date).slice(0, 10); if (!parJour.has(k)) parJour.set(k, []); parJour.get(k).push(e); }
    const s2 = l[0]?.session === 2;
    return `<div class="valves"${i ? ' style="break-before:page;page-break-before:always"' : ''}>
      <h2 class="valves-titre">Examens — ${esc(sec)}</h2>
      <p class="valves-sous">${s2 ? 'Seconde session' : 'Première session'} · ${esc(l[0]?.annee || '')}</p>
      ${[...parJour.entries()].map(([j, es]) => `<h3 class="valves-jour">${esc(jourLong(j))}</h3>
        <table class="grille valves-t"><thead><tr><th style="width:24mm">Heure</th><th style="width:14mm">Bloc</th><th>Unité et épreuve</th><th style="width:42mm">Local</th></tr></thead>
        <tbody>${es.map(e => `<tr><td><b>${esc(horaire(e))}</b></td><td>${esc(e.niveau || '')}</td>
          <td><b>UE ${e.ue_num}</b> — ${esc(e.ue_nom || '')}${e.cours_code ? `<br><span class="valves-cours">${esc(e.cours_code)} — ${esc(e.cours_nom || '')}</span>` : ''}${e.type === 'oral' ? ' <i>(oral)</i>' : ''}</td>
          <td><b>${esc(e.local || 'à préciser')}</b>${e.adresse ? `<br><span class="valves-cours">${esc(e.adresse)}</span>` : ''}</td></tr>`).join('')}</tbody></table>`).join('')}
    </div>`;
  }).join('');
}

const COMPOSE = { fiche, registre, plan, ar: listeAR, incident, archivage, garde, brouillon };
export const STYLES_EXAMENS = `
  .valves-titre { font-size: 18pt; } .valves-sous { font-size: 10pt; color: #555; margin: -2mm 0 3mm; }
  .valves-jour { font-size: 12pt; text-transform: capitalize; border-bottom: 0.3mm solid #C9A84C; padding-bottom: 1mm; margin-top: 5mm; }
  table.valves-t td { font-size: 10.5pt; height: auto; padding: 1.8mm 2mm; } .valves-cours { font-size: 9pt; color: #444; }
  table.valves-t, .valves-t tr { break-inside: avoid; }
  h2 { font-size: 13pt; color: #16406A; margin: 0 0 3mm; }
  h3 { font-size: 10pt; color: #16406A; margin: 4mm 0 1.5mm; }
  table { border-collapse: collapse; width: 100%; }
  table.cartouche th { text-align: left; width: 32mm; font-weight: normal; color: #555; padding: 0.8mm 2mm 0.8mm 0; vertical-align: top; }
  table.cartouche td { padding: 0.8mm 0; }
  table.cartouche { margin-bottom: 3mm; border-top: 0.3mm solid #C9A84C; border-bottom: 0.3mm solid #C9A84C; }
  table.grille th, table.grille td { border: 0.2mm solid #B8C0CC; padding: 1.2mm 1.5mm; font-size: 9pt; vertical-align: top; }
  table.grille thead th { background: #EEF2F7; text-align: left; }
  table.grille td { height: 7mm; }
  .n { width: 9mm; text-align: right; } .c { text-align: center; }
  td.petit { font-size: 8pt; }
  ul.cases { list-style: none; padding-left: 2mm; margin: 0; } ul.cases li { margin: 1mm 0; }
  ul.rappels { margin: 0; padding-left: 5mm; font-size: 9pt; } ul.rappels li { margin: 0.8mm 0; }
  table.signatures { margin-top: 5mm; } table.signatures td { border: 0.2mm solid #B8C0CC; height: 22mm; vertical-align: top; padding: 1.5mm; font-size: 8.5pt; color: #555; }
  table.totaux td { padding: 2mm 0; font-size: 9pt; }
  table.formulaire th { text-align: left; width: 42mm; font-weight: normal; color: #555; border: 0.2mm solid #B8C0CC; padding: 1.5mm; vertical-align: top; }
  table.formulaire td { border: 0.2mm solid #B8C0CC; padding: 1.5mm; height: 8mm; }
  table.formulaire td.haut { height: 50mm; } table.formulaire td.moyen { height: 20mm; }
  table.identite th { text-align: left; font-weight: normal; color: #555; padding: 1.5mm; width: 28mm; border: 0.3mm solid #16406A; }
  table.identite td { border: 0.3mm solid #16406A; padding: 1.5mm; }
  .cadre { border: 0.2mm solid #B8C0CC; min-height: 16mm; padding: 1.5mm; font-size: 9pt; }
  .mention { font-size: 8.5pt; color: #555; margin: 2mm 0; }
  .vide { color: #777; font-style: italic; }
  .tableau-salle { text-align: center; border: 0.3mm solid #16406A; padding: 1.5mm; margin: 2mm 25%; font-size: 8pt; letter-spacing: 1pt; }
  table.plan th { width: 18mm; font-size: 8pt; color: #555; text-align: left; }
  table.plan td { border: 0.2mm dashed #B8C0CC; height: 14mm; font-size: 7.5pt; text-align: center; vertical-align: middle; width: 14%; }
  .etiquettes { display: flex; gap: 6mm; } .etiquette { flex: 1; border: 0.4mm solid #16406A; border-radius: 1.5mm; padding: 3mm; }
  .et-ligne { display: flex; flex-direction: column; margin-bottom: 1.5mm; } .et-ligne span { font-size: 7pt; color: #777; text-transform: uppercase; letter-spacing: 0.4pt; } .et-ligne b { font-size: 10pt; }
  section.piece { break-inside: auto; }
  .etab { font-size: 9pt; font-weight: bold; color: #16406A; letter-spacing: 0.5pt; text-transform: uppercase; border-bottom: 0.3mm solid #C9A84C; padding-bottom: 1.5mm; margin-bottom: 3mm; }
`;

/** Le corps d'une production : les pièces choisies, épreuve par épreuve (l'enveloppe complète dans son ordre). */
export function composer(liste, pieces) {
  const choix = pieces.includes('enveloppe') ? DANS_ENVELOPPE : pieces.filter(p => COMPOSE[p]);
  const blocs = [];
  if (pieces.includes('recap')) blocs.push(recap(liste));
  if (pieces.includes('valves')) blocs.push(valves(liste));
  if (pieces.includes('besoins')) blocs.push(besoins(liste));
  for (const e of liste) {
    for (const p of choix) {
      if (p === 'ar' && pieces.includes('enveloppe') && !e.ar.length) continue;   // pas de feuille vide dans l'enveloppe
      const b = COMPOSE[p](e);
      if (p === 'brouillon' && !b) { if (!pieces.includes('enveloppe')) blocs.push(`<h2>Feuilles de brouillon — UE ${e.ue_num} · ${esc(epreuveNom(e))}</h2><p class="vide">Aucun étudiant de cette épreuve n’a un aménagement accordé qui prévoit des feuilles de brouillon.</p>`); continue; }
      blocs.push(b);
    }
  }
  return blocs.map((b, k) => `<section class="piece"${saut(k)}>${b}</section>`).join('');
}

/** LE DÉLAI DU QUESTIONNAIRE (procédure 2026-2027, point 2) : un mois avant l'épreuve ; pour les examens de janvier, au plus tard
 *  le 1er décembre ; de mai à septembre, au plus tard le 15 avril. Le plus tôt des deux. */
export function delaiQuestionnaire(date) {
  const d = String(date || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const x = new Date(`${d}T12:00:00Z`); x.setUTCMonth(x.getUTCMonth() - 1);
  let delai = x.toISOString().slice(0, 10);
  const [an, mois] = d.split('-').map(Number);
  const fixe = mois === 1 ? `${an - 1}-12-01` : (mois >= 5 && mois <= 9) ? `${an}-04-15` : null;
  if (fixe && fixe < delai) delai = fixe;
  return delai;
}

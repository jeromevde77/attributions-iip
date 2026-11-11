/**
 * MES ÉDITIONS — LES PIÈCES DE L'ENSEIGNANT (3.5.340, Charles, 11 novembre 2026 : « un centre Éditions pour les profs : listes
 * d'étudiants, résultats de leurs cours, étudiants en seconde session, dispensés, présences, statistiques… »).
 *
 * L'enseignant choisit UN de ses cours, puis une pièce. Tout se lit par les règles de Mes cours : l'accès (`accesCours`), ses
 * étudiants (ceux de ses groupes), ses séances (`seancesDuCours`), la clôture étudiant par étudiant (`clotures`) — la route les
 * calcule et les passe ici dans `ctx` : ce fichier ne décide d'aucun droit.
 *
 * Ces pièces sont pour L'ENSEIGNANT : il y lit ses cotes de travail, sous dix comprises (ce ne sont pas des pièces remises à
 * l'étudiant). Les aménagements raisonnables n'y portent que les mesures accordées — ce que Mes cours montre déjà.
 *
 * Une pièce rend { titre, sous, ligne, corps (HTML), styles, paysage, nom, feuilles } ; `feuilles` : [{ nom, colonnes, lignes }]
 * pour le tableur. Chaque lecture est protégée : une table absente donne une pièce vide, jamais une erreur.
 */
import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { pieceEditionProf, FAMILLES_EDITIONS_PROF } from './editionsProfCatalogue.js';
import { dispensesDeLUE } from './dispenses.js';
import { vaRetenue } from './valorisation.js';
import { placer, etudiantsDeLEpreuve } from './passages.js';
import { donneesGrille, dispensesUE } from './grillePresence.js';
import { reglagesPresenceQr } from './presenceQr.js';
import { rubriquesDuDossier, decouperProgramme, memeCours } from './texteDossier.js';
import { aRepresenterParCours, delibererUE } from '../routes/acquis.js';

export { CATALOGUE_EDITIONS_PROF, FAMILLES_EDITIONS_PROF } from './editionsProfCatalogue.js';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const nomDe = e => `${String(e?.nom || '').toLocaleUpperCase('fr')} ${e?.prenom || ''}`.trim();
const nomHtml = e => `<b>${esc(String(e?.nom || '').toLocaleUpperCase('fr'))}</b> ${esc(e?.prenom || '')}`;
const num = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? '' : String(Math.round(Number(v) * 10 ** d) / 10 ** d).replace('.', ','));
const pc = v => (v == null ? '—' : `${num(v * 100, 0)} %`);
const hm = m => { const x = Math.round(Number(m) || 0); return `${Math.floor(x / 60)}h${String(x % 60).padStart(2, '0')}`; };
const lire = (f, defaut) => { try { return f(); } catch { return defaut; } };
const parNom = (a, b) => nomDe(a).localeCompare(nomDe(b), 'fr');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

// Les teintes d'une pièce imprimée : en hexadécimal (CLAUDE.md §6, exception voulue).
const T = { marine: '#1B2B4B', or: '#C9A84C', bleu: '#2C7DB8', reussi: '#3E7D5E', corriger: '#9D4A38', attente: '#B45309', gris: '#94a3b8' };

export const STYLES_EDITIONS = `
.tg{font-size:11pt;font-weight:700;color:${T.marine};margin:0 0 2.5mm;border-left:1.2mm solid ${T.or};padding-left:2.5mm}
.tg span{font-weight:400;font-size:9pt;color:#64748b}
.saut{break-before:page;page-break-before:always}
table.l{width:100%;border-collapse:collapse;font-size:9pt}
table.l th{text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em;color:#475569;background:#F1F4F9;padding:1.4mm 2mm;border-bottom:.3mm solid #D8DCE4;vertical-align:bottom}
table.l th small{display:block;text-transform:none;letter-spacing:0;font-weight:400;color:#64748b}
table.l td{padding:1.8mm 2mm;border-bottom:.2mm solid #E4E7EC;vertical-align:top}
table.l td.c,table.l th.c{text-align:center}
table.l td.n,table.l th.n{text-align:right;white-space:nowrap}
table.l tr{break-inside:avoid}
table.l td.vide{color:${T.gris};text-align:center;padding:5mm 0}
table.l.haut td{padding-top:3.2mm;padding-bottom:3.2mm}
table.l.cases td.k{border-left:.2mm solid #E4E7EC}
.bas{color:${T.corriger};font-weight:700}
.mention{color:${T.attente};font-weight:700}
.gris{color:#64748b}
.note{font-size:8pt;color:#475569;margin:2mm 0 0}
.bloc{margin:0 0 5mm;break-inside:avoid}
.intertitre{font-size:9.5pt;font-weight:700;color:${T.marine};margin:4mm 0 2mm}
table.tuiles{width:100%;border-collapse:separate;border-spacing:2.5mm 0;margin:0 -2.5mm 5mm;table-layout:fixed}
table.tuiles td{border:.3mm solid #D8DCE4;border-left:1.6mm solid ${T.marine};border-radius:0 1.5mm 1.5mm 0;padding:2.2mm 3mm;vertical-align:top;background:#fff}
.tv{font-size:15pt;font-weight:700;color:${T.marine};line-height:1.1}
.tl{font-size:8pt;color:#334155;margin-top:.6mm}
.tf{font-size:7pt;color:#64748b;margin-top:.4mm}
table.barres{width:100%;border-collapse:collapse;font-size:8.5pt;margin:0 0 2mm}
table.barres td{padding:1mm 1.5mm;border:0;vertical-align:middle}
.b-lib{width:30%}
.b-val{width:24%;white-space:nowrap;text-align:right;color:#334155}
.b-piste{background:#F1F4F9;height:3.4mm;border-radius:.8mm;overflow:hidden}
.b-barre{display:block;height:3.4mm;border-radius:.8mm}
.programme{font-size:9pt;line-height:1.45}
.programme p{margin:0 0 1.5mm}
.programme ul{margin:0 0 1.5mm;padding-left:5mm}
.mois{font-size:10pt;font-weight:700;color:${T.marine};margin:4mm 0 1.5mm;text-transform:capitalize}
`;

const tuile = (valeur, libelle, precision = null, couleur = T.marine) =>
  `<td style="border-left-color:${couleur}"><div class="tv">${valeur}</div><div class="tl">${esc(libelle)}</div>${precision ? `<div class="tf">${esc(precision)}</div>` : ''}</td>`;
const tuiles = l => `<table class="tuiles"><tr>${l.join('')}</tr></table>`;
const barres = (donnees, max = null) => {
  const m = max ?? Math.max(1, ...donnees.map(d => d.valeur || 0));
  return `<table class="barres">${donnees.map(d => `<tr><td class="b-lib">${d.nom}</td>
    <td><div class="b-piste"><span class="b-barre" style="width:${Math.max(0.5, (d.valeur || 0) / m * 100)}%;background:${d.couleur || T.bleu}"></span></div></td>
    <td class="b-val">${d.texte}</td></tr>`).join('')}</table>`;
};
const tableau = (entetes, lignes, { classe = '', vide = 'Aucun étudiant.' } = {}) =>
  `<table class="l ${classe}"><thead><tr>${entetes.map(h => `<th${h.c ? ` class="${h.c}"` : ''}${h.w ? ` style="width:${h.w}"` : ''}>${h.t}</th>`).join('')}</tr></thead>
  <tbody>${lignes.length ? lignes.join('') : `<tr><td colspan="${entetes.length}" class="vide">${esc(vide)}</td></tr>`}</tbody></table>`;

/* ── LES LECTURES COMMUNES ──────────────────────────────────────────────────── */

function emailsDe(ids) {
  const m = new Map();
  if (!ids.length) return m;
  lire(() => { for (const x of db.prepare(`SELECT id, email_ecole FROM etudiant WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)) m.set(x.id, x.email_ecole || ''); });
  return m;
}

/** La date d'une épreuve au calendrier des sessions (le cours, à défaut l'épreuve d'unité). */
function dateEpreuve(annee, session, ue, code) {
  const t = session === 2 ? 'deliberation_session2' : 'epreuve_session1', k = session === 2 ? 's2' : 's1';
  for (const c of [code, '']) {
    const x = lire(() => db.prepare(`SELECT ${k}_date date, ${k}_heure heure, ${k}_local local, ${k}_adresse adresse FROM ${t}
      WHERE ue_num = ? AND annee_scolaire = ? AND COALESCE(cours_code, '') = ?`).get(Number(ue), annee, c), null);
    if (x?.date) return { ...x, unite: !c };
  }
  return null;
}
const phraseDate = x => (x?.date ? `${JOURS[new Date(`${String(x.date).slice(0, 10)}T12:00:00Z`).getUTCDay()]} ${fr(x.date)}${x.heure ? ` à ${String(x.heure).slice(0, 5)}` : ''}${x.local ? ` · local ${x.local}` : ''}${x.adresse ? ` · ${x.adresse}` : ''}` : 'date à fixer');

/** Les notes de chaque étudiant pour CE cours et cette session : délibérées si la séance de l'étudiant est close, sinon les
 *  propositions de l'enseignant (`note_proposee`). Une ligne : { e, parAA: { aa: { note, mention, justif } }, cours, mention, source }. */
function notesDuCours(ctx, session) {
  const props = new Map();
  lire(() => {
    for (const x of db.prepare(`SELECT etudiant_id, aa_code, note, mention, justification FROM note_proposee
        WHERE annee_scolaire = ? AND cours_code = ? AND session = ?`).all(ctx.annee, ctx.code, session)) {
      if (!props.has(x.etudiant_id)) props.set(x.etudiant_id, {});
      props.get(x.etudiant_id)[x.aa_code || ''] = { note: x.note, mention: x.mention || null, justif: x.justification || '' };
    }
  });
  const aas = ctx.acquis.length ? ctx.acquis.map(a => a.aa_code) : [''];
  const poids = new Map(ctx.acquis.map(a => [a.aa_code, Number(a.poids) || 1]));
  const etudiants = session === 2 ? ctx.seconde : ctx.etudiants;
  return etudiants.map(e => {
    const p = props.get(e.id) || {};
    const close = ctx.close(session, e.id);
    let d = null;
    if (close) d = lire(() => delibererUE(e.id, ctx.ue, ctx.annee, session), null);
    const parAA = {};
    for (const aa of aas) {
      let note = null, mention = null;
      if (d && aa) {
        const v = (d.acquis || []).find(a => a.aa_code === aa)?.evaluations?.find(x => x.cours_code === ctx.code);
        if (v) { note = v.note ?? null; mention = v.mention || null; }
      }
      if (!d || (note == null && !mention)) { note = p[aa]?.note ?? note; mention = p[aa]?.mention || mention; }
      parAA[aa] = { note: note == null ? null : Number(note), mention, justif: p[aa]?.justif || '' };
    }
    let cours = null, mention = null;
    const c = d ? (d.cours || []).find(x => x.cours_code === ctx.code) : null;
    if (c && (c.note_calculee != null || c.mention)) { cours = c.note_calculee ?? c.note ?? null; mention = c.mention || null; }
    else {
      let n = 0, s = 0;
      for (const aa of aas) { const v = parAA[aa]; if (v.note != null) { n += v.note * (poids.get(aa) || 1); s += poids.get(aa) || 1; } }
      cours = s ? n / s : null;
      const ms = aas.map(aa => parAA[aa].mention).filter(Boolean);
      if (cours == null && ms.length === aas.length && ms.every(m => m === ms[0])) mention = ms[0];
    }
    return { e, parAA, cours, mention, source: d ? 'délibérée' : 'proposée', aa_ouverts: e.aa_ouverts || null };
  });
}

const reussit = l => l.cours != null && !l.mention && Math.round(l.cours) >= 10;

/* ── LES PIÈCES ─────────────────────────────────────────────────────────────── */

const PIECES = {
  /* 1. LA FEUILLE D'ÉMARGEMENT : une page par passage, sinon une page à la date du calendrier. */
  async emargement(ctx) {
    const s = ctx.session;
    const miens = new Set(ctx.etudiants.map(e => e.id));
    let tous = [];
    try { tous = (await etudiantsDeLEpreuve(ctx.annee, s, ctx.ue, ctx.code)).filter(e => miens.has(e.id)); } catch { tous = []; }
    let pages = [];
    for (const c of [ctx.code, '']) {
      let r = null;
      try { r = placer(c === ctx.code ? tous : (await etudiantsDeLEpreuve(ctx.annee, s, ctx.ue, '')).filter(e => miens.has(e.id)), ctx.annee, s, ctx.ue, c); } catch { r = null; }
      if (r?.passages?.length) {
        pages = r.passages.map(p => ({ titre: [p.partie, `passage ${p.rang}/${r.passages.length}`].filter(Boolean).join(' · '),
          quand: phraseDate(p), etudiants: p.etudiants }));
        break;
      }
    }
    if (!pages.length) pages = [{ titre: 'Tous les étudiants', quand: phraseDate(dateEpreuve(ctx.annee, s, ctx.ue, ctx.code)), etudiants: tous }];
    const corps = pages.map((p, i) => `<div class="${i ? 'saut' : ''}">
      <div class="tg">${esc(p.quand)} <span>— ${esc(p.titre)} · ${p.etudiants.length} étudiant(s)</span></div>
      ${tableau([{ t: 'N°', w: '9mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '26mm' }, { t: 'Signature', w: '42mm' }, { t: 'Remarque', w: '40mm' }],
        [...p.etudiants].sort(parNom).map((e, k) => `<tr><td>${k + 1}</td><td>${nomHtml(e)}</td><td>${esc(e.id_ecampus || '')}</td><td></td><td></td></tr>`),
        { classe: 'haut' })}</div>`).join('');
    return { titre: `Feuille d’émargement — ${s === 2 ? 'seconde' : 'première'} session`, corps,
      feuilles: pages.map((p, i) => ({ nom: `Passage ${i + 1}`, colonnes: ['N°', 'NOM Prénom', 'Matricule', 'Signature', 'Remarque'],
        entete: p.quand, lignes: [...p.etudiants].sort(parNom).map((e, k) => [k + 1, nomDe(e), e.id_ecampus || '', '', '']) })) };
  },

  /* 2. LA GRILLE DE COTATION VIERGE. */
  async 'grille-cotation'(ctx) {
    const aas = ctx.acquis;
    const disp = lire(() => dispensesDeLUE(ctx.ue, ctx.annee), new Map());
    const dispDe = id => { const d = disp.get(id); return d ? (d.ue || d.cours.get(ctx.code) || null) : null; };
    const ent = [{ t: 'N°', w: '8mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '22mm' },
      ...aas.map(a => ({ t: `${esc(a.aa_code)}<small>${a.poids != null ? `poids ${num(a.poids)}` : ''}</small>`, c: 'c', w: '17mm' })),
      { t: 'Note du cours<small>/20</small>', c: 'c', w: '20mm' }];
    const lignes = [...ctx.etudiants].sort(parNom).map((e, k) => {
      const d = dispDe(e.id);
      return `<tr><td>${k + 1}</td><td>${nomHtml(e)}</td><td>${esc(e.id_ecampus || '')}</td>${d
        ? `<td colspan="${aas.length + 1}" class="c gris">dispensé (${esc(d)})</td>`
        : `${aas.map(() => '<td class="k"></td>').join('')}<td class="k"></td>`}</tr>`;
    });
    const legende = aas.length ? `<div class="note">${aas.map(a => `<b>${esc(a.aa_code)}</b> ${esc(a.description || '')}`).join(' · ')}</div>`
      : '<div class="note">Aucun acquis n’est rattaché à ce cours pour cette année : une seule note de cours.</div>';
    return { titre: 'Grille de cotation', corps: tableau(ent, lignes, { classe: 'haut cases' }) + legende,
      feuilles: [{ nom: 'Grille', colonnes: ['N°', 'NOM Prénom', 'Matricule', ...aas.map(a => `${a.aa_code}${a.poids != null ? ` (poids ${a.poids})` : ''}`), 'Note du cours /20'],
        lignes: [...ctx.etudiants].sort(parNom).map((e, k) => [k + 1, nomDe(e), e.id_ecampus || '', ...aas.map(() => (dispDe(e.id) ? 'dispensé' : '')), '']) }] };
  },

  /* 3. LES ÉTUDIANTS EN SECONDE SESSION. */
  async 'seconde-session'(ctx) {
    let liste = [];
    try { liste = (aRepresenterParCours(ctx.ue, ctx.annee, 1) || {})[ctx.code] || []; } catch { liste = []; }
    const miens = new Set(ctx.etudiants.map(e => e.id));
    const l = liste.filter(x => miens.has(x.id)).sort(parNom);
    const desc = new Map(ctx.acquis.map(a => [a.aa_code, a.description]));
    let quand = null;
    for (const c of [ctx.code, '']) {
      const r = lire(() => placer([], ctx.annee, 2, ctx.ue, c), null);
      if (r?.passages?.length) { quand = r.passages.map(p => `${phraseDate(p)}${p.partie ? ` (${p.partie})` : ''}`).join(' ; '); break; }
    }
    quand ||= phraseDate(dateEpreuve(ctx.annee, 2, ctx.ue, ctx.code));
    const corps = `<div class="tg">Examen de seconde session : ${esc(quand)} <span>— ${l.length} étudiant(s)</span></div>
      ${tableau([{ t: 'N°', w: '9mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '26mm' }, { t: 'Acquis à représenter' }],
        l.map((e, k) => `<tr><td>${k + 1}</td><td>${nomHtml(e)}</td><td>${esc(e.id_ecampus || '')}</td><td>${(e.aas || []).map(a => `<b>${esc(a)}</b>${desc.get(a) ? ` <span class="gris">${esc(desc.get(a))}</span>` : ''}`).join('<br>') || 'tout le cours'}</td></tr>`),
        { vide: 'Aucun de vos étudiants n’est ajourné dans ce cours (ou la délibération de première session n’a pas eu lieu).' })}`;
    return { titre: 'Étudiants en seconde session', corps,
      feuilles: [{ nom: 'Seconde session', entete: `Examen : ${quand}`, colonnes: ['N°', 'NOM Prénom', 'Matricule', 'Acquis à représenter'],
        lignes: l.map((e, k) => [k + 1, nomDe(e), e.id_ecampus || '', (e.aas || []).join(', ')]) }] };
  },

  /* 4. LES DISPENSÉS : l'unité, le cours, ou des acquis du cours. */
  async dispenses(ctx) {
    const disp = lire(() => dispensesDeLUE(ctx.ue, ctx.annee), new Map());
    const parAA = new Map();
    lire(() => {
      for (const v of db.prepare(`SELECT etudiant_id, porte, cible_detail FROM etudiant_valorisation
          WHERE ue_num = ? AND annee_scolaire = ? AND type = 'partielle' AND cible = 'aa' AND ${vaRetenue()}`).all(ctx.ue, ctx.annee)) {
        const aas = String(v.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean);
        const ici = ctx.acquis.length ? aas.filter(a => ctx.acquis.some(x => x.aa_code === a)) : [];
        if (!ici.length) continue;
        const o = parAA.get(v.etudiant_id) || { lib: v.porte === 'vae' ? 'VAE partielle' : 'VA partielle', aas: [] };
        o.aas.push(...ici); parAA.set(v.etudiant_id, o);
      }
    });
    const lignes = [];
    for (const e of [...ctx.etudiants].sort(parNom)) {
      const d = disp.get(e.id);
      if (d?.ue) lignes.push({ e, nature: d.ue, quoi: 'L’unité entière : ni cours, ni examen.' });
      else if (d?.cours.has(ctx.code)) lignes.push({ e, nature: d.cours.get(ctx.code), quoi: 'Tout ce cours : il ne le suit pas, il ne le présente pas.' });
      else if (parAA.has(e.id)) {
        const o = parAA.get(e.id);
        lignes.push({ e, nature: o.lib, quoi: `Les acquis ${[...new Set(o.aas)].join(', ')} ne lui sont pas demandés ; le reste du cours se suit et s’évalue.` });
      }
    }
    const corps = tableau([{ t: 'N°', w: '9mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '24mm' }, { t: 'Dispense', w: '30mm' }, { t: 'Ce qui ne lui est pas demandé' }],
      lignes.map((l, k) => `<tr><td>${k + 1}</td><td>${nomHtml(l.e)}</td><td>${esc(l.e.id_ecampus || '')}</td><td>${esc(l.nature)}</td><td>${esc(l.quoi)}</td></tr>`),
      { vide: 'Aucun de vos étudiants n’est dispensé dans ce cours.' })
      + '<div class="note">VA, VAE : valorisation des acquis de l’unité entière · VAP, VAEP : valorisation partielle par cours · report : cours réussi une année précédente, notes reprises d’office.</div>';
    return { titre: 'Étudiants dispensés', corps,
      feuilles: [{ nom: 'Dispensés', colonnes: ['N°', 'NOM Prénom', 'Matricule', 'Dispense', 'Ce qui ne lui est pas demandé'],
        lignes: lignes.map((l, k) => [k + 1, nomDe(l.e), l.e.id_ecampus || '', l.nature, l.quoi]) }] };
  },

  /* 5. LE RELEVÉ DE NOTES DU COURS. */
  async releve(ctx) {
    const s = ctx.session;
    const L = notesDuCours(ctx, s);
    const aas = ctx.acquis.length ? ctx.acquis.map(a => a.aa_code) : [''];
    const closes = L.filter(l => l.source === 'délibérée').length;
    const ligne = !L.length ? null : closes === L.length ? 'Notes délibérées' : closes ? `Mixte : ${closes} notes délibérées, ${L.length - closes} en feuille de travail`
      : 'Feuille de travail — propositions de l’enseignant, non délibérées';
    const cell = v => (v.mention ? `<span class="mention">${esc(v.mention)}</span>` : v.note == null ? '' : `<span class="${v.note < 10 ? 'bas' : ''}">${num(v.note)}</span>`);
    const justifs = [];
    const lignes = L.map((l, k) => {
      for (const aa of aas) if (l.parAA[aa].justif && (l.parAA[aa].mention || (l.parAA[aa].note != null && l.parAA[aa].note < 10))) {
        justifs.push(`<b>${esc(nomDe(l.e))}</b> — ${esc(aa || 'cours')} : ${esc(l.parAA[aa].justif)}`);
      }
      const hors = aa => s === 2 && l.aa_ouverts && aa && !l.aa_ouverts.includes(aa);
      return `<tr><td>${k + 1}</td><td>${nomHtml(l.e)}</td><td>${esc(l.e.id_ecampus || '')}</td>${aas.map(aa => `<td class="c">${hors(aa) ? '<span class="gris">—</span>' : cell(l.parAA[aa])}</td>`).join('')}
        <td class="c"><b>${l.mention ? `<span class="mention">${esc(l.mention)}</span>` : l.cours == null ? '' : `<span class="${Math.round(l.cours) < 10 ? 'bas' : ''}">${num(l.cours)}</span>`}</b></td>
        <td class="gris">${l.source}</td></tr>`;
    });
    const corps = tableau([{ t: 'N°', w: '8mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '22mm' },
      ...aas.map(aa => ({ t: aa ? `${esc(aa)}<small>${(() => { const a = ctx.acquis.find(x => x.aa_code === aa); return a?.poids != null ? `poids ${num(a.poids)}` : ''; })()}</small>` : 'Note', c: 'c', w: '16mm' })),
      { t: 'Cours<small>indicative</small>', c: 'c', w: '18mm' }, { t: 'Source', w: '20mm' }], lignes,
    { vide: s === 2 ? 'Aucun étudiant en seconde session dans ce cours.' : 'Aucun étudiant.' })
      + `<div class="note">PP pas présenté · NP note de présence · CM certificat médical. La note du cours est indicative (moyenne des acquis pondérée par leur poids dans le cours) ; c’est la note par acquis qui compte.${s === 2 ? ' « — » : acquis non représenté en seconde session.' : ''}</div>`
      + (justifs.length ? `<div class="intertitre">Justificatifs des notes sous 10</div><div class="note">${justifs.join('<br>')}</div>` : '');
    return { titre: `Relevé de notes — ${s === 2 ? 'seconde' : 'première'} session`, ligne, corps,
      feuilles: [{ nom: `Relevé S${s}`, entete: ligne, colonnes: ['N°', 'NOM Prénom', 'Matricule', ...aas.map(aa => aa || 'Note'), 'Note du cours (indicative)', 'Source', 'Justificatifs'],
        lignes: L.map((l, k) => [k + 1, nomDe(l.e), l.e.id_ecampus || '', ...aas.map(aa => l.parAA[aa].mention || (l.parAA[aa].note ?? '')),
          l.mention || (l.cours == null ? '' : Math.round(l.cours * 10) / 10), l.source,
          aas.filter(aa => l.parAA[aa].justif).map(aa => `${aa || 'cours'} : ${l.parAA[aa].justif}`).join(' | ')]) }] };
  },

  /* 6. LES RÉSULTATS APRÈS DÉLIBÉRATION (séance close pour l'étudiant). */
  async resultats(ctx) {
    const insc = new Map(lire(() => db.prepare('SELECT etudiant_id, resultat FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ?')
      .all(ctx.annee, ctx.ue).map(x => [x.etudiant_id, x.resultat]), []));
    const faveurs = new Set(lire(() => db.prepare(`SELECT etudiant_id FROM deliberation_ajustement WHERE annee_scolaire = ? AND ue_num = ?
      AND portee = 'ue' AND action = 'faveur'`).all(ctx.annee, ctx.ue).map(x => x.etudiant_id), []));
    const L = []; let ouverts = 0;
    for (const e of [...ctx.etudiants].sort(parNom)) {
      const session = ctx.close(2, e.id) ? 2 : ctx.close(1, e.id) ? 1 : 0;
      if (!session) { ouverts++; continue; }
      const d = lire(() => delibererUE(e.id, ctx.ue, ctx.annee, session), null);
      const r = insc.get(e.id) || null;
      const faveur = faveurs.has(e.id) || !!d?.ue?.faveur_ue;
      const c = (d?.cours || []).find(x => x.cours_code === ctx.code);
      L.push({ e, session, r, faveur, ue: d?.ue?.note_calculee ?? null, cours: c ? (c.mention || c.note_calculee) : null });
    }
    const MOT = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé', abandon: 'Abandon' };
    const motDe = l => (l.faveur && l.r === 'reussi' ? 'Réussi (faveur)' : MOT[l.r] || (l.r ? l.r : 'décision non encodée'));
    const classe = l => (l.r === 'reussi' ? '' : l.r === 'ajourne' ? 'mention' : l.r === 'refuse' ? 'bas' : 'gris');
    const compte = k => L.filter(l => l.r === k).length;
    const corps = tuiles([tuile(L.length, 'étudiants délibérés'), tuile(compte('reussi'), 'réussis', `dont ${L.filter(l => l.faveur && l.r === 'reussi').length} par faveur`, T.reussi),
      tuile(compte('ajourne'), 'ajournés', null, T.attente), tuile(compte('refuse'), 'refusés', null, T.corriger)])
      + tableau([{ t: 'N°', w: '8mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '22mm' }, { t: 'Session', c: 'c', w: '16mm' }, { t: 'Décision de l’unité', w: '36mm' },
        { t: 'Note d’unité', c: 'c', w: '18mm' }, { t: 'Votre cours', c: 'c', w: '18mm' }],
      L.map((l, k) => `<tr><td>${k + 1}</td><td>${nomHtml(l.e)}</td><td>${esc(l.e.id_ecampus || '')}</td><td class="c">S${l.session}</td>
        <td><span class="${classe(l)}">${esc(motDe(l))}</span></td><td class="c">${l.ue == null ? '' : num(l.ue, 0)}</td>
        <td class="c">${typeof l.cours === 'string' ? `<span class="mention">${esc(l.cours)}</span>` : l.cours == null ? '' : num(l.cours)}</td></tr>`),
      { vide: 'Aucune séance de délibération n’est close pour vos étudiants.' })
      + `<div class="note">Cotes de travail du Conseil : elles ne figurent telles quelles sur aucune pièce remise à l’étudiant (NA sous 10).${ouverts ? ` ${ouverts} étudiant(s) dont la séance n’est pas encore close ne figurent pas ici.` : ''}</div>`;
    return { titre: 'Résultats après délibération', corps,
      feuilles: [{ nom: 'Résultats', colonnes: ['N°', 'NOM Prénom', 'Matricule', 'Session', 'Décision', 'Note d’unité', 'Note du cours'],
        lignes: L.map((l, k) => [k + 1, nomDe(l.e), l.e.id_ecampus || '', l.session, motDe(l), l.ue == null ? '' : Math.round(l.ue), l.cours == null ? '' : (typeof l.cours === 'string' ? l.cours : Math.round(l.cours * 10) / 10)]) }] };
  },

  /* 7 à 10. LES STATISTIQUES DU COURS. */
  async statistiques(ctx) {
    const s = ctx.session;
    const L = notesDuCours(ctx, s);
    const notes = L.filter(l => l.cours != null && !l.mention).map(l => l.cours);
    const tri = [...notes].sort((a, b) => a - b);
    const moyenne = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : null;
    const mediane = !tri.length ? null : tri.length % 2 ? tri[(tri.length - 1) / 2] : (tri[tri.length / 2 - 1] + tri[tri.length / 2]) / 2;
    const reussis = L.filter(reussit).length;
    const evalues = L.filter(l => l.cours != null || l.mention).length;
    const mentions = ['PP', 'NP', 'CM'].map(m => [m, L.filter(l => l.mention === m).length]);

    // 7. L'histogramme, par tranches de deux points (la dernière ferme sur 20).
    const tranches = Array.from({ length: 10 }, (_, i) => ({ de: i * 2, n: 0 }));
    for (const n of notes) tranches[Math.min(9, Math.floor(Math.max(0, n) / 2))].n++;
    const max = Math.max(1, ...tranches.map(t => t.n));
    const W = 170, H = 58, bw = W / 10;
    const histo = `<svg width="${W}mm" height="${H + 10}mm" viewBox="0 0 ${W} ${H + 10}" xmlns="http://www.w3.org/2000/svg" style="display:block">
      <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="#CBD5E1" stroke-width=".3"/>
      ${tranches.map((t, i) => { const h = t.n / max * (H - 6); return `<rect x="${i * bw + 1.5}" y="${H - h}" width="${bw - 3}" height="${h}" rx=".8" fill="${t.de >= 10 ? T.reussi : T.corriger}" fill-opacity=".8"/>
        ${t.n ? `<text x="${i * bw + bw / 2}" y="${H - h - 1.5}" font-size="3.4" text-anchor="middle" fill="${T.marine}" font-family="Arial">${t.n}</text>` : ''}
        <text x="${i * bw + bw / 2}" y="${H + 5}" font-size="3.2" text-anchor="middle" fill="#475569" font-family="Arial">${t.de}–${t.de + 2}</text>`; }).join('')}
    </svg>`;

    // 8. Le taux d'échec par acquis.
    const parAA = ctx.acquis.map(a => {
      const v = L.map(l => l.parAA[a.aa_code]).filter(x => x && (x.note != null || x.mention));
      const echecs = v.filter(x => x.mention || x.note < 10).length;
      return { a, n: v.length, echecs, taux: v.length ? echecs / v.length : null };
    }).sort((x, y) => (y.taux ?? -1) - (x.taux ?? -1));

    // 9. Présence et réussite : les heures présentes sur les heures dues.
    let g = null;
    try { g = donneesGrille({ seances: ctx.seances, etudiants: ctx.etudiants, dispensesParEtudiant: dispensesUE(ctx.etudiants, ctx.ue, ctx.annee) }); } catch { g = null; }
    const taux = new Map((g?.lignes || []).filter(l => l.du > 0).map(l => [l.etudiant.id, l.present / l.du]));
    const groupe = (filtre) => { const x = L.filter(l => (l.cours != null || l.mention) && taux.has(l.e.id) && filtre(taux.get(l.e.id))); return { n: x.length, r: x.filter(reussit).length }; };
    const assidus = groupe(t => t >= 0.9), autres = groupe(t => t < 0.9);

    // 10. Les années précédentes (même cours), et les groupes.
    const annees = [];
    for (const y of lire(() => db.prepare(`SELECT DISTINCT annee_scolaire a, ue_num FROM cours WHERE cours_code = ? AND annee_scolaire < ?
        ORDER BY annee_scolaire DESC LIMIT 3`).all(ctx.code, ctx.annee), [])) {
      const ids = lire(() => db.prepare('SELECT DISTINCT etudiant_id id FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ?').all(y.a, y.ue_num), []);
      const ns = [];
      for (const { id } of ids) {
        const d = lire(() => delibererUE(id, y.ue_num, y.a, 1), null);
        const c = (d?.cours || []).find(x => x.cours_code === ctx.code);
        if (c?.note_calculee != null) ns.push(Number(c.note_calculee));
      }
      if (ns.length) annees.push({ annee: y.a, n: ns.length, moyenne: ns.reduce((a, b) => a + b, 0) / ns.length, reussite: ns.filter(v => Math.round(v) >= 10).length / ns.length });
    }
    annees.reverse();
    if (evalues) annees.push({ annee: `${ctx.annee} (cette année)`, n: evalues, moyenne, reussite: reussis / evalues });
    const parGroupe = new Map();
    for (const l of L) {
      for (const gr of String(l.e.groupe || '').split(' + ').map(x => x.trim()).filter(Boolean)) {
        if (!parGroupe.has(gr)) parGroupe.set(gr, []);
        parGroupe.get(gr).push(l);
      }
    }
    const groupes = [...parGroupe.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true })).map(([nom, l]) => {
      const ns = l.filter(x => x.cours != null && !x.mention).map(x => x.cours);
      return { nom, n: l.length, moyenne: ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null, reussite: l.filter(x => x.cours != null || x.mention).length ? l.filter(reussit).length / l.filter(x => x.cours != null || x.mention).length : null };
    });

    const corps = `
      ${tuiles([tuile(L.length, 'étudiants'), tuile(evalues, 'notés', mentions.filter(([, n]) => n).map(([m, n]) => `${n} ${m}`).join(' · ') || null),
        tuile(moyenne == null ? '—' : num(moyenne), 'moyenne du cours', mediane == null ? null : `médiane ${num(mediane)}`),
        tuile(evalues ? pc(reussis / evalues) : '—', 'de réussite (≥ 10)', `${reussis} sur ${evalues}`, T.reussi)])}
      <div class="bloc"><div class="intertitre">Répartition des notes du cours</div>${notes.length ? histo : '<div class="note">Aucune note.</div>'}</div>
      <div class="bloc"><div class="intertitre">Les acquis qui font échouer</div>
        ${parAA.length ? barres(parAA.map(x => ({ nom: `<b>${esc(x.a.aa_code)}</b> <span class="gris">${esc(String(x.a.description || '').slice(0, 60))}</span>`,
          valeur: x.taux || 0, couleur: T.corriger, texte: x.taux == null ? 'non évalué' : `${pc(x.taux)} (${x.echecs}/${x.n})` })), 1)
        : '<div class="note">Aucun acquis rattaché à ce cours.</div>'}</div>
      <div class="bloc"><div class="intertitre">Présence et réussite</div>
        ${assidus.n + autres.n ? barres([
          { nom: 'Présents à 90 % ou plus', valeur: assidus.n ? assidus.r / assidus.n : 0, couleur: T.reussi, texte: assidus.n ? `${pc(assidus.r / assidus.n)} de réussite (${assidus.r}/${assidus.n})` : 'aucun' },
          { nom: 'Présents à moins de 90 %', valeur: autres.n ? autres.r / autres.n : 0, couleur: T.attente, texte: autres.n ? `${pc(autres.r / autres.n)} de réussite (${autres.r}/${autres.n})` : 'aucun' }], 1)
          + '<div class="note">Présence = heures présentes sur les heures dues des séances tenues de vos séances de ce cours (dispenses hors compte).</div>'
        : '<div class="note">Pas assez de présences encodées pour comparer.</div>'}</div>
      <div class="bloc"><div class="intertitre">D’une année à l’autre</div>
        ${annees.length ? tableau([{ t: 'Année' }, { t: 'Étudiants notés', c: 'n' }, { t: 'Moyenne', c: 'n' }, { t: 'Réussite', c: 'n' }],
          annees.map(a => `<tr><td>${esc(a.annee)}</td><td class="n">${a.n}</td><td class="n">${a.moyenne == null ? '—' : num(a.moyenne)}</td><td class="n">${pc(a.reussite)}</td></tr>`))
          + '<div class="note">Années précédentes : notes délibérées de première session (tous les inscrits de l’unité).</div>'
        : '<div class="note">Aucune donnée pour ce cours les années précédentes.</div>'}</div>
      ${groupes.length > 1 ? `<div class="bloc"><div class="intertitre">Par groupe</div>${tableau([{ t: 'Groupe' }, { t: 'Étudiants', c: 'n' }, { t: 'Moyenne', c: 'n' }, { t: 'Réussite', c: 'n' }],
        groupes.map(x => `<tr><td>${esc(x.nom)}</td><td class="n">${x.n}</td><td class="n">${x.moyenne == null ? '—' : num(x.moyenne)}</td><td class="n">${x.reussite == null ? '—' : pc(x.reussite)}</td></tr>`))}</div>` : ''}`;
    return { titre: `Statistiques du cours — ${s === 2 ? 'seconde' : 'première'} session`, corps,
      feuilles: [
        { nom: 'Synthèse', colonnes: ['Indicateur', 'Valeur'], lignes: [['Étudiants', L.length], ['Notés', evalues], ['Moyenne', moyenne == null ? '' : Math.round(moyenne * 10) / 10],
          ['Médiane', mediane == null ? '' : Math.round(mediane * 10) / 10], ['Réussis (≥ 10)', reussis], ...mentions] },
        { nom: 'Répartition', colonnes: ['Tranche', 'Étudiants'], lignes: tranches.map(t => [`${t.de}–${t.de + 2}`, t.n]) },
        { nom: 'Acquis', colonnes: ['Acquis', 'Énoncé', 'Évalués', 'Échecs', 'Taux d’échec'], lignes: parAA.map(x => [x.a.aa_code, x.a.description || '', x.n, x.echecs, x.taux == null ? '' : Math.round(x.taux * 1000) / 10]) },
        { nom: 'Années', colonnes: ['Année', 'Notés', 'Moyenne', 'Réussite %'], lignes: annees.map(a => [a.annee, a.n, a.moyenne == null ? '' : Math.round(a.moyenne * 10) / 10, Math.round(a.reussite * 1000) / 10]) },
        { nom: 'Groupes', colonnes: ['Groupe', 'Étudiants', 'Moyenne', 'Réussite %'], lignes: groupes.map(x => [x.nom, x.n, x.moyenne == null ? '' : Math.round(x.moyenne * 10) / 10, x.reussite == null ? '' : Math.round(x.reussite * 1000) / 10]) },
      ] };
  },

  /* 11. LA LISTE D'APPEL PAR GROUPE, six séances. */
  async appel(ctx) {
    const groupesDe = e => String(e.groupe || '').split(' + ').map(x => x.trim()).filter(Boolean);
    const tous = [...new Set(ctx.etudiants.flatMap(groupesDe))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
    const gs = tous.length ? tous : [''];
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const prochaines = (ctx.seances || []).filter(x => !x.annule && x.date >= aujourdhui).slice(0, 6);
    const tetes = Array.from({ length: 6 }, (_, i) => (prochaines[i] ? `${fr(prochaines[i].date).slice(0, 5)}<small>${String(prochaines[i].heure_debut || '').slice(0, 5)}</small>` : '&nbsp;'));
    const corps = gs.map((g, i) => {
      const lot = ctx.etudiants.filter(e => !g || groupesDe(e).includes(g)).sort(parNom);
      return `<div class="${i ? 'saut' : ''}"><div class="tg">${esc(g || 'Tous les étudiants')} <span>— ${lot.length} étudiant(s)</span></div>
        ${tableau([{ t: 'N°', w: '8mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '24mm' }, ...tetes.map(t => ({ t, c: 'c', w: '19mm' }))],
          lot.map((e, k) => `<tr><td>${k + 1}</td><td>${nomHtml(e)}</td><td>${esc(e.id_ecampus || '')}</td>${tetes.map(() => '<td class="k"></td>').join('')}</tr>`),
          { classe: 'haut cases', vide: 'Aucun étudiant dans ce groupe.' })}
        <div class="note">P présent · A absent · J justifié · P* en retard.</div></div>`;
    }).join('');
    return { titre: 'Liste d’appel', corps, feuilles: [] };
  },

  /* 12. LES ADRESSES D'ÉCOLE. */
  async adresses(ctx) {
    const mails = emailsDe(ctx.etudiants.map(e => e.id));
    const l = [...ctx.etudiants].sort(parNom);
    const mail = e => e.email_ecole || mails.get(e.id) || '';
    return { titre: 'Adresses d’école', corps: tableau([{ t: 'N°', w: '9mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '24mm' }, { t: 'Adresse d’école' }, { t: 'Groupe', w: '34mm' }],
      l.map((e, k) => `<tr><td>${k + 1}</td><td>${nomHtml(e)}</td><td>${esc(e.id_ecampus || '')}</td><td>${esc(mail(e)) || '<span class="gris">—</span>'}</td><td class="gris">${esc(e.groupe || '')}</td></tr>`))
      + (l.some(e => !mail(e)) ? '<div class="note">« — » : pas encore d’adresse d’école au dossier.</div>' : ''),
    feuilles: [{ nom: 'Adresses', colonnes: ['N°', 'NOM', 'Prénom', 'Matricule', 'Adresse d’école', 'Groupe'],
      lignes: l.map((e, k) => [k + 1, String(e.nom || '').toLocaleUpperCase('fr'), e.prenom || '', e.id_ecampus || '', mail(e), e.groupe || '']) }] };
  },

  /* 13. LES AMÉNAGEMENTS RAISONNABLES — les mesures accordées, rien d'autre (la règle de la feuille de Mes cours). */
  async amenagements(ctx) {
    const par = new Map();
    lire(() => {
      for (const x of db.prepare(`
        SELECT d.etudiant_id, m.libelle, m.precisions
        FROM amenagement_dossier d JOIN amenagement_mesure m ON m.dossier_id = d.id
        WHERE d.annee_scolaire = ? AND d.statut IN ('accepte','partiel','recours') AND m.accorde = 1
          AND (m.ue_num IS NULL OR m.ue_num = ?)
          AND (NOT EXISTS (SELECT 1 FROM amenagement_ue u WHERE u.dossier_id = d.id)
               OR EXISTS (SELECT 1 FROM amenagement_ue u WHERE u.dossier_id = d.id AND u.ue_num = ?))
        ORDER BY m.libelle`).all(ctx.annee, ctx.ue, ctx.ue)) {
        if (!par.has(x.etudiant_id)) par.set(x.etudiant_id, []);
        par.get(x.etudiant_id).push(x);
      }
    });
    const l = ctx.etudiants.filter(e => par.has(e.id)).sort(parNom);
    return { titre: 'Aménagements raisonnables', corps: tableau([{ t: 'N°', w: '9mm' }, { t: 'NOM Prénom', w: '55mm' }, { t: 'Matricule', w: '24mm' }, { t: 'Mesures accordées' }],
      l.map((e, k) => `<tr><td>${k + 1}</td><td>${nomHtml(e)}</td><td>${esc(e.id_ecampus || '')}</td><td>${par.get(e.id).map(m => `${esc(m.libelle)}${m.precisions ? ` <span class="gris">— ${esc(m.precisions)}</span>` : ''}`).join('<br>')}</td></tr>`),
      { vide: 'Aucun de vos étudiants n’a d’aménagement accordé pour cette unité.' })
      + '<div class="note">Seules les mesures accordées vous sont communiquées : la situation de l’étudiant et son dossier restent couverts par le secret professionnel (décret du 30 juin 2016, art. 5). Ne pas diffuser cette liste.</div>',
    feuilles: [] };
  },

  /* 14. LE RÉCAPITULATIF DES PRÉSENCES. */
  async presences(ctx) {
    let g = null;
    try { g = donneesGrille({ seances: ctx.seances, etudiants: ctx.etudiants, dispensesParEtudiant: dispensesUE(ctx.etudiants, ctx.ue, ctx.annee) }); } catch { g = null; }
    const reg = lire(() => reglagesPresenceQr(), {});
    const s1 = Number(reg.seuil_absence_pct ?? 10), s2 = Number(reg.seuil_global_pct ?? 40);
    const base = reg.seuil_global_base || 'injustifiees';
    const L = (g?.lignes || []).map(l => {
      const tInj = l.du ? l.absent / l.du : null;
      const tTot = l.du ? (base === 'injustifiees' ? l.absent : l.absent + l.justifie) / l.du : null;
      return { l, tInj, tTot, alerte: [tInj != null && tInj * 100 > s1 ? `> ${s1} % injustifiées` : null, tTot != null && tTot * 100 > s2 ? `> ${s2} % (seuil global)` : null].filter(Boolean) };
    }).sort((a, b) => parNom(a.l.etudiant, b.l.etudiant));
    const tenues = (g?.seances || []).filter(x => !x.annule && x.date <= new Date().toISOString().slice(0, 10)).length;
    const corps = tuiles([tuile(tenues, 'séances tenues'), tuile(L.length, 'étudiants'), tuile(L.filter(x => x.alerte.length).length, 'au-delà d’un seuil', `${s1} % injustifiées · ${s2} % global`, T.corriger),
      tuile(g?.non_encodees || 0, 'cases non encodées', null, T.attente)])
      + tableau([{ t: 'N°', w: '8mm' }, { t: 'NOM Prénom' }, { t: 'Matricule', w: '22mm' }, { t: 'Dues', c: 'n' }, { t: 'Présentes', c: 'n' }, { t: 'Justifiées', c: 'n' },
        { t: 'Injustifiées', c: 'n' }, { t: 'Non encodées', c: 'n' }, { t: 'Taux inj.', c: 'n' }, { t: 'Toutes abs.', c: 'n' }, { t: 'Signalé', w: '38mm' }],
      L.map((x, k) => `<tr><td>${k + 1}</td><td>${nomHtml(x.l.etudiant)}</td><td>${esc(x.l.etudiant.id_ecampus || '')}</td><td class="n">${hm(x.l.du)}</td>
        <td class="n">${hm(x.l.present)}</td><td class="n">${hm(x.l.justifie)}</td><td class="n">${hm(x.l.absent)}</td><td class="n">${x.l.non_encodees || ''}</td>
        <td class="n">${x.tInj == null ? '—' : pc(x.tInj)}</td><td class="n">${x.tTot == null ? '—' : pc(x.tTot)}</td><td>${x.alerte.length ? `<span class="bas">${esc(x.alerte.join(' · '))}</span>` : ''}</td></tr>`),
      { vide: 'Aucune séance tenue avec des présences pour ce cours.' })
      + `<div class="note">Heures des séances tenues de vos séances de ce cours ; les activités dispensées sont hors compte. Seuils de l’école : ${s1} % d’absences injustifiées ; ${s2} % ${base === 'injustifiees' ? 'd’absences sans motif valable' : 'de toutes absences'} (RGE, art. 6).</div>`;
    return { titre: 'Récapitulatif des présences', corps,
      feuilles: [{ nom: 'Présences', colonnes: ['N°', 'NOM Prénom', 'Matricule', 'Heures dues', 'Présentes', 'Justifiées', 'Injustifiées', 'Séances non encodées', 'Taux injustifiées %', 'Toutes absences %', 'Signalé'],
        lignes: L.map((x, k) => [k + 1, nomDe(x.l.etudiant), x.l.etudiant.id_ecampus || '', Math.round(x.l.du / 6) / 10, Math.round(x.l.present / 6) / 10, Math.round(x.l.justifie / 6) / 10,
          Math.round(x.l.absent / 6) / 10, x.l.non_encodees || 0, x.tInj == null ? '' : Math.round(x.tInj * 1000) / 10, x.tTot == null ? '' : Math.round(x.tTot * 1000) / 10, x.alerte.join(' · ')]) }] };
  },

  /* 15. LA FICHE DU COURS (la lecture de `GET /:cours/fiche`, et le programme du dossier pédagogique). */
  async fiche(ctx) {
    const c = lire(() => db.prepare(`SELECT cours_code, cours_nom, ue_num, ct_pp, cours_per, cours_autonomie, ue_autonomie, cours_ev1, cours_vc1, heures
      FROM cours WHERE cours_code = ? AND annee_scolaire = ? LIMIT 1`).get(ctx.code, ctx.annee), null) || {};
    const ue = lire(() => db.prepare('SELECT ue_num, ue_nom, section, ects FROM ue WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1').get(ctx.ue, ctx.annee), null) || {};
    ue.ue_dp = lire(() => db.prepare(`SELECT ue_dp FROM ue WHERE ue_num = ? AND annee_scolaire = ? AND ue_dp IS NOT NULL AND ue_dp <> ''
      ORDER BY (section = ?) DESC LIMIT 1`).get(ctx.ue, ctx.annee, ue.section || '')?.ue_dp, null);
    const placee = lire(() => db.prepare(`SELECT SUM(g.autonomie_placee) s FROM grille_cours g JOIN organisation_ue o ON o.id = g.organisation_id
      WHERE g.cours_code = ? AND o.annee_scolaire = ?`).get(ctx.code, ctx.annee)?.s ?? null, null);
    const somme = ctx.acquis.reduce((x, a) => x + (Number(a.poids) || 0), 0);
    let programme = null;
    if (ue.ue_dp) {
      const noms = lire(() => db.prepare(`SELECT cours_nom FROM cours WHERE ue_num = ? AND annee_scolaire = ? AND UPPER(COALESCE(ct_pp, '')) <> 'Z' ORDER BY cours_code`)
        .all(ctx.ue, ctx.annee).map(x => x.cours_nom).filter(Boolean), []);
      programme = lire(() => {
        const R = rubriquesDuDossier(ue.ue_dp, noms);
        const P = decouperProgramme(R.Programme || '', noms);
        return P.cours.find(x => memeCours(x.nom, c.cours_nom || ''))?.texte || null;
      }, null);
    }
    const texte = t => {
      const out = []; let ul = false;
      for (const l of String(t || '').split('\n')) {
        const x = l.trim(); if (!x) { if (ul) { out.push('</ul>'); ul = false; } continue; }
        if (/^[-–•]\s+/.test(x)) { if (!ul) { out.push('<ul>'); ul = true; } out.push(`<li>${esc(x.replace(/^[-–•]\s+/, ''))}</li>`); }
        else { if (ul) { out.push('</ul>'); ul = false; } out.push(`<p>${esc(x)}</p>`); }
      }
      if (ul) out.push('</ul>');
      return out.join('');
    };
    const evaluation = (Number(c.cours_ev1) || 0) + (Number(c.cours_vc1) || 0);
    const corps = `<div class="tg">UE ${esc(ue.ue_num ?? ctx.ue)} — ${esc(ue.ue_nom || '')} <span>${[ue.section, ue.ects ? `${num(ue.ects)} ECTS` : null, c.ct_pp].filter(Boolean).map(esc).join(' · ')}</span></div>
      ${tuiles([tuile(num(c.cours_per), 'périodes de cours'), tuile(num(c.cours_autonomie), 'périodes d’autonomie', placee != null ? `${num(placee)} placée(s) dans la grille de l’année` : `UE : ${num(c.ue_autonomie)} au total`),
        tuile(num(evaluation), 'heures d’évaluation', `examens ${num(c.cours_ev1)} · remédiation ${num(c.cours_vc1)}`), tuile(num(c.heures), 'heures (grille étudiant)')])}
      <div class="intertitre">Acquis d’apprentissage évalués dans ce cours</div>
      ${tableau([{ t: 'Acquis', w: '22mm' }, { t: 'Énoncé' }, { t: 'Poids', c: 'n', w: '16mm' }, { t: 'Part', c: 'n', w: '16mm' }],
        ctx.acquis.map(a => `<tr><td><b>${esc(a.aa_code)}</b></td><td>${esc(a.description || '')}</td><td class="n">${num(a.poids)}</td><td class="n">${somme && a.poids != null ? `${num(Number(a.poids) / somme * 100)} %` : ''}</td></tr>`),
        { vide: 'Aucun acquis rattaché à ce cours pour cette année.' })}
      <div class="intertitre">Programme du cours — dossier pédagogique</div>
      <div class="programme">${programme ? texte(programme) : '<p class="gris">Le dossier pédagogique ne détaille pas le programme de ce cours.</p>'}</div>`;
    return { titre: 'Fiche du cours', corps, feuilles: [] };
  },

  /* 16. MON HORAIRE DE L'ANNÉE : toutes mes séances (tous mes cours), et mes examens et délibérations, mois par mois. */
  async horaire(ctx) {
    const items = [
      ...(ctx.toutesSeances || []).map(x => ({ date: x.date, heure: String(x.heure_debut || '').slice(0, 5), fin: String(x.heure_fin || '').slice(0, 5),
        quoi: `${x.cours_code}${x.cours_nom ? ` · ${x.cours_nom}` : ''}${x.matiere && x.matiere !== x.cours_nom ? ` — ${x.matiere}` : ''}`, lieu: x.local_texte || '', annule: !!x.annule, type: 'Cours' })),
      ...(ctx.dates || []).map(x => ({ date: x.date, heure: x.heure ? String(x.heure).slice(0, 5) : '', fin: '', quoi: x.titre, lieu: x.lieu || '', annule: false,
        type: x.type === 'deliberation' ? 'Délibération' : 'Examen' })),
    ].filter(x => x.date).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
    const parMois = new Map();
    for (const x of items) { const k = String(x.date).slice(0, 7); if (!parMois.has(k)) parMois.set(k, []); parMois.get(k).push(x); }
    const corps = [...parMois.entries()].map(([k, l]) => `<div class="mois">${MOIS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}</div>
      ${tableau([{ t: 'Jour', w: '24mm' }, { t: 'Heure', w: '22mm' }, { t: 'Quoi' }, { t: 'Local / lieu', w: '40mm' }],
        l.map(x => `<tr${x.annule ? ' style="text-decoration:line-through;color:#94a3b8"' : ''}><td>${JOURS[new Date(`${x.date}T12:00:00Z`).getUTCDay()]} ${fr(x.date).slice(0, 5)}</td>
          <td>${esc(x.heure)}${x.fin ? `–${esc(x.fin)}` : ''}</td><td>${x.type !== 'Cours' ? `<b>${esc(x.type)}</b> · ` : ''}${esc(x.quoi)}${x.annule ? ' (annulée)' : ''}</td><td>${esc(x.lieu)}</td></tr>`))}`).join('')
      || '<div class="note">Aucune séance ni date pour cette année.</div>';
    return { titre: 'Mon horaire de l’année', corps, tousCours: true,
      feuilles: [{ nom: 'Horaire', colonnes: ['Date', 'Début', 'Fin', 'Type', 'Quoi', 'Local / lieu', 'Annulée'],
        lignes: items.map(x => [fr(x.date), x.heure, x.fin, x.type, x.quoi, x.lieu, x.annule ? 'oui' : '']) }] };
  },
};

/** Compose une pièce. `ctx` : { code, annee, ue, ueNom, coursNom, session, etudiants, seconde, acquis, close, seances,
 *  toutesSeances, dates, enseignants }. Rend { titre, sous, ligne, nature, corps, styles, paysage, nom, feuilles } ou null. */
export async function composerEditionProf(id, ctx) {
  const def = pieceEditionProf(id);
  if (!def || !PIECES[id]) return null;
  const x = await PIECES[id](ctx);
  const nature = FAMILLES_EDITIONS_PROF.find(f => f.k === def.famille)?.libelle || 'Mes éditions';
  const sous = x.tousCours
    ? `${ctx.enseignants?.length ? ctx.enseignants.join(', ') : ''}${ctx.enseignants?.length ? ' · ' : ''}${ctx.annee}`
    : `${ctx.code}${ctx.coursNom ? ` · ${ctx.coursNom}` : ''} — UE ${ctx.ue}${ctx.ueNom ? ` ${ctx.ueNom}` : ''} · ${ctx.annee}`;
  const nom = `${def.id}_${x.tousCours ? 'annee' : ctx.code}_${ctx.annee}${def.session ? `_S${ctx.session}` : ''}`.replace(/[^A-Za-z0-9_.-]+/g, '_');
  return { titre: x.titre, sous, ligne: [x.ligne, !x.tousCours && ctx.enseignants?.length ? ctx.enseignants.join(', ') : null].filter(Boolean).join(' · ') || null, nature,
    corps: x.corps, styles: STYLES_EDITIONS, paysage: !!def.paysage, nom, feuilles: x.feuilles || [] };
}

/** Le classeur d'une pièce : une feuille par tableau, l'en-tête en gras. */
export async function classeurEditionProf(p) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lucie';
  for (const f of p.feuilles.length ? p.feuilles : [{ nom: 'Pièce', colonnes: ['—'], lignes: [] }]) {
    const ws = wb.addWorksheet(String(f.nom || 'Feuille').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    ws.addRow([`${p.titre} — ${p.sous}`]).font = { bold: true, size: 12 };
    if (f.entete) ws.addRow([f.entete]).font = { italic: true };
    ws.addRow([]);
    const h = ws.addRow(f.colonnes);
    h.font = { bold: true };
    h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F4F9' } }; c.border = { bottom: { style: 'thin', color: { argb: 'FFD8DCE4' } } }; });
    for (const l of f.lignes) ws.addRow(l);
    ws.columns.forEach((c, i) => { c.width = Math.min(60, Math.max(8, ...[f.colonnes[i], ...f.lignes.map(l => l[i])].map(v => String(v ?? '').length + 2))); });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

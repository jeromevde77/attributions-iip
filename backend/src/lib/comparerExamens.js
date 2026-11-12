// ─────────────────────────────────────────────────────────────────────────────
// COMPARER UN HORAIRE D'EXAMENS (EXCEL) AU CALENDRIER DES SESSIONS (3.5.361, Charles, 12 novembre 2026 : « puis-je envoyer ça dans
// Lucie afin de comparer à ce que nous avons ? » — l'horaire d'examens du campus, toutes écoles confondues, une ligne par épreuve).
// LECTURE SEULE : rien ne s'écrit. Les colonnes se reconnaissent à leur intitulé (SECTION, DATE, DÉBUT, FIN, EXAMEN / COURS, TITULAIRE,
// TYPE, LOCAL 1…n), jamais à leur place. Ne sont gardées que les lignes de NOS sections (OPTO, ORTHO, TIM, PSYCHOMOT, AESI…) et les
// épreuves (pas COURS, FORMATION, RÉUNION). Chaque ligne se rattache à un cours (code « 293.2 »), à une unité (« UE 65 »), sinon au
// cours dont l'intitulé ressemble le plus ; puis se compare à `epreuve_session1` (date, heure, local).
// ─────────────────────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs';
import db from '../db/index.js';

const sans = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VIDES = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'a', 'au', 'aux', 'l', 'd', 'un', 'une', 'pour', 'par', 'sur', 'ue', 'partie', 'cours']);
const mots = t => sans(t).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(m => m.length > 2 && !VIDES.has(m));

/** Les sections de l'école que l'Excel nomme à sa façon. */
const ALIAS = [
  [/^opto/i, 'Optométrie'], [/^ortho/i, 'Orthoptie'], [/^tim\b|imagerie/i, 'TIM'],
  [/^psycho/i, 'Psychomotricité'], [/^aesi|aide.soignant|soins infirm/i, 'AeSI'],
];
function sectionsDe(cellule) {
  const out = new Set();
  for (const morceau of String(cellule || '').split(/[\/,+]/).map(x => x.trim()).filter(Boolean)) {
    for (const [re, code] of ALIAS) if (re.test(morceau)) out.add(code);
  }
  return [...out];
}

const TYPES_HORS = /^(cours|formation|reunion|réunion)$/i;
const valeur = c => {
  const v = c?.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') return v.result ?? (v.richText ? v.richText.map(t => t.text).join('') : v.text ?? null);
  return v;
};
const dateIso = v => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(String(v || ''));
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};
const heure = v => {
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  const m = /(\d{1,2})\s*[hH:.]\s*(\d{2})?/.exec(String(v || ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : null;
};

/** Lit le classeur : les lignes de nos sections, épreuves seulement. */
export async function lireHoraireExamens(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const lignes = [], ignorees = { autres_sections: 0, pas_examen: 0 };
  for (const ws of wb.worksheets) {
    let entete = null, col = {};
    ws.eachRow((row, n) => {
      const vals = row.values.map(c => valeur({ value: c }));
      if (!entete) {
        const t = vals.map(x => sans(x));
        if (t.some(x => x === 'section') && t.some(x => x === 'date')) {
          entete = n;
          t.forEach((x, i) => {
            if (x === 'section') col.section = i;
            else if (x === 'annee') col.annee = i;
            else if (x === 'date') col.date = i;
            else if (/^debut/.test(x)) col.debut ??= i;
            else if (/^fin examen/.test(x)) col.fin ??= i;
            else if (/examen\s*\/\s*cours|^examen$|^cours$|intitule/.test(x)) col.intitule ??= i;
            else if (/^titulaire/.test(x)) col.titulaire ??= i;
            else if (x === 'type') col.type = i;
            else if (/^local/.test(x)) (col.locaux ||= []).push(i);
          });
        }
        return;
      }
      const brut = vals[col.section];
      if (!brut) return;
      const sections = sectionsDe(brut);
      if (!sections.length) { ignorees.autres_sections++; return; }
      const type = String(vals[col.type] || '').trim();
      if (TYPES_HORS.test(type)) { ignorees.pas_examen++; return; }
      const date = dateIso(vals[col.date]);
      if (!date) return;
      lignes.push({ feuille: ws.name, ligne: n, section_excel: String(brut).trim(), sections, bloc: vals[col.annee] ?? null, date,
        debut: heure(vals[col.debut]), fin: heure(vals[col.fin]), intitule: String(vals[col.intitule] || '').trim(),
        titulaire: String(vals[col.titulaire] || '').trim(), type,
        locaux: (col.locaux || []).map(i => String(vals[i] || '').trim()).filter(x => x && !/^\d+$/.test(x)) });
    });
  }
  // Les groupes d'un même atelier (même jour, même heure, même intitulé) font UNE épreuve : leurs locaux se réunissent.
  const fusion = new Map();
  for (const l of lignes) {
    const k = `${l.date}|${l.debut}|${sans(l.intitule)}|${l.sections.join(',')}`;
    if (!fusion.has(k)) fusion.set(k, { ...l, groupes: 1 });
    else { const f = fusion.get(k); f.groupes++; f.locaux = [...new Set([...f.locaux, ...l.locaux])]; }
  }
  return { lignes: [...fusion.values()], ignorees };
}

/** Les cours candidats d'une section pour l'année. */
function coursDesSections(sections, annee) {
  if (!sections.length) return [];
  const ph = sections.map(() => '?').join(',');
  let ues = [];
  try {
    ues = db.prepare(`SELECT DISTINCT ue_num FROM ue WHERE annee_scolaire = ? AND section IN (${ph})
      UNION SELECT DISTINCT ue_num FROM ue_section WHERE section_code IN (${ph})`).all(annee, ...sections, ...sections).map(x => x.ue_num);
  } catch {
    ues = db.prepare(`SELECT DISTINCT ue_num FROM ue WHERE annee_scolaire = ? AND section IN (${ph})`).all(annee, ...sections).map(x => x.ue_num);
  }
  if (!ues.length) return [];
  return db.prepare(`SELECT c.ue_num, c.cours_code, c.cours_nom, (SELECT MAX(ue_nom) FROM ue u WHERE u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire) ue_nom
    FROM cours c WHERE c.annee_scolaire = ? AND c.ue_num IN (${ues.map(() => '?').join(',')})`).all(annee, ...ues);
}

function rattacher(l, candidats) {
  const code = /\b(\d{2,3}\.\d{1,2})\b/.exec(l.intitule)?.[1];
  if (code) {
    const c = candidats.find(x => x.cours_code === code);
    if (c) return { ...c, par: 'code du cours' };
  }
  const ue = Number(/\bUE\s*(\d{2,3})\b/i.exec(l.intitule)?.[1]) || null;
  const pool = ue ? candidats.filter(x => Number(x.ue_num) === ue) : candidats;
  const m = mots(l.intitule.replace(/\bUE\s*\d+\b/i, '').replace(/\b\d{2,3}\.\d{1,2}\b/, ''));
  let mieux = null, score = 0;
  for (const c of pool) {
    const mc = new Set(mots(c.cours_nom));
    if (!mc.size || !m.length) continue;
    const communs = m.filter(x => mc.has(x)).length;
    const s = communs / Math.min(m.length, mc.size);
    if (s > score) { score = s; mieux = c; }
  }
  if (mieux && score >= 0.5) return { ...mieux, par: ue ? 'unité et intitulé' : 'intitulé (à vérifier)' };
  if (ue) return { ue_num: ue, cours_code: '', cours_nom: '', ue_nom: candidats.find(x => Number(x.ue_num) === ue)?.ue_nom || '', par: 'numéro d’unité' };
  return null;
}

/** La comparaison. */
export async function comparerHoraireExamens(buffer, annee) {
  const { lignes, ignorees } = await lireHoraireExamens(buffer);
  let lucie = [];
  try {
    lucie = db.prepare(`SELECT ue_num, COALESCE(cours_code, '') cours_code, s1_date, s1_heure, s1_local FROM epreuve_session1
      WHERE annee_scolaire = ? AND s1_date IS NOT NULL AND s1_date <> ''`).all(annee);
  } catch { lucie = []; }
  const cleL = (u, c) => `${u}|${c || ''}`;
  const parCle = new Map(lucie.map(x => [cleL(x.ue_num, x.cours_code), x]));
  const vus = new Set();
  const cache = new Map();
  const resultat = lignes.map(l => {
    const k = l.sections.join(',');
    if (!cache.has(k)) cache.set(k, coursDesSections(l.sections, annee));
    const r = rattacher(l, cache.get(k));
    if (!r) return { ...l, etat: 'inconnu' };
    const cle = cleL(r.ue_num, r.cours_code);
    const L = parCle.get(cle) || (r.cours_code ? parCle.get(cleL(r.ue_num, '')) : null);
    const base = { ...l, ue_num: Number(r.ue_num), cours_code: r.cours_code, cours_nom: r.cours_nom || r.ue_nom, par: r.par };
    if (!L) return { ...base, etat: 'absent' };
    vus.add(cleL(L.ue_num, L.cours_code));
    const ecarts = [];
    if (L.s1_date !== l.date) ecarts.push('date');
    if (l.debut && L.s1_heure && L.s1_heure.slice(0, 5) !== l.debut) ecarts.push('heure');
    if (l.debut && !L.s1_heure) ecarts.push('heure absente de Lucie');
    const locLucie = sans(L.s1_local).replace(/[^a-z0-9]/g, '');
    if (L.s1_local && l.locaux.length && !l.locaux.some(x => sans(x).replace(/[^a-z0-9*]/g, '').replace(/\*/g, '') === locLucie)) ecarts.push('local');
    return { ...base, etat: ecarts.filter(e => e !== 'local' && e !== 'heure absente de Lucie').length ? 'different' : 'pareil', ecarts,
      lucie: { date: L.s1_date, heure: L.s1_heure, local: L.s1_local } };
  });
  // CE QUE LUCIE A DANS LA MÊME PÉRIODE ET QUE L'EXCEL NE PORTE PAS — pour les seules sections présentes dans l'Excel.
  const dates = lignes.map(l => l.date).sort();
  const sectionsVues = [...new Set(lignes.flatMap(l => l.sections))];
  const ues = new Set(coursDesSections(sectionsVues, annee).map(c => Number(c.ue_num)));
  const seulementLucie = dates.length ? lucie.filter(x => x.s1_date >= dates[0] && x.s1_date <= dates[dates.length - 1]
    && ues.has(Number(x.ue_num)) && !vus.has(cleL(x.ue_num, x.cours_code)))
    .map(x => ({ ...x, cours_nom: (x.cours_code && db.prepare('SELECT MAX(cours_nom) n FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(x.cours_code, annee)?.n)
      || db.prepare('SELECT MAX(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(x.ue_num, annee)?.n || '' })) : [];
  const compte = e => resultat.filter(x => x.etat === e).length;
  return { annee, periode: dates.length ? { du: dates[0], au: dates[dates.length - 1] } : null, sections: sectionsVues, ignorees,
    totaux: { lignes: resultat.length, pareil: compte('pareil'), different: compte('different'), absent: compte('absent'), inconnu: compte('inconnu'),
      seulement_lucie: seulementLucie.length },
    lignes: resultat, seulement_lucie: seulementLucie };
}

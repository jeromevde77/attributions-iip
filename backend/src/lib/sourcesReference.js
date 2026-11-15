/* LES SOURCES DES RÉFÉRENTIELS (3.5.450, Charles, 14 novembre 2026 : « j'essaie de te donner tout ce que je trouve comme données
   pour que nous puissions croiser les données et avoir des bases solides » ; tranché : une page où la direction dépose les fichiers,
   Lucie en tire les TOTAUX et ne garde rien de personnel ; chaque comparaison renvoie à sa source).

   Quatre sortes de fichiers reconnues, à leur CONTENU (jamais à leur nom) :
   - le COR de la HELB (cadre organique réel, .xlsm) : rémunérations de l'enseignement, de l'encadrement, le total, l'allocation ;
   - les attributions de la HELB (.xlsx, une ligne par charge) : ETP d'enseignement et de fonctions par cursus, départements,
     administration — en dixièmes ÷ 10 ;
   - les inscrits de la HELB par cursus (tableau croisé « Nombre de Cohorte ») : la feuille la plus récente ;
   - les comptes annuels de l'ASBL (PDF de la BNB) : charges, rémunérations, services et biens divers, amortissements, subsides,
     ETP déclarés — lus par leurs CODES (62, 61, 630…), qui ne changent pas d'une année à l'autre.
   Le fichier n'est jamais gardé (il porte numéros nationaux, adresses, GSM) : seule la ligne de `reference_source` reste — nature,
   fichier, date de la donnée, qui l'a déposé, et les totaux. Une nouvelle source de même nature remplace l'ancienne dans les calculs ;
   l'ancienne reste listée (retirée = `retire_le`). */
import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import db from '../db/index.js';

export function migrerSources() {
  db.exec(`CREATE TABLE IF NOT EXISTS reference_source (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nature TEXT NOT NULL,
    libelle TEXT,
    fichier TEXT,
    annee TEXT,
    date_donnee TEXT,
    fourni_par TEXT,
    totaux_json TEXT NOT NULL,
    depose_par TEXT,
    depose_le TEXT DEFAULT (datetime('now')),
    retire_le TEXT,
    remarque TEXT)`);
}

export const NATURES = {
  helb_cor: 'COR de la HELB — rémunérations',
  helb_attributions: 'Attributions de la HELB — ETP par cursus',
  helb_inscrits: 'Inscrits de la HELB par cursus',
  asbl_comptes: 'Comptes annuels de l’ASBL',
  asbl_synthese: 'Budgets et comptes de l’ASBL — synthèse par cursus',
};

const val = c => (c && typeof c === 'object' ? (c.result !== undefined ? c.result : c.text !== undefined ? c.text : c.richText ? c.richText.map(x => x.text).join('') : null) : c);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const dateDuNom = nom => { const m = String(nom || '').match(/(20\d\d)[-_. ]?(\d\d)[-_. ]?(\d\d)/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const r2 = v => Math.round(v * 100) / 100;

function lignes(ws) {
  const out = [];
  ws.eachRow({ includeEmpty: false }, row => { const v = row.values.slice(1).map(val); out.push(v); });
  return out;
}

/* LE COR : la feuille « COR », une ligne par code (COR000…) : EES, libellé, montant, nombre, total. */
function lireCor(wb, nom) {
  const ws = wb.getWorksheet('COR'); if (!ws) return null;
  const L = lignes(ws).filter(l => /^COR\d{3}$/.test(String(l[2] || '')));
  if (!L.length) return null;
  const par = Object.fromEntries(L.map(l => [String(l[3] || '').trim(), { libelle: l[4], montant: num(l[5]), nombre: num(l[6]), total: num(l[7]) }]));
  const t = k => par[k]?.total || 0, n = k => par[k]?.nombre || 0;
  // Les dernières lignes portent le total dans la colonne « montant » (pas de nombre).
  const seul = k => par[k] ? (par[k].total || par[k].montant || par[k].nombre || 0) : 0;
  const enseignementStat = t('1.A.') + t('1.B.') + t('1.C.') + t('2.A.') + t('2.B.');
  const invites = seul('5.A.') + seul('5.B.');
  const encadrement = t('3.A.') + t('3.B.') + t('3.C.') + t('4.A.') + t('4.B.') + seul('6.A.');
  const totaux = {
    enseignement: r2(enseignementStat + invites), enseignement_statutaire: r2(enseignementStat), invites: r2(invites),
    encadrement: r2(encadrement), total: r2(seul('6.A.3') || enseignementStat + invites + encadrement), allocation: r2(seul('6.A.4')),
    etp_enseignants: r2(n('1.A.') + n('1.B.') + n('1.C.') + n('2.A.') + n('2.B.')),
    // Le coût d'un ETP par catégorie (3.5.463) : maître-assistant TC, maître de formation pratique.
    prix_ma: par['1.A.']?.montant || null, prix_mfp: par['1.B.']?.montant || null,
  };
  return { nature: 'helb_cor', libelle: NATURES.helb_cor, date_donnee: dateDuNom(nom), totaux };
}

/* LES ATTRIBUTIONS : l'en-tête porte « total dix PI » ; une ligne par charge. Fonction = coordination, mission, gestion, référent… */
const FONCTION = /Coordination|Mission|Gestion|Référent|Administration|Président|Direction/i;
const DEPTS = ['Santé', 'COMAV', 'Social', 'Techno-Eco'];
function lireAttributions(wb, nom) {
  const ws = wb.worksheets[0]; if (!ws) return null;
  const L = lignes(ws); const h = L[0] || [];
  const ix = k => h.findIndex(x => String(x || '').trim() === k);
  const iPI = ix('total dix PI'), iSt = ix('total dixième statutaires'), iSal = ix('heures salariés conversion dixièmes'),
    iD = ix('Département'), iC = ix('Cursus'), iCr = ix('cours réel'), iA = ix('année académique');
  if (iPI < 0 || iD < 0 || iC < 0) return null;
  // Les heures données : toutes les colonnes d'heures de la ligne (maîtres-assistants, maîtres de formation pratique, invités).
  const iH = h.map((x, i) => (/^nbh|^heures PI /.test(String(x || '').trim()) ? i : -1)).filter(i => i >= 0);
  const parCursus = {}, departements = {}; let ens = 0, fct = 0, dep = 0, adm = 0, annee = null, heures = 0;
  for (const l of L.slice(1)) {
    const D = String(l[iD] || ''), Cu = String(l[iC] || ''), cr = String(l[iCr] || '');
    if (!annee && l[iA]) annee = String(l[iA]);
    if (/^Absence/.test(cr)) continue;
    const d = (num(l[iPI]) + num(l[iSt]) + (iSal >= 0 ? num(l[iSal]) : 0)) / 10;
    if (!d) continue;
    if (!DEPTS.includes(D)) { adm += d; continue; }
    if (/^Département/.test(Cu) || ['SimLabS', 'Cadre de santé'].includes(Cu)) { dep += d; departements[D] = (departements[D] || 0) + d; continue; }
    const c = (parCursus[`${D}|${Cu}`] ||= { dept: D, cursus: Cu, enseignement: 0, fonctions: 0 });
    if (FONCTION.test(cr)) { c.fonctions += d; fct += d; } else { c.enseignement += d; ens += d; heures += iH.reduce((t, i) => t + num(l[i]), 0); }
  }
  if (!ens) return null;
  const cursus = Object.values(parCursus).map(c => ({ ...c, enseignement: r2(c.enseignement), fonctions: r2(c.fonctions) })).sort((a, b) => a.dept.localeCompare(b.dept) || a.cursus.localeCompare(b.cursus));
  return { nature: 'helb_attributions', libelle: NATURES.helb_attributions, annee: annee ? `20${annee.slice(0, 2)}-20${annee.slice(3, 5)}` : null, date_donnee: dateDuNom(nom),
    totaux: { heures_enseignement: Math.round(heures), enseignement: r2(ens), fonctions: r2(fct), departements: r2(dep), administration: r2(adm), etp_cursus: r2(ens + fct),
      fonctions_sur_enseignement: r2(fct / ens), par_departement: Object.fromEntries(Object.entries(departements).map(([k, v]) => [k, r2(v)])), cursus } };
}

/* LES INSCRITS : un tableau croisé « Nombre de Cohorte » ; chaque feuille datée jjmmaa ; la plus récente fait foi. */
function lireInscrits(wb, nom) {
  const feuilles = wb.worksheets.filter(ws => lignes(ws).some(l => String(l[1] || '') === 'Nombre de Cohorte'));
  if (!feuilles.length) return null;
  const dateF = ws => { const m = ws.name.match(/^(\d\d)(\d\d)(\d\d)$/); return m ? `20${m[3]}-${m[2]}-${m[1]}` : ''; };
  const ws = feuilles.sort((a, b) => dateF(b).localeCompare(dateF(a)))[0];
  const cursus = [], cohortes = {}; let total = 0;
  for (const l of lignes(ws)) {
    const k = String(l[0] || '').trim(), n = l[1];
    // Les cohortes (START = débutant, PROGRESS, END = diplômant) : seuls leurs totaux sont gardés (3.5.460, primo-inscrits de l'ASBL).
    if (['END', 'PROGRESS', 'START', 'TEMP'].includes(k) && typeof n === 'number') { cohortes[k] = (cohortes[k] || 0) + n; continue; }
    if (!k || typeof n !== 'number' || k === 'Étiquettes de lignes') continue;
    if (/^Total/i.test(k)) { total = n; continue; }
    cursus.push({ cursus: k, inscrits: n });
  }
  if (!cursus.length) return null;
  if (!total) total = cursus.reduce((t, c) => t + c.inscrits, 0);
  return { nature: 'helb_inscrits', libelle: NATURES.helb_inscrits, date_donnee: dateF(ws) || dateDuNom(nom), totaux: { total, cursus, cohortes, debutants: cohortes.START ?? null, feuille: ws.name } };
}

/* LES COMPTES ANNUELS DE L'ASBL (PDF de la Banque nationale) : la première valeur après le code, sur la ligne du code. */
function lireComptes(texte) {
  if (!/COMPTES ANNUELS/.test(texte) || !/C-ASBL|ASBL/.test(texte)) return null;
  const lire = (code) => {
    const re = new RegExp(`\\s${code.replace('/', '\\/')}\\s+(-?[\\d.]+(?:,\\d+)?)`);
    for (const ligne of texte.split('\n')) { const m = ligne.match(re); if (m) return Number(m[1].replace(/\./g, '').replace(',', '.')); }
    return null;
  };
  const periode = texte.match(/période du\s+(\d\d)-(\d\d)-(\d{4})\s+au\s+(\d\d)-(\d\d)-(\d{4})/);
  const nomAsbl = (texte.match(/Dénomination :\s+(.+)/) || [])[1]?.trim() || null;
  const totaux = {
    exercice: periode ? periode[6] : null, denomination: nomAsbl,
    charges: lire('60/66A'), produits: lire('70/76A'), chiffre_affaires: lire('70'), subsides: lire('73'),
    remunerations: lire('62'), services: lire('61'), amortissements: lire('630'), autres_charges: lire('640/8'),
    resultat: lire('9904'), etp_declares: lire('1003'),
  };
  if (totaux.charges == null && totaux.remunerations == null) return null;
  totaux.fonctionnement = (totaux.services || 0) + (totaux.amortissements || 0) + (totaux.autres_charges || 0);
  return { nature: 'asbl_comptes', libelle: NATURES.asbl_comptes, annee: totaux.exercice, date_donnee: periode ? `${periode[6]}-${periode[5]}-${periode[4]}` : null, totaux };
}

/* LA SYNTHÈSE DES BUDGETS ET COMPTES DE L'ASBL (classeur « Budgets & Comptes », feuille « Synthèses asbl ») : une ligne par service
   ou cursus, et pour chaque exercice (budget, réalisé) ses charges, produits et résultat. Les blocs se suivent — ASBL Administration,
   HELB (ses départements, leurs cursus), Institut Ilya Prigogine (ses sections), CREA, IRO, UDR, Conseil social — et un même intitulé
   revient dans deux blocs (Orthoptie, Technologue en imagerie médicale) : chaque ligne garde son bloc. */
const BLOCS = ['ASBL Administration', 'HELB', 'Institut Ilya Prigogine', 'CREA Formations continues', 'International Relations Office (IRO)', 'Unité de Recherches (UDR)', 'HELB Conseil social'];
function lireSynthese(wb, nom) {
  const ws = wb.worksheets.find(w => /^Synth[èe]ses? asbl/i.test(w.name)); if (!ws) return null;
  const L = lignes(ws); const h = L[0] || [];
  const exercices = [];
  h.forEach((c, i) => { const t = String(c || '').trim(); const m = t.match(/^(20\d\d)\s+(.*)$/);   // une cellule fusionnée se répète sur ses trois colonnes
    if (m && !exercices.some(e => e.libelle === t)) exercices.push({ col: i, annee: m[1], provisoire: /provisoire/i.test(m[2]),
      nature: /r[ée]alis|ex[ée]cution/i.test(m[2]) ? 'realise' : /ajust/i.test(m[2]) ? 'ajuste' : /initial/i.test(m[2]) ? 'initial' : 'budget', libelle: t }); });
  if (!exercices.length) return null;
  /* CHAQUE GROUPE D'EXERCICES A SA COLONNE D'INTITULÉS, ET SON ORDRE DE LIGNES (3.5.453 : dans le classeur « 2021 à 2024 », la ligne
     « Optométrie » de 2024 porte « Administration » en 2021) : l'intitulé d'un exercice est la dernière cellule de texte à sa gauche,
     et chaque groupe se lit de haut en bas avec ses propres blocs. */
  const colLabel = e => { for (const l of L.slice(2, 40)) { for (let i = e.col - 1; i >= 0; i--) if (typeof l[i] === 'string' && l[i].trim()) return i; } return 1; };
  const groupes = new Map();
  for (const e of exercices) { const c = colLabel(e); if (!groupes.has(c)) groupes.set(c, []); groupes.get(c).push(e); }
  const par = new Map();
  const net = t => t.replace(/\s*\((nouveau cursus[^)]*|cursus suspendu)\)/i, '').trim();
  for (const [c, exs] of groupes) {
    let bloc = null, dept = null;
    for (const l of L.slice(2)) {
      const lab = typeof l[c] === 'string' ? l[c].trim() : '';
      if (!lab) continue;
      const vals = Object.fromEntries(exs.map(e => [`${e.annee}|${e.nature}`, { charges: Math.round(Math.abs(num(l[e.col]))), produits: Math.round(num(l[e.col + 1])), resultat: Math.round(num(l[e.col + 2])) }]));
      const total = /^ASBL ILYA PRIGOGINE$/i.test(lab);
      let niveau = 2;
      if (total) { bloc = 'ASBL'; dept = null; niveau = 0; }
      else if (BLOCS.includes(lab)) { bloc = lab; dept = null; niveau = 0; }
      else if (/^Département /.test(lab)) { dept = lab.replace(/^Département /, ''); niveau = 1; }
      else if (bloc !== 'HELB') niveau = 1;
      const poste = total ? 'Total de l’ASBL' : net(lab), d = niveau === 2 ? dept : null, k = `${bloc}|${d}|${poste}`;
      if (!par.has(k)) par.set(k, { bloc, dept: d, poste, niveau, ex: {} });
      Object.assign(par.get(k).ex, vals);
      if (total) break;
    }
  }
  const postes = [...par.values()];
  if (postes.length < 5) return null;
  return { nature: 'asbl_synthese', libelle: NATURES.asbl_synthese, annee: exercices.map(e => e.annee).sort().pop(), date_donnee: dateDuNom(nom),
    totaux: { exercices: exercices.map(({ annee, nature, libelle, provisoire }) => ({ annee, nature, libelle, provisoire })), postes } };
}

/** Lit un fichier déposé et rend ce que Lucie en garderait — sans rien écrire. */
export async function lireSource(nom, buffer) {
  const ext = String(nom || '').toLowerCase().split('.').pop();
  if (ext === 'pdf' || buffer.slice(0, 4).toString() === '%PDF') {
    const dir = mkdtempSync(join(tmpdir(), 'source-'));
    try {
      const f = join(dir, 'f.pdf'); writeFileSync(f, buffer);
      const texte = execFileSync('pdftotext', ['-layout', f, '-'], { maxBuffer: 50 * 1024 * 1024 }).toString();
      const r = lireComptes(texte);
      if (!r) throw new Error('Ce PDF n’est pas reconnu : seuls les comptes annuels de l’ASBL (modèle de la Banque nationale) le sont.');
      return { ...r, fichier: nom };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  if (!['xlsx', 'xlsm'].includes(ext)) throw new Error('Formats lus : Excel (.xlsx, .xlsm) et PDF des comptes annuels.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const r = lireCor(wb, nom) || lireSynthese(wb, nom) || lireAttributions(wb, nom) || lireInscrits(wb, nom);
  if (!r) throw new Error('Ce classeur n’est pas reconnu : COR de la HELB, synthèse des budgets et comptes de l’ASBL, attributions de la HELB, inscrits par cursus.');
  return { ...r, fichier: nom };
}

export function enregistrerSource(r, { par, fourni_par = null, remarque = null } = {}) {
  migrerSources();
  const info = db.prepare(`INSERT INTO reference_source (nature, libelle, fichier, annee, date_donnee, fourni_par, totaux_json, depose_par, remarque)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(r.nature, r.libelle, r.fichier || null, r.annee || null, r.date_donnee || null, fourni_par, JSON.stringify(r.totaux), par || null, remarque);
  return info.lastInsertRowid;
}

export function listerSources() {
  migrerSources();
  return db.prepare('SELECT * FROM reference_source ORDER BY depose_le DESC, id DESC').all().map(s => ({ ...s, totaux: JSON.parse(s.totaux_json || '{}'), totaux_json: undefined }));
}
export function retirerSource(id, motif) {
  migrerSources();
  return db.prepare("UPDATE reference_source SET retire_le = datetime('now'), remarque = COALESCE(remarque || ' — ', '') || ? WHERE id = ? AND retire_le IS NULL").run(`retirée : ${motif || ''}`, id).changes;
}
/** La source en vigueur de chaque nature : la plus récente déposée, non retirée. */
export function sourcesEnVigueur() {
  const r = {};
  for (const s of listerSources()) if (!s.retire_le && !r[s.nature]) r[s.nature] = s;
  return r;
}

/** Un exercice est RÉALISÉ COMPLET quand son réalisé existe et n'est pas loin sous son budget (un exercice en cours, une exécution
 *  provisoire ou une colonne vide ne servent pas de référence). */
export function realiseComplet(totaux, annee) {
  const tot = totaux?.postes?.find(p => p.bloc === 'ASBL'); if (!tot) return false;
  const r = tot.ex[`${annee}|realise`], b = tot.ex[`${annee}|budget`] || tot.ex[`${annee}|ajuste`] || tot.ex[`${annee}|initial`];
  return !!r?.charges && (!b?.charges || r.charges > b.charges * 0.85);
}
/** Le dernier exercice réalisé complet de la synthèse de l'ASBL. */
export function dernierRealise(totaux) {
  const annees = [...new Set((totaux?.exercices || []).filter(e => e.nature === 'realise').map(e => e.annee))].sort().reverse();
  return annees.find(a => realiseComplet(totaux, a)) || null;
}

/** LA SYNTHÈSE DE L'ASBL, TOUS CLASSEURS RÉUNIS (3.5.453) : chaque classeur couvre ses années (« 2021 à 2024 » : 2015-2024 ;
 *  « 2023 à 2027 » : 2023-2026). Pour chaque année, le classeur qui en porte le réalisé le plus complet fait foi (le « 2021 à 2024 »
 *  n'a de 2023 qu'une exécution provisoire, et rien de 2024) ; à égalité, le classeur qui va le plus loin. */
export function syntheseAsbl() {
  const L = listerSources().filter(s => s.nature === 'asbl_synthese' && !s.retire_le);
  if (!L.length) return null;
  const fin = s => Math.max(...(s.totaux.exercices || []).map(e => Number(e.annee)), 0);
  const realise = (s, a) => s.totaux.postes?.find(p => p.bloc === 'ASBL')?.ex?.[`${a}|realise`]?.charges || 0;
  const annees = [...new Set(L.flatMap(s => (s.totaux.exercices || []).map(e => e.annee)))].sort();
  const choix = new Map(annees.map(a => [a, L.filter(s => s.totaux.exercices.some(e => e.annee === a))
    .sort((x, y) => realise(y, a) - realise(x, a) || fin(y) - fin(x) || y.id - x.id)[0]]));
  const exercices = [], par = new Map(), fichiers = new Map();
  for (const [a, s] of choix) {
    if (!fichiers.has(s.id)) fichiers.set(s.id, { fichier: s.fichier, annees: [] });
    fichiers.get(s.id).annees.push(a);
    for (const e of s.totaux.exercices) if (e.annee === a) exercices.push(e);
    for (const p of s.totaux.postes || []) {
      const k = `${p.bloc}|${p.dept}|${p.poste}`;
      if (!par.has(k)) par.set(k, { ...p, ex: {} });
      for (const [cle, v] of Object.entries(p.ex)) if (cle.slice(0, 4) === a) par.get(k).ex[cle] = v;
    }
  }
  const F = [...fichiers.values()];
  return { fichier: F.map(f => f.fichier).join(' + '), fichiers: F, date_donnee: L[0].date_donnee, totaux: { exercices, postes: [...par.values()] } };
}

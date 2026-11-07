/**
 * LES ATTRIBUTIONS DES ANNÉES PASSÉES (3.5.195, Charles, 7 novembre 2026 : « Import_Lucie_TIM_2023-2025.csv » ; tranché :
 * un import, simulation d'abord ; pour l'historique et l'ancienneté des professeurs, et le pilotage — ETP et coûts — des
 * années passées).
 *
 * Le fichier est celui que la direction prépare (séparateur « ; ») : Année · Section · Payroll · Bloc · N° UE · Code UE FWB ·
 * Nom de l'UE · Code cours · Activité · Quadrimestre · CT/PP · Groupe · Contrat · Cours/EPT · Encadrement · Professeur · Nom
 * dans la source · Périodes attribuées · Autonomie attribuée · Total attribué au professeur · Commentaire source · Alerte à
 * vérifier. Les colonnes se lisent à leur INTITULÉ, jamais à leur place.
 *
 * Règles :
 *  - seulement une année PASSÉE (avant l'année active) : l'année en cours se compose à l'écran, avec ses règles ;
 *  - une section et une année qui ont déjà des attributions ne se complètent pas d'ici : on ne mélange pas deux sources
 *    (tout ou rien, et le compte rendu le dit) ;
 *  - le professeur se reconnaît à son NOM (casse, accents, espaces ignorés ; « SOMOANO » trouve « SOMOANO TARNO » ; une
 *    faute d'une ou deux lettres est rapprochée quand une seule fiche est assez proche — et SIGNALÉE) ; « RECRUTEMENT » ou
 *    un nom inconnu donnent une ligne sans professeur, signalée ;
 *  - l'EPT de coordination (Coordination des TFE, des stages, de section, pédagogique) prend le code de Lucie (COTFE, COSTA,
 *    COSEC, COCUR) ; l'encadrement « e » est un encadrement de stage (ES) ;
 *  - le commentaire et l'alerte de la source sont gardés dans le commentaire de la ligne.
 */
import db from '../db/index.js';

const cle = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = v => { const n = Number(String(v ?? '').replace(',', '.').trim()); return Number.isFinite(n) ? n : null; };

const COLONNES = {
  annee: ['annee'], section: ['section'], payroll: ['payroll'], bloc: ['bloc'], ue: ['nue', 'ue'], fwb: ['codeuefwb'],
  ue_nom: ['nomdelue'], cours: ['codecours'], activite: ['activite'], quadri: ['quadrimestre'], ctpp: ['ctpp'],
  groupe: ['groupe'], contrat: ['contrat'], ept: ['coursept'], encadrement: ['encadrement'], prof: ['professeur'],
  source: ['nomdanslasource'], per: ['periodesattribuees'], auto: ['autonomieattribuee'], total: ['totalattribueauprofesseur'],
  commentaire: ['commentairesource'], alerte: ['alerteaverifier'],
};

function lireCsv(texte) {
  const lignes = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lignes.length) return { entetes: [], rangs: [] };
  const sep = (lignes[0].match(/;/g) || []).length >= (lignes[0].match(/,/g) || []).length ? ';' : ',';
  const couper = l => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur); return out.map(x => x.trim());
  };
  const entetes = couper(lignes[0]).map(cle);
  const index = {};
  for (const [k, noms] of Object.entries(COLONNES)) { const i = entetes.findIndex(e => noms.includes(e)); if (i >= 0) index[k] = i; }
  return { index, rangs: lignes.slice(1).map(couper) };
}

function distance(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

function reconnaisseur() {
  const profs = db.prepare('SELECT id, nom, prenom, statut FROM professeur').all().map(p => ({ ...p, n: cle(p.nom), p: cle(p.prenom) }));
  return (nom, source) => {
    const n = cle(nom);
    if (!n || n === 'recrutement') return { prof: null, note: n === 'recrutement' ? 'poste non pourvu (RECRUTEMENT)' : 'aucun professeur dans la source' };
    // Le prénom, s'il est dans « Nom dans la source », départage les homonymes.
    const prenomSource = cle(String(source || '').replace(new RegExp(`^${String(nom).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), ''));
    const filtre = l => (l.length > 1 && prenomSource ? (l.filter(p => p.p && prenomSource.includes(p.p)).length === 1 ? l.filter(p => p.p && prenomSource.includes(p.p)) : l) : l);
    let l = filtre(profs.filter(p => p.n === n));
    if (l.length === 1) return { prof: l[0] };
    if (l.length > 1) return { prof: null, note: `${l.length} fiches « ${nom} » : à choisir à la main` };
    l = filtre(profs.filter(p => p.n.startsWith(n) || n.startsWith(p.n)));
    if (l.length === 1) return { prof: l[0], note: `« ${nom} » rapproché de ${l[0].nom} ${l[0].prenom || ''}`.trim() };
    l = filtre(profs.filter(p => distance(p.n, n) <= 2));
    if (l.length === 1) return { prof: l[0], note: `« ${nom} » rapproché de ${l[0].nom} ${l[0].prenom || ''} (orthographe)`.trim() };
    return { prof: null, note: `professeur « ${nom} » introuvable dans Lucie` };
  };
}

const CODE_COORD = [[/tfe/i, 'COTFE'], [/stage/i, 'COSTA'], [/section/i, 'COSEC'], [/p[ée]dagog|cursus/i, 'COCUR'],
  [/qualit/i, 'COQUAL'], [/inclusi/i, 'COINCL']];

/** Lit le fichier et dit ce qui serait écrit. `ecrire` : écrit tout, ou rien. */
export function importerAttributions(texte, { ecrire = false, parId = null } = {}) {
  const { index, rangs } = lireCsv(texte);
  const manque = ['annee', 'section', 'ue', 'prof', 'per'].filter(k => index?.[k] == null);
  if (manque.length) return { erreur: `Colonnes introuvables : ${manque.join(', ')}. La première ligne doit porter les intitulés.` };
  const v = (r, k) => (index[k] != null ? String(r[index[k]] ?? '').trim() : '');
  const active = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code || '';
  const trouver = reconnaisseur();
  const lignes = [], refus = [];
  for (const [i, r] of rangs.entries()) {
    const annee = v(r, 'annee'), section = v(r, 'section');
    const ue = Number(v(r, 'ue').replace(/^ue\s*/i, ''));
    if (!/^\d{4}-\d{4}$/.test(annee)) { refus.push({ ligne: i + 2, pourquoi: `année illisible « ${annee} »` }); continue; }
    if (!(ue > 0)) { refus.push({ ligne: i + 2, pourquoi: `n° d'UE illisible « ${v(r, 'ue')} »` }); continue; }
    const p = trouver(v(r, 'prof'), v(r, 'source'));
    const activite = v(r, 'activite');
    const ept = /^ept$/i.test(v(r, 'ept')) ? 'EPT' : 'C';
    const enc = v(r, 'encadrement');
    let coord = 'Cours';
    if (ept === 'EPT' && !v(r, 'cours')) coord = (CODE_COORD.find(([re]) => re.test(activite)) || [])[1] || 'COCUR';
    else if (/^e$/i.test(enc) || /^es$/i.test(enc)) coord = 'ES';
    else if (/^ei$/i.test(enc)) coord = 'EI';
    const contrat = v(r, 'contrat').toUpperCase();
    const groupe = v(r, 'groupe');
    const notes = [p.note, v(r, 'alerte'), v(r, 'commentaire')].filter(Boolean);
    lignes.push({
      rang: i + 2, annee, section, ue_num: ue, ue_nom: v(r, 'ue_nom'), code_cours: v(r, 'cours') || null, activite,
      quadrimestre: v(r, 'quadri') || null, type_cours: (v(r, 'ctpp') || 'CT').toUpperCase(), code: groupe || null,
      statut_exception: ['CC', 'EXP'].includes(contrat) ? contrat : null, cours_ept_ad: ept, coordination_encadrement: coord,
      contrat_mdp: v(r, 'payroll') || null, professeur_id: p.prof?.id ?? null, professeur: p.prof ? `${p.prof.nom} ${p.prof.prenom || ''}`.trim() : null,
      nom_source: v(r, 'prof') || v(r, 'source') || '', periodes: num(v(r, 'per')) ?? 0, autonomie: num(v(r, 'auto')) ?? 0,
      total: num(v(r, 'total')), alerte: !p.prof || !!p.note || !!v(r, 'alerte'), commentaire: notes.join(' | ') || null,
    });
  }
  // Les années et sections du fichier : passées, et vides d'attributions.
  const paires = [...new Set(lignes.map(l => `${l.annee}|${l.section}`))].map(k => {
    const [annee, section] = k.split('|');
    const deja = db.prepare('SELECT COUNT(*) n FROM attribution WHERE annee_scolaire = ? AND section = ?').get(annee, section).n;
    const connue = !!db.prepare('SELECT 1 FROM annee_scolaire WHERE code = ?').get(annee);
    const passee = active && annee < active;
    return { annee, section, lignes: lignes.filter(l => l.annee === annee && l.section === section).length, deja, connue, passee,
      bloque: !passee ? `${annee} n'est pas une année passée` : !connue ? `l'année ${annee} n'existe pas dans Lucie` : deja ? `${deja} attribution(s) existent déjà pour ${section} en ${annee}` : null };
  });
  const totaux = { lignes: lignes.length, sans_professeur: lignes.filter(l => !l.professeur_id).length, a_verifier: lignes.filter(l => l.alerte).length,
    periodes: lignes.reduce((s, l) => s + l.periodes, 0), autonomie: lignes.reduce((s, l) => s + l.autonomie, 0) };
  const bloque = refus.length ? `${refus.length} ligne(s) illisible(s)` : paires.find(x => x.bloque)?.bloque || null;
  if (!ecrire || bloque) return { simulation: true, paires, lignes, refus, totaux, bloque };

  const ins = db.prepare(`INSERT INTO attribution (section, etablissement_referent, contrat_mdp, annee_scolaire, ue_num, num_organisation,
      quadrimestre_attribue, code_cours, type_cours, code, nb_groupes, professeur_id, cours_ept_ad, coordination_encadrement, commentaire,
      periodes_attribuees, autonomie_attribuee, total_attribue_professeur, statut_exception, valide, valide_par, valide_le, created_by)
    VALUES (?,?,?,?,?,1,?,?,?,?,1,?,?,?,?,?,?,?,?,1,?,datetime('now'),?)`);
  db.transaction(() => {
    for (const l of lignes) {
      ins.run(l.section, l.contrat_mdp || 'IIP', l.contrat_mdp || 'IIP', l.annee, l.ue_num, l.quadrimestre, l.code_cours, l.type_cours, l.code,
        l.professeur_id, l.cours_ept_ad, l.coordination_encadrement,
        [`Import ${l.annee} (${l.nom_source || 'sans professeur'})`, l.code_cours ? null : l.activite, l.commentaire].filter(Boolean).join(' — '),
        l.periodes, l.autonomie, l.total ?? (l.periodes + l.autonomie), l.statut_exception, parId, parId);
    }
  })();
  return { ecrit: lignes.length, paires, totaux };
}

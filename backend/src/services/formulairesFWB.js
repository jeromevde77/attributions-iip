/**
 * LES FORMULAIRES DE LA CIRCULAIRE 9760 — les modèles Word officiels de la FWB,
 * remplis par Lucie, rendus en Word (Charles, 27 septembre 2026 : « copie
 * conforme mais éditable » ; « génère tout »).
 *
 * Les 39 annexes vivent dans `circulaire-9760/`, telles que publiées. Chacune se
 * télécharge PRÉ-REMPLIE de ce que Lucie sait à coup sûr — l'établissement et
 * le membre du personnel —, et six d'entre elles reçoivent en plus leur
 * contenu propre (A1 ter, A4, A6, A14, A15, A27). Ce que Lucie ne sait pas
 * reste en blanc : un champ deviné sur une pièce envoyée à l'Administration
 * est pire qu'un champ vide.
 *
 * L'IDENTITÉ S'ÉCRIT PAR CE QUE LE MODÈLE DIT, PAS PAR SA POSITION. Le bloc
 * « Identification de l'établissement » est le même dans toutes les annexes,
 * mais il n'est pas au même rang de tableau d'une annexe à l'autre : on le
 * repère au libellé « Nom du PO », les grilles de chiffres au libellé qui les
 * précède (ECOT, FASE, Matricule), les cases à cocher au mot qui les suit.
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  debutLigne, tableaux, cellule, paragraphes, episser, remplacer, ajouter, ecrireCellule, grille, cocher, esc,
} from './ea12_fill_officiel.js';

const DOSSIER = path.join(import.meta.dirname, 'circulaire-9760');
const T = s => [...String(s).matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
const tout = x => ({ s: 0, e: x.length });
const dateFr = v => {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ── Le catalogue des annexes ────────────────────────────────────────────────
// `usage` : 'membre' (une pièce par personne), 'etablissement' (sans personne).
// `mois` : la pièce vaut pour un mois (A14, A15, A27).
// Hors catalogue, et c'est voulu : A1 (secondaire), A22 et A23 (officiel
// subventionné et WBE) — sans objet pour un établissement libre du supérieur.
export const ANNEXES = [
  { cle: 'A1bis', fichier: 'A1 bis_EA12 SUP.docx', titre: 'A1 bis — EA12 supérieur (Doc12)', usage: 'membre', ea12: true },
  { cle: 'A1ter', fichier: 'A1 ter _EA12 EXPERT.docx', titre: 'A1 ter — EA12 expert', usage: 'membre' },
  { cle: 'A2', fichier: 'A2_Déclaration de cumul interne.docx', titre: 'A2 — Déclaration de cumul interne', usage: 'membre' },
  { cle: 'A3', fichier: 'A3_Fiche signalétique.docx', titre: 'A3 — Fiche signalétique', usage: 'membre' },
  { cle: 'A4', fichier: 'A4_Prestation de serment.docx', titre: 'A4 — Prestation de serment', usage: 'membre' },
  { cle: 'A5', fichier: 'A5_Services antérieurs - métiers, enseignement, services publics.docx', titre: 'A5 — Services antérieurs', usage: 'membre' },
  { cle: 'A5bis', fichier: 'A5bis_Services antérieurs - secteur privé.docx', titre: 'A5 bis — Services antérieurs, secteur privé', usage: 'membre' },
  { cle: 'A6', fichier: 'A6_SUBV_Admissibilité des services rendus.docx', titre: 'A6 — Admissibilité des services rendus', usage: 'membre' },
  { cle: 'A7', fichier: 'A7_Allocation de foyer.docx', titre: 'A7 — Allocation de foyer', usage: 'membre' },
  { cle: 'A8', fichier: 'A8_Déclaration de précompte professionnel.docx', titre: 'A8 — Précompte professionnel', usage: 'membre' },
  { cle: 'A9', fichier: 'A9_Déro ling HORS immersion - langue de l\'enseignement.docx', titre: 'A9 — Dérogation linguistique', usage: 'membre' },
  { cle: 'A10', fichier: 'A10_Pécule de vacances jeune diplômé.docx', titre: 'A10 — Pécule jeune diplômé', usage: 'membre' },
  { cle: 'A11', fichier: 'A11_Fin mise en dispo maladie ou infirmité durant les vacances d\'été.docx', titre: 'A11 — Fin de disponibilité maladie en été', usage: 'membre' },
  { cle: 'A12', fichier: 'A12_Accident du travail et maladie pro - décl incapacité de travail- T.docx', titre: 'A12 — Accident du travail (temporaire)', usage: 'membre' },
  { cle: 'A13', fichier: 'A13_Accident hors service - formulaire A - déclaration.docx', titre: 'A13 — Accident hors service (A)', usage: 'membre' },
  { cle: 'A13bis', fichier: 'A13 bis_Accident hors service - formulaire B - recours subrogatoire.docx', titre: 'A13 bis — Accident hors service (B)', usage: 'membre' },
  { cle: 'A14', fichier: 'A14_Relevé mensuel individuel ANRJ.docx', titre: 'A14 — Relevé mensuel des ANRJ', usage: 'membre', mois: true },
  { cle: 'A15', fichier: 'A15_Relevé individuel absences pour grève.docx', titre: 'A15 — Relevé des absences pour grève', usage: 'membre', mois: true },
  { cle: 'A16', fichier: 'A16_Déro limite d\'âge et-ou exercice fonction MDP pensionné.docx', titre: 'A16 — Dérogation limite d\'âge / pensionné', usage: 'membre' },
  { cle: 'A17', fichier: 'A17_Demande indémnité frais funéraires.docx', titre: 'A17 — Frais funéraires', usage: 'membre' },
  { cle: 'A18', fichier: 'A18_Demande d\'autorisation de cumul.docx', titre: 'A18 — Autorisation de cumul', usage: 'membre' },
  { cle: 'A19', fichier: 'A19_Demande d\'assimilation à TS.docx', titre: 'A19 — Assimilation à titre suffisant', usage: 'membre' },
  { cle: 'A20', fichier: 'A20_PV ETD ou changement affectation mutation.docx', titre: 'A20 — PV d\'ETD, affectation, mutation', usage: 'membre' },
  { cle: 'A21', fichier: 'A21_PV engagement définitif directeur LS.docx', titre: 'A21 — PV d\'engagement définitif du directeur', usage: 'membre' },
  { cle: 'A24', fichier: 'A24_PV engagement définitif du personnel administratif LIBRE.docx', titre: 'A24 — PV d\'ETD, personnel administratif', usage: 'membre' },
  { cle: 'A25', fichier: 'A25_Changement d\'affectation et mutation d\'un MDP dans fonction de recrutement LIBRE.docx', titre: 'A25 — Changement d\'affectation, mutation', usage: 'membre' },
  { cle: 'A26', fichier: 'A26 _PV engagement définitif fonction de recrutement LIBRE.DOCX', titre: 'A26 — PV d\'ETD, fonction de recrutement', usage: 'membre' },
  { cle: 'A26bis', fichier: 'A26 bis_Fiche REC engagement définitif fonction de recrutement LIBRE.docx', titre: 'A26 bis — Fiche récapitulative d\'ETD', usage: 'membre' },
  { cle: 'A27', fichier: 'A27_Prestations mensuelles des experts revu pour CR25.docx', titre: 'A27 — Prestations mensuelles de l\'expert', usage: 'membre', mois: true },
  { cle: 'A28', fichier: 'A28_Demande de dérogation au profit d\'un expert.docx', titre: 'A28 — Dérogation au profit d\'un expert', usage: 'membre' },
  { cle: 'A29', fichier: 'A29_Expérience utile métier niveau supérieur annexe 5.docx', titre: 'A29 — Expérience utile (supérieur)', usage: 'membre' },
  { cle: 'A30', fichier: 'A30_Expérience utile métier niveau supérieur annexe 5bis.docx', titre: 'A30 — Expérience utile, cours et activités', usage: 'membre' },
  { cle: 'A31', fichier: 'A31_Expérience utile métier niveau supérieur - attestation de services prestés en tant que salarié - annexe 5ter.docx', titre: 'A31 — Expérience utile, attestation salarié', usage: 'membre' },
  { cle: 'A32', fichier: 'A32_Expérience utile métier niveau supérieur - attestation des services prestés en tant qu\'indépendant - annexe 5quater .docx', titre: 'A32 — Expérience utile, indépendant', usage: 'membre' },
  { cle: 'A33', fichier: 'A33_Expérience utile métier niveau supérieur - annexe 6 .docx', titre: 'A33 — Expérience utile, valorisation', usage: 'membre' },
  { cle: 'A34', fichier: 'A34_Dépassement du tiers - article 77.docx', titre: 'A34 — Dépassement du tiers (art. 77)', usage: 'membre' },
];

// ── Outils ──────────────────────────────────────────────────────────────────
/** Coche la première case dont le texte qui SUIT répond à `motif`. */
function cocherLibelle(x, motif) {
  const cases = [...x.matchAll(/<w:checkBox>/g)];
  for (let i = 0; i < cases.length; i++) {
    const apres = T(x.slice(cases[i].index, cases[i].index + 1800)).replace(/^\s+/, '');
    if (motif.test(apres)) return cocher(x, i);
  }
  return x;
}
/** Les tableaux d'une seule ligne de `n` cellules vides précédés de `libelle`. */
function grillesApres(x, libelle, n) {
  const out = [];
  tableaux(x).forEach((tb, i) => {
    if (tb.rows.length !== 1 || tb.rows[0].length !== n || !tb.rows[0][0]) return;
    // Le libellé précède la grille dans la plupart des annexes ; dans l'A6,
    // il la suit. On regarde des deux côtés, au plus près.
    const avant = T(x.slice(Math.max(0, tb.rows[0][0].s - 1500), tb.rows[0][0].s));
    const fin = tb.rows[0].at(-1).e;
    const apres = T(x.slice(fin, fin + 1500));
    if (libelle.test(avant.slice(-120)) || libelle.test(apres.slice(0, 40))) out.push(i);
  });
  return out;
}
/** L'index du premier tableau dont le texte contient `motif`. */
function tableauContenant(x, motif) {
  const tabs = tableaux(x);
  for (let i = 0; i < tabs.length; i++) {
    const tb = tabs[i];
    const d = tb.rows.find(r => r.length)?.[0]?.s, f = [...tb.rows].reverse().find(r => r.length)?.at(-1)?.e;
    if (d != null && f != null && motif.test(T(x.slice(d, f)))) return i;
  }
  return -1;
}
/** Remplace, dans TOUT le document, chaque occurrence de `motif` (groupe 1). */
function remplacerPartout(x, motif, valeur, opts, garde = null) {
  if (!valeur) return x;
  for (let n = 0; n < 12; n++) {
    let fait = false;
    for (const p of paragraphes(x, 0, x.length)) {
      const m = motif.exec(p.texte);
      if (!m) continue;
      if (garde && !garde(x, p)) continue;
      const g = m.index + m[0].indexOf(m[1]);
      x = episser(x, p, g, g + m[1].length, String(valeur), opts?.run || null);
      fait = true;
      break;
    }
    if (!fait) break;
  }
  return x;
}

// ── L'identité : établissement et membre du personnel ───────────────────────
export function remplirIdentite(x, { etab = {}, membre = null }) {
  // Niveau et réseau
  x = cocherLibelle(x, /^ENSEIGNEMENT POUR ADULTES/);
  const type = String(etab.type_po || '').toUpperCase();
  if (type === 'WBE') x = cocherLibelle(x, /^Organisé WBE/);
  else if (type) {
    x = cocherLibelle(x, /^Subventionné par la FWB/);
    x = cocherLibelle(x, String(etab.sous_type || '').toLowerCase() === 'officiel' ? /^Officiel/ : /^Libre/);
  }
  // Le bloc de l'établissement, repéré à « Nom du PO »
  const t = tableauContenant(x, /Nom du PO/);
  if (t >= 0) {
    // Relu à chaque recherche : chaque écriture déplace ce qui suit.
    const ligne = motif => tableaux(x)[t].rows.findIndex(r => r.some(c => motif.test(T(x.slice(c.s, c.e)))));
    const poser = (motif, valeur) => {
      const r = ligne(motif); if (r < 0 || !valeur) return;
      const c = tableaux(x)[t].rows[r].findIndex(c0 => motif.test(T(x.slice(c0.s, c0.e))));
      if (c >= 0) x = ecrireCellule(x, t, r, c + 1, valeur);
    };
    poser(/^Nom du PO/, etab.po_nom);
    poser(/^Nom de l.établissement/, etab.etab_nom);
    poser(/^Adresse complète/, etab.adresse);
    const local = v => String(v || '').replace(/@.*$/, '');
    const rEc = ligne(/^ec\s/), rPo = ligne(/^po\s/);
    const celDe = (r, motif) => { const rr = tableaux(x)[t].rows[r]; return rr?.find(c => motif.test(T(x.slice(c.s, c.e)))); };
    const cEc = rEc >= 0 ? celDe(rEc, /^ec\s/) : null, cPo = rPo >= 0 ? celDe(rPo, /^po\s/) : null;
    if (cEc && etab.email_ec) x = remplacer(x, cEc, /ec(\s+)@/, ` ${local(etab.email_ec)} `);
    if (cPo && etab.email_po) x = remplacer(x, cPo, /po(\s+)@/, ` ${local(etab.email_po)} `);
    const gest = [[/^Nom\s*:/, etab.gest_nom], [/^Prénom\s*:/, etab.gest_prenom], [/^Qualité\s*:/, etab.gest_qualite],
      [/^Tél/, etab.gest_tel], [/^E-mail\s*:/, etab.gest_email]];
    for (const [m, v] of gest) {
      const r = ligne(m); if (r < 0 || !v) continue;
      const c = celDe(r, m); if (!c) continue;
      x = ajouter(x, c, m, v);
    }
  }
  // Les grilles de chiffres
  for (const i of grillesApres(x, /ECOT/, 10)) x = grille(x, i, 0, 0, etab.num_ecot, 10);
  for (const i of grillesApres(x, /FASE/, 5)) x = grille(x, i, 0, 0, etab.num_fase, 5);
  if (membre) {
    for (const i of grillesApres(x, /Matricule/i, 11)) x = grille(x, i, 0, 0, membre.matricule, 11);
    // NOM et prénom du membre — jamais dans le bloc des signatures, qui nomme
    // aussi le pouvoir organisateur, ni dans celui du gestionnaire.
    const tSig = tableauContenant(x, /SIGNATURES/);
    const horsSignature = (xx, p) => {
      if (tSig < 0) return true;
      const tb = tableaux(xx)[tSig];
      const d0 = tb.rows.find(r => r.length)?.[0]?.s ?? 0, f0 = [...tb.rows].reverse().find(r => r.length)?.at(-1)?.e ?? 0;
      return !(p.s >= d0 && p.s <= f0);
    };
    x = remplacerPartout(x, /NOM\s*:\s*([_….]{4,})/, membre.nom ? ` ${membre.nom}` : null, { run: { sz: 20, bold: true } }, horsSignature);
    x = remplacerPartout(x, /Prénom\s*:\s*([_….]{4,})/, membre.prenom ? ` ${membre.prenom}` : null, { run: { sz: 20 } }, horsSignature);
  }
  return x;
}

// ── Le contenu propre de six annexes ───────────────────────────────────────
const DATE_VIDE = /(_\s*_\s*\/\s*_\s*_\s*\/\s*_\s*_\s*_\s*_)/;

function remplirA4(x, d) {
  const m = d.membre || {};
  x = remplacer(x, tout(x), /entrée en fonction\s*:\s*(_[\s_/]+_)/, d.date_entree ? ` ${dateFr(d.date_entree)}` : null);
  for (const i of grillesApres(x, /NISS/i, 11)) x = grille(x, i, 0, 0, String(m.niss || '').replace(/\D/g, ''), 11);
  if (/^f/i.test(m.sexe || '')) x = cocher(x, 13);
  if (/^m|^h/i.test(m.sexe || '')) x = cocher(x, 14);
  x = remplacer(x, tout(x), /Lieu de naissance\s*:\s*(_{4,})/, m.lieu_naissance ? ` ${m.lieu_naissance}` : null);
  x = remplacer(x, tout(x), /Date de naissance[^:]*:\s*(_[\s_/]+_)/, m.date_naissance ? ` ${dateFr(m.date_naissance)}` : null);
  return x;
}

function remplirA6(x, d) {
  const m = d.membre || {};
  x = remplacer(x, tout(x), /Je soussigné\(e\),\s*([….]{6,})/, d.directeur ? ` ${d.directeur}` : null);
  x = remplacer(x, tout(x), /né\(e\) le\s*(…+\s*\/\s*…+\s*\/\s*…+)/, m.date_naissance ? ` ${dateFr(m.date_naissance)}` : null);
  x = remplacer(x, tout(x), /\sà\s+([….]{6,})/, m.lieu_naissance ? ` ${m.lieu_naissance}` : null);
  // Les services : une ligne par période d'attribution
  const tS = tableauContenant(x, /Date de début des services/);
  if (tS >= 0 && d.services?.length) {
    let tb = tableaux(x)[tS];
    const gabarit = (() => {
      const r1 = tb.rows[1]; const a = debutLigne(x, r1[0].s), b = x.indexOf('</w:tr>', r1.at(-1).e) + 7;
      return { a, b, xml: x.slice(a, b) };
    })();
    if (d.services.length > 1) x = x.slice(0, gabarit.b) + gabarit.xml.repeat(d.services.length - 1) + x.slice(gabarit.b);
    d.services.forEach((s, i) => {
      [dateFr(s.debut), dateFr(s.fin), s.niveau, s.fonction, s.situation, s.horaire, s.observations]
        .forEach((v, c) => { x = ecrireCellule(x, tS, 1 + i, c, v); });
    });
  }
  // Les interruptions : « néant » quand il n'y en a pas (obligatoire)
  const blocs = [
    [/TYPE D.INTERRUPTION/, d.interruptions, true],
    [/MALADIE OU D.INFIRMITE/, d.maladies, false],
    [/MATERNITE/, d.maternites, false],
  ];
  const tabsInter = tableaux(x).map((tb, i) => i).filter(i => /PERIODE/.test(T(x.slice(tableaux(x)[i].rows[0][0].s, tableaux(x)[i].rows[0].at(-1).e))));
  blocs.forEach(([, liste, avecType], k) => {
    const ti = tabsInter[k]; if (ti == null) return;
    if (!liste?.length) { x = ecrireCellule(x, ti, 2, 0, 'néant'); return; }
    liste.slice(0, 1).forEach(a => {
      x = ecrireCellule(x, ti, 2, 0, dateFr(a.debut)); x = ecrireCellule(x, ti, 2, 1, dateFr(a.fin));
      x = ecrireCellule(x, ti, 2, 2, String(a.jours ?? ''));
      if (avecType) x = ecrireCellule(x, ti, 2, 3, a.type || '');
    });
  });
  return x;
}

function remplirRelevé(x, d) {
  const an = /(\d{4})\D+(\d{4})/.exec(String(d.annee || ''));
  const tA = tableauContenant(x, /Année scolaire/);
  if (tA >= 0 && an) {
    x = remplacer(x, cellule(x, tA, 1, 0), /20\s*(_\s*_)\s*\/\s*20\s*_\s*_/, an[1].slice(2));
    x = remplacer(x, cellule(x, tA, 1, 0), /\/\s*20\s*(_\s*_)/, an[2].slice(2));
    if (d.mois) x = ecrireCellule(x, tA, 1, 1, MOIS[d.mois - 1]);
  }
  // Les dates d'absence du mois : trois lignes dans le modèle
  const tM = tableauContenant(x, /Date\(s\) de l.absence/);
  if (tM >= 0 && d.absences?.length) {
    const cel = () => cellule(x, tM, 3, 0);
    for (const a of d.absences.slice(0, 3)) x = remplacer(x, cel(), DATE_VIDE, dateFr(a.date));
    if (d.statut) x = ecrireCellule(x, tM, 3, 1, d.statut);
    const motifs = [...new Set(d.absences.map(a => a.motif).filter(Boolean))].join(' ; ');
    if (motifs) x = ecrireCellule(x, tM, 3, 2, motifs);
  }
  x = remplacer(x, tout(x), /Fait à\s*(_{4,})/, d.lieu ? ` ${d.lieu}` : null);
  return x;
}

function remplirA27(x, d) {
  const m = d.membre || {};
  const pts = /((?:\.\s){4,}\.?)/;
  const an = String(d.annee || '');
  x = remplacer(x, tout(x), /Année scolaire\s*:\s*((?:\.\s*){4,})/, ` ${an} `);
  x = remplacer(x, tout(x), /Mois de\s*:\s*((?:\.\s*){4,})/, d.mois ? ` ${MOIS[d.mois - 1]} ` : null);
  x = remplacer(x, tout(x), /Nom de l.établissement\s*:\s*((?:\.\s*){4,})/, ` ${d.etab?.etab_nom || ''} `);
  x = remplacer(x, tout(x), /N° ECOT\s*:\s*((?:\.\s*){4,})/, ` ${d.etab?.num_ecot || ''} `);
  x = remplacer(x, tout(x), /M\.\s*:\s*((?:\.\s*){4,})/, ` ${m.nom || ''} ${m.prenom || ''} `);
  if (d.mois) {
    const anneeCivile = /(\d{4})\D+(\d{4})/.exec(an);
    const ac = anneeCivile ? (d.mois >= 8 ? anneeCivile[1] : anneeCivile[2]) : '';
    x = remplacer(x, tout(x), /durant le mois de\s*((?:\.\s*){4,})/, ` ${MOIS[d.mois - 1]} `);
    x = remplacer(x, tout(x), /de l.année\s*((?:\.\s*){4,})/, ` ${ac} `);
  }
  // Matricule : la première ligne porte le libellé puis une case par chiffre
  const t0 = tableauContenant(x, /matricule enseignant/i);
  if (t0 >= 0) {
    // La grille alterne cases et intercalaires étroits (sexe | aa | mm | jj |
    // 4 chiffres) : on n'écrit que dans les vraies cases.
    const cases = tableaux(x)[t0].rows[0].map((c, i) => {
      const w = /<w:tcW w:w="(\d+)"/.exec(x.slice(c.s, c.e));
      return { i, w: w ? Number(w[1]) : 0 };
    }).filter(z => z.i > 0 && z.w > 300).map(z => z.i);
    const chiffres = String(m.matricule || '').replace(/\s/g, '').split('');
    chiffres.slice(0, cases.length).forEach((c, k) => { x = ecrireCellule(x, t0, 0, cases[k], c); });
  }
  // Une UE par bloc : trois dans le modèle
  const ues = d.ues || [];
  const tabsUE = tableaux(x).map((_, i) => i).filter(i => {
    const tb = tableaux(x)[i]; return /Dénomination du cours/.test(T(x.slice(tb.rows[0][0].s, tb.rows[0].at(-1).e)));
  });
  ues.slice(0, tabsUE.length).forEach((u, k) => {
    // l'intitulé de l'UE : la k-ième ligne « Intitulé de l'unité »
    for (let n = 0, vus = 0; n < 1; n++) {
      for (const p of paragraphes(x, 0, x.length)) {
        const mm = /Intitulé de l.unité d.enseignement\s*:\s*((?:\.\s*){4,})/.exec(p.texte);
        if (!mm) continue;
        if (vus++ < k) continue;
        const g = mm.index + mm[0].indexOf(mm[1]);
        x = episser(x, p, g, g + mm[1].length, ` ${u.intitule} `);
        break;
      }
    }
    const ti = tableaux(x).map((_, i) => i).filter(i => {
      const tb = tableaux(x)[i]; return /Dénomination du cours/.test(T(x.slice(tb.rows[0][0].s, tb.rows[0].at(-1).e)));
    })[k];
    const tb = tableaux(x)[ti];
    const r1 = tb.rows[1];
    const a = debutLigne(x, r1[0].s), b = x.indexOf('</w:tr>', r1.at(-1).e) + 7;
    const xml = x.slice(a, b);
    if (u.cours.length > 1) x = x.slice(0, b) + xml.repeat(u.cours.length - 1) + x.slice(b);
    u.cours.forEach((c, i) => {
      [c.denomination, c.cla, c.niveau, c.dates || '', c.periodes ?? '', c.f].forEach((v, col) => {
        x = ecrireCellule(x, ti, 1 + i, col, v == null ? '' : String(v));
        // Les tirets du modèle marquent une ligne vide : une ligne remplie
        // n'en garde aucun.
        const cel = cellule(x, ti, 1 + i, col);
        if (cel) {
          const avant = x.slice(cel.s, cel.e);
          const apres = avant.replace(/(<w:t(?: [^>]*)?>)\s*-+\s*(<\/w:t>)/g, '$1$2');
          x = x.slice(0, cel.s) + apres + x.slice(cel.e);
        }
      });
    });
  });
  return x;
}

function remplirA1ter(x, d) {
  // Les attributions : U.E. | F | Dénomination | CLA | Sous-niveau | Occupation | Nb | DI
  const tA = tableauContenant(x, /Sous-niveau/);
  const attrs = (d.attributions || []).filter(a => a && (a.ue || a.denomination));
  if (tA >= 0) {
    const tb = tableaux(x)[tA];
    const libres = tb.rows.length - 1;
    if (attrs.length > libres) {
      const r = tb.rows.at(-1); const a = debutLigne(x, r[0].s), b = x.indexOf('</w:tr>', r.at(-1).e) + 7;
      x = x.slice(0, b) + x.slice(a, b).repeat(attrs.length - libres) + x.slice(b);
    }
    attrs.forEach((a, i) => {
      [a.ue, a.f, a.denomination, a.cla, a.sous_niveau || 'SU', a.periode_occ, a.nb_periodes, a.di].forEach((v, c) => {
        x = ecrireCellule(x, tA, 1 + i, c, v == null ? '' : String(v));
      });
    });
  }
  x = remplacer(x, tout(x), /Date de début des prestations[^:]*:\s*(_[\s_/]+_(?:\s*_)*)/, d.date_debut ? ` ${dateFr(d.date_debut)}` : null);
  // Page 2 : le total par classification
  const tT = tableauContenant(x, /Attributions actuelles/);
  if (tT >= 0 && attrs.length) {
    const tot = {};
    for (const a of attrs) { const k = `${a.cla || '—'}|${a.sous_niveau || 'SU'}`; tot[k] = (tot[k] || 0) + (Number(a.nb_periodes) || 0); }
    const cles = Object.keys(tot);
    x = ecrireCellule(x, tT, 2, 0, cles.map(k => k.split('|')[0]).join('\n'));
    x = ecrireCellule(x, tT, 2, 1, cles.map(k => k.split('|')[1]).join('\n'));
    x = ecrireCellule(x, tT, 2, 2, cles.map(k => String(tot[k])).join('\n'));
  }
  // Toujours joint : le document des prestations mensuelles
  x = cocherLibelle(x, /^Document des prestations mensuelles/);
  // Le contrat d'expert accompagne toujours ce Doc12 (Charles, 27/09/2026).
  x = cocherLibelle(x, /^Copie du\/des contrat/);
  x = cocherLibelle(x, /^Expert/);
  return x;
}

const SPECIFIQUES = { A1ter: remplirA1ter, A4: remplirA4, A6: remplirA6, A14: remplirRelevé, A15: remplirRelevé, A27: remplirA27 };

/** Remplit une annexe. `d` porte etab, membre et le contenu propre. */
export async function remplirAnnexe(cle, d) {
  const a = ANNEXES.find(z => z.cle === cle);
  if (!a) throw new Error(`annexe inconnue : ${cle}`);
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(DOSSIER, a.fichier)));
  let x = await zip.file('word/document.xml').async('string');
  x = remplirIdentite(x, d);
  if (SPECIFIQUES[cle]) x = SPECIFIQUES[cle](x, d);
  zip.file('word/document.xml', x);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export default remplirAnnexe;

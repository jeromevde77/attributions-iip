// ─────────────────────────────────────────────────────────────────────────────
// IMPORTER UN COMPTE RENDU DE RÉUNION (3.5.379, Charles, 12 novembre 2026 : « on sait importer ce document ou un document ? » ;
// tranché : Word, PDF et texte, avec relecture). Lucie LIT le fichier et PROPOSE une réunion — titre, date, lieu, genre, ordre du
// jour, points et leurs notes, tâches (tableau « Quoi · Qui · Pour quand » ou liste sous « Tâches / Actions ») — que l'écran montre
// pour relecture. RIEN NE S'ÉCRIT ICI : la réunion se crée ensuite par POST /api/reunions, les tâches par POST /api/reunions/taches,
// chacune rattachée à une PERSONNE choisie à l'écran (un nom lu dans un fichier n'est qu'une indication).
// ─────────────────────────────────────────────────────────────────────────────
import { analyserFichier } from './texteCorpus.js';

const net = t => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const sans = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Le fichier en blocs : { type: 'h'|'p'|'li'|'tr', niveau, texte, cellules }. */
function blocsDuHtml(html) {
  const out = [];
  const re = /<(h[1-6]|p|li|tr)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    if (tag === 'tr') {
      const cellules = [...m[2].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => net(c[1]));
      if (cellules.some(Boolean)) out.push({ type: 'tr', cellules, texte: cellules.join(' · ') });
      continue;
    }
    // Un <li> qui contient un <p> : on garde le texte une fois (le <p> intérieur est sauté plus bas par la déduplication).
    const texte = net(m[2]);
    if (!texte) continue;
    out.push(tag[0] === 'h' ? { type: 'h', niveau: Number(tag[1]), texte } : { type: tag, texte });
  }
  // Déduplication : un <p> recopie souvent le texte du <li> qui l'enveloppe.
  return out.filter((b, i) => !(i > 0 && out[i - 1].texte === b.texte && out[i - 1].type !== 'tr'));
}
function blocsDuTexte(texte) {
  const out = [];
  for (const brut of String(texte).split(/\r?\n/)) {
    const l = brut.trim();
    if (!l || /^\|?\s*-{3,}/.test(l)) continue;
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { out.push({ type: 'h', niveau: h[1].length, texte: net(h[2]) }); continue; }
    if (/^\|.*\|$/.test(l)) { const c = l.slice(1, -1).split('|').map(net); out.push({ type: 'tr', cellules: c, texte: c.join(' · ') }); continue; }
    const li = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (li && !/^\d+[.)]\s/.test(l)) { out.push({ type: 'li', texte: net(li[1]) }); continue; }
    out.push({ type: 'p', texte: net(l) });
  }
  return out;
}

const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
export function dateDe(t) {
  const s = sans(t);
  let m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/.exec(s);
  return m ? `${m[3]}-${String(MOIS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
const GENRES = [[/secretariat/, 'secretariat'], [/equipe/, 'equipe'], [/coordination/, 'coordination']];

/** La proposition de réunion tirée d'un fichier. */
export async function proposerReunion(buffer, nomFichier = '') {
  const nom = String(nomFichier).toLowerCase();
  let blocs, avertissements = [];
  if (/\.(md|txt)$/.test(nom) || !(buffer.subarray(0, 2).toString() === 'PK' || buffer.subarray(0, 5).toString() === '%PDF-')) {
    blocs = blocsDuTexte(buffer.toString('utf8'));
  } else {
    const a = await analyserFichier(buffer, nomFichier);
    blocs = blocsDuHtml(a.html || '');
    avertissements = a.avertissements || [];
  }
  const r = { titre: '', date_seance: null, lieu: '', genre: 'equipe', ordre_du_jour: [], participants: '', points: [], taches: [], avertissements };

  // Les champs « Clé : valeur », où qu'ils soient.
  for (const b of blocs) {
    const m = /^(titre|genre|date|lieu|participants?|presents?)\s*:\s*(.+)$/i.exec(b.texte);
    if (!m) continue;
    const k = sans(m[1]);
    if (k === 'titre' && !r.titre) r.titre = m[2];
    else if (k === 'genre') r.genre = (GENRES.find(([re]) => re.test(sans(m[2]))) || [null, r.genre])[1];
    else if (k === 'date' && !r.date_seance) r.date_seance = dateDe(m[2]);
    else if (k === 'lieu' && !r.lieu) r.lieu = m[2];
    else if (/^(participants?|presents?)$/.test(k) && !r.participants) r.participants = m[2];
  }
  // Les blancs « [À COMPLÉTER] » d'un modèle restent des blancs.
  const vide = t => String(t || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  r.lieu = vide(r.lieu); r.participants = vide(r.participants);
  const h1 = blocs.find(b => b.type === 'h' && b.niveau === 1);
  if (!r.titre) r.titre = (h1?.texte || blocs[0]?.texte || 'Réunion').replace(/\s+[—-]\s+à coller.*$/i, '').slice(0, 160);
  if (!r.date_seance) r.date_seance = dateDe(blocs.slice(0, 8).map(b => b.texte).join(' ')) || null;

  // Les sections, par titre.
  const estTitre = b => b.type === 'h' && b.niveau <= 3;
  const section = re => {
    const i = blocs.findIndex(b => b.type === 'h' && re.test(sans(b.texte)));
    if (i < 0) return null;
    const n = blocs[i].niveau;
    const fin = blocs.findIndex((b, j) => j > i && b.type === 'h' && b.niveau <= n);
    return blocs.slice(i + 1, fin < 0 ? undefined : fin);
  };
  const odj = section(/ordre du jour/);
  if (odj) r.ordre_du_jour = odj.filter(b => b.type !== 'tr').map(b => b.texte.replace(/^\d+[.)]\s*/, ''));

  // Les tâches : un tableau (Quoi · Qui · Pour quand), sinon une liste sous « Tâches / Actions / Récapitulatif des actions ».
  const blocTaches = section(/^(\d+\.\s*)?(taches|actions|recapitulatif des actions|suites)/) || [];
  const lignes = blocs.filter(b => b.type === 'tr');
  const entete = lignes.find(l => l.cellules.some(c => /^quoi$/i.test(c)));
  if (entete) {
    const iQ = entete.cellules.findIndex(c => /^quoi$/i.test(c)), iW = entete.cellules.findIndex(c => /^qui$/i.test(c)),
      iD = entete.cellules.findIndex(c => /quand|echeance|échéance/i.test(c));
    for (const l of lignes.slice(lignes.indexOf(entete) + 1)) {
      const quoi = l.cellules[iQ] || '';
      if (!quoi) continue;
      const quand = iD >= 0 ? l.cellules[iD] || '' : '';
      r.taches.push({ titre: quoi, qui: iW >= 0 ? (l.cellules[iW] || '').replace(/\[[^\]]*\]/g, '').trim() : '', echeance: dateDe(quand), quand: quand.replace(/\[[^\]]*\]/g, '').trim() });
    }
  } else {
    // Une liste à puces fait les tâches ; les paragraphes qui la suivent (« Merci… », la signature) n'en sont pas.
    const puces = blocTaches.filter(b => b.type === 'li');
    for (const b of (puces.length ? puces : blocTaches.filter(b => b.type === 'p'))) r.taches.push({ titre: b.texte, qui: '', echeance: null, quand: '' });
  }

  // Les points : la section « Points » (chaque point ouvert par un titre ou un « N. Intitulé »), sinon chaque grande partie
  // numérotée du document qui n'est ni la fiche, ni l'ordre du jour, ni les tâches.
  const HORS = /fiche|ordre du jour|taches|actions|recapitulatif|suites/;
  const ouvrePoint = b => estTitre(b) || (b.type === 'p' && /^\d+\.\s+\S/.test(b.texte) && b.texte.length < 140);
  let source = section(/^points?\b/);
  if (!source) {
    source = [];
    let dedans = false;
    for (const b of blocs) {
      if (b === h1) continue;
      if (b.type === 'h' && b.niveau <= 2) { dedans = !HORS.test(sans(b.texte)); if (dedans) source.push({ ...b, type: 'h', niveau: 3 }); continue; }
      if (dedans) source.push(b);
    }
  }
  let courant = null;
  for (const b of source) {
    if (b.type === 'tr') continue;
    if (ouvrePoint(b)) { courant = { intitule: b.texte.replace(/^\d+\.\s*/, '').slice(0, 200), notes: [] }; r.points.push(courant); continue; }
    if (!courant) { courant = { intitule: 'Points divers', notes: [] }; r.points.push(courant); }
    courant.notes.push(b.type === 'li' ? `- ${b.texte}` : b.texte);
  }
  r.points = r.points.map(p => ({ intitule: p.intitule, notes: p.notes.join('\n') })).filter(p => p.intitule || p.notes);
  if (!r.ordre_du_jour.length) r.ordre_du_jour = r.points.map(p => p.intitule);
  if (!r.points.length) r.avertissements.push('Aucun point n’a été reconnu : les titres de parties (ou « 1. … ») ouvrent les points.');
  return r;
}

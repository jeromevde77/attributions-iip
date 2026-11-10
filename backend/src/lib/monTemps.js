/**
 * MON TEMPS — L'ÉCRAN DU PERSONNEL (3.5.301, Charles, 10 novembre 2026 : « mon personnel me dit que cette gestion du temps de
 * travail, de l'agenda de l'école, est un peu complexe » ; maquette validée : docs/maquettes/mon-temps.html).
 *
 * Ce que la personne a besoin de lire et de faire, et rien d'autre : sa semaine prévue, « j'ai travaillé autrement » (un écart),
 * son année en 52 cases, son relevé à signer, et ses DEMANDES. Une demande remplace l'assistant de modulation : on dit ce qu'on
 * voudrait (un congé, travailler une semaine de congé, plus ou moins d'heures), Lucie compose le changement avec le moteur de la
 * ligne du temps (`assistant`, `proposer`) et le contrôle ; la direction l'accepte d'un clic (`simple`). La ligne du temps, la
 * tension, les grands moments restent dans l'écran de la direction.
 */
import db from '../db/index.js';
import { anneeDe, releve, ficheConges, plusJours, semainesDeLAnnee, REGLES, hm, ABSENCES } from './tempsTravail.js';
import { fermetures } from './agendaEcole.js';
import { modulations, proposer } from './ligneTemps.js';

const lundiDe = s => { const d = new Date(`${s}T00:00:00Z`); const w = (d.getUTCDay() + 6) % 7; return plusJours(s, -w); };
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const err = (m, status = 400) => Object.assign(new Error(m), { status });

/** Tout ce que l'écran montre, pour une personne et une année. `lundi` : la semaine regardée (cette semaine par défaut). */
export function monTemps(uid, annee, lundi = null) {
  const p = db.prepare('SELECT * FROM tt_personne WHERE utilisateur_id = ?').get(uid);
  const sem = anneeDe(uid, annee);
  const semaines = semainesDeLAnnee(annee);
  const auj = aujourdhui();
  const l = lundiDe(lundi || (auj >= semaines[0] && auj <= plusJours(semaines[51], 6) ? auj : semaines[0]));

  // La semaine : les jours du relevé (prévu, réel, férié, écart saisi), lus dans le ou les mois qu'elle touche.
  const mois = [...new Set([0, 6].map(k => plusJours(l, k).slice(0, 7)))];
  const jours = mois.flatMap(m => releve(uid, annee, m).jours).filter(j => j.jour >= l && j.jour <= plusJours(l, 6));
  const verrous = Object.fromEntries(mois.map(m => [m, releve(uid, annee, m).verrouille]));

  // Les relevés : chaque mois de l'année jusqu'au mois courant.
  const releves = [];
  for (let m = semaines[0].slice(0, 7); m <= auj.slice(0, 7) && m <= plusJours(semaines[51], 6).slice(0, 7);) {
    const r = releve(uid, annee, m);
    const sig = e => r.signatures.find(s => s.etape === e && s.valable) || null;
    releves.push({ mois: m, prevu: r.prevu, reel: r.reel, ecart: r.ecart, solde: r.solde, verrouille: r.verrouille,
      signe_personne: sig('personne'), signe_direction: sig('direction') });
    const [y, mm] = m.split('-').map(Number); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  const dernier = releves[releves.length - 1] || null;

  // L'année : une case par semaine ; la fermeture de l'école et les demandes en attente s'y lisent.
  const ferm = fermetures(annee);
  const demandes = modulations(annee, uid);
  const enAttente = new Set(demandes.filter(d => ['proposee', 'controlee'].includes(d.statut)).flatMap(d => d.changements.map(c => c.lundi)));
  const parLundi = new Map(sem.map(s => [s.lundi, s]));
  const modele = Math.round(REGLES.hebdo * (Number(p?.fraction) || 1));   // REGLES.hebdo est en minutes
  const annee52 = semaines.map(x => {
    const s = parLundi.get(x);
    return { lundi: x, statut: s?.statut || null, minutes: s?.minutes || 0, forte: !!s && s.statut === 'travail' && s.minutes > modele,
      fermeture: ferm.get(x)?.fermeture || null, libelle: ferm.get(x)?.libelle || null, demande: enAttente.has(x), passee: plusJours(x, 6) < auj };
  });

  // Le prochain congé : la première période de congé qui n'est pas finie.
  const fc = ficheConges(uid, annee);
  const p0 = fc.periodes.find(x => x.au >= auj) || null;
  // Son nom vient de l'agenda de l'école quand il y est posé (« Noël », « Carnaval »), plutôt que du statut de la semaine.
  const prochain = p0 ? { ...p0, libelle: ferm.get(p0.du)?.libelle || p0.libelle } : null;

  const du = Math.round(REGLES.hebdo * (Number(p?.fraction) || 1)) * (52 - REGLES.congesAnnuels);
  return {
    personne: p ? { fraction: p.fraction, formule: p.formule } : null,
    genere: sem.length > 0,
    semaine: { lundi: l, jours, verrous, prevu: jours.reduce((s, j) => s + j.prevu, 0), reel: jours.reduce((s, j) => s + j.reel, 0) },
    solde: dernier ? dernier.solde : 0,
    prevu_annee: sem.reduce((s, x) => s + x.minutes, 0), du_annee: du,
    prochain_conge: prochain,
    releves: releves.reverse(),
    annee: annee52,
    demandes: demandes.map(d => ({ id: d.id, statut: d.statut, resume: d.resume, mot: d.mot, propose_le: d.propose_le,
      direction_le: d.direction_le, refus_le: d.refus_le, motif_refus: d.motif_refus, lundis: d.changements.map(c => c.lundi) })),
    // Les semaines de congé qu'on peut rendre au travail (pas une fermeture totale de l'école, pas passées) : l'échange d'un congé.
    conges_echangeables: annee52.filter(x => x.statut && x.statut !== 'travail' && x.fermeture !== 'totale' && !x.passee).map(x => x.lundi),
    travail_echangeable: annee52.filter(x => x.statut === 'travail' && !x.passee).map(x => x.lundi),
    absences: ABSENCES,
  };
}

/* UNE DEMANDE, EN MOTS DE TOUS LES JOURS.
 *   conge      : être en congé la semaine `lundi`, en échange d'une semaine de congé `echange` qu'on travaille ;
 *   travailler : travailler la semaine de congé `lundi`, et prendre en congé la semaine de travail `echange` ;
 *   plus/moins : `heures` de plus ou de moins la semaine `lundi` — Lucie reporte la différence sur les semaines à venir.
 * Treize semaines de congé et 1 404 heures, toujours : c'est le moteur qui le garantit, sinon rien ne part. */
export function deposerDemande(uid, annee, b, user, nomUser) {
  const lundi = lundiDe(String(b.lundi || ''));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lundi)) throw err('Quelle semaine ?');
  const echange = b.echange ? lundiDe(String(b.echange)) : null;
  const jour = d => d.split('-').reverse().join('/');
  let v, resume;
  if (b.type === 'conge') {
    if (!echange) throw err('Un congé s’échange contre une semaine de congé que vous travaillerez : laquelle ?');
    v = { prendre: [lundi], travailler: [echange] };
    resume = `Congé la semaine du ${jour(lundi)}, travail la semaine du ${jour(echange)}`;
  } else if (b.type === 'travailler') {
    if (!echange) throw err('Travailler une semaine de congé, c’est en prendre une autre : laquelle ?');
    v = { travailler: [lundi], prendre: [echange] };
    resume = `Travail la semaine du ${jour(lundi)}, congé la semaine du ${jour(echange)}`;
  } else if (b.type === 'plus' || b.type === 'moins') {
    const h = Number(String(b.heures || '').replace(',', '.'));
    if (!(h > 0 && h <= 12)) throw err('Combien d’heures (entre une demi-heure et douze) ?');
    const s = anneeDe(uid, annee).find(x => x.lundi === lundi);
    if (!s || s.statut !== 'travail') throw err('Cette semaine n’est pas une semaine de travail.');
    const delta = Math.round(h * 60) * (b.type === 'plus' ? 1 : -1);
    v = { cibles: { [lundi]: s.minutes + delta } };
    resume = `${b.type === 'plus' ? 'Plus' : 'Moins'} d’heures la semaine du ${jour(lundi)} : ${hm(s.minutes + delta)} au lieu de ${hm(s.minutes)}`;
  } else throw err('Type de demande inconnu.');
  try {
    return proposer(uid, annee, { ...v, simple: true, resume, mot: b.mot }, user, nomUser);
  } catch (e) {
    // Le moteur dit pourquoi en détail : on rend la première raison, en clair.
    const raisons = [...new Set([...(e.bilan?.erreurs || []), ...(e.bilan?.changees || []).flatMap(c => c.controles || [])])].filter(Boolean);
    throw Object.assign(err(raisons.length ? raisons.join(' ') : e.message, e.status || 400), { bilan: e.bilan });
  }
}

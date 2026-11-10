/**
 * LES BESOINS DE L'ÉCOLE (3.5.309, Charles, 10 novembre 2026 : « ce n'est pas un outil avancé : ça intègre l'horaire de l'équipe
 * admin avec celui de l'établissement, des étudiants et des examens — un graphique des besoins, des moments à fort travail ; si
 * examen, même un samedi, il faut un MDP du staff admin, de 7 h 00 à 21 h 30 » ; tranché : en relais, au moins une personne à tout
 * moment ; les jours de cours ordinaires, non — on est joignable par téléphone et le campus a sa ligne d'urgence ; un trou se
 * signale et Lucie propose un relais).
 *
 * `besoins(annee)` : la charge de chaque semaine (la chaleur de la ligne du temps) face aux présents de l'équipe, et chaque JOUR
 * D'EXAMEN (épreuves de 1re et 2e session, passages) avec sa couverture par le secrétariat entre 7 h 00 et 21 h 30 — les pauses
 * comptent comme des absences. `relais(annee, date)` : une proposition — décaler les journées de ceux qui travaillent ce jour-là
 * (même durée, rien à compenser), ou faire venir deux personnes un jour sans personne (samedi) ; elle s'applique par
 * `retoucherSemaine` (lib/monTemps.js), semaine par semaine.
 */
import db from '../db/index.js';
import { anneeDe, semainesDeLAnnee, plusJours, dureeJour } from './tempsTravail.js';
import { chaleur } from './ligneTemps.js';
import { tousLesPassages } from './passages.js';

export const OUVERTURE_EXAMEN = '07:00';
export const FERMETURE_EXAMEN = '21:30';
const essai = (f, d) => { try { return f(); } catch { return d; } };
const min = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const lundiDe = s => { const d = new Date(`${s}T00:00:00Z`); const w = (d.getUTCDay() + 6) % 7; return plusJours(s, -w); };
const indexJour = s => (new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Les jours d'examen de l'année : date → épreuves (« UE 333 · 333.1 »). */
export function joursExamen(annee) {
  const parJour = new Map();
  const ajouter = (date, libelle) => { if (!date) return; const d = String(date).slice(0, 10); if (!parJour.has(d)) parJour.set(d, new Set()); parJour.get(d).add(libelle); };
  const existe = new Set(essai(() => db.prepare('SELECT DISTINCT ue_num FROM ue WHERE annee_scolaire = ?').all(annee).map(x => x.ue_num), []));
  for (const [t, k] of [['epreuve_session1', 's1'], ['deliberation_session2', 's2']]) {
    for (const e of essai(() => db.prepare(`SELECT ue_num, COALESCE(cours_code, '') c, ${k}_date d FROM ${t} WHERE annee_scolaire = ? AND ${k}_date IS NOT NULL AND ${k}_date <> ''`).all(annee), [])) {
      if (existe.size && !existe.has(e.ue_num)) continue;
      ajouter(e.d, `UE ${e.ue_num}${e.c ? ` · ${e.c}` : ''}${k === 's2' ? ' (2e session)' : ''}`);
    }
  }
  for (const p of essai(() => tousLesPassages(annee), [])) ajouter(p.date, `UE ${p.ue_num}${p.cours_code ? ` · ${p.cours_code}` : ''}${p.partie ? ` · ${p.partie}` : ''}`);
  return parJour;
}

/** Qui est là, et quand, un jour donné : les journées prévues de l'équipe, coupées par leurs pauses. */
function presences(annee, date) {
  const gens = db.prepare(`SELECT p.utilisateur_id id, u.nom_complet nom, u.email FROM tt_personne p JOIN utilisateur u ON u.id = p.utilisateur_id
    WHERE p.actif = 1 ORDER BY u.nom_complet`).all();
  const l = lundiDe(date), i = indexJour(date);
  return gens.map(g => {
    const s = anneeDe(g.id, annee).find(x => x.lundi === l);
    const j = s?.statut === 'travail' ? s.jours?.[i] : null;
    const plages = [];
    if (j && !j.recup && min(j.debut) != null && min(j.fin) != null) {
      if (j.pause_debut && j.pause_fin) { plages.push([min(j.debut), min(j.pause_debut)]); plages.push([min(j.pause_fin), min(j.fin)]); }
      else plages.push([min(j.debut), min(j.fin)]);
    }
    return { id: g.id, nom: g.nom || g.email, statut: s?.statut || null, jour: j && !j.recup ? j : null, plages };
  });
}

/** Les trous de couverture entre l'ouverture et la fermeture : [[début, fin]] en minutes. */
function trous(plages, a = min(OUVERTURE_EXAMEN), b = min(FERMETURE_EXAMEN)) {
  const p = plages.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x).sort((u, v) => u[0] - v[0]);
  const out = []; let t = a;
  for (const [x, y] of p) { if (x > t) out.push([t, x]); t = Math.max(t, y); }
  if (t < b) out.push([t, b]);
  return out;
}

export function besoins(annee) {
  const semaines = semainesDeLAnnee(annee);
  const ch = new Map(essai(() => chaleur(annee), []).map(c => [c.lundi, c]));
  const gens = db.prepare('SELECT utilisateur_id id FROM tt_personne WHERE actif = 1').all();
  const statuts = new Map(gens.map(g => [g.id, new Map(anneeDe(g.id, annee).map(s => [s.lundi, s.statut]))]));
  const ex = joursExamen(annee);
  const examensParSemaine = new Map();
  for (const d of ex.keys()) { const l = lundiDe(d); examensParSemaine.set(l, (examensParSemaine.get(l) || 0) + 1); }
  const semainesOut = semaines.map(l => ({
    lundi: l, score: ch.get(l)?.score || 0, niveau: ch.get(l)?.niveau || 'normal', conge: !!ch.get(l)?.conge,
    presents: gens.filter(g => statuts.get(g.id)?.get(l) === 'travail').length, examens: examensParSemaine.get(l) || 0,
  }));
  const auj = new Date().toISOString().slice(0, 10);
  const fin = plusJours(semaines[51], 6);
  const jours = [...ex.keys()].filter(d => d >= semaines[0] && d <= fin).sort().map(d => {
    const pr = presences(annee, d);
    const t = trous(pr.flatMap(p => p.plages));
    return { date: d, passe: d < auj, epreuves: [...ex.get(d)].sort(), presents: pr.filter(p => p.plages.length).map(p => ({ id: p.id, nom: p.nom, debut: p.jour.debut, fin: p.jour.fin })),
      trous: t.map(([a, b]) => ({ de: hh(a), a: hh(b) })), couvert: !t.length };
  });
  return { ouverture: OUVERTURE_EXAMEN, fermeture: FERMETURE_EXAMEN, semaines: semainesOut, jours_examen: jours,
    a_couvrir: jours.filter(j => !j.couvert && !j.passe).length };
}

/* LE RELAIS PROPOSÉ. Ceux qui travaillent ce jour-là : le premier commence à 7 h 00, le dernier finit à 21 h 30, chacun garde la
   DURÉE de sa journée (rien à compenser) ; leur pause se place dans le recouvrement. Personne ce jour-là (un samedi) : les deux
   personnes les moins chargées de la semaine viennent, l'une de 7 h 00 à 15 h 30, l'autre de 13 h 00 à 21 h 30, pauses dans le
   recouvrement — ces heures-là se compensent ailleurs (ou vont au solde). */
export function relais(annee, date) {
  const pr = presences(annee, date);
  const i = indexJour(date), l = lundiDe(date);
  const a = min(OUVERTURE_EXAMEN), b = min(FERMETURE_EXAMEN);
  const changes = [];
  /* DEUX JOURNÉES EN RELAIS, DANS LES RÈGLES : la première de 7 h 00 à 15 h 30 (pause à 12 h 00), la seconde de 12 h 00 à 21 h 30
     (pause à 15 h 00, quand la première est encore là) — personne seul au-delà de 6 h d'affilée, aucun trou, 8 h et 9 h de travail. */
  const matin = { debut: '07:00', fin: '15:30', pause_debut: '12:00', pause_fin: '12:30' };
  const soir = { debut: '12:00', fin: '21:30', pause_debut: '15:00', pause_fin: '15:30' };
  const semaineDe = id => anneeDe(id, annee).find(x => x.lundi === l);
  const chargeDe = id => (semaineDe(id)?.jours || []).reduce((t, j) => t + (j && !j.recup ? dureeJour(j) : 0), 0);
  // On prend d'abord ceux qui travaillent déjà ce jour-là (le plus tôt arrivé pour le matin), puis les moins chargés de la semaine.
  const candidats = pr.filter(p => p.statut === 'travail')
    .sort((x, y) => (x.jour ? 0 : 1) - (y.jour ? 0 : 1) || (x.jour && y.jour ? min(x.jour.debut) - min(y.jour.debut) : chargeDe(x.id) - chargeDe(y.id)));
  const [p1, p2] = candidats;
  for (const [p, j] of [[p1, matin], [p2, soir]]) {
    if (!p) continue;
    const c = { id: p.id, nom: p.nom, avant: p.jour, apres: j, recupere: null };
    // Un jour où la personne ne travaillait pas (un samedi) : elle récupère, la même semaine, le jour de semaine le plus proche en
    // durée — la semaine garde à peu près ses heures, et l'écart restant va au solde.
    if (!p.jour) {
      const sj = semaineDe(p.id)?.jours || [];
      const dureeVoulue = dureeJour(j);
      let k = -1, ecart = Infinity;
      // Jamais un autre jour d'examen : il faut aussi y être.
      const examens = joursExamen(annee);
      for (let d = 0; d < 5; d++) {
        if (d === i || !sj[d] || sj[d].recup || examens.has(plusJours(l, d))) continue;
        const e = Math.abs(dureeJour(sj[d]) - dureeVoulue); if (e < ecart) { ecart = e; k = d; }
      }
      if (k >= 0) c.recupere = k;
    }
    changes.push(c);
  }
  const plages = pr.filter(p => !changes.some(c => c.id === p.id)).flatMap(p => p.plages);
  for (const c of changes) {
    const j = c.apres;
    if (j.pause_debut) { plages.push([min(j.debut), min(j.pause_debut)], [min(j.pause_fin), min(j.fin)]); } else plages.push([min(j.debut), min(j.fin)]);
  }
  const reste = trous(plages);
  // Les jours de chaque semaine touchée, prêts pour `retoucherSemaine`.
  const semaines = changes.map(c => {
    const s = anneeDe(c.id, annee).find(x => x.lundi === l);
    const jours = (s?.jours || Array(7).fill(null)).map(x => (x && !x.recup ? { ...x } : null));
    jours[i] = c.apres;
    if (c.recupere != null) jours[c.recupere] = null;
    return { uid: c.id, nom: c.nom, lundi: l, jours, recupere: c.recupere != null ? ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'][c.recupere] : null };
  });
  return { date, changes, semaines, couvert: !reste.length, reste: reste.map(([x, y]) => ({ de: hh(x), a: hh(y) })),
    impossible: !changes.length ? 'Personne de l’équipe ne travaille cette semaine-là : un relais n’est pas possible.' : null };
}

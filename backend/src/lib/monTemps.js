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
import { anneeDe, releve, ficheConges, plusJours, semainesDeLAnnee, REGLES, hm, ABSENCES, dureeJour, controleSemaine, reglage, verrouille, modeleSemaine } from './tempsTravail.js';
import { fermetures } from './agendaEcole.js';
import { modulations, proposer, assistant, valider } from './ligneTemps.js';

const lundiDe = s => { const d = new Date(`${s}T00:00:00Z`); const w = (d.getUTCDay() + 6) % 7; return plusJours(s, -w); };
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const err = (m, status = 400) => Object.assign(new Error(m), { status });

/* LES NOTIFICATIONS DES DEMANDES (3.5.303, Charles : « ajoute la notification pour les demandes de temps »). Une demande déposée
   prévient la direction, à sa personne (directeur, administrateur : ceux qui l'acceptent) ; la réponse prévient la personne. */
const LIEN_DIRECTION = '/organisation?onglet=temps-travail';   // 3.5.307 : l'écran de la direction vit dans Organisation
const LIEN_PERSONNE = '/professeurs?vue=temps';
function notifier(uid, titre, corps, lien, par) {
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cree_par) VALUES ('temps_demande', ?, ?, ?, ?, ?)`)
      .run(titre, corps || null, lien, uid, par || null);
  } catch (e) { console.error('[mon temps] notification :', e.message); }
}
export function notifierDemande(dm, nomUser) {
  const direction = db.prepare("SELECT id FROM utilisateur WHERE actif = 1 AND role IN ('directeur', 'admin')").all();
  for (const u of direction) {
    if (u.id === dm.utilisateur_id) continue;
    notifier(u.id, `Temps de travail — demande de ${nomUser}`, `${dm.resume}${dm.mot ? ` · « ${dm.mot} »` : ''}. À accepter ou refuser dans Organisation → Horaires du personnel.`, LIEN_DIRECTION, nomUser);
  }
}
export function notifierReponse(m, nomUser) {
  if (!m?.simple || !['acceptee', 'refusee'].includes(m.statut)) return;
  notifier(m.utilisateur_id, m.statut === 'acceptee' ? 'Votre demande de temps est acceptée' : 'Votre demande de temps est refusée',
    `${m.resume}${m.statut === 'refusee' && m.motif_refus ? ` — ${m.motif_refus}` : ''}`, LIEN_PERSONNE, nomUser);
}

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
    const dm = proposer(uid, annee, { ...v, simple: true, resume, mot: b.mot }, user, nomUser);
    if (['proposee', 'controlee'].includes(dm.statut)) notifierDemande(dm, nomUser);
    return dm;
  } catch (e) {
    // Le moteur dit pourquoi en détail : on rend la première raison, en clair.
    const raisons = [...new Set([...(e.bilan?.erreurs || []), ...(e.bilan?.changees || []).flatMap(c => c.controles || [])])].filter(Boolean);
    throw Object.assign(err(raisons.length ? raisons.join(' ') : e.message, e.status || 400), { bilan: e.bilan });
  }
}


/* LE PLAN D'HEURES DE L'ÉQUIPE (3.5.304, Charles : « gérer l'année en entier avec des moments avec plus d'heures pour certains et
   d'autres moins » ; tranché : peindre sur la grille, Lucie propose la compensation et la direction corrige, pour toute l'équipe ou
   certaines personnes). Pour chaque personne : ses semaines peintes portent `delta` minutes de plus (ou de moins) ; l'assistant de la
   ligne du temps remet la différence dans ses semaines calmes, en évitant les grands moments, dans les bornes légales. `exclure` :
   { uid: [lundis] } — les semaines que la direction retire de la compensation. Simulation d'abord ; `ecrire` : tout ou rien, appliqué
   directement (la direction approuve seule). */
export function planHeures(annee, { uids = [], lundis = [], delta = 0, exclure = {} } = {}, { ecrire = false, user = null, nomUser = '' } = {}) {
  const d = Math.round(Number(delta) || 0);
  if (!d) throw err('Combien d’heures de plus ou de moins par semaine ?');
  if (!uids.length) throw err('Cochez au moins une personne.');
  const semaines = [...new Set(lundis.map(l => lundiDe(String(l))))].sort();
  if (!semaines.length) throw err('Quelles semaines ?');
  const resultats = uids.map(Number).map(uid => {
    const p = db.prepare('SELECT p.*, u.nom_complet, u.email FROM tt_personne p JOIN utilisateur u ON u.id = p.utilisateur_id WHERE p.utilisateur_id = ?').get(uid);
    if (!p) return { uid, nom: `#${uid}`, erreurs: ['Personne non désignée dans le module.'] };
    const sem = new Map(anneeDe(uid, annee).map(s => [s.lundi, s]));
    const cibles = {};
    for (const l of semaines) { const s = sem.get(l); if (s?.statut === 'travail') cibles[l] = s.minutes + d; }
    const v = { cibles, exclure: (exclure[uid] || []).map(String) };
    const nom = p.nom_complet || p.email;
    if (!Object.keys(cibles).length) return { uid, nom, erreurs: ['Aucune semaine de travail dans la période choisie (congés ou école fermée).'] };
    try {
      const plan = assistant(uid, annee, v);
      return { uid, nom, v, du: plan.du, apres: plan.apres, erreurs: plan.erreurs, avertissements: plan.avertissements,
        en_defaut: plan.en_defaut,
        chargees: plan.changees.filter(c => !c.report).map(c => ({ lundi: c.lundi, avant: c.avant, apres: c.apres, controles: c.controles })),
        compensees: plan.changees.filter(c => c.report).map(c => ({ lundi: c.lundi, avant: c.avant, apres: c.apres, chaleur: c.chaleur, controles: c.controles })) };
    } catch (e) { return { uid, nom, erreurs: [e.message] }; }
  });
  const bloque = resultats.some(r => r.erreurs?.length || r.en_defaut);
  if (!ecrire) return { simulation: true, resultats, bloque };
  if (bloque) throw Object.assign(err('Le plan ne tient pas pour toutes les personnes : rien n’est enregistré.'), { bilan: { resultats } });
  const h = Math.abs(d) / 60, hTxt = `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`;
  const resume = `Plan d’heures : ${d > 0 ? '+' : '−'} ${hTxt} par semaine du ${semaines[0].split('-').reverse().join('/')} au ${plusJours(semaines[semaines.length - 1], 4).split('-').reverse().join('/')}`;
  const faits = resultats.map(r => proposer(r.uid, annee, { ...r.v, resume }, user, nomUser));
  return { ecrit: faits.length, resultats };
}


/* UNE SEMAINE RETOUCHÉE À LA MAIN (3.5.305, Charles : « si je clique sur une case, l'horaire de la semaine du MDP apparaît, toute la
   semaine, les heures en vertical ; que je puisse réduire ou ajouter »). `jours` : les sept journées telles que la direction les veut
   ({ debut, fin, pause_debut, pause_fin } ou null). Si le total change, Lucie remet la différence dans les semaines calmes à venir
   (l'assistant de la ligne du temps), pour que l'année garde ses heures ; la semaine retouchée garde EXACTEMENT ce qui a été posé.
   Simulation d'abord ; `ecrire` applique directement (la direction approuve seule), avec la trace d'une modulation acceptée. */
const totalJ = jours => (jours || []).reduce((t, j) => t + (j && !j.recup ? dureeJour(j) : 0), 0);
export function retoucherSemaine(uid, annee, lundi, jours, { ecrire = false, user = null, nomUser = '', compenser = false } = {}) {
  lundi = lundiDe(String(lundi || ''));
  const p = db.prepare('SELECT * FROM tt_personne WHERE utilisateur_id = ?').get(uid);
  if (!p) throw err('Personne non désignée.', 404);
  const sem = anneeDe(uid, annee);
  const s = sem.find(x => x.lundi === lundi);
  if (!s) throw err('Semaine inconnue : préparez d’abord l’année.', 404);
  if (s.statut !== 'travail') throw err('Une semaine de congé ne porte pas d’heures.', 409);
  if (verrouille(uid, lundi) || verrouille(uid, plusJours(lundi, 6))) throw err('Ce mois est approuvé : il ne change plus.', 409);
  const propres = Array.from({ length: 7 }, (_, i) => {
    const j = jours?.[i];
    if (!j || !j.debut || !j.fin) return null;
    return { debut: j.debut, fin: j.fin, ...(j.pause_debut && j.pause_fin ? { pause_debut: j.pause_debut, pause_fin: j.pause_fin } : {}) };
  });
  const R = reglage(annee);
  const avantT = s.minutes, apresT = totalJ(propres);
  let compensees = [], du = Math.round(REGLES.hebdo * (Number(p.fraction) || 1)) * (52 - REGLES.congesAnnuels), apresAnnee = sem.reduce((t, x) => t + x.minutes, 0) - avantT + apresT;
  let erreurs = [];
  /* LA DIFFÉRENCE VA AU SOLDE, PAR DÉFAUT (3.5.311, Charles, semaine de Mati du 17/08 réduite de 2 h 45 : « cela ne comptabilise
     pas les heures en moins » — Lucie les avait reportées d'office sur la semaine du 16/11). Une semaine retouchée garde ce qu'on y a
     posé, et l'écart se lit sur l'année ; on ne compense ailleurs que si on le demande (`compenser`). */
  if (apresT !== avantT && compenser) {
    const plan = assistant(uid, annee, { cibles: { [lundi]: apresT } });
    compensees = plan.changees.filter(c => c.report).map(c => ({ lundi: c.lundi, avant: c.avant, apres: c.apres, jours: c.jours, controles: c.controles }));
    apresAnnee = plan.apres - (plan.changees.find(c => c.lundi === lundi)?.apres || 0) + apresT;
    // CE QUI NE TROUVE PAS DE PLACE VA AU SOLDE (3.5.308, Charles, cas de Mati : 4 jours de 9 h, plus aucune marge dans ses
    // journées) : l'année affiche l'écart, à replacer plus tard ; l'enregistrement n'est pas bloqué.
    erreurs = [...plan.erreurs.filter(e => !/compterait|restent à placer|sont en trop/.test(e))];
  }
  // La semaine retouchée suit les règles de l'horaire annualisé dès que son total change (8 h ou 9 h par jour, 45 h au plus, 2 h d'écart).
  const formule = apresT !== avantT ? 'annualise' : p.formule;
  // L'écart de 2 h par jour se mesure sur une journée qui existait et existe encore : un jour déplacé (le samedi d'examen travaillé,
  // le vendredi récupéré) n'est pas une journée allongée (3.5.309).
  const deplaces = new Set(propres.map((j, i) => ((!j) !== (!s.jours?.[i]) ? i : null)).filter(x => x != null));
  const JOURS_NOM = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const controles = controleSemaine(propres, { formule, fraction: Number(p.fraction) || 1, modele: s.jours, rtVariable: R.rt_variable })
    .filter(c => !/doit compter exactement/.test(c))
    .filter(c => !(/au plus 2 h de plus que l’horaire prévu/.test(c) && [...deplaces].some(i => c.startsWith(`${JOURS_NOM[i]} :`))));
  for (const c of compensees) for (const e of c.controles || []) erreurs.push(`Semaine du ${c.lundi.split('-').reverse().join('/')} : ${e}`);
  const bilan = { lundi, avant: avantT, apres: apresT, jours: propres, compensees, du, apres_annee: apresAnnee, au_solde: apresAnnee - du, controles, erreurs };
  if (!ecrire) return { simulation: true, ...bilan };
  if (controles.length || erreurs.length) throw Object.assign(err('La semaine ne tient pas encore : rien n’est enregistré.'), { bilan });
  // La trace : une modulation, acceptée aussitôt par la direction (le registre des demandes garde qui, quand, quoi).
  const changements = [{ lundi, jours: propres, avant: avantT, apres: apresT, statut: 'travail', statut_avant: 'travail' },
    ...compensees.map(c => ({ lundi: c.lundi, jours: c.jours, avant: c.avant, apres: c.apres, statut: 'travail', statut_avant: 'travail' }))];
  const avant = Object.fromEntries(sem.filter(x => changements.some(c => c.lundi === x.lundi)).map(x => [x.lundi, { statut: x.statut, jours: x.jours }]));
  const resume = `Semaine du ${lundi.split('-').reverse().join('/')} retouchée : ${hm(apresT)} au lieu de ${hm(avantT)}${compensees.length ? `, compensé sur ${compensees.length} semaine(s)` : apresT !== avantT ? `, ${apresT < avantT ? `${hm(avantT - apresT)} en moins` : `${hm(apresT - avantT)} en plus`} au solde` : ''}`;
  const id = Number(db.prepare(`INSERT INTO tt_modulation (utilisateur_id, annee, statut, resume, changements_json, avant_json, propose_par, propose_par_id, simple)
    VALUES (?,?,?,?,?,?,?,?,1)`).run(uid, annee, 'proposee', resume, JSON.stringify(changements), JSON.stringify(avant), nomUser, user?.id ?? null).lastInsertRowid);
  return valider(id, 'direction', user, nomUser);
}


/* LA SEMAINE TYPE (3.5.308, Charles : « je ne sais pas proposer un horaire qui se répète » ; tranché : un horaire type par personne).
   La direction dessine la semaine habituelle de chacun ; le générateur de l'année la reprend, et elle s'applique aux semaines de
   travail À VENIR de l'année déjà posée — seulement celles restées telles que le modèle précédent les avait posées : une semaine
   modulée, retouchée ou dans un mois approuvé garde ce qu'on y a fait. */
export function semaineType(uid) {
  const p = db.prepare('SELECT * FROM tt_personne WHERE utilisateur_id = ?').get(uid);
  if (!p) throw err('Personne non désignée.', 404);
  let t = null; try { t = JSON.parse(p.semaine_type || 'null'); } catch { t = null; }
  const defaut = modeleSemaine(p.formule, Number(p.fraction) || 1);
  return { jours: Array.isArray(t) && t.length === 7 ? t : defaut, propre: Array.isArray(t), formule: p.formule, fraction: p.fraction, cible: Math.round(REGLES.hebdo * (Number(p.fraction) || 1)) };
}
export function poserSemaineType(uid, annee, jours, { ecrire = false, appliquer = true, par = '', compenser = false } = {}) {
  const t = semaineType(uid);
  const propres = Array.from({ length: 7 }, (_, i) => {
    const j = jours?.[i];
    if (!j || !j.debut || !j.fin) return null;
    return { debut: j.debut, fin: j.fin, ...(j.pause_debut && j.pause_fin ? { pause_debut: j.pause_debut, pause_fin: j.pause_fin } : {}) };
  });
  const R = reglage(annee);
  const total = propres.reduce((s, j) => s + (j ? dureeJour(j) : 0), 0);
  /* UNE SEMAINE TYPE PEUT DÉPASSER OU MANQUER (3.5.334, Charles : « accepter, et PROPOSER de compenser ») : l'écart avec les heures
     dues ne bloque plus ; la fenêtre dit ce qu'il fait sur l'année (au solde) et propose de le compenser sur les semaines à venir qui
     ne reçoivent pas la semaine type. Les autres règles (8 h par jour, 11 h de repos…) restent. */
  const controles = controleSemaine(propres, { formule: t.formule === 'annualise' ? '5j' : t.formule, fraction: Number(t.fraction) || 1, rtVariable: R.rt_variable })
    .filter(c => !/doit compter exactement/.test(c));
  // Les semaines qui la recevront : à venir, de travail, hors mois approuvés, et encore égales à l'ancien modèle.
  const ancien = JSON.stringify(t.jours);
  const lundiAuj = lundiDe(aujourdhui());
  const cibles = anneeDe(uid, annee).filter(s => s.statut === 'travail' && s.lundi >= lundiAuj
    && !verrouille(uid, s.lundi) && !verrouille(uid, plusJours(s.lundi, 6)) && JSON.stringify(s.jours) === ancien);
  const sem = anneeDe(uid, annee);
  const nCibles = appliquer ? cibles.length : 0;
  const du = Math.round(REGLES.hebdo * (Number(t.fraction) || 1)) * (52 - REGLES.congesAnnuels);
  let apresAnnee = sem.reduce((x, w) => x + w.minutes, 0) + (appliquer ? cibles.reduce((x, w) => x + (total - w.minutes), 0) : 0);
  let compensees = [], restes = [];
  if (compenser && appliquer && cibles.length && apresAnnee !== du) {
    try {
      const plan = assistant(uid, annee, { cibles: Object.fromEntries(cibles.map(w => [w.lundi, total])) });
      compensees = plan.changees.filter(c => c.report).map(c => ({ lundi: c.lundi, avant: c.avant, apres: c.apres, jours: c.jours }));
      apresAnnee = plan.apres;
      restes = plan.erreurs || [];
    } catch (e) { restes = [e.message]; }
  }
  const bilan = { jours: propres, total, cible: t.cible, controles, a_appliquer: nCibles,
    gardees: sem.filter(s => s.statut === 'travail' && s.lundi >= lundiAuj).length - cibles.length,
    ecart_semaine: total - t.cible, du, apres_annee: apresAnnee, au_solde: apresAnnee - du, compensees, restes };
  if (!ecrire) return { simulation: true, ...bilan };
  if (controles.length) throw Object.assign(err('La semaine type ne tient pas : rien n’est enregistré.'), { bilan });
  const up = db.prepare("UPDATE tt_semaine SET jours_json = ?, genere_par = ?, genere_le = datetime('now') WHERE utilisateur_id = ? AND lundi = ?");
  db.transaction(() => {
    db.prepare("UPDATE tt_personne SET semaine_type = ?, maj_par = ?, maj_le = datetime('now') WHERE utilisateur_id = ?").run(JSON.stringify(propres), par, uid);
    if (appliquer) for (const s of cibles) up.run(JSON.stringify(propres), `${par} (semaine type)`, uid, s.lundi);
    for (const c of compensees) if (c.jours) up.run(JSON.stringify(c.jours), `${par} (compensation de la semaine type)`, uid, c.lundi);
  })();
  return { ecrit: true, ...bilan };
}

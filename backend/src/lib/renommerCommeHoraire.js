/* (CS) RENOMMER LES GROUPES COMME L'HORAIRE (3.5.719, Charles, 25 novembre 2026 : « d'abord, il faut renommer les groupes comme
   Marie » ; tranché : « les numéros de Marie partout »). Les UE de TIM se donnent, dans l'horaire, à des groupes NUMÉROTÉS (« 3 »,
   « 3+4 », « 1+2+5+6 ») ; la répartition et les attributions les nommaient par des lettres. Pour chaque cours et chaque activité
   qui porte des groupes :
   • les UNITÉS : autant de groupes que de numéros (1, 2, … 8), ou deux numéros par groupe (« 1+2 »…), ou les regroupements que
     l'horaire emploie (« 1+2+5+6 ») ; un cours dont le nombre de groupes ne tombe sur rien de cela n'est pas touché (il est nommé) ;
   • chaque LETTRE prend l'unité que l'horaire donne au MÊME PROFESSEUR (250.1 : Brahmi, lettres B et E → 1 et 2), puis, faute
     d'indice, dans l'ordre ;
   • les ÉTUDIANTS sont replacés d'après leur numéro (lib/groupesHoraire.js) ; celui qui n'en a pas suit sa lettre renommée.
   Simulation d'abord ; tout ou rien. « Ts » (tout le monde) ne bouge pas. */
import db from '../db/index.js';
import { numerosDeLUE } from './groupesHoraire.js';

const nums = u => String(u).split('+').map(x => String(Number(x.trim())));
const ordreUnite = (a, b) => Number(nums(a)[0]) - Number(nums(b)[0]);

/** Les unités d'un cours : n groupes à faire tenir sur les numéros 1..N. */
function unitesDuCours(n, N, ...sources) {
  if (n === N) return { unites: Array.from({ length: N }, (_, i) => String(i + 1)), deduit: false };
  // Une partition que l'horaire emploie déjà, à n parts couvrant 1..N une fois chacun : celle du cours, sinon d'un autre cours de l'UE.
  for (const sg of sources) {
    const parts = [...new Set(sg)].filter(s => /^\d+(\+\d+)*$/.test(s) && nums(s).length === N / n);
    if (parts.length === n && new Set(parts.flatMap(nums)).size === N) return { unites: parts.sort(ordreUnite), deduit: sg !== sources[0] };
  }
  if (N % n === 0) {   // aucune dans l'horaire : des numéros qui se suivent, et l'écran le dit
    const k = N / n;
    return { unites: Array.from({ length: n }, (_, i) => Array.from({ length: k }, (_, j) => i * k + j + 1).join('+')), deduit: true };
  }
  return null;
}

export function planRenommage(annee, ues) {
  const cours = [];
  const ignores = [];
  for (const ue of ues) {
    const numeros = numerosDeLUE(annee, ue);
    if (!numeros) { ignores.push({ ue, raison: 'aucun groupe de l’horaire importé pour cette UE' }); continue; }
    const N = Math.max(...[...numeros.values()].map(Number));
    const lignes = db.prepare(`SELECT code_cours, COALESCE(activite_id, 0) act, COALESCE(num_organisation, 1) org, code, professeur_id
      FROM attribution WHERE annee_scolaire = ? AND ue_num = ? AND code IS NOT NULL AND code <> '' AND UPPER(code) <> 'TS'`).all(annee, ue);
    const parCle = new Map();
    for (const l of lignes) {
      const k = `${l.code_cours}|${l.act}|${l.org}`;
      if (!parCle.has(k)) parCle.set(k, { code_cours: l.code_cours, act: l.act, org: l.org, lettres: new Map() });
      const g = parCle.get(k);
      if (!g.lettres.has(l.code)) g.lettres.set(l.code, new Set());
      if (l.professeur_id) g.lettres.get(l.code).add(l.professeur_id);
    }
    for (const g of parCle.values()) {
      const lettres = [...g.lettres.keys()].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
      if (lettres.every(l => /^\d+(\+\d+)*$/.test(l))) continue;   // déjà en numéros
      const seances = db.prepare(`SELECT sous_groupe, professeur_id FROM horaire_seance WHERE annee_scolaire = ? AND cours_code = ?
        AND sous_groupe IS NOT NULL AND annule = 0`).all(annee, g.code_cours);
      const sgUE = db.prepare(`SELECT DISTINCT REPLACE(sous_groupe, ' ', '') sg FROM horaire_seance WHERE annee_scolaire = ? AND ue_num = ?
        AND sous_groupe IS NOT NULL AND annule = 0`).all(annee, ue).map(x => x.sg);
      const choix = unitesDuCours(lettres.length, N, seances.map(s => String(s.sous_groupe).replace(/\s/g, '')), sgUE);
      const unites = choix?.unites;
      if (!unites) { ignores.push({ ue, cours: g.code_cours, raison: `${lettres.length} groupes ne se répartissent pas sur ${N} numéros` }); continue; }
      // Les professeurs que l'horaire met sur chaque unité (une séance « 3+4 » compte pour l'unité qui la contient, ou qu'elle contient).
      const profsUnite = new Map(unites.map(u => [u, new Set()]));
      for (const s of seances) {
        if (!s.professeur_id) continue;
        const t = nums(String(s.sous_groupe).replace(/\s/g, ''));
        for (const u of unites) {
          const nu = nums(u);
          if (t.every(x => nu.includes(x)) || nu.every(x => t.includes(x))) profsUnite.get(u).add(s.professeur_id);
        }
      }
      const correspondance = new Map(), prises = new Set();
      // Le professeur ne départage que si les lettres n'ont pas toutes les mêmes professeurs (250.3 : Vieira partout → dans l'ordre).
      const distincts = new Set(lettres.map(l => [...g.lettres.get(l)].sort().join(',')));
      if (distincts.size > 1) for (const l of lettres) {   // d'abord le même professeur
        const pr = g.lettres.get(l);
        const u = unites.find(x => !prises.has(x) && [...pr].some(p => profsUnite.get(x).has(p)));
        if (u) { correspondance.set(l, u); prises.add(u); }
      }
      for (const l of lettres) {           // puis dans l'ordre
        if (correspondance.has(l)) continue;
        const u = unites.find(x => !prises.has(x));
        if (u) { correspondance.set(l, u); prises.add(u); }
      }
      // Les étudiants : leur numéro décide ; sans numéro, ils suivent leur lettre.
      const places = db.prepare(`SELECT etudiant_id, groupe_code FROM etudiant_cours_groupe WHERE annee_scolaire = ? AND cours_code = ?
        AND activite_id = ? AND COALESCE(num_organisation, 1) = ?`).all(annee, g.code_cours, g.act, g.org);
      const dejaPlaces = new Set(places.map(p => p.etudiant_id));
      const etudiants = [];
      for (const p of places) {
        const n = numeros.get(p.etudiant_id);
        const u = n ? unites.find(x => nums(x).includes(n)) : correspondance.get(p.groupe_code);
        if (u) etudiants.push({ etudiant_id: p.etudiant_id, avant: p.groupe_code, apres: u });
      }
      for (const [id, n] of numeros) {
        if (dejaPlaces.has(id)) continue;
        const u = unites.find(x => nums(x).includes(n));
        if (u) etudiants.push({ etudiant_id: id, avant: null, apres: u });
      }
      cours.push({ ue, code_cours: g.code_cours, act: g.act, org: g.org, unites, deduit: choix.deduit,
        correspondance: lettres.map(l => ({ lettre: l, unite: correspondance.get(l) || null, profs: [...g.lettres.get(l)] })),
        etudiants, deplaces: etudiants.filter(e => e.avant !== e.apres && !(e.avant && correspondance.get(e.avant) === e.apres)).length,
        ajoutes: etudiants.filter(e => !e.avant).length });
    }
  }
  return { cours, ignores };
}

export function appliquerRenommage(annee, plan, par) {
  const majA = db.prepare(`UPDATE attribution SET code = ? WHERE annee_scolaire = ? AND code_cours = ? AND COALESCE(activite_id, 0) = ?
    AND COALESCE(num_organisation, 1) = ? AND code = ?`);
  const majE = db.prepare(`UPDATE etudiant_cours_groupe SET groupe_code = ?, maj_le = datetime('now'), maj_par = ?
    WHERE annee_scolaire = ? AND cours_code = ? AND activite_id = ? AND COALESCE(num_organisation, 1) = ? AND etudiant_id = ?`);
  const ajE = db.prepare(`INSERT INTO etudiant_cours_groupe (etudiant_id, annee_scolaire, cours_code, activite_id, num_organisation, groupe_code, maj_le, maj_par)
    VALUES (?,?,?,?,?,?, datetime('now'), ?)`);
  let lignes = 0, etudiants = 0;
  db.transaction(() => {
    for (const c of plan.cours) {
      c.correspondance.forEach((x, i) => { if (x.unite) lignes += majA.run(`__h${i}`, annee, c.code_cours, c.act, c.org, x.lettre).changes; });
      c.correspondance.forEach((x, i) => { if (x.unite) majA.run(x.unite, annee, c.code_cours, c.act, c.org, `__h${i}`); });
      for (const e of c.etudiants) {
        if (e.avant) etudiants += majE.run(e.apres, par, annee, c.code_cours, c.act, c.org, e.etudiant_id).changes;
        else { ajE.run(e.etudiant_id, annee, c.code_cours, c.act, c.org, e.apres, par); etudiants++; }
      }
    }
  })();
  return { lignes, etudiants };
}

// ─────────────────────────────────────────────────────────────────────────────
// LA DÉSINSCRIPTION (3.5.392, Charles, 12 novembre 2026 : « un bouton désinscrire ; il vérifie si l'étudiant peut être désinscrit et
// quels frais sont remboursés en fonction du RDE ; l'étudiant peut faire la demande depuis Lucie » ; tranché : toute l'année ou des
// unités ; le secrétariat confirme après aperçu ; l'école garde ce que prévoit le RDE et les droits de VA et d'admission).
//
// RDE 2026-2027, art. 19 : §1 — demande reçue AVANT le premier dixième de la première UE du PAE : les frais sont remboursés, sauf
// l'acompte de l'art. 16 §3 (droit d'inscription + 150 € de frais fixes) ; §2 — après, l'étudiant reste redevable de tout ;
// §3 — la preuve de la date incombe à l'étudiant (une demande faite dans Lucie est datée par le serveur). Une unité retirée en cours
// d'année : art. 16 §4, recalcul des frais administratifs variables — seulement si elle est retirée avant SON premier dixième.
//
// Rien ne s'écrit avant la confirmation : `apercu` calcule (le « après » dans une transaction défaite, comme refusSeconde.js).
// Confirmer retire les unités par la porte du PAE (`ecrireProgramme`, origine « desinscription » : elles quittent les listes, les
// présences, les délibérations ; le journal garde tout), passe la fiche « sortie » pour une désinscription de l'année, et garde
// l'écart de frais (`ajustement`) que `calculerFrais` relit : ce que l'art. 19 a arrêté reste dû.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { ecrireProgramme } from '../routes/etudiants.js';
import { calculerFrais } from '../routes/fraisScolarite.js';
import { premierDixiemeUE } from './datesReelles.js';

const arrondi = n => Math.round((Number(n) || 0) * 100) / 100;
const aujourdHui = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const eur = n => `${arrondi(n).toFixed(2).replace('.', ',')} €`;

export function migrerDesinscription(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS desinscription (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    annee_scolaire TEXT NOT NULL, portee TEXT NOT NULL, ues TEXT, demande_le TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'ecole',
    demande_par TEXT, motif TEXT, statut TEXT NOT NULL DEFAULT 'demandee', calcul TEXT, avant_dixieme INTEGER, du REAL,
    ajustement REAL, rembourse REAL, reste_du REAL, confirme_le TEXT, confirme_par TEXT, refus_motif TEXT,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')))`);
}
migrerDesinscription();

/** Les unités au programme de l'année, avec leur premier dixième. */
function programme(etudId, annee) {
  return db.prepare(`SELECT i.ue_num, i.num_organisation, (SELECT ue_nom FROM ue WHERE ue_num = i.ue_num ORDER BY (annee_scolaire = ?) DESC LIMIT 1) AS ue_nom
      FROM etudiant_inscription i WHERE i.etudiant_id = ? AND i.annee_scolaire = ? AND (i.resultat IS NULL OR i.resultat = '') ORDER BY i.ue_num`)
    .all(annee, Number(etudId), annee)
    .map(u => ({ ...u, dixieme: (() => { try { return premierDixiemeUE(u.ue_num, annee, { numOrganisation: u.num_organisation ?? null })?.date || null; } catch { return null; } })() }));
}

/** Le calcul, sans rien écrire. `ues` : null = toute l'année. */
export function apercu(etudId, annee, { ues = null, date = null } = {}) {
  const e = db.prepare('SELECT id, nom, prenom, titre, sortie_statut FROM etudiant WHERE id = ?').get(Number(etudId));
  if (!e) return { code: 404, erreur: 'Étudiant introuvable.' };
  const jour = date || aujourdHui();
  const prog = programme(etudId, annee);
  if (!prog.length) return { code: 409, erreur: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} n’a aucune unité en cours en ${annee} : rien à désinscrire.` };
  const voulues = ues && ues.length ? prog.filter(u => ues.map(Number).includes(Number(u.ue_num))) : prog;
  if (!voulues.length) return { code: 400, erreur: 'Choisissez au moins une unité de son programme.' };
  const toute = voulues.length === prog.length;
  const avant = calculerFrais(etudId, annee);
  const dixiemes = prog.map(u => u.dixieme).filter(Boolean).sort();
  const premier = dixiemes[0] || null;
  const lignes = voulues.map(u => ({ ue_num: u.ue_num, ue_nom: u.ue_nom, dixieme: u.dixieme,
    avant_dixieme: u.dixieme ? jour < u.dixieme : null }));
  let du, avantDixieme, regle, baisse = 0;
  if (toute) {
    if (!premier) return { code: 409, erreur: 'Le premier dixième de ses unités ne se calcule pas (ni horaire, ni dates d’unité) : posez les dates des unités avant de désinscrire.' };
    avantDixieme = jour < premier;
    // §1 : l'acompte de l'art. 16 §3 (droit d'inscription + frais fixes) et les droits de VA et d'admission ; §2 : tout.
    du = avantDixieme ? arrondi((avant.acompte || 0) + (avant.forfait_va?.du || 0)) : arrondi(avant.total);
    regle = avantDixieme
      ? `Demande du ${fr(jour)}, avant le premier dixième de sa première unité (${fr(premier)}) : RDE art. 19 §1 — l’école garde l’acompte (droit d’inscription et frais fixes, art. 16 §3)${avant.forfait_va?.du ? ' et les droits de valorisation et d’admission' : ''} ; le reste versé est remboursé.`
      : `Demande du ${fr(jour)}, après le premier dixième de sa première unité (${fr(premier)}) : RDE art. 19 §2 — l’étudiant reste redevable de l’intégralité des frais ; aucun remboursement.`;
  } else {
    // Art. 16 §4 : seules les unités retirées avant LEUR premier dixième font baisser les frais administratifs variables.
    const avantD = lignes.filter(l => l.avant_dixieme).map(l => l.ue_num);
    avantDixieme = avantD.length === lignes.length;
    if (avantD.length) {
      let apres = null;
      try {
        db.transaction(() => {
          ecrireProgramme({ etudId: Number(etudId), annee, retirer: avantD, origine: 'desinscription', mode: 'signaler' });
          apres = calculerFrais(etudId, annee);
          throw new Error('__defaire__');
        })();
      } catch (x) { if (x.message !== '__defaire__') throw x; }
      baisse = arrondi(Math.max(0, (avant.frais_variables || 0) - (apres?.frais_variables || 0)));
    }
    du = arrondi(avant.total - baisse);
    regle = avantD.length === lignes.length
      ? `Demande du ${fr(jour)}, avant le premier dixième de chaque unité retirée : la part variable des frais administratifs est recalculée (RDE art. 16 §4) ; le droit d’inscription et les frais fixes restent dus.`
      : avantD.length
        ? `Demande du ${fr(jour)} : les unités retirées avant leur premier dixième font baisser la part variable (art. 16 §4) ; les autres restent dues (art. 19 §2).`
        : `Demande du ${fr(jour)}, après le premier dixième des unités retirées : les frais restent dus (RDE art. 19 §2).`;
  }
  const verse = arrondi(avant.verse || 0);
  return {
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom, titre: e.titre }, annee, date: jour, portee: toute ? 'annee' : 'unites',
    unites: lignes, premier_dixieme: premier, avant_dixieme: avantDixieme, regle,
    frais: { total_avant: arrondi(avant.total), acompte: arrondi(avant.acompte), forfait_va: arrondi(avant.forfait_va?.du || 0),
      baisse, du, verse, rembourse: arrondi(Math.max(0, verse - du)), reste_du: arrondi(Math.max(0, du - verse)) },
  };
}

/** Une demande (l'étudiant en ligne, ou le secrétariat qui l'encode) : datée, rien d'autre ne change. */
export function demander(etudId, annee, { ues = null, motif = null, source = 'ecole', par = null, date = null } = {}) {
  const a = apercu(etudId, annee, { ues, date });
  if (a.erreur) return a;
  const deja = db.prepare(`SELECT id FROM desinscription WHERE etudiant_id = ? AND annee_scolaire = ? AND statut = 'demandee'`).get(Number(etudId), annee);
  if (deja) return { code: 409, erreur: 'Une demande de désinscription attend déjà la confirmation du secrétariat.' };
  const r = db.prepare(`INSERT INTO desinscription (etudiant_id, annee_scolaire, portee, ues, demande_le, source, demande_par, motif, calcul)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(Number(etudId), annee, a.portee, JSON.stringify(a.unites.map(u => u.ue_num)), a.date, source, par,
    motif ? String(motif).slice(0, 1000) : null, JSON.stringify(a));
  // Le secrétariat est prévenu (la demande en ligne surtout).
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par) VALUES ('desinscription', ?, ?, ?, 'secretariat', ?)`)
      .run(`Demande de désinscription — ${String(a.etudiant.nom || '').toUpperCase()} ${a.etudiant.prenom || ''}`,
        `${a.portee === 'annee' ? 'Toute l’année' : `UE ${a.unites.map(u => u.ue_num).join(', ')}`} · demandée le ${fr(a.date)}${source === 'en_ligne' ? ' (en ligne)' : ''}`,
        '/etudiants', par || 'Lucie');
  } catch { /* notifications absentes */ }
  return { ok: true, id: Number(r.lastInsertRowid), apercu: a };
}

/** Confirmer : le calcul se refait à la DATE DE LA DEMANDE (art. 19 §3), puis on retire, on garde l'écart, on sort. */
export function confirmer(id, par) {
  const d = db.prepare('SELECT * FROM desinscription WHERE id = ?').get(Number(id));
  if (!d) return { code: 404, erreur: 'Demande introuvable.' };
  if (d.statut !== 'demandee') return { code: 409, erreur: 'Cette demande est déjà traitée.' };
  const a = apercu(d.etudiant_id, d.annee_scolaire, { ues: d.portee === 'annee' ? null : JSON.parse(d.ues || '[]'), date: d.demande_le });
  if (a.erreur) return a;
  let conservees = [];
  db.transaction(() => {
    const b = ecrireProgramme({ etudId: d.etudiant_id, annee: d.annee_scolaire, retirer: a.unites.map(u => u.ue_num), origine: 'desinscription', par, mode: 'signaler' });
    conservees = b?.conservees || [];
    // Ce qu'arrête l'art. 19, quel que soit le recalcul que fait le retrait : on garde l'écart.
    const apres = calculerFrais(d.etudiant_id, d.annee_scolaire);
    const ajustement = arrondi(a.frais.du - apres.total);
    db.prepare(`UPDATE desinscription SET statut = 'confirmee', confirme_le = datetime('now'), confirme_par = ?, calcul = ?, avant_dixieme = ?,
      du = ?, ajustement = ?, rembourse = ?, reste_du = ? WHERE id = ?`)
      .run(par, JSON.stringify(a), a.avant_dixieme ? 1 : 0, a.frais.du, ajustement, a.frais.rembourse, a.frais.reste_du, d.id);
    if (a.portee === 'annee') {
      db.prepare(`UPDATE etudiant SET sortie_statut = 'sorti', sortie_le = ?, sortie_par = ?, sortie_motif = ? WHERE id = ?`)
        .run(d.demande_le, par, `Désinscription ${d.annee_scolaire} (demande du ${fr(d.demande_le)})`, d.etudiant_id);
    }
  })();
  return { ok: true, apercu: a, conservees };
}

export function refuser(id, par, motif) {
  if (!String(motif || '').trim()) return { code: 400, erreur: 'Un refus se motive.' };
  const d = db.prepare('SELECT statut FROM desinscription WHERE id = ?').get(Number(id));
  if (!d) return { code: 404, erreur: 'Demande introuvable.' };
  if (d.statut !== 'demandee') return { code: 409, erreur: 'Cette demande est déjà traitée.' };
  db.prepare(`UPDATE desinscription SET statut = 'refusee', confirme_le = datetime('now'), confirme_par = ?, refus_motif = ? WHERE id = ?`).run(par, String(motif).trim(), Number(id));
  return { ok: true };
}

export function desinscriptionsDe(etudId) {
  return db.prepare('SELECT id, annee_scolaire, portee, ues, demande_le, source, demande_par, motif, statut, du, rembourse, reste_du, confirme_le, confirme_par, refus_motif FROM desinscription WHERE etudiant_id = ? ORDER BY id DESC')
    .all(Number(etudId)).map(x => ({ ...x, ues: JSON.parse(x.ues || '[]') }));
}
export const libelle = { eur, fr };

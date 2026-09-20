// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Ce que les registres gardent, et sous quelle forme
//
// MESURE AVANT REMÈDE. `attribution_snapshot` pèse 2,9 Mo sur une base de
// 18 Mo — un sixième du tout — et les six autres registres réunis font 3 Ko.
// Purger les journaux de conformité n'aurait rien gagné tout en détruisant des
// preuves ; il n'y a qu'une seule chose à traiter.
//
// ON NE RENONCE À RIEN, ET C'EST LE POINT. Une première version tronquait le
// détail passé un délai : 300 Ko au lieu de 2 752, mais la restauration d'une
// ligne ancienne devenait impossible. Mesures faites sur les 3 166 lignes
// réelles :
//
//   tel quel                       2 752 Ko   rollback possible
//   deflate simple                 1 380 Ko   rollback possible
//   deflate + dictionnaire           786 Ko   rollback possible
//   troncature                       300 Ko   ROLLBACK PERDU
//
// D'où ce compromis : les champs que les écrans LISENT restent en clair dans
// `snapshot` — l'audit et le fil d'activité continuent d'interroger du JSON
// ordinaire, sans rien décompresser —, et le détail complet part COMPRIMÉ dans
// une colonne à part. Total 1 062 Ko, et l'on peut toujours restaurer.
// ─────────────────────────────────────────────────────────────────────────────
import zlib from 'zlib';
import db from '../db/index.js';
import { getParam } from '../routes/parametres.js';

export const MOIS_DEFAUT = 18;

/** Les champs que l'audit et le fil d'activité lisent — ils restent en clair. */
const CHAMPS_LISIBLES = ['section', 'ue_num', 'nom_cours', 'annee_scolaire', 'code_cours'];

/*
 * LE DICTIONNAIRE EST FIGÉ, ET IL NE DOIT JAMAIS CHANGER SOUS UNE LIGNE DÉJÀ
 * ÉCRITE. Un flux comprimé avec un dictionnaire ne se relit qu'avec LE MÊME :
 * le modifier rendrait illisible tout ce qui a été comprimé avant — on ne
 * perdrait plus seulement le rollback, mais le détail entier, sans s'en
 * apercevoir avant d'en avoir besoin.
 *
 * D'où un NUMÉRO DE VERSION écrit sur chaque ligne (`_z`). Le jour où un
 * second dictionnaire s'imposera, l'ancien restera ici pour relire l'ancien.
 *
 * Il est fait des NOMS DE CHAMPS, jamais d'un extrait de la base : ces
 * snapshots portent des identités et des rémunérations, et un échantillon de
 * données réelles figé dans le code source aurait été une fuite permanente.
 * Le gain est de 30 % contre 20 % avec un extrait réel — la différence ne vaut
 * pas cela.
 */
const DICTIONNAIRES = {
  1: Buffer.from(
    '{"id":"section":"etablissement_referent":"contrat_mdp":"organisation":'
    + '"annee_scolaire":"ue_num":"num_organisation":"quadrimestre_attribue":'
    + '"code_cours":"type_cours":"type_cours_helb":"code":"nb_groupes":'
    + '"split_groupe":"num_split":"num_groupe":"activite_id":"professeur_id":'
    + '"cours_ept_ad":"coordination_encadrement":"modification_attribution":'
    + '"commentaire":"commentaire_2":"per_etudiant_total_dp":'
    + '"periodes_attribuees":"autonomie_attribuee":"nom_cours":"valide":'
    + '"valide_par":"valide_le":"created_at":"updated_at":"_deleted":}'
    + 'null,true,false,"2024-2025","2025-2026","2026-2027",'),
};
const DICT_COURANT = 1;

export function moisDeDetail() {
  const n = parseInt(getParam('retention.snapshot_mois', String(MOIS_DEFAUT)), 10);
  // Zéro ou valeur illisible : on ne compacte rien. Mieux vaut une base qui
  // grossit qu'un registre abîmé par un réglage mal saisi.
  return Number.isFinite(n) && n >= 1 && n <= 240 ? n : 0;
}

export function migrerRetention(dbx) {
  try {
    const cols = dbx.prepare('PRAGMA table_info(attribution_snapshot)').all().map(c => c.name);
    if (!cols.includes('snapshot_zip')) {
      dbx.exec('ALTER TABLE attribution_snapshot ADD COLUMN snapshot_zip BLOB');
      console.log('[migration] attribution_snapshot.snapshot_zip ajoutée');
    }
  } catch (e) { console.error('[migration] retention :', e.message); }
}

const comprimer = (texte, v = DICT_COURANT) =>
  zlib.deflateSync(Buffer.from(texte, 'utf8'), { level: 9, dictionary: DICTIONNAIRES[v] });

/** @returns {string|null} le JSON complet, ou null si le flux est illisible. */
export function decomprimer(blob, v = DICT_COURANT) {
  if (!blob) return null;
  const d = DICTIONNAIRES[v];
  if (!d) { console.error('[retention] dictionnaire inconnu :', v); return null; }
  try {
    return zlib.inflateSync(Buffer.from(blob), { dictionary: d }).toString('utf8');
  } catch (e) { console.error('[retention] décompression :', e.message); return null; }
}

/**
 * Compacte les snapshots trop anciens : le lisible reste en clair, le détail
 * passe comprimé à côté. Rejouable — une ligne déjà compactée porte `_z`.
 *
 * ON NE COMPRIME PAS SANS AVOIR RELU. Chaque flux est décomprimé et comparé à
 * l'original AVANT que la ligne ne soit réécrite : une compression qu'on ne
 * sait pas défaire est une perte, et on ne s'en apercevrait qu'à la
 * restauration — c'est-à-dire trop tard.
 */
export function compacterSnapshots({ mois = null, simuler = false } = {}) {
  const m = mois ?? moisDeDetail();
  if (!m) return { actif: false, lignes: 0, octets: 0 };

  let candidats;
  try {
    candidats = db.prepare(`
      SELECT id, snapshot, length(snapshot) AS taille
      FROM attribution_snapshot
      WHERE created_at < datetime('now', ?)
        AND snapshot IS NOT NULL
        AND json_extract(snapshot, '$._z') IS NULL
    `).all(`-${m} months`);
  } catch (e) {
    console.error('[retention] lecture :', e.message);
    return { actif: true, lignes: 0, octets: 0, erreur: e.message };
  }

  let octets = 0, refuses = 0;
  const prets = [];
  for (const c of candidats) {
    let data;
    try { data = JSON.parse(c.snapshot); } catch { continue; }

    const clair = { _z: DICT_COURANT };
    for (const k of CHAMPS_LISIBLES) if (data[k] !== undefined) clair[k] = data[k];
    if (data._deleted) clair._deleted = true;

    const zip = comprimer(c.snapshot);
    // Le contrôle qui rend l'opération sûre : ce qu'on range doit se relire.
    if (decomprimer(zip) !== c.snapshot) { refuses++; continue; }

    const nouvelle = JSON.stringify(clair).length + zip.length;
    if (nouvelle >= c.taille) continue;       // rien à gagner : on n'y touche pas
    octets += c.taille - nouvelle;
    prets.push([JSON.stringify(clair), zip, c.id]);
  }

  if (simuler) return { actif: true, lignes: prets.length, octets, refuses, simule: true };

  const maj = db.prepare(
    'UPDATE attribution_snapshot SET snapshot = ?, snapshot_zip = ? WHERE id = ?');
  const tx = db.transaction(() => { for (const [s, z, id] of prets) maj.run(s, z, id); });
  tx();
  return { actif: true, lignes: prets.length, octets, refuses, mois: m };
}

/**
 * Le JSON complet d'une ligne, compactée ou non — la seule porte pour qui a
 * besoin du détail. Rend null quand il n'est réellement plus là.
 */
export function snapshotComplet(ligne) {
  if (!ligne) return null;
  let entete = {};
  try { entete = JSON.parse(ligne.snapshot || '{}'); } catch { /* illisible */ }
  if (!entete._z) return ligne.snapshot || null;       // jamais compactée
  return decomprimer(ligne.snapshot_zip, entete._z);   // null si le flux est perdu
}

/** Ce que le compactage ferait gagner, sans rien écrire. */
export function etatRetention() {
  const t = db.prepare(`SELECT COUNT(*) n,
    COALESCE(SUM(length(snapshot)),0) o,
    COALESCE(SUM(length(snapshot_zip)),0) z FROM attribution_snapshot`).get();
  const deja = db.prepare(
    `SELECT COUNT(*) n FROM attribution_snapshot WHERE json_extract(snapshot,'$._z') IS NOT NULL`).get();
  const sim = compacterSnapshots({ simuler: true });
  return {
    lignes: t.n, octets: t.o + t.z, compactees: deja.n,
    mois: moisDeDetail(), a_compacter: sim.lignes, gain_octets: sim.octets,
  };
}

export function planifierRetention() {
  const passe = () => {
    try {
      const r = compacterSnapshots();
      if (r.lignes || r.refuses) {
        console.log(`[retention] ${r.lignes} snapshot(s) compacté(s), `
          + `${Math.round(r.octets / 1024)} Ko regagnés`
          + (r.refuses ? ` — ${r.refuses} refusé(s) : relecture impossible` : ''));
      }
    } catch (e) { console.error('[retention] passe :', e.message); }
  };
  setTimeout(passe, 60_000).unref?.();
  setInterval(passe, 24 * 3600 * 1000).unref?.();
}

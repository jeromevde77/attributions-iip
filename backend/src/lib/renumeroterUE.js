// ─────────────────────────────────────────────────────────────────────────────
// CHANGER LE NUMÉRO D'UNE UE À PARTIR D'UNE ANNÉE (3.1.473, Charles, 30 octobre 2026 — Florian Daeleman :
// « l'UE de soins de plaies, en plus d'avoir changé de dossier pédagogique, a un nouveau numéro officiel
// FWB : ce n'est plus l'UE 244 mais l'UE 331 » ; tranché : 331 dès 2026-2027, les années passées gardent 244).
//
// Le numéro vit dans plus de cinquante tables, et DANS LES CODES : cours « 244.1 », acquis « AA244.1 »,
// clés de notes « s1|244.1|AA244.1 », fiches du laboratoire « 244#2 ». Pour l'année de départ et les
// suivantes, tout passe au nouveau numéro ; les années d'avant ne bougent pas. Les ACQUIS n'ont pas
// d'année (table `aa`) : ceux de l'ancien numéro restent pour l'historique, et leurs COPIES sous le
// nouveau numéro naissent à côté — de même l'introduction des acquis et les titres requis des cours.
//
// Trois garde-fous : (1) la simulation rend, table par table, ce qui changera, sans rien écrire ;
// (2) rien ne s'écrit si le nouveau numéro existe déjà sur la période (une fusion n'est pas un
// changement de numéro) ; (3) après écriture, on cherche la moindre trace de l'ancien numéro sur la
// période — s'il en reste (un déclencheur qui aurait ignoré une ligne), TOUT est annulé, et la
// réponse nomme où. La route fait une sauvegarde de la base avant d'écrire.
//
// `renommerUE` (lib/renommerUE.js) change le numéro sur TOUTES les années ; celui-ci, à partir d'une année.
// Ne sont pas touchés : les journaux et traces (ils disent ce qui a été fait, sous le numéro d'alors),
// les réunions (des faits datés), les déplacements d'étudiants (historique).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';

const HISTORIQUE = /journal|trace|annulation|historique|archive|sauvegarde|_remplacee$|^sqlite_|^migration_faite$/;
// Les mêmes colonnes que `renommerUE` (toutes années) : numéro d'UE sous ses trois noms, toute colonne
// « …code… », et la liste des cours ou acquis dispensés d'une valorisation (`cible_detail`).
const COLONNES_UE = ['ue_num', 'num_ue', 'ue_numero', 'prerequis_num'];
const COLONNES_CODE = /code|^cle$|^cible_detail$/i;

const colonnes = t => db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
const sansRowid = t => /WITHOUT\s+ROWID/i.test(db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(t)?.sql || '');

/** Remplace, dans une valeur de code, les jetons de l'ancien numéro : « 244.1 », « AA244.1 », « 244#2 », « 244 » seul. */
function recoder(valeur, o, n) {
  if (valeur == null) return valeur;
  const v = String(valeur);
  if (v === String(o)) return String(n);
  return v.replace(new RegExp(`(^|[^0-9A-Za-z.])(AA)?${o}([.#])(\\d+)`, 'g'), `$1$2${n}$3$4`);
}
const touche = (v, o) => v != null && recoder(v, o, o + 1) !== String(v);

/** Les tables à traiter : nom, colonne d'année, colonnes d'UE, colonnes de code. */
function inventaire() {
  const out = [];
  for (const { name } of db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all()) {
    if (HISTORIQUE.test(name)) continue;
    const c = colonnes(name);
    if (!c.includes('annee_scolaire')) continue;
    const ue = c.filter(x => COLONNES_UE.includes(x));
    const codes = c.filter(x => COLONNES_CODE.test(x));
    if (ue.length || codes.length) out.push({ table: name, ue, codes });
  }
  // Les reports d'abord : la garde des notes reportées regarde le report pour décider d'ignorer une écriture.
  return out.sort((a, b) => (a.table === 'etudiant_report_note' ? -1 : b.table === 'etudiant_report_note' ? 1 : 0));
}

/* Les tables SANS année, rattachées à une table qui en a une. */
const PAR_PARENT = [
  { table: 'grille_cours', lien: 'organisation_id', parent: 'organisation_ue', codes: ['cours_code'] },
  { table: 'etudiant_valorisation_aa', lien: 'valorisation_id', parent: 'etudiant_valorisation', codes: ['aa_code'] },
  { table: 'carnet_evaluation_aa', lien: 'evaluation_id', parent: 'carnet_evaluation', codes: ['aa_code'] },
  { table: 'proc_acquis', lien: 'dossier_id', parent: 'proc_dossier', codes: ['cours_code', 'aa_code'] },
  { table: 'amenagement_ue', lien: 'dossier_id', parent: 'amenagement_dossier', ue: ['ue_num'] },
  { table: 'amenagement_mesure', lien: 'dossier_id', parent: 'amenagement_dossier', ue: ['ue_num'] },
];

export function renumeroterUE({ ancien, nouveau, annee, simulation = true }) {
  const o = Number(ancien), n = Number(nouveau);
  if (!o || !n || o === n) return { erreur: 'Deux numéros différents sont requis.' };
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) return { erreur: 'Année de départ requise (AAAA-AAAA).' };
  const ueA = db.prepare('SELECT COUNT(*) k FROM ue WHERE ue_num = ? AND annee_scolaire >= ?').get(o, annee).k;
  if (!ueA) return { erreur: `L'UE ${o} n'existe pas en ${annee} ni après.` };

  // Le nouveau numéro ne doit exister nulle part sur la période — ni ses cours, ni ses acquis.
  const conflits = [];
  for (const t of inventaire()) {
    for (const c of t.ue) {
      const k = db.prepare(`SELECT COUNT(*) k FROM "${t.table}" WHERE "${c}" = ? AND annee_scolaire >= ?`).get(n, annee).k;
      if (k) conflits.push(`${t.table} : ${k} ligne(s) déjà sous ${n}`);
    }
  }
  const aaNouveaux = db.prepare(`SELECT COUNT(*) k FROM aa WHERE ue_num = ? OR aa_code LIKE ?`).get(n, `AA${n}.%`).k;
  if (aaNouveaux) conflits.push(`aa : ${aaNouveaux} acquis existent déjà sous ${n}`);
  if (conflits.length) return { erreur: `Le numéro ${n} est déjà employé : ce serait une fusion, pas un changement de numéro.`, conflits };

  const rapport = [];
  const plan = [];   // [{ table, rowid, col, avant, apres }]
  for (const t of inventaire()) {
    if (sansRowid(t.table)) { rapport.push({ table: t.table, lignes: 0, note: 'non traitée (sans rowid)' }); continue; }
    const conds = [...t.ue.map(c => `"${c}" = ${o}`), ...t.codes.map(c => `"${c}" LIKE '%${o}%'`)];
    const lignes = db.prepare(`SELECT rowid AS _r, ${[...t.ue, ...t.codes].map(c => `"${c}"`).join(', ')}
      FROM "${t.table}" WHERE annee_scolaire >= ? AND (${conds.join(' OR ')})`).all(annee);
    let k = 0;
    for (const l of lignes) {
      const changes = {};
      for (const c of t.ue) if (Number(l[c]) === o) changes[c] = n;
      for (const c of t.codes) if (touche(l[c], o)) changes[c] = recoder(l[c], o, n);
      if (Object.keys(changes).length) { plan.push({ table: t.table, rowid: l._r, changes }); k++; }
    }
    if (k) rapport.push({ table: t.table, lignes: k });
  }
  for (const p of PAR_PARENT) {
    const c = new Set(colonnes(p.table));
    if (!c.size || !colonnes(p.parent).includes('annee_scolaire')) continue;
    const cols = [...(p.ue || []), ...(p.codes || [])].filter(x => c.has(x));
    if (!cols.length) continue;
    const lignes = db.prepare(`SELECT t.rowid AS _r, ${cols.map(x => `t."${x}"`).join(', ')} FROM "${p.table}" t
      JOIN "${p.parent}" pa ON pa.id = t."${p.lien}" WHERE pa.annee_scolaire >= ?`).all(annee);
    let k = 0;
    for (const l of lignes) {
      const changes = {};
      for (const x of p.ue || []) if (Number(l[x]) === o) changes[x] = n;
      for (const x of p.codes || []) if (touche(l[x], o)) changes[x] = recoder(l[x], o, n);
      if (Object.keys(changes).length) { plan.push({ table: p.table, rowid: l._r, changes }); k++; }
    }
    if (k) rapport.push({ table: p.table, lignes: k, note: `par ${p.parent}` });
  }

  // Les copies sous le nouveau numéro (tables sans année : l'ancien reste pour l'historique).
  const aa = db.prepare('SELECT * FROM aa WHERE ue_num = ?').all(o);
  const intro = colonnes('ue_acquis_intro').length ? db.prepare('SELECT * FROM ue_acquis_intro WHERE ue_num = ?').get(o) : null;
  const coursCodes = db.prepare('SELECT DISTINCT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire >= ?').all(o, annee).map(x => x.cours_code);
  const titres = colonnes('cours_titre').length && coursCodes.length
    ? db.prepare(`SELECT * FROM cours_titre WHERE cours_code IN (${coursCodes.map(() => '?').join(',')})`).all(...coursCodes) : [];
  const codesExternes = colonnes('ue_code_externe').length ? db.prepare('SELECT * FROM ue_code_externe WHERE ue_num = ?').all(o) : [];
  rapport.push({ table: 'aa', lignes: aa.length, note: `acquis copiés en AA${n}.x (les AA${o}.x restent pour les années d'avant)` });
  if (intro) rapport.push({ table: 'ue_acquis_intro', lignes: 1, note: 'copiée' });
  if (titres.length) rapport.push({ table: 'cours_titre', lignes: titres.length, note: 'titres requis copiés pour les nouveaux codes de cours' });
  if (codesExternes.length) rapport.push({ table: 'ue_code_externe', lignes: codesExternes.length, note: `codes d'import repointés vers ${n}` });

  const resume = { ancien: o, nouveau: n, annee, simulation: !!simulation, tables: rapport,
    total: plan.length, exemples: plan.slice(0, 8).map(p => ({ table: p.table, ...p.changes })) };
  if (simulation) return resume;

  const restes = [];
  try {
    db.transaction(() => {
      const cles = Object.keys(aa[0] || {}).filter(k => k !== 'id');
      const ins = cles.length && db.prepare(`INSERT INTO aa (${cles.map(k => `"${k}"`).join(', ')}) VALUES (${cles.map(() => '?').join(', ')})`);
      for (const a of aa) ins.run(...cles.map(k => (k === 'aa_code' || k === 'cours_code' ? recoder(a[k], o, n) : k === 'ue_num' ? n : a[k])));
      if (intro) db.prepare('INSERT INTO ue_acquis_intro (ue_num, texte, maj_le, maj_par) VALUES (?,?,?,?)').run(n, intro.texte, intro.maj_le, intro.maj_par);
      for (const t of titres) {
        db.prepare('INSERT OR IGNORE INTO cours_titre (cours_code, titre_id, portee, notes) VALUES (?,?,?,?)')
          .run(recoder(t.cours_code, o, n), t.titre_id, t.portee, t.notes);
      }
      for (const x of codesExternes) db.prepare('UPDATE ue_code_externe SET ue_num = ? WHERE id = ?').run(n, x.id);
      for (const p of plan) {
        const cols = Object.keys(p.changes);
        db.prepare(`UPDATE "${p.table}" SET ${cols.map(c => `"${c}" = ?`).join(', ')} WHERE rowid = ?`)
          .run(...cols.map(c => p.changes[c]), p.rowid);
      }
      // LE CONTRÔLE : plus aucune trace de l'ancien numéro sur la période.
      for (const t of inventaire()) {
        for (const c of t.ue) {
          const k = db.prepare(`SELECT COUNT(*) k FROM "${t.table}" WHERE "${c}" = ? AND annee_scolaire >= ?`).get(o, annee).k;
          if (k) restes.push(`${t.table}.${c} : ${k}`);
        }
        for (const c of t.codes) {
          const k = db.prepare(`SELECT "${c}" v FROM "${t.table}" WHERE annee_scolaire >= ? AND "${c}" LIKE '%${o}%'`).all(annee)
            .filter(r => touche(r.v, o)).length;
          if (k) restes.push(`${t.table}.${c} : ${k}`);
        }
      }
      if (restes.length) throw new Error('RESTES');
    })();
  } catch (e) {
    if (e.message === 'RESTES') {
      return { ...resume, erreur: `Des lignes n'ont pas pu changer de numéro : rien n'a été écrit.`, restes };
    }
    return { ...resume, erreur: `Rien n'a été écrit : ${e.message}` };
  }
  return { ...resume, ok: true };
}

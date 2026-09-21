// ─────────────────────────────────────────────────────────────────────────────
// Lucie — CHANGER LE NUMÉRO D'UNE UE, PARTOUT
//
// Demandé par Charles le 21 septembre 2026 : « quand je change le numéro d'une
// UE, en forçant, il faut qu'il change le numéro des cours. Si UE900 devient
// UE334, les cours de la 900 deviennent 334.1, .2, .3… et partout. » Et,
// tranché le même jour : sur TOUTES les années — « l'UE fait partie de la
// bibliothèque » —, données d'étudiants comprises.
//
// Le forçage ne changeait que ue_num dans quatre tables (ue, cours,
// attribution, ue_section) et pour une seule année : les cours gardaient
// « 900.1 » sous l'UE 334, les acquis « AA900.1 », et les notes, les
// délibérations, l'horaire, les pondérations et les valorisations restaient
// accrochés à 900.
//
// ── « PARTOUT », ÇA NE S'ÉNUMÈRE PAS ────────────────────────────────────────
//
// Plus de trente tables citent un numéro d'UE, un code de cours ou un code
// d'acquis. Une liste écrite à la main serait incomplète dès la table
// suivante — c'est la leçon des trente-trois routes d'attribution dont une
// seule filtrait. On INSPECTE donc la base : toute colonne qui porte l'un de
// ces noms est traitée, y compris dans une table créée demain.
//
// Et les codes cachés dans du TEXTE : la liste des cours ou acquis dispensés
// d'une valorisation (`cible_detail`, « 900.1,900.3 »).
// ─────────────────────────────────────────────────────────────────────────────

const COL_UE = /^(ue_num|num_ue|ue_numero)$/i;
/* TOUTE COLONNE DONT LE NOM CONTIENT « code » — et ce point a été trouvé en
 * éprouvant : la table des notes range le code du cours OU de l'acquis dans
 * une colonne nommée `code` tout court (avec `type` = cours | aa). Une liste
 * de noms précis l'aurait manquée, et les notes seraient restées accrochées à
 * « 900.1 ». On ne remplace qu'une valeur EXACTEMENT égale à un ancien code de
 * cours (« 900.1 ») ou d'acquis (« AA900.1 ») : un code de section, de groupe
 * ou de pièce ne peut pas y ressembler. */
const COL_CODE = /code/i;
const COL_LISTE = /^(cible_detail)$/i;       // codes séparés par des virgules

const echapper = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Les tables et colonnes concernées, lues dans la base. */
function colonnesConcernees(db) {
  const out = [];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) {
    for (const c of db.prepare(`PRAGMA table_info("${name}")`).all()) {
      const nature = COL_UE.test(c.name) ? 'ue' : COL_LISTE.test(c.name) ? 'liste'
        : COL_CODE.test(c.name) ? 'code' : null;
      if (nature) out.push({ table: name, colonne: c.name, nature });
    }
  }
  return out;
}

/**
 * Renommer l'UE `ancien` en `nouveau` dans toute la base.
 * À appeler DANS une transaction : la simulation la défait.
 * @returns {{ lignes: { table, colonne, n }[], cours: [string,string][], aa: [string,string][], hors_modele: string[] }}
 */
export function renommerUE(db, ancien, nouveau) {
  const a = String(ancien).trim(), n = String(nouveau).trim();
  const reCours = new RegExp(`^${echapper(a)}\\.(.+)$`);
  const reAA = new RegExp(`^AA${echapper(a)}\\.(.+)$`, 'i');
  const cols = colonnesConcernees(db);

  // Les codes de cours de l'UE, toutes années : « 900.x » → « 334.x ».
  const coursCodes = new Set();
  for (const r of db.prepare('SELECT DISTINCT cours_code FROM cours WHERE CAST(ue_num AS TEXT) = ?').all(a)) {
    if (r.cours_code) coursCodes.add(String(r.cours_code));
  }
  const mapCours = new Map();
  const horsModele = [];
  for (const c of coursCodes) {
    const m = reCours.exec(c);
    if (m) mapCours.set(c, `${n}.${m[1]}`);
    else horsModele.push(c);     // un code libre : l'UE change, lui non — on le dit
  }
  // Les codes d'acquis : « AA900.x » → « AA334.x ».
  const mapAA = new Map();
  for (const r of db.prepare('SELECT DISTINCT aa_code FROM aa WHERE CAST(ue_num AS TEXT) = ?').all(a)) {
    const m = reAA.exec(String(r.aa_code || ''));
    if (m) mapAA.set(r.aa_code, `AA${n}.${m[1]}`);
  }

  // ── LES COLLISIONS : on ne fusionne pas deux UE par accident ───────────────
  const conflits = [];
  if (db.prepare('SELECT 1 FROM ue WHERE CAST(ue_num AS TEXT) = ? LIMIT 1').get(n)) {
    conflits.push(`l'UE ${n} existe déjà dans le référentiel`);
  }
  for (const nv of mapCours.values()) {
    if (db.prepare('SELECT 1 FROM cours WHERE cours_code = ? LIMIT 1').get(nv)) conflits.push(`le cours ${nv} existe déjà`);
  }
  for (const nv of mapAA.values()) {
    if (db.prepare('SELECT 1 FROM aa WHERE aa_code = ? LIMIT 1').get(nv)) conflits.push(`l'acquis ${nv} existe déjà`);
  }
  if (conflits.length) {
    const e = new Error(`Impossible de renuméroter ${a} en ${n} : ${conflits.slice(0, 5).join(' ; ')}`
      + (conflits.length > 5 ? ` (et ${conflits.length - 5} autre(s))` : '') + '. Rien n’a été modifié.');
    e.status = 409;
    throw e;
  }

  // Les clés changent parent ET enfants dans la même transaction : l'ordre
  // des UPDATE ne doit pas faire échouer une contrainte au passage.
  db.pragma('defer_foreign_keys = ON');

  const lignes = [];
  const compter = (table, colonne, nb) => { if (nb) lignes.push({ table, colonne, n: nb }); };
  for (const { table, colonne, nature } of cols) {
    const t = `"${table}"`, c = `"${colonne}"`;
    if (nature === 'ue') {
      // Le numéro est tantôt INTEGER, tantôt TEXT selon les tables : on
      // compare le texte, et l'on écrit un nombre là où la colonne en porte un.
      const nb = db.prepare(`UPDATE ${t} SET ${c} = CASE WHEN typeof(${c}) = 'integer'
          THEN CAST(? AS INTEGER) ELSE ? END WHERE CAST(${c} AS TEXT) = ?`).run(n, n, a).changes;
      compter(table, colonne, nb);
    } else if (nature === 'code') {
      let nb = 0;
      const st = db.prepare(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`);
      for (const [av, ap] of [...mapCours, ...mapAA]) nb += st.run(ap, av).changes;
      compter(table, colonne, nb);
    } else if (nature === 'liste') {
      let nb = 0;
      const lire = db.prepare(`SELECT rowid AS rid, ${c} AS v FROM ${t} WHERE ${c} LIKE ?`)
        .all(`%${a}.%`);
      const ecrire = db.prepare(`UPDATE ${t} SET ${c} = ? WHERE rowid = ?`);
      for (const { rid, v } of lire) {
        const nouvelle = String(v).split(',').map(x => {
          const k = x.trim();
          return mapCours.get(k) || mapAA.get(k) || k;
        }).join(',');
        if (nouvelle !== v) { ecrire.run(nouvelle, rid); nb++; }
      }
      compter(table, colonne, nb);
    }
  }
  return {
    lignes: lignes.sort((x, y) => y.n - x.n),
    cours: [...mapCours], aa: [...mapAA], hors_modele: horsModele,
  };
}

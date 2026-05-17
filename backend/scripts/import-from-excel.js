/**
 * Importe les données depuis :
 *   - BD_UE_COURS.xlsx (UE, Cours, AA)
 *   - Attributions.xlsm (Coordonnées_professeurs, Attributions, UE_inscriptions, Locaux, Clé eCampus)
 *
 * Usage :  npm run import-excel
 *          (place les Excel dans backend/data/ d'abord)
 *
 * Gestion des données sales : conversions tolérantes (toInt, toStr),
 * skip silencieux des lignes invalides (ex: ue_num='?').
 */
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH   = process.env.DB_PATH || join(__dirname, '..', 'data', 'attributions.db');
const BD_PATH   = process.argv[2] || join(__dirname, '..', 'data', 'BD_UE_COURS.xlsx');
const ATTR_PATH = process.argv[3] || join(__dirname, '..', 'data', 'Attributions.xlsm');

console.log('[import] DB        :', DB_PATH);
console.log('[import] BD_UE     :', BD_PATH);
console.log('[import] Attribs   :', ATTR_PATH);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ---------- coercition tolérante (gère cellules avec formules non résolues, ?, -, etc.) ----------
function rawVal(cell) {
  if (cell == null) return null;
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map(r => r.text).join('');
    if (v instanceof Date) return v.toISOString();
  }
  return v;
}
function toInt(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || s === '?' || s === '-') return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}
function toStr(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ') || null;
  return String(v);
}
function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ----------------------------------------------------------------------------
// BD_UE_COURS
// ----------------------------------------------------------------------------
async function importBdUeCours() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(BD_PATH);

  // UE
  const wsUe = wb.getWorksheet('UE');
  const stmtUe = db.prepare(`
    INSERT OR REPLACE INTO ue
      (ue_num, ue_nom, ue_code_fwb, section, ue_tc, ue_det, ue_niv,
       ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau,
       ue_quad, et_ref, ects, ue_prerequise)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let nUe = 0, skipUe = 0;
  wsUe.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const g = (c) => rawVal(row.getCell(c));
    const ueNum = toInt(g(1));
    if (ueNum == null) { skipUe++; return; }
    stmtUe.run(
      ueNum,
      toStr(g(2)), toStr(g(3)), toStr(g(4)), toStr(g(5)), toStr(g(6)), toStr(g(7)),
      toInt(g(8)), toInt(g(9)), toInt(g(10)), toInt(g(11)),
      toStr(g(12)), toStr(g(13)), toStr(g(14)),
      toInt(g(15)), toStr(g(16))
    );
    nUe++;
  });
  console.log(`[import] UE: ${nUe} (skip: ${skipUe})`);

  // Cours
  const wsC = wb.getWorksheet('Cours');
  const stmtC = db.prepare(`
    INSERT OR REPLACE INTO cours
      (cours_code, cours_num, cours_nom, ct_pp, section, ue_num,
       quadrimestre_cours, cours_per, cours_total, ue_autonomie,
       ue_per_total, ue_niveau, enc_cours, heures)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  let nC = 0, skipC = 0;
  wsC.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const g = (c) => rawVal(row.getCell(c));
    const code = toStr(g(1));
    if (!code) { skipC++; return; }
    try {
      stmtC.run(
        code, toInt(g(2)), toStr(g(3)), toStr(g(4)), toStr(g(5)),
        toInt(g(6)), toStr(g(8)), toInt(g(9)), toInt(g(10)),
        toInt(g(11)), toInt(g(12)), toStr(g(13)), toStr(g(14)), toInt(g(25))
      );
      nC++;
    } catch { skipC++; }
  });
  console.log(`[import] Cours: ${nC} (skip: ${skipC})`);

  // AA
  const wsA = wb.getWorksheet('AA');
  const stmtA = db.prepare(`
    INSERT OR REPLACE INTO aa (aa_code, aa_num, ue_num, cours_code, description)
    VALUES (?,?,?,?,?)
  `);
  let nA = 0, skipA = 0;
  wsA.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const g = (c) => rawVal(row.getCell(c));
    const code = toStr(g(3));
    if (!code) { skipA++; return; }
    try {
      stmtA.run(code, toInt(g(1)), toInt(g(2)), toStr(g(4)), toStr(g(5)));
      nA++;
    } catch { skipA++; }
  });
  console.log(`[import] AA: ${nA} (skip: ${skipA})`);
}

// ----------------------------------------------------------------------------
// Attributions.xlsm
// ----------------------------------------------------------------------------
async function importAttributions() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ATTR_PATH);

  // Sections (déduites de la colonne A de Attributions)
  const wsAttr = wb.getWorksheet('Attributions');
  const sections = new Set();
  wsAttr.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= 2) return;
    const s = toStr(rawVal(row.getCell(1)));
    if (s) sections.add(s);
  });
  const stmtS = db.prepare('INSERT OR IGNORE INTO section (code, libelle) VALUES (?,?)');
  for (const s of sections) stmtS.run(s, s);
  console.log(`[import] Sections: ${sections.size}`);

  // Locaux
  const wsL = wb.getWorksheet('Locaux');
  const stmtL = db.prepare(`
    INSERT OR REPLACE INTO local (nom, type, places, micro, equipement, son, it, projection)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  let nL = 0;
  wsL.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const g = (c) => rawVal(row.getCell(c));
    const nom = toStr(g(1));
    if (!nom) return;
    stmtL.run(nom, toStr(g(2)), toInt(g(3)), toStr(g(4)), toStr(g(5)), toStr(g(6)), toStr(g(7)), toStr(g(8)));
    nL++;
  });
  console.log(`[import] Locaux: ${nL}`);

  // Professeurs
  const wsP = wb.getWorksheet('Coordonnées_professeurs');
  const stmtP = db.prepare(`
    INSERT OR IGNORE INTO professeur
      (nom, prenom, mail_prive, statut,
       adresse_rue, code_postal, commune, contrat_cc, anciennete_25_26_po)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  let nP = 0;
  wsP.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const g = (c) => rawVal(row.getCell(c));
    const nom = toStr(g(1));
    const prenom = toStr(g(2));
    if (!nom || !prenom) return;
    stmtP.run(
      nom, prenom,
      toStr(g(5)), toStr(g(7)), toStr(g(9)),
      toStr(g(10)), toStr(g(11)), toStr(g(13)),
      toInt(g(16)) ?? 0
    );
    nP++;
  });
  console.log(`[import] Professeurs: ${nP}`);

  // Mettre à jour les adresses mail (formule VLOOKUP qu'on reconstruit)
  db.prepare(`
    UPDATE professeur
    SET adresse_mail = LOWER(prenom) || '.' || LOWER(nom) || '@institut-prigogine.be'
    WHERE adresse_mail IS NULL
  `).run();

  // Cache (nom, prenom) → id
  const profCache = new Map();
  for (const r of db.prepare('SELECT id, nom, prenom FROM professeur').all()) {
    profCache.set(`${r.nom}||${r.prenom}`, r.id);
  }

  const ueExists = db.prepare('SELECT 1 FROM ue WHERE ue_num = ?').pluck();

  // Attributions
  const stmtAttr = db.prepare(`
    INSERT INTO attribution
      (section, etablissement_referent, contrat_mdp, organisation,
       ue_num, num_organisation, quadrimestre_attribue,
       code_cours, type_cours, type_cours_helb, code, nb_groupes,
       split_groupe, num_split, num_groupe,
       professeur_id, cours_ept_ad, coordination_encadrement,
       modification_attribution, commentaire, commentaire_2,
       charge_perdue_84plus, periodes_transferees,
       per_etudiant_total_dp, periodes_attribuees, autonomie_attribuee,
       annee_scolaire)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const stmtPlanning = db.prepare(`
    INSERT INTO planning_hebdo (attribution_id, semaine, heures) VALUES (?,?,?)
  `);
  let nA = 0, skipA = 0;
  wsAttr.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= 2) return;
    const g = (c) => rawVal(row.getCell(c));

    const section = toStr(g(1));
    const ueNum = toInt(g(5));
    if (!section || !ueNum || !ueExists.get(ueNum)) { skipA++; return; }

    // Prof : "NOM Prénom" → split (mots en MAJ = nom)
    const profText = toStr(g(34));
    let profId = null;
    if (profText) {
      const parts = profText.split(/\s+/);
      const nomToks = parts.filter(p => p === p.toUpperCase() && p.length > 1);
      const prenomToks = parts.filter(p => !(p === p.toUpperCase() && p.length > 1));
      const nom = (nomToks.join(' ') || parts[0] || '').trim();
      const prenom = (prenomToks.join(' ') || parts.slice(1).join(' ') || '').trim();
      profId = profCache.get(`${nom}||${prenom}`) ?? null;
    }

    // code_cours peut être '219.1' (string) ou 219.1 (number)
    const codeRaw = g(20);
    const codeCours = codeRaw == null ? null : String(codeRaw).trim();

    try {
      const result = stmtAttr.run(
        section,
        toStr(g(2)), toStr(g(3)), toStr(g(4)),
        ueNum, toInt(g(6)) ?? 1, toStr(g(12)),
        codeCours, toStr(g(24)), toStr(g(25)), toStr(g(26)),
        toInt(g(27)) ?? 1, toStr(g(28)) ?? 'N', toInt(g(29)), toInt(g(30)),
        profId, toStr(g(32)), toStr(g(17)),
        toStr(g(33)), toStr(g(22)), toStr(g(23)),
        toNum(g(35)), toNum(g(36)),
        toInt(g(18)),
        toNum(g(38)) ?? 0, toNum(g(39)) ?? 0,
        '2025-2026'
      );
      nA++;

      // Planning hebdomadaire (col 66 = S0, col 108 = S42)
      const attrId = result.lastInsertRowid;
      for (let s = 0; s <= 42; s++) {
        const h = toNum(g(66 + s));
        if (h != null && h > 0) {
          try { stmtPlanning.run(attrId, s, h); } catch {}
        }
      }
    } catch {
      skipA++;
    }
  });
  console.log(`[import] Attributions: ${nA} (skip: ${skipA})`);

  // UE_inscriptions
  const wsI = wb.getWorksheet('UE_inscriptions');
  const stmtI = db.prepare(`
    INSERT INTO ue_inscription
      (ue_num, num_organisation, payroll, organisation,
       nb_etudiants_iip, nb_etudiants_helb, encadrement, annee_scolaire)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  let nI = 0;
  wsI.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const g = (c) => rawVal(row.getCell(c));
    const ueNum = toInt(g(4));
    if (!ueNum || !ueExists.get(ueNum)) return;
    try {
      stmtI.run(
        ueNum, toInt(g(5)) ?? 1, toStr(g(2)), toStr(g(3)),
        toInt(g(19)) ?? 0, toInt(g(21)) ?? 0, toStr(g(15)),
        '2025-2026'
      );
      nI++;
    } catch {}
  });
  console.log(`[import] UE_inscriptions: ${nI}`);

  // Clés eCampus (24-25 sur cols 11-14)
  const wsCle = wb.getWorksheet('Clé eCampus');
  const stmtCle = db.prepare(`
    INSERT INTO cle_ecampus (annee, code_section, libelle, profil, cle) VALUES (?,?,?,?,?)
  `);
  let nCle = 0;
  wsCle.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= 2) return;
    const g = (c) => rawVal(row.getCell(c));
    if (g(11)) { stmtCle.run('24-25', toStr(g(11)), toStr(g(12)), toStr(g(13)), toStr(g(14))); nCle++; }
  });
  console.log(`[import] Clés eCampus: ${nCle}`);
}

// ============================================================================
// MAIN
// ============================================================================
(async () => {
  try {
    db.exec('BEGIN');
    await importBdUeCours();
    await importAttributions();
    db.exec('COMMIT');
    console.log('\n✅ Import terminé avec succès.');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('❌ Erreur durant l\'import :', err);
    process.exit(1);
  } finally {
    db.close();
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// Lucie — La rétribution des experts (A.E. du 26 janvier 1993)
//
// (Charles, 6 octobre 2026 : « attention taux expert et index ».) L'article 8
// fixe un montant par période selon le NIVEAU et le TYPE de cours — 28,44 € au
// supérieur pour les cours généraux et techniques, mais 18,25 € pour la
// pratique professionnelle. Lucie n'en connaissait qu'un par niveau : un
// contrat de PP annonçait 28,44 €. Ce sont des montants de BASE, liés à
// l'indice des prix du 1er juillet 1991 (art. 10) : le montant réel est la base
// × le coefficient d'indexation, réglé dans Configuration → Coût des périodes.
// L'article 2 plafonne les prestations d'un expert à 260 périodes par année
// scolaire (100 de plus sur dérogation).
// Une seule source : le contrat, le coût et le contrôle lisent ces paramètres.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { getParam, getParamNum } from '../routes/parametres.js';

const P = (cle, valeur, label) => [cle, valeur, label, null, 'couts'];
export function semerTauxExperts(dbx = db) {
  const ins = dbx.prepare(`INSERT OR IGNORE INTO parametre (cle, valeur, label, section, groupe) VALUES (?,?,?,?,?)`);
  // Un taux réglé jadis dans lucie_config (taux_expert_superieur…) devient la base des cours généraux.
  const ancien = n => { try { return dbx.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(`taux_expert_${n}`)?.valeur || null; } catch { return null; } };
  for (const p of [
    P('cout.exp.reference', 'A.E. du 26/01/1993, art. 8 (montants de base au 01/07/1991)', 'Experts — texte de référence des taux'),
    P('cout.exp.indice', '', "Experts — coefficient d'indexation depuis le 01/07/1991 (montant réel = base × coefficient)"),
    P('cout.exp.sup_gen', ancien('superieur') || '28.44', 'Experts, supérieur — cours généraux, techniques, psychopédagogie (€ de base / période)'),
    P('cout.exp.sup_spec', '22.18', 'Experts, supérieur — cours spéciaux (€ de base / période)'),
    P('cout.exp.sup_pp', '18.25', 'Experts, supérieur — pratique professionnelle, cours techniques et de PP (€ de base / période)'),
    P('cout.exp.ds_gen', ancien('secondaire') || '24.69', 'Experts, secondaire supérieur — cours généraux, techniques, psychopédagogie (€ de base / période)'),
    P('cout.exp.ds_spec', '22.18', 'Experts, secondaire supérieur — cours spéciaux (€ de base / période)'),
    P('cout.exp.ds_pp', '18.25', 'Experts, secondaire supérieur — pratique professionnelle, cours techniques et de PP (€ de base / période)'),
    P('cout.exp.di_gen', '19.69', 'Experts, secondaire inférieur — cours généraux, techniques, spéciaux (€ de base / période)'),
    P('cout.exp.di_pp', '17.00', 'Experts, secondaire inférieur — pratique professionnelle (€ de base / période)'),
    P('cout.exp.plafond', '260', 'Experts — plafond de périodes par année scolaire (art. 2)'),
    P('cout.exp.plafond_derogation', '360', 'Experts — plafond avec dérogation ministérielle'),
  ]) ins.run(...p);
}

const NIV = { superieur: 'sup', SUP: 'sup', secondaire: 'ds', DS: 'ds', inferieur: 'di', DI: 'di' };
/** Le type de cours au sens de l'arrêté : PP (pratique professionnelle), CS (spéciaux), sinon généraux / techniques. */
export const typeExpert = cla => { const c = String(cla || '').toUpperCase(); return c === 'PP' ? 'pp' : c === 'CS' ? 'spec' : 'gen'; };
export function tauxExpertBase(niveau, cla) {
  const n = NIV[niveau] || 'sup';
  const t = typeExpert(cla);
  const defauts = { sup: { gen: 28.44, spec: 22.18, pp: 18.25 }, ds: { gen: 24.69, spec: 22.18, pp: 18.25 }, di: { gen: 19.69, spec: 19.69, pp: 17.0 } };
  const cle = n === 'di' && t === 'spec' ? 'cout.exp.di_gen' : `cout.exp.${n}_${t}`;
  return getParamNum(cle, defauts[n][t]);
}
/** Le coefficient d'indexation, ou null s'il n'est pas réglé. */
export function indiceExpert() {
  const v = Number(String(getParam('cout.exp.indice', '') || '').replace(',', '.'));
  return v > 0 ? v : null;
}
export const plafondsExpert = () => ({ plafond: getParamNum('cout.exp.plafond', 260), derogation: getParamNum('cout.exp.plafond_derogation', 360) });
export const LIB_TYPE_EXPERT = { gen: 'cours généraux ou techniques', spec: 'cours spéciaux', pp: 'pratique professionnelle' };

/*
 * LE PLACEMENT D'UNE UE : BLOC ET QUADRIMESTRE PRÉVU, PAR SECTION ET PAR ANNÉE
 * (Charles, 10 octobre 2026 : « une UE n'appartient pas à un bloc, sauf sur une
 * année ; un module peut être en B1 dans une section et en B2 dans une autre —
 * c'est le souci de la 95. C'est la SECTION et le schéma de capitalisation annuel
 * qui déterminent le bloc ET le Q prévu ; prévu : on peut choisir les dates »).
 *
 * Une seule lecture pour le laboratoire, la simulation et l'organisation de base :
 *   · le bloc = `niveauxEffectifs` (schéma de capitalisation, sinon référentiel) ;
 *   · le quadrimestre = `ue_niveau_section.quadri` s'il est posé, sinon celui de
 *     la ligne du référentiel DE CETTE SECTION, sinon le premier trouvé.
 * Le quadrimestre n'est qu'un prévu : les dates de l'organisation l'emportent.
 */
import db from '../db/index.js';
import { niveauxEffectifs } from '../routes/capitalisation.js';

export function placementsSection(section, annee) {
  const niveaux = niveauxEffectifs([section], annee);
  const out = {};
  const refs = db.prepare(`SELECT ue_num, section, TRIM(COALESCE(ue_quad, '')) quad FROM ue WHERE annee_scolaire = ?
      AND (section = ? OR ue_num IN (SELECT ue_num FROM ue_section WHERE annee_scolaire = ? AND section_code = ?))`).all(annee, section, annee, section);
  for (const r of refs) {
    const o = out[r.ue_num] || (out[r.ue_num] = { ue_num: r.ue_num, bloc: niveaux[r.ue_num] || '', quad: '' });
    if (r.section === section || !o.quad) o.quad = r.quad || o.quad;
  }
  let surcharges = [];
  try { surcharges = db.prepare(`SELECT ue_num, quadri FROM ue_niveau_section WHERE section = ? AND annee_scolaire = ? AND COALESCE(quadri, '') <> ''`).all(section, annee); } catch { /* colonne pas encore là */ }
  for (const s of surcharges) if (out[s.ue_num]) { out[s.ue_num].quad = s.quadri; out[s.ue_num].quad_schema = true; }
  return out;
}

/* LA CLASSE D'UNE ORGANISATION. Une organisation peut vivre dans une autre classe que
   celle de son UE (UE 77 : org 1 en BA1, org 2 en BA2, Charles, 10 octobre 2026).
   `organisation_ue.bloc` vide : la classe de l'UE. */
function blocsOrganisations(section, annee) {
  try {
    return db.prepare(`SELECT ue_num, COALESCE(num_organisation, 1) org, UPPER(COALESCE(bloc, '')) bloc FROM organisation_ue
      WHERE annee_scolaire = ? AND section = ?`).all(annee, section);
  } catch { return []; }
}

/** Par UE de la classe : les organisations qui s'y donnent (null = toutes). */
export function orgsDuBloc(section, bloc, annee) {
  const B = String(bloc || '').toUpperCase();
  const plac = placementsSection(section, annee);
  const parUE = new Map();
  for (const o of blocsOrganisations(section, annee)) {
    if (!parUE.has(o.ue_num)) parUE.set(o.ue_num, []);
    parUE.get(o.ue_num).push({ org: o.org, bloc: o.bloc || (plac[o.ue_num]?.bloc || '').toUpperCase() });
  }
  const out = new Map();
  for (const p of Object.values(plac)) {
    const orgs = parUE.get(p.ue_num) || [{ org: 1, bloc: (p.bloc || '').toUpperCase() }];
    const ici = orgs.filter(o => o.bloc === B).map(o => o.org);
    if (ici.length) out.set(p.ue_num, ici.length === orgs.length ? null : ici);
  }
  return out;
}

/** Les UE que la section place dans ce bloc cette année — par l'UE, ou par l'une de ses organisations. */
export function uesDuBloc(section, bloc, annee) {
  return [...orgsDuBloc(section, bloc, annee).keys()].sort((a, b) => a - b);
}

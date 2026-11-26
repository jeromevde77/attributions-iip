/* (CS) LE LIEN RÉEL ENTRE UNE SÉANCE ET SON ATTRIBUTION (3.5.727, Charles, 26 novembre 2026 : « très important que les liens soient
   réels avec les attributions, car les heures sont calculées, ainsi que le CEP » ; tranché : les quatre points).
   • Chaque séance de l'horaire porte son attribution (`horaire_seance.attribution_id`) ; « + Placer » la pose d'office.
   • Les séances déjà là se relient D'OFFICE quand il n'y a pas de doute : le professeur de la séance n'a qu'une attribution pour ce
     cours, ou une seule pour ce cours ET ce groupe. Les autres se rangent par cas (un cours, un groupe, un professeur) et se
     tranchent une fois chacun, la proposition en tête ; rien ne s'écrit sans « Relier ».
   • Les heures posées et restantes d'une attribution se lisent sur ce lien.
   • Changer le professeur d'une séance la relie à l'attribution de ce professeur pour le même cours et le même groupe (ou la délie). */
import db from '../db/index.js';

export function migrerLienAttribution(base = db) {
  const cols = base.prepare('PRAGMA table_info(horaire_seance)').all().map(c => c.name);
  if (cols.length && !cols.includes('attribution_id')) base.exec('ALTER TABLE horaire_seance ADD COLUMN attribution_id INTEGER');
  if (cols.length) base.exec('CREATE INDEX IF NOT EXISTS idx_hs_attribution ON horaire_seance(attribution_id)');
}
try { migrerLienAttribution(); } catch (e) { console.error('[lien attribution] migration', e.message); }

/** Le groupe d'une séance ramené au code d'une attribution : « 1B3 » → « B3 », « 3 + 4 » → « 3+4 ». */
export const groupeNet = g => String(g || '').replace(/\s/g, '').toUpperCase().replace(/^\d+(?=[A-Z])/, '');
const estTous = code => String(code || '').toUpperCase() === 'TS';

function attributionsParCours(annee) {
  const l = db.prepare(`SELECT a.id, a.code_cours, a.code, a.professeur_id, a.activite_id, a.periodes_attribuees, a.section,
      p.nom, p.prenom, (SELECT libelle FROM activite_type t WHERE t.id = a.activite_id) activite
    FROM attribution a LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE a.annee_scolaire = ? AND a.code_cours IS NOT NULL AND COALESCE(a.en_conge, 0) = 0`).all(annee);
  const m = new Map();
  for (const a of l) {
    a.prof = a.nom ? `${String(a.nom).toUpperCase()} ${a.prenom || ''}`.trim() : 'à désigner';
    if (!m.has(a.code_cours)) m.set(a.code_cours, []);
    m.get(a.code_cours).push(a);
  }
  return m;
}

/** Ce que la règle propose pour une séance : { auto: id|null, propose: id|null, candidats: [attributions du cours] }. */
export function proposer(s, parCours) {
  const L = parCours.get(s.cours_code) || [];
  if (!L.length) return { auto: null, propose: null, candidats: [] };
  const g = groupeNet(s.sous_groupe);
  // Le groupe exact, sinon le groupe d'attribution qui CONTIENT celui de la séance (« 3+4 » est dans « 3+4+7+8 »).
  const jetons = x => new Set(String(x || '').split('+').filter(Boolean));
  const contient = a => { const t = jetons(groupeNet(a.code)); return [...jetons(g)].every(x => t.has(x)); };
  const duGroupe = l => {
    if (!g) return l.filter(a => estTous(a.code));
    const exact = l.filter(a => groupeNet(a.code) === g);
    return exact.length ? exact : l.filter(a => !estTous(a.code) && contient(a));
  };
  const duProf = s.professeur_id ? L.filter(a => a.professeur_id === s.professeur_id) : [];
  if (duProf.length === 1) return { auto: duProf[0].id, propose: duProf[0].id, candidats: L };
  if (duProf.length > 1) {
    const x = duGroupe(duProf);
    if (x.length === 1) return { auto: x[0].id, propose: x[0].id, candidats: L };
    return { auto: null, propose: x[0]?.id || duProf[0].id, candidats: L };
  }
  const x = duGroupe(L);
  return { auto: null, propose: x.length === 1 ? x[0].id : null, candidats: L };
}

/** Le plan de liaison d'une année : les séances non reliées, d'office ou par cas. `sections` borne au périmètre (null = tout). */
export function planLiaison(annee, { sections = null, section = null } = {}) {
  const parCours = attributionsParCours(annee);
  const seances = db.prepare(`SELECT s.id, s.date, s.heure_debut, s.cours_code, s.sous_groupe, s.professeur_id, s.section, s.minutes,
      p.nom, p.prenom FROM horaire_seance s LEFT JOIN professeur p ON p.id = s.professeur_id
    WHERE s.annee_scolaire = ? AND s.attribution_id IS NULL AND s.cours_code IS NOT NULL`).all(annee)
    .filter(s => (!sections || sections.includes(s.section)) && (!section || s.section === section));
  const auto = [];
  const cas = new Map();
  let sansAttribution = 0;
  for (const s of seances) {
    const r = proposer(s, parCours);
    if (!r.candidats.length) { sansAttribution++; continue; }
    if (r.auto) { auto.push({ id: s.id, attribution_id: r.auto }); continue; }
    const cle = `${s.cours_code}|${groupeNet(s.sous_groupe)}|${s.professeur_id || 0}`;
    if (!cas.has(cle)) {
      cas.set(cle, { cle, cours_code: s.cours_code, groupe: s.sous_groupe || null, section: s.section,
        professeur: s.nom ? `${String(s.nom).toUpperCase()} ${s.prenom || ''}`.trim() : null, seances: [], heures: 0, propose: r.propose,
        candidats: r.candidats.map(a => ({ id: a.id, code: a.code, prof: a.prof, activite: a.activite, periodes: a.periodes_attribuees })) });
    }
    const c = cas.get(cle);
    c.seances.push(s.id); c.heures += (s.minutes || 0) / 60;
    if (!c.premiere || s.date < c.premiere) c.premiere = s.date;
  }
  const deja = db.prepare(`SELECT COUNT(*) n FROM horaire_seance WHERE annee_scolaire = ? AND attribution_id IS NOT NULL`).get(annee).n;
  return { annee, deja, auto, cas: [...cas.values()].map(c => ({ ...c, heures: Math.round(c.heures * 10) / 10, n: c.seances.length }))
    .sort((a, b) => a.cours_code.localeCompare(b.cours_code, 'fr', { numeric: true }) || String(a.groupe || '').localeCompare(String(b.groupe || ''))),
    sans_attribution: sansAttribution };
}

/** Écrire : les liaisons d'office, et les choix par cas ({ cle: attribution_id }). Le plan est recalculé ici, jamais repris de l'écran. */
export function appliquerLiaison(annee, { auto = true, choix = {}, sections = null, section = null, par = null } = {}) {
  const plan = planLiaison(annee, { sections, section });
  const maj = db.prepare(`UPDATE horaire_seance SET attribution_id = ?, modifie_par = COALESCE(modifie_par, ?) WHERE id = ? AND attribution_id IS NULL`);
  let n = 0;
  db.transaction(() => {
    if (auto) for (const x of plan.auto) n += maj.run(x.attribution_id, par, x.id).changes;
    for (const c of plan.cas) {
      const id = Number(choix[c.cle]);
      if (!id || !c.candidats.some(a => a.id === id)) continue;
      for (const sid of c.seances) n += maj.run(id, par, sid).changes;
    }
  })();
  return { reliees: n };
}

/** Après un changement de professeur : l'attribution de ce professeur pour le même cours et le même groupe, sinon rien. */
export function attributionPour(annee, s, professeurId) {
  const parCours = attributionsParCours(annee);
  const r = proposer({ ...s, professeur_id: professeurId }, parCours);
  return r.auto || null;
}

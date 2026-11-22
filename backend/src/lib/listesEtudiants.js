/* (CS) QUATRE LISTES QUI MANQUAIENT (3.5.652, Charles, 22 novembre 2026 : « avons-nous pensé à toutes les listes utiles pour les
   étudiants ? »). Les mouvements de l'année, les PAE non confirmés ou contestés, la seconde session et les décisions, les dossiers
   incomplets. Chacune rend des lignes ; le catalogue des rapports (routes/rapports.js) les met en tableau et en Excel. `sections` :
   la section choisie ou le périmètre (null = toutes). La section d'un étudiant est toujours celle de la fiche (sectionPropre). */
import db from '../db/index.js';
import { sectionPropre } from '../routes/etudiants.js';
import { aRepresenterParCours } from '../routes/acquis.js';
import { anciensAvant } from './primo.js';
import { fonctionPour } from './fonctions.js';

const essai = (f, defaut) => { try { return f(); } catch { return defaut; } };
const jour = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const nom = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
const dans = (sections, s) => !sections || sections.includes(s);
const DECISION = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé', abandon: 'Abandon' };

/** Les inscrits de l'année (un par étudiant), avec leur section. */
function inscritsDeLAnnee(annee, sections) {
  return db.prepare(`SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus, e.email_ecole, e.sortie_statut, e.sortie_le, e.sortie_motif
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id WHERE i.annee_scolaire = ? ORDER BY e.nom, e.prenom`).all(annee)
    .map(e => ({ ...e, section: essai(() => sectionPropre(e.id), null) || '' }))
    .filter(e => dans(sections, e.section));
}

/* 1. LES MOUVEMENTS DE L'ANNÉE : les nouveaux (primo-inscrits), les sorties (archivé, sorti, diplômé, avec la date), les désinscriptions. */
export function mouvements(annee, sections) {
  const anciens = essai(() => anciensAvant(annee), new Set());
  const lignes = [];
  for (const e of inscritsDeLAnnee(annee, sections)) {
    const premiere = db.prepare('SELECT MIN(COALESCE(date_inscription, cree_le)) d FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?').get(e.id, annee)?.d;
    if (!anciens.has?.(e.id)) lignes.push({ section: e.section, etudiant: nom(e), matricule: e.id_ecampus || '', mouvement: 'Nouvel inscrit (primo)', date: jour(premiere), detail: '' });
    if (e.sortie_statut) lignes.push({ section: e.section, etudiant: nom(e), matricule: e.id_ecampus || '',
      mouvement: { archive: 'Archivé', sorti: 'Sorti', diplome: 'Diplômé' }[e.sortie_statut] || e.sortie_statut, date: jour(e.sortie_le), detail: e.sortie_motif || '' });
  }
  for (const d of essai(() => db.prepare(`SELECT d.*, e.nom, e.prenom, e.id_ecampus FROM desinscription d JOIN etudiant e ON e.id = d.etudiant_id
    WHERE d.annee_scolaire = ? ORDER BY d.demande_le`).all(annee), [])) {
    const section = essai(() => sectionPropre(d.etudiant_id), null) || '';
    if (!dans(sections, section)) continue;
    lignes.push({ section, etudiant: nom(d), matricule: d.id_ecampus || '',
      mouvement: `Désinscription ${d.portee === 'ues' ? '(des unités)' : '(toute l’année)'} — ${{ demandee: 'demandée', confirmee: 'confirmée', refusee: 'refusée' }[d.statut] || d.statut || ''}`,
      date: jour(d.confirme_le || d.demande_le), detail: d.motif || d.refus_motif || '' });
  }
  return lignes.sort((a, b) => a.section.localeCompare(b.section, 'fr') || a.mouvement.localeCompare(b.mouvement, 'fr') || a.etudiant.localeCompare(b.etudiant, 'fr'));
}

/* 2. LES PAE À REGARDER : non confirmé par l'école (revue), non validé par l'étudiant dans son espace, ou signalé comme faux. */
export function paeAReguler(annee, sections) {
  const revus = new Set(essai(() => db.prepare('SELECT etudiant_id FROM pae_revue WHERE annee_scolaire = ? AND revu_le IS NOT NULL').all(annee).map(x => x.etudiant_id), []));
  const signes = new Map(essai(() => db.prepare('SELECT etudiant_id, MAX(signe_le) le FROM pae_signature_etudiant WHERE annee_scolaire = ? GROUP BY etudiant_id').all(annee).map(x => [x.etudiant_id, x.le]), []));
  const contestes = new Map();
  for (const n of essai(() => db.prepare("SELECT lien, corps, cree_le FROM lucie_notification WHERE type = 'pae_desaccord' ORDER BY cree_le").all(), [])) {
    const id = Number(/[?&]id=(\d+)/.exec(n.lien || '')?.[1]); if (id) contestes.set(id, n);
  }
  const lignes = [];
  for (const e of inscritsDeLAnnee(annee, sections)) {
    if (['archive', 'sorti', 'diplome'].includes(String(e.sortie_statut || ''))) continue;
    const manque = [];
    if (!revus.has(e.id)) manque.push('non confirmé par l’école');
    if (!signes.has(e.id)) manque.push('non validé par l’étudiant');
    const c = contestes.get(e.id);
    if (c) manque.push('signalé comme faux par l’étudiant');
    if (!manque.length) continue;
    lignes.push({ section: e.section, etudiant: nom(e), matricule: e.id_ecampus || '', etat: manque.join(' · '),
      signale: c ? `${jour(c.cree_le)} — ${String(c.corps || '').replace(/ — depuis son espace.*$/, '').slice(0, 300)}` : '' });
  }
  return lignes.sort((a, b) => (b.signale ? 1 : 0) - (a.signale ? 1 : 0) || a.section.localeCompare(b.section, 'fr') || a.etudiant.localeCompare(b.etudiant, 'fr'));
}

/* 3. LA SECONDE SESSION ET LES DÉCISIONS : par unité, les ajournés (et ce qu'ils représentent, cours par cours, avec la date d'examen),
   les refusés, les faveurs. */
export function secondeSession(annee, sections) {
  const ues = db.prepare(`SELECT ue_num, MAX(ue_nom) ue_nom, MIN(section) section FROM ue WHERE annee_scolaire = ? GROUP BY ue_num ORDER BY ue_num`).all(annee);
  const faveurs = new Set(essai(() => db.prepare(`SELECT DISTINCT etudiant_id || '|' || ue_num k FROM deliberation_ajustement WHERE annee_scolaire = ? AND action = 'faveur'`).all(annee).map(x => x.k), []));
  const dateS2 = (ue, cours) => essai(() => {
    const r = db.prepare("SELECT s2_date FROM deliberation_session2 WHERE annee_scolaire = ? AND ue_num = ? AND cours_code IN (?, '') ORDER BY cours_code DESC LIMIT 1").get(annee, ue, cours);
    return r?.s2_date ? jour(r.s2_date) : '';
  }, '');
  const lignes = [];
  for (const u of ues) {
    const decisions = db.prepare(`SELECT i.etudiant_id, i.resultat, e.nom, e.prenom, e.id_ecampus FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ? AND i.resultat IN ('ajourne', 'refuse', 'reussi') ORDER BY e.nom, e.prenom`).all(annee, u.ue_num);
    if (!decisions.length) continue;
    const aRep = essai(() => aRepresenterParCours(u.ue_num, annee, 1), {});
    const parEtud = new Map();
    for (const [cours, l] of Object.entries(aRep)) for (const x of l) {
      if (!parEtud.has(x.id)) parEtud.set(x.id, []);
      parEtud.get(x.id).push(`${cours}${x.aas?.length ? ` (${x.aas.join(', ')})` : ''}${dateS2(u.ue_num, cours) ? ` — ${dateS2(u.ue_num, cours)}` : ''}`);
    }
    for (const d of decisions) {
      const section = essai(() => sectionPropre(d.etudiant_id), null) || u.section || '';
      if (!dans(sections, section)) continue;
      const faveur = faveurs.has(`${d.etudiant_id}|${u.ue_num}`);
      if (d.resultat === 'reussi' && !faveur) continue;
      lignes.push({ section, ue: `UE ${u.ue_num} — ${u.ue_nom || ''}`, etudiant: nom(d), matricule: d.id_ecampus || '',
        decision: faveur ? 'Réussi par faveur' : DECISION[d.resultat] || d.resultat,
        a_representer: d.resultat === 'ajourne' ? (parEtud.get(d.etudiant_id) || []).join(' ; ') || 'à préciser dans la délibération' : '' });
    }
  }
  return lignes;
}

/* 4. LES DOSSIERS INCOMPLETS : sans adresse d'institut, sans section, sans photo acceptée, sans visite médicale valable (s'il est
   inscrit à une unité de stage). */
export function dossiersIncomplets(annee, sections) {
  const stage = new Set(essai(() => db.prepare(`SELECT DISTINCT i.etudiant_id FROM etudiant_inscription i JOIN cours c ON c.ue_num = i.ue_num AND c.annee_scolaire = i.annee_scolaire
    WHERE i.annee_scolaire = ? AND c.is_stage = 1`).all(annee).map(x => x.etudiant_id), []));
  let photo = () => true, visite = () => true;
  try { const P = db.prepare("SELECT 1 FROM etudiant_photo WHERE etudiant_id = ? AND statut = 'acceptee' LIMIT 1"); photo = id => !!P.get(id); } catch { /* sans table, pas de manque */ }
  try { const V = db.prepare("SELECT date_examen FROM etudiant_visite_medicale WHERE etudiant_id = ? AND retire_le IS NULL ORDER BY date_examen DESC LIMIT 1"); visite = id => !!V.get(id); } catch { /* idem */ }
  const lignes = [];
  for (const e of inscritsDeLAnnee(annee, null)) {
    if (['archive', 'sorti', 'diplome'].includes(String(e.sortie_statut || ''))) continue;
    if (sections && !sections.includes(e.section)) continue;
    const manque = [];
    if (!String(e.email_ecole || '').includes('@')) manque.push('adresse de l’institut');
    if (!e.section) manque.push('section');
    // La photo ne se réclame qu'à qui peut la déposer (« Ma photo » ouverte pour lui).
    if (!photo(e.id) && essai(() => fonctionPour('espace.photo', { etudiantId: e.id }), false)) manque.push('photo d’identité');
    if (stage.has(e.id) && !visite(e.id)) manque.push('visite médicale (stage)');
    if (manque.length) lignes.push({ section: e.section || '—', etudiant: nom(e), matricule: e.id_ecampus || '', manque: manque.join(' · '), nb: manque.length });
  }
  return lignes.sort((a, b) => a.section.localeCompare(b.section, 'fr') || b.nb - a.nb || a.etudiant.localeCompare(b.etudiant, 'fr'));
}

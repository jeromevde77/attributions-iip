/**
 * LE TFE ET LE STAGE DANS L'ESPACE DE L'ÉTUDIANT (3.5.081, Charles, 2 novembre 2026 : « un onglet stage et un onglet TFE,
 * avec des infos ; pour le TFE il pourrait y entrer sa question de recherche » ; tranché : TFE = voir titre, jury, remises,
 * défense ; proposer sa question de recherche ; déposer ses remises ; lire les fiches d'évaluation — Stage = lieu, dates,
 * superviseur et maître de stage ; pièces qui manquent ; visites prévues ; fiches d'évaluation — deux fonctions nées éteintes).
 *
 * Comme le reste de l'espace : Lucie DÉPOSE (tfePortail, stagePortail, avec le lot de l'étudiant) et RELÈVE les gestes
 * (question, remise) qu'elle juge ici. La question de recherche n'est qu'une PROPOSITION : le promoteur ou la coordination
 * l'accepte (elle devient la question du TFE) ou la renvoie avec un mot. Une remise déposée est un fichier rangé avec le TFE,
 * et la remise est marquée reçue au jour du dépôt, au nom de l'étudiant.
 */
import fs from 'fs';
import path from 'path';
import db from '../db/index.js';
import { typeReel } from './portailValorisation.js';
import { piecesDuStage } from '../routes/stages.js';
import { REMPLI_PAR } from '../routes/fichesEvaluation.js';

const DATA_DIR = () => process.env.DATA_DIR || '/app/data';
const nomEtud = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
const nomProf = id => {
  const p = id ? db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(id) : null;
  if (!p || /d[ée]signer/i.test(`${p.nom} ${p.prenom || ''}`)) return null;   // la fiche « À DÉSIGNER » n'est personne
  return `${p.prenom || ''} ${String(p.nom || '').toUpperCase()}`.trim();
};
const ROLES_JURY = { promoteur: 'Promoteur', copromoteur: 'Copromoteur', lecteur: 'Lecteur', auditeur: 'Auditeur', president: 'Président du jury' };

export function migrerTfeEspace(dbx = db) {
  for (const c of ['question_recherche TEXT', 'question_le TEXT', 'question_par TEXT']) { try { dbx.exec(`ALTER TABLE tfe ADD COLUMN ${c}`); } catch { /* déjà là */ } }
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS tfe_question (id INTEGER PRIMARY KEY AUTOINCREMENT, tfe_id INTEGER NOT NULL, texte TEXT NOT NULL,
      proposee_le TEXT NOT NULL DEFAULT (datetime('now')), etat TEXT NOT NULL DEFAULT 'proposee' CHECK (etat IN ('proposee','acceptee','renvoyee')),
      mot TEXT, traite_par TEXT, traite_le TEXT);
    CREATE INDEX IF NOT EXISTS idx_tfe_question ON tfe_question(tfe_id);
    CREATE TABLE IF NOT EXISTS tfe_depot (id INTEGER PRIMARY KEY AUTOINCREMENT, tfe_id INTEGER NOT NULL, jalon_id INTEGER NOT NULL,
      nom TEXT NOT NULL, chemin TEXT NOT NULL, taille INTEGER, type_mime TEXT, depose_le TEXT NOT NULL DEFAULT (datetime('now')), par TEXT);
    CREATE INDEX IF NOT EXISTS idx_tfe_depot ON tfe_depot(tfe_id, jalon_id);`);
}

/** Les fiches d'évaluation d'une UE, telles que l'étudiant les lit : critères, consignes ; jamais une note. */
function fichesLisibles(domaine, ueNum, annee) {
  let l = [];
  try { l = db.prepare('SELECT * FROM fiche_modele WHERE annee_scolaire = ? AND domaine = ? AND ue_num = ? ORDER BY ordre, id').all(annee, domaine, ueNum); } catch { return []; }
  const crit = db.prepare(`SELECT c.aa_code, c.poids, c.consigne, (SELECT description FROM aa WHERE aa_code = c.aa_code LIMIT 1) AS description
    FROM fiche_critere c WHERE c.fiche_id = ? ORDER BY c.ordre`);
  return l.map(f => ({ intitule: f.intitule, rempli_par: REMPLI_PAR[domaine]?.[f.rempli_par] || f.rempli_par, moment: f.moment, sur: f.sur,
    criteres: crit.all(f.id).map(c => ({ aa_code: c.aa_code, description: c.description || '', poids: c.poids, consigne: c.consigne || '' })) }));
}

/** Les TFE de l'étudiant pour l'année : ce que l'école a encodé, sa question, ses remises, sa défense, les fiches. */
export function tfePortail(e, annee) {
  migrerTfeEspace();
  const l = db.prepare('SELECT * FROM tfe WHERE etudiant_id = ? AND annee_scolaire = ? ORDER BY id').all(e.id, annee);
  return l.map(t => {
    const section = t.section || db.prepare('SELECT section FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(t.ue_num, annee)?.section || '';
    const jury = db.prepare('SELECT role, professeur_id, nom_libre FROM tfe_membre WHERE tfe_id = ? ORDER BY ordre, id').all(t.id)
      .map(m => ({ role: ROLES_JURY[m.role] || m.role, nom: nomProf(m.professeur_id) || m.nom_libre || 'à désigner' }));
    const jalons = db.prepare('SELECT id, libelle, date_limite FROM tfe_jalon WHERE annee_scolaire = ? AND section = ? ORDER BY ordre, date_limite, id').all(annee, section);
    const recu = db.prepare('SELECT recu_le FROM tfe_remise WHERE tfe_id = ? AND jalon_id = ?');
    const depots = db.prepare('SELECT nom, depose_le FROM tfe_depot WHERE tfe_id = ? AND jalon_id = ? ORDER BY id DESC');
    const derniere = db.prepare('SELECT texte, etat, mot, proposee_le, traite_le FROM tfe_question WHERE tfe_id = ? ORDER BY id DESC LIMIT 1').get(t.id) || null;
    return {
      id: t.id, titre: t.titre, ue_num: t.ue_num,
      ue_nom: db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(t.ue_num, annee)?.ue_nom || '',
      jury, question: t.question_recherche || null, question_proposee: derniere,
      remises: jalons.map(j => ({ jalon_id: j.id, libelle: j.libelle, date_limite: j.date_limite, recu_le: recu.get(t.id, j.id)?.recu_le || null,
        depots: depots.all(t.id, j.id) })),
      defense: t.date_defense ? { date: t.date_defense, heure: t.heure_defense || null, local: t.local_defense || null } : null,
      fiches: fichesLisibles('tfe', t.ue_num, annee),
    };
  });
}

const PIECE_MOT = { lieu: 'le lieu de stage', dates: 'les dates', 'professeur de stage': 'le professeur de stage (fixé par l’école)' };
/** Les stages de l'étudiant pour l'année : où, quand, qui encadre, ce qui manque, les visites prévues, les fiches. */
export function stagePortail(e, annee) {
  let l = [];
  try { l = db.prepare(`SELECT s.*, l.nom AS lieu_nom, l.service AS lieu_service, l.adresse AS lieu_adresse, l.cp AS lieu_cp, l.localite AS lieu_localite
    FROM stage s LEFT JOIN stage_lieu l ON l.id = s.lieu_id WHERE s.etudiant_id = ? AND s.annee_scolaire = ? AND s.statut <> 'annule'
    ORDER BY s.date_debut, s.id`).all(e.id, annee); } catch { return []; }
  const visites = id => { try {
    return db.prepare(`SELECT date, heure_debut, heure_fin, statut FROM stage_visite WHERE stage_id = ? AND statut <> 'annulee' ORDER BY date, heure_debut`).all(id);
  } catch { return []; } };
  return l.map(s => {
    // Un stage terminé n'a plus rien « à remettre avant de commencer ».
    const fini = s.date_fin && s.date_fin < new Date().toISOString().slice(0, 10);
    const p = fini ? { manquent: [], urgence: null } : piecesDuStage(s, annee);
    return {
      id: s.id, ue_num: s.ue_num,
      ue_nom: s.ue_num ? db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(s.ue_num, annee)?.ue_nom || '' : '',
      statut: s.statut, date_debut: s.date_debut, date_fin: s.date_fin, heures_prevues: s.heures_prevues,
      lieu: s.lieu_id ? { nom: s.lieu_nom, service: s.lieu_service, adresse: [s.lieu_adresse, [s.lieu_cp, s.lieu_localite].filter(Boolean).join(' ')].filter(Boolean).join(', ') } : null,
      maitre: s.maitre_stage ? { nom: s.maitre_stage, fonction: s.maitre_fonction || null } : null,
      superviseur: nomProf(s.professeur_id),
      manquent: p.manquent.map(m => PIECE_MOT[m] || m), urgence: p.urgence,
      visites: visites(s.id).map(v => ({ date: v.date, heure: v.heure_debut || null, faite: v.statut === 'faite' })),
      fiches: s.ue_num ? fichesLisibles('stage', s.ue_num, annee) : [],
    };
  });
}

function prevenir(t, titre, corps) {
  const section = t.section || db.prepare('SELECT section FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(t.ue_num)?.section || null;
  const lien = `/organisation?onglet=tfe`;
  try {
    const n = db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par, section) VALUES ('tfe_espace',?,?,?,?,?,?)`);
    n.run(titre, corps, lien, 'coordination', 'Espace de l’étudiant', section);
    // Le promoteur (et le copromoteur), s'ils ont un compte relié à leur fiche.
    const comptes = db.prepare(`SELECT DISTINCT u.id FROM tfe_membre m JOIN utilisateur u ON u.professeur_id = m.professeur_id AND COALESCE(u.actif, 1) = 1
      WHERE m.tfe_id = ? AND m.role IN ('promoteur','copromoteur')`).all(t.id);
    const nu = db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cree_par, section) VALUES ('tfe_espace',?,?,?,?,?,?)`);
    for (const c of comptes) nu.run(titre, corps, lien, c.id, 'Espace de l’étudiant', section);
  } catch (x) { console.error('[tfe espace] notification :', x.message); }
}

/** Un geste relevé de l'espace : rend null, ou le refus en clair que l'étudiant lira. */
export function appliquerGesteTfe(e, g, contenu, annee) {
  migrerTfeEspace();
  const t = db.prepare('SELECT * FROM tfe WHERE id = ? AND etudiant_id = ?').get(Number(g.tfe_id), e.id);
  if (!t) return 'Ce TFE n’est pas le vôtre, ou n’existe plus : adressez-vous à votre coordination.';
  if (t.annee_scolaire !== annee) return 'Ce TFE appartient à une autre année.';
  const par = `${nomEtud(e)} (étudiant, en ligne)`;
  if (g.type === 'question') {
    const texte = String(g.texte || '').trim();
    if (texte.length < 10) return 'Écrivez votre question de recherche (dix caractères au moins).';
    if (texte.length > 2000) return 'Deux mille caractères au plus.';
    if (db.prepare(`SELECT 1 FROM tfe_question WHERE tfe_id = ? AND etat = 'proposee' AND texte = ?`).get(t.id, texte)) return null;
    db.prepare('INSERT INTO tfe_question (tfe_id, texte) VALUES (?,?)').run(t.id, texte);
    prevenir(t, `TFE — question de recherche proposée : ${nomEtud(e)}`,
      `<p>${nomEtud(e)} propose sa question de recherche pour « ${t.titre} » :</p><blockquote>${texte.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</blockquote><p>À accepter ou à renvoyer avec un mot : fiche de l’étudiant → onglet TFE.</p>`);
    return null;
  }
  if (g.type === 'remise') {
    const section = t.section || db.prepare('SELECT section FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(t.ue_num, annee)?.section;
    const j = db.prepare('SELECT * FROM tfe_jalon WHERE id = ? AND annee_scolaire = ? AND section = ?').get(Number(g.jalon_id), annee, section);
    if (!j) return 'Cette remise n’est plus au calendrier : adressez-vous à votre coordination.';
    if (!contenu?.length) return 'Le fichier n’a pas pu être reçu : déposez-le à nouveau.';
    const tr = typeReel(contenu);
    if (!tr) return "Ce fichier n'est pas un PDF, une image ou un document Word valable.";
    if (contenu.length > 25 * 1024 * 1024) return 'Fichier trop lourd (25 Mo au plus).';
    const original = String(g.nom || `remise${tr.ext}`).replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const dir = path.join(DATA_DIR(), 'tfe', String(t.id));
    fs.mkdirSync(dir, { recursive: true });
    const chemin = path.join(dir, `${Date.now()}_${original}`);
    fs.writeFileSync(chemin, contenu);
    const nom = `TFE_${String(e.nom || '').toUpperCase().replace(/\s+/g, '-')}_${String(j.libelle).replace(/[^\wÀ-ÿ]+/g, '-').slice(0, 40)}${original.includes('.') ? original.slice(original.lastIndexOf('.')) : tr.ext}`;
    const jour = new Date().toISOString().slice(0, 10);
    db.transaction(() => {
      db.prepare('INSERT INTO tfe_depot (tfe_id, jalon_id, nom, chemin, taille, type_mime, par) VALUES (?,?,?,?,?,?,?)').run(t.id, j.id, nom, chemin, contenu.length, tr.mime, par);
      // La remise est reçue au premier dépôt ; un dépôt suivant (une version corrigée) ne déplace pas la date.
      db.prepare('INSERT OR IGNORE INTO tfe_remise (tfe_id, jalon_id, recu_le, recu_par) VALUES (?,?,?,?)').run(t.id, j.id, jour, par);
    })();
    prevenir(t, `TFE — remise déposée : ${nomEtud(e)} · ${j.libelle}`, `<p>${nomEtud(e)} a déposé « ${j.libelle} » pour « ${t.titre} » depuis son espace. Le fichier est dans sa fiche → onglet TFE.</p>`);
    return null;
  }
  return 'Geste inconnu.';
}

/** Pour la fiche (onglet TFE) : la question proposée et les fichiers déposés. */
export function tfeEspaceDe(tfeId) {
  migrerTfeEspace();
  return {
    questions: db.prepare('SELECT id, texte, etat, mot, proposee_le, traite_par, traite_le FROM tfe_question WHERE tfe_id = ? ORDER BY id DESC').all(tfeId),
    depots: db.prepare(`SELECT d.id, d.nom, d.taille, d.depose_le, d.par, j.libelle FROM tfe_depot d LEFT JOIN tfe_jalon j ON j.id = d.jalon_id
      WHERE d.tfe_id = ? ORDER BY d.id DESC`).all(tfeId),
  };
}

/** Accepter la question proposée (elle devient celle du TFE) ou la renvoyer avec un mot. */
export function traiterQuestion(qid, { accepter, mot }, par) {
  migrerTfeEspace();
  const q = db.prepare(`SELECT * FROM tfe_question WHERE id = ?`).get(Number(qid));
  if (!q) return { erreur: 'Proposition introuvable.' };
  if (q.etat !== 'proposee') return { erreur: 'Cette proposition a déjà reçu une réponse.' };
  if (!accepter && !String(mot || '').trim()) return { erreur: 'Dites à l’étudiant pourquoi la question lui revient.' };
  db.transaction(() => {
    db.prepare(`UPDATE tfe_question SET etat = ?, mot = ?, traite_par = ?, traite_le = datetime('now') WHERE id = ?`)
      .run(accepter ? 'acceptee' : 'renvoyee', String(mot || '').trim().slice(0, 1000) || null, par, q.id);
    if (accepter) db.prepare(`UPDATE tfe SET question_recherche = ?, question_le = datetime('now'), question_par = ? WHERE id = ?`).run(q.texte, par, q.tfe_id);
  })();
  return { ok: true, tfe_id: q.tfe_id };
}

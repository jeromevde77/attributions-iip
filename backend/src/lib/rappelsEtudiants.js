// ─────────────────────────────────────────────────────────────────────────────
// LES RAPPELS AUX ÉTUDIANTS (3.1.525, étape 4 — analyse : docs/contexte/analyse-rappels-2026-10-30.md, E1 à E7).
// Tranché par Charles le 30 octobre 2026 : E1 à E7 partent tous d'office, AU PLUS UN AVIS PAR JOUR et par étudiant.
//
// Un rappel d'étudiant ne dit RIEN de ce qui l'attend au-delà d'un intitulé (« un document vous attend », « votre PAE
// est à confirmer ») : ni note, ni montant, ni nom de pièce. Le contenu est dans l'espace, derrière le mur. Le courriel
// part à l'adresse d'institut (le candidat : à son adresse privée, tant que son code d'accès vaut).
//
// Deux temps, comme pour le personnel : le PASSAGE (toutes les heures, partout) remplit la file `rappel_etudiant` — une
// ligne par étudiant, rappel, objet et jalon, jamais deux ; l'ENVOI (production seulement, entre 8 h et 20 h) groupe
// tout ce qui attend un étudiant en UN courriel, au plus un par jour, et attend le lendemain si l'avis des messages est
// déjà parti ce jour-là. Sans portail installé, rien ne se calcule : on ne renvoie pas vers un espace qui n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { rappelActif, reglagesRappels } from './rappels.js';
import { portailActif } from './portailSync.js';
import { fonctionPour } from './fonctions.js';
import { reglagePAE } from './paeEnLigne.js';
import { calculerFrais } from '../routes/fraisScolarite.js';
import { controleDelai } from './valorisation.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

const FONCTION_DU_RAPPEL = { etudiants_documents: 'espace.documents', etudiants_pae: 'espace.pae', etudiants_messages: 'espace.messages',
  etudiants_frais: 'espace.frais', etudiants_va: 'espace.va' };
const URL_PUBLIQUE = () => (process.env.PORTAIL_URL_PUBLIQUE || 'https://etudiants.lucie-iip.be').replace(/\/$/, '');
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jourFr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
function maintenant() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) };
}
const utc = d => Date.UTC(...String(d).slice(0, 10).split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)));
const ecart = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
/** Le dernier jalon atteint (jours écoulés depuis `depuis`), ou null : un document vieux de 40 jours ne reçoit que J+30. */
const jalonAtteint = (jours, jalons) => [...jalons].sort((a, b) => b - a).find(j => jours >= j) ?? null;

export function migrerRappelsEtudiants(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS rappel_etudiant (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
      cle TEXT NOT NULL, objet TEXT NOT NULL, jalon TEXT NOT NULL, titre TEXT NOT NULL,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')), envoye_le TEXT, statut TEXT,
      UNIQUE (etudiant_id, cle, objet, jalon));
    CREATE INDEX IF NOT EXISTS rappel_etudiant_attente ON rappel_etudiant (envoye_le, etudiant_id);
    CREATE TABLE IF NOT EXISTS rappel_etudiant_jour (etudiant_id INTEGER NOT NULL, jour TEXT NOT NULL, nombre INTEGER,
      statut TEXT, PRIMARY KEY (etudiant_id, jour));
  `);
}

/** Les étudiants qui ont un espace : actifs, non archivés, avec une adresse d'institut — ou un code de candidat valable. */
function joignables() {
  const l = db.prepare(`SELECT id, prenom, email_ecole, email_perso FROM etudiant WHERE COALESCE(actif, 1) = 1
    AND COALESCE(sortie_statut, '') <> 'archive'`).all();
  let cand = new Set();
  try { cand = new Set(db.prepare("SELECT etudiant_id FROM portail_candidat WHERE jusqu_au >= date('now')").all().map(x => x.etudiant_id)); } catch { /* */ }
  const m = new Map();
  for (const e of l) {
    const ecole = String(e.email_ecole || '').includes('@');
    if (ecole) m.set(e.id, { ...e, adresse: e.email_ecole, candidat: false });
    else if (cand.has(e.id) && String(e.email_perso || '').includes('@')) m.set(e.id, { ...e, adresse: e.email_perso, candidat: true });
  }
  return m;
}

/** Le passage : à lancer plusieurs fois par jour ; il ne dépose que ce qui est dû et pas encore en file. */
export function genererRappelsEtudiants(annee, { jour = null, force = false } = {}) {
  const stats = { documents: 0, accuses: 0, pae: 0, fenetre_pae: 0, messages: 0, frais: 0, va: 0 };
  if (!force && !portailActif()) return stats;
  migrerRappelsEtudiants();
  const auj = jour || maintenant().jour;
  const qui = joignables();
  const deposer = (etudiantId, cle, objet, jalon, titre) => {
    if (!qui.has(etudiantId) || !rappelActif(cle)) return;
    // La fonction de l'espace dont parle le rappel doit être ouverte pour cet étudiant (3.5.001, Configuration → Fonctions).
    if (!fonctionPour(FONCTION_DU_RAPPEL[cle], { etudiantId })) return;
    const r = db.prepare(`INSERT OR IGNORE INTO rappel_etudiant (etudiant_id, cle, objet, jalon, titre) VALUES (?,?,?,?,?)`)
      .run(etudiantId, cle, String(objet), String(jalon), titre);
    return r.changes > 0;
  };
  const compter = (k, ok) => { if (ok) stats[k]++; };

  // ── E1 : UN DOCUMENT JAMAIS OUVERT — J+7, J+30, puis J+80 (avant le code des 90 jours) ──
  // Seulement ce qui est parti depuis la mise en service de l'espace : un courriel de mai n'a jamais été « à ouvrir ».
  const depuis = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'portail_depot_depuis'").get()?.valeur;
  if (depuis) {
    let docs = [];
    try {
      docs = db.prepare(`SELECT m.id, m.destinataire_id AS etudiant_id, date(m.envoye_le) le FROM envoi_mail m
        WHERE m.destinataire_type = 'etudiant' AND m.statut <> 'echec' AND date(m.envoye_le) >= ? AND date(m.envoye_le) > date(?, '-90 days')
          AND NOT EXISTS (SELECT 1 FROM portail_accuse a WHERE a.etudiant_id = m.destinataire_id AND a.objet_type = 'envoi'
            AND a.objet_id = m.id AND a.presente_le IS NOT NULL)`).all(depuis, auj);
    } catch { docs = []; }
    for (const d of docs) {
      const j = jalonAtteint(ecart(d.le, auj), [7, 30, 80]);
      if (j == null) continue;
      compter('documents', deposer(d.etudiant_id, 'etudiants_documents', `envoi:${d.id}`, `J+${j}`,
        j === 80 ? 'Un document vous attend depuis bientôt 90 jours : au-delà, il faudra un code pour l’ouvrir'
          : 'Un document vous attend dans votre espace'));
    }
  }

  // ── E2 : UN ACCUSÉ À SIGNER — présenté, pas signé : J+3, J+10 ──
  let accuses = [];
  try {
    accuses = db.prepare(`SELECT etudiant_id, objet_type, objet_id, date(presente_le) le FROM portail_accuse
      WHERE presente_le IS NOT NULL AND signe_le IS NULL AND date(presente_le) > date(?, '-60 days')`).all(auj);
  } catch { accuses = []; }
  for (const a of accuses) {
    const j = jalonAtteint(ecart(a.le, auj), [3, 10]);
    if (j == null) continue;
    compter('accuses', deposer(a.etudiant_id, 'etudiants_documents', `${a.objet_type}:${a.objet_id}`, `signer-J+${j}`,
      a.objet_type === 'reglement' ? 'Un règlement attend votre accusé de réception' : 'Un document attend votre accusé de réception'));
  }

  // ── E3 et E4 : LE PAE EN LIGNE ──
  const fen = reglagePAE();
  if (fen.annee && fen.du && fen.au) {
    // E3 : le PAE confirmé par l'école pendant la fenêtre (ou après), pas encore confirmé par l'étudiant : J+2, J+7.
    let aConfirmer = [];
    try {
      aConfirmer = db.prepare(`SELECT p.etudiant_id, date(p.confirme_le) le, p.confirme_le FROM etudiant_pae p
        WHERE p.annee_scolaire = ? AND p.confirme_le IS NOT NULL AND date(p.confirme_le) >= ?
          AND NOT EXISTS (SELECT 1 FROM pae_signature_etudiant s WHERE s.etudiant_id = p.etudiant_id AND s.annee_scolaire = p.annee_scolaire
            AND s.signe_le >= p.confirme_le)`).all(fen.annee, fen.du);
    } catch { aConfirmer = []; }
    for (const p of aConfirmer) {
      if (qui.get(p.etudiant_id)?.candidat) continue;
      const j = jalonAtteint(ecart(p.le, auj), [2, 7]);
      if (j == null || ecart(p.le, auj) > 30) continue;
      compter('pae', deposer(p.etudiant_id, 'etudiants_pae', `pae:${fen.annee}:${p.confirme_le}`, `J+${j}`,
        `Votre PAE ${fen.annee} est confirmé par l’école : il attend votre confirmation`));
    }
    // E4 : l'ouverture de la fenêtre (les deux premiers jours), puis la fermeture à J-3 pour qui n'a rien proposé.
    const nOuv = ecart(fen.du, auj), nFerm = ecart(auj, fen.au);
    if ((nOuv >= 0 && nOuv <= 2) || (nFerm >= 0 && nFerm <= 3)) {
      const fermeture = !(nOuv >= 0 && nOuv <= 2);
      let ontPropose = new Set(), confirmes = new Set();
      try { ontPropose = new Set(db.prepare('SELECT DISTINCT etudiant_id FROM pae_proposition WHERE annee_scolaire = ?').all(fen.annee).map(x => x.etudiant_id)); } catch { /* */ }
      try { confirmes = new Set(db.prepare('SELECT etudiant_id FROM etudiant_pae WHERE annee_scolaire = ? AND confirme_le IS NOT NULL').all(fen.annee).map(x => x.etudiant_id)); } catch { /* */ }
      for (const [id, e] of qui) {
        if (e.candidat || confirmes.has(id) || (fermeture && ontPropose.has(id))) continue;
        compter('fenetre_pae', deposer(id, 'etudiants_pae', `fenetre:${fen.annee}:${fen.du}:${fen.au}`, fermeture ? 'fermeture' : 'ouverture',
          fermeture ? `Le PAE en ligne ${fen.annee} se ferme le ${jourFr(fen.au)}`
            : `Le PAE en ligne ${fen.annee} est ouvert jusqu’au ${jourFr(fen.au)}`));
      }
    }
  }

  // ── E5 : UN MESSAGE NON LU DEPUIS 3 JOURS ──
  let messages = [];
  try {
    messages = db.prepare(`SELECT d.message_id, d.etudiant_id FROM message_etudiant_dest d JOIN message_etudiant m ON m.id = d.message_id
      WHERE d.lu_le IS NULL AND m.retire_le IS NULL AND date(m.envoye_le) <= date(?, '-3 days') AND date(m.envoye_le) > date(?, '-30 days')`).all(auj, auj);
  } catch { messages = []; }
  for (const m of messages) compter('messages', deposer(m.etudiant_id, 'etudiants_messages', `message:${m.message_id}`, 'J+3',
    'Un message de l’institut n’est pas encore lu'));

  // ── E7 : UNE DEMANDE DE VA EN LIGNE SANS PIÈCE — J+3, et J-3 avant l'échéance de la demande ──
  let va = [];
  try {
    va = db.prepare(`SELECT v.id, v.etudiant_id, v.ue_num, v.date_reception, v.date_demande FROM etudiant_valorisation v
      WHERE v.annee_scolaire = ? AND v.mode_introduction = 'en ligne' AND v.archive_le IS NULL AND v.recevable IS NULL AND v.decision_le IS NULL
        AND NOT EXISTS (SELECT 1 FROM etudiant_valorisation_fichier f WHERE f.valorisation_id = v.id)`).all(annee);
  } catch { va = []; }
  for (const v of va) {
    const n = v.date_reception ? ecart(v.date_reception, auj) : null;
    if (n != null && n >= 3 && n <= 30) compter('va', deposer(v.etudiant_id, 'etudiants_va', `va:${v.id}`, 'J+3',
      `Votre demande de valorisation (UE ${v.ue_num}) n’a encore aucune pièce`));
    let d = null;
    try { d = controleDelai({ ueNum: v.ue_num, annee, date_demande: v.date_demande, date_reception: v.date_reception }); } catch { d = null; }
    if (d?.echeance) {
      const k = ecart(auj, d.echeance);
      if (k >= 0 && k <= 3) compter('va', deposer(v.etudiant_id, 'etudiants_va', `va:${v.id}`, 'echeance-J-3',
        `Votre demande de valorisation (UE ${v.ue_num}) doit être complète avant le ${jourFr(d.echeance)}`));
    }
  }

  // ── E6 : LES FRAIS — le solde à J-7 et à J+3 de son échéance. Une fois par jour : calculerFrais coûte. ──
  const cleJour = 'rappels_etudiants_frais_jour';
  const fait = db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(cleJour)?.valeur;
  if (fait !== auj && rappelActif('etudiants_frais')) {
    let inscrits = [];
    try { inscrits = db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ?').all(annee).map(x => x.etudiant_id); } catch { /* */ }
    for (const id of inscrits) {
      if (!qui.has(id)) continue;
      let f = null;
      try { f = calculerFrais(id, annee); } catch { f = null; }
      if (!f || f.sans_frais || !(f.restant > 0) || !f.echeance_solde) continue;
      const ech = String(f.echeance_solde).slice(0, 10), k = ecart(auj, ech);
      if (k >= 0 && k <= 7) compter('frais', deposer(id, 'etudiants_frais', `solde:${annee}:${ech}`, 'J-7',
        `Vos frais ${annee} : le solde est à verser pour le ${jourFr(ech)}`));
      else if (k <= -3 && k >= -30) compter('frais', deposer(id, 'etudiants_frais', `solde:${annee}:${ech}`, 'J+3',
        `Vos frais ${annee} : le solde était à verser pour le ${jourFr(ech)}`));
    }
    db.prepare("INSERT INTO lucie_config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur").run(cleJour, auj);
  }
  return stats;
}

/** L'envoi : un courriel par étudiant et par jour au plus, qui groupe tout ce qui l'attend. `seul` : un essai. */
export async function envoyerAvisEtudiants({ seul = null, a = null } = {}) {
  migrerRappelsEtudiants();
  const { jour, heure } = maintenant();
  if (!seul && (!reglagesRappels().actif || heure < 8 || heure >= 20)) return { envoyes: 0 };
  const attente = db.prepare(`SELECT * FROM rappel_etudiant WHERE envoye_le IS NULL ${seul ? 'AND etudiant_id = ?' : ''}
    ORDER BY etudiant_id, id`).all(...(seul ? [seul] : []));
  const parEtudiant = new Map();
  for (const r of attente) { if (!parEtudiant.has(r.etudiant_id)) parEtudiant.set(r.etudiant_id, []); parEtudiant.get(r.etudiant_id).push(r); }
  const qui = joignables();
  let avisMessages = new Map();
  try { avisMessages = new Map(db.prepare('SELECT etudiant_id, avise_le FROM message_etudiant_avis').all().map(x => [x.etudiant_id, x.avise_le])); } catch { /* */ }
  const marquer = db.prepare("UPDATE rappel_etudiant SET envoye_le = datetime('now'), statut = ? WHERE id = ?");
  let envoyes = 0;
  for (const [id, rs] of parEtudiant) {
    const e = qui.get(id);
    if (!e) { if (!seul) for (const r of rs) marquer.run('sans_espace', r.id); continue; }
    if (!seul) {
      if (db.prepare('SELECT 1 FROM rappel_etudiant_jour WHERE etudiant_id = ? AND jour = ?').get(id, jour)) continue;
      // L'avis des messages est déjà parti aujourd'hui : un seul courriel par jour, le reste attend demain.
      if (String(avisMessages.get(id) || '').slice(0, 10) === new Date().toISOString().slice(0, 10)) continue;
    }
    const html = templateNotif({ titre: 'Votre espace étudiant', corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
      <p>${rs.length > 1 ? 'Des choses vous attendent' : 'Quelque chose vous attend'} dans votre espace à l'Institut Ilya Prigogine :</p>
      <ul style="margin:0;padding-left:18px">${rs.map(r => `<li style="margin:4px 0">${esc(r.titre)}</li>`).join('')}</ul>
      <p><a href="${URL_PUBLIQUE()}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>
      <p style="color:#64748b;font-size:12px">Message automatique de l'institut, au plus un par jour. Le détail est dans votre espace.</p>` });
    const r = await envoyerEmail({ to: a || e.adresse, subject: 'Institut Ilya Prigogine — votre espace étudiant', html })
      .catch(err => ({ ok: false, erreur: err.message }));
    const statut = !r?.ok ? 'echec' : r.simule ? 'simule' : 'envoye';
    if (!r?.ok) { console.error('[rappels étudiants] avis non parti :', r?.erreur); continue; }
    envoyes++;
    if (seul) continue;   // un essai ne consomme rien
    for (const x of rs) marquer.run(statut, x.id);
    db.prepare('INSERT OR IGNORE INTO rappel_etudiant_jour (etudiant_id, jour, nombre, statut) VALUES (?,?,?,?)').run(id, jour, rs.length, statut);
  }
  return { envoyes };
}

/** Ce qui est parti, ou attend (Configuration → Rappels). */
export function historiqueEtudiants(limite = 60) {
  migrerRappelsEtudiants();
  return db.prepare(`SELECT r.id, r.cle, r.titre, r.cree_le, r.envoye_le, r.statut, e.nom, e.prenom
    FROM rappel_etudiant r LEFT JOIN etudiant e ON e.id = r.etudiant_id ORDER BY r.id DESC LIMIT ?`).all(limite);
}

/** Toutes les 30 minutes, en production seulement (la dev redirige tout vers une seule boîte). */
export function planifierAvisEtudiants() {
  migrerRappelsEtudiants();
  if (process.env.NODE_ENV !== 'production') return;
  const tour = () => { if (portailActif()) envoyerAvisEtudiants().catch(e => console.error('[rappels étudiants]', e.message)); };
  setTimeout(tour, 120_000).unref?.();
  setInterval(tour, 30 * 60 * 1000).unref?.();
}

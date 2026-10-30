/**
 * LA DEMANDE DE VALORISATION EN LIGNE, DERRIÈRE LE MUR (3.1.514, Charles, 30 octobre 2026 : « les demandes de VA et le
 * PAE doivent aussi se faire en ligne » ; tranché : la demande quitte Lucie pour le portail, aux règles actuelles,
 * avec un message qui annonce le prix ; l'admission reste au secrétariat).
 *
 * Elle vivait dans Lucie (`routes/portailVA.js`, page publique `/demande-va`) : une porte publique qui écrivait dans
 * la base de Lucie. Désormais l'étudiant agit dans le PORTAIL, qui ne fait que NOTER ses gestes (ouvrir une demande,
 * déposer une pièce, retirer, terminer). Lucie les RELÈVE, les JUGE avec ses propres règles et les écrit elle-même —
 * comme les demandes de lien et de code. En retour, elle DÉPOSE ce que l'étudiant doit voir : les unités qu'il peut
 * demander (avec le prix et l'échéance du RDE) et l'état de ses demandes (la frise, sans le contenu de l'avis ni de la
 * décision avant la notification).
 *
 * Les règles ne changent pas : unités de sa section, valorisables ; une demande par unité ; VA ou VAE ; date du serveur
 * (RDE art. 28) ; pièces lues à leurs premiers octets ; l'étudiant complète tant que la recevabilité n'est pas posée ;
 * chaque geste au journal sous « NOM Prénom (étudiant, en ligne) ».
 *
 * LE CANDIDAT (pas encore d'adresse d'institut) : un code d'accès temporaire, envoyé à l'adresse PRIVÉE du dossier,
 * valable jusqu'à ce que l'adresse d'institut soit encodée et au plus 60 jours, renouvelable par le secrétariat ;
 * il ouvre la demande de VA et les documents (Charles, 30 octobre 2026).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { calculerFrais } from '../routes/fraisScolarite.js';
import { prixDUneUE } from './forfaitVA.js';
import { uniteValorisable, journaliser, rafraichirEtat, controleDelai } from './valorisation.js';
import { sectionRattachement, nommerPreuve, nomLibre, NATURES_PREUVE } from '../routes/etudiants.js';

const DATA_DIR = () => process.env.DATA_DIR || '/app/data';
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const aujourdHui = () => new Date().toISOString().slice(0, 10);
export const anneeActive = () => db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code
  || db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code;

/** Ce que le journal de la valorisation inscrit comme auteur d'un geste venu du portail. */
const auteur = e => ({ user: { id: null, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} (étudiant, en ligne)`.trim(), role: 'etudiant' } });

// ── CE QUE L'ÉTUDIANT PEUT DEMANDER ────────────────────────────────────────
function unitesDeSaSection(e, annee) {
  const sec = sectionRattachement(e.id, annee).section;
  if (!sec) return { section: null, lignes: [] };
  let lignes;
  try {
    lignes = db.prepare(`SELECT u.ue_num, MIN(u.ue_nom) ue_nom FROM ue u
      WHERE u.annee_scolaire = ? AND (u.section = ? OR u.ue_num IN (SELECT ue_num FROM ue_section WHERE section_code = ?))
      GROUP BY u.ue_num ORDER BY u.ue_num`).all(annee, sec, sec);
  } catch {
    lignes = db.prepare(`SELECT ue_num, MIN(ue_nom) ue_nom FROM ue WHERE annee_scolaire = ? AND section = ? GROUP BY ue_num ORDER BY ue_num`).all(annee, sec);
  }
  return { section: sec, lignes: lignes.filter(u => uniteValorisable(u.ue_num, annee).ok) };
}

/** L'offre : chaque unité de sa section, avec son prix (forfait d'analyse) et l'échéance de la demande. */
export function offreVA(e, annee = anneeActive()) {
  const { section, lignes } = unitesDeSaSection(e, annee);
  let fi = {};
  try { fi = calculerFrais(e.id, annee)?.fi_par_ue || {}; } catch { fi = {}; }
  const auPAE = new Set(db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
    .all(e.id, annee).map(x => Number(x.ue_num)));
  const jour = aujourdHui();
  const unites = lignes.map(u => {
    const prix = prixDUneUE(fi[u.ue_num] ?? null);
    const d = controleDelai({ ueNum: u.ue_num, annee, date_demande: jour, date_reception: jour });
    return { ue_num: u.ue_num, ue_nom: u.ue_nom, au_pae: auPAE.has(Number(u.ue_num)), prix: prix.du, calcul: prix.calcul,
      echeance: d?.echeance || null, hors_delai: !!d?.hors_delai };
  }).sort((a, b) => (b.au_pae - a.au_pae) || a.ue_num - b.ue_num);
  return { annee, section, unites, natures: NATURES_PREUVE.filter(n => n.cle !== 'TEST').map(n => ({ cle: n.cle, label: n.label })) };
}

/** L'état de ses demandes, tel que l'étudiant peut le lire : la frise, jamais l'avis ni une décision non notifiée. */
export function etatVA(e, annee = anneeActive()) {
  const v = db.prepare(`SELECT v.*, (SELECT ue_nom FROM ue WHERE ue_num = v.ue_num ORDER BY annee_scolaire DESC LIMIT 1) ue_nom
    FROM etudiant_valorisation v WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num > 0 AND archive_le IS NULL ORDER BY ue_num`).all(e.id, annee);
  const fic = db.prepare('SELECT id, nom, nature, cree_par FROM etudiant_valorisation_fichier WHERE valorisation_id = ? ORDER BY id');
  return v.map(x => {
    const decision = !x.notifie_le ? null : x.decision === 'refusee' ? 'refusée'
      : x.type === 'complete' ? 'accordée — dispense de toute l’unité' : 'accordée — dispense partielle';
    return {
      ue_num: x.ue_num, ue_nom: x.ue_nom, porte: String(x.porte || 'va').toLowerCase(), recue_le: x.date_reception,
      // TANT QUE LE SECRÉTARIAT N'A PAS CONTRÔLÉ, L'ÉTUDIANT COMPLÈTE.
      modifiable: x.recevable == null && !x.decision_le,
      en_ligne: x.mode_introduction === 'en ligne',
      frise: [
        { cle: 'recue', libelle: 'Reçue', fait: true, le: x.date_reception },
        { cle: 'recevable', libelle: x.recevable === 0 ? 'Irrecevable' : 'Recevable', fait: x.recevable === 1, refus: x.recevable === 0, le: x.recevabilite_le },
        { cle: 'avis', libelle: 'Avis', fait: !!x.avis_le },
        { cle: 'decision', libelle: 'Décision', fait: !!x.decision_le },
        { cle: 'notifiee', libelle: 'Notifiée', fait: !!x.notifie_le, le: x.notifie_le },
      ],
      motif_irrecevabilite: x.recevable === 0 ? x.motif_irrecevabilite || null : null,
      decision,
      pieces: fic.all(x.id).map(f => ({ id: f.id, nom: f.nom, nature: f.nature, a_moi: String(f.cree_par || '') === `etudiant:${e.id}` })),
    };
  });
}

// ── LES GESTES RELEVÉS DANS LE PORTAIL ─────────────────────────────────────
/* LE TYPE RÉEL DU FICHIER, PAS CELUI QU'IL ANNONCE : les premiers octets. PDF, images, Word et OpenDocument texte. */
export function typeReel(b) {
  if (!b || b.length < 4) return null;
  const hex = b.toString('hex', 0, 8);
  if (b.toString('latin1', 0, 4) === '%PDF') return { ext: '.pdf', mime: 'application/pdf' };
  if (hex.startsWith('ffd8ff')) return { ext: '.jpg', mime: 'image/jpeg' };
  if (hex.startsWith('89504e47')) return { ext: '.png', mime: 'image/png' };
  if (b.toString('latin1', 0, 4) === 'GIF8') return { ext: '.gif', mime: 'image/gif' };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  if (b.toString('latin1', 4, 8) === 'ftyp') return { ext: '.heic', mime: 'image/heic' };
  if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return { ext: '.tif', mime: 'image/tiff' };
  if (hex.startsWith('504b0304')) return { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (hex.startsWith('d0cf11e0')) return { ext: '.doc', mime: 'application/msword' };
  return null;
}

const saDemande = (e, annee, ue) => db.prepare('SELECT * FROM etudiant_valorisation WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND archive_le IS NULL LIMIT 1')
  .get(e.id, annee, Number(ue));
const examinee = v => v.recevable != null || v.decision_le;

/**
 * Applique UN geste de l'étudiant. `a` : { type, ue_num, porte, fichier_id, nature, nom }, `contenu` : Buffer (pièce).
 * Rend null si tout va bien, sinon la phrase que l'étudiant lira.
 */
export function appliquerGeste(e, a, contenu = null, annee = anneeActive()) {
  const req = auteur(e);
  const ue = Number(a.ue_num);
  if (a.type === 'ouvrir') {
    const porte = String(a.porte || '').toLowerCase();
    if (!['va', 'vae'].includes(porte)) return 'Choisissez VA ou VAE.';
    if (!unitesDeSaSection(e, annee).lignes.some(u => Number(u.ue_num) === ue)) return 'Cette unité ne peut pas être demandée en ligne.';
    if (saDemande(e, annee, ue)) return 'Une demande existe déjà pour cette unité.';
    const jour = aujourdHui();
    const info = db.prepare(`INSERT INTO etudiant_valorisation
        (etudiant_id, annee_scolaire, ue_num, type, porte, decision, date_demande, date_reception, mode_introduction)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(e.id, annee, ue, 'partielle', porte, 'accordee', jour, jour, 'en ligne');
    journaliser(info.lastInsertRowid, 'introduction', req, `demande introduite en ligne par l'étudiant (portail) · ${porte}`);
    rafraichirEtat(info.lastInsertRowid);
    return null;
  }
  const v = saDemande(e, annee, ue);
  if (!v) return 'Demande introuvable.';
  if (examinee(v)) return 'Le secrétariat a déjà examiné cette demande : pour la compléter, adressez-vous à lui.';
  if (a.type === 'retirer') {
    if (v.mode_introduction !== 'en ligne') return 'Cette demande a été encodée par le secrétariat : adressez-vous à lui.';
    const fics = db.prepare('SELECT chemin FROM etudiant_valorisation_fichier WHERE valorisation_id = ?').all(v.id);
    journaliser(v.id, 'introduction', req, "demande retirée en ligne par l'étudiant (portail), avant tout examen");
    db.prepare('DELETE FROM etudiant_valorisation_fichier WHERE valorisation_id = ?').run(v.id);
    db.prepare('DELETE FROM etudiant_valorisation WHERE id = ?').run(v.id);
    for (const f of fics) { try { fs.unlinkSync(f.chemin); } catch { /* déjà parti */ } }
    return null;
  }
  if (a.type === 'piece') {
    const t = typeReel(contenu);
    if (!t) return "Ce fichier n'est pas un PDF, une image ou un document Word valable.";
    if (contenu.length > 25 * 1024 * 1024) return 'Fichier trop lourd (25 Mo au plus).';
    const nature = NATURES_PREUVE.some(n => n.cle === String(a.nature || '').toUpperCase()) ? String(a.nature).toUpperCase() : 'AUT';
    const original = String(a.nom || `piece${t.ext}`).replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const dir = path.join(DATA_DIR(), 'valorisations', String(v.id));
    fs.mkdirSync(dir, { recursive: true });
    const chemin = path.join(dir, `${Date.now()}_${original}`);
    fs.writeFileSync(chemin, contenu);
    const nom = nomLibre(v.id, nommerPreuve(nature, e, v, original.includes('.') ? original : original + t.ext));
    db.prepare(`INSERT INTO etudiant_valorisation_fichier (valorisation_id, nom, chemin, taille, type_mime, nature, cree_par)
      VALUES (?,?,?,?,?,?,?)`).run(v.id, nom, chemin, contenu.length, t.mime, nature, `etudiant:${e.id}`);
    journaliser(v.id, 'introduction', req, `pièce déposée en ligne (portail) : ${nom}`);
    return null;
  }
  if (a.type === 'retirer_piece') {
    const f = db.prepare('SELECT * FROM etudiant_valorisation_fichier WHERE id = ? AND valorisation_id = ?').get(Number(a.fichier_id), v.id);
    if (!f || f.cree_par !== `etudiant:${e.id}`) return 'Pièce introuvable (seules les vôtres se retirent).';
    db.prepare('DELETE FROM etudiant_valorisation_fichier WHERE id = ?').run(f.id);
    try { fs.unlinkSync(f.chemin); } catch { /* */ }
    journaliser(v.id, 'introduction', req, `pièce retirée en ligne (portail) : ${f.nom}`);
    return null;
  }
  return 'Geste inconnu.';
}

/** « J'ai terminé » : l'accusé de réception, avec le prix, à l'adresse d'école (sinon privée). */
export async function accuserReception(e, annee = anneeActive()) {
  const d = etatVA(e, annee).filter(x => x.en_ligne);
  if (!d.length) return 'Aucune demande à confirmer.';
  const reference = `VA-${String(annee).replace(/^20(\d\d)-20(\d\d)$/, '$1$2')}-${e.id_ecampus || e.id}`;
  const quand = new Date().toLocaleString('fr-BE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Brussels' });
  const lignes = d.map(x => `<li><b>UE ${x.ue_num}</b> ${esc(x.ue_nom || '')} — ${x.porte === 'vae' ? 'VAE' : 'VA'} — ${x.pieces.length} pièce(s)</li>`).join('');
  let forfait = null;
  try { forfait = calculerFrais(e.id, annee)?.forfait_va || null; } catch { forfait = null; }
  const eur = n => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
  const phraseForfait = forfait?.du ? `<p>L’analyse d’une demande de valorisation demande un travail d’examen du dossier : des frais
    d’analyse de <b>${eur(forfait.du)}</b> s’ajoutent à vos frais de l’année (${esc(forfait.demandes.filter(x => !x.exoneree).map(x => `${x.nature === 'admission' ? 'admission' : `UE ${x.ue_num}`} : ${x.calcul}`).join(' ; '))}).
    Ils sont dus dès la demande, quelle que soit la décision.</p>` : '';
  const adresse = e.email_ecole || e.email_perso;
  if (!adresse) return null;
  const html = templateNotif({ titre: `Accusé de réception — ${reference}`, corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
    <p>Votre demande de valorisation des acquis est enregistrée (${esc(quand)}) :</p><ul>${lignes}</ul>
    <p>La suite se fait à l'école : le secrétariat vérifie que le dossier est complet et dans les délais, les chargés de cours
    rendent leur avis, le Conseil des études décide. La décision vous est notifiée par écrit.</p>
    ${phraseForfait}
    <p>Tant que le secrétariat n'a pas examiné une unité, vous pouvez la compléter depuis votre espace étudiant.</p>` });
  await envoyerEmail({ to: adresse, subject: `Institut Ilya Prigogine — accusé de réception ${reference}`, html }).catch(() => {});
  return null;
}

// ── LE CANDIDAT : UN CODE D'ACCÈS TEMPORAIRE ───────────────────────────────
export function migrerCandidat(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS portail_candidat (etudiant_id INTEGER PRIMARY KEY, code_hash TEXT NOT NULL,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')), jusqu_au TEXT NOT NULL, envoye_a TEXT, par TEXT)`);
}
const JOURS_CANDIDAT = 60;
/* Même empreinte que les mots de passe du portail : c'est lui qui vérifie. */
const hacher = mdp => { const sel = crypto.randomBytes(16); return `scrypt$${sel.toString('base64')}$${crypto.scryptSync(String(mdp), sel, 64).toString('base64')}`; };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ni 0/O ni 1/I/L : il se recopie d'un courriel
const nouveauCode = () => Array.from({ length: 10 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('').replace(/^(.{5})/, '$1-');

/** Les étudiants qui peuvent recevoir un code : actifs, non archivés, sans adresse d'institut, avec une adresse privée. */
const candidatPossible = id => db.prepare(`SELECT * FROM etudiant WHERE id = ? AND COALESCE(actif, 1) = 1
  AND COALESCE(sortie_statut, '') <> 'archive' AND COALESCE(email_ecole, '') NOT LIKE '%@%' AND email_perso LIKE '%@%'`).get(Number(id));

/** Fabrique et envoie un code (le précédent cesse de valoir). Rend { jusqu_au } ou { erreur }. */
export async function envoyerCodeCandidat(etudiantId, par, urlPortail) {
  migrerCandidat();
  const e = candidatPossible(etudiantId);
  if (!e) return { erreur: "Un code ne s'envoie qu'à un étudiant actif sans adresse de l'institut, avec une adresse privée." };
  const code = nouveauCode();
  const jusqu = new Date(Date.now() + JOURS_CANDIDAT * 86400e3).toISOString().slice(0, 10);
  const html = templateNotif({ titre: 'Votre accès à votre espace', corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
    <p>Votre dossier est ouvert à l'Institut Ilya Prigogine. En attendant votre adresse électronique de l'institut, voici votre
    <b>code d'accès</b> à votre espace étudiant — pour y introduire une demande de valorisation des acquis et y retrouver vos documents :</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
    <p>Il vaut jusqu'au ${jusqu.split('-').reverse().join('/')}, ou jusqu'à ce que vous receviez votre adresse de l'institut.
    Sur la page de connexion, choisissez « Pas encore d'adresse de l'institut ? », puis tapez cette adresse-ci et le code.</p>
    <p><a href="${esc(urlPortail)}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>
    <p style="color:#64748b;font-size:12px">Ne communiquez ce code à personne. Vous ne l'avez pas demandé ? Signalez-le au secrétariat.</p>` });
  const r = await envoyerEmail({ to: e.email_perso, subject: 'Institut Ilya Prigogine — votre code d’accès à votre espace', html })
    .catch(err => ({ ok: false, erreur: err.message }));
  if (!r?.ok) return { erreur: `Le courriel n'est pas parti : ${r?.erreur || 'erreur inconnue'}.` };
  if (r?.simule && process.env.NODE_ENV !== 'production') console.log(`[portail] code candidat (courriel simulé) : ${code}`);
  db.prepare(`INSERT INTO portail_candidat (etudiant_id, code_hash, jusqu_au, envoye_a, par) VALUES (?,?,?,?,?)
    ON CONFLICT(etudiant_id) DO UPDATE SET code_hash = excluded.code_hash, cree_le = datetime('now'), jusqu_au = excluded.jusqu_au,
      envoye_a = excluded.envoye_a, par = excluded.par`).run(e.id, hacher(code), jusqu, e.email_perso, par);
  return { ok: true, jusqu_au: jusqu, adresse: e.email_perso };
}

/** DÈS QU'UN ÉTUDIANT EST INSCRIT DANS LUCIE (Charles) — pour ceux créés depuis la mise en service seulement : sans quoi
 *  la première nuit écrirait à tous les anciens dossiers sans adresse d'institut. */
export async function codesDOffice(urlPortail) {
  migrerCandidat();
  let depuis = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'portail_candidat_depuis'").get()?.valeur;
  if (!depuis) {
    depuis = db.prepare("SELECT datetime('now') d").get().d;
    db.prepare("INSERT OR IGNORE INTO lucie_config (cle, valeur) VALUES ('portail_candidat_depuis', ?)").run(depuis);
  }
  const l = db.prepare(`SELECT id FROM etudiant WHERE cree_le >= ? AND COALESCE(actif, 1) = 1 AND COALESCE(sortie_statut, '') <> 'archive'
    AND COALESCE(email_ecole, '') NOT LIKE '%@%' AND email_perso LIKE '%@%'
    AND id NOT IN (SELECT etudiant_id FROM portail_candidat) LIMIT 50`).all(depuis);
  for (const x of l) await envoyerCodeCandidat(x.id, 'Lucie (inscription)', urlPortail);
}

/** Les candidats dont le code vaut encore (et toujours sans adresse d'institut) : déposés au portail. */
export function candidatsValides() {
  migrerCandidat();
  return db.prepare(`SELECT e.id, e.nom, e.prenom, e.email_perso, e.id_ecampus, c.code_hash, c.jusqu_au
    FROM portail_candidat c JOIN etudiant e ON e.id = c.etudiant_id
    WHERE c.jusqu_au >= date('now') AND COALESCE(e.actif, 1) = 1 AND COALESCE(e.sortie_statut, '') <> 'archive'
      AND COALESCE(e.email_ecole, '') NOT LIKE '%@%' AND e.email_perso LIKE '%@%'`).all();
}

export function candidatDe(etudiantId) {
  migrerCandidat();
  return db.prepare('SELECT cree_le, jusqu_au, envoye_a, par FROM portail_candidat WHERE etudiant_id = ?').get(Number(etudiantId)) || null;
}

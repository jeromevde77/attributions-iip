// ─────────────────────────────────────────────────────────────────────────────
// LA DEMANDE D'AMÉNAGEMENT RAISONNABLE DEPUIS L'ESPACE DE L'ÉTUDIANT (3.5.235, Charles, 8 novembre 2026 : « qu'un étudiant puisse
// compléter la demande d'aménagement raisonnable, annexe 1, depuis son espace si le délai est ok ; sinon noter : contacter Madame
// Audrey Perez, et un champ d'envoi de message à Audrey »).
//
// LE DÉLAI (circulaire 9448 du 28/02/2025 ; AGCF du 5 juillet 2017, art. 4 § 1er ; décret du 30 juin 2016, art. 6) : la demande se
// remet à la personne de référence AU MOINS 10 JOURS OUVRABLES AVANT L'OUVERTURE de l'unité visée (ouvrables : tous les jours sauf le
// dimanche et les jours fériés légaux ; « le délai commence à courir à J-1 et expire à J-10 ») ; pour plusieurs unités, la première
// qui ouvre. C'est un délai d'ORDRE, pas de rigueur : au-delà, la demande reste recevable sur circonstances exceptionnelles
// (inscription, diagnostic, évolution du handicap) — elle passe alors par la personne de référence, que l'étudiant contacte.
//
// La demande en ligne est la PARTIE A (cadre A) : unités, aménagements demandés, soins spécifiques, difficultés, la pièce (nature,
// date, auteur, et le fichier) ; datée et « signée » par l'étudiant au dépôt. Lucie crée le dossier de l'année (statut « demande »),
// prévient la personne de référence, qui le reprend comme tout dossier (accusé de réception, cadre B…). La pièce est gardée dans
// DATA_DIR/amenagements (secret professionnel : seuls ceux qui instruisent les aménagements l'ouvrent).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import db from '../db/index.js';
import { catalogueAR } from './circuitAR.js';
import { joursFeriesLegaux } from '../routes/horaire.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const essai = (f, d) => { try { return f(); } catch { return d; } };

export function migrerARPortail(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS amenagement_fichier (
      id INTEGER PRIMARY KEY AUTOINCREMENT, dossier_id INTEGER NOT NULL, nom TEXT, mime TEXT, chemin TEXT NOT NULL,
      depose_par TEXT, depose_le TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS amenagement_message (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL, annee_scolaire TEXT, texte TEXT NOT NULL,
      recu_le TEXT DEFAULT (datetime('now')), lu_le TEXT, lu_par TEXT);`);
}
try { migrerARPortail(); } catch (e) { console.error('[migration] AR en ligne :', e.message); }

/** La personne de référence : réglée (lucie_config « amenagement_referente » : { user_id, nom }), sinon le compte d'Audrey Perez. */
export function referente() {
  const r = essai(() => JSON.parse(db.prepare(`SELECT valeur FROM lucie_config WHERE cle = 'amenagement_referente'`).get()?.valeur || 'null'), null);
  let u = r?.user_id ? essai(() => db.prepare('SELECT id, nom_complet, email FROM utilisateur WHERE id = ?').get(r.user_id), null) : null;
  if (!u) u = essai(() => db.prepare(`SELECT id, nom_complet, email FROM utilisateur WHERE COALESCE(actif, 1) = 1
      AND (lower(nom_complet) LIKE '%perez%' OR lower(email) LIKE '%perez%') ORDER BY id LIMIT 1`).get(), null);
  return { user_id: u?.id || null, nom: r?.nom || 'Madame Audrey Perez', email: u?.email || null };
}

/** J-10 jours ouvrables (dimanches et fériés légaux exclus) avant l'ouverture `j` (AAAA-MM-JJ). */
export function limiteAR(j) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(j || ''))) return null;
  const d = new Date(`${String(j).slice(0, 10)}T12:00:00Z`);
  let n = 0;
  while (n < 10) {
    d.setUTCDate(d.getUTCDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === 0 || joursFeriesLegaux(d.getUTCFullYear()).has(iso)) continue;
    n++;
  }
  return d.toISOString().slice(0, 10);
}
const aujourdhui = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Brussels' }).format(new Date());

/** Ce que l'espace montre : les unités du programme, leur ouverture et leur limite, le catalogue des mesures, le dossier de l'année. */
export function offreAR(e, annee) {
  const jour = aujourdhui();
  const ues = essai(() => db.prepare(`SELECT i.ue_num, COALESCE(i.num_organisation, 1) AS org,
      (SELECT u.ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire LIMIT 1) AS ue_nom,
      (SELECT MIN(o.date_debut) FROM organisation_ue o WHERE o.ue_num = i.ue_num AND o.annee_scolaire = i.annee_scolaire
         AND COALESCE(o.num_organisation, 1) = COALESCE(i.num_organisation, 1)) AS ouverture,
      (SELECT MIN(o.date_debut) FROM organisation_ue o WHERE o.ue_num = i.ue_num AND o.annee_scolaire = i.annee_scolaire) AS ouverture_ue
    FROM etudiant_inscription i WHERE i.etudiant_id = ? AND i.annee_scolaire = ? AND i.resultat IS NULL ORDER BY i.ue_num`).all(e.id, annee), [])
    .map(u => { const o = u.ouverture || u.ouverture_ue || null; const l = limiteAR(o); return { ue_num: u.ue_num, ue_nom: u.ue_nom || '', ouverture: o, limite: l, dans_delai: !!(l && jour <= l) }; });
  const d = essai(() => db.prepare('SELECT * FROM amenagement_dossier WHERE etudiant_id = ? AND annee_scolaire = ?').get(e.id, annee), null);
  const dossier = d ? {
    statut: d.statut, date_demande: d.date_demande, en_ligne: /en ligne/.test(String(d.cree_par || '')),
    ues: essai(() => db.prepare('SELECT ue_num FROM amenagement_ue WHERE dossier_id = ?').all(d.id).map(x => x.ue_num), []),
    // Les mesures accordées ne se disent qu'une fois la décision notifiée.
    mesures: d.notifie_le ? essai(() => db.prepare('SELECT libelle, precisions, accorde, motif_refus FROM amenagement_mesure WHERE dossier_id = ? ORDER BY id').all(d.id), []) : [],
    notifie_le: d.notifie_le || null,
  } : null;
  const ref = referente();
  return { annee, referente: { nom: ref.nom }, ues, mesures: catalogueAR(), dossier, aujourdhui: jour };
}

/** La demande déposée en ligne (cadre A). Rend { ok } ou { erreur }. */
export function demandeEnLigne(e, annee, x, fichier) {
  const ref = referente();
  const o = offreAR(e, annee);
  if (o.dossier) return { erreur: `Un dossier d'aménagement existe déjà pour ${annee} : écrivez à ${ref.nom}.` };
  const choisies = [...new Set((Array.isArray(x.ues) ? x.ues : []).map(Number))].filter(n => o.ues.some(u => u.ue_num === n));
  if (!choisies.length) return { erreur: 'Cochez au moins une unité.' };
  const hors = choisies.map(n => o.ues.find(u => u.ue_num === n)).filter(u => !u.dans_delai);
  if (hors.length) return { erreur: `Le délai est dépassé pour l'UE ${hors.map(u => u.ue_num).join(', ')} (10 jours ouvrables avant son ouverture) : contactez ${ref.nom}.` };
  const codes = new Map(o.mesures.map(m => [m.code, m]));
  const mesures = [...new Set(Array.isArray(x.mesures) ? x.mesures : [])].map(c => codes.get(c)).filter(Boolean);
  const autres = String(x.autres || '').trim().slice(0, 1000);
  if (!mesures.length && !autres) return { erreur: 'Indiquez au moins un aménagement demandé.' };
  const besoins = String(x.besoins || '').trim().slice(0, 3000);
  if (!besoins) return { erreur: 'Décrivez les difficultés qui entravent votre parcours.' };
  const pieceType = ['probant', 'rapport_specialiste'].includes(x.piece_type) ? x.piece_type : null;
  if (!pieceType) return { erreur: 'Indiquez la pièce produite à l’appui : document probant ou rapport de spécialiste.' };
  if (!fichier?.buffer?.length) return { erreur: 'Joignez la pièce (PDF ou photo).' };
  const nomE = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
  const par = `${nomE} (étudiant, en ligne)`;
  const jour = aujourdhui();
  const id = db.transaction(() => {
    const dossierId = Number(db.prepare(`INSERT INTO amenagement_dossier (etudiant_id, annee_scolaire, statut, date_demande, personne_reference, besoins,
        soins_specifiques, piece_type, piece_date, piece_auteur, signe_etudiant_le, annexes_nb, annexes_desc, cree_par)
      VALUES (?,?, 'demande', ?,?,?,?,?,?,?,?,?,?,?)`).run(e.id, annee, jour, ref.nom.replace(/^Madame |^Monsieur /, ''), besoins,
      String(x.soins || '').trim().slice(0, 2000) || null, pieceType, /^\d{4}-\d{2}-\d{2}$/.test(String(x.piece_date || '')) ? x.piece_date : null,
      String(x.piece_auteur || '').trim().slice(0, 200) || null, jour, 1, `pièce déposée en ligne : ${String(fichier.nom || 'piece').slice(0, 120)}`, par).lastInsertRowid);
    const iu = db.prepare('INSERT OR IGNORE INTO amenagement_ue (dossier_id, ue_num) VALUES (?,?)');
    for (const n of choisies) iu.run(dossierId, n);
    const im = db.prepare('INSERT INTO amenagement_mesure (dossier_id, code, nature, libelle, precisions) VALUES (?,?,?,?,?)');
    for (const m of mesures) im.run(dossierId, m.code, m.nature, m.libelle, null);
    if (autres) im.run(dossierId, null, null, 'Autre aménagement demandé', autres);
    const dir = path.join(DATA_DIR, 'amenagements', String(dossierId));
    fs.mkdirSync(dir, { recursive: true });
    const ext = fichier.mime === 'application/pdf' ? 'pdf' : fichier.mime === 'image/png' ? 'png' : 'jpg';
    const chemin = path.join(dir, `piece-${Date.now()}.${ext}`);
    fs.writeFileSync(chemin, fichier.buffer);
    db.prepare('INSERT INTO amenagement_fichier (dossier_id, nom, mime, chemin, depose_par) VALUES (?,?,?,?,?)').run(dossierId, String(fichier.nom || 'piece').slice(0, 150), fichier.mime, chemin, par);
    return dossierId;
  })();
  prevenir(ref, `Demande d'aménagement raisonnable en ligne — ${nomE}`, `Unités ${choisies.join(', ')} ; ${mesures.length + (autres ? 1 : 0)} aménagement(s) demandé(s) ; pièce jointe.`, par);
  /* LA COORDINATION DE SA SECTION EST PRÉVENUE (3.5.393) — sans la nature de la difficulté (secret professionnel, art. 5). */
  try {
    const section = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(e.id)?.s || null;
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, section, cree_par) VALUES ('amenagement_en_ligne', ?, ?, '/', 'coordination', ?, ?)`)
      .run(`Demande d'aménagement raisonnable — ${nomE}`, `Unités ${choisies.join(', ')} : la personne de référence instruit la demande.`, section, par);
  } catch { /* la notification ne bloque pas */ }
  return { ok: true, id, resultat: `Demande reçue le ${jour.split('-').reverse().join('/')}. ${ref.nom} la prend en charge et vous adresse l'accusé de réception.` };
}

/** Le message à la personne de référence (hors délai, ou une question). */
export function messageAR(e, annee, texte) {
  const t = String(texte || '').trim().slice(0, 3000);
  if (!t) return { erreur: 'Le message est vide.' };
  const ref = referente();
  const nomE = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
  db.prepare('INSERT INTO amenagement_message (etudiant_id, annee_scolaire, texte) VALUES (?,?,?)').run(e.id, annee, t);
  prevenir(ref, `Aménagement raisonnable — message de ${nomE}`, t.slice(0, 280), `${nomE} (étudiant, en ligne)`);
  return { ok: true, resultat: `Message transmis à ${ref.nom}. Elle vous répondra dans vos messages.` };
}

function prevenir(ref, titre, corps, par) {
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cible_role, cree_par) VALUES ('amenagement_en_ligne', ?, ?, '/etudiants?onglet=amenagements', ?, ?, ?)`)
      .run(titre, corps, ref.user_id, ref.user_id ? null : 'secretariat', par);
  } catch { /* la notification ne bloque pas */ }
}

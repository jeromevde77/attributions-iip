// ─────────────────────────────────────────────────────────────────────────────
// LUCIE ET LE PORTAIL DES ÉTUDIANTS — LE PASSAGE À SENS UNIQUE (3.1.477, Charles, 30 octobre 2026 : « un mur
// de Berlin infranchissable entre la version de Lucie pour les MDP et la version accessible aux étudiants »).
//
// Le portail (dossier `portail/`, etudiants.lucie-iip.be) n'a ni la base de Lucie, ni ses clés, ni son courriel,
// et il ne peut pas l'appeler. C'est Lucie qui va vers lui, sur son port INTERNE (réseau Docker, jeton partagé
// `PORTAIL_JETON`), toutes les dix secondes :
//
//   RELEVER   — les demandes (« lien », « code ») : Lucie VÉRIFIE (l'étudiant existe, est actif, a une adresse
//               d'école ; le lien commence par l'adresse publique du portail ; le code a six chiffres) et COMPOSE
//               elle-même le courriel — le portail ne fournit jamais un texte ni une adresse. Puis les accusés et
//               les connexions, recopiés ici (`portail_accuse`, `portail_connexion`) après contrôle : la fiche les lit.
//   DÉPOSER   — toutes les deux minutes : les étudiants (actifs, non archivés, avec adresse d'école) et leurs
//               matricules, leurs résultats PUBLIÉS, les règlements destinés aux étudiants ; et, au fil de l'eau,
//               les PDF des pièces qu'on leur a envoyées (copie conservée de l'envoi), vingt par passage.
//
// Rien de plus ne passe le mur. Sans `PORTAIL_INTERNE_URL` ni `PORTAIL_JETON`, rien ne tourne.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { copieDeLEnvoi } from '../routes/envois.js';
import { deposerDOffice } from './depotEspace.js';
import { piecesATransmettre, marquerTransmises } from './authentique.js';
import { derniereVersion, versionReference } from '../routes/documentation.js';
import { aDeposer as messagesADeposer, recevoir as recevoirMessages, aviserParCourriel } from './messagesEtudiants.js';
import { parcoursPortail, fraisPortail } from './portailEspace.js';
import { offrePAE, deposerProposition, recevoirSignature, signatureDe } from './paeEnLigne.js';
import { fonctionsEspace, fonctionPour, fonctionOuverte } from './fonctions.js';
import { offreVA, etatVA, appliquerGeste, accuserReception, codesDOffice, candidatsValides, candidatDe, anneeActive as anneeVA } from './portailValorisation.js';

const URL_INTERNE = () => (process.env.PORTAIL_INTERNE_URL || '').replace(/\/$/, '');
const JETON = () => process.env.PORTAIL_JETON || '';
const URL_PUBLIQUE = () => (process.env.PORTAIL_URL_PUBLIQUE || 'https://etudiants.lucie-iip.be').replace(/\/$/, '');
export const portailActif = () => !!URL_INTERNE() && JETON().length >= 32;
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function migrerPortail(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS portail_accuse (
      id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
      objet_type TEXT NOT NULL CHECK (objet_type IN ('envoi','reglement')), objet_id INTEGER NOT NULL,
      presente_le TEXT, signe_le TEXT, ip TEXT, agent TEXT, recu_le TEXT DEFAULT (datetime('now')),
      UNIQUE (etudiant_id, objet_type, objet_id));
    CREATE TRIGGER IF NOT EXISTS portail_accuse_signe_fige BEFORE UPDATE OF signe_le ON portail_accuse
      WHEN OLD.signe_le IS NOT NULL BEGIN SELECT RAISE(IGNORE); END;
    CREATE TRIGGER IF NOT EXISTS portail_accuse_sans_effacement BEFORE DELETE ON portail_accuse
      WHEN OLD.signe_le IS NOT NULL BEGIN SELECT RAISE(ABORT, 'Un accusé signé ne s''efface pas.'); END;
    CREATE TABLE IF NOT EXISTS portail_connexion (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
      le TEXT, ip TEXT, ref_portail INTEGER UNIQUE);
    -- L'ACCÈS HORS DE BELGIQUE (3.1.513, Charles : « bloquer, avec une exception accordée par le secrétariat pour une
    -- période — stage, Erasmus »). Une ligne par ouverture, en ajout : on la retire, on ne l'efface pas.
    CREATE TABLE IF NOT EXISTS portail_exception (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
      jusqu_au TEXT NOT NULL, motif TEXT NOT NULL, par TEXT, le TEXT NOT NULL DEFAULT (datetime('now')),
      retire_le TEXT, retire_par TEXT);
  `);
}

async function lireBinaire(chemin) {
  const r = await fetch(`${URL_INTERNE()}${chemin}`, { headers: { 'X-Portail-Jeton': JETON() }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function appel(methode, chemin, corps) {
  const r = await fetch(`${URL_INTERNE()}${chemin}`, {
    method: methode, headers: { 'X-Portail-Jeton': JETON(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`portail ${chemin} : ${r.status}`);
  return r.json();
}

const colonnes = t => { try { return db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name); } catch { return []; } };
const anneeActive = () => db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code
  || db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code;

/** Les étudiants que le portail connaît : actifs, non archivés, avec une adresse d'école. */
function etudiantsVisibles() {
  const l = db.prepare(`SELECT id, nom, prenom, email_ecole, id_ecampus FROM etudiant
    WHERE COALESCE(actif, 1) = 1 AND COALESCE(sortie_statut, '') <> 'archive' AND email_ecole LIKE '%@%'`).all();
  let autres = [];
  try { autres = db.prepare('SELECT etudiant_id, id_ecampus FROM etudiant_matricule').all(); } catch { /* table absente */ }
  const parId = new Map();
  for (const a of autres) { if (!parId.has(a.etudiant_id)) parId.set(a.etudiant_id, []); parId.get(a.etudiant_id).push(a.id_ecampus); }
  // LES FONCTIONS (3.5.001) : seul entre dans l'espace l'étudiant pour qui au moins une fonction est ouverte
  // (allumée, ou en essai et désigné) ; l'espace ne lui montre que celles-là.
  return l.map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, email_ecole: e.email_ecole, fonctions: fonctionsEspace(e.id),
    matricules: [...new Set([e.id_ecampus, ...(parId.get(e.id) || [])].filter(Boolean))] })).filter(e => e.fonctions.length);
}

/** Les résultats PUBLIÉS : séance close (de son organisation, ou « toute l'unité »), ou année antérieure. Jamais une note de travail. */
export function resultatsPublies(ids) {
  const annee = anneeActive();
  const cs = colonnes('deliberation_seance');
  const ci = colonnes('etudiant_inscription');
  const orgSql = cs.includes('num_organisation') && ci.includes('num_organisation')
    ? 'AND (COALESCE(s.num_organisation, 0) = 0 OR s.num_organisation = COALESCE(i.num_organisation, 0))' : '';
  const voulus = new Set(ids);
  const out = [];
  for (const l of db.prepare(`SELECT i.etudiant_id, i.annee_scolaire, i.ue_num, i.resultat, i.points,
      (SELECT ue_nom FROM ue WHERE ue_num = i.ue_num AND annee_scolaire = i.annee_scolaire LIMIT 1) ue_nom,
      EXISTS (SELECT 1 FROM deliberation_seance s WHERE s.ue_num = i.ue_num AND s.annee_scolaire = i.annee_scolaire
              AND s.cloturee = 1 ${orgSql}) AS close
    FROM etudiant_inscription i WHERE i.resultat IS NOT NULL`).all()) {
    if (!voulus.has(l.etudiant_id) || !(l.close || l.annee_scolaire < annee)) continue;
    const reussi = l.resultat === 'reussi';
    out.push({ etudiant_id: l.etudiant_id, annee: l.annee_scolaire, ue_num: l.ue_num, ue_nom: l.ue_nom,
      decision: { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé' }[l.resultat] || l.resultat,
      // NA sous 10 (circulaire Sanction des études) ; une faveur vaut 10.
      note: reussi ? (l.points != null ? String(Math.max(10, Math.round(Number(l.points)))) : '—') : 'NA',
      etat: reussi ? 'reussi' : l.resultat === 'ajourne' ? 'surveiller' : 'corriger' });
  }
  try {
    for (const v of db.prepare(`SELECT etudiant_id, annee_scolaire, ue_num,
        (SELECT ue_nom FROM ue WHERE ue_num = v.ue_num ORDER BY annee_scolaire DESC LIMIT 1) ue_nom
      FROM etudiant_valorisation v WHERE type = 'complete' AND ue_num > 0 AND decision_le IS NOT NULL
        AND COALESCE(decision, 'accordee') <> 'refusee'`).all()) {
      if (voulus.has(v.etudiant_id)) out.push({ etudiant_id: v.etudiant_id, annee: v.annee_scolaire, ue_num: v.ue_num, ue_nom: v.ue_nom, decision: 'Valorisé (VA)', note: 'VA', etat: 'reussi' });
    }
  } catch { /* pas de valorisations */ }
  return out;
}

function reglementsEtudiants() {
  try {
    return db.prepare(`SELECT d.id, d.cle, d.titre, d.source_url FROM corpus_document d
        JOIN corpus_destinataire t ON t.document_id = d.id AND t.role = 'etudiant' WHERE d.retire_le IS NULL`).all()
      .map(d => {
        const v = derniereVersion(d.id); const ref = versionReference(d.id);
        if (!v) return null;
        const valables = db.prepare('SELECT id FROM corpus_version WHERE document_id = ? AND numero >= ?').all(d.id, ref?.numero || v.numero).map(x => x.id);
        return { version_id: v.id, cle: d.cle, titre: d.titre, numero: v.numero, publiee_le: v.publiee_le, contenu: v.contenu,
          source_url: d.source_url || null, valables };
      }).filter(Boolean);
  } catch { return []; }
}

/** Un étudiant que le portail connaît : visible (adresse d'institut) ou candidat dont le code vaut encore. */
function etudiantDuPortail(id) {
  const e = db.prepare(`SELECT * FROM etudiant WHERE id = ? AND COALESCE(actif, 1) = 1 AND COALESCE(sortie_statut, '') <> 'archive'`).get(Number(id));
  if (!e) return null;
  if (String(e.email_ecole || '').includes('@')) return e;
  return candidatsValides().some(c => c.id === e.id) ? e : null;
}

/** L'offre et l'état des valorisations, pour les étudiants nommés (ceux qui sont venus, ou qui viennent d'agir). */
async function deposerVA(ids) {
  const annee = anneeVA();
  const lots = [];
  for (const id of ids) {
    const e = etudiantDuPortail(id);
    if (!e) continue;
    try {
      const f = new Set(fonctionsEspace(e.id));
      lots.push({ etudiant_id: e.id, offre: f.has('va') ? offreVA(e, annee) : null, etat: f.has('va') ? etatVA(e, annee) : [],
        pae: !f.has('pae') ? null : offrePAE(e),
        parcours: !f.has('parcours') ? null : parcoursPortail(e, annee), frais: f.has('frais') ? await fraisPortail(e, annee) : null });
    }
    catch (x) { console.error(`[portail] VA de l'étudiant ${e.id} :`, x.message); }
  }
  if (lots.length) await appel('POST', '/interne/va', { lots });
}

// ── RELEVER ────────────────────────────────────────────────────────────────
async function relever() {
  const r = await appel('GET', '/interne/releve');
  const ok = { demandes: [], accuses: [], connexions: [], entrees: [], va: [], pae: [], messages_lus: [], messages_reponses: [] };
  // Le candidat reçoit ses codes à son adresse privée, tant que son accès vaut (3.5.008).
  const etudiant = id => etudiantDuPortail(id);
  for (const d of r.demandes || []) {
    ok.demandes.push(d.id);   // relevée, même refusée : elle ne doit pas revenir à chaque passage
    const e = etudiant(d.etudiant_id);
    if (!e) continue;
    let html, sujet;
    if (d.type === 'lien') {
      const lien = String(d.valeur || '');
      if (!lien.startsWith(`${URL_PUBLIQUE()}/?jeton=`) || !/^[A-Za-z0-9_-]{20,80}$/.test(lien.split('jeton=')[1] || '')) {
        console.error(`[portail] lien refusé pour l'étudiant ${e.id} : il ne vient pas du portail.`); continue;
      }
      sujet = 'Institut Ilya Prigogine — votre lien d’accès à votre espace';
      html = templateNotif({ titre: 'Votre espace étudiant', corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
        <p>Voici votre lien pour votre espace à l'Institut Ilya Prigogine : vos résultats délibérés, vos documents, vos accusés de réception.
        Il est valable 30 minutes et ne sert qu'une fois : il vous mène à <b>choisir votre mot de passe</b>. Ensuite, vous entrez avec
        votre adresse de l'institut et ce mot de passe.</p>
        <p><a href="${esc(lien)}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>
        <p style="color:#64748b;font-size:12px">Vous n'avez rien demandé ? Ignorez ce message : sans ce lien, personne n'accède à votre espace.</p>` });
    } else if (d.type === 'code') {
      if (!String(e.email_ecole || '').includes('@') && !String(e.email_perso || '').includes('@')) continue;
      if (!/^\d{6}$/.test(String(d.valeur || ''))) continue;
      sujet = `Institut Ilya Prigogine — votre code ${d.valeur}`;
      html = templateNotif({ titre: 'Votre code', corps: `<p>Votre code pour votre espace — entrer depuis un nouvel appareil,
        signer un accusé de réception, confirmer votre PAE, ou télécharger un document de plus de 90 jours :</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${d.valeur}</p><p>Il est valable 10 minutes.</p>
        <p style="color:#64748b;font-size:12px">Vous n'avez rien demandé ? Ne communiquez ce code à personne.</p>` });
    } else continue;
    if (d.type === 'lien' && !String(e.email_ecole || '').includes('@')) continue;
    const envoi = await envoyerEmail({ to: String(e.email_ecole || '').includes('@') ? e.email_ecole : e.email_perso, subject: sujet, html }).catch(err => ({ ok: false, erreur: err.message }));
    if (envoi?.simule && process.env.NODE_ENV !== 'production') console.log(`[portail] ${d.type} (courriel simulé) : ${d.valeur}`);
    if (!envoi?.ok) console.error('[portail] courriel non parti :', envoi?.erreur);
  }
  const ecrire = db.prepare(`INSERT INTO portail_accuse (etudiant_id, objet_type, objet_id, presente_le, signe_le, ip, agent)
      VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, objet_type, objet_id) DO UPDATE SET presente_le = COALESCE(portail_accuse.presente_le, excluded.presente_le),
      signe_le = COALESCE(portail_accuse.signe_le, excluded.signe_le), ip = excluded.ip, agent = excluded.agent`);
  for (const a of r.accuses || []) {
    ok.accuses.push(a.id);
    // On ne recopie que ce qui existe ici : un envoi à CET étudiant, une version de règlement destinée aux étudiants.
    const vrai = a.objet_type === 'envoi'
      ? db.prepare(`SELECT 1 FROM envoi_mail WHERE id = ? AND destinataire_type = 'etudiant' AND destinataire_id = ?`).get(Number(a.objet_id), Number(a.etudiant_id))
      : a.objet_type === 'reglement' && db.prepare(`SELECT 1 FROM corpus_version v JOIN corpus_destinataire t ON t.document_id = v.document_id AND t.role = 'etudiant' WHERE v.id = ?`).get(Number(a.objet_id));
    if (!vrai) continue;
    ecrire.run(Number(a.etudiant_id), a.objet_type, Number(a.objet_id), a.presente_le || null, a.signe_le || null,
      String(a.ip || '').slice(0, 60), String(a.agent || '').slice(0, 200));
  }
  const cx = db.prepare('INSERT OR IGNORE INTO portail_connexion (etudiant_id, le, ip, ref_portail) VALUES (?,?,?,?)');
  for (const c of r.connexions || []) { ok.connexions.push(c.id); cx.run(Number(c.etudiant_id), String(c.utilise_le || ''), String(c.ip || '').slice(0, 60), Number(c.id)); }
  // Les entrées depuis un appareil reconnu (sans lien) : des connexions aussi ; référence négative, pour ne jamais croiser celles des liens.
  for (const c of r.entrees || []) { ok.entrees.push(c.id); cx.run(Number(c.etudiant_id), String(c.utilise_le || ''), String(c.ip || '').slice(0, 60), -Number(c.id)); }
  // LES GESTES DE VALORISATION (3.1.514) : jugés et écrits ici, avec les règles de Lucie ; un refus revient à l'étudiant.
  const touches = new Set([...(r.connexions || []), ...(r.entrees || [])].map(c => Number(c.etudiant_id)));
  for (const g of r.va || []) {
    const e = etudiantDuPortail(g.etudiant_id);
    let erreur = null;
    try {
      if (!e) erreur = 'Votre dossier ne permet pas cette demande en ligne : adressez-vous au secrétariat.';
      else if (!fonctionPour('espace.va', { etudiantId: e.id })) erreur = 'La demande de valorisation en ligne n’est pas ouverte : adressez-vous au secrétariat.';
      else if (g.type === 'terminer') erreur = await accuserReception(e);
      else {
        const contenu = g.type === 'piece' ? await lireBinaire(`/interne/va/piece/${g.id}`) : null;
        if (g.type === 'piece' && !contenu) erreur = 'La pièce n’a pas pu être reçue : déposez-la à nouveau.';
        else erreur = appliquerGeste(e, g, contenu);
      }
    } catch (x) { console.error('[portail] geste VA :', x.message); erreur = 'Le geste n’a pas pu être enregistré : réessayez, ou adressez-vous au secrétariat.'; }
    ok.va.push({ id: g.id, erreur });
    touches.add(Number(g.etudiant_id));
  }
  // LE PAE EN LIGNE (3.1.515) : une proposition (jugée, jamais écrite au programme), ou la confirmation de l'étudiant.
  for (const g of r.pae || []) {
    const e = etudiantDuPortail(g.etudiant_id);
    let erreur = null;
    try {
      if (!e) erreur = 'Votre accès à l’espace n’est plus valable : adressez-vous au secrétariat.';
      else if (!fonctionPour('espace.pae', { etudiantId: e.id })) erreur = 'Le PAE en ligne n’est pas ouvert : adressez-vous à votre coordination.';
      else if (g.type === 'proposer') erreur = deposerProposition(e, JSON.parse(g.ues || '[]'));
      else if (g.type === 'signer') erreur = recevoirSignature(e, g);
    } catch (x) { console.error('[portail] geste PAE :', x.message); erreur = 'Le geste n’a pas pu être enregistré : réessayez, ou adressez-vous à votre coordination.'; }
    ok.pae.push({ id: g.id, erreur });
    touches.add(Number(g.etudiant_id));
  }
  // LES MESSAGES (3.1.516) : ✓ lu, et les réponses (au fil, l'auteur prévenu).
  if ((r.messages_lus || []).length || (r.messages_reponses || []).length) {
    const m = recevoirMessages({ lus: r.messages_lus || [], reponses: r.messages_reponses || [] });
    ok.messages_lus = m.lus; ok.messages_reponses = m.reponses;
    for (const x of [...(r.messages_lus || []), ...(r.messages_reponses || [])]) touches.add(Number(x.etudiant_id));
    tours = 0;
  }
  if (ok.demandes.length || ok.accuses.length || ok.connexions.length || ok.entrees.length || ok.va.length || ok.pae.length
    || ok.messages_lus.length || ok.messages_reponses.length) await appel('POST', '/interne/acquitter', ok);
  // Ce qui vient de changer, ou qui vient d'entrer, voit ses demandes à jour dans les secondes qui suivent.
  if (touches.size) await deposerVA([...touches]);
}

// ── DÉPOSER ────────────────────────────────────────────────────────────────
async function deposer() {
  const etudiants = etudiantsVisibles();
  if (fonctionOuverte('espace.candidats')) {
    try { await codesDOffice(URL_PUBLIQUE()); } catch (e) { console.error('[portail] codes des candidats :', e.message); }
  }
  const candidats = candidatsValides().filter(c => fonctionPour('espace.candidats', { etudiantId: c.id }))
    .map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom, email_prive: c.email_perso, code_hash: c.code_hash, jusqu_au: c.jusqu_au,
      // UN CANDIDAT EST UN INSCRIT (3.5.008, Charles : « ce n'est pas parce qu'il n'a pas encore d'adresse qu'il n'est pas
      // inscrit ») : il voit ce que voit un étudiant.
      fonctions: fonctionsEspace(c.id) }));
  const avec = (f, l) => l.filter(x => x.fonctions.includes(f)).map(x => x.id);
  await appel('POST', '/interne/etudiants', { etudiants, candidats });
  // Les demandes de valorisation de ceux qui sont venus ces trois dernières heures (les autres, à leur prochaine entrée).
  await deposerVA(db.prepare(`SELECT DISTINCT etudiant_id FROM portail_connexion WHERE le >= datetime('now', '-3 hours')`).all().map(x => x.etudiant_id));
  await appel('POST', '/interne/resultats', { resultats: resultatsPublies(avec('resultats', etudiants)) });
  await appel('POST', '/interne/reglements', { reglements: reglementsEtudiants() });
  await appel('POST', '/interne/messages', messagesADeposer([...avec('messages', etudiants), ...avec('messages', candidats)]));
  try { await aviserParCourriel(URL_PUBLIQUE()); } catch (e) { console.error('[messages] avis :', e.message); }
  await appel('POST', '/interne/exceptions', { exceptions: db.prepare(`SELECT etudiant_id, MAX(jusqu_au) AS jusqu_au FROM portail_exception
    WHERE retire_le IS NULL AND jusqu_au >= date('now') GROUP BY etudiant_id`).all() });
  // LE REGISTRE D'AUTHENTICITÉ (3.1.511) : ce que le scan d'un QR doit retrouver. En ajout seul, par lots.
  for (let i = 0; i < 20; i++) {
    const l = piecesATransmettre(500);
    if (!l.length) break;
    await appel('POST', '/interne/authentiques', { pieces: l });
    marquerTransmises(l.map(x => x.reference));
  }
}

async function deposerDocuments() {
  // D'abord le dépôt d'office des pièces de délibération (3.1.510) : elles entrent au registre, puis partent ci-dessous.
  const visibles = etudiantsVisibles();
  const office = visibles.filter(e => e.fonctions.includes('depot_office') && e.fonctions.includes('documents'));
  if (office.length) {
    try { await deposerDOffice(office, URL_PUBLIQUE()); } catch (e) { console.error('[espace] dépôt d’office :', e.message); }
  }
  const ids = new Set([...visibles, ...candidatsValides().filter(c => fonctionPour('espace.candidats', { etudiantId: c.id })).map(c => ({ id: c.id, fonctions: fonctionsEspace(c.id) }))]
    .filter(e => e.fonctions.includes('documents')).map(e => e.id));
  const connus = new Set((await appel('GET', '/interne/documents/connus')).ids || []);
  let envois = [];
  try {
    envois = db.prepare(`SELECT m.id, m.destinataire_id, m.sujet, m.nom_fichier, m.envoye_le, m.reference FROM envoi_mail m
      JOIN envoi_copie c ON c.envoi_id = m.id WHERE m.destinataire_type = 'etudiant' AND m.statut IN ('envoye','simule','depose')
      ORDER BY m.id DESC`).all();
  } catch { return; }
  const aRetirer = [...connus].filter(id => !envois.some(m => m.id === id && ids.has(m.destinataire_id)));
  if (aRetirer.length) await appel('POST', '/interne/documents/retirer', { ids: aRetirer });
  const lot = [];
  for (const m of envois) {
    if (lot.length >= 20) break;
    if (connus.has(m.id) || !ids.has(m.destinataire_id)) continue;
    const c = await copieDeLEnvoi(m.id);
    if (c.erreur) continue;
    lot.push({ id: m.id, etudiant_id: m.destinataire_id, sujet: m.sujet, nom_fichier: c.nom, envoye_le: m.envoye_le,
      reference: m.reference, mime: c.type, contenu_b64: Buffer.from(c.corps).toString('base64') });
  }
  if (lot.length) await appel('POST', '/interne/documents', { documents: lot });
}

let tours = 0, enCours = false;
/** Le prochain passage (dans les dix secondes) dépose tout : après un geste de l'école que le portail doit voir vite. */
export const deposerBientot = () => { tours = 0; };
export async function passerPortail() {
  if (!portailActif() || enCours) return;
  enCours = true;
  try {
    migrerPortail();
    await relever();
    if (tours % 12 === 0) { await deposer(); await deposerDocuments(); }
    tours++;
  } catch (e) {
    if (tours % 30 === 0) console.error('[portail]', e.message);   // un portail arrêté ne remplit pas le journal
    tours++;
  } finally { enCours = false; }
}

export function planifierPortail() {
  if (!portailActif()) { console.log('[portail] non configuré (PORTAIL_INTERNE_URL, PORTAIL_JETON) : rien ne passe.'); return; }
  migrerPortail();
  setInterval(passerPortail, 10_000).unref?.();
  setTimeout(passerPortail, 5_000).unref?.();
}

/** Pour la fiche : ce que l'étudiant a fait de l'autre côté du mur, tel que Lucie l'a relevé. */
export function suiviPortail(etudiantId) {
  migrerPortail();
  return {
    actif: portailActif(), adresse: URL_PUBLIQUE(),
    candidat: candidatDe(etudiantId),
    pae: signatureDe(etudiantId),
    sans_adresse_ecole: !String(db.prepare('SELECT email_ecole FROM etudiant WHERE id = ?').get(etudiantId)?.email_ecole || '').includes('@'),
    exception: db.prepare(`SELECT id, jusqu_au, motif, par, le FROM portail_exception WHERE etudiant_id = ? AND retire_le IS NULL
      AND jusqu_au >= date('now') ORDER BY jusqu_au DESC LIMIT 1`).get(etudiantId) || null,
    connexions: db.prepare('SELECT le AS utilise_le, ip FROM portail_connexion WHERE etudiant_id = ? ORDER BY le DESC LIMIT 5').all(etudiantId),
    accuses: db.prepare(`SELECT a.objet_type, a.objet_id, a.presente_le, a.signe_le,
        CASE a.objet_type WHEN 'envoi' THEN (SELECT COALESCE(m.nom_fichier, m.sujet) || ' · ' || COALESCE(m.reference, '') FROM envoi_mail m WHERE m.id = a.objet_id)
          ELSE (SELECT d.titre || ' (version ' || v.numero || ')' FROM corpus_version v JOIN corpus_document d ON d.id = v.document_id WHERE v.id = a.objet_id) END AS piece
      FROM portail_accuse a WHERE a.etudiant_id = ? ORDER BY COALESCE(a.signe_le, a.presente_le) DESC`).all(etudiantId),
  };
}

/** Ouvrir l'accès hors de Belgique jusqu'à une date (motif obligatoire), ou le retirer. Part au prochain dépôt. */
export function poserException(etudiantId, { jusqu_au, motif }, par) {
  migrerPortail();
  const j = String(jusqu_au || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j) || j < new Date().toISOString().slice(0, 10)) return { erreur: 'Une date de fin, aujourd’hui ou plus tard.' };
  if (j > new Date(Date.now() + 400 * 86400e3).toISOString().slice(0, 10)) return { erreur: 'Une ouverture vaut au plus un an : elle se renouvelle.' };
  if (!String(motif || '').trim()) return { erreur: 'Le motif est obligatoire (stage, Erasmus…).' };
  if (!db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(etudiantId)) return { erreur: 'Étudiant introuvable.' };
  db.prepare("UPDATE portail_exception SET retire_le = datetime('now'), retire_par = ? WHERE etudiant_id = ? AND retire_le IS NULL").run(par, etudiantId);
  db.prepare('INSERT INTO portail_exception (etudiant_id, jusqu_au, motif, par) VALUES (?,?,?,?)').run(etudiantId, j, String(motif).trim().slice(0, 300), par);
  tours = 0;   // le prochain passage dépose
  return { ok: true };
}
export function retirerException(etudiantId, par) {
  migrerPortail();
  db.prepare("UPDATE portail_exception SET retire_le = datetime('now'), retire_par = ? WHERE etudiant_id = ? AND retire_le IS NULL").run(par, etudiantId);
  tours = 0;
  return { ok: true };
}

/** L'APERÇU DE LA DIRECTION (3.1.518, Charles : « en tant que directeur, je dois avoir un mode voir comme un étudiant pour
 *  tester ou vérifier ») : le portail fabrique un lien d'une minute, à usage unique, qui ouvre l'espace en lecture seule.
 *  Chaque aperçu se trace ici (qui, quel étudiant, quand). */
export async function ouvrirApercu(etudiantId, par) {
  if (!portailActif()) return { erreur: 'Le portail des étudiants n’est pas configuré sur ce serveur.' };
  db.exec(`CREATE TABLE IF NOT EXISTS portail_apercu (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    par TEXT, le TEXT NOT NULL DEFAULT (datetime('now')))`);
  try {
    const r = await appel('POST', '/interne/apercu', { etudiant_id: Number(etudiantId), par });
    db.prepare('INSERT INTO portail_apercu (etudiant_id, par) VALUES (?,?)').run(Number(etudiantId), par);
    return { url: r.url };
  } catch (e) {
    return { erreur: /404/.test(e.message) ? 'Cet étudiant n’a pas (encore) d’espace : ni adresse de l’institut, ni code de candidat — ou le portail ne l’a pas encore reçu (deux minutes).'
      : 'Le portail des étudiants ne répond pas.' };
  }
}

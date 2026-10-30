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
import { derniereVersion, versionReference } from '../routes/documentation.js';

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
  `);
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
  return l.map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, email_ecole: e.email_ecole,
    matricules: [...new Set([e.id_ecampus, ...(parId.get(e.id) || [])].filter(Boolean))] }));
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

// ── RELEVER ────────────────────────────────────────────────────────────────
async function relever() {
  const r = await appel('GET', '/interne/releve');
  const ok = { demandes: [], accuses: [], connexions: [] };
  const etudiant = id => db.prepare(`SELECT id, prenom, email_ecole FROM etudiant WHERE id = ? AND COALESCE(actif, 1) = 1
    AND COALESCE(sortie_statut, '') <> 'archive' AND email_ecole LIKE '%@%'`).get(Number(id));
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
        <p>Voici votre lien d'accès à votre espace à l'Institut Ilya Prigogine : vos résultats délibérés, vos documents, vos accusés de réception.
        Il est valable 30 minutes et ne sert qu'une fois.</p>
        <p><a href="${esc(lien)}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>
        <p style="color:#64748b;font-size:12px">Vous n'avez rien demandé ? Ignorez ce message : sans ce lien, personne n'accède à votre espace.</p>` });
    } else if (d.type === 'code') {
      if (!/^\d{6}$/.test(String(d.valeur || ''))) continue;
      sujet = `Institut Ilya Prigogine — code de signature ${d.valeur}`;
      html = templateNotif({ titre: 'Votre code de signature', corps: `<p>Votre code pour signer l'accusé de réception dans votre espace :</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${d.valeur}</p><p>Il est valable 10 minutes.</p>
        <p style="color:#64748b;font-size:12px">Vous n'êtes pas en train de signer ? Ne communiquez ce code à personne.</p>` });
    } else continue;
    const envoi = await envoyerEmail({ to: e.email_ecole, subject: sujet, html }).catch(err => ({ ok: false, erreur: err.message }));
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
  if (ok.demandes.length || ok.accuses.length || ok.connexions.length) await appel('POST', '/interne/acquitter', ok);
}

// ── DÉPOSER ────────────────────────────────────────────────────────────────
async function deposer() {
  const etudiants = etudiantsVisibles();
  await appel('POST', '/interne/etudiants', { etudiants });
  await appel('POST', '/interne/resultats', { resultats: resultatsPublies(etudiants.map(e => e.id)) });
  await appel('POST', '/interne/reglements', { reglements: reglementsEtudiants() });
}

async function deposerDocuments() {
  const ids = new Set(etudiantsVisibles().map(e => e.id));
  const connus = new Set((await appel('GET', '/interne/documents/connus')).ids || []);
  let envois = [];
  try {
    envois = db.prepare(`SELECT m.id, m.destinataire_id, m.sujet, m.nom_fichier, m.envoye_le, m.reference FROM envoi_mail m
      JOIN envoi_copie c ON c.envoi_id = m.id WHERE m.destinataire_type = 'etudiant' AND m.statut IN ('envoye','simule')
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
    connexions: db.prepare('SELECT le AS utilise_le, ip FROM portail_connexion WHERE etudiant_id = ? ORDER BY le DESC LIMIT 5').all(etudiantId),
    accuses: db.prepare(`SELECT a.objet_type, a.objet_id, a.presente_le, a.signe_le,
        CASE a.objet_type WHEN 'envoi' THEN (SELECT COALESCE(m.nom_fichier, m.sujet) || ' · ' || COALESCE(m.reference, '') FROM envoi_mail m WHERE m.id = a.objet_id)
          ELSE (SELECT d.titre || ' (version ' || v.numero || ')' FROM corpus_version v JOIN corpus_document d ON d.id = v.document_id WHERE v.id = a.objet_id) END AS piece
      FROM portail_accuse a WHERE a.etudiant_id = ? ORDER BY COALESCE(a.signe_le, a.presente_le) DESC`).all(etudiantId),
  };
}

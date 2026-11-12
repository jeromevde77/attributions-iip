/**
 * LE DÉPÔT D'OFFICE DANS L'ESPACE DE L'ÉTUDIANT (Charles, 30 octobre 2026 : « attestations de réussite ou d'échec à
 * télécharger — tout doit être fidèle à ce qui est actuellement produit » ; « oui, d'office à la clôture » ; « à terme,
 * on met à disposition et l'étudiant reçoit un mail : vous avez un message dans votre espace personnel IIP »).
 *
 * À chaque séance de délibération CLOSE, chaque délibéré reçoit dans son espace la pièce de sa décision, composée par
 * le moteur des pièces de délibération (`assemblerDocumentsUE`, celui de « Documents → Une séance ») :
 *   · réussi  → l'attestation de réussite de l'unité ;
 *   · ajourné → la motivation de la décision d'ajournement ;
 *   · refusé  → la motivation de la décision de refus.
 * Chaque pièce entre au registre des envois (`deposerDansLEspace`, mode « espace ») : copie, référence, signature
 * refaite à l'identique. Puis UN courriel par étudiant, sans pièce jointe : « un nouveau document vous attend ».
 *
 * À LA CLÔTURE, ET POUR TOUTE SÉANCE CLOSE DE L'ANNÉE (Charles, 31 octobre 2026 : « si elles ne sont pas parties,
 * tu as les données pour les reproduire ; cette action est d'office liée à la clôture de la délibération »). Chaque
 * séance close (hors reprise d'archives) de l'année de travail et des suivantes : la pièce de chaque délibéré est
 * déposée — SAUF s'il l'a déjà reçue par le centre d'envoi (un envoi « deliberation_lot » de l'année, depuis la date
 * de la séance, avec sa copie : l'espace le montre déjà ; on le note sans recomposer). Les années d'avant ne sont pas
 * reprises. Une pièce ne se dépose qu'une fois (`portail_depot`).
 */
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NATURE = {
  reussite: 'Attestation de réussite',
  ajournement: 'Motivation de la décision d’ajournement',
  refus: 'Motivation de la décision de refus',
};

export function migrerDepot(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS portail_depot (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL,
    annee_scolaire TEXT NOT NULL, ue_num INTEGER NOT NULL, session INTEGER NOT NULL, nature TEXT NOT NULL, envoi_id INTEGER,
    depose_le TEXT NOT NULL DEFAULT (datetime('now')), avise_le TEXT,
    UNIQUE (etudiant_id, annee_scolaire, ue_num, session, nature))`);
}

/**
 * Dépose ce qui manque, puis avise. `visibles` : les étudiants que le portail connaît (adresse d'école).
 * Rend { deposes, avises }.
 */
export async function deposerDOffice(visibles, urlPortail) {
  migrerDepot();
  // La date de mise en service reste notée : les rappels « document jamais ouvert » partent d'elle (rappelsEtudiants.js).
  db.prepare("INSERT OR IGNORE INTO lucie_config (cle, valeur) VALUES ('portail_depot_depuis', date('now'))").run();
  const parId = new Map(visibles.map(e => [Number(e.id), e]));
  const cols = db.prepare('PRAGMA table_info(deliberation_seance)').all().map(c => c.name);
  if (!cols.includes('publie_le')) return { deposes: 0, avises: 0 };
  const orgCol = cols.includes('num_organisation') ? 'COALESCE(num_organisation, 0)' : '0';
  const active = db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code
    || db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code || '';
  const seances = db.prepare(`SELECT ue_num, annee_scolaire, session, ${orgCol} AS org,
      COALESCE(date_seance, publie_le, maj_le) AS le FROM deliberation_seance
    WHERE cloturee = 1 AND COALESCE(reprise, 0) = 0 AND annee_scolaire >= ?
    ORDER BY COALESCE(publie_le, date_seance), ue_num`).all(active);
  // DÉJÀ PARTIE PAR LE CENTRE D'ENVOI : un envoi de délibération de l'année, depuis la séance, dont la copie est gardée.
  const dejaEnvoyee = db.prepare(`SELECT m.id FROM envoi_mail m JOIN envoi_copie c ON c.envoi_id = m.id
    WHERE m.destinataire_type = 'etudiant' AND m.destinataire_id = ? AND m.type_doc = 'deliberation_lot'
      AND m.statut = 'envoye' AND m.sujet LIKE ? AND substr(m.envoye_le, 1, 10) >= substr(?, 1, 10) ORDER BY m.id LIMIT 1`);
  const deja = db.prepare(`SELECT 1 FROM portail_depot WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND session = ? AND nature = ?`);
  const noter = db.prepare(`INSERT OR IGNORE INTO portail_depot (etudiant_id, annee_scolaire, ue_num, session, nature, envoi_id)
    VALUES (?,?,?,?,?,?)`);
  const noterEnvoye = db.prepare(`INSERT OR IGNORE INTO portail_depot (etudiant_id, annee_scolaire, ue_num, session, nature, envoi_id, avise_le)
    VALUES (?,?,?,?,?,?, datetime('now'))`);
  /* ON NE PRODUIT PLUS, ON PRÉVIENT (3.5.401, Charles : « je veux que l'on informe les étudiants que des documents sont
     disponibles ; on ne les produit pas, mais ils sont disponibles »). À la clôture, chaque délibéré est noté (`portail_depot`,
     sans envoi) puis avisé : la pièce se compose quand il la demande, dans « Obtenir un document » (centre de documents). */
  let deposes = 0;
  for (const s of seances) {
    if (deposes >= 500) break;   // un passage borné ; le suivant reprend
    const decides = db.prepare(`SELECT etudiant_id, resultat FROM deliberation_resultat
      WHERE annee_scolaire = ? AND ue_num = ? AND session = ? AND resultat IN ('reussi','ajourne','refuse')`)
      .all(s.annee_scolaire, s.ue_num, s.session)
      .filter(d => parId.has(Number(d.etudiant_id)));
    for (const d of decides) {
      const nat = { reussi: 'reussite', ajourne: 'ajournement', refuse: 'refus' }[d.resultat];
      if (deja.get(d.etudiant_id, s.annee_scolaire, s.ue_num, s.session, nat)) continue;
      const m = dejaEnvoyee.get(Number(d.etudiant_id), `%${s.annee_scolaire}%`, s.le || s.annee_scolaire.slice(0, 4) + '-09-01');
      if (m) { noterEnvoye.run(d.etudiant_id, s.annee_scolaire, s.ue_num, s.session, nat, m.id); continue; }
      noter.run(d.etudiant_id, s.annee_scolaire, s.ue_num, s.session, nat, null);
      deposes++;
    }
  }

  // L'AVIS : un courriel par étudiant, sans pièce jointe — la pièce est dans son espace.
  let avises = 0;
  const aAviser = db.prepare(`SELECT etudiant_id, COUNT(*) n FROM portail_depot WHERE avise_le IS NULL GROUP BY etudiant_id LIMIT 200`).all();
  for (const x of aAviser) {
    const e = parId.get(Number(x.etudiant_id));
    if (!e) continue;
    const html = templateNotif({ titre: 'Votre espace étudiant', corps: `<p>Bonjour ${esc(e.prenom || '')},</p>
      <p>${x.n > 1 ? `De nouveaux documents sont disponibles (${x.n} décisions du Conseil des études)` : 'Un nouveau document est disponible (une décision du Conseil des études)'}
      dans votre espace personnel à l'Institut Ilya Prigogine : rendez-vous dans <b>Mes documents → Obtenir un document</b>. Lucie compose la pièce
      au moment où vous la demandez, signée et avec son code QR d'authenticité.</p>
      <p><a href="${esc(urlPortail)}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>` });
    const r = await envoyerEmail({ to: e.email_ecole, subject: 'Institut Ilya Prigogine — des documents sont disponibles dans votre espace', html })
      .catch(err => ({ ok: false, erreur: err.message }));
    if (!r?.ok) { console.error('[espace] avis non parti :', r?.erreur); continue; }
    db.prepare("UPDATE portail_depot SET avise_le = datetime('now') WHERE etudiant_id = ? AND avise_le IS NULL").run(e.id);
    avises++;
  }
  return { deposes, avises };
}

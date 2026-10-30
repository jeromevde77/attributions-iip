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
 * PAS DE RATTRAPAGE DU PASSÉ : le dépôt ne vaut que pour les séances publiées depuis sa mise en service
 * (`lucie_config` « portail_depot_depuis », posé au premier passage) — sans quoi la première nuit déposerait
 * l'historique entier et enverrait des centaines de courriels. Une pièce ne se dépose qu'une fois (`portail_depot`).
 */
import db from '../db/index.js';
import { assemblerDocumentsUE } from '../routes/acquis.js';
import { envelopper } from '../routes/attestations.js';
import { deposerDansLEspace } from '../routes/envois.js';
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

/** Depuis quand le dépôt d'office vaut : posé au premier passage, jamais en arrière. */
function depuis() {
  const v = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'portail_depot_depuis'").get()?.valeur;
  if (v) return v;
  const j = db.prepare("SELECT date('now') d").get().d;
  db.prepare("INSERT OR IGNORE INTO lucie_config (cle, valeur) VALUES ('portail_depot_depuis', ?)").run(j);
  return j;
}

/**
 * Dépose ce qui manque, puis avise. `visibles` : les étudiants que le portail connaît (adresse d'école).
 * Rend { deposes, avises }.
 */
export async function deposerDOffice(visibles, urlPortail) {
  migrerDepot();
  const parId = new Map(visibles.map(e => [Number(e.id), e]));
  const cols = db.prepare('PRAGMA table_info(deliberation_seance)').all().map(c => c.name);
  if (!cols.includes('publie_le')) return { deposes: 0, avises: 0 };
  const orgCol = cols.includes('num_organisation') ? 'COALESCE(num_organisation, 0)' : '0';
  const seances = db.prepare(`SELECT ue_num, annee_scolaire, session, ${orgCol} AS org FROM deliberation_seance
    WHERE cloturee = 1 AND COALESCE(reprise, 0) = 0 AND publie_le IS NOT NULL AND publie_le >= ?
    ORDER BY publie_le, ue_num`).all(depuis());
  const deja = db.prepare(`SELECT 1 FROM portail_depot WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND session = ? AND nature = ?`);
  const noter = db.prepare(`INSERT OR IGNORE INTO portail_depot (etudiant_id, annee_scolaire, ue_num, session, nature, envoi_id)
    VALUES (?,?,?,?,?,?)`);
  const nomUE = db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1');
  const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  let deposes = 0;
  for (const s of seances) {
    if (deposes >= 200) break;   // un passage borné ; le suivant reprend
    // Les délibérés de cette séance, connus du portail, dont la pièce n'est pas encore déposée.
    const decides = db.prepare(`SELECT etudiant_id, resultat FROM deliberation_resultat
      WHERE annee_scolaire = ? AND ue_num = ? AND session = ? AND resultat IN ('reussi','ajourne','refuse')`)
      .all(s.annee_scolaire, s.ue_num, s.session)
      .filter(d => parId.has(Number(d.etudiant_id)))
      .filter(d => !deja.get(d.etudiant_id, s.annee_scolaire, s.ue_num, s.session,
        { reussi: 'reussite', ajourne: 'ajournement', refuse: 'refus' }[d.resultat]));
    if (!decides.length) continue;
    let a;
    try {
      a = assemblerDocumentsUE(s.ue_num, s.annee_scolaire, { reussite: true, ajournement: true, refus: true },
        { etudiants: decides.map(d => Number(d.etudiant_id)), org: s.org || null, session: s.session });
    } catch (e) { console.error(`[espace] UE ${s.ue_num} ${s.annee_scolaire} S${s.session} :`, e.message); continue; }
    const styles = [...new Set(a.styles || [])].join('');
    const ueNom = nomUE.get(s.ue_num, s.annee_scolaire)?.ue_nom || '';
    for (const p of a.pages || []) {
      if (!p.etudiant || !NATURE[p.t]) continue;
      const e = parId.get(Number(p.etudiant.id));
      if (!e || deja.get(e.id, s.annee_scolaire, s.ue_num, s.session, p.t)) continue;
      const sujet = `${NATURE[p.t]} — UE ${s.ue_num}${ueNom ? ` ${ueNom}` : ''} (${s.annee_scolaire}${s.session === 2 ? ', 2e session' : ''})`;
      const html = envelopper(styles + p.h, `${e.nom} ${e.prenom || ''} — ${NATURE[p.t]} — UE ${s.ue_num}`);
      const { id } = deposerDansLEspace({ etudiant: e, sujet, html, type_doc: `espace_${p.t}`,
        nom_fichier: `${slug(NATURE[p.t])}_UE${s.ue_num}_${String(s.annee_scolaire).replace(/\W/g, '')}_S${s.session}`,
        contenu: `Session ${s.session} — UE ${s.ue_num} : ${NATURE[p.t].toLowerCase()}` });
      noter.run(e.id, s.annee_scolaire, s.ue_num, s.session, p.t, id);
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
      <p>${x.n > 1 ? `${x.n} nouveaux documents vous attendent` : 'Un nouveau document vous attend'} dans votre espace personnel à
      l'Institut Ilya Prigogine. Vous pouvez le consulter, l'imprimer et en accuser réception.</p>
      <p><a href="${esc(urlPortail)}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>
      <p style="color:#64748b;font-size:12px">Le document se télécharge librement pendant 90 jours ; ensuite, un code vous sera demandé.</p>` });
    const r = await envoyerEmail({ to: e.email_ecole, subject: 'Institut Ilya Prigogine — un nouveau document dans votre espace', html })
      .catch(err => ({ ok: false, erreur: err.message }));
    if (!r?.ok) { console.error('[espace] avis non parti :', r?.erreur); continue; }
    db.prepare("UPDATE portail_depot SET avise_le = datetime('now') WHERE etudiant_id = ? AND avise_le IS NULL").run(e.id);
    avises++;
  }
  return { deposes, avises };
}

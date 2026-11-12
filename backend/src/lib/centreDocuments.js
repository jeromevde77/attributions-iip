// ─────────────────────────────────────────────────────────────────────────────
// LE CENTRE DE DOCUMENTS DE L'ÉTUDIANT (3.5.382, Charles, 12 novembre 2026 : « un centre de documents : une liste en fonction de la
// situation de l'étudiant ; il clique sur ce dont il a besoin ; Lucie génère avec signature et QR » ; tranché : tout ce qu'un étudiant
// peut obtenir seul — réussites, inscription, allocations, bulletin, parcours, CEP, SLE… ; deux demandes par pièce et par année ; une
// ligne au registre, sans copie gardée).
// Le portail note la demande ; Lucie la relève (boucle de 0,7 s, portailSync), JUGE (situation, limite), COMPOSE par ses propres routes
// de pièces (appel interne, jeton de service), rend le PDF. Les décisions notifiées (motivations, notifications) n'y sont pas : elles
// restent la copie envoyée, dans « Mes documents ».
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { rendrePdf } from '../services/pdf.js';
import { optionsPdfPiece } from './document.js';
import { PIECES as PIECES_CODEES } from './codesPieces.js';
import { cepDe } from './cep.js';

const MAX = 2;
const essai = (f, d) => { try { return f(); } catch { return d; } };
export function migrerCentre(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS centre_delivrance (id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL, code TEXT NOT NULL,
    annee_scolaire TEXT NOT NULL, reference TEXT, le TEXT NOT NULL DEFAULT (datetime('now')))`);
  dbx.exec('CREATE INDEX IF NOT EXISTS idx_centre_delivrance ON centre_delivrance (etudiant_id, code, annee_scolaire)');
}
const anneeActive = () => essai(() => db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code, null)
  || essai(() => db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code, '');
const avant = a => { const [x] = String(a).split('-').map(Number); return `${x - 1}-${x}`; };

/** Ce que l'étudiant peut composer, selon sa situation : [{ code, cle, nom, usage, chemin, methode, corps, orientation }]. */
function catalogue(id, annee) {
  const e = db.prepare('SELECT id, sejour_limite_etudes FROM etudiant WHERE id = ?').get(id);
  if (!e) return [];
  const a = encodeURIComponent(annee);
  const inscrit = an => !!essai(() => db.prepare('SELECT 1 FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? LIMIT 1').get(id, an), null);
  const reussites = essai(() => db.prepare("SELECT COUNT(*) n FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'").get(id).n, 0);
  const parcours = !!essai(() => db.prepare('SELECT 1 FROM etudiant_inscription WHERE etudiant_id = ? LIMIT 1').get(id), null);
  const cep = essai(() => cepDe(id, annee), null);
  const l = [];
  if (reussites) l.push({ cle: 'attestation_reussite', chemin: `/api/attestations/etudiant/${id}/document?annee=toutes`, nom: 'Attestations de réussite — toutes mes années' });
  if (inscrit(annee)) {
    l.push({ cle: 'attestation_inscription', chemin: `/api/etudiants/${id}/attestation-inscription?annee=${a}` });
    l.push({ cle: 'attestation_allocations', chemin: `/api/etudiants/${id}/attestation-inscription?annee=${a}&variante=allocations` });
    l.push({ cle: 'fiche_inscription', chemin: `/api/etudiants/${id}/fiche-inscription?annee=${a}` });
    l.push({ cle: 'frais_scolarite', chemin: `/api/frais-scolarite/etudiant/${id}/document?annee=${a}` });
  }
  if (parcours) {
    l.push({ cle: 'bulletin', chemin: `/api/etudiants/${id}/bulletin/document?annee=${a}` });
    l.push({ cle: 'parcours', chemin: `/api/etudiants/${id}/fiche-parcours/document?annee=${a}`, orientation: 'paysage' });
  }
  if (cep && cep.region !== 'flandre' && inscrit(annee)) {
    l.push({ cle: 'cep_inscription', chemin: `/api/cep/etudiant/${id}/piece/inscription?annee=${a}` });
    l.push({ cle: 'cep_assiduite', chemin: `/api/cep/etudiant/${id}/piece/assiduite?annee=${a}` });
    l.push({ cle: 'cep_seconde_session', chemin: `/api/cep/etudiant/${id}/piece/seconde_session?annee=${a}` });
  }
  if (Number(e.sejour_limite_etudes)) {
    if (inscrit(annee)) l.push({ cle: 'annexe1', methode: 'POST', chemin: '/api/annexe1/document', corps: { etudiant_id: id, annee } });
    const prec = inscrit(avant(annee)) ? avant(annee) : annee;
    l.push({ cle: 'annexe2', methode: 'POST', chemin: '/api/annexe2/document', corps: { etudiant_id: id, annee: prec }, annee_piece: prec });
  }
  /* LES VALORISATIONS ET LES AMÉNAGEMENTS (3.5.396, Charles : « il manque les demandes de VA. AR aussi ? ») : ce qui a été
     décidé et notifié — jamais une décision avant sa notification. */
  const vaNotifiee = essai(() => db.prepare('SELECT 1 FROM etudiant_valorisation WHERE etudiant_id = ? AND annee_scolaire = ? AND notifie_le IS NOT NULL LIMIT 1').get(id, annee), null);
  if (vaNotifiee) l.push({ cle: 'valorisation_notification', chemin: `/api/etudiants/${id}/valorisations/notification?annee=${a}`, nom: 'Notification des décisions de valorisation' });
  const vaRetenue = essai(() => db.prepare(`SELECT 1 FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete' AND ue_num > 0 AND archive_le IS NULL
    AND decision_le IS NOT NULL AND COALESCE(decision, 'accordee') <> 'refusee' LIMIT 1`).get(id), null);
  if (vaRetenue) l.push({ cle: 'valorisation_ue', chemin: `/api/attestations/etudiant/${id}/valorisations/document`, nom: 'Attestations de réussite par valorisation — toutes les années' });
  const ar = essai(() => db.prepare('SELECT id, notifie_le FROM amenagement_dossier WHERE etudiant_id = ? AND annee_scolaire = ? ORDER BY id DESC LIMIT 1').get(id, annee), null);
  if (ar) {
    l.push({ cle: 'amenagement_formulaire', chemin: `/api/amenagements/dossier/${ar.id}/piece/formulaire`, nom: 'Aménagement raisonnable — ma demande' });
    if (ar.notifie_le) l.push({ cle: 'amenagement_notification', chemin: `/api/amenagements/dossier/${ar.id}/piece/notification`, nom: 'Aménagement raisonnable — notification de la décision' });
  }
  /* LES MOTIVATIONS D'AJOURNEMENT ET DE REFUS (3.5.398, Charles : « ne devrait plus y être ; on génère ! ») : une par unité et
     par session, dès que la séance de son organisation (ou de toute l'unité) est close. */
  const decisions = essai(() => db.prepare(`SELECT r.ue_num, r.session, r.resultat, (SELECT ue_nom FROM ue WHERE ue_num = r.ue_num ORDER BY (annee_scolaire = ?) DESC LIMIT 1) AS ue_nom
      FROM deliberation_resultat r JOIN etudiant_inscription i ON i.etudiant_id = r.etudiant_id AND i.ue_num = r.ue_num AND i.annee_scolaire = r.annee_scolaire
      WHERE r.etudiant_id = ? AND r.annee_scolaire = ? AND r.resultat IN ('ajourne', 'refuse')
        AND EXISTS (SELECT 1 FROM deliberation_seance s WHERE s.ue_num = r.ue_num AND s.annee_scolaire = r.annee_scolaire AND s.session = r.session
          AND s.cloturee = 1 AND COALESCE(s.num_organisation, 0) IN (0, COALESCE(i.num_organisation, 0)))
      ORDER BY r.ue_num, r.session`).all(annee, id, annee), []);
  for (const x of decisions) {
    const cle = x.resultat === 'refuse' ? 'motivation_refus' : 'motivation_ajournement';
    const base = PIECES_CODEES.find(y => y.cle === cle) || {};
    l.push({ cle, code: `${base.code}-${x.ue_num}-S${x.session}`, chemin: `/api/acquis/motivation/${id}/${x.ue_num}/document?annee=${a}&session=${x.session}`,
      nom: `${x.resultat === 'refuse' ? 'Motivation du refus' : 'Motivation de l’ajournement'} — UE ${x.ue_num}${x.ue_nom ? ` ${x.ue_nom}` : ''} (session ${x.session})` });
  }
  return l.map(x => { const p = PIECES_CODEES.find(y => y.cle === x.cle) || {}; return { ...x, code: x.code || p.code, nom: x.nom || p.nom, usage: p.usage || '' }; })
    .filter(x => x.code);
}

const delivrees = (id, code, annee) => essai(() => db.prepare('SELECT COUNT(*) n FROM centre_delivrance WHERE etudiant_id = ? AND code = ? AND annee_scolaire = ?').get(id, code, annee).n, 0);

/** La liste montrée à l'étudiant. */
export function offreCentre(id) {
  migrerCentre();
  const annee = anneeActive();
  return { annee, max: MAX, pieces: catalogue(id, annee).map(x => ({ code: x.code, nom: x.nom, usage: x.usage, restant: Math.max(0, MAX - delivrees(id, x.code, annee)) })) };
}

/** Compose une pièce. Rend { pdf, nom } ou { statut, erreur }. `apercu` : la direction regarde, rien ne compte ni ne s'inscrit. */
export async function composerCentre(id, code, { apercu = false } = {}) {
  migrerCentre();
  const annee = anneeActive();
  const x = catalogue(id, annee).find(p => p.code === code);
  if (!x) return { statut: 404, erreur: 'Cette pièce n’est pas disponible pour votre situation.' };
  if (!apercu && delivrees(id, code, annee) >= MAX) {
    return { statut: 429, erreur: `Vous avez déjà obtenu cette pièce ${MAX} fois cette année. Pour un nouvel exemplaire, adressez-vous au secrétariat.` };
  }
  const { signServiceToken } = await import('../middleware/auth.js');
  const port = process.env.PORT || 3001;
  const h = { Authorization: `Bearer ${signServiceToken()}` };
  if (x.methode === 'POST') h['Content-Type'] = 'application/json';
  const rep = await fetch(`http://127.0.0.1:${port}${x.chemin}`, { method: x.methode || 'GET', headers: h,
    body: x.methode === 'POST' ? JSON.stringify(x.corps) : undefined, signal: AbortSignal.timeout(40000) });
  const type = rep.headers.get('content-type') || '';
  let html = '';
  if (type.includes('json')) {
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok || !j.html) return { statut: rep.ok ? 409 : rep.status, erreur: j.error || j.erreur || 'La pièce n’a pas pu être composée. Adressez-vous au secrétariat.' };
    html = j.html;
  } else {
    html = await rep.text();
    if (!rep.ok) return { statut: rep.status, erreur: 'La pièce n’a pas pu être composée. Adressez-vous au secrétariat.' };
  }
  const pdf = await rendrePdf(html, optionsPdfPiece(html, x.orientation ? { orientation: x.orientation } : {}));
  const reference = (/réf\.\s*<b>([^<]+)<\/b>/.exec(html) || /(IIP-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec(html) || [])[1] || null;
  const nom = `${code}_${x.nom}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').slice(0, 90) + '.pdf';
  if (!apercu) {
    db.prepare('INSERT INTO centre_delivrance (etudiant_id, code, annee_scolaire, reference) VALUES (?,?,?,?)').run(id, code, annee, reference);
    // UNE LIGNE AU REGISTRE DES ENVOIS, SANS COPIE (tranché par Charles) : qui, quoi, quand, la référence du QR.
    essai(() => {
      const e = db.prepare('SELECT nom, prenom, email_ecole FROM etudiant WHERE id = ?').get(id) || {};
      const qui = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
      db.prepare(`INSERT INTO envoi_mail (lot, type_doc, destinataire_type, destinataire_id, destinataire_nom, email, sujet, nom_fichier, taille,
        statut, envoye_par, envoye_le, reference, contenu, mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'),?,?,?)`)
        .run(`centre-${Date.now().toString(36)}`, x.cle, 'etudiant', id, qui, e.email_ecole || null, `${code} — ${x.nom}`, nom, pdf.length,
          'delivre', `${qui} (étudiant, centre de documents)`, reference, `Composée à la demande de l’étudiant dans son espace (${code})`, 'centre');
    }, null);
  }
  return { pdf, nom };
}

/* LA DÉSINSCRIPTION EN LIGNE (3.5.392) : l'état (le programme, le calcul du RDE, les demandes) ou la demande elle-même, datée par Lucie. */
async function desinscriptionEnLigne(q, json) {
  const { apercu, demander, desinscriptionsDe } = await import('./desinscription.js');
  const { fonctionPour } = await import('./fonctions.js');
  const id = Number(q.etudiant_id), annee = anneeActive();
  if (!q.apercu && !fonctionPour('espace.desinscription', { etudiantId: id })) return json(q.id, 404, { error: 'La demande en ligne n’est pas ouverte : adressez-vous au secrétariat.' });
  const ues = q.donnees?.ues?.length ? q.donnees.ues : null;
  const demandes = desinscriptionsDe(id).filter(d => d.annee_scolaire === annee)
    .map(d => ({ id: d.id, portee: d.portee, ues: d.ues, demande_le: d.demande_le, statut: d.statut, rembourse: d.rembourse, reste_du: d.reste_du, refus_motif: d.refus_motif }));
  if (q.action === 'desins_etat') {
    const tout = apercu(id, annee);
    const choix = ues ? apercu(id, annee, { ues }) : tout;
    return json(q.id, 200, { annee, programme: tout.unites || [], apercu: choix.erreur ? null : choix, erreur: choix.erreur || null, demandes });
  }
  const e = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(id) || {};
  const x = demander(id, annee, { ues, motif: q.donnees?.motif || null, source: 'en_ligne',
    par: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} (étudiant, en ligne)` });
  return x.erreur ? json(q.id, x.code || 409, { error: x.erreur }) : json(q.id, 200, { ok: true, demande_le: x.apercu.date });
}

/** La boucle : les demandes du portail (liste ou pièce), jugées et rendues. */
export async function relayerCentre(appel) {
  const r = await appel('GET', '/interne/centre/requetes');
  const l = r?.requetes || [];
  if (!l.length) return 0;
  const json = (id, statut, corps) => ({ id, statut, type: 'application/json; charset=utf-8', corps: Buffer.from(JSON.stringify(corps)).toString('base64') });
  const reponses = [];
  // LA TRACE (3.5.403, Charles : « il est bloqué sur un document ») : chaque demande note sa durée et son issue dans `portail_etape`
  // (étape « centre:<action> »), lisible sans les journaux du serveur.
  const tracer = (q, t0, erreur) => { try {
    db.exec('CREATE TABLE IF NOT EXISTS portail_etape (etape TEXT PRIMARY KEY, ok_le TEXT, erreur TEXT, erreur_le TEXT, duree_ms INTEGER, n INTEGER)');
    const etape = `centre:${q.action}${q.code ? `:${q.code}` : ''}`;
    if (erreur) db.prepare(`INSERT INTO portail_etape (etape, erreur, erreur_le, duree_ms) VALUES (?,?,datetime('now'),?)
      ON CONFLICT(etape) DO UPDATE SET erreur = excluded.erreur, erreur_le = excluded.erreur_le, duree_ms = excluded.duree_ms`).run(etape, String(erreur).slice(0, 500), Date.now() - t0);
    else db.prepare(`INSERT INTO portail_etape (etape, ok_le, duree_ms) VALUES (?,datetime('now'),?)
      ON CONFLICT(etape) DO UPDATE SET ok_le = excluded.ok_le, duree_ms = excluded.duree_ms`).run(etape, Date.now() - t0);
  } catch { /* la trace ne bloque rien */ } };
  for (const q of l) {
    const t0 = Date.now();
    const avant = reponses.length;
    try {
      if (q.action === 'liste') reponses.push(json(q.id, 200, offreCentre(Number(q.etudiant_id))));
      else if (q.action === 'desins_etat' || q.action === 'desins_demande') reponses.push(await desinscriptionEnLigne(q, json));
      else {
        const c = await composerCentre(Number(q.etudiant_id), String(q.code || ''), { apercu: !!q.apercu });
        reponses.push(c.pdf ? { id: q.id, statut: 200, type: 'application/pdf', nom: c.nom, corps: Buffer.from(c.pdf).toString('base64') }
          : json(q.id, c.statut || 409, { error: c.erreur }));
      }
    } catch (e) { reponses.push(json(q.id, 502, { error: 'Lucie n’a pas pu composer la pièce : ' + e.message })); }
    const r = reponses[avant];
    tracer(q, t0, r && r.statut >= 400 ? `${r.statut} ${Buffer.from(r.corps || '', 'base64').toString('utf8').slice(0, 300)}` : null);
    // Chaque réponse part aussitôt : une pièce longue ne fait pas attendre la suivante (ni dépasser l'attente du portail).
    await appel('POST', '/interne/centre/reponses', { reponses: [r] }).catch(x => tracer(q, t0, `envoi de la réponse : ${x.message}`));
  }
  return reponses.length;
}


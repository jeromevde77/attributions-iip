/**
 * LE REFUS EN SECONDE SESSION ET LES UNITÉS QUI EN DÉPENDENT (3.5.029, Charles, 1er novembre 2026 : « après une
 * délibération de 2e session, une notification au secrétariat et à la coordination : l'étudiant a échoué en 2e session
 * pour l'UE XXX, les UE suivantes doivent être retirées du PAE ; une fois fait, un mail lui est envoyé — ou un message
 * dans son espace quand il est ouvert — pour l'informer que son inscription est annulée, en conformité avec le décret du
 * 16 avril 1991, et que les frais déjà payés liés à ces UE, sauf ceux d'une VA, lui seront remboursés » ; tranché :
 * les UE qui ont XXX en prérequis, en cascade ; le secrétariat retire et prévient d'un clic, après un aperçu ; le
 * remboursement se calcule et s'inscrit dans Finances — SAUF si l'étudiant doit encore de l'argent : il est d'abord
 * déduit de la dette ; la partie fixe ne se rembourse jamais).
 *
 * 1. À la clôture d'une séance de SECONDE session, `signalerRefus` cherche les refusés dont le programme (cette année et
 *    les suivantes) porte des unités qui ont l'unité refusée en prérequis LÉGAL, directement ou en cascade. Chacun devient
 *    une ligne `refus_seconde` « à traiter », et une notification part au secrétariat et à la coordination de la section.
 * 2. `apercu` montre, sans rien écrire, les unités à retirer, les frais avant et après, ce qui est déduit de la dette et
 *    ce qui est remboursé, et le texte qui partira.
 * 3. `traiter` retire par `ecrireProgramme` (la seule porte du PAE ; une unité qui porte déjà un résultat, une note ou un
 *    report reste et se nomme), note le remboursement, puis prévient l'étudiant : message dans son espace si « Messages »
 *    lui est ouvert, sinon courriel (adresse d'institut, à défaut privée).
 */
import db from '../db/index.js';
import { cursusDe, ecrireProgramme, sectionPropre } from '../routes/etudiants.js';
import { calculerFrais } from '../routes/fraisScolarite.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { envoyer as envoyerMessage } from './messagesEtudiants.js';
import { fonctionPour } from './fonctions.js';

const arrondi = x => Math.round((Number(x) || 0) * 100) / 100;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function migrerRefusSeconde(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS refus_seconde (
    id INTEGER PRIMARY KEY AUTOINCREMENT, etudiant_id INTEGER NOT NULL, annee_scolaire TEXT NOT NULL, ue_num INTEGER NOT NULL,
    num_organisation INTEGER NOT NULL DEFAULT 0, suites TEXT, statut TEXT NOT NULL DEFAULT 'a_traiter',
    cree_le TEXT NOT NULL DEFAULT (datetime('now')), traite_le TEXT, traite_par TEXT,
    retirees TEXT, conservees TEXT, remboursement REAL, dette_deduite REAL, avis TEXT, motif_sans_suite TEXT,
    UNIQUE (etudiant_id, annee_scolaire, ue_num))`);
}

const nomUE = (n, an) => db.prepare('SELECT ue_nom FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1').get(n, an)?.ue_nom || '';

/** Les unités du programme de l'étudiant (cette année et les suivantes, sans résultat) qui dépendent de `ueNum`. */
export function suitesDe(etudId, ueNum, annee) {
  const sections = cursusDe(etudId, annee).actifs || [];
  const marques = sections.map(() => '?').join(',');
  const dependants = db.prepare(`SELECT DISTINCT ue_num FROM ue_prerequis WHERE prerequis_num = ? AND COALESCE(type, 'legal') = 'legal'
    AND (section IS NULL${sections.length ? ` OR section IN (${marques})` : ''}) AND (annee_scolaire IS NULL OR annee_scolaire = ?)`);
  const vus = new Set(), file = [Number(ueNum)];
  while (file.length) {
    const u = file.shift();
    for (const d of dependants.all(u, ...sections, annee)) if (!vus.has(d.ue_num) && d.ue_num !== Number(ueNum)) { vus.add(d.ue_num); file.push(d.ue_num); }
  }
  if (!vus.size) return [];
  return db.prepare(`SELECT ue_num, annee_scolaire FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire >= ? AND resultat IS NULL
    ORDER BY annee_scolaire, ue_num`).all(etudId, annee).filter(x => vus.has(x.ue_num))
    .map(x => ({ ue_num: x.ue_num, annee: x.annee_scolaire, ue_nom: nomUE(x.ue_num, x.annee_scolaire) }));
}

/** À la clôture d'une séance de seconde session. Rend le nombre d'étudiants signalés. */
export function signalerRefus(ueNum, annee, org = 0, par = 'Lucie') {
  migrerRefusSeconde();
  const orgSql = Number(org) > 0 ? 'AND COALESCE(i.num_organisation, 0) = ?' : '';
  const refuses = db.prepare(`SELECT r.etudiant_id, e.nom, e.prenom FROM deliberation_resultat r
      JOIN etudiant e ON e.id = r.etudiant_id
      LEFT JOIN etudiant_inscription i ON i.etudiant_id = r.etudiant_id AND i.annee_scolaire = r.annee_scolaire AND i.ue_num = r.ue_num
    WHERE r.ue_num = ? AND r.annee_scolaire = ? AND r.session = 2 AND r.resultat = 'refuse' ${orgSql}`)
    .all(...[ueNum, annee, ...(Number(org) > 0 ? [Number(org)] : [])]);
  const ins = db.prepare(`INSERT OR IGNORE INTO refus_seconde (etudiant_id, annee_scolaire, ue_num, num_organisation, suites) VALUES (?,?,?,?,?)`);
  const noms = [];
  for (const r of refuses) {
    const suites = suitesDe(r.etudiant_id, ueNum, annee);
    if (!suites.length) continue;
    if (ins.run(r.etudiant_id, annee, ueNum, Number(org) || 0, JSON.stringify(suites)).changes) noms.push(`${(r.nom || '').toUpperCase()} ${r.prenom || ''}`.trim());
  }
  if (!noms.length) return 0;
  const section = db.prepare('SELECT section FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(ueNum, annee)?.section || null;
  const titre = `UE ${ueNum} — refus en 2e session : ${noms.length} PAE à corriger`;
  const corps = `<p>${noms.map(esc).join(', ')} ${noms.length > 1 ? 'ont été refusés' : 'a été refusé(e)'} en seconde session pour l'UE ${ueNum}
    ${esc(nomUE(ueNum, annee))}. Des unités qui l'ont en prérequis sont à retirer de leur PAE, puis l'étudiant est prévenu.</p>`;
  const notif = db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par, section) VALUES ('refus_seconde',?,?,?,?,?,?)`);
  for (const role of ['secretariat', 'coordination', 'directeur']) notif.run(titre, corps, '/etudiants?outil=refus2', role, par, section);
  return noms.length;
}

/** Ce que coûtent les unités retirées : frais avant et après (hors forfait VA), dette, remboursement. Rien n'est écrit. */
function chiffrer(etudId, retraits) {
  const annees = [...new Set(retraits.map(x => x.annee))];
  let difference = 0, rembourse = 0, deduit = 0;
  const parAnnee = [];
  for (const an of annees) {
    const avant = calculerFrais(etudId, an);
    let apres = null;
    // Le calcul « après » se fait dans une transaction qu'on défait : le droit d'inscription a un plafond, et les frais
    // d'une unité ne se lisent pas seuls (on ne soustrait pas fi_par_ue).
    try {
      db.transaction(() => {
        ecrireProgramme({ etudId, annee: an, retirer: retraits.filter(x => x.annee === an).map(x => x.ue_num), origine: 'refus_seconde', mode: 'signaler' });
        apres = calculerFrais(etudId, an);
        throw new Error('__defaire__');
      })();
    } catch (e) { if (e.message !== '__defaire__') throw e; }
    const baisse = arrondi(Math.max(0, (avant.total_hors_va || 0) - (apres?.total_hors_va || 0)));
    const verse = arrondi(avant.verse || 0);
    const totalApres = arrondi((apres?.total ?? avant.total) || 0);
    // Ce qui a été payé au-delà du nouveau total revient à l'étudiant, sans dépasser la baisse ; le reste éteint la dette.
    const r = arrondi(Math.max(0, Math.min(baisse, verse - totalApres)));
    difference += baisse; rembourse += r; deduit += arrondi(baisse - r);
    parAnnee.push({ annee: an, total_avant: avant.total, total_apres: totalApres, verse, baisse, rembourse: r, deduit: arrondi(baisse - r) });
  }
  return { baisse: arrondi(difference), rembourse: arrondi(rembourse), deduit: arrondi(deduit), par_annee: parAnnee };
}

function texteAvis(e, ref, retirees, ch) {
  const liste = retirees.map(x => `— UE ${x.ue_num}${x.ue_nom ? ` « ${x.ue_nom} »` : ''} (${x.annee})`).join('\n');
  const montant = n => `${Number(n).toFixed(2).replace('.', ',')} €`;
  let frais = '';
  if (ch.rembourse > 0 && ch.deduit > 0) frais = `Les frais de ces unités s'élèvent à ${montant(ch.baisse)} (hors frais d'analyse d'une demande de valorisation) : ${montant(ch.deduit)} sont déduits du solde que vous deviez encore à l'Institut, et ${montant(ch.rembourse)} vous seront remboursés.`;
  else if (ch.rembourse > 0) frais = `Les frais déjà payés pour ces unités, soit ${montant(ch.rembourse)} (hors frais d'analyse d'une demande de valorisation), vous seront remboursés.`;
  else if (ch.deduit > 0) frais = `Les frais de ces unités, soit ${montant(ch.deduit)} (hors frais d'analyse d'une demande de valorisation), sont déduits du solde que vous devez encore à l'Institut.`;
  const objet = `Votre inscription — unités retirées après la seconde session (UE ${ref.ue_num})`;
  const corps = `Bonjour ${e.prenom || ''},

À l'issue de la seconde session, le Conseil des études n'a pas pu vous délivrer l'attestation de réussite de l'UE ${ref.ue_num}${ref.ue_nom ? ` « ${ref.ue_nom} »` : ''}.

Cette unité est un prérequis des unités suivantes, auxquelles vous étiez inscrit(e) :
${liste}

Une unité ne peut être suivie tant que ses prérequis ne sont pas acquis. Conformément à l'article 32, § 3, du règlement des études de l'Institut (décret du 16 avril 1991, article 36ter), votre programme annuel est modifié en conséquence : votre inscription à ces unités est annulée.
${frais ? `\n${frais}\n` : ''}
Pour toute question, adressez-vous au secrétariat ou à votre coordination.

Le secrétariat de l'Institut Ilya Prigogine`;
  return { objet, corps };
}

const ligne = id => db.prepare('SELECT * FROM refus_seconde WHERE id = ?').get(Number(id));

/** Ce qui sera fait, sans rien écrire. `ues` : les unités à retirer (par défaut, toutes les suites encore au programme). */
export function apercu(id, ues = null) {
  migrerRefusSeconde();
  const r = ligne(id);
  if (!r) return { code: 404, erreur: 'Dossier introuvable.' };
  const e = db.prepare('SELECT id, nom, prenom, email_ecole, email_perso FROM etudiant WHERE id = ?').get(r.etudiant_id);
  const suites = suitesDe(r.etudiant_id, r.ue_num, r.annee_scolaire);
  const choisies = ues ? suites.filter(x => ues.map(Number).includes(x.ue_num)) : suites;
  const ch = choisies.length ? chiffrer(r.etudiant_id, choisies) : { baisse: 0, rembourse: 0, deduit: 0, par_annee: [] };
  const ref = { ue_num: r.ue_num, ue_nom: nomUE(r.ue_num, r.annee_scolaire) };
  const canal = fonctionPour('espace.messages', { etudiantId: e.id }) && String(e.email_ecole || '').includes('@') ? 'espace'
    : (e.email_ecole || e.email_perso) ? 'courriel' : null;
  return { dossier: { ...r, suites: JSON.parse(r.suites || '[]') }, etudiant: e, refusee: ref, suites, retirees: choisies, frais: ch,
    canal, adresse: canal === 'courriel' ? (e.email_ecole || e.email_perso) : null, texte: texteAvis(e, ref, choisies, ch) };
}

/** Retire, note, prévient. `user` : celui qui clique (il signe). */
export async function traiter(id, user, nomAuteur, ues = null) {
  const a = apercu(id, ues);
  if (a.erreur) return a;
  if (a.dossier.statut !== 'a_traiter') return { code: 409, erreur: 'Ce dossier est déjà traité.' };
  if (!a.retirees.length) return { code: 409, erreur: 'Plus aucune unité à retirer : marquez le dossier « sans suite ».' };
  const conservees = [];
  db.transaction(() => {
    for (const an of [...new Set(a.retirees.map(x => x.annee))]) {
      const b = ecrireProgramme({ etudId: a.etudiant.id, annee: an, retirer: a.retirees.filter(x => x.annee === an).map(x => x.ue_num),
        origine: 'refus_seconde', par: nomAuteur, mode: 'signaler' });
      conservees.push(...(b.conservees || []).map(c => ({ ...c, annee: an })));
    }
    db.prepare(`UPDATE refus_seconde SET statut = 'traite', traite_le = datetime('now'), traite_par = ?, retirees = ?, conservees = ?,
      remboursement = ?, dette_deduite = ? WHERE id = ?`)
      .run(nomAuteur, JSON.stringify(a.retirees.filter(x => !conservees.some(c => c.ue_num === x.ue_num && c.annee === x.annee))),
        JSON.stringify(conservees), a.frais.rembourse, a.frais.deduit, a.dossier.id);
  })();
  // Prévenir l'étudiant.
  let avis = null;
  if (a.canal === 'espace') {
    const r = envoyerMessage({ objet: a.texte.objet, corps: a.texte.corps, critere: { etudiants: [a.etudiant.id] } },
      { ...user, role: ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'].includes(user?.role) ? user.role : 'secretariat' },
      nomAuteur, a.dossier.annee_scolaire);
    if (r.ok) avis = 'espace';
  }
  if (!avis && a.adresse) {
    const html = templateNotif({ titre: a.texte.objet, corps: a.texte.corps.split('\n').map(l => (l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : '')).join('') });
    const r = await envoyerEmail({ to: a.adresse, subject: `Institut Ilya Prigogine — ${a.texte.objet}`, html }).catch(e => ({ ok: false, erreur: e.message }));
    if (r?.ok) avis = 'courriel';
  }
  db.prepare('UPDATE refus_seconde SET avis = ? WHERE id = ?').run(avis, a.dossier.id);
  return { ok: true, avis, conservees, remboursement: a.frais.rembourse, dette_deduite: a.frais.deduit };
}

export function sansSuite(id, nomAuteur, motif) {
  migrerRefusSeconde();
  if (!String(motif || '').trim()) return { code: 400, erreur: 'Un motif, pour la trace.' };
  const n = db.prepare(`UPDATE refus_seconde SET statut = 'sans_suite', traite_le = datetime('now'), traite_par = ?, motif_sans_suite = ?
    WHERE id = ? AND statut = 'a_traiter'`).run(nomAuteur, String(motif).trim(), Number(id)).changes;
  return n ? { ok: true } : { code: 409, erreur: 'Ce dossier est déjà traité.' };
}

/** La liste : à traiter d'abord. `sections` : null = toutes (périmètre de la coordination sinon). */
export function liste(sections = null) {
  migrerRefusSeconde();
  return db.prepare(`SELECT r.*, e.nom, e.prenom FROM refus_seconde r JOIN etudiant e ON e.id = r.etudiant_id
    ORDER BY (r.statut = 'a_traiter') DESC, r.cree_le DESC LIMIT 300`).all()
    .map(r => ({ ...r, suites: JSON.parse(r.suites || '[]'), retirees: JSON.parse(r.retirees || 'null'), section: sectionPropre(r.etudiant_id),
      ue_nom: nomUE(r.ue_num, r.annee_scolaire) }))
    .filter(r => !sections || sections.includes(r.section));
}

/** Les remboursements notés et pas encore versés, pour la fiche → Finances. */
export function remboursementsAFaire(etudId) {
  migrerRefusSeconde();
  const l = db.prepare(`SELECT id, annee_scolaire, ue_num, remboursement, traite_le FROM refus_seconde
    WHERE etudiant_id = ? AND statut = 'traite' AND remboursement > 0 ORDER BY traite_le`).all(Number(etudId));
  return l.map(r => {
    let verse = 0;
    try {
      verse = -(db.prepare(`SELECT COALESCE(SUM(montant), 0) s FROM frais_paiement WHERE etudiant_id = ? AND annule_le IS NULL
        AND montant < 0 AND date(COALESCE(date_paiement, cree_le)) >= date(?)`).get(Number(etudId), r.traite_le).s || 0);
    } catch { /* */ }
    return { ...r, ue_nom: nomUE(r.ue_num, r.annee_scolaire), verse: arrondi(Math.min(verse, r.remboursement)),
      reste: arrondi(Math.max(0, r.remboursement - verse)) };
  }).filter(r => r.reste > 0);
}

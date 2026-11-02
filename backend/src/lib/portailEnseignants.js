// ─────────────────────────────────────────────────────────────────────────────
// LUCIE ET L'ESPACE ENSEIGNANT — LE MÊME PASSAGE À SENS UNIQUE (3.5.076, Charles, 2 novembre 2026 : un site à part
// derrière le mur, dans le portail existant, enseignants.lucie-iip.be ; étape 1 = l'entrée, Ma journée, les
// présences et l'horaire). Le portail n'a ni la base ni les clés de Lucie ; c'est elle qui vient, au même rythme que
// pour les étudiants (`portailSync.js`) :
//
//   DÉPOSER — les comptes dont la fonction « enseignant.espace » est ouverte (Configuration → Mise en service), avec
//             l'adresse de leur compte ; leurs séances de 30 jours derrière à 3 semaines devant (la règle de Mes cours :
//             `seancesPourEspace`), les inscrits de chacune et les présences déjà prises. Le dépôt REMPLACE.
//   RELEVER — les demandes (lien, code) : Lucie vérifie et compose le courriel ; les présences encodées : jugées et
//             écrites par la seule porte (`presencesDepuisEspace` → `ecrirePresences`), au nom de l'enseignant, un
//             refus rendu en clair.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { envoyerEmail, templateNotif } from '../services/mailer.js';
import { fonctionPour } from './fonctions.js';
import { seancesPourEspace, presencesDepuisEspace } from '../routes/mesCours.js';
import { aujourdhuiBruxelles } from './presenceQr.js';
import { MOTIFS_JUSTIFIES } from './cep.js';
import { attributionsDe, etudiantsDuCours } from './etudiantsCours.js';
import { ceQuiAttend } from './recapQuotidien.js';

const URL_ENS = () => (process.env.ENSEIGNANTS_URL_PUBLIQUE || 'https://enseignants.lucie-iip.be').replace(/\/$/, '');
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const decaler = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Les comptes qui ont un espace enseignant : actifs, reliés à une fiche de professeur, la fonction ouverte pour eux. */
export function comptesEnseignants() {
  return db.prepare(`SELECT u.id, u.email, u.role, u.nom_complet, p.nom, p.prenom FROM utilisateur u
      JOIN professeur p ON p.id = u.professeur_id
      WHERE COALESCE(u.actif, 1) = 1 AND u.email LIKE '%@%'`).all()
    .filter(u => fonctionPour('enseignant.espace', { userId: u.id }));
}

/* L'APERÇU DE LA DIRECTION (3.5.084, Charles : « comme pour les étudiants, je dois pouvoir voir l'espace de chaque prof » ;
   « depuis sa fiche »). Un professeur ouvert en aperçu ces 30 dernières minutes est déposé au portail même si la fonction
   est éteinte pour lui, et même s'il n'a pas de compte (identifiant négatif : -id de sa fiche) ; il l'est `apercu_seul` quand
   lui-même n'y a pas droit : aucune porte de l'espace ne l'admet, seul le lien d'aperçu l'ouvre, en lecture seule. */
export function migrerApercuEnseignant() {
  db.exec(`CREATE TABLE IF NOT EXISTS ens_apercu (id INTEGER PRIMARY KEY AUTOINCREMENT, professeur_id INTEGER NOT NULL,
    par TEXT, le TEXT NOT NULL DEFAULT (datetime('now')))`);
}
function enApercu() {
  try { migrerApercuEnseignant(); return db.prepare(`SELECT DISTINCT professeur_id FROM ens_apercu WHERE le >= datetime('now', '-30 minutes')`).all().map(x => x.professeur_id); }
  catch { return []; }
}
/** L'identifiant de l'espace d'un professeur : son compte relié s'il en a un, sinon -id de sa fiche. */
export function identifiantEspace(profId) {
  const u = db.prepare(`SELECT id FROM utilisateur WHERE professeur_id = ? AND COALESCE(actif, 1) = 1 ORDER BY id LIMIT 1`).get(Number(profId));
  return u ? u.id : -Number(profId);
}
function aDeposer() {
  const vrais = comptesEnseignants();
  const ids = new Set(vrais.map(u => u.id));
  const apercus = [];
  for (const pid of enApercu()) {
    const p = db.prepare('SELECT id, nom, prenom, adresse_mail FROM professeur WHERE id = ?').get(pid);
    if (!p) continue;
    const id = identifiantEspace(pid);
    if (ids.has(id)) continue;
    const u = id > 0 ? db.prepare('SELECT id, email, role FROM utilisateur WHERE id = ?').get(id) : null;
    apercus.push({ id, email: u?.email || p.adresse_mail || `apercu-${pid}@lucie.invalid`, role: u?.role || 'professeur', nom: p.nom, prenom: p.prenom,
      apercu_seul: true, ...(u ? {} : { apercuProfId: pid }) });
  }
  return [...vrais, ...apercus];
}
const compte = id => comptesEnseignants().find(u => u.id === Number(id)) || null;

/* LE TABLEAU DE BORD DU PROFESSEUR (3.5.086, Charles : « pour les profs, les notifications, ce qu'ils ont à faire… les
   présences des leçons passées, les DUE des UE dans lesquelles ils sont, les listes d'étudiants, les fiches des étudiants » ;
   tranché : dans l'espace enseignant, et une fiche PÉDAGOGIQUE — ni adresse, ni numéro national, ni frais). Composé ici,
   déposé avec le reste ; le portail ne fait que le montrer. */
const anneeActive = () => db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code
  || db.prepare('SELECT code FROM annee_scolaire ORDER BY code DESC LIMIT 1').get()?.code;
async function tableauDe(u, profId, annee, documentDUE) {
  const aFaire = [];
  if (u.id > 0) {
    try {
      const a = ceQuiAttend({ id: u.id, role: u.role, professeur_id: profId }, null);
      for (const t of a.taches) aFaire.push({ type: 'tache', titre: t.titre, echeance: t.echeance || null, retard: !!t.retard });
      for (const t of a.textes) aFaire.push({ type: 'texte', titre: `À lire et confirmer dans Lucie : ${t.titre}` });
      for (const m of a.messages) aFaire.push({ type: 'message', titre: `Message non lu dans Lucie : ${m.titre}` });
      for (const r of a.rappels || []) aFaire.push({ type: 'rappel', titre: r.titre || r.objet || 'Rappel' });
    } catch { /* tables absentes */ }
  }
  const attrs = attributionsDe(profId, annee);
  const ues = new Map(), fiches = new Map();
  const statutDUE = db.prepare('SELECT statut FROM due WHERE ue_num = ? AND annee_scolaire = ?');
  const seancesPassees = db.prepare(`SELECT id FROM horaire_seance WHERE annee_scolaire = ? AND cours_code = ? AND COALESCE(annule, 0) = 0 AND date <= date('now')`);
  const presencesDe = db.prepare(`SELECT p.etudiant_id, p.statut, COUNT(*) n FROM presence p JOIN horaire_seance h ON h.id = p.seance_id
    WHERE h.annee_scolaire = ? AND h.cours_code = ? GROUP BY p.etudiant_id, p.statut`);
  const notesDe = db.prepare(`SELECT e.intitule, e.sur, n.etudiant_id, n.points, n.mention FROM carnet_evaluation e
    JOIN carnet_note n ON n.evaluation_id = e.id WHERE e.annee_scolaire = ? AND e.cours_code = ? ORDER BY e.ordre, e.id`);
  for (const a of attrs) {
    if (!ues.has(a.ue_num)) {
      let statut = 'preparation';
      try { statut = statutDUE.get(a.ue_num, annee)?.statut || 'preparation'; } catch { /* */ }
      let due = null;
      try { due = documentDUE ? documentDUE(a.ue_num, annee) : null; } catch { due = null; }
      ues.set(a.ue_num, { ue_num: a.ue_num, ue_nom: a.ue_nom, section: a.section, due_statut: statut, due_html: due, cours: [] });
    }
    const ue = ues.get(a.ue_num);
    if (ue.cours.some(c => c.code === a.code_cours)) continue;
    let liste = null;
    try { liste = etudiantsDuCours(profId, a.code_cours, annee); } catch { liste = null; }
    const etus = liste?.etudiants || [];
    const passees = (() => { try { return seancesPassees.all(annee, a.code_cours).length; } catch { return 0; } })();
    const pres = new Map();
    try { for (const r of presencesDe.all(annee, a.code_cours)) { const x = pres.get(r.etudiant_id) || {}; x[r.statut] = r.n; pres.set(r.etudiant_id, x); } } catch { /* */ }
    const notes = new Map();
    try { for (const r of notesDe.all(annee, a.code_cours)) { (notes.get(r.etudiant_id) || notes.set(r.etudiant_id, []).get(r.etudiant_id)).push({ evaluation: r.intitule, sur: r.sur, points: r.points, mention: r.mention }); } } catch { /* */ }
    ue.cours.push({ code: a.code_cours, nom: a.cours_nom, etudiants: etus.map(e => ({ id: e.id, groupe: e.groupe || null })) });
    for (const e of etus) {
      if (!fiches.has(e.id)) {
        const x = db.prepare('SELECT nom, prenom, email_ecole, id_ecampus, section_rattachement FROM etudiant WHERE id = ?').get(e.id) || {};
        fiches.set(e.id, { id: e.id, nom: x.nom || e.nom, prenom: x.prenom || e.prenom, email: x.email_ecole || null, matricule: x.id_ecampus || null,
          section: x.section_rattachement || null, cours: [], amenagements: [] });
      }
      const p = pres.get(e.id) || {};
      fiches.get(e.id).cours.push({ code: a.code_cours, nom: a.cours_nom, ue_num: a.ue_num, groupe: e.groupe || null,
        presences: { passees, present: p.present || 0, absent: p.absent || 0, justifie: p.justifie || 0 }, notes: notes.get(e.id) || [] });
    }
  }
  // Les aménagements raisonnables : les MESURES accordées seulement (secret professionnel, décret du 30 juin 2016, art. 5).
  try {
    const m = db.prepare(`SELECT d.etudiant_id, m.libelle, m.precisions, m.ue_num FROM amenagement_dossier d JOIN amenagement_mesure m ON m.dossier_id = d.id
      WHERE d.annee_scolaire = ? AND d.statut IN ('accepte','partiel','recours') AND m.accorde = 1`).all(annee);
    for (const x of m) {
      const f = fiches.get(x.etudiant_id); if (!f) continue;
      if (x.ue_num && !f.cours.some(c => c.ue_num === x.ue_num)) continue;
      f.amenagements.push({ libelle: x.libelle, precisions: x.precisions || null, ue_num: x.ue_num || null });
    }
  } catch { /* module absent */ }
  for (const ue of ues.values()) if (ue.due_statut !== 'validee') aFaire.push({ type: 'due', titre: `DUE de l'UE ${ue.ue_num} à rédiger ou compléter dans Lucie (Mes cours)`, ue_num: ue.ue_num });
  return { annee, a_faire: aFaire, ues: [...ues.values()], etudiants: [...fiches.values()] };
}

export async function deposerEnseignants(appel) {
  const jour = aujourdhuiBruxelles();
  const du = decaler(jour, -30), au = decaler(jour, 21);
  const enseignants = [], seances = [], etudiants = new Map(), presences = [];
  for (const u of aDeposer()) {
    enseignants.push({ id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, apercu_seul: !!u.apercu_seul });
    const x = seancesPourEspace(u, du, au);
    for (const s of x.seances) seances.push({ ...s, ens_id: u.id });
    for (const e of x.etudiants) etudiants.set(e.id, e);
    presences.push(...x.presences);
  }
  // Le tableau de bord de chacun (3.5.086).
  const tableaux = [];
  const annee = anneeActive();
  let documentDUE = null;
  try { documentDUE = (await import('../routes/due.js')).documentDUE; } catch { /* */ }
  for (const u of aDeposer()) {
    const profId = u.apercuProfId || db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(u.id)?.professeur_id;
    if (!profId || !annee) continue;
    try { tableaux.push({ ens_id: u.id, contenu: await tableauDe(u, profId, annee, documentDUE) }); }
    catch (e) { console.error(`[espace enseignant] tableau ${u.id} :`, e.message); }
  }
  await appel('POST', '/interne/ens/depot', { enseignants, seances, etudiants: [...etudiants.values()], presences, attentes: [], tableaux,
    // La liste FERMÉE des motifs d'une absence justifiée : celle de Lucie, jamais une copie.
    motifs: Object.entries(MOTIFS_JUSTIFIES).map(([k, l]) => ({ k, l })) });
  return enseignants.length;
}

export async function releverEnseignants(appel) {
  const r = await appel('GET', '/interne/ens/releve');
  const ok = { demandes: [], entrees: [], gestes: [] };
  for (const d of r.demandes || []) {
    ok.demandes.push(d.id);
    const u = compte(d.ens_id);
    if (!u) continue;
    let sujet, html;
    if (d.type === 'lien') {
      const lien = String(d.valeur || '');
      if (!lien.startsWith(`${URL_ENS()}/?jeton=`) || !/^[A-Za-z0-9_-]{20,80}$/.test(lien.split('jeton=')[1] || '')) {
        console.error(`[espace enseignant] lien refusé pour le compte ${u.id} : il ne vient pas du portail.`); continue;
      }
      sujet = 'Institut Ilya Prigogine — votre espace enseignant';
      html = templateNotif({ titre: 'Votre espace enseignant', corps: `<p>Bonjour ${esc(u.prenom || '')},</p>
        <p>Voici votre lien pour votre espace enseignant : votre journée, vos présences, votre horaire. Il vaut 30 minutes et ne sert
        qu'une fois : il vous mène à <b>choisir votre mot de passe</b> pour cet espace. Ensuite, vous entrez avec votre adresse de
        l'institut et ce mot de passe.</p>
        <p><a href="${esc(lien)}" style="display:inline-block;background:#16406A;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Ouvrir mon espace</a></p>
        <p style="color:#64748b;font-size:12px">Vous n'avez rien demandé ? Ignorez ce message : sans ce lien, personne n'entre dans votre espace.</p>` });
    } else if (d.type === 'code') {
      if (!/^\d{6}$/.test(String(d.valeur || ''))) continue;
      sujet = `Institut Ilya Prigogine — votre code ${d.valeur}`;
      html = templateNotif({ titre: 'Votre code', corps: `<p>Votre code pour entrer dans votre espace enseignant depuis un nouvel appareil :</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${d.valeur}</p><p>Il vaut 10 minutes.</p>
        <p style="color:#64748b;font-size:12px">Vous n'avez rien demandé ? Ne communiquez ce code à personne.</p>` });
    } else continue;
    const envoi = await envoyerEmail({ to: u.email, subject: sujet, html }).catch(err => ({ ok: false, erreur: err.message }));
    if (envoi?.simule && process.env.NODE_ENV !== 'production') console.log(`[espace enseignant] ${d.type} (courriel simulé) : ${d.valeur}`);
    if (!envoi?.ok) console.error('[espace enseignant] courriel non parti :', envoi?.erreur);
  }
  for (const e of r.entrees || []) ok.entrees.push(e.id);
  let ecrites = 0;
  for (const g of r.gestes || []) {
    const u = compte(g.ens_id);
    let erreur = null;
    if (!u) erreur = 'Votre espace enseignant n’est plus ouvert.';
    else if (g.type !== 'presences') erreur = 'Geste inconnu.';
    else {
      let lignes = []; try { lignes = JSON.parse(g.contenu || '[]'); } catch { lignes = []; }
      const nom = `${String(u.nom || '').toUpperCase()} ${u.prenom || ''} (espace enseignant)`.trim();
      const out = presencesDepuisEspace(u, Number(g.seance_id), lignes, nom);
      if (out.erreur) erreur = out.erreur; else ecrites += out.ecrites || 0;
    }
    ok.gestes.push({ id: g.id, erreur });
  }
  if (ok.demandes.length || ok.entrees.length || ok.gestes.length) await appel('POST', '/interne/ens/acquitter', ok);
  return { gestes: ok.gestes.length, ecrites };
}

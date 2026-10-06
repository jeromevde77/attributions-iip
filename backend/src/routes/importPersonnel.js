// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Compléter les fiches du personnel depuis les fichiers de l'école
//
// (Charles, 6 octobre 2026 : trois classeurs déposés — le fichier
// « PROFESSEURS » de l'application de gestion (adresses, téléphones,
// courriels, appellation, matricule) et la liste « matricule, diplômes,
// statut ».) Les fiches de Lucie étaient presque vides de ce qu'ils portent :
// sexe, date de naissance, adresse, GSM, diplômes.
//
// LE MATRICULE FWB DIT LE SEXE ET LA NAISSANCE : 1 ou 2 (homme, femme), puis
// AAMMJJ — 19309230467 est un homme né le 23/09/1993. On le lit quand le
// fichier ne dit pas mieux.
//
// RÈGLES, comme tout import : rien ne s'écrit sans simulation ; on COMPLÈTE,
// on n'écrase pas — une valeur présente qui diffère du fichier est NOMMÉE, pas
// remplacée ; une personne du fichier absente de Lucie est listée, pas créée.
// Les diplômes deviennent des titres de capacité, seulement pour qui n'en a
// aucun. Chaque fiche touchée reçoit une ligne au journal du personnel.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { gesteRequis } from '../lib/gestes.js';
import { reconnaitreSexe } from '../lib/profilEtudiant.js';
import { normaliserTitres } from '../lib/titresCapacite.js';

const r = Router();
const t = v => String(v ?? '').trim();
const chiffres = v => t(v).replace(/\D/g, '');
const nu = v => t(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const nomCle = v => nu(v).replace(/\s/g, '');
const premier = v => nu(v).split(' ')[0] || '';

/** Le matricule FWB : sexe et date de naissance, quand il a la bonne forme. */
export function lireMatricule(m) {
  const c = chiffres(m);
  if (c.length !== 11 || !['1', '2'].includes(c[0])) return {};
  const [aa, mm, jj] = [c.slice(1, 3), c.slice(3, 5), c.slice(5, 7)];
  if (+mm < 1 || +mm > 12 || +jj < 1 || +jj > 31) return { sexe: c[0] === '1' ? 'M' : 'F' };
  return { sexe: c[0] === '1' ? 'M' : 'F', date_naissance: `19${aa}-${mm}-${jj}` };
}

/** Une ligne du fichier des professeurs, quelle que soit l'écriture des en-têtes. */
function lireLigne(l) {
  const v = cles => { for (const k of Object.keys(l)) if (cles.includes(nu(k).replace(/\s/g, ''))) { const x = t(l[k]); if (x) return x; } return ''; };
  const mat = chiffres(v(['mat', 'matricule', 'idprof']));
  const m = lireMatricule(mat);
  return {
    matricule: mat || null,
    nom: v(['nomprof', 'nom']), prenom: v(['preprof', 'prenom']),
    sexe: reconnaitreSexe(v(['appellation', 'titre', 'civilite'])) || m.sexe || null,
    date_naissance: m.date_naissance || null,
    adresse_rue: v(['adrnbte', 'adresse', 'rue']) || null,
    code_postal: v(['cp', 'codepostal']) || null,
    commune: v(['localite', 'commune']) || null,
    tel_gsm: v(['telgsm', 'gsm']) || v(['telpriv']) || null,
    mail_prive: v(['emailperso', 'mailprive']).toLowerCase() || null,
    adresse_mail: v(['emailecole', 'courrielecole']).toLowerCase() || null,
  };
}

function rapprocheur() {
  const profs = db.prepare(`SELECT id, nom, prenom, matricule, adresse_mail, mail_prive, sexe, date_naissance,
      adresse_rue, code_postal, commune, tel_gsm FROM professeur`).all();
  const parMat = new Map(), parMail = new Map(), parNomPrem = new Map(), parNom = new Map();
  const ajoute = (m, k, p) => { if (k) m.set(k, (m.get(k) || []).concat(p)); };
  for (const p of profs) {
    ajoute(parMat, chiffres(p.matricule), p); ajoute(parMail, t(p.adresse_mail).toLowerCase(), p);
    ajoute(parNomPrem, `${nomCle(p.nom)}|${premier(p.prenom)}`, p); ajoute(parNom, nomCle(p.nom), p);
  }
  const seul = l => (l && l.length === 1 ? l[0] : null);
  return f => {
    let p = f.matricule && seul(parMat.get(f.matricule)); if (p) return [p, 'matricule'];
    p = f.adresse_mail && seul(parMail.get(f.adresse_mail)); if (p) return [p, 'courriel école'];
    p = seul(parNomPrem.get(`${nomCle(f.nom)}|${premier(f.prenom)}`)); if (p) return [p, 'nom et prénom'];
    p = seul(parNom.get(nomCle(f.nom))); if (p) return [p, 'nom seul'];
    return [null, null];
  };
}

const CHAMPS = { matricule: 'Matricule', sexe: 'Sexe', date_naissance: 'Date de naissance', adresse_rue: 'Adresse',
  code_postal: 'Code postal', commune: 'Localité', tel_gsm: 'GSM', mail_prive: 'Courriel privé', adresse_mail: 'Courriel école' };

r.post('/fwb', authRequired, gesteRequis('personnel.fiche'), (req, res) => {
  const simulation = req.body?.simulation !== false;
  const lignes = Array.isArray(req.body?.profs) ? req.body.profs : [];
  const diplomes = Array.isArray(req.body?.diplomes) ? req.body.diplomes : [];
  if (!lignes.length && !diplomes.length) return res.status(400).json({ error: 'Aucune ligne reçue.' });
  const trouver = rapprocheur();
  const rapport = { lignes: lignes.length, retrouves: 0, methodes: {}, champs: {}, ecritures: [], desaccords: [],
    absents: [], titres_ajoutes: 0, titres_personnes: 0, titres_deja: 0, diplomes_sans_fiche: [] };
  const parMatricule = new Map();   // matricule du fichier → fiche, pour les diplômes
  const majs = [];
  for (const l of lignes) {
    const f = lireLigne(l);
    if (!f.nom) continue;
    const [p, comment] = trouver(f);
    if (!p) { rapport.absents.push(`${f.nom.toUpperCase()} ${f.prenom}`.trim()); continue; }
    rapport.retrouves++; rapport.methodes[comment] = (rapport.methodes[comment] || 0) + 1;
    if (f.matricule) parMatricule.set(f.matricule, p);
    const maj = {};
    for (const k of Object.keys(CHAMPS)) {
      const nouveau = f[k]; if (!nouveau) continue;
      const actuel = t(p[k]);
      if (!actuel) { maj[k] = nouveau; rapport.champs[k] = (rapport.champs[k] || 0) + 1; continue; }
      const egal = k === 'matricule' ? chiffres(actuel) === chiffres(nouveau)
        : k === 'sexe' ? actuel.toUpperCase() === nouveau
        : k === 'date_naissance' ? actuel.slice(0, 10) === nouveau
        : nu(actuel) === nu(nouveau);
      // Le désaccord se NOMME ; il ne s'écrit pas. Le GSM et l'adresse
      // changent au fil des années : seuls les désaccords d'identité comptent.
      if (!egal && ['matricule', 'sexe', 'date_naissance', 'adresse_mail'].includes(k)) {
        rapport.desaccords.push({ nom: `${String(p.nom).toUpperCase()} ${p.prenom || ''}`.trim(), champ: CHAMPS[k], lucie: actuel, fichier: nouveau });
      }
    }
    if (Object.keys(maj).length) {
      majs.push({ id: p.id, maj });
      rapport.ecritures.push({ nom: `${String(p.nom).toUpperCase()} ${p.prenom || ''}`.trim(), champs: Object.keys(maj).map(k => CHAMPS[k]) });
    }
  }
  // ── Les diplômes : par matricule (Id_Prof), sinon par nom.
  const titresAjouts = [];
  const aDesTitres = new Set(db.prepare('SELECT DISTINCT professeur_id FROM titre_capacite').all().map(x => x.professeur_id));
  for (const l of diplomes) {
    const mat = chiffres(l.Id_Prof ?? l.Matricule ?? l.Mat);
    const nomComplet = t(l.ZoneNomProf ?? l.Nom ?? '');
    let p = mat ? parMatricule.get(mat) : null;
    if (!p) { const [q] = trouver({ matricule: mat, nom: nomComplet.split(' ')[0], prenom: nomComplet.split(' ').slice(1).join(' '), adresse_mail: '' }); p = q; }
    const intitules = ['Dip1', 'Dip2', 'Dip3', 'Diplome1', 'Diplome2', 'Diplome3'].map(k => t(l[k])).filter(Boolean);
    if (!intitules.length) continue;
    if (!p) { if (nomComplet) rapport.diplomes_sans_fiche.push(nomComplet); continue; }
    if (aDesTitres.has(p.id)) { rapport.titres_deja++; continue; }
    aDesTitres.add(p.id);
    titresAjouts.push({ id: p.id, titres: normaliserTitres(intitules.map(i => ({ intitule: i }))) });
    rapport.titres_personnes++; rapport.titres_ajoutes += intitules.length;
  }

  if (!simulation) {
    const qui = req.user?.nom || req.user?.email || 'import';
    const journal = (() => { try { return db.prepare(`INSERT INTO journal_personnel (professeur_id, contenu, confidentiel, auteur, auteur_user_id) VALUES (?,?,0,?,?)`); } catch { return null; } })();
    db.transaction(() => {
      for (const { id, maj } of majs) {
        const cols = Object.keys(maj);
        db.prepare(`UPDATE professeur SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map(c => maj[c]), id);
        journal?.run(id, `Fiche complétée par l'import des fichiers de l'école : ${cols.map(c => CHAMPS[c]).join(', ')}.`, qui, req.user?.id || null);
      }
      const ins = db.prepare('INSERT INTO titre_capacite (professeur_id, date_obtention, intitule, delivre_par, ordre) VALUES (?,?,?,?,?)');
      for (const { id, titres } of titresAjouts) {
        titres.forEach((x, i) => ins.run(id, null, x.intitule, null, i));
        journal?.run(id, `Titres de capacité repris de la liste des diplômes : ${titres.map(x => x.intitule).join(' ; ')}.`, qui, req.user?.id || null);
      }
    })();
  }
  rapport.ecrit = !simulation;
  res.json(rapport);
});

export default r;

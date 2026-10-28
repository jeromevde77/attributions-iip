/**
 * LES ABSENCES AU-DELÀ DU SEUIL (Charles, 28 octobre 2026 : « possibilité
 * d'alerte pour qui en a besoin — l'étudiant dépasse le seuil —, ou mail à
 * l'étudiant : vous ne vous êtes pas présenté au cours de … »).
 *
 * Le calcul est celui de la grille de présence (`grilleUE`) : absences
 * injustifiées sur les heures dues des séances tenues. Le seuil est un réglage
 * de la présence par QR (`seuil_absence_pct`, 10 % par défaut — celui du
 * congé-éducation payé). Le mail à l'étudiant ne part JAMAIS seul : le
 * secrétariat en voit le texte, puis l'envoie ; chaque envoi s'écrit au
 * journal de la présence par QR, au nom de la personne connectée.
 */
import db from '../db/index.js';
import { grilleUE } from './grillePresence.js';
import { reglagesPresenceQr, journaliserPresenceQr, MENTION_PROPOSEE } from './presenceQr.js';

const fr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const heures = m => { const x = Math.round(m); return `${Math.floor(x / 60)}h${String(x % 60).padStart(2, '0')}`; };

/** Les UE de l'année qui ont des séances à l'horaire. */
function uesAvecSeances(annee) {
  return db.prepare(`SELECT DISTINCT COALESCE(s.ue_num, c.ue_num) AS ue FROM horaire_seance s
    LEFT JOIN cours c ON c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire
    WHERE s.annee_scolaire = ? AND COALESCE(s.ue_num, c.ue_num) IS NOT NULL ORDER BY ue`).all(annee).map(x => x.ue);
}

/** Le détail d'un étudiant dans la grille d'une UE : ses absences (injustifiées, et justifiées si demandé). */
function absencesDe(g, ligne, { justifiees = false } = {}) {
  return ligne.cases.map((c, i) => (c.statut === 'absent' || (justifiees && c.statut === 'justifie')
    ? { date: g.seances[i].date, heure: String(g.seances[i].heure_debut || '').slice(0, 5), cours: g.seances[i].cours_code,
        justifiee: c.statut === 'justifie' } : null)).filter(Boolean);
}
/** Le taux du seuil global : toutes les absences, ou les seules sans motif valable (réglage). */
const tauxTotal = (l, base = reglagesPresenceQr().seuil_global_base) =>
  (l.du ? (base === 'injustifiees' ? l.absent : l.absent + l.justifie) / l.du : 0);

/**
 * Les étudiants au-delà du seuil, UE par UE, du plus haut taux au plus bas.
 * `permis` : null = tous, sinon `etudiantId → bool` — le périmètre se juge sur la
 * section de l'ÉTUDIANT, pas sur celle de ses UE (`sectionPropre`, routes/etudiants.js).
 */
export function alertesAbsences(annee, { seuil = null, seuilGlobal = null, permis = null } = {}) {
  const reg = reglagesPresenceQr();
  const s = seuil ?? reg.seuil_absence_pct;
  const sg = seuilGlobal ?? reg.seuil_global_pct;
  const derniers = new Map(db.prepare(`SELECT etudiant_id, raison, MAX(le) AS le FROM presence_qr_journal
    WHERE type = 'avis_absence' GROUP BY etudiant_id, raison`).all().map(x => [`${x.etudiant_id}|${String(x.raison || '').split(' ')[1]}`, x.le]));
  const sortie = [];
  for (const ue of uesAvecSeances(annee)) {
    const x = grilleUE(ue, annee);
    const ueNom = db.prepare('SELECT MIN(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue, annee)?.n || '';
    for (const l of x.g.lignes) {
      const total = tauxTotal(l, reg.seuil_global_base);
      if (!l.du || (l.taux_injustifie * 100 <= s && total * 100 <= sg)) continue;
      if (permis && !permis(l.etudiant.id)) continue;
      sortie.push({
        etudiant_id: l.etudiant.id, nom: l.etudiant.nom, prenom: l.etudiant.prenom, id_ecampus: l.etudiant.id_ecampus,
        ue_num: ue, ue_nom: ueNom, taux: Math.round(l.taux_injustifie * 1000) / 10,
        taux_total: Math.round(total * 1000) / 10, depasse_global: total * 100 > sg,
        absent_min: l.absent, justifie_min: l.justifie, du_min: l.du, absences: absencesDe(x.g, l).length,
        prevenu_le: derniers.get(`${l.etudiant.id}|${ue}`) || null,
      });
    }
  }
  return { seuil: s, seuil_global: sg, base_globale: reg.seuil_global_base, mention_global: !!reg.mention_seuil_global,
    mention_proposee: reg.mention_seuil_global === MENTION_PROPOSEE,
    alertes: sortie.sort((a, b) => (b.depasse_global - a.depasse_global) || (b.taux_total - a.taux_total) || (b.taux - a.taux)) };
}

/** Le mail à l'étudiant, à relire avant l'envoi. */
export function avisAbsence(etudiantId, ueNum, annee) {
  const e = db.prepare('SELECT id, nom, prenom, email_ecole FROM etudiant WHERE id = ?').get(Number(etudiantId));
  if (!e) return { erreur: 'introuvable', message: 'Étudiant introuvable.' };
  const x = grilleUE(Number(ueNum), annee);
  const l = x.g.lignes.find(y => y.etudiant.id === e.id);
  if (!l) return { erreur: 'introuvable', message: 'Cet étudiant n’est pas inscrit à cette unité.' };
  const reg = reglagesPresenceQr();
  const total = tauxTotal(l, reg.seuil_global_base);
  const global = total * 100 > reg.seuil_global_pct;
  const toutes = reg.seuil_global_base !== 'injustifiees';
  const abs = absencesDe(x.g, l, { justifiees: global && toutes });
  if (!abs.length) return { erreur: 'rien', message: 'Aucune absence à signaler.' };
  if (!e.email_ecole) return { erreur: 'adresse', message: 'Cet étudiant n’a pas d’adresse d’école : l’avis ne peut pas partir.' };
  const ueNom = db.prepare('SELECT MIN(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(Number(ueNum), annee)?.n || '';
  const taux = Math.round(l.taux_injustifie * 1000) / 10;
  const subject = `Vos absences — UE ${ueNum}${ueNom ? ` ${ueNom}` : ''}`;
  const pc = v => String(Math.round(v * 1000) / 10).replace('.', ',');
  const lignes = abs.map(a => `– ${fr(a.date)} à ${a.heure} (${a.cours})${a.justifiee ? ' — absence justifiée' : ''}`);
  const text = [
    `Bonjour ${e.prenom || ''},`, '',
    global && toutes
      ? `Selon le registre des présences, vous avez été absent(e) aux séances suivantes de l'unité d'enseignement ${ueNum}${ueNom ? ` « ${ueNom} »` : ''} :`
      : `Selon le registre des présences, vous avez été absent(e) sans justificatif aux séances suivantes de l'unité d'enseignement ${ueNum}${ueNom ? ` « ${ueNom} »` : ''} :`,
    ...lignes, '',
    ...(global ? [toutes
      ? `Toutes absences confondues, justifiées ou non, vous avez manqué ${pc(total)} % des heures de cours tenues à ce jour (${heures(l.absent + l.justifie)} sur ${heures(l.du)}), au-delà du seuil de ${reg.seuil_global_pct} %.`
      : `Vos absences sans motif valable atteignent ${pc(total)} % des heures de cours tenues à ce jour (${heures(l.absent)} sur ${heures(l.du)}), au-delà du seuil de ${reg.seuil_global_pct} %.`,
      ...(reg.mention_seuil_global ? [reg.mention_seuil_global] : [])] : []),
    ...(l.absent && !(global && !toutes) ? [`Les absences sans justificatif représentent ${String(taux).replace('.', ',')} % des heures tenues (${heures(l.absent)} sur ${heures(l.du)}).`,
      'Si vous bénéficiez du congé-éducation payé, plus de 10 % d’absences injustifiées peut en suspendre le droit.'] : []), '',
    'Si une absence sans justificatif était en réalité justifiée, transmettez le justificatif au secrétariat : la présence sera corrigée.', '',
    'Le secrétariat de l’Institut Ilya Prigogine',
  ].join('\n');
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = text.split('\n').map(t => (t ? `<p style="margin:0 0 6px">${esc(t)}</p>` : '<p style="margin:0 0 6px">&nbsp;</p>')).join('');
  return { ok: true, to: e.email_ecole, subject, text, html, etudiant: e, taux, taux_total: Math.round(total * 1000) / 10,
    mention_manquante: global && !reg.mention_seuil_global };
}

/** Envoie l'avis (après lecture) et l'écrit au journal. `envoyer` : le service de courriel. */
export async function envoyerAvisAbsence(etudiantId, ueNum, annee, par, envoyer) {
  const a = avisAbsence(etudiantId, ueNum, annee);
  if (!a.ok) return a;
  const r = await envoyer({ to: a.to, subject: a.subject, html: a.html, text: a.text });
  if (r && r.ok === false) return { erreur: 'envoi', message: `Le mail n’est pas parti : ${r.erreur || 'erreur du service de courriel'}.` };
  journaliserPresenceQr('avis_absence', { etudiant_id: a.etudiant.id,
    raison: `UE ${ueNum} — ${String(a.taux).replace('.', ',')} % injustifiées, ${String(a.taux_total).replace('.', ',')} % au total`, par });
  return { ok: true, to: a.to };
}

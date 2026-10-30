/**
 * LA GRILLE DE PRÉSENCE (Charles, 28 octobre 2026 : « une liste de présence au
 * format tableau — les étudiants en lignes, les séances en colonnes ; par cours
 * puis par UE, car la vérificatrice demande les présences dans l'UE »).
 *
 * Une seule composition pour les deux portées : le COURS (les étudiants et les
 * séances du professeur, depuis Mes cours) et l'UE (ses inscrits, toutes les
 * séances de tous ses cours, dans l'ordre du temps, puis le récapitulatif des
 * heures par cours). PDF A4 paysage dans l'enveloppe commune, et Excel — la
 * vérificatrice trie et recompte.
 *
 * Les cases : P présent, A absent, J justifié (le motif en note, sous le
 * tableau), — non concerné (autre sous-groupe), vide = pas encore encodé ; une
 * séance annulée est grisée. Les heures se comptent sur les séances PASSÉES et
 * tenues, comme pour le congé-éducation (`minutesDe`) ; le taux d'absence
 * injustifiée se lit sur ce que l'étudiant devait suivre, et se signale
 * au-delà de 10 % (le seuil du congé-éducation payé).
 */
import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { envelopperDocument } from './document.js';
import { minutesDe, MOTIFS_JUSTIFIES, dispenses } from './cep.js';

export const CODES = { present: 'P', absent: 'A', justifie: 'J', non_concerne: '—', dispense: 'D' };
const PAR_PAGE = 20;            // séances par feuille, en paysage
const SEUIL_CEP = 0.10;

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const jm = d => { const [, m, j] = String(d || '').slice(0, 10).split('-'); return `${j}/${m}`; };
const h = m => { const x = Math.round(m); return `${Math.floor(x / 60)}h${String(x % 60).padStart(2, '0')}`; };
const nomDe = e => `${String(e.nom || '').toLocaleUpperCase('fr')} ${e.prenom || ''}`.trim();

/**
 * Les données de la grille. `seances` : lignes de horaire_seance (id, date,
 * heure_debut, heure_fin, minutes, cours_code, annule, sous_groupe) ;
 * `etudiants` : { id, nom, prenom, id_ecampus }. `du` / `au` bornent la période.
 */
/** Les dispenses de chaque étudiant pour une UE (valorisation accordée, report d'office) :
 *  `Map(etudiant_id → { complete, cours: Set })`. RGE du supérieur, art. 6 : l'assiduité se
 *  compte sur les activités « dont il n'est pas dispensé ». */
export function dispensesUE(etudiants, ueNum, annee) {
  return new Map(etudiants.map(e => [e.id, dispenses(e.id, ueNum, annee)]));
}

export function donneesGrille({ seances, etudiants, du = null, au = null, dixieme = null, dispensesParEtudiant = null, aujourdhui = new Date().toISOString().slice(0, 10) }) {
  const s = seances.filter(x => (!du || x.date >= du) && (!au || x.date <= au))
    .sort((a, b) => `${a.date} ${a.heure_debut}`.localeCompare(`${b.date} ${b.heure_debut}`));
  const etus = [...etudiants].sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'fr'));
  const ids = s.map(x => x.id);
  const pres = new Map();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 500) {
      const lot = ids.slice(i, i + 500);
      for (const p of db.prepare(`SELECT seance_id, etudiant_id, statut, motif, retard FROM presence
          WHERE seance_id IN (${lot.map(() => '?').join(',')})`).all(...lot)) pres.set(`${p.seance_id}|${p.etudiant_id}`, p);
    }
  }
  const tenue = x => !x.annule && x.date <= aujourdhui;
  const lignes = etus.map(e => {
    const t = { present: 0, justifie: 0, absent: 0, non_encodees: 0, retards: 0, par_cours: {} };
    const disp = dispensesParEtudiant?.get(e.id);
    const cases = s.map(x => {
      const p = pres.get(`${x.id}|${e.id}`);
      // Une activité dont l'étudiant est dispensé ne lui est pas due : « D », hors compte.
      if (disp && (disp.complete || disp.cours.has(x.cours_code))) return { code: x.annule ? '' : CODES.dispense, statut: 'dispense', motif: null };
      if (tenue(x) && p?.statut !== 'non_concerne') {
        const m = minutesDe(x);
        const c = (t.par_cours[x.cours_code || ''] ||= { present: 0, du: 0 });
        c.du += m;
        if (p?.statut === 'present') { t.present += m; c.present += m; if (p.retard) t.retards++; }
        else if (p?.statut === 'justifie') t.justifie += m;
        else if (p?.statut === 'absent') t.absent += m;
        else t.non_encodees++;
      }
      // Un retard reste une présence : « P* », compté dans les heures présentes.
      return { code: x.annule ? '' : (p ? (CODES[p.statut] || '') + (p.statut === 'present' && p.retard ? '*' : '') : ''),
        statut: p?.statut || null, motif: p?.motif || null, retard: !!(p?.statut === 'present' && p.retard) };
    });
    // Les heures dues : toutes les séances tenues où l'étudiant est concerné,
    // encodées ou non — le total de l'UE est la somme de ses cours.
    const du = Object.values(t.par_cours).reduce((a, c) => a + c.du, 0);
    return { etudiant: e, cases, ...t, du, taux_injustifie: du ? t.absent / du : 0 };
  });
  const parSeance = s.map((x, i) => lignes.filter(l => l.cases[i].statut === 'present').length);
  // Les motifs des absences justifiées, étudiant par étudiant : la note sous la grille.
  const motifs = lignes.flatMap(l => l.cases.map((c, i) => (c.statut === 'justifie'
    ? { etudiant: nomDe(l.etudiant), date: s[i].date, heure: s[i].heure_debut, cours: s[i].cours_code,
        motif: MOTIFS_JUSTIFIES[c.motif] || c.motif || 'motif non précisé' } : null)).filter(Boolean));
  return { seances: s, lignes, parSeance, motifs, dixieme };
}

/**
 * LE PREMIER DIXIÈME DE L'UE (Charles, 28 octobre 2026). Il se lit dans le
 * CALENDRIER, pas dans les heures : un dixième de l'écart entre la première et
 * la dernière date de cours de l'UE (tous ses cours, séances annulées
 * exclues). Ce jour-là peut ne porter aucun cours — on prend alors la date de
 * séance réelle la plus proche, la plus tôt en cas d'égalité.
 */
export function premierDixieme(seances) {
  const dates = [...new Set(seances.filter(x => !x.annule && x.date).map(x => String(x.date).slice(0, 10)))].sort();
  if (!dates.length) return null;
  const jour = d => Date.parse(d + 'T00:00:00Z') / 86400000;
  const premiere = dates[0], derniere = dates[dates.length - 1];
  const cible = jour(premiere) + (jour(derniere) - jour(premiere)) / 10;
  const theorique = new Date(Math.round(cible) * 86400000).toISOString().slice(0, 10);
  let date = dates[0];
  for (const d of dates) if (Math.abs(jour(d) - cible) < Math.abs(jour(date) - cible)) date = d;
  return { date, theorique, premiere, derniere };
}

/** La phrase qui l'annonce sur la pièce. */
export function phraseDixieme(dx) {
  if (!dx) return null;
  return `Premier dixième de l’UE : ${fr(dx.date)}`
    + (dx.date !== dx.theorique ? ` (1/10 entre le ${fr(dx.premiere)} et le ${fr(dx.derniere)} = ${fr(dx.theorique)}, sans cours : séance la plus proche)` : ` (1/10 entre le ${fr(dx.premiere)} et le ${fr(dx.derniere)})`);
}

/** Le PDF (HTML de l'enveloppe commune). `cours` : { code → nom } pour le récapitulatif de l'UE. */
export function htmlGrille(g, opts) {
  const d = pieceGrille(g, opts);
  return envelopperDocument({ html: d.corps, titre: d.titre, orientation: d.orientation,
    margeCote: d.margeCote, margeHaut: d.margeHaut, entete: d.entete, styles: d.styles });
}

/** Le corps de la pièce et ses styles, sans l'enveloppe : Mes cours et le
 *  centre d'impression (`routes/rapports.js`) les enveloppent chacun. */
export function pieceGrille(g, { titre, sous, ligne = null, ue = false, cours = {} }) {
  const blocs = [];
  for (let i = 0; i < Math.max(1, g.seances.length); i += PAR_PAGE) {
    const tranche = g.seances.slice(i, i + PAR_PAGE);
    const dix = x => g.dixieme && String(x.date).slice(0, 10) === g.dixieme.date;
    const tete = tranche.map(x => `<th class="sc${x.annule ? ' ann' : ''}${dix(x) ? ' dix' : ''}">${dix(x) ? '<span class="tag">1/10</span><br>' : ''}${jm(x.date)}<br>${esc(String(x.heure_debut || '').slice(0, 5))}`
      + `${ue ? `<br><span class="cc">${esc(x.cours_code || '')}</span>` : ''}${x.annule ? '<br><span class="cc">annulée</span>' : ''}</th>`).join('');
    const derniere = i + PAR_PAGE >= g.seances.length;
    const corps = g.lignes.map(l => `<tr><td class="nom"><b>${esc(String(l.etudiant.nom || '').toUpperCase())}</b> ${esc(l.etudiant.prenom || '')}`
      + `<span class="mat">${esc(l.etudiant.id_ecampus || '')}</span></td>`
      + l.cases.slice(i, i + PAR_PAGE).map((c, k) => `<td class="c ${tranche[k].annule ? 'ann' : ''} ${dix(tranche[k]) ? 'dix' : ''} ${c.statut || ''}">${esc(c.code)}</td>`).join('')
      + (derniere ? `<td class="tot">${h(l.present)} / ${h(l.du)}</td><td class="tot${l.taux_injustifie > SEUIL_CEP ? ' alerte' : ''}">${Math.round(l.taux_injustifie * 100)} %</td>` : '')
      + '</tr>').join('');
    const pied = `<tr class="pied"><td class="nom">Présents</td>${g.parSeance.slice(i, i + PAR_PAGE).map((n, k) => `<td class="c${dix(tranche[k]) ? ' dix' : ''}">${n}</td>`).join('')}`
      + `${derniere ? '<td class="tot"></td><td class="tot"></td>' : ''}</tr>`;
    blocs.push(`<div${i ? ' class="saut"' : ''}>
      ${g.seances.length > PAR_PAGE ? `<div class="tranche">Séances ${i + 1} à ${Math.min(i + PAR_PAGE, g.seances.length)} sur ${g.seances.length}</div>` : ''}
      <table class="grille"><thead><tr><th class="nom">Étudiant</th>${tete}${derniere ? '<th class="tot">Heures présentes / dues</th><th class="tot">Absences injustifiées</th>' : ''}</tr></thead>
      <tbody>${corps || `<tr><td class="nom" colspan="${tranche.length + 3}">Aucun étudiant.</td></tr>`}${pied}</tbody></table></div>`);
  }
  if (!g.seances.length) blocs.splice(0, blocs.length, '<p>Aucune séance dans l’horaire pour cette période.</p>');

  // LE RÉCAPITULATIF DE L'UE : les heures, cours par cours, puis le total.
  let recap = '';
  if (ue) {
    const codes = [...new Set(g.seances.map(x => x.cours_code || ''))];
    recap = `<div class="saut"><div class="tranche">Récapitulatif des heures par cours</div>
      <table class="grille recap"><thead><tr><th class="nom">Étudiant</th>${codes.map(c => `<th>${esc(c)}<br><span class="cc">${esc(cours[c] || '')}</span></th>`).join('')}<th class="tot">Total UE</th><th class="tot">Absences injustifiées</th><th class="tot">Séances non encodées</th></tr></thead>
      <tbody>${g.lignes.map(l => `<tr><td class="nom"><b>${esc(String(l.etudiant.nom || '').toUpperCase())}</b> ${esc(l.etudiant.prenom || '')}</td>`
        + codes.map(c => { const x = l.par_cours[c]; return `<td class="c">${x ? `${h(x.present)} / ${h(x.du)}` : '—'}</td>`; }).join('')
        + `<td class="tot">${h(l.present)} / ${h(l.du)}</td><td class="tot${l.taux_injustifie > SEUIL_CEP ? ' alerte' : ''}">${Math.round(l.taux_injustifie * 100)} %</td><td class="tot${l.non_encodees ? ' alerte' : ''}">${l.non_encodees || ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const notes = g.motifs.length ? `<div class="notes"><b>Absences justifiées</b><ul>${g.motifs.map(m =>
    `<li>${esc(m.etudiant)} — ${fr(m.date)} ${esc(String(m.heure || '').slice(0, 5))}${ue ? ` (${esc(m.cours)})` : ''} : ${esc(m.motif)}</li>`).join('')}</ul></div>` : '';
  const legende = `<div class="legende">P présent · P* présent, arrivé en retard (compté présent) · A absent · J absence justifiée (motif ci-dessous) · — non concerné (autre sous-groupe) · D dispensé (valorisation ou report : hors heures dues) · case vide : non encodé · colonne grisée : séance annulée.
    Heures : séances tenues jusqu’à aujourd’hui. Absences injustifiées : sur les heures dues ; signalées au-delà de 10 % (seuil du congé-éducation payé).</div>`;
  return {
    corps: (g.dixieme ? `<div class="dixieme"><b>${esc(phraseDixieme(g.dixieme))}</b></div>` : '') + blocs.join('') + recap + legende + notes, titre, orientation: 'paysage', margeCote: 12, margeHaut: 12,
    entete: { titre, sous, ligne },
    styles: `
.grille{border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:auto}
.grille th,.grille td{border:.2mm solid #D8DCE4;padding:.8mm 1mm;text-align:center}
.grille thead th{background:#F1F4F9;color:#475569;font-weight:600;font-size:6.5pt;line-height:1.15}
.grille .nom{text-align:left;white-space:nowrap;min-width:42mm}
.grille .mat{display:block;font-size:6pt;color:#94a3b8}
.grille .cc{font-weight:400;color:#64748b}
.grille .ann{background:#EEF0F3;color:#94a3b8}
.grille td.absent{color:#9D4A38;font-weight:700}
.grille td.justifie{color:#B45309;font-weight:700}
.grille td.present{color:#3E7D5E;font-weight:700}
.grille td.dispense{color:#94a3b8;background:#F7F8FA}
.grille .tot{white-space:nowrap;font-weight:600}
.grille .alerte{color:#9D4A38}
.grille tr.pied td{background:#F7F8FA;font-weight:600}
.grille tr{break-inside:avoid}
.grille .dix{border-left:.6mm solid #C9A84C;border-right:.6mm solid #C9A84C}
.grille .tag{display:inline-block;background:#C9A84C;color:#fff;border-radius:1mm;padding:0 .8mm;font-weight:700}
.dixieme{font-size:8pt;margin:0 0 2mm;color:#1B2B4B}.dixieme b{color:#8a6d1f}
.tranche{font-size:8pt;color:#64748b;margin:0 0 1.5mm}
.saut{break-before:page;page-break-before:always}
.legende{font-size:7pt;color:#64748b;margin-top:3mm}
.notes{font-size:7.5pt;margin-top:3mm}.notes ul{margin:1mm 0 0 4mm;padding:0}`,
  };
}

/** Le classeur Excel : la grille, le récapitulatif (UE), les motifs. */
export async function excelGrille(g, { titre, ue = false, cours = {} }) {
  const wb = new ExcelJS.Workbook();
  const f = wb.addWorksheet('Grille', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
  f.addRow([g.dixieme ? `${titre} — ${phraseDixieme(g.dixieme)}` : titre]);
  f.addRow(['Nom', 'Prénom', 'Matricule', ...g.seances.map(x => `${fr(x.date)} ${String(x.heure_debut || '').slice(0, 5)}${ue ? ` ${x.cours_code || ''}` : ''}${x.annule ? ' (annulée)' : ''}${g.dixieme && String(x.date).slice(0, 10) === g.dixieme.date ? ' — 1/10' : ''}`),
    'Heures présentes', 'Heures dues', 'Absences injustifiées (%)']);
  for (const l of g.lignes) {
    f.addRow([String(l.etudiant.nom || '').toUpperCase(), l.etudiant.prenom || '', l.etudiant.id_ecampus || '', ...l.cases.map(c => c.code),
      Math.round(l.present / 6) / 10, Math.round(l.du / 6) / 10, Math.round(l.taux_injustifie * 1000) / 10]);
  }
  f.addRow(['Présents', '', '', ...g.parSeance]);
  f.getRow(2).font = { bold: true };
  g.seances.forEach((x, i) => {
    if (g.dixieme && String(x.date).slice(0, 10) === g.dixieme.date)
      f.getColumn(4 + i).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6EBC8' } }; });
  });
  f.getColumn(1).width = 22; f.getColumn(2).width = 16; f.getColumn(3).width = 12;
  if (ue) {
    const codes = [...new Set(g.seances.map(x => x.cours_code || ''))];
    const r = wb.addWorksheet('Récapitulatif UE');
    r.addRow(['Nom', 'Prénom', ...codes.flatMap(c => [`${c} ${cours[c] || ''} — présentes (h)`.replace('  ', ' '), `${c} — dues (h)`]), 'Total présentes (h)', 'Total dues (h)', 'Absences injustifiées (%)', 'Séances non encodées']);
    for (const l of g.lignes) {
      r.addRow([String(l.etudiant.nom || '').toUpperCase(), l.etudiant.prenom || '',
        ...codes.flatMap(c => { const x = l.par_cours[c]; return x ? [Math.round(x.present / 6) / 10, Math.round(x.du / 6) / 10] : ['', '']; }),
        Math.round(l.present / 6) / 10, Math.round(l.du / 6) / 10, Math.round(l.taux_injustifie * 1000) / 10, l.non_encodees || '']);
    }
    r.getRow(1).font = { bold: true };
  }
  const m = wb.addWorksheet('Absences justifiées');
  m.addRow(['Étudiant', 'Date', 'Heure', 'Cours', 'Motif']);
  for (const x of g.motifs) m.addRow([x.etudiant, fr(x.date), String(x.heure || '').slice(0, 5), x.cours || '', x.motif]);
  m.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

// ── LA GRILLE HORS DE MES COURS : le centre d'impression ──────────────────
/* Le secrétariat n'entre pas dans Mes cours, et c'est lui qui répond à la
 * vérificatrice (Charles, 28 octobre 2026). Le centre d'impression sort donc la
 * même grille, par UE ou par cours, avec les mêmes données et la même règle
 * d'accès que Mes cours : direction, secrétariat, coordination de la section. */
export const ROLES_GRILLE = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];

/** `perimetre` : null = toutes les sections, sinon la liste de celles permises. */
export function grillePermise(role, perimetre, ueNum) {
  if (!ROLES_GRILLE.includes(role)) return false;
  if (!perimetre) return true;
  return db.prepare('SELECT DISTINCT section FROM ue WHERE ue_num = ? AND section IS NOT NULL').all(ueNum)
    .some(x => perimetre.includes(x.section));
}

/** Les cours de l'UE et toutes leurs séances de l'année. */
export function seancesDeLUE(ueNum, annee) {
  const coursUE = db.prepare('SELECT cours_code, MIN(cours_nom) AS nom FROM cours WHERE ue_num = ? AND annee_scolaire = ? GROUP BY cours_code').all(ueNum, annee);
  const codes = coursUE.map(c => c.cours_code);
  const seances = db.prepare(`SELECT id, date, heure_debut, heure_fin, minutes, cours_code, sous_groupe, COALESCE(annule, 0) AS annule
    FROM horaire_seance WHERE annee_scolaire = ? AND (ue_num = ?${codes.length ? ` OR cours_code IN (${codes.map(() => '?').join(',')})` : ''})`).all(annee, ueNum, ...codes);
  return { coursUE, seances };
}

/** Les inscrits actifs de l'UE pour l'année. */
export function inscritsDeLUE(ueNum, annee) {
  return db.prepare(`SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id WHERE i.annee_scolaire = ? AND i.ue_num = ? AND e.actif = 1`).all(annee, ueNum);
}

const periodeLigne = (du, au) => (du || au
  ? `Période : ${du ? fr(du) : 'début'} – ${au ? fr(au) : 'aujourd’hui'}` : 'Toute l’année');

/** La grille de toute l'UE : ses inscrits, toutes les séances de tous ses cours. */
export function grilleUE(ueNum, annee, { du = null, au = null } = {}) {
  const { coursUE, seances } = seancesDeLUE(ueNum, annee);
  const etudiants = inscritsDeLUE(ueNum, annee);
  const ueNom = db.prepare('SELECT MIN(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ueNum, annee)?.n || '';
  const g = donneesGrille({ seances, etudiants, du, au, dixieme: premierDixieme(seances), dispensesParEtudiant: dispensesUE(etudiants, ueNum, annee) });
  return { g, opts: { titre: `Grille de présence — UE ${ueNum}${ueNom ? ` · ${ueNom}` : ''}`,
    sous: `${coursUE.length} cours · ${etudiants.length} inscrits · ${annee}`, ligne: periodeLigne(du, au), ue: true,
    cours: Object.fromEntries(coursUE.map(c => [c.cours_code, c.nom])) },
    nom: `Presences_UE${ueNum}_${annee}` };
}

/** La grille d'un cours, vue de l'établissement : toutes ses séances de l'année
 *  et les inscrits de son UE (un sous-groupe se lit « — » quand il est encodé). */
export function grilleCours(coursCode, annee, { du = null, au = null } = {}) {
  const c = db.prepare('SELECT ue_num, cours_nom FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1').get(coursCode, annee);
  if (!c) return null;
  const { seances: toutes } = seancesDeLUE(c.ue_num, annee);
  const seances = toutes.filter(x => x.cours_code === coursCode);
  const etudiants = inscritsDeLUE(c.ue_num, annee);
  const g = donneesGrille({ seances, etudiants, du, au, dixieme: premierDixieme(toutes), dispensesParEtudiant: dispensesUE(etudiants, c.ue_num, annee) });
  return { ueNum: c.ue_num, g, opts: { titre: `Grille de présence — ${coursCode}${c.cours_nom ? ` · ${c.cours_nom}` : ''}`,
    sous: `UE ${c.ue_num} · ${etudiants.length} inscrits · ${annee}`, ligne: periodeLigne(du, au) },
    nom: `Presences_${coursCode}_${annee}` };
}

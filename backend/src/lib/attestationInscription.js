// ─────────────────────────────────────────────────────────────────────────────
// L'ATTESTATION D'INSCRIPTION (3.5.352, Charles, 12 novembre 2026 : « je veux ce document dans Éditions avec la nouvelle
// mise en page » — la « Lettre 1 » du secrétariat, un Word rempli à la main : allocations familiales, mutuelle, CPAS…).
// Une page par étudiant et par année : qui signe, qui est inscrit, dans quelle section, les dates de l'année, les congés,
// le niveau d'enseignement, la question des 17 heures, le bloc et les crédits du programme, la signature et le cachet.
//
// Rien ne se tape : le directeur vient de l'identité de l'établissement ; l'étudiant de sa fiche ; la section de son
// rattachement ; les dates de l'année du calendrier des cours ; les congés des FERMETURES DE L'AGENDA DE L'ÉCOLE (elles font
// foi depuis 3.5.145), à défaut du calendrier ; le bloc de `niveauEtudiant` ; les crédits du programme de l'année.
// LES 17 HEURES SE CALCULENT (Charles, 12 novembre 2026) : les séances de l'horaire qui concernent l'étudiant (`seancesEtudiant` :
// hors stages, épreuve intégrée, dispenses, séances annulées) ; sans horaire, les périodes de cours du PAE (50 min). Divisées par
// les semaines de cours, CONGÉS RETIRÉS. La réponse peut être forcée à l'impression (fenêtre de l'écran, `?dixsept=oui|non`).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { envelopper, frDate } from '../routes/attestations.js';
import { enteteDocument } from './document.js';
import { identiteEtablissement } from '../routes/config.js';
import { sectionRattachement, niveauEtudiant } from '../routes/etudiants.js';
import { fermetures } from './agendaEcole.js';
import { congesDe, seancesEtudiant, unitesInscrites, dispenses } from './cep.js';
import { donneesSectionDiplome } from '../routes/diplomes.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jour = d => (d ? frDate(String(d).slice(0, 10)) : '……………');
const plus = (d, n) => { const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const essai = (f, defaut) => { try { return f(); } catch { return defaut; } };

const feminin = e => /^(mme|madame|mlle|mademoiselle|m\.?me|f)\b/i.test(String(e.titre || e.sexe || '').trim());

/** Les dates de l'année des cours : de la première semaine du calendrier à la dernière (hors congés). */
function datesDeLAnnee(annee) {
  const l = essai(() => db.prepare(`SELECT date_debut, date_fin, type FROM annee_calendrier WHERE annee_scolaire = ?
    ORDER BY date_debut`).all(annee), []).filter(w => w.type !== 'vacances');
  if (!l.length) return { debut: null, fin: null };
  return { debut: l[0].date_debut, fin: l[l.length - 1].date_fin };
}

/** Le nom d'un congé, d'après son libellé ou, à défaut, son mois. */
function nomConge(libelle, du) {
  const t = String(libelle || '').trim();
  if (t && !/^(école fermée|congé|vacances|fermeture)$/i.test(t)) return t.replace(/^(vacances|congé)\s+(de\s+|d['’]\s*)?/i, '');
  const m = Number(String(du).slice(5, 7));
  return ({ 10: 'Toussaint', 11: 'Toussaint', 12: 'Noël', 1: 'Noël', 2: 'Carnaval', 3: 'Carnaval', 4: 'Pâques', 5: 'Pâques', 7: 'été', 8: 'été' })[m] || '';
}
const intitule = n => {
  if (!n) return 'Congé';
  if (/^été$/i.test(n)) return 'Vacances d’été';
  if (/^(noël|pâques|carnaval|toussaint|automne|printemps|hiver|détente)/i.test(n)) return `Vacances ${/^[aeiouéèêh]/i.test(n) ? 'd’' : 'de '}${n}`;
  return n.charAt(0).toUpperCase() + n.slice(1);
};

/** Les congés de l'année, de la rentrée à la veille de la rentrée suivante. */
export function congesDeLAnnee(annee, debut, fin) {
  const out = [];
  const ferm = [...fermetures(annee).entries()].filter(([, f]) => f.fermeture === 'totale' || f.fermeture === 'partielle')
    .map(([lundi, f]) => ({ du: lundi, au: plus(lundi, 6), libelle: f.libelle })).sort((a, b) => a.du.localeCompare(b.du));
  const source = ferm.length ? ferm
    : (congesDe(annee).vacances || []).map(v => ({ du: v.du, au: plus(v.au, 2), libelle: v.label }));
  for (const w of source) {
    const nom = nomConge(w.libelle, w.du);
    const der = out[out.length - 1];
    if (der && plus(der.au, 1) >= w.du && der.nom === nom) der.au = w.au;
    else out.push({ du: w.du, au: w.au, nom });
  }
  // L'été des étudiants commence au lendemain de la fin de l'année et court jusqu'à la veille de la rentrée suivante.
  const [, a2] = String(annee).split('-').map(Number);
  const suivante = datesDeLAnnee(`${a2}-${a2 + 1}`).debut;
  const sansEte = out.filter(c => !/^été$/i.test(c.nom) && (!fin || c.du <= fin) && (!debut || c.au >= debut));
  if (fin) sansEte.push({ du: plus(fin, 1), au: suivante ? plus(suivante, -1) : `${a2}-08-31`, nom: 'été' });
  return sansEte.map(c => ({ ...c, intitule: intitule(c.nom) }));
}

/** L'intitulé de la section : celui du titre (« Bachelier en psychomotricité »), comme le diplôme — donneesSectionDiplome. */
function intituleSection(code) {
  if (!code) return null;
  const d = essai(() => donneesSectionDiplome(code), null) || {};
  const s = essai(() => db.prepare('SELECT libelle, niveau FROM section WHERE code = ?').get(code), null) || {};
  const lib = String(d.intitule_section || s.libelle || code).trim(), niv = String(s.niveau || '').trim();
  const libelle = !niv || lib.toLowerCase().includes(niv.toLowerCase()) || d.intitule_section ? lib : `${niv} en ${lib}`;
  return { libelle, type: `${d.type_enseignement || ''} ${niv}` };
}

const lundiDe = d => { const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const HORS_COURS = /\bstages?\b|épreuve intégrée|epreuve integree|développement professionnel|developpement professionnel/i;

/** Les semaines de cours de l'année : de la rentrée à la fin, MOINS LES SEMAINES DE CONGÉ (Charles, 12 novembre 2026). */
export function semainesDeCours(annee, debut, fin, conges) {
  if (!debut || !fin) return 0;
  const enConge = l => conges.some(c => c.du <= plus(l, 4) && c.au >= l);   // une semaine dont un jour ouvrable est en congé
  let n = 0;
  for (let l = lundiDe(debut); l <= fin; l = plus(l, 7)) if (!enConge(l)) n++;
  return n;
}

/** Les périodes de cours du programme : unités inscrites hors épreuve intégrée, cours hors stage, hors dispenses. */
export function periodesDuPAE(etudId, annee) {
  let total = 0;
  for (const u of essai(() => unitesInscrites(etudId, annee), [])) {
    if (u.epreuve_integree) continue;
    const disp = essai(() => dispenses(etudId, u.ue_num, annee), { complete: false, cours: new Set() });
    if (disp.complete) continue;
    const vus = new Set();
    for (const c of essai(() => db.prepare(`SELECT cours_code, cours_nom, COALESCE(cours_per, 0) per, COALESCE(is_stage, 0) stage FROM cours
        WHERE ue_num = ? AND cours_code IS NOT NULL ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC`).all(u.ue_num, annee), [])) {
      if (vus.has(c.cours_code)) continue; vus.add(c.cours_code);
      if (c.stage || HORS_COURS.test(c.cours_nom || '') || disp.cours.has(c.cours_code)) continue;
      total += Number(c.per) || 0;
    }
  }
  return total;
}

/** LA QUESTION DES 17 HEURES : l'horaire de l'étudiant d'abord ; sans horaire, les périodes du PAE (une période = 50 min).
 *  Les deux se divisent par les semaines de cours, congés retirés. */
export function calculDixSept(etudId, annee, { debut, fin, conges }) {
  const semaines = semainesDeCours(annee, debut, fin, conges);
  let min = 0;
  for (const u of essai(() => unitesInscrites(etudId, annee), [])) {
    if (u.epreuve_integree) continue;
    const { seances } = essai(() => seancesEtudiant(etudId, u.ue_num, annee), { seances: [] });
    for (const x of seances) if (!x.annule && !x.dispense) min += Number(x.min) || 0;
  }
  const periodes = periodesDuPAE(etudId, annee);
  const arrondi = v => Math.round(v * 10) / 10;
  const parHoraire = semaines && min ? arrondi(min / 60 / semaines) : null;
  const parPAE = semaines && periodes ? arrondi((periodes * 50) / 60 / semaines) : null;
  const heures = parHoraire ?? parPAE;
  return { semaines, heures_horaire: min ? arrondi(min / 60) : 0, periodes, par_horaire: parHoraire, par_pae: parPAE,
    heures, source: parHoraire != null ? 'horaire' : parPAE != null ? 'pae' : null, oui: heures != null ? heures >= 17 : null };
}

/** Tout ce que la pièce lit, ou l'erreur qui l'arrête. */
export function chargerAttestationInscription(etudId, annee, { force = null } = {}) {
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(etudId));
  if (!e) return { code: 404, erreur: 'étudiant introuvable' };
  const ins = db.prepare(`SELECT i.ue_num, i.date_inscription,
      (SELECT ects FROM ue x WHERE x.ue_num = i.ue_num AND x.ects IS NOT NULL ORDER BY (x.annee_scolaire = ?) DESC, x.annee_scolaire DESC LIMIT 1) AS ects
    FROM etudiant_inscription i WHERE i.etudiant_id = ? AND i.annee_scolaire = ?`).all(annee, e.id, annee);
  if (!ins.length) return { code: 409, erreur: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} n’a aucune unité au programme de ${annee} : il n’y a pas d’inscription à attester.` };
  let section = null;
  try { section = sectionRattachement(e.id, annee).section || null; } catch { /* */ }
  const sec = intituleSection(section);
  const niv = essai(() => niveauEtudiant(e.id, annee), {}) || {};
  const bloc = niv.niveau && /^BA\d$/i.test(niv.niveau) ? niv.niveau.toUpperCase() : null;
  const ects = ins.reduce((t, i) => t + (Number(i.ects) || 0), 0);
  const { debut, fin } = datesDeLAnnee(annee);
  const inscritLe = ins.map(i => String(i.date_inscription || '').slice(0, 10)).filter(Boolean).sort()[0] || null;
  const tardif = !!(inscritLe && debut && inscritLe > debut);
  const superieur = !/secondaire|CESS|CQ/i.test(sec?.type || '');
  const conges = congesDeLAnnee(annee, debut, fin);
  const dixsept = calculDixSept(e.id, annee, { debut, fin, conges });
  if (force === 'oui' || force === 'non') dixsept.force = force;
  return { dixsept, etudiant: e, annee, section, section_libelle: sec?.libelle || null, bloc, ects, debut, fin,
    inscrit_le: tardif ? inscritLe : null, superieur, conges };
}

/** Compose la pièce. Rend { html, nom } ou { code, erreur }. */
export const VARIANTES = {
  inscription: { titre: 'Attestation d’inscription', fichier: 'Attestation-inscription', programme: true },
  // La « lettre 1 » des allocations familiales : même pièce, titrée pour la caisse, sans le bloc ni les crédits.
  allocations: { titre: 'Attestation d’inscription — allocations familiales', fichier: 'Attestation-allocations-familiales', programme: false },
};
export function composerAttestationInscription(d, variante = 'inscription') {
  const v = VARIANTES[variante] || VARIANTES.inscription;
  const ident = identiteEtablissement() || {};
  const e = d.etudiant, f = feminin(e);
  const nomEtud = `${esc(String(e.nom || '').toUpperCase())} ${esc(e.prenom || '')}`;
  const naissance = [e.lieu_naissance, e.pays_naissance && !String(e.lieu_naissance || '').includes(e.pays_naissance) ? `(${e.pays_naissance})` : '']
    .filter(Boolean).join(' ');
  const qui = f ? 'L’étudiante' : 'L’étudiant';
  const conges = d.conges.map(c => `<li>${esc(c.intitule)} : du ${jour(c.du)} au ${jour(c.au)}</li>`).join('');
  const boite = coche => `<span style="display:inline-block;width:3.2mm;height:3.2mm;border:0.3mm solid #0E2A4F;border-radius:0.6mm;vertical-align:-0.4mm;margin:0 1mm 0 3mm;text-align:center;line-height:3.2mm;font-size:8pt;font-weight:700;color:#0E2A4F">${coche ? '✓' : ''}</span>`;
  const x = d.dixsept || {};
  const h = x.heures, oui = x.force ? x.force === 'oui' : x.oui;
  const virgule = v => String(v).replace('.', ',');
  const heuresTxt = x.force ? 'Réponse confirmée par l’établissement.'
    : x.source === 'horaire' ? `Moyenne de ${virgule(h)} h de cours par semaine, d’après l’horaire de l’établissement, sur ${x.semaines} semaines de cours (congés exclus ; hors stages et épreuve intégrée).`
    : x.source === 'pae' ? `Moyenne de ${virgule(h)} h de cours par semaine : ${x.periodes} périodes de 50 min au programme, sur ${x.semaines} semaines de cours (congés exclus ; hors stages et épreuve intégrée).`
    : 'À cocher par l’établissement.';
  const coche = oui != null;
  /* RIEN NE SE COUPE (Charles, 12 novembre 2026 : « je ne veux pas que ma signature ou une partie d'un texte se trouve coupé et
     placé sur la page suivante ») : chaque paragraphe, la liste des congés, l'encadré et le bloc de signature (avec la ligne
     d'authenticité que le filigrane pose juste au-dessus) se tiennent d'un bloc. */
  const tenue = `<style>.att-ins p, .att-ins ul, .att-ins .encadre-ins, .att-ins .tenir { break-inside: avoid; page-break-inside: avoid; }
    .att-ins .tenir { margin-top: 0; } .att-ins .tenir .cloture { margin-top: 4mm; }
    .att-ins p.intro-conges { break-after: avoid; page-break-after: avoid; }</style>`;
  const corps = `${tenue}<div class="attestation piece att-ins">
  ${enteteDocument({ titre: v.titre, nature: 'Inscription',
    sous: d.section_libelle || null, ligne: `Année scolaire ${esc(d.annee)}${ident.matricule ? ` · N° ECOT ${esc(ident.matricule)}` : ''}` })}
  <p class="corps">Je soussigné, ${esc(ident.directeur || '……………')}, directeur de l’${esc(ident.nom || 'Institut Ilya Prigogine')},
    certifie que <b>${f ? 'Madame' : 'Monsieur'} ${nomEtud}</b>,
    ${f ? 'née' : 'né'} ${naissance ? `à ${esc(naissance)}, ` : ''}le ${jour(e.date_naissance)},</p>
  <p class="corps">est ${f ? 'inscrite' : 'inscrit'} dans notre établissement d’enseignement pour suivre les cours
    ${d.section_libelle ? `de la section <b>${esc(d.section_libelle)}</b>` : 'de notre établissement'}
    pour l’année scolaire ou académique ${esc(d.annee)}, qui a commencé le ${jour(d.debut)} et se termine le ${jour(d.fin)}.</p>
  ${conges ? `<p class="corps intro-conges">Les périodes de vacances sont fixées comme suit :</p><ul>${conges}</ul>` : ''}
  <div class="encadre-ins" style="background:#F1F6FB;border-radius:1.8mm;padding:2.2mm 3.5mm;margin:2mm 0 3mm">
    <div style="font-weight:700;color:#0E2A4F;margin-bottom:1mm">${d.superieur ? 'Enseignement supérieur' : 'Enseignement secondaire'} pour adultes</div>
    <div>Le jeune suit-il au moins 17 heures de cours par semaine ?${boite(coche && oui)}Oui${boite(coche && !oui)}Non</div>
    <div style="font-size:7.5pt;color:#5B6B82;margin-top:0.8mm">${heuresTxt}</div>
  </div>
  <div class="tenir">
  <p class="corps">${qui} suit les cours ${d.inscrit_le ? `depuis le ${jour(d.inscrit_le)}` : 'depuis le début de l’année scolaire'}.${v.programme ? `
    ${f ? 'Elle' : 'Il'} est ${f ? 'inscrite' : 'inscrit'}${d.bloc ? ` en ${esc(d.bloc)}` : ''} et suit un programme de
    <b>${d.ects} ECTS</b> pour l’année académique ${esc(d.annee)}.` : ''}</p>
  <p class="corps">Je déclare avoir rempli correctement la présente déclaration.</p>
  <div class="cloture">
    <div class="sceau"></div><div class="paraphe"></div>
    <div class="lieu">Fait à ${esc(ident.ville || 'Bruxelles')}, le ${jour(new Date().toISOString().slice(0, 10))}</div>
    <div class="legende"><div class="qualite">Le chef d’établissement</div>
      <div class="nom">${esc(ident.directeur || '……………')}</div></div>
  </div>
  </div>
</div>`;
  const nom = `${v.fichier}_${String(e.nom || '').toUpperCase()}_${e.prenom || ''}_${d.annee}`.replace(/[^A-Za-z0-9_-]+/g, '-');
  return { html: envelopper(corps, v.titre), nom };
}

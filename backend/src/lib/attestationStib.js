/* L'ATTESTATION DE FRÉQUENTATION SCOLAIRE DE LA STIB (3.5.524, Charles, 17 novembre 2026 : « je dois produire cela et cela doit être
   disponible dans l'espace étudiant » ; tranché : pas de SNCB — son formulaire exclut « les étudiants de l'enseignement pour adultes » ;
   la STIB si Lucie vérifie ses seuils ; le formulaire officiel rempli).
   La STIB accorde le tarif scolaire aux moins de 25 ans inscrits en cours du jour (20 h sur 4 jours au moins par semaine) ou du soir
   (9 h sur 3 jours au moins par semaine). Lucie le vérifie sur l'horaire de l'année de l'étudiant :
   — heures par semaine : `calculDixSept` (la règle de l'attestation d'inscription : horaire, semaines où il a cours, congés retirés) ;
   — jours par semaine : la moyenne des jours de cours distincts sur les semaines où il a cours ;
   — du soir : la moitié au moins de ses minutes commence à 17 h ou plus tard.
   Le formulaire (assets/formulaires-transport/stib.docx, le Word de la STIB) est rempli — année, nom, prénom, naissance, date — puis
   signé et cacheté (signature de la direction et cachet de l'établissement), et rendu en PDF par LibreOffice. Le numéro MOBIB et la
   signature du bénéficiaire restent à l'étudiant. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import db from '../db/index.js';
import { calculDixSept, datesDeLAnnee, congesDeLAnnee } from './attestationInscription.js';
import { unitesInscrites, seancesEtudiant } from './cep.js';
import { cachetCourant, signatureCourante } from './identite.js';

const DOSSIER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets/formulaires-transport');
const essai = (f, d) => { try { return f(); } catch { return d; } };
const lundiDe = d => { const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); const j = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - j); return x.toISOString().slice(0, 10); };
export const SEUILS_STIB = { age_max: 24, jour: { heures: 20, jours: 4 }, soir: { heures: 9, jours: 3 }, soir_des: '17:00' };

function ageAu(naissance, jour) {
  const n = String(naissance || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return null;
  let a = Number(jour.slice(0, 4)) - Number(n.slice(0, 4));
  if (jour.slice(5) < n.slice(5)) a--;
  return a;
}

/** Le rythme de l'étudiant pour l'année : heures et jours par semaine, part du soir. */
export function rythmeEtudiant(etudId, annee) {
  const { debut, fin } = datesDeLAnnee(annee);
  const conges = essai(() => congesDeLAnnee(annee, debut, fin), []);
  const dix = essai(() => calculDixSept(etudId, annee, { debut, fin, conges }), {});
  const jours = new Map(); let min = 0, minSoir = 0;
  for (const u of essai(() => unitesInscrites(etudId, annee), [])) {
    if (u.epreuve_integree) continue;
    for (const s of essai(() => seancesEtudiant(etudId, u.ue_num, annee).seances, [])) {
      if (s.annule || s.dispense || !s.date) continue;
      const l = lundiDe(s.date);
      if (!jours.has(l)) jours.set(l, new Set());
      jours.get(l).add(s.date);
      const m = Number(s.min) || 0; min += m;
      if (String(s.heure_debut || '') >= SEUILS_STIB.soir_des) minSoir += m;
    }
  }
  const semaines = [...jours.values()];
  const joursSemaine = semaines.length ? Math.round((semaines.reduce((t, x) => t + x.size, 0) / semaines.length) * 10) / 10 : null;
  return { heures: dix.heures ?? null, source: dix.source || null, jours: joursSemaine, soir: min ? minSoir / min >= 0.5 : false, semaines: semaines.length };
}

/** Peut-il l'obtenir ? { ok, raisons[], age, rythme, mode } */
export function eligibiliteStib(etudId, annee, jour = new Date().toISOString().slice(0, 10)) {
  const e = db.prepare('SELECT id, date_naissance FROM etudiant WHERE id = ?').get(Number(etudId));
  if (!e) return { ok: false, raisons: ['étudiant introuvable'] };
  const raisons = [];
  const age = ageAu(e.date_naissance, jour);
  if (age == null) raisons.push('date de naissance inconnue');
  else if (age > SEUILS_STIB.age_max) raisons.push(`la STIB réserve le tarif scolaire aux moins de 25 ans (${age} ans)`);
  const inscrit = essai(() => db.prepare('SELECT 1 FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? LIMIT 1').get(e.id, annee), null);
  if (!inscrit) raisons.push(`aucune inscription en ${annee}`);
  /* UN PAE À TEMPS PLEIN SUFFIT (3.5.530, Charles : « si le PAE est complet, les documents allocations et STIB, on donne » ;
     tranché : 60 ECTS au moins ; sinon, le calcul de l'horaire). */
  const ects = essai(() => db.prepare(`SELECT COALESCE(SUM((SELECT ects FROM ue x WHERE x.ue_num = i.ue_num AND x.ects IS NOT NULL
      ORDER BY (x.annee_scolaire = ?) DESC, x.annee_scolaire DESC LIMIT 1)), 0) n FROM etudiant_inscription i
      WHERE i.etudiant_id = ? AND i.annee_scolaire = ?`).get(annee, e.id, annee).n, 0);
  const tempsPlein = ects >= 60;
  const r = rythmeEtudiant(e.id, annee);
  const S = r.soir ? SEUILS_STIB.soir : SEUILS_STIB.jour;
  const mode = tempsPlein ? 'temps_plein' : r.soir ? 'soir' : 'jour';
  if (tempsPlein) { /* rien d'autre à vérifier que l'âge et l'inscription */ }
  else if (r.heures == null || r.jours == null) raisons.push(`horaire de l’année inconnu (PAE de ${ects} ECTS, sous les 60 d’un temps plein)`);
  else if (r.heures < S.heures || r.jours < S.jours) {
    raisons.push(`cours ${mode === 'soir' ? 'du soir' : 'du jour'} : ${String(r.heures).replace('.', ',')} h sur ${String(r.jours).replace('.', ',')} jour(s) par semaine en moyenne, pour ${S.heures} h sur ${S.jours} jours au moins (PAE de ${ects} ECTS, sous les 60 d’un temps plein)`);
  }
  return { ok: !raisons.length, raisons, age, rythme: r, mode, ects, temps_plein: tempsPlein };
}

const T = p => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
const run = t => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r>`;

/** Écrit `texte` dans la cellule de valeur qui suit la cellule dont le texte est `libelle` (tableau du bénéficiaire). */
function remplirCellule(x, libelle, texte) {
  const cellules = [...x.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
  const i = cellules.findIndex(c => libelle.test(T(c[0]).trim()));
  if (i < 0 || !cellules[i + 1]) return x;
  const c = cellules[i + 1];
  const k = c[0].lastIndexOf('</w:p>');
  const neuf = c[0].slice(0, k) + run(texte) + c[0].slice(k);
  return x.slice(0, c.index) + neuf + x.slice(c.index + c[0].length);
}

/** Remplit le Word de la STIB : année, nom, prénom, naissance, date de l'établissement, cachet et signature. Rend le .docx. */
export async function remplirStibDocx(modele, v) {
  const zip = await JSZip.loadAsync(modele);
  let x = await zip.file('word/document.xml').async('string');
  // L'année académique : les quatre « _ » du paragraphe « Année Académique 20 _ _ - 20 _ _ ».
  const [a1, a2] = String(v.annee).split('-');
  const paras = [...x.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)];
  const pa = paras.find(p => /Académique/.test(T(p[0])));
  if (pa) {
    // Après « Académique », le reste du paragraphe (« 20 _ _ - 20 _ _ », en petits morceaux) devient l'année écrite d'un seul tenant.
    const k = pa[0].indexOf('Académique</w:t></w:r>');
    const neuf = k < 0 ? pa[0] : pa[0].slice(0, k + 'Académique</w:t></w:r>'.length)
      + `<w:r><w:rPr><w:b/><w:color w:val="0E4660"/></w:rPr><w:t xml:space="preserve"> ${a1} - ${a2}</w:t></w:r></w:p>`;
    x = x.slice(0, pa.index) + neuf + x.slice(pa.index + pa[0].length);
  }
  x = remplirCellule(x, /^Nom$/, v.nom);
  x = remplirCellule(x, /^Prénom$/, v.prenom);
  x = remplirCellule(x, /^Date de naissance/, v.naissance);
  // La date de l'établissement : le PREMIER « ........../........../20....... » (le second est celui du bénéficiaire).
  x = x.replace('<w:t>........../........../20.......</w:t>', `<w:t xml:space="preserve">${v.date}</w:t>`);
  const { insererImageSous } = await import('../services/formulairesFWB.js');
  if (v.cachet) x = await insererImageSous(zip, x, /^Sceau et signature de la direction/, v.cachet, 2.3, 'cachet');
  if (v.signature) x = await insererImageSous(zip, x, /^Sceau et signature de la direction/, v.signature, 3.0, 'signature');
  /* CÔTE À CÔTE, SUR UNE SEULE PAGE (3.5.532, capture de Charles : l'un sous l'autre, ils repoussaient « Réservé au bénéficiaire »
     sur une deuxième page) : les deux images se réunissent dans un même paragraphe, signature puis cachet. */
  x = x.replace(/<w:p><w:pPr><w:jc w:val="right"\/><\/w:pPr>(<w:r><w:drawing>[\s\S]*?<\/w:drawing><\/w:r>)<\/w:p><w:p><w:pPr><w:jc w:val="right"\/><\/w:pPr>(<w:r><w:drawing>[\s\S]*?<\/w:drawing><\/w:r>)<\/w:p>/,
    (m, r1, r2) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/></w:pPr>${r1}<w:r><w:t xml:space="preserve">    </w:t></w:r>${r2}</w:p>`);
  zip.file('word/document.xml', x);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Pose sur le PDF la référence (registre des pièces authentiques), le QR de vérification et le code de pièce. */
async function referencer(pdf, { nature, objet, personne, date, apercu = false }) {
  const { nouvelleReference } = await import('../services/filigrane.js');
  const { enregistrerPiece, urlVerification } = await import('./authentique.js');
  const QR = (await import('qrcode')).default;
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const ref = nouvelleReference();
  // UN APERÇU N'ENTRE PAS AU REGISTRE (la règle des spécimens, 3.5.047) : la référence se voit, mais ne se vérifierait pas.
  if (!apercu) enregistrerPiece({ reference: ref, nature, objet, personne, date });
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPages()[0];
  const { width } = page.getSize();
  const png = await doc.embedPng(await QR.toBuffer(urlVerification(ref), { margin: 1, width: 200, color: { dark: '#1B2B4B' } }));
  const t = 42, x = width - t - 20, y = 18;
  page.drawImage(png, { x, y, width: t, height: t });
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const gris = rgb(0.39, 0.45, 0.55);
  const ligne1 = apercu ? `APERÇU — non enregistrée · réf. ${ref}` : `Pièce authentifiable · réf. ${ref}`;
  page.drawText(ligne1, { x: x - 4 - f.widthOfTextAtSize(ligne1, 6.5), y: y + 24, size: 6.5, font: f, color: gris });
  page.drawText('Scannez le code pour vérifier · I-06', { x: x - 4 - f.widthOfTextAtSize('Scannez le code pour vérifier · I-06', 6.5), y: y + 14, size: 6.5, font: f, color: gris });
  return Buffer.from(await doc.save());
}

/** Compose le PDF. Rend { pdf, nom } ou { erreur, code }. `force` : le secrétariat passe outre les seuils. */
export async function composerStib(etudId, annee, { force = false, apercu = false, jour = new Date().toISOString().slice(0, 10) } = {}) {
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(etudId));
  if (!e) return { code: 404, erreur: 'étudiant introuvable' };
  const el = eligibiliteStib(e.id, annee, jour);
  if (!el.ok && !force) return { code: 409, erreur: `L’attestation STIB ne peut pas être délivrée : ${el.raisons.join(' ; ')}.`, raisons: el.raisons };
  const docx = await remplirStibDocx(fs.readFileSync(path.join(DOSSIER, 'stib.docx')), {
    annee, nom: String(e.nom || '').toUpperCase(), prenom: e.prenom || '',
    naissance: String(e.date_naissance || '').slice(0, 10).split('-').reverse().join('-'),
    date: jour.split('-').reverse().join('/'), cachet: cachetCourant(), signature: signatureCourante() });
  const { docxToPdf } = await import('../services/docx-to-pdf.js');
  /* LE RÉFÉRENCEMENT (3.5.528, Charles : « il faut bien vérifier le référencement de toutes les pièces ») : comme toute pièce de
     Lucie, l'attestation porte une référence inscrite au registre des pièces authentiques (le QR que la STIB peut scanner) et son
     code de pièce (I-06), posés en bas de la première page. */
  const pdf = await referencer(await docxToPdf(docx), {
    nature: 'Attestation de fréquentation scolaire — STIB', objet: `Année académique ${annee}`,
    personne: `${e.prenom || ''} ${String(e.nom || '').toUpperCase()}`.trim(), date: jour, apercu });
  const nom = `Attestation_STIB_${String(e.nom || '').replace(/[^A-Za-z0-9]+/g, '-')}_${String(e.prenom || '').replace(/[^A-Za-z0-9]+/g, '-')}_${String(annee).replace('-', '')}.pdf`;
  return { pdf, nom, eligibilite: el };
}

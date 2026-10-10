import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

let LOGO_IIP = ''; // l'image de l'établissement (lib/identite.js, 3.1.253)
let SIGNATURE_SOHET = ''; // l'image de l'établissement (lib/identite.js, 3.1.253)
let SCEAU_IIP = ''; // l'image de l'établissement (lib/identite.js, 3.1.253)
chargerIdentite().then(i => { LOGO_IIP = i.logo || LOGO_IIP; SIGNATURE_SOHET = i.signature || SIGNATURE_SOHET; SCEAU_IIP = i.cachet || SCEAU_IIP; });
import PreviewModal from '../components/PreviewModal.jsx';
import DiplomeEditeur from './DiplomeEditeur.jsx';
import { IconPlus, IconTrash, IconEye, IconDownload, IconCopy, IconLock
} from '@tabler/icons-react';
import { ouvrirApercu } from '../lib/apercu.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { chargerIdentite, useIdentite } from '../lib/identite.js';

/* ── Template HTML attestation provisoire ─────────────────────────────────── */
export function genererTemplateAttestation() {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<title>Attestation provisoire</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #1a1a1a; background: white; }
  @media print { @page { size: A4 portrait; margin: 0; } body { margin: 0; } }

  .page {
    width: 210mm; height: 296mm;
    margin: 0 auto;
    display: flex; flex-direction: column;
    position: relative; overflow: hidden;
  }

  /* Filigrane */
  .filigrane { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
  .filigrane svg { width: 100%; height: 100%; }

  /* Bandeau marine */
  .bandeau {
    background: var(--c-principal); padding: 8px 18mm;
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0; position: relative; z-index: 1;
  }
  .bandeau-gauche { color: white; font-size: 9pt; font-weight: bold; letter-spacing: 0.5pt; line-height: 1.4; }
  .bandeau-droite { color: rgba(255,255,255,0.65); font-size: 7.5pt; text-align: right; letter-spacing: 0.5pt; line-height: 1.5; }

  /* Corps */
  .corps { flex: 1; padding: 4mm 18mm 2mm 18mm; display: flex; flex-direction: column; justify-content: space-between; position: relative; z-index: 1; }

  /* Filet doré institutionnel */
  .filet-or { border-top: 1pt solid var(--c-attente); border-bottom: 1pt solid var(--c-attente); padding: 4pt 0; line-height: 1; text-align: center; margin-bottom: 4mm; }
  .filet-or span { font-size: 7.3pt; color: #888; letter-spacing: 0.2pt; text-transform: uppercase; white-space: nowrap; }

  /* Établissement */
  .etab { font-size: 9pt; color: #444; line-height: 1.45; margin-bottom: 4mm; }
  .etab strong { color: #1a1a1a; }

  /* Encadré attestation */
  .encadre { border: 1pt solid var(--c-attente); padding: 5pt 0; line-height: 1; text-align: center; margin-bottom: 4mm; }
  .encadre span { font-size: 9pt; font-weight: bold; letter-spacing: 0.5pt; }

  /* Texte courant */
  .texte p { font-size: 9pt; line-height: 1.55; margin-bottom: 1.5pt; }

  /* Carte étudiant */
  .carte-etudiant {
    background: #f0f4ff; border-left: 3pt solid var(--c-attente);
    padding: 4pt 8pt; margin: 3mm 0;
    border-radius: 0 3pt 3pt 0;
  }
  .carte-etudiant .nom { font-size: 9pt; font-weight: bold; color: var(--c-texte); }
  .carte-etudiant .naissance { font-size: 9pt; color: #555; margin-top: 1.5pt; }

  /* UE */
  .ue-titre { font-size: 9pt; line-height: 1.65; margin-bottom: 1pt; margin-top: 2pt; }
  .ue-bloc { margin: 0 0 3pt 6mm; }
  .ue-bloc div { font-size: 9pt; line-height: 1.55; }

  /* Signatures — 3 colonnes */
  .signatures { padding-top: 2mm; flex-shrink: 0; font-size: 9pt; }
  .sig-jury { text-align: center; color: #333; line-height: 1.6; margin: 0 0 9mm; padding: 0 8mm; }
  .sig-jury strong { color: var(--c-texte); }
  .sig-final { position: relative; min-height: 26mm; }
  .sig-directeur { width: 70mm; margin: 0 auto; text-align: center; display: flex; flex-direction: column; align-items: center; overflow: visible; }
  .sig-directeur .sig-role { color: #555; font-size: 9pt; padding-bottom: 1mm; }
  .sig-directeur .sig-image { display: block; height: 30mm; width: auto; margin: 1mm auto -12mm; position: relative; z-index: 2; pointer-events: none; }
  .sig-directeur .sig-nom { font-weight: bold; color: var(--c-texte); border-top: 0.6pt solid var(--c-attente); padding-top: 1.5mm; display: inline-block; width: 48mm; }
  .sceau { position: absolute; right: 2mm; bottom: -2mm; width: 36mm; height: auto; opacity: 0.92; transform: rotate(-6deg); }

  /* Logo + pied de page */
  .footer-bloc {
    flex-shrink: 0; padding: 0 18mm 8mm 18mm;
    position: relative; z-index: 1;
  }
  .footer-logo { height: 10mm; width: auto; opacity: 0.9; display: block; margin-bottom: 2.5mm; }
  .footer-texte {
    border-top: 0.5pt solid var(--c-attente); padding-top: 2.5mm;
    font-size: 6pt; color: #888; text-align: center; line-height: 1.4;
  }
</style>
</head><body>
<div class="page">

  <!-- Filigrane -->
  <div class="filigrane" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <defs>
        <pattern id="wm" x="0" y="0" width="220" height="140" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <text x="10" y="50" font-family="Arial,sans-serif" font-size="13"
            fill="#1B2B4B" fill-opacity="0.045" font-weight="bold" letter-spacing="3">ATTESTATION PROVISOIRE</text>
          <text x="30" y="80" font-family="Arial,sans-serif" font-size="9"
            fill="#C9A84C" fill-opacity="0.06" font-weight="bold" letter-spacing="2">INSTITUT ILYA PRIGOGINE</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)" />
    </svg>
  </div>

  <!-- Bandeau marine -->
  <div class="bandeau">
    <div class="bandeau-gauche">INSTITUT<br>ILYA PRIGOGINE</div>
    <div class="bandeau-droite">PÔLE ACADÉMIQUE<br>DE BRUXELLES</div>
  </div>

  <!-- Corps -->
  <div class="corps">

    <div class="filet-or">
      <span>Communauté française de Belgique &nbsp;·&nbsp; Enseignement pour adultes &nbsp;·&nbsp; Année académique {{annee}}</span>
    </div>

    <div class="etab">
      <strong>{{nom_etab}}</strong><br>
      Adresse : {{adresse_etab}}<br>
      Numéro de matricule : {{matricule_etab}} &nbsp;·&nbsp; Numéro FASE : {{fase_etab}}
    </div>

    <div class="encadre"><span>Attestation provisoire</span></div>

    <div class="texte">
      <p>Je soussigné, {{directeur}}, Directeur de l'établissement, certifie que</p>
    </div>

    <div class="carte-etudiant">
      <div class="nom">{{nom_etudiant}} {{prenom_etudiant}} ({{genre}})</div>
      <div class="naissance">{{ligne_naissance}}</div>
    </div>

    <div class="texte">
      <p>a obtenu ce jour le <strong>DIPLÔME DE {{intitule_diplome}}</strong></p>
      <p>avec la mention <strong>{{mention}}</strong></p>
      <p>à l'issue de la section <strong>{{intitule_section}}</strong></p>
      <p>approuvée par le Gouvernement sous le numéro de code : <strong>{{code_section}}</strong></p>
      <p>ladite section comporte {{total_periodes}} périodes / {{total_ects}} ECTS.</p>
      {{bloc_ue_det}}
      {{bloc_ue_int}}
      <p style="font-style:italic;color:#555;margin-top:3mm;">Le diplôme de l'intéressé·e est actuellement soumis à la signature de l'autorité compétente.</p>
    </div>

    <!-- Date et lieu -->
    <p style="font-size:9pt;color:#444;text-align:right;margin-top:3mm;margin-bottom:1mm;">
      Fait à {{ville_etab}}, le {{date_deliberation}}
    </p>

    <!-- Signatures : jury (sans signature) + directeur centré + sceau -->
    <div class="signatures">
      <p class="sig-jury">Pour la Présidente du Jury, <strong>Marie Lambert</strong>, et pour la Directrice du département de la Santé de la HELB, <strong>Catherine Romanus</strong>.</p>
      <div class="sig-final">
        <div class="sig-directeur">
          <div class="sig-role">Le Directeur de l'Institut Ilya Prigogine,</div>
          <img class="sig-image" src="{{signature_directeur}}" alt="Signature" />
          <div class="sig-nom">{{directeur}}</div>
        </div>
        <img class="sceau" src="{{sceau}}" alt="Sceau de l'établissement" />
      </div>
    </div>

  </div>

  <!-- Logo + pied de page -->
  <div class="footer-bloc">
    <img src="{{logo_iip}}" class="footer-logo" alt="Institut Ilya Prigogine" />
    <div class="footer-texte">{{pied_page}}</div>
  </div>

</div>
</body></html>`;
}

async function htmlVersPdfBlob(html, jsPDF, html2canvas, landscape = false) {
  const w = landscape ? 1123 : 794;   // A4 @ 96dpi
  const h = landscape ? 794 : 1123;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;border:0;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const win = iframe.contentWindow;
    // Attente déterministe : chargement + polices + images + 2 frames. Un délai fixe
    // laissait html2canvas capturer avant stabilisation en boucle (ZIP) → filet décalé.
    await new Promise(res => {
      let fini = false;
      const finir = () => { if (!fini) { fini = true; res(); } };
      const stabiliser = async () => {
        try { if (doc.fonts && doc.fonts.ready) await doc.fonts.ready; } catch {}
        await Promise.all(Array.from(doc.images || []).map(
          img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
        const raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : (cb => setTimeout(cb, 16));
        raf(() => raf(finir));
        setTimeout(finir, 1500); // filet de sécurité si un asset ne résout pas
      };
      if (doc.readyState === 'complete') stabiliser();
      else win.addEventListener('load', stabiliser, { once: true });
    });
    const cible = doc.querySelector('.page') || doc.body;
    try { win.scrollTo(0, 0); } catch {}
    const canvas = await html2canvas(cible, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      windowWidth: w, windowHeight: h, width: w, height: h,
      scrollX: 0, scrollY: 0, x: 0, y: 0,
    });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
    const pw = landscape ? 297 : 210, ph = landscape ? 210 : 297;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
    return pdf.output('blob');
  } finally {
    document.body.removeChild(iframe);
  }
}

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch {} URL.revokeObjectURL(url); }, 1500);
}

function remplaceVars(template, vars) {
  let h = template;
  for (const [k, v] of Object.entries(vars)) h = h.split(k).join(v ?? '');
  return h;
}

const MENTIONS = ['Satisfaction', 'Distinction', 'Grande distinction'];


/* ── UE déterminantes TIM + calcul mention ───────────────────────────────── */
const UES_DET_TIM = [
  // Périodes = cours + autonomie (totaux confirmés ; total déterminantes = 980)
  { ue: '251', nom: 'Techniques professionnelles spécialisées en imagerie médicale', periodes: 80  },
  { ue: '252', nom: 'Radioprotection',                                               periodes: 80  },
  { ue: '253', nom: 'Radiothérapie',                                                 periodes: 80  },
  { ue: '256', nom: 'Sciences biomédicales spécialisées',                            periodes: 60  },
  { ue: '259', nom: 'Méthodologie de la recherche',                                  periodes: 80  },
  { ue: '263', nom: 'Enseignement clinique : Activités professionnelles',            periodes: 600 },
];
const UE_INT_TIM = { ue: '264', nom: "Épreuve intégrée", periodes: 120 };
const TOTAL_PERIODES_DET = UES_DET_TIM.reduce((s, u) => s + u.periodes, 0); // 980 (cours + autonomie)
// Périodes par défaut (cours seuls) ; remplacées au runtime par cours+autonomie depuis /api/referentiels/ue
const PER_DEFAUT = Object.fromEntries([...UES_DET_TIM, UE_INT_TIM].map(u => [u.ue, u.periodes]));
// Config de mention (repli TIM tant que les flags/config ne sont pas chargés).
// det : UE déterminantes {ue, nom, periodes}. intUe : n° de l'épreuve intégrée (ou null).
const CFG_TIM = { det: UES_DET_TIM.map(u => ({ ue: u.ue, nom: u.nom, periodes: u.periodes })), intUe: '264', intNom: UE_INT_TIM.nom };

function calculerMention(scoresDet, scoreInt, cfg = CFG_TIM) {
  // scoresDet : { ue: pct 0-100 } ; scoreInt : pct 0-100 ; cfg.det : {ue, periodes}
  let sommePonderee = 0;
  let totalPoids = 0;
  for (const u of cfg.det) {
    const s = parseFloat(scoresDet[u.ue]);
    if (!isNaN(s)) {
      const p = u.periodes || 0;
      sommePonderee += s * p;
      totalPoids += p;
    }
  }
  const moyDet = totalPoids > 0 ? sommePonderee / totalPoids : 0;
  const sInt   = parseFloat(scoreInt);
  const finale = isNaN(sInt) ? moyDet : (moyDet * 2/3) + (sInt * 1/3);

  if (finale >= 90) return { pct: Math.round(finale * 10)/10, mention: 'La plus grande distinction' };
  if (finale >= 80) return { pct: Math.round(finale * 10)/10, mention: 'Grande distinction' };
  if (finale >= 70) return { pct: Math.round(finale * 10)/10, mention: 'Distinction' };
  if (finale >= 60) return { pct: Math.round(finale * 10)/10, mention: 'Satisfaction' };
  if (finale >= 50) return { pct: Math.round(finale * 10)/10, mention: 'Réussite' };
  return { pct: Math.round(finale * 10)/10, mention: 'Échec' };
}

function deriveLigne(l, cfgBySec = null) {
  const cfg = (cfgBySec && cfgBySec[l.section_code]) || CFG_TIM;
  const scores = { ...(l._scores || {}) };
  Object.keys(scores).forEach(k => { if (scores[k] === '' || scores[k] == null) delete scores[k]; });
  const pct = {};
  for (const u of cfg.det) { if (scores[u.ue] !== undefined) pct[u.ue] = parseFloat(scores[u.ue]) * 5; }
  const sInt = (cfg.intUe && scores[cfg.intUe] !== undefined) ? parseFloat(scores[cfg.intUe]) * 5 : undefined;
  const has = Object.keys(pct).length > 0 || sInt !== undefined;
  const complet = cfg.det.length > 0 && cfg.det.every(u => scores[u.ue] !== undefined) && (!cfg.intUe || scores[cfg.intUe] !== undefined);
  const calc = calculerMention(pct, sInt, cfg);
  const valide = complet && calc.pct >= 50;          // mention SEULEMENT si toutes les UE notées ET >= 50
  const detLines = cfg.det.filter(u => scores[u.ue] !== undefined)
    .map(u => `UE ${u.ue} — ${u.nom} : ${scores[u.ue]}/20`).join('\n');
  const intLine = (cfg.intUe && scores[cfg.intUe] !== undefined) ? `UE ${cfg.intUe} — ${cfg.intNom} : ${scores[cfg.intUe]}/20` : '';
  return { ...l, _scores: scores, mention: valide ? calc.mention : '',
           ue_determinantes: detLines, ue_integree: intLine, _calcPct: has ? calc.pct : 0, _complet: complet };
}
function mentionColorClass(pct) {
  return pct >= 70 ? 'text-white bg-green-500' : pct >= 50 ? 'text-white bg-amber-500' : 'text-white bg-red-500';
}

/* ── Données pré-importées TIM BA1 2025-2026 ───────────────────────────────── */
const ETUDIANTS_TIM_BA1 = [{"id": "tim_25-00157", "nom": "ABDELLAOUI", "prenom": "Kenza", "genre": "F", "lieu_naissance": "", "date_naissance": "21 décembre 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 16, "251": 12, "263": 11, "256": 17, "259": 12, "264": 8}, "matricule": "25-00157"}, {"id": "tim_25-00208", "nom": "AKA Ananie", "prenom": "Andrea S", "genre": "F", "lieu_naissance": "", "date_naissance": "19 mars 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 15, "251": 13, "256": 16, "259": 12}, "matricule": "25-00208"}, {"id": "tim_25-00297", "nom": "ALDEMIR", "prenom": "Selim", "genre": "M", "lieu_naissance": "", "date_naissance": "14 mars 1999", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "25-00297"}, {"id": "tim_25-00003", "nom": "AMIRI LAMRASKI", "prenom": "Achkân", "genre": "M", "lieu_naissance": "", "date_naissance": "26 août 1992", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "25-00003"}, {"id": "tim_25-00459", "nom": "ANAJDI", "prenom": "Jalal", "genre": "M", "lieu_naissance": "", "date_naissance": "30 juin 2003", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 15, "251": 15, "263": 17, "256": 16, "259": 15, "264": 17.5}, "matricule": "25-00459"}, {"id": "tim_24-00223", "nom": "AOURAGH", "prenom": "Sara", "genre": "F", "lieu_naissance": "", "date_naissance": "7 février 2004", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00223"}, {"id": "tim_25-00191", "nom": "ATSAMO SOKENG", "prenom": "Vynil", "genre": "M", "lieu_naissance": "", "date_naissance": "1 juillet 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 12, "263": 14, "256": 14, "259": 10}, "matricule": "25-00191"}, {"id": "tim_24-00091", "nom": "AYEKOUE", "prenom": "Monnet E, M.", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17}, "matricule": "24-00091"}, {"id": "tim_25-00193", "nom": "AZEBAZE ZANGUE", "prenom": "Nelson", "genre": "M", "lieu_naissance": "", "date_naissance": "20 avril 2004", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 15, "251": 15, "263": 14, "256": 15, "259": 14, "264": 16}, "matricule": "25-00193"}, {"id": "tim_25-00237", "nom": "BEN-MEHDI", "prenom": "Yasmin", "genre": "F", "lieu_naissance": "", "date_naissance": "16 avril 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 13, "259": 15}, "matricule": "25-00237"}, {"id": "tim_24-00137", "nom": "BOCA", "prenom": "Elisabeta-Nicoleta", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00137"}, {"id": "tim_24-00220", "nom": "BOUKHIZOU", "prenom": "Amin", "genre": "M", "lieu_naissance": "", "date_naissance": "8 octobre 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00220"}, {"id": "tim_25-00383", "nom": "BRADI", "prenom": "Yasser", "genre": "M", "lieu_naissance": "", "date_naissance": "7 juillet 2003", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 14, "251": 15, "263": 20, "256": 16, "259": 11, "264": 17}, "matricule": "25-00383"}, {"id": "tim_25-00168", "nom": "BRAUN", "prenom": "Axelle C, H.", "genre": "F", "lieu_naissance": "", "date_naissance": "6 octobre 1988", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 14, "251": 16, "263": 18, "256": 17, "259": 15}, "matricule": "25-00168"}, {"id": "tim_25-00455", "nom": "CHAAMI", "prenom": "Sanaa", "genre": "F", "lieu_naissance": "", "date_naissance": "20 mai 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 14, "251": 12, "263": 15, "256": 16, "259": 12, "264": 16}, "matricule": "25-00455"}, {"id": "tim_25-00247", "nom": "CHIRICEANU", "prenom": "Crina L", "genre": "F", "lieu_naissance": "", "date_naissance": "13 août 1974", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 18, "253": 15, "251": 11, "263": 13, "256": 13, "259": 16}, "matricule": "25-00247"}, {"id": "tim_25-00243", "nom": "CHOMTEU TAYOUMOU", "prenom": "Hornela X", "genre": "F", "lieu_naissance": "", "date_naissance": "17 janvier 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 10, "259": 12}, "matricule": "25-00243"}, {"id": "tim_25-00413", "nom": "CHUIDJA NANGO", "prenom": "Rykielle U", "genre": "F", "lieu_naissance": "", "date_naissance": "29 septembre 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 12, "256": 13, "259": 12}, "matricule": "25-00413"}, {"id": "tim_25-00381", "nom": "DAN", "prenom": "Damaris A", "genre": "F", "lieu_naissance": "", "date_naissance": "19 avril 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 10, "253": 14, "251": 13, "256": 15, "259": 11}, "matricule": "25-00381"}, {"id": "tim_25-00235", "nom": "DENEUFBOURG", "prenom": "Guillaume G, L.", "genre": "M", "lieu_naissance": "", "date_naissance": "20 juillet 1999", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 11, "256": 14, "259": 10}, "matricule": "25-00235"}, {"id": "tim_24-00176", "nom": "DIARRA", "prenom": "Assitan A", "genre": "F", "lieu_naissance": "", "date_naissance": "17 octobre 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13}, "matricule": "24-00176"}, {"id": "tim_25-00340", "nom": "DIFFO GOUALEM", "prenom": "Valdes B", "genre": "F", "lieu_naissance": "", "date_naissance": "29 juillet 1996", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 11, "253": 10, "256": 14, "259": 14}, "matricule": "25-00340"}, {"id": "tim_24-00133", "nom": "DIONGO", "prenom": "Kadim K, J.", "genre": "M", "lieu_naissance": "", "date_naissance": "11 juin 1998", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15}, "matricule": "24-00133"}, {"id": "tim_24-00162", "nom": "DJAKO KOUAMEGNI", "prenom": "Lucienne M", "genre": "F", "lieu_naissance": "", "date_naissance": "2 janvier 1997", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 12, "253": 16}, "matricule": "24-00162"}, {"id": "tim_25-00205", "nom": "DJANDJA", "prenom": "Carole L", "genre": "F", "lieu_naissance": "", "date_naissance": "20 février 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 14, "251": 12, "263": 13, "256": 15, "259": 11, "264": 17}, "matricule": "25-00205"}, {"id": "tim_25-00212", "nom": "DJEAGOU TEUKEN", "prenom": "Rosephine A", "genre": "F", "lieu_naissance": "", "date_naissance": "30 mai 1992", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "25-00212"}, {"id": "tim_25-00365", "nom": "DJOMANI ETCHIEU", "prenom": "Duchele R", "genre": "F", "lieu_naissance": "", "date_naissance": "26 février 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 17, "251": 11, "256": 14, "259": 12}, "matricule": "25-00365"}, {"id": "tim_25-00321", "nom": "DJOUDA TEUGNON", "prenom": "Christelle L", "genre": "F", "lieu_naissance": "", "date_naissance": "18 avril 1993", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 12, "253": 17, "256": 13, "259": 11}, "matricule": "25-00321"}, {"id": "tim_24-00221", "nom": "DJUKOUO", "prenom": "Larissa G", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 13, "259": 12}, "matricule": "24-00221"}, {"id": "tim_25-00378", "nom": "EL AMRANI", "prenom": "Rizkane", "genre": "F", "lieu_naissance": "", "date_naissance": "13 mars 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 13, "251": 12, "263": 12, "256": 16, "259": 10, "264": 17}, "matricule": "25-00378"}, {"id": "tim_25-00181", "nom": "EL AMRAOUI", "prenom": "Siham", "genre": "F", "lieu_naissance": "", "date_naissance": "9 juin 1986", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 10, "253": 15, "256": 16, "259": 13}, "matricule": "25-00181"}, {"id": "tim_25-00411", "nom": "EL MEJJASY CHIB", "prenom": "Abel", "genre": "M", "lieu_naissance": "", "date_naissance": "30 janvier 1986", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 13, "256": 13, "259": 14}, "matricule": "25-00411"}, {"id": "tim_25-00358", "nom": "ENGUEHARD", "prenom": "Sophia M, V.", "genre": "F", "lieu_naissance": "", "date_naissance": "18 octobre 2003", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 18, "253": 15, "251": 15, "263": 15, "256": 18, "259": 13, "264": 18}, "matricule": "25-00358"}, {"id": "tim_25-00349", "nom": "GHILAIN", "prenom": "Baptiste", "genre": "M", "lieu_naissance": "", "date_naissance": "27 juin 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 15, "256": 16, "259": 11}, "matricule": "25-00349"}, {"id": "tim_25-00382", "nom": "GUEGUIM KENFACK", "prenom": "Walter", "genre": "M", "lieu_naissance": "", "date_naissance": "12 septembre 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 17, "256": 15, "259": 12}, "matricule": "25-00382"}, {"id": "tim_25-00333", "nom": "HUBERT", "prenom": "Quentin D, C.", "genre": "M", "lieu_naissance": "", "date_naissance": "8 juin 1997", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"251": 10}, "matricule": "25-00333"}, {"id": "tim_24-00195", "nom": "IRADUKUNDA", "prenom": "Lynca A", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00195"}, {"id": "tim_25-00265", "nom": "JOULONG TIOMEGUIM", "prenom": "Dorice M", "genre": "F", "lieu_naissance": "", "date_naissance": "27 septembre 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 10, "251": 10, "263": 11, "256": 16, "259": 11, "264": 16}, "matricule": "25-00265"}, {"id": "tim_24-00108", "nom": "KAMGA", "prenom": "Leonel B", "genre": "M", "lieu_naissance": "", "date_naissance": "29 juin 1997", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 11, "253": 15}, "matricule": "24-00108"}, {"id": "tim_25-00363", "nom": "KAMSI WAFO", "prenom": "Franck B", "genre": "M", "lieu_naissance": "", "date_naissance": "3 janvier 1997", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 16, "251": 13, "263": 13, "256": 12, "259": 11, "264": 14}, "matricule": "25-00363"}, {"id": "tim_24-00172", "nom": "KANKEU MAFONGANG", "prenom": "Bucaress L", "genre": "F", "lieu_naissance": "", "date_naissance": "25 avril 1995", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00172"}, {"id": "tim_24-00199", "nom": "KARA", "prenom": "Timur", "genre": "M", "lieu_naissance": "", "date_naissance": "16 décembre 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14}, "matricule": "24-00199"}, {"id": "tim_25-00634", "nom": "KENE", "prenom": "Yvan", "genre": "M", "lieu_naissance": "", "date_naissance": "5 avril 1998", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "25-00634"}, {"id": "tim_25-00194", "nom": "KENGNE MACHE", "prenom": "Kacharelle J", "genre": "F", "lieu_naissance": "", "date_naissance": "27 avril 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 18, "253": 15, "251": 13, "263": 16, "256": 16, "259": 16, "264": 16}, "matricule": "25-00194"}, {"id": "tim_25-00364", "nom": "KONLAC ATCHOUALA", "prenom": "Audrey M", "genre": "F", "lieu_naissance": "", "date_naissance": "11 mars 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 13, "251": 10, "263": 12, "256": 15, "259": 13, "264": 17}, "matricule": "25-00364"}, {"id": "tim_25-00344", "nom": "KÖSE", "prenom": "Ibrahim", "genre": "M", "lieu_naissance": "", "date_naissance": "24 avril 1999", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 13, "263": 14, "256": 15, "259": 11}, "matricule": "25-00344"}, {"id": "tim_25-00354", "nom": "KOURRI", "prenom": "Chaymâ", "genre": "F", "lieu_naissance": "", "date_naissance": "4 juillet 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 15, "251": 13, "263": 13, "256": 15, "259": 12, "264": 19}, "matricule": "25-00354"}, {"id": "tim_25-00546", "nom": "KPAKO-WEDONGOU", "prenom": "Gemima", "genre": "F", "lieu_naissance": "", "date_naissance": "9 septembre 2003", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 10, "251": 11, "256": 14, "259": 11}, "matricule": "25-00546"}, {"id": "tim_25-00167", "nom": "LAMBERT", "prenom": "Alexandre S, C.", "genre": "M", "lieu_naissance": "", "date_naissance": "24 juin 1996", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 15, "263": 14, "256": 15, "259": 11}, "matricule": "25-00167"}, {"id": "tim_25-00374", "nom": "LASRI", "prenom": "Ilhame", "genre": "F", "lieu_naissance": "", "date_naissance": "8 juillet 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 10, "251": 10, "263": 14, "256": 15, "259": 12, "264": 17}, "matricule": "25-00374"}, {"id": "tim_24-00119", "nom": "LEKABO ALEMO", "prenom": "Marthe", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00119"}, {"id": "tim_25-00185", "nom": "MADADJO TAKOUGANG", "prenom": "Gwladis", "genre": "F", "lieu_naissance": "", "date_naissance": "11 avril 1999", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 13, "256": 14, "259": 12}, "matricule": "25-00185"}, {"id": "tim_24-00211", "nom": "MAFFO", "prenom": "Anita C", "genre": "F", "lieu_naissance": "", "date_naissance": "23 juillet 1996", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13}, "matricule": "24-00211"}, {"id": "tim_25-00337", "nom": "MAGNE KEGNI", "prenom": "Leslie J", "genre": "F", "lieu_naissance": "", "date_naissance": "26 février 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "25-00337"}, {"id": "tim_25-00245", "nom": "MALA TSOPA", "prenom": "Stela", "genre": "F", "lieu_naissance": "", "date_naissance": "5 janvier 1998", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 13, "256": 13, "259": 11}, "matricule": "25-00245"}, {"id": "tim_24-00299", "nom": "MBOKO DJAYA AMANGA", "prenom": "Alice", "genre": "F", "lieu_naissance": "", "date_naissance": "10 octobre 1972", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 12, "253": 14}, "matricule": "24-00299"}, {"id": "tim_25-00450", "nom": "MEBONG", "prenom": "Maeva", "genre": "F", "lieu_naissance": "", "date_naissance": "2 octobre 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 18, "253": 17, "251": 15, "263": 16, "256": 15, "259": 14, "264": 17}, "matricule": "25-00450"}, {"id": "tim_25-00486", "nom": "MEGNIKENG DJIEUMENI", "prenom": "Vanelle", "genre": "F", "lieu_naissance": "", "date_naissance": "25 avril 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 15, "256": 16, "259": 15}, "matricule": "25-00486"}, {"id": "tim_25-00335", "nom": "MENGOUO DEFFEU", "prenom": "Armelle E.", "genre": "F", "lieu_naissance": "", "date_naissance": "1 février 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 15, "256": 17, "259": 14}, "matricule": "25-00335"}, {"id": "tim_25-00159", "nom": "MENHOUDJ", "prenom": "Nassim", "genre": "M", "lieu_naissance": "", "date_naissance": "16 août 1997", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 11, "253": 10}, "matricule": "25-00159"}, {"id": "tim_25-00355", "nom": "MIFTAH", "prenom": "Hajar", "genre": "F", "lieu_naissance": "", "date_naissance": "24 janvier 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "256": 16}, "matricule": "25-00355"}, {"id": "tim_24-00171", "nom": "MITRAROS", "prenom": "Gilles A, P.", "genre": "M", "lieu_naissance": "", "date_naissance": "5 mars 2003", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13}, "matricule": "24-00171"}, {"id": "tim_24-00114", "nom": "MOJAHID", "prenom": "Adnan", "genre": "M", "lieu_naissance": "", "date_naissance": "26 juin 1975", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 12, "253": 12}, "matricule": "24-00114"}, {"id": "tim_24-00310", "nom": "MRABET", "prenom": "Foued", "genre": "M", "lieu_naissance": "", "date_naissance": "9 septembre 1979", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 14, "251": 15, "256": 14}, "matricule": "24-00310"}, {"id": "tim_24-00322", "nom": "NDJAYA NGUEGNANG", "prenom": "Prevost J", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00322"}, {"id": "tim_25-00336", "nom": "NGNECHEDJI KAMGANG", "prenom": "Genevieve M", "genre": "F", "lieu_naissance": "", "date_naissance": "21 mai 1996", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 11, "253": 15, "251": 12, "256": 14, "259": 11}, "matricule": "25-00336"}, {"id": "tim_25-00356", "nom": "NGO TONG BOM", "prenom": "Audrey Manuela", "genre": "F", "lieu_naissance": "", "date_naissance": "13 février 1996", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 14, "256": 14, "259": 11}, "matricule": "25-00356"}, {"id": "tim_25-00234", "nom": "NGUWO LOKANGAKA-OMALOWETE", "prenom": "Emmanuel", "genre": "M", "lieu_naissance": "", "date_naissance": "29 mars 1996", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 15, "256": 12, "259": 11}, "matricule": "25-00234"}, {"id": "tim_25-00389", "nom": "NIYONZIMA", "prenom": "Aubine", "genre": "F", "lieu_naissance": "", "date_naissance": "10 juin 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 10, "251": 14, "263": 10, "256": 16, "259": 12, "264": 15}, "matricule": "25-00389"}, {"id": "tim_25-00369", "nom": "NOGNIE NOUBI", "prenom": "Sorelle L", "genre": "F", "lieu_naissance": "", "date_naissance": "12 juin 2004", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 10, "256": 14, "259": 14}, "matricule": "25-00369"}, {"id": "tim_25-00488", "nom": "NOKO TOKAM", "prenom": "Emmanuelle A", "genre": "F", "lieu_naissance": "", "date_naissance": "8 janvier 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 18, "253": 13, "251": 13, "263": 14, "256": 15, "259": 11, "264": 15.5}, "matricule": "25-00488"}, {"id": "tim_24-00112", "nom": "NTEZIMANA", "prenom": "Dominique", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 18, "253": 16, "259": 16}, "matricule": "24-00112"}, {"id": "tim_24-00212", "nom": "ONOBIONO", "prenom": "Francis B", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00212"}, {"id": "tim_25-00386", "nom": "OPDEBEECK", "prenom": "Ariane", "genre": "F", "lieu_naissance": "", "date_naissance": "19 décembre 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 13, "251": 13, "263": 13, "256": 14, "259": 10, "264": 15.5}, "matricule": "25-00386"}, {"id": "tim_24-00214", "nom": "OUARRAOUI", "prenom": "Bouthaina", "genre": "F", "lieu_naissance": "", "date_naissance": "31 octobre 1998", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"259": 11}, "matricule": "24-00214"}, {"id": "tim_24-00222", "nom": "PIETKO", "prenom": "Gabriela J", "genre": "F", "lieu_naissance": "", "date_naissance": "2 avril 2001", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00222"}, {"id": "tim_25-00390", "nom": "POTTO", "prenom": "Larissa G", "genre": "F", "lieu_naissance": "", "date_naissance": "14 janvier 1995", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 15, "251": 10, "263": 16, "256": 15, "259": 13}, "matricule": "25-00390"}, {"id": "tim_25-00211", "nom": "PRZYCHODZIEN", "prenom": "Daria", "genre": "F", "lieu_naissance": "", "date_naissance": "1 janvier 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 14, "251": 12, "263": 15, "256": 18, "259": 11, "264": 16}, "matricule": "25-00211"}, {"id": "tim_25-00339", "nom": "PULULU", "prenom": "Daniel", "genre": "M", "lieu_naissance": "", "date_naissance": "1 août 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 15}, "matricule": "25-00339"}, {"id": "tim_24-00151", "nom": "ROUET", "prenom": "Mélanie M, G.", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 12, "253": 15}, "matricule": "24-00151"}, {"id": "tim_25-00366", "nom": "RZINE", "prenom": "Dounia", "genre": "F", "lieu_naissance": "", "date_naissance": "27 février 1998", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 15, "251": 12, "263": 16, "256": 15, "259": 14, "264": 17.5}, "matricule": "25-00366"}, {"id": "tim_24-00166", "nom": "SEBLENO-TIAKO", "prenom": "Cedril", "genre": "M", "lieu_naissance": "", "date_naissance": "11 juin 1988", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00166"}, {"id": "tim_25-00160", "nom": "SIGNE NCHIDA", "prenom": "Helene D", "genre": "F", "lieu_naissance": "", "date_naissance": "8 mai 1990", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 13, "256": 13, "259": 10}, "matricule": "25-00160"}, {"id": "tim_24-00283", "nom": "SIMO", "prenom": "Sorelle P", "genre": "F", "lieu_naissance": "", "date_naissance": "4 avril 1998", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00283"}, {"id": "tim_25-00503", "nom": "SIMO TCHOULA", "prenom": "Michele S", "genre": "F", "lieu_naissance": "", "date_naissance": "16 septembre 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 13, "253": 15, "251": 11, "263": 15, "256": 15, "259": 15, "264": 15}, "matricule": "25-00503"}, {"id": "tim_25-00192", "nom": "TAKEDO DJOMO", "prenom": "Dimitri", "genre": "M", "lieu_naissance": "", "date_naissance": "15 février 2002", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 13, "251": 12, "263": 11, "256": 16, "259": 16, "264": 15.5}, "matricule": "25-00192"}, {"id": "tim_24-00145", "nom": "TAPTUE FAMDIE", "prenom": "Serge", "genre": "M", "lieu_naissance": "", "date_naissance": "2 octobre 1991", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00145"}, {"id": "tim_25-00186", "nom": "TATSING TCHENEBE", "prenom": "Rodrigue A", "genre": "M", "lieu_naissance": "", "date_naissance": "13 septembre 1998", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 16, "253": 12, "256": 15, "259": 11}, "matricule": "25-00186"}, {"id": "tim_25-00332", "nom": "TCHAGNAOU", "prenom": "Ahamadou T", "genre": "M", "lieu_naissance": "", "date_naissance": "12 novembre 1994", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 18, "253": 14, "251": 12, "263": 14, "256": 15, "259": 11, "264": 17.5}, "matricule": "25-00332"}, {"id": "tim_25-00548", "nom": "TCHOFFO SELAMBI", "prenom": "Yannick A", "genre": "M", "lieu_naissance": "", "date_naissance": "18 novembre 1992", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "253": 10, "256": 10, "259": 10}, "matricule": "25-00548"}, {"id": "tim_25-00222", "nom": "TCHOUMOU", "prenom": "Amenan A. C.", "genre": "F", "lieu_naissance": "", "date_naissance": "24 février 1993", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 12, "253": 12}, "matricule": "25-00222"}, {"id": "tim_25-00463", "nom": "TCHUEMBOU NONO", "prenom": "Edwige Nathalie", "genre": "F", "lieu_naissance": "", "date_naissance": "23 août 1983", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 15, "251": 10, "263": 17, "256": 13, "259": 13, "264": 13.5}, "matricule": "25-00463"}, {"id": "tim_25-00544", "nom": "TEDAH JIOMETIO", "prenom": "Lutter K", "genre": "M", "lieu_naissance": "", "date_naissance": "8 mars 1999", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 12, "253": 12, "263": 11, "256": 14, "259": 10}, "matricule": "25-00544"}, {"id": "tim_24-00163", "nom": "TESSOH MACUGOUM", "prenom": "Marthe", "genre": "F", "lieu_naissance": "", "date_naissance": "2 juillet 1992", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 14, "253": 15}, "matricule": "24-00163"}, {"id": "tim_25-00221", "nom": "TRAORE", "prenom": "Fatoumata", "genre": "F", "lieu_naissance": "", "date_naissance": "27 mars 1977", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 15, "256": 15, "259": 13}, "matricule": "25-00221"}, {"id": "tim_25-00207", "nom": "TSAGUE TSOPZE", "prenom": "Frichinelle Gauss", "genre": "F", "lieu_naissance": "", "date_naissance": "22 octobre 2003", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 15, "251": 10, "263": 11, "256": 15, "259": 10, "264": 14}, "matricule": "25-00207"}, {"id": "tim_24-00187", "nom": "TSALA", "prenom": "Guy M", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00187"}, {"id": "tim_24-00123", "nom": "WANDZI  WAMBA", "prenom": "Stephanie", "genre": "F", "lieu_naissance": "", "date_naissance": "28 décembre 1991", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 11, "253": 15}, "matricule": "24-00123"}, {"id": "tim_24-00126", "nom": "WATAT DAWA", "prenom": "Doriane", "genre": "F", "lieu_naissance": "", "date_naissance": "9 août 1996", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"259": 15}, "matricule": "24-00126"}, {"id": "tim_24-00175", "nom": "YOWALOLA TSHIALA", "prenom": "Henrietta", "genre": "", "lieu_naissance": "", "date_naissance": "", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {}, "matricule": "24-00175"}, {"id": "tim_25-00227", "nom": "ZEMFACK DONGMO", "prenom": "Kerole", "genre": "F", "lieu_naissance": "", "date_naissance": "11 mai 2000", "section_code": "914300S36D3", "mention": "Distinction", "ue_determinantes": "", "ue_integree": "", "date_deliberation": "26 juin 2026", "_scores": {"252": 17, "253": 16, "251": 13, "263": 16, "256": 17, "259": 12, "264": 13.5}, "matricule": "25-00227"}];
const LIGNE_VIDE = () => ({
  id: Date.now() + Math.random(),
  nom: '', prenom: '', genre: 'F',
  lieu_naissance: '', date_naissance: '', registre_national: '',
  section_code: '', mention: 'Distinction',
  ue_determinantes: '', // ex: "UE 101 Anatomie — 15/20, UE 102 Soins — 17/20"
  ue_integree: '',      // ex: "UE 200 Projet intégré — 16/20"
  date_deliberation: new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }),
});

/* ── Composant cellule éditable ─────────────────────────────────────────────── */
function Cell({ value, onChange, type = 'text', options, small, placeholder }) {
  const base = `border-0 border-b border-gray-200 bg-transparent text-xs px-1 py-0.5 w-full focus:outline-none focus:border-iip-turquoise ${small ? 'w-16' : ''}`;
  if (options) return (
    <select value={value} onChange={e => onChange(e.target.value)} className={base + ' bg-white'}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={base} />;
}

/* ── Composant principal ─────────────────────────────────────────────────────── */
/* LE MODÈLE DE DIPLÔME A SA PORTE DANS CONFIGURATION (27 septembre 2026).
   Il ne vivait qu'ici, à l'adresse /attestation, qu'aucun menu n'ouvrait :
   Charles a demandé où le trouver. On y règle un MODÈLE, c'est donc la place
   de Configuration. */
export function ModeleDiplome() {
  useIdentite();   // le logo, la signature et le cachet arrivent du serveur
  return <DiplomeEditeur assets={{ logo_iip: LOGO_IIP, sceau: SCEAU_IIP, signature: SIGNATURE_SOHET }} />;
}

export default function Attestation() {
  useIdentite();   // le logo, la signature et le cachet arrivent du serveur
  const tok = () => localStorage.getItem('token');
  const af  = (url) => fetch(url, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

  const [onglet, setOnglet]               = useState('attestations');
  const [lignes, setLignes]               = useState([LIGNE_VIDE()]);
  const [sectionsDispo, setSectionsDispo] = useState([]);
  const [etab, setEtab]                   = useState({});
  const [annee, setAnnee]                 = useState('2025/2026');
  const [preview, setPreview]             = useState(null);
  const [generating, setGenerating]       = useState(false);
  const [q, setQ]                         = useState('');
  const [filtreUe, setFiltreUe]           = useState('');
  const [filtrePresence, setFiltrePresence] = useState('');
  const [sortCol, setSortCol]             = useState('nom');
  const [sortDir, setSortDir]             = useState('asc');
  const [selection, setSelection]         = useState(new Set());
  const [dirty, setDirty]                 = useState(false);
  const [enregOk, setEnregOk]             = useState(false);
  const chargementFait = useRef(false);
  const [lectureSeule, setLectureSeule]   = useState(false);
  const saveTimer = useRef(null);
  const [cfgBySec, setCfgBySec] = useState({}); // { [section_code]: { det, intUe, intNom } }
  const [docType, setDocType]       = useState('attestation'); // 'attestation' | 'diplome'
  const [tplDiplome, setTplDiplome] = useState('');
  const [logoHelb, setLogoHelb]     = useState('');

  useEffect(() => {
    af('/api/config/attestation_sections').then(d => {
      try { setSectionsDispo(JSON.parse(d.valeur)); } catch {}
    });
    af('/api/config/attestation_etab').then(d => {
      try {
        const e = JSON.parse(d.valeur);
        setEtab(e);
      } catch {}
    });
    af('/api/config/diplome_template').then(d => setTplDiplome(d.valeur || '')).catch(() => {});
    af('/api/config/diplome_logo_helb').then(d => setLogoHelb(d.valeur || '')).catch(() => {});
    af('/api/config/attestation_lignes').then(d => {
      try {
        const arr = JSON.parse(d.valeur);
        if (Array.isArray(arr) && arr.length) setLignes(arr.map(l => deriveLigne(l, cfgBySec)));
      } catch {}
    }).finally(() => { chargementFait.current = true; });
    const a = localStorage.getItem('annee_active');
    if (a) setAnnee(a.replace('-', '/'));
  }, []);

  // Clé stable des sections présentes (évite de recharger à chaque recalcul)
  const sectionsKey = useMemo(
    () => [...new Set(lignes.map(l => l.section_code).filter(Boolean))].sort().join(','),
    [lignes]
  );

  // Config de mention active pour l'affichage (colonnes) = section majoritaire des lignes, repli TIM
  const cfgActive = useMemo(() => {
    const counts = {};
    for (const l of lignes) if (l.section_code) counts[l.section_code] = (counts[l.section_code] || 0) + 1;
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return (top && cfgBySec[top]) || CFG_TIM;
  }, [lignes, cfgBySec]);

  // Charge, par section, ses UE déterminantes + épreuve intégrée (flags) via la liaison ue_section
  useEffect(() => {
    const codes = sectionsKey.split(',').filter(Boolean);
    if (!codes.length || !sectionsDispo.length) return;
    let annule = false;
    (async () => {
      const next = {};
      for (const code of codes) {
        if (cfgBySec[code]) continue;
        const sec = sectionsDispo.find(s => s.code === code);
        const ueSec = sec?.ue_section;
        if (!ueSec) continue;
        try {
          const d = await af(`/api/attributions/ue-mention?section=${encodeURIComponent(ueSec)}&annee=${encodeURIComponent(annee.replace('/', '-'))}`);
          if (d && Array.isArray(d.determinantes) && d.determinantes.length) {
            next[code] = {
              det: d.determinantes.map(u => ({ ue: String(u.ue_num), nom: u.ue_nom, periodes: u.periodes || 0 })),
              intUe: d.integree ? String(d.integree.ue_num) : null,
              intNom: (d.integree && d.integree.ue_nom) || 'Épreuve intégrée',
            };
          }
        } catch {}
      }
      if (!annule && Object.keys(next).length) setCfgBySec(prev => ({ ...prev, ...next }));
    })();
    return () => { annule = true; };
  }, [sectionsKey, sectionsDispo, annee]);

  const majLigne = useCallback((id, k, v) => {
    setLignes(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l));
  }, []);
  const majScore = useCallback((id, ue, v) => {
    setLignes(ls => ls.map(l => l.id === id ? deriveLigne({ ...l, _scores: { ...(l._scores || {}), [ue]: v } }, cfgBySec) : l));
  }, [cfgBySec]);

  const sauver = useCallback(async () => {
    try {
      const res = await fetch('/api/config/attestation_lignes', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valeur: JSON.stringify(lignes) }),
      });
      if (res.ok) { setDirty(false); setEnregOk(true); setTimeout(() => setEnregOk(false), 2000); }
      else if (res.status === 403) { setLectureSeule(true); }
    } catch {}
  }, [lignes]);

  useEffect(() => {
    if (!chargementFait.current || lectureSeule) return;
    setDirty(true); setEnregOk(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { sauver(); }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [lignes, sauver, lectureSeule]);

  useEffect(() => {
    setLignes(ls => ls.map(l => deriveLigne(l, cfgBySec)));
  }, [cfgBySec]);


  const supprimerLigne = (id) => setLignes(ls => ls.filter(l => l.id !== id));
  const dupliquerLigne = (id) => {
    const l = lignes.find(l => l.id === id);
    setLignes(ls => { const i = ls.findIndex(x => x.id === id); const n = [...ls]; n.splice(i+1, 0, { ...l, id: Date.now()+Math.random(), nom: '', prenom: '' }); return n; });
  };
  const ajouterLigne = () => setLignes(ls => [...ls, LIGNE_VIDE()]);

  const genererHtml = (l) => {
    const sec = sectionsDispo.find(s => s.code === l.section_code) || {};
    const ligneNaissance = l.lieu_naissance
      ? `Né·e à <strong>${l.lieu_naissance}</strong>, le <strong>${l.date_naissance || '…'}</strong>`
      : `Né·e le <strong>${l.date_naissance || '…'}</strong>`;
    return remplaceVars(genererTemplateAttestation(), {
      '{{nom_etudiant}}':     l.nom.toUpperCase(),
      '{{prenom_etudiant}}':  l.prenom,
      '{{genre}}':            l.genre,
      '{{ligne_naissance}}':  ligneNaissance,
      '{{intitule_diplome}}': sec.diplome || '',
      '{{mention}}':          l.mention,
      '{{intitule_section}}': sec.section || '',
      '{{code_section}}':     sec.code || '',
      '{{total_periodes}}':   String(sec.periodes || ''),
      '{{total_ects}}':       String(sec.ects || ''),
      '{{date_deliberation}}':l.date_deliberation,
      '{{bloc_ue_det}}':      '',
      '{{bloc_ue_int}}':      '',
      '{{annee}}':            annee,
      '{{directeur}}':        etab.directeur || 'Charles Sohet',
      '{{signature_directeur}}': SIGNATURE_SOHET,
      '{{sceau}}':            SCEAU_IIP,
      '{{nom_etab}}':         etab.nom || 'INSTITUT ILYA PRIGOGINE',
      '{{adresse_etab}}':     etab.adresse || '',
      '{{matricule_etab}}':   etab.matricule || '',
      '{{fase_etab}}':        etab.fase || '',
      '{{ville_etab}}':       etab.ville || 'Anderlecht',
      '{{tel_etab}}':         etab.tel || '',
      '{{site_etab}}':        etab.site || '',
      '{{logo_iip}}':         LOGO_IIP,
      '{{pied_page}}':        (() => {
        // Construire le pied de page depuis etab (même logique que piedDocument backend)
        const l1 = [etab.nom, etab.po ? 'PO ' + etab.po : null, etab.num_entreprise ? 'N° entreprise ' + etab.num_entreprise : null].filter(Boolean).join(' &nbsp;•&nbsp; ');
        const l2 = [etab.fase ? 'Fase ' + etab.fase : null, etab.adresse, etab.tel ? 'T. ' + etab.tel : null, etab.email, etab.site].filter(Boolean).join(' &nbsp;•&nbsp; ');
        return etab.pied_page || [l1, l2].filter(Boolean).join('<br>') || '';
      })(),
    });
  };

  const genererHtmlDiplome = (l) => {
    const sec = sectionsDispo.find(s => s.code === l.section_code) || {};
    const nomCap = (l.nom || '').charAt(0).toUpperCase() + (l.nom || '').slice(1).toLowerCase();
    return remplaceVars(tplDiplome || '', {
      '{{nom_etudiant}}':        l.nom.toUpperCase(),
      '{{prenom_etudiant}}':     l.prenom,
      '{{genre}}':               l.genre || '',
      '{{article_titulaire}}':   l.genre === 'M' ? 'Le' : 'La',
      '{{titulaire_nom}}':       `${l.prenom || ''} ${nomCap}`.trim(),
      '{{lieu_naissance}}':      l.lieu_naissance || '',
      '{{date_naissance}}':      l.date_naissance || '',
      '{{registre_national}}':   l.registre_national || '',
      '{{intitule_section}}':    sec.section || '',
      '{{grade_academique}}':    sec.grade_academique || sec.section || '',
      '{{code_section}}':        sec.code || '',
      '{{date_approbation}}':    sec.date_approbation || '',
      '{{total_ects}}':          String(sec.ects || ''),
      '{{duree_annees}}':        String(sec.duree_annees || ''),
      '{{domaine}}':             sec.domaine || '',
      '{{mention}}':             l.mention || '',
      '{{annee}}':               annee,
      '{{date_deliberation}}':   l.date_deliberation || '',
      '{{president_jury}}':      sec.president_jury || '',
      '{{directeur}}':           etab.directeur || 'Charles Sohet',
      '{{ville_etab}}':          etab.ville || '',
      '{{nom_etab}}':            etab.nom || 'INSTITUT ILYA PRIGOGINE',
      '{{adresse_etab}}':        etab.adresse || '',
      '{{matricule_etab}}':      etab.matricule || '',
      '{{fase_etab}}':           etab.fase || '',
      '{{logo_iip}}':            LOGO_IIP,
      '{{logo_helb}}':           logoHelb || '',
      '{{sceau}}':               '',
      '{{signature_directeur}}': '',
    });
  };

  // Aiguillage selon le type de document choisi (attestation | diplôme)
  const docHtml    = (l) => (docType === 'diplome' ? genererHtmlDiplome(l) : genererHtml(l));
  const docNom     = (l) => `${docType === 'diplome' ? 'Diplome' : 'Attestation'}_${l.nom}_${l.prenom}`;
  const docTitre   = docType === 'diplome' ? 'Diplômes' : 'Attestations';
  const docPaysage = docType === 'diplome';

  const telechargerUn = async (l) => {
    if (!(l.nom && l.section_code && l.mention)) return;
    if (docType === 'diplome' && !tplDiplome) { informer('Modèle de diplôme non chargé.'); return; }
    setGenerating(true);
    try {
      const [{ jsPDF }, h2c] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const blob = await htmlVersPdfBlob(docHtml(l), jsPDF, h2c.default, docPaysage);
      telecharger(blob, `${docNom(l)}.pdf`);
    } catch (e) { informer('Erreur PDF : ' + e.message); }
    finally { setGenerating(false); }
  };

  const genererZip = async () => {
    const base = selection.size ? lignesAffichees.filter(l => selection.has(l.id)) : lignesAffichees;
    const valides = base.filter(l => l.nom && l.section_code && l.mention);
    if (valides.length === 0) { informer('Aucun étudiant éligible : une mention valide (toutes les UE notées et ≥ 50%) est requise.'); return; }
    if (docType === 'diplome' && !tplDiplome) { informer('Modèle de diplôme non chargé. Ouvrez l’onglet « Modèle de diplôme » et Enregistrez une fois.'); return; }
    setGenerating(true);
    try {
      const [{ jsPDF }, h2c, JSZipMod] = await Promise.all([import('jspdf'), import('html2canvas'), import('jszip')]);
      const html2canvas = h2c.default, JSZip = JSZipMod.default;
      const zip = new JSZip();
      for (const l of valides) {
        const blob = await htmlVersPdfBlob(docHtml(l), jsPDF, html2canvas, docPaysage);
        zip.file(`${docNom(l)}.pdf`, blob);
        await new Promise(r => setTimeout(r, 120)); // laisse le fil principal se libérer entre deux rendus
      }
      const out = await zip.generateAsync({ type: 'blob' });
      telecharger(out, `${docTitre}_${annee.replace('/', '-')}.zip`);
    } catch (e) { informer('Erreur ZIP : ' + e.message); }
    finally { setGenerating(false); }
  };

  const genererBatch = () => {
    const base = selection.size ? lignesAffichees.filter(l => selection.has(l.id)) : lignesAffichees;
    const valides = base.filter(l => l.nom && l.section_code && l.mention);
    if (valides.length === 0) { informer('Aucun étudiant éligible : une mention valide (toutes les UE notées et résultat ≥ 50%) est requise.'); return; }
    if (docType === 'diplome' && !tplDiplome) { informer('Modèle de diplôme non chargé. Ouvrez l’onglet « Modèle de diplôme » et Enregistrez une fois.'); return; }
    setGenerating(true);
    try {
      // Rendu fidèle : on imprime via le moteur du navigateur (identique à l'aperçu)
      const docs = valides.map(docHtml);
      const style = (docs[0].match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
      const bodies = docs.map(d => (d.match(/<body>([\s\S]*?)<\/body>/) || [, ''])[1]);
      const combined = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>' + docTitre + ' ' + annee + '</title><style>' + style +
        '\n@media print{ .page{ page-break-after: always; } .page:last-child{ page-break-after: auto; } }</style></head><body>' +
        bodies.join('\n') + '</body></html>';
      ouvrirApercu({
        html: combined, titre: docTitre, sousTitre: `${valides.length} étudiant(s) · ${annee}`,
        nomFichier: `${docTitre}_${annee.replace('/', '-')}`,
        envoiPossible: false,
      });
    } catch (e) { informer('Erreur génération : ' + e.message); }
    finally { setGenerating(false); }
  };

  const optionsSections = [
    { value: '', label: '— Choisir —' },
    ...sectionsDispo.map(s => ({ value: s.code, label: s.section })),
  ];

  const COLS = [
    { label: 'Nom *',           key: 'nom',              w: 'w-24' },
    { label: 'Prénom *',        key: 'prenom',           w: 'w-24' },
    { label: 'G.',              key: 'genre',            w: 'w-12', options: [{ value:'F', label:'F' },{ value:'M', label:'M' },{ value:'X', label:'X' }] },
    { label: 'Lieu de naissance', key: 'lieu_naissance', w: 'w-28' },
    { label: 'Date de naissance', key: 'date_naissance', w: 'w-32', placeholder: 'ex: 26 décembre 2002' },
    { label: 'Registre national', key: 'registre_national', w: 'w-36', placeholder: 'ex: 98.03.12-123.45' },
    { label: 'Section *',       key: 'section_code',     w: 'w-52', options: optionsSections },
    { label: 'Date délibération', key: 'date_deliberation', w: 'w-36' },
  ];

  const UE_KEYS = [...cfgActive.det.map(u => u.ue), ...(cfgActive.intUe ? [cfgActive.intUe] : [])];
  const lignesAffichees = useMemo(() => {
    let r = lignes;
    const qq = q.trim().toLowerCase();
    if (qq) r = r.filter(l => `${l.nom} ${l.prenom}`.toLowerCase().includes(qq));
    if (filtreUe && filtrePresence) {
      r = r.filter(l => {
        const v = l._scores ? l._scores[filtreUe] : undefined;
        const has = v !== undefined && v !== '' && v !== null;
        return filtrePresence === 'avec' ? has : !has;
      });
    }
    const valCol = (l, col) => {
      if (col.startsWith('ue:')) { const v = l._scores ? l._scores[col.slice(3)] : undefined; return (v === '' || v == null) ? -1 : parseFloat(v); }
      if (col === 'mention') return l._calcPct || 0;
      return (l[col] ?? '').toString();
    };
    const arr = [...r];
    arr.sort((a, b) => {
      const va = valCol(a, sortCol), vb = valCol(b, sortCol);
      const c = (typeof va === 'number') ? va - vb : va.localeCompare(vb, 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? c : -c;
    });
    return arr;
  }, [lignes, q, filtreUe, filtrePresence, sortCol, sortDir]);

  const exporterListe = () => { try {
    const cols = ['Matricule', 'Nom', 'Prénom', 'Genre', 'Date naissance', 'Section',
      ...cfgActive.det.map(u => `UE${u.ue} /20`), ...(cfgActive.intUe ? [`UE${cfgActive.intUe} /20`] : []), 'Moyenne %', 'Mention'];
    const esc = (v) => { const t = v == null ? '' : String(v); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const base = selection.size ? lignesAffichees.filter(l => selection.has(l.id)) : lignesAffichees;
    const rows = base.filter(l => l.nom).map(l => {
      const sc = l._scores || {};
      return [
        l.matricule || String(l.id ?? '').replace('tim_', ''), l.nom, l.prenom, l.genre, l.date_naissance, l.section_code,
        ...cfgActive.det.map(u => sc[u.ue] ?? ''),
        ...(cfgActive.intUe ? [sc[cfgActive.intUe] ?? ''] : []),
        l._calcPct > 0 ? l._calcPct : '',
        l._calcPct > 0 ? l.mention : '',
      ].map(esc).join(';');
    });
    const csv = '\ufeff' + [cols.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    telecharger(blob, `Liste_resultats_TIM_${annee.replace('/', '-')}.csv`);
    } catch (e) { informer('Erreur export liste : ' + e.message); }
  };

  const trier = (col) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };
  const fleche = (col) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const toggleSel = (id) => setSelection(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const idsAffiches = lignesAffichees.filter(l => l.nom).map(l => l.id);
  const tousSel = idsAffiches.length > 0 && idsAffiches.every(id => selection.has(id));
  const toggleTous = () => setSelection(s => { if (idsAffiches.every(id => s.has(id)) && idsAffiches.length) { const n = new Set(s); idsAffiches.forEach(id => n.delete(id)); return n; } return new Set([...s, ...idsAffiches]); });

  const NB_COLS = 1 + COLS.length + cfgActive.det.length + (cfgActive.intUe ? 1 : 0) + 2;
  const renderRow = (l, idx) => {
    const sc = l._scores || {};
    return (
      <tr key={l.id} className={idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'}>
        <td className="px-2 py-1 text-center"><input type="checkbox" checked={selection.has(l.id)} onChange={() => toggleSel(l.id)} /></td>
        {COLS.map(c => (
          <td key={c.key} className={`px-2 py-1 ${c.w}`}>
            <Cell value={l[c.key]} onChange={v => majLigne(l.id, c.key, v)} options={c.options} placeholder={c.placeholder} />
          </td>
        ))}
        {cfgActive.det.map(u => (
          <td key={u.ue} className="px-1 py-1 text-center">
            <input type="number" min="0" max="20" step="0.5" value={sc[u.ue] ?? ''}
              onChange={e => majScore(l.id, u.ue, e.target.value)}
              className="w-12 border border-gray-200 rounded px-1 py-0.5 text-xs text-center focus:border-iip-turquoise focus:outline-none" />
          </td>
        ))}
        {cfgActive.intUe && (
        <td className="px-1 py-1 text-center">
          <input type="number" min="0" max="20" step="0.5" value={sc[cfgActive.intUe] ?? ''}
            onChange={e => majScore(l.id, cfgActive.intUe, e.target.value)}
            className="w-12 border border-amber-300 rounded px-1 py-0.5 text-xs text-center focus:border-amber-500 focus:outline-none" />
        </td>
        )}
        <td className="px-2 py-1 text-center">
          {l.mention
            ? <span className={`text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${mentionColorClass(l._calcPct)}`}>{l._calcPct}% — {l.mention}</span>
            : l._complet
              ? <span className="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap text-white bg-red-500">{l._calcPct}% — Échec</span>
              : <span className="text-gray-300" title="UE manquantes">—</span>}
        </td>
        <td className="px-2 py-1">
          <div className="flex items-center gap-1">
            <button onClick={() => l.nom && l.section_code && l.mention && setPreview({ html: docHtml(l), nom: docNom(l) })}
              title="Prévisualiser (mention requise : toutes les UE notées et ≥ 50%)" disabled={!l.nom || !l.section_code || !l.mention}
              className="text-iip-turquoise hover:opacity-70 disabled:opacity-30 p-0.5">
              <IconEye size={14}/>
            </button>
            <button onClick={() => telechargerUn(l)}
              title={`Télécharger ce ${docType === 'diplome' ? 'diplôme' : 'attestation'} (PDF)`}
              disabled={!l.nom || !l.section_code || !l.mention || generating}
              className="text-iip-blue hover:opacity-70 disabled:opacity-30 p-0.5">
              <IconDownload size={14}/>
            </button>
            <button onClick={() => dupliquerLigne(l.id)} title="Dupliquer"
              className="text-gray-400 hover:text-iip-blue p-0.5">
              <IconCopy size={14}/>
            </button>
            <button onClick={() => supprimerLigne(l.id)} title="Supprimer"
              className="text-gray-300 hover:text-red-500 p-0.5">
              <IconTrash size={14}/>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setOnglet('attestations')}
          className={`onglet-page ${onglet === 'attestations' ? 'onglet-page-actif' : ''}`}>
          Attestations de réussite
        </button>
        <button onClick={() => setOnglet('diplome')}
          className={`onglet-page ${onglet === 'diplome' ? 'onglet-page-actif' : ''}`}>
          Modèle de diplôme
        </button>
      </div>

      {onglet==='diplome' ? (
        <DiplomeEditeur assets={{ logo_iip: LOGO_IIP, sceau: SCEAU_IIP, signature: SIGNATURE_SOHET }} />
      ) : (<>
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="titre-ecran">Attestations de réussite</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Année :{' '}
            <input value={annee}
              onChange={e => { setAnnee(e.target.value); localStorage.setItem('annee_active', e.target.value.replace('/', '-')); }}
              className="font-bold text-iip-blue border-b border-gray-300 bg-transparent w-20 focus:outline-none focus:border-iip-turquoise" />
            {' '}· {lignes.filter(l => l.nom && l.section_code).length} attestation(s) prête(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={ajouterLigne}
            className="flex items-center gap-1.5 bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90">
            <IconPlus size={15}/> Ajouter une ligne
          </button>
          <button onClick={async () => {
            if (lignes.some(l => l.nom) && !(await demander('Remplacer les lignes existantes par les étudiants TIM BA1 2025-2026 ?'))) return;
            setLignes(ETUDIANTS_TIM_BA1.map(e => deriveLigne({ ...LIGNE_VIDE(), ...e, id: Date.now() + Math.random() }, cfgBySec)));
          }}
            className="flex items-center gap-1.5 bg-amber-500 text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90">
            📥 Importer TIM BA1 (101 étudiants)
          </button>
          {lectureSeule
            ? <span className="text-xs text-gray-500" title="Droits insuffisants : demandez la permission Listes (écriture)"><IconLock size={13} stroke={1.8} className="inline -mt-0.5 text-slate-400" /> Lecture seule</span>
            : <>
                {enregOk && <span className="text-xs text-green-600 font-medium">✓ Enregistré</span>}
                {dirty && !enregOk && <span className="text-xs text-amber-600">● non enregistré</span>}
                <button onClick={sauver} title="Enregistrer la liste"
                  className="flex items-center gap-1.5 bg-iip-turquoise text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90">
                  💾 Enregistrer
                </button>
              </>}
          <button onClick={exporterListe} title="Exporter la liste affichée (CSV)"
            className="flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <IconDownload size={15}/> Exporter la liste
          </button>
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setDocType('attestation')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md ${docType==='attestation' ? 'bg-white text-iip-blue shadow-pose' : 'text-gray-500 hover:text-iip-blue'}`}>
              Attestation
            </button>
            <button onClick={() => setDocType('diplome')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md ${docType==='diplome' ? 'bg-white text-iip-blue shadow-pose' : 'text-gray-500 hover:text-iip-blue'}`}>
              Diplôme
            </button>
          </div>
          <button onClick={genererBatch} disabled={generating}
            title="Un seul PDF (tous les documents à la suite)"
            className="flex items-center gap-1.5 bg-iip-blue text-white text-sm px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40 font-medium">
            <IconDownload size={15}/> {generating ? 'Préparation…' : 'PDF unique'}
          </button>
          <button onClick={genererZip} disabled={generating}
            title="ZIP : un fichier PDF par étudiant"
            className="flex items-center gap-1.5 bg-white border border-iip-blue text-iip-blue text-sm px-4 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 font-medium">
            📦 {generating ? 'Préparation…' : 'ZIP séparés'}
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-xl px-3 py-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un nom…"
          className="border border-gray-200 rounded px-2 py-1 text-xs w-48 focus:border-iip-turquoise focus:outline-none" />
        <select value={filtreUe} onChange={e => setFiltreUe(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs bg-white">
          <option value="">— UE —</option>
          {UE_KEYS.map(u => <option key={u} value={u}>UE {u}</option>)}
        </select>
        <select value={filtrePresence} onChange={e => setFiltrePresence(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs bg-white">
          <option value="">note : indifférent</option>
          <option value="avec">avec note</option>
          <option value="sans">sans note</option>
        </select>
        {(q || filtreUe || filtrePresence || sortCol !== 'nom' || sortDir !== 'asc') && (
          <button onClick={() => { setQ(''); setFiltreUe(''); setFiltrePresence(''); setSortCol('nom'); setSortDir('asc'); }}
            className="text-xs text-gray-400 hover:text-iip-blue underline">réinitialiser</button>
        )}
        <span className="ml-auto text-xs text-gray-500">{selection.size > 0 ? selection.size + ' sélectionné(s) · ' : ''}{lignesAffichees.filter(l => l.nom).length} affiché(s) / {lignes.filter(l => l.nom).length}</span>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 w-8 text-center"><input type="checkbox" checked={tousSel} onChange={toggleTous} title="Tout sélectionner (affichés)" /></th>
                {COLS.map(c => (
                  <th key={c.key} onClick={() => trier(c.key)} className={`text-left px-2 py-2 font-semibold text-gray-500 cursor-pointer select-none hover:text-iip-blue ${c.w}`}>{c.label}{fleche(c.key)}</th>
                ))}
                {cfgActive.det.map(u => (
                  <th key={u.ue} onClick={() => trier('ue:' + u.ue)} className="px-1 py-2 font-semibold text-gray-500 w-14 text-center cursor-pointer select-none hover:text-iip-blue" title={u.nom}>
                    UE{u.ue}{fleche('ue:' + u.ue)}<br/><span className="text-mention text-gray-400 font-normal">/20 · {u.periodes}p</span>
                  </th>
                ))}
                {cfgActive.intUe && (
                <th onClick={() => trier('ue:' + cfgActive.intUe)} className="px-1 py-2 font-semibold text-amber-600 w-14 text-center cursor-pointer select-none hover:text-amber-700" title={cfgActive.intNom}>
                  UE{cfgActive.intUe}{fleche('ue:' + cfgActive.intUe)}<br/><span className="text-mention text-amber-500 font-normal">/20 · 1/3</span>
                </th>
                )}
                <th onClick={() => trier('mention')} className="px-2 py-2 font-semibold text-gray-500 w-32 text-center cursor-pointer select-none hover:text-iip-blue">Mention (auto){fleche('mention')}</th>
                <th className="px-2 py-2 text-gray-500 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(() => {
                const complets = lignesAffichees.filter(l => l.nom && l._complet);
                const autres   = lignesAffichees.filter(l => !(l.nom && l._complet));
                const sec = (titre, n, cls) => (
                  <tr key={'sec-' + titre}><td colSpan={NB_COLS} className={'px-3 py-1.5 text-xs font-bold uppercase tracking-wide ' + cls}>{titre} — {n}</td></tr>
                );
                return (<>
                  {complets.length > 0 && sec('Dossiers complets (toutes les UE notées)', complets.length, 'bg-green-50 text-green-700')}
                  {complets.map((l, i) => renderRow(l, i))}
                  {autres.length > 0 && sec('Dossiers incomplets (UE manquantes)', autres.length, 'bg-amber-50 text-amber-700')}
                  {autres.map((l, i) => renderRow(l, i))}
                </>);
              })()}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          Notes sur /20 — {cfgActive.det.length} UE déterminantes (total {cfgActive.det.reduce((a, u) => a + (u.periodes || 0), 0)} périodes cours+autonomie, pondération 2/3){cfgActive.intUe ? ` + UE ${cfgActive.intUe} épreuve intégrée (1/3)` : ''}. Mention calculée automatiquement.
        </div>
      </div>

      {preview && (
        <PreviewModal
          html={preview.html}
          titre={preview.nom.replace('Attestation_', '').replace(/_/g, ' ')}
          sousTitre={`Attestation provisoire · ${annee}`}
          nomFichier={preview.nom}
          onClose={() => setPreview(null)}
        />
      )}
      </>)}
    </div>
  );
}

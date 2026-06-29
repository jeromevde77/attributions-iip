import { useState } from 'react';
import { IconGavel, IconScale, IconMail, IconClipboardText, IconGavel as IconDecision } from '@tabler/icons-react';
import PreviewModal from '../components/PreviewModal.jsx';

/* ── Helpers dates (jours ouvrables, hors week-ends ; fériés non gérés) ──────── */
function addJoursOuvrables(date, n) {
  const d = new Date(date); let a = 0;
  while (a < n) { d.setDate(d.getDate() + 1); const j = d.getDay(); if (j !== 0 && j !== 6) a++; }
  return d;
}
function fmtLong(d) {
  if (!d) return '…';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '…';
  return dt.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── Cadre légal par année ──────────────────────────────────────────────────── */
const ANNEES = [
  { code: '2025-2026', label: '2025-2026 · ROI 24-25' },
  { code: '2026-2027', label: '2026-2027 · nouveau RDE' },
];
const ART = {
  '2025-2026': {
    reg: "Règlement d'Ordre Intérieur (ROI) 2024-2025",
    fraude: 'articles 54 et 55 du ROI', discipline: 'articles 94 à 96 du ROI',
    notif: "l'article 96 du ROI", recours: 'la procédure de recours prévue par le ROI',
  },
  '2026-2027': {
    reg: "Règlement Général des Études et d'Ordre Intérieur (RDE) 2026-2027",
    fraude: 'articles 72 à 75 du RDE', discipline: 'articles 115 à 119 du RDE',
    notif: "l'article 119 du RDE", recours: 'les articles 87 à 91 du RDE (recours interne, puis externe)',
  },
};
const DELAI_CONVOC_JO = 8;

const TYPES_FAIT = [
  { key: 'fraude_examen', label: "Fraude lors d'une épreuve", fraude: true },
  { key: 'fraude_correction', label: 'Fraude / plagiat constaté à la correction', fraude: true },
  { key: 'plagiat', label: 'Plagiat / non-citation des sources', fraude: true },
  { key: 'comportement', label: 'Comportement / indiscipline', fraude: false },
  { key: 'faute_grave', label: 'Faute grave (violence, menaces, arme, racket…)', fraude: false },
  { key: 'dommages', label: 'Dommages matériels', fraude: false },
  { key: 'faux', label: 'Faux documents / fausses déclarations', fraude: false },
];
const SANCTIONS = [
  { key: 'rappel', label: "Rappel à l'ordre", autorite: 'la Direction' },
  { key: 'renvoi_prov', label: 'Renvoi provisoire des activités (max. 5 jours ouvrables)', autorite: 'la Direction' },
  { key: 'eloignement', label: "Éloignement provisoire à titre de mesure d'ordre (max. 15 jours ouvrables)", autorite: 'la Direction' },
  { key: 'renvoi_def', label: "Renvoi définitif de l'établissement", autorite: 'la Direction, après avis du Conseil des Études' },
  { key: 'fraude_sanction', label: 'Ajournement / refus pour fraude (UE concernée)', autorite: "le Conseil des Études ou le Jury d'Épreuve intégrée" },
  { key: 'annulation', label: "Annulation des points / refus aux évaluations de l'UE (fraude)", autorite: "le Conseil des Études ou le Jury d'Épreuve intégrée" },
];

const ETAB = {
  nom: 'INSTITUT ILYA PRIGOGINE',
  adresse: 'Campus Erasme · Bâtiment P · Route de Lennik 808, 1070 Bruxelles',
  matricule: '2.132.070', fase: '292', tel: '+32 (0)2 560 29 59', site: 'www.institut-prigogine.be',
  directeur: 'Charles Sohet',
};

function docHTML(titreDoc, corps) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${titreDoc}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  @media print { @page { size: A4; margin: 18mm; } }
  .doc { padding: 6mm 0; }
  .entete { border-bottom: 2pt solid #1B2B4B; padding-bottom: 6pt; margin-bottom: 12pt; }
  .entete .nom { font-size: 15pt; font-weight: bold; color: #1B2B4B; }
  .entete .coord { font-size: 8.5pt; color: #555; margin-top: 2pt; }
  .titre { text-align: center; font-weight: bold; font-size: 12.5pt; color: #1B2B4B; text-transform: uppercase; margin: 14pt 0; letter-spacing: .5pt; }
  .bloc-faits { border: 1pt solid #ccc; background: #fff8f0; padding: 8pt 10pt; margin: 10pt 0; }
  p { margin: 7pt 0; text-align: justify; }
  .sig { margin-top: 26pt; }
  .pied { margin-top: 22pt; border-top: .5pt solid #C9A84C; padding-top: 4pt; font-size: 7.5pt; color: #888; text-align: center; }
  table { width: 100%; }
</style></head><body><div class="doc">
  <div class="entete"><div class="nom">${ETAB.nom}</div>
  <div class="coord">${ETAB.adresse} · Matricule ${ETAB.matricule} · Fase ${ETAB.fase} · ${ETAB.tel}</div></div>
  ${corps}
  <div class="pied">${ETAB.nom} · ${ETAB.adresse} · Fase ${ETAB.fase} · ${ETAB.site}</div>
</div></body></html>`;
}

export default function Disciplinaire() {
  const [annee, setAn] = useState('2026-2027');
  const [nom, setNom] = useState(''); const [prenom, setPrenom] = useState('');
  const [section, setSection] = useState(''); const [adresse, setAdresse] = useState('');
  const [typeFait, setTypeFait] = useState('fraude_examen');
  const [dateFaits, setDateFaits] = useState('');
  const [rapporteur, setRapporteur] = useState('');
  const [description, setDescription] = useState('');
  const [sanction, setSanction] = useState('rappel');
  const [dateEnvoi, setDateEnvoi] = useState('');
  const [dateAudition, setDateAudition] = useState('');
  const [heureAudition, setHeureAudition] = useState('');
  const [lieuAudition, setLieuAudition] = useState("le secrétariat de l'Institut Ilya Prigogine");
  const [presents, setPresents] = useState('');
  const [declarations, setDeclarations] = useState('');
  const [dateDecision, setDateDecision] = useState('');
  const [motivation, setMotivation] = useState('');
  const [preview, setPreview] = useState(null);

  const a = ART[annee];
  const tf = TYPES_FAIT.find(t => t.key === typeFait) || {};
  const sa = SANCTIONS.find(s => s.key === sanction) || {};
  const etu = `${prenom} ${nom.toUpperCase()}`.trim() || '[ÉTUDIANT·E]';
  const baseLeg = tf.fraude ? a.fraude : a.discipline;
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const nl = (s) => (s || '…').replace(/\n/g, '<br>');

  const dateAuditionMin = dateEnvoi ? addJoursOuvrables(dateEnvoi, DELAI_CONVOC_JO) : null;
  const delaiOk = (dateEnvoi && dateAudition) ? (new Date(dateAudition) >= addJoursOuvrables(dateEnvoi, DELAI_CONVOC_JO)) : null;

  const analyse = () => {
    const L = [];
    L.push(`Cadre applicable : ${a.reg}.`);
    L.push(`Qualification : ${(tf.label || '').toLowerCase()} — base réglementaire : ${baseLeg}.`);
    if (tf.fraude) L.push(`Fraude/plagiat : audition séparée des parties puis audition contradictoire (${a.fraude}) ; décision du Conseil des Études ou du Jury d'Épreuve intégrée, formellement motivée.`);
    else L.push(`Toute sanction disciplinaire requiert l'audition préalable de l'étudiant·e ; la sanction est proportionnée à la gravité et un même fait ne peut donner lieu qu'à une seule sanction.`);
    L.push(`Sanction envisagée : ${sa.label} — prononcée par ${sa.autorite}.`);
    if (sanction === 'renvoi_def') L.push(`Renvoi définitif : avis préalable obligatoire du Conseil des Études, versé au dossier disciplinaire consultable par l'étudiant·e.`);
    L.push(`Convocation : recommandé (ou contre accusé de réception), déposé au moins ${DELAI_CONVOC_JO} jours ouvrables avant l'audition ; mentionne jour/heure/lieu, faits reprochés, sanction envisagée, droit d'être assisté·e et consultation du dossier.`);
    L.push(`Notification de la décision : pli recommandé ou écrit contre accusé de réception (${a.notif}).`);
    L.push(`Voies de recours : ${a.recours}.`);
    return L;
  };

  const genConvocation = () => docHTML('Convocation à audition', `
    <p style="text-align:right">Bruxelles, le ${fmtLong(dateEnvoi)}</p>
    <p style="text-align:right">${etu}<br>${adresse || ''}</p>
    <p style="margin-top:10pt"><strong>Objet : convocation à une audition — procédure disciplinaire — ENVOI RECOMMANDÉ</strong></p>
    <p>${prenom ? `Cher·ère ${prenom},` : 'Madame, Monsieur,'}</p>
    <p>Dans le cadre de l'application du ${a.reg}, et plus particulièrement de ${baseLeg}, la Direction a été informée des faits suivants vous concernant :</p>
    <div class="bloc-faits"><strong>Faits reprochés — constatés le ${fmtLong(dateFaits)}${rapporteur ? `, rapportés par ${rapporteur}` : ''} :</strong><br>${nl(description)}</div>
    <p>Ces faits sont susceptibles de constituer ${(tf.label || '').toLowerCase()} au sens de ${baseLeg}, et pourraient donner lieu à la sanction suivante : <strong>${sa.label}</strong>, prononcée par ${sa.autorite}.</p>
    <p>Vous êtes convoqué·e à une <strong>audition</strong> qui se tiendra le <strong>${fmtLong(dateAudition)}${heureAudition ? ` à ${heureAudition}` : ''}</strong>, à ${lieuAudition}.</p>
    <p>Lors de cette audition, vous pouvez <strong>vous faire assister de la personne de votre choix</strong> et faire entendre toute personne utile. Vous pouvez également <strong>consulter votre dossier disciplinaire</strong> au secrétariat, durant les heures d'ouverture.</p>
    <p>À défaut de comparution, la procédure suivra son cours.</p>
    <p>Veuillez agréer, ${prenom ? `cher·ère ${prenom}` : 'Madame, Monsieur'}, l'expression de mes salutations distinguées.</p>
    <div class="sig"><p>Pour la Direction,<br><strong>${ETAB.directeur}</strong>, Directeur</p></div>`);

  const genPV = () => docHTML("PV d'audition", `
    <div class="titre">Procès-verbal d'audition</div>
    <p><strong>Étudiant·e :</strong> ${etu}${section ? ` — section ${section}` : ''}</p>
    <p><strong>Date de l'audition :</strong> ${fmtLong(dateAudition)}${heureAudition ? ` à ${heureAudition}` : ''} — ${lieuAudition}</p>
    <p><strong>Cadre :</strong> ${a.reg} — ${baseLeg}</p>
    <p><strong>Personnes présentes :</strong> ${presents || '…'}</p>
    <div class="bloc-faits"><strong>Faits examinés — constatés le ${fmtLong(dateFaits)} :</strong><br>${nl(description)}</div>
    ${tf.fraude ? `<p>Conformément à ${a.fraude}, les parties ont été entendues séparément, puis il a été procédé à une audition contradictoire.</p>` : ''}
    <p><strong>Déclarations et observations de l'étudiant·e :</strong></p>
    <p>${nl(declarations)}</p>
    <p>Le présent procès-verbal est établi séance tenante.</p>
    <div class="sig"><table><tr>
      <td style="width:50%">La Direction (ou son délégué),<br><br>__________________</td>
      <td>L'étudiant·e,<br><br>__________________</td></tr></table></div>`);

  const genDecision = () => docHTML('Décision disciplinaire', `
    <p style="text-align:right">Bruxelles, le ${fmtLong(dateDecision)}</p>
    <p style="text-align:right">${etu}<br>${adresse || ''}</p>
    <p style="margin-top:10pt"><strong>Objet : décision en matière disciplinaire — ENVOI RECOMMANDÉ</strong></p>
    <div class="titre">Décision motivée</div>
    <p><strong>Vu</strong> le ${a.reg}, et notamment ${baseLeg} ;</p>
    <p><strong>Vu</strong> les faits constatés le ${fmtLong(dateFaits)}${rapporteur ? `, rapportés par ${rapporteur}` : ''} :</p>
    <div class="bloc-faits">${nl(description)}</div>
    <p><strong>Vu</strong> la convocation adressée à l'étudiant·e et son audition tenue le ${fmtLong(dateAudition)} ;</p>
    <p><strong>Considérant</strong> ${nl(motivation || "les éléments du dossier et la gravité des faits, appréciée au regard de l'atteinte au bon fonctionnement de l'établissement")} ;</p>
    <p>${cap(sa.autorite)} décide d'appliquer la sanction suivante : <strong>${sa.label}</strong>.</p>
    ${sanction === 'renvoi_def' ? `<p>Cette décision a été prise après avis du Conseil des Études, versé au dossier disciplinaire.</p>` : ''}
    <p>La présente décision est formellement motivée et vous est notifiée par pli recommandé (ou contre accusé de réception), conformément à ${a.notif}.</p>
    <p><strong>Voies de recours :</strong> conformément à ${a.recours}.</p>
    <div class="sig"><p>Pour la Direction,<br><strong>${ETAB.directeur}</strong>, Directeur</p></div>`);

  const ouvrir = (titre, html) => setPreview({ titre, html, sousTitre: `Disciplinaire · ${annee}` });

  const champ = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-iip-turquoise focus:outline-none";
  const lab = "block text-xs font-semibold text-gray-500 mb-1";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <IconGavel size={26} className="text-iip-blue" />
        <div>
          <h1 className="text-2xl font-title text-iip-blue">Disciplinaire étudiant</h1>
          <p className="text-sm text-gray-500">Aide à la décision · projets de convocation, PV d'audition et décision motivée</p>
        </div>
        <select value={annee} onChange={e => setAn(e.target.value)} className={champ + ' ml-auto w-56'}>
          {ANNEES.map(y => <option key={y.code} value={y.code}>{y.label}</option>)}
        </select>
      </div>

      {/* Identité + faits */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label className={lab}>Nom</label><input className={champ} value={nom} onChange={e => setNom(e.target.value)} /></div>
        <div><label className={lab}>Prénom</label><input className={champ} value={prenom} onChange={e => setPrenom(e.target.value)} /></div>
        <div><label className={lab}>Section</label><input className={champ} value={section} onChange={e => setSection(e.target.value)} /></div>
        <div className="md:col-span-3"><label className={lab}>Adresse de l'étudiant·e (pour le courrier)</label><input className={champ} value={adresse} onChange={e => setAdresse(e.target.value)} /></div>
        <div><label className={lab}>Type de fait</label>
          <select className={champ} value={typeFait} onChange={e => setTypeFait(e.target.value)}>
            {TYPES_FAIT.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select></div>
        <div><label className={lab}>Date des faits</label><input type="date" className={champ} value={dateFaits} onChange={e => setDateFaits(e.target.value)} /></div>
        <div><label className={lab}>Rapporté par</label><input className={champ} value={rapporteur} onChange={e => setRapporteur(e.target.value)} /></div>
        <div className="md:col-span-3"><label className={lab}>Description des faits</label><textarea rows={3} className={champ} value={description} onChange={e => setDescription(e.target.value)} /></div>
        <div className="md:col-span-3"><label className={lab}>Sanction envisagée</label>
          <select className={champ} value={sanction} onChange={e => setSanction(e.target.value)}>
            {SANCTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></div>
      </div>

      {/* Aide à la décision */}
      <div className="bg-iip-blue/5 border border-iip-blue/20 rounded-xl p-4">
        <div className="flex items-center gap-2 text-iip-blue font-semibold text-sm mb-2"><IconScale size={16} /> Analyse RDE/ROI — aide à la décision</div>
        <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
          {analyse().map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </div>

      {/* Calendrier procédure */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div><label className={lab}>Envoi de la convocation</label><input type="date" className={champ} value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)} /></div>
        <div><label className={lab}>Date d'audition</label><input type="date" className={champ} value={dateAudition} onChange={e => setDateAudition(e.target.value)} />
          {dateAuditionMin && <p className="text-[11px] text-gray-500 mt-1">Au plus tôt : <strong>{fmtLong(dateAuditionMin)}</strong> (8 j ouvr.)</p>}
          {delaiOk === false && <p className="text-[11px] text-red-600 mt-1">⚠ Délai de 8 jours ouvrables non respecté.</p>}
          {delaiOk === true && <p className="text-[11px] text-green-600 mt-1">✓ Délai respecté.</p>}
        </div>
        <div><label className={lab}>Heure</label><input className={champ} value={heureAudition} onChange={e => setHeureAudition(e.target.value)} placeholder="ex : 14h00" /></div>
        <div><label className={lab}>Lieu de l'audition</label><input className={champ} value={lieuAudition} onChange={e => setLieuAudition(e.target.value)} /></div>
        <div className="md:col-span-2"><label className={lab}>Présents à l'audition</label><input className={champ} value={presents} onChange={e => setPresents(e.target.value)} /></div>
        <div className="md:col-span-2"><label className={lab}>Date de la décision</label><input type="date" className={champ} value={dateDecision} onChange={e => setDateDecision(e.target.value)} /></div>
        <div className="md:col-span-4"><label className={lab}>Déclarations / observations de l'étudiant·e (pour le PV)</label><textarea rows={2} className={champ} value={declarations} onChange={e => setDeclarations(e.target.value)} /></div>
        <div className="md:col-span-4"><label className={lab}>Motivation de la décision</label><textarea rows={2} className={champ} value={motivation} onChange={e => setMotivation(e.target.value)} /></div>
      </div>

      {/* Documents */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => ouvrir('Convocation à audition', genConvocation())} className="flex items-center gap-1.5 bg-iip-blue text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"><IconMail size={16} /> Convocation</button>
        <button onClick={() => ouvrir("PV d'audition", genPV())} className="flex items-center gap-1.5 bg-iip-blue text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"><IconClipboardText size={16} /> PV d'audition</button>
        <button onClick={() => ouvrir('Décision disciplinaire', genDecision())} className="flex items-center gap-1.5 bg-iip-blue text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"><IconDecision size={16} /> Décision</button>
      </div>

      {preview && <PreviewModal html={preview.html} titre={preview.titre} sousTitre={preview.sousTitre} onClose={() => setPreview(null)} />}
    </div>
  );
}

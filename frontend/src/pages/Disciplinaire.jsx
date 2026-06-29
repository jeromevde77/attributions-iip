import { useState, useEffect, useRef } from 'react';
import { IconGavel, IconScale, IconMail, IconClipboardText, IconGavel as IconDecision, IconPaperclip, IconTrash, IconDownload, IconPlus, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import PreviewModal from '../components/PreviewModal.jsx';

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

const ANNEES = [
  { code: '2025-2026', label: '2025-2026 · ROI 24-25' },
  { code: '2026-2027', label: '2026-2027 · nouveau RDE' },
];
const ART = {
  '2025-2026': { reg: "Règlement d'Ordre Intérieur (ROI) 2024-2025", fraude: 'articles 54 et 55 du ROI', discipline: 'articles 94 à 96 du ROI', procedure: "l'article 96 du ROI", notif: "l'article 96 du ROI", recoursAcad: 'la procédure de recours prévue par le ROI', recoursExclusion: "un recours interne auprès du Pouvoir Organisateur, sans préjudice des voies de droit commun" },
  '2026-2027': { reg: "Règlement Général des Études et d'Ordre Intérieur (RDE) 2026-2027", fraude: 'articles 72 à 75 du RDE', discipline: 'articles 115 à 119 du RDE', procedure: 'les articles 115 bis à 115 novies du RDE', notif: 'les articles 115 novies et 119 du RDE', recoursAcad: "les articles 87 à 91 du RDE (recours interne, puis recours externe auprès de l'Administration)", recoursExclusion: "l'article 119 bis du RDE : recours interne auprès du Pouvoir Organisateur, par lettre recommandée motivée, dans les dix jours ouvrables suivant la notification (non suspensif), sans préjudice des voies de droit commun (art. 119 ter)" },
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
const CATEGORIES = ['Courrier reçu', "Réponse de l'étudiant·e", 'Preuve', 'Autre'];
const ETAB = { nom: 'INSTITUT ILYA PRIGOGINE', adresse: 'Campus Erasme · Bâtiment P · Route de Lennik 808, 1070 Bruxelles', matricule: '2.132.070', fase: '292', tel: '+32 (0)2 560 29 59', site: 'www.institut-prigogine.be', directeur: 'Charles Sohet' };

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

function Q({ text, art, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{text}{art && <span className="text-xs text-gray-400 ml-1">({art})</span>}</span>
      <div className="flex gap-1 flex-shrink-0">
        {['oui', 'non'].map(v => (
          <button key={v} type="button" onClick={() => onChange(value === v ? '' : v)}
            className={`text-xs px-3 py-1 rounded border ${value === v ? (v === 'oui' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500') : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
            {v === 'oui' ? 'Oui' : 'Non'}
          </button>
        ))}
      </div>
    </div>
  );
}
const Check = ({ ok, label }) => (
  <div className="flex items-center gap-2 text-sm py-0.5">
    <span className={ok ? 'text-green-600' : 'text-red-500'}>{ok ? '✓' : '✗'}</span>
    <span className={ok ? 'text-gray-700' : 'text-red-600'}>{label}</span>
  </div>
);

export default function Disciplinaire() {
  const tok = () => localStorage.getItem('token');
  const auth = { Authorization: `Bearer ${tok()}` };
  const af = (url) => fetch(url, { headers: auth }).then(r => r.json());

  const [step, setStep] = useState(1);
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
  // Questions oui/non (aide pas à pas)
  const [qEtablis, setQEtablis] = useState(''); const [qRecidive, setQRecidive] = useState('');
  const [qGrave, setQGrave] = useState(''); const [qPresente, setQPresente] = useState('');
  const [qAssiste, setQAssiste] = useState(''); const [qContradictoire, setQContradictoire] = useState('');
  const [qPvSigne, setQPvSigne] = useState(''); const [qRefusConstate, setQRefusConstate] = useState('');
  const [qAvisDemande, setQAvisDemande] = useState(''); const [qAvisRecu, setQAvisRecu] = useState('');
  const [preview, setPreview] = useState(null);

  const [caseId, setCaseId] = useState(null);
  const [dossiers, setDossiers] = useState([]);
  const [fichiers, setFichiers] = useState([]);
  const [catUp, setCatUp] = useState('Courrier reçu');
  const [enreg, setEnreg] = useState(false);
  const [lectureSeule, setLectureSeule] = useState(false);
  const caseRef = useRef(null); const skipSave = useRef(true); const saveTimer = useRef(null);

  const a = ART[annee];
  const tf = TYPES_FAIT.find(t => t.key === typeFait) || {};
  const sa = SANCTIONS.find(s => s.key === sanction) || {};
  const etu = `${prenom} ${nom.toUpperCase()}`.trim() || '[ÉTUDIANT·E]';
  const baseLeg = tf.fraude ? a.fraude : a.discipline;
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const nl = (s) => (s || '…').replace(/\n/g, '<br>');
  const estAcademique = ['fraude_sanction', 'annulation'].includes(sanction);
  const recoursTxt = estAcademique ? a.recoursAcad
    : (sanction === 'renvoi_def' ? a.recoursExclusion
      : "les mesures d'ordre et sanctions légères ne font pas l'objet d'un recours formel ; les voies de droit commun demeurent ouvertes");
  const r2627 = annee === '2026-2027';
  const refProc = a.procedure;
  const refConv = r2627 ? "l'article 115 quater du RDE" : "l'article 96 du ROI";
  const refAudi = r2627 ? "l'article 115 ter du RDE" : "l'article 96 du ROI";
  const refDossier = r2627 ? "l'article 115 sexies du RDE" : "l'article 96 du ROI";
  const estRenvoiDef = sanction === 'renvoi_def';

  const payload = { step, annee, nom, prenom, section, adresse, typeFait, dateFaits, rapporteur, description, sanction, dateEnvoi, dateAudition, heureAudition, lieuAudition, presents, declarations, dateDecision, motivation, qEtablis, qRecidive, qGrave, qPresente, qAssiste, qContradictoire, qPvSigne, qRefusConstate, qAvisDemande, qAvisRecu };
  const payloadStr = JSON.stringify(payload);

  const chargerDossiers = () => af('/api/disciplinaire/cases').then(d => setDossiers(Array.isArray(d) ? d : [])).catch(() => {});
  const chargerFichiers = (id) => af(`/api/disciplinaire/cases/${id}`).then(d => setFichiers(d.fichiers || [])).catch(() => {});
  useEffect(() => { chargerDossiers(); }, []);
  useEffect(() => { caseRef.current = caseId; }, [caseId]);

  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return; }
    if (lectureSeule) return;
    if (!caseRef.current && !nom && !description) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/disciplinaire/save', {
          method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: caseRef.current, annee, etudiant: `${prenom} ${nom}`.trim(), section, payload, statut: 'en_cours' }),
        });
        if (res.ok) { const j = await res.json(); if (!caseRef.current && j.id) { caseRef.current = j.id; setCaseId(j.id); } setEnreg(true); setTimeout(() => setEnreg(false), 1500); chargerDossiers(); }
        else if (res.status === 403) setLectureSeule(true);
      } catch {}
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [payloadStr]);

  const nouveauDossier = () => {
    skipSave.current = true;
    setCaseId(null); caseRef.current = null; setFichiers([]); setStep(1);
    setNom(''); setPrenom(''); setSection(''); setAdresse(''); setTypeFait('fraude_examen');
    setDateFaits(''); setRapporteur(''); setDescription(''); setSanction('rappel');
    setDateEnvoi(''); setDateAudition(''); setHeureAudition(''); setPresents(''); setDeclarations(''); setDateDecision(''); setMotivation('');
    setQEtablis(''); setQRecidive(''); setQGrave(''); setQPresente(''); setQAssiste(''); setQContradictoire(''); setQPvSigne(''); setQRefusConstate(''); setQAvisDemande(''); setQAvisRecu('');
  };

  const ouvrirDossier = async (id) => {
    if (!id) return;
    const d = await af(`/api/disciplinaire/cases/${id}`); const p = d.payload || {};
    skipSave.current = true;
    setCaseId(d.id); caseRef.current = d.id; setStep(p.step || 1);
    setAn(p.annee || '2026-2027'); setNom(p.nom || ''); setPrenom(p.prenom || ''); setSection(p.section || ''); setAdresse(p.adresse || '');
    setTypeFait(p.typeFait || 'fraude_examen'); setDateFaits(p.dateFaits || ''); setRapporteur(p.rapporteur || ''); setDescription(p.description || '');
    setSanction(p.sanction || 'rappel'); setDateEnvoi(p.dateEnvoi || ''); setDateAudition(p.dateAudition || ''); setHeureAudition(p.heureAudition || '');
    setLieuAudition(p.lieuAudition || "le secrétariat de l'Institut Ilya Prigogine"); setPresents(p.presents || ''); setDeclarations(p.declarations || '');
    setDateDecision(p.dateDecision || ''); setMotivation(p.motivation || '');
    setQEtablis(p.qEtablis || ''); setQRecidive(p.qRecidive || ''); setQGrave(p.qGrave || ''); setQPresente(p.qPresente || ''); setQAssiste(p.qAssiste || '');
    setQContradictoire(p.qContradictoire || ''); setQPvSigne(p.qPvSigne || ''); setQRefusConstate(p.qRefusConstate || ''); setQAvisDemande(p.qAvisDemande || ''); setQAvisRecu(p.qAvisRecu || '');
    setFichiers(d.fichiers || []);
  };

  const supprimerDossier = async () => {
    if (!caseId || !confirm('Supprimer ce dossier disciplinaire et ses pièces jointes ?')) return;
    await fetch(`/api/disciplinaire/cases/${caseId}`, { method: 'DELETE', headers: auth });
    nouveauDossier(); chargerDossiers();
  };
  const uploadFichier = async (file) => {
    if (!file) return;
    if (!caseRef.current) { alert('Renseignez d’abord les faits (le dossier s’enregistre tout seul), puis ajoutez les pièces.'); return; }
    const fd = new FormData(); fd.append('fichier', file); fd.append('categorie', catUp);
    const res = await fetch(`/api/disciplinaire/cases/${caseRef.current}/fichiers`, { method: 'POST', headers: auth, body: fd });
    if (res.ok) chargerFichiers(caseRef.current); else if (res.status === 403) setLectureSeule(true); else alert('Échec de l’envoi.');
  };
  const supprimerFichier = async (fid) => { if (!confirm('Supprimer cette pièce ?')) return; await fetch(`/api/disciplinaire/fichiers/${fid}`, { method: 'DELETE', headers: auth }); chargerFichiers(caseRef.current); };
  const telechargerFichier = async (fid, nomf) => {
    const res = await fetch(`/api/disciplinaire/fichiers/${fid}/download`, { headers: auth }); if (!res.ok) return;
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const el = document.createElement('a'); el.href = url; el.download = nomf; document.body.appendChild(el); el.click();
    setTimeout(() => { try { document.body.removeChild(el); } catch {} URL.revokeObjectURL(url); }, 1000);
  };

  const dateAuditionMin = dateEnvoi ? addJoursOuvrables(dateEnvoi, DELAI_CONVOC_JO) : null;
  const delaiOk = (dateEnvoi && dateAudition) ? (new Date(dateAudition) >= addJoursOuvrables(dateEnvoi, DELAI_CONVOC_JO)) : null;

  const recommandation = () => {
    if (qGrave === 'oui') return `Faute grave (Art. 117) : sanctions pouvant aller jusqu'au renvoi définitif. Pour un renvoi définitif, l'avis du Conseil des Études est requis.`;
    if (tf.fraude) return qRecidive === 'oui'
      ? `Fraude en récidive : le Conseil des Études ou le Jury peut refuser dès la première session (Art. 75).`
      : `Fraude : ajournement (1re session) ou refus (2e session) pour l'UE concernée (Art. 75) ; décision motivée du CdE/Jury.`;
    return `Manquement disciplinaire : sanction proportionnée (du rappel à l'ordre au renvoi), prononcée après audition.`;
  };

  // Conformité procédurale
  const conformite = [
    { ok: !!(dateEnvoi && dateAudition), label: 'Convocation et audition datées' },
    { ok: !estRenvoiDef || delaiOk === true, label: 'Délai ≥ 8 jours ouvrables (renvoi définitif)' },
    { ok: qPresente !== '', label: 'Audition tenue (présence ou défaut acté)' },
    { ok: qPvSigne === 'oui' || qRefusConstate === 'oui', label: 'PV signé, ou refus constaté par deux membres' },
    { ok: !estRenvoiDef || qAvisRecu === 'oui', label: 'Avis du Conseil des Études (renvoi définitif)' },
    { ok: !!motivation, label: 'Décision motivée' },
  ];
  const conformiteOk = conformite.every(c => c.ok);

  const analyse = () => {
    const L = [];
    L.push(`Cadre applicable : ${a.reg}.`);
    L.push(`Qualification : ${(tf.label || '').toLowerCase()} — base réglementaire : ${baseLeg}.`);
    L.push(`Procédure (${a.procedure}) : examen individuel, sanction motivée et proportionnée ; audition préalable obligatoire ; assistance par la personne de son choix.`);
    if (tf.fraude) L.push(`Fraude/plagiat (${a.fraude}) : audition séparée des parties puis audition contradictoire ; décision du Conseil des Études ou du Jury d'Épreuve intégrée, formellement motivée.`);
    L.push(`Sanction envisagée : ${sa.label} — prononcée par ${sa.autorite}.`);
    if (estRenvoiDef) L.push(`Renvoi définitif : avis du Conseil des Études rendu dans les 8 jours (consultatif), versé au dossier ; écartement provisoire possible (≤ 15 jours ouvrables).`);
    L.push(`Notification : pli recommandé/AR, motivée (${a.notif}), avec mention du droit de recours.`);
    L.push(`Voies de recours : ${recoursTxt}.`);
    return L;
  };

  const genConvocation = () => docHTML('Convocation à audition', `
    <p style="text-align:right">Bruxelles, le ${fmtLong(dateEnvoi)}</p>
    <p style="text-align:right">${etu}<br>${adresse || ''}</p>
    <p style="margin-top:10pt"><strong>Objet : convocation à une audition — procédure disciplinaire — ENVOI RECOMMANDÉ</strong></p>
    <p>${prenom ? `Cher·ère ${prenom},` : 'Madame, Monsieur,'}</p>
    <p>Dans le cadre de l'application du ${a.reg}, et plus particulièrement de ${baseLeg}, la Direction a été informée des faits suivants vous concernant :</p>
    <div class="bloc-faits"><strong>Faits reprochés — constatés le ${fmtLong(dateFaits)}${rapporteur ? `, rapportés par ${rapporteur}` : ''} :</strong><br>${nl(description)}</div>
    <p>Ces faits sont susceptibles de constituer ${(tf.label || '').toLowerCase()} au sens de ${baseLeg}${tf.fraude ? ` (${a.fraude})` : ''}, et pourraient donner lieu à la sanction suivante : <strong>${sa.label}</strong>, prononcée par ${sa.autorite}.</p>
    <p>Conformément à ${refProc}, et en particulier à ${refConv}, vous êtes <strong>convoqué·e à une audition</strong> qui se tiendra le <strong>${fmtLong(dateAudition)}${heureAudition ? ` à ${heureAudition}` : ''}</strong>, à ${lieuAudition}.${estRenvoiDef ? ` La présente convocation s'inscrit dans la mise en œuvre d'une procédure d'exclusion définitive ; conformément au règlement, elle vous est adressée au moins huit jours ouvrables avant l'audition.` : ''}</p>
    <p>En application de ${refAudi}, vous avez le droit d'être entendu·e et de <strong>vous faire assister de la personne de votre choix</strong>, ainsi que de faire entendre toute personne utile à votre défense.</p>
    <p>Conformément à ${refDossier}, vous pouvez <strong>consulter votre dossier disciplinaire</strong>, sans déplacement de pièces, en présence de la Direction ou de son délégué, et <strong>demander un délai</strong> pour répondre aux faits reprochés ; fixé de commun accord, ce délai ne dépasse pas cinq jours ouvrables.</p>
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
    <p>La Direction (ou son délégué) est assistée d'un membre du personnel pour la rédaction du présent procès-verbal, établi séance tenante.${qPvSigne === 'non' ? ` Le refus de signature de l'étudiant·e est constaté par deux membres du personnel et n'empêche pas la poursuite de la procédure.` : ''}</p>
    <div class="sig"><table><tr>
      <td style="width:50%">La Direction (ou son délégué),<br><br>__________________</td>
      <td>L'étudiant·e,<br><br>__________________</td></tr></table></div>`);

  const genDecision = () => docHTML('Décision disciplinaire', `
    <p style="text-align:right">Bruxelles, le ${fmtLong(dateDecision)}</p>
    <p style="text-align:right">${etu}<br>${adresse || ''}</p>
    <p style="margin-top:10pt"><strong>Objet : décision en matière disciplinaire — ENVOI RECOMMANDÉ</strong></p>
    <div class="titre">Décision motivée</div>
    <p><strong>Vu</strong> le ${a.reg}, et notamment ${baseLeg} ;</p>
    <p><strong>Vu</strong> ${a.procedure}, relatifs à la procédure disciplinaire ;</p>
    <p><strong>Vu</strong> les faits constatés le ${fmtLong(dateFaits)}${rapporteur ? `, rapportés par ${rapporteur}` : ''} :</p>
    <div class="bloc-faits">${nl(description)}</div>
    <p><strong>Vu</strong> la convocation adressée à l'étudiant·e et son audition tenue le ${fmtLong(dateAudition)} ;</p>
    ${estRenvoiDef ? `<p><strong>Vu</strong> l'avis du Conseil des Études ;</p>` : ''}
    <p><strong>Considérant</strong> ${nl(motivation || "les éléments du dossier et la gravité des faits, appréciée au regard de l'atteinte au bon fonctionnement de l'établissement")} ;</p>
    <p>${cap(sa.autorite)} décide d'appliquer la sanction suivante : <strong>${sa.label}</strong>.</p>
    ${estRenvoiDef ? `<p>Cette décision a été prise après avis du Conseil des Études, versé au dossier disciplinaire.</p>` : ''}
    <p>La présente décision est formellement motivée et vous est notifiée par pli recommandé (ou contre accusé de réception), conformément à ${a.notif}.</p>
    <p><strong>Voies de recours :</strong> ${recoursTxt}.</p>
    <div class="sig"><p>Pour la Direction,<br><strong>${ETAB.directeur}</strong>, Directeur</p></div>`);

  const ouvrir = (titre, html) => setPreview({ titre, html, sousTitre: `Disciplinaire · ${annee}` });
  const champ = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-iip-turquoise focus:outline-none";
  const lab = "block text-xs font-semibold text-gray-500 mb-1";
  const ko = (t) => t ? Math.round(t / 1024) + ' Ko' : '';
  const btnDoc = "flex items-center gap-1.5 bg-iip-blue text-white text-sm px-4 py-2 rounded-lg hover:opacity-90";
  const STEPS = ['Faits', 'Qualification', 'Convocation', 'Audition', 'Décision'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="ml-auto flex items-center gap-2">
          {lectureSeule ? <span className="text-xs text-gray-500">🔒 Lecture seule</span> : enreg && <span className="text-xs text-green-600">✓ Enregistré</span>}
          <select value={caseId || ''} onChange={e => ouvrirDossier(e.target.value)} className={champ + ' w-52'}>
            <option value="">— Dossiers —</option>
            {dossiers.map(d => <option key={d.id} value={d.id}>{d.etudiant || 'Sans nom'} · {new Date(d.modifie_le).toLocaleDateString('fr-BE')}</option>)}
          </select>
          <button onClick={nouveauDossier} className="flex items-center gap-1 bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90"><IconPlus size={15} /> Nouveau</button>
          {caseId && <button onClick={supprimerDossier} className="text-gray-300 hover:text-red-500 p-1"><IconTrash size={16} /></button>}
          <select value={annee} onChange={e => setAn(e.target.value)} className={champ + ' w-44'}>{ANNEES.map(y => <option key={y.code} value={y.code}>{y.label}</option>)}</select>
        </div>
      </div>

      {/* Barre d'étapes */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((t, i) => (
          <button key={t} onClick={() => setStep(i + 1)}
            className={`text-xs px-3 py-1.5 rounded-full border ${step === i + 1 ? 'bg-iip-blue text-white border-iip-blue' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
            {i + 1}. {t}
          </button>
        ))}
      </div>

      {/* ÉTAPE 1 — Faits */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-iip-blue">Étape 1 — Les faits</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className={lab}>Nom</label><input className={champ} value={nom} onChange={e => setNom(e.target.value)} /></div>
            <div><label className={lab}>Prénom</label><input className={champ} value={prenom} onChange={e => setPrenom(e.target.value)} /></div>
            <div><label className={lab}>Section</label><input className={champ} value={section} onChange={e => setSection(e.target.value)} /></div>
            <div className="md:col-span-3"><label className={lab}>Adresse (pour le courrier)</label><input className={champ} value={adresse} onChange={e => setAdresse(e.target.value)} /></div>
            <div><label className={lab}>Type de fait</label><select className={champ} value={typeFait} onChange={e => setTypeFait(e.target.value)}>{TYPES_FAIT.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
            <div><label className={lab}>Date des faits</label><input type="date" className={champ} value={dateFaits} onChange={e => setDateFaits(e.target.value)} /></div>
            <div><label className={lab}>Rapporté par</label><input className={champ} value={rapporteur} onChange={e => setRapporteur(e.target.value)} /></div>
            <div className="md:col-span-3"><label className={lab}>Description des faits</label><textarea rows={3} className={champ} value={description} onChange={e => setDescription(e.target.value)} /></div>
          </div>
          <div className="border-t border-gray-100 pt-2">
            <Q text="Les faits sont-ils établis et documentés (preuves, témoignages) ?" value={qEtablis} onChange={setQEtablis} />
            <Q text="S'agit-il d'une récidive (faits déjà sanctionnés) ?" value={qRecidive} onChange={setQRecidive} />
          </div>
        </div>
      )}

      {/* ÉTAPE 2 — Qualification */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-bold text-iip-blue mb-2">Étape 2 — Qualification &amp; gravité</div>
            <Q text="Le fait constitue-t-il une faute grave (violence, menaces, arme, racket, faux…) ?" art={r2627 ? 'Art. 117' : 'Art. 96'} value={qGrave} onChange={setQGrave} />
            <Q text="S'agit-il d'une fraude / d'un plagiat ?" art={r2627 ? 'Art. 72-75' : 'Art. 54-55'} value={tf.fraude ? 'oui' : qGrave === '' ? '' : 'non'} onChange={() => {}} />
            <div className="mt-3"><label className={lab}>Sanction envisagée</label>
              <select className={champ} value={sanction} onChange={e => setSanction(e.target.value)}>{SANCTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
            <div className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded p-3 text-amber-900"><strong>Recommandation :</strong> {recommandation()}</div>
          </div>
          <div className="bg-iip-blue/5 border border-iip-blue/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-iip-blue font-semibold text-sm mb-2"><IconScale size={16} /> Analyse RDE/ROI</div>
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">{analyse().map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 — Convocation */}
      {step === 3 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-iip-blue">Étape 3 — Convocation à l'audition</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><label className={lab}>Envoi de la convocation</label><input type="date" className={champ} value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)} /></div>
            <div><label className={lab}>Date d'audition</label><input type="date" className={champ} value={dateAudition} onChange={e => setDateAudition(e.target.value)} />
              {estRenvoiDef && dateAuditionMin && <p className="text-[11px] text-gray-500 mt-1">Au plus tôt : <strong>{fmtLong(dateAuditionMin)}</strong> (8 j ouvrables)</p>}
              {!estRenvoiDef && <p className="text-[11px] text-gray-400 mt-1">Aucun délai minimum imposé pour cette sanction.</p>}
              {estRenvoiDef && delaiOk === false && <p className="text-[11px] text-red-600 mt-1">⚠ Délai de 8 jours ouvrables non respecté.</p>}
              {estRenvoiDef && delaiOk === true && <p className="text-[11px] text-green-600 mt-1">✓ Délai respecté.</p>}</div>
            <div><label className={lab}>Heure</label><input className={champ} value={heureAudition} onChange={e => setHeureAudition(e.target.value)} placeholder="ex : 14h00" /></div>
            <div><label className={lab}>Lieu</label><input className={champ} value={lieuAudition} onChange={e => setLieuAudition(e.target.value)} /></div>
          </div>
          <div className="text-xs text-gray-500">La convocation rappellera automatiquement : recommandé/AR, faits, sanction envisagée, droit d'être assisté·e, consultation du dossier et délai de réponse{estRenvoiDef ? ', et le délai de 8 jours ouvrables (exclusion définitive)' : ''}.</div>
          <button onClick={() => ouvrir('Convocation à audition', genConvocation())} className={btnDoc}><IconMail size={16} /> Générer la convocation</button>
        </div>
      )}

      {/* ÉTAPE 4 — Audition */}
      {step === 4 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-bold text-iip-blue">Étape 4 — Audition</div>
          <Q text="L'étudiant·e s'est-il/elle présenté·e à l'audition ?" value={qPresente} onChange={setQPresente} />
          <Q text="S'est-il/elle fait assister ?" value={qAssiste} onChange={setQAssiste} />
          {tf.fraude && <Q text="L'audition contradictoire a-t-elle été tenue (après audition séparée) ?" art="Art. 72-75 / 54-55" value={qContradictoire} onChange={setQContradictoire} />}
          <Q text="Le procès-verbal a-t-il été signé par l'étudiant·e ?" value={qPvSigne} onChange={setQPvSigne} />
          {qPvSigne === 'non' && <Q text="Le refus de signature a-t-il été constaté par deux membres du personnel ?" value={qRefusConstate} onChange={setQRefusConstate} />}
          <div className="grid grid-cols-1 gap-3 pt-1">
            <div><label className={lab}>Personnes présentes</label><input className={champ} value={presents} onChange={e => setPresents(e.target.value)} /></div>
            <div><label className={lab}>Déclarations / observations de l'étudiant·e</label><textarea rows={3} className={champ} value={declarations} onChange={e => setDeclarations(e.target.value)} /></div>
          </div>
          <button onClick={() => ouvrir("PV d'audition", genPV())} className={btnDoc}><IconClipboardText size={16} /> Générer le PV d'audition</button>
        </div>
      )}

      {/* ÉTAPE 5 — Décision */}
      {step === 5 && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="text-sm font-bold text-iip-blue">Étape 5 — Décision</div>
            {estRenvoiDef && <>
              <Q text="L'avis du Conseil des Études a-t-il été demandé ?" art={r2627 ? 'Art. 115 septies' : 'Art. 96'} value={qAvisDemande} onChange={setQAvisDemande} />
              <Q text="L'avis du Conseil des Études a-t-il été rendu (sous 8 jours) ?" value={qAvisRecu} onChange={setQAvisRecu} />
            </>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className={lab}>Date de la décision</label><input type="date" className={champ} value={dateDecision} onChange={e => setDateDecision(e.target.value)} /></div>
              <div className="md:col-span-2"><label className={lab}>Motivation de la décision</label><textarea rows={3} className={champ} value={motivation} onChange={e => setMotivation(e.target.value)} /></div>
            </div>
            <button onClick={() => ouvrir('Décision disciplinaire', genDecision())} className={btnDoc}><IconDecision size={16} /> Générer la décision</button>
          </div>
          <div className={`border rounded-xl p-4 ${conformiteOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="font-semibold text-sm mb-2">{conformiteOk ? '✓ Conformité procédurale' : '⚠ Points à vérifier avant de notifier'}</div>
            {conformite.map((c, i) => <Check key={i} ok={c.ok} label={c.label} />)}
          </div>
        </div>
      )}

      {/* Navigation étapes */}
      <div className="flex items-center justify-between">
        <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50"><IconChevronLeft size={16} /> Précédent</button>
        <span className="text-xs text-gray-400">Étape {step} / {STEPS.length}</span>
        <button onClick={() => setStep(s => Math.min(STEPS.length, s + 1))} disabled={step === STEPS.length} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 hover:bg-gray-50">Suivant <IconChevronRight size={16} /></button>
      </div>

      {/* Pièces jointes */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 font-semibold text-sm text-gray-700 mb-3"><IconPaperclip size={16} /> Pièces jointes du dossier (courriers reçus, preuves, réponses…)</div>
        {!caseId && <p className="text-xs text-gray-400 mb-2">Renseignez d'abord les faits (enregistrement automatique), puis ajoutez les pièces.</p>}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select value={catUp} onChange={e => setCatUp(e.target.value)} className={champ + ' w-52'}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <input type="file" disabled={!caseId} onChange={e => { uploadFichier(e.target.files[0]); e.target.value = ''; }} className="text-xs" />
        </div>
        {fichiers.length === 0 ? <p className="text-xs text-gray-400">Aucune pièce.</p> : (
          <ul className="divide-y divide-gray-100">
            {fichiers.map(f => (
              <li key={f.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="text-[11px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{f.categorie}</span>
                <span className="flex-1 truncate">{f.nom}</span>
                <span className="text-xs text-gray-400">{ko(f.taille)}</span>
                <button onClick={() => telechargerFichier(f.id, f.nom)} className="text-iip-turquoise hover:opacity-70 p-0.5"><IconDownload size={15} /></button>
                <button onClick={() => supprimerFichier(f.id)} className="text-gray-300 hover:text-red-500 p-0.5"><IconTrash size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview && <PreviewModal html={preview.html} titre={preview.titre} sousTitre={preview.sousTitre} onClose={() => setPreview(null)} />}
    </div>
  );
}

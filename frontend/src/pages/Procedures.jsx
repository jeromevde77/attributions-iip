import { useState, useEffect } from 'react';
import { getAnnee } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';

// ─── Utilitaires ──────────────────────────────────────────────────────────────
const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { Authorization: `Bearer ${TOKEN()}`, ...(opts.headers || {}) } }).then(r => r.json());

function addJoursOuvrables(date, n) {
  const d = new Date(date); let count = 0;
  while (count < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) count++; }
  return d;
}
function addJoursCalendrier(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-BE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}
function fmtCourt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-BE', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// ─── Composants UI ────────────────────────────────────────────────────────────
function Badge({ ok, label }) {
  return ok
    ? <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 border border-green-300 rounded-full px-3 py-0.5 text-sm font-semibold">✓ {label}</span>
    : <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 border border-red-300 rounded-full px-3 py-0.5 text-sm font-semibold">✗ {label}</span>;
}
function Ref({ text }) {
  return <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 ml-1">⚖ {text}</span>;
}
function Section({ title, color = 'mauve', children }) {
  const cls = { red:'border-red-500 bg-red-50', green:'border-green-500 bg-green-50',
    orange:'border-orange-500 bg-orange-50', mauve:'border-iip-mauve bg-iip-mauve/5' };
  return <div className={`border-l-4 pl-5 py-4 mb-5 ${cls[color]||cls.mauve}`}><h3 className="font-bold text-base mb-3">{title}</h3>{children}</div>;
}
function Q({ num, text, value, onChange, ref_ }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-iip-mauve text-white text-sm font-bold flex items-center justify-center">{num}</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800 mb-2">{text}{ref_ && <Ref text={ref_} />}</p>
        <div className="flex gap-2">
          {[['oui','✓ Oui'],['non','✗ Non'],['','—']].map(([v,l]) => (
            <button key={v} onClick={() => onChange(v)}
              className={`px-4 py-1.5 rounded-full text-sm border transition ${value===v?(v==='oui'?'bg-green-600 text-white border-green-600':v==='non'?'bg-red-600 text-white border-red-600':'bg-gray-400 text-white border-gray-400'):'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Génération de la décision motivée (HTML → print) ─────────────────────────
function genererDecision({ etudiant, ueNum, ueNom, profs, profsPresentsListe,
  datePubli, dateRecours, dateDecisionInterne, dateSeance, commentaireCDE, q, verdict, irregularites, annee }) {
  const today = new Date().toLocaleDateString('fr-BE', { day:'2-digit', month:'long', year:'numeric' });
  // Utiliser les présents cochés, sinon tous les profs
  const presents = (profsPresentsListe && profsPresentsListe.length > 0) ? profsPresentsListe : profs;
  const membres = presents.length
    ? presents.map(p => p.nomComplet || (p.nom + ' ' + p.prenom)).join(', ')
    : '[À COMPLÉTER : membres du CDE restreint]';
  const nbPresents = presents.length;

  const vu = `
    <p>Vu le Décret du 16 avril 1991 relatif à l'enseignement de promotion sociale, notamment les art. 123ter et 123quater ;</p>
    <p>Vu le Décret du 27 octobre 2006 organisant les recours dans l'enseignement pour adultes ;</p>
    <p>Vu le RDE/ROI de l'Institut Ilya Prigogine, année académique ${annee}, notamment les articles 87 à 91 ;</p>
    <p>Vu la plainte introduite par ${etudiant || '[NOM ÉTUDIANT]'} en date du ${fmtCourt(dateRecours)} concernant la délibération relative à l'UE ${ueNum} — ${ueNom || ''} ;</p>
    <p>Vu les pièces du dossier ;</p>
  `;

  let corps = '';

  if (verdict === 'irrecevable') {
    const motifs = [];
    if (q.ecrit === 'non') motifs.push('La plainte n\'est pas rédigée par écrit (condition impérative — Art. 88 §3 RDE/ROI).');
    if (q.delaiRespect === 'non') motifs.push('La plainte n\'a pas été introduite dans le délai de 4 jours calendrier suivant la publication des résultats (Art. 88 §1 RDE/ROI). La date limite était le ' + fmtCourt(addJoursCalendrier(datePubli, 4)) + '.');
    if (q.porteRefus === 'non') motifs.push('La plainte ne porte pas sur une décision de refus. Seules les décisions de refus sont susceptibles de recours (Art. 87 §1 RDE/ROI).');
    if (q.irregulPrecises === 'non') motifs.push('La plainte ne mentionne pas d\'irrégularités précises. Une contestation de la valeur de la note n\'est pas recevable — seules les irrégularités de procédure ou de droit peuvent fonder un recours (Art. 88 §3 RDE/ROI).');
    if (q.decisionRefus === 'non') motifs.push('La décision contestée n\'est pas une décision de refus au sens de l\'Art. 87 §1 RDE/ROI. Les ajournements, décisions de VA/VAE et décisions de délivrance de titre ne sont pas susceptibles de recours.');

    corps = `
      <h3>QUANT À LA RECEVABILITÉ</h3>
      <p>Le Conseil des Études déclare la plainte <strong>IRRECEVABLE</strong> pour le${motifs.length > 1 ? 's' : ''} motif${motifs.length > 1 ? 's' : ''} suivant${motifs.length > 1 ? 's' : ''} :</p>
      <ol>${motifs.map(m => `<li>${m}</li>`).join('')}</ol>
      <p>Conformément à l'Art. 88 §4 du RDE/ROI, la présente décision d'irrecevabilité expose les motifs précis de l'irrecevabilité et est notifiée à l'étudiant.</p>
      <h3>DÉCIDE</h3>
      <p>De déclarer la plainte introduite par <strong>${etudiant || '[NOM ÉTUDIANT]'}</strong> <strong>IRRECEVABLE</strong> pour les motifs exposés ci-dessus.</p>
      <p>L'étudiant est informé que cette décision d'irrecevabilité ne peut faire l'objet d'un recours externe, dès lors que les conditions de recevabilité du recours interne ne sont pas réunies.</p>
    `;
  } else {
    const irregList = [];
    if (q.quorum === 'non') irregList.push('Le quorum du CDE n\'était pas atteint lors de la délibération (Art. 89 §1 RDE/ROI). Cette irrégularité constitue un vice de procédure grave.');
    if (q.conflitInteret === 'oui') irregList.push('Un conflit d\'intérêt non déclaré a été relevé parmi les membres du jury. Cette irrégularité est susceptible d\'affecter l\'impartialité de la délibération.');
    if (q.motivJustif === 'non') irregList.push('La justification de l\'échec (AA non atteints) n\'a pas été formellement encodée et communiquée à l\'étudiant, en violation de l\'Art. 71 RDE/ROI.');
    if (q.visiteCopies === 'non') irregList.push('La visite des copies n\'a pas été proposée à l\'étudiant dans les délais (Art. 71 §1 RDE/ROI — droit à la consultation en présence du chargé de cours).');
    if (q.publiResultats === 'non') irregList.push('Les résultats n\'ont pas été publiés dans le délai de 2 jours ouvrables suivant la délibération (Art. 82 RDE/ROI).');

    const decision = irregList.length > 0 ? 'ACCUEILLE partiellement' : 'REJETTE';
    const conclusionFond = irregList.length > 0
      ? `Le Conseil des Études constate les irrégularités suivantes :\n<ol>${irregList.map(i => `<li>${i}</li>`).join('')}</ol>\nEn conséquence, le recours est fondé sur ces points. Le Conseil des Études procède à un réexamen de la situation de l'étudiant en tenant compte de ces irrégularités.`
      : `Après examen des griefs soulevés par l'étudiant, le Conseil des Études constate qu'aucune irrégularité de procédure ou de droit n'est établie. Le Conseil des Études apprécie souverainement la valeur des notes et sa décision ne peut être remise en cause sur la seule contestation de l'appréciation pédagogique (Art. 91 RDE/ROI — la Commission de recours dispose d'un pouvoir d'annulation mais ne peut substituer sa propre note à celle du CDE).`;

    corps = `
      <h3>QUANT À LA RECEVABILITÉ</h3>
      <p>La plainte est déclarée <strong>RECEVABLE</strong> : elle est écrite, introduite dans le délai de 4 jours calendrier (Art. 88 §1), porte sur une décision de refus et mentionne des irrégularités précises (Art. 88 §3 RDE/ROI).</p>

      <h3>QUANT AU FOND</h3>
      <p>${conclusionFond}</p>

      ${!irregList.length ? `
      <p><em>Sur le quorum :</em> Le quorum requis était atteint lors de la délibération. Aucune irrégularité n'est établie.</p>
      <p><em>Sur la motivation de la décision :</em> Les AA non atteints ont été dûment identifiés et communiqués. La décision de refus est fondée sur l'absence d'acquisition des acquis d'apprentissage définis dans le DUE de l'UE ${ueNum}.</p>
      <p><em>Sur les droits de l'étudiant :</em> La visite des copies et la consultation des épreuves ont été proposées conformément à l'Art. 71 du RDE/ROI.</p>
      ` : ''}

      <h3>DÉCIDE</h3>
      <p>Le Conseil des Études <strong>${decision}</strong> le recours introduit par <strong>${etudiant || '[NOM ÉTUDIANT]'}</strong>.</p>
      ${irregList.length === 0 ? '<p>La décision de refus initiale est <strong>confirmée</strong>.</p>' : '<p>Le dossier fait l\'objet d\'un réexamen par le Conseil des Études dans sa composition complète.</p>'}

      <h3>VOIES DE RECOURS</h3>
      <p>Conformément à l'Art. 90 du RDE/ROI et au Décret du 27/10/2006, la présente décision peut faire l'objet d'un <strong>recours externe</strong> auprès de la Direction générale du Service général de l'Enseignement tout au long de la vie (rue Adolphe Lavallée 1, 1080 Bruxelles), par pli recommandé, dans un délai de <strong>7 jours calendrier</strong> à compter du troisième jour ouvrable suivant la date d'envoi de la présente décision.</p>
      ${dateDecisionInterne ? `<p>La date limite pour le recours externe est le : <strong>${fmtCourt(addJoursCalendrier(addJoursOuvrables(dateDecisionInterne, 3), 7))}</strong>.</p>` : ''}
    `;
  }

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Décision motivée — ${etudiant}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; margin: 0; padding: 20mm 20mm 15mm 20mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 2px solid #1F3864; padding-bottom: 8px; margin-bottom: 16px; }
  .logo-txt { font-size: 14pt; font-weight: bold; color: #1F3864; }
  .logo-sub { font-size: 9pt; color: #555; }
  .ref { font-size: 9pt; text-align:right; color: #555; }
  h2 { font-size: 13pt; text-align: center; color: #1F3864; border: 2px solid #1F3864; padding: 10px; margin: 20px 0; }
  h3 { font-size: 11pt; font-weight: bold; margin-top: 16px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  p { margin: 5px 0; line-height: 1.5; }
  ol { margin: 6px 0 6px 20px; }
  li { margin: 4px 0; }
  .composition { background: #f0f4ff; border: 1px solid #c0d0f0; padding: 8px 12px; margin: 10px 0; font-size: 10pt; }
  .signatures { display:flex; justify-content:space-between; margin-top: 30px; }
  .sig-block { text-align: center; min-width: 180px; }
  .sig-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 4px; font-size: 10pt; }
  .footer { border-top: 1px solid #ccc; margin-top: 20px; padding-top: 8px; font-size: 8pt; color: #888; text-align: center; }
  @media print { body { padding: 10mm 15mm; } button { display:none; } }
</style></head><body>
<div style="text-align:right;margin-bottom:10px;print:none">
  <button onclick="window.print()" style="padding:6px 16px;background:#1F3864;color:#fff;border:none;border-radius:4px;cursor:pointer">🖨 Imprimer / PDF</button>
</div>
<div class="header">
  <div>
    <div class="logo-txt">Institut Ilya Prigogine</div>
    <div class="logo-sub">Campus Erasme · Route de Lennik 808 · 1070 Bruxelles<br>direction@institut-prigogine.be · 02/560.29.59</div>
  </div>
  <div class="ref">
    RDE/ROI Art. 87-91 · D. 27/10/2006<br>
    Année académique ${annee}<br>
    Date : ${today}
  </div>
</div>

<h2>DÉCISION ${verdict === 'irrecevable' ? "D'IRRECEVABILITÉ" : 'MOTIVÉE'}<br>DU CONSEIL DES ÉTUDES</h2>

<p><strong>Objet :</strong> Recours contre la décision de refus concernant l'UE ${ueNum}${ueNom ? ' — ' + ueNom : ''}</p>
<p><strong>Étudiant·e :</strong> ${etudiant || '[NOM ÉTUDIANT]'}</p>
<p><strong>Date de délibération :</strong> ${fmtCourt(datePubli) || '—'}</p>
<p><strong>Date d'introduction du recours :</strong> ${fmtCourt(dateRecours) || '—'}</p>
${dateSeance ? `<p><strong>Date de réunion du CDE restreint :</strong> ${fmtCourt(dateSeance)}</p>` : ''}

${presents.length > 0 ? `
<div class="composition">
  <strong>Composition du Conseil des Études restreint (Art. 89 §1 RDE/ROI) :</strong><br>
  <table style="width:100%;margin-top:6px;font-size:10pt">
    <tr style="background:#e8eef8">
      <th style="text-align:left;padding:4px 8px">Membre</th>
      <th style="text-align:left;padding:4px 8px">Qualité</th>
      <th style="text-align:center;padding:4px 8px">Présent à la délibération</th>
    </tr>
    ${presents.map((p, i) => `
    <tr style="background:${i%2===0?'#f8f9fa':'white'}">
      <td style="padding:4px 8px;font-weight:bold">${p.nomComplet || (p.nom + ' ' + p.prenom)}</td>
      <td style="padding:4px 8px">${p.qualite || (i === 0 ? 'Président(e) du CDE' : 'Membre du CDE')}</td>
      <td style="padding:4px 8px;text-align:center">✓</td>
    </tr>`).join('')}
  </table>
  ${nbPresents < 3 ? '<p style="color:#cc7700;margin-top:6px;font-size:9pt">⚠ Attention : le quorum requiert Président + min. 2 membres (Art. 89 §1).</p>' : ''}
</div>` : ''}

<h3>VU ET CONSIDÉRANT</h3>
${vu}

${corps}

${commentaireCDE ? `
<h3>OBSERVATIONS DU CONSEIL DES ÉTUDES</h3>
<p style="border:1px solid #ccc;padding:10px;background:#fafafa;">${commentaireCDE.replace(/\n/g,'<br>')}</p>
` : ''}

<div class="signatures">
  <div class="sig-block">
    <div class="sig-line">Le Président du CDE<br><em>(ou son délégué)</em></div>
  </div>
  <div class="sig-block">
    <div class="sig-line">Le Directeur<br>Charles SOHET</div>
  </div>
</div>

<div class="footer">
  Institut Ilya Prigogine · direction@institut-prigogine.be · 02/560.29.59 · www.institut-prigogine.be<br>
  Document généré par Lucie le ${today} · Fondé sur les Art. 87-91 RDE/ROI et le Décret du 27/10/2006
</div>
</body></html>`;
}

// ─── OUTIL RECOURS ─────────────────────────────────────────────────────────────
function OutilRecours() {
  const annee = getAnnee();
  const [step, setStep] = useState(1);
  const [previewHtml, setPreviewHtml] = useState(null);

  // Données dossier
  const [etudiant, setEtudiant] = useState('');
  const [ueNum, setUeNum] = useState('');
  const [ueNom, setUeNom] = useState('');
  const [datePubli, setDatePubli] = useState('');
  const [dateRecours, setDateRecours] = useState('');
  const [dateDecisionInterne, setDateDecisionInterne] = useState('');
  const [dateSeance, setDateSeance] = useState('');
  const [commentaireCDE, setCommentaireCDE] = useState('');

  // Profs de l'UE (depuis la DB)
  const [profs, setProfs] = useState([]);
  const [profsPresents, setProfsPresents] = useState(new Set()); // IDs cochés comme présents
  const [loadingProfs, setLoadingProfs] = useState(false);
  const [ues, setUes] = useState([]);

  function toggleProfPresent(id) {
    setProfsPresents(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Questions
  const [q, setQ] = useState({
    decisionRefus:'', ecrit:'', delaiRespect:'', porteRefus:'', irregulPrecises:'',
    quorum:'', conflitInteret:'', motivJustif:'', dueDelai:'', visiteCopies:'', publiResultats:'',
  });
  function set(k, v) { setQ(p => ({ ...p, [k]: v })); }

  // Charger les UE au démarrage
  useEffect(() => {
    authFetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`)
      .then(d => {
        const map = new Map();
        for (const sg of (Array.isArray(d) ? d : [])) {
          for (const ue of (sg.ues || [])) {
            if (!map.has(ue.ue_num)) map.set(ue.ue_num, { ...ue, _section: sg.section });
          }
        }
        setUes([...map.values()].sort((a,b) => (a.ue_num||0)-(b.ue_num||0)));
      }).catch(() => {});
  }, [annee]);

  // Membres fixes du CDE (chargés depuis la DB au démarrage, avec leurs sections)
  const [membresCde, setMembresCde] = useState([]);
  useEffect(() => {
    authFetch('/api/ref/membres-cde')
      .then(d => setMembresCde(Array.isArray(d) ? d.map(m => ({ ...m, id: 'cde_' + m.id, qualite: m.fonction })) : []))
      .catch(() => {});
  }, []);

  // Charger les profs quand UE change
  useEffect(() => {
    if (!ueNum) { setProfs([]); setProfsPresents(new Set()); return; }
    const ue = ues.find(u => String(u.ue_num) === String(ueNum));
    if (ue) setUeNom(ue.ue_nom || '');
    const ueSection = ue?._section || null;
    setLoadingProfs(true);
    authFetch(`/api/attributions?annee=${encodeURIComponent(annee)}&ue_num=${encodeURIComponent(ueNum)}`)
      .then(rows => {
        const seen = new Set();
        const ps = [];
        for (const r of (Array.isArray(rows) ? rows : [])) {
          if (r.professeur_id && !seen.has(r.professeur_id) && !r.is_z) {
            seen.add(r.professeur_id);
            const parts = (r.professeur || '').split(' ');
            ps.push({ id: r.professeur_id, nom: parts[0] || '', prenom: parts.slice(1).join(' ') || '', nomComplet: r.professeur || '', qualite: 'Enseignant(e)' });
          }
        }
        // Filtrer les membres CDE : garder ceux sans section assignée (direction/secrétariat)
        // ou dont une section correspond à la section de l'UE
        const cdeFiltrés = membresCde.filter(m =>
          !m.sections || m.sections.length === 0 ||
          (ueSection && m.sections.includes(ueSection))
        );
        // Membres CDE en tête, puis les enseignants de l'UE
        setProfs([...cdeFiltrés, ...ps]);
      }).catch(() => setProfs([...membresCde]))
      .finally(() => setLoadingProfs(false));
  }, [ueNum, annee, membresCde]);

  // Calculs délais
  const limiteRecours = datePubli ? addJoursCalendrier(datePubli, 4) : null;
  const limiteDecisionInterne = datePubli ? addJoursCalendrier(datePubli, 7) : null;
  const limiteRecourseExterne = dateDecisionInterne
    ? addJoursCalendrier(addJoursOuvrables(dateDecisionInterne, 3), 7) : null;
  const nbJours = datePubli && dateRecours
    ? Math.round((new Date(dateRecours) - new Date(datePubli)) / 86400000) : null;
  const delaiRespect = nbJours !== null ? nbJours <= 4 : (q.delaiRespect === 'oui' ? true : q.delaiRespect === 'non' ? false : null);

  // Verdict recevabilité
  const conditionsRecevabilite = [
    { ok: q.ecrit === 'oui',           label: 'Plainte écrite',                   ref: 'Art. 88 §3' },
    { ok: delaiRespect === true,        label: `Dans le délai (J+${nbJours||'?'})`, ref: 'Art. 88 §1' },
    { ok: q.porteRefus === 'oui',       label: 'Porte sur un refus',               ref: 'Art. 88 §3' },
    { ok: q.irregulPrecises === 'oui',  label: 'Irrégularités précises',           ref: 'Art. 88 §3' },
  ];
  const recevable = conditionsRecevabilite.every(c => c.ok === true);
  const irrecevable = q.decisionRefus === 'non' || conditionsRecevabilite.some(c => c.ok === false);

  // Verdict final
  const verdict = q.decisionRefus === 'non' ? 'irrecevable'
    : irrecevable ? 'irrecevable'
    : recevable ? 'recevable' : null;

  async function ouvrirDecision() {
    const profsPresentsListe = profs.filter(p => profsPresents.has(p.id));
    try {
      const res = await authFetch('/api/procedures/pv-recours', {
        method: 'POST',
        body: JSON.stringify({
          etudiant, ue_num: ueNum, ue_nom: ueNom,
          membres_presents: (profsPresentsListe.length ? profsPresentsListe : profs)
            .map(p => ({ nomComplet: p.nomComplet, qualite: p.qualite })),
          date_publi: datePubli, date_recours: dateRecours,
          date_seance: dateSeance, date_envoi: dateDecisionInterne,
          commentaire_cde: commentaireCDE, q, verdict, annee,
        }),
      });
      if (res.error) { alert('Erreur : ' + res.error); return; }
      if (res.champs_manquants?.length)
        alert('⚠ Champs du modèle non disponibles pour cette procédure (laissés vides dans le document) :\n\n• '
          + res.champs_manquants.join('\n• '));
      setPreviewHtml(res.html);
    } catch(e) { alert('Erreur : ' + e.message); }
  }

  // Barre de progression
  const steps = ['Dossier & UE', 'Qualification', 'Recevabilité', 'Analyse au fond', 'Décision'];

  return (
    <div className="max-w-3xl">
      {/* Stepper */}
      <div className="flex items-center gap-1 mb-7 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setStep(i+1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition
                ${step === i+1 ? 'bg-iip-mauve text-white' : step > i+1 ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {step > i+1 ? '✓' : i+1}. {s}
            </button>
            {i < steps.length-1 && <div className={`h-0.5 w-4 flex-shrink-0 ${step > i+1 ? 'bg-green-400' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* ÉTAPE 1 — Dossier & UE */}
      {step === 1 && (
        <div>
          <Section title="Étape 1 — Constitution du dossier">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Nom de l'étudiant·e *</div>
                <input value={etudiant} onChange={e => setEtudiant(e.target.value)} placeholder="Prénom NOM"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">UE concernée *</div>
                <select value={ueNum} onChange={e => setUeNum(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                  <option value="">— Choisir une UE —</option>
                  {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date de publication des résultats</div>
                <input type="date" value={datePubli} onChange={e => setDatePubli(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                {datePubli && <p className="text-xs text-gray-500 mt-0.5">Limite recours : <strong>{fmt(limiteRecours)}</strong></p>}
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date de réception de la plainte</div>
                <input type="date" value={dateRecours} onChange={e => setDateRecours(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                {nbJours !== null && (
                  <p className={`text-xs mt-0.5 font-semibold ${delaiRespect ? 'text-green-700' : 'text-red-700'}`}>
                    J+{nbJours} → {delaiRespect ? '✓ Dans le délai' : '✗ HORS DÉLAI'}
                  </p>
                )}
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date de réunion du CDE restreint</div>
                <input type="date" value={dateSeance} onChange={e => setDateSeance(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                {limiteDecisionInterne && <p className="text-xs text-gray-500 mt-0.5">Date limite décision : <strong>{fmt(limiteDecisionInterne)}</strong></p>}
              </label>
            </div>

            {/* Professeurs de l'UE — checkboxes présents à la délibération */}
            {ueNum && (
              <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-blue-900">
                    Enseignants de l'UE {ueNum}{ueNom ? ` — ${ueNom}` : ''} ({annee})
                    {loadingProfs && <span className="text-xs font-normal ml-2">Chargement…</span>}
                  </p>
                  {profs.length > 0 && (
                    <button onClick={() => setProfsPresents(new Set(profs.map(p => p.id)))}
                      className="text-xs text-blue-600 hover:underline">Tout cocher</button>
                  )}
                </div>
                {profs.length === 0 && !loadingProfs && (
                  <p className="text-sm text-gray-500 italic">Aucun enseignant attribué pour cette UE.</p>
                )}
                {profs.length > 0 && (
                  <>
                    <p className="text-xs text-blue-700 mb-2">Cochez les membres <strong>présents</strong> à la délibération (CDE restreint = Président + min. 2 membres — Art. 89 §1) :</p>
                    <div className="space-y-1">
                      {profs.map(p => (
                        <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition ${profsPresents.has(p.id) ? 'bg-green-50 border-green-400' : 'bg-white border-blue-200 hover:bg-blue-50'}`}>
                          <input type="checkbox" checked={profsPresents.has(p.id)} onChange={() => toggleProfPresent(p.id)} className="w-4 h-4 accent-green-600" />
                          <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${profsPresents.has(p.id) ? 'bg-green-600' : 'bg-iip-mauve'}`}>
                            {(p.nom[0]||'?').toUpperCase()}
                          </span>
                          <span className={`text-sm font-medium flex-1 ${profsPresents.has(p.id) ? 'text-green-800' : 'text-gray-700'}`}>{p.nomComplet}</span>
                          {p.qualite && <span className="text-xs text-gray-400 italic">{p.qualite}</span>}
                          {profsPresents.has(p.id) && <span className="text-xs text-green-700 font-semibold ml-1">✓</span>}
                        </label>
                      ))}
                    </div>
                    {profsPresents.size > 0 && (
                      <p className={`text-xs mt-2 font-medium ${profsPresents.size >= 3 ? 'text-green-700' : 'text-orange-600'}`}>
                        {profsPresents.size} membre{profsPresents.size > 1 ? 's' : ''} présent{profsPresents.size > 1 ? 's' : ''}
                        {profsPresents.size >= 3 ? ' — ✓ Quorum atteint' : ` — ⚠ Min. 3 membres requis (${3 - profsPresents.size} manquant${3 - profsPresents.size > 1 ? 's' : ''})`}
                      </p>
                    )}
                    {profsPresents.size === 0 && (
                      <p className="text-xs text-orange-600 mt-2">⚠ Cochez les membres présents pour les inclure dans le PV.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </Section>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="bg-iip-mauve text-white px-6 py-2 rounded-lg text-sm font-medium">Étape suivante →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE 2 — Qualification */}
      {step === 2 && (
        <div>
          <Section title="Étape 2 — Qualification de la décision">
            <Q num="1" text="La décision contestée est-elle une DÉCISION DE REFUS ?" value={q.decisionRefus} onChange={v => set('decisionRefus', v)} ref_="Art. 87 §1 RDE/ROI" />
            {q.decisionRefus === 'non' && (
              <div className="mt-3 p-4 bg-red-100 border-2 border-red-500 rounded-lg">
                <p className="font-bold text-red-800">🚫 IRRECEVABLE DE PLEIN DROIT</p>
                <p className="text-red-700 text-sm mt-1">Seules les décisions de REFUS sont recourables. Les ajournements (1re session), VA/VAE et délivrances de titre ne peuvent pas faire l'objet d'un recours.</p>
                <p className="text-xs text-red-600 mt-1">⚖ Art. 87 §1-2 RDE/ROI · D. 27/10/2006</p>
              </div>
            )}
            {q.decisionRefus === 'oui' && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                ✓ La décision est recourable. Procéder à l'analyse de recevabilité.
              </div>
            )}
          </Section>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(3)} disabled={!q.decisionRefus}
              className="bg-iip-mauve disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm font-medium">
              Recevabilité →
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 — Recevabilité */}
      {step === 3 && (
        <div>
          <Section title="Étape 3 — Recevabilité formelle (Art. 88 §3)">
            <p className="text-sm text-gray-600 mb-4">4 conditions <strong>cumulatives</strong> — une seule manquante = irrecevable.</p>
            <Q num="1" text="La plainte est-elle ÉCRITE (e-mail, main propre ou recommandé) ?" value={q.ecrit} onChange={v => set('ecrit', v)} ref_="Art. 88 §3" />
            {delaiRespect !== null
              ? <div className="mb-4 pl-10"><Badge ok={delaiRespect} label={delaiRespect ? `J+${nbJours} — Dans le délai` : `J+${nbJours} — HORS DÉLAI`} /><Ref text="Art. 88 §1" /></div>
              : <Q num="2" text="Plainte reçue dans les 4 jours calendrier après publication ?" value={q.delaiRespect} onChange={v => set('delaiRespect', v)} ref_="Art. 88 §1" />}
            <Q num="3" text="Porte sur une DÉCISION DE REFUS (pas ajournement, pas VA/VAE) ?" value={q.porteRefus} onChange={v => set('porteRefus', v)} ref_="Art. 88 §3" />
            <Q num="4" text="Mentionne des IRRÉGULARITÉS PRÉCISES (pas juste 'je ne suis pas d'accord') ?" value={q.irregulPrecises} onChange={v => set('irregulPrecises', v)} ref_="Art. 88 §3" />
          </Section>
          {conditionsRecevabilite.some(c => c.ok !== undefined) && (
            <div className={`p-4 rounded-xl border-2 mb-4 ${recevable ? 'bg-green-50 border-green-500' : irrecevable ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-gray-300'}`}>
              {recevable && <>
                <p className="font-bold text-green-800 text-base">✅ RECEVABLE — Procéder à l'instruction</p>
                {limiteDecisionInterne && <p className="text-sm text-green-700 mt-1">⏱ Date limite décision interne : <strong>{fmt(limiteDecisionInterne)}</strong></p>}
              </>}
              {irrecevable && !recevable && <>
                <p className="font-bold text-red-800 text-base">🚫 IRRECEVABLE</p>
                {conditionsRecevabilite.filter(c => c.ok === false).map(c => (
                  <p key={c.label} className="text-sm text-red-700 mt-1">✗ {c.label} <Ref text={c.ref} /></p>
                ))}
                <p className="text-sm text-red-700 mt-2">→ Notifier à l'étudiant par écrit (Art. 88 §4).</p>
              </>}
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(4)} disabled={!recevable}
              className="bg-iip-mauve disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm font-medium">
              Analyser au fond →
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 4 — Analyse au fond */}
      {step === 4 && (
        <div>
          <Section title="Étape 4 — Analyse au fond (irrégularités invoquées)">
            <p className="text-sm text-gray-600 mb-4">Seules les irrégularités de <strong>procédure ou de droit</strong> peuvent fonder un recours. La Commission de recours peut annuler mais ne substitue pas sa note.</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">A — Délibération</p>
            <Q num="1" text="Le quorum était-il atteint ? (Président + min. 2 membres)" value={q.quorum} onChange={v => set('quorum', v)} ref_="Art. 89 §1" />
            <Q num="2" text="Conflit d'intérêt non déclaré parmi les membres du jury ?" value={q.conflitInteret} onChange={v => set('conflitInteret', v)} />
            <Q num="3" text="Justification de l'échec (AA non atteints) encodée et communiquée ?" value={q.motivJustif} onChange={v => set('motivJustif', v)} ref_="Art. 71" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-3">B — Évaluation</p>
            <Q num="4" text="DUE fournis dans les délais ?" value={q.dueDelai} onChange={v => set('dueDelai', v)} />
            <Q num="5" text="Visite des copies proposée dans les délais (J+1 après délibération) ?" value={q.visiteCopies} onChange={v => set('visiteCopies', v)} ref_="Art. 71 §1" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-3">C — Post-délibération</p>
            <Q num="6" text="Résultats publiés dans les 2 jours ouvrables suivant la délibération ?" value={q.publiResultats} onChange={v => set('publiResultats', v)} ref_="Art. 82" />
          </Section>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(5)} className="bg-iip-mauve text-white px-6 py-2 rounded-lg text-sm font-medium">Décision →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE 5 — Décision */}
      {step === 5 && (
        <div>
          <Section title="Étape 5 — Décision motivée">
            {/* Synthèse */}
            <div className={`p-4 rounded-lg border-2 mb-5 ${recevable ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
              <p className="font-bold text-base">{recevable ? '✅ Recevable' : '🚫 Irrecevable'}</p>
              {recevable && (() => {
                const irregs = [
                  q.quorum === 'non' && 'Quorum non atteint (Art. 89 §1)',
                  q.conflitInteret === 'oui' && 'Conflit d\'intérêt',
                  q.motivJustif === 'non' && 'Justification AA manquante (Art. 71)',
                  q.visiteCopies === 'non' && 'Visite des copies non proposée (Art. 71 §1)',
                  q.publiResultats === 'non' && 'Publication tardive (Art. 82)',
                ].filter(Boolean);
                return irregs.length
                  ? <><p className="text-sm text-red-700 mt-2 font-medium">Irrégularités relevées :</p>{irregs.map(i=><p key={i} className="text-sm text-red-700">✗ {i}</p>)}</>
                  : <p className="text-sm text-green-700 mt-1">Aucune irrégularité de fond relevée — recours rejeté.</p>;
              })()}
            </div>

            {/* Procédure */}
            <div className="space-y-2 mb-5">
              {[
                {n:1, label:'Accusé de réception', detail:'Envoyer immédiatement un accusé de réception à l\'étudiant.'},
                {n:2, label:'Convoquer le CDE restreint', detail:`Président + min. 2 membres.${profsPresents.size > 0 ? ' Présents cochés : ' + profs.filter(p=>profsPresents.has(p.id)).map(p=>p.nomComplet).join(', ') + '.' : profs.length ? ' Enseignants de l\'UE : ' + profs.map(p=>p.nomComplet).join(', ') + ' (cochez les présents à l\'étape 1).' : ''}`},
                {n:3, label:'Instruction', detail:'Examiner les griefs argument par argument. Consulter épreuves, DUE, feuilles de délibération.'},
                {n:4, label:'Décision motivée', detail:'Rédiger la décision en exposant pourquoi chaque grief est accepté ou rejeté.'},
                {n:5, label:'Notification par recommandé', detail:`${limiteDecisionInterne ? 'Date limite : ' + fmt(limiteDecisionInterne) + '.' : 'Envoyer dans le délai légal (7 jours calendrier hors congés).'}`},
                {n:6, label:'Archivage', detail:'Classer le dossier complet (plainte + pièces + décision + récépissé recommandé).'},
              ].map(item => (
                <div key={item.n} className="flex gap-3 p-3 bg-white border border-gray-200 rounded-lg text-sm">
                  <div className="w-6 h-6 rounded-full bg-iip-mauve text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{item.n}</div>
                  <div><p className="font-semibold">{item.label}</p><p className="text-gray-600">{item.detail}</p></div>
                </div>
              ))}
            </div>

            {limiteRecourseExterne && (
              <div className="p-3 bg-orange-50 border border-orange-300 rounded text-sm mb-5">
                ⏱ <strong>Limite recours externe :</strong> {fmt(limiteRecourseExterne)}
                <span className="text-xs text-orange-700 ml-2">⚖ Art. 90 §2 RDE/ROI</span>
              </div>
            )}

            {/* Date d'envoi + commentaire — saisis après la délibération */}
            <div className="border border-gray-200 rounded-lg p-4 mb-5 bg-gray-50 space-y-4">
              <p className="text-sm font-semibold text-gray-700">À compléter après la réunion du CDE restreint :</p>

              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">
                  Date d'envoi de la décision par recommandé
                  <span className="text-gray-400 font-normal ml-1">(déclenche le délai de recours externe)</span>
                </div>
                <input type="date" value={dateDecisionInterne} onChange={e => setDateDecisionInterne(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white" />
                {limiteRecourseExterne && (
                  <p className="text-xs text-orange-700 mt-1 font-medium">
                    ⏱ Limite recours externe : <strong>{fmt(limiteRecourseExterne)}</strong>
                    <span className="text-gray-500 font-normal ml-1">(J+3 ouvrables + 7 jours calendrier — Art. 90 §2)</span>
                  </p>
                )}
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">
                  Observations / commentaire du CDE
                  <span className="text-gray-400 font-normal ml-1">(facultatif — apparaîtra dans la décision)</span>
                </div>
                <textarea value={commentaireCDE} onChange={e => setCommentaireCDE(e.target.value)}
                  rows={4} placeholder="Ex : Le CDE a examiné les épreuves en présence du responsable d'UE. Il ressort que les AA notifiés sur E-campus ont bien été communiqués à l'étudiant le [date]. La note de [X/20] reflète fidèlement le niveau d'acquisition constaté lors de l'épreuve."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white resize-y" />
              </label>
            </div>

            {/* Bouton génération */}
            <button onClick={ouvrirDecision}
              className="w-full bg-iip-mauve hover:opacity-90 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              📄 Générer la décision motivée (Word / PDF)
            </button>
            <p className="text-xs text-gray-500 text-center mt-1">Document officiel à imprimer, signer et envoyer par recommandé à l'étudiant.</p>
          </Section>

          <div className="flex justify-between mt-2">
            <button onClick={() => setStep(4)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => { setStep(1); setQ({}); setEtudiant(''); setUeNum(''); setDatePubli(''); setDateRecours(''); setDateDecisionInterne(''); setDateSeance(''); setCommentaireCDE(''); setProfsPresents(new Set()); }}
              className="border border-iip-mauve text-iip-mauve px-6 py-2 rounded-lg text-sm font-medium hover:bg-iip-mauve/5">
              ↺ Nouveau recours
            </button>
          </div>
        </div>
      )}
      {previewHtml && (
        <PreviewModal html={previewHtml} titre="PV de recours — Décision motivée" onClose={() => setPreviewHtml(null)} />
      )}
    </div>
  );
}

// ─── OUTIL FRAUDE ─────────────────────────────────────────────────────────────
function genererPVFraude({ etudiant, ueNum, ueNom, profs, profsPresents,
  dateExamen, dateFaits, dateNotification, dateAudition, dateCDE, dateEnvoi,
  typeFraude, descriptionFraits, declarationsEtudiant, commentaireCDE,
  session, recidive, decision, annee }) {

  const today = new Date().toLocaleDateString('fr-BE', { day:'2-digit', month:'long', year:'numeric' });
  const presents = profsPresents.length > 0 ? profsPresents : profs;
  const sanction = decision === 'ajournement'
    ? `L'étudiant·e est AJOURNÉ·E pour les acquis d'apprentissage visés par l'épreuve de l'UE ${ueNum}.`
    : decision === 'refus'
    ? `L'étudiant·e est REFUSÉ·E pour l'UE ${ueNum}. La décision de refus est susceptible de recours interne (Art. 87-91 RDE/ROI).`
    : 'La décision sera notifiée séparément.';

  const fondJuridique = session === '2' || recidive
    ? `L'étudiant·e se trouve en deuxième session${recidive ? ' et/ou en situation de récidive' : ''}. Conformément à l'Art. 73 §2 du RDE/ROI, le CDE peut prononcer un refus systématique.`
    : `L'étudiant·e se trouve en première session. Conformément à l'Art. 73 §1 du RDE/ROI, la fraude entraîne un ajournement pour les AA visés par l'épreuve concernée.`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>PV Fraude — ${etudiant}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11pt;color:#000;margin:0;padding:20mm 20mm 15mm 20mm}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #7B1C1C;padding-bottom:8px;margin-bottom:16px}
  .logo-txt{font-size:14pt;font-weight:bold;color:#7B1C1C}
  .logo-sub{font-size:9pt;color:#555}
  .ref{font-size:9pt;text-align:right;color:#555}
  h2{font-size:13pt;text-align:center;color:#7B1C1C;border:2px solid #7B1C1C;padding:10px;margin:20px 0}
  h3{font-size:11pt;font-weight:bold;margin-top:16px;margin-bottom:6px;border-bottom:1px solid #ccc;padding-bottom:3px;color:#333}
  p{margin:5px 0;line-height:1.5}
  ol,ul{margin:6px 0 6px 20px} li{margin:4px 0}
  .composition{background:#fff5f5;border:1px solid #f0c0c0;padding:8px 12px;margin:10px 0;font-size:10pt}
  .facts-box{background:#fff8f0;border:1px solid #f0d0a0;padding:10px 14px;margin:10px 0}
  .decision-box{background:#f0fff0;border:2px solid #2e7d32;padding:12px 14px;margin:16px 0}
  .alert-box{background:#fff3cd;border:1px solid #ffc107;padding:8px 12px;margin:8px 0;font-size:10pt}
  .signatures{display:flex;justify-content:space-between;margin-top:30px}
  .sig-block{text-align:center;min-width:180px}
  .sig-line{border-top:1px solid #000;margin-top:40px;padding-top:4px;font-size:10pt}
  .footer{border-top:1px solid #ccc;margin-top:20px;padding-top:8px;font-size:8pt;color:#888;text-align:center}
  @media print{body{padding:10mm 15mm}button{display:none}}
</style></head><body>
<div style="text-align:right;margin-bottom:10px">
  <button onclick="window.print()" style="padding:6px 16px;background:#7B1C1C;color:#fff;border:none;border-radius:4px;cursor:pointer">🖨 Imprimer / PDF</button>
</div>
<div class="header">
  <div>
    <div class="logo-txt">Institut Ilya Prigogine</div>
    <div class="logo-sub">Campus Erasme · Route de Lennik 808 · 1070 Bruxelles<br>direction@institut-prigogine.be · 02/560.29.59</div>
  </div>
  <div class="ref">RDE/ROI Art. 72-75 · Année ${annee}<br>Date : ${today}<br><strong>CONFIDENTIEL</strong></div>
</div>

<h2>PROCÈS-VERBAL DE FRAUDE<br>PROCÉDURE CONTRADICTOIRE — DÉCISION DU CDE</h2>

<p><strong>Étudiant·e :</strong> ${etudiant || '[NOM ÉTUDIANT]'}</p>
<p><strong>UE concernée :</strong> UE ${ueNum}${ueNom ? ' — ' + ueNom : ''}</p>
<p><strong>Date de l'épreuve :</strong> ${fmtCourt(dateExamen) || '—'}</p>
<p><strong>Session :</strong> ${session === '1' ? '1re session' : '2e session'}${recidive ? ' — <strong>RÉCIDIVE</strong>' : ''}</p>
${dateCDE ? `<p><strong>Date de réunion du CDE :</strong> ${fmtCourt(dateCDE)}</p>` : ''}

${presents.length > 0 ? `
<div class="composition">
  <strong>Composition du Conseil des Études (Art. 72 RDE/ROI) :</strong><br>
  <table style="width:100%;margin-top:6px;font-size:10pt">
    <tr style="background:#f5e8e8"><th style="text-align:left;padding:4px 8px">Membre</th><th style="text-align:left;padding:4px 8px">Qualité</th><th style="text-align:center;padding:4px 8px">Présent</th></tr>
    ${presents.map((p,i) => `<tr style="background:${i%2===0?'#fdf0f0':'white'}">
      <td style="padding:4px 8px;font-weight:bold">${p.nomComplet}</td>
      <td style="padding:4px 8px">${p.qualite || 'Membre du CDE'}</td>
      <td style="padding:4px 8px;text-align:center">✓</td></tr>`).join('')}
  </table>
</div>` : ''}

<h3>VU ET CONSIDÉRANT</h3>
<p>Vu le RDE/ROI de l'Institut Ilya Prigogine, année académique ${annee}, notamment les articles 72 à 75 ;</p>
<p>Vu le Décret du 16 avril 1991 relatif à l'enseignement de promotion sociale ;</p>
<p>Vu le rapport de fraude établi le ${fmtCourt(dateFaits) || '—'} lors de l'épreuve de l'UE ${ueNum} ;</p>
<p>Vu la notification adressée à l'étudiant·e le ${fmtCourt(dateNotification) || '—'} l'informant de la fraude constatée et de son droit à une audition (Art. 74 §1 RDE/ROI) ;</p>
${dateAudition ? `<p>Vu l'audition de l'étudiant·e qui s'est tenue le ${fmtCourt(dateAudition)} ;</p>` : '<p>Vu que l\'étudiant·e n\'a pas souhaité être entendu·e dans le délai imparti ;</p>'}
<p>Vu les pièces du dossier ;</p>

<h3>I. FAITS CONSTATÉS</h3>
<div class="facts-box">
  <p><strong>Type de fraude :</strong> ${typeFraude || '—'}</p>
  <p><strong>Description des faits :</strong></p>
  <p>${(descriptionFraits || '[À COMPLÉTER]').replace(/\n/g,'<br>')}</p>
</div>

<h3>II. PROCÉDURE CONTRADICTOIRE (Art. 74 RDE/ROI)</h3>
<p>Conformément à l'Art. 74 §1 du RDE/ROI, l'étudiant·e a été informé·e par écrit des faits qui lui sont reprochés et de son droit à être entendu·e.</p>
${dateAudition
  ? `<p>L'audition s'est tenue le ${fmtCourt(dateAudition)}. L'étudiant·e a eu la possibilité de présenter ses observations et de se faire assister.</p>
     <p><strong>Déclarations de l'étudiant·e lors de l'audition :</strong></p>
     <p style="border-left:3px solid #ccc;padding-left:10px;font-style:italic">${(declarationsEtudiant || 'Aucune déclaration consignée.').replace(/\n/g,'<br>')}</p>`
  : `<p>L'étudiant·e a été dûment convoqué·e mais ne s'est pas présenté·e à l'audition dans le délai imparti. Le CDE a procédé à la délibération sur base des pièces disponibles.</p>`}

<h3>III. ANALYSE JURIDIQUE</h3>
<p>${fondJuridique}</p>
<p>La décision doit être formellement motivée et notifiée à l'étudiant·e (Art. 75 RDE/ROI). L'étudiant·e dispose du droit au recours prévu aux Art. 87-91 du RDE/ROI contre toute décision de sanction.</p>

<h3>IV. DÉCISION DU CONSEIL DES ÉTUDES</h3>
<div class="decision-box">
  <p style="font-size:13pt;font-weight:bold">${sanction}</p>
</div>
${commentaireCDE ? `
<h3>V. OBSERVATIONS DU CONSEIL DES ÉTUDES</h3>
<p style="border:1px solid #ccc;padding:10px;background:#fafafa">${commentaireCDE.replace(/\n/g,'<br>')}</p>` : ''}

<h3>VOIES DE RECOURS</h3>
<div class="alert-box">
<p>La présente décision peut faire l'objet d'un <strong>recours interne</strong> auprès de la Direction de l'IIP dans un délai de <strong>4 jours calendrier</strong> suivant la publication des résultats (Art. 88 §1 RDE/ROI), par e-mail à direction@institut-prigogine.be ou remise en main propre au Bureau P2-210.</p>
</div>

<div class="signatures">
  <div class="sig-block"><div class="sig-line">Le Président du CDE<br><em>(ou son délégué)</em></div></div>
  <div class="sig-block"><div class="sig-line">Le Directeur<br>Charles SOHET</div></div>
</div>
<div class="footer">
  Institut Ilya Prigogine · direction@institut-prigogine.be · 02/560.29.59 · www.institut-prigogine.be<br>
  Document généré par Lucie le ${today} · Fondé sur les Art. 72-75 RDE/ROI IIP 2026-2027 · CONFIDENTIEL
</div>
</body></html>`;
}

function OutilFraude() {
  const annee = getAnnee();
  const [step, setStep] = useState(1);
  const [previewHtml, setPreviewHtml] = useState(null);

  // Données dossier
  const [etudiant, setEtudiant]           = useState('');
  const [ueNum, setUeNum]                 = useState('');
  const [ueNom, setUeNom]                 = useState('');
  const [session, setSession]             = useState('1');
  const [recidive, setRecidive]           = useState(false);
  const [dateExamen, setDateExamen]       = useState('');
  const [dateFaits, setDateFaits]         = useState('');
  const [typeFraude, setTypeFraude]       = useState('');
  const [descriptionFraits, setDescriptionFraits] = useState('');
  const [dateNotification, setDateNotification] = useState('');
  const [dateAudition, setDateAudition]   = useState('');
  const [declarationsEtudiant, setDeclarationsEtudiant] = useState('');
  const [dateCDE, setDateCDE]             = useState('');
  const [dateEnvoi, setDateEnvoi]         = useState('');
  const [decision, setDecision]           = useState('');
  const [commentaireCDE, setCommentaireCDE] = useState('');

  // Profs & membres CDE
  const [profs, setProfs]                 = useState([]);
  const [profsPresents, setProfsPresents] = useState(new Set());
  const [loadingProfs, setLoadingProfs]   = useState(false);
  const [ues, setUes]                     = useState([]);
  const [membresCde, setMembresCde]       = useState([]);

  useEffect(() => {
    authFetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`)
      .then(d => {
        const map = new Map();
        for (const sg of (Array.isArray(d) ? d : []))
          for (const ue of (sg.ues || []))
            if (!map.has(ue.ue_num)) map.set(ue.ue_num, { ...ue, _section: sg.section });
        setUes([...map.values()].sort((a,b) => (a.ue_num||0)-(b.ue_num||0)));
      }).catch(() => {});
    authFetch('/api/ref/membres-cde')
      .then(d => setMembresCde(Array.isArray(d) ? d.map(m => ({...m, id:'cde_'+m.id})) : []))
      .catch(() => {});
  }, [annee]);

  useEffect(() => {
    if (!ueNum) { setProfs([]); setProfsPresents(new Set()); return; }
    const ue = ues.find(u => String(u.ue_num) === String(ueNum));
    if (ue) setUeNom(ue.ue_nom || '');
    const ueSection = ue?._section || null;
    setLoadingProfs(true);
    authFetch(`/api/attributions?annee=${encodeURIComponent(annee)}&ue_num=${encodeURIComponent(ueNum)}`)
      .then(rows => {
        const seen = new Set(); const ps = [];
        for (const r of (Array.isArray(rows) ? rows : []))
          if (r.professeur_id && !seen.has(r.professeur_id) && !r.is_z) {
            seen.add(r.professeur_id);
            const parts = (r.professeur||'').split(' ');
            ps.push({ id: r.professeur_id, nom: parts[0]||'', prenom: parts.slice(1).join(' ')||'', nomComplet: r.professeur||'', qualite:'Enseignant(e)' });
          }
        const cdeFiltrés = membresCde.filter(m =>
          !m.sections || m.sections.length === 0 ||
          (ueSection && m.sections.includes(ueSection))
        );
        setProfs([...cdeFiltrés, ...ps]);
      }).catch(() => setProfs([...membresCde]))
      .finally(() => setLoadingProfs(false));
  }, [ueNum, annee, membresCde]);

  function togglePresent(id) {
    setProfsPresents(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function ouvrirPV() {
    const presents = profs.filter(p => profsPresents.has(p.id));
    try {
      const res = await authFetch('/api/procedures/pv-fraude', {
        method: 'POST',
        body: JSON.stringify({
          etudiant, ue_num: ueNum, ue_nom: ueNom,
          membres_presents: (presents.length ? presents : profs)
            .map(p => ({ nomComplet: p.nomComplet, qualite: p.qualite })),
          date_examen: dateExamen, date_faits: dateFaits,
          date_notification: dateNotification, date_audition: dateAudition,
          date_cde: dateCDE, type_fraude: typeFraude,
          description_faits: descriptionFraits,
          declarations_etudiant: declarationsEtudiant,
          commentaire_cde: commentaireCDE,
          session, recidive, decision, annee,
        }),
      });
      if (res.error) { alert('Erreur : ' + res.error); return; }
      if (res.champs_manquants?.length)
        alert('⚠ Champs du modèle non disponibles pour cette procédure (laissés vides dans le document) :\n\n• '
          + res.champs_manquants.join('\n• '));
      setPreviewHtml(res.html);
    } catch(e) { alert('Erreur : ' + e.message); }
  }

  const steps = ['Dossier & UE', 'Faits', 'Procédure contradictoire', 'Délibération', 'PV & décision'];

  // Délai notification (3 jours après les faits)
  const limiteNotif = dateFaits ? addJoursCalendrier(dateFaits, 3) : null;

  return (
    <div className="max-w-3xl">
      {/* Stepper */}
      <div className="flex items-center gap-1 mb-7 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setStep(i+1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition
                ${step===i+1?'bg-red-700 text-white':step>i+1?'bg-green-500 text-white':'bg-gray-100 text-gray-500'}`}>
              {step>i+1?'✓':i+1}. {s}
            </button>
            {i<steps.length-1 && <div className={`h-0.5 w-4 flex-shrink-0 ${step>i+1?'bg-green-400':'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* ÉTAPE 1 — Dossier & UE */}
      {step === 1 && (
        <div>
          <Section title="Étape 1 — Constitution du dossier">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Nom de l'étudiant·e *</div>
                <input value={etudiant} onChange={e => setEtudiant(e.target.value)} placeholder="Prénom NOM"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">UE concernée *</div>
                <select value={ueNum} onChange={e => setUeNum(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                  <option value="">— Choisir une UE —</option>
                  {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
                </select>
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Session</div>
                <select value={session} onChange={e => setSession(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                  <option value="1">1re session</option>
                  <option value="2">2e session</option>
                </select>
              </label>
              <label className="flex items-center gap-2 cursor-pointer pt-5">
                <input type="checkbox" checked={recidive} onChange={e => setRecidive(e.target.checked)} className="w-4 h-4 accent-red-700" />
                <span className="text-sm font-medium text-red-800">Récidive (fraude antérieure)</span>
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date de l'épreuve</div>
                <input type="date" value={dateExamen} onChange={e => setDateExamen(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date de réunion du CDE</div>
                <input type="date" value={dateCDE} onChange={e => setDateCDE(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </label>
            </div>

            {/* Membres présents */}
            {ueNum && (
              <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-red-900">
                    Membres du CDE présents {loadingProfs && <span className="text-xs font-normal ml-1">…</span>}
                  </p>
                  {profs.length > 0 && (
                    <button onClick={() => setProfsPresents(new Set(profs.map(p => p.id)))}
                      className="text-xs text-red-600 hover:underline">Tout cocher</button>
                  )}
                </div>
                <div className="space-y-1">
                  {profs.map(p => (
                    <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition ${profsPresents.has(p.id)?'bg-green-50 border-green-400':'bg-white border-red-200 hover:bg-red-50'}`}>
                      <input type="checkbox" checked={profsPresents.has(p.id)} onChange={() => togglePresent(p.id)} className="w-4 h-4 accent-green-600" />
                      <span className={`w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${profsPresents.has(p.id)?'bg-green-600':'bg-red-700'}`}>
                        {(p.nom[0]||'?').toUpperCase()}
                      </span>
                      <span className="text-sm font-medium flex-1">{p.nomComplet}</span>
                      {p.qualite && <span className="text-xs text-gray-400 italic">{p.qualite}</span>}
                      {profsPresents.has(p.id) && <span className="text-xs text-green-700 font-semibold">✓</span>}
                    </label>
                  ))}
                </div>
                {profsPresents.size > 0 && (
                  <p className={`text-xs mt-2 font-medium ${profsPresents.size >= 3 ? 'text-green-700' : 'text-orange-600'}`}>
                    {profsPresents.size} membre{profsPresents.size>1?'s':''} présent{profsPresents.size>1?'s':''}
                    {profsPresents.size >= 3 ? ' — ✓ Quorum atteint' : ` — ⚠ Min. 3 membres requis`}
                  </p>
                )}
              </div>
            )}
          </Section>
          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-medium">Étape suivante →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE 2 — Faits */}
      {step === 2 && (
        <div>
          <Section title="Étape 2 — Description des faits" color="red">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Type de fraude constatée <Ref text="Art. 72 RDE/ROI" /></div>
                <select value={typeFraude} onChange={e => setTypeFraude(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                  <option value="">— Sélectionner —</option>
                  <option value="Usage de notes ou documents non autorisés (antisèche)">Usage de notes ou documents non autorisés (antisèche)</option>
                  <option value="Communication entre étudiants pendant l'épreuve">Communication entre étudiants pendant l'épreuve</option>
                  <option value="Utilisation d'un appareil électronique non autorisé">Utilisation d'un appareil électronique non autorisé</option>
                  <option value="Copie sur la copie d'un autre étudiant">Copie sur la copie d'un autre étudiant</option>
                  <option value="Substitution d'identité ou usurpation">Substitution d'identité ou usurpation</option>
                  <option value="Plagiat ou travail non personnel">Plagiat ou travail non personnel</option>
                  <option value="Autre fraude (à préciser ci-dessous)">Autre fraude (à préciser ci-dessous)</option>
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Date des faits constatés</div>
                <input type="date" value={dateFaits} onChange={e => setDateFaits(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm" />
                {limiteNotif && <p className="text-xs text-orange-600 mt-1">⏱ Notification à l'étudiant recommandée avant le : <strong>{fmt(limiteNotif)}</strong></p>}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Description détaillée des faits (rapport du surveillant)</div>
                <textarea value={descriptionFraits} onChange={e => setDescriptionFraits(e.target.value)}
                  rows={5} placeholder="Décrire précisément : qui a constaté la fraude, à quelle heure, ce qui a été saisi ou observé, le comportement de l'étudiant, les témoins éventuels..."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-y" />
              </div>
            </div>
            <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded text-sm">
              <p className="font-semibold text-amber-800">⚠ Important — Art. 72 §2 RDE/ROI</p>
              <p className="text-amber-700 mt-1">L'élément suspect doit être saisi et joint au dossier. Le rapport du surveillant est obligatoire. L'étudiant peut terminer son épreuve même en cas de fraude constatée.</p>
            </div>
          </Section>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(3)} className="bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-medium">Procédure contradictoire →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 — Procédure contradictoire */}
      {step === 3 && (
        <div>
          <Section title="Étape 3 — Procédure contradictoire (Art. 74 RDE/ROI)" color="orange">
            <p className="text-sm text-gray-600 mb-4">La procédure contradictoire est <strong>obligatoire</strong> avant toute sanction. L'étudiant doit être notifié et avoir la possibilité d'être entendu.</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Date de notification à l'étudiant *</div>
                  <input type="date" value={dateNotification} onChange={e => setDateNotification(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                  <p className="text-xs text-gray-400 mt-0.5">Courrier/e-mail informant des faits reprochés et du droit à l'audition</p>
                </label>
                <label className="block">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Date de l'audition <span className="text-gray-400 font-normal">(si tenue)</span></div>
                  <input type="date" value={dateAudition} onChange={e => setDateAudition(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                  <p className="text-xs text-gray-400 mt-0.5">Laisser vide si l'étudiant ne s'est pas présenté</p>
                </label>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-600 mb-1">Déclarations de l'étudiant lors de l'audition</div>
                <textarea value={declarationsEtudiant} onChange={e => setDeclarationsEtudiant(e.target.value)}
                  rows={4} placeholder={dateAudition ? "Résumer les déclarations de l'étudiant : contestation des faits, explications données, circonstances atténuantes invoquées..." : "L'étudiant ne s'est pas présenté à l'audition dans le délai imparti."}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-y" />
              </div>
            </div>
            {!dateNotification && (
              <div className="mt-3 p-3 bg-red-50 border border-red-400 rounded text-sm text-red-800">
                ⛔ La notification préalable est obligatoire (Art. 74 §1). Toute décision sans notification préalable serait nulle.
              </div>
            )}
          </Section>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(4)} disabled={!dateNotification}
              className="bg-red-700 disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm font-medium">
              Délibération →
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 4 — Délibération */}
      {step === 4 && (
        <div>
          <Section title="Étape 4 — Délibération du CDE" color="red">
            <p className="text-sm text-gray-600 mb-4">Le CDE délibère après avoir entendu l'étudiant (ou après expiration du délai). La décision doit être formellement motivée (Art. 75 RDE/ROI).</p>

            <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded text-sm">
              <p className="font-semibold text-amber-800">Sanction applicable selon la situation :</p>
              <p className="text-amber-700 mt-1">
                {session === '1' && !recidive
                  ? '1re session + 1re fraude → Ajournement pour les AA visés (Art. 73 §1)'
                  : '2e session ou récidive → Refus possible pour l\'UE (Art. 73 §2)'}
              </p>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-2">Décision du CDE *</div>
              <div className="space-y-2">
                {[
                  ['ajournement', `Ajournement pour les AA visés par l'épreuve (Art. 73 §1)`, session==='1'&&!recidive],
                  ['refus',       `Refus pour l'UE ${ueNum} (Art. 73 §2 — 2e session ou récidive)`, session==='2'||recidive],
                ].map(([val, label, recommande]) => (
                  <label key={val} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${decision===val?'bg-green-50 border-green-500':'bg-white border-gray-300 hover:bg-gray-50'}`}>
                    <input type="radio" name="decision" value={val} checked={decision===val} onChange={() => setDecision(val)} className="accent-red-700" />
                    <span className="text-sm flex-1">{label}</span>
                    {recommande && <span className="text-xs bg-green-100 text-green-800 border border-green-300 rounded-full px-2 py-0.5">Recommandé</span>}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-600 mb-1">Observations / motivation complémentaire du CDE</div>
              <textarea value={commentaireCDE} onChange={e => setCommentaireCDE(e.target.value)}
                rows={3} placeholder="Ex : Le CDE a examiné les pièces saisies. Les faits sont établis sans ambiguïté. L'étudiant a reconnu les faits lors de l'audition..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-y" />
            </div>
          </Section>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(5)} disabled={!decision}
              className="bg-red-700 disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm font-medium">
              PV & décision →
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 5 — PV & décision */}
      {step === 5 && (
        <div>
          <Section title="Étape 5 — Notification et PV">
            {/* Synthèse */}
            <div className="p-4 bg-red-50 border-2 border-red-500 rounded-lg mb-5">
              <p className="font-bold text-red-900">
                Décision : {decision === 'ajournement' ? `✓ Ajournement (Art. 73 §1)` : `⛔ Refus pour l'UE ${ueNum} (Art. 73 §2)`}
              </p>
              <p className="text-sm text-red-700 mt-1">{etudiant} · UE {ueNum}{ueNom ? ' — ' + ueNom : ''} · {session === '1' ? '1re session' : '2e session'}{recidive ? ' · Récidive' : ''}</p>
              {profsPresents.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {profs.filter(p => profsPresents.has(p.id)).map(p => (
                    <span key={p.id} className="text-xs bg-green-100 text-green-800 border border-green-300 rounded-full px-2 py-0.5">✓ {p.nomComplet}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Date d'envoi */}
            <div className="border border-gray-200 rounded-lg p-4 mb-5 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700 mb-3">À compléter après la réunion du CDE :</p>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date d'envoi de la décision à l'étudiant (recommandé)</div>
                <input type="date" value={dateEnvoi} onChange={e => setDateEnvoi(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white" />
                {dateEnvoi && (
                  <p className="text-xs text-orange-700 mt-1">
                    ⏱ Limite recours interne : <strong>{fmt(addJoursCalendrier(dateEnvoi, 4))}</strong>
                    <span className="text-gray-400 font-normal ml-1">(4 jours calendrier après notification — Art. 88 §1)</span>
                  </p>
                )}
              </label>
            </div>

            {/* Procédure de notification */}
            <div className="space-y-2 mb-5">
              {[
                {n:1, label:'Envoyer par recommandé', detail:'Notifier la décision motivée à l\'étudiant par pli recommandé avec accusé de réception.'},
                {n:2, label:'Encoder dans Lucie', detail:`Encoder l'AA/UE concerné avec la mention de fraude et la sanction appliquée.`},
                {n:3, label:'Archiver le dossier', detail:'Classer : rapport de fraude + pièces saisies + preuve de notification + PV de délibération + récépissé recommandé.'},
                {n:4, label:'Informer les voies de recours', detail:'L\'étudiant dispose de 4 jours calendrier pour introduire un recours interne (Art. 88 §1 RDE/ROI).'},
              ].map(item => (
                <div key={item.n} className="flex gap-3 p-3 bg-white border border-gray-200 rounded-lg text-sm">
                  <div className="w-6 h-6 rounded-full bg-red-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{item.n}</div>
                  <div><p className="font-semibold">{item.label}</p><p className="text-gray-600">{item.detail}</p></div>
                </div>
              ))}
            </div>

            <button onClick={ouvrirPV}
              className="w-full bg-red-700 hover:opacity-90 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
              📄 Générer le procès-verbal (PDF)
            </button>
            <p className="text-xs text-gray-500 text-center mt-1">Document officiel · CONFIDENTIEL · À signer et envoyer par recommandé à l'étudiant</p>
          </Section>

          <div className="flex justify-between mt-2">
            <button onClick={() => setStep(4)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => { setStep(1); setEtudiant(''); setUeNum(''); setSession('1'); setRecidive(false); setDateExamen(''); setDateFaits(''); setTypeFraude(''); setDescriptionFraits(''); setDateNotification(''); setDateAudition(''); setDeclarationsEtudiant(''); setDateCDE(''); setDateEnvoi(''); setDecision(''); setCommentaireCDE(''); setProfsPresents(new Set()); }}
              className="border border-red-700 text-red-700 px-6 py-2 rounded-lg text-sm font-medium hover:bg-red-50">
              ↺ Nouveau dossier
            </button>
          </div>
        </div>
      )}
      {previewHtml && (
        <PreviewModal html={previewHtml} titre="PV de fraude" onClose={() => setPreviewHtml(null)} />
      )}
    </div>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function Procedures() {
  const [outil, setOutil] = useState('recours');
  const outils = [
    { id: 'recours', label: '⚖ Recours',  desc: 'Aide à la décision — Art. 87-91 RDE/ROI' },
    { id: 'fraude',  label: '🚨 Fraude',   desc: 'Procédure contradictoire — Art. 72-75 RDE/ROI' },
    { id: 'examens', label: '📋 Examens',  desc: 'Organisation & surveillance' },
  ];
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-56 flex-shrink-0 bg-gray-50 border-r border-gray-200 overflow-auto">
        <div className="px-4 py-4 border-b border-gray-200">
          <h2 className="font-title text-iip-mauve font-bold text-sm uppercase tracking-wide">Procédures IIP</h2>
          <p className="text-xs text-gray-500 mt-0.5">Année 2026-2027</p>
        </div>
        <div className="py-2">
          {outils.map(o => (
            <button key={o.id} onClick={() => setOutil(o.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 transition ${outil===o.id?'bg-iip-mauve/10 border-l-4 border-l-iip-mauve':'hover:bg-gray-100'}`}>
              <p className={`text-sm font-semibold ${outil===o.id?'text-iip-mauve':'text-gray-700'}`}>{o.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {outil === 'recours' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-title text-iip-mauve mb-1">Outil de traitement des recours</h1>
              <p className="text-sm text-gray-600">Art. 87-91 RDE/ROI IIP 2026-2027 · D. 27/10/2006 · À destination de Nicolas</p>
            </div>
            <OutilRecours />
          </>
        )}
        {outil === 'fraude' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-title text-iip-mauve mb-1">Procédure de traitement des fraudes</h1>
              <p className="text-sm text-gray-600">Art. 72-75 RDE/ROI IIP 2026-2027 · Procédure contradictoire obligatoire · À destination de Nicolas</p>
            </div>
            <OutilFraude />
          </>
        )}
        {outil === 'examens' && (
          <div className="text-center text-gray-500 p-12">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">Procédure Examens — en cours de développement</p>
          </div>
        )}
      </div>
    </div>
  );
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-56 flex-shrink-0 bg-gray-50 border-r border-gray-200 overflow-auto">
        <div className="px-4 py-4 border-b border-gray-200">
          <h2 className="font-title text-iip-mauve font-bold text-sm uppercase tracking-wide">Procédures IIP</h2>
          <p className="text-xs text-gray-500 mt-0.5">Année 2026-2027</p>
        </div>
        <div className="py-2">
          {outils.map(o => (
            <button key={o.id} onClick={() => setOutil(o.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 transition ${outil===o.id?'bg-iip-mauve/10 border-l-4 border-l-iip-mauve':'hover:bg-gray-100'}`}>
              <p className={`text-sm font-semibold ${outil===o.id?'text-iip-mauve':'text-gray-700'}`}>{o.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {outil === 'recours' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-title text-iip-mauve mb-1">Outil de traitement des recours</h1>
              <p className="text-sm text-gray-600">Art. 87-91 RDE/ROI IIP 2026-2027 · D. 27/10/2006 · À destination de Nicolas</p>
            </div>
            <OutilRecours />
          </>
        )}
        {outil === 'examens' && (
          <div className="text-center text-gray-500 p-12">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">Procédure Examens — en cours de développement</p>
          </div>
        )}
      </div>
    </div>
  );
}

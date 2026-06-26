import { useState, useEffect, useCallback } from 'react';
import PreviewModal from '../components/PreviewModal.jsx';
import { IconPlus, IconTrash, IconEye, IconDownload, IconCopy } from '@tabler/icons-react';

/* ── Template HTML attestation provisoire ─────────────────────────────────── */
export function genererTemplateAttestation() {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<title>Attestation provisoire</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #1a1a1a; background: white; }
  @media print { @page { size: A4 portrait; margin: 0; } body { margin: 0; } }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; display: flex; flex-direction: column; }

  /* ── Bandeau marine ── */
  .bandeau { background: #1B2B4B; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
  .bandeau-gauche { color: white; font-size: 9pt; font-weight: bold; letter-spacing: 0.5pt; line-height: 1.4; }
  .bandeau-droite { color: rgba(255,255,255,0.65); font-size: 7.5pt; text-align: right; letter-spacing: 0.5pt; line-height: 1.5; }

  /* ── Corps ── */
  .corps { flex: 1; padding: 14mm 20mm 8mm 20mm; display: flex; flex-direction: column; }

  /* ── Filet doré institutionnel ── */
  .filet-or { border-top: 1pt solid #C9A84C; border-bottom: 1pt solid #C9A84C; padding: 3pt 0; margin-bottom: 8mm; text-align: center; }
  .filet-or span { font-size: 7.5pt; color: #888; letter-spacing: 0.8pt; text-transform: uppercase; }

  /* ── Établissement ── */
  .etab { font-size: 8pt; color: #444; line-height: 1.6; margin-bottom: 7mm; }
  .etab strong { color: #1a1a1a; font-size: 8.5pt; }

  /* ── Encadré attestation (bordure dorée) ── */
  .encadre { border: 1pt solid #C9A84C; padding: 4pt 0; text-align: center; margin-bottom: 8mm; }
  .encadre span { font-size: 10pt; font-weight: bold; letter-spacing: 0.5pt; }

  /* ── Texte courant ── */
  .texte p { font-size: 9.5pt; line-height: 1.75; margin-bottom: 3pt; }

  /* ── Carte étudiant ── */
  .carte-etudiant { background: #f0f4ff; border-left: 3pt solid #C9A84C; padding: 6pt 10pt; margin: 5mm 0; border-radius: 0 3pt 3pt 0; }
  .carte-etudiant .nom { font-size: 11pt; font-weight: bold; color: #1B2B4B; }
  .carte-etudiant .naissance { font-size: 8.5pt; color: #555; margin-top: 2pt; }

  /* ── UE bloc ── */
  .ue-bloc { margin: 2mm 0 3mm 6mm; }
  .ue-bloc .ue-ligne { font-size: 9pt; line-height: 1.6; }

  /* ── Signatures ── */
  .signatures { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10mm; padding-top: 6mm; border-top: 0.5pt solid #e0e0e0; }
  .sig-gauche { font-size: 9pt; color: #666; }
  .sig-droite { text-align: right; font-size: 9.5pt; }
  .sig-droite .lieu-date { margin-bottom: 14mm; color: #333; }
  .sig-droite .nom-dir { font-weight: bold; margin-top: 1mm; }

  /* ── Pied de page doré ── */
  .footer { flex-shrink: 0; padding: 4pt 20mm; border-top: 0.5pt solid #C9A84C; font-size: 7pt; color: #888; text-align: center; line-height: 1.5; }
</style>
</head><body>
<div class="page">

  <!-- Bandeau marine -->
  <div class="bandeau">
    <div class="bandeau-gauche">INSTITUT<br>ILYA PRIGOGINE</div>
    <div class="bandeau-droite">PÔLE ACADÉMIQUE<br>DE BRUXELLES</div>
  </div>

  <!-- Corps principal -->
  <div class="corps">

    <!-- Filet doré institutionnel -->
    <div class="filet-or">
      <span>Communauté française de Belgique &nbsp;·&nbsp; Enseignement de promotion sociale &nbsp;·&nbsp; Année académique {{annee}}</span>
    </div>

    <!-- Établissement -->
    <div class="etab">
      <strong>{{nom_etab}}</strong><br>
      Adresse : {{adresse_etab}}<br>
      Numéro de matricule : {{matricule_etab}} &nbsp;·&nbsp; Numéro FASE : {{fase_etab}}
    </div>

    <!-- Encadré attestation -->
    <div class="encadre">
      <span>Attestation provisoire</span>
    </div>

    <!-- Corps texte -->
    <div class="texte">
      <p>Je soussigné, {{directeur}} Directeur de l'établissement, certifie que</p>
    </div>

    <!-- Carte étudiant -->
    <div class="carte-etudiant">
      <div class="nom">{{nom_etudiant}} {{prenom_etudiant}} ({{genre}})</div>
      <div class="naissance">Né·e à <strong>{{lieu_naissance}}</strong>, le <strong>{{date_naissance}}</strong></div>
    </div>

    <!-- Suite texte -->
    <div class="texte">
      <p>a obtenu ce jour le <strong>DIPLÔME DE {{intitule_diplome}}</strong></p>
      <p>Avec la mention <strong>{{mention}}</strong></p>
      <p>à l'issue de la section <strong>{{intitule_section}}</strong></p>
      <p>approuvée par le Gouvernement sous le numéro de code : <strong>{{code_section}}</strong></p>
      <p>Ladite section comporte {{total_periodes}} périodes / {{total_ects}} ECTS.</p>
      {{bloc_ue_det}}
      {{bloc_ue_int}}
      <p style="font-style:italic;color:#555;margin-top:3mm;">Le diplôme de l'intéressé·e est actuellement soumis à la signature de l'autorité compétente.</p>
    </div>

    <!-- Signatures -->
    <div class="signatures">
      <div class="sig-gauche">Sceau de l'établissement</div>
      <div class="sig-droite">
        <div class="lieu-date">Fait à {{ville_etab}},<br>le {{date_deliberation}}</div>
        <div>Le Directeur,</div>
        <div class="nom-dir">{{directeur}}</div>
      </div>
    </div>

  </div>

  <!-- Pied de page doré -->
  <div class="footer">
    Institut Supérieur de Promotion Sociale Libre Ilya Prigogine &nbsp;·&nbsp; PO Asbl Ilya Prigogine &nbsp;·&nbsp; Matricule N° {{matricule_etab}} &nbsp;·&nbsp; Fase {{fase_etab}}<br>
    {{adresse_etab}} &nbsp;·&nbsp; T. {{tel_etab}} &nbsp;·&nbsp; {{site_etab}}
  </div>

</div>
</body></html>`;
}

function remplaceVars(template, vars) {
  let h = template;
  for (const [k, v] of Object.entries(vars)) h = h.split(k).join(v ?? '');
  return h;
}

const MENTIONS = ['Satisfaction', 'Distinction', 'Grande distinction'];
const LIGNE_VIDE = () => ({
  id: Date.now() + Math.random(),
  nom: '', prenom: '', genre: 'F',
  lieu_naissance: '', date_naissance: '',
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
export default function Attestation() {
  const tok = () => localStorage.getItem('token');
  const af  = (url) => fetch(url, { headers: { Authorization: `Bearer ${tok()}` } }).then(r => r.json());

  const [lignes, setLignes]               = useState([LIGNE_VIDE()]);
  const [sectionsDispo, setSectionsDispo] = useState([]);
  const [etab, setEtab]                   = useState({});
  const [annee, setAnnee]                 = useState('2025/2026');
  const [preview, setPreview]             = useState(null);
  const [generating, setGenerating]       = useState(false);

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
    const a = localStorage.getItem('annee_active');
    if (a) setAnnee(a.replace('-', '/'));
  }, []);

  const majLigne = useCallback((id, k, v) => {
    setLignes(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l));
  }, []);

  const supprimerLigne = (id) => setLignes(ls => ls.filter(l => l.id !== id));
  const dupliquerLigne = (id) => {
    const l = lignes.find(l => l.id === id);
    setLignes(ls => { const i = ls.findIndex(x => x.id === id); const n = [...ls]; n.splice(i+1, 0, { ...l, id: Date.now()+Math.random(), nom: '', prenom: '' }); return n; });
  };
  const ajouterLigne = () => setLignes(ls => [...ls, LIGNE_VIDE()]);

  const genererHtml = (l) => {
    const sec = sectionsDispo.find(s => s.code === l.section_code) || {};
    const blocDet = l.ue_determinantes ? `<p><strong>UE déterminante(s) :</strong></p><div class="ue-bloc">${
      l.ue_determinantes.split('\n').filter(Boolean).map(u => `<div class="ue-ligne">${u}</div>`).join('')
    }</div>` : '';
    const blocInt = l.ue_integree ? `<p><strong>UE intégrée :</strong></p><div class="ue-bloc">${
      l.ue_integree.split('\n').filter(Boolean).map(u => `<div class="ue-ligne">${u}</div>`).join('')
    }</div>` : '';
    return remplaceVars(genererTemplateAttestation(), {
      '{{nom_etudiant}}':     l.nom.toUpperCase(),
      '{{prenom_etudiant}}':  l.prenom,
      '{{genre}}':            l.genre,
      '{{lieu_naissance}}':   l.lieu_naissance,
      '{{date_naissance}}':   l.date_naissance,
      '{{intitule_diplome}}': sec.diplome || '',
      '{{mention}}':          l.mention,
      '{{intitule_section}}': sec.section || '',
      '{{code_section}}':     sec.code || '',
      '{{total_periodes}}':   String(sec.periodes || ''),
      '{{total_ects}}':       String(sec.ects || ''),
      '{{date_deliberation}}':l.date_deliberation,
      '{{bloc_ue_det}}':      blocDet,
      '{{bloc_ue_int}}':      blocInt,
      '{{annee}}':            annee,
      '{{directeur}}':        etab.directeur || 'SOHET Charles',
      '{{nom_etab}}':         etab.nom || 'INSTITUT ILYA PRIGOGINE',
      '{{adresse_etab}}':     etab.adresse || '',
      '{{matricule_etab}}':   etab.matricule || '',
      '{{fase_etab}}':        etab.fase || '',
      '{{ville_etab}}':       etab.ville || 'Anderlecht',
      '{{tel_etab}}':         etab.tel || '',
      '{{site_etab}}':        etab.site || '',
    });
  };

  const genererBatch = async () => {
    const valides = lignes.filter(l => l.nom && l.section_code);
    if (valides.length === 0) { alert('Aucune ligne valide (nom + section requis)'); return; }
    setGenerating(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const l of valides) {
        const html = genererHtml(l);
        zip.file(`Attestation_${l.nom}_${l.prenom}.html`, html);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Attestations_${annee.replace('/', '-')}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Erreur : ' + e.message); }
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
    { label: 'Section *',       key: 'section_code',     w: 'w-52', options: optionsSections },
    { label: 'Mention',         key: 'mention',          w: 'w-36', options: MENTIONS.map(m => ({ value: m, label: m })) },
    { label: 'Date délibération', key: 'date_deliberation', w: 'w-36' },
  ];

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-title text-iip-gold">Attestations de réussite</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Année : <strong>{annee}</strong> · {lignes.filter(l => l.nom && l.section_code).length} attestation(s) prête(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={ajouterLigne}
            className="flex items-center gap-1.5 bg-green-600 text-white text-sm px-3 py-1.5 rounded-lg hover:opacity-90">
            <IconPlus size={15}/> Ajouter une ligne
          </button>
          <button onClick={genererBatch} disabled={generating}
            className="flex items-center gap-1.5 bg-iip-blue text-white text-sm px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40 font-medium">
            <IconDownload size={15}/> {generating ? 'Génération…' : 'Générer toutes les attestations (ZIP)'}
          </button>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {COLS.map(c => (
                  <th key={c.key} className={`text-left px-2 py-2 font-semibold text-gray-500 ${c.w}`}>{c.label}</th>
                ))}
                <th className="px-2 py-2 text-gray-500 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lignes.map((l, idx) => (
                <tr key={l.id} className={idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'}>
                  {COLS.map(c => (
                    <td key={c.key} className={`px-2 py-1 ${c.w}`}>
                      <Cell value={l[c.key]} onChange={v => majLigne(l.id, c.key, v)} options={c.options} placeholder={c.placeholder} />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <button onClick={() => l.nom && l.section_code && setPreview({ html: genererHtml(l), nom: `Attestation_${l.nom}_${l.prenom}` })}
                        title="Prévisualiser" disabled={!l.nom || !l.section_code}
                        className="text-iip-turquoise hover:opacity-70 disabled:opacity-30 p-0.5">
                        <IconEye size={14}/>
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
              ))}
            </tbody>
          </table>
        </div>

        {/* UE déterminantes et intégrée — panneau sous le tableau */}
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
            UE déterminantes & UE intégrée — saisie par étudiant·e sélectionné·e
          </div>
          <div className="flex gap-2 items-center mb-2 flex-wrap">
            {lignes.filter(l => l.nom).map(l => (
              <button key={l.id}
                onClick={() => setPreview({ html: genererHtml(l), nom: `UE_${l.nom}`, ueMode: l.id })}
                className="text-xs bg-white border border-gray-300 hover:border-iip-turquoise rounded px-2 py-0.5 text-gray-600">
                {l.prenom} {l.nom}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {lignes.filter(l => l.nom).map(l => (
              <div key={l.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-iip-blue">{l.prenom} {l.nom.toUpperCase()}</div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">UE déterminante(s) — une par ligne (ex: UE 101 Anatomie — 15/20)</div>
                  <textarea value={l.ue_determinantes} onChange={e => majLigne(l.id, 'ue_determinantes', e.target.value)}
                    rows={3} placeholder={"UE 101 Anatomie et physiologie — 15/20\nUE 102 Soins infirmiers — 17/20"}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-iip-turquoise font-mono" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">UE intégrée — une par ligne</div>
                  <textarea value={l.ue_integree} onChange={e => majLigne(l.id, 'ue_integree', e.target.value)}
                    rows={2} placeholder="UE 200 Projet intégré — 16/20"
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-iip-turquoise font-mono" />
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}

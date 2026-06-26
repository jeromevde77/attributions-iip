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
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: white; }
  @media print { @page { size: A4 portrait; margin: 15mm 20mm; } }
  .page { max-width: 170mm; margin: 0 auto; padding: 6mm 0; min-height: 257mm; display: flex; flex-direction: column; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; }
  .logo-placeholder { width: 35mm; height: 16mm; display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #999; border: 0.5pt solid #ddd; border-radius: 2pt; text-align: center; padding: 2mm; }
  .logo-pole { font-size: 8pt; font-weight: bold; text-align: center; line-height: 1.4; color: #1a1a1a; letter-spacing: 0.5pt; }
  .institutionnel { text-align: center; margin-bottom: 7mm; }
  .institutionnel p { font-size: 10pt; font-weight: bold; letter-spacing: 0.5pt; margin-bottom: 2mm; }
  .etab-bloc { margin-bottom: 7mm; }
  .etab-bloc .etab-nom { font-weight: bold; }
  .etab-bloc p { font-size: 9pt; line-height: 1.5; }
  .encadre { border: 1pt solid #1a1a1a; padding: 3.5mm 8mm; text-align: center; margin-bottom: 7mm; }
  .encadre p { font-size: 10pt; font-weight: bold; }
  .corps { flex: 1; }
  .corps p { font-size: 10pt; line-height: 1.75; margin-bottom: 1.5mm; }
  .ue-bloc { margin: 3mm 0 3mm 6mm; }
  .ue-ligne { font-size: 9.5pt; line-height: 1.5; display: flex; gap: 4mm; }
  .ue-code { font-weight: bold; min-width: 12mm; }
  .signatures { margin-top: 8mm; display: flex; justify-content: space-between; }
  .sig-droite { text-align: center; }
  .sig-droite .lieu-date { margin-bottom: 10mm; font-size: 9.5pt; }
  .footer { margin-top: auto; padding-top: 3mm; border-top: 0.5pt solid #ccc; font-size: 7pt; color: #444; text-align: center; line-height: 1.4; }
</style>
</head><body><div class="page">
  <div class="header">
    <div class="logo-placeholder">LOGO<br>Institut Ilya Prigogine</div>
    <div class="logo-pole"><span>PÔLE</span><br><span>ACADÉMIQUE</span><br><span>DE BRUXELLES</span></div>
  </div>
  <div class="institutionnel">
    <p>COMMUNAUTE FRANCAISE DE BELGIQUE</p>
    <p>ENSEIGNEMENT DE PROMOTION SOCIALE</p>
    <p>ANNEE ACADEMIQUE : {{annee}}</p>
  </div>
  <div class="etab-bloc">
    <p class="etab-nom">{{nom_etab}}</p>
    <p>Adresse : {{adresse_etab}}</p>
    <p>Numéro de matricule : {{matricule_etab}}</p>
    <p>Numéro FASE : {{fase_etab}}</p>
  </div>
  <div class="encadre"><p>Attestation provisoire</p></div>
  <div class="corps">
    <p>Je soussigné, {{directeur}} Directeur de l'établissement, certifie que</p>
    <p><strong>{{nom_etudiant}} {{prenom_etudiant}}({{genre}})</strong><br>
    Né·e à <strong>{{lieu_naissance}}</strong>, le <strong>{{date_naissance}}</strong>,</p>
    <p>a obtenu ce jour le <strong>DIPLÔME DE {{intitule_diplome}}</strong></p>
    <p>Avec la mention <strong>{{mention}}</strong></p>
    <p>à l'issue de la section <strong>{{intitule_section}}</strong></p>
    <p>approuvée par le Gouvernement sous le numéro de code : <strong>{{code_section}}</strong></p>
    <p>Ladite section comporte {{total_periodes}} périodes / {{total_ects}} ECTS.</p>
    {{bloc_ue_det}}
    {{bloc_ue_int}}
    <p>Le diplôme de l'intéressé·e est actuellement soumis à la signature de l'autorité compétente.</p>
  </div>
  <div class="signatures">
    <div><p>Sceau de l'établissement</p></div>
    <div class="sig-droite">
      <p class="lieu-date">Fait à {{ville_etab}},<br>le {{date_deliberation}}</p>
      <p>Le Directeur,<br><strong>{{directeur}}</strong></p>
    </div>
  </div>
  <div class="footer">Institut Supérieur de Promotion Sociale Libre Ilya Prigogine • PO Asbl Ilya Prigogine • Matricule N° {{matricule_etab}} • Fase {{fase_etab}}<br>{{adresse_etab}} • T. {{tel_etab}} • {{site_etab}}</div>
</div></body></html>`;
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

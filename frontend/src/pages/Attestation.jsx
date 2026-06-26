import { useState, useRef } from 'react';
import PreviewModal from '../components/PreviewModal.jsx';

/* ── Template HTML attestation provisoire ───────────────────────────────────── */
export function genererTemplateAttestation() {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<title>Attestation provisoire</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a1a1a; background: white; }
  @media print { @page { size: A4 portrait; margin: 15mm 20mm; } }
  .page { max-width: 170mm; margin: 0 auto; padding: 8mm 0; min-height: 257mm; display: flex; flex-direction: column; }

  /* En-tête avec logos */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; }
  .logo-left img, .logo-right img { height: 18mm; }
  .logo-left { display: flex; align-items: center; }
  .logo-right { display: flex; align-items: center; }
  .logo-placeholder { width: 35mm; height: 18mm; display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #999; border: 0.5pt solid #ddd; border-radius: 2pt; text-align: center; padding: 2mm; }
  .logo-pole { font-size: 8pt; font-weight: bold; text-align: center; line-height: 1.3; color: #1a1a1a; letter-spacing: 0.5pt; }
  .logo-pole span { display: block; }

  /* Bloc institutionnel */
  .institutionnel { text-align: center; margin-bottom: 8mm; }
  .institutionnel p { font-size: 10pt; font-weight: bold; letter-spacing: 0.5pt; margin-bottom: 2mm; }
  .institutionnel .annee { font-size: 10pt; font-weight: bold; }

  /* Infos établissement */
  .etab-bloc { margin-bottom: 8mm; }
  .etab-bloc .etab-nom { font-weight: bold; font-size: 10pt; }
  .etab-bloc p { font-size: 9pt; line-height: 1.5; }

  /* Encadré attestation */
  .encadre { border: 1pt solid #1a1a1a; padding: 4mm 8mm; text-align: center; margin-bottom: 8mm; }
  .encadre p { font-size: 10pt; font-weight: bold; }

  /* Corps */
  .corps { flex: 1; }
  .corps p { font-size: 10pt; line-height: 1.7; margin-bottom: 2mm; }
  .corps .nom-etudiant { font-weight: bold; font-size: 10pt; }
  .corps .naissance { font-size: 10pt; }
  .corps .diplome { font-weight: bold; font-size: 10pt; text-transform: uppercase; }
  .corps .mention { font-weight: bold; }
  .corps .section-nom { font-weight: bold; }
  .corps .code-section { font-weight: bold; }

  /* Signatures */
  .signatures { margin-top: 10mm; display: flex; justify-content: space-between; align-items: flex-start; }
  .sig-gauche, .sig-droite { text-align: center; }
  .sig-gauche p, .sig-droite p { font-size: 9.5pt; margin-bottom: 1mm; }
  .sig-droite .lieu-date { margin-bottom: 12mm; }
  .sig-droite .directeur { margin-top: 2mm; }

  /* Pied de page */
  .footer { margin-top: auto; padding-top: 4mm; border-top: 0.5pt solid #ccc; font-size: 7pt; color: #444; text-align: center; line-height: 1.4; }
</style>
</head><body><div class="page">

  <!-- En-tête logos -->
  <div class="header">
    <div class="logo-left">
      <div class="logo-placeholder">LOGO<br>Institut Ilya Prigogine</div>
    </div>
    <div class="logo-right">
      <div class="logo-pole">
        <span>PÔLE</span>
        <span>ACADÉMIQUE</span>
        <span>DE BRUXELLES</span>
      </div>
    </div>
  </div>

  <!-- Bloc institutionnel -->
  <div class="institutionnel">
    <p>COMMUNAUTE FRANCAISE DE BELGIQUE</p>
    <p>ENSEIGNEMENT DE PROMOTION SOCIALE</p>
    <p class="annee">ANNEE ACADEMIQUE : {{annee}}</p>
  </div>

  <!-- Établissement -->
  <div class="etab-bloc">
    <p class="etab-nom">{{nom_etab}}</p>
    <p>Adresse : {{adresse_etab}}</p>
    <p>Numéro de matricule : {{matricule_etab}}</p>
    <p>Numéro FASE : {{fase_etab}}</p>
  </div>

  <!-- Encadré -->
  <div class="encadre">
    <p>Attestation provisoire</p>
  </div>

  <!-- Corps -->
  <div class="corps">
    <p>Je soussigné, {{directeur}} Directeur de l'établissement, certifie que</p>

    <p>
      <span class="nom-etudiant">{{nom_etudiant}} {{prenom_etudiant}}({{genre}})</span><br>
      <span class="naissance">Né·e à <strong>{{lieu_naissance}}</strong>, le <strong>{{date_naissance}}</strong>,</span>
    </p>

    <p>a obtenu ce jour le <span class="diplome">DIPLÔME DE {{intitule_diplome}}</span></p>

    <p>Avec la mention <span class="mention">{{mention}}</span></p>

    <p>à l'issue de la section <span class="section-nom">{{intitule_section}}</span></p>

    <p>approuvée par le Gouvernement sous le numéro de code : <span class="code-section">{{code_section}}</span></p>

    <p>Ladite section comporte {{total_periodes}} périodes/ {{total_ects}} ECTS.</p>

    <p>Le diplôme de l'intéressé·e est actuellement soumis à la signature de l'autorité compétente.</p>
  </div>

  <!-- Signatures -->
  <div class="signatures">
    <div class="sig-gauche">
      <p>Sceau de l'établissement</p>
    </div>
    <div class="sig-droite">
      <p class="lieu-date">Fait à {{ville_etab}},<br>le {{date_deliberation}}</p>
      <p>Le Directeur,</p>
      <p class="directeur">{{directeur}}</p>
    </div>
  </div>

  <!-- Pied de page -->
  <div class="footer">
    Institut Supérieur de Promotion Sociale Libre Ilya Prigogine • PO Asbl Ilya Prigogine • Matricule N° {{matricule_etab}} • Fase {{fase_etab}}<br>
    {{adresse_etab}}<br>
    T. {{tel_etab}} • {{site_etab}}
  </div>

</div></body></html>`;
}

/* ── Variables disponibles ───────────────────────────────────────────────────── */
const VARS_ATTESTATION = [
  { v: '{{nom_etudiant}}',    desc: 'Nom de l\'étudiant·e' },
  { v: '{{prenom_etudiant}}', desc: 'Prénom' },
  { v: '{{genre}}',           desc: 'F ou M' },
  { v: '{{lieu_naissance}}',  desc: 'Lieu de naissance' },
  { v: '{{date_naissance}}',  desc: 'Date de naissance' },
  { v: '{{intitule_diplome}}',desc: 'Intitulé du diplôme' },
  { v: '{{mention}}',         desc: 'Satisfaction / Distinction / Grande distinction' },
  { v: '{{intitule_section}}',desc: 'Nom de la section' },
  { v: '{{code_section}}',    desc: 'Code Gouvernement de la section' },
  { v: '{{total_periodes}}',  desc: 'Total périodes de la section' },
  { v: '{{total_ects}}',      desc: 'Total ECTS' },
  { v: '{{date_deliberation}}',desc: 'Date de délibération' },
  { v: '{{annee}}',           desc: 'Année académique' },
  { v: '{{directeur}}',       desc: 'Nom du directeur' },
  { v: '{{nom_etab}}',        desc: 'Nom établissement' },
  { v: '{{adresse_etab}}',    desc: 'Adresse établissement' },
  { v: '{{matricule_etab}}',  desc: 'N° matricule établissement' },
  { v: '{{fase_etab}}',       desc: 'N° FASE' },
  { v: '{{ville_etab}}',      desc: 'Ville établissement' },
  { v: '{{tel_etab}}',        desc: 'Téléphone' },
  { v: '{{site_etab}}',       desc: 'Site web' },
];

const MENTIONS = ['Satisfaction', 'Distinction', 'Grande distinction'];

/* ── Sections disponibles (à adapter) ───────────────────────────────────────── */
const SECTIONS_DIPLOME = [
  { code: '914300S34D3', section: 'BACHELIER EN OPTOMETRIE',       diplome: 'BACHELIER EN OPTOMETRIE',       periodes: 2550, ects: 180 },
  { code: '914300S33D3', section: 'BACHELIER EN SOINS INFIRMIERS', diplome: 'BACHELIER EN SOINS INFIRMIERS', periodes: 2880, ects: 180 },
  { code: '914300S35D3', section: 'BACHELIER EN PSYCHOMOTRICITE',  diplome: 'BACHELIER EN PSYCHOMOTRICITE',  periodes: 2550, ects: 180 },
  { code: 'AUTRE',       section: 'Autre (saisie manuelle)',        diplome: '',                              periodes: 0,    ects: 0    },
];

function remplaceVars(template, vars) {
  let html = template;
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(k).join(v || '');
  }
  return html;
}

/* ── Composant principal ─────────────────────────────────────────────────────── */
export default function Attestation() {
  const tok = () => localStorage.getItem('token');
  const af  = (url) => fetch(url, { headers: { Authorization:`Bearer ${tok()}` } }).then(r => r.json());

  const [sectionsDispo, setSectionsDispo] = useState([]);
  const [etabConfig, setEtabConfig]       = useState(null);

  useEffect(() => {
    af('/api/config/attestation_sections').then(d => {
      try { setSectionsDispo(JSON.parse(d.valeur)); } catch { setSectionsDispo([]); }
    });
    af('/api/config/attestation_etab').then(d => {
      try {
        const e = JSON.parse(d.valeur);
        setEtabConfig(e);
        setEtab(e);
        setForm(f => ({ ...f, directeur: e.directeur || 'SOHET Charles' }));
        setAnnee(localStorage.getItem('annee_active') || '2025/2026');
      } catch {}
    });
  }, []);

  const [form, setForm] = useState({
    nom: '', prenom: '', genre: 'F',
    lieu_naissance: '', date_naissance: '',
    section_key: '914300S34D3',
    intitule_diplome: 'BACHELIER EN OPTOMETRIE',
    intitule_section: 'BACHELIER EN OPTOMETRIE',
    code_section: '914300S34D3',
    total_periodes: '2550', total_ects: '180',
    mention: 'Distinction',
    date_deliberation: new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }),
    directeur: 'SOHET Charles',
  });

  const [preview, setPreview] = useState(null);
  const [etab, setEtab] = useState({
    nom: 'INSTITUT ILYA PRIGOGINE',
    adresse: 'Campus Erasme, Bât. P, route de Lennik 808 - 1070 Anderlecht',
    matricule: '2.132.070',
    fase: '292',
    ville: 'Anderlecht',
    tel: '+ 32 (0)2 560 29 59',
    site: 'www.institut-prigogine.be',
  });
  const [annee, setAnnee] = useState(localStorage.getItem('annee_active') || '2025/2026');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectionnerSection = (code) => {
    const s = sectionsDispo.find(s => s.code === code);
    if (s) {
      setForm(f => ({
        ...f, section_key: code,
        intitule_diplome: s.diplome,
        intitule_section: s.section,
        code_section: s.code,
        total_periodes: String(s.periodes),
        total_ects: String(s.ects),
      }));
    } else {
      set('section_key', 'AUTRE');
    }
  };

  const generer = () => {
    const template = genererTemplateAttestation();
    const vars = {
      '{{nom_etudiant}}':     form.nom.toUpperCase(),
      '{{prenom_etudiant}}':  form.prenom,
      '{{genre}}':            form.genre,
      '{{lieu_naissance}}':   form.lieu_naissance,
      '{{date_naissance}}':   form.date_naissance,
      '{{intitule_diplome}}': form.intitule_diplome,
      '{{mention}}':          form.mention,
      '{{intitule_section}}': form.intitule_section,
      '{{code_section}}':     form.code_section,
      '{{total_periodes}}':   form.total_periodes,
      '{{total_ects}}':       form.total_ects,
      '{{date_deliberation}}':form.date_deliberation,
      '{{annee}}':            annee.replace('-', '/'),
      '{{directeur}}':        form.directeur,
      '{{nom_etab}}':         etab.nom,
      '{{adresse_etab}}':     etab.adresse,
      '{{matricule_etab}}':   etab.matricule,
      '{{fase_etab}}':        etab.fase,
      '{{ville_etab}}':       etab.ville,
      '{{tel_etab}}':         etab.tel,
      '{{site_etab}}':        etab.site,
    };
    setPreview({ html: remplaceVars(template, vars), nom: `Attestation_${form.nom}_${form.prenom}` });
  };

  const F = ({ label, children, full }) => (
    <div className={full ? 'col-span-2' : ''}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
  const inp = (k, placeholder = '') => (
    <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9 focus:border-iip-turquoise focus:outline-none" />
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-title text-iip-gold">Attestation de réussite</h1>
          <p className="text-sm text-gray-500 mt-0.5">Génère une attestation provisoire pour un·e étudiant·e</p>
        </div>
        <button onClick={generer}
          className="flex items-center gap-2 bg-iip-blue text-white px-4 py-2 rounded-xl font-medium text-sm hover:opacity-90">
          👁 Prévisualiser
        </button>
      </div>

      {/* Étudiant·e */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Étudiant·e</div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Nom *">{inp('nom', 'MSIMAR')}</F>
          <F label="Prénom *">{inp('prenom', 'Aya')}</F>
          <F label="Genre">
            <select value={form.genre} onChange={e => set('genre', e.target.value)}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9 bg-white">
              <option value="F">F — Féminin</option>
              <option value="M">M — Masculin</option>
              <option value="X">X — Neutre</option>
            </select>
          </F>
          <F label="Lieu de naissance">{inp('lieu_naissance', 'Anderlecht')}</F>
          <F label="Date de naissance" full>
            <input value={form.date_naissance} onChange={e => set('date_naissance', e.target.value)}
              placeholder="ex: 26 décembre 2002"
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9 focus:border-iip-turquoise focus:outline-none" />
          </F>
        </div>
      </div>

      {/* Section & diplôme */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Section & Diplôme</div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Section" full>
            <select value={form.section_key} onChange={e => selectionnerSection(e.target.value)}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9 bg-white">
              {sectionsDispo.map(s => <option key={s.code} value={s.code}>{s.section}</option>)}
              <option value="AUTRE">Autre (saisie manuelle)</option>
            </select>
          </F>
          {form.section_key === 'AUTRE' && <>
            <F label="Intitulé du diplôme" full>{inp('intitule_diplome')}</F>
            <F label="Intitulé de la section" full>{inp('intitule_section')}</F>
            <F label="Code section">{inp('code_section')}</F>
            <F label="N° entreprise">{inp('num_entreprise')}</F>
            <F label="Total périodes">{inp('total_periodes')}</F>
            <F label="Total ECTS">{inp('total_ects')}</F>
          </>}
          <F label="Mention *">
            <select value={form.mention} onChange={e => set('mention', e.target.value)}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9 bg-white">
              {MENTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </F>
          <F label="Date de délibération">{inp('date_deliberation', 'ex: 26 juin 2026')}</F>
        </div>
      </div>

      {/* Établissement */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Établissement</div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Directeur">{inp('directeur')}</F>
          <F label="Année académique">
            <input value={annee} onChange={e => setAnnee(e.target.value)}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9" />
          </F>
          <F label="Nom établissement" full>
            <input value={etab.nom} onChange={e => setEtab(et => ({ ...et, nom: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9" />
          </F>
          <F label="Adresse" full>
            <input value={etab.adresse} onChange={e => setEtab(et => ({ ...et, adresse: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9" />
          </F>
          <F label="N° matricule">{<input value={etab.matricule} onChange={e => setEtab(et => ({ ...et, matricule: e.target.value }))} className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9" />}</F>
          <F label="N° FASE">{<input value={etab.fase} onChange={e => setEtab(et => ({ ...et, fase: e.target.value }))} className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9" />}</F>
        </div>
      </div>

      <button onClick={generer}
        className="w-full flex items-center justify-center gap-2 bg-iip-blue text-white py-3 rounded-xl font-semibold text-sm hover:opacity-90">
        👁 Prévisualiser l'attestation
      </button>

      {preview && (
        <PreviewModal
          html={preview.html}
          titre={`${form.prenom} ${form.nom.toUpperCase()}`}
          sousTitre={`Attestation provisoire · ${annee}`}
          nomFichier={preview.nom}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

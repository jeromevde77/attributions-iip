import { useEffect, useState, useMemo, useRef } from 'react';
import {
  IconBriefcase, IconUserPlus, IconArrowLeft, IconTrash, IconPlus,
  IconFileCv, IconExternalLink, IconUpload, IconSparkles,
  IconCheck, IconX, IconUsersGroup, IconDownload, IconClipboardText,
  IconLayoutColumns, IconChevronRight, IconSettings, IconFileText,
} from '@tabler/icons-react';
import { Btn, RailLateral } from '../components/ui.jsx';
import { getAnnee } from '../lib/api.js';

const tok = () => localStorage.getItem('token');
const af = (url, opts = {}) =>
  fetch('/api/recrutement' + url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...(opts.headers || {}) },
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });

const STATUT = {
  a_voir:    { label: 'À voir',    color: '#6b7280', bg: '#f3f4f6' },
  entretien: { label: 'Entretien', color: '#0369a1', bg: '#e0f2fe' },
  retenu:    { label: 'Retenu',    color: '#15803d', bg: '#dcfce7' },
  ecarte:    { label: 'Écarté',    color: '#b91c1c', bg: '#fee2e2' },
};



// ── Référentiels FWB ──────────────────────────────────────────────────────────
const NIVEAUX_ETUDE = [
  { val: 'CESS',     label: "CESS — Certificat d'enseignement secondaire supérieur (CFC 4)" },
  { val: 'BES',      label: "Brevet de l'enseignement secondaire supérieur — section infirmière (CFC 5)" },
  { val: 'BES_PLUS', label: "Brevet de l'enseignement supérieur (CFC 5+)" },
  { val: 'BAC',      label: "Bachelier (CFC 6)" },
  { val: 'MASTER',   label: "Master (CFC 7)" },
  { val: 'DOCTORAT', label: "Doctorat (CFC 8)" },
];

const TITRES_PEDA = [
  { val: 'AESI',   label: "AESI — Agrégé·e de l'enseignement secondaire inférieur" },
  { val: 'AESS',   label: "AESS — Agrégé·e de l'enseignement secondaire supérieur" },
  { val: 'CAP',    label: "CAP — Certificat d'aptitude pédagogique" },
  { val: 'CAPAES', label: "CAPAES — Certificat d'aptitude pédagogique pour l'enseignement supérieur" },
  { val: 'AUCUN',  label: "Aucun titre pédagogique" },
];

const DIPLOMES_FWB = {
  CESS: [
    { val: 'CESS_GEN',  label: "CESS — Humanités générales" },
    { val: 'CESS_TECH', label: "CESS — Humanités techniques et de transition" },
    { val: 'CESS_PROF', label: "CESS — Humanités techniques et de qualification / professionnelles" },
    { val: 'CESS_ART',  label: "CESS — Humanités artistiques" },
    { val: 'CESS_JURY', label: "CESS — Jury de la Fédération Wallonie-Bruxelles" },
  ],
  BES: [
    { val: 'BES_INF_HOS',  label: "Brevet d'infirmier·ère hospitalier·ère" },
    { val: 'BES_INF_COM',  label: "Brevet d'infirmier·ère en santé communautaire" },
    { val: 'BES_INF_PEDIA',label: "Brevet d'infirmier·ère pédiatrique" },
    { val: 'BES_AIDE_ACC', label: "Brevet d'aide-accoucheur·se" },
  ],
  BES_PLUS: [
    { val: 'BREV_SUP', label: "Brevet d'enseignement supérieur" },
  ],
  BAC: [
    { val: 'BAC_INF',        label: "Bachelier en soins infirmiers" },
    { val: 'BAC_SAGE_F',     label: "Bachelier en sciences et pratiques de la naissance (sage-femme)" },
    { val: 'BAC_KINE',       label: "Bachelier en kinésithérapie" },
    { val: 'BAC_LOGO',       label: "Bachelier en logopédie" },
    { val: 'BAC_ERGO',       label: "Bachelier en ergothérapie" },
    { val: 'BAC_DIETET',     label: "Bachelier en diététique" },
    { val: 'BAC_PODOL',      label: "Bachelier en podologie-podiatrie" },
    { val: 'BAC_AUDIO',      label: "Bachelier en audiologie" },
    { val: 'BAC_OPTIC',      label: "Bachelier en optique et optométrie" },
    { val: 'BAC_ORTHO',      label: "Bachelier en orthoptie" },
    { val: 'BAC_IMAG',       label: "Bachelier en technologie des soins d'imagerie médicale" },
    { val: 'BAC_ANEST',      label: "Bachelier en anesthésie et soins intensifs" },
    { val: 'BAC_PSYCH_MOT',  label: "Bachelier en psychomotricité" },
    { val: 'BAC_AIDE_PHARM', label: "Bachelier en assistance pharmaceutique" },
    { val: 'BAC_LABO',       label: "Bachelier en technologie de laboratoire médical" },
    { val: 'BAC_ORTHO_PR',   label: "Bachelier en orthopédie et prothèse" },
    { val: 'BAC_EDUC_SP',    label: "Bachelier en éducation spécialisée" },
    { val: 'BAC_AS',         label: "Bachelier en travail social / assistant·e social·e" },
    { val: 'BAC_PSYCHO',     label: "Bachelier en psychologie" },
    { val: 'BAC_BIO',        label: "Bachelier en biologie" },
    { val: 'BAC_CHIM',       label: "Bachelier en chimie" },
    { val: 'BAC_INFO',       label: "Bachelier en informatique" },
    { val: 'BAC_ING',        label: "Bachelier en ingénierie industrielle" },
    { val: 'BAC_ENS_PRIM',   label: "Bachelier — Instituteur·rice primaire" },
    { val: 'BAC_ENS_MAT',    label: "Bachelier — Instituteur·rice maternel·le" },
    { val: 'BAC_ENS_SEC',    label: "Bachelier — Enseignant du secondaire inférieur (AESI)" },
    { val: 'BAC_DROIT',      label: "Bachelier en droit" },
    { val: 'BAC_GEST',       label: "Bachelier en gestion" },
    { val: 'BAC_MED_1',      label: "Bachelier en médecine (1er cycle BAMA)" },
    { val: 'BAC_PHARM_1',    label: "Bachelier en pharmacie (1er cycle)" },
  ],
  MASTER: [
    { val: 'MAST_MED',       label: "Master en médecine (Docteur en médecine)" },
    { val: 'MAST_PHARM',     label: "Master en sciences pharmaceutiques" },
    { val: 'MAST_DENT',      label: "Master en médecine dentaire" },
    { val: 'MAST_KINE',      label: "Master en kinésithérapie" },
    { val: 'MAST_SANTE_PUB', label: "Master en sciences de la santé publique" },
    { val: 'MAST_PSYCH',     label: "Master en psychologie" },
    { val: 'MAST_NEUROSCI',  label: "Master en neurosciences" },
    { val: 'MAST_BIOMED',    label: "Master en sciences biomédicales" },
    { val: 'MAST_BIO',       label: "Master en biochimie et biologie moléculaire" },
    { val: 'MAST_MOTRIC',    label: "Master en sciences de la motricité" },
    { val: 'MAST_LOGO',      label: "Master en logopédie (université)" },
    { val: 'MAST_SS',        label: "Master en sciences sociales et du travail" },
    { val: 'MAST_EDUC',      label: "Master en sciences de l'éducation" },
    { val: 'MAST_CRIM',      label: "Master en criminologie" },
    { val: 'MAST_SOCIO',     label: "Master en sociologie" },
    { val: 'MAST_AESS',      label: "Master — AESS (Agrégé enseignement secondaire supérieur)" },
    { val: 'MAST_INFO',      label: "Master en sciences informatiques" },
    { val: 'MAST_ING',       label: "Master ingénieur civil / industriel" },
    { val: 'MAST_CHIM',      label: "Master en chimie" },
    { val: 'MAST_DROIT',     label: "Master en droit" },
    { val: 'MAST_GEST',      label: "Master en sciences de gestion" },
    { val: 'MAST_COMM',      label: "Master en information et communication" },
  ],
  DOCTORAT: [
    { val: 'DOC_MED',   label: "Doctorat en sciences médicales" },
    { val: 'DOC_PHARM', label: "Doctorat en sciences pharmaceutiques" },
    { val: 'DOC_PSYCH', label: "Doctorat en psychologie" },
    { val: 'DOC_EDUC',  label: "Doctorat en sciences de l'éducation" },
    { val: 'DOC_SCI',   label: "Doctorat en sciences" },
    { val: 'DOC_AUTRE', label: "Autre doctorat" },
  ],
};


const DOCS_REMIS_LIST = [
  { key: 'cv',            label: 'CV',                                    emoji: '📄' },
  { key: 'lettre',        label: 'Lettre de motivation',                  emoji: '✉️'  },
  { key: 'diplomes',      label: 'Copie du/des diplôme(s)',               emoji: '🎓' },
  { key: 'titre_peda',    label: 'Titre pédagogique (AESI/AESS/CAP…)',    emoji: '📋' },
  { key: 'casier',        label: 'Extrait de casier judiciaire (mod. 2)', emoji: '⚖️'  },
  { key: 'anciennete',    label: "Attestation d'ancienneté barémique",   emoji: '📅' },
  { key: 'declaration',   label: 'Déclaration de candidature signée',     emoji: '✍️'  },
];


export default function Recrutement() {
  const [postes, setPostes]     = useState([]);
  const [poste, setPoste]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [filtre, setFiltre]     = useState('');
  const [vue, setVue]           = useState('candidats');
  const [nouveauGlobal, setNouveauGlobal] = useState(false);
  const [rapportPDF, setRapportPDF]       = useState(false);
  const [grille, setGrille]     = useState(null);
  const [candidats, setCandidats] = useState([]);
  const [fonctions, setFonctions] = useState([]);
  const annee = getAnnee();

  const charger          = () => { setLoading(true); af(`/postes?annee=${encodeURIComponent(annee)}`).then(setPostes).catch(e => setErr(e.message)).finally(() => setLoading(false)); };
  const chargerGrille    = () => af('/grille').then(setGrille).catch(() => {});
  const chargerCandidats = () => af('/candidats').then(setCandidats).catch(() => {});
  const chargerFonctions = () => af('/fonctions').then(setFonctions).catch(() => {});

  useEffect(() => { charger(); chargerGrille(); chargerCandidats(); chargerFonctions(); }, []);

  const sections = [...new Set(postes.map(p => p.section).filter(Boolean))].sort();
  const postesFiltres = filtre ? postes.filter(p => p.section === filtre) : postes;

  // Vue détail
  if (poste) return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral icon={IconBriefcase} titre="Recrutement" sousTitre={poste.nom_cours || poste.ue_nom}
        sections={[{ label: '', items: [
          { key: 'back', label: '← Retour à la liste', icon: IconArrowLeft,
            actif: false, onClick: () => { setPoste(null); charger(); } },
        ]}]}
      />
      <div className="ml-16 p-4 md:p-6">
        <FichePoste poste={poste} annee={annee} onBack={() => { setPoste(null); charger(); }} grille={grille} />
      </div>
    </div>
  );

  // Vue liste
  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral
        icon={IconBriefcase} titre="Recrutement"
        sousTitre={loading ? '…' : `${candidats.length} candidat${candidats.length > 1 ? 's' : ''}`}
        sections={[
          { label: 'Vue', items: [
            { key: 'candidats', label: `Candidats (${candidats.length})`, icon: IconUsersGroup, actif: vue === 'candidats', onClick: () => setVue('candidats') },
            { key: 'postes',    label: 'Cours à pourvoir',    icon: IconBriefcase,     actif: vue === 'postes',    onClick: () => setVue('postes') },
            { key: 'parallele', label: 'Vue parallèle',       icon: IconLayoutColumns, actif: vue === 'parallele', onClick: () => setVue('parallele') },
            { key: 'grille',    label: 'Grille entretien',    icon: IconClipboardText, actif: vue === 'grille',    onClick: () => setVue('grille') },
          ]},
          { label: 'Actions', items: [
            { key: 'nouveau',   label: 'Nouveau candidat',    icon: IconUserPlus,      actif: false, couleur: '#00AACC', onClick: () => setNouveauGlobal(true) },
            { key: 'rapport',   label: 'Rapport PDF',         icon: IconFileText,      actif: false, onClick: () => setRapportPDF(true) },
          ]},
          { label: 'Section', items: [
            { key: 'all', label: 'Toutes', icon: IconBriefcase, actif: filtre === '', onClick: () => setFiltre('') },
            ...sections.map(s => ({
              key: s, label: s, icon: IconBriefcase, actif: filtre === s, onClick: () => setFiltre(s),
            })),
          ]},
        ]}
      />
      <div className="ml-16 p-4 md:p-6">

        {vue === 'grille' && <EditeurGrille grille={grille} onSaved={chargerGrille} />}
        {vue === 'candidats' && <VueCandidatsGlobal
          candidats={candidats} fonctions={fonctions} grille={grille}
          onRecharger={() => { chargerCandidats(); chargerFonctions(); }}
          nouveauOpen={nouveauGlobal} onNouveauClose={() => setNouveauGlobal(false)}
          rapportOpen={rapportPDF}   onRapportClose={() => setRapportPDF(false)}
        />}
        {vue === 'parallele' && <VueParallele postes={postes} candidats={candidats} fonctions={fonctions} annee={annee} onRecharger={() => { charger(); chargerCandidats(); }} />}

        {vue === 'postes' && (<>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-title text-iip-gold">
            Cours à pourvoir <span className="text-base font-normal text-gray-400">({annee})</span>
          </h1>
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{err}</div>}

        {loading && <div className="text-sm text-gray-400">Chargement…</div>}

        {!loading && postesFiltres.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-16">
            Aucun cours à pourvoir pour {filtre || 'cette année'}.
          </div>
        )}

        {/* Grouper par section */}
        {Object.entries(
          postesFiltres.reduce((acc, p) => { (acc[p.section] ||= []).push(p); return acc; }, {})
        ).map(([sec, lignes]) => (
          <div key={sec} className="mb-6">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{sec}</div>
            <div className="grid gap-1.5">
              {lignes.map((p, i) => (
                <button key={i} onClick={async () => {
                    const detail = await af(`/postes/${p.ue_num}/${encodeURIComponent(p.code_cours)}/${encodeURIComponent(p.section)}?annee=${encodeURIComponent(annee)}`);
                    setPoste({ ...p, ...detail });
                  }}
                  className="text-left border border-gray-200 bg-white rounded-lg px-4 py-3 hover:border-iip-turquoise hover:shadow-sm transition flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-iip-blue flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 font-normal">UE {p.ue_num}</span>
                      {p.nom_cours || p.ue_nom}
                      {p.contrat_mdp && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                          style={{ background: p.contrat_mdp === 'HELB' ? '#8B5CF6' : '#1B2B4B' }}>
                          {p.contrat_mdp}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-3">
                      {p.ue_quad && <span>{p.ue_quad}</span>}
                      {p.ue_per_cours != null && <span>{p.ue_per_cours} pér.{p.ue_aut ? ` + ${p.ue_aut} aut.` : ''}</span>}
                      {p.ects > 0 && <span>{p.ects} ECTS</span>}
                      {p.nb_groupes > 1 && <span>{p.nb_groupes} groupes</span>}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-lg font-bold text-iip-blue">{p.nb_candidats}</div>
                    <div className="text-[10px] text-gray-400">candidat{p.nb_candidats !== 1 ? 's' : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </>)}
      </div>
    </div>
  );
}

/* ══════════════════════ FICHE POSTE ══════════════════════ */
function FichePoste({ poste, annee, onBack, grille }) {
  const [candidats, setCandidats]       = useState(poste.candidats || []);
  const [ajout, setAjout]               = useState(false);
  const [genAnnonce, setGenAnnonce]     = useState(false);
  const [onglet, setOnglet]             = useState('candidats');
  const [entretienCand, setEntretienCand] = useState(null); // candidature en cours d'entretien
  const [qIA, setQIA]                   = useState([]); // partagé grille↔entretien

  const recharger = async () => {
    const detail = await af(`/postes/${poste.ue_num}/${encodeURIComponent(poste.code_cours)}/${encodeURIComponent(poste.section)}?annee=${encodeURIComponent(annee)}`);
    setCandidats(detail.candidats || []);
  };

  const ue = poste.ue || {};
  const aa = poste.aa || [];

  return (
    <div className="max-w-4xl">
      {/* En-tête du cours */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-title text-iip-gold">{poste.nom_cours || poste.ue_nom}</h1>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-3 flex-wrap">
              <span className="font-medium text-iip-blue">UE {poste.ue_num}</span>
              <span>{poste.section}</span>
              {poste.contrat_mdp && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
                  style={{ background: poste.contrat_mdp === 'HELB' ? '#8B5CF6' : '#1B2B4B' }}>
                  {poste.contrat_mdp}
                </span>
              )}
            </div>
          </div>
          <Btn variant="secondary" icon={IconSparkles} onClick={() => setGenAnnonce(true)}>
            Générer l'annonce
          </Btn>
        </div>

        {/* Méta-données */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[
            ['Quadrimestre', poste.ue_quad || ue.ue_quad],
            ['Charge cours', poste.ue_per_cours != null ? `${poste.ue_per_cours} pér.` : null],
            ['Autonomie', poste.ue_aut ? `${poste.ue_aut} pér.` : null],
            ['ECTS', poste.ects ? `${poste.ects} ECTS` : null],
            ['Niveau', poste.bloc || ue.ue_niv],
            ['Groupes', poste.nb_groupes > 1 ? `${poste.nb_groupes} groupes` : null],
            ['Type', poste.type_cours],
            ['Référent', ue.et_ref],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
              <div className="text-sm font-medium text-gray-800 mt-0.5">{val}</div>
            </div>
          ))}
        </div>

        {/* Acquis d'apprentissage */}
        {aa.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Acquis d'apprentissage ({aa.length})
            </div>
            <ul className="space-y-1">
              {aa.map((a, i) => (
                <li key={i} className="text-sm text-gray-600 flex gap-2">
                  <span className="text-[10px] text-gray-400 font-mono mt-0.5 flex-shrink-0">{a.aa_code}</span>
                  <span>L'étudiant·e sera capable {a.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {[
          ['candidats', `Candidats (${candidats.length})`, IconUsersGroup],
          ['grille', 'Grille d\'entretien', IconClipboardText],
        ].map(([v, lbl, Icon]) => (
          <button key={v} onClick={() => setOnglet(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              onglet === v ? 'border-iip-turquoise text-iip-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={15} />{lbl}
          </button>
        ))}
      </div>

      {onglet === 'grille' && <GrilleEntretien poste={poste} annee={annee} qIA={qIA} setQIA={setQIA} grille={grille} />}

        {onglet === 'candidats' && (<>
      {/* Candidats */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-iip-blue flex items-center gap-2">
          <IconUsersGroup size={20} /> Candidats ({candidats.length})
        </h2>
        <div className="flex items-center gap-2">
          {candidats.length > 0 && (
            <button onClick={() => genererComparatif(candidats, poste, grille)}
              className="text-xs border border-gray-300 text-gray-500 hover:bg-gray-50 rounded px-2.5 py-1.5 flex items-center gap-1.5">
              🖨 Comparatif PDF
            </button>
          )}
          <Btn variant="primary" icon={IconUserPlus} onClick={() => setAjout(true)}>
            Ajouter un candidat
          </Btn>
        </div>
      </div>

      {candidats.length === 0 && !ajout && (
        <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">
          Aucun candidat pour ce cours. Cliquez "Ajouter un candidat".
        </div>
      )}

      {ajout && (
        <FormulaireCandidatIA
          annee={annee} ue_num={poste.ue_num} code_cours={poste.code_cours} section={poste.section}
          onSaved={() => { setAjout(false); recharger(); }}
          onCancel={() => setAjout(false)}
        />
      )}

      <div className="grid gap-2 mt-2">
        {candidats.map(c => (
          <CarteCandidatPoste key={c.id} candidature={c} onChange={recharger}
            onEntretien={() => setEntretienCand(c)} />
        ))}
      </div>
      </>)}

      {entretienCand && (
        <EntretienModal
          candidature={entretienCand}
          poste={poste}
          annee={annee}
          qIA={qIA}
          grille={grille}
          onClose={() => setEntretienCand(null)}
          onSaved={() => { setEntretienCand(null); recharger(); }}
        />
      )}

      {genAnnonce && (
        <ModalAnnonce poste={poste} annee={annee} onClose={() => setGenAnnonce(false)} />
      )}
    </div>
  );
}

/* ══════════════════════ FORMULAIRE CANDIDAT + EXTRACTION CV ══════════════════════ */

const telechargerDoc = async (docId, nomOriginal, blobUrl = null) => {
  try {
    let url = blobUrl;
    if (!url) {
      const resp = await fetch(`/api/recrutement/documents/${docId}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!resp.ok) throw new Error('Document introuvable');
      const blob = await resp.blob();
      url = URL.createObjectURL(blob);
    }
    const a = document.createElement('a');
    a.href = url; a.download = nomOriginal; a.click();
    if (!blobUrl) URL.revokeObjectURL(url);
  } catch (e) { alert(e.message); }
};

const TYPES_DOC = {
  cv:      { label: 'CV',                    accept: '.pdf,.doc,.docx,.jpg,.jpeg,.png' },
  lettre:  { label: 'Lettre de motivation',  accept: '.pdf,.doc,.docx' },
  diplome: { label: 'Diplôme / Certificat',  accept: '.pdf,.jpg,.jpeg,.png' },
  annexe:  { label: 'Annexe',               accept: '*' },
};

function FormulaireCandidatIA({ annee, ue_num, code_cours, section, onSaved, onCancel }) {
  const [f, setF]               = useState({ nom: '', prenom: '', email: '', telephone: '', cv_url: '', notes: '' });
  const [docs, setDocs]         = useState([]); // [{ type, file }]
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState('');

  const ajouterDoc = (type, file) => {
    setDocs(prev => [...prev, { type, file }]);
  };
  const retirerDoc = (i) => setDocs(prev => prev.filter((_, j) => j !== i));

  // Extraction IA depuis un PDF (CV prioritairement)
  const extraireCV = async (file) => {
    if (file.type !== 'application/pdf') return; // extraction seulement sur PDF
    setExtracting(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 500,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extrais du CV. JSON strict sans backticks : {"nom":"NOM (en majuscules)","prenom":"Prénom","email":"","telephone":"","notes":"profil en 1-2 phrases"}' }
          ]}]
        }),
      });
      const data = await resp.json();
      const info = JSON.parse((data.content || []).map(b => b.text || '').join('').trim());
      setF(prev => ({
        nom:       info.nom       || prev.nom,
        prenom:    info.prenom    || prev.prenom,
        email:     info.email     || prev.email,
        telephone: info.telephone || prev.telephone,
        notes:     info.notes     || prev.notes,
        cv_url:    prev.cv_url,
      }));
    } catch { /* extraction optionnelle, pas bloquante */ }
    finally { setExtracting(false); }
  };

  const soumettre = async () => {
    if (!f.nom.trim()) { setErr('Le nom est requis'); return; }
    setBusy(true); setErr('');
    try {
      const { id } = await af('/candidats', { method: 'POST',
        body: JSON.stringify({ ...f, annee, ue_num, code_cours, section }) });

      // Upload de tous les documents
      for (const { type, file } of docs) {
        const fd = new FormData();
        fd.append('fichier', file);
        await fetch(`/api/recrutement/candidats/${id}/documents?type=${type}`, {
          method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: fd,
        });
      }
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="border border-iip-turquoise/40 rounded-xl p-4 mb-4 bg-iip-turquoise/5 space-y-4">

      {/* Zone dépôt de documents par type */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TYPES_DOC).map(([type, { label, accept }]) => (
            <label key={type} className="cursor-pointer border border-dashed border-gray-300 rounded-lg px-3 py-2.5 hover:border-iip-turquoise hover:bg-white transition flex items-center gap-2">
              <IconUpload size={14} className="text-gray-400 flex-shrink-0" />
              <div>
                <div className="text-xs font-medium text-gray-700">{label}</div>
                <div className="text-[10px] text-gray-400">PDF, Word, image…</div>
              </div>
              <input type="file" accept={accept} className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                ajouterDoc(type, file);
                if (type === 'cv') extraireCV(file);
                e.target.value = '';
              }} />
            </label>
          ))}
        </div>

        {/* Liste des fichiers ajoutés */}
        {docs.length > 0 && (
          <div className="mt-2 space-y-1">
            {docs.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded px-2 py-1.5">
                <IconFileCv size={13} className="text-iip-blue flex-shrink-0" />
                <span className="text-gray-500 flex-shrink-0">{TYPES_DOC[d.type]?.label}</span>
                <span className="text-gray-700 truncate flex-1">{d.file.name}</span>
                <button onClick={() => retirerDoc(i)} className="text-gray-300 hover:text-red-500 flex-shrink-0"><IconX size={13} /></button>
              </div>
            ))}
          </div>
        )}

        {extracting && (
          <div className="flex items-center gap-1.5 text-xs text-iip-blue mt-2">
            <span className="animate-spin w-3 h-3 border-2 border-iip-blue border-t-transparent rounded-full" />
            Extraction des infos du CV…
          </div>
        )}
      </div>

      {/* Infos candidat */}
      <div className="grid grid-cols-2 gap-3">
        <Champ label="Prénom" value={f.prenom} onChange={v => setF({ ...f, prenom: v })} />
        <Champ label="Nom *" value={f.nom} onChange={v => setF({ ...f, nom: v })} />
        <Champ label="E-mail" value={f.email} onChange={v => setF({ ...f, email: v })} />
        <Champ label="Téléphone" value={f.telephone} onChange={v => setF({ ...f, telephone: v })} />
        <Champ label="Lien CV (Drive…)" value={f.cv_url} onChange={v => setF({ ...f, cv_url: v })} />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Notes / profil</div>
        <textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={2}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}
      <div className="flex gap-2 justify-end">
        <Btn variant="ghost" onClick={onCancel}>Annuler</Btn>
        <Btn variant="primary" icon={IconCheck} onClick={soumettre} disabled={busy || extracting}>
          {busy ? 'Enregistrement…' : 'Ajouter'}
        </Btn>
      </div>
    </div>
  );
}

/* ══════════════════════ CARTE CANDIDAT ══════════════════════ */
function CarteCandidatPoste({ candidature: c, onChange, onEntretien }) {
  const [open, setOpen]           = useState(false);
  const [uploading, setUploading] = useState(false);
  const [visionneur, setVisionneur] = useState(null);
  const st = STATUT[c.statut] || STATUT.a_voir;
  const docs = c.documents || [];

  const ouvrirDoc = async (docId, nomOriginal) => {
    try {
      const resp = await fetch(`/api/recrutement/documents/${docId}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!resp.ok) throw new Error('Document introuvable');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setVisionneur({ url, nom: nomOriginal, mime: blob.type });
    } catch (e) { alert(e.message); }
  };

  const supprimerCandidature = async () => {
    if (!confirm('Retirer ce candidat de ce poste ?')) return;
    await af(`/candidatures/${c.id}`, { method: 'DELETE' });
    onChange();
  };

  const majStatut = async (statut) => {
    await af(`/candidatures/${c.id}`, { method: 'PATCH', body: JSON.stringify({ statut }) });
    onChange();
  };

  const ajouterDoc = async (type, file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('fichier', file);
      await fetch(`/api/recrutement/candidats/${c.candidat_id}/documents?type=${type}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: fd,
      });
      onChange();
    } catch (e) { alert(e.message); } finally { setUploading(false); }
  };

  const supprimerDoc = async (docId) => {
    await af(`/documents/${docId}`, { method: 'DELETE' });
    onChange();
  };

  const attribuer = async () => {
    const nomAff = [c.prenom, c.nom].filter(Boolean).join(' ');
    if (!confirm(`Attribuer ${nomAff} à ce cours ?\n\nCela va :\n• Créer sa fiche dans Personnel\n• L'assigner au cours\n• Notifier la direction et les RH`)) return;
    try {
      const res = await af(`/candidatures/${c.id}/attribuer`, { method: 'POST' });
      alert(`✓ ${res.nom} a été créé dans Personnel et attribué au cours.\nNotification envoyée.`);
      onChange();
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  return (
    <div className="border border-gray-200 bg-white rounded-lg overflow-hidden">
      {/* En-tête candidat */}
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-iip-blue flex items-center gap-2">
            {c.nom}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ color: st.color, background: st.bg }}>{st.label}</span>
          </div>
          <div className="text-xs text-gray-400">{[c.email, c.telephone].filter(Boolean).join(' · ') || '—'}</div>
          {c.notes && <div className="text-xs text-gray-500 mt-0.5 italic">{c.notes}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => onEntretien && onEntretien()}
            className="text-xs border border-iip-turquoise text-iip-blue hover:bg-iip-turquoise/10 rounded px-2 py-1 h-7 flex items-center gap-1 flex-shrink-0">
            <IconClipboardText size={12} /> Entretien
          </button>
          {c.statut === 'retenu' && (
            <button onClick={attribuer}
              className="text-xs bg-green-600 hover:bg-green-700 text-white rounded px-2 py-1 h-7 flex items-center gap-1 font-semibold flex-shrink-0">
              <IconCheck size={12} /> Attribuer
            </button>
          )}
          <select value={c.statut} onChange={e => majStatut(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 h-7"
            style={{ color: st.color }}>
            {Object.entries(STATUT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => setOpen(v => !v)}
            className="text-xs text-gray-400 hover:text-iip-blue px-2 py-1 border border-gray-200 rounded">
            {open ? '▲' : `▼ Docs (${docs.length})`}
          </button>
          <button onClick={supprimerCandidature} className="text-gray-300 hover:text-red-500 p-1">
            <IconX size={15} />
          </button>
        </div>
      </div>

      {/* Section documents dépliable */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
          {/* Documents existants groupés par type */}
          {docs.length > 0 && (
            <div className="space-y-1 mb-3">
              {docs.map(d => (
                <div key={d.id} className="flex items-center gap-2 text-xs bg-white border border-gray-100 rounded px-2 py-1.5">
                  <IconFileCv size={13} className="text-iip-blue flex-shrink-0" />
                  <span className="text-gray-400 flex-shrink-0 w-20">{TYPES_DOC[d.type]?.label || d.type}</span>
                  <button onClick={() => ouvrirDoc(d.id, d.nom_original)}
                    className="text-iip-blue hover:underline truncate flex-1 text-left">{d.nom_original}</button>
                  <button onClick={() => supprimerDoc(d.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                    <IconTrash size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Ajouter des documents */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPES_DOC).map(([type, { label, accept }]) => (
              <label key={type} className="cursor-pointer text-[11px] border border-dashed border-gray-300 rounded px-2 py-1 hover:border-iip-turquoise hover:bg-white flex items-center gap-1 text-gray-500">
                <IconUpload size={11} />
                {label}
                <input type="file" accept={accept} className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) { ajouterDoc(type, file); e.target.value = ''; }
                }} />
              </label>
            ))}
            {uploading && <span className="text-[11px] text-iip-blue animate-pulse">Envoi…</span>}
          </div>
        </div>
      )}
      {/* Visionneuse inline */}
      {visionneur && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col" onClick={() => { URL.revokeObjectURL(visionneur.url); setVisionneur(null); }}>
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-sm font-medium text-iip-blue truncate">{visionneur.nom}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => telechargerDoc(null, visionneur.nom, visionneur.url)}
                className="text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 flex items-center gap-1">
                <IconDownload size={13} /> Télécharger
              </button>
              <button onClick={() => { URL.revokeObjectURL(visionneur.url); setVisionneur(null); }}
                className="text-gray-400 hover:text-gray-700 ml-2"><IconX size={20} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden" onClick={e => e.stopPropagation()}>
            {visionneur.mime?.startsWith('image/') ? (
              <div className="h-full flex items-center justify-center p-4">
                <img src={visionneur.url} alt={visionneur.nom} className="max-h-full max-w-full object-contain rounded shadow-lg" />
              </div>
            ) : visionneur.mime === 'application/pdf' ? (
              <iframe src={visionneur.url} title={visionneur.nom} className="w-full h-full border-none" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white gap-4">
                <IconFileCv size={48} className="opacity-50" />
                <div className="text-center">
                  <div className="text-lg font-medium">{visionneur.nom}</div>
                  <div className="text-sm opacity-60 mt-1">Ce format ne peut pas être prévisualisé</div>
                </div>
                <button onClick={() => telechargerDoc(null, visionneur.nom, visionneur.url)}
                  className="mt-2 bg-white text-iip-blue px-4 py-2 rounded-lg font-medium hover:bg-gray-100 flex items-center gap-2">
                  <IconDownload size={16} /> Télécharger le fichier
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ GRILLE D'ENTRETIEN ══════════════════════ */

const LIKERT_REFLEXIF = [
  { val: 1, label: 'Descriptif',     desc: "Décrit les faits sans analyse",                       color: '#ef4444' },
  { val: 2, label: 'Analytique',     desc: "Identifie les causes et conséquences",                color: '#f97316' },
  { val: 3, label: 'Réflexif',       desc: "Questionne ses pratiques et ses représentations",     color: '#eab308' },
  { val: 4, label: 'Critique',       desc: "Remet en question les présupposés, prise de recul",   color: '#22c55e' },
  { val: 5, label: 'Transformatif',  desc: "Change de posture, apprend et se transforme",         color: '#0ea5e9' },
];

// ── Tirage aléatoire de N questions dans un pool ─────────────────────────────
function tirerQuestions(axe) {
  const pool = axe.questions || [];
  const nb   = axe.nb_questions_tirees || 2;
  if (pool.length <= nb) return pool.map(q => ({ ...q }));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, nb);
}

function grilleAvecTirage(grilleActive) {
  return (grilleActive || []).map(axe => ({
    ...axe,
    questions: tirerQuestions(axe),
  }));
}

const GRILLE_IIP = [
  {
    axe: 'Axe 1 — Connaissance de la formation et du contexte',
    couleur: '#0369a1',
    questions: [
      "Quelles sont, selon vous, les différences les plus marquantes entre l'ancienne formation et la nouvelle ?",
      "Que savez-vous du cadre légal de cette formation ?",
      "Quelle sera la position du diplômé dans un service de soins ou en milieu professionnel ?",
      "Quel est le positionnement de l'enseignement pour adultes (EA) par rapport à l'enseignement supérieur de type court ?",
    ],
  },
  {
    axe: 'Axe 2 — Expérience professionnelle et clinique',
    couleur: '#7c3aed',
    questions: [
      "Décrivez votre parcours professionnel dans votre domaine de spécialité.",
      "Avez-vous une expérience d'encadrement de stagiaires ou d'étudiants en milieu clinique ou professionnel ?",
      "Dans quels services ou spécialités avez-vous exercé ? Pendant combien d'années ?",
      "Quels cours avez-vous déjà enseignés ? Sur quelle base juridique (titre requis / suffisant) ?",
    ],
  },
  {
    axe: 'Axe 3 — Compétences pédagogiques',
    couleur: '#15803d',
    questions: [
      "Comment organiseriez-vous vos cours pour satisfaire un public de l'enseignement pour adultes ?",
      "Avez-vous déjà donné cours à des groupes de 50 à 100 étudiants ?",
      "Comment gérez-vous l'hétérogénéité d'un groupe (niveaux différents, adultes en reconversion) ?",
      "Quelle différence faites-vous entre l'enseignement supérieur pour adultes et l'enseignement obligatoire au niveau pédagogique ?",
      "Quelle est votre approche de l'évaluation formative vs certificative ?",
      "Comment travailleriez-vous la pratique réflexive avec les étudiants avant, pendant et après un stage ?",
    ],
  },
  {
    axe: 'Axe 4 — Contraintes pratiques et administratives',
    couleur: '#b45309',
    questions: [
      "Quel volume horaire hebdomadaire êtes-vous en mesure d'assumer ?",
      "Avez-vous des contraintes de jours ou d'horaires (activité clinique en parallèle, etc.) ?",
      "Connaissez-vous les attendus de l'IIP quant au travail invisible (jury, suivi de TFE, encadrement) ?",
      "Êtes-vous flexible sachant que l'organisation en EA ne se fait pas toujours sur une base fixe annuelle ?",
    ],
  },
];

function GrilleEntretien({ poste, annee, qIA, setQIA, grille }) {
  const grilleActive = grille || GRILLE_IIP; // fallback sur la grille statique si pas encore chargée
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  const genererQIA = async () => {
    setLoading(true); setErr('');
    try {
      const ctx = await af(`/contexte?annee=${encodeURIComponent(annee)}&ue_num=${poste.ue_num}&section=${encodeURIComponent(poste.section)}`);
      const lignesAA = (ctx.aa || []).map(a => `- ${a.aa_code} : L'étudiant sera capable ${a.description}`).join('\n');
      const lignesCours = (ctx.cours || []).map(c => `${c.cours_nom} (${c.ct_pp})`).join(', ');

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 800,
          messages: [{ role: 'user', content:
            `Tu aides à recruter un professeur pour ce cours à l'Institut Ilya Prigogine (enseignement de promotion sociale, Bruxelles).

Cours : ${poste.nom_cours || poste.ue_nom} — UE ${poste.ue_num} — Section ${poste.section}
${lignesCours ? `Activités : ${lignesCours}` : ''}
${lignesAA ? `\nAcquis d'apprentissage visés :\n${lignesAA}` : ''}

Génère 6 à 8 questions d'entretien SPÉCIFIQUES à ce cours et à ces acquis d'apprentissage.
Ces questions complètent une grille générale (connaissance formation, expérience, pédagogie, contraintes) déjà posée.
Tester ici la maîtrise disciplinaire et la capacité à enseigner CES contenus précis.

Réponds en JSON strict sans backticks : {"questions":["question 1","question 2",...]}`
          }],
        }),
      });
      const data = await resp.json();
      const parsed = JSON.parse((data.content || []).map(b => b.text || '').join('').trim());
      setQIA(Array.isArray(parsed.questions) ? parsed.questions : []);
    } catch (e) { setErr('Erreur : ' + e.message); }
    finally { setLoading(false); }
  };

  const imprimer = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      body{font-family:Arial,sans-serif;font-size:11px;color:#222;padding:0}
      h1{color:#1B2B4B;font-size:15px;border-bottom:2px solid #00AACC;padding-bottom:6px;margin-bottom:4px}
      .meta{color:#777;font-size:9px;margin-bottom:14px}
      h2{font-size:11px;font-weight:bold;margin:12px 0 5px;padding:4px 10px;border-radius:3px;color:white}
      ul{margin:0 0 6px 16px;padding:0}
      li{margin-bottom:8px;line-height:1.5}
      @media print{@page{size:A4;margin:14mm 12mm}}
    </style></head><body>
    <h1>Grille d'entretien — ${poste.nom_cours || poste.ue_nom}</h1>
    <div class="meta">UE ${poste.ue_num} · Section ${poste.section} · ${annee}</div>
    ${grilleActive.map(axe => `<h2 style="background:${axe.couleur}">${axe.axe || axe.libelle}</h2><ul>${(axe.questions || []).map(q => `<li>${q.libelle || q}</li>`).join('')}</ul>`).join('')}
    ${qIA.length > 0 ? `<h2 style="background:#1B2B4B">Axe 5 — Questions spécifiques au cours</h2><ul>${qIA.map(q => `<li>${q}</li>`).join('')}</ul>` : ''}
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          Grille commune IIP (4 axes fixes) + questions spécifiques générées selon les acquis d'apprentissage du cours.
        </p>
        <div className="flex gap-2">
          <Btn variant="secondary" icon={IconSparkles} onClick={genererQIA} disabled={loading}>
            {loading ? 'Génération…' : 'Générer l\'axe 5'}
          </Btn>
          <Btn variant="ghost" icon={IconDownload} onClick={imprimer}>Imprimer</Btn>
        </div>
      </div>

      {err && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mb-3">{err}</div>}

      <div className="space-y-3">
        {grilleActive.map((axe, i) => (
          <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 text-sm font-semibold text-white" style={{ background: axe.couleur }}>
              {axe.axe}
            </div>
            <ul className="px-4 py-3 space-y-2.5">
              {axe.questions.map((q, j) => (
                <li key={j} className="text-sm text-gray-700 flex gap-2 list-none">
                  <span className="flex-shrink-0 w-1.5 h-1.5 mt-2 rounded-full" style={{ background: axe.couleur }} />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {loading && (
          <div className="border border-dashed border-iip-turquoise/40 rounded-xl p-4 flex items-center gap-2 text-sm text-gray-400">
            <span className="animate-spin w-4 h-4 border-2 border-iip-blue border-t-transparent rounded-full flex-shrink-0" />
            Génération des questions spécifiques à « {poste.nom_cours || poste.ue_nom} »…
          </div>
        )}

        {qIA.length > 0 && (
          <div className="border border-iip-blue/20 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 text-sm font-semibold text-white flex items-center justify-between" style={{ background: '#1B2B4B' }}>
              <span>Axe 5 — Questions spécifiques au cours</span>
              <span className="text-[10px] font-normal opacity-60">générées par l'IA · UE {poste.ue_num}</span>
            </div>
            <ul className="px-4 py-3 space-y-2.5">
              {qIA.map((q, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2 list-none">
                  <span className="flex-shrink-0 w-1.5 h-1.5 mt-2 rounded-full bg-iip-turquoise" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════ MODAL ENTRETIEN ══════════════════════ */
const LIKERT = [
  { val: 1, label: 'Superficielle',  desc: 'Réponse vague, générale, sans ancrage réel',                      color: '#ef4444' },
  { val: 2, label: 'Partielle',      desc: 'Quelques éléments pertinents, mais incomplets',                   color: '#f97316' },
  { val: 3, label: 'Adéquate',       desc: 'Répond à la question, compréhension correcte',                    color: '#eab308' },
  { val: 4, label: 'Élaborée',       desc: 'Nuancée, exemples concrets, prise de recul visible',              color: '#22c55e' },
  { val: 5, label: 'Excellente',     desc: 'Réflexivité, profondeur, lien théorie-pratique maîtrisé',         color: '#0ea5e9' },
];

function EntretienModal({ candidature, poste, annee, qIA, grille, onClose, onSaved }) {
  const grilleActive = useMemo(() => grilleAvecTirage(grille || GRILLE_IIP), []);
  const toutesQuestions = [
    ...grilleActive.flatMap(axe => (axe.questions || []).map(q => ({ axe: axe.axe || axe.libelle, q: q.libelle || q, couleur: axe.couleur }))),
    ...qIA.map(q => ({ axe: 'Axe 5 — Questions spécifiques au cours', q, couleur: '#1B2B4B' })),
  ];

  // Initialiser depuis les réponses sauvegardées
  const initReponses = () => {
    const saved = candidature.reponses_json || {};
    return toutesQuestions.reduce((acc, { q }, i) => {
      acc[i] = { note: saved[i]?.note ?? 0, commentaire: saved[i]?.commentaire ?? '' };
      return acc;
    }, {});
  };

  const [reponses, setReponses] = useState(initReponses);
  const [commentaireGlobal, setCommentaireGlobal] = useState(candidature.commentaire || '');
  const [reflexifNiveaux, setReflexifNiveaux] = useState(() => { const v = candidature.reflexif_niveau; if (!v) return []; try { const p = JSON.parse(v); return Array.isArray(p) ? p : [p].filter(Boolean); } catch { return v ? [v] : []; } });
  const [reflexifCommentaire, setReflexifCommentaire] = useState(candidature.reflexif_commentaire || '');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  // Note globale = moyenne des notes saisies (ignorer les 0 et les questions désactivées)
  const notees = Object.values(reponses).filter(r => r.note > 0 && !r.disabled);
  const noteGlobale = notees.length > 0
    ? Math.round((notees.reduce((s, r) => s + r.note, 0) / notees.length) * 10) / 10
    : null;

  const majReponse = (i, champ, val) =>
    setReponses(r => ({ ...r, [i]: { ...r[i], [champ]: val } }));

  const toggleDisabled = (i) =>
    setReponses(r => ({ ...r, [i]: { ...r[i], disabled: !r[i]?.disabled } }));

  const sauvegarder = async () => {
    setSaving(true);
    try {
      await af(`/candidatures/${candidature.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          reponses_json: reponses,
          commentaire: commentaireGlobal,
          note_globale: noteGlobale,
          reflexif_niveau: reflexifNiveaux.length ? reflexifNiveaux : null,
          reflexif_commentaire: reflexifCommentaire || null,
          statut: candidature.statut === 'a_voir' ? 'entretien' : candidature.statut,
        }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  // Grouper les questions par axe pour l'affichage
  const parAxe = toutesQuestions.reduce((acc, { axe, q, couleur }, i) => {
    if (!acc[axe]) acc[axe] = { couleur, questions: [] };
    acc[axe].questions.push({ q, i });
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0"
        onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold text-iip-blue">Entretien — {candidature.prenom ? `${candidature.prenom} ${candidature.nom}` : candidature.nom}</h3>
          <div className="text-xs text-gray-400">{poste.nom_cours || poste.ue_nom} · {poste.section}</div>
        </div>
        <div className="flex items-center gap-3">
          {noteGlobale != null && (
            <div className="text-right">
              <div className="text-xs text-gray-400">Moyenne</div>
              <div className="text-xl font-bold text-iip-blue">{noteGlobale}<span className="text-sm font-normal text-gray-400">/5</span></div>
            </div>
          )}
          <button onClick={async () => { await sauvegarder(); onSaved(); }}
            className="bg-iip-blue text-white text-sm px-4 py-2 rounded-lg font-medium hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50"
            disabled={saving}>
            {saved ? <><IconCheck size={15} /> Sauvegardé</> : saving ? 'Sauvegarde…' : <><IconCheck size={15} /> Terminer</>}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 ml-1"><IconX size={20} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50" onClick={e => e.stopPropagation()}>
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">

          {Object.entries(parAxe).map(([axe, { couleur, questions }]) => (
            <div key={axe} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 text-sm font-semibold text-white" style={{ background: couleur }}>
                {axe}
              </div>
              <div className="divide-y divide-gray-100">
                {questions.map(({ q, i }) => {
                  const disabled = !!reponses[i]?.disabled;
                  return (
                  <div key={i} className={`px-4 py-3 transition ${disabled ? 'opacity-40' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-sm text-gray-800 font-medium flex-1">{q}</div>
                      <button onClick={() => toggleDisabled(i)} title={disabled ? 'Réactiver la question' : 'Ne pas poser cette question'}
                        className={`text-[10px] px-2 py-0.5 rounded border flex-shrink-0 mt-0.5 transition ${
                          disabled ? 'border-gray-300 text-gray-400 bg-gray-50' : 'border-gray-200 text-gray-300 hover:border-orange-300 hover:text-orange-400'
                        }`}>
                        {disabled ? '+ Réactiver' : '✕ Non posée'}
                      </button>
                    </div>

                    {!disabled && (<>
                    {/* Likert */}
                    <div className="flex gap-1.5 mb-1 flex-wrap">
                      {LIKERT.map(({ val, label, color }) => (
                        <button key={val} onClick={() => majReponse(i, 'note', reponses[i]?.note === val ? 0 : val)}
                          title={label}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition font-medium ${
                            reponses[i]?.note === val
                              ? 'text-white border-transparent shadow-sm'
                              : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                          style={reponses[i]?.note === val ? { background: color, borderColor: color } : {}}>
                          <span className="font-bold">{val}</span>
                          <span className="hidden sm:inline">{label}</span>
                        </button>
                      ))}
                    </div>
                    {reponses[i]?.note > 0 && (
                      <div className="text-[10px] text-gray-500 italic mb-2 pl-1">
                        {LIKERT.find(l => l.val === reponses[i].note)?.desc}
                      </div>
                    )}
                    <textarea
                      value={reponses[i]?.commentaire || ''}
                      onChange={e => majReponse(i, 'commentaire', e.target.value)}
                      placeholder="Notes sur la réponse…"
                      rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 resize-none text-gray-600 placeholder-gray-300 focus:outline-none focus:border-iip-turquoise"
                    />
                    </>)}
                  </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Bilan global */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-sm font-semibold text-iip-blue mb-2">Bilan global de l'entretien</div>
            <textarea
              value={commentaireGlobal}
              onChange={e => setCommentaireGlobal(e.target.value)}
              placeholder="Impression générale, points forts, réserves, recommandation…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-iip-turquoise"
            />
          </div>

          {/* Appréciation réflexive */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-sm font-semibold text-teal-800">Appréciation du niveau réflexif</div>
              <div className="text-xs text-teal-600">Évaluation globale de la posture réflexive du candidat</div>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {LIKERT_REFLEXIF.map(({ val, label, desc, color }) => (
                <button key={val} type="button"
                  onClick={() => setReflexifNiveaux(prev => prev.includes(val) ? prev.filter(x=>x!==val) : [...prev, val])}
                  title={desc}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg border-2 transition text-left ${
                    reflexifNiveaux.includes(val)
                      ? 'text-white shadow-md'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={reflexifNiveaux.includes(val) ? { background: color, borderColor: color } : {}}>
                  <span className="font-bold text-sm">{val} — {label}</span>
                  <span className={`text-[10px] mt-0.5 leading-tight ${reflexifNiveaux.includes(val) ? 'text-white/80' : 'text-gray-400'}`}>
                    {desc}
                  </span>
                </button>
              ))}
            </div>
            {reflexifNiveaux.length > 0 && (
              <textarea
                value={reflexifCommentaire}
                onChange={e => setReflexifCommentaire(e.target.value)}
                placeholder="Observations sur la posture réflexive : exemples concrets, nuances…"
                rows={2}
                className="w-full text-sm border border-teal-200 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:border-teal-400 bg-white"
              />
            )}
            <div className="flex justify-between items-center mt-3">
              <div className="text-xs text-gray-400">
                {notees.length} question{notees.length > 1 ? 's' : ''} évaluée{notees.length > 1 ? 's' : ''} sur {toutesQuestions.length}
              </div>
              <button onClick={sauvegarder} disabled={saving}
                className="text-sm bg-iip-blue text-white px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                {saved ? <><IconCheck size={14} /> Sauvegardé</> : <><IconCheck size={14} /> Sauvegarder</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ VUE PARALLÈLE (drag & drop) ══════════════════════ */
function VueParallele({ postes, candidats, fonctions, annee, onRecharger }) {
  const [showTous, setShowTous]     = useState(false); // toggle À désigner / tous
  const [filtreFn, setFiltreFn]     = useState('');    // filtre fonction candidat
  const [filtreSection, setFiltreSection] = useState('');
  const [dragId, setDragId]         = useState(null);  // id candidat en cours de drag
  const [dropTarget, setDropTarget] = useState(null);  // poste cible en survol
  const [feedback, setFeedback]     = useState('');    // message confirmation

  const sections = [...new Set(postes.map(p => p.section).filter(Boolean))].sort();

  // Candidats filtrés par fonction
  const candidatsFiltres = filtreFn
    ? candidats.filter(c => c.fonction === filtreFn)
    : candidats;

  // Postes filtrés (tous ou seulement sans candidat)
  const postesFiltres = (filtreSection ? postes.filter(p => p.section === filtreSection) : postes)
    .filter(p => showTous || p.nb_candidats === 0);

  // Glisser un candidat sur un poste
  const onDrop = async (poste) => {
    if (!dragId) return;
    setDropTarget(null);
    const cand = candidats.find(c => c.id === dragId);
    if (!cand) return;
    try {
      await af(`/candidats/${cand.id}/candidatures`, {
        method: 'POST',
        body: JSON.stringify({
          annee, ue_num: poste.ue_num, code_cours: poste.code_cours, section: poste.section,
        }),
      });
      setFeedback(`${cand.prenom ? cand.prenom + ' ' : ''}${cand.nom} rattaché à ${poste.nom_cours || poste.ue_nom}`);
      setTimeout(() => setFeedback(''), 3000);
      onRecharger();
    } catch (e) {
      if (e.message.includes('déjà rattaché') || e.message.includes('UNIQUE') || e.message.includes('409')) {
        setFeedback(`${cand.prenom ? cand.prenom + ' ' : ''}${cand.nom} est déjà candidat pour ce cours`);
        setTimeout(() => setFeedback(''), 3000);
      } else { alert(e.message); }
    }
    setDragId(null);
  };

  return (
    <div className="h-full">
      {/* Barre de filtres */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-xl font-title text-iip-gold mr-2">Vue parallèle</h1>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showTous} onChange={e => setShowTous(e.target.checked)}
            className="w-4 h-4 accent-iip-turquoise" />
          Afficher tous les cours
        </label>

        <select value={filtreSection} onChange={e => setFiltreSection(e.target.value)}
          className="text-sm border border-gray-200 rounded px-2 py-1.5 h-8">
          <option value="">Toutes sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={filtreFn} onChange={e => setFiltreFn(e.target.value)}
          className="text-sm border border-gray-200 rounded px-2 py-1.5 h-8">
          <option value="">Toutes fonctions</option>
          {(fonctions || []).map(fn => <option key={fn.id} value={fn.libelle}>{fn.libelle}</option>)}
        </select>

        <span className="text-xs text-gray-400 ml-auto">
          {postesFiltres.length} cours · {candidatsFiltres.length} candidat{candidatsFiltres.length > 1 ? 's' : ''}
        </span>
      </div>

      {feedback && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <IconCheck size={15} /> {feedback}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 h-full" style={{ height: 'calc(100vh - 220px)' }}>

        {/* ── Colonne gauche : Cours à pourvoir ── */}
        <div className="flex flex-col">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Cours à pourvoir ({postesFiltres.length})
          </div>
          <div className="flex-1 overflow-auto space-y-1.5 pr-1">
            {postesFiltres.length === 0 && (
              <div className="text-sm text-gray-300 text-center py-12">Aucun cours{showTous ? '' : ' sans candidat'}.</div>
            )}
            {postesFiltres.map((p, i) => {
              const isTarget = dropTarget === `${p.ue_num}-${p.code_cours}-${p.section}`;
              return (
                <div key={i}
                  onDragOver={e => { e.preventDefault(); setDropTarget(`${p.ue_num}-${p.code_cours}-${p.section}`); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={() => onDrop(p)}
                  className={`border rounded-lg px-3 py-2.5 transition ${
                    isTarget
                      ? 'border-iip-turquoise bg-iip-turquoise/10 shadow-md scale-[1.01]'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-iip-blue flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-gray-400 font-normal">UE {p.ue_num}</span>
                        <span className="truncate">{p.nom_cours || p.ue_nom}</span>
                        {p.contrat_mdp && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                            style={{ background: p.contrat_mdp === 'HELB' ? '#8B5CF6' : '#1B2B4B' }}>{p.contrat_mdp}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {p.section}{p.ue_quad ? ` · ${p.ue_quad}` : ''}{p.ue_per_cours ? ` · ${p.ue_per_cours} pér.` : ''}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-base font-bold text-iip-blue">{p.nb_candidats}</div>
                      <div className="text-[9px] text-gray-400">cand.</div>
                    </div>
                  </div>
                  {isTarget && dragId && (
                    <div className="mt-2 text-xs text-iip-turquoise font-medium text-center animate-pulse">
                      ↓ Déposer ici pour rattacher
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Colonne droite : Candidats ── */}
        <div className="flex flex-col">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Candidats ({candidatsFiltres.length}) — glisser vers un cours
          </div>
          <div className="flex-1 overflow-auto space-y-1.5 pl-1">
            {candidatsFiltres.length === 0 && (
              <div className="text-sm text-gray-300 text-center py-12">Aucun candidat{filtreFn ? ` avec la fonction "${filtreFn}"` : ''}.</div>
            )}
            {candidatsFiltres.map(c => (
              <div key={c.id}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                className={`border rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing select-none transition ${
                  dragId === c.id
                    ? 'border-iip-blue bg-iip-blue/5 opacity-70 shadow-lg'
                    : 'border-gray-200 bg-white hover:border-iip-blue/40 hover:shadow-sm'
                }`}>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center justify-center text-gray-200 flex-shrink-0">
                    <span className="text-lg leading-none">⠿</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-iip-blue">{c.prenom ? `${c.prenom} ${c.nom}` : c.nom}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.fonction && (
                        <span className="text-[10px] bg-iip-blue/10 text-iip-blue px-1.5 py-0.5 rounded font-medium">
                          {c.fonction}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{c.email || '—'}</span>
                    </div>
                    {c.candidatures?.length > 0 && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {c.candidatures.length} candidature{c.candidatures.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  {c.documents?.length > 0 && (
                    <span className="text-xs text-gray-300 flex items-center gap-0.5 flex-shrink-0">
                      <IconFileCv size={12} /> {c.documents.length}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ PDF COMPARATIF ══════════════════════ */
function genererComparatif(candidats, poste, grille) {
  const BLEU = '#1B2B4B', TURQ = '#00AACC';
  const LIKERT_LABELS = ['','Peu structurée','Partiellement','Structurée','Bien structurée','Très structurée'];
  const grilleActive = grille || GRILLE_IIP;
  const toutesQs = grilleActive.flatMap(axe =>
    (axe.questions||[]).map(q => ({ axe: axe.axe||axe.libelle, q: q.libelle||q, couleur: axe.couleur }))
  );
  const nomPoste = poste?.nom_cours || poste?.ue_nom || `UE ${poste?.ue_num}`;

  // Tableau récapitulatif
  const recap = candidats.map(c => {
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || '—';
    const st = STATUT[c.statut] || STATUT.a_voir;
    const noteQ = c.note_globale;
    const noteL = c.entretien_note;
    const noteAff = noteQ ?? noteL ?? null;
    const col = noteAff>=4?'#15803d':noteAff>=3?'#d97706':noteAff!=null?'#b91c1c':'#9ca3af';
    const refl = c.reflexif_niveau || c.reflexif_niveau_libre;
    const REFL = ['','Descriptif','Analytique','Réflexif','Critique','Transformatif'];
    return { nom, st, noteAff, col, refl, REFL };
  });

  const tableRecap = `
    <table style="width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:8mm">
      <thead><tr style="background:${BLEU};color:white">
        <th style="padding:5px 8px;text-align:left">Candidat</th>
        <th style="padding:5px 8px;text-align:center">Statut</th>
        <th style="padding:5px 8px;text-align:right">Note /5</th>
        <th style="padding:5px 8px;text-align:center">Réflexivité</th>
      </tr></thead>
      <tbody>${recap.map((r,i) => `<tr style="background:${i%2===0?'white':'#f8fafc'}">
        <td style="padding:4px 8px;font-weight:600">${r.nom}</td>
        <td style="padding:4px 8px;text-align:center"><span style="background:${r.st.bg};color:${r.st.color};padding:1px 7px;border-radius:10px;font-size:8pt;font-weight:600">${r.st.label}</span></td>
        <td style="padding:4px 8px;text-align:right;font-size:11pt;font-weight:700;color:${r.col}">${r.noteAff!=null?r.noteAff+'/5':'—'}</td>
        <td style="padding:4px 8px;text-align:center;font-size:8.5pt">${r.refl?r.REFL[r.refl]:'—'}</td>
      </tr>`).join('')}</tbody>
    </table>`;

  // Fiche par candidat (compacte)
  const fiches = candidats.map(c => {
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || '—';
    const st = STATUT[c.statut] || STATUT.a_voir;
    const rep = c.reponses_json || {};
    const rows = toutesQs.map((item,i) => {
      const r = rep[i]||{};
      if (!r.note && !r.commentaire) return '';
      const lbl = LIKERT_LABELS[r.note]||'';
      const lcol = ['','#ef4444','#f97316','#eab308','#22c55e','#0ea5e9'][r.note]||'#6b7280';
      return `<tr><td style="padding:2px 5px;color:#6b7280;font-size:8pt;border-bottom:1px solid #f1f5f9;width:18%">${item.axe.replace(/Axe \d+ — /,'')}</td>
        <td style="padding:2px 5px;font-size:8pt;border-bottom:1px solid #f1f5f9">${item.q}</td>
        <td style="padding:2px 5px;text-align:center;border-bottom:1px solid #f1f5f9;width:15%">${r.note?`<span style="background:${lcol};color:white;padding:1px 5px;border-radius:8px;font-size:7.5pt;font-weight:700">${r.note} — ${lbl}</span>`:'—'}</td>
        <td style="padding:2px 5px;font-size:8pt;border-bottom:1px solid #f1f5f9;width:22%">${r.commentaire||''}</td></tr>`;
    }).join('');
    const nc = c.note_globale; const col = nc>=4?'#15803d':nc>=3?'#d97706':nc!=null?'#b91c1c':'#9ca3af';
    return `<div style="page-break-before:always;margin-bottom:6mm">
      <div style="background:${BLEU};color:white;padding:5px 10px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:11pt;font-weight:700">${nom}</span>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="background:${st.bg};color:${st.color};padding:1px 8px;border-radius:10px;font-size:8pt;font-weight:700;border:1px solid">${st.label}</span>
          ${nc!=null?`<span style="background:${col};color:white;padding:2px 10px;border-radius:12px;font-size:10pt;font-weight:700">${nc}/5</span>`:''}
        </div>
      </div>
      ${rows?`<table style="width:100%;border-collapse:collapse;font-size:8.5pt"><thead><tr style="background:#e8edf5"><th style="padding:3px 5px;text-align:left">Axe</th><th style="padding:3px 5px;text-align:left">Question posée</th><th style="padding:3px 5px;text-align:center">Réponse</th><th style="padding:3px 5px;text-align:left">Notes</th></tr></thead><tbody>${rows}</tbody></table>`:'<p style="color:#9ca3af;font-size:8.5pt;padding:4px">Aucune évaluation enregistrée.</p>'}
      ${c.commentaire?`<div style="background:#f8fafc;border-left:3px solid ${TURQ};padding:4px 8px;font-size:8.5pt;margin-top:4px"><b>Bilan :</b> ${c.commentaire}</div>`:''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Comparatif — ${nomPoste}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,sans-serif;color:#1a1a2e;font-size:9pt}@media print{@page{size:A4;margin:12mm}}</style>
  </head><body><div style="padding:6mm">

  <div style="border-bottom:3px solid ${TURQ};padding-bottom:5px;margin-bottom:6mm;display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font-size:7pt;letter-spacing:3px;text-transform:uppercase;color:${TURQ};font-weight:700">Institut Ilya Prigogine · Recrutement comparatif</div>
      <div style="font-size:16pt;color:${BLEU};font-weight:700">${nomPoste}</div>
      <div style="font-size:9pt;color:#555">${candidats.length} candidat${candidats.length>1?'s':''} · ${poste?.section||''} · ${new Date().toLocaleDateString('fr-BE',{day:'2-digit',month:'long',year:'numeric'})}</div>
    </div>
    <div style="text-align:right;font-size:8pt;color:#999">Confidentiel — usage interne</div>
  </div>

  <h2 style="color:${BLEU};font-size:11pt;margin-bottom:4mm">Tableau récapitulatif</h2>
  ${tableRecap}

  ${fiches}

  </div></body></html>`;

  const w = window.open('','_blank');
  if (!w) { alert('Autorisez les pop-ups.'); return; }
  w.document.write(html); w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 500);
}

/* ══════════════════════ PDF FICHE INDIVIDUELLE ══════════════════════ */
function genererFicheIndividuelle(candidat, grille) {
  const BLEU = '#1B2B4B', TURQ = '#00AACC';
  const LIKERT_LABELS = ['','Peu structurée','Partiellement','Structurée','Bien structurée','Très structurée'];
  const LIKERT_COLORS = ['','#ef4444','#f97316','#eab308','#22c55e','#0ea5e9'];
  const REFL_LABELS   = ['','Descriptif','Analytique','Réflexif','Critique','Transformatif'];
  const REFL_COLORS   = ['','#ef4444','#f97316','#eab308','#22c55e','#0ea5e9'];
  const grilleActive  = grille || GRILLE_IIP;
  const nom = [candidat.prenom, candidat.nom].filter(Boolean).join(' ') || '—';

  // Questions de la grille (avec libellés)
  const toutesQs = grilleActive.flatMap(axe =>
    (axe.questions||[]).map(q => ({ axe: axe.axe||axe.libelle, q: q.libelle||q, couleur: axe.couleur }))
  );

  // Qualifications
  const qualsHtml = (candidat.qualifications||[]).length ? `
    <ul style="margin:3px 0 0 14px;padding:0;font-size:8.5pt">
      ${(candidat.qualifications||[]).map(q => {
        const niv = NIVEAUX_ETUDE.find(n=>n.val===q.niveau);
        const dip = Object.values(DIPLOMES_FWB).flat().find(d=>d.val===q.diplome);
        const tit = TITRES_PEDA.find(t=>t.val===q.titre_peda);
        return `<li>${[niv?.label, dip?.label||q.diplome_autre, tit?.label].filter(Boolean).join(' · ')}</li>`;
      }).join('')}
    </ul>` : '<span style="color:#9ca3af;font-size:8.5pt">Non renseigné</span>';


  // Disponibilités
  const jours = ['Lun','Mar','Mer','Jeu','Ven','Sam'];
  const creneaux = [{key:'matin',label:'8h–12h'},{key:'midi',label:'12h–17h'},{key:'soir',label:'17h–22h'}];
  const dispo = candidat.disponibilites || {};
  const hasDispo = jours.some(j => creneaux.some(cr => dispo[`${j}_${cr.key}`]));
  const dispoHtml = hasDispo ? `<div style="margin-bottom:6px">
    <div style="font-size:8pt;font-weight:700;color:${BLEU};text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Disponibilités</div>
    <table style="border-collapse:collapse;font-size:8pt"><thead><tr>
      <th style="width:52px"></th>${jours.map(j=>`<th style="text-align:center;padding:1px 4px;color:#374151;font-weight:600">${j}</th>`).join('')}
    </tr></thead><tbody>${creneaux.map(cr=>`<tr>
      <td style="text-align:right;padding:1px 6px 1px 0;color:#6b7280;white-space:nowrap">${cr.label}</td>
      ${jours.map(j=>`<td style="text-align:center;padding:1px 4px"><span style="display:inline-block;width:20px;height:16px;border-radius:3px;background:${dispo[j+'_'+cr.key]?BLEU:'#f3f4f6'};color:${dispo[j+'_'+cr.key]?'white':'transparent'};font-size:9pt;line-height:16px;text-align:center">${dispo[j+'_'+cr.key]?'✓':''}</span></td>`).join('')}
    </tr>`).join('')}</tbody></table>
    ${dispo._remarque?`<div style="margin-top:3px;font-size:8pt;color:#374151;font-style:italic">${dispo._remarque}</div>`:''}
  </div>` : '';

  // Documents remis
  const docsHtml = Object.entries(candidat.docs_remis||{}).filter(([,v])=>v).map(([k]) => {
    const d = DOCS_REMIS_LIST.find(x=>x.key===k);
    return d ? `<span style="background:#dcfce7;color:#15803d;border:1px solid #86efac;padding:1px 7px;border-radius:10px;font-size:8pt;font-weight:600;margin-right:3px">${d.emoji} ${d.label}</span>` : '';
  }).join('');

  // Entretien libre
  const repL = candidat.entretien_reponses || {};
  const hasLibre = candidat.entretien_note || candidat.entretien_commentaire || Object.values(repL).some(r=>r&&r.note>0);
  const entretienLibreHtml = hasLibre ? (() => {
    const nc = candidat.entretien_note;
    const col = nc>=4?'#15803d':nc>=3?'#d97706':'#b91c1c';
    const rows = toutesQs.map((item,i) => {
      const r = repL[i]||{};
      if (r.disabled||(!r.note&&!r.commentaire)) return '';
      const lbl = LIKERT_LABELS[r.note]||'';
      const lcol = LIKERT_COLORS[r.note]||'#6b7280';
      return `<tr><td style="padding:2px 5px;color:#6b7280;font-size:8pt;border-bottom:1px solid #f1f5f9;width:18%">${item.axe.replace(/Axe \d+ — /,'')}</td>
        <td style="padding:2px 5px;font-size:8.5pt;border-bottom:1px solid #f1f5f9">${item.q}</td>
        <td style="padding:2px 5px;text-align:center;border-bottom:1px solid #f1f5f9;width:17%">${r.note?`<span style="background:${lcol};color:white;padding:1px 6px;border-radius:10px;font-size:8pt;font-weight:700">${r.note} — ${lbl}</span>`:'—'}</td>
        <td style="padding:2px 5px;font-size:8pt;color:#374151;border-bottom:1px solid #f1f5f9;width:20%">${r.commentaire||''}</td></tr>`;
    }).join('');
    return `<div style="margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;background:#e8edf5;padding:4px 8px;border-left:4px solid ${TURQ}">
        <b style="color:${BLEU};font-size:9pt">Entretien exploratoire</b>
        ${nc!=null?`<span style="background:${col};color:white;padding:2px 10px;border-radius:12px;font-size:9pt;font-weight:700">Moyenne : ${nc}/5</span>`:''}
      </div>
      ${rows?`<table style="width:100%;border-collapse:collapse;font-size:8.5pt"><thead><tr style="background:#f1f5f9">
        <th style="padding:3px 5px;text-align:left">Axe</th><th style="padding:3px 5px;text-align:left">Question</th>
        <th style="padding:3px 5px;text-align:center">Réponse</th><th style="padding:3px 5px;text-align:left">Notes</th>
      </tr></thead><tbody>${rows}</tbody></table>`:''}
      ${candidat.entretien_commentaire?`<div style="background:#f8fafc;border-left:3px solid ${TURQ};padding:4px 8px;font-size:8.5pt;margin-top:4px"><b>Bilan :</b> ${candidat.entretien_commentaire}</div>`:''}
      ${candidat.reflexif_niveau?(() => { const r=LIKERT_REFLEXIF.find(x=>x.val===candidat.reflexif_niveau); return r?`<div style="margin-top:4px;display:flex;align-items:center;gap:8px"><span style="background:${r.color};color:white;padding:2px 10px;border-radius:10px;font-size:8.5pt;font-weight:700">Réflexivité : ${r.val} — ${r.label}</span><span style="font-size:8pt;color:#374151;font-style:italic">${r.desc}</span></div>`:'' })():''}
      ${candidat.reflexif_commentaire?`<div style="font-size:8pt;color:#374151;margin-top:2px"><b>Observations :</b> ${candidat.reflexif_commentaire}</div>`:''}
    </div>`;
  })() : '';

  // Entretiens par cours
  const entretiensCoursHtml = (candidat.candidatures||[]).filter(ca=>ca.note_globale||ca.commentaire).map(ca => {
    const st = STATUT[ca.statut]||STATUT.a_voir;
    const nc = ca.note_globale; const col = nc>=4?'#15803d':nc>=3?'#d97706':'#b91c1c';
    const rep = ca.reponses_json||{};
    const rows = toutesQs.map((item,i)=>{ const r=rep[i]||{}; if(!r.note&&!r.commentaire) return ''; const lbl=LIKERT_LABELS[r.note]||''; const lcol=LIKERT_COLORS[r.note]||'#6b7280'; return `<tr><td style="padding:2px 5px;color:#6b7280;font-size:8pt;border-bottom:1px solid #f1f5f9">${item.axe.replace(/Axe \d+ — /,'')}</td><td style="padding:2px 5px;font-size:8.5pt;border-bottom:1px solid #f1f5f9">${item.q}</td><td style="padding:2px 5px;text-align:center;border-bottom:1px solid #f1f5f9">${r.note?`<span style="background:${lcol};color:white;padding:1px 6px;border-radius:10px;font-size:8pt;font-weight:700">${r.note} — ${lbl}</span>`:'—'}</td><td style="padding:2px 5px;font-size:8pt;border-bottom:1px solid #f1f5f9">${r.commentaire||''}</td></tr>`; }).join('');
    return `<div style="margin-bottom:6px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:4px 8px;border-bottom:1px solid #e2e8f0">
        <b style="font-size:8.5pt;color:${BLEU}">${ca.cours_nom||ca.ue_nom||`UE ${ca.ue_num}`} <span style="font-weight:400;color:#6b7280">${ca.section||''}</span></b>
        <span style="background:${st.bg};color:${st.color};padding:1px 7px;border-radius:10px;font-size:8pt;font-weight:600">${st.label}</span>
        ${nc!=null?`<span style="background:${col};color:white;padding:1px 8px;border-radius:10px;font-size:8.5pt;font-weight:700">${nc}/5</span>`:''}
      </div>
      ${rows?`<table style="width:100%;border-collapse:collapse;font-size:8pt"><thead><tr style="background:#e8edf5"><th style="padding:2px 5px;text-align:left">Axe</th><th style="padding:2px 5px;text-align:left">Question</th><th style="padding:2px 5px;text-align:center">Réponse</th><th style="padding:2px 5px;text-align:left">Notes</th></tr></thead><tbody>${rows}</tbody></table>`:''}
      ${ca.commentaire?`<div style="padding:4px 8px;font-size:8pt"><b>Bilan :</b> ${ca.commentaire}</div>`:''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Fiche — ${nom}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,sans-serif;color:#1a1a2e;font-size:9pt}@media print{@page{size:A4;margin:12mm}}</style>
  </head><body><div style="padding:6mm">

  <div style="border-bottom:3px solid ${TURQ};padding-bottom:5px;margin-bottom:6mm;display:flex;justify-content:space-between;align-items:flex-end">
    <div>
      <div style="font-size:7pt;letter-spacing:3px;text-transform:uppercase;color:${TURQ};font-weight:700">Institut Ilya Prigogine · Recrutement</div>
      <div style="font-size:17pt;color:${BLEU};font-weight:700">${nom}</div>
      ${candidat.fonction?`<div style="font-size:9.5pt;color:#555;margin-top:1px">${candidat.fonction}</div>`:''}
    </div>
    <div style="text-align:right;font-size:8pt;color:#999">Confidentiel<br>${new Date().toLocaleDateString('fr-BE',{day:'2-digit',month:'long',year:'numeric'})}</div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 14px;font-size:9pt;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #f1f5f9">
    ${candidat.email?`<div><b>E-mail :</b> ${candidat.email}</div>`:''}
    ${candidat.telephone?`<div><b>Tél. :</b> ${candidat.telephone}</div>`:''}
  </div>

  <div style="margin-bottom:6px">
    <div style="font-size:8pt;font-weight:700;color:${BLEU};text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Titres & Diplômes</div>
    ${qualsHtml}
  </div>

  ${docsHtml?`<div style="margin-bottom:6px">${docsHtml}</div>`:''}
  ${dispoHtml}
  ${candidat.notes?`<div style="margin-bottom:8px;font-size:8.5pt;background:#f8fafc;padding:4px 8px;border-radius:3px"><b>Profil :</b> ${candidat.notes}</div>`:''}

  <div style="margin-bottom:6px">
    <div style="font-size:8pt;font-weight:700;color:${BLEU};text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Cours envisagés</div>
    ${(candidat.candidatures||[]).length?`<table style="width:100%;border-collapse:collapse;font-size:8.5pt"><thead><tr style="background:#f1f5f9"><th style="padding:2px 6px;text-align:left">Cours</th><th style="padding:2px 6px;text-align:left">Section</th><th style="padding:2px 6px;text-align:center">Statut</th><th style="padding:2px 6px;text-align:right">Note</th></tr></thead><tbody>${(candidat.candidatures||[]).map((ca,i)=>{const st=STATUT[ca.statut]||STATUT.a_voir;return `<tr style="background:${i%2===0?'white':'#f8fafc'}"><td style="padding:2px 6px">${ca.cours_nom||ca.ue_nom||`UE ${ca.ue_num}`}</td><td style="padding:2px 6px;color:#6b7280">${ca.section||''}</td><td style="padding:2px 6px;text-align:center"><span style="background:${st.bg};color:${st.color};padding:1px 6px;border-radius:10px;font-size:8pt;font-weight:600">${st.label}</span></td><td style="padding:2px 6px;text-align:right;font-weight:700">${ca.note_globale!=null?ca.note_globale+'/5':'—'}</td></tr>`;}).join('')}</tbody></table>` : '<span style="color:#9ca3af;font-size:8.5pt">Aucune candidature</span>'}
  </div>

  ${entretienLibreHtml}
  ${entretiensCoursHtml}

  </div></body></html>`;

  const w = window.open('','_blank');
  if (!w) { alert('Autorisez les pop-ups pour imprimer.'); return; }
  w.document.write(html); w.document.close();
  setTimeout(()=>{ w.focus(); w.print(); }, 500);
}

/* ══════════════════════ VUE CANDIDATS GLOBALE ══════════════════════ */
function VueCandidatsGlobal({ candidats, fonctions, grille, onRecharger,
  nouveauOpen, onNouveauClose, rapportOpen, onRapportClose }) {
  const [fiche, setFiche]   = useState(null);
  const [search, setSearch] = useState('');
  const [nouveau, setNouveau] = useState(false);
  const rapportRef = useRef(null);

  const filtres = search
    ? candidats.filter(c => `${c.prenom||''} ${c.nom||''}`.toLowerCase().includes(search.toLowerCase())
        || (c.email || '').toLowerCase().includes(search.toLowerCase()))
    : candidats;

  const BLEU = '#1B2B4B', TURQ = '#00AACC';
  const LIKERT_LABELS = ['','Superficielle','Partielle','Adéquate','Élaborée','Excellente'];
  const LIKERT_COLORS = ['','#ef4444','#f97316','#eab308','#22c55e','#0ea5e9'];
  const grilleActive = useMemo(() => grilleAvecTirage(grille || GRILLE_IIP), []);
  const toutesQs = grilleActive.flatMap(axe =>
    (axe.questions||[]).map(q => ({ axe: axe.axe||axe.libelle, q: q.libelle||q, couleur: axe.couleur }))
  );

  const genererRapportPDF = () => {
    const liste = filtres.filter(c =>
      c.entretien_note || c.entretien_commentaire ||
      c.candidatures?.some(ca => ca.note_globale || ca.commentaire || Object.keys(ca.reponses_json||{}).length > 0)
    );
    if (liste.length === 0 && !confirm('Aucun entretien enregistré. Générer quand même la liste des candidats ?')) return;
    const tous = liste.length > 0 ? liste : filtres;

    const blockQ = (rep) => toutesQs.map((item, i) => {
      const r = rep[i] || {};
      if (r.disabled || (!r.note && !r.commentaire)) return '';
      const lbl = LIKERT_LABELS[r.note] || '';
      const col = LIKERT_COLORS[r.note] || '#6b7280';
      return `<tr>
        <td style="padding:2px 5px;color:#6b7280;font-size:8pt;border-bottom:1px solid #f1f5f9;width:17%">${item.axe.replace(/Axe \d+ — /,'')}</td>
        <td style="padding:2px 5px;font-size:8.5pt;border-bottom:1px solid #f1f5f9">${item.q}</td>
        <td style="padding:2px 5px;text-align:center;white-space:nowrap;border-bottom:1px solid #f1f5f9;width:17%">${r.note?`<span style="background:${col};color:white;padding:1px 6px;border-radius:10px;font-size:8pt;font-weight:700">${r.note} — ${lbl}</span>`:'—'}</td>
        <td style="padding:2px 5px;font-size:8pt;color:#374151;border-bottom:1px solid #f1f5f9;width:22%">${r.commentaire||''}</td>
      </tr>`;
    }).join('');

    const headerQ = `<table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:4px"><thead><tr style="background:#f1f5f9">
      <th style="padding:3px 5px;text-align:left;color:#374151">Axe</th>
      <th style="padding:3px 5px;text-align:left;color:#374151">Question</th>
      <th style="padding:3px 5px;text-align:center;color:#374151">Réponse</th>
      <th style="padding:3px 5px;text-align:left;color:#374151">Notes</th>
    </tr></thead><tbody>`;

    const candidatHtml = c => {
      const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || '—';
      const stLabel = [...new Set((c.candidatures||[]).map(ca => STATUT[ca.statut]?.label||ca.statut))].join(', ') || 'À voir';

      // Coordonnées + profil
      const coords = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;font-size:9pt;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #f1f5f9">
        ${c.email?`<div><b>E-mail :</b> ${c.email}</div>`:''}
        ${c.telephone?`<div><b>Tél. :</b> ${c.telephone}</div>`:''}
        ${c.fonction?`<div><b>Fonction :</b> ${c.fonction}</div>`:''}
        ${c.notes?`<div style="grid-column:1/-1"><b>Profil :</b> <em>${c.notes}</em></div>`:''}
      </div>`;

      // Cours envisagés avec statut + note
      const coursBlock = (c.candidatures||[]).length ? `
        <div style="margin-bottom:8px">
          <div style="font-size:8pt;font-weight:700;color:${BLEU};text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Cours envisagés</div>
          <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
            <thead><tr style="background:#f1f5f9">
              <th style="padding:2px 5px;text-align:left">Cours</th>
              <th style="padding:2px 5px;text-align:left;width:12%">Section</th>
              <th style="padding:2px 5px;text-align:center;width:14%">Statut</th>
              <th style="padding:2px 5px;text-align:right;width:10%">Note /5</th>
            </tr></thead>
            <tbody>${(c.candidatures||[]).map((ca,i)=>{
              const st = STATUT[ca.statut]||STATUT.a_voir;
              return `<tr style="background:${i%2===0?'white':'#f8fafc'}">
                <td style="padding:2px 5px">${ca.cours_nom||ca.ue_nom||`UE ${ca.ue_num}`}</td>
                <td style="padding:2px 5px;color:#6b7280">${ca.section||''}</td>
                <td style="padding:2px 5px;text-align:center"><span style="background:${st.bg};color:${st.color};padding:1px 5px;border-radius:10px;font-size:7.5pt;font-weight:600">${st.label}</span></td>
                <td style="padding:2px 5px;text-align:right;font-weight:700">${ca.note_globale!=null?ca.note_globale:'—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : '';

      // Entretien exploratoire (libre)
      const repLibre = c.entretien_reponses || {};
      const hasLibre = c.entretien_note || c.entretien_commentaire || Object.values(repLibre).some(r=>r&&(r.note>0||r.commentaire));
      const entretienLibre = hasLibre ? (() => {
        const nc = c.entretien_note; const col = nc>=4?'#15803d':nc>=3?'#d97706':'#b91c1c';
        const rows = blockQ(repLibre);
        return `<div style="margin-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <div style="font-size:8pt;font-weight:700;color:${BLEU};text-transform:uppercase;letter-spacing:1px">Entretien exploratoire</div>
            ${nc!=null?`<span style="background:${col};color:white;padding:1px 10px;border-radius:12px;font-size:9pt;font-weight:700">Moyenne : ${nc}/5</span>`:''}
          </div>
          ${rows?headerQ+rows+`</tbody></table>`:''}
          ${c.entretien_commentaire?`<div style="background:#f8fafc;border-left:3px solid ${TURQ};padding:4px 8px;font-size:8.5pt;margin-top:4px"><b>Bilan :</b> ${c.entretien_commentaire}</div>`:''}
          ${(()=>{const niveaux=(c.reflexif_niveaux||[]).length?c.reflexif_niveaux:c.reflexif_niveau?[c.reflexif_niveau]:[];return niveaux.length?`<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${niveaux.map(v=>{const r=LIKERT_REFLEXIF.find(x=>x.val===v);return r?`<span style="background:${r.color};color:white;padding:2px 10px;border-radius:10px;font-size:8.5pt;font-weight:700">${r.val} — ${r.label}</span>`:'';}).join('')}</div>`:'';})()}
          ${c.reflexif_commentaire?`<div style="font-size:8pt;color:#374151;margin-top:2px"><b>Observations :</b> ${c.reflexif_commentaire}</div>`:''}
        </div>`;
      })() : '';

      // Entretiens par cours
      const entretiensCours = (c.candidatures||[]).filter(ca=>ca.note_globale||ca.commentaire||Object.keys(ca.reponses_json||{}).length).map(ca=>{
        const nc = ca.note_globale; const col = nc>=4?'#15803d':nc>=3?'#d97706':'#b91c1c';
        const rows = blockQ(ca.reponses_json||{});
        return `<div style="margin-bottom:6px;background:#f8fafc;border-radius:4px;padding:5px 8px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
            <div style="font-size:8.5pt;font-weight:700;color:#374151">Entretien — ${ca.cours_nom||ca.ue_nom||`UE ${ca.ue_num}`} <span style="font-weight:400;color:#6b7280">${ca.section||''}</span></div>
            ${nc!=null?`<span style="background:${col};color:white;padding:1px 8px;border-radius:10px;font-size:8.5pt;font-weight:700">${nc}/5</span>`:''}
          </div>
          ${rows?`<table style="width:100%;border-collapse:collapse;font-size:8pt"><thead><tr style="background:#e8edf5">
            <th style="padding:2px 5px;text-align:left">Axe</th><th style="padding:2px 5px;text-align:left">Question</th>
            <th style="padding:2px 5px;text-align:center">Réponse</th><th style="padding:2px 5px;text-align:left">Notes</th>
          </tr></thead><tbody>${rows}</tbody></table>`:''}
          ${ca.commentaire?`<div style="margin-top:3px;font-size:8pt;color:#374151"><b>Bilan :</b> ${ca.commentaire}</div>`:''}
        </div>`;
      }).join('');

      return `<div style="page-break-inside:avoid;margin-bottom:8mm;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
        <div style="background:${BLEU};color:white;padding:6px 10px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <span style="font-size:11.5pt;font-weight:700">${nom}</span>
            ${c.fonction?`<span style="font-size:9pt;opacity:.8;margin-left:10px">${c.fonction}</span>`:''}
          </div>
          <span style="font-size:8pt;opacity:.8">${stLabel}</span>
        </div>
        <div style="padding:8px 10px">${coords}${docsRemisBlock}${coursBlock}${entretienLibre}${entretiensCours}</div>
      </div>`;
    };

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Rapport entretiens</title>
<style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,sans-serif;color:#1a1a2e;font-size:9pt}@media print{@page{size:A4;margin:12mm}}</style>
</head><body><div style="padding:5mm">
<div style="border-bottom:3px solid ${TURQ};padding-bottom:5px;margin-bottom:7mm;display:flex;justify-content:space-between;align-items:flex-end">
  <div>
    <div style="font-size:7pt;letter-spacing:3px;text-transform:uppercase;color:${TURQ};font-weight:700">Institut Ilya Prigogine · Recrutement</div>
    <div style="font-size:16pt;color:${BLEU};font-weight:700;margin-top:2px">Rapport d'entretiens</div>
    <div style="font-size:9pt;color:#555">${tous.length} candidat${tous.length>1?'s':''} · ${new Date().toLocaleDateString('fr-BE',{day:'2-digit',month:'long',year:'numeric'})}</div>
  </div>
  <div style="text-align:right;font-size:8pt;color:#999">Confidentiel — usage interne</div>
</div>
${tous.map(candidatHtml).join('')}
</div></body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Autorisez les pop-ups pour imprimer.'); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };

  // Synchroniser avec les actions du rail
  useEffect(() => { if (nouveauOpen) setNouveau(true); }, [nouveauOpen]);
  useEffect(() => {
    if (rapportOpen) {
      genererRapportPDF();
      onRapportClose?.();
    }
  }, [rapportOpen]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-title text-iip-gold whitespace-nowrap">
          Candidats <span className="text-base font-normal text-gray-400">({candidats.length})</span>
        </h1>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="flex-1 max-w-xs text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-iip-turquoise" />
      </div>

      {filtres.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-12">
          {search ? 'Aucun candidat trouvé.' : 'Aucun candidat pour l\'instant.'}
        </div>
      )}

      {/* Liste style membres du personnel */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtres.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-10">Aucun candidat.</div>
        )}
        {filtres.map((c, idx) => {
          const entretienNote = c.entretien_note;
          const noteColor = entretienNote >= 4 ? '#15803d' : entretienNote >= 3 ? '#d97706' : '#b91c1c';
          const docs = Object.values(c.docs_remis || {}).filter(Boolean).length;
          return (
            <button key={c.id} onClick={() => setFiche(c)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
              {/* Avatar initiales */}
              <div className="w-9 h-9 rounded-full bg-iip-blue/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-iip-blue">
                {(c.prenom?.[0] || '').toUpperCase()}{(c.nom?.[0] || '').toUpperCase()}
              </div>
              {/* Infos principales */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">
                    {c.prenom ? `${c.prenom} ${c.nom}` : c.nom}
                  </span>
                  {c.candidatures?.map((ca, i) => {
                    const st = STATUT[ca.statut] || STATUT.a_voir;
                    return (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                        style={{ background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    );
                  })}
                </div>
                <div className="text-xs text-gray-400 truncate mt-0.5">
                  {c.candidatures?.map(ca => ca.cours_nom || ca.ue_nom || `UE ${ca.ue_num}`).join(', ') || '—'}
                </div>
              </div>
              {/* Méta droite */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {docs > 0 && (
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                    <IconFileCv size={12} /> {docs}
                  </span>
                )}
                {entretienNote != null && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: noteColor }}>
                    {entretienNote}/5
                  </span>
                )}
                <IconChevronRight size={14} className="text-gray-300" />
              </div>
            </button>
          );
        })}
      </div>

      {fiche && (
        <FicheCandidat
          candidat={fiche}
          fonctions={fonctions}
          grille={grille}
          onClose={() => setFiche(null)}
          onSaved={() => { setFiche(null); onRecharger(); }}
        />
      )}

      {nouveau && (
        <ModalNouveauCandidat
          onClose={() => { setNouveau(false); onNouveauClose?.(); }}
          onSaved={() => { setNouveau(false); onNouveauClose?.(); onRecharger(); }}
        />
      )}
    </div>
  );
}

/* ── Fiche candidat (modale d'édition) ── */

/* ── Fiche candidat (modale d'édition) — 4 cadres ── */
function FicheCandidat({ candidat, fonctions, grille, onClose, onSaved }) {
  const annee = getAnnee();
  const [f, setF] = useState({
    nom: candidat.nom || '', prenom: candidat.prenom || '',
    email: candidat.email || '', telephone: candidat.telephone || '',
    docs_remis: candidat.docs_remis || {},
    qualifications: candidat.qualifications || [],
    disponibilites: candidat.disponibilites || {},
  });
  const [docs, setDocs]         = useState(candidat.documents || []);
  const [candidatures, setCandidatures] = useState(candidat.candidatures || []);
  const [busy, setBusy]         = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ajoutQual, setAjoutQual] = useState(false);
  const [entretienLibre, setEntretienLibre] = useState(false);
  const [entretienCand, setEntretienCand]   = useState(null);
  const [visionneur, setVisionneur]         = useState(null);

  // Sélecteur cascadant cours envisagés
  const [sections, setSections] = useState([]);
  const [selSection, setSelSection] = useState('');
  const [ues, setUes] = useState([]);
  const [selUE, setSelUE] = useState('');
  const [cours, setCours] = useState([]);
  const [selCours, setSelCours] = useState('');
  const [loadingUE, setLoadingUE] = useState(false);
  const [ajoutBusy, setAjoutBusy] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json()).then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selSection) { setUes([]); setSelUE(''); setCours([]); return; }
    setLoadingUE(true);
    fetch(`/api/ref/ue?section=${encodeURIComponent(selSection)}&annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json()).then(d => setUes(Array.isArray(d) ? d : []))
      .catch(() => setUes([])).finally(() => setLoadingUE(false));
  }, [selSection]);

  useEffect(() => {
    if (!selUE) { setCours([]); setSelCours(''); return; }
    fetch(`/api/ref/ue/${selUE}?annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json()).then(ue => { setCours(ue.cours || []); setSelCours(''); })
      .catch(() => {});
  }, [selUE]);

  const rechargerCandidatures = async () => {
    const updated = await af('/candidats');
    const me = updated.find(c => c.id === candidat.id);
    if (me) setCandidatures(me.candidatures || []);
  };

  const enregistrer = async () => {
    setBusy(true);
    try { await af(`/candidats/${candidat.id}`, { method: 'PATCH', body: JSON.stringify(f) }); onSaved(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const [analyseCv, setAnalyseCv] = useState(false);

  const appliquerAnalyseSurFiche = (apercu) => {
    setF(prev => ({
      ...prev,
      prenom:         apercu.prenom      || prev.prenom,
      nom:            apercu.nom         || prev.nom,
      email:          apercu.email       || prev.email,
      telephone:      apercu.telephone   || prev.telephone,
      notes:          apercu.notes       || prev.notes,
      fonction:       apercu.fonction    || prev.fonction,
      qualifications: apercu.qualifications?.length
        ? [...(prev.qualifications || []), ...apercu.qualifications]
        : prev.qualifications,
    }));
  };

  const supprimerCandidat = async () => {
    if (!confirm(`Supprimer définitivement ${candidat.nom} et tous ses documents/candidatures ?`)) return;
    await af(`/candidats/${candidat.id}`, { method: 'DELETE' });
    onSaved();
  };

  const ajouterDoc = async (type, file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('fichier', file);
      await fetch(`/api/recrutement/candidats/${candidat.id}/documents?type=${type}`,
        { method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: fd });
      const updated = await af('/candidats');
      const me = updated.find(c => c.id === candidat.id);
      if (me) setDocs(me.documents || []);
    } catch (e) { alert(e.message); } finally { setUploading(false); }
  };

  const supprimerDoc = async (docId) => {
    await af(`/documents/${docId}`, { method: 'DELETE' });
    setDocs(d => d.filter(x => x.id !== docId));
  };

  const ouvrirDoc = async (docId, nom) => {
    const resp = await fetch(`/api/recrutement/documents/${docId}`, { headers: { Authorization: `Bearer ${tok()}` } });
    const blob = await resp.blob();
    setVisionneur({ url: URL.createObjectURL(blob), nom, mime: blob.type });
  };

  // Early returns
  if (visionneur) return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex flex-col"
      onClick={() => { URL.revokeObjectURL(visionneur.url); setVisionneur(null); }}>
      <div className="flex items-center justify-between px-4 py-2 bg-white flex-shrink-0"
        onClick={e => e.stopPropagation()}>
        <span className="text-sm font-medium text-iip-blue truncate">{visionneur.nom}</span>
        <button onClick={() => { URL.revokeObjectURL(visionneur.url); setVisionneur(null); }}
          className="text-gray-400 hover:text-gray-700 ml-3"><IconX size={20} /></button>
      </div>
      <div className="flex-1 overflow-hidden" onClick={e => e.stopPropagation()}>
        {visionneur.mime && visionneur.mime.startsWith('image/') && (
          <div className="h-full flex items-center justify-center p-4">
            <img src={visionneur.url} alt={visionneur.nom} className="max-h-full max-w-full object-contain rounded shadow-lg" />
          </div>
        )}
        {visionneur.mime === 'application/pdf' && (
          <iframe src={visionneur.url} title={visionneur.nom} className="w-full h-full border-none" />
        )}
      </div>
    </div>
  );

  if (entretienLibre) return (
    <EntretienLibre
      candidat={candidat}
      grille={grille}
      onClose={() => setEntretienLibre(false)}
      onSaved={async (reponses, note, commentaire, rn, rc, dispo, dispoRemarque) => {
        await af(`/candidats/${candidat.id}`, { method: 'PATCH', body: JSON.stringify({
          entretien_reponses: reponses, entretien_note: note, entretien_commentaire: commentaire,
          reflexif_niveau: rn, reflexif_commentaire: rc,
          disponibilites: { ...dispo, _remarque: dispoRemarque },
        })});
        setEntretienLibre(false); onSaved();
      }}
    />
  );

  if (entretienCand) return (
    <EntretienModal
      candidature={entretienCand}
      poste={{ nom_cours: entretienCand.cours_nom||entretienCand.ue_nom, ue_num: entretienCand.ue_num, section: entretienCand.section }}
      annee={annee} qIA={[]} grille={grille}
      onClose={() => setEntretienCand(null)}
      onSaved={() => { setEntretienCand(null); rechargerCandidatures(); }}
    />
  );

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 pt-8 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl" onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10">
          <h3 className="text-lg font-bold text-iip-blue">Fiche candidat</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => genererFicheIndividuelle(candidat, grille)}
              className="text-xs border border-gray-300 text-gray-500 hover:bg-gray-50 rounded px-2.5 py-1.5 flex items-center gap-1.5">
              🖨 PDF
            </button>
            {docs.some(d => d.type === 'cv') && (
              <button onClick={() => setAnalyseCv(true)}
                title="Analyser le CV avec Lucie"
                className="text-xs border border-iip-blue/40 bg-iip-blue/5 text-iip-blue hover:bg-iip-blue/10 rounded px-2.5 py-1.5 flex items-center gap-1.5 font-medium">
                🤖 Analyser CV
              </button>
            )}
            <button onClick={() => setEntretienLibre(true)}
              title="Mener l'entretien"
              className="text-xs border border-iip-turquoise text-iip-blue hover:bg-iip-turquoise/10 rounded px-2.5 py-1.5 flex items-center gap-1.5 font-medium">
              <IconClipboardText size={14} /> Entretien
              {candidat.entretien_note && (
                <span className="bg-iip-turquoise/20 text-iip-blue rounded-full px-1.5 font-bold">
                  {candidat.entretien_note}/5
                </span>
              )}
            </button>
            <button onClick={supprimerCandidat} className="text-gray-300 hover:text-red-500 p-1"><IconTrash size={17} /></button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><IconX size={20} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* ── Cadre 1 : Coordonnées ── */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Coordonnées</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Prénom</div>
                <input value={f.prenom} onChange={e => setF({ ...f, prenom: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Nom *</div>
                <input value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">E-mail</div>
                <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Téléphone</div>
                <input value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
              </div>
            </div>
          </div>

          {/* ── Cadre 2 : Documents remis ── */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Documents remis</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {DOCS_REMIS_LIST.map(doc => {
                const checked = !!f.docs_remis?.[doc.key];
                return (
                  <label key={doc.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition select-none ${
                      checked ? 'bg-green-50 border-green-300 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    <input type="checkbox" checked={checked}
                      onChange={e => setF({ ...f, docs_remis: { ...f.docs_remis, [doc.key]: e.target.checked } })}
                      className="w-4 h-4 accent-green-600 flex-shrink-0" />
                    <span className="text-base leading-none flex-shrink-0">{doc.emoji}</span>
                    <span className="text-xs font-medium leading-tight">{doc.label}</span>
                    {checked && <span className="ml-auto text-green-500 text-xs flex-shrink-0">✓</span>}
                  </label>
                );
              })}
            </div>
            {/* Zone de dépôt */}
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-400 font-medium mb-2">Fichiers déposés ({docs.length})</div>
              {docs.length > 0 && (
                <div className="space-y-1 mb-2">
                  {docs.map(d => (
                    <div key={d.id} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
                      <IconFileCv size={13} className="text-iip-blue flex-shrink-0" />
                      <span className="text-gray-400 w-20 flex-shrink-0">{TYPES_DOC[d.type]?.label || d.type}</span>
                      <button onClick={() => ouvrirDoc(d.id, d.nom_original)}
                        className="text-iip-blue hover:underline truncate flex-1 text-left">{d.nom_original}</button>
                      <button onClick={() => supprimerDoc(d.id)} className="text-gray-200 hover:text-red-400 flex-shrink-0">
                        <IconTrash size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {Object.entries(TYPES_DOC).map(([type, { label, accept }]) => (
                  <label key={type} className="cursor-pointer text-[11px] border border-dashed border-gray-300 rounded px-2 py-1 hover:border-iip-turquoise flex items-center gap-1 text-gray-500">
                    <IconUpload size={11} /> {label}
                    <input type="file" accept={accept} className="hidden" onChange={e => {
                      const file = e.target.files?.[0]; if (file) { ajouterDoc(type, file); e.target.value = ''; }
                    }} />
                  </label>
                ))}
                {uploading && <span className="text-[11px] text-iip-blue animate-pulse">Envoi…</span>}
              </div>
            </div>
          </div>

          {/* ── Cadre 3 : Diplômes et titres ── */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Diplômes &amp; Titres</div>
              <button type="button" onClick={() => setAjoutQual(true)}
                className="text-xs bg-iip-blue text-white px-2.5 py-1 rounded-lg flex items-center gap-1 hover:opacity-90">
                <IconPlus size={11} /> Ajouter
              </button>
            </div>
            {f.qualifications.length === 0 && (
              <div className="text-xs text-gray-400 italic">Aucun titre ou diplôme renseigné.</div>
            )}
            <div className="space-y-1.5">
              {f.qualifications.map((q, i) => {
                const niv = NIVEAUX_ETUDE.find(n => n.val === q.niveau);
                const dip = Object.values(DIPLOMES_FWB).flat().find(d => d.val === q.diplome);
                const tit = TITRES_PEDA.find(t => t.val === q.titre_peda);
                return (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      {niv && <div className="text-xs font-semibold text-iip-blue">{niv.label}</div>}
                      {dip && <div className="text-xs text-gray-700">{dip.label}</div>}
                      {!dip && q.diplome_autre && <div className="text-xs text-gray-700 italic">{q.diplome_autre}</div>}
                      {tit && <div className="text-xs text-iip-turquoise font-medium">{tit.label}</div>}
                    </div>
                    <button type="button" onClick={() => setF({ ...f, qualifications: f.qualifications.filter((_, j) => j !== i) })}
                      className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5">
                      <IconX size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Cadre 4 : Cours envisagés ── */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Cours envisagés ({candidatures.length})
            </div>
            {candidatures.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {candidatures.map((ca, i) => {
                  const st = STATUT[ca.statut] || STATUT.a_voir;
                  return (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">
                            {ca.cours_nom || ca.ue_nom || `UE ${ca.ue_num}`}
                          </div>
                          <div className="text-xs text-gray-400">{ca.section} · {ca.annee_scolaire}</div>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ color: st.color, background: st.bg }}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEntretienCand(ca)}
                          className="text-xs border border-iip-turquoise text-iip-blue hover:bg-iip-turquoise/10 rounded px-2 py-1 flex items-center gap-1 font-medium">
                          <IconClipboardText size={12} /> Lancer l'entretien
                        </button>
                        <button onClick={async () => {
                          if (!confirm('Retirer ce cours ?')) return;
                          await af(`/candidatures/${ca.id}`, { method: 'DELETE' });
                          rechargerCandidatures();
                        }} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                          <IconX size={12} /> Retirer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Sélecteur */}
            <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2 bg-gray-50/50">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ajouter un cours</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Section</div>
                  <select value={selSection} onChange={e => { setSelSection(e.target.value); setSelUE(''); setSelCours(''); }}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-8">
                    <option value="">— choisir —</option>
                    {sections.map(s => <option key={s.code} value={s.code}>{s.code}{s.libelle ? ` — ${s.libelle}` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">UE {loadingUE && <span className="text-gray-400">…</span>}</div>
                  <select value={selUE} onChange={e => { setSelUE(e.target.value); setSelCours(''); }}
                    disabled={!selSection || ues.length === 0}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-8 disabled:bg-gray-100 disabled:text-gray-400">
                    <option value="">— choisir —</option>
                    {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
                  </select>
                </div>
                {cours.length > 1 && (
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 mb-0.5">Cours</div>
                    <select value={selCours} onChange={e => setSelCours(e.target.value)}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-8">
                      <option value="">— choisir —</option>
                      {cours.map(c => <option key={c.cours_code} value={c.cours_code}>{c.cours_nom} ({c.ct_pp})</option>)}
                    </select>
                  </div>
                )}
              </div>
              <button
                disabled={!selUE || (cours.length > 1 && !selCours) || ajoutBusy}
                onClick={async () => {
                  if (!selUE) return;
                  const codeCours = selCours || (cours.length === 1 ? cours[0].cours_code : '');
                  setAjoutBusy(true);
                  try {
                    await af(`/candidats/${candidat.id}/candidatures`, { method: 'POST', body: JSON.stringify({
                      annee, ue_num: selUE, code_cours: codeCours, section: selSection,
                    })});
                    setSelSection(''); setSelUE(''); setSelCours('');
                    rechargerCandidatures();
                  } catch (e) {
                    if (e.message.includes('409') || e.message.includes('déjà')) alert('Ce candidat est déjà associé à ce cours.');
                    else alert(e.message);
                  } finally { setAjoutBusy(false); }
                }}
                className="w-full text-xs bg-iip-blue text-white rounded px-3 py-1.5 hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5">
                <IconPlus size={12} /> {ajoutBusy ? 'Ajout…' : 'Rattacher ce cours'}
              </button>
            </div>
          </div>

          {/* ── Disponibilités (résumé en bas) ── */}
          {(() => {
            const dispo = candidat.disponibilites || {};
            const jours = ['Lun','Mar','Mer','Jeu','Ven','Sam'];
            const cr = [{key:'matin',l:'8–12'},{key:'midi',l:'12–17'},{key:'soir',l:'17–22'}];
            const hasIndisp = jours.some(j => cr.some(c => dispo[`${j}_${c.key}`]));
            if (!hasIndisp && !dispo._remarque) return null;
            return (
              <div className="border border-orange-200 bg-orange-50/40 rounded-xl p-4">
                <div className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-2">Indisponibilités</div>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead><tr>
                      <th className="w-16 text-right pr-2 text-gray-400 font-normal" />
                      {jours.map(j => <th key={j} className="text-center px-1.5 text-gray-500 font-semibold pb-1 w-10">{j}</th>)}
                    </tr></thead>
                    <tbody>
                      {cr.map(cren => (
                        <tr key={cren.key}>
                          <td className="text-right pr-2 text-gray-500 py-0.5 font-medium">{cren.l}</td>
                          {jours.map(j => {
                            const indisp = !!dispo[`${j}_${cren.key}`];
                            return (
                              <td key={j} className="text-center py-0.5 px-0.5">
                                <span className={`inline-block w-9 h-6 rounded text-[10px] font-bold leading-6 ${
                                  indisp ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-300'
                                }`}>{indisp ? '✗' : ''}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dispo._remarque && <div className="text-xs text-orange-700 mt-1.5 italic">{dispo._remarque}</div>}
              </div>
            );
          })()}

        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-white rounded-b-xl">
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" icon={IconCheck} onClick={enregistrer} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Btn>
        </div>
      </div>
    </div>

      {ajoutQual && (
        <ModalAjoutQualification
          onClose={() => setAjoutQual(false)}
          onAjouter={(q) => { setF(prev => ({ ...prev, qualifications: [...(prev.qualifications || []), q] })); }}
          onFermer={() => setAjoutQual(false)}
        />
      )}
      {analyseCv && (
        <ModalAnalyseCv
          onClose={() => setAnalyseCv(false)}
          candidatExistant={candidat}
          onResultat={(apercu) => { appliquerAnalyseSurFiche(apercu); setAnalyseCv(false); }}
        />
      )}
    </>
  );
}

/* ── Semainier d'indisponibilités ── */
const JOURS_SEM = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const CRENEAUX_SEM = [
  { key: 'matin', label: '8h–12h' },
  { key: 'midi',  label: '12h–17h' },
  { key: 'soir',  label: '17h–22h' },
];

function SemainierIndisp({ value = {}, onChange }) {
  const toggle = (jour, creneau) => {
    const k = `${jour}_${creneau}`;
    onChange({ ...value, [k]: !value[k] });
  };
  return (
    <div>
      <p className="text-xs text-gray-500 mb-2 italic">Cochez les créneaux où le candidat n'est <strong>pas disponible</strong>.</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead><tr>
            <th className="w-20 text-right pr-3 text-gray-400 font-normal pb-1" />
            {JOURS_SEM.map(j => <th key={j} className="text-center px-1.5 text-gray-500 font-semibold pb-1 w-12">{j}</th>)}
          </tr></thead>
          <tbody>
            {CRENEAUX_SEM.map(cr => (
              <tr key={cr.key}>
                <td className="text-right pr-3 text-gray-500 py-1 font-medium whitespace-nowrap">{cr.label}</td>
                {JOURS_SEM.map(j => {
                  const indisp = !!value[`${j}_${cr.key}`];
                  return (
                    <td key={j} className="text-center py-1 px-1">
                      <button type="button" onClick={() => toggle(j, cr.key)}
                        className={`w-10 h-7 rounded border-2 transition text-[11px] font-bold ${
                          indisp ? 'bg-orange-400 text-white border-orange-400' : 'bg-white text-gray-200 border-gray-200 hover:border-orange-300'
                        }`}>
                        {indisp ? '✗' : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <input value={value._remarque || ''} onChange={e => onChange({ ...value, _remarque: e.target.value })}
        placeholder="Contrainte particulière (ex : disponible uniquement en Q1, déplacement limité…)"
        className="w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-600 placeholder-gray-400 mt-2" />
    </div>
  );
}


function ModalAjoutQualification({ onClose, onAjouter, onFermer }) {
  // Chaque ligne = { niveau, diplome, diplome_autre, titre_peda }
  const [lignes, setLignes] = useState([{ niveau: '', diplome: '', diplome_autre: '', titre_peda: '' }]);

  const majLigne = (i, champ, val) => setLignes(l => l.map((x, j) => j === i ? { ...x, [champ]: val, ...(champ === 'niveau' ? { diplome: '', diplome_autre: '' } : {}) } : x));
  const ajouterLigne = () => setLignes(l => [...l, { niveau: '', diplome: '', diplome_autre: '', titre_peda: '' }]);
  const retirerLigne = (i) => setLignes(l => l.filter((_, j) => j !== i));

  const valider = () => {
    const valides = lignes.filter(l => l.niveau || l.titre_peda);
    if (!valides.length) { alert("Complétez au moins un titre ou un niveau d'étude."); return; }
    valides.forEach(q => onAjouter(q));
    (onFermer || onClose)();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-iip-blue">Titres et diplômes</h3>
            <p className="text-xs text-gray-400 mt-0.5">Ajoutez une ligne par titre ou diplôme. Encodez directement depuis le CV.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={18} /></button>
        </div>

        <div className="overflow-auto flex-1 px-5 py-4 space-y-3">
          {lignes.map((l, i) => {
            const dipListe = DIPLOMES_FWB[l.niveau] || [];
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500">Titre {i + 1}</div>
                  {lignes.length > 1 && (
                    <button onClick={() => retirerLigne(i)} className="text-gray-300 hover:text-red-400">
                      <IconX size={14} />
                    </button>
                  )}
                </div>

                {/* Ligne 1 : Niveau d'étude (pills horizontales) */}
                <div className="mb-2">
                  <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Niveau (CFC)</div>
                  <div className="flex flex-wrap gap-1">
                    {NIVEAUX_ETUDE.map(n => (
                      <button key={n.val} type="button"
                        onClick={() => majLigne(i, 'niveau', l.niveau === n.val ? '' : n.val)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                          l.niveau === n.val
                            ? 'bg-iip-blue text-white border-iip-blue font-semibold'
                            : 'border-gray-300 text-gray-600 hover:border-iip-blue/50 bg-white'
                        }`}>
                        {n.label.split('—')[0].trim()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ligne 2 : Diplôme (select + champ libre) */}
                {l.niveau && (
                  <div className="mb-2 flex gap-2 items-start">
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Diplôme</div>
                      {dipListe.length > 0 ? (
                        <select value={l.diplome} onChange={e => majLigne(i, 'diplome', e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-8">
                          <option value="">— choisir —</option>
                          {dipListe.map(d => <option key={d.val} value={d.val}>{d.label}</option>)}
                          <option value="__autre__">Autre (préciser ci-dessous)</option>
                        </select>
                      ) : null}
                      {(!l.diplome || l.diplome === '__autre__' || dipListe.length === 0) && (
                        <input value={l.diplome_autre} onChange={e => majLigne(i, 'diplome_autre', e.target.value)}
                          placeholder="Préciser le diplôme…"
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 h-8 mt-1" />
                      )}
                    </div>
                  </div>
                )}

                {/* Ligne 3 : Titre pédagogique (pills) */}
                <div>
                  <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Titre pédagogique (optionnel)</div>
                  <div className="flex flex-wrap gap-1">
                    {TITRES_PEDA.map(t => (
                      <button key={t.val} type="button"
                        onClick={() => majLigne(i, 'titre_peda', l.titre_peda === t.val ? '' : t.val)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                          l.titre_peda === t.val
                            ? 'bg-iip-turquoise text-white border-iip-turquoise font-semibold'
                            : 'border-gray-300 text-gray-600 hover:border-iip-turquoise/50 bg-white'
                        }`}>
                        {t.label.split('—')[0].trim()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          <button onClick={ajouterLigne}
            className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-400 hover:border-iip-blue hover:text-iip-blue flex items-center justify-center gap-1.5 transition">
            <IconPlus size={13} /> Ajouter un autre titre ou diplôme
          </button>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center flex-shrink-0">
          <div className="text-xs text-gray-400">
            {lignes.filter(l => l.niveau || l.titre_peda).length} titre{lignes.filter(l => l.niveau || l.titre_peda).length > 1 ? 's' : ''} complété{lignes.filter(l => l.niveau || l.titre_peda).length > 1 ? 's' : ''}
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" icon={IconCheck} onClick={valider}>
              Enregistrer ({lignes.filter(l => l.niveau || l.titre_peda).length})
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Nouveau candidat sans poste ── */
/* ══════════════════════ ANALYSE CV PAR LUCIE ══════════════════════ */

async function analyserCvAvecLucie(pdfBase64) {
  const DIPLOMES_PLAT = Object.values(DIPLOMES_FWB).flat();
  const systemPrompt = `Tu es un assistant RH de l'Institut Ilya Prigogine (enseignement supérieur pour adultes, Bruxelles).
Tu analyses des CV de candidats enseignants et retournes UNIQUEMENT un objet JSON valide, sans markdown, sans explication.

Structure JSON attendue :
{
  "prenom": "string ou null",
  "nom": "string ou null",
  "email": "string ou null",
  "telephone": "string ou null",
  "notes": "string — résumé du profil en 2-3 phrases",
  "qualifications": [
    {
      "niveau": "CESS|BES|BES_PLUS|BAC|MASTER|DOCTORAT ou null",
      "diplome": "code parmi la liste ou null",
      "diplome_autre": "intitulé exact si pas dans la liste ou null",
      "titre_peda": "AESI|AESS|CAP|CAPAES|AUCUN ou null"
    }
  ],
  "fonction": "string décrivant la fonction/spécialité principale ou null"
}

Codes diplômes disponibles : ${DIPLOMES_PLAT.map(d => d.val + ':' + d.label).join(' | ')}
Titres pédagogiques : AESI, AESS, CAP, CAPAES
Niveaux : CESS=4, BES=infirmier brevet, BES_PLUS=brevet sup, BAC=bachelier, MASTER=master, DOCTORAT

Si une information n'est pas trouvée, mets null. Pour les diplômes, essaie de faire correspondre au code le plus précis.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [{
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        }, {
          type: 'text',
          text: 'Analyse ce CV et retourne le JSON demandé.',
        }],
      }],
    }),
  });

  if (!response.ok) throw new Error('Erreur API Anthropic');
  const data = await response.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function ModalAnalyseCv({ onClose, onResultat, candidatExistant = null }) {
  const [fichier, setFichier]   = useState(null);
  const [analyse, setAnalyse]   = useState(null); // résultat JSON
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  // Champs éditables de la prévisualisation
  const [apercu, setApercu]     = useState(null);

  const lireFichier = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const analyser = async () => {
    if (!fichier) return;
    setLoading(true); setErr('');
    try {
      const b64 = await lireFichier(fichier);
      const res = await analyserCvAvecLucie(b64);
      setAnalyse(res);
      // Pré-remplir aperçu en fusionnant avec candidat existant
      setApercu({
        prenom:      res.prenom      || candidatExistant?.prenom      || '',
        nom:         res.nom         || candidatExistant?.nom          || '',
        email:       res.email       || candidatExistant?.email        || '',
        telephone:   res.telephone   || candidatExistant?.telephone    || '',
        notes:       res.notes       || candidatExistant?.notes        || '',
        fonction:    res.fonction    || candidatExistant?.fonction     || '',
        qualifications: res.qualifications?.filter(q => q.niveau || q.titre_peda) || [],
        _fichier: fichier,
      });
    } catch (e) {
      setErr('Impossible d\'analyser ce CV : ' + e.message);
    } finally { setLoading(false); }
  };

  const confirmer = () => {
    if (!apercu) return;
    onResultat(apercu, fichier);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-iip-blue flex items-center gap-2">
              🤖 Analyser un CV avec Lucie
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Lucie lit le PDF et pré-remplit la fiche candidat. Tu valides avant d'enregistrer.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={18}/></button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">

          {/* Zone d'upload */}
          {!apercu && (
            <div>
              <label className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition ${
                fichier ? 'border-iip-turquoise bg-iip-turquoise/5' : 'border-gray-300 hover:border-iip-blue/50 bg-gray-50'
              }`}>
                <input type="file" accept="application/pdf" className="hidden"
                  onChange={e => { setFichier(e.target.files?.[0] || null); setAnalyse(null); setApercu(null); }} />
                {fichier ? (
                  <>
                    <div className="text-3xl">📄</div>
                    <div className="text-sm font-semibold text-iip-blue">{fichier.name}</div>
                    <div className="text-xs text-gray-400">{(fichier.size / 1024).toFixed(0)} Ko — cliquer pour changer</div>
                  </>
                ) : (
                  <>
                    <div className="text-4xl">📎</div>
                    <div className="text-sm text-gray-500">Glisser un CV (PDF) ou cliquer pour sélectionner</div>
                    <div className="text-xs text-gray-400">Format PDF uniquement</div>
                  </>
                )}
              </label>

              {err && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2 mt-2">{err}</div>}

              <button onClick={analyser} disabled={!fichier || loading}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-iip-blue text-white py-2.5 rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-40 transition">
                {loading ? (
                  <><span className="animate-spin">⏳</span> Lucie analyse le CV…</>
                ) : (
                  <>🤖 Analyser avec Lucie</>
                )}
              </button>
              {loading && (
                <div className="text-xs text-center text-gray-400 mt-2 animate-pulse">
                  Extraction des informations en cours… (10-20 secondes)
                </div>
              )}
            </div>
          )}

          {/* Prévisualisation et validation */}
          {apercu && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span className="text-green-600">✓</span>
                <span className="text-sm text-green-700 font-medium">CV analysé — vérifiez et corrigez si besoin</span>
                <button onClick={() => { setApercu(null); setAnalyse(null); }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600">Recommencer</button>
              </div>

              {/* Coordonnées */}
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Coordonnées</div>
                <div className="grid grid-cols-2 gap-3">
                  {[['prenom','Prénom'],['nom','Nom'],['email','E-mail'],['telephone','Téléphone']].map(([k,l]) => (
                    <div key={k}>
                      <div className="text-xs text-gray-500 mb-1">{l}</div>
                      <input value={apercu[k] || ''} onChange={e => setApercu(a => ({ ...a, [k]: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Fonction / spécialité</div>
                    <input value={apercu.fonction || ''} onChange={e => setApercu(a => ({ ...a, fonction: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 mb-1">Profil (résumé Lucie)</div>
                    <textarea value={apercu.notes || ''} onChange={e => setApercu(a => ({ ...a, notes: e.target.value }))}
                      rows={3} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none" />
                  </div>
                </div>
              </div>

              {/* Diplômes détectés */}
              <div className="border border-gray-200 rounded-xl p-4">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Diplômes & Titres détectés ({apercu.qualifications?.length || 0})
                </div>
                {apercu.qualifications?.length === 0 && (
                  <div className="text-xs text-gray-400 italic">Aucun diplôme détecté automatiquement.</div>
                )}
                <div className="space-y-2">
                  {apercu.qualifications?.map((q, i) => {
                    const niv = NIVEAUX_ETUDE.find(n => n.val === q.niveau);
                    const dip = Object.values(DIPLOMES_FWB).flat().find(d => d.val === q.diplome);
                    const tit = TITRES_PEDA.find(t => t.val === q.titre_peda);
                    return (
                      <div key={i} className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0 space-y-0.5">
                          {niv && <div className="text-xs font-semibold text-iip-blue">{niv.label}</div>}
                          {dip && <div className="text-xs text-gray-700">{dip.label}</div>}
                          {!dip && q.diplome_autre && <div className="text-xs text-gray-500 italic">{q.diplome_autre}</div>}
                          {tit && <div className="text-xs text-iip-turquoise font-medium">{tit.label}</div>}
                        </div>
                        <button type="button" onClick={() => setApercu(a => ({ ...a, qualifications: a.qualifications.filter((_, j) => j !== i) }))}
                          className="text-gray-300 hover:text-red-400 flex-shrink-0 mt-0.5"><IconX size={13}/></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          {apercu && (
            <Btn variant="primary" icon={IconCheck} onClick={confirmer}>
              Utiliser ces informations
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalNouveauCandidat({ onClose, onSaved }) {
  const [f, setF]       = useState({ nom: '', prenom: '', email: '', telephone: '', notes: '', fonction: '', qualifications: [] });
  const [busy, setBusy] = useState(false);
  const [analyseCv, setAnalyseCv] = useState(false);
  const [cvFile, setCvFile] = useState(null);

  const appliquerAnalyse = (apercu, fichier) => {
    setF(prev => ({
      ...prev,
      prenom:         apercu.prenom      || prev.prenom,
      nom:            apercu.nom         || prev.nom,
      email:          apercu.email       || prev.email,
      telephone:      apercu.telephone   || prev.telephone,
      notes:          apercu.notes       || prev.notes,
      fonction:       apercu.fonction    || prev.fonction,
      qualifications: apercu.qualifications?.length ? apercu.qualifications : prev.qualifications,
    }));
    setCvFile(fichier);
  };

  const soumettre = async () => {
    if (!f.nom.trim()) return;
    setBusy(true);
    try {
      const res = await af('/candidats', { method: 'POST', body: JSON.stringify(f) });
      // Uploader le CV si fourni
      if (cvFile && res?.id) {
        const fd = new FormData();
        fd.append('fichier', cvFile);
        await fetch(`/api/recrutement/candidats/${res.id}/documents?type=cv`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: fd,
        });
      }
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-iip-blue">Nouveau candidat</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={18}/></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Bouton analyse CV */}
          <button onClick={() => setAnalyseCv(true)}
            className="w-full flex items-center gap-3 p-3 bg-iip-blue/5 border-2 border-dashed border-iip-blue/30 hover:border-iip-blue/60 rounded-xl transition text-left">
            <span className="text-2xl">🤖</span>
            <div>
              <div className="text-sm font-semibold text-iip-blue">Analyser un CV avec Lucie</div>
              <div className="text-xs text-gray-400">Pré-remplissage automatique depuis un PDF</div>
            </div>
            {cvFile && <span className="ml-auto text-xs text-green-600 font-medium">✓ CV chargé</span>}
          </button>

          <div className="grid grid-cols-2 gap-3">
            {[['prenom','Prénom'],['nom','Nom *'],['email','E-mail'],['telephone','Téléphone']].map(([k,l]) => (
              <div key={k}>
                <div className="text-xs text-gray-500 mb-1">{l}</div>
                <input value={f[k]||''} onChange={e => setF({ ...f, [k]: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
              </div>
            ))}
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">Notes</div>
              <textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })}
                rows={2} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none" />
            </div>
          </div>

          {/* Qualifications si remplies par analyse */}
          {f.qualifications?.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-2">Diplômes détectés</div>
              {f.qualifications.map((q, i) => {
                const niv = NIVEAUX_ETUDE.find(n => n.val === q.niveau);
                const dip = Object.values(DIPLOMES_FWB).flat().find(d => d.val === q.diplome);
                const tit = TITRES_PEDA.find(t => t.val === q.titre_peda);
                return (
                  <div key={i} className="text-xs text-gray-600 py-0.5">
                    {[niv?.label, dip?.label||q.diplome_autre, tit?.label].filter(Boolean).join(' · ')}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" icon={IconCheck} onClick={soumettre} disabled={busy || !f.nom.trim()}>
            {busy ? 'Création…' : 'Créer'}
          </Btn>
        </div>
      </div>
    </div>
    {analyseCv && (
      <ModalAnalyseCv
        onClose={() => setAnalyseCv(false)}
        onResultat={appliquerAnalyse}
      />
    )}
    </>
  );
}


/* ══════════════════════ ÉDITEUR DE GRILLE ══════════════════════ */

const COULEURS_AXES = ['#0369a1','#7c3aed','#15803d','#b45309','#dc2626','#0891b2','#4f46e5','#b45309'];

function EditeurGrille({ grille, onSaved }) {
  const [axes, setAxes]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState('');
  const [dragAxe, setDragAxe] = useState(null); // index de l'axe en cours de drag
  const [dragOver, setDragOver] = useState(null); // index cible

  useEffect(() => {
    if (grille) setAxes(grille.map(a => ({
      ...a,
      questions: (a.questions || []).map(q => ({ ...q })),
    })));
  }, [grille]);

  if (!axes) return <div className="text-gray-400 py-8">Chargement de la grille…</div>;

  // Réordonner les axes par drag & drop
  const onDragStartAxe = (i) => setDragAxe(i);
  const onDragOverAxe  = (e, i) => { e.preventDefault(); setDragOver(i); };
  const onDropAxe      = (i) => {
    if (dragAxe === null || dragAxe === i) { setDragAxe(null); setDragOver(null); return; }
    setAxes(ax => {
      const nv = [...ax];
      const [moved] = nv.splice(dragAxe, 1);
      nv.splice(i, 0, moved);
      return nv;
    });
    setDragAxe(null); setDragOver(null);
  };

  const majAxe = (i, champ, val) => setAxes(ax => ax.map((a, j) => j === i ? { ...a, [champ]: val } : a));
  const majQ   = (ai, qi, val) => setAxes(ax => ax.map((a, j) => j !== ai ? a : {
    ...a, questions: a.questions.map((q, k) => k === qi ? { ...q, libelle: val } : q),
  }));
  const ajouterQ  = (ai) => setAxes(ax => ax.map((a, j) => j !== ai ? a : { ...a, questions: [...a.questions, { libelle: '', ordre: a.questions.length }] }));
  const retirerQ  = (ai, qi) => setAxes(ax => ax.map((a, j) => j !== ai ? a : { ...a, questions: a.questions.filter((_, k) => k !== qi) }));
  const ajouterAxe = () => setAxes(ax => [...ax, { libelle: 'Nouvel axe', couleur: COULEURS_AXES[ax.length % COULEURS_AXES.length], questions: [] }]);
  const retirerAxe = (i) => { if (!confirm('Supprimer cet axe et toutes ses questions ?')) return; setAxes(ax => ax.filter((_, j) => j !== i)); };

  const enregistrer = async () => {
    setSaving(true); setErr('');
    try {
      await af('/grille', { method: 'PUT', body: JSON.stringify(axes) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-title text-iip-gold">Grille d'entretien</h1>
          <p className="text-sm text-gray-400 mt-1">Modifiez les axes et questions — appliqués à tous les entretiens.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-green-600 flex items-center gap-1"><IconCheck size={15} /> Enregistré</span>}
          <Btn variant="primary" icon={IconCheck} onClick={enregistrer} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Btn>
        </div>
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-4">{err}</div>}

      <div className="space-y-4">
        {axes.map((axe, ai) => (
          <div key={ai}
            draggable
            onDragStart={() => onDragStartAxe(ai)}
            onDragOver={e => onDragOverAxe(e, ai)}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => onDropAxe(ai)}
            className={`border rounded-xl overflow-hidden transition ${
              dragOver === ai && dragAxe !== ai
                ? 'border-iip-turquoise shadow-md scale-[1.01]'
                : 'border-gray-200'
            }`}>
            {/* En-tête axe — poignée de drag + titre + couleur + suppr */}
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: axe.couleur }}>
              <span className="text-white/50 cursor-grab active:cursor-grabbing text-lg select-none" title="Glisser pour réordonner">⠿</span>
              <input
                value={axe.libelle}
                onChange={e => majAxe(ai, 'libelle', e.target.value)}
                className="flex-1 text-sm font-semibold text-white bg-transparent border-b border-white/30 focus:outline-none focus:border-white placeholder-white/50"
                placeholder="Intitulé de l'axe…"
              />
              <input type="color" value={axe.couleur} onChange={e => majAxe(ai, 'couleur', e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" title="Couleur" />
              <button onClick={() => retirerAxe(ai)} className="text-white/60 hover:text-white ml-1" title="Supprimer l'axe">
                <IconX size={16} />
              </button>
            </div>

            {/* Questions */}
            <div className="divide-y divide-gray-50 px-3 py-2 space-y-1.5">
              {axe.questions.map((q, qi) => (
                <div key={qi} className="flex items-start gap-2 pt-1.5">
                  <span className="text-xs text-gray-300 w-5 flex-shrink-0 mt-2">{qi + 1}.</span>
                  <textarea
                    value={q.libelle}
                    onChange={e => majQ(ai, qi, e.target.value)}
                    rows={2}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-iip-turquoise"
                    placeholder="Texte de la question…"
                  />
                  <button onClick={() => retirerQ(ai, qi)} className="text-gray-200 hover:text-red-400 flex-shrink-0 mt-1.5">
                    <IconX size={15} />
                  </button>
                </div>
              ))}
              <button onClick={() => ajouterQ(ai)}
                className="text-xs text-gray-400 hover:text-iip-blue flex items-center gap-1 pt-1.5 pb-0.5">
                <IconPlus size={13} /> Ajouter une question
              </button>
            </div>
          </div>
        ))}

        <button onClick={ajouterAxe}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-iip-turquoise hover:text-iip-blue flex items-center justify-center gap-1.5 transition">
          <IconPlus size={16} /> Ajouter un axe
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════ ENTRETIEN LIBRE (sans cours attaché) ══════════════════════ */

/* ══════════════════════ ENTRETIEN LIBRE — GUIDE D'ENTRETIEN ══════════════════════ */
function EntretienLibre({ candidat, grille, onClose, onSaved }) {
  const grilleActive = useMemo(() => grilleAvecTirage(grille || GRILLE_IIP), []);

  const toutesQs = grilleActive.flatMap(axe =>
    (axe.questions || []).map(q => ({ axe: axe.axe || axe.libelle, q: q.libelle || q, couleur: axe.couleur }))
  );

  const initReponses = () => toutesQs.reduce((acc, _, i) => {
    const saved = candidat.entretien_reponses || {};
    acc[i] = { note: saved[i]?.note ?? 0, commentaire: saved[i]?.commentaire ?? '', disabled: saved[i]?.disabled ?? false };
    return acc;
  }, {});

  const [reponses, setReponses] = useState(initReponses);
  const [commentaireGlobal, setCommentaireGlobal] = useState(candidat.entretien_commentaire || '');
  const [reflexifNiveaux, setReflexifNiveaux] = useState(() => { const v = candidat.reflexif_niveaux || candidat.reflexif_niveau; if (!v) return []; if (Array.isArray(v)) return v; try { const p = JSON.parse(v); return Array.isArray(p) ? p : [p].filter(Boolean); } catch { return v ? [v] : []; } });
  const [reflexifCommentaire, setReflexifCommentaire] = useState(candidat.reflexif_commentaire || '');
  const [dispo, setDispo] = useState(candidat.disponibilites || {});
  const [divers, setDivers]     = useState('');
  const [introTexte, setIntroTexte] = useState('');
  const [conclusionTexte, setConclusionTexte] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [section, setSection] = useState('intro');

  useEffect(() => {
    fetch('/api/config/entretien_intro', { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : null).then(d => d && setIntroTexte(d.valeur)).catch(() => {});
    fetch('/api/config/entretien_conclusion', { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.ok ? r.json() : null).then(d => d && setConclusionTexte(d.valeur)).catch(() => {});
  }, []);

  const notees = Object.values(reponses).filter(r => r.note > 0 && !r.disabled);
  const noteGlobale = notees.length > 0
    ? Math.round((notees.reduce((s, r) => s + r.note, 0) / notees.length) * 10) / 10
    : null;

  const majReponse = (i, champ, val) =>
    setReponses(r => ({ ...r, [i]: { ...r[i], [champ]: val } }));
  const toggleDisabled = (i) =>
    setReponses(r => ({ ...r, [i]: { ...r[i], disabled: !r[i]?.disabled } }));

  const sauvegarder = async () => {
    setSaving(true);
    try {
      await onSaved(reponses, noteGlobale, commentaireGlobal, reflexifNiveaux.length ? reflexifNiveaux : null, reflexifCommentaire || null, dispo, divers);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const parAxe = toutesQs.reduce((acc, { axe, q, couleur }, i) => {
    if (!acc[axe]) acc[axe] = { couleur, questions: [] };
    acc[axe].questions.push({ q, i });
    return acc;
  }, {});
  const axeKeys = Object.keys(parAxe);
  const nomComplet = [candidat.prenom, candidat.nom].filter(Boolean).join(' ');

  // Navigation entre sections
  const sections = ['intro', 'q-fixe', ...axeKeys, 'admin', 'bilan'];
  const idxCur = sections.indexOf(section);
  const prev = () => idxCur > 0 && setSection(sections[idxCur - 1]);
  const next = () => idxCur < sections.length - 1 && setSection(sections[idxCur + 1]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0"
        onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold text-iip-blue">Guide d'entretien — {nomComplet}</h3>
          <div className="text-xs text-gray-400">Entretien exploratoire · 30 min</div>
        </div>
        <div className="flex items-center gap-3">
          {noteGlobale != null && (
            <div className="text-right">
              <div className="text-xs text-gray-400">Moyenne</div>
              <div className="text-xl font-bold text-iip-blue">{noteGlobale}<span className="text-sm font-normal text-gray-400">/5</span></div>
            </div>
          )}
          <button onClick={async () => { await sauvegarder(); }}
            disabled={saving}
            className="bg-iip-blue text-white text-sm px-4 py-2 rounded-lg font-medium hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50">
            {saved ? <><IconCheck size={15} /> Sauvegardé</> : saving ? 'Sauvegarde…' : <><IconCheck size={15} /> Terminer</>}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><IconX size={20} /></button>
        </div>
      </div>

      {/* Barre de navigation */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-2 flex items-center gap-1 overflow-x-auto flex-shrink-0"
        onClick={e => e.stopPropagation()}>
        {sections.map((s, i) => {
          const labels = { intro: '📋 Intro', 'q-fixe': '1️⃣ Questions fixes', admin: '🗓 Administratif', bilan: '⭐ Bilan' };
          const label = labels[s] || `Axe ${axeKeys.indexOf(s) + 1}`;
          return (
            <button key={s} onClick={() => setSection(s)}
              className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition ${
                section === s ? 'bg-iip-blue text-white font-semibold' : 'bg-white text-gray-500 border border-gray-200 hover:border-iip-blue/50'
              }`}>{label}</button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto bg-gray-50" onClick={e => e.stopPropagation()}>
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">

          {/* ── Introduction ── */}
          {section === 'intro' && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-bold text-iip-blue mb-4">Introduction — à lire au candidat</h2>
              {introTexte ? (
                <div className="text-sm text-gray-700 leading-relaxed bg-iip-blue/5 border-l-4 border-iip-blue rounded-r-lg p-4 whitespace-pre-wrap">
                  {introTexte}
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic p-4">Chargement du texte d'introduction…</div>
              )}
              <div className="mt-3 text-xs text-gray-400 italic flex items-center justify-between">
                <span>Ce texte est confidentiel. Pour le modifier : Config. → Recrutement.</span>
              </div>
            </div>
          )}

          {/* ── Questions fixes ── */}
          {section === 'q-fixe' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 text-sm font-semibold text-white" style={{ background: '#1B2B4B' }}>
                  Questions fixes — posées à tous les candidats
                </div>
                <div className="divide-y divide-gray-100 px-4 py-3 space-y-4">
                  <div>
                    <div className="text-xs text-iip-blue font-bold uppercase tracking-wide mb-1">Q1 — Présentation (1 minute)</div>
                    <div className="text-sm text-gray-800 font-medium mb-2">« Pouvez-vous vous présenter en une minute ? Parcours, expérience principale, et ce qui vous a amené ici aujourd'hui. »</div>
                    <div className="text-xs text-gray-400 italic">Question ouverte — écoute active, prise de notes.</div>
                  </div>
                  <div className="pt-3">
                    <div className="text-xs text-iip-blue font-bold uppercase tracking-wide mb-1">Q2 — Motivation</div>
                    <div className="text-sm text-gray-800 font-medium mb-2">« Qu'est-ce qui vous motive à rejoindre l'équipe de l'Institut Ilya Prigogine ? Qu'espérez-vous y apporter, et qu'espérez-vous en retirer ? »</div>
                    <textarea placeholder="Notes sur la réponse…" rows={2}
                      onChange={e => majReponse(-1, 'q1_motiv', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:border-iip-turquoise" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Axes de la grille ── */}
          {axeKeys.includes(section) && (() => {
            const { couleur, questions } = parAxe[section];
            return (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 text-sm font-semibold text-white" style={{ background: couleur }}>{section}</div>
                <div className="divide-y divide-gray-100">
                  {questions.map(({ q, i }) => {
                    const disabled = !!reponses[i]?.disabled;
                    return (
                      <div key={i} className={`px-4 py-3 transition ${disabled ? 'opacity-40' : ''}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="text-sm text-gray-800 font-medium flex-1">{q}</div>
                          <button onClick={() => toggleDisabled(i)}
                            className={`text-[10px] px-2 py-0.5 rounded border flex-shrink-0 mt-0.5 transition ${
                              disabled ? 'border-gray-300 text-gray-400 bg-gray-50' : 'border-gray-200 text-gray-300 hover:border-orange-300 hover:text-orange-400'
                            }`}>
                            {disabled ? '+ Réactiver' : '✕ Non posée'}
                          </button>
                        </div>
                        {!disabled && (<>
                    <div className="flex gap-1.5 mb-1 flex-wrap">
                      {LIKERT.map(({ val, label, color }) => (
                        <button key={val} onClick={() => majReponse(i, 'note', reponses[i]?.note === val ? 0 : val)}
                          title={label}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition font-medium ${
                            reponses[i]?.note === val
                              ? 'text-white border-transparent shadow-sm'
                              : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                          style={reponses[i]?.note === val ? { background: color, borderColor: color } : {}}>
                          <span className="font-bold">{val}</span>
                          <span className="hidden sm:inline">{label}</span>
                        </button>
                      ))}
                    </div>
                    {reponses[i]?.note > 0 && (
                      <div className="text-[10px] text-gray-500 italic mb-2 pl-1">
                        {LIKERT.find(l => l.val === reponses[i].note)?.desc}
                      </div>
                    )}
                          <textarea value={reponses[i]?.commentaire || ''} onChange={e => majReponse(i, 'commentaire', e.target.value)}
                            placeholder="Notes sur la réponse…" rows={2}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 resize-none text-gray-600 placeholder-gray-300 focus:outline-none focus:border-iip-turquoise" />
                        </>)}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Administratif ── */}
          {section === 'admin' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 text-sm font-semibold text-white" style={{ background: '#b45309' }}>
                  Questions administratives
                </div>
                <div className="px-4 py-3 space-y-3 text-sm text-gray-700">
                  <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-800 font-medium">
                    Questions à poser systématiquement en fin d'entretien
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    <li className="flex gap-2"><span className="text-amber-500">→</span>Quel volume horaire hebdomadaire êtes-vous en mesure d'assumer ?</li>
                    <li className="flex gap-2"><span className="text-amber-500">→</span>Connaissez-vous les attendus de l'IIP quant au travail invisible (jury, TFE, encadrement) ?</li>
                    <li className="flex gap-2"><span className="text-amber-500">→</span>Pour les encadrants de stage : pouvez-vous vous déplacer dans les milieux partenaires ?</li>
                    <li className="flex gap-2"><span className="text-amber-500">→</span>Avez-vous des contraintes spécifiques de jours ou d'horaires ?</li>
                  </ul>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-iip-blue mb-3">Indisponibilités</div>
                <SemainierIndisp value={dispo} onChange={setDispo} />
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-iip-blue mb-2">Divers / autres remarques</div>
                <textarea value={divers} onChange={e => setDivers(e.target.value)}
                  placeholder="Tout autre élément pertinent noté pendant l'entretien…" rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-iip-turquoise" />
              </div>
            </div>
          )}

          {/* ── Bilan & Appréciation globale ── */}
          {section === 'bilan' && (
            <div className="space-y-4">

              {/* Mot de conclusion */}
              {conclusionTexte && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <h2 className="text-base font-bold text-iip-blue mb-4">Mot de fin — à lire au candidat</h2>
                  <div className="text-sm text-gray-700 leading-relaxed bg-iip-blue/5 border-l-4 border-iip-blue rounded-r-lg p-4 whitespace-pre-wrap">
                    {conclusionTexte}
                  </div>
                  <div className="mt-2 text-xs text-gray-400 italic">Pour modifier ce texte : Config. → Recrutement.</div>
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-iip-blue mb-2">Bilan global de l'entretien</div>
                <textarea value={commentaireGlobal} onChange={e => setCommentaireGlobal(e.target.value)}
                  placeholder="Impression générale, points forts, réserves, recommandation finale…" rows={4}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-iip-turquoise" />
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-sm font-semibold text-teal-800">Appréciation du niveau réflexif</div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {LIKERT_REFLEXIF.map(({ val, label, desc, color }) => (
                    <button key={val} type="button"
                      onClick={() => setReflexifNiveaux(prev => prev.includes(val) ? prev.filter(x=>x!==val) : [...prev, val])}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 text-left transition ${
                        reflexifNiveaux.includes(val) ? 'text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      style={reflexifNiveaux.includes(val) ? { background: color, borderColor: color } : {}}>
                      <span className={`font-bold text-lg w-6 flex-shrink-0 ${reflexifNiveaux.includes(val) ? 'text-white' : 'text-gray-400'}`}>{val}</span>
                      <div>
                        <div className="font-semibold text-sm">{label}</div>
                        <div className={`text-xs ${reflexifNiveaux.includes(val) ? 'text-white/80' : 'text-gray-400'}`}>{desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {reflexifNiveaux.length > 0 && (
                  <textarea value={reflexifCommentaire} onChange={e => setReflexifCommentaire(e.target.value)}
                    placeholder="Observations : exemples concrets, nuances…" rows={2}
                    className="w-full text-sm border border-teal-200 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:border-teal-400 bg-white mt-3" />
                )}

                {/* Synthèse notes */}
                {noteGlobale != null && (
                  <div className="mt-3 pt-3 border-t border-teal-200 flex items-center justify-between">
                    <div className="text-xs text-teal-700">
                      {notees.length} question{notees.length > 1 ? 's' : ''} évaluée{notees.length > 1 ? 's' : ''} sur {toutesQs.length}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-teal-600">Moyenne générale</div>
                        <div className="text-2xl font-bold text-iip-blue">{noteGlobale}<span className="text-sm font-normal text-gray-400">/5</span></div>
                      </div>
                      <button onClick={sauvegarder} disabled={saving}
                        className="text-sm bg-iip-blue text-white px-5 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                        <IconCheck size={14} /> Sauvegarder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation bas de page */}
          <div className="flex justify-between pt-2">
            <button onClick={prev} disabled={idxCur === 0}
              className="text-sm text-gray-500 hover:text-iip-blue disabled:opacity-30 flex items-center gap-1">
              ← Précédent
            </button>
            {idxCur < sections.length - 1 ? (
              <button onClick={next}
                className="text-sm bg-iip-blue text-white px-4 py-1.5 rounded-lg hover:opacity-90 flex items-center gap-1">
                Suivant →
              </button>
            ) : (
              <button onClick={sauvegarder} disabled={saving}
                className="text-sm bg-green-600 text-white px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                <IconCheck size={14} /> Terminer &amp; Sauvegarder
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


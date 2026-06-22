import { useEffect, useState } from 'react';
import {
  IconBriefcase, IconUserPlus, IconArrowLeft, IconTrash, IconPlus,
  IconFileCv, IconExternalLink, IconUpload, IconSparkles,
  IconCheck, IconX, IconUsersGroup, IconDownload, IconClipboardText,
  IconLayoutColumns,
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

export default function Recrutement() {
  const [postes, setPostes]     = useState([]);
  const [poste, setPoste]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [filtre, setFiltre]     = useState('');
  const [vue, setVue]           = useState('postes');
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
        sousTitre={loading ? '…' : `${postes.length} cours à pourvoir`}
        sections={[
          { label: 'Vue', items: [
            { key: 'postes',    label: 'Cours à pourvoir',    icon: IconBriefcase,     actif: vue === 'postes',    onClick: () => setVue('postes') },
            { key: 'candidats', label: `Candidats (${candidats.length})`, icon: IconUsersGroup, actif: vue === 'candidats', onClick: () => setVue('candidats') },
            { key: 'parallele', label: 'Vue parallèle',       icon: IconLayoutColumns, actif: vue === 'parallele', onClick: () => setVue('parallele') },
            { key: 'grille',    label: 'Grille entretien',    icon: IconClipboardText, actif: vue === 'grille',    onClick: () => setVue('grille') },
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
        {vue === 'candidats' && <VueCandidatsGlobal candidats={candidats} fonctions={fonctions} onRecharger={() => { chargerCandidats(); chargerFonctions(); }} />}
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
        <Btn variant="primary" icon={IconUserPlus} onClick={() => setAjout(true)}>
          Ajouter un candidat
        </Btn>
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
  lettre:  { label: 'Lettre de motivation',  accept: '.pdf,.doc,.docx' },
  diplome: { label: 'Diplôme / Certificat',  accept: '.pdf,.jpg,.jpeg,.png' },
  annexe:  { label: 'Annexe',               accept: '*' },
};

function FormulaireCandidatIA({ annee, ue_num, code_cours, section, onSaved, onCancel }) {
  const [f, setF]               = useState({ nom: '', email: '', telephone: '', cv_url: '', notes: '' });
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
            { type: 'text', text: 'Extrais du CV. JSON strict sans backticks : {"nom":"prénom nom","email":"","telephone":"","notes":"profil en 1-2 phrases"}' }
          ]}]
        }),
      });
      const data = await resp.json();
      const info = JSON.parse((data.content || []).map(b => b.text || '').join('').trim());
      setF(prev => ({
        nom:       info.nom       || prev.nom,
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
  { val: 1, label: 'Insuffisant',   color: '#ef4444' },
  { val: 2, label: 'Faible',        color: '#f97316' },
  { val: 3, label: 'Satisfaisant',  color: '#eab308' },
  { val: 4, label: 'Bien',          color: '#22c55e' },
  { val: 5, label: 'Excellent',     color: '#0ea5e9' },
];

function EntretienModal({ candidature, poste, annee, qIA, grille, onClose, onSaved }) {
  const grilleActive = grille || GRILLE_IIP;
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
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  // Note globale = moyenne des notes saisies (ignorer les 0)
  const notees = Object.values(reponses).filter(r => r.note > 0);
  const noteGlobale = notees.length > 0
    ? Math.round((notees.reduce((s, r) => s + r.note, 0) / notees.length) * 10) / 10
    : null;

  const majReponse = (i, champ, val) =>
    setReponses(r => ({ ...r, [i]: { ...r[i], [champ]: val } }));

  const sauvegarder = async () => {
    setSaving(true);
    try {
      await af(`/candidatures/${candidature.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          reponses_json: reponses,
          commentaire: commentaireGlobal,
          note_globale: noteGlobale,
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
          <h3 className="text-base font-bold text-iip-blue">Entretien — {candidature.nom}</h3>
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
                {questions.map(({ q, i }) => (
                  <div key={i} className="px-4 py-3">
                    <div className="text-sm text-gray-800 font-medium mb-2">{q}</div>

                    {/* Likert */}
                    <div className="flex gap-1.5 mb-2 flex-wrap">
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

                    {/* Note */}
                    <textarea
                      value={reponses[i]?.commentaire || ''}
                      onChange={e => majReponse(i, 'commentaire', e.target.value)}
                      placeholder="Notes sur la réponse…"
                      rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 resize-none text-gray-600 placeholder-gray-300 focus:outline-none focus:border-iip-turquoise"
                    />
                  </div>
                ))}
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
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-iip-turquoise"
            />
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
      await af('/candidats', {
        method: 'POST',
        body: JSON.stringify({
          nom: cand.nom, email: cand.email, telephone: cand.telephone,
          cv_url: cand.cv_url, notes: cand.notes,
          annee, ue_num: poste.ue_num, code_cours: poste.code_cours, section: poste.section,
        }),
      });
      setFeedback(`${cand.nom} rattaché à ${poste.nom_cours || poste.ue_nom}`);
      setTimeout(() => setFeedback(''), 3000);
      onRecharger();
    } catch (e) {
      if (e.message.includes('déjà rattaché') || e.message.includes('UNIQUE')) {
        setFeedback(`${cand.nom} est déjà candidat pour ce cours`);
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
                    <div className="text-sm font-semibold text-iip-blue">{c.nom}</div>
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

/* ══════════════════════ VUE CANDIDATS GLOBALE ══════════════════════ */
function VueCandidatsGlobal({ candidats, fonctions, onRecharger }) {
  const [fiche, setFiche]   = useState(null); // candidat sélectionné
  const [search, setSearch] = useState('');
  const [nouveau, setNouveau] = useState(false);

  const filtres = search
    ? candidats.filter(c => c.nom.toLowerCase().includes(search.toLowerCase())
        || (c.email || '').toLowerCase().includes(search.toLowerCase()))
    : candidats;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-title text-iip-gold">
          Candidats <span className="text-base font-normal text-gray-400">({candidats.length})</span>
        </h1>
        <Btn variant="primary" icon={IconUserPlus} onClick={() => setNouveau(true)}>
          Nouveau candidat
        </Btn>
      </div>

      {/* Recherche */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher par nom ou e-mail…"
        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-iip-turquoise" />

      {filtres.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-12">
          {search ? 'Aucun candidat trouvé.' : 'Aucun candidat pour l\'instant.'}
        </div>
      )}

      <div className="grid gap-2">
        {filtres.map(c => (
          <button key={c.id} onClick={() => setFiche(c)}
            className="text-left border border-gray-200 bg-white rounded-lg px-4 py-3 hover:border-iip-turquoise hover:shadow-sm transition flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-iip-blue">{c.nom}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {[c.email, c.telephone].filter(Boolean).join(' · ') || '—'}
              </div>
              {c.candidatures?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {c.candidatures.map((ca, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: STATUT[ca.statut]?.bg || '#f3f4f6', color: STATUT[ca.statut]?.color || '#6b7280' }}>
                      {ca.cours_nom || ca.ue_nom || `UE ${ca.ue_num}`} · {STATUT[ca.statut]?.label || ca.statut}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 text-gray-300">
              {c.documents?.length > 0 && (
                <span className="text-xs text-gray-400 flex items-center gap-0.5">
                  <IconFileCv size={13} /> {c.documents.length}
                </span>
              )}
              <span className="text-xs">→</span>
            </div>
          </button>
        ))}
      </div>

      {fiche && (
        <FicheCandidat
          candidat={fiche}
          fonctions={fonctions}
          onClose={() => setFiche(null)}
          onSaved={() => { setFiche(null); onRecharger(); }}
        />
      )}

      {nouveau && (
        <ModalNouveauCandidat
          onClose={() => setNouveau(false)}
          onSaved={() => { setNouveau(false); onRecharger(); }}
        />
      )}
    </div>
  );
}

/* ── Fiche candidat (modale d'édition) ── */
function FicheCandidat({ candidat, fonctions, onClose, onSaved }) {
  const [f, setF] = useState({ nom: candidat.nom, email: candidat.email || '', telephone: candidat.telephone || '', cv_url: candidat.cv_url || '', notes: candidat.notes || '', fonction: candidat.fonction || '' });
  const [nouvelleF, setNouvelleF] = useState('');
  const [docs, setDocs]       = useState(candidat.documents || []);
  const [busy, setBusy]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [visionneur, setVisionneur] = useState(null);

  const enregistrer = async () => {
    setBusy(true);
    try {
      await af(`/candidats/${candidat.id}`, { method: 'PATCH', body: JSON.stringify(f) });
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const supprimerCandidat = async () => {
    if (!confirm(`Supprimer définitivement ${candidat.nom} et tous ses documents/candidatures ?`)) return;
    await af(`/candidats/${candidat.id}`, { method: 'DELETE' });
    onSaved();
  };

  const ajouterDoc = async (type, file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('fichier', file);
      await fetch(`/api/recrutement/candidats/${candidat.id}/documents?type=${type}`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: fd,
      });
      // Recharger les docs
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
        {visionneur.mime && !visionneur.mime.startsWith('image/') && visionneur.mime !== 'application/pdf' && (
          <div className="h-full flex flex-col items-center justify-center text-white gap-3">
            <IconFileCv size={40} className="opacity-40" />
            <div className="text-sm opacity-60">Ce format ne peut pas \u00eatre pr\u00e9visualis\u00e9</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 pt-12 overflow-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
          <h3 className="text-lg font-bold text-iip-blue">Fiche candidat</h3>
          <div className="flex items-center gap-2">
            <button onClick={supprimerCandidat} className="text-gray-300 hover:text-red-500 p-1" title="Supprimer le candidat">
              <IconTrash size={17} />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><IconX size={20} /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Infos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
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
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">Fonction / profil</div>
              <div className="flex gap-2">
                <select value={f.fonction} onChange={e => setF({ ...f, fonction: e.target.value })}
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 h-9">
                  <option value="">— choisir —</option>
                  {(fonctions || []).map(fn => <option key={fn.id} value={fn.libelle}>{fn.libelle}</option>)}
                </select>
                <input value={nouvelleF} onChange={e => setNouvelleF(e.target.value)}
                  placeholder="Autre…" className="w-28 text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
                {nouvelleF.trim() && (
                  <button onClick={async () => {
                    await af('/fonctions', { method: 'POST', body: JSON.stringify({ libelle: nouvelleF.trim() }) });
                    setF({ ...f, fonction: nouvelleF.trim() });
                    setNouvelleF('');
                  }} className="text-xs bg-iip-blue text-white px-2 py-1 rounded h-9">+ Ajouter</button>
                )}
              </div>
            </div>
              <input value={f.cv_url} onChange={e => setF({ ...f, cv_url: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">Notes / profil</div>
              <textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={3}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none" />
            </div>
          </div>

          {/* Documents */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents ({docs.length})</div>
            {docs.length > 0 && (
              <div className="space-y-1 mb-2">
                {docs.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
                    <IconFileCv size={13} className="text-iip-blue flex-shrink-0" />
                    <span className="text-gray-400 w-20 flex-shrink-0">{TYPES_DOC[d.type]?.label || d.type}</span>
                    <button onClick={() => ouvrirDoc(d.id, d.nom_original)}
                      className="text-iip-blue hover:underline truncate flex-1 text-left">{d.nom_original}</button>
                    <button onClick={() => supprimerDoc(d.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0">
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

          {/* Candidatures */}
          {candidat.candidatures?.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Candidatures ({candidat.candidatures.length})</div>
              <div className="space-y-1">
                {candidat.candidatures.map((ca, i) => {
                  const st = STATUT[ca.statut] || STATUT.a_voir;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-1.5 border border-gray-100">
                      <span className="text-gray-700">{ca.cours_nom || ca.ue_nom || `UE ${ca.ue_num}`} · {ca.section} · {ca.annee_scolaire}</span>
                      <span className="font-semibold px-2 py-0.5 rounded-full" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-xl">
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" icon={IconCheck} onClick={enregistrer} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Btn>

        
      </div>
    </div>
  );
}
/* ── Nouveau candidat sans poste ── */
function ModalNouveauCandidat({ onClose, onSaved }) {
  const [f, setF]   = useState({ nom: '', email: '', telephone: '', cv_url: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const soumettre = async () => {
    if (!f.nom.trim()) return;
    setBusy(true);
    try { await af('/candidats', { method: 'POST', body: JSON.stringify(f) }); onSaved(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-iip-blue mb-1">Nouveau candidat</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><div className="text-xs text-gray-500 mb-1">Nom *</div>
            <input value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" /></div>
          <div><div className="text-xs text-gray-500 mb-1">E-mail</div>
            <input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" /></div>
          <div><div className="text-xs text-gray-500 mb-1">Téléphone</div>
            <input value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value })} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" /></div>
          <div className="col-span-2"><div className="text-xs text-gray-500 mb-1">Notes</div>
            <textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} rows={2} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" icon={IconCheck} onClick={soumettre} disabled={busy}>Créer</Btn>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ ÉDITEUR DE GRILLE ══════════════════════ */
const COULEURS_AXES = ['#0369a1','#7c3aed','#15803d','#b45309','#dc2626','#0891b2','#4f46e5','#b45309'];

function EditeurGrille({ grille, onSaved }) {
  const [axes, setAxes]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState('');

  useEffect(() => {
    if (grille) setAxes(grille.map(a => ({
      ...a,
      questions: (a.questions || []).map(q => ({ ...q })),
    })));
  }, [grille]);

  if (!axes) return <div className="text-gray-400 py-8">Chargement de la grille…</div>;

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
          <div key={ai} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* En-tête axe */}
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: axe.couleur }}>
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

function ModalAnnonce({ poste, annee, onClose }) {
  const [annonce, setAnnonce] = useState('');
  const [loading, setLoading] = useState(true);
  const [copie, setCopie]     = useState(false);
  const [err, setErr]         = useState('');
  const [dlBusy, setDlBusy]   = useState(false);

  useEffect(() => { generer(); }, []);

  const generer = async () => {
    setLoading(true); setErr('');
    try {
      const ctx = await af(`/contexte?annee=${encodeURIComponent(annee)}&ue_num=${poste.ue_num}&section=${encodeURIComponent(poste.section)}`);
      const lignesAA = (ctx.aa || []).map(a => `- L'étudiant sera capable ${a.description}`).join('\n');
      const lignesCours = (ctx.cours || []).map(c => c.cours_nom).join(', ');

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800,
          messages: [{ role: 'user', content:
            `Rédige une annonce de recrutement pour l'Institut Ilya Prigogine (IIP), enseignement de promotion sociale, Bruxelles, réseau FELSI.

Poste : ${poste.nom_cours || poste.ue_nom} — Section ${poste.section} — Contrat ${poste.contrat_mdp || 'IIP'}
UE ${poste.ue_num}${ctx.ue ? ` — ${ctx.ue.ects || '?'} ECTS — ${ctx.ue.ue_quad || ''}` : ''}
Charge : ${poste.ue_per_cours || '?'} périodes cours${poste.ue_aut ? ` + ${poste.ue_aut} autonomie` : ''}
${lignesCours ? `Cours : ${lignesCours}` : ''}
${lignesAA ? `\nAcquis d'apprentissage :\n${lignesAA}` : ''}

Structure : 1.Contexte IIP 2.Mission 3.Profil recherché 4.Ce que nous offrons 5.Postuler (service.rh@institut-prigogine.be, 6 jours ouvrables).
Ton professionnel et inclusif. Environ 280 mots.`
          }]}),
      });
      const data = await resp.json();
      setAnnonce((data.content || []).map(b => b.text || '').join('').trim());
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const copier = () => { navigator.clipboard.writeText(annonce); setCopie(true); setTimeout(() => setCopie(false), 2000); };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-bold text-iip-blue">Annonce de recrutement</h3>
            <div className="text-xs text-gray-500">{poste.nom_cours || poste.ue_nom}</div>
          </div>
          <button onClick={onClose}><IconX size={20} className="text-gray-400" /></button>
        </div>
        <div className="p-5">
          {loading && <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
            <span className="animate-spin w-4 h-4 border-2 border-iip-blue border-t-transparent rounded-full" />
            Génération…
          </div>}
          {err && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{err}</div>}
          {annonce && (
            <>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-4 border border-gray-100">
                {annonce}
              </div>
              <div className="flex gap-2 mt-4 justify-end">
                <Btn variant="ghost" icon={IconCheck} onClick={copier}>{copie ? 'Copié !' : 'Copier'}</Btn>
                <Btn variant="secondary" icon={IconSparkles} onClick={generer}>Regénérer</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Champ({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
    </div>
  );
}

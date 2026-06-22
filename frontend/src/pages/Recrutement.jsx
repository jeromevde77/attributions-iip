import { useEffect, useState } from 'react';
import {
  IconBriefcase, IconUserPlus, IconArrowLeft, IconTrash,
  IconFileCv, IconExternalLink, IconUpload, IconSparkles,
  IconCheck, IconX, IconUsersGroup, IconDownload,
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
  const [poste, setPoste]       = useState(null); // poste sélectionné
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [filtre, setFiltre]     = useState(''); // filtre section
  const annee = getAnnee();

  const charger = () => {
    setLoading(true);
    af(`/postes?annee=${encodeURIComponent(annee)}`)
      .then(setPostes).catch(e => setErr(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { charger(); }, []);

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
        <FichePoste poste={poste} annee={annee} onBack={() => { setPoste(null); charger(); }} />
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
          { label: 'Section', items: [
            { key: 'all', label: 'Toutes', icon: IconBriefcase, actif: filtre === '', onClick: () => setFiltre('') },
            ...sections.map(s => ({
              key: s, label: s, icon: IconBriefcase, actif: filtre === s, onClick: () => setFiltre(s),
            })),
          ]},
        ]}
      />
      <div className="ml-16 p-4 md:p-6">
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
      </div>
    </div>
  );
}

/* ══════════════════════ FICHE POSTE ══════════════════════ */
function FichePoste({ poste, annee, onBack }) {
  const [candidats, setCandidats] = useState(poste.candidats || []);
  const [ajout, setAjout]         = useState(false);
  const [genAnnonce, setGenAnnonce] = useState(false);

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
          <CarteCandidatPoste key={c.id} candidature={c} onChange={recharger} />
        ))}
      </div>

      {genAnnonce && (
        <ModalAnnonce poste={poste} annee={annee} onClose={() => setGenAnnonce(false)} />
      )}
    </div>
  );
}

/* ══════════════════════ FORMULAIRE CANDIDAT + EXTRACTION CV ══════════════════════ */
const [visionneur, setVisionneur] = useState(null); // { url, nom, type }

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
    if (!blobUrl) URL.revokeObjectURL(url); // ne pas révoquer si c'est l'URL du visionneur
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
function CarteCandidatPoste({ candidature: c, onChange }) {
  const [open, setOpen]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const st = STATUT[c.statut] || STATUT.a_voir;
  const docs = c.documents || [];

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

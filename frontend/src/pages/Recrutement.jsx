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
function FormulaireCandidatIA({ annee, ue_num, code_cours, section, onSaved, onCancel }) {
  const [f, setF] = useState({ nom: '', email: '', telephone: '', cv_url: '', notes: '' });
  const [cvFile, setCvFile]   = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState('');

  // Extraction des infos du CV via IA (lecture du PDF en base64 + appel Claude)
  const extraireCV = async (file) => {
    setCvFile(file);
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
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extrais les informations suivantes de ce CV. Réponds UNIQUEMENT en JSON valide sans backticks : {"nom":"prénom nom complet","email":"","telephone":"","notes":"résumé en 1-2 phrases du profil et de l\'expérience pertinente"}' }
          ]}]
        }),
      });
      const data = await resp.json();
      const text = (data.content || []).map(b => b.text || '').join('').trim();
      const info = JSON.parse(text);
      setF(prev => ({
        ...prev,
        nom:       info.nom       || prev.nom,
        email:     info.email     || prev.email,
        telephone: info.telephone || prev.telephone,
        notes:     info.notes     || prev.notes,
      }));
    } catch (e) {
      setErr('Extraction impossible : ' + e.message);
    } finally {
      setExtracting(false);
    }
  };

  const soumettre = async () => {
    if (!f.nom.trim()) { setErr('Le nom est requis'); return; }
    setBusy(true); setErr('');
    try {
      const { id } = await af('/candidats', { method: 'POST',
        body: JSON.stringify({ ...f, annee, ue_num, code_cours, section }) });

      // Upload du CV si présent
      if (cvFile && id) {
        const fd = new FormData();
        fd.append('fichier', cvFile);
        await fetch(`/api/recrutement/candidats/${id}/cv`, {
          method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: fd,
        });
      }
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="border border-iip-turquoise/40 rounded-xl p-4 mb-4 bg-iip-turquoise/5 space-y-3">
      {/* Upload CV avec extraction IA */}
      <div className="border-2 border-dashed border-iip-turquoise/30 rounded-lg p-4 text-center">
        <label className="cursor-pointer">
          <div className="text-sm text-gray-600 mb-1">
            {extracting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-iip-blue border-t-transparent rounded-full inline-block" />
                Extraction des infos en cours…
              </span>
            ) : cvFile ? (
              <span className="text-iip-blue font-medium flex items-center justify-center gap-1">
                <IconFileCv size={16} /> {cvFile.name}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1 text-gray-500">
                <IconUpload size={16} /> Déposer le CV (PDF) — les infos seront extraites automatiquement
              </span>
            )}
          </div>
          <input type="file" accept="application/pdf" className="hidden"
            onChange={e => e.target.files?.[0] && extraireCV(e.target.files[0])} />
        </label>
      </div>

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
  const [open, setOpen] = useState(false);
  const st = STATUT[c.statut] || STATUT.a_voir;

  const supprimerCandidature = async () => {
    if (!confirm('Retirer ce candidat de ce poste ?')) return;
    await af(`/candidatures/${c.id}`, { method: 'DELETE' });
    onChange();
  };

  const majStatut = async (statut) => {
    await af(`/candidatures/${c.id}`, { method: 'PATCH', body: JSON.stringify({ statut }) });
    onChange();
  };

  return (
    <div className="border border-gray-200 bg-white rounded-lg">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-iip-blue">{c.nom}</div>
          <div className="text-xs text-gray-500">{[c.email, c.telephone].filter(Boolean).join(' · ') || '—'}</div>
          {c.notes && <div className="text-xs text-gray-500 mt-0.5 italic truncate max-w-md">{c.notes}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Sélecteur statut */}
          <select value={c.statut} onChange={e => majStatut(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1"
            style={{ color: st.color, background: st.bg }}>
            {Object.entries(STATUT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {/* CV */}
          {c.cv_path ? (
            <a href={`/api/recrutement/candidats/${c.candidat_id}/cv`} target="_blank" rel="noreferrer"
              className="text-xs border border-gray-200 rounded px-2 py-1 flex items-center gap-1 hover:bg-gray-50">
              <IconFileCv size={13} /> CV
            </a>
          ) : c.cv_url ? (
            <a href={c.cv_url} target="_blank" rel="noreferrer"
              className="text-xs border border-gray-200 rounded px-2 py-1 flex items-center gap-1 hover:bg-gray-50">
              <IconExternalLink size={13} /> CV
            </a>
          ) : null}
          <button onClick={supprimerCandidature} className="text-gray-300 hover:text-red-500 p-1">
            <IconX size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ MODAL ANNONCE IA ══════════════════════ */
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

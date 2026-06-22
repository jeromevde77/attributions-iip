import { useEffect, useState, useMemo } from 'react';
import {
  IconBriefcase, IconUserPlus, IconArrowLeft, IconTrash, IconPlus,
  IconFileCv, IconExternalLink, IconUpload, IconStar, IconDeviceFloppy,
  IconCheck, IconX, IconUsersGroup, IconClipboardText, IconSparkles,
} from '@tabler/icons-react';
import { PageHeader, Btn } from '../components/ui.jsx';
import { getAnnee } from '../lib/api.js';

const tok = () => localStorage.getItem('token');
const af = (url, opts = {}) =>
  fetch('/api/recrutement' + url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...(opts.headers || {}) },
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });

const BLEU = '#1B2B4B', TURQ = '#00AACC';
const STATUT_CAND = {
  a_voir:    { label: 'À voir',    color: '#6b7280', bg: '#f3f4f6' },
  entretien: { label: 'Entretien', color: '#0369a1', bg: '#e0f2fe' },
  retenu:    { label: 'Retenu',    color: '#15803d', bg: '#dcfce7' },
  ecarte:    { label: 'Écarté',    color: '#b91c1c', bg: '#fee2e2' },
};

export default function Recrutement() {
  const [postes, setPostes]       = useState([]);
  const [candidats, setCandidats] = useState([]);
  const [posteId, setPosteId]     = useState(null);   // null = vue liste
  const [vue, setVue]             = useState('postes'); // 'postes' | 'candidats'
  const [err, setErr]             = useState('');
  const annee = getAnnee();

  const chargerPostes    = () => af(`/postes?annee=${encodeURIComponent(annee)}`).then(setPostes).catch(e => setErr(e.message));
  const chargerCandidats = () => af('/candidats').then(setCandidats).catch(e => setErr(e.message));

  useEffect(() => { chargerPostes(); chargerCandidats(); }, []);

  if (posteId) return <DetailPoste id={posteId} onBack={() => { setPosteId(null); chargerPostes(); }}
                                   candidats={candidats} rechargerCandidats={chargerCandidats} annee={annee} />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHeader icon={IconBriefcase} titre="Recrutement"
        sous="Postes à pourvoir, candidats, grilles d'entretien et évaluations" />

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{err}</div>}

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[['postes', 'Postes', IconBriefcase], ['candidats', 'Candidats', IconUsersGroup]].map(([v, lbl, Icon]) => (
          <button key={v} onClick={() => setVue(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              vue === v ? 'border-iip-turquoise text-iip-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={16} /> {lbl}
          </button>
        ))}
      </div>

      {vue === 'postes'
        ? <VuePostes postes={postes} recharger={chargerPostes} onOuvrir={setPosteId} annee={annee} />
        : <VueCandidats candidats={candidats} recharger={chargerCandidats} />}
    </div>
  );
}

/* ═══════════════════════ VUE POSTES ═══════════════════════ */
function VuePostes({ postes, recharger, onOuvrir, annee }) {
  const [creation, setCreation] = useState(false);
  const [f, setF] = useState({ intitule: '', section: '', contrat: '', ue_num: '', description: '' });

  const creer = async () => {
    if (!f.intitule.trim()) return;
    await af('/postes', { method: 'POST', body: JSON.stringify({ ...f, annee_scolaire: annee }) });
    setF({ intitule: '', section: '', contrat: '', ue_num: '', description: '' });
    setCreation(false); recharger();
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Btn variant="primary" icon={IconPlus} onClick={() => setCreation(v => !v)}>Nouveau poste</Btn>
      </div>

      {creation && (
        <div className="border border-iip-turquoise/40 rounded-lg p-4 mb-4 bg-iip-turquoise/5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Intitulé du poste *" value={f.intitule} onChange={v => setF({ ...f, intitule: v })} placeholder="ex: Professeur de radiothérapie" />
            <Champ label="Section" value={f.section} onChange={v => setF({ ...f, section: v })} placeholder="ex: Imagerie médicale" />
            <div>
              <div className="text-xs text-gray-500 mb-1">Contrat</div>
              <select value={f.contrat} onChange={e => setF({ ...f, contrat: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9">
                <option value="">—</option><option value="IIP">IIP</option><option value="HELB">HELB</option>
              </select>
            </div>
            <Champ label="UE / cours visé" value={f.ue_num} onChange={v => setF({ ...f, ue_num: v })} placeholder="ex: UE 253" />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Description / profil recherché</div>
            <textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" rows={2} />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setCreation(false)}>Annuler</Btn>
            <Btn variant="primary" icon={IconCheck} onClick={creer}>Créer</Btn>
          </div>
        </div>
      )}

      {postes.length === 0
        ? <div className="text-sm text-gray-400 text-center py-10">Aucun poste pour l'instant.</div>
        : <div className="grid gap-2">
            {postes.map(p => (
              <button key={p.id} onClick={() => onOuvrir(p.id)}
                className="text-left border border-gray-200 rounded-lg px-4 py-3 hover:border-iip-turquoise hover:shadow-sm transition flex items-center justify-between">
                <div>
                  <div className="font-semibold text-iip-blue flex items-center gap-2">
                    {p.intitule}
                    {p.contrat && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: p.contrat === 'HELB' ? '#8B5CF6' : BLEU }}>{p.contrat}</span>}
                    {p.statut === 'cloture' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">Clôturé</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[p.section, p.ue_num].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-iip-blue">{p.nb_candidats}</div>
                  <div className="text-[10px] text-gray-400 uppercase">candidat{p.nb_candidats > 1 ? 's' : ''}</div>
                </div>
              </button>
            ))}
          </div>}
    </div>
  );
}

/* ═══════════════════════ VUE CANDIDATS ═══════════════════════ */
function VueCandidats({ candidats, recharger }) {
  const [creation, setCreation] = useState(false);
  const [f, setF] = useState({ nom: '', email: '', telephone: '', cv_url: '', notes: '' });

  const creer = async () => {
    if (!f.nom.trim()) return;
    await af('/candidats', { method: 'POST', body: JSON.stringify(f) });
    setF({ nom: '', email: '', telephone: '', cv_url: '', notes: '' });
    setCreation(false); recharger();
  };
  const supprimer = async (id) => {
    if (!confirm('Supprimer ce candidat et toutes ses candidatures ?')) return;
    await af(`/candidats/${id}`, { method: 'DELETE' }); recharger();
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Btn variant="primary" icon={IconUserPlus} onClick={() => setCreation(v => !v)}>Nouveau candidat</Btn>
      </div>
      {creation && (
        <div className="border border-iip-turquoise/40 rounded-lg p-4 mb-4 bg-iip-turquoise/5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Nom *" value={f.nom} onChange={v => setF({ ...f, nom: v })} />
            <Champ label="E-mail" value={f.email} onChange={v => setF({ ...f, email: v })} />
            <Champ label="Téléphone" value={f.telephone} onChange={v => setF({ ...f, telephone: v })} />
            <Champ label="Lien CV (Drive…)" value={f.cv_url} onChange={v => setF({ ...f, cv_url: v })} />
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setCreation(false)}>Annuler</Btn>
            <Btn variant="primary" icon={IconCheck} onClick={creer}>Créer</Btn>
          </div>
        </div>
      )}
      {candidats.length === 0
        ? <div className="text-sm text-gray-400 text-center py-10">Aucun candidat pour l'instant.</div>
        : <div className="grid gap-2">
            {candidats.map(c => (
              <div key={c.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-iip-blue">{c.nom}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[c.email, c.telephone].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {c.candidatures?.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {c.candidatures.map((ca, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{ca.poste_intitule}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <BoutonCV candidat={c} onChange={recharger} />
                  <button onClick={() => supprimer(c.id)} className="text-gray-300 hover:text-red-500"><IconTrash size={17} /></button>
                </div>
              </div>
            ))}
          </div>}
    </div>
  );
}

/* ═══════════════════════ DÉTAIL POSTE ═══════════════════════ */
function DetailPoste({ id, onBack, candidats, rechargerCandidats, annee }) {
  const [poste, setPoste]   = useState(null);
  const [err, setErr]       = useState('');
  const [onglet, setOnglet] = useState('candidats'); // 'candidats' | 'questions'
  const [evalCand, setEvalCand] = useState(null); // candidature en cours d'évaluation

  const charger = () => af(`/postes/${id}`).then(setPoste).catch(e => setErr(e.message));
  useEffect(() => { charger(); }, [id]);

  if (!poste) return <div className="max-w-5xl mx-auto px-4 py-6 text-gray-400">Chargement…</div>;

  const classement = [...(poste.candidatures || [])].sort((a, b) => {
    if (a.note_globale == null && b.note_globale == null) return 0;
    if (a.note_globale == null) return 1;
    if (b.note_globale == null) return -1;
    return b.note_globale - a.note_globale;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-iip-blue flex items-center gap-1 mb-3">
        <IconArrowLeft size={16} /> Retour aux postes
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-iip-blue flex items-center gap-2">
            {poste.intitule}
            {poste.contrat && <span className="text-xs font-bold px-2 py-0.5 rounded text-white" style={{ background: poste.contrat === 'HELB' ? '#8B5CF6' : BLEU }}>{poste.contrat}</span>}
          </h1>
          <div className="text-sm text-gray-500 mt-1">{[poste.section, poste.ue_num].filter(Boolean).join(' · ')}</div>
          {poste.description && <p className="text-sm text-gray-600 mt-2 max-w-2xl">{poste.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <BoutonAnnonce poste={poste} annee={annee} />
          <StatutPoste poste={poste} onChange={charger} />
        </div>
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{err}</div>}

      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[['candidats', `Candidats (${poste.candidatures?.length || 0})`, IconUsersGroup],
          ['questions', `Grille d'entretien (${poste.questions?.length || 0})`, IconClipboardText]].map(([v, lbl, Icon]) => (
          <button key={v} onClick={() => setOnglet(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
              onglet === v ? 'border-iip-turquoise text-iip-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={16} /> {lbl}
          </button>
        ))}
      </div>

      {onglet === 'questions'
        ? <GrilleQuestions poste={poste} onChange={charger} />
        : <CandidatsPoste poste={poste} classement={classement} candidats={candidats}
                          rechargerCandidats={rechargerCandidats} onChange={charger}
                          onEvaluer={setEvalCand} />}

      {evalCand && <ModalEvaluation candidature={evalCand} questions={poste.questions || []}
                                    onClose={() => setEvalCand(null)} onSaved={() => { setEvalCand(null); charger(); }} />}
    </div>
  );
}

/* ── Bouton + modale de génération d'annonce de recrutement ── */
function BoutonAnnonce({ poste, annee }) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [annonce, setAnnonce] = useState('');
  const [err, setErr]         = useState('');
  const [copie, setCopie]     = useState(false);

  const generer = async () => {
    setLoading(true); setErr(''); setAnnonce('');
    try {
      const params = new URLSearchParams({ annee });
      if (poste.section) params.append('section', poste.section);
      if (poste.ue_num)  params.append('ue_num', poste.ue_num);
      const ctx = await af(`/suggestions/contexte?${params}`);

      const lignesAA = (ctx.aa || []).map(a => `- L'étudiant sera capable ${a.description}`).join('\n');
      const lignesCours = (ctx.cours || []).map(c => c.cours_nom).join(', ');

      const prompt = `Tu es chargé de rédiger une annonce de recrutement pour l'Institut Ilya Prigogine (IIP), établissement d'enseignement de promotion sociale à Bruxelles, réseau FELSI.

Poste à pourvoir :
- Intitulé : ${poste.intitule}
- Section : ${poste.section || 'non précisée'}
- Contrat : ${poste.contrat || 'IIP'}
- UE / cours visé : ${poste.ue_num || 'non précisé'}${ctx.ue ? ` — ${ctx.ue.ue_nom} (${ctx.ue.ects || '?'} ECTS)` : ''}
- Description : ${poste.description || 'aucune'}

${lignesCours ? `Cours à enseigner : ${lignesCours}` : ''}

${lignesAA ? `Acquis d'apprentissage que le professeur devra faire atteindre aux étudiants :\n${lignesAA}` : ''}

Rédige une annonce de recrutement professionnelle et attrayante en français, structurée ainsi :
1. **Contexte** (2-3 phrases présentant l'IIP et le poste)
2. **Votre mission** (description des cours à donner, basée sur les AA ci-dessus)
3. **Profil recherché** (compétences disciplinaires, expérience, qualités pédagogiques)
4. **Ce que nous offrons** (conditions, flexibilité, environnement)
5. **Comment postuler** (envoyer CV + lettre de motivation à direction@institut-prigogine.be)

Ton : professionnel, chaleureux, inclusif. Longueur : environ 300 mots.`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await resp.json();
      const texte = (data.content || []).map(b => b.text || '').join('').trim();
      setAnnonce(texte);
    } catch (e) {
      setErr('Erreur : ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const copier = () => {
    navigator.clipboard.writeText(annonce);
    setCopie(true); setTimeout(() => setCopie(false), 2000);
  };

  return (
    <>
      <Btn variant="secondary" icon={IconSparkles} onClick={() => { setOpen(true); generer(); }}>
        Générer l'annonce
      </Btn>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-iip-blue">Annonce de recrutement</h3>
                <div className="text-xs text-gray-500">{poste.intitule} · générée par IA</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><IconX size={20} /></button>
            </div>
            <div className="p-5">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-iip-blue border-t-transparent rounded-full" />
                  Génération en cours…
                </div>
              )}
              {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
              {annonce && (
                <>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                    {annonce}
                  </div>
                  <div className="flex gap-2 mt-4 justify-end">
                    <Btn variant="ghost" icon={IconCheck} onClick={copier}>
                      {copie ? 'Copié !' : 'Copier le texte'}
                    </Btn>
                    <Btn variant="secondary" icon={IconSparkles} onClick={generer}>Regénérer</Btn>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatutPoste({ poste, onChange }) {
  const toggle = async () => {
    await af(`/postes/${poste.id}`, { method: 'PATCH', body: JSON.stringify({ statut: poste.statut === 'ouvert' ? 'cloture' : 'ouvert' }) });
    onChange();
  };
  return (
    <button onClick={toggle}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
        poste.statut === 'ouvert' ? 'border-green-300 text-green-700 bg-green-50' : 'border-gray-300 text-gray-500 bg-gray-50'}`}>
      {poste.statut === 'ouvert' ? '● Ouvert' : '○ Clôturé'}
    </button>
  );
}

/* ── Grille de questions réutilisable ── */
function GrilleQuestions({ poste, onChange }) {
  const [questions, setQuestions] = useState(poste.questions?.length ? poste.questions.map(q => ({ ...q })) : []);
  const [saved, setSaved]         = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr]         = useState('');
  const annee = getAnnee();

  const maj = (i, champ, val) => setQuestions(qs => qs.map((q, j) => j === i ? { ...q, [champ]: val } : q));
  const ajouter = () => setQuestions(qs => [...qs, { libelle: '', ponderation: 1, ordre: qs.length }]);
  const retirer = (i) => setQuestions(qs => qs.filter((_, j) => j !== i));
  const enregistrer = async () => {
    await af(`/postes/${poste.id}/questions`, { method: 'PUT', body: JSON.stringify({ questions: questions.map((q, i) => ({ ...q, ordre: i })) }) });
    setSaved(true); setTimeout(() => setSaved(false), 2000); onChange();
  };

  const suggerer = async () => {
    setGenLoading(true); setGenErr('');
    try {
      // 1. Récupérer le contexte pédagogique depuis la base
      const params = new URLSearchParams({ annee });
      if (poste.section) params.append('section', poste.section);
      if (poste.ue_num)  params.append('ue_num', poste.ue_num);
      const ctx = await af(`/suggestions/contexte?${params}`);

      // 2. Construire le prompt contextualisé
      const lignesUE = (ctx.ues || []).map(u => `- UE ${u.ue_num} : ${u.ue_nom}${u.ects ? ` (${u.ects} ECTS)` : ''}${u.ue_niv ? ` [${u.ue_niv}]` : ''}`).join('\n');
      const lignesCours = (ctx.cours || []).map(c => `- ${c.cours_nom} (${c.ct_pp || '?'}, ${c.cours_per || '?'} pér.)`).join('\n');
      const lignesAA = (ctx.aa || []).map(a => `- ${a.aa_code} : L'étudiant sera capable ${a.description}`).join('\n');

      const prompt = `Tu es expert en recrutement pour l'enseignement supérieur de promotion sociale en Belgique (Institut Ilya Prigogine, Bruxelles).

Contexte du poste à pourvoir :
- Intitulé : ${poste.intitule}
- Section : ${poste.section || 'non précisée'}
- Contrat : ${poste.contrat || 'non précisé'}
- UE / cours visé : ${poste.ue_num || 'non précisé'}
- Description : ${poste.description || 'aucune'}

${ctx.ue ? `UE ciblée : ${ctx.ue.ue_nom} (${ctx.ue.ects || '?'} ECTS, ${ctx.ue.ue_niv || ''}, réf. ${ctx.ue.et_ref || 'IIP'})` : ''}

${lignesUE ? `Programme de la section (extrait) :\n${lignesUE}` : ''}

${lignesCours ? `Cours de l'UE / section :\n${lignesCours}` : ''}

${lignesAA ? `Acquis d'apprentissage visés (ce que l'étudiant doit maîtriser) :\n${lignesAA}` : ''}

Génère une grille de 10 questions d'entretien pertinentes pour ce poste, réparties en catégories :
- Motivation et connaissance de l'établissement (2 questions)
- Compétences disciplinaires et pédagogiques (4 questions, en lien avec les cours/UE ci-dessus)
- Expérience pratique et professionnelle (2 questions)
- Soft skills et travail en équipe (2 questions)

Pour chaque question, précise une pondération (1.0 = normale, 1.5 = importante, 2.0 = critique).

Réponds UNIQUEMENT en JSON valide, sans backticks, sans commentaires, ce format exact :
{"questions":[{"libelle":"...","ponderation":1.0},...]}`; 

      // 3. Appel API Anthropic
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await resp.json();
      const text = (data.content || []).map(b => b.text || '').join('').trim();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.questions)) throw new Error('Format inattendu');

      // 4. Fusionner avec les questions existantes (ou remplacer si vides)
      const nouvelles = parsed.questions.map((q, i) => ({ libelle: q.libelle, ponderation: q.ponderation || 1.0, ordre: i }));
      setQuestions(q => q.length === 0 ? nouvelles : [...q, ...nouvelles]);
    } catch (e) {
      setGenErr('Erreur lors de la génération : ' + e.message);
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-500">Questions posées à chaque candidat lors de l'entretien. La pondération sert au calcul de la note.</p>
        <Btn variant="secondary" icon={genLoading ? null : IconSparkles} onClick={suggerer} disabled={genLoading}
          className="whitespace-nowrap">
          {genLoading ? <span className="flex items-center gap-1.5"><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-iip-blue border-t-transparent rounded-full" />Génération…</span> : 'Suggérer des questions'}
        </Btn>
      </div>
      {genErr && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-2">{genErr}</div>}
      {questions.map((q, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
          <input value={q.libelle} onChange={e => maj(i, 'libelle', e.target.value)}
            placeholder="Énoncé de la question…"
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5" />
          <div className="flex items-center gap-1" title="Pondération">
            <span className="text-[10px] text-gray-400">×</span>
            <input type="number" min="0.5" step="0.5" value={q.ponderation}
              onChange={e => maj(i, 'ponderation', parseFloat(e.target.value) || 1)}
              className="w-14 text-sm border border-gray-300 rounded px-2 py-1.5" />
          </div>
          <button onClick={() => retirer(i)} className="text-gray-300 hover:text-red-500"><IconX size={16} /></button>
        </div>
      ))}
      <div className="flex justify-between items-center pt-2">
        <Btn variant="ghost" icon={IconPlus} onClick={ajouter}>Ajouter une question</Btn>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-600 flex items-center gap-1"><IconCheck size={14} /> Enregistré</span>}
          <Btn variant="primary" icon={IconDeviceFloppy} onClick={enregistrer}>Enregistrer la grille</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Candidats d'un poste + classement ── */
function CandidatsPoste({ poste, classement, candidats, rechargerCandidats, onChange, onEvaluer }) {
  const [ajout, setAjout] = useState(false);
  const dispo = candidats.filter(c => !(poste.candidatures || []).some(ca => ca.candidat_id === c.id));

  const rattacher = async (candidat_id) => {
    await af('/candidatures', { method: 'POST', body: JSON.stringify({ candidat_id, poste_id: poste.id }) });
    setAjout(false); onChange();
  };
  const detacher = async (candidatureId) => {
    if (!confirm('Retirer ce candidat du poste ?')) return;
    await af(`/candidatures/${candidatureId}`, { method: 'DELETE' }); onChange();
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Btn variant="primary" icon={IconUserPlus} onClick={() => setAjout(v => !v)}>Rattacher un candidat</Btn>
      </div>
      {ajout && (
        <div className="border border-iip-turquoise/40 rounded-lg p-3 mb-4 bg-iip-turquoise/5">
          {dispo.length === 0
            ? <div className="text-sm text-gray-500">Tous les candidats existants sont déjà rattachés. Créez-en de nouveaux dans l'onglet « Candidats ».</div>
            : <div className="flex flex-wrap gap-2">
                {dispo.map(c => (
                  <button key={c.id} onClick={() => rattacher(c.id)}
                    className="text-sm border border-gray-300 rounded-full px-3 py-1 hover:border-iip-turquoise hover:bg-white">
                    + {c.nom}
                  </button>
                ))}
              </div>}
        </div>
      )}

      {classement.length === 0
        ? <div className="text-sm text-gray-400 text-center py-10">Aucun candidat rattaché à ce poste.</div>
        : <div className="grid gap-2">
            {classement.map((ca, rang) => {
              const st = STATUT_CAND[ca.statut] || STATUT_CAND.a_voir;
              return (
                <div key={ca.id} className="border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {ca.note_globale != null && (
                      <div className="flex flex-col items-center justify-center w-9 flex-shrink-0">
                        <span className="text-[9px] text-gray-400">#{rang + 1}</span>
                        <span className="text-base font-bold text-iip-blue">{Number(ca.note_globale).toFixed(1)}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-iip-blue truncate">{ca.nom}</div>
                      <div className="text-xs text-gray-500 truncate">{[ca.email, ca.telephone].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                    <BoutonCV candidat={ca} candidatId={ca.candidat_id} onChange={rechargerCandidats} />
                    <Btn variant="secondary" icon={IconStar} onClick={() => onEvaluer(ca)}>Évaluer</Btn>
                    <button onClick={() => detacher(ca.id)} className="text-gray-300 hover:text-red-500"><IconX size={17} /></button>
                  </div>
                </div>
              );
            })}
          </div>}
    </div>
  );
}

/* ── Bouton CV : upload PDF ou lien externe ── */
function BoutonCV({ candidat, candidatId, onChange }) {
  const id = candidatId || candidat.id;
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('fichier', file);
      await fetch(`/api/recrutement/candidats/${id}/cv`, {
        method: 'POST', headers: { Authorization: `Bearer ${tok()}` }, body: fd,
      }).then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erreur upload'); });
      onChange && onChange();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  if (candidat.cv_path) {
    return (
      <a href={`/api/recrutement/candidats/${id}/cv`} target="_blank" rel="noreferrer"
        className="text-xs text-iip-blue border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 flex items-center gap-1"
        title={candidat.cv_nom}>
        <IconFileCv size={14} /> CV
      </a>
    );
  }
  if (candidat.cv_url) {
    return (
      <a href={candidat.cv_url} target="_blank" rel="noreferrer"
        className="text-xs text-iip-blue border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 flex items-center gap-1">
        <IconExternalLink size={14} /> CV
      </a>
    );
  }
  return (
    <label className="text-xs text-gray-500 border border-dashed border-gray-300 rounded px-2 py-1 hover:bg-gray-50 cursor-pointer flex items-center gap-1">
      <IconUpload size={14} /> {busy ? '…' : 'CV'}
      <input type="file" accept="application/pdf" className="hidden" onChange={e => upload(e.target.files?.[0])} />
    </label>
  );
}

/* ── Modal d'évaluation d'entretien ── */
function ModalEvaluation({ candidature, questions, onClose, onSaved }) {
  const reponsesInit = (() => { try { return JSON.parse(candidature.reponses_json || '{}'); } catch { return {}; } })();
  const [reponses, setReponses] = useState(reponsesInit);
  const [statut, setStatut]     = useState(candidature.statut || 'entretien');
  const [commentaire, setComm]  = useState(candidature.commentaire || '');
  const [dateEnt, setDateEnt]   = useState(candidature.date_entretien || new Date().toISOString().slice(0, 10));
  const [busy, setBusy]         = useState(false);

  const majRep = (qid, champ, val) => setReponses(r => ({ ...r, [qid]: { ...(r[qid] || {}), [champ]: val } }));

  // Note globale pondérée /10 (chaque question notée /10)
  const noteCalc = useMemo(() => {
    if (!questions.length) return null;
    let somme = 0, poids = 0;
    for (const q of questions) {
      const n = parseFloat(reponses[q.id]?.note);
      if (!isNaN(n)) { somme += n * (q.ponderation || 1); poids += (q.ponderation || 1); }
    }
    return poids > 0 ? Math.round((somme / poids) * 10) / 10 : null;
  }, [reponses, questions]);

  const enregistrer = async () => {
    setBusy(true);
    try {
      await af(`/candidatures/${candidature.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ statut, note_globale: noteCalc, commentaire, date_entretien: dateEnt, reponses }),
      });
      onSaved();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-bold text-iip-blue">{candidature.nom}</h3>
            <div className="text-xs text-gray-500">Évaluation d'entretien</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><IconX size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Date d'entretien</div>
              <input type="date" value={dateEnt} onChange={e => setDateEnt(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Statut</div>
              <select value={statut} onChange={e => setStatut(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9">
                {Object.entries(STATUT_CAND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {questions.length > 0 ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grille de questions</div>
              {questions.map((q, i) => (
                <div key={q.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  <div className="text-sm text-gray-800 mb-2">{i + 1}. {q.libelle}
                    {q.ponderation !== 1 && <span className="text-[10px] text-gray-400 ml-1">(×{q.ponderation})</span>}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">Note</span>
                      <input type="number" min="0" max="10" step="0.5" value={reponses[q.id]?.note ?? ''}
                        onChange={e => majRep(q.id, 'note', e.target.value)}
                        className="w-16 text-sm border border-gray-300 rounded px-2 py-1" placeholder="/10" />
                    </div>
                    <input value={reponses[q.id]?.commentaire ?? ''} onChange={e => majRep(q.id, 'commentaire', e.target.value)}
                      placeholder="Remarque…" className="flex-1 text-sm border border-gray-200 rounded px-2 py-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400 italic">Aucune grille de questions définie pour ce poste — vous pouvez en créer une dans l'onglet « Grille d'entretien ».</div>
          )}

          <div>
            <div className="text-xs text-gray-500 mb-1">Bilan / commentaire global</div>
            <textarea value={commentaire} onChange={e => setComm(e.target.value)} rows={3}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between sticky bottom-0 bg-white">
          <div className="text-sm">
            {noteCalc != null && <span className="text-gray-500">Note pondérée : <strong className="text-iip-blue text-lg">{noteCalc}</strong> / 10</span>}
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" icon={IconDeviceFloppy} onClick={enregistrer} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Champ texte réutilisable ── */
function Champ({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 h-9" />
    </div>
  );
}

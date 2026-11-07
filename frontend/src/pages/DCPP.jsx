/**
 * DCPP.jsx — Module Développement des Compétences Professionnelles
 * Accessible depuis la fiche d'un membre du personnel (Professeurs.jsx).
 * Navigation interne : tableau de bord → auto-analyse → observation → PDCP
 */
import { useEffect, useState, useCallback } from 'react';
import { TuileEtat, PastilleEtat, EnteteCarte } from '../components/ui.jsx';
import { useParams, useNavigate } from 'react-router-dom';
import { getAnnee } from '../lib/api.js';
import {
  IconArrowLeft, IconPlus, IconTrash, IconEdit, IconCheck, IconX,
  IconChevronDown, IconChevronUp, IconClipboardList, IconEye,
  IconTargetArrow, IconLayoutDashboard, IconCalendar, IconBook,
  IconStar, IconCircleCheck, IconCircleDashed, IconAlertTriangle,
  IconFlask, IconSchool,
} from '@tabler/icons-react';
import { demander, informer } from '../lib/dialogue.jsx';

const tok = () => localStorage.getItem('token');
const af = (url, opts = {}) =>
  fetch('/api/dcpp' + url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...(opts.headers || {}) },
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });

const DISPOSITIFS = [
  { id: 'auto-analyse', label: 'Auto-analyse', icon: IconClipboardList, couleur: 'var(--c-accent)' },
  { id: 'observation',  label: 'Observation en classe', icon: IconEye, couleur: 'var(--c-faveur)' },
];

const SCORE_LABELS = { 0: 'Non observable / absent', 1: 'Partiellement présent', 2: 'Présent et efficace' };
const SCORE_COLORS = { 0: 'rgb(var(--gris-200))', 1: 'var(--c-attente)', 2: 'var(--c-reussi)' };

// ─── Petit badge de statut ────────────────────────────────────────────────────
function StatutBadge({ statut }) {
  const cfg = {
    'en-cours':  { label: 'En cours',  etat: 'disponible' },
    'complete':  { label: 'Complète',  etat: 'reussi' },
    'actif':     { label: 'Actif',     etat: 'disponible' },
    'atteint':   { label: 'Atteint',   etat: 'reussi' },
    'abandonne': { label: 'Abandonné', etat: 'surveiller' },
  }[statut] || { label: statut, etat: 'neutre' };
  return <PastilleEtat etat={cfg.etat}>{cfg.label}</PastilleEtat>;
}

// ─── Carte KPI ────────────────────────────────────────────────────────────────
// LE STANDARD (3.1.249) : la tuile de la maison.
const etatDeCouleur = c => /emerald|green|reussi/.test(c || '') ? 'reussi' : /amber|orange|attente/.test(c || '') ? 'surveiller' : /red|danger|refuse/.test(c || '') ? 'corriger' : /violet|purple|faveur/.test(c || '') ? 'faveur' : 'neutre';
function Kpi({ label, val, couleur = '' }) {
  return <TuileEtat etat={etatDeCouleur(couleur)} valeur={val} libelle={label} />;
}

// ─── Tableau de bord ─────────────────────────────────────────────────────────
function TableauDeBord({ profId, profNom, annee, onNavigate }) {
  const [bord, setBord] = useState(null);

  useEffect(() => {
    af(`/prof/${profId}/tableau-de-bord?annee=${encodeURIComponent(annee)}`)
      .then(setBord).catch(() => {});
  }, [profId, annee]);

  const countSeances = (disp, statut) =>
    bord?.seances?.find(s => s.dispositif === disp && s.statut === statut)?.n || 0;
  const countObj = (statut) => bord?.objectifs?.find(o => o.statut === statut)?.n || 0;

  return (
    <div className="py-4">
      <div className="mb-5">
        <div className="text-second text-slate-500 mb-1">Année scolaire</div>
        <div className="titre-carte">{profNom}</div>
        <div className="text-second text-slate-500 mt-0.5">{annee}</div>
      </div>

      {/* Auto-analyse */}
      <Section titre="Auto-analyse" icon={IconClipboardList} couleur="var(--c-accent)">
        <div className="flex gap-3 flex-wrap mb-3">
          <Kpi label="En cours" val={countSeances('auto-analyse','en-cours')} couleur="var(--c-principal)" />
          <Kpi label="Complètes" val={countSeances('auto-analyse','complete')} couleur="var(--c-texte)" />
        </div>
        <Btn onClick={() => onNavigate('auto-analyse')} icon={IconPlus} variant="accent">
          Nouvelle auto-analyse
        </Btn>
      </Section>

      {/* Observation */}
      <Section titre="Observation en classe" icon={IconEye} couleur="var(--c-accent)">
        <div className="flex gap-3 flex-wrap mb-3">
          <Kpi label="En cours" val={countSeances('observation','en-cours')} couleur="var(--c-principal)" />
          <Kpi label="Complètes" val={countSeances('observation','complete')} couleur="var(--c-texte)" />
        </div>
        <Btn onClick={() => onNavigate('observation')} icon={IconPlus} variant="secondary">
          Nouvelle observation
        </Btn>
      </Section>

      {/* PDCP */}
      <Section titre="Plan de développement (PDCP)" icon={IconTargetArrow} couleur="var(--c-accent)">
        <div className="flex gap-3 flex-wrap mb-3">
          <Kpi label="Actifs" val={countObj('actif')} couleur="var(--c-principal)" />
          <Kpi label="Atteints" val={countObj('atteint')} couleur="var(--c-texte)" />
          <Kpi label="Max" val={4} couleur="rgb(var(--gris-400))" />
        </div>
        <Btn onClick={() => onNavigate('pdcp')} icon={IconTargetArrow} variant="secondary">
          Voir le PDCP
        </Btn>
      </Section>
    </div>
  );
}

// ─── Liste des séances d'un dispositif + création ─────────────────────────────
function ListeSeances({ profId, annee, dispositif, onOuvrir }) {
  const [seances, setSeances] = useState([]);
  /* UNE UNITÉ SE CHOISIT, ELLE NE SE TAPE PAS. Le champ « Num. UE » était
     libre : on tapait un numéro, et rien ne disait qu'il ne correspondait à
     aucune unité du millésime. La séance restait alors rattachée à une unité
     qui n'existe pas, et personne ne s'en apercevait avant de chercher. */
  const [ues, setUes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ date_seance: '', ue_num: '', cours_nom: '', type_cours: 'cours', rencontre_num: 1 });

  const load = useCallback(() => {
    setLoading(true);
    af(`/prof/${profId}/seances?annee=${encodeURIComponent(annee)}`)
      .then(all => setSeances(all.filter(s => s.dispositif === dispositif)))
      .finally(() => setLoading(false));
  }, [profId, annee, dispositif]);

  useEffect(() => { load(); }, [load]);

  /* `af` préfixe `/api/dcpp` : le référentiel se demande par son propre chemin,
     avec le même jeton. Bricoler un `/../` marcherait peut-être aujourd'hui et
     casserait au premier changement de montage. */
  useEffect(() => {
    fetch(`/api/ref/ue?annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setUes(Array.isArray(l) ? l : []))
      .catch(() => setUes([]));
  }, [annee]);

  async function creer() {
    try {
      const { id } = await af(`/prof/${profId}/seances`, {
        method: 'POST',
        body: JSON.stringify({ ...form, dispositif, annee_scolaire: annee }),
      });
      setCreating(false);
      setForm({ date_seance: '', ue_num: '', cours_nom: '', type_cours: 'cours', rencontre_num: 1 });
      load();
      onOuvrir(id);
    } catch (e) { informer(e.message); }
  }

  async function supprimer(id) {
    if (!await demander('Supprimer cette séance et toutes ses réponses ?')) return;
    await af(`/seances/${id}`, { method: 'DELETE' });
    load();
  }

  const cfg = DISPOSITIFS.find(d => d.id === dispositif);

  return (
    <div className="py-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="titre-carte">{cfg.label}</h2>
        <Btn onClick={() => setCreating(v => !v)} icon={creating ? IconX : IconPlus} variant="accent">
          {creating ? 'Annuler' : 'Nouvelle séance'}
        </Btn>
      </div>

      {creating && (
        <div className="carte p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Date">
              <input type="date" value={form.date_seance} onChange={e => setForm(f => ({ ...f, date_seance: e.target.value }))} className="controle w-full" />
            </Field>
            <Field label="Num. UE">
              {ues.length > 0
                ? <select value={form.ue_num}
                    onChange={e => setForm(f => ({ ...f, ue_num: e.target.value }))}
                    className="controle w-full">
                    <option value="">— choisir —</option>
                    {ues.map(u => (
                      <option key={u.ue_num} value={u.ue_num}>
                        UE {u.ue_num} — {(u.ue_nom || '').slice(0, 40)}
                      </option>
                    ))}
                  </select>
                : <span className="text-second text-slate-400 italic">
                    aucune unité pour {annee}
                  </span>}
            </Field>
            <Field label="Cours">
              <input value={form.cours_nom} onChange={e => setForm(f => ({ ...f, cours_nom: e.target.value }))} placeholder="Intitulé du cours" className="controle w-full" />
            </Field>
            <Field label="Type">
              <select value={form.type_cours} onChange={e => setForm(f => ({ ...f, type_cours: e.target.value }))} className="controle w-full">
                <option value="cours">Cours théorique</option>
                <option value="tp">TP / TD</option>
              </select>
            </Field>
            {dispositif === 'observation' && (
              <Field label="Rencontre n°">
                <select value={form.rencontre_num} onChange={e => setForm(f => ({ ...f, rencontre_num: Number(e.target.value) }))} className="controle w-full">
                  <option value={1}>1 — Pré-observation</option>
                  <option value={2}>2 — Observation</option>
                  <option value={3}>3 — Post-observation</option>
                </select>
              </Field>
            )}
          </div>
          <Btn onClick={creer} icon={IconCheck} variant="primary">Créer la séance</Btn>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Chargement…</p>}
      {!loading && seances.length === 0 && (
        <p className="text-sm text-slate-500 italic">Aucune séance pour cette année.</p>
      )}
      <div className="flex flex-col gap-2">
        {seances.map(s => (
          <div key={s.id} className="carte px-3.5 py-3 flex items-center gap-3 cursor-pointer"
            onClick={() => onOuvrir(s.id)}>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-iip-texte">
                {s.cours_nom || '(cours non précisé)'}
                {s.ue_num && <span className="ml-2 text-second text-slate-500 font-normal">UE {s.ue_num}</span>}
              </div>
              <div className="text-second text-slate-600 mt-0.5">
                {s.date_seance || 'Date non renseignée'}
                {dispositif === 'observation' && ` · Rencontre ${s.rencontre_num}`}
                {s.type_cours && ` · ${s.type_cours === 'tp' ? 'TP/TD' : 'Cours'}`}
              </div>
            </div>
            <StatutBadge statut={s.statut} />
            <button onClick={e => { e.stopPropagation(); supprimer(s.id); }} title="Supprimer"
              className="p-1 text-slate-500 hover:text-[color:var(--c-refuse)]">
              <IconTrash size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Grille de saisie d'une séance ───────────────────────────────────────────
function GrilleSeance({ seanceId, referentiel, onBack }) {
  const [seance, setSeance] = useState(null);
  const [reponses, setReponses] = useState({}); // { critere_id: { reponse_txt, score_avant, score_apres } }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    af(`/seances/${seanceId}`).then(s => {
      setSeance(s);
      const init = {};
      (s.reponses || []).forEach(r => { init[r.critere_id] = r; });
      setReponses(init);
    });
  }, [seanceId]);

  const filteredCriteres = () => {
    if (!seance || !referentiel) return [];
    const typeCours = seance.type_cours || 'cours';
    return referentiel.libelles.filter(l =>
      l.dispositif === seance.dispositif &&
      (l.type_cours === 'tous' || l.type_cours === typeCours)
    );
  };

  async function sauvegarder(marquerComplete = false) {
    setSaving(true);
    try {
      const reps = Object.entries(reponses).map(([critere_id, v]) => ({ critere_id: Number(critere_id), ...v }));
      await af(`/seances/${seanceId}/reponses`, { method: 'PUT', body: JSON.stringify({ reponses: reps }) });
      if (marquerComplete) {
        await af(`/seances/${seanceId}`, { method: 'PATCH', body: JSON.stringify({ statut: 'complete' }) });
        setSeance(s => ({ ...s, statut: 'complete' }));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { informer(e.message); } finally { setSaving(false); }
  }

  if (!seance) return <p className="text-sm text-slate-500 p-6">Chargement…</p>;

  const libelles = filteredCriteres();
  const estObservation = seance.dispositif === 'observation';

  return (
    <div className="py-4">
      {/* En-tête séance */}
      <div className="carte px-4 py-3 mb-5">
        <div className="flex justify-between items-center gap-3">
          <div>
            <div className="titre-carte">{seance.cours_nom || '(cours)'}</div>
            <div className="text-second text-slate-500 mt-0.5">
              {seance.date_seance} · {seance.type_cours === 'tp' ? 'TP/TD' : 'Cours théorique'}
              {seance.ue_num && ` · UE ${seance.ue_num}`}
              {estObservation && ` · Rencontre ${seance.rencontre_num}`}
            </div>
          </div>
          <StatutBadge statut={seance.statut} />
        </div>
      </div>

      {/* Grille des critères */}
      <div className="flex flex-col gap-3 mb-5">
        {libelles.map(lib => {
          const critere = referentiel.criteres.find(c => c.id === lib.critere_id);
          const rep = reponses[lib.critere_id] || {};

          return (
            <div key={lib.id} className="carte p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge badge-z whitespace-nowrap">{critere?.code}</span>
                <span className="font-semibold text-sm text-iip-texte">{lib.libelle}</span>
              </div>
              {lib.question_ref && (
                <p className="text-xs text-slate-600 italic mb-2">{lib.question_ref}</p>
              )}

              {!estObservation ? (
                // Auto-analyse : champ texte
                <textarea
                  value={rep.reponse_txt || ''}
                  onChange={e => setReponses(prev => ({ ...prev, [lib.critere_id]: { ...prev[lib.critere_id], reponse_txt: e.target.value } }))}
                  placeholder="Votre réflexion…"
                  rows={3}
                  className="controle w-full h-auto py-2 resize-y"
                />
              ) : (
                // Observation : score 0/1/2 avant + après
                <div className="grid grid-cols-2 gap-3">
                  {['avant', 'apres'].map(moment => (
                    <div key={moment}>
                      <div className="intertitre mb-1.5">
                        {moment === 'avant' ? 'Avant la séance' : 'Après la séance'}
                      </div>
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map(score => (
                          <button key={score}
                            onClick={() => setReponses(prev => ({
                              ...prev,
                              [lib.critere_id]: { ...prev[lib.critere_id], [`score_${moment}`]: score }
                            }))}
                            title={SCORE_LABELS[score]}
                            className="w-8 h-8 rounded-champ border-2 font-bold text-sm text-iip-texte"
                            style={{
                              borderColor: rep[`score_${moment}`] === score ? 'var(--c-principal)' : 'rgb(var(--gris-200))',
                              background: rep[`score_${moment}`] === score ? SCORE_COLORS[score] : 'var(--blanc, #fff)',
                            }}>
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2.5 flex-wrap">
        <Btn onClick={() => sauvegarder(false)} icon={saving ? undefined : IconCheck} variant="primary" disabled={saving}>
          {saving ? 'Sauvegarde…' : saved ? 'Sauvegardé' : 'Sauvegarder'}
        </Btn>
        {seance.statut !== 'complete' && (
          <Btn onClick={() => sauvegarder(true)} icon={IconCircleCheck} variant="secondary">
            Marquer complète
          </Btn>
        )}
      </div>
    </div>
  );
}

// ─── PDCP (objectifs) ─────────────────────────────────────────────────────────
function PlanDeveloppement({ profId, annee, referentiel }) {
  const [objectifs, setObjectifs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ libelle: '', indicateurs: '', echeance: '', critere_id: '' });
  const [editId, setEditId] = useState(null);

  const load = useCallback(() => {
    af(`/prof/${profId}/objectifs?annee=${encodeURIComponent(annee)}`).then(setObjectifs).catch(() => {});
  }, [profId, annee]);

  useEffect(() => { load(); }, [load]);

  async function creer() {
    try {
      const indicateurs = form.indicateurs.split('\n').map(s => s.trim()).filter(Boolean);
      await af(`/prof/${profId}/objectifs`, {
        method: 'POST',
        body: JSON.stringify({
          annee_scolaire: annee,
          numero: (objectifs.length || 0) + 1,
          libelle: form.libelle,
          indicateurs,
          echeance: form.echeance || null,
          critere_id: form.critere_id ? Number(form.critere_id) : null,
        }),
      });
      setCreating(false);
      setForm({ libelle: '', indicateurs: '', echeance: '', critere_id: '' });
      load();
    } catch (e) { informer(e.message); }
  }

  async function patcher(id, body) {
    await af(`/objectifs/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    load();
  }

  async function supprimer(id) {
    if (!await demander('Supprimer cet objectif ?')) return;
    await af(`/objectifs/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="py-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="titre-carte">Plan de développement des compétences</h2>
          <div className="text-second text-slate-500 mt-0.5">Maximum 4 objectifs SMART · {annee}</div>
        </div>
        {objectifs.length < 4 && (
          <Btn onClick={() => setCreating(v => !v)} icon={creating ? IconX : IconPlus} variant="accent">
            {creating ? 'Annuler' : 'Ajouter un objectif'}
          </Btn>
        )}
      </div>

      {creating && (
        <div className="carte p-4 mb-4">
          <div className="flex flex-col gap-2.5">
            <Field label="Objectif *">
              <input value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))}
                placeholder="Formulé en termes de compétence à développer…"
                className="controle w-full" />
            </Field>
            <Field label="Indicateurs (un par ligne)">
              <textarea value={form.indicateurs} onChange={e => setForm(f => ({ ...f, indicateurs: e.target.value }))}
                rows={3} placeholder="Comment saurai-je que j'ai progressé ?"
                className="controle w-full h-auto py-2" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Échéance">
                <input type="date" value={form.echeance} onChange={e => setForm(f => ({ ...f, echeance: e.target.value }))}
                  className="controle w-full" />
              </Field>
              <Field label="Critère lié">
                <select value={form.critere_id} onChange={e => setForm(f => ({ ...f, critere_id: e.target.value }))}
                  className="controle w-full">
                  <option value="">— Aucun —</option>
                  {referentiel?.criteres?.map(c => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Btn onClick={creer} icon={IconCheck} variant="primary" disabled={!form.libelle}>Enregistrer l'objectif</Btn>
          </div>
        </div>
      )}

      {objectifs.length === 0 && (
        <p className="text-sm text-slate-500 italic">Aucun objectif défini pour cette année.</p>
      )}

      <div className="flex flex-col gap-3">
        {objectifs.map((obj, i) => (
          <div key={obj.id} className="carte p-4">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-champ grid place-items-center font-bold text-sm text-white flex-none"
                style={{ background: 'var(--c-principal)' }}>
                {obj.numero}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-iip-texte">{obj.libelle}</div>
                {obj.indicateurs?.length > 0 && (
                  <ul className="mt-1.5 pl-4 list-disc text-second text-slate-500">
                    {obj.indicateurs.map((ind, j) => <li key={j}>{ind}</li>)}
                  </ul>
                )}
                <div className="flex gap-2 mt-2 flex-wrap items-center">
                  <StatutBadge statut={obj.statut} />
                  {obj.echeance && <span className="inline-flex items-center gap-1 text-xs text-slate-600"><IconCalendar size={12} /> {obj.echeance}</span>}
                  {obj.critere_id && (
                    <PastilleEtat etat="disponible">
                      Critère {referentiel?.criteres?.find(c => c.id === obj.critere_id)?.code}
                    </PastilleEtat>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {obj.statut === 'actif' && (
                  <button onClick={() => patcher(obj.id, { statut: 'atteint' })} title="Marquer atteint"
                    className="p-1 text-slate-500 hover:text-iip-texte">
                    <IconCircleCheck size={16} />
                  </button>
                )}
                <button onClick={() => supprimer(obj.id)} title="Supprimer"
                  className="p-1 text-slate-500 hover:text-[color:var(--c-refuse)]">
                  <IconTrash size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────
function Section({ titre, icon: Icon, children }) {
  return (
    <div className="carte mb-3.5">
      <EnteteCarte icone={Icon} titre={titre} />
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="intertitre mb-1">{label}</div>
      {children}
    </div>
  );
}

// Les boutons de la maison : fort (l'action principale), neutre, détruire.
function Btn({ onClick, icon: Icon, children, variant = 'secondary', disabled = false }) {
  const cls = {
    primary:   'bouton bouton-fort',
    secondary: 'bouton',
    accent:    'bouton bouton-fort',
    danger:    'bouton bouton-detruire',
  }[variant] || 'bouton';
  return (
    <button onClick={onClick} disabled={disabled} className={`${cls} inline-flex items-center gap-1.5`}>
      {Icon && <Icon size={14} />}{children}
    </button>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function DCPP() {
  const { profId } = useParams();
  const navigate = useNavigate();
  const annee = getAnnee();
  const [profNom, setProfNom] = useState('');
  const [view, setView] = useState('dashboard'); // dashboard | auto-analyse | observation | pdcp | seance-{id}
  const [referentiel, setReferentiel] = useState(null);

  useEffect(() => {
    // Charger le référentiel une fois
    af('/referentiel').then(setReferentiel).catch(() => {});
    // Charger le nom du prof
    const tok = localStorage.getItem('token');
    fetch(`/api/ref/professeurs/${profId}?annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json())
      .then(d => setProfNom(d.nom_prenom || `Prof. #${profId}`))
      .catch(() => setProfNom(`Prof. #${profId}`));
  }, [profId, annee]);

  const goBack = () => {
    if (view.startsWith('seance-')) {
      // Retour à la liste du bon dispositif
      const seanceId = Number(view.split('-')[1]);
      // On ne peut pas savoir le dispositif sans le charger — on revient au dashboard
      setView('dashboard');
    } else if (view === 'dashboard') {
      navigate(-1);
    } else {
      setView('dashboard');
    }
  };

  const breadcrumb = {
    'dashboard': profNom,
    'auto-analyse': 'Auto-analyse',
    'observation': 'Observation en classe',
    'pdcp': 'Plan de développement (PDCP)',
  }[view] || (view.startsWith('seance-') ? 'Grille de séance' : view);

  const navItems = [
    { id: 'dashboard',    label: 'Tableau de bord',    icon: IconLayoutDashboard },
    { id: 'auto-analyse', label: 'Auto-analyse',        icon: IconClipboardList },
    { id: 'observation',  label: 'Observation',         icon: IconEye },
    { id: 'pdcp',         label: 'PDCP',                icon: IconTargetArrow },
  ];

  const actifOnglet = view.startsWith('seance-') ? null : view;

  return (
    <div className="px-6 py-5 max-w-[860px]">
        {/* Fil d'Ariane */}
        <div className="flex items-center gap-1.5 mb-1 text-second">
          <button onClick={goBack} title="Retour" className="p-1 -ml-1 text-slate-500 hover:text-iip-texte">
            <IconArrowLeft size={16} />
          </button>
          <button onClick={() => navigate('/professeurs')} className="text-slate-600 hover:underline">
            Membres du personnel
          </button>
          <span className="text-slate-300">›</span>
          <span className="text-slate-500">{profNom}</span>
          {view !== 'dashboard' && (
            <>
              <span className="text-slate-300">›</span>
              <span className="font-semibold text-iip-texte">{breadcrumb}</span>
            </>
          )}
        </div>

        {/* Titre */}
        <h1 className="titre-ecran mb-3">
          Développement des compétences
          <span className="text-sm font-normal text-slate-500 ml-2.5">{annee}</span>
        </h1>

        {/* Les faces du module : un soulignement, pas un second rail. */}
        <div className="flex gap-4 border-b border-slate-200 mb-2">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setView(item.id)}
              className={`${actifOnglet === item.id ? 'onglet-page onglet-page-actif' : 'onglet-page'} inline-flex items-center gap-1.5`}>
              <item.icon size={15} />{item.label}
            </button>
          ))}
        </div>

        {view === 'dashboard' && (
          <TableauDeBord profId={profId} profNom={profNom} annee={annee} onNavigate={setView} />
        )}
        {(view === 'auto-analyse' || view === 'observation') && (
          <ListeSeances
            profId={profId} annee={annee} dispositif={view}
            onOuvrir={id => setView(`seance-${id}`)}
          />
        )}
        {view.startsWith('seance-') && (
          <GrilleSeance
            seanceId={Number(view.split('-')[1])}
            referentiel={referentiel}
            onBack={() => setView('dashboard')}
          />
        )}
        {view === 'pdcp' && (
          <PlanDeveloppement profId={profId} annee={annee} referentiel={referentiel} />
        )}
    </div>
  );
}

/**
 * DCPP.jsx — Module Développement des Compétences Professionnelles
 * Accessible depuis la fiche d'un membre du personnel (Professeurs.jsx).
 * Navigation interne : tableau de bord → auto-analyse → observation → PDCP
 */
import { useEffect, useState, useCallback } from 'react';
import { TuileEtat } from '../components/ui.jsx';
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
    'en-cours':  { label: 'En cours',  bg: 'var(--c-disponible)', color: '#FFFFFF' },
    'complete':  { label: 'Complète',  bg: 'var(--c-reussi)', color: '#FFFFFF' },
    'actif':     { label: 'Actif',     bg: 'var(--c-disponible)', color: '#FFFFFF' },
    'atteint':   { label: 'Atteint',   bg: 'var(--c-reussi)', color: '#FFFFFF' },
    'abandonne': { label: 'Abandonné', bg: 'var(--c-attente)', color: '#FFFFFF' },
  }[statut] || { label: statut, bg: 'rgb(var(--gris-100))', color: 'var(--c-texte)' };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
      {cfg.label}
    </span>
  );
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
    <div style={{ padding: '24px 0' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: 'rgb(var(--gris-500))', marginBottom: 4 }}>Année scolaire</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-texte)' }}>{profNom}</div>
        <div style={{ fontSize: 13, color: 'var(--c-accent)', marginTop: 2 }}>{annee}</div>
      </div>

      {/* Auto-analyse */}
      <Section titre="Auto-analyse" icon={IconClipboardList} couleur="var(--c-accent)">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Kpi label="En cours" val={countSeances('auto-analyse','en-cours')} couleur="var(--c-principal)" />
          <Kpi label="Complètes" val={countSeances('auto-analyse','complete')} couleur="var(--c-texte)" />
        </div>
        <Btn onClick={() => onNavigate('auto-analyse')} icon={IconPlus} variant="accent">
          Nouvelle auto-analyse
        </Btn>
      </Section>

      {/* Observation */}
      <Section titre="Observation en classe" icon={IconEye} couleur="#7C5BD9">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Kpi label="En cours" val={countSeances('observation','en-cours')} couleur="var(--c-principal)" />
          <Kpi label="Complètes" val={countSeances('observation','complete')} couleur="var(--c-texte)" />
        </div>
        <Btn onClick={() => onNavigate('observation')} icon={IconPlus} variant="secondary">
          Nouvelle observation
        </Btn>
      </Section>

      {/* PDCP */}
      <Section titre="Plan de développement (PDCP)" icon={IconTargetArrow} couleur="#C0392B">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
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
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: cfg.couleur, fontSize: 16 }}>{cfg.label}</div>
        <Btn onClick={() => setCreating(v => !v)} icon={creating ? IconX : IconPlus} variant="accent">
          {creating ? 'Annuler' : 'Nouvelle séance'}
        </Btn>
      </div>

      {creating && (
        <div style={{ background: 'rgb(var(--gris-50))', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="Date">
              <input type="date" value={form.date_seance} onChange={e => setForm(f => ({ ...f, date_seance: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Num. UE">
              {ues.length > 0
                ? <select value={form.ue_num}
                    onChange={e => setForm(f => ({ ...f, ue_num: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
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
              <input value={form.cours_nom} onChange={e => setForm(f => ({ ...f, cours_nom: e.target.value }))} placeholder="Intitulé du cours" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Type">
              <select value={form.type_cours} onChange={e => setForm(f => ({ ...f, type_cours: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="cours">Cours théorique</option>
                <option value="tp">TP / TD</option>
              </select>
            </Field>
            {dispositif === 'observation' && (
              <Field label="Rencontre n°">
                <select value={form.rencontre_num} onChange={e => setForm(f => ({ ...f, rencontre_num: Number(e.target.value) }))} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
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

      {loading && <p style={{ color: 'var(--c-texte)', fontSize: 13 }}>Chargement…</p>}
      {!loading && seances.length === 0 && (
        <p style={{ color: 'var(--c-texte)', fontSize: 13, fontStyle: 'italic' }}>Aucune séance pour cette année.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {seances.map(s => (
          <div key={s.id} style={{ background: 'var(--blanc)', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            onClick={() => onOuvrir(s.id)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: 'var(--c-texte)', fontSize: 14 }}>
                {s.cours_nom || '(cours non précisé)'}
                {s.ue_num && <span style={{ marginLeft: 8, fontSize: 12, color: 'rgb(var(--gris-500))' }}>UE {s.ue_num}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-texte)', marginTop: 2 }}>
                {s.date_seance || 'Date non renseignée'}
                {dispositif === 'observation' && ` · Rencontre ${s.rencontre_num}`}
                {s.type_cours && ` · ${s.type_cours === 'tp' ? 'TP/TD' : 'Cours'}`}
              </div>
            </div>
            <StatutBadge statut={s.statut} />
            <button onClick={e => { e.stopPropagation(); supprimer(s.id); }}
              style={{ color: 'var(--c-texte)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
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

  if (!seance) return <p style={{ color: 'var(--c-texte)', padding: 24 }}>Chargement…</p>;

  const libelles = filteredCriteres();
  const estObservation = seance.dispositif === 'observation';

  return (
    <div style={{ padding: '16px 0' }}>
      {/* En-tête séance */}
      <div style={{ background: 'rgb(var(--gris-50))', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--c-texte)', fontSize: 15 }}>{seance.cours_nom || '(cours)'}</div>
            <div style={{ fontSize: 12, color: 'rgb(var(--gris-500))', marginTop: 2 }}>
              {seance.date_seance} · {seance.type_cours === 'tp' ? 'TP/TD' : 'Cours théorique'}
              {seance.ue_num && ` · UE ${seance.ue_num}`}
              {estObservation && ` · Rencontre ${seance.rencontre_num}`}
            </div>
          </div>
          <StatutBadge statut={seance.statut} />
        </div>
      </div>

      {/* Grille des critères */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {libelles.map(lib => {
          const critere = referentiel.criteres.find(c => c.id === lib.critere_id);
          const rep = reponses[lib.critere_id] || {};

          return (
            <div key={lib.id} style={{ background: 'var(--blanc)', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ background: 'var(--c-principal)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                  {critere?.code}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--c-texte)', fontSize: 13 }}>{lib.libelle}</span>
              </div>
              {lib.question_ref && (
                <p style={{ fontSize: 11, color: 'var(--c-texte)', fontStyle: 'italic', marginBottom: 8 }}>{lib.question_ref}</p>
              )}

              {!estObservation ? (
                // Auto-analyse : champ texte
                <textarea
                  value={rep.reponse_txt || ''}
                  onChange={e => setReponses(prev => ({ ...prev, [lib.critere_id]: { ...prev[lib.critere_id], reponse_txt: e.target.value } }))}
                  placeholder="Votre réflexion…"
                  rows={3}
                  style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 6, padding: '8px 10px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
                />
              ) : (
                // Observation : score 0/1/2 avant + après
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {['avant', 'apres'].map(moment => (
                    <div key={moment}>
                      <div style={{ fontSize: 11, color: 'rgb(var(--gris-500))', marginBottom: 6, fontWeight: 600 }}>
                        {moment === 'avant' ? 'Avant la séance' : 'Après la séance'}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[0, 1, 2].map(score => (
                          <button key={score}
                            onClick={() => setReponses(prev => ({
                              ...prev,
                              [lib.critere_id]: { ...prev[lib.critere_id], [`score_${moment}`]: score }
                            }))}
                            title={SCORE_LABELS[score]}
                            style={{
                              width: 32, height: 32, borderRadius: 6, border: '2px solid',
                              borderColor: rep[`score_${moment}`] === score ? 'var(--c-principal)' : 'rgb(var(--gris-200))',
                              background: rep[`score_${moment}`] === score ? SCORE_COLORS[score] : 'rgb(var(--gris-50))',
                              fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--c-texte)',
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
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Btn onClick={() => sauvegarder(false)} icon={saving ? undefined : IconCheck} variant="primary" disabled={saving}>
          {saving ? 'Sauvegarde…' : saved ? '✓ Sauvegardé' : 'Sauvegarder'}
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
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--c-texte)', fontSize: 16 }}>Plan de développement des compétences</div>
          <div style={{ fontSize: 12, color: 'var(--c-texte)', marginTop: 2 }}>Maximum 4 objectifs SMART · {annee}</div>
        </div>
        {objectifs.length < 4 && (
          <Btn onClick={() => setCreating(v => !v)} icon={creating ? IconX : IconPlus} variant="accent">
            {creating ? 'Annuler' : 'Ajouter un objectif'}
          </Btn>
        )}
      </div>

      {creating && (
        <div style={{ background: '#FFF5F5', border: '1px solid rgb(var(--gris-200))', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Objectif *">
              <input value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))}
                placeholder="Formulé en termes de compétence à développer…"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Indicateurs (un par ligne)">
              <textarea value={form.indicateurs} onChange={e => setForm(f => ({ ...f, indicateurs: e.target.value }))}
                rows={3} placeholder="Comment saurai-je que j'ai progressé ?"
                style={{ width: '100%', border: '1px solid #D1D5DB', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Échéance">
                <input type="date" value={form.echeance} onChange={e => setForm(f => ({ ...f, echeance: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Critère lié">
                <select value={form.critere_id} onChange={e => setForm(f => ({ ...f, critere_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
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
        <p style={{ color: 'var(--c-texte)', fontSize: 13, fontStyle: 'italic' }}>Aucun objectif défini pour cette année.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {objectifs.map((obj, i) => (
          <div key={obj.id} style={{ background: 'var(--blanc)', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-principal)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {obj.numero}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--c-texte)', fontSize: 14 }}>{obj.libelle}</div>
                {obj.indicateurs?.length > 0 && (
                  <ul style={{ marginTop: 6, paddingLeft: 16, fontSize: 12, color: 'rgb(var(--gris-500))' }}>
                    {obj.indicateurs.map((ind, j) => <li key={j}>{ind}</li>)}
                  </ul>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <StatutBadge statut={obj.statut} />
                  {obj.echeance && <span style={{ fontSize: 11, color: 'var(--c-texte)' }}>⏱ {obj.echeance}</span>}
                  {obj.critere_id && (
                    <span style={{ fontSize: 11, background: 'var(--c-disponible)', color: '#FFFFFF', padding: '2px 7px', borderRadius: 10 }}>
                      Critère {referentiel?.criteres?.find(c => c.id === obj.critere_id)?.code}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {obj.statut === 'actif' && (
                  <button onClick={() => patcher(obj.id, { statut: 'atteint' })} title="Marquer atteint"
                    style={{ color: 'var(--c-texte)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <IconCircleCheck size={16} />
                  </button>
                )}
                <button onClick={() => supprimer(obj.id)} title="Supprimer"
                  style={{ color: 'var(--c-texte)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
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
function Section({ titre, icon: Icon, couleur, children }) {
  return (
    <div style={{ background: 'var(--blanc)', border: `1px solid rgb(var(--gris-200))`, borderLeft: `3px solid ${couleur}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon size={17} style={{ color: couleur }} />
        <span style={{ fontWeight: 700, color: 'var(--c-texte)', fontSize: 14 }}>{titre}</span>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgb(var(--gris-500))', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Btn({ onClick, icon: Icon, children, variant = 'secondary', disabled = false }) {
  const styles = {
    primary:   { background: 'var(--c-principal)', color: '#fff', border: 'none' },
    secondary: { background: 'var(--blanc)', color: 'var(--c-texte)', border: '1px solid #D1D5DB' },
    accent:    { background: 'var(--c-accent)', color: '#fff', border: 'none' },
    danger:    { background: 'var(--c-refuse)', color: '#fff', border: 'none' },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles, display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
    }}>
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

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)', background: 'rgb(var(--gris-50))' }}>
      {/* Rail latéral */}
      <div style={{ width: 56, background: 'var(--c-principal)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 4, flexShrink: 0 }}>
        <button onClick={goBack} title="Retour" style={{ color: 'var(--c-texte)', background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 8, marginBottom: 8 }}>
          <IconArrowLeft size={18} />
        </button>
        {navItems.map(item => {
          const active = view === item.id || (item.id !== 'dashboard' && view.startsWith('seance-') && false);
          return (
            <button key={item.id} onClick={() => setView(item.id)} title={item.label}
              style={{
                color: active ? 'var(--c-accent)' : 'var(--c-disponible)', background: active ? 'rgba(0,170,204,0.15)' : 'none',
                border: 'none', cursor: 'pointer', padding: 10, borderRadius: 8,
              }}>
              <item.icon size={19} />
            </button>
          );
        })}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, padding: '24px 32px', maxWidth: 860, overflow: 'auto' }}>
        {/* Fil d'Ariane */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <button onClick={() => navigate('/professeurs')} style={{ color: 'var(--c-texte)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
            Membres du personnel
          </button>
          <span style={{ color: 'rgb(var(--gris-300))' }}>›</span>
          <span style={{ color: 'rgb(var(--gris-500))', fontSize: 12 }}>{profNom}</span>
          {view !== 'dashboard' && (
            <>
              <span style={{ color: 'rgb(var(--gris-300))' }}>›</span>
              <span style={{ color: 'var(--c-texte)', fontSize: 12, fontWeight: 600 }}>{breadcrumb}</span>
            </>
          )}
        </div>

        {/* Titre */}
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-texte)', marginBottom: 20 }}>
          Développement des compétences
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--c-accent)', marginLeft: 10 }}>{annee}</span>
        </h1>

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
    </div>
  );
}

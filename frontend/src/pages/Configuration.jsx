import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, ...opts.headers } }).then(r => r.json());

const FONCTIONS = ['Directeur', 'Directeur adjoint', 'Secrétaire', 'Coordinateur', 'Coordinatrice', 'Éducateur', 'Éducatrice', 'Gestionnaire', 'Autre'];

/* ── Gestion du personnel de l'établissement ── */
function GestionPersonnel() {
  const [personnel, setPersonnel]   = useState([]);
  const [allProfs, setAllProfs]     = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [editId, setEditId]         = useState(null);
  const [editFonction, setEditFonction] = useState('');
  const [editOrdre, setEditOrdre]   = useState('');
  const [editSections, setEditSections] = useState(null); // null = fermé, peId = ouvert
  const [pendingSections, setPendingSections] = useState([]); // sections en cours d'édition
  const [newProfId, setNewProfId]   = useState('');
  const [newFonction, setNewFonction] = useState('Directeur');
  const [newOrdre, setNewOrdre]     = useState('');
  const [search, setSearch]         = useState('');

  useEffect(() => { charger(); }, []);

  async function charger() {
    setLoading(true);
    try {
      const [pe, profs, secs] = await Promise.all([
        authFetch('/api/ref/personnel-etablissement'),
        authFetch('/api/ref/professeurs?tous=1'),
        authFetch('/api/ref/sections'),
      ]);
      // Charger les sections de chaque membre
      const peList = Array.isArray(pe) ? pe : [];
      await Promise.all(peList.map(async m => {
        try {
          const s = await authFetch(`/api/ref/personnel-etablissement/${m.id}/sections`);
          m.sections = Array.isArray(s) ? s : [];
        } catch { m.sections = []; }
      }));
      setPersonnel(peList);
      setAllProfs(Array.isArray(profs) ? profs : []);
      setAllSections(Array.isArray(secs) ? secs.map(s => s.code || s.section_code || s).filter(Boolean) : []);
    } finally { setLoading(false); }
  }

  async function ajouter() {
    if (!newProfId || !newFonction) return;
    await authFetch('/api/ref/personnel-etablissement', {
      method: 'POST',
      body: JSON.stringify({ professeur_id: Number(newProfId), fonction: newFonction, ordre: Number(newOrdre) || 99 }),
    });
    setShowAdd(false); setNewProfId(''); setNewFonction('Directeur'); setNewOrdre('');
    charger();
  }

  async function modifier(id) {
    await authFetch(`/api/ref/personnel-etablissement/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fonction: editFonction, ordre: Number(editOrdre) || 99 }),
    });
    setEditId(null);
    charger();
  }

  async function supprimer(id, nom) {
    if (!confirm(`Retirer ${nom} du personnel de l'établissement ?`)) return;
    await authFetch(`/api/ref/personnel-etablissement/${id}`, { method: 'DELETE' });
    charger();
  }

  function ouvrirSections(pe) {
    setEditSections(pe.id);
    setPendingSections([...(pe.sections || [])]);
  }

  function toggleSection(code) {
    setPendingSections(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  }

  async function sauvegarderSections(peId) {
    await authFetch(`/api/ref/personnel-etablissement/${peId}/sections`, {
      method: 'PUT',
      body: JSON.stringify({ sections: pendingSections }),
    });
    setEditSections(null);
    charger();
  }

  // Profs pas encore dans le personnel établissement
  const existingIds = new Set(personnel.map(p => p.professeur_id));
  const profsDisponibles = allProfs.filter(p =>
    !existingIds.has(p.id) &&
    (!search || `${p.nom} ${p.prenom}`.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">Personnel de l'établissement</h3>
            <p className="text-xs text-gray-500 mt-0.5">Direction, secrétariat, coordination — utilisé dans les outils Procédures et documents</p>
          </div>
          <button onClick={() => setShowAdd(v => !v)}
            className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-1.5 rounded font-medium">
            + Ajouter
          </button>
        </div>

        {/* Formulaire ajout */}
        {showAdd && (
          <div className="px-5 py-4 bg-iip-gold/5 border-b border-gray-100 space-y-3">
            <p className="text-sm font-medium text-gray-700">Ajouter une personne au personnel de l'établissement</p>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un prof par nom…"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
            <div className="flex gap-2">
              <select value={newProfId} onChange={e => setNewProfId(e.target.value)}
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">— Choisir une personne —</option>
                {profsDisponibles.slice(0, 50).map(p => (
                  <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>
                ))}
              </select>
              <select value={newFonction} onChange={e => setNewFonction(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                {FONCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <input type="number" value={newOrdre} onChange={e => setNewOrdre(e.target.value)}
                placeholder="Ordre" className="w-20 border border-gray-300 rounded px-3 py-1.5 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={ajouter} disabled={!newProfId}
                className="bg-iip-gold disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded">
                Confirmer
              </button>
              <button onClick={() => { setShowAdd(false); setSearch(''); }}
                className="border border-gray-300 text-gray-600 text-sm px-4 py-1.5 rounded">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Liste */}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="px-5 py-3 text-left">Personne</th>
              <th className="px-4 py-3 text-left">Fonction</th>
              <th className="px-4 py-3 text-left">Sections</th>
              <th className="px-4 py-3 text-center">Ordre</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {personnel.map(pe => (
              <>
                <tr key={pe.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{pe.prenom} {pe.nom}</td>
                  <td className="px-4 py-3">
                    {editId === pe.id ? (
                      <select value={editFonction} onChange={e => setEditFonction(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                        {FONCTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    ) : (
                      <span className="inline-flex items-center bg-iip-gold/10 text-iip-gold text-xs font-semibold px-2.5 py-1 rounded-full">
                        {pe.fonction}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {pe.sections && pe.sections.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {pe.sections.map(s => (
                          <span key={s} className="inline-flex items-center bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full border border-blue-200">{s}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Toutes sections</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {editId === pe.id
                      ? <input type="number" value={editOrdre} onChange={e => setEditOrdre(e.target.value)} className="w-16 border rounded px-2 py-1 text-sm text-center" />
                      : pe.ordre}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editId === pe.id ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => modifier(pe.id)} className="text-green-700 hover:text-green-900 text-xs px-2 py-1 border border-green-300 rounded">✓ OK</button>
                        <button onClick={() => setEditId(null)} className="text-gray-500 text-xs px-2 py-1 border border-gray-200 rounded">✕</button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => ouvrirSections(pe)}
                          title="Gérer les sections"
                          className={`text-xs px-2 py-1 border rounded ${editSections === pe.id ? 'border-blue-400 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-400 hover:text-blue-500'}`}>
                          §
                        </button>
                        <button onClick={() => { setEditId(pe.id); setEditFonction(pe.fonction); setEditOrdre(String(pe.ordre)); }}
                          className="text-gray-400 hover:text-iip-gold text-xs px-2 py-1 border border-gray-200 rounded">✏</button>
                        <button onClick={() => supprimer(pe.id, `${pe.prenom} ${pe.nom}`)}
                          className="text-gray-400 hover:text-red-500 text-xs px-2 py-1 border border-gray-200 rounded">✕</button>
                      </div>
                    )}
                  </td>
                </tr>
                {/* Panneau sections inline */}
                {editSections === pe.id && (
                  <tr key={`sec-${pe.id}`}>
                    <td colSpan={5} className="px-5 py-4 bg-blue-50 border-t border-blue-100">
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-blue-800">
                          Sections pour {pe.prenom} {pe.nom}
                          <span className="ml-2 text-xs font-normal text-blue-600">(vide = visible dans toutes les sections)</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {allSections.map(s => (
                            <label key={s} className={`flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              pendingSections.includes(s)
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                            }`}>
                              <input type="checkbox" className="hidden" checked={pendingSections.includes(s)} onChange={() => toggleSection(s)} />
                              {s}
                            </label>
                          ))}
                          {allSections.length === 0 && <span className="text-xs text-gray-400">Aucune section disponible</span>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => sauvegarderSections(pe.id)}
                            className="bg-blue-600 text-white text-xs px-4 py-1.5 rounded hover:bg-blue-700">
                            Enregistrer
                          </button>
                          <button onClick={() => setEditSections(null)}
                            className="border border-gray-300 text-gray-600 text-xs px-4 py-1.5 rounded hover:bg-gray-50">
                            Annuler
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!personnel.length && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">Aucun membre du personnel enregistré</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">💡 Comment ça fonctionne</p>
        <p>Toute personne de la table Professeurs peut se voir attribuer une fonction dans l'établissement. Le bouton <strong>§</strong> permet de rattacher un membre à une ou plusieurs sections — utile pour les coordinatrices qui suivent des sections spécifiques. Sans section cochée, la personne apparaît dans tous les PV et documents. Leurs données complètes (NISS, adresse, etc.) restent dans leur fiche professeur et sont utilisées pour les documents (contrats, courriers).</p>
      </div>
    </div>
  );
}

/* ── Purge d'une année scolaire ── */
function PurgeAnnee() {
  const [annees, setAnnees] = useState([]);
  const [annee, setAnnee] = useState('');
  const [etape, setEtape] = useState(1); // 1=saisie, 2=confirmation, 3=résultat
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.annees().then(setAnnees).catch(() => {});
  }, []);

  async function purger() {
    setLoading(true); setErr('');
    try {
      const res = await api.purgeAnnee(annee);
      setResult(res); setEtape(3);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <section className="bg-white rounded-lg border border-red-200 overflow-hidden">
      <div className="px-4 py-3 bg-red-50 border-b border-red-200">
        <h2 className="font-semibold text-red-700">Purge d'une année scolaire</h2>
        <p className="text-xs text-red-500 mt-0.5">
          Supprime toutes les attributions, UE, cours et organisations d'une année. Irréversible.
        </p>
      </div>
      <div className="px-4 py-4 space-y-3">
        {etape === 1 && (
          <>
            <p className="text-sm text-gray-600">
              Utilisez cette fonction pour nettoyer une année de test avant de commencer
              à encoder les vraies données. <strong>Faites une sauvegarde d'abord.</strong>
            </p>
            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Année à purger</label>
                <select value={annee} onChange={e => setAnnee(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-44 bg-white">
                  <option value="">— Choisir —</option>
                  {annees.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
                </select>
              </div>
              <button onClick={() => { if(annee) setEtape(2); }}
                disabled={!annee}
                className="px-4 py-1.5 bg-red-600 text-white text-sm rounded disabled:opacity-40 hover:bg-red-700">
                Purger…
              </button>
            </div>
          </>
        )}
        {etape === 2 && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-red-700">
              ⚠️ Confirmer la suppression de l'année <strong>{annee}</strong> ?
            </p>
            <p className="text-xs text-red-600">
              Toutes les attributions, UE, cours, organisations et EA12 de cette année
              seront définitivement supprimés. Cette action est irréversible.
            </p>
            {err && <p className="text-xs text-red-600 bg-red-100 rounded p-2">{err}</p>}
            <div className="flex gap-3">
              <button onClick={purger} disabled={loading}
                className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50">
                {loading ? 'Suppression…' : `Oui, supprimer ${annee}`}
              </button>
              <button onClick={() => { setEtape(1); setErr(''); }}
                className="px-4 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">
                Annuler
              </button>
            </div>
          </div>
        )}
        {etape === 3 && result && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-green-700">✓ Année {annee} purgée</p>
            <div className="text-xs text-green-600 space-y-0.5">
              {Object.entries(result.details || result.supprime || {}).map(([t, n]) => (
                <div key={t}>{t} : {n} ligne(s) supprimée(s)</div>
              ))}
            </div>
            <button onClick={() => { setEtape(1); setAnnee(''); setResult(null); }}
              className="text-xs text-green-700 underline mt-2">Recommencer</button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Régénération des données de test (DEV uniquement) ── */
function RegenererDonneesDev() {
  const [etape, setEtape] = useState(1); // 1=info, 2=confirm, 3=résultat
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  async function regenerer() {
    setLoading(true); setErr('');
    try {
      const res = await api.regenerateFakeData();
      setStats(res.stats); setEtape(3);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <section className="bg-white rounded-lg border border-amber-300 overflow-hidden">
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
        <h2 className="font-semibold text-amber-700">🔧 Régénérer les données de test</h2>
        <p className="text-xs text-amber-600 mt-0.5">
          Environnement de développement uniquement. Remplace les noms, adresses,
          diplômes et données personnelles de tous les professeurs par des données
          fictives (RGPD-safe). Les attributions sont conservées.
        </p>
      </div>
      <div className="px-4 py-4 space-y-3">
        {etape === 1 && (
          <>
            <p className="text-sm text-gray-600">
              Utile pour repartir d'une base de test propre avec des identités fictives
              mais réalistes (matricules, titres, communes belges, statuts EA12 variés).
            </p>
            <button onClick={() => setEtape(2)}
              className="px-4 py-1.5 bg-amber-500 text-white text-sm rounded hover:bg-amber-600">
              Régénérer les données fictives
            </button>
          </>
        )}
        {etape === 2 && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-700">
              Confirmer la régénération de toutes les fiches professeurs ?
            </p>
            <p className="text-xs text-amber-600">
              Tous les noms, prénoms, adresses, emails, dates de naissance, matricules
              et diplômes seront remplacés par de nouvelles données fictives. Les
              attributions, UE et cours ne sont pas touchés.
            </p>
            {err && <p className="text-xs text-red-600 bg-red-100 rounded p-2">{err}</p>}
            <div className="flex gap-3">
              <button onClick={regenerer} disabled={loading}
                className="px-4 py-1.5 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 disabled:opacity-50">
                {loading ? 'Régénération…' : 'Oui, régénérer'}
              </button>
              <button onClick={() => { setEtape(1); setErr(''); }}
                className="px-4 py-1.5 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">
                Annuler
              </button>
            </div>
          </div>
        )}
        {etape === 3 && stats && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-green-700">
              ✓ {stats.total} professeurs régénérés
            </p>
            <div className="text-xs text-green-600 space-y-0.5">
              <div>CAPAES : {stats.capaes} · CAP : {stats.cap} · AESS : {stats.aess} · sans titre péda : {stats.sans}</div>
            </div>
            <p className="text-xs text-gray-500">
              Rechargez les pages Professeurs pour voir les nouvelles données.
            </p>
            <button onClick={() => { setEtape(1); setStats(null); }}
              className="text-xs text-green-700 underline mt-1">Recommencer</button>
          </div>
        )}
      </div>
    </section>
  );
}
import Users from './Users.jsx';
import Annees from './Annees.jsx';
import Referentiels from './Referentiels.jsx';
import ParametresEtablissement from './ParametresEtablissement.jsx';

function Toggle({ label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
      </div>
      <button onClick={() => !disabled && onChange(!checked)} disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${checked ? 'bg-iip-gold' : 'bg-gray-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

// Nettoie un message de commit pour l'affichage utilisateur
function cleanSubject(s) {
  // Retire les préfixes techniques (Fix:, feat:, chore:, etc.)
  let txt = s.replace(/^(fix|feat|chore|refactor|docs|style|test|perf|build|ci)(\([^)]*\))?\s*:\s*/i, '');
  // Majuscule en début
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// Catégorise un commit par mot-clé pour une petite pastille
function commitTag(s) {
  const l = s.toLowerCase();
  if (/^fix|corrig|bug/.test(l)) return { label: 'Correctif', cls: 'bg-red-100 text-red-700' };
  if (/^feat|ajout|nouveau|nouvelle|module/.test(l)) return { label: 'Nouveauté', cls: 'bg-green-100 text-green-700' };
  return { label: 'Amélioration', cls: 'bg-blue-100 text-blue-700' };
}

function ChangelogView({ data }) {
  const days = Object.keys(data.byDay || {}).sort().reverse();
  if (days.length === 0) return <p className="text-sm text-gray-400">Aucune nouveauté disponible.</p>;
  return (
    <div className="space-y-5">
      {days.map(day => (
        <div key={day}>
          <h3 className="font-semibold text-iip-gold text-sm mb-2 pb-1 border-b border-gray-100">
            {new Date(day).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>
          <ul className="space-y-1.5">
            {data.byDay[day].map(c => {
              const tag = commitTag(c.subject);
              return (
                <li key={c.hash} className="flex items-start gap-2 text-sm">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 mt-0.5 ${tag.cls}`}>{tag.label}</span>
                  <span className="text-gray-700 flex-1">{cleanSubject(c.subject)}</span>
                  <code className="text-[10px] text-gray-300 font-mono flex-shrink-0 mt-0.5">{c.hash}</code>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Gestion des paramètres ───────────────────────────────────────────────────

const GROUPE_LABELS = {
  planification: { label: '📐 Planification', desc: 'Valeurs des cellules EV1/EV2/VC, durée des périodes, contraintes calendaires' },
  session:       { label: '📅 Calendrier des sessions', desc: 'Dernier jour admin + délais rétroactifs (EV1, VC, EV2, délibé, recours) pour calculer la dernière semaine de cours' },
  procedures:    { label: '⚖ Procédures',    desc: 'Délais légaux, email de direction utilisé dans les PV' },
  etablissement: { label: '🏫 Établissement', desc: 'Nom et informations de l\'établissement' },
};

const PARAM_TYPES = {
  'planning.q1_debut':             { type: 'date' },
  'planning.q1_fin':               { type: 'date' },
  'planning.q2_debut':             { type: 'date' },
  'planning.q2_fin':               { type: 'date' },
  'planning.ev1_heures':           { type: 'number', step: '0.5', min: '0', max: '10' },
  'planning.ev2_heures':           { type: 'number', step: '0.5', min: '0', max: '10' },
  'planning.vc_heures':            { type: 'number', step: '0.5', min: '0', max: '10' },
  'planning.periode_minutes':      { type: 'number', step: '1',   min: '1', max: '120' },
  'planning.min_semaines_ev1_ev2': { type: 'number', step: '1',   min: '0', max: '10' },
  'procedures.email_direction':    { type: 'email' },
  'procedures.delai_recours_jours':{ type: 'number', step: '1', min: '1', max: '30' },
  'procedures.delai_decision_jours':{ type: 'number', step: '1', min: '1', max: '30' },
  'procedures.delai_ext_cal_jours':{ type: 'number', step: '1', min: '1', max: '30' },
  'procedures.delai_ext_ouv_jours':{ type: 'number', step: '1', min: '1', max: '10' },
  'etab.nom':                      { type: 'text' },
};

function GestionParametres() {
  const [grouped, setGrouped]   = useState({});
  const [pending, setPending]   = useState({});  // { cle: valeur }
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    authFetch('/api/parametres')
      .then(d => setGrouped(d || {}))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(cle, val) {
    setPending(prev => ({ ...prev, [cle]: val }));
    setSaved(false);
  }

  function getValue(cle, original) {
    return pending[cle] !== undefined ? pending[cle] : original;
  }

  async function sauvegarder() {
    if (!Object.keys(pending).length) return;
    setSaving(true);
    try {
      await authFetch('/api/parametres/bulk', { method: 'PUT', body: JSON.stringify(pending) });
      // Rafraîchir depuis le serveur
      const d = await authFetch('/api/parametres');
      setGrouped(d || {});
      setPending({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  const nbModifs = Object.keys(pending).length;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Barre de sauvegarde sticky */}
      {(nbModifs > 0 || saved) && (
        <div className={`sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm
          ${saved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-iip-gold/10 border-iip-gold/30 text-iip-gold'}`}>
          {saved
            ? '✓ Paramètres enregistrés'
            : `${nbModifs} modification${nbModifs > 1 ? 's' : ''} non sauvegardée${nbModifs > 1 ? 's' : ''}`}
          {!saved && (
            <button onClick={sauvegarder} disabled={saving}
              className="bg-iip-gold text-white text-xs px-4 py-1.5 rounded hover:bg-iip-amber disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      )}

      {Object.entries(GROUPE_LABELS).map(([groupe, meta]) => {
        const params = grouped[groupe] || [];
        if (!params.length) return null;
        return (
          <div key={groupe} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">{meta.label}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{meta.desc}</p>
            </div>
            <div className="divide-y divide-gray-100">
              {params.map(p => {
                const t = PARAM_TYPES[p.cle] || { type: 'text' };
                const val = getValue(p.cle, p.valeur);
                const modified = pending[p.cle] !== undefined;
                return (
                  <div key={p.cle} className={`flex items-center gap-4 px-5 py-3 ${modified ? 'bg-iip-gold/5' : ''}`}>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">{p.label}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.cle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type={t.type || 'text'}
                        step={t.step} min={t.min} max={t.max}
                        value={val}
                        onChange={e => handleChange(p.cle, e.target.value)}
                        style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                        className={`border rounded px-3 py-1.5 text-sm text-right
                          ${t.type === 'number' ? 'w-24' : 'w-72'}
                          ${modified ? 'border-iip-gold ring-1 ring-iip-gold/30' : 'border-gray-300'}`}
                      />
                      {modified && (
                        <button onClick={() => setPending(prev => { const n = {...prev}; delete n[p.cle]; return n; })}
                          className="text-gray-300 hover:text-gray-500 text-xs">✕</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-700">
        <p className="font-medium mb-1">💡 Ces paramètres sont globaux</p>
        <p>Ils s'appliquent à toutes les sections. Une configuration par section (ex. EV1 différent en AESI) peut être ajoutée sur demande.</p>
      </div>
    </div>
  );
}

// ─── Gestion des prérequis UE ─────────────────────────────────────────────────
function GestionPrerequis() {
  const [sections, setSections]   = useState([]);
  const [section, setSection]     = useState('');
  const [ues, setUes]             = useState([]);
  const [prereqs, setPrereqs]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [newUe, setNewUe]         = useState('');
  const [newPre, setNewPre]       = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    authFetch('/api/ref/sections').then(d => setSections(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    if (!section) return;
    setLoading(true);
    Promise.all([
      authFetch(`/api/ref/ue?section=${encodeURIComponent(section)}`),
      authFetch(`/api/prerequis/ue?section=${encodeURIComponent(section)}`),
    ]).then(([u, p]) => {
      setUes(Array.isArray(u) ? u : []);
      setPrereqs(Array.isArray(p) ? p : []);
    }).finally(() => setLoading(false));
  }, [section]);

  async function ajouter() {
    if (!newUe || !newPre) return;
    setSaving(true);
    try {
      await authFetch('/api/prerequis/ue', {
        method: 'POST',
        body: JSON.stringify({ ue_num: Number(newUe), prerequis_num: Number(newPre), section }),
      });
      const p = await authFetch(`/api/prerequis/ue?section=${encodeURIComponent(section)}`);
      setPrereqs(Array.isArray(p) ? p : []);
      setNewUe(''); setNewPre('');
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function supprimer(id) {
    if (!confirm('Supprimer ce prérequis ?')) return;
    await authFetch(`/api/prerequis/ue/${id}`, { method: 'DELETE' });
    setPrereqs(prev => prev.filter(p => p.id !== id));
  }

  const ueLabel = (num) => {
    const u = ues.find(u => u.ue_num === num);
    return u ? `UE${num} — ${u.ue_nom}` : `UE${num}`;
  };

  // Grouper les prérequis par UE
  const parUE = {};
  for (const p of prereqs) {
    if (!parUE[p.ue_num]) parUE[p.ue_num] = [];
    parUE[p.ue_num].push(p);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
          <option value="">— Choisir une section —</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        {section && <span className="text-xs text-gray-400">{prereqs.length} prérequis définis</span>}
      </div>

      {section && (
        <>
          {/* Ajouter un prérequis */}
          <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Ajouter un prérequis</p>
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 mb-1">UE qui dépend de…</label>
                <select value={newUe} onChange={e => setNewUe(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white w-72">
                  <option value="">— Choisir l'UE —</option>
                  {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE{u.ue_num} — {u.ue_nom?.slice(0,40)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">…doit être terminée après</label>
                <select value={newPre} onChange={e => setNewPre(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white w-72">
                  <option value="">— Choisir le prérequis —</option>
                  {ues.filter(u => String(u.ue_num) !== newUe).map(u => <option key={u.ue_num} value={u.ue_num}>UE{u.ue_num} — {u.ue_nom?.slice(0,40)}</option>)}
                </select>
              </div>
              <button onClick={ajouter} disabled={!newUe || !newPre || saving}
                className="bg-iip-gold text-white text-sm px-4 py-1.5 rounded hover:bg-iip-amber disabled:opacity-50">
                + Ajouter
              </button>
            </div>
          </div>

          {/* Liste des prérequis groupés par UE */}
          {loading ? (
            <div className="text-center text-gray-400 py-8">Chargement…</div>
          ) : Object.keys(parUE).length === 0 ? (
            <div className="text-center text-gray-400 py-8 bg-white rounded-lg border border-gray-200">
              Aucun prérequis défini pour {section}
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">UE</th>
                    <th className="px-4 py-3 text-left">Dépend de (prérequis)</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(parUE).sort(([a],[b]) => Number(a)-Number(b)).map(([ue, pres]) => (
                    pres.map((p, i) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-iip-mauve">
                          {i === 0 ? ueLabel(Number(ue)) : ''}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{ueLabel(p.prerequis_num)}</td>
                        <td className="px-4 py-2">
                          <button onClick={() => supprimer(p.id)}
                            className="text-gray-300 hover:text-red-500 transition text-xs">✕</button>
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <p className="font-medium mb-0.5">💡 Comment ça fonctionne</p>
            <p>Si UE-B dépend de UE-A, le planificateur IA s'assurera que toutes les heures de UE-A sont terminées avant que UE-B puisse commencer. Les épreuves intégrées dépendent automatiquement de toutes les UE de la section.</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function Configuration() {
  const [tab, setTab] = useState('users');
  const [historiqueActif, setHistoriqueActif] = useState(false);
  const [changelog, setChangelog] = useState({ byDay: {}, commits: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [driveStatus, setDriveStatus] = useState('');
  const [restoreStatus, setRestoreStatus] = useState('');
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [env, setEnv] = useState(null);

  useEffect(() => {
    api.historiqueConfig().then(r => {
      setHistoriqueActif(r.actif);
    }).catch(() => {}).finally(() => setLoading(false));
    api.changelog().then(r => setChangelog(r)).catch(() => {});
    fetch('/api/info').then(r => r.json()).then(d => setEnv(d.environnement)).catch(() => {});
  }, []);

  async function toggleHistorique(val) {
    setSaving(true);
    try {
      await api.setHistoriqueConfig(val);
      setHistoriqueActif(val);
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function downloadBackup() {
    setBackupStatus('Préparation...');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/historique/backup', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const fname = cd.match(/filename="(.+)"/)?.[1] || 'backup.db';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname; a.click();
      URL.revokeObjectURL(url);
      setBackupStatus(`✅ Téléchargé : ${fname}`);
    } catch(e) { setBackupStatus('❌ Erreur : ' + e.message); }
  }

  async function backupToDrive() {
    setDriveStatus('Préparation de la sauvegarde...');
    try {
      // 1. Télécharger le backup depuis le backend
      const token = localStorage.getItem('token');
      const res = await fetch('/api/historique/backup', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Lecture de la base échouée');
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const fname = cd.match(/filename="(.+)"/)?.[1] || `backup-${new Date().toISOString().slice(0,10)}.db`;

      // 2. Upload vers Google Drive via le backend
      setDriveStatus('Upload vers Google Drive...');
      const formData = new FormData();
      formData.append('file', new File([blob], fname, { type: 'application/octet-stream' }));
      formData.append('filename', fname);

      const driveRes = await fetch('/api/historique/backup-drive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (!driveRes.ok) {
        const err = await driveRes.json().catch(() => ({}));
        throw new Error(err.error || 'Upload Drive échoué');
      }
      const data = await driveRes.json();
      setDriveStatus(`✅ Sauvegardé sur Google Drive : ${data.name}`);
    } catch(e) {
      setDriveStatus('❌ ' + e.message);
    }
  }

  async function restaurerBase() {
    if (!restoreFile) { setRestoreStatus('❌ Choisissez d\u2019abord un fichier .db'); return; }
    if (!confirm(`⚠ ATTENTION — Restauration de la base\n\nCela va ÉCRASER toutes les données actuelles du serveur de DÉVELOPPEMENT par le contenu de "${restoreFile.name}".\n\nUne sauvegarde automatique de l'état actuel sera créée avant.\nLe serveur va redémarrer.\n\nConfirmer la restauration ?`)) return;
    setRestoring(true);
    setRestoreStatus('Envoi et validation du fichier…');
    try {
      const token = localStorage.getItem('token');
      const buf = await restoreFile.arrayBuffer();
      const res = await fetch('/api/historique/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: buf,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Cas rollback réussi : message explicite mais pas une erreur fatale
        if (data.rollback === 'OK') {
          setRestoreStatus(`⚠ ${data.error}`);
          return;
        }
        throw new Error(data.error || 'Échec de la restauration');
      }
      setRestoreStatus(`✅ ${data.message} (${data.attributions ?? '?'} attributions) — sauvegarde auto : ${data.backup_auto}. Rechargez la page dans ~15 s.`);
    } catch(e) {
      setRestoreStatus('❌ ' + e.message);
    } finally { setRestoring(false); }
  }


  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-title text-iip-gold">Configuration</h1>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        <button onClick={() => setTab('referentiels')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'referentiels' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Référentiels
        </button>
        <button onClick={() => setTab('annees')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'annees' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Années
        </button>
        <button onClick={() => setTab('etablissement')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'etablissement' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Établissement
        </button>
        <button onClick={() => setTab('personnel')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'personnel' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          👥 Personnel
        </button>
        <button onClick={() => setTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'users' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Utilisateurs
        </button>
        <button onClick={() => setTab('systeme')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'systeme' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Historique &amp; Sauvegarde
        </button>
        <button onClick={() => setTab('parametres')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'parametres' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          ⚙ Paramètres
        </button>
        <button onClick={() => setTab('prerequis')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'prerequis' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          🔗 Prérequis UE
        </button>
        <button onClick={() => setTab('changelog')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'changelog' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Nouveautés
        </button>
      </div>

      {/* ── Onglet Référentiels ── */}
      {tab === 'referentiels' && <Referentiels embedded />}

      {/* ── Onglet Années ── */}
      {tab === 'annees' && <Annees embedded />}

      {/* ── Onglet Établissement ── */}
      {tab === 'etablissement' && <ParametresEtablissement />}

      {/* ── Onglet Personnel ── */}
      {tab === 'personnel' && <GestionPersonnel />}

      {/* ── Onglet Paramètres ── */}
      {tab === 'parametres' && <GestionParametres />}

      {/* ── Onglet Prérequis ── */}
      {tab === 'prerequis' && <GestionPrerequis />}

      {/* ── Onglet Utilisateurs ── */}
      {tab === 'users' && <div className="max-w-5xl"><Users embedded /></div>}

      {/* ── Onglet Nouveautés ── */}
      {tab === 'changelog' && (
        <div className="max-w-3xl bg-white rounded-lg border border-gray-200 p-5">
          <ChangelogView data={changelog} />
        </div>
      )}

      {/* ── Onglet Système ── */}
      {tab === 'systeme' && (loading ? <div className="p-8 text-center text-gray-400">Chargement…</div> : <div className="max-w-3xl space-y-6">

      {/* ── Historique des modifications ── */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-iip-gold/5 border-b border-gray-200">
          <h2 className="font-semibold text-iip-gold">Historique des modifications</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sauvegarde un snapshot complet de chaque attribution avant chaque modification.
            Permet de revenir en arrière en cas d'erreur.
          </p>
        </div>
        <div className="px-4">
          <Toggle
            label="Activer la journalisation"
            description={historiqueActif
              ? "Actif — chaque création, modification et suppression est enregistrée."
              : "Inactif — aucun historique n'est conservé (mode test recommandé)."}
            checked={historiqueActif}
            onChange={toggleHistorique}
            disabled={saving}
          />
        </div>
        {historiqueActif && (
          <div className="px-4 pb-4">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠️ L'historique consomme de l'espace disque. Pour une utilisation intensive,
              pensez à effectuer des sauvegardes régulières et à purger l'historique ancien.
            </p>
          </div>
        )}
      </section>

      {/* ── Sauvegarde de la base ── */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-iip-gold/5 border-b border-gray-200">
          <h2 className="font-semibold text-iip-gold">Sauvegarde de la base de données</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Télécharge une copie complète de la base SQLite (attributions, profs, historique, planning…).
          </p>
        </div>
        <div className="px-4 py-4 space-y-4">
          {/* Téléchargement direct */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-gray-800">Téléchargement direct</div>
              <div className="text-xs text-gray-500">Sauvegarde le fichier .db sur votre ordinateur</div>
              {backupStatus && <div className="text-xs mt-1 text-gray-600">{backupStatus}</div>}
            </div>
            <button onClick={downloadBackup}
              className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-2 rounded font-medium whitespace-nowrap">
              📥 Télécharger
            </button>
          </div>

        </div>
      </section>

      {/* ── Restauration de la base (DEV uniquement) ── */}
      {env === 'dev' && (
        <section className="bg-white rounded-lg border border-red-200 overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <h2 className="font-semibold text-red-700">⚠ Restauration de la base (DEV)</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Remplace entièrement la base de développement par un fichier de sauvegarde .db.
              Une sauvegarde automatique de l'état actuel est créée avant. Le serveur redémarre ensuite.
            </p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <input type="file" accept=".db,application/octet-stream"
                onChange={e => { setRestoreFile(e.target.files?.[0] || null); setRestoreStatus(''); }}
                className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
              <button onClick={restaurerBase} disabled={!restoreFile || restoring}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded font-medium whitespace-nowrap">
                {restoring ? 'Restauration…' : '♻ Restaurer cette base'}
              </button>
            </div>
            {restoreFile && <div className="text-xs text-gray-500">Fichier : {restoreFile.name} ({(restoreFile.size/1024/1024).toFixed(2)} Mo)</div>}
            {restoreStatus && <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2 whitespace-pre-wrap">{restoreStatus}</div>}
            <p className="text-[11px] text-red-600">
              ⚠ Action irréversible sur les données actuelles. Un garde-fou vérifie la base restaurée et remet
              automatiquement l'ancienne en place si elle est illisible (le serveur ne redémarre alors pas).
            </p>
            <details className="text-[11px] text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">🆘 Procédure d'urgence manuelle (si le serveur ne redémarre pas)</summary>
              <div className="mt-2 bg-gray-900 text-gray-100 rounded p-3 font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre">{`sudo -i
# 1. Lister les backups auto (le plus récent = avant la dernière restauration)
ls -lht /volume1/@docker/volumes/attributions-data-dev/_data/backups-auto/
# 2. Arrêter le conteneur qui boucle
docker stop attributions-backend-dev
# 3. Remettre le backup (remplacer <FICHIER>)
cp /volume1/@docker/volumes/attributions-data-dev/_data/backups-auto/<FICHIER> \\
   /volume1/@docker/volumes/attributions-data-dev/_data/attributions.db
# 4. Nettoyer les WAL/SHM résiduels
rm -f /volume1/@docker/volumes/attributions-data-dev/_data/attributions.db-wal \\
      /volume1/@docker/volumes/attributions-data-dev/_data/attributions.db-shm
# 5. Redémarrer
docker start attributions-backend-dev`}</div>
            </details>
          </div>
        </section>
      )}

      {/* ── Infos ── */}
      <section className="bg-white rounded-lg border border-gray-200 px-4 py-4 text-xs text-gray-500 space-y-1">
        <div className="font-semibold text-gray-700 mb-2">À propos</div>
        <div>Base de données : SQLite (fichier <code className="bg-gray-100 px-1 rounded">attributions.db</code>)</div>
        <div>Le fichier de sauvegarde peut être restauré directement sur la Synology en remplaçant
          <code className="bg-gray-100 px-1 rounded mx-1">/volume1/docker/attributions-app/backend/data/attributions.db</code>
          et en redémarrant le container.
        </div>
      </section>
      {/* ── Purge d'une année scolaire ── */}
      <PurgeAnnee />

      {/* ── Régénération données de test (DEV uniquement) ── */}
      {env === 'dev' && <RegenererDonneesDev />}

      </div>)}
    </div>
  );
}

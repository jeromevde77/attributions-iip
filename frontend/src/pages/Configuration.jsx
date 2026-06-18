import { useEffect, useState } from 'react';
import { api, getAnnee } from '../lib/api.js';
import { IconAdjustments, IconBooks, IconBuilding, IconCalendar, IconCheck, IconChevronRight, IconDownload, IconHistory, IconLink, IconScale, IconSettings, IconSparkles, IconUserShield, IconUsers, IconX } from '@tabler/icons-react';
import { PageHeader, RailLateral } from '../components/ui.jsx';

const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, ...opts.headers } }).then(r => r.json());



/* ── Gestion du personnel : matrice missions (section × profs × fonctions) ── */
function GestionPersonnel() {
  const ETAB = '__ETAB__';
  const [sections, setSections]   = useState([]);
  const [section, setSection]     = useState(ETAB);
  const [fonctions, setFonctions] = useState([]);
  const [profs, setProfs]         = useState([]);
  const [coches, setCoches]       = useState({}); // prof_id -> [fonctions]
  const [annee, setAnnee]         = useState('');
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState({}); // "profId|fonction" -> bool

  // Charger la liste des sections une fois
  useEffect(() => {
    api.sections().then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Charger la matrice quand la section change
  useEffect(() => {
    setLoading(true);
    const anneeCourante = getAnnee();
    setAnnee(anneeCourante);
    api.personnelMatrice(section, anneeCourante)
      .then(d => {
        setFonctions(Array.isArray(d.fonctions) ? d.fonctions : []);
        setProfs(Array.isArray(d.profs) ? d.profs : []);
        setCoches(d.coches || {});
        setAnnee(d.annee || anneeCourante);
      })
      .catch(() => { setFonctions([]); setProfs([]); setCoches({}); })
      .finally(() => setLoading(false));
  }, [section]);

  function estCoche(profId, fonction) {
    return (coches[profId] || []).includes(fonction);
  }

  async function toggle(profId, fonction) {
    const actif = !estCoche(profId, fonction);
    const key = profId + '|' + fonction;
    setSaving(s => ({ ...s, [key]: true }));
    // Optimiste
    setCoches(prev => {
      const cur = new Set(prev[profId] || []);
      actif ? cur.add(fonction) : cur.delete(fonction);
      return { ...prev, [profId]: [...cur] };
    });
    try {
      await api.setMission({ professeur_id: profId, fonction, section_code: section, annee_scolaire: annee, actif });
    } catch (e) {
      // Revert en cas d'erreur
      setCoches(prev => {
        const cur = new Set(prev[profId] || []);
        actif ? cur.delete(fonction) : cur.add(fonction);
        return { ...prev, [profId]: [...cur] };
      });
      alert('Erreur : ' + e.message);
    } finally {
      setSaving(s => { const n = { ...s }; delete n[key]; return n; });
    }
  }

  const profsFiltres = search.trim()
    ? profs.filter(p => {
        const q = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const hay = (p.nom_prenom || (p.nom + ' ' + p.prenom)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return hay.includes(q);
      })
    : profs;

  // Compte de coches par prof (pour mettre en avant ceux qui ont des fonctions)
  const profsAvecCoche = profsFiltres.filter(p => (coches[p.id] || []).length > 0);
  const profsSansCoche = profsFiltres.filter(p => (coches[p.id] || []).length === 0);
  const [showTous, setShowTous] = useState(false);

  const sectionLabel = section === ETAB ? "Tout l'établissement" : section;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-gray-800 text-lg">Personnel &amp; fonctions</h3>
          <p className="text-sm text-gray-500">Cochez les fonctions de chaque personne pour la portée sélectionnée{annee ? ` · ${annee}` : ''}</p>
        </div>
      </div>

      {/* Sélecteur de portée / section */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label className="text-sm font-medium text-gray-600">Portée :</label>
        <select value={section} onChange={e => { setSection(e.target.value); setShowTous(false); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-iip-gold">
          <option value={ETAB}>🏛 Tout l'établissement</option>
          {sections.map(s => {
            const code = s.code || s.section || s;
            return <option key={code} value={code}>{code}</option>;
          })}
        </select>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une personne…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-iip-gold" />
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-gray-400">Chargement…</div>
      ) : fonctions.length === 0 ? (
        <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
          Aucune fonction définie pour cette portée.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-slate-800 z-10">
                    Personne <span className="font-normal text-white/60">({profsAvecCoche.length})</span>
                  </th>
                  {fonctions.map(f => (
                    <th key={f.id} className="px-2 py-3 font-medium text-center text-xs whitespace-nowrap" style={{ minWidth: 90 }}>
                      {f.libelle}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Profs avec au moins une coche d'abord */}
                {profsAvecCoche.map((p, idx) => (
                  <tr key={p.id} className={idx % 2 ? 'bg-gray-50' : 'bg-white'}>
                    <td className={`px-4 py-2 font-medium text-gray-800 sticky left-0 z-10 ${idx % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                      {p.nom_prenom || `${p.nom} ${p.prenom}`}
                    </td>
                    {fonctions.map(f => {
                      const key = p.id + '|' + f.libelle;
                      const on = estCoche(p.id, f.libelle);
                      return (
                        <td key={f.id} className="px-2 py-2 text-center">
                          <button type="button" onClick={() => toggle(p.id, f.libelle)} disabled={saving[key]}
                            className={`w-6 h-6 rounded-md border-2 transition inline-flex items-center justify-center ${on
                              ? 'bg-iip-mauve border-iip-mauve text-white'
                              : 'bg-white border-gray-300 hover:border-iip-mauve'} ${saving[key] ? 'opacity-50' : ''}`}>
                            {on && (
                              <IconCheck size={14} />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Séparateur + profs sans coche (repliés) */}
                {profsSansCoche.length > 0 && (
                  <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200" onClick={() => setShowTous(v => !v)}>
                    <td colSpan={fonctions.length + 1} className="px-4 py-2 text-sm text-gray-600 font-medium select-none">
                      <span className="inline-block transition-transform" style={{ transform: showTous ? 'rotate(90deg)' : 'none' }}><IconChevronRight size={14} /></span>
                      {' '}Autres personnes sans fonction ici <span className="text-gray-400 font-normal">({profsSansCoche.length})</span>
                    </td>
                  </tr>
                )}
                {showTous && profsSansCoche.map((p, idx) => (
                  <tr key={p.id} className={idx % 2 ? 'bg-gray-50' : 'bg-white'}>
                    <td className={`px-4 py-2 text-gray-700 sticky left-0 z-10 ${idx % 2 ? 'bg-gray-50' : 'bg-white'}`}>
                      {p.nom_prenom || `${p.nom} ${p.prenom}`}
                    </td>
                    {fonctions.map(f => {
                      const key = p.id + '|' + f.libelle;
                      const on = estCoche(p.id, f.libelle);
                      return (
                        <td key={f.id} className="px-2 py-2 text-center">
                          <button type="button" onClick={() => toggle(p.id, f.libelle)} disabled={saving[key]}
                            className={`w-6 h-6 rounded-md border-2 transition inline-flex items-center justify-center ${on
                              ? 'bg-iip-mauve border-iip-mauve text-white'
                              : 'bg-white border-gray-300 hover:border-iip-mauve'} ${saving[key] ? 'opacity-50' : ''}`}>
                            {on && (
                              <IconCheck size={14} />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 bg-iip-turquoise/5 border border-iip-turquoise/20 rounded-xl p-4 text-sm text-iip-blue">
        <p className="font-medium mb-1">💡 Comment ça fonctionne</p>
        <p>Choisissez d'abord une <strong>portée</strong> : « Tout l'établissement » pour la direction et le secrétariat (présents dans toutes les procédures), ou une <strong>section</strong> précise pour les coordinations. Cochez ensuite les fonctions de chaque personne. Une même personne peut avoir des fonctions différentes selon la section (ex. coordinatrice des stages en TIM, des TFE en AeSI). Ces coches alimentent automatiquement la fiche de la personne et le filtrage des membres dans les procédures de recours et de fraude.</p>
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
  return { label: 'Amélioration', cls: 'bg-iip-turquoise/10 text-iip-blue' };
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
  planification: { icon: IconAdjustments, label: 'Planification', desc: 'Valeurs des cellules EV1/EV2/VC, durée des périodes, contraintes calendaires' },
  session:       { icon: IconCalendar, label: 'Calendrier des sessions', desc: 'Dernier jour admin + délais rétroactifs (EV1, VC, EV2, délibé, recours) pour calculer la dernière semaine de cours' },
  procedures:    { icon: IconScale, label: 'Procédures',    desc: 'Délais légaux, email de direction utilisé dans les PV' },
  etablissement: { icon: IconBuilding, label: 'Établissement', desc: 'Nom et informations de l\'établissement' },
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
        const Icon = meta.icon;
        return (
          <div key={groupe} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">{Icon && <Icon size={17} className="text-iip-turquoise" />}{meta.label}</h3>
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
                          className="text-gray-300 hover:text-gray-500 text-xs"><IconX size={13} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="bg-iip-turquoise/5 border border-iip-turquoise/30 rounded-lg p-4 text-xs text-iip-blue">
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
                            className="text-gray-300 hover:text-red-500 transition text-xs"><IconX size={13} /></button>
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-iip-turquoise/5 border border-iip-turquoise/30 rounded-lg p-3 text-xs text-iip-blue">
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


  const CONF_TABS = [
    { key: 'referentiels', label: 'Référentiels', icon: IconBooks },
    { key: 'annees', label: 'Années', icon: IconCalendar },
    { key: 'etablissement', label: 'Établissement', icon: IconBuilding },
    { key: 'personnel', label: 'Personnel', icon: IconUsers },
    { key: 'users', label: 'Utilisateurs', icon: IconUserShield },
    { key: 'systeme', label: 'Historique & Sauvegarde', icon: IconHistory },
    { key: 'parametres', label: 'Paramètres', icon: IconAdjustments },
    { key: 'prerequis', label: 'Prérequis UE', icon: IconLink },
    { key: 'changelog', label: 'Nouveautés', icon: IconSparkles },
  ];
  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral
        icon={IconSettings}
        titre="Configuration"
        sousTitre="Administration"
        sections={[{ items: CONF_TABS.map(t => ({ key: t.key, label: t.label, icon: t.icon, actif: tab === t.key, onClick: () => setTab(t.key) })) }]}
      />
      <div className="ml-16 px-3 md:px-6 py-4 space-y-6">
        <PageHeader icon={IconSettings} titre="Configuration"
          sous="Référentiels, années, établissement, personnel et paramètres système" />

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
              <IconDownload size={15} className="inline align-[-2px] mr-1" />Télécharger
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
    </div>
  );
}

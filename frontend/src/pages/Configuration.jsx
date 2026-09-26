import { useEffect, useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getAnnee, setAnnee as setAnneeActive, getUser } from '../lib/api.js';
import { chargerCouleurs, echelleGris } from '../lib/couleurs.js';
import Audit from './Audit.jsx';
import { IconAdjustments, IconAward, IconBooks, IconBuilding, IconCalendar, IconCalendarEvent, IconChartBar, IconCheck, IconChevronRight, IconDownload, IconFileText, IconHistory, IconLink, IconScale, IconSettings, IconSparkles, IconUserShield, IconUsers, IconX, IconGavel, IconPlus, IconTrash, IconGripVertical, IconEdit, IconMail, IconPalette, IconArchive, IconAlertTriangle, IconShieldLock, IconDatabase, IconHierarchy, IconArrowsSplit } from '@tabler/icons-react';
import { PageHeader, RailLateral, TuileEtat, PastilleEtat, Encadre } from '../components/ui.jsx';
import ApercuDocuments from '../components/ApercuDocuments.jsx';
const Editeur = lazy(() => import('./Editeur.jsx'));
const ConfigCourriels = lazy(() => import('../components/ConfigCourriels.jsx'));

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
  const [etpHelb, setEtpHelb]     = useState({}); // "profId|fonction" -> etp (0.5, 1.0…)

  // Charger la liste des sections une fois
  useEffect(() => {
    api.sections().then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Charger la matrice quand la section change
  useEffect(() => {
    setLoading(true);
    const anneeCourante = getAnnee();
    setAnnee(anneeCourante);
    Promise.all([
      api.personnelMatrice(section, anneeCourante),
      section !== '__ETAB__'
        ? fetch(`/api/ref/personnel-missions?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(anneeCourante)}`,
            { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json()).catch(() => [])
        : Promise.resolve([])
    ]).then(([d, missions]) => {
        setFonctions(Array.isArray(d.fonctions) ? d.fonctions : []);
        setProfs(Array.isArray(d.profs) ? d.profs : []);
        setCoches(d.coches || {});
        setAnnee(d.annee || anneeCourante);
        // Charger les ETP HELB existants
        const etpMap = {};
        (missions || []).forEach(m => {
          if (m.etp_helb > 0) etpMap[`${m.professeur_id}|${m.fonction}`] = m.etp_helb;
        });
        setEtpHelb(etpMap);
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

  async function saveEtpHelb(profId, fonction, etp) {
    const key = `${profId}|${fonction}`;
    setEtpHelb(prev => ({ ...prev, [key]: etp }));
    try {
      await api.setMission({ professeur_id: profId, fonction, section_code: section, annee_scolaire: annee, etp_helb: etp });
    } catch(e) { alert('Erreur ETP HELB : ' + e.message); }
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
    <div className="max-w-none">
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
            const code = typeof s === 'string' ? s : (s.code ?? s.section ?? '');
            if (!code) return null;
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
                      const etpVal = etpHelb[key] || 0;
                      return (
                        <td key={f.id} className="px-2 py-2 text-center">
                          <button type="button" onClick={() => toggle(p.id, f.libelle)} disabled={saving[key]}
                            className={`w-6 h-6 rounded-md border-2 transition inline-flex items-center justify-center ${on
                              ? 'bg-iip-mauve border-iip-mauve text-white'
                              : 'bg-white border-gray-300 hover:border-iip-mauve'} ${saving[key] ? 'opacity-50' : ''}`}>
                            {on && <IconCheck size={14} />}
                          </button>
                          {on && section !== '__ETAB__' && (
                            <div className="mt-1">
                              <div className="text-xs text-gray-400 leading-none mb-0.5">ETP HELB</div>
                              <input
                                type="number" min="0" max="1" step="0.1"
                                defaultValue={etpVal || ''}
                                placeholder="0.0"
                                title="ETP financé HELB (hors dotation IIP)"
                                onBlur={e => {
                                  const v = parseFloat(e.target.value) || 0;
                                  saveEtpHelb(p.id, f.libelle, v);
                                }}
                                className="w-14 border border-gray-300 rounded px-1 py-0.5 text-xs text-center"
                              />
                            </div>
                          )}
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
                      const etpVal = etpHelb[key] || 0;
                      return (
                        <td key={f.id} className="px-2 py-2 text-center">
                          <button type="button" onClick={() => toggle(p.id, f.libelle)} disabled={saving[key]}
                            className={`w-6 h-6 rounded-md border-2 transition inline-flex items-center justify-center ${on
                              ? 'bg-iip-mauve border-iip-mauve text-white'
                              : 'bg-white border-gray-300 hover:border-iip-mauve'} ${saving[key] ? 'opacity-50' : ''}`}>
                            {on && <IconCheck size={14} />}
                          </button>
                          {on && section !== '__ETAB__' && (
                            <div className="mt-1">
                              <div className="text-xs text-gray-400 leading-none mb-0.5">ETP HELB</div>
                              <input
                                type="number" min="0" max="1" step="0.1"
                                defaultValue={etpVal || ''}
                                placeholder="0.0"
                                title="ETP financé HELB (hors dotation IIP)"
                                onBlur={e => {
                                  const v = parseFloat(e.target.value) || 0;
                                  saveEtpHelb(p.id, f.libelle, v);
                                }}
                                className="w-14 border border-gray-300 rounded px-1 py-0.5 text-xs text-center"
                              />
                            </div>
                          )}
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
                  className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm w-44 bg-white">
                  <option value="">— Choisir —</option>
                  {annees.map(a => <option key={a.code} value={a.code}>{a.code}</option>)}
                </select>
              </div>
              <button onClick={() => { if(annee) setEtape(2); }}
                disabled={!annee}
                className="px-4 py-1.5 h-9 bg-red-600 text-white text-sm rounded disabled:opacity-40 hover:bg-red-700">
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
                className="px-4 py-1.5 h-9 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50">
                {loading ? 'Suppression…' : `Oui, supprimer ${annee}`}
              </button>
              <button onClick={() => { setEtape(1); setErr(''); }}
                className="px-4 py-1.5 h-9 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">
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
              className="px-4 py-1.5 h-9 bg-amber-500 text-white text-sm rounded hover:bg-amber-600">
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
                className="px-4 py-1.5 h-9 bg-amber-500 text-white text-sm rounded hover:bg-amber-600 disabled:opacity-50">
                {loading ? 'Régénération…' : 'Oui, régénérer'}
              </button>
              <button onClick={() => { setEtape(1); setErr(''); }}
                className="px-4 py-1.5 h-9 border border-gray-300 text-gray-600 text-sm rounded hover:bg-gray-50">
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
import DoublonsEtudiants from '../components/DoublonsEtudiants.jsx';
import Annees from './Annees.jsx';
import DatesUE from '../components/DatesUE.jsx';
import Referentiels from './Referentiels.jsx';
import SchemaCapitalisation from '../components/SchemaCapitalisation.jsx';
import Demandes from './Demandes.jsx';
import Sauvegardes from './Sauvegardes.jsx';
import RolesPlafonds from './RolesPlafonds.jsx';
import ParametresEtablissement, { ReglesDeliberation } from './ParametresEtablissement.jsx';
import { authHeaders } from '../lib/api.js';

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
  systeme:       { icon: IconHistory, label: 'Conservation des traces',
                   desc: 'L\'historique des attributions garde un instantané complet de chaque modification : c\'est 96 % du poids du registre. Passé ce délai, seule la trace du geste est conservée — qui, quand, quoi — et la restauration d\'une ligne aussi ancienne n\'est plus possible.' },
  /* DEUX GROUPES QUI N'APPARAISSAIENT NULLE PART. Les textes de la DUE
     (2.12.148) étaient en base, réglables… par personne : leur groupe
     n'était pas déclaré ici, l'écran ne les montrait pas. */
  due:           { icon: IconFileText, label: 'Descriptifs d\'UE (DUE)',
                   desc: 'Les textes fixes du descriptif : finalités générales du décret, mention sous les supports, règle d\'évaluation par défaut.' },
  envois:        { icon: IconMail, label: 'Envois par courriel',
                   desc: 'Le texte qui accompagne un document envoyé, et la signature du courriel. Le registre des envois garde toujours le nom de la personne qui a envoyé.' },
  securite:      { icon: IconShieldLock, label: 'Sécurité des connexions',
                   desc: 'Blocage d\'un compte après des mots de passe erronés. Désactiver rouvre la porte aux essais en série : à ne faire que le temps de régler un incident.' },
};

const PARAM_TYPES = {
  // Les paragraphes se lisent et s'écrivent dans une zone de texte.
  'envoi_message':                 { type: 'texte' },
  'due_finalites_generales':       { type: 'texte' },
  'due_note_supports':             { type: 'texte' },
  'due_note_evaluation':           { type: 'texte' },
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
  /* UN OUI/NON NE SE DEVINE PAS DE SA VALEUR, il se DÉCLARE.
     Quatorze paramètres valent « 0 » ou « 1 » en base, et quatre ne sont pas
     des booléens pour autant : `planning.ev2_heures` est un nombre d'heures qui
     vaut zéro, `session.delib2_duree_cal` un nombre de jours qui vaut un. Les
     transformer en cases à cocher aurait remplacé un réglage horaire par un
     interrupteur — la même famille d'erreur que `totale`/`complete` : le type
     qu'on croit plutôt que celui qui existe. */
  'retention.snapshot_mois':       { type: 'number', step: '1', min: '0', max: '240' },
  'securite.blocage_actif':        { type: 'booleen' },
  /* Les neuf `miseenpage.*` sont AUSSI des oui/non, et ils ont déjà leurs
     cases — dans `ParametresEtablissement.jsx`, écran « Identité et sections ».
     Les déclarer ici n'aurait rien donné : leur groupe n'est pas de cet écran,
     et la ligne serait restée là à faire croire qu'elle sert. */
  'securite.blocage_essais':       { type: 'number', step: '1', min: '1', max: '50' },
  'securite.blocage_paliers':      { type: 'text' },
  'etab.nom':                      { type: 'text' },
};

/* LES PARAMÈTRES SE POSENT DANS L'ÉCRAN DE LEUR SUJET (2.12.200). L'onglet
 * « Paramètres » alignait neuf groupes sans rapport entre eux — délais de
 * procédure, texte des courriels, sécurité des connexions… — et chacun avait
 * AUSSI un écran à lui ailleurs : deux endroits pour un même sujet. Le même
 * composant, limité à `groupes`, se pose désormais dans chaque écran. */
function GestionParametres({ groupes = null }) {
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
    /* TOUTE LA LARGEUR (Charles, 26 septembre 2026 : « il faut utiliser toute
       la largeur, ça permet de ne pas scroller »). La colonne unique de 42 rem
       laissait la moitié droite de l'écran vide ; les groupes se rangent
       désormais en deux ou trois colonnes selon la place. */
    <div className="space-y-4">
      {/* Barre de sauvegarde sticky */}
      {(nbModifs > 0 || saved) && (
        <div className={`sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm
          ${saved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-iip-gold/10 border-iip-gold/30 text-iip-gold'}`}>
          {saved
            ? '✓ Paramètres enregistrés'
            : `${nbModifs} modification${nbModifs > 1 ? 's' : ''} non sauvegardée${nbModifs > 1 ? 's' : ''}`}
          {!saved && (
            <button onClick={sauvegarder} disabled={saving}
              className="bg-iip-gold text-white text-xs px-4 py-1.5 h-9 rounded hover:bg-iip-amber disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 items-start xl:grid-cols-2 min-[1800px]:grid-cols-3">
      {Object.entries(GROUPE_LABELS).filter(([g]) => !groupes || groupes.includes(g)).map(([groupe, meta]) => {
        const params = grouped[groupe] || [];
        if (!params.length) return null;
        const Icon = meta.icon;
        return (
          <div key={groupe} className="carte overflow-hidden min-w-0">
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
                  <div key={p.cle} className={`flex items-center gap-x-4 gap-y-2 px-5 py-3 ${t.type === 'texte' ? 'flex-wrap' : ''} ${modified ? 'bg-iip-gold/5' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{p.label}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.cle}</p>
                    </div>
                    <div className={`flex items-center gap-2 ${t.type === 'texte' ? 'basis-full' : ''}`}>
                      {/* UN OUI/NON SE COCHE. Il se tapait « 0 » ou « 1 » dans un
                          champ : il fallait savoir lequel veut dire oui, et rien
                          ne l'écrivait nulle part. On pouvait aussi y saisir 7. */}
                      {t.type === 'texte' ? (
                        <textarea value={val} rows={6}
                          onChange={e => handleChange(p.cle, e.target.value)}
                          className={`border rounded-champ px-3 py-2 text-[13px] w-full leading-relaxed bg-white
                            ${modified ? 'border-iip-gold ring-1 ring-iip-gold/30' : 'border-gray-300'}`} />
                      ) : t.type === 'booleen' ? (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <span className={`text-[12px] ${val === '1' ? 'text-slate-700' : 'text-slate-400'}`}>
                            {val === '1' ? 'Oui' : 'Non'}
                          </span>
                          <input type="checkbox" checked={val === '1'}
                            onChange={e => handleChange(p.cle, e.target.checked ? '1' : '0')}
                            className={`h-4 w-4 cursor-pointer
                              ${modified ? 'ring-2 ring-iip-gold/40 rounded-champ' : ''}`} />
                        </label>
                      ) : (
                      <input
                        type={t.type || 'text'}
                        step={t.step} min={t.min} max={t.max}
                        value={val}
                        onChange={e => handleChange(p.cle, e.target.value)}
                        style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                        className={`border rounded px-3 py-1.5 text-sm text-right
                          ${t.type === 'number' ? 'w-24' : 'w-64 max-w-full'}
                          ${modified ? 'border-iip-gold ring-1 ring-iip-gold/30' : 'border-gray-300'}`}
                      />
                      )}
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
      </div>

      {!groupes && (
        <p className="text-[12px] text-slate-500">
          Ces réglages valent pour toutes les sections.
        </p>
      )}
    </div>
  );
}

// ─── Gestion des prérequis UE ─────────────────────────────────────────────────
function GestionPrerequis() {
  const [vue, setVue]             = useState('schema');   // schema | liste
  const [graphe, setGraphe]       = useState(null);
  const [msgLien, setMsgLien]     = useState(null);
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

  // Le schéma s'appuie sur la même construction que celle d'Organisation, mais
  // c'est ICI que les liens se modifient : ils relèvent du référentiel et non
  // de l'année scolaire.
  async function chargerGraphe() {
    if (!section) return;
    const annee = getAnnee();
    const rep = await fetch(
      `/api/capitalisation/structure?section=${encodeURIComponent(section)}&annee=${annee}`,
      { headers: authHeaders() });
    setGraphe(rep.ok ? await rep.json() : { nodes: [], edges: [] });
  }
  useEffect(() => { if (vue === 'schema') chargerGraphe(); /* eslint-disable-next-line */ }, [section, vue]);

  async function creerLien(prerequisNum, ueNum, nature = 'legal') {
    let motif = null;
    if (nature === 'interne') {
      motif = window.prompt(
        "Motif de cette règle interne — il apparaîtra en info-bulle sur le trait :",
        `Les professeurs estiment la réussite de l'UE ${prerequisNum} nécessaire.`);
      if (motif === null) return;
    }
    const rep = await fetch('/api/prerequis/ue', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ ue_num: ueNum, prerequis_num: prerequisNum, section,
                             type: nature, motif }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMsgLien({ type: 'err', texte: j.error }); return; }
    setMsgLien({ type: j.created ? 'ok' : 'err',
      texte: j.created ? `L'UE ${prerequisNum} conditionne désormais l'UE ${ueNum}.`
                       : 'Ce lien existait déjà.' });
    await chargerGraphe(); rechargerListe();
  }

  async function supprimerLien(prerequisNum, ueNum) {
    if (!window.confirm(`Supprimer ce prérequis ? L'UE ${prerequisNum} ne conditionnera plus l'UE ${ueNum}, pour toutes les années.`)) return;
    const rep = await fetch(`/api/prerequis/ue?ue_num=${ueNum}&prerequis_num=${prerequisNum}`,
      { method: 'DELETE', headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok) { setMsgLien({ type: 'err', texte: j.error }); return; }
    setMsgLien({ type: 'ok', texte: 'Lien supprimé.' });
    await chargerGraphe(); rechargerListe();
  }

  function rechargerListe() {
    if (!section) return;
    authFetch(`/api/prerequis/ue?section=${encodeURIComponent(section)}`)
      .then(p => setPrereqs(Array.isArray(p) ? p : []));
  }

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
    <div className={`space-y-4 ${vue === 'schema' ? 'max-w-none' : 'max-w-3xl'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm bg-white">
          <option value="">— Choisir une section —</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        <div className="segments h-9">
          {[['schema', 'Schéma'], ['liste', 'Liste']].map(([v, l]) => (
            <button key={v} onClick={() => setVue(v)}
              className={`px-3 text-[13px] ${vue === v
                ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        {section && <span className="text-xs text-gray-400">{prereqs.length} prérequis définis</span>}
      </div>

      <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
        Les prérequis constituent la bibliothèque : ils viennent du dossier pédagogique et
        valent pour <b>toutes les années</b>. Les modifier fait bouger les grilles de parcours
        et les PAE déjà établis. Réservé aux administrateurs.
      </div>

      {msgLien && (
        <div className={`px-3 py-2 rounded-lg text-[13px] flex items-center justify-between ${
          msgLien.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{msgLien.texte}</span>
          <button onClick={() => setMsgLien(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      {section && vue === 'schema' && (
        <SchemaCapitalisation
          data={graphe}
          mode="structure"
          onLien={creerLien}
          onSupprimerLien={supprimerLien}
          titre={`Prérequis — ${section}`}
        />
      )}

      {section && vue === 'liste' && (
        <>
          {/* Ajouter un prérequis */}
          <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Ajouter un prérequis</p>
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 mb-1">UE qui dépend de…</label>
                <select value={newUe} onChange={e => setNewUe(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm bg-white w-72">
                  <option value="">— Choisir l'UE —</option>
                  {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE{u.ue_num} — {u.ue_nom?.slice(0,40)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">…doit être terminée après</label>
                <select value={newPre} onChange={e => setNewPre(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm bg-white w-72">
                  <option value="">— Choisir le prérequis —</option>
                  {ues.filter(u => String(u.ue_num) !== newUe).map(u => <option key={u.ue_num} value={u.ue_num}>UE{u.ue_num} — {u.ue_nom?.slice(0,40)}</option>)}
                </select>
              </div>
              <button onClick={ajouter} disabled={!newUe || !newPre || saving}
                className="bg-iip-gold text-white text-sm px-4 py-1.5 h-9 rounded hover:bg-iip-amber disabled:opacity-50">
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


/* ── Config Contrat : éditeur HTML du template ── */
function ConfigContrat() {
  const [template, setTemplate] = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [preview, setPreview]   = useState(false);

  const VARS = [
    { v: '{{nom_prof}}',      desc: 'Nom complet du membre' },
    { v: '{{prenom_prof}}',   desc: 'Prénom' },
    { v: '{{nom_etab}}',      desc: "Nom de l'établissement" },
    { v: '{{representant}}',  desc: 'Représentant du PO' },
    { v: '{{annee}}',         desc: 'Année scolaire (ex: 2026-2027)' },
    { v: '{{date_contrat}}',  desc: 'Date de signature (longue)' },
    { v: '{{adresse_prof}}',  desc: 'Adresse du membre' },
    { v: '{{niss}}',          desc: 'NISS du membre' },
    { v: '{{cours_liste}}',   desc: 'Bloc HTML des cours attribués' },
    { v: '{{total_periodes}}',desc: 'Total périodes' },
    { v: '{{etp}}',           desc: 'ETP calculé' },
    { v: '{{phrase_etp}}',    desc: 'Phrase temps plein / incomplet' },
    { v: '{{adresse_etab}}',  desc: "Adresse de l'établissement" },
  ];

  const tok = () => localStorage.getItem('token');

  useEffect(() => {
    fetch('/api/config/contrat_template', { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json())
      .then(d => { setTemplate(d.valeur || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function sauvegarder() {
    setSaving(true);
    try {
      await fetch('/api/config/contrat_template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ valeur: template }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function reinitialiser() {
    if (!confirm('Réinitialiser au template par défaut ? Vos modifications seront perdues.')) return;
    try {
      const r = await fetch('/api/config/contrat_template_defaut', { headers: { Authorization: `Bearer ${tok()}` } });
      const d = await r.json();
      setTemplate(d.valeur || '');
    } catch (e) { alert('Erreur : ' + e.message); }
  }

  const inserer = (v) => {
    const ta = document.getElementById('contrat-editor');
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    setTemplate(prev => prev.slice(0, s) + v + prev.slice(e));
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + v.length; ta.focus(); }, 0);
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="max-w-none space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-iip-blue">Template du contrat de travail</h2>
          <p className="text-xs text-gray-500 mt-0.5">Éditez le HTML du contrat. Utilisez les variables <code className="bg-gray-100 px-1 rounded">{"{{variable}}"}</code> pour les données dynamiques.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reinitialiser} className="text-xs border border-gray-300 text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg">↺ Réinitialiser</button>
          <button onClick={() => setPreview(v => !v)} className={`text-xs px-3 py-1.5 rounded-lg border ${preview ? 'bg-iip-blue text-white border-iip-blue' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {preview ? '⊞ Éditeur' : '👁 Prévisualiser'}
          </button>
          <button onClick={sauvegarder} disabled={saving}
            className={`text-xs px-4 py-1.5 rounded-lg font-semibold ${saved ? 'bg-green-600 text-white' : 'bg-iip-blue text-white hover:opacity-90'} disabled:opacity-40`}>
            {saved ? '✓ Sauvegardé' : saving ? 'Sauvegarde…' : '✓ Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Variables disponibles */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <div className="text-xs font-bold text-amber-700 mb-2">Variables disponibles — cliquez pour insérer</div>
        <div className="flex flex-wrap gap-1.5">
          {VARS.map(({ v, desc }) => (
            <button key={v} onClick={() => inserer(v)} title={desc}
              className="text-xs font-mono bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 px-2 py-0.5 rounded transition">
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Éditeur / Prévisualisation */}
      {preview ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: '70vh' }}>
          <iframe srcDoc={template} className="w-full h-full border-0" aria-label="Aperçu contrat" />
        </div>
      ) : (
        <textarea
          id="contrat-editor"
          value={template}
          onChange={e => setTemplate(e.target.value)}
          spellCheck={false}
          className="w-full font-mono text-xs bg-gray-950 text-green-300 rounded-xl p-4 border border-gray-800 focus:outline-none focus:border-iip-turquoise resize-none"
          style={{ height: '70vh', lineHeight: '1.6', tabSize: 2 }}
          placeholder="Le template HTML du contrat s'affiche ici…"
        />
      )}
    </div>
  );
}

/* ── Config Attestation ── */
function ConfigAttestation() {
  const tok = () => localStorage.getItem('token');
  const af  = (url, opts={}) => fetch(url, { ...opts, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${tok()}`, ...(opts.headers||{}) } }).then(async r => { const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Erreur'); return j; });

  const [etab, setEtab]           = useState(null);
  const [sections, setSections]   = useState([]);
  const [ueSections, setUeSections] = useState([]); // valeurs distinctes de ue.section (liste fermée)
  const [saved, setSaved]         = useState('');

  useEffect(() => {
    af('/api/config/attestation_etab').then(d => { try { setEtab(JSON.parse(d.valeur)); } catch { setEtab({}); } });
    af('/api/config/attestation_sections').then(d => { try { setSections(JSON.parse(d.valeur)); } catch { setSections([]); } });
    af('/api/referentiels/ue-sections').then(d => setUeSections(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const sauvegarderEtab = async () => {
    await af('/api/config/attestation_etab', { method: 'PUT', body: JSON.stringify({ valeur: JSON.stringify(etab) }) });
    setSaved('etab'); setTimeout(() => setSaved(''), 2000);
  };

  const sauvegarderSections = async () => {
    await af('/api/config/attestation_sections', { method: 'PUT', body: JSON.stringify({ valeur: JSON.stringify(sections) }) });
    setSaved('sections'); setTimeout(() => setSaved(''), 2000);
  };

  const ajouterSection = () => setSections(s => [...s, { code: '', section: '', diplome: '', periodes: 0, ects: 0, domaine: '', grade_academique: '', date_approbation: '', duree_annees: '', president_jury: '', ue_section: '' }]);
  const supprimerSection = (i) => setSections(s => s.filter((_, j) => j !== i));
  const majSection = (i, k, v) => setSections(s => s.map((x, j) => j === i ? { ...x, [k]: k==='periodes'||k==='ects' ? Number(v) : v } : x));

  if (!etab) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  const ONGLETS_LOC = [
    { key: 'etab', label: 'Établissement' },
    { key: 'sections', label: 'Sections & Diplômes' },
  ];

  return (
    <div className="max-w-none space-y-4">
      {/* UNE SECONDE RANGÉE D'ONGLETS SOUS CELLE DES DOCUMENTS, POUR DEUX
          BLOCS (2.12.177). Ils tiennent l'un sous l'autre : on lit la page
          d'un trait, et l'on ne se demande plus dans quel onglet on est. */}
      <h2 className="text-[17px] font-semibold text-iip-blue">Configuration des attestations</h2>

      {/* ── Établissement ── */}
      <h3 className="text-[15px] font-semibold text-iip-blue">{ONGLETS_LOC[0].label}</h3>
      {(
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['nom',        "Nom de l'établissement"],
              ['adresse',    'Adresse complète'],
              ['matricule',  'N° matricule'],
              ['fase',       'N° FASE'],
              ['ville',      'Ville'],
              ['directeur',  'Directeur (Nom Prénom)'],
              ['tel',        'Téléphone'],
              ['site',       'Site web'],
            ].map(([k, label]) => (
              <div key={k} className={k === 'adresse' ? 'col-span-2' : ''}>
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <input value={etab[k]||''} onChange={e => setEtab(et => ({ ...et, [k]: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm h-9" />
              </div>
            ))}
          </div>
          <button onClick={sauvegarderEtab}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${saved==='etab' ? 'bg-green-600 text-white' : 'bg-iip-blue text-white hover:opacity-90'}`}>
            {saved==='etab' ? '✓ Sauvegardé' : '✓ Sauvegarder'}
          </button>
        </div>
      )}

      {/* ── Sections & Diplômes ── */}
      <h3 className="text-[15px] font-semibold text-iip-blue pt-2">{ONGLETS_LOC[1].label}</h3>
      {(
        <div className="space-y-3">
          <div className="text-xs text-gray-500 mb-2">Chaque section correspond à un diplôme délivrable. Renseignez le code Gouvernement exact.</div>
          {sections.map((s, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['section',  'Intitulé section (majuscules)'],
                  ['diplome',  'Intitulé diplôme (majuscules)'],
                  ['code',     'Code Gouvernement (ex: 914300S34D3)'],
                  ['periodes', 'Total périodes'],
                  ['ects',     'Total ECTS'],
                  ['domaine',          'Domaine (ex: Sciences de la santé publique)'],
                  ['grade_academique', 'Grade académique (vide = intitulé section)'],
                  ['date_approbation', "Date d'approbation du dossier (ex: 5 juillet 2024)"],
                  ['duree_annees',     'Durée (années)'],
                  ['president_jury',   'Président·e du jury'],
                  ['ue_section',       'Section (référentiel UE) — ex: TIM (pour le calcul de mention)'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <div className="text-xs text-gray-500 mb-0.5">{label}</div>
                    {k === 'ue_section' ? (
                      <select value={s[k]||''} onChange={e => majSection(i, k, e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs h-8 bg-white">
                        <option value="">— aucune —</option>
                        {s[k] && !ueSections.includes(s[k]) && <option value={s[k]}>{s[k]} (hors liste)</option>}
                        {ueSections.map(sec => <option key={sec} value={sec}>{sec}</option>)}
                      </select>
                    ) : (
                      <input value={s[k]||''} onChange={e => majSection(i, k, e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs h-8" />
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => supprimerSection(i)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                <IconTrash size={12}/> Supprimer
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={ajouterSection}
              className="flex items-center gap-1.5 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:opacity-90">
              <IconPlus size={14}/> Ajouter une section
            </button>
            <button onClick={sauvegarderSections}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${saved==='sections' ? 'bg-green-600 text-white' : 'bg-iip-blue text-white hover:opacity-90'}`}>
              {saved==='sections' ? '✓ Sauvegardé' : '✓ Sauvegarder'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Configuration() {

  // L'onglet peut être imposé par l'URL (?onglet=...) — utilisé par les
  // assistants de mise en route pour envoyer vers le bon écran.
  const [paramsUrl] = useSearchParams();
  const [tab, setTab] = useState(paramsUrl.get('onglet') || 'users');
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
  const [anneeActive, setAnneeActive] = useState('');

  useEffect(() => {
    api.historiqueConfig().then(r => {
      setHistoriqueActif(r.actif);
    }).catch(() => {}).finally(() => setLoading(false));
    api.changelog().then(r => setChangelog(r)).catch(() => {});
    fetch('/api/info').then(r => r.json()).then(d => setEnv(d.environnement)).catch(() => {});
    // Année active : nécessaire au paramétrage annuel (dates des UE)
    fetch('/api/annees', { headers: authHeaders() }).then(r => r.json())
      .then(list => {
        const a = (Array.isArray(list) ? list : []).find(x => x.active) || list?.[0];
        if (a?.code) setAnneeActive(a.code);
      }).catch(() => {});
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


  // Trois niveaux de données distincts :
  //  · Référentiel légal — la bibliothèque, quasi figée, administrateur seul
  //  · Paramétrage annuel — ce qui se rejoue chaque rentrée
  //  · Établissement / Système / Modèles — le reste
  const CONF_GROUPES = [
    /*
     * L'ORDRE, ET IL N'ÉTAIT NULLE PART.
     *
     * Vingt-quatre entrées en cinq groupes, rangées au fil de ce qu'on
     * ajoutait : « Sauvegardes » sous « Référentiel légal », deux icônes de
     * personnes qui ne disent pas la même chose, deux calendriers, et
     * « Historique & Sauvegarde » à côté de « Sauvegardes » — deux écrans
     * différents portant presque le même nom.
     *
     * Le classement suit maintenant ce qu'on vient y faire, du plus permanent
     * au plus technique : qui nous sommes, ce qu'on enseigne, comment on
     * délibère, ce qu'on produit, qui entre, et enfin la machine.
     */
    /* RANGÉE LE 26 SEPTEMBRE 2026 (Charles : « tout est mélangé, trop de
     * menus »). UNE RÈGLE : Configuration règle comment Lucie se comporte ;
     * elle ne contient ni outils, ni registres, ni données de l'année. Chaque
     * réglage vit à un seul endroit, à côté de ceux du même sujet. Ce qui n'est
     * pas un réglage est regroupé sous « Outils », en attendant de rejoindre
     * l'écran où l'on s'en sert. Plan complet : l'étude « Configuration
     * rangée ». */
    { label: 'Établissement', icon: IconBuilding, items: [
      { key: 'etablissement', label: 'Identité', icon: IconBuilding },
      { key: 'annees', label: 'Années et calendrier', icon: IconCalendar },
    ]},
    /* Ce qu'on enseigne et comment on le sanctionne. Les faces annuelles
     * portent l'année au bout de la rangée, une seule fois. */
    { label: 'Enseignement', icon: IconBooks, items: [
      { key: 'referentiel-annee', label: 'Unités et cours', icon: IconBooks, annee: true },
      { key: 'ref-prerequis', label: "Prérequis d'UE", icon: IconHierarchy, annee: true },
      { key: 'ref-deliberation', label: 'Règles de délibération', icon: IconScale, annee: true },
      { key: 'procedures', label: 'Procédures et délais', icon: IconGavel },
      { key: 'planification', label: 'Planification', icon: IconCalendarEvent },
    ]},
    // Les modèles de ce qui sort de Lucie — sur papier ou par courriel.
    { label: 'Documents et envois', icon: IconFileText, items: [
      { key: 'editeur', label: 'Modèles de pièces', icon: IconEdit },
      { key: 'apercu', label: 'Aperçu des pièces', icon: IconFileText },
      { key: 'contrat', label: 'Contrat', icon: IconFileText },
      { key: 'attestation', label: 'Attestation', icon: IconAward },
      { key: 'recrutement', label: 'Recrutement', icon: IconSettings },
      { key: 'due', label: "Descriptifs d'UE", icon: IconFileText },
      { key: 'courriels', label: 'Courriels', icon: IconMail },
    ]},
    { label: 'Accès', icon: IconUserShield, items: [
      { key: 'users', label: 'Utilisateurs', icon: IconUserShield },
      { key: 'roles', label: 'Rôles et plafonds', icon: IconUserShield },
      { key: 'personnel', label: 'Personnel', icon: IconUsers },
      { key: 'securite', label: 'Sécurité des connexions', icon: IconUserShield },
    ]},
    // La machine, et l'apparence de toute l'application (Charles : « je
    // mettrais bien Apparence dans Système »).
    { label: 'Système', icon: IconAdjustments, items: [
      { key: 'couleurs', label: 'Thèmes et couleurs', icon: IconPalette },
      { key: 'sauvegardes', label: 'Sauvegardes', icon: IconDownload },
      { key: 'systeme', label: 'Traces et historique', icon: IconHistory },
      { key: 'audit', label: 'Qui a fait quoi', icon: IconUserShield },
      { key: 'changelog', label: 'Nouveautés', icon: IconSparkles },
    ]},
    /* CE QUI N'EST PAS UN RÉGLAGE. Des outils, une file de travail, des
     * données de l'année : ils rejoindront l'écran où l'on s'en sert (lot 4
     * du plan). Regroupés ici d'ici là, pour qu'on sache où ils sont. */
    { label: 'Outils', icon: IconDatabase, items: [
      { key: 'dates-ue', label: "Dates des UE", icon: IconCalendarEvent },
      { key: 'doublons', label: 'Dossiers dédoublés', icon: IconUsers },
      { key: 'demandes', label: 'Demandes à valider', icon: IconCheck },
      { key: 'statistiques', label: 'Effectifs et postes PNCC', icon: IconChartBar },
      { key: 'reprise', label: "Clôturer une année reprise", icon: IconArchive },
    ]},
  ];
  // « QUI A FAIT QUOI » N'APPARAÎT QUE POUR L'ADMINISTRATEUR, et le serveur le
  // refuse de toute façon : un onglet visible qui rend un 403 se lit « Lucie
  // est cassée », pas « ce n'est pas pour vous ».
  const groupesVisibles = CONF_GROUPES.map(g => ({ ...g,
    items: g.items.filter(t => t.key !== 'audit' || getUser()?.role === 'admin') }));
  const groupeActif = groupesVisibles.find(g => g.items.some(t => t.key === tab)) || groupesVisibles[0];
  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* VINGT-DEUX ICÔNES, ET PLUS PERSONNE NE TROUVAIT RIEN (Charles, 21
          septembre 2026). Le rail dit OÙ L'ON EST : six familles, une icône
          chacune. Ce qu'une famille contient se choisit dans ses FEUILLES,
          en tête de l'écran, avec des mots — comme en Planification. */}
      <RailLateral
        icon={IconSettings}
        titre="Configuration"
        sousTitre="Administration"
        sections={[{ label: 'Configuration', items: groupesVisibles.map(g => ({
          key: g.label, label: g.label, icon: g.icon,
          actif: g === groupeActif,
          onClick: () => { if (g !== groupeActif) setTab(g.items[0].key); },
        })) }]}
      />
      <div className="gouttiere-rail px-3 md:px-6 py-4 space-y-6">
        <PageHeader icon={IconSettings} titre="Configuration"
          sous="Référentiels, années, établissement, personnel et paramètres système" />
        {groupeActif.items.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 -mt-2">
            {groupeActif.items.map(t => {
              const Icone = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`onglet-page ${tab === t.key ? 'onglet-page-actif' : ''} flex items-center gap-1.5`}>
                  <Icone size={15} />{t.label}
                </button>
              );
            })}
            {/* L'année vaut pour les quatre faces du référentiel : elle se
                pose une fois, au bout de la rangée, et seulement là. */}
            {groupeActif.items.find(t => t.key === tab)?.annee && (
              <span className="ml-auto pb-1"><AnneeDuReferentiel onglet={tab} /></span>
            )}
          </div>
        )}

      {/* ── Le référentiel de l'année, ses quatre faces ── */}
      {tab === 'referentiel-annee' && <Referentiels embedded />}
      {tab === 'ref-prerequis' && <GestionPrerequis />}
      {/* LES PONDÉRATIONS ONT DÉMÉNAGÉ (2.12.187) : elles sont annuelles, elles
          vivent dans Organisation. L'entrée reste un temps, pour qui la cherche
          ici, et y renvoie. */}
      {tab === 'ref-ponderations' && (
        <div className="p-5 space-y-3 max-w-2xl">
          <h2 className="text-[17px] font-semibold text-iip-blue">Les pondérations ont déménagé</h2>
          <p className="text-[13px] text-slate-600">
            Les poids des cours et des acquis se règlent désormais par année, dans
            <b> Organisation → Pondérations</b> : la part de chaque cours dans l'UE, les liens entre acquis
            et cours, et les dix points de chaque cours.
          </p>
          <a href="/organisation?onglet=ponderations" className="bouton bouton-fort inline-flex">Ouvrir Organisation → Pondérations</a>
        </div>
      )}
      {tab === 'ref-deliberation' && <ReglesDeliberation />}

      {/* ── Onglet Années ── */}
      {tab === 'annees' && <div className="space-y-4"><Annees embedded /><GestionParametres groupes={['session']} /></div>}
      {tab === 'planification' && <GestionParametres groupes={['planification']} />}
      {tab === 'due' && <GestionParametres groupes={['due']} />}
      {tab === 'securite' && <GestionParametres groupes={['securite']} />}

      {/* ── Onglet Clôture d'une année reprise d'archives ── */}
      {tab === 'reprise' && <ClotureReprise />}

      {/* ── Onglet Dossiers dédoublés ──
          Le matricule change d'une année à l'autre : l'import d'une seconde
          année créait un dossier de plus par revenant. On répare ici. */}
      {tab === 'doublons' && <DoublonsEtudiants />}

      {/* ── Onglet Dates des UE (paramétrage annuel) ── */}
      {tab === 'dates-ue' && <DatesUE annee={anneeActive} />}

      {/* ── Onglet Établissement ── */}
      {tab === 'etablissement' && <ParametresEtablissement />}

      {/* ── Onglet Personnel ── */}
      {tab === 'personnel' && <GestionPersonnel />}

      {/* ── Onglet Paramètres ── */}
      {tab === 'parametres' && <GestionParametres />}

      {/* ── Onglet Prérequis ── */}
      {tab === 'demandes' && <Demandes />}
      {tab === 'sauvegardes' && <Sauvegardes />}

      {/* ── Onglet Utilisateurs ── */}
      {tab === 'users' && <div className="max-w-none"><Users embedded /></div>}
      {tab === 'roles' && <RolesPlafonds />}

      {/* ── Onglet Nouveautés ── */}
      {tab === 'changelog' && (
        <div className="max-w-none bg-white rounded-lg border border-gray-200 p-5">
          <ChangelogView data={changelog} />
        </div>
      )}

      {/* ── Onglet Éditeur ── */}
      {tab === 'editeur' && (
        <Suspense fallback={<div className="p-8 text-center text-gray-400">Chargement…</div>}>
          <Editeur />
        </Suspense>
      )}

      {/* ── Aperçu des pièces officielles ──
          L'éditeur sert à écrire un modèle ; celui-ci sert à VOIR une pièce
          telle qu'elle sortira, sans avoir à délibérer une unité pour la juger. */}
      {tab === 'apercu' && (
        <ApercuDocuments onClose={() => setTab('editeur')} />
      )}

      {tab === 'couleurs' && <ReglageCouleurs />}

      {/* ── Onglet Recrutement ── */}
      {tab === 'recrutement' && <ConfigRecrutement />}

      {/* ── Onglet Contrat ── */}
      {tab === 'contrat' && <ConfigContrat />}

      {/* ── Onglet Courriels ── */}
      {tab === 'courriels' && (
        <Suspense fallback={<div className="p-8 text-center text-gray-400">Chargement…</div>}>
          <div className="space-y-4"><ConfigCourriels /><GestionParametres groupes={['envois']} /></div>
        </Suspense>
      )}

      {/* ── Onglet Attestation ── */}
      {tab === 'attestation' && <ConfigAttestation />}

      {/* ── Onglet Système ── */}
      {tab === 'systeme' && (loading ? <div className="p-8 text-center text-gray-400">Chargement…</div> : <div className="max-w-none space-y-6">
      <GestionParametres groupes={['systeme']} />

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
                className="text-sm text-gray-600 file:mr-3 file:py-1.5 h-9 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
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

      {/* ── Onglet Procédures ── */}
      {tab === 'procedures' && <div className="space-y-4"><GestionParametres groupes={['procedures']} /><OngletProcedures /></div>}
      {tab === 'audit' && <Audit />}
      {tab === 'statistiques' && <OngletStatistiques />}

        </div>
    </div>
  );
}

// Catégories PNCC
const PNCC_CATS = [
  { value: 'secretariat_etudiant', label: 'Secrétariat étudiant', color: '#0EA5E9', desc: 'Proratisé au nb de sections pour le ratio étu./ETP' },
  { value: 'secretariat_rh',       label: 'Secrétariat RH',       color: '#8B5CF6', desc: '' },
  { value: 'direction',            label: 'Direction',             color: '#1B2B4B', desc: '' },
  { value: 'economat',             label: 'Économat',              color: '#F59E0B', desc: '' },
  { value: 'autre',                label: 'Autre',                 color: '#6B7280', desc: '' },
];

function PnccSection({ annee }) {
  const [postes, setPostes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm]     = useState({ categorie: 'secretariat_etudiant', libelle_fonction: '', nom_personne: '', etp: '1.0', notes: '' });
  const [saving, setSaving] = useState(false);
  const tok = () => localStorage.getItem('token');

  useEffect(() => {
    if (!annee) return;
    setLoading(true);
    fetch(`/api/pilotage/pncc?annee=${encodeURIComponent(annee)}`, { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json()).then(d => setPostes(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoading(false));
  }, [annee]);

  async function ajouter() {
    if (!form.libelle_fonction.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/pilotage/pncc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ ...form, annee_scolaire: annee, etp: parseFloat(form.etp) || 1.0 })
      });
      const d = await r.json();
      setPostes(prev => [...prev, { id: d.id, ...form, annee_scolaire: annee, etp: parseFloat(form.etp) || 1.0 }]);
      setForm(f => ({ ...f, libelle_fonction: '', nom_personne: '', notes: '' }));
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function supprimer(id) {
    if (!confirm('Supprimer ce poste ?')) return;
    await fetch(`/api/pilotage/pncc/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` } });
    setPostes(prev => prev.filter(p => p.id !== id));
  }

  async function updateEtp(id, etp) {
    const p = postes.find(p => p.id === id);
    if (!p) return;
    await fetch(`/api/pilotage/pncc/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
      body: JSON.stringify({ ...p, etp: parseFloat(etp) || 1.0 })
    });
    setPostes(prev => prev.map(p => p.id === id ? { ...p, etp: parseFloat(etp) || 1.0 } : p));
  }

  const totalSecEtu = postes.filter(p => p.categorie === 'secretariat_etudiant').reduce((s, p) => s + (p.etp || 0), 0);
  const totalAll = postes.reduce((s, p) => s + (p.etp || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800 text-sm">Postes PNCC — Personnel non chargé de cours</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Année {annee} · Total : <strong>{totalAll.toFixed(1)} ETP</strong>
            {totalSecEtu > 0 && <> · dont secrétariat étudiant : <strong className="text-sky-600">{totalSecEtu.toFixed(1)} ETP</strong> (proratisé par section)</>}
          </p>
        </div>
      </div>

      {/* Liste par catégorie */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          <div className="px-5 py-6 text-center text-gray-400 text-sm">Chargement…</div>
        ) : postes.length === 0 ? (
          <div className="px-5 py-6 text-center text-gray-400 text-sm">Aucun poste PNCC pour {annee}.</div>
        ) : PNCC_CATS.map(cat => {
          const liste = postes.filter(p => p.categorie === cat.value);
          if (!liste.length) return null;
          const totCat = liste.reduce((s, p) => s + (p.etp || 0), 0);
          return (
            <div key={cat.value} className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span style={{background: cat.color}} className="text-white text-xs font-bold px-2 py-0.5 rounded">{cat.label}</span>
                <span className="text-xs text-gray-400">{totCat.toFixed(1)} ETP</span>
                {cat.desc && <span className="text-xs text-gray-400 italic">· {cat.desc}</span>}
              </div>
              <div className="space-y-1.5">
                {liste.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">{p.libelle_fonction}</span>
                      {p.nom_personne && <span className="text-xs text-gray-500 ml-2">— {p.nom_personne}</span>}
                    </div>
                    <input type="number" min="0" max="2" step="0.1"
                      defaultValue={p.etp}
                      onBlur={e => updateEtp(p.id, e.target.value)}
                      className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-right font-semibold text-iip-blue"
                    />
                    <span className="text-xs text-gray-400">ETP</span>
                    <button onClick={() => supprimer(p.id)} className="text-red-400 hover:text-red-600 ml-1">
                      <IconTrash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Formulaire ajout */}
      <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
        <div className="text-xs font-semibold text-gray-600 mb-2">Ajouter un poste</div>
        <div className="flex flex-wrap gap-2 items-end">
          <select value={form.categorie} onChange={e => setForm(f => ({...f, categorie: e.target.value}))}
            className="border border-gray-300 rounded px-2.5 py-1.5 h-9 text-sm bg-white">
            {PNCC_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input value={form.libelle_fonction} onChange={e => setForm(f => ({...f, libelle_fonction: e.target.value}))}
            placeholder="Fonction (ex: Secrétaire étudiant)" onKeyDown={e => e.key === 'Enter' && ajouter()}
            className="border border-gray-300 rounded px-2.5 py-1.5 h-9 text-sm flex-1 min-w-[180px]" />
          <input value={form.nom_personne} onChange={e => setForm(f => ({...f, nom_personne: e.target.value}))}
            placeholder="Personne (optionnel)"
            className="border border-gray-300 rounded px-2.5 py-1.5 h-9 text-sm w-40" />
          <div className="flex items-center gap-1.5">
            <input type="number" min="0" max="2" step="0.1" value={form.etp}
              onChange={e => setForm(f => ({...f, etp: e.target.value}))}
              className="border border-gray-300 rounded px-2.5 py-1.5 h-9 text-sm w-20 text-right" />
            <span className="text-xs text-gray-500">ETP</span>
          </div>
          <button onClick={ajouter} disabled={saving || !form.libelle_fonction.trim()}
            className="h-9 px-3 bg-iip-turquoise text-white text-sm font-semibold rounded flex items-center gap-1.5 disabled:opacity-40">
            <IconPlus size={14} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Onglet Procédures : justifications types configurables ───────────────────
function OngletProcedures() {
  const [justifs, setJustifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nouveau, setNouveau] = useState('');

  const CLE = 'procedure.justifications_recours';

  useEffect(() => {
    fetch('/api/parametres/' + CLE, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.valeur) {
          try { setJustifs(JSON.parse(d.valeur)); } catch { setJustifs([]); }
        } else {
          // Valeurs par défaut si pas encore configuré
          setJustifs([
            "L'étudiant·e ne conteste aucune irrégularité de procédure, mais exprime un désaccord avec l'appréciation pédagogique. Or, la Commission de recours ne peut substituer sa note à celle du jury (art. 123ter du Décret du 16 avril 1991 organisant l'enseignement pour adultes).",
            "Les acquis d'apprentissage et les critères d'évaluation ont été communiqués conformément au dossier pédagogique. L'évaluation reflète fidèlement le niveau d'acquisition observé lors de l'épreuve.",
            "Le CDE a examiné les copies en séance. Aucune erreur matérielle, aucun écart de traitement entre étudiants n'a été relevé.",
            "La modalité d'évaluation contestée était prévue au dossier pédagogique et portée à la connaissance des étudiants en début d'UE.",
            "L'irrégularité invoquée n'a pas eu d'incidence sur l'issue de la délibération : le résultat reste en-dessous du seuil de réussite, indépendamment du point litigieux.",
            "Le délai de recours n'est pas respecté. La plainte a été introduite après le 4e jour calendrier suivant la publication des résultats (art. 123ter §4 du Décret du 16 avril 1991 organisant l'enseignement pour adultes).",
            "La plainte ne mentionne pas d'irrégularités précises au sens de l'art. 123ter du Décret du 16 avril 1991 organisant l'enseignement pour adultes. Une contestation de la valeur d'une note n'est pas recevable comme motif de recours.",
          ]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function sauvegarder(newJustifs) {
    setSaving(true);
    try {
      /* L'ENREGISTREMENT NE SE FAISAIT PAS, ET L'ÉCRAN DISAIT LE CONTRAIRE
         (inventaire du 26 septembre 2026). Il appelait `PUT /parametres/:cle`,
         que le serveur ne connaît pas — seuls `PATCH /:cle` (clé existante)
         et `PUT /bulk` (ajoute ou remplace) existent —, et affichait
         « Sauvegardé » sans lire la réponse. Aucune justification n'a jamais
         été gardée en production. On passe par `bulk`, qui crée la clé la
         première fois, et l'on n'annonce rien que le serveur n'a pas confirmé. */
      const rep = await fetch('/api/parametres/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ [CLE]: JSON.stringify(newJustifs) })
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        throw new Error(j.error || `le serveur a répondu ${rep.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  function ajouter() {
    if (!nouveau.trim()) return;
    const updated = [...justifs, nouveau.trim()];
    setJustifs(updated);
    setNouveau('');
    sauvegarder(updated);
  }

  function supprimer(i) {
    const updated = justifs.filter((_, idx) => idx !== i);
    setJustifs(updated);
    sauvegarder(updated);
  }

  function modifier(i, val) {
    const updated = justifs.map((j, idx) => idx === i ? val : j);
    setJustifs(updated);
  }

  function monterDescendre(i, dir) {
    const updated = [...justifs];
    const j = i + dir;
    if (j < 0 || j >= updated.length) return;
    [updated[i], updated[j]] = [updated[j], updated[i]];
    setJustifs(updated);
    sauvegarder(updated);
  }

  if (loading) return <div className="p-8 text-gray-400">Chargement…</div>;

  return (
    <div className="max-w-none bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800 text-base flex items-center gap-2">
          <IconGavel size={17} className="text-iip-turquoise" />
          Justifications types — Procédure de recours
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Ces textes apparaissent sous forme de cases à cocher dans le formulaire de recours.
          L'établissement peut en ajouter, modifier ou supprimer selon ses besoins.
        </p>
      </div>

      <div className="space-y-2">
        {justifs.map((j, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <div className="flex flex-col gap-0.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => monterDescendre(i, -1)} disabled={i === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▲</button>
              <button onClick={() => monterDescendre(i, 1)} disabled={i === justifs.length - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▼</button>
            </div>
            <textarea
              value={j}
              onChange={e => modifier(i, e.target.value)}
              onBlur={() => sauvegarder(justifs)}
              rows={2}
              className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-iip-turquoise"
            />
            <button onClick={() => supprimer(i)} className="text-red-400 hover:text-red-600 pt-1 flex-shrink-0">
              <IconTrash size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Ajouter une justification */}
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-600">Ajouter une justification</div>
        <div className="flex gap-2">
          <textarea value={nouveau} onChange={e => setNouveau(e.target.value)} rows={2}
            placeholder="Rédigez la nouvelle justification…"
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm resize-none" />
          <button onClick={ajouter} disabled={!nouveau.trim()}
            className="flex-shrink-0 bg-iip-turquoise text-white px-3 py-2 rounded text-sm font-semibold flex items-center gap-1 disabled:opacity-40">
            <IconPlus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {saved && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <IconCheck size={13} /> Sauvegardé
        </p>
      )}
    </div>
  );
}

// ── Onglet Statistiques : effectifs estimés par section / UE ─────────────────
function OngletStatistiques() {
  const [annees, setAnnees]       = useState([]);
  const [annee, setAnnee]         = useState('');
  const [sections, setSections]   = useState([]);
  const [section, setSection]     = useState('');
  const [ues, setUes]             = useState([]); // [{ue_num, ue_nom, ue_niv, nb_etudiants}]
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [totalSection, setTotalSection] = useState(''); // saisie rapide total section
  const [modeSaisie, setModeSaisie] = useState('ue'); // 'ue' | 'section'

  // Charger années et sections
  useEffect(() => {
    api.annees().then(d => {
      const liste = Array.isArray(d)
        ? d.map(a => typeof a === 'string' ? a : (a.code ?? a.annee_scolaire ?? '')).filter(Boolean)
        : [];
      setAnnees(liste);
      if (liste.length) setAnnee(liste[0]);
    }).catch(() => {});
    api.sections().then(d => {
      const liste = Array.isArray(d) ? d : [];
      setSections(liste);
      if (liste.length) {
        const premier = liste.find(s => (typeof s === 'string' ? s : (s.code ?? s.section)));
        if (premier) setSection(typeof premier === 'string' ? premier : (premier.code ?? premier.section));
      }
    }).catch(() => {});
  }, []);

  // Charger UEs de la section/année
  useEffect(() => {
    if (!annee || !section) return;
    setLoading(true);
    fetch(`/api/ref/ues?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(d => {
        const liste = (Array.isArray(d) ? d : [])
          .filter(u => u.ue_num)
          .sort((a, b) => (a.ue_num - b.ue_num));
        setUes(liste.map(u => ({ ...u, nb_etudiants: u.nb_etudiants ?? '' })));
      })
      .catch(() => setUes([]))
      .finally(() => setLoading(false));
  }, [annee, section]);

  // Total section courant
  const totalReel = ues.reduce((s, u) => s + (parseInt(u.nb_etudiants) || 0), 0);

  // Grouper par niveau
  const niveaux = [...new Set(ues.map(u => u.ue_niv || 'Autres'))].sort();

  async function sauvegarder(uesList) {
    setSaving(true);
    try {
      await fetch('/api/ref/ue/effectifs-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ annee, effectifs: uesList.map(u => ({ ue_num: u.ue_num, nb_etudiants: u.nb_etudiants === '' ? null : parseInt(u.nb_etudiants) || 0 })) })
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  function setNbForUe(ue_num, val) {
    setUes(prev => prev.map(u => u.ue_num === ue_num ? { ...u, nb_etudiants: val } : u));
  }

  function appliquerTotal() {
    const total = parseInt(totalSection) || 0;
    if (!total || !ues.length) return;
    // Répartir proportionnellement aux périodes, ou uniformément si pas de périodes
    const totalPer = ues.reduce((s, u) => s + (u.per_etudiant || u.ue_per || 1), 0);
    const updated = ues.map(u => {
      const poids = (u.per_etudiant || u.ue_per || 1) / totalPer;
      return { ...u, nb_etudiants: String(Math.round(total * poids)) };
    });
    setUes(updated);
    sauvegarder(updated);
  }

  function appliquerMemeEtudiantsPartout() {
    const val = parseInt(totalSection) || 0;
    const updated = ues.map(u => ({ ...u, nb_etudiants: String(val) }));
    setUes(updated);
    sauvegarder(updated);
  }

  return (
    <div className="max-w-none space-y-4">
      {/* En-tête */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 text-base flex items-center gap-2 mb-1">
          <IconChartBar size={17} className="text-iip-turquoise" />
          Effectifs estimés par section
        </h2>
        <p className="text-xs text-gray-500">
          Saisissez les effectifs réels ou prévisionnels par UE pour le calcul du ratio étudiants/ETP dans les rapports.
          Ces données alimentent automatiquement le rapport ETP.
        </p>
      </div>

      {/* Sélecteurs */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-600">Année</span>
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm bg-white min-w-[130px]">
            {annees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-600">Section</span>
          <select value={section} onChange={e => setSection(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm bg-white min-w-[100px]">
            {sections.map(s => {
              const code = typeof s === 'string' ? s : (s.code ?? s.section ?? '');
              if (!code) return null;
              return <option key={code} value={code}>{code}</option>;
            })}
          </select>
        </label>

        {/* Mode de saisie */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-600">Mode de saisie</span>
          <div className="flex gap-1 h-9 items-center">
            <button onClick={() => setModeSaisie('ue')}
              className={`px-3 h-9 rounded-l border text-xs font-medium transition-colors ${modeSaisie==='ue' ? 'bg-iip-blue text-white border-iip-blue' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              Par UE
            </button>
            <button onClick={() => setModeSaisie('section')}
              className={`px-3 h-9 rounded-r border-t border-b border-r text-xs font-medium transition-colors ${modeSaisie==='section' ? 'bg-iip-blue text-white border-iip-blue' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              Par section
            </button>
          </div>
        </label>

        {/* Saisie rapide section */}
        {modeSaisie === 'section' && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-600">Nb étudiants total</span>
            <div className="flex gap-2 items-center">
              <input type="number" min="0" value={totalSection} onChange={e => setTotalSection(e.target.value)}
                placeholder="ex: 120"
                className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm w-24" />
              <button onClick={appliquerTotal}
                title="Répartir proportionnellement aux périodes de chaque UE"
                className="h-9 px-3 bg-iip-turquoise text-white text-xs font-semibold rounded hover:opacity-90">
                Répartir
              </button>
              <button onClick={appliquerMemeEtudiantsPartout}
                title="Mettre le même chiffre sur toutes les UE"
                className="h-9 px-3 bg-gray-200 text-gray-700 text-xs font-semibold rounded hover:bg-gray-300">
                Uniforme
              </button>
            </div>
            <span className="text-xs text-gray-400">Répartir = selon poids périodes · Uniforme = même nb partout</span>
          </div>
        )}

        <div className="flex-1" />
        {saved && <span className="text-xs text-green-600 flex items-center gap-1"><IconCheck size={13} /> Sauvegardé</span>}
      </div>

      {/* Tableau UEs */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">Chargement…</div>
      ) : ues.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-sm">Aucune UE trouvée pour cette section / année.</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Résumé total */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-800">{ues.length}</span> UEs ·
              Total estimé : <span className="font-semibold text-iip-blue">{totalReel > 0 ? totalReel : '—'}</span> étudiants
            </div>
            <button onClick={() => sauvegarder(ues)} disabled={saving}
              className="bg-iip-blue text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5">
              {saving ? 'Sauvegarde…' : <><IconCheck size={12} /> Sauvegarder tout</>}
            </button>
          </div>

          {/* Tableau par niveau */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-iip-blue text-white text-xs">
                <th className="px-4 py-2 text-left font-semibold">UE</th>
                <th className="px-4 py-2 text-left font-semibold">Intitulé</th>
                <th className="px-3 py-2 text-right font-semibold w-24">Nb étudiants</th>
              </tr>
            </thead>
            <tbody>
              {niveaux.map(niv => {
                const uesNiv = ues.filter(u => (u.ue_niv || 'Autres') === niv);
                const totalNiv = uesNiv.reduce((s, u) => s + (parseInt(u.nb_etudiants) || 0), 0);
                return (
                  <>
                    <tr key={`niv-${niv}`} className="bg-slate-100 border-t-2 border-slate-200">
                      <td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-slate-600 uppercase tracking-wide">
                        {niv}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-bold text-iip-blue">
                        {totalNiv > 0 ? `${totalNiv} étu.` : '—'}
                      </td>
                    </tr>
                    {uesNiv.map((u, i) => (
                      <tr key={u.ue_num} className={`border-b border-gray-100 ${i % 2 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50/30 transition-colors`}>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs whitespace-nowrap">UE {u.ue_num}</td>
                        <td className="px-4 py-2 text-gray-700 text-xs">{u.ue_nom || '—'}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input type="number" min="0" step="1"
                            value={u.nb_etudiants}
                            onChange={e => setNbForUe(u.ue_num, e.target.value)}
                            onBlur={() => sauvegarder(ues)}
                            placeholder="—"
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-iip-turquoise text-iip-blue font-semibold"
                          />
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-iip-blue text-white font-semibold">
                <td colSpan={2} className="px-4 py-2 text-sm">Total — {section}</td>
                <td className="px-3 py-2 text-right text-sm">{totalReel > 0 ? `${totalReel} étu.` : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Section PNCC ── */}
      <PnccSection annee={annee} />
    </div>
  );
}

/* ── Config Recrutement : mot d'accueil éditable ── */
/* ── Config Recrutement ── */
function ConfigRecrutement() {
  const tok = () => localStorage.getItem('token');

  const useConfigField = (cle) => {
    const [valeur, setValeur] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [saved, setSaved]     = useState(false);
    const [err, setErr]         = useState('');
    useEffect(() => {
      fetch(`/api/config/${cle}`, { headers: { Authorization: `Bearer ${tok()}` } })
        .then(r => r.json()).then(d => setValeur(d.valeur || '')).catch(() => setErr('Impossible de charger'))
        .finally(() => setLoading(false));
    }, []);
    const sauvegarder = async () => {
      setSaving(true); setErr('');
      try {
        const r = await fetch(`/api/config/${cle}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ valeur }),
        });
        if (!r.ok) throw new Error('Erreur serveur');
        setSaved(true); setTimeout(() => setSaved(false), 2000);
      } catch (e) { setErr(e.message); } finally { setSaving(false); }
    };
    return { valeur, setValeur, loading, saving, saved, err, sauvegarder };
  };

  const intro      = useConfigField('entretien_intro');
  const conclusion = useConfigField('entretien_conclusion');

  const Bloc = ({ label, desc, field }) => (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-iip-blue">{label}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
        </div>
        <button onClick={field.sauvegarder} disabled={field.saving || field.loading}
          className={`text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 ${
            field.saved ? 'bg-green-600 text-white' : 'bg-iip-blue text-white hover:opacity-90'
          } disabled:opacity-50`}>
          {field.saved ? '✓ Sauvegardé' : field.saving ? 'Sauvegarde…' : '✓ Enregistrer'}
        </button>
      </div>
      {field.err && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2 mb-3">{field.err}</div>}
      {field.loading ? <div className="text-sm text-gray-400 py-4">Chargement…</div> : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-iip-blue/5 border-b border-gray-200 text-xs text-gray-500">
            Les sauts de ligne sont conservés. Ce texte est lu au candidat lors de l'entretien.
          </div>
          <textarea value={field.valeur} onChange={e => field.setValeur(e.target.value)}
            rows={10}
            className="w-full text-sm px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-iip-turquoise font-mono" />
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 flex justify-between">
            <span>{field.valeur.length} caractères</span>
            <span>~{Math.ceil(field.valeur.split(' ').filter(Boolean).length / 130)} min à voix haute</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-none">
      <Bloc
        label="Introduction d'entretien"
        desc="Texte lu au candidat en début d'entretien — établissement, qui vous êtes, déroulement."
        field={intro}
      />
      <div className="border-t border-gray-100 mb-8" />
      <Bloc
        label="Mot de fin d'entretien"
        desc="Texte lu en fin d'entretien — suite de la procédure, délais, remerciements."
        field={conclusion}
      />
    </div>
  );
}

/**
 * LES COULEURS QUI VEULENT DIRE QUELQUE CHOSE.
 *
 * « HELB » se lisait en rose dans Attributions, en violet dans Professeurs, en
 * cyan dans les badges, en violet encore sur le rapport ETP imprimé. Quatre
 * réponses à une question qui n'en a qu'une — et un imprimé qui ne ressemblait
 * à aucun écran.
 *
 * Elles se règlent ici, une fois, et valent partout : à l'écran comme sur le
 * papier. Une couleur qui signifie quelque chose pour l'école n'a pas à être
 * décidée dans le code.
 */
/* ── THÈMES ET COULEURS (2.12.194) ──────────────────────────────────────────
 * Demandé par Charles le 25-26 septembre 2026 : « un menu pour changer à la
 * carte les couleurs de Lucie », « moins de nuances », « trop de bleu, j'avais
 * parlé de gris très clair », « les couleurs sont un peu tristes ».
 * Un THÈME pose tout d'un coup ; chaque couleur se retouche ensuite. Rien ne
 * s'écrit avant « Enregistrer », et l'aperçu montre avant.
 * Le SENS des couleurs ne se règle pas — vert dit réussi, partout : on en
 * choisit la nuance, pas la signification.
 */
const THEMES = [
  { cle: 'origine', nom: "Lucie d'origine", texte: 'Gris ardoise, états sobres.', gris: 'ardoise', valeurs: {} },
  { cle: 'clair', nom: 'Gris clair', texte: 'Gris neutre, sans bleu ; états sobres.', gris: 'neutre',
    valeurs: { fond_page: '#F4F5F7', fond_indispo: '#ECEEF1' } },
  { cle: 'vif', nom: 'Gris clair et vif', texte: 'Gris neutre ; états plus francs, plus gais.', gris: 'neutre',
    valeurs: { fond_page: '#F4F5F7', fond_indispo: '#ECEEF1', reussi: '#2F9A5B', faveur: '#7C3AED',
               disponible: '#3478D4', attente: '#D97706', refuse: '#C2412D' } },
];
const GROUPES_COULEURS = [
  ['etats', 'Les états', 'Ce que dit une tuile, une case, une pastille.'],
  ['blocs', 'Les repères', 'Les blocs d’études et l’épreuve intégrée : où l’on est, jamais un état.'],
  ['fonds', 'Les fonds', 'Le sol de la page et le gris de ce qui n’est pas encore atteignable.'],
  ['sens', 'Contrats et cours', 'Les deux employeurs et les deux natures de cours.'],
];

function ReglageCouleurs() {
  const [catalogue, setCatalogue] = useState({});
  const [valeurs, setValeurs] = useState({});
  const [gris, setGris] = useState('ardoise');
  const [etat, setEtat] = useState('');
  const peutRegler = ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role);

  useEffect(() => {
    fetch('/api/config/couleurs', { headers: authHeaders() })
      .then(r => r.json())
      .then(j => { setCatalogue(j.catalogue || {}); setValeurs(j.couleurs || {}); setGris(j.gris || 'ardoise'); })
      .catch(e => setEtat('Lecture impossible : ' + e.message));
  }, []);

  const v = cle => (valeurs[cle] || catalogue[cle]?.valeur || '#000000');
  function appliquerTheme(t) {
    const base = Object.fromEntries(Object.entries(catalogue).map(([k, d]) => [k, d.valeur]));
    setValeurs({ ...base, ...t.valeurs }); setGris(t.gris); setEtat('Thème appliqué à l’aperçu — enregistrez pour le garder.');
  }
  const themeActif = THEMES.find(t => t.gris === gris && Object.entries(catalogue)
    .every(([k, d]) => v(k).toUpperCase() === (t.valeurs[k] || d.valeur).toUpperCase()))?.cle;

  async function enregistrer() {
    setEtat('Enregistrement…');
    try {
      const rep = await fetch('/api/config/couleurs', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ couleurs: valeurs, gris }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'refusé');
      setValeurs(j.couleurs);
      // Reposées tout de suite : le changement se voit sans recharger.
      await chargerCouleurs();
      setEtat('Enregistré. Les écrans et les documents suivent.');
    } catch (e) { setEtat('Erreur : ' + e.message); }
  }

  // L'aperçu porte ses propres variables : il montre ce qui SERA, sans
  // toucher au reste de l'écran avant l'enregistrement.
  const styleApercu = Object.fromEntries(Object.keys(catalogue).map(k => [`--c-${k}`, v(k)]));
  const puces = [['r', 246], ['f', 248], ['i', 255], ['a', 253], ['o', 259], ['n', 263]];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-iip-blue">Thèmes et couleurs</h2>
        <p className="text-[13px] text-slate-500 max-w-3xl">
          Un thème pose tout d’un coup ; chaque couleur se retouche ensuite. Le sens ne change
          pas — le vert dit « réussi » partout — : on en choisit la nuance. Rien n’est modifié
          avant « Enregistrer », et l’aperçu montre le résultat avant.
          {!peutRegler && <b> Réservé à la direction : vous pouvez regarder, pas enregistrer.</b>}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {THEMES.map(t => (
          <button key={t.cle} type="button" onClick={() => appliquerTheme(t)}
            data-etat={themeActif === t.cle ? 'fort' : 'neutre'}
            className="bloc-etat text-left px-3 py-2.5 hover:brightness-[.98]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13px]">{t.nom}</span>
              {themeActif === t.cle && <span className="pastille-etat" data-etat="reussi">en cours</span>}
            </div>
            <div className="text-[12px] text-slate-500">{t.texte}</div>
            <div className="flex gap-1 mt-2">
              {['reussi', 'faveur', 'disponible', 'attente', 'refuse'].map(k => (
                <span key={k} className="w-5 h-3 rounded-sm"
                  style={{ background: t.valeurs[k] || catalogue[k]?.valeur }} />
              ))}
              <span className="w-5 h-3 rounded-sm border border-slate-300"
                style={{ background: t.valeurs.fond_page || catalogue.fond_page?.valeur }} />
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="carte px-3 py-2 flex items-center gap-3">
            <span className="flex-1 text-[13px] text-slate-800">
              Les gris de l’interface
              <span className="block text-[11px] text-slate-400">textes secondaires, filets, fonds de tableau — deux jeux prêts, ou votre teinte</span>
              <span className="flex gap-0.5 mt-1">
                {Object.values(echelleGris(/^#/.test(gris) ? gris : (gris === 'neutre' ? '#6E727A' : '#64748B')) || {})
                  .map((c, i) => <i key={i} className="w-4 h-2.5 rounded-[2px]" style={{ background: `rgb(${c})` }} />)}
              </span>
            </span>
            <div className="segments h-8">
              {[['ardoise', 'Ardoise'], ['neutre', 'Neutre']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setGris(k)}
                  className={`px-3 text-[12px] ${gris === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {l}
                </button>
              ))}
            </div>
            {/* UNE TEINTE LIBRE : elle fait le gris moyen, l'échelle s'en déduit. */}
            <input type="color" title="Choisir la teinte des gris"
              value={/^#/.test(gris) ? gris : (gris === 'neutre' ? '#6E727A' : '#64748B')}
              onChange={e => setGris(e.target.value)}
              className={`w-10 h-8 rounded-champ border bg-white p-0.5 ${/^#/.test(gris) ? 'border-iip-blue' : 'border-slate-300'}`} />
          </div>
          {GROUPES_COULEURS.map(([g, titre, sous]) => {
            const cles = Object.entries(catalogue).filter(([, d]) => (d.groupe || 'sens') === g);
            if (!cles.length) return null;
            return (
              <div key={g} className="carte overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-[13px] font-semibold text-iip-blue">{titre}</div>
                  <div className="text-[11px] text-slate-400">{sous}</div>
                </div>
                {cles.map(([cle, d]) => (
                  <div key={cle} className="px-3 py-1.5 flex items-center gap-3 border-t border-slate-100 first:border-t-0">
                    <span className="flex-1 text-[13px] text-slate-800">{d.libelle}</span>
                    <span className="text-[11px] tabular-nums text-slate-400 w-16 text-right">{v(cle).toUpperCase()}</span>
                    <input type="color" value={v(cle)}
                      onChange={e => setValeurs(x => ({ ...x, [cle]: e.target.value }))}
                      className="w-10 h-7 rounded-champ border border-slate-300 bg-white p-0.5" title={d.libelle} />
                    <button onClick={() => setValeurs(x => ({ ...x, [cle]: d.valeur }))}
                      className={`text-[11px] w-10 text-left ${v(cle).toUpperCase() !== d.valeur.toUpperCase()
                        ? 'text-slate-400 hover:text-iip-blue' : 'invisible'}`} title="Revenir à la couleur d’origine">
                      défaut
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* L'APERÇU — les vrais composants de Lucie, sous les couleurs choisies. */}
        <div data-gris={/^#/.test(gris) ? undefined : gris}
          style={{ ...styleApercu, ...(echelleGris(gris) || {}), background: v('fond_page') }}
          className="rounded-carte border border-slate-200 p-4 space-y-4 xl:sticky xl:top-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Aperçu</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[['reussi', '38', 'réussites'], ['faveur', '4', 'faveurs'], ['disponible', '66', 'inscrits'],
              ['surveiller', '12', 'ajournés'], ['corriger', '3', 'refus'], ['indisponible', '8', 'pas encore']]
              .map(([e, n, l]) => <TuileEtat key={e} etat={e} valeur={n} libelle={l} />)}
          </div>
          <div className="flex flex-wrap gap-2">
            <PastilleEtat etat="reussi">réussi</PastilleEtat>
            <PastilleEtat etat="faveur">faveur</PastilleEtat>
            <PastilleEtat etat="disponible">inscrit</PastilleEtat>
            <PastilleEtat etat="surveiller">ajourné</PastilleEtat>
            <PastilleEtat etat="corriger">refusé</PastilleEtat>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 mb-1">Frise du parcours</div>
            <div className="flex gap-1">
              {[['BA1', 'ba1', puces.slice(0, 2)], ['BA2', 'ba2', puces.slice(2, 4)], ['BA3', 'ba3', puces.slice(4)]].map(([b, k, l]) => (
                <span key={b} className="flex gap-[2px] pl-1 border-l-2" style={{ borderLeftColor: v(k) }}>
                  {l.map(([c, u]) => <span key={u} data-c={c} className="puce-ue">{u}</span>)}
                </span>
              ))}
              <span className="flex gap-[2px] pl-1 border-l-2" style={{ borderLeftColor: v('epreuve') }}>
                <span data-c="n" className="puce-ue ei">264</span>
              </span>
            </div>
          </div>
          <div className="carte overflow-hidden">
            <div className="tab-entete px-3 py-1.5">Un tableau</div>
            {['ABDELLAOUI Kenza', 'ABDO Rama'].map(n => (
              <div key={n} className="px-3 py-2 border-t border-slate-100 text-[13px] flex justify-between bg-white">
                <span className="text-slate-800">{n}</span><span className="text-slate-400">texte secondaire</span>
              </div>
            ))}
          </div>
          <Encadre etat="surveiller" titre="Un encadré">Trois recevabilités restent à contrôler.</Encadre>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={enregistrer} disabled={!peutRegler} className="bouton-fort controle px-3 disabled:opacity-50">Enregistrer</button>
        {etat && <span className="text-[12px] text-slate-500">{etat}</span>}
      </div>
    </div>
  );
}

/**
 * LE RÉFÉRENTIEL D'UNE ANNÉE — ce qu'on enseigne, et comment on le sanctionne.
 *
 * Quatre onglets décrivaient le même objet : le référentiel, ses prérequis, la
 * pondération de ses acquis, et les règles avec lesquelles le Conseil délibère
 * dessus. Les séparer obligeait à sortir d'un écran pour vérifier dans un autre
 * ce qu'on venait d'y régler — et surtout, rien ne disait qu'ils parlaient tous
 * de la MÊME ANNÉE.
 *
 * L'année se pose donc UNE FOIS et vaut pour les quatre faces. Depuis 2.12.177
 * les faces sont les feuilles mêmes de la famille « Référentiel » — une seule
 * rangée d'onglets —, et ce sélecteur se pose au bout de cette rangée.
 */
function AnneeDuReferentiel({ onglet }) {
  const [annees, setAnnees] = useState([]);
  const annee = getAnnee();

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => {});
  }, []);

  /* CHANGER D'ANNÉE ICI, C'EST CHANGER D'ANNÉE DE TRAVAIL. Ces écrans lisent
     tous l'année active : lui en donner une autre en douce ferait afficher
     2025 ici et 2026 partout ailleurs — l'erreur de contexte qu'on vient
     justement de cadenasser ailleurs. On la change donc pour de bon, et l'on
     revient sur le même onglet. */
  function changerAnnee(code) {
    if (!code || code === annee) return;
    setAnneeActive(code);
    window.location.href = `/configuration?onglet=${encodeURIComponent(onglet)}`;
  }

  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-500">
      Année de travail
      <select value={annee} onChange={e => changerAnnee(e.target.value)}
        className="bg-white border border-slate-300 rounded-champ px-2 h-8 text-[13px] min-w-[8rem]">
        {(annees.length ? annees : [annee]).map(a => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </label>
  );
}

// ── CLÔTURER UNE ANNÉE REPRISE D'ARCHIVES ────────────────────────────────────
//
// Les années importées d'Excel portent des décisions sans motivation : les
// dossiers sont incomplets là où le règlement en exige une, acquis par acquis.
// On peut les compléter — à condition que ce qui s'écrit ne se fasse jamais
// passer pour ce que le Conseil a dit en séance.
//
// L'écran ne cache donc rien de ce qu'il fait : il montre d'abord CE QUI SERA
// ÉCRIT, dossier par dossier, et ne laisse écrire qu'après avoir retapé
// l'année. Un bouton « Appliquer » seul se clique sans lire.
function ClotureReprise() {
  const [annees, setAnnees]   = useState([]);
  const [annee, setAnnee]     = useState('');
  const [plan, setPlan]       = useState(null);
  const [enonces, setEnonces] = useState({ motif: '', mention: '' });
  const [motif, setMotif]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [occupe, setOccupe]   = useState(false);
  const [fait, setFait]       = useState(null);
  const [err, setErr]         = useState('');

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => {});
    fetch('/api/acquis/reprise/enonces', { headers: authHeaders() }).then(r => r.json())
      .then(j => { setEnonces(j); setMotif(j.motif || ''); }).catch(() => {});
  }, []);

  const simuler = async () => {
    setErr(''); setFait(null); setPlan(null); setOccupe(true);
    try {
      const r = await fetch(`/api/acquis/reprise/${annee}/simulation?motif=`
        + encodeURIComponent(motif), { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'échec');
      setPlan(j);
    } catch (e) { setErr(e.message); } finally { setOccupe(false); }
  };

  const appliquer = async () => {
    setErr(''); setOccupe(true);
    try {
      const r = await fetch(`/api/acquis/reprise/${annee}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: confirm, motif }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || j.error || 'échec');
      setFait(j.ecrit); setPlan(null); setConfirm('');
    } catch (e) { setErr(e.message); } finally { setOccupe(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[17px] font-semibold text-iip-blue">
        Clôturer une année reprise d'archives
      </h2>

      <div className="carte p-4 space-y-2">
        <div className="flex items-start gap-2">
          <IconAlertTriangle size={18} className="text-[color:var(--c-attente,#B45309)] flex-none mt-0.5" />
          <p className="text-[13px] text-slate-600">
            Cette opération écrit une motivation sur chaque acquis en défaut des
            décisions défavorables de l'année, et marque les séances comme
            <b> reconstituées d'archives</b>. Ce qu'elle écrit est enregistré sous la
            provenance <code>reprise</code> : il ne se confondra jamais avec ce que le
            Conseil a rédigé, et les pièces remises aux étudiants le mentionnent.
            Elle ne modifie <b>aucune décision</b>, n'octroie <b>aucune faveur</b> et
            n'écrase <b>aucune motivation existante</b>.
          </p>
        </div>
      </div>

      <div className="carte p-4 space-y-3">
        <label className="block text-[11px] text-slate-500">
          Année à clôturer
          <select value={annee} onChange={e => { setAnnee(e.target.value); setPlan(null); setFait(null); }}
            className="block w-64 mt-1 bg-white border border-slate-300 rounded-champ px-2 controle text-[13px]">
            <option value="">—</option>
            {annees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        <label className="block text-[11px] text-slate-500">
          Énoncé écrit là où aucune motivation n'existe
          <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2}
            className="block w-full mt-1 bg-white border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]" />
          <span className="text-[10px] text-slate-400">
            Volontairement uniforme : une phrase individualisée laisserait croire à un
            examen individuel qui n'a pas eu lieu sous cette forme.
          </span>
        </label>

        <button onClick={simuler} disabled={!annee || occupe} className="bouton controle px-3">
          {occupe ? 'Calcul…' : 'Voir ce qui serait écrit'}
        </button>
      </div>

      {err && <div className="carte p-3 text-[13px] text-[color:var(--c-refuse,#9D4A38)]">{err}</div>}

      {fait && (
        <div className="carte p-4 text-[13px]">
          <b>{fait.motivations}</b> motivation(s) écrite(s), <b>{fait.seances}</b> séance(s)
          clôturée(s) et marquée(s) comme reconstituée(s).
        </div>
      )}

      {plan && (
        <div className="carte p-4 space-y-3">
          <div className="text-[13px]">
            <b>{plan.nb_motivations}</b> motivation(s) à écrire, sur <b>{plan.nb_dossiers}</b> dossier(s)
            d'unité et <b>{plan.nb_etudiants}</b> étudiant(s).
            {' '}<b>{plan.seances_a_clore.length}</b> séance(s) à clôturer.
            {plan.deja_motivees > 0 && <> {plan.deja_motivees} motivation(s) déjà en base sont laissées telles quelles.</>}
          </div>

          {!!plan.unites_sans_referentiel?.length && (
            <div className="text-[12px] text-[color:var(--c-attente,#B45309)]">
              {plan.unites_sans_referentiel.length} dossier(s) portent une décision défavorable
              sur une unité sans acquis au référentiel : rien ne peut y être écrit, et le dossier
              restera incomplet.
            </div>
          )}

          {/* IL Y A DEUX RAISONS D'AGIR, PAS UNE. Le bouton ne s'affichait que
              s'il y avait des motivations à écrire ; une année dont il ne
              reste qu'à clôturer les séances n'offrait donc aucun geste — et
              c'est précisément le cas d'une année entièrement réussie ou déjà
              motivée. */}
          {(plan.nb_motivations > 0 || plan.seances_a_clore.length > 0) && (
            <>
              {plan.nb_motivations === 0 && (
                <div className="text-[12px] text-slate-500">
                  Aucune motivation à écrire — il ne reste qu'à clôturer les séances.
                </div>
              )}
              <div className={`max-h-72 overflow-auto${plan.nb_motivations ? '' : ' hidden'}`}>
                <table className="w-full text-[12px]">
                  <thead className="tab-entete sticky top-0">
                    <tr><th className="text-left px-2 py-1">Étudiant</th>
                        <th className="text-left px-2 py-1">UE</th>
                        <th className="text-left px-2 py-1">Décision</th>
                        <th className="text-left px-2 py-1">Acquis motivés</th></tr>
                  </thead>
                  <tbody>
                    {plan.motivations.map((m, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1">{m.nom} {m.prenom}</td>
                        <td className="px-2 py-1">{m.ue_num}</td>
                        <td className="px-2 py-1">{m.resultat}</td>
                        <td className="px-2 py-1">{m.acquis.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="block text-[11px] text-slate-500">
                Pour appliquer, retapez l'année : <b>{plan.annee}</b>
                <input value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="block w-48 mt-1 bg-white border border-slate-300 rounded-champ px-2 controle text-[13px]" />
              </label>

              <button onClick={appliquer} disabled={confirm !== plan.annee || occupe}
                className="bouton-fort controle px-3">
                Écrire et clôturer {plan.annee}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

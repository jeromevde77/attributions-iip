import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

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

export default function Configuration() {
  const [tab, setTab] = useState('users');
  const [historiqueActif, setHistoriqueActif] = useState(false);
  const [changelog, setChangelog] = useState({ byDay: {}, commits: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [driveStatus, setDriveStatus] = useState('');
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
        <button onClick={() => setTab('users')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'users' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Utilisateurs
        </button>
        <button onClick={() => setTab('systeme')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === 'systeme' ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Historique &amp; Sauvegarde
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

          <div className="border-t border-gray-100" />

          {/* Google Drive */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-gray-800">Sauvegarder sur Google Drive</div>
              <div className="text-xs text-gray-500">
                Dépose le fichier dans <code className="bg-gray-100 px-1 rounded">Attributions IIP / Backups</code> sur votre Drive
              </div>
              {driveStatus && <div className="text-xs mt-1 text-gray-600">{driveStatus}</div>}
            </div>
            <button onClick={backupToDrive}
              className="bg-iip-mauve hover:opacity-90 text-white text-sm px-4 py-2 rounded font-medium whitespace-nowrap">
              ☁️ Drive
            </button>
          </div>
        </div>
      </section>

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

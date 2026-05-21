import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Users from './Users.jsx';

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

function Markdown({ text }) {
  const lines = (text || '').split('\n');
  const out = [];
  let list = [];
  const flushList = (key) => {
    if (list.length) { out.push(<ul key={'ul' + key} className="list-disc pl-5 space-y-1 my-2">{list}</ul>); list = []; }
  };
  const inline = (s) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-gray-100 px-1 rounded text-xs">{p.slice(1, -1)}</code>;
      return p;
    });
  };
  lines.forEach((line, i) => {
    if (line.startsWith('### ')) { flushList(i); out.push(<h3 key={i} className="font-semibold text-gray-800 mt-4 mb-1 text-sm">{inline(line.slice(4))}</h3>); }
    else if (line.startsWith('## ')) { flushList(i); out.push(<h2 key={i} className="font-title text-iip-gold text-lg mt-6 mb-2 pb-1 border-b border-gray-100">{inline(line.slice(3))}</h2>); }
    else if (line.startsWith('# ')) { flushList(i); }
    else if (line.startsWith('- ')) { list.push(<li key={i} className="text-sm text-gray-600">{inline(line.slice(2))}</li>); }
    else if (line.trim() === '') { flushList(i); }
    else { flushList(i); out.push(<p key={i} className="text-sm text-gray-600 my-1">{inline(line)}</p>); }
  });
  flushList('end');
  return <div>{out}</div>;
}

export default function Configuration() {
  const [tab, setTab] = useState('users');
  const [historiqueActif, setHistoriqueActif] = useState(false);
  const [changelog, setChangelog] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [driveStatus, setDriveStatus] = useState('');

  useEffect(() => {
    api.historiqueConfig().then(r => {
      setHistoriqueActif(r.actif);
    }).catch(() => {}).finally(() => setLoading(false));
    api.changelog().then(r => setChangelog(r.content)).catch(() => {});
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
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-title text-iip-gold">Configuration</h1>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
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

      {/* ── Onglet Utilisateurs ── */}
      {tab === 'users' && <Users embedded />}

      {/* ── Onglet Nouveautés ── */}
      {tab === 'changelog' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <Markdown text={changelog} />
        </div>
      )}

      {/* ── Onglet Système ── */}
      {tab === 'systeme' && (loading ? <div className="p-8 text-center text-gray-400">Chargement…</div> : <>

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
      </>)}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { IconMail, IconCheck, IconAlertTriangle, IconPlugConnected, IconSend, IconRefresh, IconLoader2 } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { chargerEtatEnvoi } from '../lib/envoiMail.js';

/**
 * Configuration → Courriels.
 *
 * Trois choses, dans l'ordre où on s'en sert : l'interrupteur, le serveur
 * qui expédie, et le journal de ce qui est parti. Tout se règle ici — rien
 * dans le compose : le serveur change de mains sans redéploiement.
 */
export default function ConfigCourriels() {
  const [etat, setEtat] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [pass, setPass] = useState('');
  const [enregistre, setEnregistre] = useState(false);
  const [verif, setVerif] = useState(null);      // { ok, erreur }
  const [test, setTest] = useState(null);
  const [testTo, setTestTo] = useState('');
  const [occupe, setOccupe] = useState('');
  const [journal, setJournal] = useState([]);

  const charger = async () => {
    setEtat(await chargerEtatEnvoi(true));
    const r = await fetch('/api/envois/smtp', { headers: authHeaders() });
    if (r.ok) setCfg(await r.json());
  };
  const chargerJournal = async () => {
    const r = await fetch('/api/envois/journal?limite=100', { headers: authHeaders() });
    if (r.ok) setJournal(await r.json());
  };
  useEffect(() => { charger(); chargerJournal(); }, []);

  async function basculer() {
    setOccupe('actif');
    try {
      await fetch('/api/envois/actif', { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ actif: !etat?.actif }) });
      await charger();
    } finally { setOccupe(''); }
  }

  const corps = () => ({ ...cfg, pass: pass || undefined });

  async function enregistrer() {
    setOccupe('save'); setEnregistre(false);
    try {
      const r = await fetch('/api/envois/smtp', { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(corps()) });
      if (r.ok) { setCfg(await r.json()); setPass(''); setEnregistre(true); setTimeout(() => setEnregistre(false), 2500); }
      await charger();
    } finally { setOccupe(''); }
  }

  async function verifier() {
    setOccupe('verif'); setVerif(null);
    try {
      const r = await fetch('/api/envois/smtp/verifier', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify(corps()) });
      setVerif(await r.json());
    } finally { setOccupe(''); }
  }

  async function essai() {
    setOccupe('test'); setTest(null);
    try {
      const r = await fetch('/api/envois/smtp/test', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ to: testTo }) });
      const j = await r.json();
      setTest(r.ok ? j : { ok: false, erreur: j.error });
      chargerJournal();
    } finally { setOccupe(''); }
  }

  const maj = patch => setCfg(c => ({ ...c, ...patch }));
  const champ = 'mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm';

  if (!cfg || !etat) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="max-w-none space-y-6">

      {/* ── Interrupteur ── */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-iip-blue/5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-iip-blue flex items-center gap-2"><IconMail size={16} /> Envoi de documents par courriel</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Attestations, fiches d'attributions, décisions… envoyées à l'intéressé en PDF joint, depuis les aperçus et le centre d'impression.
            </p>
          </div>
          <button onClick={basculer} disabled={occupe === 'actif'}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${etat.actif ? 'bg-iip-turquoise' : 'bg-slate-300'}`}
            title={etat.actif ? 'Désactiver' : 'Activer'}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${etat.actif ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="px-4 py-3 text-[13px]">
          {etat.actif
            ? <span className="text-emerald-700 flex items-center gap-1.5"><IconCheck size={14} /> Fonction active — les boutons « Envoyer » sont visibles.</span>
            : <span className="text-slate-500">Fonction désactivée — aucun bouton « Envoyer » n'apparaît et le serveur refuse tout envoi.</span>}
          {etat.actif && !etat.pdf && (
            <p className="text-red-700 flex items-center gap-1.5 mt-1"><IconAlertTriangle size={14} /> Ce serveur ne produit pas de PDF ; l'envoi est impossible ({etat.pdf_raison || 'raison inconnue'}).</p>
          )}
          {etat.actif && !etat.smtp && (
            <p className="text-amber-700 flex items-center gap-1.5 mt-1"><IconAlertTriangle size={14} /> Aucun serveur SMTP : les envois sont simulés et seulement consignés.</p>
          )}
        </div>
      </section>

      {/* ── Serveur SMTP ── */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-iip-blue/5 border-b border-gray-200">
          <h2 className="font-semibold text-iip-blue">Serveur d'envoi (SMTP)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Microsoft 365 : smtp.office365.com, port 587, STARTTLS, avec un compte autorisé au SMTP AUTH.</p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block md:col-span-2">
            <span className="text-[12px] font-semibold text-slate-600">Serveur</span>
            <input value={cfg.host} onChange={e => maj({ host: e.target.value })} className={champ} placeholder="smtp.office365.com" />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-600">Port</span>
            <input type="number" value={cfg.port} onChange={e => maj({ port: e.target.value })} className={champ} />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-600">Sécurité</span>
            <select value={cfg.securite} onChange={e => maj({ securite: e.target.value })} className={champ}>
              <option value="starttls">STARTTLS (port 587)</option>
              <option value="ssl">SSL / TLS implicite (port 465)</option>
              <option value="aucun">Aucune (réseau interne uniquement)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-600">Utilisateur</span>
            <input value={cfg.user} onChange={e => maj({ user: e.target.value })} className={champ} placeholder="direction@institut-prigogine.be" autoComplete="off" />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-600">
              Mot de passe {cfg.pass_defini && <span className="font-normal text-slate-400">— défini, laisser vide pour le conserver</span>}
            </span>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} className={champ}
              placeholder={cfg.pass_defini ? '••••••••' : 'mot de passe ou mot de passe d\'application'} autoComplete="new-password" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-[12px] font-semibold text-slate-600">Expéditeur</span>
            <input value={cfg.from} onChange={e => maj({ from: e.target.value })} className={champ} placeholder="Institut Ilya Prigogine <direction@institut-prigogine.be>" />
            <span className="text-[11px] text-slate-400">Avec Microsoft 365, l'adresse doit être celle du compte ou une adresse pour laquelle il a le droit d'envoyer.</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-slate-600 md:col-span-2">
            <input type="checkbox" checked={!!cfg.tolerer_certificat} onChange={e => maj({ tolerer_certificat: e.target.checked })} />
            Tolérer un certificat non vérifiable (relais interne auto-signé uniquement)
          </label>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-slate-50 flex flex-wrap items-center gap-2">
          <button onClick={enregistrer} disabled={!!occupe}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg disabled:opacity-40">
            {occupe === 'save' ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />} Enregistrer
          </button>
          <button onClick={verifier} disabled={!!occupe || !cfg.host}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm border border-iip-blue text-iip-blue font-semibold rounded-lg disabled:opacity-40">
            {occupe === 'verif' ? <IconLoader2 size={14} className="animate-spin" /> : <IconPlugConnected size={14} />} Vérifier la connexion
          </button>
          {enregistre && <span className="text-[12px] text-emerald-700">Enregistré.</span>}
          {verif && (verif.ok
            ? <span className="text-[12px] text-emerald-700 flex items-center gap-1"><IconCheck size={13} /> Connexion et authentification réussies.</span>
            : <span className="text-[12px] text-red-700 flex items-center gap-1"><IconAlertTriangle size={13} /> {verif.erreur}</span>)}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="adresse pour le courriel d'essai"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-72" />
          <button onClick={essai} disabled={!!occupe || !testTo || !cfg.pass_defini && !pass}
            title="Envoie avec la configuration ENREGISTRÉE"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm border border-iip-turquoise text-iip-turquoise font-semibold rounded-lg disabled:opacity-40">
            {occupe === 'test' ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />} Envoyer un essai
          </button>
          {test && (test.ok
            ? <span className="text-[12px] text-emerald-700">{test.simule ? 'Simulé (aucun serveur enregistré).' : 'Courriel d\'essai parti.'}</span>
            : <span className="text-[12px] text-red-700">{test.erreur}</span>)}
        </div>
      </section>

      {/* ── Journal ── */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-iip-blue/5 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-iip-blue">Journal des envois</h2>
            <p className="text-xs text-gray-500 mt-0.5">Les 100 derniers. Qui a reçu quoi, quand, et si c'est parti.</p>
          </div>
          <button onClick={chargerJournal} className="text-slate-400 hover:text-iip-blue p-1.5 rounded-lg" title="Rafraîchir"><IconRefresh size={16} /></button>
        </div>
        {!journal.length ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">Aucun envoi consigné.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5">Date</th>
                <th className="text-left px-3 py-1.5">Destinataire</th>
                <th className="text-left px-3 py-1.5">Objet</th>
                <th className="text-left px-3 py-1.5">Pièce</th>
                <th className="text-left px-3 py-1.5">Par</th>
                <th className="text-left px-3 py-1.5">Statut</th>
              </tr>
            </thead>
            <tbody>
              {journal.map(l => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{l.envoye_le}</td>
                  <td className="px-3 py-1.5"><div className="font-medium">{l.destinataire_nom}</div><div className="text-[11px] text-slate-400">{l.email}</div></td>
                  <td className="px-3 py-1.5">{l.sujet}</td>
                  <td className="px-3 py-1.5 text-slate-500">{l.nom_fichier || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-500">{l.envoye_par}</td>
                  <td className="px-3 py-1.5">
                    {l.statut === 'envoye' && <span className="text-emerald-700">envoyé</span>}
                    {l.statut === 'simule' && <span className="text-amber-700">simulé</span>}
                    {l.statut === 'echec' && <span className="text-red-700" title={l.erreur}>échec{l.erreur ? ` — ${l.erreur}` : ''}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

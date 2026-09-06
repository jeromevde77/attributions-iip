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
  const [secret, setSecret] = useState('');
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

  const corps = () => ({ ...cfg, pass: pass || undefined,
                         graph: { ...cfg.graph, client_secret: secret || undefined } });
  const majG = patch => setCfg(c => ({ ...c, graph: { ...c.graph, ...patch } }));
  const graphOk = cfg?.mode === 'graph' && cfg.graph?.tenant && cfg.graph?.client_id && cfg.graph?.expediteur && (cfg.graph?.secret_defini || secret);

  async function enregistrer() {
    setOccupe('save'); setEnregistre(false);
    try {
      const r = await fetch('/api/envois/smtp', { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(corps()) });
      if (r.ok) { setCfg(await r.json()); setPass(''); setSecret(''); setEnregistre(true); setTimeout(() => setEnregistre(false), 2500); }
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
          {etat.redirection && (
            <p className="text-amber-700 flex items-center gap-1.5 mt-1"><IconAlertTriangle size={14} /> Redirection de test : tout part vers {etat.redirection}.</p>
          )}
          {etat.actif && !etat.smtp && (
            <p className="text-amber-700 flex items-center gap-1.5 mt-1"><IconAlertTriangle size={14} /> Aucun serveur SMTP : les envois sont simulés et seulement consignés.</p>
          )}
        </div>
      </section>

      {/* ── Expédition ── */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-iip-blue/5 border-b border-gray-200">
          <h2 className="font-semibold text-iip-blue">Expéditeur</h2>
          <p className="text-xs text-gray-500 mt-0.5">Par où les courriels partent.</p>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {[['graph', 'Microsoft 365 (API Graph)', 'Recommandé : application Entra, sans mot de passe de boîte.'],
            ['smtp', 'Serveur SMTP', 'Tout autre serveur. Pour Microsoft 365, bloqué par les security defaults.']].map(([v, l, d]) => (
            <button key={v} onClick={() => maj({ mode: v })}
              className={`text-left px-4 py-3 rounded-lg border-2 w-full md:w-[calc(50%-4px)] ${cfg.mode === v ? 'border-iip-turquoise bg-iip-turquoise/5' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="font-semibold text-sm text-slate-800">{l}</div>
              <div className="text-[12px] text-slate-500 mt-0.5">{d}</div>
            </button>
          ))}
        </div>

        {cfg.mode === 'graph' ? (
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
              <b>Dans le centre d'administration Entra</b> (entra.microsoft.com → Applications → Inscriptions d'applications) :
              <ol className="list-decimal ml-5 mt-1 space-y-0.5">
                <li>Nouvelle inscription, nom « Lucie », comptes de cet annuaire uniquement. Copier l'<i>ID d'application (client)</i> et l'<i>ID de l'annuaire (tenant)</i>.</li>
                <li>Certificats &amp; secrets → nouveau secret client. Copier la <i>valeur</i> tout de suite, elle ne se réaffiche pas.</li>
                <li>Autorisations d'API → Microsoft Graph → <b>autorisations d'application</b> → <code>Mail.Send</code> → « Accorder le consentement d'administrateur ».</li>
                <li>Conseillé : limiter l'application à la seule boîte expéditrice avec une <i>Application Access Policy</i> (Exchange PowerShell : <code>New-ApplicationAccessPolicy</code>), sinon elle peut envoyer au nom de n'importe quelle boîte du tenant.</li>
              </ol>
            </div>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-600">ID de l'annuaire (tenant)</span>
              <input value={cfg.graph.tenant} onChange={e => majG({ tenant: e.target.value })} className={champ} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx ou institut-prigogine.be" autoComplete="off" />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-600">ID d'application (client)</span>
              <input value={cfg.graph.client_id} onChange={e => majG({ client_id: e.target.value })} className={champ} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-600">
                Secret client {cfg.graph.secret_defini && <span className="font-normal text-slate-400">— défini, laisser vide pour le conserver</span>}
              </span>
              <input type="password" value={secret} onChange={e => setSecret(e.target.value)} className={champ}
                placeholder={cfg.graph.secret_defini ? '••••••••' : 'valeur du secret'} autoComplete="new-password" />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-slate-600">Boîte expéditrice</span>
              <input value={cfg.graph.expediteur} onChange={e => majG({ expediteur: e.target.value })} className={champ} placeholder="direction@institut-prigogine.be" autoComplete="off" />
              <span className="text-[11px] text-slate-400">Une boîte du tenant (utilisateur ou boîte partagée). Les envois apparaissent dans ses éléments envoyés.</span>
            </label>
          </div>
        ) : (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block md:col-span-2">
            <span className="text-[12px] font-semibold text-slate-600">Serveur</span>
            <input value={cfg.host} onChange={e => maj({ host: e.target.value })} className={champ} placeholder="smtp.exemple.be" />
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
            <input value={cfg.user} onChange={e => maj({ user: e.target.value })} className={champ} autoComplete="off" />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-slate-600">
              Mot de passe {cfg.pass_defini && <span className="font-normal text-slate-400">— défini, laisser vide pour le conserver</span>}
            </span>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} className={champ}
              placeholder={cfg.pass_defini ? '••••••••' : 'mot de passe'} autoComplete="new-password" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-[12px] font-semibold text-slate-600">Expéditeur</span>
            <input value={cfg.from} onChange={e => maj({ from: e.target.value })} className={champ} placeholder="Institut Ilya Prigogine <direction@institut-prigogine.be>" />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-slate-600 md:col-span-2">
            <input type="checkbox" checked={!!cfg.tolerer_certificat} onChange={e => maj({ tolerer_certificat: e.target.checked })} />
            Tolérer un certificat non vérifiable (relais interne auto-signé uniquement)
          </label>
        </div>
        )}
        <div className="px-4 py-3 border-t border-gray-100 bg-slate-50 flex flex-wrap items-center gap-2">
          <button onClick={enregistrer} disabled={!!occupe}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg disabled:opacity-40">
            {occupe === 'save' ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />} Enregistrer
          </button>
          <button onClick={verifier} disabled={!!occupe || (cfg.mode === 'graph' ? !graphOk : !cfg.host)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm border border-iip-blue text-iip-blue font-semibold rounded-lg disabled:opacity-40">
            {occupe === 'verif' ? <IconLoader2 size={14} className="animate-spin" /> : <IconPlugConnected size={14} />} Vérifier la connexion
          </button>
          {enregistre && <span className="text-[12px] text-emerald-700">Enregistré.</span>}
          {verif && (verif.ok
            ? <span className="text-[12px] text-emerald-700 flex items-center gap-1"><IconCheck size={13} /> {verif.remarque || 'Connexion et authentification réussies.'}</span>
            : <span className="text-[12px] text-red-700 flex items-center gap-1"><IconAlertTriangle size={13} /> {verif.erreur}</span>)}
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="adresse pour le courriel d'essai"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-72" />
          <button onClick={essai} disabled={!!occupe || !testTo || !etat.smtp}
            title="Envoie avec la configuration ENREGISTRÉE"
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm border border-iip-turquoise text-iip-turquoise font-semibold rounded-lg disabled:opacity-40">
            {occupe === 'test' ? <IconLoader2 size={14} className="animate-spin" /> : <IconSend size={14} />} Envoyer un essai
          </button>
          {!etat.smtp && <span className="text-[12px] text-amber-700">Enregistrez d'abord une configuration complète (le bouton reste gris tant qu'aucun expéditeur n'est enregistré).</span>}
          {test && (test.ok
            ? <span className="text-[12px] text-emerald-700">{test.simule ? 'Simulé (aucun serveur enregistré).' : 'Courriel d\'essai parti.'}</span>
            : <span className="text-[12px] text-red-700">{test.erreur}</span>)}
        </div>
      </section>

      {/* ── Garde-fou de test ── */}
      <section className="bg-white rounded-lg border border-amber-200 overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
          <h2 className="font-semibold text-amber-800">Redirection de test</h2>
          <p className="text-xs text-amber-700 mt-0.5">
            Si une adresse est renseignée, <b>tous</b> les courriels partent vers elle, quel que soit le destinataire — l'objet indique le vrai destinataire.
            Ce réglage vit dans la base de ce serveur : posé sur dev, il n'existe pas en prod. À vider pour envoyer réellement.
          </p>
        </div>
        <div className="p-4 flex flex-wrap items-center gap-2">
          <input value={cfg.redirection || ''} onChange={e => maj({ redirection: e.target.value })}
            placeholder="vide = envoi réel aux destinataires"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-96" />
          <button onClick={enregistrer} disabled={!!occupe}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg disabled:opacity-40">
            <IconCheck size={14} /> Enregistrer
          </button>
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
                    {l.statut === 'envoye' && <span className="text-emerald-700">envoyé{l.erreur?.startsWith('redirigé') ? <span className="text-amber-700"> · {l.erreur}</span> : ''}</span>}
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

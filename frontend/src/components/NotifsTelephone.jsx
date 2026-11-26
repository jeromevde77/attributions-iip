/* (CS) « NOTIFICATIONS SUR CE TÉLÉPHONE » (3.5.767, Charles : « une app Lucie pour avoir les notifs sur iPhone » ; tranché : Lucie
   installée, avec notifications, pour tous). Un seul composant, pour Lucie et pour les deux espaces : `base` est la porte du
   serveur (Lucie : /api/push), `entetes` ses en-têtes. Sur iPhone, les notifications n'existent que pour Lucie ouverte DEPUIS
   SON ICÔNE (iOS 16.4 et plus) : l'écran le dit, avec le geste pour l'ajouter. */
import { useEffect, useState } from 'react';
import { IconBell, IconBellOff } from '@tabler/icons-react';

const deB64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const estIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installee = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function NotifsTelephone({ base = '/api/push', entetes = () => ({}), titre = 'Notifications sur ce téléphone' }) {
  const [etat, setEtat] = useState('lecture');   // lecture | indispo | ios-ajouter | refuse | inactif | actif
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const h = () => ({ 'Content-Type': 'application/json', ...entetes() });

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setEtat(estIOS() && !installee() ? 'ios-ajouter' : 'indispo'); return;
      }
      if (Notification.permission === 'denied') { setEtat('refuse'); return; }
      const reg = await navigator.serviceWorker.getRegistration('/');
      const ab = reg ? await reg.pushManager.getSubscription() : null;
      setEtat(ab ? 'actif' : 'inactif');
    })().catch(() => setEtat('indispo'));
  }, []);

  const activer = async () => {
    setOccupe(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setEtat(perm === 'denied' ? 'refuse' : 'inactif'); return; }
      const reg = await navigator.serviceWorker.register('/sw-notifs.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { cle } = await fetch(`${base}/cle`, { headers: h() }).then(r => r.json());
      const ab = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(cle) });
      const r = await fetch(`${base}/abonner`, { method: 'POST', headers: h(),
        body: JSON.stringify({ abonnement: ab.toJSON(), appareil: navigator.userAgent }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
      setEtat('actif'); setMsg('Activées. Un essai vient de partir.');
      fetch(`${base}/essai`, { method: 'POST', headers: h() }).catch(() => {});
    } catch (e) { setMsg(e.message || 'Activation impossible.'); } finally { setOccupe(false); }
  };
  const couper = async () => {
    setOccupe(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const ab = reg ? await reg.pushManager.getSubscription() : null;
      if (ab) {
        await fetch(`${base}/desabonner`, { method: 'POST', headers: h(), body: JSON.stringify({ endpoint: ab.endpoint }) }).catch(() => {});
        await ab.unsubscribe();
      }
      setEtat('inactif'); setMsg('Coupées sur ce téléphone.');
    } catch (e) { setMsg(e.message); } finally { setOccupe(false); }
  };
  const essai = async () => {
    setMsg(null);
    const r = await fetch(`${base}/essai`, { method: 'POST', headers: h() }).then(x => x.json()).catch(() => ({}));
    setMsg(r.telephones ? `Essai envoyé à ${r.telephones} appareil${r.telephones > 1 ? 's' : ''}.` : 'Aucun appareil n’a reçu l’essai.');
  };

  return (
    <div className="bloc-etat px-3 py-2.5 space-y-2" data-etat={etat === 'actif' ? 'reussi' : 'neutre'}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {etat === 'actif' ? <IconBell size={16} /> : <IconBellOff size={16} />}{titre}
      </div>
      {etat === 'lecture' && <p className="text-second text-slate-500">…</p>}
      {etat === 'ios-ajouter' && <p className="text-second text-slate-600">
        Sur iPhone, ajoutez d’abord Lucie à l’écran d’accueil : dans Safari, bouton <b>Partager</b> → <b>Sur l’écran d’accueil</b>.
        Ouvrez ensuite Lucie par son icône, et revenez ici.</p>}
      {etat === 'indispo' && <p className="text-second text-slate-600">Ce navigateur ne reçoit pas de notifications. Sur iPhone, iOS 16.4 au moins, et Lucie ouverte depuis son icône.</p>}
      {etat === 'refuse' && <p className="text-second text-slate-600">Les notifications ont été refusées pour Lucie. Rouvrez-les dans les réglages du téléphone (Notifications → Lucie), puis revenez ici.</p>}
      {etat === 'inactif' && <>
        <p className="text-second text-slate-600">Recevez sur ce téléphone ce que Lucie vous annonce : messages, tâches, rappels, demandes à traiter.</p>
        <button type="button" className="bouton bouton-fort" disabled={occupe} onClick={activer}>Activer les notifications</button>
      </>}
      {etat === 'actif' && <>
        <p className="text-second text-slate-600">Activées sur ce téléphone.</p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="bouton" onClick={essai}>Envoyer un essai</button>
          <button type="button" className="bouton" disabled={occupe} onClick={couper}>Couper sur ce téléphone</button>
        </div>
      </>}
      {msg && <p className="text-second text-slate-600">{msg}</p>}
    </div>
  );
}

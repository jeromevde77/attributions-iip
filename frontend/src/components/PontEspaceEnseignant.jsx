/**
 * LE PONT VERS L'ESPACE ENSEIGNANT (3.5.078, Charles, 2 novembre 2026 : « pour le moment ils se connectent à Lucie
 * directement ; si Lucie détecte que c'est un prof, qu'elle le redirige vers son espace et explique »).
 *
 * Un enseignant (rôle professeur) dont l'espace est ouvert (Mise en service → « L'espace enseignant », le portail
 * installé, son compte relié à une fiche) voit, à son arrivée dans Lucie, une fenêtre qui explique où vivre désormais
 * et l'y mène. Il peut rester dans Lucie pour la séance : la fenêtre ne revient qu'à la prochaine connexion. Une
 * coordination qui enseigne garde Lucie : rien ne s'affiche pour elle.
 *
 * LE DESSIN DES FENÊTRES D'ANNONCE (3.5.243, Charles : « pour les fenêtres pop-up nous avons un autre design, en forme de D,
 * avec une bande de couleur sur le côté — ici elle sera verte ; un signe "nouveau" ») : celui des boîtes de lib/dialogue.jsx —
 * blanche, arrondie à droite, liseré de 4 px à gauche dans la couleur, icône dans la couleur, texte à l'encre. Et le mot de
 * passe est celui de Lucie (3.5.242) : plus de « Première visite ».
 *
 * PLUS DE « RESTER DANS LUCIE » (3.5.247, Charles : « il faut les forcer à aller dans le nouvel espace ; votre accès précédent
 * disparaîtrait au profit de cet espace individuel et encore plus sécurisé » ; tranché : annonce, puis fermeture à une date).
 * Un seul bouton : Ouvrir mon espace. La date est celle de la bascule (Mise en service, lib/bascule.js) ; passée, Lucie elle-même
 * refuse l'entrée. La fenêtre revient à chaque connexion d'ici là.
 */
import { useEffect, useState } from 'react';
import { IconExternalLink, IconSun, IconUserCheck, IconCalendarWeek, IconSparkles } from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';

const VU = 'lucie.pont.enseignant';
const VERT = 'var(--c-reussi)';

export default function PontEspaceEnseignant() {
  const [url, setUrl] = useState(null);
  const [date, setDate] = useState(null);
  useEffect(() => {
    if (getUser()?.role !== 'professeur') return;
    try { if (sessionStorage.getItem(VU)) return; } catch { /* navigation privée */ }
    fetch('/api/fonctions/moi', { headers: authHeaders() }).then(r => (r.ok ? r.json() : {}))
      .then(f => { if (f.espace_enseignant_url) { setUrl(f.espace_enseignant_url); setDate(f.bascule_le || null); } }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!url) return undefined;
    const f = e => { if (e.key === 'Escape') rester(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });
  if (!url) return null;
  function rester() { try { sessionStorage.setItem(VU, '1'); } catch { /* */ } setUrl(null); }
  return (
    <div role="dialog" aria-modal="true" aria-label="Votre espace enseignant"
      className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]"
      onMouseDown={e => e.target === e.currentTarget && rester()}>
      <div aria-hidden="true" className="absolute inset-0 voile-fenetre" />
      <div className="relative bg-white rounded-r-fenetre shadow-dessus w-[520px] max-w-full overflow-hidden border-l-4" style={{ borderLeftColor: VERT }}>
        <div className="flex gap-3 px-5 pt-5 pb-4">
          <IconSparkles size={24} className="flex-none mt-0.5" style={{ color: VERT }} />
          <div className="min-w-0 flex-1 space-y-3 text-sm text-slate-700">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold text-iip-texte">Votre espace enseignant</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white rounded-full px-2 py-0.5" style={{ background: VERT }}>Nouveau</span>
            </div>
            <p className="m-0 leading-relaxed">Pour votre meilleur confort et afin de simplifier votre navigation, vous disposez désormais de votre <b>espace privé</b>,
              à l’adresse <b className="select-all">{url.replace(/^https?:\/\//, '')}</b> — sur téléphone, tablette ou ordinateur.</p>
            <ul className="m-0 pl-0 list-none space-y-1.5">
              <li className="flex items-start gap-2"><IconSun size={16} className="flex-none mt-0.5 text-slate-500" /> Aujourd’hui : votre journée, vos messages, ce qui vous attend.</li>
              <li className="flex items-start gap-2"><IconUserCheck size={16} className="flex-none mt-0.5 text-slate-500" /> Vos notes, votre carnet, vos présences et vos étudiants.</li>
              <li className="flex items-start gap-2"><IconCalendarWeek size={16} className="flex-none mt-0.5 text-slate-500" /> Vos unités, les avis à rendre, et votre agenda : examens, délibérations, congés.</li>
            </ul>
            <p className="m-0 leading-relaxed bloc-etat px-3 py-2" data-etat="surveiller">Votre accès précédent à Lucie disparaîtra {date ? <>le <b>{date.split('-').reverse().join('/')}</b></> : <b>prochainement</b>}, au profit de cet espace individuel et encore plus sécurisé.</p>
            <p className="m-0 text-slate-600 leading-relaxed">Vous y entrez avec <b>votre adresse de l’institut et votre mot de passe de Lucie</b> ; un code à six chiffres vous est envoyé la première fois sur un nouvel appareil. Tout ce que vous faites dans Mes cours s’y fait aussi.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <a className="bouton bouton-fort inline-flex items-center gap-1.5" href={url}><IconExternalLink size={15} /> Ouvrir mon espace</a>
        </div>
      </div>
    </div>
  );
}

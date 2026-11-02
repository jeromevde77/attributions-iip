/**
 * LE PONT VERS L'ESPACE ENSEIGNANT (3.5.078, Charles, 2 novembre 2026 : « pour le moment ils se connectent à Lucie
 * directement ; si Lucie détecte que c'est un prof, qu'elle le redirige vers son espace et explique »).
 *
 * Un enseignant (rôle professeur) dont l'espace est ouvert (Mise en service → « L'espace enseignant », le portail
 * installé, son compte relié à une fiche) voit, à son arrivée dans Lucie, une fenêtre qui explique où vivre désormais
 * et l'y mène. Tant que l'espace ne fait pas tout (les notes, le carnet, les avis y viendront par étapes), il peut
 * rester dans Lucie pour la séance : la fenêtre ne revient qu'à la prochaine connexion. Une coordination qui enseigne
 * garde Lucie : rien ne s'affiche pour elle.
 */
import { useEffect, useState } from 'react';
import { IconExternalLink, IconSun, IconUserCheck, IconCalendarWeek } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders, getUser } from '../lib/api.js';

const VU = 'lucie.pont.enseignant';

export default function PontEspaceEnseignant() {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (getUser()?.role !== 'professeur') return;
    try { if (sessionStorage.getItem(VU)) return; } catch { /* navigation privée */ }
    fetch('/api/fonctions/moi', { headers: authHeaders() }).then(r => (r.ok ? r.json() : {}))
      .then(f => { if (f.espace_enseignant_url) setUrl(f.espace_enseignant_url); }).catch(() => {});
  }, []);
  if (!url) return null;
  const rester = () => { try { sessionStorage.setItem(VU, '1'); } catch { /* */ } setUrl(null); };
  return (
    <Fenetre titre="Votre espace enseignant" large="petite" onFermer={rester}
      pied={<>
        <button type="button" className="bouton" onClick={rester}>Rester dans Lucie pour cette fois</button>
        <a className="bouton bouton-fort inline-flex items-center gap-1.5" href={url}><IconExternalLink size={15} /> Ouvrir mon espace</a>
      </>}>
      <div className="space-y-3 text-sm">
        <p className="m-0">Les enseignants ont désormais leur propre espace, plus simple, à l’adresse <b className="select-all">{url.replace(/^https?:\/\//, '')}</b> — sur téléphone, tablette ou ordinateur.</p>
        <ul className="m-0 pl-0 list-none space-y-1.5">
          <li className="flex items-center gap-2"><IconSun size={16} className="text-slate-500" /> Ma journée : vos séances du jour et ce qui vous attend.</li>
          <li className="flex items-center gap-2"><IconUserCheck size={16} className="text-slate-500" /> Les présences, d’un toucher par étudiant.</li>
          <li className="flex items-center gap-2"><IconCalendarWeek size={16} className="text-slate-500" /> Votre horaire de la semaine.</li>
        </ul>
        <p className="m-0 text-slate-600">La première fois, choisissez « Première visite » : un lien arrive à votre adresse de l’institut, et vous choisissez un mot de passe pour cet espace. Les notes, le carnet de cotes et les avis y arrivent par étapes ; en attendant, ils restent ici, dans Mes cours.</p>
      </div>
    </Fenetre>
  );
}

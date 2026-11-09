/* LES ARCHIVÉS SONT PARTIS (3.5.270, Charles : « s'ils n'ont pas de PAE, ils n'ont pas été là ; ils sont partis s'ils sont
   archivés »). Pour la direction : les archivés et sortis qui gardent des unités sans résultat dans l'année de travail ou les
   suivantes — d'avant l'archivage qui retire d'office. Simulation, puis retrait par la porte du PAE ; ce qui porte une note ou un
   report reste et se nomme. Serveur : /api/etudiants/statut/archives-inscrits|nettoyer-archives. */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';

export default function NettoyerArchives({ onFait }) {
  const [d, setD] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const lire = () => fetch('/api/etudiants/statut/archives-inscrits', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  useEffect(() => { lire(); }, []);
  if (!d?.etudiants) return null;
  const appel = simulation => fetch('/api/etudiants/statut/nettoyer-archives', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ simulation }) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Refusé.'); return j; });
  async function retirer() {
    setEnCours(true);
    try {
      const s = await appel(true);
      const garde = s.conservees?.length ? `\n\n${s.conservees.length} unité(s) portant une note ou un report restent (${s.conservees.slice(0, 5).map(c => `${c.nom} UE ${c.ue_num}`).join(', ')}${s.conservees.length > 5 ? '…' : ''}).` : '';
      if (!(await demander({ titre: 'Retirer les unités des étudiants partis', message: `${s.ues} unité(s) sans résultat seront retirées du programme de ${s.etudiants} étudiant(s) archivé(s) ou sorti(s), en ${d.annee} et après. Leurs résultats et leur parcours restent.${garde}`, confirmer: 'Retirer' }))) return;
      const f = await appel(false);
      informer(`✓ ${f.ues} unité(s) retirée(s) du programme de ${f.etudiants} étudiant(s).`);
      lire(); onFait?.();
    } catch (e) { informer(e.message); } finally { setEnCours(false); }
  }
  return (
    <div className="bloc-etat px-3 py-2 mb-3 flex flex-wrap items-center gap-3 text-sm" data-etat="corriger">
      <span className="flex-1 min-w-0"><b>{d.etudiants} étudiant(s) archivé(s) ou sorti(s)</b> gardent {d.inscriptions} unité(s) sans résultat en {d.annee} :
        ils paraissent dans les groupes et les listes de l’année alors qu’ils sont partis.</span>
      <button type="button" className="bouton bouton-fort" disabled={enCours} onClick={retirer}>{enCours ? 'Calcul…' : 'Retirer leurs unités…'}</button>
    </div>);
}

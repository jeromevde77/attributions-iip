import { useMemo, useState } from 'react';
import { COULEUR_BLOC, OR_EPREUVE, blocDe, rangBloc } from '../lib/blocs.js';

/**
 * LES UNITÉS RANGÉES PAR BLOC — BA1 d'abord, puis BA2, puis BA3 (Charles,
 * 25 septembre 2026 : « tu me les classes par année… un sous-tableau par
 * bloc », puis « tu me fais ça partout où il y a des années »).
 *
 * Une rangée de TUILES filtre (le nombre d'unités, le bloc, le liseré de sa
 * couleur), puis un SOUS-TABLEAU par bloc, bordé de la même couleur.
 * L'épreuve intégrée a le sien, en dernier, au liseré doré.
 *
 * Le composant ne dessine PAS les lignes : chaque écran garde les siennes et
 * les passe en `children(liste, groupe)`. Un seul rangement, autant de lignes
 * qu'il y a d'écrans — c'est ce qui permet de le poser partout sans refaire
 * chaque liste.
 *
 * @param items    les unités, chacune portant son bloc (`ue_niv` par défaut)
 * @param blocDeItem   (u) => 'BA1' … ; par défaut u.ue_niv
 * @param estEpreuve   (u) => booléen ; par défaut u.epreuve_integree
 * @param children     (liste, groupe) => le contenu d'un sous-tableau
 */
export default function GroupesParBloc({ items, blocDeItem, estEpreuve, children, libelle = 'unité(s)' }) {
  const [filtre, setFiltre] = useState('');
  const bloc = blocDeItem || (u => u.ue_niv);
  const ei = estEpreuve || (u => !!u.epreuve_integree);

  const groupes = useMemo(() => {
    const m = new Map();
    for (const u of items || []) {
      const cle = ei(u) ? 'EI' : (blocDe(bloc(u)) || 'AUTRE');
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle).push(u);
    }
    const ordre = k => (k === 'EI' ? 1000 : k === 'AUTRE' ? 2000 : rangBloc(k));
    return [...m.entries()].sort((a, b) => ordre(a[0]) - ordre(b[0]))
      .map(([cle, liste]) => ({
        cle, liste,
        titre: cle === 'EI' ? 'Épreuve intégrée' : cle === 'AUTRE' ? 'Sans bloc' : cle,
        couleur: cle === 'EI' ? OR_EPREUVE : cle === 'AUTRE' ? '#CBD5E1' : (COULEUR_BLOC[cle] || '#94A3B8'),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Un seul bloc : pas de tuiles, pas de sous-tableau — rien à trier.
  if (groupes.length <= 1) return children(items || [], groupes[0] || null);

  const visibles = groupes.filter(g => !filtre || g.cle === filtre);
  const tuile = (cle, n, titre, couleur) => (
    <button key={cle || 'tout'} type="button" onClick={() => setFiltre(cle)} aria-pressed={filtre === cle}
      className={`text-left px-3 py-2 border bg-white min-w-0 transition-colors duration-150
        ${filtre === cle ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
      style={{ borderLeft: `3px solid ${couleur}` }}>
      <div className="text-[17px] font-bold text-iip-blue tabular-nums leading-tight">{n}</div>
      <div className="text-[12px] text-slate-600 truncate">{titre}</div>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(groupes.length + 1, 6)}, minmax(0, 1fr))` }}>
        {tuile('', (items || []).length, `Toutes les ${libelle.replace('(s)', 's')}`, '#CBD5E1')}
        {groupes.map(g => tuile(g.cle, g.liste.length, g.titre, g.couleur))}
      </div>
      {visibles.map(g => (
        <section key={g.cle} className="border border-slate-200 bg-white overflow-hidden"
          style={{ borderLeft: `4px solid ${g.couleur}`, borderRadius: '0 14px 14px 0' }}>
          <div className="px-3 py-1.5 flex items-center gap-2 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[13px] font-semibold text-iip-blue">{g.titre}</span>
            <span className="text-[12px] text-slate-500">{g.liste.length} {libelle}</span>
          </div>
          {children(g.liste, g)}
        </section>
      ))}
    </div>
  );
}

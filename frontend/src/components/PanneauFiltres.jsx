import { useState } from 'react';
import { IconAdjustmentsHorizontal, IconX } from '@tabler/icons-react';

/**
 * UNE SEULE LIGNE DE MENU, PARTOUT (3.1.468, Charles, 29 octobre 2026 : « je ne veux qu'une seule ligne de
 * menu… jamais plus »). La barre d'un écran garde l'essentiel — recherche, un ou deux choix majeurs — et range
 * le reste derrière un bouton « Filtres » qui dit combien sont actifs. Ce qui est actif se lit en pastilles
 * sous la barre (`PastillesFiltres`) : un filtre caché dans un panneau ne passe jamais inaperçu. C'est le
 * dessin de la liste des étudiants (3.1.456), écrit une fois pour tous les écrans.
 *
 *   filtres : [{ k, libelle, champ, actif, etiquette, off }]
 *     champ     — le contrôle (select, case…) ; pour une case, `libelle` peut rester vide
 *     actif     — le filtre est-il posé ?
 *     etiquette — ce que dit sa pastille (« CC seulement »)
 *     off       — le retirer
 */
export function BoutonFiltres({ filtres, toutEffacer, largeur = 420 }) {
  const [ouvert, setOuvert] = useState(false);
  const n = filtres.filter(f => f.actif).length;
  return (
    <div className="relative flex-none">
      <button type="button" onClick={() => setOuvert(o => !o)} aria-expanded={ouvert}
        className={`controle inline-flex items-center gap-2 font-semibold ${n ? 'border-iip-blue text-iip-blue' : ''}`}>
        <IconAdjustmentsHorizontal size={16} /> Filtres
        {n > 0 && <span className="px-1.5 rounded-full text-white text-xs" style={{ background: 'var(--c-principal)' }}>{n}</span>}
      </button>
      {ouvert && (<>
        <div className="fixed inset-0 z-30" onClick={() => setOuvert(false)} />
        <div className="absolute right-0 mt-2 z-40 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-carte shadow-flottant p-4 space-y-2.5"
          style={{ width: largeur }}>
          {filtres.map(f => (f.libelle
            ? <label key={f.k} className="grid grid-cols-[120px_1fr] items-center gap-3 text-sm text-iip-texte">{f.libelle}{f.champ}</label>
            : <div key={f.k} className="text-sm text-iip-texte">{f.champ}</div>))}
          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <button type="button" className="text-second text-iip-blue underline" onClick={toutEffacer}>Tout effacer</button>
            <button type="button" className="bouton" onClick={() => setOuvert(false)}>Fermer</button>
          </div>
        </div>
      </>)}
    </div>
  );
}

export function PastillesFiltres({ filtres, toutEffacer }) {
  const actifs = filtres.filter(f => f.actif);
  if (!actifs.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-second text-slate-600">
      <span>Filtres actifs :</span>
      {actifs.map(f => (
        <span key={f.k} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full bg-white border border-slate-300 text-iip-texte">
          {f.etiquette}
          <button type="button" onClick={f.off} title={`Retirer « ${f.etiquette} »`} className="text-slate-400 hover:text-slate-700"><IconX size={13} /></button>
        </span>))}
      <button type="button" className="text-iip-blue underline" onClick={toutEffacer}>Tout effacer</button>
    </div>
  );
}

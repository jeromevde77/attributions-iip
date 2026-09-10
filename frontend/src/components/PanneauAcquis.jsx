import { useState } from 'react';
import { IconChevronRight, IconListDetails } from '@tabler/icons-react';

/**
 * LES ACQUIS, ÉNONCÉS EN TOUTES LETTRES, À CÔTÉ DE LA GRILLE.
 *
 * Une grille d'encodage ne montre que des codes : AA1, AA2, AA3. Le professeur
 * qui corrige a l'énoncé sous les yeux sur sa copie, pas à l'écran — et rien
 * n'est plus facile que de coter le mauvais acquis quand on ne distingue les
 * colonnes que par un numéro. L'énoncé complet tenait dans une infobulle : il
 * fallait le survoler colonne par colonne, ce que personne ne fait.
 *
 * Le panneau se replie : sur un petit écran, la grille reprend toute la place.
 */
export default function PanneauAcquis({ colonnes, titre = 'Acquis d’apprentissage' }) {
  const [ouvert, setOuvert] = useState(true);
  if (!colonnes?.length) return null;

  // Regroupés par cours : c'est ainsi que la grille les présente, et un même
  // acquis peut revenir sous deux cours qui l'évaluent chacun.
  const parCours = [];
  for (const c of colonnes) {
    let g = parCours.find(x => x.cours_code === c.cours_code);
    if (!g) parCours.push(g = { cours_code: c.cours_code, cours_nom: c.cours_nom,
                                professeurs: c.professeurs, acquis: [] });
    g.acquis.push(c);
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} title="Afficher l’énoncé des acquis"
        className="flex-none w-9 border-r border-slate-200 bg-slate-50 hover:bg-slate-100
                   flex flex-col items-center gap-2 py-3 text-slate-500">
        <IconListDetails size={16} />
        <span className="text-[10px] font-semibold tracking-wide"
          style={{ writingMode: 'vertical-rl' }}>Acquis</span>
      </button>
    );
  }

  return (
    <aside className="flex-none w-[280px] border-r border-slate-200 bg-slate-50/70
                      overflow-y-auto">
      <div className="sticky top-0 bg-slate-50 border-b border-slate-200 px-3 py-2
                      flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {titre}
        </span>
        <button onClick={() => setOuvert(false)} title="Replier"
          className="text-slate-400 hover:text-slate-600">
          <IconChevronRight size={15} className="rotate-180" />
        </button>
      </div>

      <div className="divide-y divide-slate-200">
        {parCours.map(g => (
          <div key={g.cours_code} className="px-3 py-2">
            <div className="text-[11.5px] font-semibold text-iip-blue leading-tight">
              {g.cours_nom || g.cours_code}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">{g.cours_code}</div>
            {g.professeurs && (
              <div className="text-[10px] text-iip-blue/70 italic">{g.professeurs}</div>
            )}
            <ul className="mt-1.5 space-y-1.5">
              {g.acquis.map(a => (
                <li key={`${g.cours_code}|${a.aa_code}`} className="flex gap-1.5">
                  <span className="flex-none mt-px inline-block min-w-[34px] text-center
                                   px-1 py-px rounded bg-white border border-slate-300
                                   text-[10px] font-bold text-slate-700">
                    {a.aa_code}
                  </span>
                  <span className="text-[11px] text-slate-700 leading-snug">
                    {a.description || <span className="text-slate-400 italic">
                      énoncé non renseigné — à compléter au référentiel</span>}
                    {a.poids != null && (
                      <span className="text-slate-400"> · {a.poids} %</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

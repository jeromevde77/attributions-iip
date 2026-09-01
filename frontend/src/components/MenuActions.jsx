import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';

/**
 * Menu d'actions, pour regrouper une barre d'outils devenue trop longue.
 *
 * La barre des étudiants alignait neuf boutons, dont cinq imports et trois
 * impressions : on ne les distinguait plus. Ils se rangent derrière deux
 * entrées, avec des séparateurs et des descriptions — le libellé seul ne dit
 * pas la différence entre « importer une liste » et « compléter les dossiers ».
 */
export default function MenuActions({ libelle, Icone, ton = 'neutre', items, titre }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = e => { if (ref.current && !ref.current.contains(e.target)) setOuvert(false); };
    const echap = e => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('mousedown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  const tons = {
    neutre: 'border-slate-300 text-slate-600 hover:bg-slate-50',
    bleu: 'border-iip-blue text-iip-blue hover:bg-iip-blue/5',
    turquoise: 'border-iip-turquoise text-iip-turquoise hover:bg-iip-turquoise/5',
    danger: 'border-red-200 text-red-600 hover:bg-red-50',
  };

  const visibles = items.filter(i => i && (i.si === undefined || i.si));

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOuvert(o => !o)} title={titre}
        className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg
                    font-medium ${tons[ton] || tons.neutre}`}>
        {Icone && <Icone size={15} />} {libelle}
        <IconChevronDown size={13} className={`transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <div className="absolute left-0 mt-1 w-72 bg-white border border-slate-200
                        rounded-xl shadow-lg z-40 py-1.5">
          {visibles.map((it, i) => (
            it.separateur ? (
              <div key={`s${i}`} className="my-1.5 border-t border-slate-100">
                {it.titre && (
                  <div className="text-[10px] uppercase tracking-wide text-slate-400
                                  font-semibold px-3 pt-2 pb-0.5">{it.titre}</div>
                )}
              </div>
            ) : it.fichier ? (
              // Un choix de fichier ne peut pas être un <button> : il lui faut
              // un <input type=file> masqué sous un <label>.
              <label key={i}
                className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer
                            hover:bg-slate-50 ${it.desactive ? 'opacity-40 pointer-events-none' : ''}`}>
                {it.Icone && <it.Icone size={15} className="mt-0.5 flex-none text-slate-400" />}
                <span className="min-w-0">
                  <span className="block text-[13px] text-slate-700">{it.libelle}</span>
                  {it.aide && <span className="block text-[11px] text-slate-400">{it.aide}</span>}
                </span>
                <input type="file" accept={it.accept} className="hidden"
                  onChange={e => {
                    if (e.target.files[0]) it.onFichier(e.target.files[0]);
                    e.target.value = '';
                    setOuvert(false);
                  }} />
              </label>
            ) : (
              <button key={i}
                onClick={() => { setOuvert(false); it.onClick(); }}
                className={`w-full flex items-start gap-2.5 px-3 py-2 text-left
                            hover:bg-slate-50 ${it.danger ? 'text-red-600' : ''}`}>
                {it.Icone && (
                  <it.Icone size={15}
                    className={`mt-0.5 flex-none ${it.danger ? 'text-red-400' : 'text-slate-400'}`} />
                )}
                <span className="min-w-0">
                  <span className={`block text-[13px] ${it.danger ? '' : 'text-slate-700'}`}>
                    {it.libelle}
                  </span>
                  {it.aide && <span className="block text-[11px] text-slate-400">{it.aide}</span>}
                </span>
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}

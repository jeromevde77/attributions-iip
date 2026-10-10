import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconX } from '@tabler/icons-react';

/**
 * UNE LISTE QUI SE CHERCHE (3.1.275, Charles, 10 octobre 2026 : « il me faudrait un champ
 * de recherche… trouver "peti" ou "matériel" »). Remplace une liste déroulante trop
 * longue : on tape, la liste se réduit. Les mots se cherchent chacun, dans n'importe quel
 * ordre, sans tenir compte des accents ni des majuscules — « mat peti » trouve « Petit
 * matériel ». Clavier : ↑ ↓ pour choisir, Entrée pour valider, Échap pour refermer.
 *   options : [{ valeur, libelle, detail? }]
 */
const plat = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ChoixRecherche({ options, valeur, onChange, placeholder = 'Chercher…', vide = '— à préciser', className = '' }) {
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [i, setI] = useState(0);
  const boite = useRef(null), liste = useRef(null);
  const choisi = options.find(o => String(o.valeur) === String(valeur ?? ''));

  const trouves = useMemo(() => {
    const mots = plat(q).split(/\s+/).filter(Boolean);
    if (!mots.length) return options;
    return options.filter(o => { const t = plat(`${o.valeur} ${o.libelle} ${o.detail || ''}`); return mots.every(m => t.includes(m)); });
  }, [options, q]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => {
    const f = e => { if (boite.current && !boite.current.contains(e.target)) { setOuvert(false); setQ(''); } };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, []);
  useEffect(() => { liste.current?.children[i]?.scrollIntoView({ block: 'nearest' }); }, [i]);

  const valider = o => { onChange(o ? o.valeur : ''); setOuvert(false); setQ(''); };
  const clavier = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setI(x => Math.min(x + 1, trouves.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (ouvert && trouves[i]) valider(trouves[i]); }
    else if (e.key === 'Escape') { setOuvert(false); setQ(''); }
  };

  return (
    <div ref={boite} className={`relative ${className}`}>
      <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input role="combobox" aria-expanded={ouvert} data-reponses="non"
        value={ouvert ? q : (choisi ? `${choisi.valeur} — ${choisi.libelle}` : '')}
        placeholder={ouvert ? placeholder : vide}
        onFocus={() => setOuvert(true)} onClick={() => setOuvert(true)}
        onChange={e => { setQ(e.target.value); setOuvert(true); }} onKeyDown={clavier}
        className="controle controle-icone w-full pr-8" />
      {choisi && !ouvert && (
        <button type="button" aria-label="Effacer" onClick={() => valider(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><IconX size={14} /></button>)}
      {ouvert && (
        <ul ref={liste} role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-champ border border-slate-200 shadow-flottant"
          style={{ background: 'var(--blanc)' }}>
          {!trouves.length && <li className="px-3 py-2 text-second text-slate-400">Rien ne correspond à « {q} ».</li>}
          {trouves.map((o, k) => (
            <li key={o.valeur} role="option" aria-selected={k === i}
              onMouseDown={e => { e.preventDefault(); valider(o); }} onMouseEnter={() => setI(k)}
              className={`px-3 py-1.5 text-sm cursor-pointer flex gap-2 ${k === i ? 'bg-slate-100' : ''}`}>
              <span className="tabular-nums text-slate-500 flex-none">{o.valeur}</span>
              <span className="min-w-0">{o.libelle}{o.detail && <span className="text-second text-slate-400"> · {o.detail}</span>}</span>
            </li>))}
        </ul>)}
    </div>
  );
}

/**
 * CURSUS COMPATIBLES (Charles, 27 septembre 2026 : « si on passe d'un cursus à
 * l'autre, on archive le précédent, sauf si ce sont des cursus compatibles »).
 * Deux sections déclarées ici se suivent ensemble : aucune n'archive l'autre,
 * le schéma et le PAE les portent côte à côte. Aucune paire n'est déclarée
 * d'office — la compatibilité se décide, elle ne se devine pas.
 */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';

export default function CursusCompatibles() {
  const [sections, setSections] = useState([]);
  const [paires, setPaires] = useState([]);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => r.json()).then(l => setSections(Array.isArray(l) ? l : [])).catch(() => {});
    fetch('/api/config/cursus_compatibles', { headers: authHeaders() }).then(r => (r.ok ? r.json() : { valeur: '[]' }))
      .then(j => { try { setPaires(JSON.parse(j.valeur) || []); } catch { setPaires([]); } }).catch(() => {});
  }, []);
  const enregistrer = async l => {
    setMsg(null);
    const r = await fetch('/api/config/cursus_compatibles', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ valeur: JSON.stringify(l) }) });
    if (r.ok) { setPaires(l); setMsg('Enregistré.'); } else setMsg('Enregistrement refusé.');
  };
  const nom = c => sections.find(x => x.code === c)?.libelle || c;
  return (
    <div className="space-y-3 text-sm max-w-2xl">
      <div>
        <div className="text-base font-semibold text-iip-blue">Cursus compatibles</div>
        <p className="text-slate-500 text-second">
          Quand un étudiant change de section, son cursus précédent est archivé : il sort du schéma et du PAE, et se nomme
          au-dessus du schéma. Deux sections déclarées compatibles se suivent ensemble, sans que l'une archive l'autre.
        </p>
      </div>
      {!paires.length && <p className="text-slate-400">Aucune paire déclarée : tout changement de section archive le cursus précédent.</p>}
      {paires.map((p, i) => (
        <div key={i} className="flex items-center gap-2 border-b border-slate-100 py-1">
          <span className="flex-1"><b>{nom(p[0])}</b> ↔ <b>{nom(p[1])}</b></span>
          <button className="bouton bouton-compact" onClick={() => enregistrer(paires.filter((_, j) => j !== i))}>Retirer</button>
        </div>
      ))}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={a} onChange={e => setA(e.target.value)} className="controle border border-slate-300 rounded-champ bg-white">
          <option value="">— section —</option>{sections.map(x => <option key={x.code} value={x.code}>{x.libelle || x.code}</option>)}
        </select>
        <span>↔</span>
        <select value={b} onChange={e => setB(e.target.value)} className="controle border border-slate-300 rounded-champ bg-white">
          <option value="">— section —</option>{sections.filter(x => x.code !== a).map(x => <option key={x.code} value={x.code}>{x.libelle || x.code}</option>)}
        </select>
        <button className="bouton bouton-fort" disabled={!a || !b || paires.some(p => p.includes(a) && p.includes(b))}
          onClick={() => { enregistrer([...paires, [a, b]]); setA(''); setB(''); }}>Déclarer compatibles</button>
        {msg && <span className="text-second text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

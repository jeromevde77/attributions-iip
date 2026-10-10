import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';

/**
 * LES NOTES EN DOUBLE (3 octobre 2026) — la grille d'unité contre la forme
 * lue. Une ligne par étudiant et par unité ; on choisit la bonne valeur, un
 * motif, et Lucie aligne. La cote de décision se corrige ensuite dans
 * « Contrôle des notes de décision », qui montrera l'écart.
 */
export default function NotesDoubles() {
  const [ecarts, setEcarts] = useState(null);
  const [choix, setChoix] = useState({});      // clé groupe → 'grille' | 'lue'
  const [motif, setMotif] = useState('');
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const charger = () => fetch('/api/notes-doubles', { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setEcarts(j.ecarts || []); })
    .catch(e => setMsg({ err: e.message }));
  useEffect(() => { charger(); }, []);

  const groupes = useMemo(() => {
    const m = new Map();
    for (const x of ecarts || []) {
      const k = `${x.etudiant_id}|${x.annee}|${x.ue_num}|${x.session}`;
      if (!m.has(k)) m.set(k, { k, ...x, lignes: [] });
      m.get(k).lignes.push(x);
    }
    return [...m.values()];
  }, [ecarts]);
  const n = Object.values(choix).filter(Boolean).length;
  const fmt = v => String(v ?? '—').replace('.', ',');

  const appliquer = async () => {
    setOccupe(true); setMsg(null);
    try {
      const liste = groupes.filter(g => choix[g.k]).flatMap(g => g.lignes.map(x => ({ ...x, garder: choix[g.k] })));
      const r = await fetch('/api/notes-doubles', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ choix: liste, motif }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setMsg({ ok: `${j.alignees} note(s) alignée(s). Corrigez maintenant la cote dans « Contrôle des notes de décision ».` });
      setChoix({}); setMotif(''); await charger();
    } catch (e) { setMsg({ err: e.message }); } finally { setOccupe(false); }
  };

  if (!ecarts) return <p className="text-sm text-slate-400">{msg?.err || 'Chargement…'}</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Une même note d'épreuve existe sous deux formes avec deux valeurs : la grille d'unité (ancienne saisie)
        et la forme que Lucie lit. Choisissez la bonne ; l'autre s'aligne. Rien ne change avant « Aligner ».</p>
      {msg?.err && <p className="text-sm" style={{ color: 'var(--c-refuse, #9D4A38)' }}>{msg.err}</p>}
      {msg?.ok && <p className="text-sm font-semibold" style={{ color: 'var(--c-reussi, #3E7D5E)' }}>{msg.ok}</p>}
      {!groupes.length ? <p className="text-sm text-slate-500">Aucune note en double avec deux valeurs.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="tab-entete">
            <th className="text-left px-2 py-1">Étudiant</th><th className="text-left px-2 py-1">UE · session</th>
            <th className="text-left px-2 py-1">Acquis</th><th className="text-center px-2 py-1">Grille d'unité</th>
            <th className="text-center px-2 py-1">Forme lue</th>
          </tr></thead>
          <tbody>{groupes.map(g => (
            <tr key={g.k} className="border-b border-slate-100 align-top">
              <td className="px-2 py-1.5 font-medium">{g.etudiant}</td>
              <td className="px-2 py-1.5">UE {g.ue_num} · {g.annee} · S{g.session}</td>
              <td className="px-2 py-1.5 text-slate-600">{g.lignes.map(x => x.acquis).join(', ')}</td>
              {['grille', 'lue'].map(c => (
                <td key={c} className="px-2 py-1.5 text-center">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name={g.k} checked={choix[g.k] === c} onChange={() => setChoix(o => ({ ...o, [g.k]: c }))} />
                    <b className="tabular-nums">{[...new Set(g.lignes.map(x => fmt(x[c])))].join(' / ')}</b>
                  </label>
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      )}
      {!!groupes.length && (
        <div className="flex items-center gap-2 flex-wrap">
          <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Motif (gardé au journal) — ex. : demi-point perdu à l'encodage"
            className="controle flex-1 min-w-[280px]" />
          <button type="button" disabled={occupe || !n || motif.trim().length < 5} onClick={appliquer}
            className="bouton bouton-fort disabled:opacity-40">Aligner {n || ''} ligne(s)</button>
        </div>
      )}
    </div>
  );
}

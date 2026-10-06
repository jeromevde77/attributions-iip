import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { listePays } from '../lib/pays.js';

/**
 * L'ADRESSE, PARTOUT LA MÊME (Charles, 6 octobre 2026 : « il faut que partout
 * ce soit pareil »). Le code postal d'abord : il propose la localité (liste
 * bpost) et les rues (BeST Address, SPF BOSA). Une adresse à l'étranger reste
 * libre — rien n'est imposé. Écrit une fois, posé sur chaque fiche : la fiche
 * étudiant, la fiche du personnel, les lieux de stage.
 *
 * `valeurs` : { cp, localite, rue } ; `poser(champ, valeur)` avec champ ∈
 * 'cp' | 'localite' | 'rue'. `modifies` (facultatif) : les champs à marquer.
 */
let cacheCp = null;
export function useCodesPostaux() {
  const [cps, setCps] = useState(cacheCp);
  useEffect(() => {
    if (cacheCp) return;
    import('../lib/codesPostaux.json').then(m => { cacheCp = m.default; setCps(m.default); }).catch(() => {});
  }, []);
  return cps;
}

const CLS = 'w-full border rounded-lg px-2 py-1.5 text-sm';

/* HORS DU COMPOSANT : une étiquette redéfinie à chaque rendu est un AUTRE
   composant pour React, qui remonte le champ à chaque frappe — le focus se
   perd et seule la première lettre s'écrit. */
function EtiquetteParDefaut({ label, children }) {
  return (
    <label className="text-xs block">
      <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function ChampsAdresse({ valeurs, poser, modifies = {}, Etiquette, ordre = 'cp', classe }) {
  const cps = useCodesPostaux();
  const [rues, setRues] = useState([]);
  const cp = String(valeurs.cp || '').trim();
  const locs = (cps && cps[cp]) || [];
  const id = useState(() => Math.random().toString(36).slice(2, 8))[0];

  const majCp = v => {
    poser('cp', v);
    // Un code postal belge d'une seule localité la pose d'office.
    const l = cps?.[v.trim()];
    if (l?.length === 1 && !String(valeurs.localite || '').trim()) poser('localite', l[0]);
  };
  const majRue = v => {
    poser('rue', v);
    if (!/^\d{4}$/.test(cp) || v.length < 2 || /\d/.test(v)) return;
    fetch(`/api/ref/rues?cp=${cp}&q=${encodeURIComponent(v)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setRues(Array.isArray(l) ? l : [])).catch(() => {});
  };
  const cls = k => classe || `${CLS} ${modifies[k] ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`;
  const Lbl = Etiquette || EtiquetteParDefaut;

  const champCp = (
    <Lbl key="cp" label="Code postal">
      <input type="text" value={valeurs.cp || ''} onChange={e => majCp(e.target.value)} className={cls('cp')} />
      {/^\d{4}$/.test(cp) && cps && !locs.length && (
        <span className="block text-[10px] mt-0.5" style={{ color: 'var(--c-surveiller, #B45309)' }}>Code postal inconnu en Belgique</span>
      )}
    </Lbl>
  );
  const champLoc = (
    <Lbl key="loc" label="Localité">
      <input type="text" value={valeurs.localite || ''} list={locs.length ? `loc-${id}` : undefined}
        onChange={e => poser('localite', e.target.value)} className={cls('localite')} />
      {!!locs.length && <datalist id={`loc-${id}`}>{locs.map(x => <option key={x} value={x} />)}</datalist>}
    </Lbl>
  );
  const champRue = (
    <Lbl key="rue" label="Adresse (rue et numéro)">
      <input type="text" value={valeurs.rue || ''} list={rues.length ? `rue-${id}` : undefined}
        onChange={e => majRue(e.target.value)} className={cls('rue')} />
      {!!rues.length && <datalist id={`rue-${id}`}>{rues.map(x => <option key={x} value={x} />)}</datalist>}
    </Lbl>
  );
  return ordre === 'cp' ? [champCp, champLoc, champRue] : [champRue, champCp, champLoc];
}

/** Un pays de la liste fermée ; une ancienne saisie libre reste visible, marquée. */
export function ChoixPays({ value, onChange, className }) {
  const v = value || '';
  return (
    <select value={v} onChange={e => onChange(e.target.value)} className={className || `${CLS} border-slate-300`}>
      <option value="">—</option>
      {v && !listePays().some(p => p.nom === v) && <option value={v}>{v} (saisie à remplacer)</option>}
      {listePays().map(p => <option key={p.code} value={p.nom}>{p.nom}</option>)}
    </select>
  );
}

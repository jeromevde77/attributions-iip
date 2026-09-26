import { useEffect, useState } from 'react';
import { authHeaders, getAnnee } from '../lib/api.js';

/**
 * LE CHOIX D'UNE UNITÉ — UNE LISTE, JAMAIS UN NUMÉRO À TAPER.
 *
 * La règle date de 2.11.8 (« une unité se choisit, elle ne se tape pas ») et
 * avait été appliquée écran par écran : une vingtaine de listes recodées à la
 * main, et deux champs restés libres (aperçu des pièces, stages). Charles, le
 * 26 septembre 2026 : « pour unité, prévoir un menu déroulant… partout ». Voici
 * le composant commun ; un nouvel écran n'a plus à refaire le sien.
 *
 * Les unités du millésime, restreintes à la section quand elle est connue,
 * rangées par section quand elle ne l'est pas. Un même numéro existe sous
 * plusieurs sections (l'UE 95) : il ne paraît qu'une fois par section.
 * Quand la liste est vide, on le DIT — pas de repli en saisie libre.
 *
 * @param value     ue_num choisi ('' ou null : aucun)
 * @param onChange  (ue_num: number|null) => void
 * @param annee     millésime (défaut : l'année de travail)
 * @param section   restreint à une section (facultatif)
 * @param vide      libellé de l'option vide (défaut « — choisir une unité — »)
 */
export default function ChoixUnite({ value, onChange, annee, section = null, vide = '— choisir une unité —',
                                     className = '', disabled = false, title }) {
  const an = annee || getAnnee();
  const [ues, setUes] = useState(null);
  useEffect(() => {
    let vivant = true;
    const q = new URLSearchParams({ annee: an, ...(section ? { section } : {}) });
    fetch(`/api/ref/ue?${q}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => { if (vivant) setUes(Array.isArray(l) ? l : []); })
      .catch(() => { if (vivant) setUes([]); });
    return () => { vivant = false; };
  }, [an, section]);

  if (ues === null) {
    return <select disabled className={`controle border border-slate-300 rounded-champ bg-white ${className}`}><option>Chargement…</option></select>;
  }
  if (!ues.length) {
    return <span className="text-[12px] text-slate-400">Aucune unité pour {section ? `${section} en ` : ''}{an}.</span>;
  }
  // Une ligne par (section, unité) ; groupes par section.
  const vus = new Set();
  const parSection = new Map();
  for (const u of ues) {
    const cle = `${u.section}|${u.ue_num}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const s = u.section || '—';
    if (!parSection.has(s)) parSection.set(s, []);
    parSection.get(s).push(u);
  }
  const option = u => <option key={`${u.section}|${u.ue_num}`} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom || ''}</option>;
  return (
    <select value={value ?? ''} disabled={disabled} title={title}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={`controle border border-slate-300 rounded-champ bg-white ${className}`}>
      <option value="">{vide}</option>
      {section || parSection.size === 1
        ? [...parSection.values()].flat().map(option)
        : [...parSection.entries()].map(([s, l]) => <optgroup key={s} label={s}>{l.map(option)}</optgroup>)}
    </select>
  );
}

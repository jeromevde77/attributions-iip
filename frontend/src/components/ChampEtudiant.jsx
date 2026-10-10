/**
 * CHOISIR UN ÉTUDIANT EN TAPANT (Charles, 7 octobre 2026 : « si je tape Cha,
 * il doit proposer tous les noms ou prénoms avec CHA… le même système partout
 * dans les zones de saisie »).
 *
 * On tape ; les étudiants dont le nom, le prénom ou le matricule contient ce
 * qu'on a tapé s'affichent — sans accents ni casse, chaque mot doit se
 * retrouver. Flèches, Entrée pour choisir, Échap pour fermer. Vider le champ
 * rend la main : rien ne reste filtré en silence.
 *
 * Deux sources : une liste que l'écran possède déjà (`options`), ou la base
 * (`/api/etudiants/chercher`) quand on n'en donne pas.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nomAffiche = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();

export default function ChampEtudiant({ options = null, onChoisir, onVider = null, placeholder = 'Nom, prénom ou matricule…',
                                        valeur = '', className = '', autoFocus = false, detail = null }) {
  const [texte, setTexte] = useState(valeur);
  const [ouvert, setOuvert] = useState(false);
  const [distants, setDistants] = useState([]);
  const [actif, setActif] = useState(0);
  const boite = useRef(null);
  useEffect(() => { setTexte(valeur); }, [valeur]);

  const mots = norm(texte).split(/\s+/).filter(Boolean);
  const locaux = useMemo(() => {
    if (!options || !mots.length) return [];
    return options.filter(e => {
      const foin = norm(`${e.nom} ${e.prenom} ${e.id_ecampus || e.matricule || ''}`);
      return mots.every(m => foin.includes(m));
    }).slice(0, 30);
  }, [options, texte]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (options || !mots.length) { setDistants([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/etudiants/chercher?q=${encodeURIComponent(texte)}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : [])).then(l => setDistants(Array.isArray(l) ? l : [])).catch(() => setDistants([]));
    }, 180);
    return () => clearTimeout(t);
  }, [texte, options]);   // eslint-disable-line react-hooks/exhaustive-deps

  const propositions = options ? locaux : distants;
  useEffect(() => { setActif(0); }, [texte]);
  useEffect(() => {
    const dehors = ev => { if (boite.current && !boite.current.contains(ev.target)) setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, []);

  const choisir = e => { setTexte(nomAffiche(e)); setOuvert(false); onChoisir?.(e); };
  const vider = () => { setTexte(''); setOuvert(false); onVider?.(); };

  return (
    <div ref={boite} className={`relative ${className}`}>
      <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input value={texte} autoFocus={autoFocus} placeholder={placeholder} data-reponses="non"
        onChange={e => { setTexte(e.target.value); setOuvert(true); if (!e.target.value) onVider?.(); }}
        onFocus={() => { if (texte) setOuvert(true); }}
        onKeyDown={ev => {
          if (ev.key === 'ArrowDown') { ev.preventDefault(); setOuvert(true); setActif(a => Math.min(a + 1, propositions.length - 1)); }
          else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActif(a => Math.max(a - 1, 0)); }
          else if (ev.key === 'Enter') { if (ouvert && propositions[actif]) { ev.preventDefault(); choisir(propositions[actif]); } }
          else if (ev.key === 'Escape') { if (ouvert) { ev.stopPropagation(); setOuvert(false); } }
        }}
        className="controle controle-icone w-full pr-8" />
      {texte && (
        <button type="button" onClick={vider} title="Effacer" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          <IconX size={14} /></button>)}
      {ouvert && mots.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-champ shadow-flottant max-h-72 overflow-auto">
          {propositions.length === 0
            ? <div className="px-3 py-2 text-second text-slate-500">Aucun étudiant ne contient « {texte} ».</div>
            : propositions.map((e, k) => (
              <button key={e.id} type="button" onMouseDown={ev => { ev.preventDefault(); choisir(e); }} onMouseEnter={() => setActif(k)}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-baseline gap-2 ${k === actif ? 'bg-slate-100' : ''}`}>
                <span className="font-medium text-iip-blue">{nomAffiche(e)}</span>
                <span className="text-xs text-slate-500 tabular-nums">{e.id_ecampus || e.matricule || ''}</span>
                {(e.section || e.section_rattachement) && <span className="text-xs text-slate-400">{e.section || e.section_rattachement}</span>}
                {detail && <span className="ml-auto text-xs text-slate-500">{detail(e)}</span>}
              </button>))}
        </div>)}
    </div>
  );
}

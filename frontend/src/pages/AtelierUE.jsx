/**
 * UNE UNITÉ, TROIS FACES (Charles, 8 octobre 2026 : « il faut un onglet qui
 * reprend pondération, DUE et tableau de croisement »).
 *
 * Les trois parlent du même objet et se nourrissent l'une l'autre : le
 * descriptif écrit le programme par cours, le croisement relie ses points aux
 * acquis, et ce croisement propose la pondération et remplit le tableau des
 * critères. Les avoir dans trois entrées du rail obligeait à rechoisir la même
 * unité trois fois et à recoller de tête ce qui va ensemble.
 *
 * L'unité se choisit une fois, ici ; chaque face garde ses droits (la
 * pondération : la direction et le secrétariat ; le descriptif et le
 * croisement : ceux de la DUE).
 */
import { useEffect, useMemo, useState } from 'react';
import { IconPercentage, IconTable, IconFileDescription } from '@tabler/icons-react';
import { api } from '../lib/api.js';
import { Fiche } from './DUE.jsx';
import PonderationsUE from './PonderationsUE.jsx';
import CroisementUE from '../components/CroisementUE.jsx';

const FACES = [
  ['ponderation', 'Pondération', IconPercentage],
  ['croisement', 'Croisement acquis × programme', IconTable],
  ['descriptif', 'Descriptif (DUE)', IconFileDescription],
];
const MEMO = 'lucie.atelierUE';
const lireMemo = () => { try { return JSON.parse(localStorage.getItem(MEMO) || '{}'); } catch { return {}; } };
const ecrireMemo = v => { try { localStorage.setItem(MEMO, JSON.stringify(v)); } catch { /* sans mémoire */ } };

/* `faces` : celles qu'on ouvre ici — Mes cours n'ouvre pas la pondération, que
   l'enseignant ne règle pas. */
export default function AtelierUE({ faceInitiale = 'descriptif', faces = FACES.map(f => f[0]) }) {
  const ouvertes = FACES.filter(f => faces.includes(f[0]));
  const memo = lireMemo();
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState(memo.section || '');
  const [ue, setUe] = useState(memo.ue || null);
  const [face, setFace] = useState(ouvertes.some(f => f[0] === faceInitiale) ? faceInitiale : 'descriptif');
  const [numero, setNumero] = useState('');

  useEffect(() => {
    // La liste de la DUE : les unités que la personne a le droit de voir.
    api.dueListe().then(j => {
      setListe(j);
      const s = j.sections || [];
      setSection(x => (s.includes(x) ? x : (s.includes('TIM') ? 'TIM' : s[0] || '')));
    }).catch(e => setErreur(e.message));
  }, []);

  const ues = useMemo(() => (liste?.ues || []).filter(u => !section || u.section === section), [liste, section]);
  useEffect(() => {
    if (!liste) return;
    if (!ues.some(u => u.ue_num === ue)) setUe(ues[0]?.ue_num ?? null);
  }, [ues]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (section || ue) ecrireMemo({ section, ue }); }, [section, ue]);

  // Le n° d'unité tapé : on cherche dans toutes les sections permises.
  const allerA = n => {
    const t = (liste?.ues || []).filter(u => String(u.ue_num) === String(n).trim());
    if (t.length) { setSection(t[0].section); setUe(t[0].ue_num); setNumero(''); }
  };

  if (erreur) return <p className="p-4 text-[13px] text-red-700">{erreur}</p>;
  if (!liste) return <p className="p-4 text-[13px] text-slate-400">Chargement…</p>;
  if (!liste.ues.length) return <p className="p-4 text-[13px] text-slate-500">Aucune unité ne vous est ouverte cette année.</p>;
  const u = (liste.ues || []).find(x => x.ue_num === ue);

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold text-iip-blue mr-auto min-w-0 flex-1 truncate" title={u ? `UE ${u.ue_num} — ${u.ue_nom}` : ''}>
          {u ? <>UE {u.ue_num} — {u.ue_nom}</> : 'Unité'}
        </h2>
        {liste.sections.length > 1 && (
          <select className="controle" value={section} onChange={e => setSection(e.target.value)} aria-label="Section">
            {liste.sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>)}
        <select className="controle max-w-[18rem]" value={ue ?? ''} onChange={e => setUe(Number(e.target.value))} aria-label="Unité">
          {ues.map(x => <option key={x.ue_num} value={x.ue_num}>{x.ue_num} — {x.ue_nom}</option>)}
        </select>
        <input className="controle w-24" inputMode="numeric" placeholder="n° d'UE" value={numero} aria-label="Aller à l'unité n°"
          onChange={e => setNumero(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') allerA(numero); }} />
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {ouvertes.map(([k, l, I]) => (
          <button key={k} role="tab" aria-selected={face === k} onClick={() => setFace(k)}
            className={`onglet-page ${face === k ? 'onglet-page-actif' : ''} inline-flex items-center gap-1.5`}>
            <I size={14} /> {l}
          </button>))}
      </div>

      {ue && face === 'ponderation' && faces.includes('ponderation') && <PonderationsUE key={ue} ueFixe={ue} />}
      {ue && face === 'croisement' && <CroisementUE key={ue} ueNum={ue} />}
      {ue && face === 'descriptif' && <Fiche key={ue} ueNum={ue} integree />}
    </div>);
}

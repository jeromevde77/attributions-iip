import { useEffect, useMemo, useState } from 'react';
import {
  IconChevronRight, IconChevronLeft, IconSearch, IconDeviceFloppy,
  IconWand, IconAlertTriangle,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Composition déclarée d'une section : les UE qui constituent son programme,
 * choisies dans la base par double liste. Une UE peut appartenir à plusieurs
 * sections — le badge « aussi en … » le signale, sans jamais dupliquer l'UE.
 *
 * Composition (référentiel, ici) ≠ organisation (paramétrage annuel, dans le
 * planificateur et les dates des UE).
 */
export default function CompositionSection({ sectionCode, annee, estAdmin }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [selG, setSelG] = useState(new Set());   // sélection côté disponibles
  const [selD, setSelD] = useState(new Set());   // sélection côté composition
  const [composition, setComposition] = useState([]);   // état de travail
  const [enregistrement, setEnregistrement] = useState(false);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/composition/section/${encodeURIComponent(sectionCode)}?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || `Erreur ${rep.status}`); return; }
      setData(j);
      setComposition(j.composition.map(u => u.ue_num));
    } catch (e) { setErreur(String(e.message || e)); }
  }
  useEffect(() => { if (sectionCode && annee) charger(); /* eslint-disable-next-line */ }, [sectionCode, annee]);

  const toutes = useMemo(() => {
    if (!data) return new Map();
    return new Map([...data.composition, ...data.disponibles].map(u => [u.ue_num, u]));
  }, [data]);

  const dansCompo = new Set(composition);
  const f = recherche.toLowerCase();
  const correspond = u => !f || String(u.ue_num).includes(f)
    || (u.ue_nom || '').toLowerCase().includes(f);

  const disponibles = [...toutes.values()]
    .filter(u => !dansCompo.has(u.ue_num)).filter(correspond);
  const choisies = composition.map(n => toutes.get(n)).filter(Boolean);

  const modifie = useMemo(() => {
    const initiale = new Set((data?.composition || []).map(u => u.ue_num));
    if (initiale.size !== dansCompo.size) return true;
    return [...dansCompo].some(n => !initiale.has(n));
  }, [data, composition]);

  function basculer(set, setSet, n) {
    const s = new Set(set);
    s.has(n) ? s.delete(n) : s.add(n);
    setSet(s);
  }

  const ajouter = () => { setComposition(c => [...c, ...[...selG].filter(n => !c.includes(n))].sort((a, b) => a - b)); setSelG(new Set()); };
  const retirer = () => { setComposition(c => c.filter(n => !selD.has(n))); setSelD(new Set()); };

  async function enregistrer() {
    setEnregistrement(true);
    try {
      const rep = await fetch(`/api/composition/section/${encodeURIComponent(sectionCode)}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_nums: composition }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'échec' }); return; }
      setMessage({ type: 'ok', texte: `Composition enregistrée : ${j.nb_ue} UE.` });
      await charger();
    } finally { setEnregistrement(false); }
  }

  async function preremplir() {
    const rep = await fetch(
      `/api/composition/section/${encodeURIComponent(sectionCode)}/preremplir`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }),
      });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'échec' }); return; }
    setMessage({ type: 'ok', texte: `${j.ajoutees} UE ajoutée(s) depuis les attributions constatées.` });
    await charger();
  }

  if (erreur) return <div className="text-sm text-red-700 py-3">{erreur}</div>;
  if (!data) return <div className="text-sm text-slate-400 py-3">Chargement…</div>;

  const Ligne = ({ u, sel, onClick }) => (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 text-[12.5px]
        flex items-center justify-between gap-2 ${sel ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}>
      <span className="min-w-0">
        <b className="text-iip-blue">UE {u.ue_num}</b>
        <span className="text-slate-700"> — {u.ue_nom}</span>
      </span>
      <span className="flex items-center gap-1.5 flex-none text-[10.5px] text-slate-400">
        {u.ue_per_total ? `${u.ue_per_total} pér.` : ''}
        {u.autres_sections?.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold">
            aussi en {u.autres_sections.join(', ')}
          </span>
        )}
        {u.nb_organisations > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
            {u.nb_organisations} org.
          </span>
        )}
      </span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[12px] text-slate-500">
          Le programme déclaré de la section — distinct de ce qu'on organise une
          année donnée. Une UE partagée est rattachée, jamais dupliquée.
        </p>
        {estAdmin && (
          <div className="flex gap-2">
            <button onClick={preremplir}
              className="text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1.5">
              <IconWand size={14} /> Pré-remplir depuis les attributions
            </button>
            <button onClick={enregistrer} disabled={!modifie || enregistrement}
              className="text-[12px] px-2.5 py-1.5 rounded-lg bg-iip-blue text-white font-semibold flex items-center gap-1.5 disabled:opacity-40">
              <IconDeviceFloppy size={14} />
              {enregistrement ? 'Enregistrement…' : 'Enregistrer la composition'}
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-[12.5px] ${message.type === 'ok'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-red-50 text-red-800 border border-red-200'}`}
          onClick={() => setMessage(null)}>
          {message.texte}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
            UE disponibles ({disponibles.length})
          </div>
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-3">
            <IconSearch size={13} className="text-slate-400 flex-none" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="numéro ou intitulé…"
              className="w-full py-1.5 text-[12.5px] outline-none" />
          </div>
          <div className="max-h-72 overflow-auto">
            {disponibles.map(u => (
              <Ligne key={u.ue_num} u={u} sel={selG.has(u.ue_num)}
                     onClick={() => estAdmin && basculer(selG, setSelG, u.ue_num)} />
            ))}
            {!disponibles.length && (
              <div className="px-3 py-6 text-center text-[12px] text-slate-400">Aucune UE.</div>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-2">
          <button onClick={ajouter} disabled={!estAdmin || !selG.size}
            className="px-2 py-2 rounded-lg border border-slate-300 disabled:opacity-30">
            <IconChevronRight size={16} />
          </button>
          <button onClick={retirer} disabled={!estAdmin || !selD.size}
            className="px-2 py-2 rounded-lg border border-slate-300 disabled:opacity-30">
            <IconChevronLeft size={16} />
          </button>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
            Composition de {sectionCode} ({choisies.length} UE)
          </div>
          <div className="max-h-[19.5rem] overflow-auto">
            {choisies.map(u => (
              <Ligne key={u.ue_num} u={u} sel={selD.has(u.ue_num)}
                     onClick={() => estAdmin && basculer(selD, setSelD, u.ue_num)} />
            ))}
            {!choisies.length && (
              <div className="px-3 py-6 text-center text-[12px] text-slate-400">
                Aucune UE — sélectionnez à gauche puis ›
              </div>
            )}
          </div>
        </div>
      </div>

      {modifie && (
        <p className="text-[11.5px] text-amber-700 flex items-center gap-1.5">
          <IconAlertTriangle size={13} /> Modifications non enregistrées.
        </p>
      )}
    </div>
  );
}

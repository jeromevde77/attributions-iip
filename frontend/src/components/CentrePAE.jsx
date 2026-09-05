import { useEffect, useMemo, useState } from 'react';
import {
  IconX, IconCheck, IconAlertTriangle, IconSearch, IconSquare, IconSquareCheck,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Composition des programmes annuels en lot.
 *
 * Composer un PAE étudiant par étudiant est intenable sur une promotion
 * entière. On retient des étudiants dans la liste, on choisit les unités, et
 * on inscrit — ou on retire — pour tous d'un coup.
 *
 * Une simulation précède toujours l'écriture : inscrire deux cents étudiants
 * par erreur se répare mal.
 */
export default function CentrePAE({ annee, etudiants, onClose, onTermine }) {
  const [ues, setUes] = useState([]);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [choisies, setChoisies] = useState(new Set());
  const [recherche, setRecherche] = useState('');
  const [action, setAction] = useState('inscrire');
  const [rapport, setRapport] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (section) qs.set('section', section);
    fetch(`/api/ref/ue?${qs}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        if (!Array.isArray(l)) return;
        // Le niveau ordonne les unités : BA1 avant BA2, comme partout ailleurs.
        const rang = v => {
          const m = /^BA(\d+)$/.exec((v || '').toUpperCase());
          return m ? Number(m[1]) : 9;
        };
        setUes([...l].sort((a, b) =>
          rang(a.ue_niv) - rang(b.ue_niv) || a.ue_num - b.ue_num));
      }).catch(() => {});
    setChoisies(new Set());
    setRapport(null);
  }, [section]);

  const affichees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return ues;
    return ues.filter(u => `${u.ue_num} ${u.ue_nom || ''}`.toLowerCase().includes(q));
  }, [ues, recherche]);

  const toutes = affichees.length > 0 && affichees.every(u => choisies.has(u.ue_num));

  function basculer(n) {
    setChoisies(s => {
      const c = new Set(s);
      c.has(n) ? c.delete(n) : c.add(n);
      return c;
    });
    setRapport(null);
  }

  function cocherNiveau(niv) {
    setChoisies(s => {
      const c = new Set(s);
      const duNiveau = affichees.filter(u => (u.ue_niv || '') === niv);
      const toutes = duNiveau.every(u => c.has(u.ue_num));
      for (const u of duNiveau) toutes ? c.delete(u.ue_num) : c.add(u.ue_num);
      return c;
    });
    setRapport(null);
  }

  async function executer(simulation) {
    if (!choisies.size) { setErreur('Choisissez au moins une unité.'); return; }
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/pae-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, etudiants, ues: [...choisies], action, simulation,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setRapport(j);
      if (!simulation) onTermine && onTermine();
    } finally { setEnCours(false); }
  }

  const niveaux = [...new Set(ues.map(u => u.ue_niv).filter(Boolean))];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8 max-h-[88vh] overflow-hidden flex flex-col">

        <div className="flex-none p-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              Composition des PAE
            </h3>
            <p className="text-[12px] text-slate-500">
              {etudiants.length} étudiant(s) retenu(s) · année {annee}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {erreur && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                          text-[12.5px] text-red-800">{erreur}</div>
        )}

        <div className="flex gap-2 flex-wrap items-end">
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Section
            </span>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">Toutes</option>
              {sections.map(s => (
                <option key={s.code} value={s.code}>{s.libelle || s.code}</option>
              ))}
            </select>
          </label>

          <div className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Action
            </span>
            <div className="flex gap-1">
              {[['inscrire', 'Inscrire'], ['retirer', 'Retirer']].map(([v, l]) => (
                <button key={v} onClick={() => { setAction(v); setRapport(null); }}
                  className={`px-3 py-1.5 text-sm rounded-lg border font-semibold ${
                    action === v
                      ? (v === 'retirer'
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-iip-blue text-white border-iip-blue')
                      : 'border-slate-300 text-slate-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {niveaux.length > 0 && (
            <div className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Cocher un niveau
              </span>
              <div className="flex gap-1">
                {niveaux.map(n => (
                  <button key={n} onClick={() => cocherNiveau(n)}
                    className="px-2.5 py-1.5 text-[12px] border border-slate-300
                               text-slate-600 rounded-lg hover:bg-slate-50">
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-slate-50
                          border-b border-slate-200">
            <button onClick={() => setChoisies(s => {
              const c = new Set(s);
              for (const u of affichees) toutes ? c.delete(u.ue_num) : c.add(u.ue_num);
              return c;
            })}
              className="flex items-center gap-1.5 text-[12.5px] text-iip-blue font-semibold">
              {toutes ? <IconSquareCheck size={16} /> : <IconSquare size={16} />}
              {toutes ? 'Tout décocher' : 'Tout cocher'}
            </button>
            <span className="text-[12.5px] font-semibold text-iip-blue">
              {choisies.size} unité(s)
            </span>
            <div className="relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2
                                               text-slate-400" />
              <input value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Filtrer…"
                className="border border-slate-300 rounded-lg pl-8 pr-2 py-1 text-[12px] w-40" />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {!affichees.length ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400">
                Aucune unité pour cette section.
              </div>
            ) : affichees.map((u, i) => {
              const coche = choisies.has(u.ue_num);
              const nouveauNiveau = i > 0 && affichees[i - 1].ue_niv !== u.ue_niv;
              return (
                <label key={u.ue_num}
                  className={`flex items-center gap-3 px-3 py-1.5 cursor-pointer text-[12.5px]
                    ${coche ? 'bg-iip-blue/5' : 'hover:bg-slate-50'}
                    ${nouveauNiveau ? 'border-t-2 border-t-iip-blue/20' : ''}`}>
                  <input type="checkbox" checked={coche} onChange={() => basculer(u.ue_num)} />
                  <span className="w-12 flex-none font-mono text-[11px] text-slate-500">
                    {u.ue_num}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{u.ue_nom}</span>
                  <span className="text-[10px] text-slate-400 flex-none w-10 text-right">
                    {u.ue_niv || '—'}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <button onClick={() => executer(true)} disabled={enCours || !choisies.size}
          className="px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg
                     disabled:opacity-40">
          {enCours ? 'Analyse…' : 'Simuler'}
        </button>

        {rapport && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(action === 'inscrire'
                ? [['À inscrire', rapport.inscrits], ['Déjà inscrits', rapport.deja]]
                : [['À retirer', rapport.retires], ['Non inscrits', rapport.absents],
                   ['Protégés', rapport.nb_proteges]]
              ).map(([l, v]) => (
                <div key={l} className="border border-slate-200 rounded-xl px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500
                                  font-semibold">{l}</div>
                  <div className="text-[18px] font-bold text-iip-blue">{v}</div>
                </div>
              ))}
            </div>

            {rapport.nb_proteges > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                              text-[12px] text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <IconAlertTriangle size={14} /> {rapport.nb_proteges} inscription(s) conservée(s)
                </div>
                Un résultat y est encodé : le retirer effacerait une décision du Conseil
                des études. Passez par la fiche de l'étudiant si c'est bien voulu.
                <div className="mt-1 text-[11px]">
                  {rapport.proteges.slice(0, 6).map(p =>
                    `${p.etudiant} (UE ${p.ue_num})`).join(' · ')}
                  {rapport.nb_proteges > 6 && ` … et ${rapport.nb_proteges - 6} autre(s)`}
                </div>
              </div>
            )}

            {rapport.simulation ? (
              <button onClick={() => executer(false)}
                disabled={enCours
                  || !(action === 'inscrire' ? rapport.inscrits : rapport.retires)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold
                            rounded-lg text-white disabled:opacity-40 ${
                  action === 'retirer' ? 'bg-red-600' : 'bg-iip-blue'}`}>
                <IconCheck size={15} />
                {action === 'inscrire'
                  ? `Inscrire ${rapport.inscrits} fois`
                  : `Retirer ${rapport.retires} inscription(s)`}
              </button>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                              text-[12.5px] text-emerald-800">
                {action === 'inscrire'
                  ? `${rapport.inscrits} inscription(s) créée(s).`
                  : `${rapport.retires} inscription(s) retirée(s).`}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

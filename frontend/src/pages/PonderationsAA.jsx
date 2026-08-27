import { useEffect, useState } from 'react';
import { IconCheck, IconAlertTriangle, IconScale } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Pondération des acquis d'apprentissage.
 *
 * La note d'une UE se calcule depuis les AA : chacun pèse par sa pondération
 * dans son cours (somme 100 par cours) et par les périodes de ce cours au
 * dossier pédagogique. Cet écran encode la première de ces deux pondérations —
 * la seconde vient du référentiel des cours.
 */
export default function PonderationsAA() {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [ues, setUes] = useState([]);
  const [ueActive, setUeActive] = useState(null);
  const [structure, setStructure] = useState(null);
  const [brouillon, setBrouillon] = useState({});   // cours_code -> { aa_code: poids }
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => { if (Array.isArray(l)) { setSections(l); if (l.length) setSection(l[0].code); } })
      .catch(() => {});
  }, []);

  async function chargerUes() {
    if (!section) return;
    const rep = await fetch(`/api/acquis/sections/${encodeURIComponent(section)}/ues`,
      { headers: authHeaders() });
    setUes(rep.ok ? await rep.json() : []);
    setUeActive(null); setStructure(null);
  }
  useEffect(() => { chargerUes(); /* eslint-disable-next-line */ }, [section]);

  async function ouvrirUE(ueNum) {
    setUeActive(ueNum); setStructure(null);
    const rep = await fetch(`/api/acquis/ue/${ueNum}/structure`, { headers: authHeaders() });
    if (!rep.ok) return;
    const j = await rep.json();
    setStructure(j);
    const b = {};
    for (const co of j.cours) {
      b[co.cours_code] = {};
      for (const aa of co.aas) b[co.cours_code][aa.aa_code] = aa.poids ?? '';
    }
    setBrouillon(b);
  }

  function sommeDe(coursCode) {
    const vals = Object.values(brouillon[coursCode] || {});
    return Math.round(vals.reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
  }

  async function enregistrer(co) {
    const ponderations = Object.entries(brouillon[co.cours_code] || {})
      .map(([aa_code, poids]) => ({ aa_code, poids: Number(poids) || 0 }));
    const rep = await fetch('/api/acquis/ponderations', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ ue_num: ueActive, cours_code: co.cours_code, ponderations }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setMessage({ type: 'ok', texte: `Pondérations du cours ${co.cours_code} enregistrées.` });
    await ouvrirUE(ueActive); await chargerUes();
  }

  async function repartir(co) {
    const rep = await fetch('/api/acquis/ponderations/repartir', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ ue_num: ueActive, cours_code: co.cours_code }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    await ouvrirUE(ueActive); await chargerUes();
  }

  return (
    <div className="p-5 space-y-4 max-w-6xl">
      <div>
        <h2 className="text-xl font-semibold text-iip-blue">Pondération des acquis d'apprentissage</h2>
        <p className="text-sm text-slate-500">
          La note d'une UE se calcule depuis ses acquis. Chacun pèse par sa pondération dans son
          cours et par les périodes de ce cours, autonomie exclue.
        </p>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      <select value={section} onChange={e => setSection(e.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
        {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
      </select>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Liste des UE */}
        <div className="border border-slate-200 rounded-xl overflow-hidden self-start">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Unités d'enseignement
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {!ues.length ? (
              <div className="px-3 py-6 text-[12px] text-slate-400 text-center">Aucune UE.</div>
            ) : ues.map(u => (
              <button key={u.ue_num} onClick={() => ouvrirUE(u.ue_num)}
                className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${
                  ueActive === u.ue_num ? 'bg-iip-turquoise/5' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-iip-blue text-[12.5px]">{u.ue_num}</span>
                  <span className="text-[12px] text-slate-600 truncate flex-1">{u.ue_nom}</span>
                  {u.nb_aa === 0 ? (
                    <span className="text-[9.5px] text-slate-400 flex-none">sans AA</span>
                  ) : u.pret ? (
                    <IconCheck size={14} className="text-emerald-600 flex-none" />
                  ) : (
                    <IconAlertTriangle size={14} className="text-amber-500 flex-none" />
                  )}
                </div>
                <div className="text-[10.5px] text-slate-400">
                  {u.nb_cours} cours · {u.nb_aa} acquis
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Détail de l'UE */}
        <div className="md:col-span-2">
          {!ueActive ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl py-16 text-center text-slate-400 text-sm">
              Choisissez une unité d'enseignement.
            </div>
          ) : !structure ? (
            <div className="text-sm text-slate-400 py-6">Chargement…</div>
          ) : (
            <div className="space-y-3">
              {/* Poids de chaque cours dans l'UE — déduits des périodes */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-iip-blue">
                  <span className="text-[12.5px] font-semibold text-white">
                    Poids des cours dans l'UE {ueActive}
                  </span>
                  <span className="text-[10.5px] text-blue-200">déduits des périodes</span>
                </div>
                <div className="p-3 flex flex-wrap gap-3">
                  {structure.cours.map(co => (
                    <div key={co.cours_code}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10.5px] text-slate-500 truncate max-w-[160px]" title={co.cours_nom}>
                        {co.cours_code}
                      </div>
                      <div className="text-[13px] font-bold text-iip-blue">
                        {co.poids_cours_affiche != null ? co.poids_cours_affiche + ' %' : '—'}
                        <span className="text-[10px] font-normal text-slate-400 ml-1.5">
                          {co.periodes} pér.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="px-3 pb-2 text-[10.5px] text-slate-400">
                  Poids = périodes du cours ÷ périodes de l'UE, autonomie exclue. Affiché arrondi
                  à l'unité ; le calcul conserve les décimales. Si un poids manque, ce sont les
                  périodes du référentiel des cours qu'il faut compléter.
                </p>
              </div>

              {structure.cours.map(co => {
                const somme = sommeDe(co.cours_code);
                const ok = Math.abs(somme - 100) < 0.01;
                return (
                  <div key={co.cours_code} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                      <IconScale size={14} className="text-slate-400 flex-none" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold text-iip-blue truncate">
                          {co.cours_code} · {co.cours_nom}
                        </div>
                        <div className="text-[10.5px] text-slate-500">
                          {co.periodes} périodes · poids dans l'UE :{' '}
                          {co.poids_cours_affiche != null
                            ? <b className="text-slate-600">{co.poids_cours_affiche} %</b>
                            : <span className="text-amber-600">périodes manquantes</span>}
                        </div>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border flex-none ${
                        ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                           : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {somme} / 100
                      </span>
                    </div>

                    {!co.aas.length ? (
                      <div className="px-3 py-3 text-[12px] text-slate-400">
                        Aucun acquis rattaché à ce cours au référentiel.
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-slate-100">
                          {co.aas.map(aa => (
                            <div key={aa.aa_code} className="flex items-center gap-2 px-3 py-1.5">
                              <div className="flex-1 text-[11.5px] text-slate-600 truncate"
                                title={aa.description || aa.aa_code}>
                                <b className="text-slate-500">{aa.aa_code}</b> {aa.description || ''}
                              </div>
                              <input type="number" min="0" max="100" step="0.5"
                                value={brouillon[co.cours_code]?.[aa.aa_code] ?? ''}
                                onChange={e => setBrouillon(b => ({
                                  ...b,
                                  [co.cours_code]: { ...b[co.cours_code], [aa.aa_code]: e.target.value },
                                }))}
                                className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-[12px] text-right" />
                              <span className="text-[11px] text-slate-400 w-4">%</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-end gap-2 px-3 py-2 bg-slate-50 border-t border-slate-200">
                          <button onClick={() => repartir(co)}
                            className="text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-white">
                            Répartir également
                          </button>
                          <button onClick={() => enregistrer(co)} disabled={!ok}
                            className="text-[11.5px] px-3 py-1 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40"
                            title={ok ? '' : 'La somme doit valoir exactement 100'}>
                            Enregistrer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              <p className="text-[11px] text-slate-400 border-t pt-3">
                Un même acquis peut figurer dans plusieurs cours : il y porte une pondération
                propre et y est coté séparément. Le poids du cours, lui, vient de ses périodes
                au dossier pédagogique et ne se saisit pas ici.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconDeviceFloppy, IconCalculator } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';

/**
 * Répartition des périodes entre les deux années civiles d'une année académique.
 *
 * La dotation est civile, l'enseignement académique : le document 2 réclame,
 * par activité d'enseignement, les périodes prévues (colonnes 16 et 17) et les
 * périodes réellement organisées (18 et 19), réparties entre les deux années.
 *
 * La clé 40-60 sert de proposition. La part déduite des dates réelles est
 * affichée à côté : c'est l'écart entre les deux qui appelle l'ajustement, une
 * UE du premier quadrimestre devant porter 100 % sur la première année civile,
 * hormis les quelques périodes d'examen de janvier.
 */
const nb = n => (n == null || n === '' ? '—'
  : Number(n).toLocaleString('fr-BE', { maximumFractionDigits: 1 }));

export default function RepartitionPeriodes() {
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [data, setData] = useState(null);
  const [modifs, setModifs] = useState({});
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [civile, setCivile] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => { if (Array.isArray(l)) setAnnees(l.map(a => a.code || a).filter(Boolean)); })
      .catch(() => {});
  }, []);

  async function charger() {
    if (!annee) return;
    setData(null);
    const qs = new URLSearchParams({ annee, ...(section ? { section } : {}) });
    const rep = await fetch(`/api/repartition?${qs}`, { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : { ues: [], anomalies: [] });
    setModifs({});
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, section]);

  // Dotation de l'année civile : janvier-juin de l'année académique précédente
  // ajoutés à septembre-décembre de l'année en cours.
  useEffect(() => {
    if (!data?.annees_civiles) return;
    const a1 = data.annees_civiles[0];
    fetch(`/api/repartition/annee-civile/${a1}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null).then(setCivile).catch(() => {});
  }, [data]);

  const cle = (u, l) => `${u.ue_num}|${u.num_organisation || 1}|${l.cours_code || ''}|${l.nature}`;
  const val = (u, l, champ) => {
    const m = modifs[cle(u, l)];
    return m && m[champ] !== undefined ? m[champ] : l[champ];
  };

  function editer(u, l, champ, valeur) {
    const k = cle(u, l);
    setModifs(m => {
      const ligne = { ...(m[k] || {}), [champ]: valeur === '' ? null : Number(valeur) };
      // Le complément se déduit : ce qui n'est pas sur une année civile est
      // sur l'autre, tant que l'utilisateur ne le contredit pas.
      const total = champ.startsWith('prevu') ? l.prevu_total : l.reel_total;
      const autre = champ.endsWith('c1') ? champ.replace('c1', 'c2') : champ.replace('c2', 'c1');
      if (total && (m[k] || {})[autre] === undefined) {
        ligne[autre] = Math.round((total - (Number(valeur) || 0)) * 100) / 100;
      }
      return { ...m, [k]: ligne };
    });
  }

  // Applique la part déduite des dates à toute une organisation
  function appliquerDates(u) {
    if (u.part_dates == null) return;
    setModifs(m => {
      const copie = { ...m };
      for (const l of u.lignes) {
        const k = cle(u, l);
        const p1 = Math.round((l.prevu_total || 0) * u.part_dates * 100) / 100;
        const r1 = Math.round((l.reel_total || 0) * u.part_dates * 100) / 100;
        copie[k] = {
          ...(copie[k] || {}),
          prevu_c1: p1, prevu_c2: Math.round(((l.prevu_total || 0) - p1) * 100) / 100,
          reel_c1: r1, reel_c2: Math.round(((l.reel_total || 0) - r1) * 100) / 100,
        };
      }
      return copie;
    });
  }

  async function enregistrer() {
    const lignes = [];
    for (const u of (data?.ues || [])) {
      for (const l of u.lignes) {
        const m = modifs[cle(u, l)];
        if (!m) continue;
        lignes.push({
          ue_num: u.ue_num, num_organisation: u.num_organisation || 1,
          cours_code: l.cours_code, nature: l.nature,
          prevu_c1: val(u, l, 'prevu_c1'), prevu_c2: val(u, l, 'prevu_c2'),
          reel_c1: val(u, l, 'reel_c1'), reel_c2: val(u, l, 'reel_c2'),
        });
      }
    }
    if (!lignes.length) { setMessage({ type: 'ok', texte: 'Rien à enregistrer.' }); return; }
    setEnCours(true);
    try {
      const rep = await fetch('/api/repartition', {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee, lignes }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setMessage({ type: 'ok', texte: `${j.enregistrees} ligne(s) enregistrée(s).` });
      await charger();
    } finally { setEnCours(false); }
  }

  const nbModifs = Object.keys(modifs).length;
  const [a1, a2] = data?.annees_civiles || [];

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Répartition des périodes</h2>
          <p className="text-sm text-slate-500">
            Colonnes 16 à 19 du document 2, par activité d'enseignement.
          </p>
        </div>
        <button onClick={enregistrer} disabled={!nbModifs || enCours}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg disabled:opacity-40">
          <IconDeviceFloppy size={16} />
          {enCours ? 'Enregistrement…' : nbModifs ? `Enregistrer (${nbModifs})` : 'Enregistrer'}
        </button>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <select value={annee} onChange={e => setAnnee(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-iip-blue">
          {(annees.length ? annees : [annee]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
      </div>

      {/* Ce que la Fédération intègrera en avril */}
      {civile && (
        <div className="border border-iip-blue/30 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-iip-blue text-white text-[12.5px] font-semibold">
            Dotation de l'année civile {civile.annee_civile}
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Janvier – juin {civile.annee_civile}
              </div>
              <div className="text-[18px] font-bold text-iip-blue">{nb(civile.janvier_juin.periodes)} pér.</div>
              <div className="text-[10.5px] text-slate-500">
                année académique {civile.janvier_juin.annee_scolaire}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Septembre – décembre {civile.annee_civile}
              </div>
              <div className="text-[18px] font-bold text-iip-blue">{nb(civile.septembre_decembre.periodes)} pér.</div>
              <div className="text-[10.5px] text-slate-500">
                année académique {civile.septembre_decembre.annee_scolaire}
              </div>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Dotation organique
              </div>
              <div className="text-[22px] font-bold text-iip-turquoise">{nb(civile.total)} pér.</div>
              <div className="text-[10.5px] text-slate-500">
                intégré par la Fédération en avril
              </div>
            </div>
          </div>

          {/* Enveloppes fermées : elles ne se confondent pas avec l'organique,
              et leur dépassement retombe sur lui. */}
          {civile.enveloppes?.length > 0 && (
            <div className="px-4 pb-3 -mt-1">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
                Enveloppes fermées — financées à part
              </div>
              <div className="flex flex-wrap gap-2">
                {civile.enveloppes.map(e => (
                  <div key={e.code}
                    className={`px-3 py-1.5 rounded-lg border text-[11.5px] ${e.depasse
                      ? 'bg-red-50 border-red-300 text-red-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    <b>{e.label}</b> · {nb(e.consomme)} pér.
                    {e.illimite ? <span className="text-slate-400"> · sans plafond</span>
                      : e.disponible != null && (
                        <span> / {nb(e.disponible)}
                          {e.depasse
                            ? <b> — dépassement de {nb(-e.solde)}</b>
                            : <span className="text-slate-500"> · solde {nb(e.solde)}</span>}
                        </span>
                      )}
                  </div>
                ))}
              </div>
              {civile.avertissement && (
                <div className="mt-2 text-[11.5px] text-red-800 flex items-center gap-1.5">
                  <IconAlertTriangle size={14} /> {civile.avertissement}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {data?.anomalies?.length > 0 && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-900 mb-1.5">
            <IconAlertTriangle size={15} /> {data.anomalies.length} contrôle(s) à examiner
          </div>
          <ul className="text-[11.5px] text-amber-900 space-y-0.5">
            {data.anomalies.slice(0, 10).map((a, i) => (
              <li key={i}><b>UE {a.ue_num}</b> · {a.cours} — {a.message}</li>
            ))}
            {data.anomalies.length > 10 && <li>… et {data.anomalies.length - 10} autre(s)</li>}
          </ul>
        </div>
      )}

      {!data ? (
        <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>
      ) : !data.ues.length ? (
        <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          Aucune organisation d'UE pour {annee}.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left min-w-[240px]">Activité d'enseignement</th>
                <th className="px-2 py-2 text-center w-32">Dates</th>
                <th className="px-2 py-2 text-right w-20">Dossier</th>
                <th className="px-2 py-2 text-right w-20">Attribué</th>
                <th className="px-2 py-2 text-center w-20 border-l border-slate-200">Prévu {a1}</th>
                <th className="px-2 py-2 text-center w-20">Prévu {a2}</th>
                <th className="px-2 py-2 text-center w-20 border-l border-slate-200 bg-iip-blue/5">Réel {a1}</th>
                <th className="px-2 py-2 text-center w-20 bg-iip-blue/5">Réel {a2}</th>
              </tr>
            </thead>
            <tbody>
              {data.ues.map(u => (
                <UeBloc key={`${u.ue_num}-${u.num_organisation}`} u={u}
                  val={val} editer={editer} modifs={modifs} cle={cle}
                  onAppliquerDates={() => appliquerDates(u)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        La clé 40-60 est proposée par défaut ; la part déduite des dates réelles figure en regard
        de chaque UE, et le bouton l'applique d'un coup. Une unité du premier quadrimestre appelle
        ainsi 100 % sur la première année civile — à corriger de quelques périodes si l'examen
        tombe en janvier, l'unité restant alors ouverte.
      </p>
    </div>
  );
}

function UeBloc({ u, val, editer, cle, modifs, onAppliquerDates }) {
  const fr = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
  const champ = (l, nom, teinte) => {
    const modifie = modifs[cle(u, l)]?.[nom] !== undefined;
    return (
      <td className={`px-1 py-1 text-center ${teinte || ''}`}>
        <input type="number" step="0.5" min="0"
          value={val(u, l, nom) ?? ''}
          onChange={e => editer(u, l, nom, e.target.value)}
          className={`w-16 border rounded px-1 py-0.5 text-[12px] text-right
            ${modifie ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`} />
      </td>
    );
  };

  return (
    <>
      <tr className="bg-slate-50/80 border-y border-slate-200">
        <td className="px-3 py-1.5 text-[12px] font-semibold text-iip-blue" colSpan={2}>
          UE {u.ue_num}{u.num_organisation > 1 ? ` · org. ${u.num_organisation}` : ''} — {u.ue_nom}
          <span className="ml-2 text-[10.5px] font-normal text-slate-500">
            {fr(u.date_debut)} → {fr(u.date_fin)}
          </span>
          {u.pot && u.pot !== 'organique' && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800"
              title="Cette UE est financée par une enveloppe fermée, non par la dotation organique.">
              {u.pot}
            </span>
          )}
          {u.periodes_helb > 0 && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600"
              title="Ces périodes relèvent de la HELB : elles ne se décomptent pas de votre dotation et n'entrent pas dans la répartition.">
              {u.periodes_helb} pér. HELB, hors dotation
            </span>
          )}
          {u.part_dates != null && (
            <button onClick={onAppliquerDates}
              title="Répartir selon les dates réelles de l'organisation"
              className="ml-2 inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border border-iip-turquoise text-iip-turquoise hover:bg-iip-turquoise/10">
              <IconCalculator size={11} /> dates : {Math.round(u.part_dates * 100)} %
            </button>
          )}
        </td>
        <td className="px-2 py-1.5 text-right text-[11.5px] text-slate-500">{u.totaux.prevu_total}</td>
        <td className="px-2 py-1.5 text-right text-[11.5px] text-slate-500">{u.totaux.reel_total}</td>
        <td className="px-2 py-1.5 text-center text-[11.5px] font-semibold border-l border-slate-200">{u.totaux.prevu_c1}</td>
        <td className="px-2 py-1.5 text-center text-[11.5px] font-semibold">{u.totaux.prevu_c2}</td>
        <td className="px-2 py-1.5 text-center text-[11.5px] font-semibold border-l border-slate-200">{u.totaux.reel_c1}</td>
        <td className="px-2 py-1.5 text-center text-[11.5px] font-semibold">{u.totaux.reel_c2}</td>
      </tr>

      {u.lignes.map(l => (
        <tr key={`${l.cours_code || l.nature}`} className="border-b border-slate-100 hover:bg-slate-50/50">
          <td className="px-3 py-1 pl-6 text-[12px] text-slate-700">
            {l.nature === 'autonomie' ? (
              <span className="italic text-violet-700">Autonomie
                <span className="ml-1.5 text-[9.5px] not-italic text-violet-500">hors cas généraux</span>
              </span>
            ) : (
              <>
                <b className="text-slate-500">{l.cours_code}</b> {l.libelle}
                {l.type_cours && <span className="ml-1.5 text-[9.5px] text-slate-400">{l.type_cours}</span>}
              </>
            )}
          </td>
          <td></td>
          <td className="px-2 py-1 text-right text-[11.5px] text-slate-500">{l.prevu_total || '—'}</td>
          <td className="px-2 py-1 text-right text-[11.5px] text-slate-600">{l.reel_total || '—'}</td>
          {champ(l, 'prevu_c1', 'border-l border-slate-200')}
          {champ(l, 'prevu_c2')}
          {champ(l, 'reel_c1', 'border-l border-slate-200 bg-iip-blue/5')}
          {champ(l, 'reel_c2', 'bg-iip-blue/5')}
        </tr>
      ))}
    </>
  );
}

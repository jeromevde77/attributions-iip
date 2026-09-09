import { useEffect, useState } from 'react';
import {
  IconUsers, IconAlertTriangle, IconArrowMerge, IconRefresh, IconCheck,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LES DOSSIERS DÉDOUBLÉS.
 *
 * Le matricule change d'une année à l'autre : Nejla BEN TOUMI est 24-00239 en
 * 2024-2025 et 25-00158 en 2025-2026. L'import ne la reconnaissait pas et
 * créait un second dossier — cent cinquante-deux fois sur la seule section TIM,
 * tous les revenants.
 *
 * Deux dossiers, c'est un parcours coupé en deux : la valorisation d'une unité
 * acquise l'an dernier ne se voit plus, et une attestation peut être délivrée
 * sur la moitié de ce qui a été réussi. Cet écran répare.
 *
 * RIEN NE SE FUSIONNE TOUT SEUL. Deux vrais homonymes existent : le lot ne
 * prend que les groupes dont les dates de naissance ne se contredisent pas, et
 * les autres se traitent à la main, après avoir regardé ce que chaque dossier
 * porte.
 */
export default function DoublonsEtudiants() {
  const [data, setData] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState('');

  const charger = async () => {
    setEnCours(true); setErreur('');
    try {
      const rep = await fetch('/api/doublons-etudiants', { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'lecture impossible');
      setData(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  useEffect(() => { charger(); }, []);

  const lot = async (simulation) => {
    setEnCours(true); setErreur(''); setFait('');
    try {
      const rep = await fetch('/api/doublons-etudiants/fusionner-lot', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulation }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'fusion impossible');
      if (simulation) setApercu(j);
      else {
        setApercu(null);
        setFait(`${j.fusions} dossier(s) fusionné(s).`);
        await charger();
      }
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const fusionnerUn = async (garder, absorber) => {
    setEnCours(true); setErreur(''); setFait('');
    try {
      const rep = await fetch('/api/doublons-etudiants/fusionner', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ garder, absorber }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'fusion impossible');
      setFait(`Dossier #${absorber} absorbé par #${garder}.`);
      await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  return (
    <div className="space-y-4">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold text-iip-blue flex items-center gap-1.5">
              <IconUsers size={16} /> Dossiers dédoublés
            </div>
            <p className="text-[12px] text-slate-600 mt-1 max-w-3xl">
              Le matricule change d'une année à l'autre : le même étudiant importé
              sur deux années s'est retrouvé avec deux dossiers. Son parcours est
              alors coupé en deux — une unité acquise l'an dernier ne se valorise
              plus, et un relevé ne montre que la moitié de ce qui a été réussi.
              La fusion réunit tout : matricules, inscriptions, notes, décisions,
              motivations et ajustements.
            </p>
          </div>
          <button onClick={charger} disabled={enCours}
            className="flex-none px-2.5 py-1.5 text-[12px] rounded-lg border border-slate-300
                       text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
            <IconRefresh size={14} /> Relire
          </button>
        </div>
      </div>

      {erreur && (
        <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                        text-[12px] text-rose-900">{erreur}</div>
      )}
      {fait && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200
                        text-[12px] text-emerald-900 flex items-center gap-1.5">
          <IconCheck size={14} /> {fait}
        </div>
      )}

      {data && (
        <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200
                        flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[12.5px] text-slate-700">
            <b>{data.total}</b> groupe(s) de dossiers portant le même nom, soit{' '}
            <b>{data.dossiers}</b> dossiers — dont <b>{data.surs}</b> sans
            contradiction de date de naissance.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => lot(true)} disabled={enCours || !data.surs}
              className="px-3 py-1.5 text-[12px] rounded-lg border border-iip-blue
                         text-iip-blue font-semibold disabled:opacity-40">
              Simuler la fusion des {data.surs} groupes sûrs
            </button>
          </div>
        </div>
      )}

      {/* LA SIMULATION D'ABORD. Une fusion ne se défait pas : on montre ce qui
          sera déplacé avant de l'écrire. */}
      {apercu && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
          <div className="text-[13px] font-semibold text-amber-900">
            Simulation — {apercu.fusions} fusion(s), rien n'a été écrit
          </div>
          {!!apercu.nb_ecartes && (
            <div className="text-[11.5px] text-amber-900">
              <b>{apercu.nb_ecartes} groupe(s) écarté(s)</b>, à traiter à la main :
              <ul className="list-disc ml-5 mt-0.5">
                {apercu.ecartes.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto text-[11.5px] text-amber-900
                          divide-y divide-amber-200">
            {(apercu.detail || []).map((d, i) => (
              <div key={i} className="py-1">
                <b>{d.cle}</b> — on garde #{d.garde} ({d.annee_gardee || 'sans année'}),
                on absorbe #{d.absorbe} ({d.annee_absorbee || 'sans année'})
                {d.inscriptions ? ` · ${d.inscriptions} inscription(s)` : ''}
                {Object.entries(d.deplaces || {}).filter(([, n]) => n)
                  .map(([t, n]) => ` · ${t} ${n}`).join('')}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => lot(false)} disabled={enCours}
              className="px-3 py-2 text-[12.5px] rounded-lg bg-amber-600 text-white
                         font-semibold flex items-center gap-1.5 disabled:opacity-40">
              <IconArrowMerge size={15} /> Appliquer les {apercu.fusions} fusions
            </button>
            <button onClick={() => setApercu(null)} disabled={enCours}
              className="px-3 py-2 text-[12.5px] rounded-lg border border-amber-500
                         text-amber-900">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(data?.groupes || []).map(g => (
          <div key={g.cle} className={`px-3 py-2.5 rounded-xl border
            ${g.sur ? 'bg-white border-slate-200' : 'bg-rose-50/60 border-rose-200'}`}>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-iip-blue">{g.cle}</span>
              {!g.sur && (
                <span className="text-[11px] text-rose-800 flex items-center gap-1">
                  <IconAlertTriangle size={13} />
                  dates de naissance différentes ({g.naissances.join(' / ')}) —
                  peut-être deux personnes
                </span>
              )}
            </div>
            <div className="mt-1.5 grid gap-1.5 md:grid-cols-2">
              {g.dossiers.map(d => (
                <div key={d.id} className="px-2.5 py-2 rounded-lg bg-slate-50
                                           border border-slate-200 text-[11.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-700">
                      #{d.id} · {d.matricules.join(' / ') || 'sans matricule'}
                    </span>
                    {g.dossiers.length > 1 && (
                      <span className="flex gap-1">
                        {g.dossiers.filter(o => o.id !== d.id).map(o => (
                          <button key={o.id} disabled={enCours}
                            onClick={() => fusionnerUn(d.id, o.id)}
                            title={`Garder #${d.id} et y verser tout le contenu de #${o.id}`}
                            className="px-1.5 py-0.5 rounded border border-iip-blue
                                       text-iip-blue font-semibold disabled:opacity-40">
                            ← absorber #{o.id}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    {d.annees.length
                      ? d.annees.map(a => `${a.annee} (${a.unites} UE)`).join(' · ')
                      : 'aucune inscription'}
                  </div>
                  <div className="text-slate-500">
                    {d.decisions} décision(s) · {d.notes} note(s)
                    {d.date_naissance ? ` · né(e) le ${d.date_naissance}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {data && !data.total && (
          <div className="px-4 py-6 text-center text-[12.5px] text-slate-500">
            Aucun dossier dédoublé. Rien à réparer.
          </div>
        )}
      </div>
    </div>
  );
}

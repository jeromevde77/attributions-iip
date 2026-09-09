import { useEffect, useRef, useState } from 'react';
import {
  IconUpload, IconRefresh, IconAlertTriangle, IconCheck, IconTrash,
  IconCalendarEvent, IconUsers,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * L'HORAIRE FACE AUX ATTRIBUTIONS.
 *
 * L'horaire n'est pas fait ici : les coordinations le bâtissent dans
 * Hyperplanning, à partir des attributions. Personne ne vérifie ensuite qu'il
 * dépense bien ce qui a été accordé. Un cours à qui l'on a donné quarante
 * périodes peut n'en recevoir que seize à l'horaire ; un cours peut être donné
 * par un autre que son titulaire. Cela se découvre en fin d'année, quand la
 * charge ne tombe pas juste.
 *
 * Lucie compare — elle ne crée pas encore l'horaire. C'est la première marche :
 * avant de prétendre remplacer un logiciel d'horaire, il faut savoir lire le
 * sien et dire où il s'écarte.
 */

const VERDICTS = {
  concordant: { l: 'Concordant', c: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    pastille: 'bg-emerald-500' },
  professeur: { l: 'Autre professeur', c: 'bg-amber-50 border-amber-300 text-amber-900',
    pastille: 'bg-amber-500' },
  heures: { l: 'Charge non dépensée', c: 'bg-orange-50 border-orange-300 text-orange-900',
    pastille: 'bg-orange-500' },
  hors_attribution: { l: 'Hors attribution', c: 'bg-rose-50 border-rose-300 text-rose-900',
    pastille: 'bg-rose-500' },
};

const h1 = n => `${Number(n ?? 0).toFixed(1).replace('.', ',')} h`;

export default function HoraireComparateur({ annee }) {
  const [lots, setLots] = useState([]);
  const [comp, setComp] = useState(null);
  const [classe, setClasse] = useState('');
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const fichierRef = useRef(null);
  const choisi = useRef(null);

  const charger = async () => {
    if (!annee) return;
    setEnCours(true); setErreur('');
    try {
      const p = new URLSearchParams({ annee });
      if (classe) p.set('classe', classe);
      const [rl, rc] = await Promise.all([
        fetch(`/api/horaire/lots?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() }),
        fetch(`/api/horaire/comparaison?${p}`, { headers: authHeaders() }),
      ]);
      setLots(rl.ok ? await rl.json() : []);
      const j = await rc.json();
      if (!rc.ok) throw new Error(j.error || 'comparaison impossible');
      setComp(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, classe]);

  const envoyer = async (fichier, simulation) => {
    setEnCours(true); setErreur('');
    try {
      const fd = new FormData();
      fd.append('fichier', fichier);
      fd.append('annee', annee);
      fd.append('simulation', String(simulation));
      const rep = await fetch('/api/horaire/import',
        { method: 'POST', headers: authHeaders(), body: fd });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'import impossible');
      if (simulation) { choisi.current = fichier; setApercu(j); }
      else { setApercu(null); choisi.current = null; await charger(); }
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const supprimer = async (id) => {
    setEnCours(true);
    try {
      await fetch(`/api/horaire/lot/${id}`, { method: 'DELETE', headers: authHeaders() });
      await charger();
    } finally { setEnCours(false); }
  };

  const classes = [...new Set(lots.map(l => l.classe).filter(Boolean))];

  return (
    <div className="p-4 space-y-4">
      <div className="px-4 py-3 rounded-xl bg-white border border-slate-200">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="max-w-3xl">
            <div className="text-[14px] font-semibold text-iip-blue flex items-center gap-1.5">
              <IconCalendarEvent size={16} /> L'horaire face aux attributions
            </div>
            <p className="text-[12px] text-slate-600 mt-1">
              L'horaire est bâti par les coordinations, à partir des attributions.
              Lucie le relit et dit où il s'en écarte : un cours donné par un autre
              que son titulaire, une charge accordée mais non posée, un cours à
              l'horaire sans attribution — et l'inverse, qu'on ne regarde jamais :
              une attribution sans une seule séance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fichierRef} type="file" accept=".pdf" className="hidden"
              onChange={e => e.target.files?.[0] && envoyer(e.target.files[0], true)} />
            <button onClick={() => fichierRef.current?.click()} disabled={enCours || !annee}
              className="px-3 py-1.5 text-[12.5px] rounded-lg bg-iip-blue text-white
                         font-semibold flex items-center gap-1.5 disabled:opacity-40">
              <IconUpload size={15} /> Lire un emploi du temps
            </button>
            <button onClick={charger} disabled={enCours}
              className="px-2.5 py-1.5 text-[12px] rounded-lg border border-slate-300
                         text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
              <IconRefresh size={14} /> Relire
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Le PDF attendu est l'export « Emploi du temps » d'Index Éducation :
          une ligne par séance, colonnes jour / classe / cours / professeur / local.
        </p>
      </div>

      {erreur && (
        <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                        text-[12px] text-rose-900">{erreur}</div>
      )}

      {/* LA SIMULATION D'ABORD : ce qui sera lu, avant que rien ne soit écrit. */}
      {apercu && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
          <div className="text-[13px] font-semibold text-amber-900">
            {apercu.classe || 'Classe non reconnue'} — {apercu.seances} séance(s),
            {' '}{h1(apercu.heures)}, du {apercu.periode?.debut} au {apercu.periode?.fin}
          </div>
          <div className="text-[11.5px] text-amber-900 space-y-0.5">
            <div>{apercu.rapproches} séance(s) rattachée(s) à un professeur de Lucie.</div>
            {!!apercu.sans_code && (
              <div>{apercu.sans_code} séance(s) sans code de cours — elles seront gardées
                telles quelles, sans être rapprochées.</div>
            )}
            {!!apercu.cours_inconnus?.length && (
              <div><b>Cours inconnus en {annee} :</b> {apercu.cours_inconnus.join(', ')} —
                vérifiez l'année de travail.</div>
            )}
            {!!apercu.profs_inconnus?.length && (
              <div><b>Professeurs non reconnus :</b> {apercu.profs_inconnus.join(' · ')}</div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => choisi.current && envoyer(choisi.current, false)}
              disabled={enCours}
              className="px-3 py-2 text-[12.5px] rounded-lg bg-amber-600 text-white
                         font-semibold disabled:opacity-40">
              Enregistrer cet horaire
            </button>
            <button onClick={() => { setApercu(null); choisi.current = null; }}
              className="px-3 py-2 text-[12.5px] rounded-lg border border-amber-500
                         text-amber-900">Annuler</button>
          </div>
          <p className="text-[11px] text-amber-800">
            Enregistrer remplace l'horaire déjà connu pour cette classe et cette
            année : un horaire se corrige, deux versions superposées ne comparent plus rien.
          </p>
        </div>
      )}

      {!!lots.length && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-slate-500">Classe :</span>
          <button onClick={() => setClasse('')}
            className={`px-2.5 py-1 text-[12px] rounded-lg border ${!classe
              ? 'bg-iip-blue text-white border-iip-blue font-semibold'
              : 'border-slate-300 text-slate-600'}`}>Toutes</button>
          {classes.map(c => (
            <button key={c} onClick={() => setClasse(c)}
              className={`px-2.5 py-1 text-[12px] rounded-lg border ${classe === c
                ? 'bg-iip-blue text-white border-iip-blue font-semibold'
                : 'border-slate-300 text-slate-600'}`}>{c}</button>
          ))}
          <span className="flex-1" />
          {lots.map(l => (
            <span key={l.id} className="text-[11px] text-slate-500 flex items-center gap-1">
              {l.classe} · {l.nb_seances} séances · {l.periode_debut} → {l.periode_fin}
              <button onClick={() => supprimer(l.id)} disabled={enCours}
                title="Retirer cet horaire" className="text-slate-400 hover:text-rose-600">
                <IconTrash size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {comp && !comp.lignes.length && !comp.sans_seance.length && (
        <div className="px-4 py-8 text-center text-[12.5px] text-slate-500">
          Aucun horaire lu pour {annee}. Chargez l'export d'une classe pour commencer.
        </div>
      )}

      {comp && !!(comp.lignes.length || comp.sans_seance.length) && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ['Séances lues', comp.total.seances],
              ['Heures posées', h1(comp.total.heures_horaire)],
              ['Cours concordants', comp.total.concordants],
              ['À regarder', comp.total.ecarts + comp.total.sans_seance],
            ].map(([l, v], i) => (
              <div key={l} className={`px-3 py-2 rounded-xl border ${i === 3
                && (comp.total.ecarts + comp.total.sans_seance)
                ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                <div className="text-[11px] text-slate-500">{l}</div>
                <div className="text-[17px] font-bold text-iip-blue tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-left">
                  <th className="px-3 py-2 font-semibold">Cours</th>
                  <th className="px-2 py-2 font-semibold text-right">Séances</th>
                  <th className="px-2 py-2 font-semibold text-right">À l'horaire</th>
                  <th className="px-2 py-2 font-semibold text-right">Attribué</th>
                  <th className="px-2 py-2 font-semibold text-right">Écart</th>
                  <th className="px-3 py-2 font-semibold">Qui le donne</th>
                  <th className="px-3 py-2 font-semibold">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comp.lignes.map(l => {
                  const v = VERDICTS[l.verdict] || VERDICTS.concordant;
                  return (
                    <tr key={l.cours_code}>
                      <td className="px-3 py-1.5">
                        <span className="font-mono font-bold text-slate-700">{l.cours_code}</span>
                        {l.cours_nom && (
                          <span className="text-slate-500"> · {l.cours_nom}</span>
                        )}
                        {l.ue_num ? (
                          <span className="text-slate-400"> — UE {l.ue_num}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{l.seances}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{h1(l.heures_horaire)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                        {h1(l.heures_attribuees)}
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                        Math.abs(l.ecart) > 2 ? 'text-rose-700' : 'text-slate-400'}`}>
                        {l.ecart > 0 ? '+' : ''}{h1(l.ecart)}
                      </td>
                      <td className="px-3 py-1.5">
                        {l.profs_horaire.map((p, i) => (
                          <span key={i} className={p.attribue ? '' : 'text-amber-800 font-semibold'}>
                            {i ? ' · ' : ''}{p.nom || '—'}
                            {p.attribue ? '' : ' ⚠'}
                          </span>
                        ))}
                        {!!l.profs_attribues.length && !l.profs_horaire.every(p => p.attribue) && (
                          <div className="text-[10.5px] text-slate-500">
                            attribué à {l.profs_attribues.map(p => p.nom || 'À désigner').join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5
                                          rounded-lg border text-[11px] font-semibold ${v.c}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${v.pastille}`} />
                          {v.l}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* LA MOITIÉ QU'ON NE REGARDE JAMAIS : ce qui est payé et jamais posé. */}
          {!!comp.sans_seance.length && (
            <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-[13px] font-semibold text-rose-900 flex items-center gap-1.5">
                <IconAlertTriangle size={15} />
                {comp.sans_seance.length} cours attribué(s) sans une seule séance à l'horaire
              </div>
              <div className="mt-1 text-[11.5px] text-rose-900 space-y-0.5">
                {comp.sans_seance.map(x => (
                  <div key={x.cours_code}>
                    <span className="font-mono font-bold">{x.cours_code}</span>
                    {x.cours_nom ? ` · ${x.cours_nom}` : ''} — {h1(x.heures_attribuees)} —
                    {' '}{x.profs.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!!comp.collisions.professeur.length || !!comp.collisions.local.length) && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300">
              <div className="text-[13px] font-semibold text-amber-900 flex items-center gap-1.5">
                <IconUsers size={15} /> Chevauchements
              </div>
              <div className="mt-1 text-[11.5px] text-amber-900 space-y-0.5">
                {comp.collisions.professeur.map((x, i) => (
                  <div key={`p${i}`}>Professeur : {x}</div>
                ))}
                {comp.collisions.local.map((x, i) => <div key={`l${i}`}>Local : {x}</div>)}
              </div>
            </div>
          )}

          {(!!comp.profs_non_rapproches.length || !!comp.sans_code.length) && (
            <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200
                            text-[11.5px] text-slate-600 space-y-1">
              {!!comp.profs_non_rapproches.length && (
                <div>
                  <b>Professeurs de l'horaire absents de Lucie :</b>{' '}
                  {comp.profs_non_rapproches.join(' · ')} — leurs séances sont lues,
                  mais ne se comparent à aucune attribution.
                </div>
              )}
              {!!comp.sans_code.length && (
                <div>
                  <b>{comp.sans_code.length} séance(s) sans code de cours</b> (matière à
                  préciser, séance d'information) : gardées, non comparées.
                </div>
              )}
            </div>
          )}

          {!comp.total.ecarts && !comp.total.sans_seance && (
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200
                            text-[12px] text-emerald-900 flex items-center gap-1.5">
              <IconCheck size={15} /> L'horaire dépense exactement ce que les
              attributions ont accordé, et par les bonnes personnes.
            </div>
          )}
        </>
      )}
    </div>
  );
}

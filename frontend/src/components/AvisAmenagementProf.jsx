import { useCallback, useEffect, useState } from 'react';
import { IconAccessible } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LES AMÉNAGEMENTS RAISONNABLES QUI ATTENDENT L'AVIS DU CHARGÉ DE COURS, dans
 * Mes cours (Charles, 2 octobre 2026). Quand le rapport (volet B) est validé,
 * il voit les mesures demandées pour l'étudiant, dans ses unités, et dit pour
 * chacune : réalisable, avec adaptation, pas réalisable — motivé dès que ce
 * n'est pas « réalisable ». Il ne voit que les mesures (secret professionnel,
 * art. 5). Tant que le Conseil n'a pas décidé, il corrige ; ensuite il relit.
 */
const SENS = [['realisable', 'Réalisable', 'var(--c-reussi, #3E7D5E)'], ['adaptation', 'Avec adaptation', 'var(--c-attente, #B45309)'],
  ['impossible', 'Pas réalisable', 'var(--c-refuse, #9D4A38)']];
const LIB = Object.fromEntries(SENS.map(([k, l, c]) => [k, [l, c]]));
const date = t => (t ? String(t).slice(0, 10).split('-').reverse().join('/') : '');

export default function AvisAmenagementProf({ annee }) {
  const [d, setD] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [saisie, setSaisie] = useState({});   // mesure_id → { sens, motif }
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    const r = await fetch(`/api/mes-cours/amenagements?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    setD(r.ok ? j.dossiers || [] : []);
  }, [annee]);
  useEffect(() => { charger(); }, [charger]);
  if (!d || !d.length) return null;

  const aRendre = d.filter(x => !x.decide && x.mesures.some(m => !m.mon_avis)).length;
  const ouvrir = x => {
    setOuvert(ouvert === x.id ? null : x.id); setErreur(null);
    setSaisie(Object.fromEntries(x.mesures.map(m => [m.id, { sens: m.mon_avis?.sens || '', motif: m.mon_avis?.motif || '' }])));
  };
  const manque = x => x.mesures.find(m => !saisie[m.id]?.sens) ? 'Donnez un avis pour chaque mesure.'
    : x.mesures.find(m => saisie[m.id].sens !== 'realisable' && String(saisie[m.id].motif || '').trim().length < 5)
      ? 'Motivez les avis « avec adaptation » ou « pas réalisable ».' : null;
  const rendre = async x => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/mes-cours/amenagements/${x.id}/avis`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ avis: x.mesures.map(m => ({ mesure_id: m.id, ...saisie[m.id] })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Avis refusé.');
      setOuvert(null); await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  return (
    <div className="bloc-etat etat-neutre rounded-l-none rounded-r-carte"
      style={{ borderLeftColor: aRendre ? 'var(--c-attente, #B45309)' : 'var(--c-reussi, #3E7D5E)' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <IconAccessible size={16} className="text-slate-500" />
        <span className="text-base font-semibold">Aménagements raisonnables</span>
        <span className="text-second text-slate-500">
          {aRendre ? `${aRendre} demande${aRendre > 1 ? 's' : ''} attend${aRendre > 1 ? 'ent' : ''} votre avis` : 'tous vos avis sont rendus'}
          {' · '}mesure par mesure — seules les mesures vous sont montrées</span>
      </div>
      {erreur && <div className="px-3 py-1.5 text-second" style={{ color: 'var(--c-refuse, #9D4A38)' }}>{erreur}</div>}
      <div className="divide-y divide-slate-100">
        {d.map(x => {
          const rendu = x.mesures.every(m => m.mon_avis);
          return (
            <div key={x.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{x.etudiant}</b><span className="text-xs text-slate-500 tabular-nums">{x.id_ecampus}</span>
                <span className="text-second text-slate-500">UE {x.ues.join(', ')} · {x.mesures.length} mesure(s)</span>
                <span className="ml-auto text-second">
                  {x.decide ? <span className="text-slate-500">décidé</span>
                    : rendu ? <span className="font-semibold" style={{ color: 'var(--c-reussi, #3E7D5E)' }}>✓ avis rendu</span>
                      : <span className="font-semibold" style={{ color: 'var(--c-attente, #B45309)' }}>avis à rendre · depuis le {date(x.appele_le)}</span>}
                </span>
                <button type="button" className="bouton text-second px-2.5 py-1" onClick={() => ouvrir(x)}>
                  {ouvert === x.id ? 'Refermer' : x.decide ? 'Relire' : rendu ? 'Corriger mon avis' : 'Rendre mon avis'}</button>
              </div>
              {ouvert === x.id && (
                <div className="mt-2 space-y-2">
                  {x.mesures.map(m => {
                    const s = saisie[m.id] || {};
                    return (
                      <div key={m.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] border-b border-slate-100 pb-2">
                        <div>
                          <b>{m.libelle}</b>{m.precisions && <div className="text-second text-slate-500">{m.precisions}</div>}
                          {m.autres.map((a, k) => (
                            <div key={k} className="text-xs mt-0.5">
                              <span className="inline-block text-mention font-semibold text-white rounded-full px-1.5 mr-1" style={{ background: LIB[a.sens]?.[1] }}>{LIB[a.sens]?.[0]}</span>
                              {a.auteur}{a.motif ? ` — ${a.motif}` : ''}
                            </div>
                          ))}
                          {x.decide && m.accorde != null && <div className="text-xs mt-0.5 text-slate-500">Décision : {m.accorde ? 'accordée' : 'refusée'}</div>}
                        </div>
                        <div>
                          {x.decide ? (
                            m.mon_avis ? <span className="text-second"><span className="inline-block text-xs font-semibold text-white rounded-full px-2 mr-1" style={{ background: LIB[m.mon_avis.sens]?.[1] }}>{LIB[m.mon_avis.sens]?.[0]}</span>{m.mon_avis.motif}</span>
                              : <span className="text-second text-slate-500">pas d'avis rendu</span>
                          ) : (
                            <>
                              <div className="inline-flex border border-slate-300 rounded-champ overflow-hidden">
                                {SENS.map(([v, l, col]) => (
                                  <button key={v} type="button" onClick={() => setSaisie(o => ({ ...o, [m.id]: { ...s, sens: v } }))}
                                    className="px-2.5 py-1 text-second font-semibold border-r border-slate-200 last:border-r-0"
                                    style={s.sens === v ? { background: col, color: '#fff' } : { color: '#475569' }}>{l}</button>
                                ))}
                              </div>
                              {s.sens && s.sens !== 'realisable' && (
                                <textarea rows={2} value={s.motif || ''} onChange={e => setSaisie(o => ({ ...o, [m.id]: { ...s, motif: e.target.value } }))}
                                  placeholder={s.sens === 'adaptation' ? 'Quelle adaptation, et pourquoi ?' : 'Pourquoi n’est-ce pas réalisable ? Que proposez-vous à la place ?'}
                                  className="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-second" />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!x.decide && (
                    <div className="flex items-center gap-2">
                      <button type="button" className="bouton bouton-fort disabled:opacity-40" disabled={enCours || !!manque(x)} onClick={() => rendre(x)}>
                        {rendu ? 'Enregistrer la correction' : 'Rendre mon avis'}</button>
                      <span className="text-second text-slate-500 min-w-0">{manque(x) || 'Il portera votre nom, avec la date du jour.'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { IconCertificate, IconFileText } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LES DEMANDES DE VALORISATION QUI ATTENDENT L'AVIS DU CHARGÉ DE COURS, dans
 * Mes cours (Charles, 2 octobre 2026 : « que la demande soit visible pour lui
 * dans son espace, qu'il puisse consulter les documents et rendre un avis,
 * motivé — obligatoire »).
 *
 * Il voit les demandes recevables qui visent SES cours, ouvre les pièces
 * déposées, et rend SON avis : le sens et la motivation. Tous les chargés de
 * cours de l'UE peuvent en rendre un ; il voit ceux des autres. Tant que le
 * Conseil n'a pas décidé, il corrige le sien ; ensuite, il le relit.
 */
const SENS = [['favorable', 'Favorable'], ['partiel', 'Partiel'], ['defavorable', 'Défavorable']];
const TEINTE = { favorable: 'var(--c-reussi, #3E7D5E)', partiel: 'var(--c-va-partielle, #D9822B)', defavorable: 'var(--c-va-refusee, #B83A4B)' };
const LIB = { favorable: 'favorable', partiel: 'partiel', defavorable: 'défavorable' };
const date = t => (t ? String(t).slice(0, 10).split('-').reverse().join('/') : '');

export default function AvisValorisationProf({ annee }) {
  const [d, setD] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [saisie, setSaisie] = useState({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    const r = await fetch(`/api/mes-cours/valorisations?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    setD(r.ok ? j.dossiers || [] : []);
  }, [annee]);
  useEffect(() => { charger(); }, [charger]);

  if (!d || !d.length) return null;
  const aRendre = d.filter(x => !x.mon_avis && !x.decision_le).length;

  const ouvrirPiece = async f => {
    const r = await fetch(`/api/mes-cours/valorisations/fichiers/${f.id}`, { headers: authHeaders() });
    if (!r.ok) { setErreur('Pièce introuvable.'); return; }
    const url = URL.createObjectURL(await r.blob());
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const rendre = async x => {
    const s = saisie[x.id] || {};
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/mes-cours/valorisations/${x.id}/avis`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ sens: s.sens, texte: s.texte }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Avis refusé.');
      setOuvert(null); await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  return (
    <div className="bg-white border border-slate-200 border-l-[4px] rounded-l-none rounded-r-carte"
      style={{ borderLeftColor: aRendre ? 'var(--c-attente, #B45309)' : 'var(--c-reussi, #3E7D5E)' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <IconCertificate size={16} className="text-slate-500" />
        <span className="text-[15px] font-semibold">Avis de valorisation</span>
        <span className="text-[12px] text-slate-500">
          {aRendre ? `${aRendre} demande${aRendre > 1 ? 's' : ''} attend${aRendre > 1 ? 'ent' : ''} votre avis` : 'tous vos avis sont rendus'}
          {' · '}un avis écrit et motivé, attendu dans les 10 jours ouvrables</span>
      </div>
      {erreur && <div className="px-3 py-1.5 text-[12px]" style={{ color: TEINTE.defavorable }}>{erreur}</div>}
      <div className="divide-y divide-slate-100">
        {d.map(x => {
          const s = saisie[x.id] || { sens: x.mon_avis?.sens || '', texte: x.mon_avis?.texte || '' };
          const fige = !!x.decision_le;
          const autres = [...x.autres_avis, ...(x.avis_dossier ? [x.avis_dossier] : [])];
          return (
            <div key={x.id} className="px-3 py-2 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <b>{x.etudiant}</b><span className="text-[11px] text-slate-500 tabular-nums">{x.id_ecampus}</span>
                <span>UE {x.ue_num}{x.ue_nom ? ` — ${x.ue_nom}` : ''}</span>
                {x.porte && <span className="text-[10.5px] font-bold text-slate-500 border border-slate-300 rounded px-1">{x.porte}</span>}
                {x.cours_demandes.length > 0 && <span className="text-[12px] text-slate-500">cours demandés : {x.cours_demandes.join(', ')}</span>}
                <span className="ml-auto text-[12px]">
                  {x.mon_avis
                    ? <span className="inline-block text-[11px] font-semibold text-white rounded-full px-2" style={{ background: TEINTE[x.mon_avis.sens] }}>votre avis : {LIB[x.mon_avis.sens]} · {date(x.mon_avis.rendu_le)}</span>
                    : fige ? <span className="text-slate-500">décidé le {date(x.decision_le)}</span>
                      : <span className="font-semibold" style={{ color: 'var(--c-attente, #B45309)' }}>avis à rendre · recevable le {date(x.recevable_le)}</span>}
                </span>
                <button type="button" className="bouton text-[12px] px-2.5 py-1"
                  onClick={() => { setOuvert(ouvert === x.id ? null : x.id); setSaisie(v => ({ ...v, [x.id]: s })); setErreur(null); }}>
                  {ouvert === x.id ? 'Refermer' : fige ? 'Relire' : x.mon_avis ? 'Corriger mon avis' : 'Rendre mon avis'}</button>
              </div>
              {ouvert === x.id && (
                <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Pièces déposées</div>
                    {!x.fichiers.length ? <div className="text-[12px] text-slate-500">Aucune pièce déposée.</div>
                      : x.fichiers.map(f => (
                        <button key={f.id} type="button" onClick={() => ouvrirPiece(f)}
                          className="flex items-center gap-1.5 text-[12.5px] text-iip-blue underline mb-1 text-left">
                          <IconFileText size={14} className="flex-none text-slate-400" />{f.nom}</button>
                      ))}
                    {autres.length > 0 && (
                      <>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-3 mb-1">Les autres avis</div>
                        {autres.map((a, k) => (
                          <div key={k} className="text-[12px] mb-1.5">
                            <span className="inline-block text-[11px] font-semibold text-white rounded-full px-2 mr-1" style={{ background: TEINTE[a.sens] || '#94A3B8' }}>{LIB[a.sens] || a.sens}</span>
                            <b>{a.auteur || '—'}</b> · {date(a.rendu_le)} — {a.texte}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Votre avis</div>
                    {fige ? (
                      <div className="text-[12.5px]">{x.mon_avis ? x.mon_avis.texte : 'Vous n’avez pas rendu d’avis sur cette demande.'}
                        <div className="text-[11px] text-slate-500 mt-1">Le Conseil a décidé : l’avis ne se modifie plus.</div></div>
                    ) : (
                      <>
                        <div className="inline-flex border border-slate-300 rounded-champ overflow-hidden mb-2">
                          {SENS.map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setSaisie(o => ({ ...o, [x.id]: { ...s, sens: v } }))}
                              className="px-3 py-1 text-[12.5px] font-semibold border-r border-slate-200 last:border-r-0"
                              style={s.sens === v ? { background: TEINTE[v], color: '#fff' } : { color: '#475569' }}>{l}</button>
                          ))}
                        </div>
                        <textarea rows={4} value={s.texte} onChange={e => setSaisie(o => ({ ...o, [x.id]: { ...s, texte: e.target.value } }))}
                          placeholder="Ce que vous avez comparé au dossier pédagogique (contenus, volume horaire, niveau, résultats), et ce que vous en concluez — pour les cours que vous portez."
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-[13px]" />
                        <div className="flex items-center gap-2 mt-1">
                          <button type="button" className="bouton bouton-fort disabled:opacity-40"
                            disabled={enCours || !s.sens || String(s.texte || '').trim().length < 15} onClick={() => rendre(x)}>
                            {x.mon_avis ? 'Enregistrer la correction' : 'Rendre mon avis'}</button>
                          <span className="text-[12px] text-slate-500 min-w-0">
                            {!s.sens ? 'Choisissez le sens de l’avis.' : String(s.texte || '').trim().length < 15 ? 'L’avis se motive par écrit : il n’y a pas de recours ensuite.' : 'Il portera votre nom, avec la date du jour.'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

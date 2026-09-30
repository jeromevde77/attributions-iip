/**
 * LE REGISTRE DES ENVOIS (Charles, 30 septembre 2026 : « il faut assurer une
 * traçabilité de tout cela : savoir ce qui a été envoyé, quand et par qui.
 * Depuis l'éditeur ou la délibération »).
 *
 * Tous les courriels de Lucie passent par une seule route ; ils se lisent donc
 * ici, d'où qu'ils partent. Un LOT par ligne — quand, qui, quoi, combien —, qui
 * se déplie destinataire par destinataire. Chaque envoi garde depuis le 30
 * septembre 2026 ce qu'il contenait (unités, session, pièces) et une COPIE du
 * document, refaite à l'identique (même signature filigranée, même référence).
 * Les envois plus anciens disent à qui et quand, pas quoi : on l'écrit.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { TuileEtat } from './ui.jsx';

const quand = d => {
  if (!d) return '—';
  const x = new Date(String(d).replace(' ', 'T') + 'Z');
  return x.toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const STATUT = { envoye: ['envoyé', 'reussi'], simule: ['simulé', 'disponible'], echec: ['échec', 'corriger'] };
const ilYa = j => new Date(Date.now() - j * 864e5).toISOString().slice(0, 10);

export default function RegistreEnvois() {
  const [du, setDu] = useState(ilYa(30));
  const [au, setAu] = useState(new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState('');
  const [par, setPar] = useState('');
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [copieEnCours, setCopieEnCours] = useState(null);

  useEffect(() => {
    let vivant = true;
    setLignes(null); setErreur(null);
    const p = new URLSearchParams({ limite: '2000', du, au });
    if (q.trim()) p.set('q', q.trim());
    const t = setTimeout(() => {
      fetch(`/api/envois/journal?${p}`, { headers: authHeaders() })
        .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
        .then(j => vivant && setLignes(j))
        .catch(e => vivant && setErreur(e.message));
    }, q ? 300 : 0);
    return () => { vivant = false; clearTimeout(t); };
  }, [du, au, q]);

  const expediteurs = useMemo(() => [...new Set((lignes || []).map(l => l.envoye_par).filter(Boolean))].sort(), [lignes]);
  const lots = useMemo(() => {
    const m = new Map();
    for (const l of (lignes || [])) {
      if (par && l.envoye_par !== par) continue;
      const k = l.lot || `seul-${l.id}`;
      if (!m.has(k)) m.set(k, { cle: k, lignes: [] });
      m.get(k).lignes.push(l);
    }
    return [...m.values()].map(g => {
      const ls = g.lignes;
      const contenus = [...new Set(ls.map(l => l.contenu).filter(Boolean))];
      return { ...g, le: ls[ls.length - 1].envoye_le, par: ls[0].envoye_par, sujet: ls[0].sujet,
        type: ls[0].type_doc, contenus, n: ls.length,
        ok: ls.filter(l => l.statut === 'envoye').length, echecs: ls.filter(l => l.statut === 'echec').length,
        simules: ls.filter(l => l.statut === 'simule').length, copies: ls.filter(l => l.copie).length };
    });
  }, [lignes, par]);

  const total = lots.reduce((n, g) => n + g.n, 0);
  const echecs = lots.reduce((n, g) => n + g.echecs, 0);
  const sansCopie = lots.reduce((n, g) => n + (g.n - g.copies), 0);

  const ouvrirCopie = async l => {
    setCopieEnCours(l.id); setErreur(null);
    const fen = window.open('', '_blank');
    try {
      const r = await fetch(`/api/envois/${l.id}/copie`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erreur ${r.status}`); }
      const url = URL.createObjectURL(await r.blob());
      if (fen) fen.location.href = url; else window.location.href = url;
    } catch (e) { if (fen) fen.close(); setErreur(e.message); } finally { setCopieEnCours(null); }
  };

  return (
    <div className="space-y-3 text-[13px]">
      <div>
        <div className="text-[15px] font-semibold text-iip-blue">Registre des envois</div>
        <p className="text-slate-500 text-[12px]">
          Tout courriel parti de Lucie — délibération, éditions, aperçus, diplomation, aménagements : quand, par qui, à
          qui, et ce qu'il contenait. Depuis le 30 septembre 2026, chaque envoi garde aussi une copie du document, refaite
          à l'identique (même signature, même référence). Les envois antérieurs disent à qui et quand, pas quoi.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-slate-500">Du <input type="date" className="controle ml-1" value={du} onChange={e => setDu(e.target.value)} /></label>
        <label className="text-[12px] text-slate-500">au <input type="date" className="controle ml-1" value={au} onChange={e => setAu(e.target.value)} /></label>
        <select className="controle" value={par} onChange={e => setPar(e.target.value)} aria-label="Envoyé par">
          <option value="">Tous les expéditeurs</option>
          {expediteurs.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <input className="controle w-64" placeholder="Nom, sujet, contenu, référence…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
      {!lignes ? <p className="text-slate-400">Chargement…</p> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl">
            <TuileEtat etat="neutre" valeur={lots.length} libelle="Envois (lots)" />
            <TuileEtat etat="neutre" valeur={total} libelle="Courriels" />
            <TuileEtat etat={echecs ? 'corriger' : 'neutre'} valeur={echecs} libelle="En échec" />
            <TuileEtat etat="neutre" valeur={sansCopie} libelle="Sans copie" precision="antérieurs au 30/09/2026" />
          </div>
          {!lots.length && <p className="text-slate-500">Aucun envoi sur cette période.</p>}
          {!!lots.length && (
            <div className="border border-slate-200 rounded-carte overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="tab-entete"><tr className="text-left text-[11px] text-slate-500">
                  <th className="px-2 py-1.5">Quand</th><th className="px-2 py-1.5">Par</th>
                  <th className="px-2 py-1.5">Quoi</th><th className="px-2 py-1.5 text-right">Courriels</th></tr></thead>
                <tbody>
                  {lots.map(g => (
                    <Fragment key={g.cle}>
                      <tr className="border-t border-slate-100 bg-white align-top cursor-pointer hover:bg-slate-50"
                        onClick={() => setOuvert(o => (o === g.cle ? null : g.cle))}>
                        <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{quand(g.le)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{g.par || '—'}</td>
                        <td className="px-2 py-1.5">
                          <b>{g.sujet}</b>
                          <span className="block text-slate-500">{g.contenus.length === 1 ? g.contenus[0]
                            : g.contenus.length ? `${g.contenus.length} contenus différents — dépliez`
                              : <i>contenu non consigné (envoi antérieur au 30/09/2026)</i>}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                          {g.n}{g.echecs ? <span className="ml-1.5 pastille-etat" data-etat="corriger">{g.echecs} échec(s)</span> : ''}
                          {g.simules ? <span className="ml-1.5 text-slate-400">{g.simules} simulé(s)</span> : ''}
                        </td>
                      </tr>
                      {ouvert === g.cle && g.lignes.map(l => (
                        <tr key={l.id} className="bg-white border-t border-slate-50 align-top">
                          <td className="pl-6 pr-2 py-1 text-slate-400 tabular-nums whitespace-nowrap">{quand(l.envoye_le)}</td>
                          <td className="px-2 py-1 whitespace-nowrap"><b>{l.destinataire_nom}</b>
                            <span className="block text-slate-400">{l.email}</span></td>
                          <td className="px-2 py-1 text-slate-600">{l.contenu || <i className="text-slate-400">—</i>}
                            <span className="block text-[11px] text-slate-400">{l.nom_fichier || (l.mode === 'corps' ? 'dans le corps du courriel' : '')}
                              {l.reference ? ` · réf. ${l.reference}` : ''}{l.erreur ? ` · ${l.erreur}` : ''}</span></td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            <span className="pastille-etat" data-etat={(STATUT[l.statut] || [l.statut, 'neutre'])[1]}>{(STATUT[l.statut] || [l.statut])[0]}</span>
                            {l.copie ? <button className="bouton ml-1.5" disabled={copieEnCours === l.id} onClick={() => ouvrirCopie(l)}>{copieEnCours === l.id ? '…' : 'Copie'}</button> : null}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

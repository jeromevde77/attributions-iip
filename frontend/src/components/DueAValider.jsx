/* LES DUE À VALIDER (3.5.657, Charles, 22 novembre 2026 : « je veux valider » — Loubna ROUGUI avait soumis quatorze DUE de
   Psychomotricité). Une seule fenêtre pour la direction : les DUE soumises par leur rédacteur, pas encore validées ; pour chacune,
   le croisement et des pondérations conformes ou non (la règle de l'atelier de l'unité, `etats`), un aperçu de la DUE, et
   « Fixer et valider » — les pondérations sont fixées par la direction, puis la DUE est validée et gelée. Les routes de toujours :
   POST /api/due/:ue/ponderations-fixees, POST /api/due/:ue/valider. */
import { useCallback, useEffect, useState } from 'react';
import { IconFileDescription, IconLock } from '@tabler/icons-react';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr, TableauVide, PastilleEtat, Encadre } from './ui.jsx';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';
import { etats } from '../pages/AtelierUE.jsx';
import { Fiche } from '../pages/DUE.jsx';

const date = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const post = async (url) => {
  const r = await fetch(url, { method: 'POST', headers: authHeaders(), body: '{}' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
};

export default function DueAValider() {
  const [dues, setDues] = useState(null);
  const [suivi, setSuivi] = useState({});      // ue → { croisement, ponderation }
  const [coches, setCoches] = useState(new Set());
  const [apercu, setApercu] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState(null);
  const charger = useCallback(async () => {
    const r = await fetch('/api/due/a-valider', { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ etat: 'corriger', texte: j.error || 'Liste indisponible.' }); setDues([]); return; }
    setDues(j.dues || []);
    // L'état de chaque unité, comme dans l'atelier : quatre à la fois.
    const l = [...(j.dues || [])]; const res = {};
    const ouvrier = async () => {
      while (l.length) {
        const d = l.shift();
        const [due, liens] = await Promise.all([
          api.dueLire(d.ue_num).catch(() => null),
          fetch(`/api/acquis/ue/${d.ue_num}/liens?annee=${encodeURIComponent(getAnnee())}`, { headers: authHeaders() })
            .then(x => (x.ok ? x.json() : null)).catch(() => null)]);
        res[d.ue_num] = etats(due, liens);
        setSuivi(s => ({ ...s, [d.ue_num]: res[d.ue_num] }));
      }
    };
    await Promise.all([ouvrier(), ouvrier(), ouvrier(), ouvrier()]);
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const pondOk = ue => ['fait', 'neutre'].includes(suivi[ue]?.ponderation?.etat);
  const basculer = ue => setCoches(c => { const n = new Set(c); n.has(ue) ? n.delete(ue) : n.add(ue); return n; });
  const valider = async (liste) => {
    const nonConformes = liste.filter(ue => !pondOk(ue));
    if (nonConformes.length && !(await demander(`Les pondérations de ${nonConformes.length > 1 ? 'ces unités' : 'l’unité'} ${nonConformes.join(', ')} ne sont pas conformes au croisement. Les fixer telles quelles et valider quand même ?`))) return;
    setEnCours(true); setMsg(null);
    const ok = [], ko = [];
    for (const ue of liste) {
      try {
        const d = dues.find(x => x.ue_num === ue);
        if (!d?.ponderation_fixee_le) await post(`/api/due/${ue}/ponderations-fixees`);
        await post(`/api/due/${ue}/valider`);
        ok.push(ue);
      } catch (e) { ko.push(`UE ${ue} : ${e.message}`); }
    }
    setEnCours(false); setCoches(new Set());
    setMsg(ko.length ? { etat: 'corriger', texte: `${ok.length} validée(s). Refusé : ${ko.join(' ; ')}` }
      : { etat: 'reussi', texte: `${ok.length} DUE validée${ok.length > 1 ? 's' : ''} : pondérations fixées et gelées.` });
    charger();
  };

  if (apercu) {
    return (
      <Fenetre titre={`DUE de l’UE ${apercu}`} large="pleine" hauteurFixe onFermer={() => { setApercu(null); charger(); }}>
        <Fiche ueNum={apercu} onRetour={() => { setApercu(null); charger(); }} integree />
      </Fenetre>);
  }
  const toutes = (dues || []).map(d => d.ue_num);
  return (
    <div className="space-y-3">
      <p className="text-second text-slate-500 m-0">Les DUE soumises par leur rédacteur et pas encore validées. « Fixer et valider » fixe les pondérations au nom de la direction, puis valide la DUE : elle passe en lecture seule pour ses titulaires, pondérations comprises. « Rouvrir » reste possible depuis la DUE.</p>
      {msg && <Encadre etat={msg.etat}>{msg.texte}</Encadre>}
      <div className="carte overflow-hidden">
        <Tableau className="!border-0 !rounded-none">
          <TableauEntete>
            <Th><input type="checkbox" aria-label="Tout cocher" checked={toutes.length > 0 && coches.size === toutes.length}
              onChange={e => setCoches(e.target.checked ? new Set(toutes) : new Set())} /></Th>
            <Th>Unité</Th><Th>Section</Th><Th>Soumise</Th><Th>Croisement</Th><Th>Pondérations</Th><Th align="droite">Actions</Th>
          </TableauEntete>
          <tbody>
            {!dues && <TableauVide colonnes={7}>Chargement…</TableauVide>}
            {dues && !dues.length && <TableauVide colonnes={7}>Aucune DUE n’attend la validation.</TableauVide>}
            {(dues || []).map(d => {
              const s = suivi[d.ue_num];
              const cr = s?.croisement; const po = s?.ponderation;
              const ton = e => (e === 'fait' || e === 'neutre' ? 'reussi' : e === 'en_cours' ? 'surveiller' : 'corriger');
              return (
                <Tr key={d.ue_num} actif={coches.has(d.ue_num)}>
                  <Td><input type="checkbox" checked={coches.has(d.ue_num)} onChange={() => basculer(d.ue_num)} aria-label={`Cocher l’UE ${d.ue_num}`} /></Td>
                  <Td><b>UE {d.ue_num}</b> — {d.ue_nom}</Td>
                  <Td ton="secondaire">{d.section || '—'}</Td>
                  <Td ton="secondaire">{date(d.soumis_le)}{d.soumis_par ? ` · ${d.soumis_par}` : ''}</Td>
                  <Td>{cr ? <PastilleEtat etat={ton(cr.etat)} title={cr.detail}>{cr.detail}</PastilleEtat> : <span className="text-slate-400">…</span>}</Td>
                  <Td>{po ? <PastilleEtat etat={ton(po.etat)} title={po.detail}>{d.ponderation_fixee_le ? `fixées ${date(d.ponderation_fixee_le)}` : po.detail}</PastilleEtat> : <span className="text-slate-400">…</span>}</Td>
                  <Td align="droite">
                    <span className="inline-flex gap-1.5">
                      <button className="bouton inline-flex items-center gap-1" onClick={() => setApercu(d.ue_num)}><IconFileDescription size={14} />Voir</button>
                      <button className="bouton bouton-fort inline-flex items-center gap-1" disabled={enCours} onClick={() => valider([d.ue_num])}><IconLock size={14} />Fixer et valider</button>
                    </span>
                  </Td>
                </Tr>);
            })}
          </tbody>
        </Tableau>
      </div>
      {(dues || []).length > 0 && (
        <div className="flex items-center gap-3">
          <button className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={enCours || !coches.size} onClick={() => valider([...coches])}>
            <IconLock size={15} />{enCours ? 'Validation…' : `Fixer et valider les ${coches.size || ''} cochées`.replace('  ', ' ')}
          </button>
          {!coches.size && <span className="text-second text-slate-500">cochez les DUE à valider</span>}
        </div>)}
    </div>);
}

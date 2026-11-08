import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { IconClockHour4, IconCheck, IconArrowBackUp, IconFileText, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { saisir } from '../lib/dialogue.jsx';
import { Encadre, PastilleEtat, Tableau, TableauEntete, Th, Td, Tr, EnteteCarte } from './ui.jsx';

const SaisieAnnexe = lazy(() => import('./SaisieAnnexe.jsx'));

/* LES PRESTATIONS DES EXPERTS, CÔTÉ SECRÉTARIAT (3.5.241). Personnel → Prestations des experts : chaque expert de l'année et son
   mois — déclaré, validé, renvoyé, ou rien encore. Valider fait de la déclaration la saisie de l'A27 du mois, qui s'ouvre ensuite
   remplie (signature et cachet compris). Renvoyer demande un mot : l'expert le lit dans son espace et redéclare.
   Serveur : /api/prestations-experts (lib/prestationsExperts.js). */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const ETAT = { declaree: ['disponible', 'Déclarée — à valider'], validee: ['reussi', 'Validée'], renvoyee: ['surveiller', 'Renvoyée à l’expert'] };

export default function PrestationsExperts() {
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [a27, setA27] = useState(null);
  const charger = useCallback(() => {
    fetch(`/api/prestations-experts?mois=${mois}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(setD).catch(e => setErreur(e.message));
  }, [mois]);
  useEffect(() => { charger(); }, [charger]);
  const decider = async (x, valider) => {
    let mot = null;
    if (!valider) { mot = await saisir({ titre: `Renvoyer à ${x.nom}`, message: 'Ce qui est à corriger (l’expert le lit dans son espace) :', confirmer: 'Renvoyer' }); if (!mot) return; }
    const r = await fetch(`/api/prestations-experts/${x.declaration.id}/decider`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ valider, mot }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
    setErreur(null); charger();
    if (valider) setA27(x);
  };
  if (!d) return erreur ? <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre> : <p className="text-second text-slate-500">Chargement…</p>;
  const n = k => d.experts.filter(x => (x.declaration?.statut || 'rien') === k).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap items-center gap-3">
        <h1 className="titre-ecran m-0">Prestations des experts</h1>
        <select className="controle ml-auto" value={mois} onChange={e => { setMois(Number(e.target.value)); setOuvert(null); }}>
          {d.mois_liste.map(m => <option key={m.mois} value={m.mois}>{m.libelle}</option>)}
        </select>
      </div>
      <p className="m-0 text-sm text-slate-600">Chaque expert déclare son mois depuis son espace enseignant (Mes prestations), au plus tard le <b>{fr(d.delai)}</b> — le 5e jour ouvrable avant la fin du mois. Valider fait de sa déclaration l’A27 du mois : elle s’ouvre remplie, signée et cachetée. Un mois validé ne se modifie plus.</p>
      {erreur && <Encadre etat="corriger" titre="Refusé">{erreur}</Encadre>}
      <div className="flex flex-wrap gap-2">
        <PastilleEtat etat="disponible">{n('declaree')} à valider</PastilleEtat>
        <PastilleEtat etat="reussi">{n('validee')} validée(s)</PastilleEtat>
        <PastilleEtat etat="surveiller">{n('renvoyee')} renvoyée(s)</PastilleEtat>
        <PastilleEtat etat="neutre">{n('rien')} sans déclaration</PastilleEtat>
      </div>
      {!d.experts.length ? <Encadre etat="neutre" titre="Aucun expert">Aucune attribution d’expert cette année.</Encadre> : (
        <div className="carte">
          <EnteteCarte icone={IconClockHour4} titre={`Les experts — ${d.libelle}`} />
          <Tableau className="!border-0 !rounded-none">
            <TableauEntete><Th largeur="w-8" /><Th>Expert</Th><Th>État</Th><Th align="droite">Périodes</Th><Th>Déclarée le</Th><Th>Décidée</Th><Th /></TableauEntete>
            <tbody>{d.experts.map(x => {
              const dc = x.declaration; const [et, lib] = dc ? ETAT[dc.statut] : ['neutre', x.compte ? 'Pas encore déclarée' : 'Pas de compte relié'];
              const plie = ouvert !== x.id;
              return [
                <Tr key={x.id}>
                  <Td>{dc && <button type="button" className="bouton !h-7 !px-1.5" onClick={() => setOuvert(plie ? x.id : null)} aria-label="Détail">{plie ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}</button>}</Td>
                  <Td><b>{x.nom}</b></Td>
                  <Td><PastilleEtat etat={et}>{lib}</PastilleEtat>{dc?.mot && <div className="text-second text-slate-500 mt-0.5">« {dc.mot} »</div>}</Td>
                  <Td align="droite">{dc ? dc.periodes : ''}</Td>
                  <Td>{dc ? fr(dc.declare_le) : ''}</Td>
                  <Td className="text-second">{dc?.decide_le ? `${fr(dc.decide_le)}${dc.decide_par ? ` · ${dc.decide_par}` : ''}` : ''}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {dc?.statut === 'declaree' && <>
                      <button type="button" className="bouton bouton-fort !h-8 inline-flex items-center gap-1" onClick={() => decider(x, true)}><IconCheck size={14} /> Valider</button>{' '}
                      <button type="button" className="bouton !h-8 inline-flex items-center gap-1" onClick={() => decider(x, false)}><IconArrowBackUp size={14} /> Renvoyer</button></>}
                    {dc?.statut === 'validee' && <button type="button" className="bouton-sortir bouton !h-8 inline-flex items-center gap-1" onClick={() => setA27(x)}><IconFileText size={14} /> A27</button>}
                  </Td>
                </Tr>,
                !plie && dc && <Tr key={`${x.id}-d`}><Td /><Td colSpan={6}>
                  {dc.ues.map((u, i) => (
                    <div key={i} className="mb-2"><div className="text-second font-semibold">{u.intitule}</div>
                      {(u.cours || []).map((c, k) => <div key={k} className="text-second flex gap-3"><span className="flex-1">{c.denomination}</span><span className="text-slate-500">{c.dates || '—'}</span><span className="w-20 text-right">{c.periodes} pér.</span></div>)}
                    </div>))}
                  {dc.remarque && <p className="m-0 text-second text-slate-600">Remarque de l’expert : {dc.remarque}</p>}
                </Td></Tr>,
              ];
            })}</tbody>
          </Tableau>
        </div>)}
      {a27 && <Suspense fallback={null}><SaisieAnnexe annexe={{ cle: 'A27', mois: true, saisie: true, titre: 'A27 — Prestations mensuelles de l’expert' }} membre={{ id: a27.id, nom: a27.nom }} annee={d.annee} moisInitial={mois} onFermer={() => setA27(null)} /></Suspense>}
    </div>);
}

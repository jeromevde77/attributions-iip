/**
 * LE PLAN D'ACTION QUALITÉ (3.1.442, Charles, 28 octobre 2026 : « plan d'action » d'abord).
 * La pièce maîtresse du dossier AEQES : action, responsable, priorité, échéance, indicateur — et
 * l'état de réalisation, action par action. L'avancement ne se tape pas dans une case : il se
 * pose par un POINT DE SUIVI (ce qui a été fait, qui, quand), gardé en ajout seul — c'est la
 * suite des points qui prouve, à la visite, que la démarche a vécu. Serveur : `/api/qualite`.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconRosette, IconPlus } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';
import { Encadre, Fenetre, PastilleEtat, TuileEtat } from './ui.jsx';

const LIB_STATUT = { a_faire: 'À faire', en_cours: 'En cours', fait: 'Fait', abandonne: 'Abandonnée' };
const ETAT_STATUT = { a_faire: 'neutre', en_cours: 'disponible', fait: 'reussi', abandonne: 'indisponible' };
const frl = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const vide = { titre: '', description: '', critere: '', perimetre: 'institution', section: '', responsable_user_id: '',
  responsable_libre: '', date_due: '', priorite: 'normale', indicateur: '', cible: '', origine: '' };

export default function PlanActionQualite() {
  const [ref, setRef] = useState(null);
  const [actions, setActions] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState({ critere: '', statut: 'ouvertes', perimetre: '' });
  const [edition, setEdition] = useState(null);     // fiche en cours (nouvelle ou existante)
  const [suivi, setSuivi] = useState(null);         // { action, points, texte, avancement, statut }

  const charger = () => fetch('/api/qualite/actions', { headers: authHeaders() })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setActions(j); })
    .catch(e => setErreur(e.message));
  useEffect(() => {
    fetch('/api/qualite/referentiel', { headers: authHeaders() }).then(r => r.json()).then(setRef).catch(() => setRef({ criteres: [], responsables: [], sections: [] }));
    charger();
  }, []);

  const visibles = useMemo(() => (actions || []).filter(a =>
    (!filtre.critere || a.critere === filtre.critere)
    && (!filtre.perimetre || (filtre.perimetre === 'institution' ? a.perimetre === 'institution' : a.section === filtre.perimetre))
    && (filtre.statut === 'toutes' || (filtre.statut === 'ouvertes' ? !['fait', 'abandonne'].includes(a.statut) : a.statut === filtre.statut))), [actions, filtre]);

  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!actions || !ref) return <p className="text-sm text-slate-400">Chargement du plan d’action…</p>;
  const crit = k => ref.criteres.find(c => c.cle === k)?.libelle || '—';
  const n = s => actions.filter(a => a.statut === s).length;
  const retard = actions.filter(a => a.en_retard).length;

  async function enregistrer() {
    const e = edition;
    const rep = await fetch(e.id ? `/api/qualite/actions/${e.id}` : '/api/qualite/actions', {
      method: e.id ? 'PUT' : 'POST', headers: authHeaders(),
      body: JSON.stringify({ ...e, responsable_user_id: e.responsable_user_id ? Number(e.responsable_user_id) : null }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(`❌ ${j.error || 'Refusé'}`); return; }
    setEdition(null); charger();
  }
  async function ouvrirSuivi(a) {
    const points = await fetch(`/api/qualite/actions/${a.id}/suivi`, { headers: authHeaders() }).then(r => r.json()).catch(() => []);
    setSuivi({ action: a, points, texte: '', avancement: String(a.avancement ?? 0), statut: a.statut === 'a_faire' ? 'en_cours' : a.statut });
  }
  async function poserSuivi() {
    const s = suivi;
    const rep = await fetch(`/api/qualite/actions/${s.action.id}/suivi`, { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ texte: s.texte, avancement: s.avancement, statut: s.statut }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(`❌ ${j.error || 'Refusé'}`); return; }
    setSuivi(null); charger();
  }
  const champ = (k, l, props = {}) => (
    <label className="flex flex-col gap-0.5 text-second">{l}
      <input className="controle" value={edition[k] ?? ''} onChange={e => setEdition(x => ({ ...x, [k]: e.target.value }))} {...props} /></label>);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <TuileEtat etat="neutre" valeur={actions.length} libelle="Actions au plan" />
        <TuileEtat etat="disponible" valeur={n('en_cours')} libelle="En cours" />
        <TuileEtat etat="neutre" valeur={n('a_faire')} libelle="À faire" />
        <TuileEtat etat="reussi" valeur={n('fait')} libelle="Faites" />
        <TuileEtat etat={retard ? 'surveiller' : 'reussi'} valeur={retard} libelle="En retard" precision="échéance passée, non faite" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="controle" value={filtre.critere} onChange={e => setFiltre(f => ({ ...f, critere: e.target.value }))}>
          <option value="">Tous les critères</option>
          {ref.criteres.map(c => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
        </select>
        <select className="controle" value={filtre.perimetre} onChange={e => setFiltre(f => ({ ...f, perimetre: e.target.value }))}>
          <option value="">Institution et sections</option>
          <option value="institution">Institution</option>
          {ref.sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <select className="controle" value={filtre.statut} onChange={e => setFiltre(f => ({ ...f, statut: e.target.value }))}>
          <option value="ouvertes">À faire et en cours</option>
          <option value="toutes">Toutes</option>
          {Object.entries(LIB_STATUT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="ml-auto" />
        <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={() => setEdition({ ...vide })}>
          <IconPlus size={14} /> Nouvelle action</button>
      </div>

      <div className="carte overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="tab-entete text-left">
            <th className="px-2 py-1.5">Action</th><th className="px-2 py-1.5">Critère</th><th className="px-2 py-1.5">Responsable</th>
            <th className="px-2 py-1.5">Échéance</th><th className="px-2 py-1.5">Indicateur · cible</th><th className="px-2 py-1.5">Avancement</th><th /></tr></thead>
          <tbody>{visibles.map(a => (
            <tr key={a.id} className="border-t border-slate-100 align-top">
              <td className="px-2 py-1.5"><b>{a.titre}</b>
                <div className="text-second text-slate-500">{a.perimetre === 'section' ? a.section : 'Institution'} · priorité {a.priorite}{a.origine ? ` · ${a.origine}` : ''}</div></td>
              <td className="px-2 py-1.5 text-second">{crit(a.critere)}</td>
              <td className="px-2 py-1.5 text-second">{a.responsable_nom || a.responsable_libre || '—'}</td>
              <td className="px-2 py-1.5 text-second whitespace-nowrap" style={{ color: a.en_retard ? 'var(--c-attente)' : undefined }}>{frl(a.date_due)}{a.en_retard ? ' · en retard' : ''}</td>
              <td className="px-2 py-1.5 text-second">{a.indicateur || '—'}{a.cible ? <span className="text-slate-500"> · {a.cible}</span> : ''}</td>
              <td className="px-2 py-1.5 text-second whitespace-nowrap">
                <PastilleEtat etat={ETAT_STATUT[a.statut]}>{LIB_STATUT[a.statut]}</PastilleEtat>
                {' '}{a.avancement ?? 0} %<div className="text-slate-400">{a.nb_suivis} point(s) · {frl(a.dernier_suivi)}</div></td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <button type="button" className="bouton h-7 px-2" onClick={() => ouvrirSuivi(a)}>Suivi</button>
                {a.modifiable && <button type="button" className="bouton h-7 px-2 ml-1" onClick={() => setEdition({ ...vide, ...a,
                  responsable_user_id: a.responsable_user_id ? String(a.responsable_user_id) : '' })}>Modifier</button>}</td>
            </tr>))}
            {!visibles.length && <tr><td colSpan={7} className="px-2 py-3 text-slate-500">
              {actions.length ? 'Aucune action ne répond à ces filtres.' : 'Le plan est vide : commencer par celui de Psychomotricité, déjà évaluée, est le banc d’essai prévu.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {edition && (
        <Fenetre icone={IconRosette} titre={edition.id ? 'Modifier l’action' : 'Nouvelle action du plan'} onFermer={() => setEdition(null)}
          pied={<><button type="button" className="bouton" onClick={() => setEdition(null)}>Annuler</button>
            <button type="button" className="bouton bouton-fort" disabled={!edition.titre.trim()} onClick={enregistrer}>Enregistrer</button></>}>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">{champ('titre', 'Action')}</div>
            <label className="flex flex-col gap-0.5 text-second md:col-span-2">Description
              <textarea rows={3} className="border border-slate-300 rounded-champ px-2 py-1 text-sm" data-reponses="action-qualite"
                value={edition.description || ''} onChange={e => setEdition(x => ({ ...x, description: e.target.value }))} /></label>
            <label className="flex flex-col gap-0.5 text-second">Critère du référentiel
              <select className="controle" value={edition.critere || ''} onChange={e => setEdition(x => ({ ...x, critere: e.target.value }))}>
                <option value="">—</option>{ref.criteres.map(c => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}</select></label>
            <label className="flex flex-col gap-0.5 text-second">Périmètre
              <select className="controle" value={edition.perimetre === 'section' ? (edition.section || '') : ''}
                onChange={e => setEdition(x => ({ ...x, perimetre: e.target.value ? 'section' : 'institution', section: e.target.value }))}>
                <option value="">Institution</option>{ref.sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}</select></label>
            <label className="flex flex-col gap-0.5 text-second">Responsable
              <select className="controle" value={edition.responsable_user_id || ''} onChange={e => setEdition(x => ({ ...x, responsable_user_id: e.target.value }))}>
                <option value="">— (nommer ci-contre)</option>{ref.responsables.map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}</select></label>
            {!edition.responsable_user_id && champ('responsable_libre', 'Responsable sans compte Lucie')}
            {champ('date_due', 'Échéance', { type: 'date' })}
            <label className="flex flex-col gap-0.5 text-second">Priorité
              <select className="controle" value={edition.priorite} onChange={e => setEdition(x => ({ ...x, priorite: e.target.value }))}>
                {ref.priorites.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            {champ('indicateur', 'Indicateur', { placeholder: 'ex. : taux de réussite en BA1' })}
            {champ('cible', 'Cible', { placeholder: 'ex. : 65 % en 2027-2028' })}
            <div className="md:col-span-2">{champ('origine', 'Origine', { placeholder: 'recommandation AEQES, réunion du…, retour des étudiants…' })}</div>
          </div>
        </Fenetre>)}

      {suivi && (
        <Fenetre icone={IconRosette} titre={`Suivi — ${suivi.action.titre}`} onFermer={() => setSuivi(null)}
          pied={suivi.action.modifiable ? <><button type="button" className="bouton" onClick={() => setSuivi(null)}>Fermer</button>
            <button type="button" className="bouton bouton-fort" disabled={suivi.texte.trim().length < 3} onClick={poserSuivi}>Ajouter le point</button></> : null}>
          <div className="space-y-3">
            <ol className="space-y-1.5 text-second">{suivi.points.map(p => (
              <li key={p.id} className="border-b border-slate-100 pb-1"><b>{frl(p.le)}</b> · {p.par || '—'} · {LIB_STATUT[p.statut] || p.statut} · {p.avancement ?? '—'} %
                <div className="text-slate-600">{p.texte}</div></li>))}</ol>
            {suivi.action.modifiable && (
              <div className="grid md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                <label className="flex flex-col gap-0.5 text-second">Ce qui a été fait ou constaté
                  <textarea rows={2} className="border border-slate-300 rounded-champ px-2 py-1 text-sm" data-reponses="suivi-action-qualite"
                    value={suivi.texte} onChange={e => setSuivi(s => ({ ...s, texte: e.target.value }))} /></label>
                <label className="flex flex-col gap-0.5 text-second">Avancement (%)
                  <input className="controle w-24 text-right" inputMode="numeric" value={suivi.avancement} onChange={e => setSuivi(s => ({ ...s, avancement: e.target.value }))} /></label>
                <label className="flex flex-col gap-0.5 text-second">Statut
                  <select className="controle" value={suivi.statut} onChange={e => setSuivi(s => ({ ...s, statut: e.target.value }))}>
                    {Object.entries(LIB_STATUT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                {suivi.statut === 'abandonne' && <p className="text-second text-slate-500 md:col-span-3 m-0">Le texte du point sert de motif d’abandon.</p>}
              </div>)}
          </div>
        </Fenetre>)}
    </div>
  );
}

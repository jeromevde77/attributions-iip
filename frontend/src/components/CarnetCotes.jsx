/**
 * LE CARNET DE COTES (Charles, 28 octobre 2026 : « encoder des notes — des tests
 * par exemple — pour gagner du temps »). Une face de Mes cours, à côté de la
 * feuille de notes.
 *
 * Une colonne par évaluation (test, interrogation, travail), des points par
 * étudiant, décimales admises. Une évaluation RATTACHÉE à des acquis nourrit une
 * proposition de note par acquis ; « Reprendre dans la feuille de notes » remplit
 * les cases de la feuille, que le professeur relit, justifie et enregistre — rien
 * ne s'écrit d'office. Une évaluation sans rattachement reste un repère personnel.
 * Serveur : `routes/carnet.js`, calcul dans `lib/carnet.js`.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconHistory, IconFileSpreadsheet, IconArrowBarToRight, IconClipboardText, IconTrash } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Encadre, Fenetre } from './ui.jsx';
import { demander, informer, saisir } from '../lib/dialogue.jsx';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const nb = v => String(v ?? '').replace('.', ',');
const MENTIONS = ['PP', 'NP', 'CM'];
const valide = (s, sur) => {
  const t = String(s ?? '').trim().toUpperCase();
  if (!t || MENTIONS.includes(t)) return true;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return false;
  return Number(t.replace(',', '.')) <= sur;
};
const affiche = n => (n ? (n.mention || nb(n.points)) : '');
const plat = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const groupesDe = e => String(e.groupe || '').split(' + ').map(x => x.trim()).filter(Boolean);

async function appel(url, options = {}) {
  const r = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function CarnetCotes({ coursCode, annee, groupe = '', sessionFeuille = 1, onReprendre }) {
  const base = `/api/mes-cours/carnet/${encodeURIComponent(coursCode)}`;
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [saisie, setSaisie] = useState({});      // evaluation_id → { etudiant_id → texte }
  const [fiche, setFiche] = useState(null);      // évaluation en édition (ou nouvelle)
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(null);
  const [session, setSession] = useState(sessionFeuille);

  const charger = () => appel(`${base}?annee=${encodeURIComponent(annee)}`)
    .then(j => { setD(j); setSaisie({}); setErreur(null); })
    .catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, [coursCode, annee]);   // eslint-disable-line react-hooks/exhaustive-deps

  const etudiants = useMemo(() => (d?.etudiants || []).filter(e => !groupe || groupesDe(e).includes(groupe)), [d, groupe]);
  const evals = d?.evaluations || [];
  const aS2 = evals.some(e => e.session === 2);
  const codes = (d?.acquis || []).map(a => a.aa_code);
  const cles = codes.length ? codes : [''];
  const valeur = (ev, e) => saisie[ev.id]?.[e.id] ?? affiche(e.notes?.[ev.id]);
  const sales = Object.entries(saisie).flatMap(([id, m]) => Object.keys(m).map(k => [Number(id), Number(k)]));
  const invalides = sales.filter(([id, k]) => { const ev = evals.find(x => x.id === id); return ev && !valide(saisie[id][k], ev.sur); });
  const rattachees = evals.filter(e => e.session === session && (codes.length ? e.aa.length : true));

  const poser = (evId, etId, v) => { setFait(null); setSaisie(s => ({ ...s, [evId]: { ...(s[evId] || {}), [etId]: v } })); };

  async function enregistrer() {
    setEnCours(true); setErreur(null);
    try {
      let n = 0;
      for (const [id, m] of Object.entries(saisie)) {
        const j = await appel(`${base}/evaluations/${id}/notes`, { method: 'PUT',
          body: JSON.stringify({ annee, notes: Object.entries(m).map(([k, v]) => ({ etudiant_id: Number(k), valeur: v })) }) });
        n += j.ecrites;
      }
      setFait(`${n} note(s) enregistrée(s) dans le carnet.`);
      await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  async function coller(ev) {
    const texte = await saisir({ titre: `Coller les notes — ${ev.intitule}`, multiligne: true, confirmer: 'Remplir la colonne',
      message: 'Collez une colonne depuis Excel. Deux formes :\n– une note par ligne, dans l’ordre de la liste affichée ;\n– ou deux colonnes : le matricule (ou « NOM Prénom ») puis la note.\nRien ne s’enregistre avant « Enregistrer ».' });
    if (!texte) return;
    const lignes = String(texte).split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    const nouvelles = {}; const inconnus = [];
    if (lignes.every(l => l.includes('\t'))) {
      for (const l of lignes) {
        const parts = l.split('\t'); const v = parts.pop().trim(); const qui = parts.join(' ').trim();
        const e = etudiants.find(x => (x.id_ecampus && plat(x.id_ecampus) === plat(qui)) || plat(`${x.nom} ${x.prenom}`) === plat(qui) || plat(`${x.prenom} ${x.nom}`) === plat(qui));
        if (e) nouvelles[e.id] = v; else inconnus.push(qui);
      }
    } else {
      if (lignes.length !== etudiants.length && !(await demander({ titre: 'Le nombre ne correspond pas',
        message: `${lignes.length} ligne(s) collée(s) pour ${etudiants.length} étudiant(s) affiché(s). Remplir dans l’ordre quand même ?` }))) return;
      etudiants.forEach((e, i) => { if (i < lignes.length) nouvelles[e.id] = lignes[i].trim(); });
    }
    setSaisie(s => ({ ...s, [ev.id]: { ...(s[ev.id] || {}), ...nouvelles } }));
    if (inconnus.length) informer({ titre: 'Lignes non reconnues', message: `${inconnus.length} ligne(s) ne correspondent à aucun étudiant de la liste :\n${inconnus.slice(0, 10).join('\n')}` });
  }

  async function reprendreAnDernier() {
    try {
      const j = await appel(`${base}/reprendre`, { method: 'POST', body: JSON.stringify({ annee }) });
      setFait(`${j.reprises} évaluation(s) reprise(s) de ${j.depuis} — intitulés, maximums, poids et acquis ; pas de notes.`
        + (j.acquis_disparus ? ` ${j.acquis_disparus} rattachement(s) à un acquis qui n’existe plus ont été laissés.` : ''));
      await charger();
    } catch (e) { setErreur(e.message); }
  }

  function versFeuille() {
    const props = Object.fromEntries((d?.etudiants || []).map(e => [e.id, Object.fromEntries(
      Object.entries(e.propositions?.[session] || {}).map(([k, x]) => [k, x.note]))]));
    onReprendre?.(props, session);
  }

  async function exporter() {
    const r = await fetch(`${base}/excel?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
    if (!r.ok) { setErreur('Export impossible.'); return; }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = `Carnet_${coursCode}_${annee}.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  if (erreur && !d) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-400">Chargement du carnet…</p>;
  const nomAA = k => (k ? k : 'Cours');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="bouton" onClick={() => setFiche({ intitule: '', date: '', sur: 20, poids: 1, session: sessionFeuille, aa: [] })}>
          <IconPlus size={15} /> Évaluation</button>
        {d.precedent && (
          <button type="button" className="bouton" onClick={reprendreAnDernier} title="Les intitulés, maximums, poids et acquis — jamais les notes">
            <IconHistory size={15} /> Reprendre {d.precedent.a} ({d.precedent.n})</button>)}
        {aS2 && (
          <div className="segments">
            {[[1, '1ʳᵉ session'], [2, '2ᵉ session']].map(([n, l]) => (
              <button key={n} type="button" onClick={() => setSession(n)}
                className={`px-2.5 py-1 text-second ${session === n ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
          </div>)}
        <span className="flex-1" />
        {evals.length > 0 && <button type="button" className="bouton bouton-sortir" onClick={exporter}><IconFileSpreadsheet size={15} /> Excel</button>}
        {rattachees.length > 0 && (
          <button type="button" className="bouton" onClick={versFeuille} disabled={sales.length > 0}
            title={sales.length ? 'Enregistrez d’abord le carnet' : 'Remplit les cases de la feuille de notes ; rien ne s’enregistre avant votre clic'}>
            <IconArrowBarToRight size={15} /> Reprendre dans la feuille de notes</button>)}
        <button type="button" className="bouton bouton-fort" disabled={!sales.length || invalides.length > 0 || enCours} onClick={enregistrer}>
          Enregistrer{sales.length ? ` (${sales.length})` : ''}</button>
      </div>
      <div className="text-second min-h-[1.2rem]">
        {invalides.length ? <span style={{ color: 'var(--c-refuse)' }}>{invalides.length} case(s) invalide(s) : des points (12,5) jusqu’au maximum, ou PP · NP · CM.</span>
          : fait ? <span style={{ color: 'var(--c-reussi)' }}>✓ {fait}</span>
            : sales.length ? <span style={{ color: 'var(--c-attente)' }}>{sales.length} changement(s) à enregistrer.</span> : null}
        {erreur && <span style={{ color: 'var(--c-refuse)' }}> {erreur}</span>}
      </div>

      {!evals.length ? (
        <Encadre etat="neutre" titre="Le carnet est vide">
          Ajoutez vos évaluations — tests, interrogations, travaux — avec leur maximum et leur poids. Rattachez-les aux acquis
          qu’elles évaluent : Lucie en tire une proposition de note par acquis, que vous reprenez dans la feuille de notes.
          Sans rattachement, l’évaluation reste dans votre carnet.
        </Encadre>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="text-second border-collapse">
            <thead>
              <tr className="tab-entete">
                <th className="px-2 py-1.5 text-left sticky left-0 z-10 bg-inherit min-w-[200px]">Étudiant</th>
                {evals.map(ev => (
                  <th key={ev.id} className={`px-1.5 py-1 align-bottom min-w-[86px] ${ev.session !== session ? 'opacity-50' : ''}`}>
                    <button type="button" className="text-left w-full hover:underline" onClick={() => setFiche({ ...ev })} title="Modifier l’évaluation">
                      <div className="font-semibold text-slate-800 normal-case tracking-normal">{ev.intitule}</div>
                      <div className="font-normal normal-case tracking-normal text-slate-500">
                        {[fr(ev.date), `/${nb(ev.sur)}`, ev.poids !== 1 ? `×${nb(ev.poids)}` : '', ev.session === 2 ? 'S2' : ''].filter(Boolean).join(' · ')}</div>
                      <div className="font-normal normal-case tracking-normal" style={{ color: ev.aa.length ? 'var(--c-texte)' : 'rgb(var(--gris-400))' }}>
                        {codes.length ? (ev.aa.length ? ev.aa.map(a => a.aa_code).join(', ') : 'carnet seul') : 'note du cours'}</div>
                    </button>
                    <button type="button" className="font-normal normal-case tracking-normal text-slate-500 hover:underline" onClick={() => coller(ev)}>
                      <IconClipboardText size={12} className="inline -mt-0.5" /> coller</button>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right" title="Moyenne de toutes les évaluations de la session, sur 20">Moy. /20</th>
                {cles.map(k => <th key={k || 'c'} className="px-2 py-1.5 text-right" title="Proposition par acquis, arrondie à l’unité">→ {nomAA(k)}</th>)}
              </tr>
            </thead>
            <tbody>
              {etudiants.map(e => (
                <tr key={e.id} className="border-t border-slate-100 bg-white">
                  <td className="px-2 py-1 sticky left-0 bg-white whitespace-nowrap">
                    <b>{String(e.nom || '').toUpperCase()}</b> {e.prenom}
                    {e.groupe && <span className="block text-xs text-slate-400">{e.groupe}</span>}
                  </td>
                  {evals.map(ev => {
                    const v = valeur(ev, e); const ok = valide(v, ev.sur);
                    const sale = saisie[ev.id]?.[e.id] !== undefined;
                    return (
                      <td key={ev.id} className="px-1 py-0.5 text-center">
                        <input value={v} onChange={x => poser(ev.id, e.id, x.target.value)} inputMode="decimal"
                          className="w-[4.2rem] h-7 text-center border rounded-champ"
                          style={{ borderColor: !ok ? 'var(--c-refuse)' : sale ? 'var(--c-attente)' : 'rgb(var(--gris-300))' }} />
                      </td>
                    );
                  })}
                  <td className="px-2 text-right tabular-nums">{e.moyenne?.[session] != null ? nb(e.moyenne[session]) : '—'}</td>
                  {cles.map(k => {
                    const p = e.propositions?.[session]?.[k];
                    return <td key={k || 'c'} className="px-2 text-right tabular-nums font-semibold"
                      title={p ? `${nb(p.sur20)} /20 sur ${p.nb} évaluation(s)` : 'Aucune évaluation notée rattachée'}
                      style={{ color: p && p.note < 10 ? 'var(--c-refuse)' : undefined }}>{p ? p.note : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {evals.length > 0 && (
        <p className="text-second text-slate-500 m-0">
          Une case vide ou PP · NP · CM ne compte pas : elle sort de la moyenne, elle ne vaut pas zéro. La proposition par acquis
          pondère chaque évaluation rattachée (poids de l’évaluation × poids de l’acquis) et s’arrondit à l’unité.
        </p>)}

      {fiche && <FicheEvaluation fiche={fiche} acquis={d.acquis} base={base} annee={annee}
        onFermer={() => setFiche(null)} onFait={async msg => { setFiche(null); setFait(msg); await charger(); }} />}
    </div>
  );
}

function FicheEvaluation({ fiche, acquis, base, annee, onFermer, onFait }) {
  const [f, setF] = useState({ ...fiche, aa: fiche.aa || [] });
  const [erreur, setErreur] = useState(null);
  const lie = k => f.aa.find(a => a.aa_code === k);
  const basculer = k => setF(x => ({ ...x, aa: lie(k) ? x.aa.filter(a => a.aa_code !== k) : [...x.aa, { aa_code: k, poids: 1 }] }));
  const poidsAA = (k, p) => setF(x => ({ ...x, aa: x.aa.map(a => (a.aa_code === k ? { ...a, poids: p } : a)) }));

  async function enregistrer() {
    setErreur(null);
    try {
      const corps = JSON.stringify({ annee, intitule: f.intitule, date: f.date || null, sur: f.sur, poids: f.poids, session: f.session, aa: f.aa });
      if (f.id) await appel(`${base}/evaluations/${f.id}`, { method: 'PUT', body: corps });
      else await appel(`${base}/evaluations`, { method: 'POST', body: corps });
      onFait(f.id ? 'Évaluation modifiée.' : `« ${f.intitule} » ajoutée au carnet.`);
    } catch (e) { setErreur(e.message); }
  }
  async function supprimer() {
    if (!(await demander({ titre: `Supprimer « ${f.intitule} » ?`,
      message: f.notees ? `Ses ${f.notees} note(s) seront supprimées avec elle. (Le bouton « Annuler » de la barre du haut peut revenir en arrière.)` : 'Elle n’a encore aucune note.' }))) return;
    try {
      await appel(`${base}/evaluations/${f.id}?annee=${encodeURIComponent(annee)}`, { method: 'DELETE' });
      onFait('Évaluation supprimée.');
    } catch (e) { setErreur(e.message); }
  }

  return (
    <Fenetre titre={f.id ? `Évaluation — ${fiche.intitule}` : 'Nouvelle évaluation'} large="petite" onFermer={onFermer}
      pied={<>
        <span className="text-second min-w-0 flex-1" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>
        {f.id && <button type="button" className="bouton bouton-detruire" onClick={supprimer}><IconTrash size={15} /> Supprimer</button>}
        <button type="button" className="bouton bouton-fort" disabled={!String(f.intitule || '').trim()} onClick={enregistrer}>Enregistrer</button>
      </>}>
      <div className="space-y-3 text-sm">
        <label className="block"><span className="intertitre block mb-1">Intitulé</span>
          <input className="controle w-full border border-slate-300 rounded-champ" value={f.intitule} maxLength={80} autoFocus
            placeholder="Test 1, Interrogation, Travail de groupe…" onChange={e => setF({ ...f, intitule: e.target.value })} /></label>
        <div className="grid grid-cols-4 gap-2">
          <label><span className="intertitre block mb-1">Date</span>
            <input type="date" className="controle w-full border border-slate-300 rounded-champ" value={f.date || ''} onChange={e => setF({ ...f, date: e.target.value })} /></label>
          <label><span className="intertitre block mb-1">Sur</span>
            <input className="controle w-full border border-slate-300 rounded-champ text-right" value={f.sur} inputMode="decimal" onChange={e => setF({ ...f, sur: e.target.value })} /></label>
          <label><span className="intertitre block mb-1">Poids</span>
            <input className="controle w-full border border-slate-300 rounded-champ text-right" value={f.poids} inputMode="decimal" onChange={e => setF({ ...f, poids: e.target.value })} /></label>
          <label><span className="intertitre block mb-1">Session</span>
            <select className="controle w-full border border-slate-300 rounded-champ" value={f.session} onChange={e => setF({ ...f, session: Number(e.target.value) })}>
              <option value={1}>1ʳᵉ</option><option value={2}>2ᵉ</option></select></label>
        </div>
        {acquis.length > 0 ? (
          <div>
            <span className="intertitre block mb-1">Acquis évalués</span>
            <p className="text-second text-slate-500 mt-0 mb-1.5">Cochés : l’évaluation compte dans la proposition de ces acquis. Aucun : elle reste dans votre carnet.</p>
            <div className="space-y-1 max-h-60 overflow-auto">
              {acquis.map(a => (
                <div key={a.aa_code} className="flex items-start gap-2">
                  <label className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={!!lie(a.aa_code)} onChange={() => basculer(a.aa_code)} />
                    <span className="flex-1 min-w-0"><b>{a.aa_code}</b> <span className="text-slate-500">{a.description}</span></span>
                  </label>
                  {lie(a.aa_code) && <input className="w-14 h-7 border border-slate-300 rounded-champ text-right px-1" title="Poids de l’évaluation dans cet acquis"
                    value={lie(a.aa_code).poids} inputMode="decimal" onChange={e => poidsAA(a.aa_code, e.target.value)} />}
                </div>))}
            </div>
          </div>
        ) : <p className="text-second text-slate-500 m-0">Ce cours n’a pas d’acquis rattachés : toutes ses évaluations nourrissent la note du cours.</p>}
      </div>
    </Fenetre>
  );
}

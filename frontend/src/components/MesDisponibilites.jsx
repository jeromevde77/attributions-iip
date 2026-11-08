import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import AgendaSemaine, { LegendeDispo, suivant } from './AgendaSemaine.jsx';
import { Encadre, PastilleEtat } from './ui.jsx';
import { demander } from '../lib/dialogue.jsx';

/* MES DISPONIBILITÉS (3.5.224, Charles, 8 novembre 2026). L'agenda que le secrétariat tient pour l'enseignant, sur les blocs de
   l'école, commun à toutes ses sections. Le professeur le lit et PROPOSE un changement (une case tourne : vert, orange, rouge) ;
   rien ne change tant que le secrétariat ne l'a pas appliqué. Serveur : /api/mes-disponibilites. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const versCarte = cases => Object.fromEntries((cases || []).map(c => [`${c.jour}|${c.debut}`, Number(c.valeur) || 0]));
const ETAT = { en_attente: ['surveiller', 'en attente'], appliquee: ['reussi', 'appliquée'], refusee: ['corriger', 'non retenue'], retiree: ['neutre', 'retirée'] };

export default function MesDisponibilites() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [q, setQ] = useState('Q1');
  const [brouillon, setBrouillon] = useState(null);    // { 'jour|debut': 0|2 } — null = on regarde l'agenda en vigueur
  const [remarque, setRemarque] = useState('');
  const [retour, setRetour] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = () => fetch('/api/mes-disponibilites', { headers: authHeaders() })
    .then(async x => { const j = await x.json().catch(() => ({})); if (!x.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
    .then(setD).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);

  if (erreur) return <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>;
  if (!d) return <p className="text-second text-slate-500">Chargement…</p>;
  if (!d.relie) return <Encadre etat="surveiller" titre="Compte non relié">Votre compte n’est relié à aucune fiche d’enseignant. Le secrétariat fait le lien dans votre fiche du personnel.</Encadre>;

  const enVigueur = versCarte(d.cases.filter(c => c.quadrimestre === q));
  const attente = d.propositions.find(p => p.statut === 'en_attente' && p.quadrimestre === q);
  const carte = brouillon ?? (attente ? versCarte(attente.cases) : enVigueur);
  const jours = [...new Set(d.base.map(c => c.jour))].sort();
  const changer = (jour, c) => {
    const k = `${jour}|${c.debut}`;
    setBrouillon(prev => { const n = { ...(prev ?? carte) }, v = suivant(n[k] ?? 1); if (v === 1) delete n[k]; else n[k] = v; return n; });
    setRetour(null);
  };
  const proposer = async () => {
    setEnvoi(true); setRetour(null);
    try {
      const cases = Object.entries(brouillon || {}).map(([k, valeur]) => { const [jour, debut] = k.split('|'); return { jour: Number(jour), debut, valeur }; });
      const r = await fetch('/api/mes-disponibilites', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ quadrimestre: q, cases, remarque }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      setBrouillon(null); setRemarque('');
      setRetour({ ok: true, texte: 'Proposition transmise au secrétariat. Vous serez prévenu·e quand elle sera appliquée.' });
      charger();
    } catch (e) { setRetour({ ok: false, texte: e.message }); } finally { setEnvoi(false); }
  };
  const retirer = async p => {
    if (!(await demander({ titre: 'Retirer la proposition', message: `Votre proposition du ${fr(p.propose_le)} (${p.quadrimestre}) sera retirée.`, confirmer: 'Retirer' }))) return;
    await fetch(`/api/mes-disponibilites/${p.id}`, { method: 'DELETE', headers: authHeaders() });
    setBrouillon(null); charger();
  };

  return (
    <div className="space-y-3">
      <p className="m-0 text-sm text-slate-600">Vos disponibilités servent à composer l’horaire, pour toutes les sections où vous enseignez. Touchez une case pour la faire tourner : vert disponible, orange si nécessaire, rouge pas disponible. Le secrétariat applique votre proposition.</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="segments flex">
          {['Q1', 'Q2'].map(x => <button key={x} type="button" onClick={() => { setQ(x); setBrouillon(null); setRetour(null); }}
            className={q === x ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{x === 'Q1' ? '1er quadrimestre' : '2e quadrimestre'}</button>)}
        </div>
        <LegendeDispo libre="disponible" />
        {brouillon && <PastilleEtat etat="disponible">modifié, pas encore proposé</PastilleEtat>}
        {!brouillon && attente && <PastilleEtat etat="surveiller">proposition en attente du {fr(attente.propose_le)}</PastilleEtat>}
      </div>
      {!d.base.length ? <Encadre etat="surveiller" titre="Pas encore de blocs de cours">L’école n’a pas encore posé ses blocs de cours : l’agenda se remplira quand ce sera fait.</Encadre>
        : <AgendaSemaine base={d.base} jours={jours} valeur={(j, c) => carte[`${j}|${c.debut}`] ?? 1} onCase={changer} />}
      {brouillon && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm flex-1 min-w-[240px]"><span className="block text-slate-500">Un mot pour le secrétariat (facultatif)</span>
            <textarea className="controle mt-1 w-full !h-auto py-2" rows={2} value={remarque} onChange={e => setRemarque(e.target.value)} data-reponses="disponibilites" /></label>
          <button type="button" className="bouton" onClick={() => { setBrouillon(null); setRetour(null); }}>Annuler</button>
          <button type="button" className="bouton bouton-fort" disabled={envoi} onClick={proposer}>{envoi ? 'Envoi…' : 'Proposer ce changement'}</button>
        </div>)}
      {retour && <Encadre etat={retour.ok ? 'reussi' : 'corriger'}>{retour.texte}</Encadre>}
      {d.propositions.length > 0 && (
        <div className="space-y-1">
          <div className="intertitre">Mes propositions</div>
          {d.propositions.map(p => {
            const [etat, mot] = ETAT[p.statut] || ['neutre', p.statut];
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-2 text-second">
                <PastilleEtat etat={etat}>{mot}</PastilleEtat>
                <span>{p.quadrimestre} · proposée le {fr(p.propose_le)}{p.decide_le && p.statut !== 'en_attente' ? ` · ${fr(p.decide_le)}` : ''}{p.motif ? ` — « ${p.motif} »` : ''}</span>
                {p.statut === 'en_attente' && <button type="button" className="text-iip-blue underline" onClick={() => retirer(p)}>retirer</button>}
              </div>);
          })}
        </div>)}
    </div>);
}

/**
 * LE PAE EN LIGNE, CÔTÉ ÉCOLE (3.1.515, Charles, 30 octobre 2026 : « l'étudiant choisit, la coordination valide ou
 * corrige » ; « une fenêtre fixée par la direction »). Les propositions envoyées par les étudiants depuis leur espace :
 * ce qu'ils ont coché face à leur programme actuel. Trois gestes : REPRENDRE (le programme devient leur choix, par la
 * porte unique), CORRIGER dans la revue puis le dire, REFUSER avec un mot. La fenêtre se règle ici, par la direction.
 * Serveur : routes/paeEnLigne.js, lib/paeEnLigne.js.
 */
import { useCallback, useEffect, useState } from 'react';
import { IconInbox, IconCheck, IconEyeCheck, IconX } from '@tabler/icons-react';
import { Fenetre, PastilleEtat } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { saisir } from '../lib/dialogue.jsx';

const jour = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const STATUT = { deposee: ['disponible', 'à traiter'], reprise: ['reussi', 'reprise'], corrigee: ['surveiller', 'corrigée'], refusee: ['corriger', 'refusée'] };

async function appel(methode, chemin, corps) {
  const r = await fetch(`/api/pae-en-ligne${chemin}`, { method: methode, headers: { ...authHeaders(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function PropositionsPAE({ onFermer, Revue }) {
  const { passe } = useDroits();
  const direction = passe('admin');
  const [reglage, setReglage] = useState(null);
  const [form, setForm] = useState(null);
  const [l, setL] = useState(null);
  const [voir, setVoir] = useState('deposee');
  const [erreur, setErreur] = useState(null);
  const [revue, setRevue] = useState(null);   // la proposition qu'on corrige
  const charger = useCallback(async () => {
    try {
      const g = await appel('GET', '/reglage'); setReglage(g); setForm(f => f || { du: g.du || '', au: g.au || '', annee: g.annee || '' });
      setL(await appel('GET', '/propositions'));
    } catch (e) { setErreur(e.message); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const geste = async (fn) => { setErreur(null); try { await fn(); await charger(); } catch (e) { setErreur(e.message); } };
  const traiter = (p, statut) => geste(async () => {
    const message = await saisir({ message: statut === 'refusee' ? `Pourquoi la proposition de ${p.nom.toUpperCase()} ${p.prenom} n’est-elle pas retenue ? L’étudiant le lira dans son espace.`
      : `Ce que vous avez corrigé dans le PAE de ${p.nom.toUpperCase()} ${p.prenom} — l’étudiant le lira dans son espace.`, multiligne: true, obligatoire: true });
    if (!message) return;
    await appel('POST', `/propositions/${p.id}/traiter`, { statut, message });
  });
  const liste = (l?.propositions || []).filter(p => voir === 'tout' || p.statut === voir);
  const n = (l?.propositions || []).filter(p => p.statut === 'deposee').length;

  return (
    <Fenetre icone={IconInbox} titre="PAE en ligne — propositions des étudiants" large="grande" onFermer={onFermer}
      sous={reglage?.annee ? `PAE ${reglage.annee} · ${reglage.ouvert ? `ouvert jusqu’au ${jour(reglage.au)}` : reglage.du ? `fermé (du ${jour(reglage.du)} au ${jour(reglage.au)})` : 'fenêtre non réglée'}` : 'Fenêtre non réglée'}>
      <div className="space-y-4">
        {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
        {direction && form && (
          <div className="bloc-etat px-3 py-2 text-second flex flex-wrap items-center gap-2" data-etat="neutre">
            <span className="font-semibold text-iip-texte">La fenêtre (direction)</span>
            <label>PAE de <input value={form.annee} onChange={e => setForm({ ...form, annee: e.target.value })} placeholder="2027-2028" className="controle w-28 ml-1" /></label>
            <label>du <input type="date" value={form.du} onChange={e => setForm({ ...form, du: e.target.value })} className="controle ml-1" /></label>
            <label>au <input type="date" value={form.au} onChange={e => setForm({ ...form, au: e.target.value })} className="controle ml-1" /></label>
            <button type="button" className="bouton" onClick={() => geste(() => appel('PUT', '/reglage', form))}>Enregistrer</button>
            <span className="text-slate-500 w-full">Pendant la fenêtre, chaque étudiant coche dans son espace les unités accessibles ; une unité qu’une règle refuse reste grisée.</span>
          </div>)}
        <div className="segments">
          {[['deposee', `À traiter (${n})`], ['tout', 'Toutes']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setVoir(k)}
              className={`px-2.5 py-1 text-second ${voir === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{t}</button>))}
        </div>
        {!l ? <p className="text-sm text-slate-500">Chargement…</p> : !liste.length
          ? <p className="text-sm text-slate-500">{voir === 'deposee' ? 'Aucune proposition à traiter.' : 'Aucune proposition.'}</p>
          : liste.map(p => (
            <section key={p.id} className="bloc-etat px-4 py-3 space-y-2" data-etat={STATUT[p.statut]?.[0] || 'neutre'}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-iip-texte flex-1 min-w-0">{p.nom.toUpperCase()} {p.prenom}
                  <span className="font-normal text-slate-500"> · {p.section || '—'} · envoyée le {jour(p.depose_le)}</span></span>
                <PastilleEtat etat={STATUT[p.statut]?.[0]}>{STATUT[p.statut]?.[1]}</PastilleEtat>
              </div>
              <table className="w-full text-second">
                <thead><tr className="text-slate-500 text-left"><th className="font-normal py-1">Unité</th><th className="font-normal w-28 text-center">Proposée</th><th className="font-normal w-28 text-center">Au programme</th></tr></thead>
                <tbody>
                  {p.lignes.map(x => (
                    <tr key={x.ue_num} className="border-t border-slate-100">
                      <td className="py-1"><span className="tabular-nums text-slate-500 mr-2">UE {x.ue_num}</span>{x.ue_nom}</td>
                      <td className="text-center">{x.propose ? '✓' : x.verrouillee ? <span className="text-slate-500" title="Hors de sa main (posée par l'école) : elle reste au programme.">reste</span> : ''}</td>
                      <td className="text-center">{x.au_programme ? '✓' : ''}</td>
                    </tr>))}
                </tbody>
              </table>
              {p.statut === 'deposee' ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={p.identique}
                    onClick={() => geste(() => appel('POST', `/propositions/${p.id}/reprendre`))}><IconCheck size={15} />
                    {p.identique ? 'Déjà son programme' : 'Reprendre sa proposition'}</button>
                  {Revue && <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => setRevue(p)}><IconEyeCheck size={15} /> Corriger dans la revue</button>}
                  <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => traiter(p, 'refusee')}><IconX size={15} /> Ne pas retenir</button>
                </div>
              ) : (
                <div className="text-second text-slate-600">{STATUT[p.statut]?.[1]} par {p.traite_par} le {jour(p.traite_le)}{p.message ? ` — « ${p.message} »` : ''}</div>)}
            </section>))}
      </div>
      {revue && Revue && (
        <Revue liste={[{ id: revue.etudiant_id, nom: revue.nom, prenom: revue.prenom, section: revue.section, niveau: null }]} annee={l.annee}
          onClose={() => { const p = revue; setRevue(null); traiter(p, 'corrigee'); }} />)}
    </Fenetre>
  );
}

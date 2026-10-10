/**
 * LE CONTRÔLE DES NOTES DE DÉCISION (Charles, 30 septembre 2026, après
 * KOANANG WANDJI, UE 261 : « réussi » enregistré à 0, PV à 13, attestation
 * à 10).
 *
 * Jusqu'en 2.12.331, la note d'unité d'une décision était celle que l'écran
 * affichait au moment du clic ; le PV la recalcule, l'attestation lit celle qui
 * est enregistrée. Cet écran met les deux côte à côte et corrige sur demande.
 *
 * Il corrige la COTE, jamais la DÉCISION : un « réussi » que le calcul place
 * sous le seuil, sans faveur, se reprend en séance — il est nommé à part. Une
 * décision reprise du classeur (sans séance tenue dans Lucie) est montrée, pas
 * cochée d'office : la note du classeur fait foi. Chaque correction se motive
 * et s'écrit au journal, une ligne par décision.
 */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import { TuileEtat } from './ui.jsx';

const RESULTAT = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé' };
const SOURCE = { seance: 'séance Lucie', reprise: 'reprise d’archives', sans_seance: 'import (pas de séance)' };
const cote = v => (v == null ? '—' : Number(v).toLocaleString('fr-BE', { maximumFractionDigits: 2 }));
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const anneesAutour = a => {
  const d = Number(String(a).slice(0, 4)) || new Date().getFullYear();
  return [0, 1, 2, 3].map(k => `${d - k}-${d - k + 1}`);
};

export default function ControleDecisions() {
  const [annee, setAnnee] = useState(() => {
    const a = getAnnee(); const d = Number(String(a).slice(0, 4));
    return d ? `${d - 1}-${d}` : a;   // les délibérations tenues sont celles de l'année écoulée
  });
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState('');
  const [coches, setCoches] = useState(() => new Set());
  const [motif, setMotif] = useState('');
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(null);
  const [journal, setJournal] = useState(null);
  const direction = ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role);
  const cle = l => `${l.etudiant_id}|${l.ue_num}|${l.session}`;

  const charger = async () => {
    setR(null); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/controle-decisions?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || `Erreur ${rep.status}`);
      setR(j);
      // Coché d'office : ce qu'une séance tenue dans Lucie a décidé. Le reste
      // porte la note du classeur, qui fait foi.
      setCoches(new Set(j.ecarts.filter(l => l.source === 'seance').map(cle)));
      const jr = await fetch(`/api/acquis/controle-decisions/journal?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      setJournal(jr.ok ? await jr.json() : []);
    } catch (e) { setErreur(e.message); }
  };
  useEffect(() => { setFait(null); charger(); /* eslint-disable-next-line */ }, [annee]);

  const sections = useMemo(() => [...new Set([...(r?.ecarts || []), ...(r?.a_trancher || [])]
    .map(l => l.section).filter(Boolean))].sort(), [r]);
  const filtre = l => !section || l.section === section;
  const ecarts = (r?.ecarts || []).filter(filtre);
  const aTrancher = (r?.a_trancher || []).filter(filtre);
  const retenus = ecarts.filter(l => coches.has(cle(l)));
  const bascule = l => setCoches(s => { const n = new Set(s); const k = cle(l); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toutCocher = oui => setCoches(s => { const n = new Set(s); ecarts.forEach(l => (oui ? n.add(cle(l)) : n.delete(cle(l)))); return n; });

  const corriger = async () => {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/controle-decisions/corriger', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, motif, lignes: retenus.map(l => ({ etudiant_id: l.etudiant_id, ue_num: l.ue_num, session: l.session })) }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || `Erreur ${rep.status}`);
      setFait(j.corrigees); setConfirmer(false); setMotif('');
      await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const Ligne = ({ l, cochable }) => (
    <tr className={`border-t border-slate-100 bg-white ${cochable && !coches.has(cle(l)) ? 'text-slate-400' : ''}`}>
      <td className="px-2 py-1 w-8">{cochable && <input type="checkbox" checked={coches.has(cle(l))} onChange={() => bascule(l)} aria-label="Corriger cette note" />}</td>
      <td className="px-2 py-1 whitespace-nowrap"><b>{(l.nom || '').toUpperCase()}</b> {l.prenom} <span className="text-slate-400">· {l.matricule || '—'}</span></td>
      <td className="px-2 py-1"><span className="tabular-nums">UE {l.ue_num}</span> <span className="text-slate-500">{l.ue_nom || ''}</span>
        {l.section && <span className="text-slate-400"> · {l.section}</span>}</td>
      <td className="px-2 py-1 whitespace-nowrap">{RESULTAT[l.resultat] || l.resultat}{l.session === 2 ? <span className="text-slate-400"> · S2</span> : ''}
        {l.faveur && <span className="text-slate-400"> · faveur</span>}</td>
      <td className="px-2 py-1 text-right tabular-nums">{cote(l.enregistree)}</td>
      <td className="px-2 py-1 text-right tabular-nums font-semibold">{cote(l.calculee)}</td>
      <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{SOURCE[l.source]} · {fr(l.decide_le)}</td>
    </tr>
  );
  const Entete = ({ cochable }) => (
    <thead className="tab-entete"><tr className="text-left text-xs text-slate-500">
      <th className="px-2 py-1.5 w-8">{cochable && !!ecarts.length && (
        <input type="checkbox" checked={retenus.length === ecarts.length} onChange={e => toutCocher(e.target.checked)} aria-label="Tout cocher" />)}</th>
      <th className="px-2 py-1.5">Étudiant</th><th className="px-2 py-1.5">Unité</th><th className="px-2 py-1.5">Décision</th>
      <th className="px-2 py-1.5 text-right">Enregistrée</th><th className="px-2 py-1.5 text-right">Calculée</th>
      <th className="px-2 py-1.5">Provenance</th></tr></thead>
  );

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-base font-semibold text-iip-blue">Contrôle des notes de décision</div>
        <p className="text-slate-500 text-second">
          La note d'unité enregistrée avec chaque décision, comparée à celle que Lucie calcule aujourd'hui — la même que
          le procès-verbal. C'est la note enregistrée que lisent l'attestation et le parcours. On corrige la cote, jamais
          la décision. Une décision reprise du classeur n'est pas cochée d'office : la note du classeur fait foi.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="controle" value={annee} onChange={e => setAnnee(e.target.value)} aria-label="Année">
          {anneesAutour(getAnnee()).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="controle" value={section} onChange={e => setSection(e.target.value)} aria-label="Section">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
      {fait != null && <div data-etat="reussi" className="bloc-etat px-3 py-2"><b>{fait} note(s) corrigée(s).</b> Elles sont au journal ci-dessous ; la liste est recalculée.</div>}
      {!r ? <p className="text-slate-400">Calcul de chaque décision de {annee}…</p> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl">
            <TuileEtat etat="neutre" valeur={r.controlees} libelle="Décisions contrôlées" precision={r.incalculables ? `${r.incalculables} sans calcul possible` : null} />
            <TuileEtat etat={ecarts.length ? 'surveiller' : 'reussi'} valeur={ecarts.length} libelle="Cotes à corriger" />
            <TuileEtat etat="neutre" valeur={retenus.length} libelle="Cochées" />
            <TuileEtat etat={aTrancher.length ? 'corriger' : 'neutre'} valeur={aTrancher.length} libelle="À reprendre en séance" />
          </div>

          {!ecarts.length && !aTrancher.length && <p className="text-slate-500">Aucun écart en {annee}{section ? ` pour ${section}` : ''}.</p>}

          {!!ecarts.length && (
            <div className="border border-slate-200 rounded-carte overflow-x-auto">
              <table className="w-full text-second"><Entete cochable /><tbody>
                {ecarts.map(l => <Ligne key={cle(l)} l={l} cochable />)}
              </tbody></table>
            </div>
          )}

          {!!retenus.length && (
            !direction ? <p className="text-slate-500 text-second">La correction est un geste de direction.</p> : (
              <div className="space-y-2 max-w-3xl">
                <label className="block text-second text-slate-600">Motif de la correction (écrit au journal de chaque décision)
                  <textarea className="controle w-full h-auto py-1.5 mt-1" rows={2} value={motif} onChange={e => setMotif(e.target.value)}
                    placeholder="Ex. : la note enregistrée était celle de l'écran avant le réglage de l'évaluation unique ; alignée sur le calcul du procès-verbal." />
                </label>
                {!confirmer ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <button className="bouton bouton-fort" disabled={enCours || motif.trim().length < 5} onClick={() => setConfirmer(true)}>
                      Corriger {retenus.length} note(s)</button>
                    {motif.trim().length < 5 && <span className="text-slate-500 text-second">Une correction se motive.</span>}
                  </div>
                ) : (
                  <div data-etat="surveiller" className="bloc-etat px-3 py-2 flex items-center gap-3 flex-wrap">
                    <span>Remplacer {retenus.length} note(s) enregistrée(s) par la note calculée ? Les résultats ne changent pas ; les attestations suivront.</span>
                    <button className="bouton bouton-fort" disabled={enCours} onClick={corriger}>{enCours ? '…' : 'Corriger'}</button>
                    <button className="bouton" onClick={() => setConfirmer(false)}>Annuler</button>
                  </div>
                )}
              </div>
            )
          )}

          {!!aTrancher.length && (
            <div className="space-y-1.5">
              <div className="text-sm font-semibold">À reprendre en séance — « réussi » sous le seuil, sans faveur</div>
              <p className="text-slate-500 text-second">
                Ici la cote n'est pas en cause : le calcul place l'unité sous dix et aucune faveur n'est enregistrée. Deux
                issues, et elles appartiennent au Conseil : poser la faveur (l'unité vaudra dix), ou revenir sur le résultat.
                Délibération → la séance de l'unité → <i>Corriger ou rouvrir…</i>
              </p>
              <div className="border border-slate-200 rounded-carte overflow-x-auto">
                <table className="w-full text-second"><Entete /><tbody>
                  {aTrancher.map(l => <Ligne key={cle(l)} l={l} />)}
                </tbody></table>
              </div>
            </div>
          )}

          {!!journal?.length && (
            <details className="text-second">
              <summary className="cursor-pointer text-slate-600">Journal des corrections ({journal.length})</summary>
              <div className="border border-slate-200 rounded-carte overflow-x-auto mt-1.5">
                <table className="w-full text-second">
                  <thead className="tab-entete"><tr className="text-left text-xs text-slate-500">
                    <th className="px-2 py-1.5">Le</th><th className="px-2 py-1.5">Par</th><th className="px-2 py-1.5">Étudiant</th>
                    <th className="px-2 py-1.5">Unité</th><th className="px-2 py-1.5 text-right">Avant</th><th className="px-2 py-1.5 text-right">Après</th>
                    <th className="px-2 py-1.5">Motif</th></tr></thead>
                  <tbody>{journal.map(c => (
                    <tr key={c.id} className="border-t border-slate-100 bg-white">
                      <td className="px-2 py-1 whitespace-nowrap">{fr(c.corrige_le)} {String(c.corrige_le || '').slice(11, 16)}</td>
                      <td className="px-2 py-1">{c.corrige_par || '—'}</td>
                      <td className="px-2 py-1 whitespace-nowrap"><b>{(c.nom || '').toUpperCase()}</b> {c.prenom}</td>
                      <td className="px-2 py-1 tabular-nums">UE {c.ue_num}{c.session === 2 ? ' · S2' : ''}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{cote(c.ancienne_note)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{cote(c.nouvelle_note)}</td>
                      <td className="px-2 py-1 text-slate-600">{c.motif}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

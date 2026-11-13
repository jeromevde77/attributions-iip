import { useState } from 'react';
import { IconFileImport, IconCheck } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

/* LES ATTRIBUTIONS DES ANNÉES PASSÉES (3.5.195, Charles : « Import_Lucie_TIM_2023-2025.csv » ; l'historique et l'ancienneté des
   professeurs, le pilotage des années passées). On dépose le fichier ; Lucie montre ce qu'elle écrira — professeurs reconnus,
   rapprochés, introuvables — puis on confirme. Une année passée seulement, et une section-année encore vide : tout ou rien. */
export default function ImportAttributionsHistorique({ onFermer, onFait }) {
  const [texte, setTexte] = useState('');
  const [nom, setNom] = useState('');
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [voir, setVoir] = useState('verifier');

  const lire = async (fichier) => {
    if (!fichier) return;
    const buf = await fichier.arrayBuffer();
    let t = new TextDecoder('utf-8').decode(buf);
    if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf);
    setNom(fichier.name); setTexte(t); envoyer(t, false);
  };
  async function envoyer(t, ecrire) {
    setEnCours(true); setErreur(null);
    try {
      const res = await fetch('/api/attributions/import-historique', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ texte: t, ecrire }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErreur(j.error || 'Refusé.'); if (j.paires) setR(j); return; }
      setR(j); if (ecrire) onFait?.();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }
  const lignes = (r?.lignes || []).filter(l => voir === 'tout' || l.alerte);
  return (
    <Fenetre icone={IconFileImport} large="ecran" titre="Importer des attributions — années passées" sous={nom || 'fichier CSV (séparateur « ; »)'} onFermer={onFermer}
      pied={<>
        <span className="text-second text-slate-500 min-w-0 flex-1">{r?.ecrit ? `${r.ecrit} attribution(s) écrite(s).` : r?.bloque ? `Rien ne peut être écrit : ${r.bloque}.` : r?.lignes ? 'Simulation : rien n’est encore écrit.' : ''}</span>
        {r?.lignes && !r.ecrit && !r.bloque && (
          <button className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={enCours} onClick={() => envoyer(texte, true)}>
            <IconCheck size={15} />Écrire les {r.totaux.lignes - (r.paires || []).filter(p => p.ignoree).reduce((t, p) => t + p.lignes, 0)} attributions</button>)}
      </>}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="file" accept=".csv,text/csv" onChange={e => lire(e.target.files?.[0])} />
          {enCours && <span className="text-slate-500">Lecture…</span>}
        </label>
        <p className="text-second text-slate-500 m-0">Une année passée, pour une section qui n’en a encore aucune : les colonnes se lisent à leur intitulé (Année, Section, N° UE, Code cours, Activité, Groupe, Contrat, Cours/EPT, Professeur, Périodes attribuées, Autonomie attribuée…). Un professeur absent de Lucie donne une ligne sans professeur : créez sa fiche dans Personnel, puis relisez le fichier.</p>
        {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
        {r?.paires && (
          <table className="w-full text-sm">
            <thead><tr className="tab-entete text-left"><th className="px-2 py-1">Année</th><th className="px-2 py-1">Section</th><th className="px-2 py-1 text-right">Lignes</th><th className="px-2 py-1">État</th></tr></thead>
            <tbody>{r.paires.map(p => (
              <tr key={p.annee + p.section} className="border-b border-slate-100">
                <td className="px-2 py-1">{p.annee}</td><td className="px-2 py-1">{p.section}</td><td className="px-2 py-1 text-right tabular-nums">{p.lignes}</td>
                <td className="px-2 py-1" style={{ color: p.bloque ? 'var(--c-refuse)' : p.ignoree ? 'var(--c-attente)' : 'var(--c-reussi)' }}>{p.bloque || p.ignoree || (r.ecrit ? 'écrite' : 'prête')}</td>
              </tr>))}</tbody>
          </table>)}
        {r?.totaux && (
          <p className="text-sm m-0"><b>{r.totaux.lignes}</b> lignes · <b>{r.totaux.periodes.toLocaleString('fr-BE')}</b> périodes · <b>{r.totaux.autonomie.toLocaleString('fr-BE')}</b> d’autonomie · <b>{r.totaux.sans_professeur}</b> sans professeur · <b>{r.totaux.a_verifier}</b> à vérifier</p>)}
        {r?.lignes && (<>
          <div className="segments">{[['verifier', 'À vérifier'], ['tout', 'Toutes']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setVoir(k)} className={voir === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>))}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-second">
              <thead><tr className="tab-entete text-left">
                <th className="px-2 py-1">Ligne</th><th className="px-2 py-1">Année</th><th className="px-2 py-1">UE</th><th className="px-2 py-1">Cours / activité</th>
                <th className="px-2 py-1">Gr.</th><th className="px-2 py-1">Nature</th><th className="px-2 py-1">Dans le fichier</th><th className="px-2 py-1">Professeur dans Lucie</th>
                <th className="px-2 py-1 text-right">Pér.</th><th className="px-2 py-1 text-right">Auto.</th><th className="px-2 py-1">À vérifier</th>
              </tr></thead>
              <tbody>{lignes.map(l => (
                <tr key={l.rang} className="border-b border-slate-100 align-top" style={{ boxShadow: `inset 3px 0 0 ${!l.professeur_id ? 'var(--c-refuse)' : l.alerte ? 'var(--c-attente)' : 'transparent'}` }}>
                  <td className="px-2 py-1 tabular-nums text-slate-500">{l.rang}</td><td className="px-2 py-1">{l.annee}</td><td className="px-2 py-1">{l.ue_num}</td>
                  <td className="px-2 py-1">{l.code_cours ? `${l.code_cours} · ` : ''}{l.activite}</td><td className="px-2 py-1">{l.code || ''}</td>
                  <td className="px-2 py-1">{l.coordination_encadrement}{l.cours_ept_ad === 'EPT' ? ' · EPT' : ''}{l.statut_exception ? ` · ${l.statut_exception}` : ''}</td>
                  <td className="px-2 py-1">{l.nom_source || '—'}</td><td className="px-2 py-1">{l.professeur || <i className="text-slate-400">aucun</i>}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{l.periodes}</td><td className="px-2 py-1 text-right tabular-nums">{l.autonomie}</td>
                  <td className="px-2 py-1 text-slate-600">{l.commentaire || ''}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>)}
      </div>
    </Fenetre>);
}

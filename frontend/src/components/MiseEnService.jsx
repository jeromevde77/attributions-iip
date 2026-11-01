/**
 * CONFIGURATION → MISE EN SERVICE (3.5.001, Charles, 30 octobre 2026 : « un onglet pour activer ou désactiver des
 * fonctions » ; tranché : trois états, Éteinte · Essai · Allumée). En essai, une fonction ne vaut que pour les étudiants
 * d'essai (espace des étudiants) ou les comptes d'essai (présence par QR) nommés plus bas. Serveur : lib/fonctions.js.
 */
import { useEffect, useState } from 'react';
import { IconPower, IconSchool, IconUserCheck, IconX, IconSearch, IconCertificate } from '@tabler/icons-react';
import { demander } from '../lib/dialogue.jsx';
import { authHeaders } from '../lib/api.js';
import { nomDuCompte } from '../lib/nom.js';

const LIBELLES = { eteinte: 'Éteinte', essai: 'Essai', allumee: 'Allumée' };
const COULEUR = { eteinte: 'var(--c-indisponible, #94A3B8)', essai: 'var(--c-attente, #B45309)', allumee: 'var(--c-reussi, #3E7D5E)' };

/* LES ANNÉES PASSÉES DANS LES ESPACES (3.5.027, Charles : « pour tous les résultats antérieurs, toutes les attestations
   de réussite, de VA… dans les espaces des étudiants »). Compter d'abord, puis déposer ; aucun courriel. */
const NATURES_HIST = { hist_reussite: 'attestations de réussite', hist_va: 'attestations de VA', hist_recap: 'documents « toutes les années »' };
function AnneesPassees() {
  const [b, setB] = useState(null);
  const [encours, setEncours] = useState(false);
  const [fait, setFait] = useState(null);
  const [erreur, setErreur] = useState(null);
  const appel = async (methode) => {
    setEncours(true); setErreur(null);
    try {
      const r = await fetch('/api/fonctions/historique', { method: methode, headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'refus du serveur');
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setEncours(false); }
  };
  const simuler = async () => { setFait(null); setB(await appel('GET')); };
  const deposer = async () => {
    if (!(await demander(`Déposer ${b.pieces} pièce(s) dans les espaces de ${b.etudiants} étudiant(s) ? Aucun courriel ne part.`))) return;
    // Par lots de cent étudiants, jusqu'au bout ; les totaux s'additionnent.
    const total = { ...b, etudiants: 0, pieces: 0, deja: b.deja, par_annee: {}, par_nature: {}, par_section: {}, manques: [] };
    const ajouter = (o, x) => Object.entries(x).forEach(([k, n]) => { o[k] = (o[k] || 0) + n; });
    setB(null);
    for (;;) {
      const r = await appel('POST');
      if (!r) break;
      total.etudiants += r.etudiants; total.pieces += r.pieces;
      ajouter(total.par_annee, r.par_annee); ajouter(total.par_nature, r.par_nature); ajouter(total.par_section, r.par_section);
      setFait({ ...total, encours: r.reste });
      if (!r.reste) break;
    }
  };
  return (
    <section className="bg-white rounded-lg border border-gray-200 px-4 py-3 space-y-3">
      <div className="intertitre flex items-center gap-2"><IconCertificate size={15} /> Les années passées dans les espaces</div>
      <p className="text-second text-slate-500">Pour chaque étudiant, archivés compris : une attestation de réussite par unité réussie avant
        l’année active, une attestation par valorisation complète, et un document qui les réunit toutes. Ce sont les pièces d’Éditions. Elles
        entrent au registre des envois et paraissent dans « Mes documents » dès que l’espace est ouvert à l’étudiant. <b>Aucun courriel ne part</b> ;
        une pièce déjà déposée ne l’est pas deux fois.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="bouton" disabled={encours} onClick={simuler}>{encours && !b ? 'Calcul…' : 'Compter ce qui serait déposé'}</button>
        {b && b.pieces > 0 && <button type="button" className="bouton bouton-fort" disabled={encours} onClick={deposer}>{encours ? 'Dépôt…' : `Déposer ${b.pieces} pièce(s)`}</button>}
      </div>
      {erreur && <p className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</p>}
      {(b || fait) && (() => {
        const x = b || fait;
        return (
          <div className="text-second text-slate-700 space-y-1.5">
            <p className="m-0"><b>{x.pieces}</b> pièce(s) {fait ? (fait.encours ? 'déposée(s) — dépôt en cours…' : 'déposée(s)') : 'à déposer'} pour <b>{x.etudiants}</b> étudiant(s) (années avant {x.annee_active})
              {x.deja ? ` · ${x.deja} déjà déposée(s)` : ''}.</p>
            {Object.keys(x.par_nature).length > 0 && <p className="m-0">{Object.entries(x.par_nature).map(([k, n]) => `${n} ${NATURES_HIST[k] || k}`).join(' · ')}</p>}
            {Object.keys(x.par_annee).length > 0 && <p className="m-0 text-slate-500">Par année : {Object.entries(x.par_annee).sort().map(([k, n]) => `${k === 'toutes' ? 'toutes années' : k} ${n}`).join(' · ')}</p>}
            {Object.keys(x.par_section).length > 0 && <p className="m-0 text-slate-500">Par section : {Object.entries(x.par_section).sort().map(([k, n]) => `${k} ${n}`).join(' · ')}</p>}
            {x.manques?.length > 0 && (
              <details className="mt-1"><summary className="cursor-pointer text-amber-800">{x.manques.length} pièce(s) non composée(s) : il leur manque une mention</summary>
                <ul className="mt-1 pl-4 list-disc max-h-60 overflow-auto">{x.manques.map((m, i) => <li key={i}>{m}</li>)}</ul></details>)}
          </div>);
      })()}
    </section>
  );
}

function Personnes({ titre, icone: Ic, aide, l, nom, onRetirer, chercher, onAjouter }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => chercher(q.trim()).then(setRes).catch(() => setRes([])), 250);
    return () => clearTimeout(t);
  }, [q, chercher]);
  return (
    <div className="space-y-2">
      <div className="intertitre flex items-center gap-2"><Ic size={15} /> {titre} ({l.length})</div>
      <p className="text-second text-slate-500">{aide}</p>
      <div className="flex flex-wrap gap-1.5">
        {l.map(x => (
          <span key={x.id} className="inline-flex items-center gap-1 border border-slate-200 rounded-champ bg-white px-2 py-1 text-second">
            {nom(x)}
            <button type="button" className="text-slate-400 hover:text-red-700" title="Retirer" onClick={() => onRetirer(x.id)}><IconX size={13} /></button>
          </span>))}
        {!l.length && <span className="text-second text-slate-400">Personne pour l’instant.</span>}
      </div>
      <div className="relative max-w-sm">
        <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="controle controle-icone w-full" placeholder="Chercher un nom pour l’ajouter…" value={q} onChange={e => setQ(e.target.value)} />
        {res.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-champ shadow-flottant max-h-64 overflow-auto">
            {res.filter(x => !l.some(y => y.id === x.id)).map(x => (
              <li key={x.id}><button type="button" className="w-full text-left px-3 py-1.5 text-second hover:bg-slate-50"
                onClick={() => { onAjouter(x.id); setQ(''); setRes([]); }}>{nom(x)}</button></li>))}
          </ul>)}
      </div>
    </div>
  );
}

export default function MiseEnService() {
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = () => fetch('/api/fonctions', { headers: authHeaders() })
    .then(x => (x.ok ? x.json() : x.json().then(j => Promise.reject(new Error(j.error || 'Refusé.'))))).then(setR).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const regler = async corps => {
    const x = await fetch('/api/fonctions', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(corps) });
    const j = await x.json().catch(() => ({}));
    if (!x.ok) { setErreur(j.error || 'Refusé.'); return; }
    setErreur(null); setR(j);
  };
  if (erreur && !r) return <p className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</p>;
  if (!r) return null;
  const nomEtudiant = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
  const groupe = (famille, titre) => (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-iip-blue/5 border-b border-gray-200"><h2 className="titre-carte">{titre}</h2></div>
      <ul className="divide-y divide-slate-100">
        {r.catalogue.filter(c => c.famille === famille).map(c => {
          const etat = r.etats[c.cle];
          return (
            <li key={c.cle} className="flex flex-wrap items-start gap-3 px-4 py-3" style={{ boxShadow: `inset 4px 0 0 ${COULEUR[etat]}` }}>
              <div className="flex-1 min-w-[14rem]">
                <div className="font-semibold text-iip-texte">{c.titre}</div>
                <div className="text-second text-slate-600">{c.quoi}</div>
              </div>
              <div className="segments shrink-0">
                {Object.entries(LIBELLES).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => regler({ etats: { [c.cle]: k } })}
                    className={`px-3 py-1 text-second ${etat === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
              </div>
            </li>);
        })}
      </ul>
    </section>);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 flex items-start gap-2"><IconPower size={16} className="mt-0.5 shrink-0" />
        <span>Chaque fonction s’allume quand vous le décidez. <b>Éteinte</b> : elle n’existe pour personne. <b>Essai</b> : seulement
        pour les personnes d’essai nommées plus bas — les autres ne voient rien et ne reçoivent aucun courriel. <b>Allumée</b> : pour tous.
        Un étudiant n’entre dans son espace que si au moins une fonction est ouverte pour lui.</span></p>
      {erreur && <p className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</p>}
      {groupe('espace', 'L’espace des étudiants')}
      {groupe('personnel', 'Le personnel')}
      <AnneesPassees />
      <section className="bg-white rounded-lg border border-gray-200 px-4 py-3 space-y-5">
        <Personnes titre="Étudiants d’essai" icone={IconSchool} l={r.etudiants} nom={nomEtudiant}
          aide="Ils voient les fonctions en essai de l’espace des étudiants. Un dossier fictif, ou des volontaires."
          chercher={q => fetch(`/api/etudiants?q=${encodeURIComponent(q)}`, { headers: authHeaders() }).then(x => (x.ok ? x.json() : [])).then(l => (Array.isArray(l) ? l : []).slice(0, 8))}
          onAjouter={id => regler({ etudiants_essai: [...r.etudiants_essai, id] })}
          onRetirer={id => regler({ etudiants_essai: r.etudiants_essai.filter(x => x !== id) })} />
        <Personnes titre="Comptes d’essai" icone={IconUserCheck} l={r.comptes} nom={c => nomDuCompte(c.nom_complet, c.email)}
          aide="Ils voient les fonctions en essai du personnel (la présence par QR et le ticket de sortie)."
          chercher={q => fetch('/api/users', { headers: authHeaders() }).then(x => (x.ok ? x.json() : [])).then(l => (Array.isArray(l) ? l : l.users || [])
            .filter(u => `${u.nom_complet || ''} ${u.email || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8))}
          onAjouter={id => regler({ comptes_essai: [...r.comptes_essai, id] })}
          onRetirer={id => regler({ comptes_essai: r.comptes_essai.filter(x => x !== id) })} />
      </section>
    </div>
  );
}

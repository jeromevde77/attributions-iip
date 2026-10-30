/**
 * CONFIGURATION → MISE EN SERVICE (3.5.001, Charles, 30 octobre 2026 : « un onglet pour activer ou désactiver des
 * fonctions » ; tranché : trois états, Éteinte · Essai · Allumée). En essai, une fonction ne vaut que pour les étudiants
 * d'essai (espace des étudiants) ou les comptes d'essai (présence par QR) nommés plus bas. Serveur : lib/fonctions.js.
 */
import { useEffect, useState } from 'react';
import { IconPower, IconSchool, IconUserCheck, IconX, IconSearch } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { nomDuCompte } from '../lib/nom.js';

const LIBELLES = { eteinte: 'Éteinte', essai: 'Essai', allumee: 'Allumée' };
const COULEUR = { eteinte: 'var(--c-indisponible, #94A3B8)', essai: 'var(--c-attente, #B45309)', allumee: 'var(--c-reussi, #3E7D5E)' };

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

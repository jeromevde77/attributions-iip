/**
 * LES FONCTIONS D'UNE PERSONNE (direction, secrétariat, coordinations…), pour
 * l'année de travail — dans la fiche de consultation ET dans la fiche de
 * saisie (Charles, 7 octobre 2026 : « je mets où la fonction de direction ? »
 * — la fiche de saisie renvoyait à un écran supprimé). Un seul chemin
 * d'écriture : PUT /ref/personnel-mission.
 *
 * L'ETP fait le coût des fonctions (Coûts et recettes des formations) : en
 * périodes B pour la direction et le secrétariat, en ETP × 800 pour une
 * coordination ou une fonction HELB tenue sans période attribuée.
 */
import { useEffect, useState } from 'react';
import { api, getAnnee } from '../lib/api.js';
import { passeRole } from '../lib/droits.js';

export default function FonctionsPanel({ profId }) {
  const annee = getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [ouvertes, setOuvertes] = useState(() => new Set());   // sections dépliées à la main
  const peutRegler = passeRole(['admin', 'editeur']);
  const charger = () => fetch(`/api/ref/personnel-fonctions/${profId}?annee=${encodeURIComponent(annee)}`,
    { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    .then(r => r.json()).then(setD).catch(e => setErreur(e.message));
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [profId, annee]);
  const poser = async (portee, f, champs) => {
    setEnCours(`${portee.code}|${f.libelle}`); setErreur(null);
    try {
      await api.setMission({ professeur_id: profId, fonction: f.libelle, section_code: portee.code, annee_scolaire: annee, ...champs });
      await charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(null); }
  };
  if (!d) return <div className="text-[13px] text-slate-400">{erreur || 'Chargement…'}</div>;
  const etab = d.portees.find(p => p.code === '__ETAB__');
  const sections = d.portees.filter(p => p.code !== '__ETAB__');
  const visibles = sections.filter(p => p.fonctions.some(f => f.actif) || ouvertes.has(p.code));
  const autres = sections.filter(p => !visibles.includes(p));
  const nombre = (valeur, placeholder, titre, onPose) => (
    <input type="number" min="0" max="2" step="0.05" disabled={!peutRegler} defaultValue={valeur ?? ''} placeholder={placeholder}
      title={titre} onClick={e => e.preventDefault()}
      onBlur={e => { const b = String(e.target.value).trim().replace(',', '.'); const v = b === '' ? null : parseFloat(b);
        if (v !== (valeur ?? null)) onPose(v); }}
      className="w-16 h-7 border border-slate-300 rounded-champ px-1 text-[12px] text-right bg-white" />
  );
  const bloc = p => (
    <div key={p.code} className="carte px-3 py-2">
      <div className="text-[13px] font-semibold text-iip-blue mb-1">{p.libelle}</div>
      <table className="w-full text-[13px]">
        {p.fonctions.some(f => f.actif) && (
          <thead><tr className="text-[10px] uppercase text-slate-400"><th /><th className="text-left font-normal">Fonction</th>
            <th className="font-normal w-16">ETP</th>{p.code !== '__ETAB__' && <th className="font-normal w-16">dont HELB</th>}</tr></thead>)}
        <tbody>
          {p.fonctions.map(f => (
            <tr key={f.id}>
              <td className="w-6"><input type="checkbox" checked={f.actif} disabled={!peutRegler || enCours === `${p.code}|${f.libelle}`}
                onChange={() => poser(p, f, { actif: !f.actif })} /></td>
              <td className={f.actif ? 'text-slate-800 font-medium' : 'text-slate-600'}>{f.libelle}</td>
              <td className="py-0.5">{f.actif && nombre(f.etp, 'ETP', 'Temps de travail dans la fonction (1 = temps plein)', v => poser(p, f, { etp: v }))}</td>
              {p.code !== '__ETAB__' && <td className="py-0.5">{f.actif && nombre(f.etp_helb || null, 'HELB', 'Part de cet ETP financée par la HELB', v => poser(p, f, { etp_helb: v || 0 }))}</td>}
            </tr>))}
        </tbody>
      </table>
    </div>
  );
  const actives = d.portees.flatMap(p => p.fonctions.filter(f => f.actif).map(f => `${f.libelle} (${p.code === '__ETAB__' ? 'établissement' : p.code})`));
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-slate-500">
        Fonctions en {annee} : {actives.length ? <b className="text-slate-700">{actives.join(' · ')}</b> : 'aucune'}.
        {' '}L’ETP fait le coût des fonctions dans « Coûts et recettes des formations ».
        {!peutRegler && ' Réservé à l’administration : lecture seule.'}
      </p>
      {erreur && <p className="text-[12px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {etab && bloc(etab)}
        {visibles.map(bloc)}
      </div>
      {peutRegler && autres.length > 0 && (
        <select className="controle text-[13px]" value="" onChange={e => e.target.value && setOuvertes(s => new Set([...s, e.target.value]))}>
          <option value="">+ Une fonction dans une autre section…</option>
          {autres.map(p => <option key={p.code} value={p.code}>{p.libelle}</option>)}
        </select>)}
    </div>
  );
}

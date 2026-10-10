import { useState } from 'react';
import { Fenetre, Encadre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

/**
 * COMPLÉTER LES FICHES DU PERSONNEL (6 octobre 2026) — depuis le fichier
 * « PROFESSEURS » de l'application de gestion (adresses, téléphones,
 * courriels, appellation, matricule) et la liste « matricule, diplômes ».
 * Le classeur se lit ici ; le serveur rapproche, simule, puis complète — il
 * n'écrase jamais une valeur présente, il la nomme si elle diffère.
 */
async function lire(fichier) {
  if (!fichier) return [];
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
    .filter(l => Object.values(l).some(v => String(v).trim()));
}

export default function ImportPersonnelFwb({ onClose, onTermine }) {
  const [profs, setProfs] = useState(null);
  const [diplomes, setDiplomes] = useState(null);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [foi, setFoi] = useState(false);

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const corps = { simulation, coordonnees_font_foi: foi, profs: await lire(profs), diplomes: await lire(diplomes) };
      const r = await fetch('/api/import-personnel/fwb', { method: 'POST', headers: authHeaders(), body: JSON.stringify(corps) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setRapport(j);
      if (!simulation) onTermine?.();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  const champs = { matricule: 'Matricule', sexe: 'Sexe', date_naissance: 'Date de naissance', adresse_rue: 'Adresse',
    code_postal: 'Code postal', commune: 'Localité', tel_gsm: 'GSM', mail_prive: 'Courriel privé', adresse_mail: 'Courriel école' };
  const fichier = (lib, aide, set, val) => (
    <label className="block text-sm">
      <span className="font-semibold text-slate-700">{lib}</span>
      <span className="block text-second text-slate-500 mb-1">{aide}</span>
      <input type="file" accept=".xls,.xlsx,.csv" onChange={e => { set(e.target.files?.[0] || null); setRapport(null); }} />
      {val && <span className="ml-2 text-second text-slate-500">{val.name}</span>}
    </label>
  );

  return (
    <Fenetre titre="Compléter les fiches du personnel" large="moyenne" onFermer={onClose}
      pied={<>
        <span className="text-second text-slate-500 min-w-0">
          {rapport?.ecrit ? 'Écrit.' : rapport ? 'Simulation : rien n’est encore écrit.' : 'Simulez d’abord : rien ne s’écrit sans que vous ayez vu ce qui le sera.'}
        </span>
        <button className="bouton" onClick={onClose}>Fermer</button>
        <button className="bouton" disabled={enCours || (!profs && !diplomes)} onClick={() => envoyer(true)}>Simuler</button>
        <button className="bouton bouton-fort" disabled={enCours || !rapport || rapport.ecrit} onClick={() => envoyer(false)}>
          Compléter les fiches</button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Lucie complète ce qui est <b>vide</b> sur les fiches : matricule, sexe, date de naissance (lus du matricule),
          adresse, GSM, courriels. Une valeur déjà présente qui diffère du fichier est signalée, jamais remplacée.
          Les diplômes deviennent des titres de capacité pour qui n’en a aucun.
        </p>
        {fichier('Fichier des professeurs', 'Matricule, appellation, nom, prénom, adresse, CP, localité, téléphones, courriels (ex. PROFESSEURS_….xls).', setProfs, profs)}
        {fichier('Liste des diplômes (facultatif)', 'Id_Prof (matricule), nom, Dip1, Dip2, Dip3.', setDiplomes, diplomes)}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={foi} onChange={e => { setFoi(e.target.checked); setRapport(null); }} className="mt-0.5" />
          <span><b>Le fichier fait foi pour les coordonnées</b> — l’adresse, le GSM et le courriel privé du fichier remplacent ceux de Lucie
            quand ils diffèrent. Sinon, ils ne remplissent que les cases vides. Un courriel invalide (accent, espace) est toujours remplacé.</span>
        </label>
        {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
        {rapport && (
          <div className="space-y-3 text-sm">
            <Encadre etat={rapport.ecrit ? 'reussi' : 'neutre'}>
              <b>{rapport.retrouves}</b> personne(s) retrouvée(s) sur {rapport.lignes}
              {Object.keys(rapport.methodes).length ? ` (${Object.entries(rapport.methodes).map(([k, n]) => `${n} par ${k}`).join(', ')})` : ''}.
              {' '}<b>{rapport.ecritures.length}</b> fiche(s) {rapport.ecrit ? 'complétée(s)' : 'à compléter'}
              {Object.keys(rapport.champs).length ? ` : ${Object.entries(rapport.champs).map(([k, n]) => `${champs[k] || k} ${n}`).join(' · ')}` : ''}.
              {rapport.titres_personnes ? <> <b>{rapport.titres_ajoutes}</b> diplôme(s) pour {rapport.titres_personnes} personne(s){rapport.titres_deja ? ` (${rapport.titres_deja} ont déjà des titres : inchangés)` : ''}.</> : ''}
            </Encadre>
            {!!rapport.remplacements.length && (
              <Encadre etat="neutre">
                <b>{rapport.remplacements.length} valeur(s) {rapport.ecrit ? 'remplacée(s)' : 'à remplacer'}</b> :
                <ul className="mt-1 list-disc pl-5">{rapport.remplacements.map((x, i) => (
                  <li key={i}>{x.nom} — {x.champ} : « {x.avant} » → « {x.apres} »</li>))}</ul>
              </Encadre>
            )}
            {!!rapport.desaccords.length && (
              <Encadre etat="surveiller">
                <b>{rapport.desaccords.length} désaccord(s)</b> entre Lucie et le fichier — rien n’est changé, à vérifier sur la fiche :
                <ul className="mt-1 list-disc pl-5">{rapport.desaccords.map((x, i) => (
                  <li key={i}>{x.nom} — {x.champ} : Lucie « {x.lucie} », fichier « {x.fichier} »</li>))}</ul>
              </Encadre>
            )}
            {!!rapport.absents.length && (
              <Encadre etat="surveiller">
                <b>{rapport.absents.length} personne(s) du fichier sans fiche dans Lucie</b> — non créées : {rapport.absents.join(', ')}.
              </Encadre>
            )}
            {!!rapport.diplomes_sans_fiche.length && (
              <p className="text-second text-slate-500">Diplômes sans fiche correspondante : {rapport.diplomes_sans_fiche.join(', ')}.</p>
            )}
          </div>
        )}
      </div>
    </Fenetre>
  );
}

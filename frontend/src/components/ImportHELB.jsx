import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconUsersPlus, IconFileSpreadsheet } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre, TuileEtat } from './ui.jsx';

/**
 * LES ORTHOPTISTES DE LA HELB (Charles, 30 septembre 2026 : « le tronc commun
 * regroupe deux sections, Optométrie et Orthoptie ; l'orthoptie est gérée par
 * la HELB, mais c'est moi qui organise les UE du tronc commun »).
 *
 * Le fichier : la liste d'inscrits que la HELB transmet (« new inscrit B1 »,
 * .xls). La simulation dit ce qui sera fait — section créée, unités de tronc
 * commun rattachées, dossiers ouverts ou complétés — et « Importer » reste gris
 * tant qu'elle n'a pas eu lieu sur CE fichier. Aucune inscription à une unité :
 * les programmes se composent un à un dans le PAE.
 */
export default function ImportHELB({ onClose, onTermine }) {
  const [annee] = useState(getAnnee());
  const [fichier, setFichier] = useState(null);   // { nom, lignes }
  const [r, setR] = useState(null);
  const [exclus, setExclus] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);
  const entree = useRef(null);

  const appeler = async (lignes, simulation) => {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/import-helb', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, lignes, simulation, exclus: [...exclus] }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || `Erreur ${rep.status}`);
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setEnCours(false); }
  };

  const lire = async f => {
    setR(null); setFait(null); setExclus(new Set());
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      /* DEUX FORMATS DE LA HELB (8 octobre 2026). L'avis « new inscrit B1 » avait
         ses colonnes en minuscules sur la première feuille ; l'exportation
         « cursus sans les cours » met une feuille « Informations » devant les
         « Données », et écrit « Matricule · Nom · Prénom · Courriel ». On prend
         la feuille qui porte un matricule, et l'on ramène les en-têtes à la
         forme attendue (minuscules, sans accents ; « Courriel » est l'adresse). */
      const cle = k => String(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
        .replace(/\s+/g, '_').replace(/^courriel$/, 'email');
      let lignes = [];
      for (const n of wb.SheetNames) {
        const brutes = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: false });
        const l = brutes.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [cle(k), v])));
        if (l.length && 'matricule' in l[0] && 'nom' in l[0]) { lignes = l; break; }
      }
      if (!lignes.length || !('matricule' in lignes[0]) || !('nom' in lignes[0])) {
        setErreur("Ce fichier n'a pas les colonnes de la liste HELB (matricule, nom, prenom…)."); return;
      }
      setFichier({ nom: f.name, lignes });
      const j = await appeler(lignes, true);
      if (j) setR(j);
    } catch (e) { setErreur(`Fichier illisible : ${e.message}`); }
  };

  const importer = async () => {
    const j = await appeler(fichier.lignes, false);
    if (j) { setFait(j); onTermine?.(); const s = await appeler(fichier.lignes, true); if (s) setR(s); }
  };

  const bascule = i => setExclus(s => { const n = new Set(s); n.has(String(i)) ? n.delete(String(i)) : n.add(String(i)); return n; });
  const ACTION = { creer: 'à créer', completer: 'à compléter', a_trancher: 'à trancher', ignore: 'ignorée' };
  const retenus = r ? r.lignes.filter(l => ['creer', 'completer'].includes(l.action) && !exclus.has(String(l.i))).length : 0;
  const aLier = r ? r.tronc_commun.filter(u => u.a_lier) : [];

  return (
    <Fenetre icone={IconUsersPlus} large="grande" onFermer={onClose}
      titre="Créer les étudiants d'orthoptie (HELB)"
      sous={`Liste des inscrits transmise par la HELB — section Orthoptie, ${annee}`}
      pied={<>
        <span className="flex-1 min-w-0 text-[12px] text-slate-500">
          {!r ? 'Choisissez le fichier : la simulation se fait d’elle-même.'
            : `${retenus} dossier(s) seront créés ou complétés. Aucune inscription à une unité : les programmes se composent dans le PAE.`}
        </span>
        <button className="bouton" onClick={onClose}>Fermer</button>
        <button className="bouton bouton-fort" disabled={!r || enCours || (!retenus && !aLier.length && !r.section_a_creer)} onClick={importer}>
          {enCours ? '…' : 'Importer'}</button>
      </>}>
      <div className="space-y-3 text-[13px]">
        <div className="flex items-center gap-2">
          <input ref={entree} type="file" accept=".xls,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && lire(e.target.files[0])} />
          <button className="bouton" onClick={() => entree.current?.click()}><IconFileSpreadsheet size={14} /> {fichier ? 'Changer de fichier' : 'Choisir le fichier HELB'}</button>
          {fichier && <span className="text-slate-500">{fichier.nom} · {fichier.lignes.length} ligne(s)</span>}
        </div>
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        {fait && <div data-etat="reussi" className="bloc-etat px-3 py-2"><b>{fait.crees} dossier(s) créé(s), {fait.completes} complété(s)</b>
          {fait.ue_rattachees ? `, ${fait.ue_rattachees} unité(s) de tronc commun rattachée(s) à Orthoptie` : ''}.
          {fait.a_trancher ? ` ${fait.a_trancher} dossier(s) à trancher à la main.` : ''}</div>}
        {r && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <TuileEtat etat="neutre" valeur={r.resume.creer} libelle="À créer" />
              <TuileEtat etat="neutre" valeur={r.resume.completer} libelle="Déjà connus, à compléter" />
              <TuileEtat etat={r.resume.a_trancher ? 'surveiller' : 'neutre'} valeur={r.resume.a_trancher} libelle="Dans une autre section" />
              <TuileEtat etat={r.resume.sans_adresse ? 'surveiller' : 'neutre'} valeur={r.resume.sans_adresse} libelle="Sans adresse HELB" precision="le fichier n'en porte pas" />
              <TuileEtat etat="neutre" valeur={aLier.length} libelle="UE de tronc commun à rattacher" />
            </div>
            <div className="text-[12px] text-slate-600">
              {r.section_a_creer && <p>La section <b>Orthoptie</b> sera créée.</p>}
              <p>Tronc commun {annee} : {r.tronc_commun.length
                ? r.tronc_commun.map(u => `UE ${u.ue_num}${u.a_lier ? '' : ' (déjà rattachée)'}`).join(' · ')
                : 'aucune unité marquée « tronc commun » cette année.'}</p>
            </div>
            <div className="border border-slate-200 rounded-carte overflow-x-auto max-h-[46vh] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead className="tab-entete sticky top-0"><tr className="text-left text-[11px] text-slate-500">
                  <th className="px-2 py-1.5 w-8"></th><th className="px-2 py-1.5">Étudiant</th><th className="px-2 py-1.5">Matricule HELB</th>
                  <th className="px-2 py-1.5">Ce qui sera fait</th><th className="px-2 py-1.5">Adresse</th></tr></thead>
                <tbody>
                  {r.lignes.map(l => {
                    const cochable = ['creer', 'completer'].includes(l.action);
                    return (
                      <tr key={l.i} className={`border-t border-slate-100 bg-white ${!cochable || exclus.has(String(l.i)) ? 'text-slate-400' : ''}`}>
                        <td className="px-2 py-1">{cochable && <input type="checkbox" checked={!exclus.has(String(l.i))} onChange={() => bascule(l.i)} aria-label="Importer cette ligne" />}</td>
                        <td className="px-2 py-1 whitespace-nowrap"><b>{l.nom}</b> {l.prenom}</td>
                        <td className="px-2 py-1 tabular-nums">{l.matricule || '—'}</td>
                        <td className="px-2 py-1">{ACTION[l.action]}
                          {l.methode && <span className="text-slate-400"> · reconnu par {l.methode}{l.id_ecampus ? ` (${l.id_ecampus})` : ''}</span>}
                          {l.action === 'a_trancher' && <span className="block text-[11px] text-iip-texte">rattaché à {l.section_actuelle} : il n'est pas déplacé</span>}
                          {l.raison && <span className="text-slate-400"> · {l.raison}</span>}</td>
                        <td className="px-2 py-1 text-slate-500">{l.email || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Fenetre>
  );
}

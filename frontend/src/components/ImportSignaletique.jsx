import { useEffect, useMemo, useRef, useState } from 'react';
import { IconUsersPlus, IconFileSpreadsheet, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * CRÉER DES ÉTUDIANTS SUR BASE D'UNE BASE DE DONNÉES EXTERNE — le nom est de
 * Charles (21 septembre 2026). Le fichier attendu : l'export eCampus
 * « R_Etudiants_Excel ».
 *
 * Demandé par Charles le 21 septembre 2026. L'importateur sur mesure
 * « complète les dossiers existants » : c'est ce qu'il annonce, et la création
 * y était une case facultative qu'on ne pouvait pas deviner. Cette porte-ci
 * est faite pour UN fichier : ses colonnes s'associent d'elles-mêmes, on ne
 * choisit que la section.
 *
 * RIEN NE S'ÉCRIT SANS QU'ON AIT VU CE QUI SERA ÉCRIT : « Importer » reste gris
 * tant que la simulation n'a pas été faite sur ce fichier et cette section —
 * changer l'un ou l'autre oblige à resimuler.
 */
export default function ImportSignaletique({ onClose, onTermine }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [fichier, setFichier] = useState(null);     // { nom, lignes }
  const [rapport, setRapport] = useState(null);     // réponse de la simulation / de l'import
  const [simuleSur, setSimuleSur] = useState(null); // clé fichier+section simulée
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const entree = useRef(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setSections(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, []);

  const cle = fichier ? `${fichier.nom}|${fichier.lignes.length}|${section}` : null;
  const simule = !!cle && simuleSur === cle && rapport?.simulation;
  const fait = rapport && !rapport.simulation;

  async function lire(f) {
    if (!f) return;
    setErreur(null); setRapport(null); setSimuleSur(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Tout en texte : un matricule « 26-00071 » ou un code postal lu comme
      // un nombre perdrait ses zéros ou son tiret.
      const lignes = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      if (!lignes.length) throw new Error('Le fichier ne contient aucune ligne.');
      if (!('Id_Etud' in lignes[0])) {
        throw new Error('Ce n’est pas l’export eCampus des étudiants : la colonne Id_Etud manque. '
          + 'Pour un autre fichier, passez par l’importateur sur mesure.');
      }
      setFichier({ nom: f.name, lignes });
    } catch (e) { setFichier(null); setErreur(e.message); }
  }

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/etudiants/import-signaletique', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ lignes: fichier.lignes, section: section || null, simulation }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      setRapport(j);
      if (simulation) setSimuleSur(cle);
      else onTermine?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const manque = !fichier ? 'Choisissez le fichier eCampus.'
    : !simule && !fait ? 'Simulez d’abord : rien ne s’écrit avant.' : null;

  return (
    <Fenetre icone={IconUsersPlus} large="grande" onFermer={onClose}
      titre="Créer des étudiants sur base d’une base de données externe"
      sous="Export eCampus « R_Etudiants_Excel » — crée les nouveaux, complète les dossiers connus"
      pied={<>
        {!fait ? (
          <>
            <button className="bouton disabled:opacity-40" disabled={!fichier || enCours}
              onClick={() => envoyer(true)}>
              {enCours && !simule ? 'Simulation…' : 'Simuler'}
            </button>
            <button className="bouton bouton-fort disabled:opacity-40"
              disabled={!simule || enCours} onClick={() => envoyer(false)}>
              {enCours && simule ? 'Import…'
                : simule ? `Importer — ${rapport.nb_crees} à créer, ${rapport.nb_completes} à compléter`
                  : 'Importer'}
            </button>
          </>
        ) : null}
        <span className="text-[12px] text-slate-500 min-w-0">
          {fait ? `Fait : ${rapport.nb_crees} dossier(s) créé(s), ${rapport.nb_completes} complété(s).` : manque}
        </span>
        <button className="bouton ml-auto" onClick={onClose}>{fait ? 'Fermer' : 'Annuler'}</button>
      </>}>

      <div className="space-y-3">
        {erreur && (
          <div className="carte p-3 text-[12px] text-rose-700 flex items-start gap-1.5">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <button className="bouton" onClick={() => entree.current?.click()} disabled={enCours || fait}>
              <IconFileSpreadsheet size={15} className="inline -mt-0.5 mr-1" />
              {fichier ? 'Autre fichier' : 'Choisir le fichier'}
            </button>
            <input ref={entree} type="file" className="hidden" accept=".xls,.xlsx,.csv"
              onChange={e => { lire(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <label className="text-[12px] text-slate-600">
            <span className="block mb-0.5">Section de rattachement des nouveaux</span>
            <select value={section} onChange={e => setSection(e.target.value)} disabled={fait}
              className="controle text-[13px] min-w-[16rem]">
              <option value="">— aucune pour l’instant —</option>
              {sections.map(s0 => <option key={s0.code} value={s0.code}>{s0.libelle || s0.code}</option>)}
            </select>
          </label>
          {fichier && (
            <span className="text-[12px] text-slate-500 pb-2">
              « {fichier.nom} » — {fichier.lignes.length} ligne(s)
            </span>
          )}
        </div>

        {!section && fichier && (
          <p className="text-[12px] text-slate-500">
            Sans section, les nouveaux étudiants ne se rangent chez aucune coordination :
            seuls ceux qui voient toutes les sections les verront, sous « (sans section) ».
          </p>
        )}

        <div className="carte p-3 text-[12px] text-slate-600 space-y-1">
          <div><b>Retrouvé</b> (numéro national, puis matricules, puis nom + prénom + date de
            naissance) : on complète les champs <b>vides</b> — rien n’est écrasé — et le
            matricule de l’année rejoint le dossier sans remplacer l’ancien.</div>
          <div><b>Inconnu</b> : un dossier est créé, rattaché à la section choisie.</div>
          <div><b>Sans nom ni prénom</b> : la ligne est écartée.</div>
          <div className="text-slate-500">Les inscriptions aux UE et le PAE ne sont pas dans ce fichier :
            ils se font ensuite.</div>
        </div>

        {rapport && <Rapport r={rapport} />}
      </div>
    </Fenetre>
  );
}

function Rapport({ r }) {
  const tuiles = [
    [r.nb_crees, r.simulation ? 'à créer' : 'créés', '#1B2B4B'],
    [r.nb_completes, r.simulation ? 'à compléter' : 'complétés', '#1B2B4B'],
    [r.nb_inchanges, 'déjà complets', null],
    [r.nb_ecartes, 'écartés', r.nb_ecartes ? '#B45309' : null],
  ];
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        {r.simulation ? 'Simulation — rien n’a été écrit' : 'Import effectué'}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {tuiles.map(([n, lib, rail]) => (
          <div key={lib} className="rounded-carte border border-slate-200 bg-white px-3 py-2"
            style={{ borderLeftWidth: 3, borderLeftColor: rail || 'transparent' }}>
            <div className="text-[17px] font-semibold tabular-nums">{n}</div>
            <div className="text-[11px] text-slate-500">{lib}</div>
          </div>
        ))}
      </div>
      {[...r.ecartes, ...r.conflits].length > 0 && (
        <div className="carte p-2.5 text-[12px]" style={{ borderLeftWidth: 3, borderLeftColor: '#B45309' }}>
          {r.ecartes.map(e => <div key={`e${e.ligne}`}>Ligne {e.ligne} — {e.qui} : {e.motif}</div>)}
          {r.conflits.map((c, i) => <div key={`c${i}`}>Ligne {c.ligne} — {c.qui} : {c.motif}</div>)}
        </div>
      )}
      {r.completes.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-slate-600">Dossiers {r.simulation ? 'à compléter' : 'complétés'} ({r.completes.length})</summary>
          <div className="mt-1 max-h-48 overflow-auto">
            {r.completes.map(c => <div key={c.ligne}>{c.qui} — {c.champs.join(', ') || 'matricule seul'}</div>)}
          </div>
        </details>
      )}
      {r.crees.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-slate-600">Dossiers {r.simulation ? 'à créer' : 'créés'} ({r.crees.length})</summary>
          <div className="mt-1 max-h-48 overflow-auto">
            {r.crees.map(c => <div key={c.ligne}>{c.qui}{c.note ? ` — ${c.note}` : ''}</div>)}
          </div>
        </details>
      )}
    </div>
  );
}

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
  /* LA SECTION PAR ÉTUDIANT — « on peut laisser le choix » (Charles).
     `parLigne` : { indice: code | '' } ; absent = la section du haut. */
  const [parLigne, setParLigne] = useState({});
  const [coches, setCoches] = useState(() => new Set());
  const [filtre, setFiltre] = useState('');
  const [aAppliquer, setAAppliquer] = useState('');
  const entree = useRef(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setSections(Array.isArray(l) ? l : []))
      .catch(() => {});
  }, []);

  // Changer une section, même d'une seule ligne, oblige à resimuler.
  const cle = fichier ? `${fichier.nom}|${fichier.lignes.length}|${section}|${JSON.stringify(parLigne)}` : null;
  const lignesVues = useMemo(() => (fichier?.lignes || []).map((l, i) => ({
    i, nom: `${String(l.NomEtud || '').trim()} ${String(l['PréEtud'] || '').trim()}`.trim()
      || String(l.Etudiant || '').trim(), mat: String(l.Id_Etud || '').trim(),
  })).filter(x => !filtre.trim() || `${x.nom} ${x.mat}`.toLowerCase().includes(filtre.trim().toLowerCase())),
  [fichier, filtre]);
  const libSection = code => sections.find(s0 => s0.code === code)?.libelle || code;
  const sectionDe = i => (i in parLigne ? parLigne[i] : section);
  const compteParSection = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < (fichier?.lignes.length || 0); i++) {
      const c = sectionDe(i) || '';
      m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichier, parLigne, section]);
  const appliquer = () => {
    setParLigne(p0 => { const n = { ...p0 }; for (const i of coches) n[i] = aAppliquer; return n; });
    setCoches(new Set());
  };
  const simule = !!cle && simuleSur === cle && rapport?.simulation;
  const fait = rapport && !rapport.simulation;

  async function lire(f) {
    if (!f) return;
    setErreur(null); setRapport(null); setSimuleSur(null);
    try {
      const XLSX = await import('xlsx');
      const octets = await f.arrayBuffer();
      /* UN CSV SE DÉCODE AVANT D'ÊTRE LU. Lu en octets, il est pris pour du
         Windows-1252 : un fichier UTF-8 y perd ses accents, et l'en-tête
         « PréEtud » devient « PrÃ©Etud » — la colonne des prénoms disparaît,
         et chaque ligne est écartée « sans prénom ». On tente l'UTF-8 strict,
         et l'on retombe sur le Windows-1252 d'un Excel ancien. */
      const estCsv = /\.csv$/i.test(f.name);
      let texte = null;
      if (estCsv) {
        try { texte = new TextDecoder('utf-8', { fatal: true }).decode(octets); }
        catch { texte = new TextDecoder('windows-1252').decode(octets); }
      }
      const wb = estCsv ? XLSX.read(texte, { type: 'string' }) : XLSX.read(octets, { type: 'array' });
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
      setParLigne({}); setCoches(new Set()); setFiltre('');
    } catch (e) { setFichier(null); setErreur(e.message); }
  }

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/etudiants/import-signaletique', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ lignes: fichier.lignes, section: section || null,
                               sections_par_ligne: parLigne, simulation }),
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
            <span className="block mb-0.5">Section par défaut</span>
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

        {fichier && !fait && (
          <div className="carte p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <b className="text-[13px]">Section de chaque étudiant</b>
              <span className="text-slate-500">
                {compteParSection.map(([c, n]) => `${c ? libSection(c) : 'aucune'} : ${n}`).join(' · ')}
              </span>
            </div>
            {/* UNE SÉLECTION, UNE SECTION : un fichier eCampus mêle souvent
                plusieurs packs. On coche un groupe (le filtre aide), on lui
                donne sa section. Ligne par ligne reste possible. */}
            <div className="flex flex-wrap items-center gap-2">
              <input value={filtre} onChange={e => setFiltre(e.target.value)}
                placeholder="Filtrer — nom ou matricule" className="controle text-[13px] w-56" />
              <button className="bouton" onClick={() => setCoches(c => {
                const tous = lignesVues.every(x => c.has(x.i));
                const n = new Set(c); for (const x of lignesVues) tous ? n.delete(x.i) : n.add(x.i); return n;
              })}>{lignesVues.length && lignesVues.every(x => coches.has(x.i)) ? 'Tout décocher' : 'Tout cocher'} ({lignesVues.length})</button>
              <select value={aAppliquer} onChange={e => setAAppliquer(e.target.value)} className="controle text-[13px]">
                <option value="">aucune section</option>
                {sections.map(s0 => <option key={s0.code} value={s0.code}>{s0.libelle || s0.code}</option>)}
              </select>
              <button className="bouton bouton-fort disabled:opacity-40" disabled={!coches.size} onClick={appliquer}>
                Appliquer aux {coches.size} coché(s)
              </button>
            </div>
            <div className="max-h-64 overflow-auto rounded-champ border border-slate-200">
              <table className="w-full text-[12px]">
                <tbody>
                  {lignesVues.map(x => (
                    <tr key={x.i} className="border-t border-slate-100 first:border-t-0 bg-white">
                      <td className="px-2 py-1 w-6">
                        <input type="checkbox" checked={coches.has(x.i)}
                          onChange={() => setCoches(c => { const n = new Set(c); n.has(x.i) ? n.delete(x.i) : n.add(x.i); return n; })} />
                      </td>
                      <td className="px-2 py-1 text-slate-400 tabular-nums w-10">{x.i + 2}</td>
                      <td className="px-2 py-1">{x.nom || <em className="text-slate-400">sans nom</em>}</td>
                      <td className="px-2 py-1 text-slate-500 tabular-nums">{x.mat}</td>
                      <td className="px-2 py-1 w-56">
                        <select value={sectionDe(x.i) || ''} className="controle h-7 text-[12px] w-full"
                          onChange={e => setParLigne(p0 => ({ ...p0, [x.i]: e.target.value }))}>
                          <option value="">aucune</option>
                          {sections.map(s0 => <option key={s0.code} value={s0.code}>{s0.libelle || s0.code}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              Sans section, un étudiant ne se range chez aucune coordination : seuls ceux qui voient toutes
              les sections le verront, sous « (sans section) », jusqu’à ce que ses inscriptions la donnent.
            </p>
          </div>
        )}

        <div className="carte p-3 text-[12px] text-slate-600 space-y-1">
          <div><b>Retrouvé</b> (numéro national, puis matricules, puis nom + prénom + date de
            naissance) : on complète les champs <b>vides</b> — rien n’est écrasé — et le
            matricule de l’année rejoint le dossier sans remplacer l’ancien.</div>
          <div><b>Inconnu</b> : un dossier est créé, rattaché à la section de sa ligne.</div>
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

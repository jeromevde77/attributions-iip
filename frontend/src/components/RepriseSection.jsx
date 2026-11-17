/* REPRENDRE UNE SECTION D'UNE ANNÉE PASSÉE (3.5.514, Charles, 17 novembre 2026 : ATNUP 2025-2026 — « importer les étudiants, leurs
   notes, et créer un diplôme »). Deux fichiers : la liste des inscrits (Matricule, NOM, Prénom, Sexe, Date de naissance, Lieu de
   naissance, Nationalité, NISS, Adresse, CP, Localité, Mail perso, Mail école, Téléphone) et la liste des diplômés (NOM, Prénom,
   Points sur 20 ou Points sur 100, Mention). Les colonnes se reconnaissent à leur intitulé, où qu'elles soient. Simulation d'abord :
   POST /api/import-historique/reprise-section. */
import { useEffect, useMemo, useState } from 'react';
import { IconFileSpreadsheet, IconUpload } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat } from './ui.jsx';

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const txt = v => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').replace(/ /g, ' ').trim());

/** Lit la première feuille : trouve la ligne d'en-tête (celle qui porte « NOM » et « Prénom »), rend des objets par intitulé normalisé. */
async function lireClasseur(fichier) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const L = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const i = L.findIndex(l => (l || []).some(c => norm(c) === 'nom') && (l || []).some(c => norm(c) === 'prenom'));
  if (i < 0) throw new Error(`« ${fichier.name} » : aucune ligne d'en-tête avec « NOM » et « Prénom ».`);
  const h = L[i].map(norm);
  return L.slice(i + 1).filter(l => l && l.some(c => c != null && String(c).trim() !== ''))
    .map(l => Object.fromEntries(h.map((k, j) => [k, l[j]])));
}
const col = (o, ...noms) => { for (const n of noms) if (o[n] != null && String(o[n]).trim() !== '') return o[n]; return null; };

export default function RepriseSection({ onClose, onImporte }) {
  const annees = useMemo(() => { const d = Number(getAnnee().slice(0, 4)); return [1, 2, 3, 4].map(k => `${d - k}-${d - k + 1}`); }, []);
  const [annee, setAnnee] = useState(annees[0]);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [org, setOrg] = useState(1);
  const [ues, setUes] = useState([]);
  const [choisies, setChoisies] = useState([]);
  const [inscrits, setInscrits] = useState(null);
  const [diplomes, setDiplomes] = useState(null);
  const [noms, setNoms] = useState({});
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { fetch('/api/ref/sections', { headers: authHeaders() }).then(r => r.json()).then(l => Array.isArray(l) && setSections(l)).catch(() => {}); }, []);
  useEffect(() => {
    setUes([]); setChoisies([]); setRapport(null);
    if (!section) return;
    fetch(`/api/ref/ue?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (!Array.isArray(l)) return; const u = [...new Map(l.map(x => [x.ue_num, x])).values()]; setUes(u); setChoisies(u.map(x => x.ue_num)); })
      .catch(() => {});
  }, [section, annee]);

  const lire = async (f, quoi) => {
    setErreur(null); setRapport(null);
    try {
      const L = await lireClasseur(f);
      if (quoi === 'inscrits') setInscrits(L); else setDiplomes(L);
      setNoms(n => ({ ...n, [quoi]: `${f.name} — ${L.length} lignes` }));
    } catch (e) { setErreur(e.message); }
  };

  // Les étudiants envoyés : la liste des inscrits, chacun marqué diplômé s'il figure dans la seconde liste (même nom et prénom).
  const etudiants = useMemo(() => {
    if (!inscrits) return [];
    const dip = new Map((diplomes || []).map(d => [`${norm(d.nom)}|${norm(d.prenom)}`, d]));
    return inscrits.filter(x => col(x, 'nom') && col(x, 'prenom')).map(x => {
      const d = dip.get(`${norm(x.nom)}|${norm(x.prenom)}`);
      let pts = d ? Number(String(col(d, 'pointssur20') ?? '').replace(',', '.')) : null;
      if (d && !(pts > 0)) { const c = Number(String(col(d, 'pointssur100') ?? '').replace(',', '.')); pts = c > 0 ? c / 5 : null; }
      return {
        id_ecampus: txt(col(x, 'matricule')), nom: txt(x.nom), prenom: txt(x.prenom), sexe: txt(col(x, 'sexe', 'genre')),
        date_naissance: txt(col(x, 'datedenaissance')), lieu_naissance: txt(col(x, 'lieudenaissance')), nationalite: txt(col(x, 'nationalite')),
        num_national: txt(col(x, 'niss', 'numeronational', 'nnational')), adresse: txt(x.adresse), cp: txt(x.cp), localite: txt(col(x, 'localite')),
        email_perso: txt(col(x, 'mailperso', 'emailperso')), email_ecole: txt(col(x, 'mailecole', 'emailecole')), gsm: txt(col(x, 'telephone', 'gsm')),
        reussi: !!d, points: d ? pts : null, mention: d ? txt(col(d, 'mention')) : null,
      };
    });
  }, [inscrits, diplomes]);
  const sansInscription = useMemo(() => {
    if (!diplomes || !inscrits) return [];
    const ins = new Set(inscrits.map(x => `${norm(x.nom)}|${norm(x.prenom)}`));
    return diplomes.filter(d => col(d, 'nom') && !ins.has(`${norm(d.nom)}|${norm(d.prenom)}`)).map(d => `${txt(d.nom)} ${txt(d.prenom)}`);
  }, [inscrits, diplomes]);

  const envoyer = async simulation => {
    setErreur(null); setEnCours(true);
    try {
      const r = await fetch('/api/import-historique/reprise-section', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, annee, organisation: org, ues: choisies, etudiants, simulation }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && !j.etudiants) throw new Error(j.error || `Erreur ${r.status}`);
      setRapport(j);
      if (j.ecrit) onImporte?.();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const pret = section && choisies.length && etudiants.length;
  const bloque = rapport && (rapport.refus?.length || rapport.conflits?.length);

  return (
    <Fenetre icone={IconFileSpreadsheet} titre="Reprendre une section d’une année passée" sous="Les inscrits, leurs unités et le résultat global des diplômés" large="grande" onFermer={onClose}
      pied={<div className="flex items-center gap-3 w-full">
        <span className="text-second text-slate-500 min-w-0 flex-1">{!pret ? 'Choisis la section, l’année, les unités et la liste des inscrits.' : rapport?.ecrit ? 'Écrit.' : bloque ? 'Corrige les points signalés avant d’écrire.' : rapport ? 'Simulation faite : rien n’est encore écrit.' : 'Lance d’abord la simulation.'}</span>
        <button type="button" className="bouton" disabled={!pret || enCours} onClick={() => envoyer(true)}>Simuler</button>
        <button type="button" className="bouton bouton-fort" disabled={!pret || enCours || !rapport || rapport.ecrit || bloque} onClick={() => envoyer(false)}>Écrire dans Lucie</button>
      </div>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">Section<select className="controle w-full mt-1" value={section} onChange={e => setSection(e.target.value)}>
            <option value="">— choisir —</option>{sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}</select></label>
          <label className="text-sm">Année (passée)<select className="controle w-full mt-1" value={annee} onChange={e => setAnnee(e.target.value)}>
            {annees.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
          <label className="text-sm">Organisation<input type="number" min="1" className="controle w-full mt-1" value={org} onChange={e => setOrg(Math.max(1, Number(e.target.value) || 1))} /></label>
        </div>
        {ues.length > 0 && (
          <div>
            <div className="intertitre mb-1">Les unités où inscrire les étudiants</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {ues.map(u => (
                <label key={u.ue_num} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={choisies.includes(u.ue_num)}
                    onChange={e => setChoisies(c => (e.target.checked ? [...c, u.ue_num] : c.filter(x => x !== u.ue_num)))} />
                  <span>UE {u.ue_num} — {u.ue_nom}{u.is_epreuve_integree ? <span className="text-mention text-slate-500"> · épreuve intégrée</span> : ''}</span>
                </label>))}
            </div>
          </div>)}
        <div className="grid gap-3 sm:grid-cols-2">
          {[['inscrits', 'La liste des inscrits', 'Matricule, NOM, Prénom, Sexe, naissance, NISS, adresse, courriels…'], ['diplomes', 'La liste des diplômés', 'NOM, Prénom, Points sur 20 (ou sur 100), Mention']].map(([k, t, aide]) => (
            <label key={k} className="block border border-dashed rounded-carte p-3 cursor-pointer hover:bg-slate-50">
              <div className="flex items-center gap-2 font-semibold text-sm"><IconUpload size={16} />{t}</div>
              <div className="text-second text-slate-500">{noms[k] || aide}</div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && lire(e.target.files[0], k)} />
            </label>))}
        </div>
        {sansInscription.length > 0 && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">Diplômés absents de la liste des inscrits (non importés) : {sansInscription.join(', ')}.</div>}
        {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
        {rapport && (<>
          <div className="text-sm">{rapport.ecrit ? 'Écrit : ' : 'Simulation : '}<b>{rapport.etudiants.length}</b> étudiants — {rapport.existants} déjà dans Lucie, {rapport.nouveaux} à créer ; <b>{rapport.reussis}</b> diplômés (« réussi » et la même cote dans les {rapport.ues.length} unités), les autres inscrits sans résultat.</div>
          {[...(rapport.refus || []), ...(rapport.conflits || [])].length > 0 && (
            <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger"><b>À corriger :</b> {[...rapport.refus, ...rapport.conflits].join(' · ')}</div>)}
          {(rapport.avertissements || []).map(a => <div key={a} className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">{a}</div>)}
          <Tableau dense>
            <TableauEntete><Th>Étudiant</Th><Th>Naissance</Th><Th>Dans Lucie</Th><Th align="droite">Résultat</Th><Th>Mention</Th></TableauEntete>
            <tbody>{rapport.etudiants.map(e => (
              <Tr key={`${e.nom}|${e.prenom}`}>
                <Td>{String(e.nom).toUpperCase()} {e.prenom}</Td><Td>{e.date_naissance || '—'}</Td>
                <Td>{e.existant ? <span className="text-slate-600">retrouvé ({e.methode === 'numero_national' ? 'numéro national' : e.methode === 'matricule' ? 'matricule' : 'nom et naissance'})</span> : <PastilleEtat etat="disponible">nouveau</PastilleEtat>}</Td>
                <Td align="droite">{e.reussi ? `${String(e.points).replace('.', ',')} / 20` : <span className="text-slate-400">sans résultat</span>}</Td>
                <Td>{e.mention || ''}</Td>
              </Tr>))}</tbody>
          </Tableau>
        </>)}
      </div>
    </Fenetre>);
}

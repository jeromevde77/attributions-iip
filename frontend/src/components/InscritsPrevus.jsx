/**
 * LES INSCRITS PRÉVUS (Charles, 7 octobre 2026 : « opticien : s'il n'y a pas
 * d'inscrit, il faut pouvoir les mettre à la main, idem ailleurs »). Ils ne
 * servent qu'aux « Rapport statistique », et seulement là où
 * aucun inscrit n'est encodé : un inscrit réel l'emporte toujours.
 */
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { authHeaders, getAnnee } from '../lib/api.js';

export default function InscritsPrevus({ annee: anneeChoisie = null, onEnregistre = null, replie = false }) {
  const annee = anneeChoisie || getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [d, setD] = useState(null);
  const [valeurs, setValeurs] = useState({});
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l => setSections(l || [])).catch(() => {});
  }, []);
  useEffect(() => {
    setD(null); setEtat(null);
    if (!section) return;
    fetch(`/api/effectifs-prevus?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => {
        setD(j);
        setValeurs({ 0: j.section_prevu ?? '', ...Object.fromEntries(j.ues.map(u => [u.ue_num, u.prevu ?? ''])) });
      }).catch(e => setEtat(e.message));
  }, [annee, section]);

  /* LES PRÉ-INSCRIPTIONS PROPOSENT, ELLES N'ÉCRIVENT PAS (Charles, 8 octobre 2026 :
     « tu peux proposer mais pas noter »). Le fichier du service informatique
     (« Dossier de pré-inscription ») se dépose ici ; Lucie compte, par section, les
     pré-inscriptions COMPLÈTES — ni listes d'attente, ni réinscriptions, qui ne
     sont pas de nouveaux étudiants — et les montre à côté du champ. On les reprend
     d'un clic, ou pas ; rien ne s'enregistre sans « Enregistrer ». Le comptage
     reste dans ce navigateur (il ne vaut que pour l'année du fichier). */
  const CLE_PI = `lucie.preinscriptions.${annee}`;
  const [pi, setPi] = useState(() => { try { return JSON.parse(localStorage.getItem(CLE_PI) || 'null'); } catch { return null; } });
  const sectionDuLibelle = lib => {
    const t = String(lib || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/liste d.attente|reinscription/.test(t)) return null;
    const regles = [[/imagerie/, 'TIM'], [/soins infirmiers|aesi/, 'AeSI'], [/psychomot/, 'Psychomotricité'],
      [/optom/, 'Optométrie'], [/orthopt/, 'Orthoptie'], [/atnup/, 'ATNUP'], [/plaies/, 'Soins_plaies'], [/optique|opticien/, 'Optique']];
    for (const [re, code] of regles) if (re.test(t)) { const s0 = sections.find(x => x.code.toLowerCase() === code.toLowerCase()); if (s0) return s0.code; }
    const s1 = sections.find(x => t.includes(String(x.code).toLowerCase()));
    return s1?.code || null;
  };
  async function lirePreinscriptions(f) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      const champ = (l, re) => l[Object.keys(l).find(k => re.test(k))] ?? '';
      const parSection = {}; let ignorees = 0;
      for (const l of lignes) {
        if (!/compl[eè]te/i.test(champ(l, /^statut$/i))) continue;
        const code = sectionDuLibelle(champ(l, /^section$/i));
        if (!code) { ignorees++; continue; }
        parSection[code] = (parSection[code] || 0) + 1;
      }
      const v = { fichier: f.name, le: new Date().toISOString().slice(0, 10), parSection, ignorees };
      setPi(v); try { localStorage.setItem(CLE_PI, JSON.stringify(v)); } catch { /* sans mémoire */ }
    } catch (e) { setEtat(`Fichier illisible : ${e.message}`); }
  }

  async function enregistrer() {
    const r = await fetch('/api/effectifs-prevus', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ annee, section, valeurs: Object.entries(valeurs).map(([ue_num, inscrits]) => ({ ue_num: Number(ue_num), inscrits })) }) });
    const j = await r.json().catch(() => ({}));
    setEtat(r.ok ? 'Enregistré.' : (j.error || 'Refusé.'));
    if (r.ok) onEnregistre?.();
  }
  const champ = (cle, reel) => (
    <input value={valeurs[cle] ?? ''} inputMode="numeric" placeholder={reel ? '—' : 'à saisir'} disabled={!!reel}
      onChange={e => setValeurs(v => ({ ...v, [cle]: e.target.value.replace(/[^\d]/g, '') }))}
      className="controle w-20 text-right disabled:bg-slate-50 disabled:text-slate-400" />
  );

  /* DANS ÉDITIONS, AVANT LE RAPPORT (Charles, 8 octobre 2026 : « avant de générer
     le rapport, je devrais pouvoir entrer le nombre d'étudiants s'ils ne sont pas
     encore inscrits »). Repliée par défaut ; enregistrer refait la pièce. */
  if (replie) return (
    <details className="px-3 py-2 border-b border-slate-200">
      <summary className="cursor-pointer text-sm text-iip-blue">Inscrits prévus — une section ou une unité sans inscrit encodé</summary>
      {contenu()}
    </details>);
  return <div className="carte p-4 mt-4">{contenu()}</div>;

  function contenu() { return (
    <div className="space-y-3 mt-2">
      <div>
        <div className="text-base font-medium text-iip-blue">Inscrits prévus — {annee}</div>
        <p className="text-second text-slate-500">Pour une section ou une unité qui n’a encore aucun inscrit encodé (Optique, par exemple).
          Ces chiffres ne servent qu’à la pièce « Rapport statistique », marqués « prévu » ; un inscrit réel l’emporte toujours.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-second text-slate-600">
        <label className="bouton cursor-pointer">Déposer les pré-inscriptions (.xlsx)
          <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={e => e.target.files?.[0] && lirePreinscriptions(e.target.files[0])} /></label>
        {pi && <span>{pi.fichier} — {Object.values(pi.parSection).reduce((a, b) => a + b, 0)} pré-inscription(s) complète(s)
          {pi.ignorees ? `, ${pi.ignorees} hors section (listes d'attente, réinscriptions…)` : ''} · proposées, jamais enregistrées d'office</span>}
      </div>
      <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
        <option value="">Choisir une section</option>
        {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
      </select>
      {d && (
        <table className="text-sm tabular-nums">
          <thead className="tab-entete"><tr><th className="text-left px-2 py-1.5">Unité</th><th className="text-right px-2">Inscrits réels</th><th className="text-right px-2">Prévus</th></tr></thead>
          <tbody>
            <tr className="border-b border-slate-200 font-medium"><td className="px-2 py-1">Section entière (étudiants)</td>
              <td className="px-2 text-right">{d.section_reel || '—'}</td><td className="px-2 text-right">{champ(0, d.section_reel)}</td>
              {pi && <td className="px-2 text-second text-slate-600 whitespace-nowrap">
                {pi.parSection[section] ? <>pré-inscrits : <b>{pi.parSection[section]}</b>
                  {!d.section_reel && String(valeurs[0] ?? '') !== String(pi.parSection[section]) && (
                    <button type="button" className="ml-2 underline text-iip-blue" onClick={() => setValeurs(v => ({ ...v, 0: String(pi.parSection[section]) }))}>reprendre</button>)}</>
                  : 'aucune pré-inscription'}</td>}</tr>
            {d.ues.map(u => (
              <tr key={u.ue_num} className="border-b border-slate-100"><td className="px-2 py-1">UE {u.ue_num} — {u.ue_nom}</td>
                <td className="px-2 text-right">{u.reel || '—'}</td><td className="px-2 text-right">{champ(u.ue_num, u.reel)}</td></tr>))}
          </tbody>
        </table>)}
      {d && (
        <div className="flex items-center gap-3">
          <button type="button" className="bouton bouton-fort" onClick={enregistrer}>Enregistrer</button>
          {etat && <span className="text-second text-slate-600">{etat}</span>}
        </div>)}
    </div>
  ); }
}

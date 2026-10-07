/**
 * LA GRILLE DES INSCRITS D'UNE SECTION (Charles, 7 octobre 2026 : « nom,
 * prénom, matricule… puis des colonnes pour les UE avec VA / VAP / VAE / RP
 * (date)… puis ouvrir un volet avec les cours… afficher celles que je veux…
 * trier non pas par ordre alphabétique mais d'abord les I, puis les VA, puis
 * les RP… Ça doit être visuel. Et choisir surtout »).
 *
 * Une ligne par étudiant, une colonne par unité ; une unité s'ouvre sur ses
 * cours. On choisit les colonnes d'identité, les unités affichées, celles qui
 * sont ouvertes, et l'on trie par l'état d'une unité. Ce qui s'imprime est ce
 * qui est à l'écran — le serveur le recompose, en paysage.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconChevronRight, IconChevronDown, IconPrinter, IconColumns3 } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';

/** L'ordre de tri « par état » : d'abord ceux qui suivent, puis les valorisés, puis les reports… */
export const ORDRE_ETAT = ['I', 'VA', 'VAE', 'VAP', 'RP', 'D', 'AQ'];
export const ETATS = {
  I:   { lib: 'Inscrit — suit', c: 'bg-white text-iip-blue border border-slate-300' },
  VA:  { lib: 'VA totale', c: 'bg-emerald-600 text-white' },
  VAE: { lib: 'VAE totale', c: 'bg-emerald-700 text-white' },
  VAP: { lib: 'Valorisation partielle', c: 'bg-white text-emerald-800 border-2 border-emerald-600' },
  RP:  { lib: 'Report de note', c: 'bg-teal-600 text-white' },
  D:   { lib: 'Dispense complète', c: 'bg-slate-500 text-white' },
  AQ:  { lib: 'Déjà acquise — à retirer', c: 'bg-amber-600 text-white' },
};
const IDENTITE = [
  ['matricule', 'Matricule'], ['bloc', 'Bloc'], ['profil', 'Profil'], ['sle', 'SLE'],
];
const fr = d => (!d ? '' : /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : String(d).replace(/^20(\d\d)-20(\d\d)$/, '$1-$2'));
const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* */ } };

function Pastille({ k, sous, titre, petite }) {
  const e = ETATS[k];
  if (!e) return null;
  return (
    <span title={titre || e.lib}
      className={`inline-flex flex-col items-center justify-center rounded-md leading-none font-medium
        ${petite ? 'min-w-[1.9rem] px-1 py-[3px] text-[10px]' : 'min-w-[2.6rem] px-1.5 py-1 text-[11px]'} ${e.c}`}>
      {k}
      {sous != null && sous !== '' && <span className="text-[9px] font-normal opacity-90 mt-[2px]">{sous}</span>}
    </span>
  );
}

export default function GrilleInscrits({ data, passe, annee, section, onFiche }) {
  const E = data.etudiants;
  const cle = `iu.grille.${section}`;
  const [idCols, setIdCols] = useState(() => lire(`${cle}.id`, ['matricule', 'bloc', 'profil']));
  const [cachees, setCachees] = useState(() => new Set(lire(`${cle}.cachees`, [])));
  const [ouvertes, setOuvertes] = useState(() => new Set(lire(`${cle}.ouvertes`, [])));
  const [tri, setTri] = useState({ par: 'nom', sens: 1 });
  const [etats, setEtats] = useState(() => new Set());   // filtre : un de ces états dans une unité affichée
  const [choix, setChoix] = useState(false);              // le volet « colonnes »
  const [impression, setImpression] = useState(false);
  const [erreur, setErreur] = useState(null);
  useEffect(() => ecrire(`${cle}.id`, idCols), [cle, idCols]);
  useEffect(() => ecrire(`${cle}.cachees`, [...cachees]), [cle, cachees]);
  useEffect(() => ecrire(`${cle}.ouvertes`, [...ouvertes]), [cle, ouvertes]);

  const visibles = data.unites.filter(u => !cachees.has(u.ue_num));
  // Une case par (étudiant, unité).
  const cases = useMemo(() => {
    const m = new Map();
    for (const u of data.unites) for (const l of u.lignes) m.set(`${l.id}|${u.ue_num}`, l);
    return m;
  }, [data]);
  const ligneDe = (id, ue) => cases.get(`${id}|${ue}`);

  const lignes = useMemo(() => {
    const ids = new Set();
    for (const u of visibles) for (const l of u.lignes) if (passe(l)) ids.add(l.id);
    let l = [...ids];
    if (etats.size) l = l.filter(id => visibles.some(u => etats.has(ligneDe(id, u.ue_num)?.code)));
    const rang = (id) => {
      if (tri.par === 'nom') return 0;
      const c = ligneDe(id, tri.par)?.code;
      return c ? ORDRE_ETAT.indexOf(c) : ORDRE_ETAT.length;
    };
    return l.sort((a, b) => (rang(a) - rang(b)) * tri.sens
      || (tri.par === 'nom' ? tri.sens : 1) * (E[a]?.nom || '').localeCompare(E[b]?.nom || '', 'fr'));
  }, [data, passe, cachees, etats, tri]);   // eslint-disable-line react-hooks/exhaustive-deps

  const trier = par => setTri(t => (t.par === par ? { par, sens: -t.sens } : { par, sens: 1 }));
  const basculer = (set, v) => { const s = new Set(set); s.has(v) ? s.delete(v) : s.add(v); return s; };
  const compte = (ue, k) => lignes.filter(id => ligneDe(id, ue)?.code === k).length;
  const avec = k => idCols.includes(k);

  async function imprimer() {
    setImpression(true); setErreur(null);
    try {
      const r = await fetch('/api/rapports/inscrits-grille', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, section, ues: visibles.map(u => u.ue_num), ouvertes: [...ouvertes],
          colonnes: idCols, ids: lignes,
          tri: tri.par === 'nom' ? 'ordre alphabétique' : `état de l'UE ${tri.par}` }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      const pdf = await fetch('/api/impression/pdf', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ html: j.html, nom: j.nom, orientation: 'paysage', pagination: 'si-plusieurs' }),
      });
      if (pdf.ok) {
        const url = URL.createObjectURL(await pdf.blob());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else ouvrirApercu({ html: j.html, titre: 'Grille des inscrits', nomFichier: j.nom, envoiPossible: false });
    } catch (e) { setErreur(e.message); }
    setImpression(false);
  }

  const nId = 2 + idCols.length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className={`controle flex items-center gap-1.5 ${choix ? 'bg-slate-100' : ''}`} onClick={() => setChoix(x => !x)}>
          <IconColumns3 size={16} /> Colonnes
          <span className="text-[11px] text-slate-500">{visibles.length}/{data.unites.length} UE</span>
        </button>
        <span className="text-[11px] text-slate-500 ml-1">Ne montrer que :</span>
        {ORDRE_ETAT.map(k => (
          <button key={k} type="button" onClick={() => setEtats(s => basculer(s, k))} title={ETATS[k].lib}
            className={`rounded-md ${etats.has(k) ? 'ring-2 ring-offset-1 ring-iip-blue' : 'opacity-70 hover:opacity-100'}`}>
            <Pastille k={k} petite />
          </button>))}
        {etats.size > 0 && <button type="button" className="text-[12px] text-slate-500 underline" onClick={() => setEtats(new Set())}>tous</button>}
        <select className="controle" value={String(tri.par)} onChange={e => setTri({ par: e.target.value === 'nom' ? 'nom' : Number(e.target.value), sens: 1 })}>
          <option value="nom">Trier : ordre alphabétique</option>
          {visibles.map(u => <option key={u.ue_num} value={u.ue_num}>Trier : état de l’UE {u.ue_num} (I, VA, RP…)</option>)}
        </select>
        <div className="flex-1" />
        <span className="text-[13px] text-slate-600"><b>{lignes.length}</b> étudiant(s)</span>
        <button type="button" className="bouton-sortir controle flex items-center gap-1.5" disabled={impression || !lignes.length} onClick={imprimer}
          title="Ce qui est affiché — colonnes, unités ouvertes, filtres et tri — en paysage">
          <IconPrinter size={16} /> {impression ? 'Préparation…' : 'Imprimer la grille'}
        </button>
      </div>

      {choix && (
        <div className="carte p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-[12px]">
            <span className="text-slate-500 w-24">Identité</span>
            <span className="text-slate-400">Nom · Prénom</span>
            {IDENTITE.map(([k, lib]) => (
              <label key={k} className="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={avec(k)} onChange={() => setIdCols(c => (c.includes(k) ? c.filter(x => x !== k) : IDENTITE.map(x => x[0]).filter(x => x === k || c.includes(x))))} /> {lib}
              </label>))}
          </div>
          <div className="flex items-start gap-2 text-[12px]">
            <span className="text-slate-500 w-24 pt-1">Unités</span>
            <div className="flex-1 flex flex-wrap gap-1.5">
              {data.unites.map(u => (
                <label key={u.ue_num} title={u.ue_nom}
                  className={`inline-flex items-center gap-1 border rounded-md px-1.5 py-0.5 cursor-pointer ${cachees.has(u.ue_num) ? 'border-slate-200 text-slate-400' : 'border-iip-blue text-iip-blue'}`}>
                  <input type="checkbox" checked={!cachees.has(u.ue_num)} onChange={() => setCachees(s => basculer(s, u.ue_num))} />
                  {u.ue_num}
                  <button type="button" className={`ml-0.5 ${ouvertes.has(u.ue_num) ? 'text-iip-blue' : 'text-slate-400'}`}
                    title={ouvertes.has(u.ue_num) ? 'Refermer les cours' : 'Ouvrir les cours'}
                    onClick={ev => { ev.preventDefault(); setOuvertes(s => basculer(s, u.ue_num)); }}>
                    {ouvertes.has(u.ue_num) ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                  </button>
                </label>))}
            </div>
            <div className="flex flex-col gap-1">
              <button type="button" className="text-[12px] underline text-slate-500" onClick={() => setCachees(new Set())}>toutes</button>
              <button type="button" className="text-[12px] underline text-slate-500" onClick={() => setCachees(new Set(data.unites.map(u => u.ue_num)))}>aucune</button>
              <button type="button" className="text-[12px] underline text-slate-500" onClick={() => setOuvertes(new Set())}>tout refermer</button>
            </div>
          </div>
        </div>)}

      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[13px]">{erreur}</div>}

      <div className="overflow-auto max-h-[72vh] border border-slate-200 rounded-carte">
        <table className="text-[12px] tabular-nums border-separate border-spacing-0">
          <thead>
            <tr className="tab-entete">
              <th rowSpan={2} className="sticky top-0 left-0 z-30 tab-entete text-left px-2 py-1.5 border-b border-slate-300 min-w-[9rem]">
                <button type="button" onClick={() => trier('nom')} className="hover:underline [text-transform:inherit] [letter-spacing:inherit]">Nom{tri.par === 'nom' ? (tri.sens > 0 ? ' ▲' : ' ▼') : ''}</button></th>
              <th rowSpan={2} className="sticky top-0 left-[9rem] z-30 tab-entete text-left px-2 border-b border-r border-slate-300 min-w-[8rem]">Prénom</th>
              {IDENTITE.filter(([k]) => avec(k)).map(([k, lib]) => (
                <th key={k} rowSpan={2} className="sticky top-0 z-20 tab-entete text-left px-2 border-b border-slate-300">{lib}</th>))}
              {visibles.map(u => (
                <th key={u.ue_num} colSpan={1 + (ouvertes.has(u.ue_num) ? u.cours.length : 0)}
                  className="sticky top-0 z-20 tab-entete px-1 pt-1.5 border-l border-slate-300 text-center whitespace-nowrap">
                  <span className="inline-flex items-center gap-0.5">
                    <button type="button" onClick={() => setOuvertes(s => basculer(s, u.ue_num))} className="text-slate-500 hover:text-iip-blue"
                      title={ouvertes.has(u.ue_num) ? 'Refermer les cours' : `Ouvrir les cours (${u.cours.length})`}>
                      {ouvertes.has(u.ue_num) ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}</button>
                    <button type="button" onClick={() => trier(u.ue_num)} title={`${u.ue_nom} — trier par état`} className="hover:underline font-medium">
                      UE {u.ue_num}{tri.par === u.ue_num ? (tri.sens > 0 ? ' ▲' : ' ▼') : ''}</button>
                  </span>
                </th>))}
            </tr>
            <tr className="tab-entete">
              {visibles.map(u => [
                <th key={`${u.ue_num}-e`} className="sticky top-[30px] z-20 tab-entete px-1 pb-1 border-b border-l border-slate-300 font-normal text-[10px] text-slate-500 max-w-[6rem] truncate" title={u.ue_nom}>
                  {u.ue_nom}</th>,
                ...(ouvertes.has(u.ue_num) ? u.cours.map(c => (
                  <th key={`${u.ue_num}-${c.code}`} title={c.nom}
                    className="sticky top-[30px] z-20 bg-slate-50 px-1 pb-1 border-b border-slate-300 font-normal text-[10px] text-slate-600 max-w-[5.5rem]">
                    <div className="font-medium text-iip-blue">{c.code}</div><div className="truncate">{c.nom}</div></th>)) : []),
              ])}
            </tr>
          </thead>
          <tbody>
            {lignes.map(id => { const e = E[id] || {}; return (
              <tr key={id} className="hover:bg-slate-50 group">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-2 py-1 border-b border-slate-100 whitespace-nowrap">
                  <button type="button" className="hover:underline font-medium text-iip-blue" onClick={() => onFiche(id)}>{e.nom_famille}</button></td>
                <td className="sticky left-[9rem] z-10 bg-white group-hover:bg-slate-50 px-2 border-b border-r border-slate-100 whitespace-nowrap">{e.prenom}</td>
                {avec('matricule') && <td className="px-2 border-b border-slate-100 text-slate-500">{e.matricule}</td>}
                {avec('bloc') && <td className="px-2 border-b border-slate-100">{e.bloc || ''}</td>}
                {avec('profil') && <td className="px-2 border-b border-slate-100 text-[11px] text-slate-600">{e.nouveau ? 'nouveau' : ''}</td>}
                {avec('sle') && <td className="px-2 border-b border-slate-100 text-[11px]">{e.sle ? 'SLE' : ''}</td>}
                {visibles.map(u => { const l = ligneDe(id, u.ue_num); return [
                  <td key={u.ue_num} className="px-1 py-0.5 border-b border-l border-slate-100 text-center">
                    {l ? <span className="inline-flex items-center gap-0.5">
                      <Pastille k={l.code} sous={fr(l.date)} titre={`${ETATS[l.code]?.lib}${l.detail.length ? ' — ' + l.detail.join(' · ') : ''}${l.reprise ? ' · reprise' : ''}`} />
                      {(l.tags.length > 0 || l.reprise || !l.inscrit) && (
                        <span className="flex flex-col text-[9px] leading-tight text-slate-500 text-left">
                          {l.tags.map(t => <span key={t}>{t}</span>)}
                          {l.reprise && <span>reprise</span>}
                          {!l.inscrit && <span className="text-amber-700">non inscrit</span>}
                        </span>)}
                    </span> : <span className="text-slate-300">·</span>}
                  </td>,
                  ...(ouvertes.has(u.ue_num) ? u.cours.map(c => { const k = l?.cellules?.[c.code]; return (
                    <td key={`${u.ue_num}-${c.code}`} className="px-1 py-0.5 border-b border-slate-100 text-center bg-slate-50/50">
                      {k ? <Pastille petite k={k.k} sous={k.note != null ? String(k.note).replace('.', ',') : fr(k.date || k.annee)}
                        titre={`${ETATS[k.k]?.lib}${k.note != null ? ` — note ${k.note}/20` : ''}${k.annee ? ` (${k.annee})` : ''}`} /> : ''}
                    </td>); }) : []),
                ]; })}
              </tr>); })}
          </tbody>
          <tfoot>
            <tr className="tab-repere font-medium">
              <td colSpan={nId} className="sticky left-0 z-10 tab-repere px-2 py-1.5 border-t border-slate-300">À suivre (I)</td>
              {visibles.map(u => [
                <td key={u.ue_num} className="text-center border-t border-l border-slate-300" title={ORDRE_ETAT.map(k => `${k} ${compte(u.ue_num, k)}`).join(' · ')}>{compte(u.ue_num, 'I')}</td>,
                ...(ouvertes.has(u.ue_num) ? u.cours.map(c => (
                  <td key={`${u.ue_num}-${c.code}`} className="text-center border-t border-slate-300">
                    {lignes.filter(id => ligneDe(id, u.ue_num)?.cellules?.[c.code]?.k === 'I').length}</td>)) : []),
              ])}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
        {ORDRE_ETAT.map(k => <span key={k} className="inline-flex items-center gap-1"><Pastille k={k} petite /> {ETATS[k].lib}</span>)}
        <span>· sous la pastille : date de décision, année d’origine ou note reportée</span>
      </div>
    </div>
  );
}

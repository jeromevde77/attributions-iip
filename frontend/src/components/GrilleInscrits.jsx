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
import { Fragment, useEffect, useMemo, useState } from 'react';
import { IconChevronRight, IconChevronDown, IconPrinter, IconColumns3 } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { couleurBloc, blocDe, OR_EPREUVE } from '../lib/blocs.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { peutGeste } from '../lib/droits.js';

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
/** Les catégories du pied : l'état de l'unité (f) et, sous un cours, celui du cours (fc). */
const CATEGORIES = [
  { cle: 'I', k: 'I', lib: 'à suivre', f: l => l?.code === 'I' && !l.reprise, fc: (l, c) => !l.reprise && l.cellules?.[c]?.k === 'I' },
  { cle: 'Ir', k: 'I', lib: 'à suivre — reprise', f: l => l?.code === 'I' && l.reprise, fc: (l, c) => l.reprise && l.cellules?.[c]?.k === 'I' },
  { cle: 'VA', k: 'VA', lib: 'VA totale', f: l => l?.code === 'VA', fc: (l, c) => l.cellules?.[c]?.k === 'VA' },
  { cle: 'VAE', k: 'VAE', lib: 'VAE totale', f: l => l?.code === 'VAE', fc: (l, c) => l.cellules?.[c]?.k === 'VAE' },
  { cle: 'VAP', k: 'VAP', lib: 'valorisation partielle', f: l => l?.code === 'VAP' },
  { cle: 'RP', k: 'RP', lib: 'report de note', f: l => l?.code === 'RP', fc: (l, c) => l.cellules?.[c]?.k === 'RP' },
  { cle: 'D', k: 'D', lib: 'dispense complète', f: l => l?.code === 'D', fc: (l, c) => l.cellules?.[c]?.k === 'D' },
  { cle: 'AQ', k: 'AQ', lib: 'déjà acquise — à retirer', f: l => l?.code === 'AQ' },
];
const IDENTITE = [
  ['matricule', 'Matricule'], ['bloc', 'Bloc'], ['profil', 'Profil'], ['sle', 'SLE'],
];
const fr = d => (!d ? '' : /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : String(d).replace(/^20(\d\d)-20(\d\d)$/, '$1-$2'));
const lire = (cle, defaut) => { try { const v = localStorage.getItem(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; } };
const ecrire = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* */ } };

/* UNE CASE, UNE LIGNE (Charles, 7 octobre 2026 : « ça ne va pas sur deux
   lignes, il faut que ce soit joli ») : le code, puis la date ou la note en
   plus petit, à la même hauteur que le texte. */
function Pastille({ k, sous, titre, petite, onClick, texte = null }) {
  const e = ETATS[k];
  if (!e) return null;
  const Balise = onClick ? 'button' : 'span';
  return (
    <Balise type={onClick ? 'button' : undefined} title={titre || e.lib} onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md leading-none font-semibold whitespace-nowrap align-middle
        ${petite ? 'h-[18px] px-1.5 text-[10px]' : 'h-[20px] px-1.5 text-[11px]'} ${e.c}
        ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-iip-blue/50' : ''}`}>
      {texte != null ? <span>{texte}</span> : k}
      {sous != null && sous !== '' && <span className="text-[9.5px] font-normal opacity-85">{sous}</span>}
    </Balise>
  );
}
/** Les cases qui mènent à la revue du PAE : ce qui dispense (report, VA…). */
const VERS_REVUE = new Set(['RP', 'VA', 'VAE', 'VAP', 'D']);

export default function GrilleInscrits({ data, passe, annee, section, onFiche, onRevue, onChange }) {
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
    /* CLASSER SUR TOUTES LES UNITÉS (Charles, 7 octobre 2026 : « classer
       d'abord, pour TOUTES les UE, les reports, etc. »). L'ordre suit les états
       choisis dans « Ne montrer que », sinon : reports, VA, VAE, VAP, D, AQ ;
       à égalité, celui qui en compte le plus passe devant. */
    const priorite = etats.size ? ORDRE_ETAT.filter(k => etats.has(k)) : ['RP', 'VA', 'VAE', 'VAP', 'D', 'AQ'];
    const groupeDe = id => {
      const codes = visibles.map(u => ligneDe(id, u.ue_num)?.code).filter(Boolean);
      const i = priorite.findIndex(k => codes.includes(k));
      return { i: i < 0 ? priorite.length : i, n: i < 0 ? 0 : codes.filter(c => c === priorite[i]).length };
    };
    if (tri.par === 'etats') {
      const g = new Map(l.map(id => [id, groupeDe(id)]));
      return l.sort((a, b) => (g.get(a).i - g.get(b).i) * tri.sens || g.get(b).n - g.get(a).n
        || (E[a]?.nom || '').localeCompare(E[b]?.nom || '', 'fr'));
    }
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
  // LA NOTE REPORTÉE SANS DÉCIMALE (Charles, 7 octobre 2026) : arrondie à
  // l'unité, comme toute note qu'on lit dans Lucie (9,6 devient 10).
  const noteCourte = n => String(Math.round(Number(n)));
  /* LE REPORT SE LIT À SA NOTE (Charles, 7 octobre 2026 : « il faut la note à
     côté ; enlève le RP, on laisse le bleu ») : la ou les notes reportées des
     cours de l'unité, l'année d'origine en petit. */
  const notesRP = l => {
    const n = Object.values(l.cellules || {}).filter(c => c.k === 'RP' && c.note != null).map(c => noteCourte(c.note));
    return n.length ? n.join(' · ') : 'RP';
  };

  /* RETIRER CE QUI EST DÉJÀ ACQUIS (Charles, 7 octobre 2026) : le serveur
     revérifie, simule, et passe par la porte du PAE ; on voit avant d'écrire. */
  const peutRetirer = peutGeste('etudiants.pae_composer');
  const aqVisibles = lignes.flatMap(id => visibles.filter(u => ligneDe(id, u.ue_num)?.code === 'AQ' && ligneDe(id, u.ue_num)?.inscrit)
    .map(u => ({ id, ue: u.ue_num })));
  async function retirerAcquises(paires) {
    const appel = simulation => fetch('/api/etudiants/inscrits-unites/retirer-acquises', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, paires, simulation }) }).then(async r => {
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });
    try {
      const s = await appel(true);
      const liste = l => l.slice(0, 12).map(x => `· ${x.nom} — UE ${x.ue}${x.pourquoi ? ` (${x.pourquoi})` : ''}`).join('\n') + (l.length > 12 ? `\n… et ${l.length - 12} autre(s)` : '');
      if (!s.retirees.length) {
        await informer({ titre: 'Rien à retirer', message: [s.conservees.length ? `Conservées (résultat, notes ou report encodés) :\n${liste(s.conservees)}` : '',
          s.refusees.length ? `Refusées :\n${liste(s.refusees)}` : ''].filter(Boolean).join('\n\n') || 'Aucune inscription à retirer.' });
        return;
      }
      const ok = await demander(`Retirer ${s.retirees.length} inscription(s) d'unités déjà acquises du programme ${annee} ?\n\n${liste(s.retirees)}`
        + (s.conservees.length ? `\n\nConservées (résultat, notes ou report encodés) : ${s.conservees.length}` : '')
        + '\n\nLe retrait passe par le PAE : un programme modifié perd sa confirmation.');
      if (!ok) return;
      const f = await appel(false);
      await informer({ titre: 'Inscriptions retirées', ton: 'reussi', message: `${f.retirees.length} inscription(s) retirée(s).` });
      onChange?.();
    } catch (e) { setErreur(e.message); }
  }

  async function imprimer() {
    setImpression(true); setErreur(null);
    try {
      const r = await fetch('/api/rapports/inscrits-grille', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, section, ues: visibles.map(u => u.ue_num), ouvertes: [...ouvertes],
          colonnes: idCols, ids: lignes,
          tri: tri.par === 'nom' ? 'ordre alphabétique' : tri.par === 'etats' ? 'par état, toutes les unités' : `état de l'UE ${tri.par}` }),
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
        <select className="controle" value={String(tri.par)} onChange={e => setTri({ par: ['nom', 'etats'].includes(e.target.value) ? e.target.value : Number(e.target.value), sens: 1 })}>
          <option value="nom">Trier : ordre alphabétique</option>
          <option value="etats">Trier : par état, toutes les unités</option>
          {visibles.map(u => <option key={u.ue_num} value={u.ue_num}>Trier : état de l’UE {u.ue_num} (I, VA, RP…)</option>)}
        </select>
        <div className="flex-1" />
        {peutRetirer && aqVisibles.length > 0 && (
          <button type="button" className="controle flex items-center gap-1.5 text-amber-800 border-amber-600" onClick={() => retirerAcquises(aqVisibles)}
            title="Retirer du programme de l'année les unités déjà réussies ou valorisées (affichées)">
            Retirer les AQ ({aqVisibles.length})</button>)}
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

      <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
        {ORDRE_ETAT.map(k => <span key={k} className="inline-flex items-center gap-1"><Pastille k={k} petite /> {ETATS[k].lib}</span>)}
        <span>· bleu : report de note — la note, puis l’année d’origine · à côté du code : date de décision · ↻ reprise · +VA, +RP : autre dispense sur l’unité · n.i. : non inscrit · un clic sur RP, VA, VAP ou D ouvre la revue du PAE</span>
      </div>

      <div className="overflow-auto max-h-[72vh] border border-slate-200 rounded-carte">
        <table className="text-[12px] tabular-nums border-separate border-spacing-0">
          {/* L'ENTÊTE EN TROIS ÉTAGES (Charles, 7 octobre 2026 : « plus joli —
              l'UE sur un fond à la couleur de son bloc, le nom en dessous, puis
              les cours »). Hauteurs fixes : l'entête reste collé en haut, étage
              par étage, sans se chevaucher. */}
          <thead>
            <tr>
              <th rowSpan={3} className="sticky top-0 left-0 z-30 tab-entete text-left px-2 py-1.5 border-b border-slate-300 min-w-[9rem] align-bottom">
                <button type="button" onClick={() => trier('nom')} className="hover:underline [text-transform:inherit] [letter-spacing:inherit]">Nom{tri.par === 'nom' ? (tri.sens > 0 ? ' ▲' : ' ▼') : ''}</button></th>
              <th rowSpan={3} className="sticky top-0 left-[9rem] z-30 tab-entete text-left px-2 pb-1.5 border-b border-r border-slate-300 min-w-[8rem] align-bottom">Prénom</th>
              {IDENTITE.filter(([k]) => avec(k)).map(([k, lib]) => (
                <th key={k} rowSpan={3} className="sticky top-0 z-20 tab-entete text-left px-2 pb-1.5 border-b border-slate-300 align-bottom">{lib}</th>))}
              {visibles.map(u => {
                const fond = u.ei ? OR_EPREUVE : (couleurBloc(u.bloc) || 'var(--c-principal, #16406A)');
                const clair = blocDe(u.bloc) === 'BA2' && !u.ei;   // BA2 bleu clair : texte foncé
                return (
                  <th key={u.ue_num} colSpan={1 + (ouvertes.has(u.ue_num) ? u.cours.length : 0)}
                    className="sticky top-0 z-20 h-[28px] px-1.5 border-l-2 border-white text-center whitespace-nowrap"
                    style={{ background: fond, color: clair ? '#16406A' : '#fff' }}>
                    <span className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => setOuvertes(s => basculer(s, u.ue_num))} className="opacity-80 hover:opacity-100"
                        title={ouvertes.has(u.ue_num) ? 'Refermer les cours' : `Ouvrir les cours (${u.cours.length})`}>
                        {ouvertes.has(u.ue_num) ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}</button>
                      <button type="button" onClick={() => trier(u.ue_num)} title={`${u.ue_nom} — trier par état`} className="hover:underline font-semibold text-[12px]">
                        UE {u.ue_num}{tri.par === u.ue_num ? (tri.sens > 0 ? ' ▲' : ' ▼') : ''}</button>
                      <span className="text-[9.5px] font-medium opacity-85">{u.ei ? 'EI' : blocDe(u.bloc) || ''}</span>
                    </span>
                  </th>);
              })}
            </tr>
            <tr>
              {visibles.map(u => (
                <th key={`${u.ue_num}-nom`} colSpan={1 + (ouvertes.has(u.ue_num) ? u.cours.length : 0)} title={u.ue_nom}
                  className="sticky top-[28px] z-20 h-[34px] tab-entete px-1.5 border-l-2 border-white font-normal text-[10.5px] leading-tight text-iip-blue normal-case tracking-normal align-middle" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                  <div className={`line-clamp-2 ${ouvertes.has(u.ue_num) ? '' : 'max-w-[7.5rem] mx-auto'}`}>{u.ue_nom}</div></th>))}
            </tr>
            <tr>
              {visibles.map(u => [
                <th key={`${u.ue_num}-e`} className="sticky top-[62px] z-20 h-[30px] bg-white px-1 border-b border-l-2 border-slate-200 font-normal text-[10px] text-slate-400 normal-case tracking-normal">
                  unité</th>,
                ...(ouvertes.has(u.ue_num) ? u.cours.map(c => (
                  <th key={`${u.ue_num}-${c.code}`} title={c.nom}
                    className="sticky top-[62px] z-20 h-[30px] bg-white px-1 border-b border-slate-200 font-normal text-[10px] text-slate-600 max-w-[6.5rem] normal-case tracking-normal">
                    <div className="font-semibold text-iip-blue">{c.code}</div><div className="truncate">{c.nom}</div></th>)) : []),
              ])}
            </tr>
          </thead>
          {/* LES SOUS-TOTAUX EN HAUT (Charles, 7 octobre 2026 : « pour la lisibilité
              et l'accès aux données ») : on lit la synthèse, puis les noms. */}
          <tbody>
            {/* LES SOUS-TOTAUX PAR CATÉGORIE (Charles, 7 octobre 2026) : I, I en
                reprise, VA… — sur les lignes affichées, donc filtres compris. */}
            {CATEGORIES.map(cat => {
              const nUE = u => lignes.filter(id => cat.f(ligneDe(id, u.ue_num))).length;
              const nCours = (u, c) => lignes.filter(id => { const l = ligneDe(id, u.ue_num); return l && cat.fc && cat.fc(l, c.code); }).length;
              const etudiantsCat = lignes.filter(id => visibles.some(u => cat.f(ligneDe(id, u.ue_num)))).length;
              if (!etudiantsCat) return null;
              return (
                <tr key={cat.cle} className="tab-repere">
                  <td colSpan={nId} className="sticky left-0 z-10 tab-repere px-2 py-1 border-t border-slate-200 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">{cat.k ? <Pastille k={cat.k} petite /> : null}<span className="text-[12px]">{cat.lib}</span>
                      <span className="text-[11px] text-slate-500">· {etudiantsCat} étudiant(s)</span></span></td>
                  {visibles.map(u => [
                    <td key={u.ue_num} className="text-center border-t border-l border-slate-200 font-medium">{nUE(u) || ''}</td>,
                    ...(ouvertes.has(u.ue_num) ? u.cours.map(c => (
                      <td key={`${u.ue_num}-${c.code}`} className="text-center border-t border-slate-200 text-slate-600">{cat.fc ? (nCours(u, c) || '') : ''}</td>)) : []),
                  ])}
                </tr>);
            })}
            <tr className="tab-repere font-semibold">
              <td colSpan={nId} className="sticky left-0 z-10 tab-repere px-2 py-1.5 border-b-2 border-t border-slate-300">Total · {lignes.length} étudiant(s)</td>
              {visibles.map(u => [
                <td key={u.ue_num} className="text-center border-b-2 border-t border-l border-slate-300">{lignes.filter(id => ligneDe(id, u.ue_num)).length || ''}</td>,
                ...(ouvertes.has(u.ue_num) ? u.cours.map(c => <td key={`${u.ue_num}-${c.code}`} className="border-b-2 border-t border-slate-300" />) : []),
              ])}
            </tr>
          </tbody>
          <tbody>
            {lignes.map((id, rangLigne) => { const e = E[id] || {};
              const prio = etats.size ? ORDRE_ETAT.filter(k => etats.has(k)) : ['RP', 'VA', 'VAE', 'VAP', 'D', 'AQ'];
              const gDe = x => { const codes = visibles.map(u => ligneDe(x, u.ue_num)?.code); return prio.find(k => codes.includes(k)) || null; };
              const g = tri.par === 'etats' ? gDe(id) : undefined;
              const nouveau = tri.par === 'etats' && (rangLigne === 0 || gDe(lignes[rangLigne - 1]) !== g);
              return (<Fragment key={id}>
              {nouveau && (
                <tr><td colSpan={nId + visibles.reduce((s, u) => s + 1 + (ouvertes.has(u.ue_num) ? u.cours.length : 0), 0)}
                  className="sticky left-0 bg-slate-50 px-2 py-1 border-b border-slate-200 text-[12px] font-medium text-iip-blue">
                  {g ? <span className="inline-flex items-center gap-1.5"><Pastille k={g} petite /> {ETATS[g].lib}</span> : 'Les autres — à suivre seulement'}
                  <span className="font-normal text-slate-500"> · {lignes.filter(x => gDe(x) === g).length} étudiant(s)</span></td></tr>)}
              <tr className="hover:bg-slate-50 group">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-2 py-1 border-b border-slate-100 whitespace-nowrap">
                  <button type="button" className="hover:underline font-medium text-iip-blue" onClick={() => onFiche(id)}>{e.nom_famille}</button></td>
                <td className="sticky left-[9rem] z-10 bg-white group-hover:bg-slate-50 px-2 border-b border-r border-slate-100 whitespace-nowrap">{e.prenom}</td>
                {avec('matricule') && <td className="px-2 border-b border-slate-100 text-slate-500">{e.matricule}</td>}
                {avec('bloc') && <td className="px-2 border-b border-slate-100">{e.bloc || ''}</td>}
                {avec('profil') && <td className="px-2 border-b border-slate-100 text-[11px] text-slate-600">{e.nouveau ? 'nouveau' : ''}</td>}
                {avec('sle') && <td className="px-2 border-b border-slate-100 text-[11px]">{e.sle ? 'SLE' : ''}</td>}
                {visibles.map(u => { const l = ligneDe(id, u.ue_num); return [
                  <td key={u.ue_num} className={`px-2 py-1 border-b border-l border-slate-100 text-center whitespace-nowrap ${etats.size && l && !etats.has(l.code) ? 'opacity-25' : ''}`}>
                    {l ? <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      <Pastille k={l.code} sous={fr(l.date)}
                        texte={l.code === 'RP' ? notesRP(l) : null}
                        titre={`${ETATS[l.code]?.lib}${l.detail.length ? ' — ' + l.detail.join(' · ') : ''}${l.reprise ? ' · reprise' : ''}${VERS_REVUE.has(l.code) ? ' — clic : revue du PAE' : l.code === 'AQ' && l.inscrit && peutRetirer ? ' — clic : retirer du programme' : ''}`}
                        onClick={VERS_REVUE.has(l.code) && onRevue ? () => onRevue(id)
                          : l.code === 'AQ' && l.inscrit && peutRetirer ? () => retirerAcquises([{ id, ue: u.ue_num }]) : undefined} />
                      {l.reprise && <span title="Reprise : déjà inscrit à cette unité une année précédente" className="text-[10px] font-semibold text-slate-500">↻</span>}
                      {l.tags.filter(t => t !== 'VA ?').map(t => <span key={t} className="text-[10px] text-slate-500">+{t}</span>)}
                      {l.tags.includes('VA ?') && <span title="Demande de VA en cours" className="text-[10px] text-amber-700">VA?</span>}
                      {!l.inscrit && <span title="VA accordée sans inscription à l'unité cette année" className="text-[10px] text-amber-700">n.i.</span>}
                    </span> : <span className="text-slate-300">·</span>}
                  </td>,
                  ...(ouvertes.has(u.ue_num) ? u.cours.map(c => { const k = l?.cellules?.[c.code]; return (
                    <td key={`${u.ue_num}-${c.code}`} className="px-1.5 py-1 border-b border-slate-100 text-center bg-slate-50/50 whitespace-nowrap">
                      {k ? <Pastille petite k={k.k} texte={k.k === 'RP' && k.note != null ? noteCourte(k.note) : null}
                        sous={k.k === 'RP' ? fr(k.annee) : k.note != null ? noteCourte(k.note) : fr(k.date || k.annee)}
                        titre={`${ETATS[k.k]?.lib}${k.note != null ? ` — note ${k.note}/20` : ''}${k.annee ? ` (${k.annee})` : ''}${VERS_REVUE.has(k.k) ? ' — clic : revue du PAE' : ''}`}
                        onClick={VERS_REVUE.has(k.k) && onRevue ? () => onRevue(id) : undefined} /> : ''}
                    </td>); }) : []),
                ]; })}
              </tr></Fragment>); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

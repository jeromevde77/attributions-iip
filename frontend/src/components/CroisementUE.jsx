/**
 * LE CROISEMENT ACQUIS × PROGRAMME (Charles, 8 octobre 2026 : le classeur de
 * l'UE 335, « tableau AA et contenus programme par cours » — « je veux faire
 * cela pour toutes les UE »).
 *
 * L'ORDRE DU TRAVAIL (Charles, le même jour : « 1) croisement cours/AA, on
 * coche ; 2) cela complète le DUE et la matrice de pondération — la pondération
 * en dépend directement ») :
 *   1. Pour chaque cours, la grille est remplie d'office : TOUS les acquis de
 *      l'unité en colonnes, TOUS les points du programme de ce cours en lignes
 *      (le descriptif s'il les a écrits, sinon le dossier pédagogique). On coche.
 *   2. L'enregistrement en tire le reste :
 *      - le tableau des critères du descriptif suit les croix (une ligne
 *        « acquis + point du programme » par croix ; une croix retirée retire
 *        sa ligne tant qu'aucun indicateur n'y a été écrit ; les lignes posées à
 *        la main dans le descriptif ne sont jamais touchées) ;
 *      - la pondération de l'année : les dix points de chaque cours répartis
 *        au prorata des croix, par pas de 0,5. Elle s'écrit pour qui a le droit
 *        de pondérer (direction, secrétariat) ; pour les autres, elle s'affiche
 *        et attend.
 *
 * Les croix vivent avec le descriptif (`due.contenu.croisement`, par cours puis
 * par point) : elles suivent ses droits et son gel à la validation. Un point
 * ajouté ici s'ajoute au programme du descriptif : une seule liste de points.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconDeviceFloppy, IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { blocsDepuisPoints, lireProgramme } from '../pages/DUE.jsx';

const ANNEE_POINTS = '2026-2027';
const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
const fr = n => Number(n || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });
const echap = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Les points d'un bloc mis en page : ses puces, à défaut ses paragraphes. */
function pointsDuBloc(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  let el = [...doc.querySelectorAll('li')];
  if (!el.length) el = [...doc.querySelectorAll('p')];
  return [...new Set(el.map(e => norm(e.textContent)).filter(t => t.length > 3))];
}

/** Dix points répartis au prorata des croix, par pas de 0,5, somme exacte. */
export function proposer(comptes) {
  const total = Object.values(comptes).reduce((s, n) => s + n, 0);
  if (!total) return {};
  const demi = Object.entries(comptes).map(([aa, n]) => ({ aa, brut: (n / total) * 20 }));
  const out = Object.fromEntries(demi.map(x => [x.aa, Math.floor(x.brut)]));
  let reste = 20 - Object.values(out).reduce((s, n) => s + n, 0);
  for (const x of [...demi].sort((a, b) => (b.brut % 1) - (a.brut % 1))) { if (reste <= 0) break; out[x.aa] += 1; reste -= 1; }
  return Object.fromEntries(Object.entries(out).map(([aa, n]) => [aa, n / 2]));
}

export default function CroisementUE({ ueNum, onEnregistre, suivante = null }) {
  const annee = getAnnee();
  const { passe } = useDroits();
  const [d, setD] = useState(null);
  const [croix, setCroix] = useState({});
  const [ajouts, setAjouts] = useState({});          // cours → points ajoutés ici
  const [saisie, setSaisie] = useState({});
  const [sale, setSale] = useState(false);
  const [liens, setLiens] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    try {
      const j = await api.dueLire(ueNum);
      setD(j); setCroix(j.contenu?.croisement || {}); setAjouts({}); setSale(false);
    } catch (e) { setErreur(e.message); }
    // La pondération actuelle : lue si l'on y a accès, sinon simplement tue.
    fetch(`/api/acquis/ue/${ueNum}/liens?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setLiens).catch(() => setLiens(null));
  }
  useEffect(() => { setMessage(null); setErreur(null); charger(); /* eslint-disable-next-line */ }, [ueNum]);

  const c = d?.contenu || {};
  // Les activités Z (développement professionnel) ne s'évaluent pas et ne comptent pas.
  const cours = (d?.cours || []).filter(x => String(x.ct_pp || '').toUpperCase() !== 'Z');
  const acquis = d?.acquis || [];
  const lecture = !d?.droits?.ecrire;
  const peutPonderer = passe('admin', 'editeur') && annee >= ANNEE_POINTS;

  // TOUS LES POINTS, D'OFFICE. Le descriptif d'abord ; un cours qu'il laisse vide
  // reprend ceux du dossier pédagogique ; une unité d'un seul cours prend tout le
  // programme, faute d'intitulé de cours pour le découper.
  const blocsDP = useMemo(() => (d ? blocsDepuisPoints(
    lireProgramme(d.dp?.programme || (d.points_programme || []).join('\n'), cours), cours) : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [d]);
  const blocsDUE = useMemo(() => (d ? (c.programme_blocs ?? blocsDepuisPoints(
    c.points ?? lireProgramme(c.programme || d.dp?.programme || (d.points_programme || []).join('\n'), cours), cours)) : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [d]);
  const pointsDe = useMemo(() => {
    const m = {};
    for (const x of cours) {
      let p = pointsDuBloc(blocsDUE[x.cours_code]);
      if (!p.length) p = pointsDuBloc(blocsDP[x.cours_code]);
      if (!p.length && cours.length === 1) p = pointsDuBloc(blocsDP._intro).filter(t => !/[,:]$/.test(t));
      m[x.cours_code] = p;
    }
    return m;
  }, [cours, blocsDUE, blocsDP]);
  const points = co => [...(pointsDe[co] || []), ...(ajouts[co] || []).filter(t => !(pointsDe[co] || []).includes(t))];

  const actuel = useMemo(() => {
    const m = {};
    for (const l of liens?.liens || []) (m[l.cours_code] ||= {})[l.aa_code] = Number(l.poids) || 0;
    return m;
  }, [liens]);

  const coche = (co, pt, aa) => (croix[co]?.[pt] || []).includes(aa);
  const basculer = (co, pt, aa) => {
    if (lecture) return;
    setMessage(null); setSale(true);
    setCroix(x => {
      const l = x[co]?.[pt] || [];
      const n = l.includes(aa) ? l.filter(k => k !== aa) : [...l, aa];
      return { ...x, [co]: { ...(x[co] || {}), [pt]: n } };
    });
  };
  const ajouterPoint = co => {
    const t = norm(saisie[co]);
    if (t.length < 4 || points(co).includes(t)) return;
    setAjouts(a => ({ ...a, [co]: [...(a[co] || []), t] }));
    setSaisie(s => ({ ...s, [co]: '' })); setSale(true); setMessage(null);
  };
  const comptes = co => {
    const m = Object.fromEntries(acquis.map(a => [a.aa_code, 0]));
    for (const pt of points(co)) for (const aa of croix[co]?.[pt] || []) if (aa in m) m[aa] += 1;
    return m;
  };
  const orphelins = co => Object.keys(croix[co] || {}).filter(pt => (croix[co][pt] || []).length && !points(co).includes(pt));

  async function enregistrer() {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      // 1. Les croix des points qui existent, rien d'autre.
      const croisement = Object.fromEntries(cours.map(x => [x.cours_code, Object.fromEntries(
        points(x.cours_code).filter(pt => (croix[x.cours_code]?.[pt] || []).length)
          .map(pt => [pt, croix[x.cours_code][pt]]))]));

      // 2. Les points ajoutés ici rejoignent le programme du descriptif.
      let programme_blocs = c.programme_blocs;
      if (Object.values(ajouts).some(l => l?.length)) {
        programme_blocs = { ...blocsDUE };
        for (const [co, l] of Object.entries(ajouts)) {
          if (!l?.length) continue;
          const base = String(programme_blocs[co] || '').trim() || String(blocsDP[co] || '');
          programme_blocs[co] = base + `<ul>${l.map(t => `<li><p>${echap(t)}</p></li>`).join('')}</ul>`;
        }
      }

      // 3. Le tableau des critères suit les croix.
      const unique = !!d.evaluation_unique;
      const grille = JSON.parse(JSON.stringify(c.grille_criteres || {}));
      const voulu = {};                                  // cle → Set("aa|point")
      for (const x of cours) {
        const cle = unique ? '__ue__' : x.cours_code;
        voulu[cle] ||= new Set();
        for (const pt of points(x.cours_code)) for (const aa of croix[x.cours_code]?.[pt] || []) voulu[cle].add(`${aa}|${pt}`);
      }
      // Les croix déjà enregistrées : seule une croix RETIRÉE retire sa ligne.
      const avantCroix = new Set();
      for (const x of cours) for (const [pt, l] of Object.entries(c.croisement?.[x.cours_code] || {}))
        for (const aa of l || []) avantCroix.add(`${unique ? '__ue__' : x.cours_code}|${aa}|${pt}`);
      let ajoutees = 0; let retirees = 0;
      for (const [cle, set] of Object.entries(voulu)) {
        let lignes = grille[cle] || [];
        // Retirer : la ligne d'une croix qu'on vient d'ôter — et seulement tant
        // qu'aucun indicateur n'y est écrit. Les lignes posées à la main restent.
        const avant = lignes.length;
        lignes = lignes.filter(l => !(avantCroix.has(`${cle}|${l.aa_code}|${norm(l.point)}`)
          && !set.has(`${l.aa_code}|${norm(l.point)}`) && !String(l.indicateur || '').trim()));
        retirees += avant - lignes.length;
        for (const k of set) {
          const [aa, ...r] = k.split('|'); const pt = r.join('|');
          if (lignes.some(l => l.aa_code === aa && norm(l.point) === pt)) continue;
          const dernier = lignes.map(l => l.aa_code).lastIndexOf(aa);
          lignes.splice(dernier >= 0 ? dernier + 1 : lignes.length, 0, { aa_code: aa, point: pt });
          ajoutees += 1;
        }
        // Les lignes rangées dans l'ordre des acquis de l'unité.
        const rang = Object.fromEntries(acquis.map((a, i) => [a.aa_code, i]));
        grille[cle] = lignes.map((l, i) => ({ l, i })).sort((a, b) => (rang[a.l.aa_code] ?? 99) - (rang[b.l.aa_code] ?? 99) || a.i - b.i).map(x => x.l);
      }

      await api.dueEnregistrer(ueNum, { ...c, croisement, grille_criteres: grille, ...(programme_blocs ? { programme_blocs } : {}) });

      // 4. La pondération en découle — pour qui a le droit de l'écrire.
      let ponderes = 0;
      if (peutPonderer) {
        for (const x of cours) {
          const n = {};
          for (const a of acquis) n[a.aa_code] = 0;
          for (const pt of points(x.cours_code)) for (const aa of croisement[x.cours_code]?.[pt] || []) if (aa in n) n[aa] += 1;
          const prop = proposer(n);
          if (!Object.keys(prop).length) continue;
          const identique = acquis.every(a => (prop[a.aa_code] || 0) === (actuel[x.cours_code]?.[a.aa_code] || 0));
          if (identique) continue;
          const r = await fetch('/api/acquis/ponderations', { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ue_num: ueNum, cours_code: x.cours_code, annee,
              ponderations: acquis.map(a => ({ aa_code: a.aa_code, poids: prop[a.aa_code] || 0 })) }) });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Pondération du cours ${x.cours_code} : ${j.error || r.status}`); }
          ponderes += 1;
        }
      }
      await charger();
      onEnregistre?.();
      setMessage(['Croisement enregistré',
        ajoutees || retirees ? `tableau des critères : ${ajoutees} ligne(s) ajoutée(s)${retirees ? `, ${retirees} retirée(s)` : ''}` : null,
        peutPonderer ? (ponderes ? `pondération ${annee} mise à jour pour ${ponderes} cours` : 'pondération déjà conforme')
          : 'la pondération proposée sera reprise par la direction ou le secrétariat'].filter(Boolean).join(' — ') + '.');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  if (erreur && !d) return <p className="text-sm text-red-700">{erreur}</p>;
  if (!d) return <p className="text-sm text-slate-400">Chargement…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-second text-slate-600 m-0 mr-auto max-w-3xl">
          Pour chaque cours, cochez les acquis que sert chaque point de son programme. L’enregistrement
          en tire la pondération (étape 2) et le tableau des critères du descriptif (étape 3).
        </p>
        {!lecture && (
          <button className="bouton bouton-fort disabled:opacity-40" onClick={enregistrer} disabled={enCours || !sale}>
            <IconDeviceFloppy size={14} /> Enregistrer
          </button>)}
      </div>
      {lecture && <p className="text-second text-slate-500 m-0">Lecture seule{d.statut === 'validee' ? ' : le descriptif est validé' : ''}.</p>}
      {erreur && <p className="text-second flex items-start gap-1.5 m-0" style={{ color: 'var(--c-refuse)' }}><IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}</p>}
      {message && (
        <p className="text-second text-slate-700 flex flex-wrap items-center gap-1.5 m-0"><IconCheck size={14} />{message}
          {suivante && <button type="button" className="underline text-iip-blue ml-1" onClick={suivante}>Étape suivante →</button>}</p>)}

      {/* LA LÉGENDE DES ACQUIS (Charles, 8 octobre 2026 : « il faut la légende des AA…
          c'est important »). Les colonnes ne portent que le code : sans le texte, on
          coche au jugé. */}
      {acquis.length > 0 && (
        <section className="rounded-carte border border-slate-200 px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Acquis d’apprentissage de l’unité</div>
          <dl className="m-0 grid gap-x-4 gap-y-1 text-second" style={{ gridTemplateColumns: 'max-content 1fr' }}>
            {acquis.map(a => (
              <div key={a.aa_code} className="contents">
                <dt className="font-semibold text-iip-blue">{a.aa_code}</dt>
                <dd className="m-0 text-slate-700">{a.description || '—'}</dd>
              </div>))}
          </dl>
        </section>)}

      {cours.map(x => {
        const co = x.cours_code;
        const pts = points(co);
        const n = comptes(co);
        const total = Object.values(n).reduce((s, v) => s + v, 0);
        const prop = proposer(n);
        const lies = new Set(x.acquis || []);
        const orph = orphelins(co);
        const aActuel = !!actuel[co] && Object.keys(actuel[co]).length > 0;
        return (
          <section key={co} className="rounded-carte border border-slate-200 overflow-hidden">
            <div className="tab-entete px-3 py-1.5 text-second font-semibold flex flex-wrap items-center gap-2">
              <span>{co} — {x.cours_nom || ''}</span>
              <span className="font-normal text-slate-500">{pts.length} point(s) du programme · {total} croix</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-second border-collapse">
                <thead><tr className="tab-entete">
                  <th className="text-left px-3 py-1 font-semibold text-slate-600">Point du programme</th>
                  {acquis.map(a => (
                    <th key={a.aa_code} title={a.description} className={`px-1.5 py-1 w-16 text-center ${lies.has(a.aa_code) ? 'text-iip-blue' : 'text-slate-500 font-normal'}`}>
                      {a.aa_code}
                    </th>))}
                </tr></thead>
                <tbody>
                  {!pts.length && (
                    <tr><td colSpan={acquis.length + 1} className="px-3 py-2 text-slate-400">
                      Le programme ne nomme aucun point pour ce cours. Ajoutez-les ci-dessous : ils rejoindront le descriptif.
                    </td></tr>)}
                  {pts.map(pt => (
                    <tr key={pt} className="border-t border-slate-100 bg-white">
                      <td className="px-3 py-1 text-slate-800">{pt}</td>
                      {acquis.map(a => {
                        const on = coche(co, pt, a.aa_code);
                        return (
                          <td key={a.aa_code} className="text-center py-1">
                            <button type="button" disabled={lecture} onClick={() => basculer(co, pt, a.aa_code)}
                              aria-label={`${a.aa_code} — ${pt}`} aria-pressed={on}
                              className={`w-6 h-6 rounded-md border inline-grid place-items-center ${on ? 'text-white border-transparent' : 'border-slate-300 text-transparent'} ${lecture ? '' : 'hover:border-iip-blue'}`}
                              style={on ? { background: 'var(--c-principal, #19537E)' } : undefined}>
                              <IconCheck size={14} />
                            </button>
                          </td>);
                      })}
                    </tr>))}
                  {!lecture && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={acquis.length + 1} className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <input className="controle flex-1 min-w-0 h-8" placeholder="Ajouter un point du programme à ce cours…"
                            value={saisie[co] || ''} onChange={e => setSaisie(s => ({ ...s, [co]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') ajouterPoint(co); }} />
                          <button type="button" className="bouton h-8" onClick={() => ajouterPoint(co)}><IconPlus size={13} /> Point</button>
                        </div>
                      </td>
                    </tr>)}
                </tbody>
                <tfoot className="text-slate-600">
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-1 text-right">Croix</td>
                    {acquis.map(a => <td key={a.aa_code} className="text-center font-semibold">{n[a.aa_code] || ''}</td>)}
                  </tr>
                  <tr>
                    <td className="px-3 py-1 text-right">Pondération qui en découle (sur 10)</td>
                    {acquis.map(a => <td key={a.aa_code} className="text-center font-semibold text-iip-blue">{prop[a.aa_code] ? fr(prop[a.aa_code]) : ''}</td>)}
                  </tr>
                  {aActuel && (
                    <tr>
                      <td className="px-3 py-1 text-right">Pondération enregistrée ({annee})</td>
                      {acquis.map(a => <td key={a.aa_code} className="text-center text-slate-500">{actuel[co]?.[a.aa_code] ? fr(actuel[co][a.aa_code]) : ''}</td>)}
                    </tr>)}
                </tfoot>
              </table>
            </div>
            {orph.length > 0 && (
              <p className="text-xs text-slate-500 m-0 px-3 py-1.5 border-t border-slate-100">
                {orph.length} point(s) coché(s) n’existent plus au programme (texte modifié) : leurs croix seront retirées à l’enregistrement.
              </p>)}
          </section>);
      })}
    </div>);
}

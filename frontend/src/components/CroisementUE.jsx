/**
 * LE CROISEMENT ACQUIS × PROGRAMME (Charles, 8 octobre 2026 : le classeur de
 * l'UE 335, « tableau AA et contenus programme par cours » — « je veux faire
 * cela pour toutes les UE »).
 *
 * Pour chaque cours, les points de SON programme (ceux du descriptif, bloc par
 * cours) croisent les acquis de l'unité : une case cochée dit que ce point sert
 * cet acquis. Deux usages, et aucun n'est imposé :
 *   - le nombre de croix PROPOSE la répartition des dix points du cours entre
 *     ses acquis ; elle ne passe dans la pondération que sur un clic ;
 *   - les croix REMPLISSENT le tableau des critères du descriptif (une ligne
 *     « acquis + point du programme »), en ajout seul : rien de ce que
 *     l'enseignant y a déjà écrit n'est touché.
 *
 * Les croix vivent avec le descriptif (`due.contenu.croisement`, par cours puis
 * par point) : elles suivent ses droits et son gel à la validation.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconDeviceFloppy, IconAlertTriangle, IconTableImport, IconPercentage } from '@tabler/icons-react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { demander } from '../lib/dialogue.jsx';
import { blocsDepuisPoints, lireProgramme } from '../pages/DUE.jsx';

const ANNEE_POINTS = '2026-2027';
const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
const fr = n => Number(n || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });

/** Les points d'un bloc mis en page : ses puces, à défaut ses paragraphes. */
function pointsDuBloc(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  let el = [...doc.querySelectorAll('li')];
  if (!el.length) el = [...doc.querySelectorAll('p')];
  return [...new Set(el.map(e => norm(e.textContent)).filter(t => t.length > 3))];
}

/** Dix points répartis au prorata des croix, par pas de 0,5, somme exacte. */
function proposer(comptes) {
  const total = Object.values(comptes).reduce((s, n) => s + n, 0);
  if (!total) return {};
  const demi = Object.entries(comptes).map(([aa, n]) => ({ aa, brut: (n / total) * 20 }));
  const out = Object.fromEntries(demi.map(x => [x.aa, Math.floor(x.brut)]));
  let reste = 20 - Object.values(out).reduce((s, n) => s + n, 0);
  for (const x of [...demi].sort((a, b) => (b.brut % 1) - (a.brut % 1))) { if (reste <= 0) break; out[x.aa] += 1; reste -= 1; }
  return Object.fromEntries(Object.entries(out).map(([aa, n]) => [aa, n / 2]));
}

export default function CroisementUE({ ueNum }) {
  const annee = getAnnee();
  const { passe } = useDroits();
  const [d, setD] = useState(null);
  const [croix, setCroix] = useState({});
  const [sale, setSale] = useState(false);
  const [liens, setLiens] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setErreur(null);
    try {
      const j = await api.dueLire(ueNum);
      setD(j); setCroix(j.contenu?.croisement || {}); setSale(false);
    } catch (e) { setErreur(e.message); }
    // La pondération actuelle : lue si l'on y a accès, sinon simplement tue.
    fetch(`/api/acquis/ue/${ueNum}/liens?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setLiens).catch(() => setLiens(null));
  }
  useEffect(() => { setMessage(null); charger(); /* eslint-disable-next-line */ }, [ueNum]);

  const c = d?.contenu || {};
  const cours = d?.cours || [];
  const acquis = d?.acquis || [];
  const lecture = !d?.droits?.ecrire;
  const peutPonderer = passe('admin', 'editeur') && annee >= ANNEE_POINTS;

  const points = useMemo(() => {
    if (!d) return {};
    const blocs = c.programme_blocs ?? blocsDepuisPoints(
      c.points ?? lireProgramme(c.programme || d.dp?.programme || (d.points_programme || []).join('\n'), cours), cours);
    return Object.fromEntries(cours.map(x => [x.cours_code, pointsDuBloc(blocs[x.cours_code])]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

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
  const comptes = co => {
    const m = Object.fromEntries(acquis.map(a => [a.aa_code, 0]));
    for (const pt of points[co] || []) for (const aa of croix[co]?.[pt] || []) if (aa in m) m[aa] += 1;
    return m;
  };
  // Des croix posées sur un point qui n'est plus au programme (texte changé).
  const orphelins = co => Object.keys(croix[co] || {}).filter(pt => (croix[co][pt] || []).length && !(points[co] || []).includes(pt));

  // Ce qu'on enregistre : les croix des points qui existent, rien d'autre.
  const nettoye = () => Object.fromEntries(cours.map(x => [x.cours_code, Object.fromEntries(
    (points[x.cours_code] || []).filter(pt => (croix[x.cours_code]?.[pt] || []).length)
      .map(pt => [pt, croix[x.cours_code][pt]]))]));

  async function enregistrer(extra = {}) {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      await api.dueEnregistrer(ueNum, { ...c, croisement: nettoye(), ...extra });
      await charger();
      return true;
    } catch (e) { setErreur(e.message); return false; }
    finally { setEnCours(false); }
  }

  async function remplirCriteres() {
    const unique = !!d.evaluation_unique;
    const grille = JSON.parse(JSON.stringify(c.grille_criteres || {}));
    let ajouts = 0;
    for (const x of cours) {
      const cle = unique ? '__ue__' : x.cours_code;
      const lignes = grille[cle] || [];
      for (const pt of points[x.cours_code] || []) {
        for (const aa of croix[x.cours_code]?.[pt] || []) {
          if (lignes.some(l => l.aa_code === aa && norm(l.point) === pt)) continue;
          const dernier = lignes.map(l => l.aa_code).lastIndexOf(aa);
          lignes.splice(dernier >= 0 ? dernier + 1 : lignes.length, 0, { aa_code: aa, point: pt });
          ajouts += 1;
        }
      }
      grille[cle] = lignes;
    }
    if (!ajouts) { setMessage('Le tableau des critères porte déjà chacun de ces croisements : rien à ajouter.'); return; }
    if (!(await demander(`Ajouter ${ajouts} ligne(s) au tableau des critères du descriptif ?\n\n`
      + 'Une ligne par croisement « acquis + point du programme » qui n’y figure pas encore. '
      + 'Les lignes existantes ne sont pas modifiées ; les indicateurs restent à écrire.'))) return;
    if (await enregistrer({ grille_criteres: grille })) setMessage(`${ajouts} ligne(s) ajoutée(s) au tableau des critères — à compléter dans l’onglet Descriptif.`);
  }

  async function reporter(co) {
    const prop = proposer(comptes(co));
    const lignes = Object.entries(prop).filter(([, v]) => v);
    if (!(await demander(`Reporter dans la pondération ${annee} du cours ${co} ?\n\n`
      + lignes.map(([aa, v]) => `${aa} : ${fr(v)} point(s)`).join('\n')
      + '\n\nLes points actuels de ce cours sont remplacés.'))) return;
    setErreur(null);
    try {
      const r = await fetch('/api/acquis/ponderations', { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ue_num: ueNum, cours_code: co, annee,
          ponderations: acquis.map(a => ({ aa_code: a.aa_code, poids: prop[a.aa_code] || 0 })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Refusé (${r.status})`);
      setMessage(`Pondération du cours ${co} reprise du croisement.`);
      await charger();
    } catch (e) { setErreur(e.message); }
  }

  if (erreur && !d) return <p className="text-[13px] text-red-700">{erreur}</p>;
  if (!d) return <p className="text-[13px] text-slate-400">Chargement…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-slate-600 m-0 mr-auto max-w-3xl">
          Pour chaque cours, cochez les acquis que sert chaque point de son programme. Les points viennent du descriptif
          (onglet <b>Descriptif</b>, programme par cours) : on les écrit là, on les croise ici.
        </p>
        {!lecture && (
          <button className="bouton" onClick={remplirCriteres} disabled={enCours || sale}
            title={sale ? 'Enregistrez d’abord les croix' : 'Une ligne par croisement absent du tableau des critères'}>
            <IconTableImport size={14} /> Remplir le tableau des critères
          </button>)}
        {!lecture && (
          <button className="bouton bouton-fort disabled:opacity-40" onClick={() => enregistrer().then(ok => ok && setMessage('Croisement enregistré.'))}
            disabled={enCours || !sale}>
            <IconDeviceFloppy size={14} /> Enregistrer
          </button>)}
      </div>
      {lecture && <p className="text-[12px] text-slate-500 m-0">Lecture seule{d.statut === 'validee' ? ' : le descriptif est validé' : ''}.</p>}
      {erreur && <p className="text-[12px] flex items-start gap-1.5 m-0" style={{ color: 'var(--c-refuse)' }}><IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}</p>}
      {message && <p className="text-[12px] text-slate-700 flex items-center gap-1.5 m-0"><IconCheck size={14} />{message}</p>}

      {cours.map(x => {
        const co = x.cours_code;
        const pts = points[co] || [];
        const n = comptes(co);
        const total = Object.values(n).reduce((s, v) => s + v, 0);
        const prop = proposer(n);
        const lies = new Set(x.acquis || []);
        const orph = orphelins(co);
        const aActuel = !!actuel[co] && Object.keys(actuel[co]).length > 0;
        const differe = acquis.some(a => (prop[a.aa_code] || 0) !== (actuel[co]?.[a.aa_code] || 0));
        return (
          <section key={co} className="rounded-carte border border-slate-200 overflow-hidden">
            <div className="tab-entete px-3 py-1.5 text-[12px] font-semibold flex flex-wrap items-center gap-2">
              <span>{co} — {x.cours_nom || ''}</span>
              <span className="font-normal text-slate-500">{pts.length} point(s) du programme · {total} croix</span>
              {peutPonderer && total > 0 && differe && (
                <button className="bouton ml-auto h-7 text-[12px]" onClick={() => reporter(co)} disabled={sale}
                  title={sale ? 'Enregistrez d’abord les croix' : 'Écrire les points proposés dans la pondération de l’année'}>
                  <IconPercentage size={13} /> Reporter dans la pondération
                </button>)}
            </div>
            {!pts.length ? (
              <p className="text-[12px] text-slate-400 m-0 px-3 py-2">Aucun point de programme pour ce cours : écrivez-le dans l’onglet Descriptif (une puce par point).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead><tr className="tab-entete">
                    <th className="text-left px-3 py-1 font-semibold text-slate-600">Point du programme</th>
                    {acquis.map(a => (
                      <th key={a.aa_code} title={a.description} className={`px-1.5 py-1 w-14 text-center ${lies.has(a.aa_code) ? 'text-iip-blue' : 'text-slate-400 font-normal'}`}>
                        {a.aa_code}
                      </th>))}
                  </tr></thead>
                  <tbody>
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
                  </tbody>
                  <tfoot className="text-slate-600">
                    <tr className="border-t border-slate-200">
                      <td className="px-3 py-1 text-right">Croix</td>
                      {acquis.map(a => <td key={a.aa_code} className="text-center font-semibold">{n[a.aa_code] || ''}</td>)}
                    </tr>
                    <tr>
                      <td className="px-3 py-1 text-right">Points proposés (sur 10)</td>
                      {acquis.map(a => <td key={a.aa_code} className="text-center">{prop[a.aa_code] ? fr(prop[a.aa_code]) : ''}</td>)}
                    </tr>
                    {aActuel && (
                      <tr>
                        <td className="px-3 py-1 text-right">Pondération actuelle ({annee})</td>
                        {acquis.map(a => <td key={a.aa_code} className="text-center text-slate-500">{actuel[co]?.[a.aa_code] ? fr(actuel[co][a.aa_code]) : ''}</td>)}
                      </tr>)}
                  </tfoot>
                </table>
              </div>
            )}
            {orph.length > 0 && (
              <p className="text-[11px] text-slate-500 m-0 px-3 py-1.5 border-t border-slate-100">
                {orph.length} point(s) coché(s) n’existent plus au programme (texte modifié) : leurs croix seront retirées à l’enregistrement.
              </p>)}
          </section>);
      })}
    </div>);
}

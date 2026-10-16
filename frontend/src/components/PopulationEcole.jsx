/**
 * GESTION → POPULATION (3.1.334, Charles, 14 octobre 2026 : « une page pour les données
 * qualitatives — sexe, région d'origine, nombre par section, nouveaux étudiants, inscrits en
 * année diplômante, avec de beaux graphes »). L'origine : le domicile (code postal) et la
 * nationalité ; l'année diplômante : le bloc 3, niveau principal. Chaque répartition dit sur
 * combien de fiches renseignées elle porte. Les graphiques sont ceux de la maison
 * (components/graphiques.jsx) ; l'évolution sur cinq ans, recharts, comme la dotation.
 */
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Anneau, Barres, SERIES, couleurSerie } from './graphiques.jsx';
import { TuileEtat } from './ui.jsx';
import { saisir, informer } from '../lib/dialogue.jsx';

const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');
const NOM_SECTION = s => String(s || '').replace(/_/g, ' ');

function Carte({ titre, sous, children, className = '' }) {
  return (
    <section className={`carte p-4 space-y-3 min-w-0 ${className}`}>
      <div><div className="titre-carte">{titre}</div>{sous && <div className="text-second text-slate-500">{sous}</div>}</div>
      {children}
    </section>);
}

export default function PopulationEcole({ annee: anneeProp }) {
  const annee = anneeProp || getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState('');   // '' = toute l'école
  const [tour, setTour] = useState(0);

  /* CORRIGER UN CHIFFRE DE RÉFÉRENCE (14 octobre 2026) : la direction clique une case d'une année
     de référence ; la valeur d'origine reste en base, la case corrigée s'écrit en italique. */
  async function corriger(annee, sec, actuel, info) {
    const v = await saisir({ message: `${NOM_SECTION(sec)} · ${annee} — nombre d'inscrits`
      + (info?.origine != null ? ` (source : ${info.origine})` : '') + '. Vide : retirer une case ajoutée.',
      valeur: actuel == null ? '' : String(actuel) });
    if (v == null) return;
    const motif = String(v).trim() === String(actuel ?? '') ? null
      : await saisir({ message: 'Pourquoi ce chiffre change-t-il ? (gardé au journal)' });
    if (motif == null && String(v).trim() !== String(actuel ?? '')) return;
    const r = await fetch('/api/pilotage/inscrits-reference', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ annee, section: sec, total: String(v).trim(), motif }) });
    const j = await r.json();
    if (!r.ok) { await informer(j.error || 'Correction refusée.'); return; }
    setTour(t => t + 1);
  }

  useEffect(() => {
    setErreur(null);
    fetch(`/api/pilotage/population-ecole?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); })
      .catch(e => setErreur(e.message));
  }, [annee, tour]);

  if (erreur) return <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>;
  if (!d) return <div className="text-slate-400 py-12 text-center">Chargement…</div>;

  const v = section ? d.sections.find(s => s.section === section) || d.ensemble : d.ensemble;
  const sexeConnu = v.F + v.M + v.X;
  const natConnue = v.be + v.ue + v.hors_ue;
  const dom = v.domicile;
  const domConnu = dom.bruxelles + dom.wallonie + dom.flandre;
  const ageConnu = v.m25 + v.m35 + v.m45 + v.p45;
  const pays = Object.entries(v.pays || {}).filter(([p]) => p !== 'Belgique').sort((a, b) => b[1] - a[1]).slice(0, 10);
  const sectionsEvo = [...new Set(d.evolution.flatMap(a => Object.keys(a.par_section)))]
    .sort((a, b) => (d.evolution.at(-1)?.par_section[b] || 0) - (d.evolution.at(-1)?.par_section[a] || 0));
  const niveaux = ['BA1', 'BA2', 'BA3', ...Object.keys(v.par_niveau).filter(n => !['BA1', 'BA2', 'BA3'].includes(n))];

  return (
    <div className="space-y-4">
      {/* Toute l'école, ou une section : tout l'écran suit. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="segments">
          {[['', 'Toute l’école'], ...d.sections.map(s => [s.section, NOM_SECTION(s.section)])].map(([k, l]) => (
            <button key={k || 'tout'} type="button" onClick={() => setSection(k)}
              className={section === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>))}
        </div>
        <span className="text-second text-slate-400 ml-auto">{d.annee} · inscrits au {d.ref.split('-').reverse().join('/')}, hors archivés</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[150px]"><TuileEtat etat="fort" valeur={k0(v.n)} libelle="inscrits" precision={section ? NOM_SECTION(section) : `${d.sections.length} sections`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={k0(v.primo)} libelle="nouveaux étudiants" precision={`${pc(v.primo, v.n)} — aucune inscription avant ${d.annee}`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={k0(v.ba3)} libelle="en année diplômante" precision={`${pc(v.ba3, v.n)} — bloc 3, niveau principal`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={pc(v.F, sexeConnu)} libelle="de femmes" precision={`${k0(v.F)} F · ${k0(v.M)} M${v.X ? ` · ${k0(v.X)} X` : ''}`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={v.age_moyen != null ? `${Math.round(v.age_moyen)} ans` : '—'} libelle="âge moyen" precision={`${k0(v.m25)} de moins de 25 ans`} /></div>
      </div>

      {!section && (
        <Carte titre="Les inscrits par section" sous="Un étudiant inscrit dans deux sections compte dans chacune ; le total de l'école le compte une fois.">
          <Barres format={k0} lignes={d.sections.map((s, i) => ({ nom: NOM_SECTION(s.section), valeur: s.n, couleur: couleurSerie(i) }))} />
        </Carte>)}

      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Sexe" sous={`Sur ${k0(sexeConnu)} fiches renseignées${v.sexe_inconnu ? ` · ${k0(v.sexe_inconnu)} sans sexe` : ''}`}>
          <Anneau centre={k0(sexeConnu)} parts={[{ nom: 'Femmes', valeur: v.F, couleur: 'var(--g-3)' }, { nom: 'Hommes', valeur: v.M, couleur: 'var(--g-1)' }, { nom: 'X', valeur: v.X, couleur: 'var(--g-2)' }]} />
        </Carte>
        <Carte titre="Âge" sous={`Sur ${k0(ageConnu)} dates de naissance${v.age_inconnu ? ` · ${k0(v.age_inconnu)} inconnues` : ''}`}>
          <Barres format={n => `${k0(n)} · ${pc(n, ageConnu)}`} lignes={[
            { nom: 'moins de 25 ans', valeur: v.m25 }, { nom: '25 à 34 ans', valeur: v.m35 },
            { nom: '35 à 44 ans', valeur: v.m45 }, { nom: '45 ans et plus', valeur: v.p45 }]} />
        </Carte>
        <Carte titre="Domicile" sous={`Région du code postal · sur ${k0(domConnu)} adresses belges${dom.inconnu ? ` · ${k0(dom.inconnu)} sans code postal belge` : ''}`}>
          <Anneau centre={k0(domConnu)} parts={[{ nom: 'Bruxelles', valeur: dom.bruxelles, couleur: 'var(--g-1)' }, { nom: 'Wallonie', valeur: dom.wallonie, couleur: 'var(--g-2)' }, { nom: 'Flandre', valeur: dom.flandre, couleur: 'var(--g-3)' }]} />
          <div className="intertitre pt-1">Les communes les plus représentées</div>
          <Barres format={n => `${k0(n)} · ${pc(n, domConnu)}`} lignes={dom.communes.slice(0, 10).map(c => ({ nom: c.nom, valeur: c.n }))} />
        </Carte>
        <Carte titre="Nationalité" sous={`Sur ${k0(natConnue)} nationalités renseignées${v.nat_inconnue ? ` · ${k0(v.nat_inconnue)} inconnues` : ''}`}>
          <Anneau centre={k0(natConnue)} parts={[{ nom: 'Belges', valeur: v.be, couleur: 'var(--g-1)' }, { nom: 'Union européenne', valeur: v.ue, couleur: 'var(--g-2)' }, { nom: 'Hors Union européenne', valeur: v.hors_ue, couleur: 'var(--g-3)' }]} />
          {pays.length > 0 && <>
            <div className="intertitre pt-1">Les autres nationalités</div>
            <Barres format={n => `${k0(n)} · ${pc(n, natConnue)}`} lignes={pays.map(([nom, n]) => ({ nom, valeur: n }))} />
          </>}
        </Carte>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Par bloc" sous="Le niveau principal de chaque étudiant : celui où il a le plus d'unités, le plus bas en cas d'égalité.">
          <Barres format={n => `${k0(n)} · ${pc(n, v.n)}`} lignes={niveaux.filter(n => v.par_niveau[n]).map(n => ({ nom: n === 'BA3' ? 'BA3 — diplômante' : n, valeur: v.par_niveau[n] }))} />
        </Carte>
        {!section && (
          <Carte titre="Nouveaux étudiants par section" sous="Aucune inscription ni valorisation dans une année antérieure.">
            <Barres format={n => `${k0(n)}`} lignes={d.sections.map(s => ({ nom: `${NOM_SECTION(s.section)} · ${pc(s.primo, s.n)}`, valeur: s.primo }))} />
          </Carte>)}
      </div>

      {d.evolution.length > 1 && (
        <Carte titre="L'évolution des inscrits" sous={`Par section, sur ${d.evolution.length} années. Les années passées se lisent dans les chiffres de référence de la direction (Lucie n'en a qu'une partie) ; les autres, dans les inscriptions de Lucie.`}>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={d.evolution.map(a => ({ annee: a.annee, ...(section ? { [section]: a.par_section[section] || 0 } : a.par_section) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--g-grille, #E5E7EB)" vertical={false} />
                <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(section ? [section] : sectionsEvo).map((s, i) => (
                  <Bar key={s} dataKey={s} name={NOM_SECTION(s)} stackId="a" fill={couleurSerie(i)} />))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!section && (
            <div className="overflow-x-auto">
              <table className="w-full text-second">
                <thead><tr className="tab-entete">
                  <th className="px-2 py-1 text-left">Année</th><th className="px-2 py-1 text-left">Source</th><th className="px-2 py-1 text-right">Inscrits</th>
                  <th className="px-2 py-1 text-right" title="Chiffres de référence : les inscrits en BA1. Lucie : les nouveaux étudiants (aucune inscription avant).">BA1 / nouveaux</th>
                  {sectionsEvo.map(s => <th key={s} className="px-2 py-1 text-right">{NOM_SECTION(s)}</th>)}
                </tr></thead>
                <tbody>{d.evolution.map(a => (
                  <tr key={a.annee} className="border-t border-slate-100">
                    <td className="px-2 py-1">{a.annee}</td>
                    <td className="px-2 py-1 text-slate-500" title={(a.notes || []).join(' · ')}>{a.source === 'reference' ? 'référence' : 'Lucie'}{a.notes?.length ? ' *' : ''}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold">{k0(a.total)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{a.source === 'reference' ? (a.ba1 != null ? k0(a.ba1) : '—') : k0(a.primo)}</td>
                    {sectionsEvo.map(s => {
                      const m = a.modifies?.[s];
                      const txt = a.par_section[s] != null ? k0(a.par_section[s]) : '—';
                      const titre = m ? `Corrigé${m.par ? ` par ${m.par}` : ''}${m.le ? ` le ${m.le.slice(0, 10).split('-').reverse().join('/')}` : ''} — ${m.origine != null ? `source : ${m.origine}` : 'absent de la source'}` : undefined;
                      return (
                        <td key={s} className={`px-2 py-1 text-right tabular-nums ${m ? 'italic' : ''}`} title={titre}>
                          {a.source === 'reference' && d.peut_corriger
                            ? <button type="button" className="hover:underline" onClick={() => corriger(a.annee, s, a.par_section[s], m)}>{txt}</button>
                            : txt}
                        </td>);
                    })}
                  </tr>))}</tbody>
              </table>
              <p className="text-mention text-slate-400 pt-1">
                <i>En italique</i> : un chiffre de référence corrigé dans Lucie — la valeur de la source reste au survol et au journal.
                {d.peut_corriger && ' Un clic sur un chiffre d’une année de référence le corrige.'}
              </p>
            </div>)}
        </Carte>)}
    </div>);
}

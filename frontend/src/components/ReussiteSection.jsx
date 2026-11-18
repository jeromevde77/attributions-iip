/* LA RÉUSSITE D'UNE SECTION, EN GRAPHIQUES (3.5.551, Charles, 18 novembre 2026 : « dans une section, on doit tout avoir au niveau
   réussite : la section, les UE, les cours, toutes les statistiques, de beaux graphiques — un focus détaillé section »).
   Mêmes chiffres que les tableaux (GET /api/stats-deliberation?annee=&section=), mis en image : l'évolution sur trois ans, les blocs,
   les unités, les cours. Rien ne se recalcule ici. */
import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell, ReferenceLine, LabelList } from 'recharts';
import { authHeaders } from '../lib/api.js';
import { couleursGraphique } from '../lib/couleurs.js';
import { EnteteCarte, TuileEtat, Encadre } from './ui.jsx';
import ChargementLucie from './ChargementLucie.jsx';
import { ComparerA } from './Disques.jsx';

const avant = (a, k) => { const x = Number(String(a).slice(0, 4)) - k; return `${x}-${x + 1}`; };
const pc = v => (v == null ? '—' : `${Math.round(v)} %`);
const lire = (annee, section) => fetch(`/api/stats-deliberation?${new URLSearchParams({ annee, section })}`, { headers: authHeaders() })
  .then(r => (r.ok ? r.json() : null)).catch(() => null);

function Carte({ titre, sous, hauteur = 260, children }) {
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre={titre} sous={sous} />
      <div className="p-3" style={{ height: hauteur }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </section>);
}

export default function ReussiteSection({ section, annee, refs = null }) {
  const [annees, setAnnees] = useState(null);
  const [ref, setRef] = useState('IIP');
  useEffect(() => {
    let vivant = true; setAnnees(null);
    const l = [avant(annee, 2), avant(annee, 1), annee];
    Promise.all(l.map(a => lire(a, section))).then(r => vivant && setAnnees(l.map((a, i) => ({ annee: a, data: r[i] }))));
    return () => { vivant = false; };
  }, [section, annee]);
  if (!annees) return <ChargementLucie texte="Lucie lit les délibérations de la section…" />;
  const cur = annees[annees.length - 1].data;
  if (!cur?.total) return <Encadre etat="neutre" titre={`Aucune délibération pour ${section} en ${annee}.`} />;
  const G = couleursGraphique();
  const teinte = v => (v == null ? G.vide || '#CBD5E1' : v >= 70 ? G.reussi : v >= 50 ? G.attente : G.refuse);
  const T = cur.total;
  const evolution = annees.filter(x => x.data?.total?.s1?.decides).map(x => ({ annee: x.annee.slice(2, 4) + '-' + x.annee.slice(7, 9),
    s1: x.data.total.s1.taux_reussite, final: x.data.total.final.taux_reussite, inscrits: x.data.total.inscrits }));
  const blocs = (cur.par_niveau || []).filter(b => b.s1?.decides).map(b => ({ nom: b.libelle, reussi: b.s1.reussi, ajourne: b.s1.ajourne,
    refuse: (b.s1.refuse || 0) + (b.s1.absent || 0), final: b.final.taux_reussite }));
  const ues = (cur.par_ue || []).filter(u => u.s1?.decides).map(u => ({ nom: u.libelle, s1: u.s1.taux_reussite, final: u.final.taux_reussite, n: u.s1.decides }))
    .sort((a, b) => (a.final ?? 0) - (b.final ?? 0));
  const cours = (cur.par_cours || []).filter(c => c.moyenne != null).map(c => ({ nom: `${c.cours_code}${c.cours_nom ? ` · ${c.cours_nom}` : ''}`,
    moyenne: Number(c.moyenne), seuil: c.taux_au_seuil, notes: c.notes, ue: c.ue_num })).sort((a, b) => a.moyenne - b.moyenne);
  const hUe = Math.max(220, ues.length * 26 + 60), hCours = Math.max(220, Math.min(cours.length, 60) * 22 + 60);
  const court = s => (String(s).length > 46 ? `${String(s).slice(0, 45)}…` : s);
  const R = refs?.[ref] || {};
  const parRef = v => `${ref} : ${v == null ? 'non disponible' : pc(v)}`;
  return (
    <div className="space-y-3">
      {refs && <div className="flex justify-end"><ComparerA valeur={ref} onChange={setRef} /></div>}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <TuileEtat taille="grande" etat="neutre" valeur={T.s1.decides} libelle="décisions de 1re session" precision={`${T.inscrits} inscriptions en ${annee}`} />
        <TuileEtat taille="grande" etat={T.s1.taux_reussite >= 70 ? 'reussi' : T.s1.taux_reussite >= 50 ? 'surveiller' : 'corriger'} valeur={pc(T.s1.taux_reussite)} libelle="réussite en 1re session" precision={refs ? parRef(R.s1) : null}
          aide="Unités réussies ÷ unités décidées en 1re session (une inscription à une UE = une décision)." />
        <TuileEtat taille="grande" etat={T.final.taux_reussite >= 70 ? 'reussi' : T.final.taux_reussite >= 50 ? 'surveiller' : 'corriger'} valeur={pc(T.final.taux_reussite)} libelle="réussite après les deux sessions"
          precision={[refs ? parRef(R.final) : '', T.s2.attendus ? `${T.s2.decides} / ${T.s2.attendus} ajournés revenus en 2e` : ''].filter(Boolean).join(' · ') || null} />
        <TuileEtat taille="grande" etat={cur.dossiers_ouverts ? 'surveiller' : 'neutre'} valeur={cur.dossiers_ouverts || 0} libelle="inscriptions sans décision"
          precision={cur.dossiers_ouverts ? 'hors des taux' : 'année complète'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {evolution.length > 1 && (
          <Carte titre="L’évolution sur trois ans" sous="réussite en 1re session et après les deux sessions">
            <LineChart data={evolution} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={G.grille} />
              <XAxis dataKey="annee" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit=" %" />
              <Tooltip formatter={v => pc(v)} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="s1" name="1re session" stroke={G.attente} strokeWidth={2.5} dot={{ r: 4 }}><LabelList dataKey="s1" position="top" formatter={pc} style={{ fontSize: 11 }} /></Line>
              <Line type="monotone" dataKey="final" name="Après les deux sessions" stroke={G.reussi} strokeWidth={2.5} dot={{ r: 4 }}><LabelList dataKey="final" position="top" formatter={pc} style={{ fontSize: 11 }} /></Line>
            </LineChart>
          </Carte>)}
        {!!blocs.length && (
          <Carte titre="Les décisions par bloc" sous={`1re session, ${annee} · au-dessus de chaque bloc : la réussite finale`}>
            <BarChart data={blocs} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={G.grille} />
              <XAxis dataKey="nom" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="reussi" name="Réussi" stackId="d" fill={G.reussi} />
              <Bar dataKey="ajourne" name="Ajourné" stackId="d" fill={G.attente} />
              <Bar dataKey="refuse" name="Refusé ou absent" stackId="d" fill={G.refuse}><LabelList dataKey="final" position="top" formatter={v => `final ${pc(v)}`} style={{ fontSize: 11 }} /></Bar>
            </BarChart>
          </Carte>)}
      </div>

      {!!ues.length && (
        <Carte titre="La réussite unité par unité" sous={`${ues.length} unités délibérées · rangées de la plus difficile à la plus réussie · vert ≥ 70 %, ocre ≥ 50 %, rouge en dessous`} hauteur={hUe}>
          <BarChart data={ues} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={G.grille} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit=" %" />
            <YAxis type="category" dataKey="nom" width={260} tick={{ fontSize: 11 }} tickFormatter={court} />
            <Tooltip formatter={(v, n) => [pc(v), n]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="s1" name="1re session" fill={G.vide || '#CBD5E1'} barSize={8} />
            <Bar dataKey="final" name="Après les deux sessions" barSize={10}>
              {ues.map(u => <Cell key={u.nom} fill={teinte(u.final)} />)}
              <LabelList dataKey="final" position="right" formatter={pc} style={{ fontSize: 11 }} />
            </Bar>
          </BarChart>
        </Carte>)}

      {!!cours.length && (
        <Carte titre="La note moyenne, cours par cours" sous={`${cours.length} cours · un cours n’est pas délibéré : c’est la note qu’il a produite · le trait = le seuil de 10`} hauteur={hCours}>
          <BarChart data={cours.slice(0, 60)} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={G.grille} />
            <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="nom" width={260} tick={{ fontSize: 11 }} tickFormatter={court} />
            <Tooltip formatter={v => [String(v).replace('.', ','), 'Moyenne / 20']} />
            <ReferenceLine x={10} stroke={G.texte} strokeDasharray="4 3" />
            <Bar dataKey="moyenne" name="Moyenne / 20" barSize={10}>
              {cours.slice(0, 60).map(c => <Cell key={c.nom} fill={c.moyenne < 10 ? G.refuse : c.moyenne < 12 ? G.attente : G.reussi} />)}
              <LabelList dataKey="moyenne" position="right" formatter={v => String(v).replace('.', ',')} style={{ fontSize: 11 }} />
            </Bar>
          </BarChart>
        </Carte>)}
    </div>);
}

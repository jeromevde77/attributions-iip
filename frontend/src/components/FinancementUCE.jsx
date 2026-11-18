/* CE QUE LA SECTION ENGAGE, COÛTE ET RAPPORTE (3.5.549, Charles, 18 novembre 2026 : « composer n'est pas un bilan comptable ; montrer
   ce qui est engagé, ce que cela donne en salaire, ce que l'on rapporte » ; resserré en 3.5.552 sur la maquette validée : quatre tuiles,
   huit colonnes regroupées sous « ce qu'elle rapporte » et « ce qu'elle coûte », jamais un montant coupé, la ligne d'ensemble en tête,
   « comparer à » IIP / ASBL pour le ratio étudiants par ETP). Tout se calcule EN UCE, aussi pour 2026-2027 et après.
   Les chiffres sont ceux de la page IIP et HELB (`chiffresIipHelb`, GET /api/pilotage/iip-helb), avec SES filtres (étape 2). */
import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList } from 'recharts';
import { authHeaders } from '../lib/api.js';
import { couleursGraphique } from '../lib/couleurs.js';
import { TuileEtat, Encadre } from './ui.jsx';
import { chiffresIipHelb, muceInfo, reglagesIipHelb } from './IipHelbGestion.jsx';
import { ComparerA, Partie } from './Disques.jsx';
import ChargementLucie from './ChargementLucie.jsx';

const eur = n => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-BE')} €`);
const signe = n => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('fr-BE')} €`);
const n1 = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('fr-BE'));
const court = a => `${String(a).slice(2, 4)}-${String(a).slice(7, 9)}`;

/** Les lignes du calcul en UCE, année par année (3.5.562 : partagées avec la présentation d'une section). */
export function lignesUCE(d, reglages) {
  if (!d) return { lignes: [], PH: null, mes: null };
  const { HY, PH, mes, u95 } = chiffresIipHelb(d, reglages);
  const lignes = HY.map(({ y, h }) => {
    const deb = Number(String(y.annee).slice(0, 4));
    const m1 = muceInfo(deb, PH), m2 = muceInfo(deb + 1, PH);
    const rapporte = h.allocation + h.droits, coute = h.salaires + h.autres + h.fonct;
    return { annee: y.annee, lisses: h.base, financement: h.allocation, muce: m1.valeur * 4 / 12 + m2.valeur * 8 / 12, estimee: m1.estimee || m2.estimee,
      di: h.droits, salH: h.salaires + h.autres, materiel: h.fonct, solde: rapporte - coute, rapporte, coute, parEtp: h.parEtp,
      apport: (mes?.admin === 'oui' ? (y.admin?.part || 0) : 0) + (u95 ? u95(y) : 0), admin: mes?.admin === 'oui' ? (y.admin?.part || 0) : 0, aide: u95 ? u95(y) : 0, salI: y.coutI };
  });
  return { lignes, PH, mes };
}

export default function FinancementUCE({ section, refsEtp = null }) {
  const reglages = useMemo(() => reglagesIipHelb(), []);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ref, setRef] = useState('ASBL');
  useEffect(() => {
    let vivant = true; setD(null); setErreur(null);
    const cout = ['reel', 'titres'].includes(reglages.mesures?.cout) ? 'reel' : 'convention';
    fetch(`/api/pilotage/iip-helb?section=${encodeURIComponent(section)}&cout=${cout}${reglages.mesures?.unite_helb === 'heures' ? '&unite_helb=heures' : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) setD(j); })
      .catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [section, reglages]);
  const { lignes, PH, mes } = useMemo(() => lignesUCE(d, reglages), [d, reglages]);

  if (erreur) return <Encadre etat="corriger" titre={erreur} />;
  if (!d) return <ChargementLucie texte="Lucie calcule le financement en UCE…" />;
  if (!lignes.length) return <Encadre etat="neutre" titre="Aucune année à montrer pour cette section." />;
  const G = couleursGraphique();
  const der = lignes[lignes.length - 1], avant = lignes.length > 1 ? lignes[lignes.length - 2] : null;
  const somme = k => lignes.reduce((t, l) => t + (l[k] || 0), 0);
  const refEtp = refsEtp?.[ref] ?? null;
  const th = 'px-2.5 py-2 text-right whitespace-nowrap font-semibold';
  const td = 'px-2.5 py-2 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="space-y-3">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <TuileEtat taille="grande" etat="reussi" valeur={eur(der.rapporte)} libelle={`rapporte à l’ASBL en ${court(der.annee)}`}
          precision={`financement UCE ${eur(der.financement)} + DI et FI ${eur(der.di)}`}
          aide="Financement = étudiants lissés × MUCE × pondération (décret du 9 septembre 1996, art. 17). DI et FI = droits d’inscription et frais rapportés par l’IIP." />
        <TuileEtat taille="grande" etat="disponible" valeur={eur(der.coute)} libelle="coûte à l’ASBL"
          precision={`salaires HELB ${eur(der.salH)} + matériel ${eur(der.materiel)}`}
          aide="Les salaires des enseignants HELB et le matériel et les investissements. Les salaires IIP sont payés par la Fédération : hors solde." />
        <TuileEtat taille="grande" etat={der.solde >= 0 ? 'reussi' : 'corriger'} valeur={signe(der.solde)} libelle="solde pour l’ASBL"
          precision={avant ? `${court(avant.annee)} : ${signe(avant.solde)}` : null} aide="Ce que la section rapporte − ce qu’elle coûte à l’ASBL." />
        <TuileEtat taille="grande" etat="fort" valeur={eur(der.apport)} libelle="ce que l’IIP apporte en plus"
          precision={`cadre administratif ${eur(der.admin)} + aide à la réussite ${eur(der.aide)}`}
          aide="Ce que l’IIP apporte sans que l’ASBL le paie : la part de la section dans le cadre administratif et dans l’aide à la réussite (UE 95)." />
      </div>

      {/* LE GRAPHIQUE (3.5.554, Charles : « sur la colonne verte, ajouter les UCE lissés ; la colonne rose, je la veux en bleu ») : ce
          qu'elle rapporte = le financement en UCE (étudiants lissés) + DI et FI, le nombre d'étudiants lissés au-dessus ; ce qu'elle coûte,
          en bleu = salaires HELB + matériel. */}
      <Partie titre="Ce qu’elle rapporte et ce qu’elle coûte, en UCE" sous="le graphique et le détail, côte à côte"
        droite={<ComparerA valeur={ref} onChange={setRef} />}>
        <div className="grid grid-cols-1 lg:[grid-template-columns:340px_1fr]">
        <div className="lg:border-r border-slate-100">
        <div className="p-3" style={{ height: 270 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={lignes.map(l => ({ ...l, lib: court(l.annee), lissesTxt: l.lisses ? `${n1(l.lisses)} étud. lissés` : '' }))} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={G.grille || '#E2E8F0'} />
              <XAxis dataKey="lib" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)} k`} />
              <Tooltip formatter={(v, n) => [eur(v), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="financement" name="Financement UCE (étudiants lissés)" stackId="r" fill={G.reussi || '#3E7D5E'} />
              <Bar dataKey="di" name="DI et FI" stackId="r" fill={G.reussi || '#3E7D5E'} fillOpacity={0.5}>
                <LabelList dataKey="lissesTxt" position="top" style={{ fontSize: 11, fill: '#475569' }} />
              </Bar>
              <Bar dataKey="salH" name="Salaires HELB" stackId="c" fill={G.disponible || '#2F6FB0'} />
              <Bar dataKey="materiel" name="Matériel" stackId="c" fill={G.disponible || '#2F6FB0'} fillOpacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        </div>
        <div className="min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full text-second" data-numeros="non">
            <thead>
              <tr className="text-mention uppercase tracking-wide text-slate-500">
                <th /><th />
                <th colSpan={2} className="px-2.5 pt-2 text-center font-semibold" style={{ borderBottom: '2px solid var(--c-reussi)' }}>Ce qu’elle rapporte</th>
                <th colSpan={2} className="px-2.5 pt-2 text-center font-semibold" style={{ borderBottom: '2px solid var(--c-disponible)' }}>Ce qu’elle coûte</th>
                <th /><th />
              </tr>
              <tr className="tab-entete text-mention uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left whitespace-nowrap font-semibold">Année</th>
                <th className={th} title="Étudiants comptés par la HELB (part de la section), en moyenne sur les trois années académiques précédentes">Étud. lissés</th>
                <th className={th}>Financement UCE</th><th className={th}>DI et FI</th>
                <th className={th}>Salaires HELB</th><th className={th}>Matériel</th>
                <th className={th}>Solde ASBL</th><th className={`${th} pr-4`}>Étud. / ETP</th>
              </tr>
            </thead>
            <tbody>
              <tr className="ligne-total font-semibold border-t border-slate-100">
                <td className="px-4 py-2">Ensemble</td><td className={td}>—</td>
                <td className={td}>{eur(somme('financement'))}</td><td className={td}>{eur(somme('di'))}</td>
                <td className={td}>{eur(somme('salH'))}</td><td className={td}>{eur(somme('materiel'))}</td>
                <td className={td} style={{ color: somme('solde') >= 0 ? 'var(--c-reussi)' : 'var(--c-refuse)' }}>{signe(somme('solde'))}</td>
                <td className={`${td} pr-4`}>—</td>
              </tr>
              {lignes.map(l => (
                <tr key={l.annee} className="border-t border-slate-100">
                  <td className="px-4 py-2 whitespace-nowrap">{l.annee}</td>
                  <td className={td}>{l.lisses ? n1(l.lisses) : '—'}</td>
                  <td className={td} title={`${n1(l.lisses)} étudiants lissés × MUCE ${eur(l.muce)}${l.estimee ? ' (estimée par indexation)' : ''} × ${PH.ponderation}`}>
                    <span className={l.financement ? '' : 'text-slate-400'}>{eur(l.financement)}</span>{l.estimee && l.financement ? '*' : ''}</td>
                  <td className={td}>{eur(l.di)}</td>
                  <td className={td}>{eur(l.salH)}</td>
                  <td className={td}>{eur(l.materiel)}</td>
                  <td className={`${td} font-semibold`} style={{ color: l.solde >= 0 ? 'var(--c-reussi)' : 'var(--c-refuse)' }}>{signe(l.solde)}</td>
                  <td className={`${td} pr-4`}>{l.parEtp != null ? Math.round(l.parEtp) : '—'} <span className="text-slate-400">/ {refEtp != null ? Math.round(refEtp) : '—'}</span></td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2.5 m-0 text-mention text-slate-500 leading-relaxed">
          Financement = étudiants lissés × MUCE × {PH.ponderation} (une année académique : 4/12 de la MUCE de l’année où elle commence, 8/12 de la suivante).
          Solde = financement + DI et FI − salaires HELB − matériel. Salaires IIP (Fédération) hors solde : {eur(der.salI)} en {court(der.annee)}.
          « / {refEtp != null ? Math.round(refEtp) : '—'} » = étudiants par ETP de {ref === 'ASBL' ? 'l’ASBL' : 'l’IIP'}. * MUCE estimée par indexation.
          Filtres de l’étape 2 appliqués ({mes?.cout === 'reel' ? 'coûts réels' : 'convention'}{mes?.coord === 'oui' ? ', avec coordinations' : ', sans coordinations'}).
        </p>
        </div>
        </div>
      </Partie>
    </div>);
}

/* CE QUE LA SECTION ENGAGE, COÛTE ET RAPPORTE (3.5.549, Charles, 18 novembre 2026 : « composer ne sert pas à montrer des colonnes de
   bilans ; sa fonction est de montrer ce qui est engagé comme ETP, ce que cela donne en salaire, ce que l'on rapporte — visuel,
   précis, pas un bilan comptable ; garde le bilan pour les finances » ; colonnes : année, étudiants réels, étudiants lissés, MUCE,
   pondération, financement, salaires HELB, salaires IIP pour information, matériel et investissements, DI et FI rapportés par l'IIP,
   solde pour l'ASBL). Tout se calcule EN UCE, aussi pour 2026-2027 et après : les comptes ne servent pas ici.
   Les chiffres sont ceux de la page IIP et HELB (`chiffresIipHelb`, GET /api/pilotage/iip-helb) — un calcul, plusieurs lecteurs. */
import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { authHeaders } from '../lib/api.js';
import { couleursGraphique } from '../lib/couleurs.js';
import { EnteteCarte, TuileEtat, Tableau, Th, Td, Encadre } from './ui.jsx';
import { chiffresIipHelb, muceInfo } from './IipHelbGestion.jsx';
import ChargementLucie from './ChargementLucie.jsx';

const eur = n => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-BE')} €`);
const n1 = n => (n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('fr-BE'));
const n2 = n => (n == null ? '—' : (Math.round(n * 100) / 100).toLocaleString('fr-BE'));

export default function FinancementUCE({ section }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let vivant = true; setD(null); setErreur(null);
    fetch(`/api/pilotage/iip-helb?section=${encodeURIComponent(section)}&cout=convention`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) setD(j); })
      .catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [section]);
  const { HY, PH } = useMemo(() => (d ? chiffresIipHelb(d, {}) : { HY: [], PH: null }), [d]);
  const lignes = useMemo(() => HY.map(({ y, h }) => {
    const deb = Number(String(y.annee).slice(0, 4));
    const m1 = muceInfo(deb, PH), m2 = muceInfo(deb + 1, PH);
    const muce = m1.valeur * 4 / 12 + m2.valeur * 8 / 12;
    const rapporte = h.allocation + h.droits, coute = h.salaires + h.autres + h.fonct;
    return { annee: y.annee, lib: y.lib || y.annee, reels: y.inscrits, lisses: h.base, muce, muce_estimee: m1.estimee || m2.estimee, m1, m2,
      ponderation: PH.ponderation, financement: h.allocation, etpH: y.etpH, etpI: y.etpI, salH: h.salaires + h.autres, salI: y.coutI,
      materiel: h.fonct, di: h.droits, solde: rapporte - coute, rapporte, coute };
  }), [HY, PH]);

  if (erreur) return <Encadre etat="corriger" titre={erreur} />;
  if (!d) return <ChargementLucie texte="Lucie calcule le financement en UCE…" />;
  if (!lignes.length) return <Encadre etat="neutre" titre="Aucune année à montrer pour cette section." />;
  const G = couleursGraphique();
  const der = lignes[lignes.length - 1];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <TuileEtat taille="grande" etat="neutre" valeur={n2(der.etpH + der.etpI)} libelle={`ETP engagés en ${der.lib}`}
          precision={`HELB ${n2(der.etpH)} · IIP ${n2(der.etpI)}`} aide="Les enseignants attribués (cours et coordinations), en équivalents temps plein, HELB et IIP." />
        <TuileEtat taille="grande" etat="disponible" valeur={eur(der.rapporte)} libelle="Ce que la section rapporte à l’ASBL"
          precision={`financement ${eur(der.financement)} + DI et FI ${eur(der.di)}`}
          aide="Financement = étudiants lissés × MUCE × pondération (décret du 9 septembre 1996, art. 17) ; DI et FI = droits d’inscription et frais rapportés par l’IIP." />
        <TuileEtat taille="grande" etat="surveiller" valeur={eur(der.coute)} libelle="Ce qu’elle coûte à l’ASBL"
          precision={`salaires HELB ${eur(der.salH)} + matériel ${eur(der.materiel)}`}
          aide="Les salaires des enseignants HELB et le matériel et les investissements. Les salaires IIP sont payés par la Fédération : hors solde." />
        <TuileEtat taille="grande" etat={der.solde >= 0 ? 'reussi' : 'corriger'} valeur={eur(der.solde)} libelle="Solde pour l’ASBL"
          precision={`salaires IIP (Fédération) : ${eur(der.salI)}, pour information`} aide="Ce que la section rapporte − ce qu’elle coûte à l’ASBL." />
      </div>

      <div className="carte overflow-hidden">
        <EnteteCarte titre="Ce qu’elle rapporte et ce qu’elle coûte, année par année" />
        <div className="p-3" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={lignes} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="lib" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)} k`} />
              <Tooltip formatter={v => eur(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="rapporte" name="Rapporte (financement + DI et FI)" fill={G.reussi || 'var(--c-reussi)'} />
              <Bar dataKey="coute" name="Coûte à l’ASBL (salaires HELB + matériel)" fill={G.helb || 'var(--c-attente)'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="carte overflow-x-auto">
        <EnteteCarte titre="Le détail, en UCE" />
        <Tableau className="!border-0 !rounded-none" dense>
          <thead><tr>
            <Th>Année</Th><Th align="droite">Étudiants réels</Th><Th align="droite">Étudiants lissés</Th><Th align="droite">MUCE</Th>
            <Th align="droite">Pond.</Th><Th align="droite">Financement</Th><Th align="droite">ETP HELB · IIP</Th>
            <Th align="droite">Salaires HELB</Th><Th align="droite">Salaires IIP (info)</Th><Th align="droite">Matériel et invest.</Th>
            <Th align="droite">DI et FI (IIP)</Th><Th align="droite">Solde ASBL</Th>
          </tr></thead>
          <tbody>{lignes.map(l => (
            <tr key={l.annee}>
              <Td>{l.lib}</Td>
              <Td align="droite">{l.reels ?? '—'}</Td>
              <Td align="droite" title="Étudiants comptés par la HELB (part de la section), en moyenne sur les trois années académiques précédentes (décret, art. 17)">{n1(l.lisses)}</Td>
              <Td align="droite" title={`4/12 × MUCE ${l.m1 && Number(String(l.annee).slice(0, 4))} (${eur(l.m1.valeur)}${l.m1.estimee ? '*' : ''}) + 8/12 × MUCE ${Number(String(l.annee).slice(0, 4)) + 1} (${eur(l.m2.valeur)}${l.m2.estimee ? '*' : ''})`}>
                {eur(l.muce)}{l.muce_estimee ? '*' : ''}</Td>
              <Td align="droite">× {l.ponderation}</Td>
              <Td align="droite" className="font-semibold">{eur(l.financement)}</Td>
              <Td align="droite">{n2(l.etpH)} · {n2(l.etpI)}</Td>
              <Td align="droite">{eur(l.salH)}</Td>
              <Td align="droite" className="!text-slate-400">{eur(l.salI)}</Td>
              <Td align="droite">{eur(l.materiel)}</Td>
              <Td align="droite">{eur(l.di)}</Td>
              <Td align="droite" className={`font-semibold ${l.solde < 0 ? '!text-[var(--c-refuse)]' : '!text-[var(--c-reussi)]'}`}>{eur(l.solde)}</Td>
            </tr>))}
          </tbody>
        </Tableau>
        <p className="text-mention text-slate-500 px-3 py-2 m-0">
          Financement = étudiants lissés × MUCE × pondération (une année académique : 4/12 de la MUCE de l’année où elle commence, 8/12 de la
          suivante). Solde pour l’ASBL = financement + DI et FI − salaires HELB − matériel et investissements ; les salaires IIP, payés par la
          Fédération, sont montrés pour information. * MUCE estimée par indexation (valeur réelle inconnue). Calcul en convention ; le bilan
          comptable reste dans Gestion → finances.
        </p>
      </div>
    </div>);
}

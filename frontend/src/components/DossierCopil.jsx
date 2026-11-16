/**
 * LE DOSSIER DU COMITÉ DE PILOTAGE (3.5.485, Charles, 16 novembre 2026 : « un document à imprimer qui comprend ce dont j'ai besoin pour
 * le COPIL ; je pourrais décocher des choses » ; tranché : composé des écrans, les deux dernières parties en texte libre gardé pour la
 * section). Le plan est celui de Charles :
 *   1. Statistiques annuelles de population — 1.1 Inscriptions · 1.2 Provenance
 *   2. Évolution des attributions depuis l'ouverture — 2.1 Attributions · 2.2 Positionnement de la section
 *   3. Statistiques de réussite
 *   4. Évolution du dossier pédagogique (à venir)
 *   5. Divers
 * Rien n'est recalculé ici : chaque partie est l'écran de Gestion qui la porte (Qui sont nos étudiants, IIP et HELB, Une section,
 * Décisions et taux de réussite), bornée à la section. L'aperçu d'impression de la Gestion le met en pages ; « Choisir les blocs » y
 * retire le détail. Les textes 4 et 5 vivent avec les textes de la présentation de la section (`copil.dp`, `copil.divers`).
 */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import PopulationEcole from './PopulationEcole.jsx';
import IipHelbGestion from './IipHelbGestion.jsx';
import GestionLecture from './GestionLecture.jsx';
import StatsDeliberation from './StatsDeliberation.jsx';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';

export const PARTIES_COPIL = [
  ['inscriptions', '1.1', 'Inscriptions'],
  ['provenance', '1.2', 'Provenance'],
  ['attributions', '2.1', 'Attributions'],
  ['positionnement', '2.2', 'Positionnement de la section — face à l’IIP et à l’ASBL'],
  ['reussite', '3', 'Statistiques de réussite'],
  ['dp', '4', 'Évolution du dossier pédagogique'],
  ['divers', '5', 'Divers'],
];
const CHAPITRES = { 1: 'Statistiques annuelles de population', 2: 'Évolution des attributions depuis l’ouverture' };

const n0 = v => Math.round(v || 0).toLocaleString('fr-BE');
const n2 = v => (v || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const court = a => `${String(a).slice(0, 4)}-${String(a).slice(7, 9)}`;

/* Les enseignants depuis l'ouverture : les chiffres de GET /api/pilotage/evolution-attributions (ceux de la pièce IIP et HELB et de la
   présentation). */
function EnseignantsDepuis({ section }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch(`/api/pilotage/evolution-attributions?section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  }, [section]);
  if (!d?.annees?.length) return null;
  const Y = d.annees, st = (y, k, c) => y.statuts?.[k]?.[c] || 0;
  const lignes = [
    ['Enseignants (personnes)', y => n0(y.personnes), true],
    ['— à l’IIP', y => n0(y.personnes_iip)], ['— à la HELB', y => n0(y.personnes_helb)],
    ['Arrivées dans la section', (y, i) => (i ? n0(y.arrivees) : '—')], ['Départs de la section', (y, i) => (i ? n0(y.departs) : '—')],
    ['Chargés de cours (IIP · HELB)', y => `${n0(st(y, 'CC', 'iip'))} · ${n0(st(y, 'CC', 'helb'))}`, true],
    ['Experts et invités (IIP · HELB)', y => `${n0(st(y, 'EXP', 'iip'))} · ${n0(st(y, 'EXP', 'helb'))}`, true],
    ['Part des experts dans la charge', y => pc(st(y, 'EXP', 'etp_iip') + st(y, 'EXP', 'etp_helb'), y.etp_iip + y.etp_helb)],
    ['Charge (périodes)', y => n0(y.per_iip + y.per_helb), true],
    ['— ETP IIP · HELB', y => `${n2(y.etp_iip)} · ${n2(y.etp_helb)}`],
    ['— part de la HELB', y => pc(y.etp_helb, y.etp_iip + y.etp_helb)],
  ];
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre={`Les enseignants depuis l’ouverture (${d.premiere})`}
        sous="Attributions de la section, hors congés, coordinations non comprises. Statut de chargé de cours ou d’expert : celui de la fiche." />
      <Tableau dense className="!border-0 !rounded-none">
        <TableauEntete><Th>Indicateur</Th>{Y.map(y => <Th key={y.annee} align="droite">{court(y.annee)}</Th>)}</TableauEntete>
        <tbody>{lignes.map(([l, f, fort]) => (
          <Tr key={l}><Td className={fort ? 'font-semibold' : ''}>{l}</Td>{Y.map((y, i) => <Td key={y.annee} align="droite" ton={fort ? 'fort' : 'normal'}>{f(y, i)}</Td>)}</Tr>))}</tbody>
      </Tableau>
      {d.nomination && <p className="text-mention text-slate-500 px-3 py-2 m-0">Statut de nomination des enseignants IIP de {d.nomination.annee} (la fiche, au présent) :
        {' '}{n0(d.nomination.definitif)} définitif(s), {n0(d.nomination.temporaire_prioritaire)} temporaire(s) prioritaire(s), {n0(d.nomination.temporaire)} temporaire(s).</p>}
    </section>);
}

function Texte({ texte }) {
  return texte?.trim()
    ? <div className="carte p-4 text-sm leading-relaxed" style={{ whiteSpace: 'pre-line' }}>{texte}</div>
    : <p className="text-second text-slate-400 m-0">(rien d’écrit)</p>;
}

export default function DossierCopil({ annee, section, parties, textes = {} }) {
  const voir = new Set(parties?.length ? parties : PARTIES_COPIL.map(p => p[0]));
  const visibles = PARTIES_COPIL.filter(([k]) => voir.has(k));
  let chapitre = null;
  return (
    <div className="space-y-4">
      {visibles.map(([k, num, titre], i) => {
        const ch = num.split('.')[0];
        const nouveauChapitre = ch !== chapitre;
        chapitre = ch;
        return (
          <div key={k} className="space-y-3" style={{ breakBefore: i && nouveauChapitre ? 'page' : 'auto' }}>
            {nouveauChapitre && CHAPITRES[ch] && <h2 className="titre-ecran m-0">{ch}. {CHAPITRES[ch]}</h2>}
            <h3 className={CHAPITRES[ch] ? 'titre-carte m-0' : 'titre-ecran m-0'}>{num}{CHAPITRES[ch] ? '' : '.'} {titre}</h3>
            {k === 'inscriptions' && <PopulationEcole annee={annee} initial={{ section }} partie="inscriptions" />}
            {k === 'provenance' && <PopulationEcole annee={annee} initial={{ section }} partie="provenance" />}
            {k === 'attributions' && <><EnseignantsDepuis section={section} /><IipHelbGestion sectionFixe={section} /></>}
            {k === 'positionnement' && <GestionLecture annee={annee} perimFixe="section" sectionFixe={section} sansIipHelb />}
            {k === 'reussite' && <StatsDeliberation annee={annee} initial={{ section }} />}
            {k === 'dp' && <Texte texte={textes['copil.dp']} />}
            {k === 'divers' && <Texte texte={textes['copil.divers']} />}
          </div>);
      })}
    </div>);
}

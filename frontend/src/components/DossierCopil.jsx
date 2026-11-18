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
import BudgetSection from './BudgetSection.jsx';
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import PopulationEcole from './PopulationEcole.jsx';
import IipHelbGestion from './IipHelbGestion.jsx';
import GestionLecture from './GestionLecture.jsx';
import StatsDeliberation from './StatsDeliberation.jsx';
import EtudiantsSection from './EtudiantsSection.jsx';
import ReussiteSection from './ReussiteSection.jsx';
import FinancementUCE from './FinancementUCE.jsx';
import PersonnelEcole from './PersonnelEcole.jsx';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';
import { useIdentite } from '../lib/identite.js';

export const PARTIES_COPIL = [
  ['inscriptions', '1.1', 'Inscriptions'],
  ['provenance', '1.2', 'Provenance'],
  ['attributions', '2.1', 'Attributions'],
  ['positionnement', '2.2', 'Positionnement de la section — face à l’IIP et à l’ASBL'],
  ['reussite', '3', 'Statistiques de réussite'],
  ['dp', '4', 'Évolution du dossier pédagogique'],
  ['budget', '5', 'Budget prévu'],   // 3.5.500 : le module Budget des sections
  ['divers', '6', 'Divers'],
];
/* LE TEXTE QUI ACCOMPAGNE CHAQUE PARTIE (3.5.487, Charles : « des propositions de textes, simples, directes, qui mettent la force de la
   structure en avant » puis « intègre tout cela »). Un texte par partie, plus l'ouverture et la conclusion, gardés pour la section
   (`copil.<partie>`). Les PROPOSITIONS ne valent que pour la section dont elles citent les chiffres (relevés le 16 novembre 2026) :
   elles remplissent les cases vides, se corrigent, et ce qui est enregistré l'emporte. */
export const TEXTES_COPIL = [['intro', 'Ouverture'], ...PARTIES_COPIL.map(([k, num, titre]) => [k, `${num} ${titre}`]), ['conclusion', 'Conclusion']];
export const PROPOSITIONS_COPIL = {
  TIM: {
    intro: 'En trois ans, le TIM est passé d’une ouverture à une section installée. 353 étudiants, deux écoles qui enseignent ensemble, un diplôme de haute école accessible aux adultes. La structure tient : les chiffres qui suivent le montrent.',
    inscriptions: '353 étudiants, +33 % en un an. Un public d’adultes : 27 ans en moyenne, 62 % de femmes. La section attire, et elle retient : un tiers seulement sont des primo-inscrits, les autres poursuivent leur parcours.',
    provenance: '57 % des étudiants habitent Bruxelles. 64 % ont une nationalité hors Union européenne. Le TIM ouvre une filière de santé à un public que les voies classiques n’atteignent pas.',
    attributions: 'De 11 enseignants en 2023-2024 à 32 aujourd’hui ; de 932 à 3 547 périodes. La croissance s’est faite à deux : la HELB porte désormais une part comparable à celle de l’IIP. Chaque école apporte ce qu’elle fait le mieux : la HELB son statut de haute école et ses enseignants, l’IIP son organisation pour adultes et ses praticiens.',
    positionnement: 'La section est efficiente : un crédit coûte 31 €, contre 118 € pour l’ensemble de l’ASBL. On compte 70 étudiants à temps plein par ETP, contre 21. Un étudiant rapporte 586 € de droits et frais, contre 398. Cette efficience a son revers : 47 étudiants par groupe en moyenne. C’est la limite à surveiller.',
    reussite: 'La seconde session joue pleinement son rôle : en BA1, la réussite passe de 36 % à 66 % au final ; en BA3, de 53 % à 76 %. Le premier bloc reste le moment fragile ; c’est là que l’encadrement doit porter.',
    dp: 'Le dossier pédagogique évolue [dans tel sens : nouvelles UE, révision des acquis, stages…]. Objectif : [aligner la formation sur le métier / sur le référentiel de la HELB]. Échéance : [année].',
    divers: 'Ce que nous proposons au comité : [1. …] [2. …]. Ce qui doit être tranché ensemble : [la capacité d’accueil, le matériel, la répartition des stages…].',
    conclusion: 'Deux écoles, un diplôme, une section qui grandit sans perdre en efficience. La structure IIP–HELB fonctionne ; la question n’est plus de savoir si elle tient, mais comment l’accompagner dans sa croissance.',
  },
};
/** Le texte d'une partie : l'enregistré (même vide : on l'a vidé exprès), sinon la proposition de la section. Le dossier pédagogique
    et le divers n'ont qu'un modèle à crochets : il ne s'imprime pas tant qu'on ne l'a pas repris. */
export const A_COMPLETER = ['dp', 'divers'];
export const texteCopil = (textes, section, k) => {
  const v = textes?.[`copil.${k}`];
  if (v !== undefined && v !== null) return v;
  return A_COMPLETER.includes(k) ? '' : (PROPOSITIONS_COPIL[section]?.[k] || '');
};
const ANNEE_DE = { inscriptions: 'population', provenance: 'population', positionnement: 'positionnement', reussite: 'reussite' };
const CHAPITRES = { 1: 'Statistiques annuelles de population', 2: 'Évolution des attributions depuis l’ouverture' };

const n0 = v => Math.round(v || 0).toLocaleString('fr-BE');
const n2 = v => (v || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const court = a => `${String(a).slice(0, 4)}-${String(a).slice(7, 9)}`;

/* Les enseignants depuis l'ouverture : les chiffres de GET /api/pilotage/evolution-attributions (ceux de la pièce IIP et HELB et de la
   présentation). */
export function EnseignantsDepuis({ section }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch(`/api/pilotage/evolution-attributions?section=${encodeURIComponent(section)}&cout=${(() => { try { const c = JSON.parse(localStorage.getItem('lucie.iipHelb') || '{}').reglages?.mesures?.cout; return c === 'reel' || c === 'titres' ? 'reel' : 'convention'; } catch { return 'convention'; } })()}`, { headers: authHeaders() })
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

// Le texte d'une partie : une bande pâle, au dessin du kit ; rien quand il n'y a rien.
function Texte({ texte, fort = false }) {
  if (!texte?.trim()) return null;
  return <div className={`kit-texte ${fort ? 'kit-texte-fort' : ''}`} style={{ whiteSpace: 'pre-line' }}>{texte}</div>;
}

/* LA COUVERTURE AU MODÈLE DU KIT (3.5.488, Charles : « modèle sur base de Micro certif ; format portrait ») : bleu nuit, logo blanc,
   le nom de la section en grand, le trait, l'ouverture, les parties au pied. Une page à elle. */
export function CouvertureCopil({ section, annee, parties, textes }) {
  const id = useIdentite();
  const visibles = PARTIES_COPIL.filter(([k]) => !parties?.length || parties.includes(k));
  const chapitres = [...new Set(visibles.map(([, n]) => n.split('.')[0]))];
  const nomCh = c => CHAPITRES[c] || PARTIES_COPIL.find(([, n]) => n === c)?.[2] || '';
  return (
    <div className="kit-couverture">
      <div className="flex items-start justify-between gap-6">
        {id.logo_blanc ? <img src={id.logo_blanc} alt="" style={{ height: 54 }} /> : <span className="font-bold text-lg">Institut Ilya Prigogine</span>}
        <div className="kit-kicker text-right">Institut Ilya Prigogine · HELB<br />Comité de pilotage</div>
      </div>
      <div className="mt-auto">
        <div className="kit-kicker">Dossier de la section · {annee}</div>
        <div className="kit-couv-titre">{String(section).replace(/_/g, ' ')}</div>
        <div className="kit-couv-trait" />
        <div className="kit-couv-sous">Bilan de la section pour le comité de pilotage : population, attributions, positionnement et réussite.</div>
        {texteCopil(textes, section, 'intro') && <p className="kit-couv-intro">{texteCopil(textes, section, 'intro')}</p>}
      </div>
      <div className="mt-auto pt-6">
        <div className="kit-couv-parties">{chapitres.map(c => `${c}. ${nomCh(c)}`).join(' · ')}</div>
        <div className="kit-couv-pied">
          <span>Institut Ilya Prigogine · Campus Erasme</span>
          <span>{new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </div>);
}

/* L'ANNÉE DE CHAQUE PARTIE (3.5.486, Charles : « pour les résultats, je dois pouvoir choisir quelle année ») : `annees.population`,
   `annees.positionnement`, `annees.reussite` ; à défaut, l'année de la Gestion. */
export default function DossierCopil({ annee, section, parties, textes = {}, annees = {} }) {
  const an = k => annees[k] || annee;
  const voir = new Set(parties?.length ? parties : PARTIES_COPIL.map(p => p[0]));
  const visibles = PARTIES_COPIL.filter(([k]) => voir.has(k));
  let chapitre = null;
  /* PAS DE SAUT DE PAGE FORCÉ (3.5.488, Charles : « pas de pages blanches ou peu remplies ») : un chapitre ouvre par son bandeau, là
     où la page en est ; seule la couverture a sa page. */
  return (
    <div className="kit-copil space-y-4">
      {visibles.map(([k, num, titre]) => {
        // UNE PARTIE VIDE NE S'IMPRIME PAS (3.5.564) : le dossier pédagogique et le divers n'ont que leur texte.
        if (A_COMPLETER.includes(k) && !texteCopil(textes, section, k)?.trim()) return null;
        const ch = num.split('.')[0];
        const nouveauChapitre = ch !== chapitre;
        chapitre = ch;
        const titreCh = CHAPITRES[ch] || titre;
        return (
          <div key={k} data-copil-partie={`${num} ${titre}`} className="space-y-3">
            {nouveauChapitre && (
              <div className="kit-bandeau">
                <div className="kit-bandeau-num" aria-hidden="true">{ch}</div>
                <div className="kit-kicker">Partie {ch}</div>
                <div className="kit-bandeau-titre">{titreCh}</div>
                {!CHAPITRES[ch] && ANNEE_DE[k] && <div className="kit-bandeau-sous">{an(ANNEE_DE[k])}</div>}
              </div>)}
            {CHAPITRES[ch] && <h3 className="kit-titre-partie">{num} {titre}
              {ANNEE_DE[k] && <span className="kit-annee"> · {an(ANNEE_DE[k])}</span>}</h3>}
            <Texte texte={texteCopil(textes, section, k)} />
            {/* LES NOUVEAUX GRAPHIQUES ET TABLEAUX (3.5.562, Charles : « revois le dossier COPIL avec les nouveaux graphiques et tableaux,
                tout en gardant la structure et mes notes ») : les parties, leur ordre et leurs textes ne changent pas ; leurs dessins sont ceux
                de la fiche d'une section (Gestion → Une section). */}
            {k === 'inscriptions' && <><EtudiantsSection annee={an('population')} section={section} /><PopulationEcole annee={an('population')} initial={{ section }} partie="inscriptions" compact /></>}
            {k === 'provenance' && <PopulationEcole annee={an('population')} initial={{ section }} partie="provenance" compact />}
            {k === 'attributions' && <><EnseignantsDepuis section={section} /><IipHelbGestion sectionFixe={section} dernieres={3} focus /><PersonnelEcole annee={an('population')} initial={{ section }} seulCompare /></>}
            {k === 'positionnement' && <><GestionLecture annee={an('positionnement')} perimFixe="section" sectionFixe={section} sansIipHelb /><FinancementUCE section={section} /></>}
            {k === 'reussite' && <ReussiteSection section={section} annee={an('reussite')} />}
            {k === 'budget' && <BudgetSection section={section} focus />}
          </div>);
      })}
      {texteCopil(textes, section, 'conclusion') && (
        <div data-copil-partie="Conclusion" className="space-y-3" style={{ breakInside: 'avoid' }}>
          <div className="kit-bandeau kit-bandeau-court"><div className="kit-bandeau-titre">En conclusion</div></div>
          <Texte texte={texteCopil(textes, section, 'conclusion')} fort />
        </div>)}
    </div>);
}

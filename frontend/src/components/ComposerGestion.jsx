/**
 * COMPOSER : GESTION PART DE CE QUE L'ON VEUT FAIRE (3.5.502, Charles, 16 novembre 2026 : « trop d'endroits avec trop de données ; il
 * faut penser à ce que l'on veut faire : des statistiques pour l'école ou une section ; visant les étudiants, les profs ou les finances ;
 * pour qui : CA, profs, CE/CPPT, COPIL… il faut vraiment pouvoir paramétrer ; c'est une fois que l'on sait ce que l'on fait que l'on
 * sait ce que l'on sort » ; maquette validée). Étape 1 : trois questions — sur quoi, quel thème, pour qui —, Lucie propose les blocs,
 * on décoche ce qui ne sert pas, la composition se lit à l'écran. Étape 2 (à venir) : l'enregistrer en dossier, la sortir en dossier
 * imprimé ou en présentation.
 *
 * Chaque bloc est un écran de Gestion qui existe déjà : rien n'est recalculé ici. Un public pose sa règle (`PUBLICS`) : ce qu'il reçoit
 * d'office, et ce qu'il ne reçoit jamais (le CE / CPPT ne reçoit rien de nominatif).
 */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { EnteteCarte } from './ui.jsx';
import PopulationEcole from './PopulationEcole.jsx';
import PersonnelEcole from './PersonnelEcole.jsx';
import StatsDeliberation from './StatsDeliberation.jsx';
import PilotagePresences from './PilotagePresences.jsx';
import GestionLecture from './GestionLecture.jsx';
import IipHelbGestion from './IipHelbGestion.jsx';
import ChargeParBloc from './ChargeParBloc.jsx';
import BudgetSection, { BudgetEcole } from './BudgetSection.jsx';
import { EnseignantsDepuis } from './DossierCopil.jsx';

const MEMO = 'lucie.composerGestion';
const lire = () => { try { return JSON.parse(localStorage.getItem(MEMO) || '{}'); } catch { return {}; } };

export const THEMES = [['etu', 'Les étudiants'], ['ens', 'Les enseignants et le personnel'], ['fin', 'Les finances'], ['tout', 'Tout']];
/* LES BLOCS : [clé, thème, libellé, portée ('les deux' | 'section' | 'ecole'), nominatif, direction seule]. */
export const BLOCS = [
  ['inscriptions', 'etu', 'Inscrits, évolution et profil', 'les deux', false, false],
  ['provenance', 'etu', 'Provenance : communes et pays', 'les deux', false, false],
  ['reussite', 'etu', 'Réussite par session, bloc et unité', 'les deux', false, false],
  ['presences', 'etu', 'Présences par unité', 'ecole', false, false],
  ['lecture-etu', 'etu', 'Où se situe la section : étudiants et réussite', 'les deux', false, false],
  ['personnel', 'ens', 'Le personnel : profils, statuts, ETP', 'les deux', false, false],
  ['enseignants', 'ens', 'Les enseignants depuis l’ouverture', 'section', true, false],
  ['iiphelb', 'ens', 'Charge, coûts et financement, année par année (IIP et HELB)', 'section', true, true],
  ['blocs', 'ens', 'La charge bloc par bloc et les coordinations', 'section', true, false],
  ['budget', 'fin', 'Le budget, comparé aux autres sections et à l’ASBL', 'les deux', false, false],
  ['lecture-fin', 'fin', 'Où se situe la section : coûts, comptes, efficience', 'les deux', false, true],
];
/* LES PUBLICS : ce qu'ils reçoivent d'office. `sans` retire un bloc, `nominatif: false` écarte tout bloc qui nomme des personnes. */
export const PUBLICS = [
  ['ca', 'Conseil d’administration', { sans: ['presences', 'blocs', 'enseignants'], regle: 'Des chiffres consolidés, les finances complètes ; aucun détail par personne.' }],
  ['equipe', 'Équipe pédagogique', { themes: ['etu', 'ens'], sans: ['iiphelb'], regle: 'Les étudiants, la réussite, la charge — pas de finances détaillées.' }],
  ['cppt', 'CE / CPPT', { themes: ['ens'], nominatif: false, regle: 'Le personnel et la charge — rien de nominatif.' }],
  ['copil', 'COPIL', { sans: ['presences', 'lecture-etu', 'personnel'], regle: 'Le plan du dossier COPIL : population, attributions, positionnement, réussite, budget.' }],
  ['moi', 'Pour moi', { regle: 'Tout ce qui existe, à l’écran.' }],
];

/** Les blocs que Lucie propose pour une composition, dans l'ordre du catalogue. */
export function blocsProposes({ sur, theme, pub, direction }) {
  const P = PUBLICS.find(p => p[0] === pub)?.[2] || {};
  const themes = theme === 'tout' ? (P.themes || ['etu', 'ens', 'fin']) : [theme];
  return BLOCS.filter(([k, t, , portee, nominatif, dir]) => themes.includes(t)
    && (portee === 'les deux' || portee === sur) && !(dir && !direction) && !(nominatif && P.nominatif === false)
    && !(P.sans || []).includes(k)).map(b => b[0]);
}

function Choix({ valeurs, valeur, onChoisir }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {valeurs.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={valeur === v} onClick={() => onChoisir(v)}
          className={`controle !h-auto py-1.5 ${valeur === v ? 'controle-fort' : ''}`}>{l}</button>))}
    </div>);
}

export default function ComposerGestion({ annee, direction = false }) {
  const m = useMemo(lire, []);
  const [sur, setSur] = useState(m.sur || 'section');
  const [section, setSection] = useState(m.section || 'TIM');
  const [theme, setTheme] = useState(m.theme || 'tout');
  const [pub, setPub] = useState(m.pub || 'moi');
  const [retires, setRetires] = useState(m.retires || []);
  const [sections, setSections] = useState([]);
  const [lu, setLu] = useState(false);
  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l =>
      setSections((Array.isArray(l) ? l : []).map(s => s.code || s).filter(Boolean))).catch(() => {});
  }, []);
  // Changer une réponse recompose : on repart de ce que Lucie propose.
  const changer = f => v => { f(v); setRetires([]); setLu(false); };
  useEffect(() => { try { localStorage.setItem(MEMO, JSON.stringify({ sur, section, theme, pub, retires })); } catch { /* sans mémoire */ } }, [sur, section, theme, pub, retires]);

  const proposes = blocsProposes({ sur, theme, pub, direction });
  const gardes = proposes.filter(k => !retires.includes(k));
  const P = PUBLICS.find(p => p[0] === pub);
  const sec = sur === 'section' ? section : '';
  const nom = sur === 'section' ? String(section).replace(/_/g, ' ') : 'L’école';

  const rendu = k => (
    k === 'inscriptions' ? <PopulationEcole annee={annee} initial={{ section: sec }} partie="inscriptions" />
    : k === 'provenance' ? <PopulationEcole annee={annee} initial={{ section: sec }} partie="provenance" />
    : k === 'reussite' ? <StatsDeliberation annee={annee} initial={{ section: sec }} />
    : k === 'presences' ? <PilotagePresences annee={annee} />
    : k === 'lecture-etu' ? <GestionLecture annee={annee} perimFixe={sur === 'section' ? 'section' : 'etab'} sectionFixe={sec || null} sansIipHelb lentilleFixe="etu" />
    : k === 'lecture-fin' ? <GestionLecture annee={annee} perimFixe={sur === 'section' ? 'section' : 'etab'} sectionFixe={sec || null} sansIipHelb lentilleFixe="fin" />
    : k === 'personnel' ? <PersonnelEcole annee={annee} initial={{ section: sec }} />
    : k === 'enseignants' ? <EnseignantsDepuis section={section} />
    : k === 'iiphelb' ? <IipHelbGestion sectionFixe={section} />
    : k === 'blocs' ? <div className="grid gap-3 lg:grid-cols-2"><ChargeParBloc annee={annee} section={section} /></div>
    : k === 'budget' ? (sur === 'section' ? <BudgetSection section={section} /> : <BudgetEcole />)
    : null);

  return (
    <div className="space-y-4">
      <section className="carte overflow-hidden">
        <EnteteCarte titre="Composer" sous="Dites ce que vous voulez faire : Lucie propose ce qu’il faut sortir." />
        <div className="p-4 grid gap-4 lg:grid-cols-3">
          <div>
            <div className="intertitre">1. Sur quoi ?</div>
            <Choix valeurs={[['ecole', 'L’école'], ['section', 'Une section']]} valeur={sur} onChoisir={changer(setSur)} />
            {sur === 'section' && (
              <select className="controle mt-2" value={section} onChange={e => changer(setSection)(e.target.value)} aria-label="Section">
                {(sections.length ? sections : [section]).map(s => <option key={s} value={s}>{String(s).replace(/_/g, ' ')}</option>)}
              </select>)}
          </div>
          <div>
            <div className="intertitre">2. Quel thème ?</div>
            <Choix valeurs={THEMES} valeur={theme} onChoisir={changer(setTheme)} />
          </div>
          <div>
            <div className="intertitre">3. Pour qui ?</div>
            <Choix valeurs={PUBLICS.map(([k, l]) => [k, l])} valeur={pub} onChoisir={changer(setPub)} />
            <p className="text-mention text-slate-500 mt-1.5 mb-0">{P?.[2]?.regle}</p>
          </div>
        </div>
        <div className="px-4 pb-4">
          <div className="intertitre">4. Ce que Lucie propose — décochez ce qui ne sert pas</div>
          {!proposes.length ? <p className="text-second text-slate-500 m-0 mt-1">Rien à proposer pour ce choix{sur === 'ecole' ? ' : ces blocs se lisent pour une section' : ''}.</p> : (
            <div className="grid gap-1.5 mt-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {proposes.map(k => { const b = BLOCS.find(x => x[0] === k); const pris = !retires.includes(k); return (
                <label key={k} className={`flex items-start gap-2 text-sm cursor-pointer ${pris ? '' : 'opacity-50'}`}>
                  <input type="checkbox" className="mt-1" checked={pris} onChange={() => setRetires(r => (pris ? [...r, k] : r.filter(x => x !== k)))} />
                  <span>{b[2]}<span className="text-mention text-slate-500"> · {THEMES.find(t => t[0] === b[1])?.[1].replace(/^Les /, '')}</span></span>
                </label>); })}
            </div>)}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button type="button" className="bouton-fort" disabled={!gardes.length} onClick={() => setLu(true)}>Composer ({gardes.length} bloc{gardes.length > 1 ? 's' : ''})</button>
            <span className="text-mention text-slate-500">Bientôt : enregistrer comme dossier, sortir en dossier imprimé ou en présentation.</span>
          </div>
        </div>
      </section>

      {lu && gardes.map(k => (
        <section key={`${k}|${sur}|${section}`} className="space-y-2">
          <h2 className="titre-ecran !mb-0">{BLOCS.find(b => b[0] === k)?.[2]} <span className="text-slate-400 font-normal">· {nom}</span></h2>
          {rendu(k)}
        </section>))}
    </div>);
}

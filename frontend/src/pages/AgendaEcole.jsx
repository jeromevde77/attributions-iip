/* L'AGENDA DE L'ÉCOLE (3.5.058, Charles, 2 novembre 2026 : « on doit centraliser la gestion de l'agenda de l'école »).
 * Organisation → Agenda de l'école : la ligne du temps de l'année, peinte au pinceau ou saisie au mini calendrier
 * (components/AgendaLigne.jsx). Le même agenda paraît en tête du Temps de travail ; l'horaire, la simulation, l'échéancier
 * et le congé-éducation lisent ses cours et ses jours fermés. */
import { useState } from 'react';
import { IconCalendarMonth, IconX } from '@tabler/icons-react';
import { EnteteCarte, PastilleEtat } from '../components/ui.jsx';
import AgendaLigne, { useAgenda } from '../components/AgendaLigne.jsx';
import AgendaMois from '../components/AgendaMois.jsx';

const plus = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const fmt = d => `${d.slice(8)}/${d.slice(5, 7)}`;

export default function AgendaEcole({ annee, simple = false }) {
  const [ag, recharger] = useAgenda(annee);
  const [sel, setSel] = useState(null);
  const [vue, setVue] = useState('annee');
  const k = ag?.semaines?.indexOf(sel) ?? -1;
  return (
    <div className="space-y-4">
      {!simple && <div>
        <h1 className="titre-ecran">Agenda de l’école</h1>
        <p className="text-second text-slate-500">L’année {annee} en une ligne : les grands moments, la chaleur des semaines, les cours, la fermeture de l’école, les sections et ce qu’elles demandent de personnel. On peint, ou on saisit au calendrier.</p>
      </div>}
      <div className="carte overflow-hidden">
        <EnteteCarte icone={IconCalendarMonth} titre="L’année de l’école" sous={simple ? 'Les grands moments, les cours, les congés et les fermetures de l’école.' : 'Glissez sur des semaines (ou des jours, vue Mois) et choisissez quoi y mettre ; « Saisir » ouvre le mini calendrier.'}>
          <div className="segments">{[['annee', 'Année'], ['mois', 'Mois']].map(([v, l]) => <button key={v} type="button" onClick={() => setVue(v)} className={vue === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>)}</div>
        </EnteteCarte>
        {vue === 'mois' && <AgendaMois annee={annee} ag={ag} recharger={recharger} />}
        {vue === 'annee' && <AgendaLigne simple={simple} annee={annee} ag={ag} recharger={recharger} droite="0.5rem" selSemaine={sel} onSemaine={l => setSel(x => (x === l ? null : l))} />}
        {vue === 'annee' && sel && k >= 0 && !simple && (
          <div className="border-t px-4 py-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="titre-carte">Semaine du {fmt(sel)} au {fmt(plus(sel, 4))}</span>
              {ag.fermetures[k] && <PastilleEtat etat="indisponible">{ag.fermetures[k].fermeture === 'totale' ? 'école fermée' : 'en partie fermée'} — {ag.fermetures[k].libelle}</PastilleEtat>}
              <div className="flex-1" />
              <button className="bouton px-1.5" onClick={() => setSel(null)} aria-label="Fermer"><IconX size={14} /></button>
            </div>
            <p className="text-second m-0"><b>{ag.besoin[k].sections_actives}</b> section(s) active(s) : {ag.sections.filter(s => s.semaines[k].actif).map(s => `${s.section} (${s.semaines[k].seances} séance(s)${s.semaines[k].force ? ', forcée' : ''})`).join(', ') || '—'} · <b>{ag.besoin[k].presents_requis}</b> personne(s) requise(s) au secrétariat.</p>
            {ag.stages?.[k] && (ag.stages[k].etudiants > 0 || ag.stages[k].prepares > 0 || ag.stages[k].periodes.length > 0) && <p className="text-second m-0">Stages : <b>{ag.stages[k].etudiants}</b> étudiant(s) en stage{ag.stages[k].debuts ? `, ${ag.stages[k].debuts} début(s)` : ''}{ag.stages[k].prepares ? `, ${ag.stages[k].prepares} à préparer dans les deux semaines` : ''}{ag.stages[k].periodes.length ? ` · ${ag.stages[k].periodes.join(', ')}` : ''}.</p>}
            {ag.chaleur?.[k]?.raisons?.length > 0 && <p className="text-second text-slate-600 m-0">Chaleur : {ag.chaleur[k].raisons.join(' · ')}.</p>}
          </div>)}
      </div>
    </div>
  );
}

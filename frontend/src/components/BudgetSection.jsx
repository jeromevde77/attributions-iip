/**
 * LE BUDGET PRÉVU D'UNE SECTION (3.5.500, Charles, 16 novembre 2026 : « une partie budget qui va chercher dans nos budgets ce qui a été
 * prévu » ; tranché : le module Budget des sections, l'année civile en cours et la suivante ; sur la fiche de la section, dans le dossier
 * COPIL et dans la présentation). GET /api/budget/section : l'enveloppe disponible, le fonctionnement et les investissements prévus
 * (lignes refusées hors totaux), l'engagé, puis les lignes. Rien n'est recalculé ici : les chiffres du module (Gestion → Budget).
 */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { EnteteCarte, PastilleEtat, Tableau, TableauEntete, Th, Td, Tr, TrTotal, TuileEtat } from './ui.jsx';

const eur = v => `${Math.round(v || 0).toLocaleString('fr-BE')} €`;
const STATUT = { prevu: ['disponible', 'Prévu'], arbitre: ['reussi', 'Accordé'], refuse: ['corriger', 'Refusé'] };
const PRIORITE = { indispensable: 'Indispensable', souhaitable: 'Souhaitable', si_possible: 'Si possible' };

export function useBudgetSection(section, annees = null) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!section) return;
    setD(null);
    fetch(`/api/budget/section?section=${encodeURIComponent(section)}${annees?.length ? `&annees=${annees.join(',')}` : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(setD).catch(e => setD({ erreur: e.message }));
  }, [section, annees?.join(',')]);   // eslint-disable-line react-hooks/exhaustive-deps
  return d;
}

export default function BudgetSection({ section, annees = null }) {
  const d = useBudgetSection(section, annees);
  if (!d) return <p className="text-second text-slate-400">Lecture du budget…</p>;
  if (d.erreur) return <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{d.erreur}</div>;
  return (
    <div className="space-y-4">
      {d.annees.map(a => {
        const prevu = a.fonctionnement + a.investissements;
        const part = a.enveloppe ? Math.round((a.fonctionnement / a.enveloppe) * 100) : null;
        return (
          <div key={a.annee} className="space-y-3">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
              <TuileEtat etat="fort" valeur={a.hors_budget ? '—' : eur(a.enveloppe)} libelle={`Enveloppe ${a.annee}`}
                precision={a.hors_budget ? 'hors budget des sections' : a.coussin != null ? `brute ${eur(a.enveloppe_brute)} · coussin ${eur(a.coussin)}` : 'disponible pour la section'}
                aide={'Module Budget des sections (Gestion → Budget). Enveloppe = socle + montant par étudiant × pondération × effectif, arrondie à l’euro ; le disponible est l’enveloppe moins le coussin de la direction (retenu par tranches).'} />
              <TuileEtat etat={a.enveloppe && a.fonctionnement > a.enveloppe ? 'surveiller' : 'disponible'} valeur={eur(a.fonctionnement)} libelle="Fonctionnement prévu"
                precision={part != null ? `${part} % de l’enveloppe` : `seuil d’investissement : ${eur(a.seuil)} HT l’unité`}
                aide={`Somme des lignes de fonctionnement (prix unitaire HT sous ${eur(a.seuil)}), hors lignes refusées, HTVA.`} />
              <TuileEtat etat="disponible" valeur={eur(a.investissements)} libelle="Investissements prévus"
                precision={a.reserve_invest ? `réserve d’investissement : ${eur(a.reserve_invest)}` : 'à arbitrer par la direction'}
                aide={`Lignes dont le prix unitaire HT atteint ${eur(a.seuil)}, hors lignes refusées, HTVA.`} />
              <TuileEtat etat="neutre" valeur={eur(a.engage)} libelle={`Engagé ${a.annee}`}
                precision={prevu ? `${Math.round((a.engage / prevu) * 100)} % du prévu` : 'aucune ligne prévue'}
                aide="Dépenses encodées dans le module (factures, bons), HTVA." />
            </div>
            <section className="carte overflow-hidden">
              <EnteteCarte titre={`Ce qui est prévu en ${a.annee}`} sous={`${a.lignes.length} ligne(s) · montants HTVA`} />
              {!a.lignes.length ? <p className="px-4 py-3 text-second text-slate-500 m-0">Aucune ligne encodée pour {a.annee}.</p> : (
                <Tableau dense className="!border-0 !rounded-none">
                  <TableauEntete><Th>Ce qui est prévu</Th><Th>Catégorie</Th><Th>Nature</Th><Th>Priorité</Th><Th>Statut</Th><Th align="droite">Montant</Th></TableauEntete>
                  <tbody>
                    <TrTotal><Td colSpan={5}>Total prévu (hors refusés)</Td><Td align="droite">{eur(prevu)}</Td></TrTotal>
                    {a.lignes.map(l => (
                      <Tr key={l.id} className={l.statut === 'refuse' ? 'opacity-60' : ''}>
                        <Td>{l.details}{l.quantite > 1 ? <span className="text-mention text-slate-500"> · {l.quantite} × {eur(l.prix_unitaire)}</span> : null}</Td>
                        <Td ton="secondaire">{l.categorie || '—'}</Td>
                        <Td ton="secondaire">{l.nature === 'investissement' ? 'Investissement' : 'Fonctionnement'}</Td>
                        <Td ton="secondaire">{PRIORITE[l.priorite] || '—'}</Td>
                        <Td><PastilleEtat etat={(STATUT[l.statut] || STATUT.prevu)[0]}>{(STATUT[l.statut] || STATUT.prevu)[1]}</PastilleEtat></Td>
                        <Td align="droite" ton="fort">{eur(l.total_ht)}</Td>
                      </Tr>))}
                  </tbody>
                </Tableau>)}
            </section>
          </div>);
      })}
    </div>);
}

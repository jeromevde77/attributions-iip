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

/* LE BUDGET COMPARÉ (3.5.501, Charles : « toujours un indicateur par rapport aux autres sections et l'ASBL, sur base de données
   historiques mais aussi actualisées sur base des bilans et de la gestion interne dans Lucie »). GET /api/budget/compare. */
export function useBudgetCompare(annees) {
  const [c, setC] = useState({});
  useEffect(() => {
    for (const a of annees || []) fetch(`/api/budget/compare?annee=${a}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => j && setC(x => ({ ...x, [a]: j }))).catch(() => {});
  }, [(annees || []).join(',')]);   // eslint-disable-line react-hooks/exhaustive-deps
  return c;
}

export function Compare({ section, c }) {
  const M = c.moyenne || {}, A = c.asbl;
  // Sans section (l'école) : les tuiles portent la moyenne des sections.
  const S = section ? c.sections.find(x => x.section === section) || null : { ...M, historique: [] };
  const lignes = [...c.sections].filter(x => x.prevu_etudiant != null || x.realise_etudiant != null).sort((a, b) => (b.prevu_etudiant || 0) - (a.prevu_etudiant || 0));
  const max = Math.max(1, ...lignes.map(x => x.prevu_etudiant || 0));
  const comp = (v, m, inverse = false) => (v == null || m == null ? 'neutre' : (inverse ? v <= m : v >= m) ? 'reussi' : 'surveiller');
  const ex = c.exercice_realise;
  return (<>
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
      <TuileEtat etat="disponible" valeur={S?.prevu_etudiant != null ? eur(S.prevu_etudiant) : '—'} libelle="budget prévu par étudiant"
        precision={M.prevu_etudiant != null ? `moyenne des sections : ${eur(M.prevu_etudiant)}` : ''}
        aide={`Fonctionnement prévu (module Budget, lignes non refusées, HTVA) ÷ effectif du budget ${c.annee} (figé au 01/11 de l’année précédente). Moyenne des sections = Σ fonctionnement ÷ Σ effectifs.`} />
      <TuileEtat etat="fort" valeur={S?.realise_etudiant != null ? eur(S.realise_etudiant) : '—'} libelle={`réalisé par étudiant${ex ? ` (bilans ${ex})` : ''}`}
        precision={[M.realise_etudiant != null ? `sections : ${eur(M.realise_etudiant)}` : '', A?.realise_etudiant != null ? `ASBL : ${eur(A.realise_etudiant)}` : ''].filter(Boolean).join(' · ') || 'pas de poste propre dans les comptes'}
        aide={`Charges de la section dans la synthèse des budgets et comptes de l’ASBL (côté HELB et côté IIP), dernier exercice réalisé complet${ex ? ` (${ex})` : ''}, ÷ effectif de cet exercice. ASBL = toutes ses charges ÷ (inscrits de la HELB + effectifs de l’IIP). Les enseignants de l’IIP, payés par la Fédération, n’y sont pas.`} />
      <TuileEtat etat={comp(S?.execution, M.execution)} valeur={S?.execution != null ? `${S.execution} %` : '—'} libelle="exécution du budget"
        precision={M.execution != null ? `toutes les sections : ${M.execution} %` : ''}
        aide="Engagé (dépenses encodées dans Lucie, HTVA) ÷ prévu (fonctionnement et investissements non refusés). Mis à jour à chaque dépense encodée." />
      <TuileEtat etat="disponible" valeur={S?.investissements_etudiant != null ? eur(S.investissements_etudiant) : '—'} libelle="investissements par étudiant"
        precision={M.investissements_etudiant != null ? `moyenne des sections : ${eur(M.investissements_etudiant)}` : ''}
        aide={`Investissements prévus (prix unitaire HT ≥ ${eur(c.seuil)}, non refusés) ÷ effectif du budget.`} />
    </div>
    <section className="carte overflow-hidden">
      <EnteteCarte titre={`Face aux autres sections et à l’ASBL — ${c.annee}`} sous={`Par étudiant, HTVA · réalisé : bilans ${ex || '—'}`} />
      <Tableau dense className="!border-0 !rounded-none">
        <TableauEntete><Th>Section</Th><Th align="droite">Effectif</Th><Th align="droite">Prévu / étudiant</Th><Th align="droite">Réalisé / étudiant</Th><Th align="droite">Exécution</Th><Th align="droite">Investissements / étudiant</Th></TableauEntete>
        <tbody>
          <TrTotal><Td>Moyenne des sections</Td><Td align="droite">—</Td><Td align="droite">{M.prevu_etudiant != null ? eur(M.prevu_etudiant) : '—'}</Td>
            <Td align="droite">{M.realise_etudiant != null ? eur(M.realise_etudiant) : '—'}</Td><Td align="droite">{M.execution != null ? `${M.execution} %` : '—'}</Td>
            <Td align="droite">{M.investissements_etudiant != null ? eur(M.investissements_etudiant) : '—'}</Td></TrTotal>
          {A && <Tr><Td ton="secondaire">ASBL (IIP + HELB)</Td><Td align="droite" ton="secondaire">{A.etudiants}</Td><Td align="droite" ton="secondaire">—</Td>
            <Td align="droite" ton="secondaire">{A.realise_etudiant != null ? eur(A.realise_etudiant) : '—'}</Td><Td align="droite" ton="secondaire">—</Td><Td align="droite" ton="secondaire">—</Td></Tr>}
          {lignes.map(x => (
            <Tr key={x.section} actif={x.section === section}>
              <Td className={x.section === section ? 'font-semibold' : ''}>{String(x.section).replace(/_/g, ' ')}</Td>
              <Td align="droite">{x.effectif ?? '—'}</Td>
              <Td align="droite" className="whitespace-nowrap">{x.prevu_etudiant != null ? <><span className="inline-block align-middle mr-1.5 rounded" style={{ width: Math.round((x.prevu_etudiant / max) * 60), height: 7, background: x.section === section ? 'var(--c-accent, #F9B619)' : 'var(--c-principal, #19537E)' }} />{eur(x.prevu_etudiant)}</> : '—'}</Td>
              <Td align="droite">{x.realise_etudiant != null ? eur(x.realise_etudiant) : '—'}</Td>
              <Td align="droite">{x.execution != null ? `${x.execution} %` : '—'}</Td>
              <Td align="droite">{x.investissements_etudiant != null ? eur(x.investissements_etudiant) : '—'}</Td>
            </Tr>))}
        </tbody>
      </Tableau>
      {S?.historique?.length > 1 && <p className="px-4 py-2 text-mention text-slate-500 m-0">Réalisé par étudiant de {section}, d’après les bilans : {S.historique.map(h => `${h.annee} ${h.par_etudiant != null ? eur(h.par_etudiant) : '—'}`).join(' · ')}.</p>}
    </section>
  </>);
}

export default function BudgetSection({ section, annees = null }) {
  const d = useBudgetSection(section, annees);
  const comp = useBudgetCompare(d?.annees?.map(a => a.annee));
  if (!d) return <p className="text-second text-slate-400">Lecture du budget…</p>;
  if (d.erreur) return <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{d.erreur}</div>;
  return (
    <div className="space-y-4">
      {d.annees.map(a => {
        const prevu = a.fonctionnement + a.investissements;
        const part = a.enveloppe ? Math.round((a.fonctionnement / a.enveloppe) * 100) : null;
        return (
          <div key={a.annee} className="space-y-3">
            <h3 className="intertitre m-0">{a.annee}</h3>
            {comp[a.annee] && <Compare section={section} c={comp[a.annee]} />}
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

/* LE BUDGET DE L'ÉCOLE (3.5.502) : le tableau comparé de toutes les sections, l'année civile en cours et la suivante. */
export function BudgetEcole() {
  const y0 = new Date().getFullYear();
  const c = useBudgetCompare([y0, y0 + 1]);
  if (!c[y0] && !c[y0 + 1]) return <p className="text-second text-slate-400">Lecture du budget…</p>;
  return <div className="space-y-4">{[y0, y0 + 1].filter(a => c[a]).map(a => <div key={a} className="space-y-3"><h3 className="intertitre m-0">{a}</h3><Compare section={null} c={c[a]} /></div>)}</div>;
}

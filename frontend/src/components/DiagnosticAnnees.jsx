import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconArrowRight } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

/**
 * OÙ SONT LES NOTES ? — et comment les remettre à leur année.
 *
 * L'année d'un import est celle choisie dans l'en-tête de Lucie au moment où
 * on le lance. Importer le classeur « TIM 25 » en ayant 2026-2027 à l'écran
 * range donc tout dans 2026-2027, sans un mot : les notes sont bien en base,
 * et introuvables là où on les cherche. On ne pouvait le constater qu'en
 * ouvrant la base.
 *
 * Cet écran montre ce que chaque année contient, signale les unités dont les
 * notes ne coïncident avec aucun inscrit — le signe d'un import mal rangé —,
 * et permet de les ramener, en simulant d'abord.
 */
export default function DiagnosticAnnees({ annee, ueNum = null, onClose, onFini }) {
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [choix, setChoix] = useState(null);      // { ue_num, de }
  const [apercu, setApercu] = useState(null);

  async function charger() {
    try {
      const rep = await fetch('/api/import-suivi/etat-annees'
        + (ueNum ? `?ue_num=${ueNum}` : ''), { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setEtat(j);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum]);

  async function deplacer(ligne, simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/import-suivi/deplacer', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ue_num: ligne.ue_num, de: ligne.annee,
                               vers: annee, simulation }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (simulation) { setChoix(ligne); setApercu(j); }
      else { setApercu(null); setChoix(null); await charger(); onFini && onFini(); }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const lignes = etat?.etat || [];

  return (
    <Fenetre titre="Où sont les notes ?" large="grande" onFermer={onClose}
      pied={apercu && choix ? <>
        <span />
        <button onClick={() => { setApercu(null); setChoix(null); }} className="bouton">
          Annuler
        </button>
        <button onClick={() => deplacer(choix, false)} disabled={enCours}
          className="bouton bouton-fort">
          {enCours ? 'Déplacement…' : 'Déplacer'}
        </button>
      </> : null}>
        <div className="space-y-3">
          <p className="text-second text-slate-500">
            Ce que chaque année contient. L'année de travail est <b>{annee}</b> — c'est
            elle que voient les écrans de délibération.
          </p>
          {erreur && (
            <div className="bloc-etat etat-corriger px-3 py-2 text-sm text-red-800">
              {erreur}
            </div>
          )}

          {etat?.suspects > 0 && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-300
                            text-sm text-amber-900 flex items-start gap-1.5">
              <IconAlertTriangle size={15} className="flex-none mt-0.5" />
              <span>
                {etat.suspects} unité(s) portent des notes dans une année où
                <b> personne n'est inscrit</b>. C'est la signature d'un import lancé
                alors qu'une autre année était sélectionnée.
              </span>
            </div>
          )}

          {!etat ? (
            <div className="py-8 text-center text-sm text-slate-400">Lecture…</div>
          ) : (
            <table className="w-full text-sm border border-slate-200 rounded-lg">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="text-left px-3 py-2">Année</th>
                  <th className="text-left px-3 py-2">Unité</th>
                  <th className="text-right px-3 py-2">Notes</th>
                  <th className="text-right px-3 py-2">Étudiants</th>
                  <th className="text-right px-3 py-2">Inscrits</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className={`border-t border-slate-100
                    ${l.suspect ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-1.5 font-semibold">
                      {l.annee}
                      {l.annee === annee && (
                        <span className="ml-1.5 text-mention text-emerald-700 font-semibold">
                          (de travail)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <b>{l.ue_num}</b> {l.ue_nom && <span className="text-slate-500">{l.ue_nom}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.notes}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.etudiants}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.inscrits}</td>
                    <td className="px-3 py-1.5 text-right">
                      {l.annee !== annee && l.notes > 0 && (
                        <button onClick={() => deplacer(l, true)} disabled={enCours}
                          className="px-2 py-1 text-second rounded-lg border border-iip-blue
                                     text-iip-blue font-semibold disabled:opacity-40
                                     inline-flex items-center gap-1">
                          Ramener en {annee} <IconArrowRight size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* La simulation d'abord : un déplacement de notes ne se lance pas à
              l'aveugle. */}
          {apercu && choix && (
            <div className="border border-iip-blue/40 rounded-xl p-4 space-y-2 bg-iip-blue/5">
              <div className="text-sm font-semibold text-iip-blue">
                UE {choix.ue_num} — {choix.annee} → {annee}
              </div>
              <div className="text-sm text-slate-700">
                {apercu.notes} note(s), {apercu.decisions} décision(s),
                {' '}{apercu.ajustements} ajustement(s), {apercu.motivations} motivation(s)
                seront déplacés.
              </div>
              {apercu.conflits > 0 && (
                <div className="text-second text-amber-800">
                  {apercu.conflits} ligne(s) laissée(s) en place : l'année d'arrivée
                  porte déjà une valeur pour le même acquis. Rien n'est écrasé — à
                  vous de trancher.
                </div>
              )}
              {apercu.nb_non_inscrits > 0 && (
                <div className="text-second text-amber-800">
                  {apercu.nb_non_inscrits} étudiant(s) non inscrit(s) à cette unité en
                  {' '}{annee} : leurs lignes restent où elles sont.
                  <div className="text-second mt-0.5">
                    {apercu.non_inscrits.slice(0, 6).join(' · ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </Fenetre>
  );
}

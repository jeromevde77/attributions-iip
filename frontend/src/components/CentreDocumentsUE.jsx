import { useEffect, useState } from 'react';
import { IconPrinter, IconFileText, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LE CENTRE D'IMPRESSION D'UNE UNITÉ.
 *
 * Une séance produit quatre pièces : le procès-verbal du Conseil, les
 * attestations de réussite, les notifications d'ajournement (annexe 8) et
 * celles de refus (annexe 9). Elles se demandaient à deux endroits — le PV à
 * la clôture, les autres depuis la liste des unités — et l'on ne savait plus
 * où aller chercher quoi.
 *
 * Un seul écran, donc, appelé des deux endroits : on coche ce qu'on veut, et
 * tout sort dans un document unique, chaque pièce sur sa page.
 */
export default function CentreDocumentsUE({ ueNum, ueNom, annee, onClose }) {
  const [etat, setEtat] = useState(null);      // le comptage
  const [choix, setChoix] = useState({ pv: true, reussite: true, ajournement: true,
    refus: true, listes: false, conseil: false,
    grille: false, ajustements: false, motivations: false });
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rep = await fetch(
          `/api/acquis/deliberation/ue/${ueNum}/documents?annee=${encodeURIComponent(annee)}`,
          { headers: authHeaders() });
        const j = await rep.json();
        if (!rep.ok) throw new Error(j.error);
        setEtat(j);
      } catch (e) { setErreur(e.message); }
    })();
  }, [ueNum, annee]);

  /**
   * @param {'impression'|'pdf'} sortie
   *
   * LE PDF N'EST PAS UN CONFORT. Un pied de page répété sur chaque feuille
   * n'existe pas en HTML : le navigateur ne sait le poser qu'à la fin du
   * document, si bien qu'un lot de cinquante pages n'en porte qu'un. Le PDF
   * dispose d'un vrai gabarit de pied — c'est la seule sortie où chaque page
   * est un document fini.
   */
  async function produire(sortie = 'impression') {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/documents`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ...choix }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (j.manques?.length) {
        setErreur(`${j.pieces} pièce(s) produite(s), mais : `
          + j.manques.slice(0, 6).join(' · ')
          + (j.manques.length > 6 ? ` … et ${j.manques.length - 6} autres.` : ''));
      }
      if (sortie === 'pdf') {
        const rp = await fetch('/api/impression/pdf', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ html: j.html, nom: j.nom?.replace(/\.html$/, '')
            || `Documents_UE${ueNum}`, pagination: 'si-plusieurs' }),
        });
        if (!rp.ok) {
          const e = await rp.json().catch(() => ({}));
          setErreur(e.error || 'Le PDF n’a pas pu être produit.');
          return;
        }
        const blob = await rp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = (j.nom || 'documents').replace(/\.html$/, '') + '.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        if (!j.manques?.length) onClose();
        return;
      }
      const f = window.open('', '_blank');
      if (!f) { setErreur('Le navigateur a bloqué la fenêtre d’impression.'); return; }
      f.document.write(j.html); f.document.close();
      if (!j.manques?.length) onClose();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  // Le procès-verbal existe toujours ; les trois autres piles dépendent des
  // décisions prises.
  const pieces = etat ? [
    { cle: 'pv', libelle: 'Procès-verbal de délibération',
      aide: etat.cloturee
        ? 'Annexe 3 — ou 5 pour une épreuve intégrée'
        : 'Annexe 3 — la séance n’est pas close : les dates manqueront',
      nb: 1, noms: null, ton: 'border-iip-blue bg-iip-blue/5' },
    { cle: 'reussite', libelle: 'Attestations de réussite',
      aide: 'Une par étudiant, pour cette unité',
      nb: etat.reussites.length, noms: etat.reussites,
      ton: 'border-emerald-300 bg-emerald-50' },
    { cle: 'ajournement', libelle: "Notifications d'ajournement",
      aide: 'Annexe 8 — acquis et cours à représenter, seconde session',
      nb: etat.ajournements.length, noms: etat.ajournements,
      ton: 'border-amber-300 bg-amber-50' },
    { cle: 'refus', libelle: 'Notifications de refus',
      aide: 'Annexe 9 — base légale et voies de recours',
      nb: etat.refus.length, noms: etat.refus,
      ton: 'border-red-300 bg-red-50' },
    // Une liste par cours, même sans ajourné : une liste absente laisse croire
    // qu'on l'a oubliée, une liste « Néant » dit que le cours n'a personne à
    // revoir — et c'est une information pour le professeur.
    // LA COMPOSITION DU CONSEIL EST UNE PIÈCE DE LA DÉLIBÉRATION, non un
    // outil à part : c'est elle qui établit que le Conseil pouvait siéger.
    // Elle avait son propre bouton, loin d'ici — une séparation d'outil, pas
    // de métier.
    // LE DOSSIER DE LA DÉLIBÉRATION : ce sur quoi le Conseil a travaillé.
    { cle: 'grille', libelle: 'Grille de délibération',
      aide: 'Les cotes acquis par acquis, la note d’unité et la décision',
      nb: etat.reussites.length + etat.ajournements.length + etat.refus.length
        + etat.sans_decision.length, noms: null, ton: 'border-violet-300 bg-violet-50' },
    { cle: 'ajustements', libelle: 'Faveurs et ajournements du Conseil',
      aide: 'Ce que le Conseil a accordé ou imposé — avec qui et quand',
      nb: 1, noms: null, ton: 'border-violet-300 bg-violet-50' },
    { cle: 'motivations', libelle: 'Recueil des motivations',
      aide: 'Toutes les motivations, et les échecs qui n’en ont pas',
      nb: 1, noms: null, ton: 'border-violet-300 bg-violet-50' },
    { cle: 'conseil', libelle: 'Composition du Conseil des études',
      aide: 'Membres, qualité, voix et quorum — RGE art. 22 et 25',
      nb: 1, noms: null, ton: 'border-sky-300 bg-sky-50' },
    { cle: 'listes', libelle: 'Listes des ajournés par cours',
      aide: 'Une par cours, pour les professeurs — « Néant » si personne',
      nb: etat.nb_cours || 0, noms: null,
      ton: 'border-slate-400 bg-slate-50' },
  ] : [];

  const total = pieces.filter(p => choix[p.cle] && p.nb).reduce((n, p) => n + p.nb, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-16
                      max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Générer les documents — UE {ueNum}
            </h3>
            <p className="text-[12px] text-slate-500">
              {ueNom || ''} · {annee}
              {etat && (etat.cloturee ? ' · séance close' : ' · séance non close')}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12px] text-red-800 flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
            </div>
          )}

          {!etat ? (
            <div className="py-8 text-center text-slate-400 text-sm">Chargement…</div>
          ) : (
            <>
              <div className="space-y-1.5">
                {pieces.map(p => (
                  <label key={p.cle}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border cursor-pointer
                      ${!p.nb ? 'border-slate-200 bg-slate-50 opacity-60'
                        : choix[p.cle] ? p.ton : 'border-slate-200'}`}>
                    <input type="checkbox" checked={!!choix[p.cle] && !!p.nb} disabled={!p.nb}
                      onChange={e => setChoix(c => ({ ...c, [p.cle]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 accent-iip-blue" />
                    <span className="flex-1 min-w-0">
                      <span className="text-[12.5px] font-semibold text-slate-800">
                        {p.noms ? `${p.nb} ` : ''}{p.libelle.toLowerCase()}
                      </span>
                      <span className="block text-[11px] text-slate-500">{p.aide}</span>
                      {!!p.noms?.length && (
                        <span className="block text-[10.5px] text-slate-400 truncate">
                          {p.noms.map(x => x.nom).join(', ')}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              {!!etat.sans_decision.length && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                text-[11.5px] text-amber-900">
                  <b>{etat.sans_decision.length} étudiant(s) sans décision</b> : aucune pièce
                  ne peut être produite pour eux tant que le Conseil n'a pas délibéré.
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Toutes les pièces sortent dans un seul document, chacune sur sa page,
                prêtes à imprimer et à signer.
              </p>
            </>
          )}
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                        justify-between gap-2">
          <span className="text-[11.5px] text-slate-500">
            {total ? `${total} pièce(s) à produire` : 'Rien de coché'}
          {total ? (
            <span className="block text-[11px] text-slate-400">
              Le PDF porte le pied de page sur chaque feuille ; l'aperçu HTML, non —
              le navigateur ne sait pas répéter un pied.
            </span>
          ) : null}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
              Fermer
            </button>
            <button onClick={() => produire('impression')} disabled={enCours || !total}
              title="Aperçu HTML dans un onglet — sans pied de page répété"
              className="px-3 py-2 text-[12.5px] rounded-lg border border-slate-300
                         text-slate-600 disabled:opacity-40
                         flex items-center gap-1.5">
              <IconPrinter size={14} /> Aperçu HTML
            </button>
            <button onClick={() => produire('pdf')} disabled={enCours || !total}
              title="Pied de page sur chaque feuille, une pièce par page"
              className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40 flex items-center gap-1.5">
              <IconFileText size={14} /> PDF — à imprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

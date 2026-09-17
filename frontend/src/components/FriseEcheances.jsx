import { useMemo, useRef, useEffect } from 'react';
import { aujourdhui, joursAvant, urgence } from '../lib/urgence.js';

/**
 * LA FRISE DES ÉCHÉANCES — LE MOIS QUI VIENT, D'UN SEUL REGARD.
 *
 * Une liste répond à « qu'est-ce que Untel a en charge ? ». Elle ne répond pas
 * à « qu'est-ce qui tombe la semaine prochaine ? » — or c'est la question d'une
 * réunion de service, et la seule qui fasse déplacer une date avant qu'il ne
 * soit trop tard. Triée par personne, la même matière cache précisément ce
 * qu'on cherche : les trois échéances du 12, réparties entre trois groupes.
 *
 * TRENTE JOURS DEVANT, SEPT DERRIÈRE. Le passé n'est pas coupé net : une tâche
 * dépassée de trois jours se traite encore, et disparaître de la frise le jour
 * du terme serait la meilleure façon de l'oublier. Au-delà, elle reste dans la
 * liste — la frise regarde devant.
 *
 * L'ÉCHELLE EST LE TEMPS, PAS LE NOMBRE. Un jour vaut la même largeur qu'il
 * porte une tâche ou dix : c'est ce qui fait qu'un amas se voit. Les tâches
 * d'un même jour s'empilent, et la hauteur de la pile EST l'information.
 *
 * Les couleurs viennent de `lib/urgence.js`, comme partout : ocre à sept jours,
 * brique à trois et au-delà du terme. Une frise qui aurait ses propres seuils
 * finirait par contredire l'Accueil.
 */

const AVANT = 7;       // jours de retard encore montrés
const APRES = 30;      // le mois à venir
const LARGEUR_JOUR = 30;

const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
              'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export default function FriseEcheances({ taches = [], onOuvrir }) {
  const defile = useRef(null);
  const today = aujourdhui();

  /** Les jours de la frise, avec ce qui tombe sur chacun. */
  const jours = useMemo(() => {
    const base = new Date(`${today}T00:00:00`);
    const cases = [];
    for (let k = -AVANT; k <= APRES; k++) {
      const d = new Date(base);
      d.setDate(d.getDate() + k);
      cases.push({
        decalage: k,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          + `-${String(d.getDate()).padStart(2, '0')}`,
        jour: d.getDate(),
        mois: d.getMonth(),
        weekend: d.getDay() === 0 || d.getDay() === 6,
        premierDuMois: d.getDate() === 1 || k === -AVANT,
        taches: [],
      });
    }
    const parDate = Object.fromEntries(cases.map(c => [c.date, c]));
    for (const t of taches) {
      if (!t.echeance) continue;
      const j = joursAvant(t.echeance, today);
      if (j === null) continue;
      // PLUS VIEUX QUE LA FRISE : on le pose sur son bord gauche plutôt que de
      // le perdre. Une tâche en retard de six semaines doit rester visible —
      // c'est celle dont on a le plus besoin de parler.
      const cle = j < -AVANT ? cases[0].date : String(t.echeance).slice(0, 10);
      if (parDate[cle]) parDate[cle].taches.push(t);
      else if (j > APRES) { /* au-delà du mois : hors frise, volontairement */ }
    }
    return cases;
  }, [taches, today]);

  const sansEcheance = useMemo(
    () => taches.filter(t => !t.echeance), [taches]);
  const auDela = useMemo(
    () => taches.filter(t => t.echeance && joursAvant(t.echeance, today) > APRES),
    [taches, today]);

  const hauteurMax = Math.max(1, ...jours.map(j => j.taches.length));

  /* AUJOURD'HUI AU PREMIER PLAN. La frise s'ouvre sur le jour même, et non sur
     son bord gauche : sans cela, on arrive sur la semaine écoulée et il faut
     faire défiler pour voir ce qui vient. */
  useEffect(() => {
    if (defile.current) defile.current.scrollLeft = Math.max(0, (AVANT - 1) * LARGEUR_JOUR);
  }, []);

  return (
    <div className="carte overflow-hidden mb-4">
      <div className="flex items-baseline gap-2 px-3 py-2 border-b border-slate-200">
        <span className="text-[13px] font-semibold text-iip-blue">Les trente jours qui viennent</span>
        <span className="text-[11px] text-slate-400">
          {taches.filter(t => t.echeance).length} échéance(s)
          {sansEcheance.length > 0 && ` · ${sansEcheance.length} sans date`}
        </span>
      </div>

      <div ref={defile} className="overflow-x-auto">
        <div className="relative" style={{ width: jours.length * LARGEUR_JOUR }}>

          {/* LES MOIS, EN TÊTE. Une frise de trente jours en enjambe deux : sans
              le nom, « 3 » ne dit pas s'il s'agit du 3 de ce mois ou du
              suivant. */}
          <div className="flex h-5 text-[10px]">
            {jours.map(j => (
              <div key={`m${j.date}`} style={{ width: LARGEUR_JOUR }}
                className="flex-none flex items-center">
                {j.premierDuMois && (
                  <span className="pl-1 font-semibold uppercase tracking-wide
                                   text-slate-400 whitespace-nowrap">
                    {MOIS[j.mois]}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* LES PILES. Le jour est la colonne ; ce qui tombe dessus s'y empile,
              du plus urgent au moins urgent — la couleur du haut de pile est
              celle qui compte. */}
          <div className="flex items-end border-b border-slate-200"
            style={{ minHeight: Math.min(hauteurMax, 8) * 20 + 8 }}>
            {jours.map(j => (
              <div key={j.date} style={{ width: LARGEUR_JOUR }}
                className={`flex-none flex flex-col justify-end gap-0.5 px-0.5 pb-1
                  ${j.weekend ? 'bg-slate-50' : ''}
                  ${j.decalage === 0 ? 'bg-iip-blue/5' : ''}`}>
                {j.taches.slice(0, 8).map(t => {
                  const u = urgence(t.echeance, today);
                  const fait = t.statut === 'fait' || t.statut === 'termine';
                  return (
                    <button key={t.id} onClick={() => onOuvrir?.(t)}
                      title={`${t.titre}${t.echeance ? ` — ${frJour(t.echeance)}` : ''}`
                        + `${u.mention ? ` (${u.mention})` : ''}`}
                      /* LE RAIL PORTE L'ÉTAT, ET LUI SEUL — la règle du bloc
                         signalé, à la taille d'une pastille de frise. Peindre
                         le fond en brique ferait de trente échéances un mur de
                         couleur où plus rien ne se distingue. */
                      /* FAIT SE DIT EN VERT, ET SE LIT ENCORE.
                         Grisée à quarante pour cent, une tâche close
                         disparaissait presque : la frise semblait vide là où le
                         travail avait été fait, et c'est l'inverse qu'on veut
                         voir en réunion. Elle garde sa place, en vert, un peu
                         en retrait. */
                      className={`h-4 rounded-champ border border-slate-200
                        border-l-[3px] bg-white hover:shadow-pose
                        ${fait ? 'opacity-80' : ''}`}
                      style={{ borderLeftColor: fait ? '#15803D' : couleurRail(u) }} />
                  );
                })}
                {j.taches.length > 8 && (
                  <span className="text-[9px] text-slate-400 text-center">
                    +{j.taches.length - 8}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* LES QUANTIÈMES, SOUS LE FILET. */}
          <div className="flex h-6 text-[10px]">
            {jours.map(j => (
              <div key={`q${j.date}`} style={{ width: LARGEUR_JOUR }}
                className={`flex-none flex items-center justify-center
                  ${j.decalage === 0
                    ? 'font-bold text-iip-blue'
                    : j.weekend ? 'text-slate-300' : 'text-slate-400'}`}>
                {j.jour}
              </div>
            ))}
          </div>

          {/* LE TRAIT D'AUJOURD'HUI, par-dessus tout le reste. */}
          <div className="absolute top-5 bottom-6 w-px bg-iip-blue/60 pointer-events-none"
            style={{ left: AVANT * LARGEUR_JOUR + LARGEUR_JOUR / 2 }} />
        </div>
      </div>

      {(sansEcheance.length > 0 || auDela.length > 0) && (
        <div className="px-3 py-1.5 border-t border-slate-100 text-[11px] text-slate-500
                        flex flex-wrap gap-x-4">
          {sansEcheance.length > 0 && (
            <span>
              <b className="text-[#B45309]">{sansEcheance.length}</b> sans échéance —
              {' '}elles ne tombent jamais, donc elles ne se font pas.
            </span>
          )}
          {auDela.length > 0 && (
            <span>{auDela.length} au-delà du mois.</span>
          )}
        </div>
      )}
    </div>
  );
}

/** La teinte du rail, prise sur l'échelle d'urgence commune. */
function couleurRail(u) {
  if (u.niveau === 'depasse' || u.niveau === 'presse') return '#9D4A38';
  if (u.niveau === 'approche') return '#B45309';
  return '#CBD5E1';
}

function frJour(d) {
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}` : String(d);
}

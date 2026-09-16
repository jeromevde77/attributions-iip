/**
 * LE VOCABULAIRE COMMUN DES ÉCRANS DE STATISTIQUES.
 *
 * Deux écrans disaient la même chose dans deux langues. « Résultats » parlait
 * en COULEURS — une barre verte, ambre et rose par unité, un taux teinté selon
 * qu'il rassure ou non : on voyait d'un coup d'œil où ça tenait et où ça ne
 * tenait pas. « Distributions » parlait en FORME — moyenne, médiane, mode,
 * étendue : on voyait si un chiffre décrivait un groupe ou masquait sa coupure
 * en deux. Les deux disaient vrai, et aucun ne remplaçait l'autre.
 *
 * Plutôt que de choisir, on met les deux langues ici, et les deux écrans les
 * parlent toutes les deux. Un seul endroit : une teinte ou une graduation qui
 * change doit changer partout, sans quoi le même vert finit par ne plus vouloir
 * dire la même chose d'un écran à l'autre.
 */

/** Un nombre lisible : virgule décimale, et pas de « ,0 » inutile. */
export const nb = (v, dec = 1) => (v == null ? '—'
  : Number(v).toFixed(dec).replace('.', ',').replace(/,0$/, ''));

export const pc = v => (v == null ? '—' : `${String(v).replace('.', ',')} %`);

/**
 * LA TEINTE D'UN TAUX DE RÉUSSITE.
 *
 * Trois tons désaturés, et rien d'autre : au-delà, la couleur cesse de
 * signaler. Les seuils sont ceux de l'usage — trois quarts, la moitié.
 */
export function tonTaux(v) {
  if (v == null) return 'text-slate-400';
  if (v >= 75) return 'text-emerald-700';
  if (v >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

/** Le même jugement, mais pour un filet ou un fond. */
export function couleurTaux(v) {
  if (v == null) return '#CBD5E1';
  if (v >= 75) return '#047857';
  if (v >= 50) return '#B45309';
  return '#9D4A38';
}

/**
 * LA BARRE DES DÉCISIONS : réussis, ajournés, refusés, dans cet ordre.
 *
 * C'est la pièce que Jérôme trouvait parlante, et elle l'est parce qu'elle ne
 * demande aucune lecture : la proportion de vert SE VOIT. Elle se compte sur
 * les DÉCIDÉS — un dossier sans décision n'est pas un échec, il n'a pas sa
 * place dans une barre qui répartit des décisions.
 */
export function BarreDecisions({ reussi = 0, ajourne = 0, refuse = 0, largeur = 'w-28' }) {
  const t = (reussi + ajourne + refuse) || 1;
  const seg = [
    ['reussi', reussi, 'bg-emerald-500'],
    ['ajourne', ajourne, 'bg-amber-500'],
    ['refuse', refuse, 'bg-rose-500'],
  ];
  return (
    <div className={`flex h-2 ${largeur} rounded-full overflow-hidden bg-slate-100`}
      title={`${reussi} réussi(s) · ${ajourne} ajourné(s) · ${refuse} refusé(s) `
           + `— sur ${reussi + ajourne + refuse} décidés`}>
      {seg.map(([k, n, cl]) => (n
        ? <div key={k} className={cl} style={{ width: `${(n / t) * 100}%` }} /> : null))}
    </div>
  );
}

/**
 * LA TUILE D'ENSEMBLE. Chiffre d'abord, libellé dessous, filet gauche teinté
 * selon l'état — jamais de fond coloré : si tout est coloré, plus rien ne
 * signale.
 */
export function Tuile({ libelle, valeur, unite, precision, ton, couleur }) {
  const bord = couleur || (ton === 'fort' ? 'var(--c-iip, #1B2B4B)'
    : ton === 'alerte' ? 'var(--c-attente, #B45309)' : '#CBD5E1');
  return (
    <div className="carte px-3 py-2.5 flex-1 min-w-[132px]"
      style={{ borderLeft: `3px solid ${bord}` }}>
      <div className="text-[19px] font-bold text-iip-blue tabular-nums leading-tight">
        {valeur}
        {unite && <span className="text-[11px] font-normal text-slate-500 ml-1">{unite}</span>}
      </div>
      <div className="text-[11px] text-slate-600">{libelle}</div>
      {precision && <div className="text-[10px] text-slate-400">{precision}</div>}
    </div>
  );
}

/** La barre d'étendue : min — médiane — max, pour voir la forme d'un coup. */
export function Etendue({ d, max = 20 }) {
  if (d?.min == null || d?.max == null) return null;
  const p = v => Math.max(0, Math.min(100, (v / max) * 100));
  const g = p(d.min);
  const larg = Math.max(1.5, p(d.max) - g);
  return (
    <div className="relative h-3 bg-slate-100 rounded-full overflow-visible" title={
      `De ${nb(d.min)} à ${nb(d.max)} · médiane ${nb(d.mediane)} · moyenne ${nb(d.moyenne)}`}>
      <div className="absolute inset-y-0 rounded-full bg-iip-blue/20"
        style={{ left: `${g}%`, width: `${larg}%` }} />
      {/* La médiane est un trait plein, la moyenne un trait ocre : on doit
          pouvoir les distinguer sans légende quand elles se chevauchent. */}
      <div className="absolute inset-y-[-2px] w-[2px] bg-iip-blue rounded"
        style={{ left: `${p(d.mediane)}%` }} />
      <div className="absolute inset-y-[-2px] w-[2px] rounded"
        style={{ left: `${p(d.moyenne)}%`, background: 'var(--c-attente, #B45309)' }} />
    </div>
  );
}

/**
 * LA FORME D'UNE SÉRIE, calculée ici plutôt que demandée au serveur.
 *
 * Les taux par unité sont déjà chargés : en redemander la distribution serait
 * une seconde source pour un même fait. Médiane et étendue suffisent — le mode
 * n'a pas de sens sur des pourcentages continus.
 */
export function forme(valeurs) {
  const v = valeurs.filter(x => x != null && Number.isFinite(Number(x)))
    .map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length % 2 ? v[(v.length - 1) / 2]
    : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return {
    n: v.length,
    min: v[0], max: v[v.length - 1], mediane: m,
    moyenne: v.reduce((a, b) => a + b, 0) / v.length,
  };
}

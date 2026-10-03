// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES PIÈCES COMMUNES DES GRILLES D'ACCÈS
//
// « Les tableaux n'ont pas la même taille ni la même mise en page » (Charles,
// 3 octobre 2026). Rôles × modules et personnes × modules dessinaient chacun
// leur en-tête, leurs largeurs et leurs cases — l'une en aplats pleins, l'autre
// en fonds pâles, pour dire la même chose. Un même droit se dessine une fois :
// ici, et les deux tableaux le lisent.
// ─────────────────────────────────────────────────────────────────────────────

import { MODULES_ACCES } from '../lib/modules.js';

/** Les mesures communes. Une colonne de module a la même largeur partout, la
 *  première colonne aussi : les modules tombent l'un sous l'autre d'un tableau
 *  à l'autre. */
export const COL_PREMIERE = 'w-[190px] min-w-[190px]';
export const COL_MODULE = 'w-[66px] min-w-[66px]';
export const HAUTEUR_LIGNE = 'h-[44px]';

/** Un niveau de droit, et l'état qui le colore (couleurs réglées, `--c-*`). */
export const NIVEAUX_DROIT = {
  ecrit:      { texte: 'écrit',      etat: 'reussi',     aide: 'Modifie directement' },
  validation: { texte: 'validation', etat: 'surveiller', aide: 'Encode, la direction tranche' },
  lit:        { texte: 'lit',        etat: 'disponible', aide: 'Consultation seule' },
  rien:       { texte: '—',          etat: null,         aide: 'Aucun accès' },
};

/** Le verdict d'un geste — même dessin que le droit d'un module. */
export const VERDICTS = {
  oui:       { texte: 'oui',            etat: 'reussi',     aide: 'La porte s’ouvre' },
  demande:   { texte: 'par demande',    etat: 'surveiller', aide: 'Passe par la direction' },
  condition: { texte: 'sous condition', etat: 'reserve',    aide: 'Selon le périmètre, la fiche ou le dossier' },
  non:       { texte: '—',              etat: null,         aide: 'Refusé' },
};

/**
 * LA CASE. Une information d'état est une pastille PLEINE, couleur du réglage
 * et texte blanc ; l'absence est un simple tiret dans un contour. La réserve
 * (« sous condition ») est une nuance : elle s'écrit en trait pointillé, elle
 * ne se colore pas.
 */
export function Pastille({ def, occupe = false }) {
  const base = 'w-full h-[20px] justify-center rounded-[4px]';
  if (!def?.etat) {
    return (
      <span className={`inline-flex items-center ${base} text-[10px] text-slate-300 border border-slate-200 bg-white`}>
        {occupe ? '…' : (def?.texte || '—')}
      </span>
    );
  }
  if (def.etat === 'reserve') {
    return (
      <span className={`inline-flex items-center ${base} text-[10px] font-semibold border border-dashed bg-white whitespace-nowrap`}
        style={{ borderColor: 'var(--c-reussi)', color: 'var(--c-texte)' }}>
        {occupe ? '…' : def.texte}
      </span>
    );
  }
  return (
    <span data-etat={def.etat} className={`pastille-etat ${base}`}>
      {occupe ? '…' : def.texte}
    </span>
  );
}

/** Une case cliquable (ou non) de la grille. */
export function CaseDroit({ niveau, onClick, disabled, title, occupe, note }) {
  const def = NIVEAUX_DROIT[niveau] || NIVEAUX_DROIT.rien;
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`block w-full ${disabled ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}>
      <Pastille def={def} occupe={occupe} />
      {note && <span aria-hidden="true" className="block text-[9px] leading-none text-slate-400 mt-0.5">{note}</span>}
    </button>
  );
}

/** L'en-tête d'une colonne de module : icône, puis le mot. */
export function EnteteModules() {
  return MODULES_ACCES.map(m => (
    <th key={m.key} className={`${COL_MODULE} px-1 py-1.5 align-bottom font-normal`} title={m.desc}>
      <div className="flex justify-center"><m.Icone size={14} stroke={1.6} /></div>
      <div className="text-[10px] leading-tight mt-0.5 normal-case tracking-normal">{m.label}</div>
    </th>
  ));
}

/** La légende, toujours au pied de la carte. */
export function Legende({ defs, children }) {
  return (
    <div className="px-4 py-2 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
      {Object.values(defs).map(d => (
        <span key={d.texte} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-[72px]"><Pastille def={d} /></span>{d.aide}
        </span>
      ))}
      {children && <span className="flex-1 text-right text-slate-500">{children}</span>}
    </div>
  );
}

/** Le titre d'une carte (15 px) et sa ligne d'explication. */
export function TitreCarte({ titre, children, droite }) {
  return (
    <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold" style={{ color: 'var(--c-texte)' }}>{titre}</div>
        {children && <div className="text-[12px] text-slate-500">{children}</div>}
      </div>
      {droite}
    </div>
  );
}

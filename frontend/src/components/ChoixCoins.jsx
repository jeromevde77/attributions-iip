import { COINS, coinsDe } from '../lib/design.js';

/* LES COINS À ARRONDIR, UN PAR UN (12 octobre 2026, Charles). Une petite tuile et ses quatre coins :
   un clic sur un coin l'arrondit ou le redresse. La valeur est « hg,hd,bd,bg » (ceux qui sont arrondis). */
const NOMS = { hg: 'haut gauche', hd: 'haut droit', bd: 'bas droit', bg: 'bas gauche' };
export default function ChoixCoins({ valeur, onChange, disabled = false }) {
  const actifs = coinsDe(valeur);
  const basculer = c => onChange(COINS.filter(x => (x === c ? !actifs.includes(c) : actifs.includes(x))).join(','));
  const rayon = c => (actifs.includes(c) ? '9px' : '0');
  return (
    <span className="relative inline-block w-14 h-9 flex-none" title="Cliquez un coin pour l'arrondir ou le redresser">
      <span className="absolute inset-1 border-2 border-slate-400 bg-white"
        style={{ borderRadius: `${rayon('hg')} ${rayon('hd')} ${rayon('bd')} ${rayon('bg')}`, borderLeftColor: 'var(--c-disponible)', borderLeftWidth: 4 }} />
      {COINS.map(c => (
        <button key={c} type="button" disabled={disabled} onClick={() => basculer(c)} aria-pressed={actifs.includes(c)}
          aria-label={`Coin ${NOMS[c]} : ${actifs.includes(c) ? 'arrondi' : 'droit'}`}
          className={`absolute w-3 h-3 rounded-full border ${actifs.includes(c) ? 'bg-iip-blue border-iip-blue' : 'bg-white border-slate-400'}`}
          style={{ [c[0] === 'h' ? 'top' : 'bottom']: -2, [c[1] === 'g' ? 'left' : 'right']: -2 }} />))}
    </span>);
}

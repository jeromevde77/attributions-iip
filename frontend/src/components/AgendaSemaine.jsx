/**
 * L'AGENDA DE LA SEMAINE (Charles, 10 octobre 2026 : « un agenda des 7 jours de la
 * semaine ; on règle les blocs de cours, on définit la base ; puis on va placer
 * les dispos des profs, des cours… »). UN SEUL DESSIN pour la base de l'école,
 * les contraintes du planning, les cartes des enseignants et leur fiche.
 * Le temps est à l'échelle : un bloc de deux heures a la même hauteur partout,
 * et des jours aux blocs différents (le samedi de TIM) se lisent côte à côte.
 *
 *   · mode « base » : les blocs posés sont pleins (le principal) ; les modèles
 *     absents d'un jour s'y dessinent en pointillé, un clic les ajoute ; un clic
 *     sur un bloc posé le retire. Un modèle qui chevaucherait un bloc du jour ne
 *     se propose pas.
 *   · mode « peindre » : chaque bloc de la base porte sa valeur — vert,
 *     orange, rouge ; un clic la fait tourner. Ce qu'un niveau au-dessus impose
 *     déjà (la section pour un cours…) s'écrit en petit dans le bloc.
 */
export const NOMS_JOURS = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
export const DISPO = {
  1: { nom: 'libre', fond: 'var(--c-reussi)', signe: '' },
  2: { nom: 'éventuellement', fond: 'var(--c-attente)', signe: '?' },
  0: { nom: 'jamais', fond: 'var(--c-refuse)', signe: '✕' },
};
export const suivant = v => (v === 1 ? 2 : v === 2 ? 0 : 1);
const min = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };

export function LegendeDispo({ libre = 'libre' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-3 text-[11.5px] text-slate-600">
      {[1, 2, 0].map(v => (
        <span key={v} className="inline-flex items-center gap-1">
          <span className="inline-block w-3.5 h-3.5 rounded-[3px]" style={{ background: DISPO[v].fond }} />{v === 1 ? libre : DISPO[v].nom}</span>))}
    </span>
  );
}

export default function AgendaSemaine({
  base = [], modeles = [], mode = 'peindre', valeur = () => 1, herite = null, onCase, desactive = false,
  compact = false, jours = [1, 2, 3, 4, 5, 6, 7],
}) {
  const tous = [...base, ...modeles];
  const debutJour = Math.min(8 * 60, ...tous.map(c => min(c.debut)));
  const finJour = Math.max(20 * 60, ...tous.map(c => min(c.fin)));
  const ppm = compact ? 0.22 : 0.62;                          // pixels par minute
  const haut = (finJour - debutJour) * ppm;
  const y = h => (min(h) - debutJour) * ppm;
  const heures = []; for (let h = Math.ceil(debutJour / 60); h * 60 <= finJour; h++) heures.push(h);
  const col = compact ? 26 : 34;
  const chevauche = (j, m) => base.some(c => c.jour === j && min(c.debut) < min(m.fin) && min(m.debut) < min(c.fin));
  return (
    <div className="flex select-none" style={{ fontSize: compact ? 9.5 : 11 }}>
      <div className="relative flex-none" style={{ width: col, height: haut + 18 }}>
        {heures.map(h => (
          <div key={h} className="absolute right-1 text-slate-400 tabular-nums" style={{ top: 18 + (h * 60 - debutJour) * ppm - 6 }}>{compact ? h : `${h} h`}</div>))}
      </div>
      <div className="flex-1 grid min-w-0" style={{ gridTemplateColumns: `repeat(${jours.length}, minmax(0, 1fr))`, gap: compact ? 2 : 4 }}>
        {jours.map(j => {
          const blocs = base.filter(c => c.jour === j);
          // Les blocs proposés un jour : ceux qui ne chevauchent rien, les plus employés d'abord,
          // et jamais deux qui se chevauchent entre eux.
          const fantomes = [];
          if (mode === 'base') {
            const usage = m => base.filter(c => c.debut === m.debut && c.fin === m.fin).length;
            for (const m of [...modeles].sort((a, b) => usage(b) - usage(a))) {
              if (blocs.some(c => c.debut === m.debut && c.fin === m.fin) || chevauche(j, m)) continue;
              if (fantomes.some(f => min(f.debut) < min(m.fin) && min(m.debut) < min(f.fin))) continue;
              fantomes.push(m);
            }
          }
          return (
            <div key={j} className="min-w-0">
              <div className="h-[18px] text-center font-semibold text-slate-500">{NOMS_JOURS[j]}</div>
              <div className="relative rounded-[6px]" style={{ height: haut, background: 'color-mix(in srgb, var(--c-texte, #1B2B4B) 4%, transparent)' }}>
                {heures.map(h => <div key={h} className="absolute left-0 right-0 border-t border-slate-200/70" style={{ top: (h * 60 - debutJour) * ppm }} />)}
                {fantomes.map(m => (
                  <button key={`f${m.debut}`} type="button" disabled={desactive} onClick={() => onCase?.(j, m, 'ajouter')}
                    className="absolute left-[2px] right-[2px] rounded-[5px] border border-dashed border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600"
                    style={{ top: y(m.debut), height: Math.max(8, (min(m.fin) - min(m.debut)) * ppm - 2) }}
                    title={`${NOMS_JOURS[j]} ${m.debut}–${m.fin} : ajouter ce bloc`}>{!compact && '+'}</button>))}
                {blocs.map(c => {
                  const h = Math.max(8, (min(c.fin) - min(c.debut)) * ppm - 2);
                  if (mode === 'base') return (
                    <button key={c.debut} type="button" disabled={desactive} onClick={() => onCase?.(j, c, 'retirer')}
                      className="absolute left-[2px] right-[2px] rounded-[5px] text-white font-semibold leading-tight overflow-hidden"
                      style={{ top: y(c.debut), height: h, background: 'var(--c-principal, #16406A)' }}
                      title={`${NOMS_JOURS[j]} ${c.debut}–${c.fin} : retirer ce bloc`}>
                      {!compact && <span className="block tabular-nums">{c.debut}<br />{c.fin}</span>}</button>);
                  const v = valeur(j, c), st = DISPO[v], par = herite?.(j, c);
                  return (
                    <button key={c.debut} type="button" disabled={desactive} onClick={() => onCase?.(j, c)}
                      className="absolute left-[2px] right-[2px] rounded-[5px] text-white font-bold leading-tight overflow-hidden"
                      style={{ top: y(c.debut), height: h, background: par?.v === 0 ? 'var(--c-fond_indispo, #E2E8F0)' : st.fond, color: par?.v === 0 ? '#64748B' : '#fff', opacity: v === 1 && par?.v !== 0 ? 0.88 : 1, cursor: desactive ? 'default' : 'pointer' }}
                      title={`${NOMS_JOURS[j]} ${c.debut}–${c.fin} : ${st.nom}${par ? ` — déjà ${DISPO[par.v].nom} par ${par.par}` : ''}${desactive ? '' : ' — cliquer pour changer'}`}>
                      {compact ? st.signe : <>
                        <span className="block tabular-nums font-semibold text-[10px] opacity-90">{c.debut}</span>
                        <span className="block text-[13px]">{st.signe}</span>
                        {par && <span className="block text-[9.5px] font-semibold opacity-95">{par.v === 0 ? '✕' : '?'} {par.par}</span>}
                      </>}
                    </button>);
                })}
              </div>
            </div>);
        })}
      </div>
    </div>
  );
}

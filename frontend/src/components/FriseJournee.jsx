import { IconPhone, IconPencil } from '@tabler/icons-react';

/* LA JOURNÉE DE L'ÉQUIPE EN FRISE — sortie de TuileQuiEstLa (3.5.134) pour servir aussi la fenêtre « Contacter » de
   l'espace enseignant (Charles : « cela ne respecte pas la mise en page de Lucie, avec la ligne du temps de la journée »). */
export const LIEU_AGENDA = 'Selon l’agenda — joindre par téléphone';   // en réunion dehors : pas de lieu fixe, le téléphone fait foi
export const FRAISE = 'var(--c-refuse)';
export const telLien = t => `tel:${String(t || '').replace(/[^\d+]/g, '')}`;
/* Un numéro belge se lit par groupes : « +32 2 560 29 59 », « +32 475 12 34 56 ». Le reste tel quel. */
/** Un numéro belge qu'on ne sait pas découper est incomplet ou faux (« +325602960 » : un chiffre manque). */
export const telDouteux = t => {
  const n = String(t || '').replace(/[^\d+]/g, '');
  const m = n.match(/^(?:\+32|0032|0)(\d*)$/);
  return !!m && !/^(4\d{8}|\d{8})$/.test(m[1]);
};
export function telAffiche(t) {
  const brut = String(t || '').trim();
  let n = brut.replace(/[^\d+]/g, '');
  if (n.startsWith('+32')) n = n.slice(3); else if (n.startsWith('0032')) n = n.slice(4); else if (/^0\d{8,9}$/.test(n)) n = n.slice(1); else return brut;
  if (/^4\d{8}$/.test(n)) return `+32 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  if (/^[23]\d{7}$/.test(n)) return `+32 ${n[0]} ${n.slice(1, 4)} ${n.slice(4, 6)} ${n.slice(6)}`;
  if (/^\d{8}$/.test(n)) return `+32 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6)}`;
  return brut;
}

export function Appeler({ p }) {
  if (!p.telephone) return <span className="text-mention text-slate-400">pas de numéro affiché</span>;
  return (
    <a href={telLien(p.telephone)} className="bouton bouton-fort inline-flex items-center justify-center gap-1.5 whitespace-nowrap w-full tabular-nums" title={`Appeler ${p.nom}`}>
      <IconPhone size={15} /> {telAffiche(p.telephone)}
    </a>);
}

/* LA JOURNÉE EN FRISE (12 octobre 2026, Charles : « graphique horizontal avec ligne verte de dispo sur
   la journée, et la pause de midi »). Une ligne par personne, à l'échelle de l'heure : le vert dit
   quand on peut la trouver, le gris hachuré sa pause, le trait marine l'heure qu'il est. Un « J'arrive »
   hors horaire se dessine aussi ; après « Je pars », le reste de la journée s'éteint. */
export const enMin = h => { const [a, b] = String(h || '').split(':').map(Number); return a * 60 + (b || 0); };
export function FriseJournee({ journee, permanences = [], heure, modifier = null, autreJour = false }) {
  // Le nom : un lien vers son horaire et son numéro, pour qui peut les régler.
  // Un crayon VISIBLE à côté du nom (Charles : « je ne sais toujours pas changer les horaires ») :
  // un nom cliquable sans signe ne se devine pas.
  const Nom = ({ p, versFace }) => (modifier
    ? <span className="inline-flex items-center gap-1">
        <button type="button" className="text-sm font-bold hover:underline text-left" onClick={() => modifier(p.id, versFace)}>{p.nom}</button>
        <button type="button" className="text-slate-400 hover:text-slate-700" aria-label={versFace === 'permanences' ? 'Modifier la permanence' : 'Modifier son horaire et son numéro'}
          title={versFace === 'permanences' ? 'Modifier la permanence' : 'Modifier son horaire et son numéro'} onClick={() => modifier(p.id, versFace)}><IconPencil size={14} /></button>
      </span>
    : <b className="text-sm">{p.nom}</b>);
  const maintenant = enMin(heure);
  const bornes = [...journee.flatMap(p => [...p.plages.flatMap(h => [enMin(h.debut), enMin(h.fin)]), ...p.pointages.map(x => enMin(x.heure))]),
    ...permanences.flatMap(p => [enMin(p.debut), enMin(p.fin)])];
  const ici = autreJour ? [] : [maintenant];
  const debut = Math.floor(Math.min(7 * 60, ...ici, ...bornes) / 60) * 60;
  const fin = Math.ceil(Math.max(19 * 60, ...ici, ...bornes) / 60) * 60;
  const pct = m => `${((Math.min(fin, Math.max(debut, m)) - debut) / (fin - debut)) * 100}%`;
  const larg = (a, b) => `${((Math.min(fin, b) - Math.max(debut, a)) / (fin - debut)) * 100}%`;
  const heures = []; for (let h = debut; h <= fin; h += 60) heures.push(h);
  const VERT = 'var(--c-reussi)';
  const OR = 'var(--c-iip_or, #F9B619)';   // la permanence : l'or du logo, sans pause (Charles)
  const etat = p => {
    // Un autre jour : ses plages, pas un état du moment.
    if (autreJour) return p.plages.map(h => `${h.debut}–${h.fin}${h.lieu ? ` · ${h.lieu === LIEU_AGENDA ? 'selon son agenda' : h.lieu}` : ''}`).join(' · ');
    const ici = p.plages.find(h => h.debut <= heure && heure < h.fin);
    const lieu = ici?.lieu === LIEU_AGENDA ? 'selon son agenda — joindre par téléphone' : ici?.lieu;
    const pause = p.plages.find(h => h.pause_debut && h.pause_debut <= heure && heure < h.pause_fin);
    const dernier = p.pointages[p.pointages.length - 1];
    if (p.etat === 'parti') return `parti à ${dernier?.heure}`;
    if (p.etat === 'pause') return `en pause jusqu’à ${pause?.pause_fin}`;
    if (p.etat === 'la') return [dernier?.etat === 'la' ? `arrivé à ${dernier.heure}` : `là jusqu’à ${ici?.fin}`, lieu].filter(Boolean).join(' · ');
    if (p.etat === 'attendu') return `attendu à ${p.plages.find(h => h.debut > heure)?.debut}`;
    return `a fini à ${p.plages[p.plages.length - 1]?.fin}`;
  };
  return (
    <div className="space-y-1">
      {/* L'échelle des heures */}
      <div className="flex items-end gap-3">
        <span className="w-52 flex-none" />
        <div className="relative flex-1 h-4 text-mention text-slate-400 tabular-nums">
          {heures.map(h => <span key={h} className="absolute -translate-x-1/2" style={{ left: pct(h) }}>{h / 60}h</span>)}
        </div>
        <span className="w-44 flex-none" />
      </div>
      {journee.map(p => {
        const parti = p.etat === 'parti' ? enMin(p.pointages[p.pointages.length - 1]?.heure) : null;
        // « J'arrive » hors horaire : du pointage à maintenant (ou au départ).
        const arrivee = p.pointages.find(x => x.etat === 'la');
        const horsHoraire = arrivee && !p.plages.some(h => h.debut <= arrivee.heure && arrivee.heure < h.fin);
        const injoignable = p.plages.some(h => h.lieu === LIEU_AGENDA) && !p.telephone;
        return (
          <div key={p.id} className="flex items-center gap-3 py-1.5 border-t border-slate-100">
            <span className="w-52 flex-none min-w-0">
              <Nom p={p} /> <span className="text-second text-slate-500">{p.role}</span>
              <span className="block text-second text-slate-500 truncate" title={etat(p)}>{etat(p)}</span>
              {injoignable && <span className="block text-second" style={{ color: FRAISE }}>aucun numéro affiché : injoignable</span>}
            </span>
            <div className={`relative flex-1 h-5 rounded bg-slate-100 overflow-hidden ${!autreJour && (p.etat === 'parti' || p.etat === 'fini') ? 'opacity-60' : ''}`}>
              {heures.slice(1, -1).map(h => <span key={h} className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: pct(h) }} />)}
              {/* La pause est un TROU entre deux barres (Charles : « deux lignes, pas ce truc moche »). */}
              {p.plages.flatMap((h, k) => (h.pause_debut && h.pause_fin
                ? [[h.debut, h.pause_debut, `${h.debut}–${h.pause_debut}`], [h.pause_fin, h.fin, `${h.pause_fin}–${h.fin} (pause ${h.pause_debut}–${h.pause_fin})`]]
                : [[h.debut, h.fin, `${h.debut}–${h.fin}`]]).map(([a, b, t], j) => (
                  <span key={`${k}-${j}`} className="absolute top-1 bottom-1 rounded-sm" style={{ left: pct(enMin(a)), width: larg(enMin(a), enMin(b)), background: VERT }}
                    title={`${t}${h.lieu ? ` · ${h.lieu}` : ''}`} />)))}
              {horsHoraire && (
                <span className="absolute top-1 bottom-1 rounded-sm" style={{ left: pct(enMin(arrivee.heure)), width: larg(enMin(arrivee.heure), parti ?? maintenant), background: VERT, opacity: 0.6 }}
                  title={`Arrivé à ${arrivee.heure}, hors horaire`} />)}
              {parti != null && (
                <span className="absolute top-0 bottom-0 bg-slate-200/90" style={{ left: pct(parti), right: 0 }} title={`Parti à ${p.pointages[p.pointages.length - 1].heure}`} />)}
              {!autreJour && <span className="absolute top-0 bottom-0 w-0.5" style={{ left: pct(maintenant), background: 'var(--c-principal)' }} title={`Il est ${heure}`} />}
            </div>
            <span className="w-44 flex-none flex justify-end">
              {autreJour ? (p.telephone ? <Appeler p={p} /> : null)
                : p.etat === 'la' ? <Appeler p={p} /> : p.etat === 'pause' ? <span className="text-mention text-slate-500">en pause</span> : null}
            </span>
          </div>);
      })}
      {/* LA PERMANENCE EN DERNIER (Charles : « en jaune or IIP, sans pause, après — que l'on voie que
          c'est une permanence ») : sa ligne porte ses secours, chacun avec son numéro. */}
      {permanences.map(p => (
        <div key={p.id} className="flex items-center gap-3 py-1.5 border-t border-slate-100">
          <span className="w-52 flex-none min-w-0">
            <Nom p={p} versFace="permanences" /> <span className="text-second text-slate-500">de permanence</span>
            <span className="block text-second text-slate-500">{p.debut}–{p.fin}{p.en_cours && !autreJour ? ' · en ce moment' : ''}{p.note ? ` · ${p.note}` : ''}</span>
            {p.secours.map((x, k) => (
              <span key={x.id} className="block text-second">
                <span className="text-slate-500">secours {k + 1} :</span> <b>{x.nom}</b>{' '}
                {x.telephone ? <a href={telLien(x.telephone)} className="underline whitespace-nowrap" title={`Appeler ${x.nom}`}><IconPhone size={12} className="inline -mt-0.5" /> {telAffiche(x.telephone)}</a>
                  : <span style={{ color: FRAISE }}>pas de numéro affiché</span>}
              </span>))}
          </span>
          <div className={`relative flex-1 h-5 rounded bg-slate-100 overflow-hidden ${autreJour || p.en_cours || enMin(p.debut) > maintenant ? '' : 'opacity-60'}`}>
            {heures.slice(1, -1).map(h => <span key={h} className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: pct(h) }} />)}
            <span className="absolute top-1 bottom-1 rounded-sm" style={{ left: pct(enMin(p.debut)), width: larg(enMin(p.debut), enMin(p.fin)), background: OR }}
              title={`De permanence ${p.debut}–${p.fin}`} />
            {!autreJour && <span className="absolute top-0 bottom-0 w-0.5" style={{ left: pct(maintenant), background: 'var(--c-principal)' }} title={`Il est ${heure}`} />}
          </div>
          <span className="w-44 flex-none flex justify-end">{p.en_cours || (autreJour && p.telephone) ? <Appeler p={p} /> : null}</span>
        </div>))}
      <p className="text-mention text-slate-400 pt-1 flex flex-wrap gap-x-4">
        <span><span className="inline-block w-3 h-2 rounded-sm align-middle mr-1" style={{ background: VERT }} />disponible</span>
        <span>le blanc entre deux barres : la pause</span>
        {permanences.length > 0 && <span><span className="inline-block w-3 h-2 rounded-sm align-middle mr-1" style={{ background: OR }} />permanence</span>}
        {!autreJour && <span><span className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: 'var(--c-principal)' }} />maintenant ({heure})</span>}
      </p>
    </div>);
}


/* (CS) LA JOURNÉE EN TUILES (3.5.738, Charles, 26 novembre 2026 : « je ne trouve pas cette fenêtre jolie ; ce que je veux, c'est
   l'horaire en tuiles, mais de la journée, avec tous les détails, et la possibilité de faire des ajustements de profs ; il faut
   penser visuel »). Un clic sur le jour de l'Horaire de la semaine : la journée à l'échelle des heures, une colonne par séance en
   parallèle, chaque tuile avec cours, activité, groupe, professeur, local, heures et ce qui cloche. Sur la tuile même : « ⇄ » prend
   le professeur d'une attribution du groupe et relie la séance ; un clic ailleurs sur la tuile ouvre la séance (tous les réglages). */
import { IconAlertTriangle, IconArrowsLeftRight, IconClock, IconLink, IconMapPin, IconUser } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';

const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const lisible = n => `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}`;
const gnet = g => String(g || '').replace(/\s/g, '').toUpperCase().replace(/^\d+(?=[A-Z])/, '');
const PX = 22;            // pixels par quart d'heure : 1 h = 88 px, un bloc de 3 h se lit en entier
const RAISONS = { professeur: 'professeur déjà pris', local: 'local déjà occupé', classe: 'la classe a déjà cours' };

function activite(s) {
  if (s.attribution?.activite) return s.attribution.activite;
  const g = gnet(s.sous_groupe);
  const c = (s.attributions || []).filter(a => (g ? gnet(a.code) === g : String(a.code || '').toUpperCase() === 'TS') && (!s.professeur_id || a.professeur_id === s.professeur_id));
  if (c.length === 1 && c[0].activite) return c[0].activite;
  return (s.matiere && s.matiere !== s.cours_nom ? s.matiere : '').trim();
}
const nomProf = s => [s.prof_nom, s.prof_prenom].filter(Boolean).join(' ') || s.professeur_texte || '';

/** Les attributions qui conviennent au groupe de la séance (celles que « ⇄ » propose). */
function duGroupe(s) {
  const g = gnet(s.sous_groupe);
  return (s.attributions || []).filter(a => (g ? gnet(a.code) === g : String(a.code || '').toUpperCase() === 'TS'));
}

/** Les colonnes : les séances qui se chevauchent prennent chacune la première colonne libre et se partagent la largeur. */
function placer(seances) {
  const l = [...seances].sort((a, b) => hm(a.heure_debut) - hm(b.heure_debut) || String(a.cours_code).localeCompare(String(b.cours_code)));
  const place = new Map();
  for (let i = 0; i < l.length;) {
    let fin = hm(l[i].heure_fin), k = i + 1;
    while (k < l.length && hm(l[k].heure_debut) < fin) { fin = Math.max(fin, hm(l[k].heure_fin)); k++; }
    const paquet = l.slice(i, k), fins = [];
    for (const x of paquet) {
      let c = fins.findIndex(f => f <= hm(x.heure_debut));
      if (c < 0) { c = fins.length; fins.push(0); }
      fins[c] = hm(x.heure_fin); place.set(x.id, { col: c });
    }
    for (const x of paquet) place.get(x.id).cols = fins.length;
    i = k;
  }
  return { l, place };
}

function Tuile({ s, pl, h0, roleEcrit, vue, onOuvrir, onAligner }) {
  const debut = hm(s.heure_debut), fin = hm(s.heure_fin);
  const c = s.annule ? '#9AA3B2' : teinteCours(s.cours_code);
  const act = activite(s);
  const prof = nomProf(s);
  const at = s.attribution;
  const candidats = duGroupe(s);
  // Le professeur de la séance n'est pas celui des attributions de son groupe : c'est là qu'on ajuste.
  const horsAttribution = candidats.length > 0 && !candidats.some(a => Number(a.professeur_id || 0) === Number(s.professeur_id || 0));
  const aligner = roleEcrit && !s.annule ? candidats.filter(a => !(at && at.id === a.id && Number(a.professeur_id || 0) === Number(s.professeur_id || 0))) : [];
  const gr = s.sous_groupe || (s.groupe_nom && s.groupe_nom !== 'A' ? s.groupe_nom : null);
  const etroite = pl.cols >= 4;
  return (
    <div role="button" tabIndex={0} onClick={() => onOuvrir(s)} onKeyDown={e => { if (e.key === 'Enter') onOuvrir(s); }}
      className="absolute rounded-r-carte overflow-hidden cursor-pointer transition-shadow hover:shadow-flottant focus:outline-none focus:ring-2 focus:ring-[color:var(--c-principal)]"
      style={{ top: (debut - h0) / 15 * PX + 1, height: (fin - debut) / 15 * PX - 3,
        left: `calc(${pl.col * 100 / pl.cols}% + 3px)`, width: `calc(${100 / pl.cols}% - 6px)`,
        ...(s.annule ? { borderLeft: `5px solid ${c}`, background: 'repeating-linear-gradient(45deg,#F4F5F7 0 6px,#fff 6px 12px)' }
          : { ...styleTuileCours(s.cours_code, { fond: 14 }), borderLeftWidth: 5 }),
        outline: s.conflits?.length ? '2px solid var(--c-refuse)' : 'none', outlineOffset: -2 }}>
      <div className="h-full flex flex-col gap-1 px-3 py-2 min-w-0">
        {/* Les heures et le groupe, en tête */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1 text-second font-semibold text-slate-600 whitespace-nowrap">
            <IconClock size={14} className="text-slate-400" />{lisible(debut)} – {lisible(fin)}</span>
          <span className="flex-1" />
          {gr && <span className="flex-none inline-flex items-center justify-center min-w-[30px] h-[24px] px-2 rounded-pastille bg-white font-bold text-second"
            style={{ border: `2px solid ${c}`, color: 'var(--c-principal, #1B2B4B)' }} title="Groupe">{gr}</span>}
        </div>
        {/* Le cours */}
        <div className={`font-semibold leading-snug min-w-0 ${s.annule ? 'line-through text-slate-400' : 'text-[color:var(--c-principal,_#1B2B4B)]'}`}
          style={{ display: '-webkit-box', WebkitLineClamp: etroite ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          title={`${s.cours_code} ${s.cours_nom || s.matiere || ''}`}>
          <span className="font-bold">{s.cours_code}</span> {s.cours_nom || s.matiere || ''}
        </div>
        {act && <div className="text-second italic text-slate-600 truncate" title={act}>{act}</div>}
        {vue !== 'classe' && s.classe && <div className="text-mention text-slate-500 truncate">{s.classe}</div>}
        {/* Le professeur et le local */}
        <div className="mt-auto space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5 text-second min-w-0" style={horsAttribution ? { color: 'var(--c-attente)' } : undefined}>
            <IconUser size={14} className="flex-none opacity-60" />
            <span className={`truncate ${prof ? 'font-medium' : 'italic opacity-70'}`}>{s.annule ? 'Séance annulée' : prof || 'professeur à attribuer'}</span>
            {horsAttribution && !s.annule && <IconAlertTriangle size={14} className="flex-none" title="Pas le professeur des attributions de ce groupe" />}
          </div>
          <div className="flex items-center gap-1.5 text-second text-slate-500 min-w-0">
            <IconMapPin size={14} className="flex-none opacity-60" />
            <span className={`truncate ${s.local_texte ? '' : 'italic'}`}>{s.local_texte || 'local à préciser'}</span>
          </div>
          {/* Ce qui cloche, et les ajustements en un clic */}
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {!at && !s.annule && <span className="inline-flex items-center gap-1 rounded-pastille px-1.5 py-0.5 text-mention font-semibold text-white"
              style={{ background: 'var(--c-attente)' }}><IconLink size={12} /> non reliée</span>}
            {at && <span className="inline-flex items-center gap-1 rounded-pastille px-1.5 py-0.5 text-mention text-slate-500 bg-white/70"
              title={`Attribution ${at.code || 'tous'} · ${at.prof || ''}`}><IconLink size={12} /> attribution {at.code || 'tous'}</span>}
            {(s.conflits || []).map(k => <span key={k} className="rounded-pastille px-1.5 py-0.5 text-mention font-semibold text-white"
              style={{ background: 'var(--c-refuse)' }}>{RAISONS[k] || k}</span>)}
            {aligner.map(a => (
              <button key={a.id} type="button" className="inline-flex items-center gap-1 rounded-pastille px-2 py-0.5 text-mention font-semibold bg-white border hover:bg-slate-50"
                style={{ borderColor: c, color: 'var(--c-principal, #1B2B4B)' }}
                title={`Prendre ${a.prof} (attribution ${a.code || 'tous'}${a.activite ? ` · ${a.activite}` : ''}) et relier la séance`}
                onClick={e => { e.stopPropagation(); onAligner(s, a); }}>
                <IconArrowsLeftRight size={12} /> {Number(a.professeur_id || 0) === Number(s.professeur_id || 0)
                  ? (aligner.length > 1 ? `Relier ${a.code || 'tous'}` : 'Relier') : String(a.prof || '').split(' ')[0]}
              </button>
            ))}
          </div>
          {s.commentaire && <div className="text-mention text-slate-500 truncate" title={s.commentaire}>« {s.commentaire} »</div>}
        </div>
      </div>
    </div>
  );
}

export default function JourneeHoraire({ titre, sous, seances, roleEcrit, vue, onFermer, onOuvrir, onAligner, onRelierTout }) {
  const { l, place } = placer(seances);
  const h0 = l.length ? Math.floor(Math.min(...l.map(s => hm(s.heure_debut))) / 60) * 60 : 8 * 60;
  const h1 = l.length ? Math.ceil(Math.max(...l.map(s => hm(s.heure_fin))) / 60) * 60 : 18 * 60;
  const heures = []; for (let m = h0; m <= h1; m += 60) heures.push(m);
  const profs = new Set(l.filter(s => !s.annule && s.professeur_id).map(s => s.professeur_id)).size;
  const nonReliees = l.filter(s => !s.annule && !s.attribution).length;
  const conflits = l.filter(s => s.conflits?.length).length;
  const ajuster = l.filter(s => !s.annule && duGroupe(s).length && !duGroupe(s).some(a => Number(a.professeur_id || 0) === Number(s.professeur_id || 0))).length;
  const Chiffre = ({ n, txt, etat }) => (
    <span className="inline-flex items-baseline gap-1.5 px-3 py-1 rounded-pastille bg-white border border-slate-200 text-second">
      <b className="text-base" style={etat && n ? { color: `var(--c-${etat})` } : undefined}>{n}</b><span className="text-slate-500">{txt}</span></span>
  );
  return (
    <Fenetre titre={titre} sous={sous} large="pleine" onFermer={onFermer}
      pied={<><span className="text-xs text-slate-500">Cliquez une tuile pour ouvrir la séance{roleEcrit ? ' et tout régler ; ⇄ prend le professeur d’une attribution du groupe et relie la séance' : ''}.</span>
        <span className="flex-1" /><button className="bouton" onClick={onFermer}>Fermer</button></>}>
      <div className="flex flex-wrap gap-2 mb-3">
        <Chiffre n={l.length} txt={l.length > 1 ? 'séances' : 'séance'} />
        <Chiffre n={profs} txt={profs > 1 ? 'professeurs' : 'professeur'} />
        <Chiffre n={nonReliees} txt="non reliées" etat="attente" />
        <Chiffre n={ajuster} txt="à ajuster (professeur)" etat="attente" />
        <Chiffre n={conflits} txt={conflits > 1 ? 'conflits' : 'conflit'} etat="refuse" />
        {onRelierTout && nonReliees > 0 && <button type="button" className="bouton inline-flex items-center gap-1.5 ml-auto" onClick={onRelierTout}>
          <IconArrowsLeftRight size={15} /> Relier automatiquement…</button>}
      </div>
      {!l.length ? <p className="text-slate-500 text-sm py-8 text-center">Aucune séance ce jour-là.</p> : (
        <div className="flex">
          {/* L'axe des heures */}
          <div className="relative flex-none w-14" style={{ height: (h1 - h0) / 15 * PX }}>
            {heures.map(m => <div key={m} className="absolute right-2 -translate-y-1/2 text-second font-semibold text-slate-400" style={{ top: (m - h0) / 15 * PX }}>{lisible(m).replace('h00', 'h')}</div>)}
          </div>
          {/* La journée */}
          <div className="relative flex-1 min-w-0 border-l border-slate-200" style={{ height: (h1 - h0) / 15 * PX }}>
            {heures.map(m => <div key={m} className="absolute left-0 right-0 border-t border-slate-200" style={{ top: (m - h0) / 15 * PX }} />)}
            {heures.slice(0, -1).map(m => <div key={`d${m}`} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ top: (m + 30 - h0) / 15 * PX }} />)}
            {l.map(s => <Tuile key={s.id} s={s} pl={place.get(s.id)} h0={h0} roleEcrit={roleEcrit} vue={vue} onOuvrir={onOuvrir} onAligner={onAligner} />)}
          </div>
        </div>
      )}
    </Fenetre>
  );
}

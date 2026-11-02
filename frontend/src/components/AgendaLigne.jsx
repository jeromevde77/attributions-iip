/* L'AGENDA DE L'ÉCOLE, PEINT SUR LA LIGNE DU TEMPS (3.5.058, Charles, 2 novembre 2026 : « j'adore ta ligne du temps ; je
 * veux peindre les moments chauds et placer les choses importantes depuis cette ligne, et un bouton qui permet de saisir en
 * manuel avec un mini calendrier »). L'année en 52 colonnes : les mois, les grands moments, la chaleur, le calendrier des
 * cours, la fermeture de l'école, les sections, le besoin de personnel. On choisit un PINCEAU, on touche la première
 * semaine puis la dernière : c'est posé. « Saisir » ouvre le même geste avec un mini calendrier. Serveur :
 * lib/agendaEcole.js (/api/agenda-ecole), et pour la chaleur et les moments lib/ligneTemps.js (/api/temps-travail).
 * Servi à deux endroits — Organisation → Agenda de l'école, et en tête du Temps de travail — : un seul agenda. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconBrush, IconCalendarPlus, IconChevronLeft, IconChevronRight, IconX, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { informer, saisir, demander } from '../lib/dialogue.jsx';

const plus = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const lundiDe = d => plus(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const fmt = d => `${d.slice(8)}/${d.slice(5, 7)}`;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const HACHURE = 'repeating-linear-gradient(135deg, var(--c-fond_indispo, #EEF0F4) 0 4px, transparent 4px 8px)';
export const COL_NOM = 'minmax(7.5rem, 10rem)';
const COULEUR_COURS = { cours: 'var(--c-filet, #E2E8F0)', vacances: HACHURE, ev1: 'var(--c-principal)', ev2: 'var(--c-principal)', stage: 'var(--c-accent)' };
const CHALEUR = { chaud: 'var(--c-attente)', creux: 'var(--c-disponible)' };
/* LA COULEUR DIT LA NATURE (3.5.062) — des jetons de Configuration, jamais une couleur en dur. */
/* Les couleurs des séries de graphiques (Configuration → Thèmes et couleurs), proches du classeur de l'école : réunions en
   rose-rouge comme « Coord », échéances en or, horaires en cyan, conseils en vert. */
export const COULEUR_NATURE = { evenement: 'var(--c-serie_1, #19537E)', echeance: 'var(--c-serie_3, #F9B619)', reunion: 'var(--c-serie_6, #D14F8A)',
  conseil: 'var(--c-serie_5, #4FA64A)', horaires: 'var(--c-serie_2, #05B7E6)' };
export const TEXTE_NATURE = { echeance: 'var(--c-texte, #16406A)' };

const appel = (url, annee, o = {}) => fetch(`${url}${url.includes('?') ? '&' : '?'}annee=${annee}`, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });

/* LES PINCEAUX : ce qu'on peint, sur quelle rangée, avec quelles valeurs. */
const PINCEAUX = {
  chaleur: { mot: 'Période', rangee: 'chaleur', valeurs: [['chaud', 'Tension'], ['creux', 'Calme'], ['normal', 'Normale'], ['calcul', 'Calcul de Lucie']], direction: true },
  moment: { mot: 'Grand moment', rangee: 'moments', valeurs: null, direction: true },
  fermeture: { mot: 'École fermée', rangee: 'fermeture', valeurs: [['totale', 'Fermée'], ['partielle', 'En partie'], ['ouvert', 'Ouverte']], direction: true },
  cours: { mot: 'Cours', rangee: 'cours', valeurs: [['cours', 'Cours'], ['vacances', 'Vacances'], ['ev1', 'Évaluations 1'], ['ev2', 'Évaluations 2'], ['stage', 'Stage']], direction: true },
  section: { mot: 'Section', rangee: 'section', valeurs: [['active', 'Active'], ['inactive', 'Sans cours'], ['calcul', 'Selon l’horaire']], direction: false },
};

export function useAgenda(annee) {
  const [ag, setAg] = useState(null);
  const recharger = () => appel('/api/agenda-ecole', annee).then(setAg).catch(e => setAg({ erreur: e.message }));
  useEffect(() => { if (annee) recharger(); }, [annee]);
  return [ag, recharger];
}

/** La grille de l'année : 52 colonnes, un nom à gauche, une colonne libre à droite. */
export function GrilleAnnee({ children, className = '', droite = '5.5rem' }) {
  return <div className={`grid items-stretch ${className}`} style={{ gridTemplateColumns: `${COL_NOM} repeat(52, minmax(0, 1fr)) ${droite}` }}>{children}</div>;
}

/**
 * La ligne du temps de l'agenda. `apres` : des rangées à poser sous l'agenda (les personnes du temps de travail).
 * `selSemaine` / `onSemaine` : la semaine choisie quand aucun pinceau n'est pris.
 */
export default function AgendaLigne({ annee, ag, recharger, apres = null, selSemaine = null, onSemaine = null, droite = '5.5rem', onChange = null }) {
  const [pinceau, setPinceau] = useState(null);         // { cle, valeur, section? }
  const [debut, setDebut] = useState(null);             // première semaine touchée
  const [ouvertes, setOuvertes] = useState(false);      // sections dépliées
  const [saisie, setSaisie] = useState(false);
  const [occupe, setOccupe] = useState(false);
  /* GLISSER POUR CHOISIR UNE ZONE (3.5.061, Charles : « sélectionner à la souris une zone et mettre tension, examens ou
     autre »). On appuie sur une semaine, on glisse, on lâche : un menu propose quoi y mettre. Un simple clic garde son
     effet. Pointer Events : la souris comme le doigt. */
  const glisse = useRef({ actif: false, a: null, x0: 0, bouge: false, section: null, ignorer: false });
  const surface = useRef(null);
  const [zone, setZone] = useState(null);                // { a, b, section }
  const [menu, setMenu] = useState(null);                // { x, y }
  const [bande, setBande] = useState(null);              // { left, width } — le surlignage
  useLayoutEffect(() => {
    if (!zone || !surface.current) { setBande(null); return; }
    const [x, y] = zone.a <= zone.b ? [zone.a, zone.b] : [zone.b, zone.a];
    const ea = surface.current.querySelector(`[data-lundi="${x}"]`), eb = surface.current.querySelector(`[data-lundi="${y}"]`);
    if (!ea || !eb) return;
    const r0 = surface.current.getBoundingClientRect(), ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    setBande({ left: ra.left - r0.left, width: rb.right - ra.left });
  }, [zone]);
  if (!ag) return <div className="px-4 py-3 text-sm text-slate-500">Chargement de l’agenda…</div>;
  if (ag.erreur) return <div className="px-4 py-3 text-sm text-red-700">{ag.erreur}</div>;
  const peutEtab = ag.peut?.etablissement, peutSections = ag.peut?.sections || [];
  const peutPeindre = peutEtab || peutSections.length > 0;
  const ch = new Map((ag.chaleur || []).map(c => [c.lundi, c]));
  const mois = [];
  ag.semaines.forEach((l, i) => { const m = Number(plus(l, 3).slice(5, 7)); if (!mois.length || mois[mois.length - 1].m !== m) mois.push({ m, i }); });

  const apresGeste = () => { recharger(); onChange?.(); };
  /* POSER : la plage de semaines [a, b] avec le pinceau. */
  const poser = async (a, b, p = pinceau) => {
    const [x, y] = a <= b ? [a, b] : [b, a];
    const lundis = ag.semaines.filter(l => l >= x && l <= y);
    setOccupe(true);
    try {
      if (p.cle === 'chaleur') {
        for (const l of lundis) await appel(`/api/temps-travail/chaleur/${l}`, annee, { method: 'PUT', body: JSON.stringify({ niveau: p.valeur }) });
      } else if (p.cle === 'moment') {
        const titre = await saisir({ message: `Grand moment du ${fmt(x)} au ${fmt(plus(y, 4))} — son nom :`, obligatoire: true, valeur: p.titre || '' });
        if (!titre) return;
        await appel('/api/agenda-ecole/moments', annee, { method: 'POST', body: JSON.stringify({ type: p.valeur || 'autre', titre, du: p.du || x, au: p.au || plus(y, 4) }) });
      } else if (p.cle === 'fermeture') {
        let libelle = null;
        if (p.valeur !== 'ouvert') {
          libelle = await saisir({ message: `Fermeture ${p.valeur === 'totale' ? 'totale' : 'partielle'} du ${fmt(x)} au ${fmt(plus(y, 4))} — son nom (Noël, été, Carnaval…) :`, obligatoire: true });
          if (!libelle) return;
        }
        await appel('/api/agenda-ecole/fermeture', annee, { method: 'PUT', body: JSON.stringify({ lundis, fermeture: p.valeur === 'ouvert' ? null : p.valeur, libelle }) });
      } else if (p.cle === 'cours') {
        const r = await appel('/api/agenda-ecole/cours', annee, { method: 'PUT', body: JSON.stringify({ lundis, type: p.valeur }) });
        if (r.ignores?.length) informer({ message: `${r.ignores.length} semaine(s) hors du calendrier des cours de l’année : laissées telles quelles.` });
      } else if (p.cle === 'section') {
        await appel('/api/agenda-ecole/section', annee, { method: 'PUT', body: JSON.stringify({ section: p.section, lundis, etat: p.valeur === 'calcul' ? null : p.valeur }) });
      }
      apresGeste();
    } catch (e) { informer({ message: e.message }); } finally { setOccupe(false); setDebut(null); }
  };
  const toucher = (rangee, l, section = null) => {
    if (glisse.current.ignorer) { glisse.current.ignorer = false; return; }
    if (!pinceau || PINCEAUX[pinceau.cle].rangee !== rangee || (rangee === 'section' && pinceau.section !== section)) { if (!pinceau) onSemaine?.(l); return; }
    if (!debut) { setDebut(l); return; }
    poser(debut, l);
  };
  const enCours = (rangee, l, section = null) => pinceau && PINCEAUX[pinceau.cle].rangee === rangee && (rangee !== 'section' || pinceau.section === section)
    && debut && l === debut;
  const cible = (rangee, section = null) => pinceau && PINCEAUX[pinceau.cle].rangee === rangee && (rangee !== 'section' || pinceau.section === section);
  const anneau = (rangee, l, section) => (enCours(rangee, l, section) ? 'ring-2 ring-[var(--c-accent)]' : selSemaine === l && !pinceau ? 'ring-2 ring-[var(--c-principal)]' : '');

  const lundiSous = e => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-lundi]');
  const appui = e => {
    if (pinceau || !peutPeindre || e.button > 0) return;
    const t = e.target.closest?.('[data-lundi]'); if (!t) return;
    glisse.current = { actif: true, a: t.dataset.lundi, x0: e.clientX, bouge: false, section: t.dataset.section || null, ignorer: false };
  };
  const bouge = e => {
    const g = glisse.current; if (!g.actif) return;
    if (!g.bouge && Math.abs(e.clientX - g.x0) < 6) return;
    const t = lundiSous(e); if (!t) return;
    g.bouge = true; setMenu(null);
    setZone({ a: g.a, b: t.dataset.lundi, section: g.section });
  };
  const lache = e => {
    const g = glisse.current; if (!g.actif) return;
    g.actif = false;
    if (!g.bouge) return;                                  // un clic : la case s'en occupe
    g.ignorer = true; setTimeout(() => { glisse.current.ignorer = false; }, 0);
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 300), y: Math.min(e.clientY + 10, window.innerHeight - 380) });
  };
  const fermerMenu = () => { setMenu(null); setZone(null); };
  const appliquer = async p => { const z = zone; fermerMenu(); await poser(z.a, z.b, p); };

  const retirerJour = async j => {
    if (!(await demander(`Rouvrir le ${fmt(j.date)} (${j.libelle}) ?`))) return;
    try { await appel(`/api/agenda-ecole/jour-ferme/${j.date}`, annee, { method: 'DELETE' }); apresGeste(); } catch (e) { informer({ message: e.message }); }
  };
  const retirerMoment = async m => {
    if (!(await demander(`Retirer « ${m.titre} » ?`))) return;
    try { await appel(`/api/agenda-ecole/moments/${m.id}`, annee, { method: 'DELETE' }); apresGeste(); } catch (e) { informer({ message: e.message }); }
  };

  return (
    <div className="space-y-1">
      {peutPeindre && (
        <BarrePinceaux pinceau={pinceau} setPinceau={p => { setPinceau(p); setDebut(null); }} peutEtab={peutEtab} sections={ag.sections}
          peutSections={peutSections} types={ag.types_moment} debut={debut} occupe={occupe} onSaisie={() => setSaisie(true)}
          onOuvrirSections={() => setOuvertes(true)} />
      )}
      <div className="px-3 py-2 overflow-x-auto">
        <div ref={surface} className={`relative min-w-[760px] space-y-1 ${peutPeindre && !pinceau ? 'select-none' : ''}`} style={{ touchAction: 'pan-y' }}
          onPointerDown={appui} onPointerMove={bouge} onPointerUp={lache} onPointerLeave={() => { if (glisse.current.actif && glisse.current.bouge) { glisse.current.actif = false; setMenu({ x: 200, y: 200 }); } }}>
          {bande && <div className="absolute top-0 bottom-0 pointer-events-none rounded-[4px] z-10" style={{ left: bande.left, width: bande.width, background: 'color-mix(in srgb, var(--c-accent) 18%, transparent)', outline: '2px solid var(--c-accent)' }} />}
          <GrilleAnnee droite={droite}>
            <div />
            {ag.semaines.map((l, i) => { const mm = mois.find(x => x.i === i); return <div key={l} className="text-mention text-slate-500 whitespace-nowrap overflow-visible">{mm ? MOIS[mm.m - 1] : ''}</div>; })}
            <div />
          </GrilleAnnee>
          <RangeeMoments ag={ag} droite={droite} cible={cible('moments')} toucher={l => toucher('moments', l)} enCours={l => enCours('moments', l)} onRetirer={peutEtab ? retirerMoment : null} />
          <GrilleAnnee droite={droite}>
            <div className="text-second text-slate-600 pr-2 self-center">Période</div>
            {ag.semaines.map(l => { const c = ch.get(l); const f = c?.niveau !== 'normal' ? CHALEUR[c?.niveau] : null;
              return <button key={l} data-lundi={l} type="button" onClick={() => toucher('chaleur', l)} title={`${fmt(l)} · ${c?.niveau === 'chaud' ? 'tension' : c?.niveau === 'creux' ? 'calme' : 'normale'}${c?.force ? ' (fixée)' : ''}${c?.raisons?.length ? ' — ' + c.raisons.join(', ') : ''}`}
                className={`h-4 mx-px rounded-[3px] ${anneau('chaleur', l)} ${cible('chaleur') ? 'cursor-crosshair' : ''}`}
                style={{ background: c?.conge ? HACHURE : f || 'var(--c-filet, #E2E8F0)', opacity: f ? 1 : 0.6, outline: c?.force ? '1px dashed var(--c-texte)' : 'none' }} />; })}
            <div />
          </GrilleAnnee>
          <GrilleAnnee droite={droite}>
            <div className="text-second text-slate-600 pr-2 self-center">Cours</div>
            {ag.semaines.map((l, i) => { const c = ag.cours[i];
              return <button key={l} data-lundi={l} type="button" onClick={() => toucher('cours', l)} title={c ? `${fmt(l)} · ${ag.types_cours[c.type] || c.type}${c.label ? ' — ' + c.label : ''}` : `${fmt(l)} · hors du calendrier des cours`}
                className={`h-3 mx-px rounded-[2px] ${anneau('cours', l)} ${cible('cours') ? 'cursor-crosshair' : ''}`}
                style={{ background: c ? COULEUR_COURS[c.type] || 'var(--c-filet, #E2E8F0)' : 'transparent', opacity: c ? (c.type === 'ev1' || c.type === 'ev2' ? 0.55 : 1) : 1, border: c ? 'none' : '1px dotted var(--c-filet, #E2E8F0)' }} />; })}
            <div />
          </GrilleAnnee>
          <GrilleAnnee droite={droite}>
            <div className="text-second text-slate-600 pr-2 self-center">École</div>
            {ag.semaines.map((l, i) => { const f = ag.fermetures[i]; const jf = ag.jours_fermes.filter(j => lundiDe(j.date) === l);
              return <button key={l} data-lundi={l} type="button" onClick={() => toucher('fermeture', l)}
                title={`${fmt(l)} · ${f ? `${f.fermeture === 'totale' ? 'fermée' : 'en partie fermée'} — ${f.libelle || ''} (${f.par || ''})` : 'ouverte'}${jf.length ? ' · ' + jf.map(j => `${fmt(j.date)} ${j.libelle}`).join(', ') : ''}`}
                className={`relative h-5 mx-px rounded-[3px] ${anneau('fermeture', l)} ${cible('fermeture') ? 'cursor-crosshair' : ''}`}
                style={{ background: f?.fermeture === 'totale' ? 'var(--c-texte)' : f?.fermeture === 'partielle' ? 'color-mix(in srgb, var(--c-texte) 35%, transparent)' : 'color-mix(in srgb, var(--c-filet, #E2E8F0) 60%, transparent)' }}>
                {jf.length > 0 && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-refuse)' }} />}
              </button>; })}
            <div />
          </GrilleAnnee>
          {ag.sections.length > 0 && (
            <GrilleAnnee droite={droite}>
              <button type="button" className="text-second text-slate-600 pr-2 self-center text-left inline-flex items-center gap-0.5" onClick={() => setOuvertes(o => !o)}>
                Sections {ouvertes ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}</button>
              {ag.besoin.map(b => <div key={b.lundi} title={`${fmt(b.lundi)} · ${b.sections_actives} section(s) active(s), ${b.seances} séance(s)`}
                className="text-mention text-center tabular-nums text-slate-500 self-center">{b.sections_actives || ''}</div>)}
              <div />
            </GrilleAnnee>)}
          {ouvertes && ag.sections.map(s => (
            <GrilleAnnee key={s.section} droite={droite}>
              <div className="text-mention text-slate-600 pr-2 self-center truncate pl-2" title={s.section}>{s.section}</div>
              {s.semaines.map(x => (
                <button key={x.lundi} data-lundi={x.lundi} data-section={s.section} type="button" onClick={() => toucher('section', x.lundi, s.section)}
                  title={`${s.section} · ${fmt(x.lundi)} · ${x.seances} séance(s)${x.force ? ` — forcée ${x.force === 'active' ? 'active' : 'sans cours'}` : ''}`}
                  className={`h-2.5 mx-px rounded-[2px] ${anneau('section', x.lundi, s.section)} ${cible('section', s.section) ? 'cursor-crosshair' : ''}`}
                  style={{ background: x.actif ? 'var(--c-principal)' : 'transparent', opacity: x.actif ? (x.deduit ? 0.75 : 0.4) : 1, outline: x.force ? '1px dashed var(--c-texte)' : 'none', border: x.actif ? 'none' : '1px solid var(--c-filet, #E2E8F0)' }} />))}
              <div />
            </GrilleAnnee>))}
          {apres}
        </div>
      </div>
      <Legende />
      {(ag.jours_fermes.length > 0 || ag.moments.some(m => !m.serie_id)) && (
        <div className="px-4 py-2 border-t text-second space-y-1">
          {ag.moments.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="text-slate-500">Grands moments :</span>
            {ag.moments.filter(m => m.type !== 'deliberations' && !m.serie_id).map((m, i) => <span key={i} className="whitespace-nowrap inline-flex items-center gap-1"><b>{m.titre}</b> <span className="text-slate-500">{fmt(m.du)}{m.au !== m.du ? `→${fmt(m.au)}` : ''}</span>
              {peutEtab && m.id && <button className="text-slate-400 hover:text-[var(--c-refuse)]" onClick={() => retirerMoment(m)} aria-label="Retirer"><IconX size={11} /></button>}</span>)}
            {ag.moments.some(m => m.type === 'deliberations') && <span className="text-slate-500">· {ag.moments.filter(m => m.type === 'deliberations').length} semaine(s) de délibérations (lues des séances)</span>}</div>}
          {ag.jours_fermes.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-1"><span className="text-slate-500">Jours fermés par l’école :</span>
            {ag.jours_fermes.map(j => <span key={j.date} className="whitespace-nowrap inline-flex items-center gap-1" title={`Posé par ${j.par} le ${String(j.le).slice(0, 10)}`}><b>{fmt(j.date)}</b> {j.libelle}
              {peutEtab && <button className="text-slate-400 hover:text-[var(--c-refuse)]" onClick={() => retirerJour(j)} aria-label="Rouvrir"><IconX size={11} /></button>}</span>)}</div>}
        </div>)}
      {menu && zone && <MenuZone zone={zone} pos={menu} peutEtab={peutEtab} peutSections={peutSections} types={ag.types_moment} onChoix={appliquer} onFermer={fermerMenu} />}
      {saisie && <SaisieManuelle ag={ag} annee={annee} peutEtab={peutEtab} peutSections={peutSections} onFermer={() => setSaisie(false)}
        onFait={() => { setSaisie(false); apresGeste(); }} poser={poser} />}
    </div>
  );
}

/* LE MENU DE LA ZONE : ce qu'on met sur les semaines glissées. */
const MOMENTS_RAPIDES = [['examens', 'Examens'], ['inscriptions', 'Inscriptions'], ['diplomes', 'Remise des diplômes'], ['rentree', 'Rentrée'], ['jpo', 'Portes ouvertes'], ['echeance', 'Échéance'], ['conseil', 'Conseil'], ['horaires', 'Horaires'], ['salon', 'Salon'], ['autre', 'Autre…']];
function MenuZone({ zone, pos, peutEtab, peutSections, types, onChoix, onFermer }) {
  const [x, y] = zone.a <= zone.b ? [zone.a, zone.b] : [zone.b, zone.a];
  const n = Math.round((new Date(`${y}T00:00:00Z`) - new Date(`${x}T00:00:00Z`)) / 6048e5) + 1;
  useEffect(() => { const k = e => e.key === 'Escape' && onFermer(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const B = ({ children, onClick, fort }) => <button type="button" onClick={onClick} className={`bouton px-2 py-1 text-second ${fort ? 'bouton-fort' : ''}`}>{children}</button>;
  const section = zone.section && peutSections.includes(zone.section) ? zone.section : null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onFermer} />
      <div className="fixed z-50 w-[290px] carte shadow-flottant p-3 space-y-2.5 bg-white" style={{ left: pos.x, top: pos.y }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-iip-texte flex-1">Du {fmt(x)} au {fmt(plus(y, 4))} · {n} semaine{n > 1 ? 's' : ''}</span>
          <button className="bouton px-1 py-0" onClick={onFermer} aria-label="Fermer"><IconX size={12} /></button>
        </div>
        {peutEtab && <>
          <div><div className="intertitre">La période</div>
            <div className="flex flex-wrap gap-1"><B fort onClick={() => onChoix({ cle: 'chaleur', valeur: 'chaud' })}>Tension</B><B onClick={() => onChoix({ cle: 'chaleur', valeur: 'creux' })}>Calme</B>
              <B onClick={() => onChoix({ cle: 'chaleur', valeur: 'normal' })}>Normale</B><B onClick={() => onChoix({ cle: 'chaleur', valeur: 'calcul' })}>Calcul de Lucie</B></div></div>
          <div><div className="intertitre">Un grand moment</div>
            <div className="flex flex-wrap gap-1">{MOMENTS_RAPIDES.map(([k, t]) => <B key={k} onClick={() => onChoix({ cle: 'moment', valeur: k, titre: k === 'autre' ? '' : (types?.[k] || t) })}>{t}</B>)}</div></div>
          <div><div className="intertitre">L’école</div>
            <div className="flex flex-wrap gap-1"><B onClick={() => onChoix({ cle: 'fermeture', valeur: 'totale' })}>Fermée</B><B onClick={() => onChoix({ cle: 'fermeture', valeur: 'partielle' })}>En partie</B><B onClick={() => onChoix({ cle: 'fermeture', valeur: 'ouvert' })}>Ouverte</B></div></div>
          <div><div className="intertitre">Les cours</div>
            <div className="flex flex-wrap gap-1">{PINCEAUX.cours.valeurs.map(([k, t]) => <B key={k} onClick={() => onChoix({ cle: 'cours', valeur: k })}>{t}</B>)}</div></div>
        </>}
        {section && <div><div className="intertitre">Section {section}</div>
          <div className="flex flex-wrap gap-1">{PINCEAUX.section.valeurs.map(([k, t]) => <B key={k} onClick={() => onChoix({ cle: 'section', valeur: k, section })}>{t}</B>)}</div></div>}
      </div>
    </>
  );
}

/* La barre des pinceaux : une ligne — le pinceau, sa valeur, et « Saisir ». */
function BarrePinceaux({ pinceau, setPinceau, peutEtab, sections, peutSections, types, debut, occupe, onSaisie, onOuvrirSections }) {
  const cles = Object.entries(PINCEAUX).filter(([, p]) => (p.direction ? peutEtab : peutSections.length));
  const p = pinceau ? PINCEAUX[pinceau.cle] : null;
  const valeurs = pinceau?.cle === 'moment' ? Object.entries(types || {}).filter(([k]) => k !== 'deliberations') : p?.valeurs || [];
  return (
    <div className="px-3 pt-3 flex flex-nowrap items-center gap-2 overflow-x-auto">
      <span className="inline-flex items-center gap-1 text-second text-slate-600 flex-none"><IconBrush size={15} /> Peindre</span>
      <div className="segments flex-none">
        <button type="button" onClick={() => setPinceau(null)} className={!pinceau ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>Lire</button>
        {cles.map(([k, x]) => <button key={k} type="button" onClick={() => { setPinceau({ cle: k, valeur: k === 'moment' ? 'inscriptions' : x.valeurs?.[0]?.[0], section: k === 'section' ? peutSections[0] : null }); if (k === 'section') onOuvrirSections(); }}
          className={pinceau?.cle === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{x.mot}</button>)}
      </div>
      {pinceau?.cle === 'section' && (
        <select className="controle border border-slate-300 rounded-champ text-sm flex-none" value={pinceau.section || ''} onChange={e => setPinceau({ ...pinceau, section: e.target.value })} aria-label="Section">
          {peutSections.filter(s => sections.some(x => x.section === s)).map(s => <option key={s} value={s}>{s}</option>)}
        </select>)}
      {pinceau && valeurs.length > 0 && (
        <select className="controle border border-slate-300 rounded-champ text-sm flex-none" value={pinceau.valeur || ''} onChange={e => setPinceau({ ...pinceau, valeur: e.target.value })} aria-label="Valeur">
          {valeurs.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>)}
      {pinceau && <span className="text-mention text-slate-500 whitespace-nowrap">{occupe ? 'Enregistrement…' : debut ? `Depuis le ${fmt(debut)} : touchez la dernière semaine (la même pour une seule).` : `Touchez la première semaine sur la rangée « ${PINCEAUX[pinceau.cle].rangee === 'fermeture' ? 'École' : PINCEAUX[pinceau.cle].rangee === 'moments' ? 'Moments' : PINCEAUX[pinceau.cle].rangee === 'section' ? pinceau.section : PINCEAUX[pinceau.cle].mot} ».`}</span>}
      <div className="flex-1" />
      {peutEtab && <button type="button" className="bouton controle flex-none inline-flex items-center gap-1.5" onClick={onSaisie}><IconCalendarPlus size={15} /> Saisir</button>}
    </div>
  );
}

/* Les grands moments : bandes posées sur l'année ; avec le pinceau « Grand moment », une case par semaine pour les poser. */
function RangeeMoments({ ag, droite, cible, toucher, enCours, onRetirer }) {
  const s0 = new Date(`${ag.semaines[0]}T00:00:00Z`).getTime(), span = 52 * 7 * 864e5;
  const pos = x => Math.max(0, Math.min(1, (new Date(`${x}T00:00:00Z`).getTime() - s0) / span));
  // Les délibérations, nombreuses, se marquent d'un point ; les autres moments portent leur nom.
  const noms = ag.moments.filter(m => m.type !== 'deliberations' && m.nature !== 'reunion' && !m.serie_id);
  const couloirs = [];
  const places = noms.map(m => { let k = couloirs.findIndex(fin => fin < m.du); if (k < 0) { k = couloirs.length; couloirs.push(m.au); } else couloirs[k] = m.au; return { ...m, k }; });
  const n = Math.max(1, couloirs.length);
  const delib = ag.moments.filter(m => m.type === 'deliberations');
  return (
    <div className="grid" style={{ gridTemplateColumns: `${COL_NOM} minmax(0,1fr) ${droite}` }}>
      <div className="text-second text-slate-600 pr-2 self-center">Moments</div>
      <div className="relative" style={{ height: `${n * 1.25 + 0.6}rem` }}>
        {places.map((m, i) => (
          <span key={i} title={`${m.titre} · ${fmt(m.du)}${m.au !== m.du ? ` → ${fmt(m.au)}` : ''}`}
            className="absolute h-[1.05rem] rounded-[3px] text-mention text-white px-1 truncate leading-[1.05rem] pointer-events-none z-[1]"
            style={{ left: `${pos(m.du) * 100}%`, width: `max(0.6rem, ${(pos(plus(m.au, 1)) - pos(m.du)) * 100}%)`, top: `${m.k * 1.25}rem`, background: COULEUR_NATURE[m.nature] || 'var(--c-principal)', color: TEXTE_NATURE[m.nature] || 'white' }}>
            {m.titre}
          </span>))}
        {delib.map((m, i) => <span key={`d${i}`} title={`${m.titre} · ${fmt(m.du)}${m.au !== m.du ? ` → ${fmt(m.au)}` : ''}`}
          className="absolute w-1.5 h-1.5 rounded-full" style={{ left: `calc(${pos(m.du) * 100}% + 2px)`, bottom: 0, background: 'var(--c-texte)' }} />)}
        {<div className={`absolute inset-0 grid ${cible ? 'z-10' : ''}`} style={{ gridTemplateColumns: 'repeat(52, minmax(0, 1fr))' }}>
          {ag.semaines.map(l => <button key={l} data-lundi={l} type="button" onClick={() => cible && toucher(l)} title={`Semaine du ${fmt(l)}`}
            className={`mx-px rounded-[3px] ${cible ? 'cursor-crosshair hover:bg-[color-mix(in_srgb,var(--c-accent)_20%,transparent)]' : ''} ${enCours(l) ? 'ring-2 ring-[var(--c-accent)]' : ''}`} />)}
        </div>}
      </div>
      <div />
    </div>
  );
}

function Legende() {
  const P = ({ fond, children, bord }) => <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-[2px]" style={{ background: fond, border: bord ? '1px solid var(--c-filet, #E2E8F0)' : 'none' }} />{children}</span>;
  return (
    <div className="px-4 py-2 border-t flex flex-wrap gap-x-4 gap-y-1 text-mention text-slate-600">
      <P fond="var(--c-attente)">tension</P><P fond="var(--c-disponible)">calme</P>
      <P fond="var(--c-texte)">école fermée</P><P fond="color-mix(in srgb, var(--c-texte) 35%, transparent)">en partie fermée</P>
      <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-refuse)' }} />jour fermé</span>
      <P fond={HACHURE}>vacances (cours)</P><P fond="var(--c-principal)">heures prévues · section active</P><P fond="var(--c-accent)">proposition · jour donné · stage</P>
    </div>
  );
}

/* ── SAISIR À LA MAIN : le même geste, avec un mini calendrier ── */
export function SaisieManuelle({ ag, annee, peutEtab, peutSections, onFermer, onFait, poser = null, initial = {} }) {
  const [quoi, setQuoi] = useState(initial.quoi || 'moment');
  const [du, setDu] = useState(initial.du || null), [au, setAu] = useState(initial.au && initial.au !== initial.du ? initial.au : null);
  const [valeur, setValeur] = useState(initial.type || 'inscriptions');
  const [domaine, setDomaine] = useState(''), [pour, setPour] = useState([]);
  const [heure, setHeure] = useState(''), [heureFin, setHeureFin] = useState('');
  const [repeter, setRepeter] = useState(''), [rang, setRang] = useState(1), [jusquau, setJusquau] = useState(plus(ag.semaines[51], 4));
  const [titre, setTitre] = useState('');
  const [section, setSection] = useState(peutSections[0] || '');
  const [mois, setMois] = useState(() => { const d = (initial.du || new Date().toISOString()).slice(0, 7); return d >= ag.semaines[0].slice(0, 7) && d <= plus(ag.semaines[51], 6).slice(0, 7) ? d : ag.semaines[0].slice(0, 7); });
  const [occupe, setOccupe] = useState(false);
  const QUOI = [['moment', 'Grand moment'], ['jour', 'Jour fermé (mardi gras, 2 novembre…)'], ['fermeture', 'École fermée'], ['chaleur', 'Chaleur'], ['cours', 'Cours'],
    ...(peutSections.length ? [['section', 'Section']] : [])].filter(([k]) => (peutEtab || k === 'section') && (poser || ['moment', 'jour', 'fermeture'].includes(k)));
  const valeurs = quoi === 'moment' ? Object.entries(ag.types_moment || {}).filter(([k]) => k !== 'deliberations') : quoi === 'jour' ? [] : PINCEAUX[quoi].valeurs;
  useEffect(() => { if (quoi === (initial.quoi || 'moment') && initial.type) return; setValeur(quoi === 'moment' ? 'inscriptions' : valeurs?.[0]?.[0] || null); }, [quoi]);
  const fin = au || du;
  const choisir = d => { if (!du || (du && au)) { setDu(d); setAu(null); } else if (d < du) { setAu(du); setDu(d); } else setAu(d); };
  const valider = async () => {
    if (!du) return;
    setOccupe(true);
    try {
      if (quoi === 'jour') {
        if (!titre.trim()) { informer({ message: 'Nommez le jour (mardi gras, 2 novembre…).' }); return; }
        for (let d = du; d <= fin; d = plus(d, 1)) {
          const w = new Date(`${d}T00:00:00Z`).getUTCDay(); if (w === 0 || w === 6) continue;
          await appel(`/api/agenda-ecole/jour-ferme/${d}`, annee, { method: 'PUT', body: JSON.stringify({ libelle: titre.trim() }) });
        }
        onFait(); return;
      }
      if (quoi === 'moment') {
        if (!titre.trim()) { informer({ message: 'Nommez le moment.' }); return; }
        const extra = { domaine: domaine || null, pour, heure_debut: heure || null, heure_fin: heureFin || null };
        if (repeter) {
          const jour = (new Date(`${du}T00:00:00Z`).getUTCDay() + 6) % 7;
          await appel('/api/agenda-ecole/series', annee, { method: 'POST', body: JSON.stringify({ type: valeur, titre: titre.trim(), regle: repeter, jour, rang: repeter === 'mois' ? Number(rang) : null, du, au: jusquau, ...extra }) });
        } else await appel('/api/agenda-ecole/moments', annee, { method: 'POST', body: JSON.stringify({ type: valeur, titre: titre.trim(), du, au: fin, ...extra }) });
        onFait(); return;
      }
      if (quoi === 'fermeture' && valeur !== 'ouvert' && !titre.trim()) { informer({ message: 'Nommez la fermeture (Noël, été…).' }); return; }
      if (quoi === 'fermeture') {
        const lundis = ag.semaines.filter(l => l >= lundiDe(du) && l <= lundiDe(fin));
        await appel('/api/agenda-ecole/fermeture', annee, { method: 'PUT', body: JSON.stringify({ lundis, fermeture: valeur === 'ouvert' ? null : valeur, libelle: titre.trim() }) });
        onFait(); return;
      }
      await poser(lundiDe(du), lundiDe(fin), { cle: quoi, valeur, section });
      onFait();
    } catch (e) { informer({ message: e.message }); } finally { setOccupe(false); }
  };
  const besoinTitre = ['moment', 'jour', 'fermeture'].includes(quoi) && !(quoi === 'fermeture' && valeur === 'ouvert');
  return (
    <Fenetre icone={IconCalendarPlus} titre="Saisir dans l’agenda" large="grande" onFermer={onFermer}
      pied={<div className="flex items-center gap-3 w-full">
        <span className="text-second text-slate-500 min-w-0 flex-1">{du ? `Du ${fmt(du)} au ${fmt(fin)}` : 'Touchez le premier jour, puis le dernier.'}{quoi !== 'moment' && quoi !== 'jour' && du ? ' — par semaines entières.' : ''}</span>
        <button className="bouton bouton-fort" disabled={!du || occupe || (besoinTitre && !titre.trim())} onClick={valider}>{occupe ? 'Enregistrement…' : 'Poser'}</button>
      </div>}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-3 text-sm min-w-0">
          <label className="block"><span className="text-second text-slate-600">Quoi</span>
            <select className="controle border border-slate-300 rounded-champ w-full mt-1" value={quoi} onChange={e => setQuoi(e.target.value)}>
              {QUOI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {valeurs && valeurs.length > 0 && <label className="block"><span className="text-second text-slate-600">{quoi === 'moment' ? 'Nature' : 'Valeur'}</span>
            <select className="controle border border-slate-300 rounded-champ w-full mt-1" value={valeur || ''} onChange={e => setValeur(e.target.value)}>
              {valeurs.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          {quoi === 'moment' && <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-second text-slate-600">Domaine</span>
                <select className="controle border border-slate-300 rounded-champ w-full mt-1" value={domaine} onChange={e => setDomaine(e.target.value)}>
                  <option value="">—</option>{Object.entries(ag.domaines || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="block"><span className="text-second text-slate-600">Heure (facultative)</span>
                <span className="flex items-center gap-1 mt-1"><input type="time" className="controle border border-slate-300 rounded-champ w-full" value={heure} onChange={e => setHeure(e.target.value)} />
                  <input type="time" className="controle border border-slate-300 rounded-champ w-full" value={heureFin} onChange={e => setHeureFin(e.target.value)} /></span></label>
            </div>
            <div><span className="text-second text-slate-600">Pour qui (rien coché : tout le monde)</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">{Object.entries(ag.pour || {}).map(([k, l]) => (
                <label key={k} className="inline-flex items-center gap-1.5 text-second"><input type="checkbox" checked={pour.includes(k)} onChange={e => setPour(p => (e.target.checked ? [...p, k] : p.filter(x => x !== k)))} />{l}</label>))}</div></div>
            <label className="block"><span className="text-second text-slate-600">Répéter</span>
              <span className="flex flex-wrap items-center gap-1 mt-1">
                <select className="controle border border-slate-300 rounded-champ" value={repeter} onChange={e => setRepeter(e.target.value)}>
                  <option value="">Non, une fois</option><option value="semaine">Chaque semaine</option><option value="quinzaine">Une semaine sur deux</option><option value="mois">Chaque mois</option></select>
                {repeter === 'mois' && <select className="controle border border-slate-300 rounded-champ" value={rang} onChange={e => setRang(e.target.value)}>
                  {[[1, '1er'], [2, '2e'], [3, '3e'], [4, '4e'], [-1, 'dernier']].map(([k, l]) => <option key={k} value={k}>le {l} {du ? ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][(new Date(`${du}T00:00:00Z`).getUTCDay() + 6) % 7] : 'jour'} du mois</option>)}</select>}
                {repeter && <>jusqu’au <input type="date" className="controle border border-slate-300 rounded-champ" value={jusquau} onChange={e => setJusquau(e.target.value)} /></>}
              </span>
              {repeter && <span className="text-mention text-slate-500">Le jour de la semaine est celui du premier jour choisi ; les semaines où l’école est fermée et les jours fermés sont sautés.</span>}</label>
          </>}
          {quoi === 'section' && <label className="block"><span className="text-second text-slate-600">Section</span>
            <select className="controle border border-slate-300 rounded-champ w-full mt-1" value={section} onChange={e => setSection(e.target.value)}>
              {peutSections.map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
          {besoinTitre && <label className="block"><span className="text-second text-slate-600">Nom</span>
            <input className="controle border border-slate-300 rounded-champ w-full mt-1" value={titre} onChange={e => setTitre(e.target.value)}
              placeholder={quoi === 'jour' ? 'Mardi gras' : quoi === 'fermeture' ? 'Vacances d’hiver' : 'Remise des diplômes'} /></label>}
          <p className="text-second text-slate-500 m-0">{quoi === 'jour' ? 'Un jour fermé par l’école compte comme presté pour le personnel ; la trace de qui l’a posé reste au relevé.'
            : quoi === 'fermeture' ? 'Fermée : congé pour tout le personnel. En partie : chacun choisit, la direction valide.'
            : quoi === 'section' ? 'Ce que dit l’horaire est repris d’office ; forcer sert aux semaines sans séance (stage) ou à corriger.'
            : 'Il se pose sur la ligne du temps et réchauffe sa semaine.'}</p>
        </div>
        <MiniCalendrier mois={mois} setMois={setMois} du={du} au={fin} onJour={choisir} ag={ag} />
      </div>
    </Fenetre>
  );
}

function MiniCalendrier({ mois, setMois, du, au, onJour, ag }) {
  const [y, m] = mois.split('-').map(Number);
  const premier = `${mois}-01`;
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const decal = (new Date(`${premier}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cases = [...Array(decal).fill(null), ...Array.from({ length: n }, (_, i) => `${mois}-${String(i + 1).padStart(2, '0')}`)];
  const changer = k => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); setMois(d.toISOString().slice(0, 7)); };
  const fermes = new Set(ag.jours_fermes.map(j => j.date));
  const ferm = new Map(ag.semaines.map((l, i) => [l, ag.fermetures[i]]));
  return (
    <div className="border rounded-carte p-2 self-start" style={{ borderColor: 'var(--c-filet, #E2E8F0)' }}>
      <div className="flex items-center justify-between mb-1">
        <button type="button" className="bouton px-1.5 py-0.5" onClick={() => changer(-1)} aria-label="Mois précédent"><IconChevronLeft size={14} /></button>
        <span className="text-sm font-semibold text-iip-texte">{MOIS_LONG[m - 1]} {y}</span>
        <button type="button" className="bouton px-1.5 py-0.5" onClick={() => changer(1)} aria-label="Mois suivant"><IconChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['l', 'm', 'm', 'j', 'v', 's', 'd'].map((j, i) => <div key={i} className="text-mention text-slate-400">{j}</div>)}
        {cases.map((d, i) => {
          if (!d) return <div key={i} />;
          const dans = du && d >= du && d <= (au || du);
          const f = ferm.get(lundiDe(d));
          const ferie = ag.feries?.[d];
          return <button key={d} type="button" onClick={() => onJour(d)} title={[ferie, f ? `École ${f.fermeture === 'totale' ? 'fermée' : 'en partie fermée'} — ${f.libelle}` : null].filter(Boolean).join(' · ')}
            className={`h-7 rounded text-second tabular-nums ${dans ? 'bg-iip-blue text-white font-semibold' : ''} ${!dans && (fermes.has(d) || ferie) ? 'text-[var(--c-refuse)] font-semibold' : ''}`}
            style={!dans && f ? { background: f.fermeture === 'totale' ? 'color-mix(in srgb, var(--c-texte) 15%, transparent)' : 'color-mix(in srgb, var(--c-texte) 7%, transparent)' } : undefined}>
            {Number(d.slice(8))}</button>;
        })}
      </div>
      <p className="text-mention text-slate-500 m-0 mt-1">En rouge : fériés et jours fermés ; grisé : école fermée.</p>
    </div>
  );
}

/* LA VUE MOIS DE L'AGENDA (3.5.062, Charles, d'après sa « Timeline Santé 2025-2026 » : un mois par ligne, les jours en
 * colonnes, chaque élément à son jour). Douze lignes, de septembre à août. Couleur = la nature (événement, échéance, réunion,
 * conseil, horaires) ; on filtre par domaine et par nature. On glisse sur des jours (ou on touche un jour) pour saisir un
 * élément à la date précise ; un élément touché se lit, se retire, et une date de série s'annule ou se déplace. Les éléments
 * « pour » d'autres rôles n'arrivent pas jusqu'ici (le serveur les retire). */
import { useMemo, useRef, useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander, informer, saisir } from '../lib/dialogue.jsx';
import { SaisieManuelle, COULEUR_NATURE, TEXTE_NATURE, HACHURE } from './AgendaLigne.jsx';

const plus = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const lundiDe = d => plus(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const fmt = d => `${d.slice(8)}/${d.slice(5, 7)}`;
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const JS = ['d', 'l', 'm', 'm', 'j', 'v', 's'];
const appel = (url, annee, o = {}) => fetch(`${url}${url.includes('?') ? '&' : '?'}annee=${annee}`, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });
const COLS = '6.5rem repeat(31, minmax(0, 1fr))';

export default function AgendaMois({ annee, ag, recharger, onChange = null }) {
  const [domaine, setDomaine] = useState('');
  const [masquees, setMasquees] = useState([]);
  const [saisie, setSaisie] = useState(null);           // { du, au }
  const [ouvert, setOuvert] = useState(null);           // { m, x, y }
  const [zone, setZone] = useState(null);
  const glisse = useRef({ actif: false, a: null, bouge: false });
  if (!ag) return <div className="px-4 py-3 text-sm text-slate-500">Chargement de l’agenda…</div>;
  if (ag.erreur) return <div className="px-4 py-3 text-sm text-red-700">{ag.erreur}</div>;
  const peutEtab = ag.peut?.etablissement;
  // Du mois du premier jour de l'année (mi-août) au mois du dernier (mi-août suivant) ; les jours hors de l'année sont pâles.
  const premier = ag.semaines[0], dernier = plus(ag.semaines[ag.semaines.length - 1], 6);
  const mois = []; for (let d = `${premier.slice(0, 7)}-01`; d <= dernier; d = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1)).toISOString().slice(0, 10)) mois.push(d.slice(0, 7));
  const ferm = new Map(ag.semaines.map((l, i) => [l, ag.fermetures[i]]));
  const fermes = new Map(ag.jours_fermes.map(j => [j.date, j.libelle]));
  const elements = ag.moments.filter(m => (!domaine || m.domaine === domaine) && !masquees.includes(m.nature));
  const apres = () => { recharger(); onChange?.(); };
  const dansZone = d => zone && d >= (zone.a < zone.b ? zone.a : zone.b) && d <= (zone.a < zone.b ? zone.b : zone.a);

  const appui = e => { if (!peutEtab) return; const t = e.target.closest?.('[data-jour]'); if (!t) return; glisse.current = { actif: true, a: t.dataset.jour, bouge: false }; setZone({ a: t.dataset.jour, b: t.dataset.jour }); };
  const bouge = e => { const g = glisse.current; if (!g.actif) return; const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-jour]'); if (!t) return; if (t.dataset.jour !== g.a) g.bouge = true; setZone({ a: g.a, b: t.dataset.jour }); };
  const lache = () => { const g = glisse.current; if (!g.actif) return; g.actif = false; const z = zone; setZone(null); if (!z) return; const [x, y] = z.a <= z.b ? [z.a, z.b] : [z.b, z.a]; setSaisie({ du: x, au: y }); };

  const retirer = async m => {
    try {
      if (m.serie_id) {
        const choix = await demander({ message: `« ${m.titre} » revient en série. Annuler seulement le ${fmt(m.du)} ?`, confirmer: 'Annuler cette date' });
        if (!choix) return;
        await appel(`/api/agenda-ecole/series/${m.serie_id}/exception`, annee, { method: 'PUT', body: JSON.stringify({ date: m.deplace || m.du, nouvelle: null }) });
      } else {
        if (!(await demander(`Retirer « ${m.titre} » ?`))) return;
        await appel(`/api/agenda-ecole/moments/${m.id}`, annee, { method: 'DELETE' });
      }
      setOuvert(null); apres();
    } catch (e) { informer({ message: e.message }); }
  };
  const deplacer = async m => {
    const nouvelle = await saisir({ message: `Déplacer le ${fmt(m.du)} de « ${m.titre} » au (AAAA-MM-JJ) :`, obligatoire: true, valeur: m.du });
    if (!nouvelle) return;
    try { await appel(`/api/agenda-ecole/series/${m.serie_id}/exception`, annee, { method: 'PUT', body: JSON.stringify({ date: m.deplace || m.du, nouvelle }) }); setOuvert(null); apres(); }
    catch (e) { informer({ message: e.message }); }
  };
  const retirerSerie = async m => {
    if (!(await demander(`Retirer toute la série « ${m.titre} » ?`))) return;
    try { await appel(`/api/agenda-ecole/series/${m.serie_id}`, annee, { method: 'DELETE' }); setOuvert(null); apres(); } catch (e) { informer({ message: e.message }); }
  };

  return (
    <div className="space-y-2">
      <div className="px-3 pt-3 flex flex-nowrap items-center gap-2 overflow-x-auto">
        <div className="segments flex-none">
          {[['', 'Tous les domaines'], ...Object.entries(ag.domaines || {})].map(([k, l]) => <button key={k || 'tous'} type="button" onClick={() => setDomaine(k)} className={domaine === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>)}
        </div>
        <div className="flex flex-nowrap gap-1 flex-none">
          {Object.entries(ag.natures || {}).map(([k, l]) => { const off = masquees.includes(k);
            return <button key={k} type="button" onClick={() => setMasquees(x => (off ? x.filter(y => y !== k) : [...x, k]))} title={off ? 'Montrer' : 'Masquer'}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-champ text-second border ${off ? 'text-slate-400 line-through' : 'text-iip-texte'}`} style={{ borderColor: 'var(--c-filet, #E2E8F0)' }}>
              <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: COULEUR_NATURE[k], opacity: off ? 0.3 : 1 }} />{l}</button>; })}
        </div>
        {peutEtab && <span className="text-mention text-slate-500 whitespace-nowrap">Glissez sur des jours (ou touchez un jour) pour y poser un élément.</span>}
      </div>
      <div className="px-3 pb-3 overflow-x-auto">
        <div className="min-w-[980px] select-none" style={{ touchAction: 'pan-y' }} onPointerDown={appui} onPointerMove={bouge} onPointerUp={lache} onPointerLeave={() => { glisse.current.actif = false; setZone(null); }}>
          {mois.map(mo => {
            const [y, m] = mo.split('-').map(Number);
            const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
            const jours = Array.from({ length: n }, (_, i) => `${mo}-${String(i + 1).padStart(2, '0')}`);
            const fin = jours[n - 1];
            const ici = elements.filter(e => e.au >= jours[0] && e.du <= fin);
            const couloirs = [];
            const places = ici.map(e => {
              const a = e.du < jours[0] ? 1 : Number(e.du.slice(8)), b = Math.min(n, Math.max(e.au > fin ? n : Number(e.au.slice(8)), a + 2));
              let k = couloirs.findIndex(f => f < a); if (k < 0) { k = couloirs.length; couloirs.push(b); } else couloirs[k] = b;
              return { e, a, b, k };
            });
            return (
              <div key={mo} className="border-t py-1" style={{ borderColor: 'var(--c-filet, #E2E8F0)' }}>
                {places.length > 0 && (
                  <div className="grid gap-y-0.5 mb-0.5" style={{ gridTemplateColumns: COLS, gridTemplateRows: `repeat(${couloirs.length}, 1.1rem)` }}>
                    {places.map(({ e, a, b, k }, i) => (
                      <button key={i} type="button" onClick={ev => setOuvert({ m: e, x: Math.min(ev.clientX, window.innerWidth - 300), y: ev.clientY + 8 })}
                        title={`${e.titre} · ${fmt(e.du)}${e.au !== e.du ? ` → ${fmt(e.au)}` : ''}${e.heure_debut ? ` · ${e.heure_debut}` : ''}`}
                        className="rounded-[3px] text-mention px-1 truncate leading-[1.1rem] mx-px text-left"
                        style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: k + 1, background: COULEUR_NATURE[e.nature] || 'var(--c-principal)', color: TEXTE_NATURE[e.nature] || 'white' }}>
                        {e.titre}</button>))}
                  </div>)}
                <div className="grid" style={{ gridTemplateColumns: COLS }}>
                  <div className="text-second font-semibold text-iip-texte pr-2 self-center">{MOIS[m - 1]} {y}</div>
                  {jours.map(d => {
                    const w = new Date(`${d}T00:00:00Z`).getUTCDay(); const we = w === 0 || w === 6; const hors = d < premier || d > dernier;
                    const f = ferm.get(lundiDe(d)); const ferie = ag.feries?.[d] || fermes.get(d);
                    return (
                      <div key={d} data-jour={d} 
                        title={[ferie, f ? `École ${f.fermeture === 'totale' ? 'fermée' : 'en partie fermée'} — ${f.libelle}` : null].filter(Boolean).join(' · ')}
                        className={`h-9 mx-px rounded-[3px] flex flex-col items-center justify-center leading-none ${peutEtab ? 'cursor-crosshair' : ''} ${dansZone(d) ? 'ring-2 ring-[var(--c-accent)]' : ''} ${hors ? 'opacity-30' : ''}`}
                        style={{ background: f?.fermeture === 'totale' ? 'color-mix(in srgb, var(--c-texte) 14%, transparent)' : f?.fermeture === 'partielle' ? 'color-mix(in srgb, var(--c-texte) 7%, transparent)' : we ? HACHURE : 'color-mix(in srgb, var(--c-filet, #E2E8F0) 45%, transparent)' }}>
                        <span className="text-[9px] text-slate-400">{JS[w]}</span>
                        <span className={`text-second tabular-nums ${ferie ? 'text-[var(--c-refuse)] font-semibold' : 'text-iip-texte'}`}>{Number(d.slice(8))}</span>
                      </div>);
                  })}
                </div>
              </div>);
          })}
        </div>
      </div>
      {ouvert && <>
        <div className="fixed inset-0 z-40" onClick={() => setOuvert(null)} />
        <div className="fixed z-50 w-[290px] carte shadow-flottant p-3 space-y-2 bg-white text-sm" style={{ left: ouvert.x, top: Math.min(ouvert.y, window.innerHeight - 260) }}>
          <div className="flex items-start gap-2">
            <span className="inline-block w-2.5 h-2.5 mt-1 rounded-[2px] flex-none" style={{ background: COULEUR_NATURE[ouvert.m.nature] }} />
            <span className="font-semibold text-iip-texte flex-1">{ouvert.m.titre}</span>
            <button className="bouton px-1 py-0" onClick={() => setOuvert(null)} aria-label="Fermer"><IconX size={12} /></button>
          </div>
          <div className="text-second text-slate-600">
            {fmt(ouvert.m.du)}{ouvert.m.au !== ouvert.m.du ? ` → ${fmt(ouvert.m.au)}` : ''}{ouvert.m.heure_debut ? ` · ${ouvert.m.heure_debut}${ouvert.m.heure_fin ? `–${ouvert.m.heure_fin}` : ''}` : ''}
            <br />{ag.types_moment?.[ouvert.m.type] || ouvert.m.type}{ouvert.m.domaine ? ` · ${ag.domaines?.[ouvert.m.domaine]}` : ''}
            <br />Pour : {ouvert.m.pour ? ouvert.m.pour.split(',').map(p => ag.pour?.[p] || p).join(', ') : 'tout le monde'}
            {ouvert.m.serie_id && <><br />Revient en série{ouvert.m.deplace ? ` (déplacé du ${fmt(ouvert.m.deplace)})` : ''}.</>}
            {ouvert.m.source === 'deliberation' && <><br />Lu des séances de délibération.</>}
          </div>
          {peutEtab && ouvert.m.source !== 'deliberation' && (
            <div className="flex flex-wrap gap-1">
              {ouvert.m.serie_id ? <>
                <button className="bouton px-2 py-0.5 text-second" onClick={() => deplacer(ouvert.m)}>Déplacer cette date</button>
                <button className="bouton px-2 py-0.5 text-second" onClick={() => retirer(ouvert.m)}>Annuler cette date</button>
                <button className="bouton bouton-detruire px-2 py-0.5 text-second" onClick={() => retirerSerie(ouvert.m)}>Retirer la série</button>
              </> : <button className="bouton bouton-detruire px-2 py-0.5 text-second" onClick={() => retirer(ouvert.m)}>Retirer</button>}
            </div>)}
        </div>
      </>}
      {saisie && <SaisieManuelle ag={ag} annee={annee} peutEtab={peutEtab} peutSections={[]} initial={{ quoi: 'moment', du: saisie.du, au: saisie.au, type: 'reunion' }}
        onFermer={() => setSaisie(null)} onFait={() => { setSaisie(null); apres(); }} />}
    </div>
  );
}

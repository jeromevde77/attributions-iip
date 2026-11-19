import { IconEye, IconEyeOff, IconGripVertical, IconColumns1, IconColumns2 } from '@tabler/icons-react';
import { useMiseEnPage, changerMiseEnPage, deplacer, poigneeGlisser, basculerMiseEnPage } from '../lib/miseEnPage.js';
import { getUser } from '../lib/api.js';
import { useEffect, useRef, useState } from 'react';

/* LES VOLETS (3.5.594, Charles, 19 novembre 2026 : « mettre les urgences en premier ; fermer les volets pour tout voir »). Avec
   `volets`, chaque bloc se replie sur son en-tête (titre et nombre) ; un clic sur l'en-tête l'ouvre ou le ferme — gardé sur
   l'appareil. Les blocs qui portent une urgence passent en tête : une ligne « à corriger » (en retard, refus) d'abord, puis
   « à surveiller » ; le fil d'activité reste en dernier. L'urgence se LIT dans ce que le bloc affiche (data-etat), à mesure qu'il
   charge. */
const CLE_VOLETS = page => `lucie.volets.${page}`;
const lireOuverts = page => { try { return new Set(JSON.parse(localStorage.getItem(CLE_VOLETS(page)) || '[]')); } catch { return new Set(); } };
function urgenceDe(el) {
  if (!el) return 2;
  if (el.querySelector('[data-etat="corriger"], [data-etat="refuse"]')) return 0;
  if (el.querySelector('[data-etat="surveiller"], [data-etat="attente"]')) return 1;
  return 2;
}

/**
 * LES BLOCS D'UNE PAGE, RANGÉS PAR L'ADMINISTRATEUR (3.1.256, Charles, 10 octobre
 * 2026 : « paramétrer en glisser-déposer les pages principales — toutes les pages,
 * mais juste l'admin »). Une page déclare ses blocs — une clé, un titre, un rendu —
 * et ce composant les pose dans l'ordre réglé, en pleine largeur ou en demi-largeur,
 * sans ceux qui sont masqués. En mode mise en page, chaque bloc porte sa barre :
 * on le glisse sur un autre pour le ranger avant lui, on le masque, on change sa
 * largeur. Un bloc qu'une page ajoute demain prend sa place à la fin, sans que
 * personne ait à y penser.
 */
export default function BlocsPage({ page, blocs, volets = false }) {
  const mep = useMiseEnPage();
  const [ouverts, setOuverts] = useState(() => lireOuverts(page));
  const [urgences, setUrgences] = useState({});
  const refs = useRef({});
  useEffect(() => {
    if (!volets) return undefined;
    const mesurer = () => setUrgences(u => {
      const n = {}; let change = false;
      for (const b of blocs) { n[b.cle] = urgenceDe(refs.current[b.cle]); if (n[b.cle] !== u[b.cle]) change = true; }
      return change ? n : u;
    });
    mesurer();
    const obs = new MutationObserver(mesurer);
    for (const el of Object.values(refs.current)) if (el) obs.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-etat'] });
    return () => obs.disconnect();
  });
  const basculerVolet = (cle, e) => {
    if (!volets || mep.actif) return;
    const t = e.target;
    if (!t.closest?.('.entete-carte, .entete-volet') || t.closest('button, a, input, select, textarea, label')) return;
    setOuverts(o => { const n = new Set(o); n.has(cle) ? n.delete(cle) : n.add(cle); try { localStorage.setItem(CLE_VOLETS(page), JSON.stringify([...n])); } catch { /* */ } return n; });
  };
  const r = mep.conf.pages?.[page] || {};
  const ordre = r.ordre || [];
  /* UN BLOC NOUVEAU PREND LA PLACE OÙ IL EST DÉCLARÉ (3.1.286) : rangé après tout le reste, la
     tuile « Quoi de neuf » tombait sous le fil d'activité, faute de figurer dans un ordre enregistré
     avant elle. Il se place juste avant le premier bloc rangé qui le suit dans la déclaration. */
  const rang = c => {
    const i = ordre.indexOf(c);
    if (i >= 0) return i;
    const d = blocs.findIndex(b => b.cle === c);
    const suivant = blocs.slice(d + 1).map(b => ordre.indexOf(b.cle)).find(x => x >= 0);
    return (suivant ?? ordre.length) - 0.5 + d / 1000;
  };
  const ranges = [...blocs].sort((a, b) => (volets && !mep.actif ? ((a.dernier ? 9 : urgences[a.cle] ?? 2) - (b.dernier ? 9 : urgences[b.cle] ?? 2)) : 0) || rang(a.cle) - rang(b.cle));
  const masques = new Set(r.masques || []), demis = new Set(r.demis || []);
  const maj = f => changerMiseEnPage(c => ({ ...c, pages: { ...(c.pages || {}), [page]: f({ ordre: ranges.map(b => b.cle), masques: [...masques], demis: [...demis], ...(c.pages?.[page] || {}) }) } }));
  const basculer = (liste, cle) => maj(p => { const s = new Set(p[liste] || []); s.has(cle) ? s.delete(cle) : s.add(cle); return { ...p, [liste]: [...s] }; });
  const ranger = (de, vers) => maj(p => ({ ...p, ordre: deplacer(ranges.map(b => b.cle), de, vers) }));
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      {ranges.filter(b => mep.actif || !masques.has(b.cle)).map(b => (
        // Un bloc qui n'a rien à montrer ne garde pas sa place : vide, il laissait un trou (11 octobre 2026).
        <div key={b.cle} ref={el => { refs.current[b.cle] = el; }} className={`min-w-0 empty:hidden ${volets ? 'volet' : ''} ${demis.has(b.cle) ? '' : 'lg:col-span-2'} ${mep.actif && masques.has(b.cle) ? 'opacity-40' : ''}`}
          data-ferme={volets && !mep.actif && !ouverts.has(b.cle) ? '1' : undefined} data-urgence={volets ? urgences[b.cle] ?? 2 : undefined}
          onClick={e => basculerVolet(b.cle, e)}
          {...poigneeGlisser(mep.actif, `page:${page}`, b.cle, ranger)}>
          {mep.actif && (
            <div className="flex items-center gap-2 mb-1 px-2 py-1 rounded-champ text-xs" style={{ background: 'color-mix(in srgb, var(--c-attente) 14%, transparent)' }}>
              <IconGripVertical size={14} /><b className="flex-1 truncate">{b.titre}</b>
              <button type="button" className="objet-barre objet-barre-icone !h-6 !min-w-6" title={demis.has(b.cle) ? 'Pleine largeur' : 'Demi-largeur'} onClick={() => basculer('demis', b.cle)}>
                {demis.has(b.cle) ? <IconColumns1 size={14} /> : <IconColumns2 size={14} />}</button>
              <button type="button" className="objet-barre objet-barre-icone !h-6 !min-w-6" title={masques.has(b.cle) ? 'Afficher ce bloc' : 'Masquer ce bloc'} onClick={() => basculer('masques', b.cle)}>
                {masques.has(b.cle) ? <IconEyeOff size={14} /> : <IconEye size={14} />}</button>
            </div>)}
          {b.rendu}
        </div>))}
      {/* UN BLOC MASQUÉ NE DOIT PAS SE FAIRE OUBLIER (Charles, 11 octobre 2026 : « tableau de bord
          vide ! » — le fil et les tâches avaient été masqués). L'administrateur, seul à pouvoir
          les réafficher, le lit ici. */}
      {!mep.actif && getUser()?.role === 'admin' && blocs.some(b => masques.has(b.cle)) && (
        <p className="lg:col-span-2 text-second text-slate-500">
          {blocs.filter(b => masques.has(b.cle)).length} bloc(s) masqué(s) par la mise en page : {blocs.filter(b => masques.has(b.cle)).map(b => b.titre || b.cle).join(', ')}.{' '}
          <button type="button" className="underline" onClick={basculerMiseEnPage}>Mise en page</button> pour les réafficher.
        </p>)}
    </div>
  );
}

/**
 * LES TEXTES DE L'IIP PAR PARTIES — LIRE ET ÉCRIRE (3.1.489, Charles, 30 octobre 2026 : « que les procédures soient
 * aussi sur ce modèle par partie… Lucie deviendrait l'endroit où on les crée, pas où on les importe ; l'endroit aussi
 * pour les imprimer »). Même lecture que le mode d'emploi : un sommaire, une page par partie, des points numérotés
 * (qui, où, le texte, « à savoir »). L'écriture se fait ici, partie par partie, sans fichier à importer.
 * Le format est celui du serveur (lib/textesParties.js) ; c'est lui qui filtre le HTML de chaque point.
 */
import { useState } from 'react';
import {
  IconArrowLeft, IconArrowRight, IconArrowUp, IconArrowDown, IconPlus, IconTrash, IconListNumbers,
} from '@tabler/icons-react';
import { Point } from '../pages/Aide.jsx';
import { STYLE_GUIDE } from './IllustrationsGuide.jsx';
import EditeurTexte from './EditeurTexte.jsx';

/* ══ LIRE ═══════════════════════════════════════════════════════════════════ */

export function LecteurParties({ parties = [] }) {
  const [i, setI] = useState(0);
  const p = parties[Math.min(i, parties.length - 1)];
  if (!p) return null;
  return (
    <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)] items-start">
      <style>{STYLE_GUIDE}</style>
      {/* Le sommaire : sur grand écran à gauche, sur iPad en bandeau. */}
      <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0 md:sticky md:top-0" aria-label="Sommaire">
        {parties.map((x, k) => (
          <button key={k} type="button" onClick={() => setI(k)}
            className={`text-left text-sm rounded-champ px-2.5 py-1.5 flex gap-2 flex-none md:flex-auto ${k === i
              ? 'text-white' : 'text-iip-texte hover:bg-slate-100'}`}
            style={k === i ? { background: 'var(--c-principal)' } : undefined}>
            <span className="tabular-nums opacity-70">{k + 1}.</span>
            <span className="whitespace-nowrap md:whitespace-normal">{x.titre}</span>
          </button>))}
      </nav>
      <div key={i} className="space-y-3 min-w-0">
        <div className="carte p-4">
          <div className="text-second text-slate-500 tabular-nums">Partie {i + 1} sur {parties.length}</div>
          <h3 className="text-lg font-bold text-iip-texte m-0 mt-0.5">{p.titre}</h3>
          {p.resume && <p className="text-sm text-slate-600 m-0 mt-1">{p.resume}</p>}
        </div>
        {p.points.map((pt, k) => <Point key={k} p={pt} n={`${i + 1}.${k + 1}`} delai={0.04 * Math.min(k, 8)} />)}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {i > 0 ? <button type="button" className="bouton" onClick={() => setI(i - 1)}><IconArrowLeft size={15} /> {parties[i - 1].titre}</button> : <span />}
          {i < parties.length - 1 && (
            <button type="button" className="bouton bouton-fort" onClick={() => setI(i + 1)}>
              Partie suivante : {parties[i + 1].titre} <IconArrowRight size={15} /></button>)}
        </div>
      </div>
    </div>
  );
}

/* ══ ÉCRIRE ═════════════════════════════════════════════════════════════════ */

const pointVide = () => ({ titre: '', qui: '', ou: '', contenu: '', savoir: [] });
const partieVide = () => ({ titre: '', resume: '', points: [pointVide()] });
const deplacer = (liste, k, d) => {
  const j = k + d; if (j < 0 || j >= liste.length) return liste;
  const l = [...liste]; [l[k], l[j]] = [l[j], l[k]]; return l;
};

/** Ce qui manque pour publier — dit au pied, à côté du bouton. */
export function manqueParties(parties) {
  if (!parties?.length) return 'Ajoutez une partie.';
  const sansTitre = parties.findIndex(p => !p.titre.trim());
  if (sansTitre >= 0) return `La partie ${sansTitre + 1} n'a pas de titre.`;
  if (!parties.some(p => p.points.some(pt => pt.titre.trim() || pt.contenu.replace(/<[^>]*>/g, '').trim())))
    return 'Écrivez au moins un point.';
  return null;
}

/**
 * L'éditeur : à gauche les parties (ajouter, monter, descendre, retirer), à droite la partie ouverte — son titre, son
 * résumé, puis ses points. Un bouton s'écrit [[Libellé]] dans le texte : il s'y dessinera comme dans Lucie.
 */
export function EditeurParties({ parties, onChange }) {
  const [i, setI] = useState(0);
  const k = Math.min(i, parties.length - 1);
  const p = parties[k];
  const majPartie = (champ, v) => onChange(parties.map((x, j) => (j === k ? { ...x, [champ]: v } : x)));
  const majPoint = (n, champ, v) => majPartie('points', p.points.map((x, j) => (j === n ? { ...x, [champ]: v } : x)));

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)] items-start">
      <div className="space-y-1">
        <div className="intertitre flex items-center gap-1.5"><IconListNumbers size={15} /> Les parties</div>
        {parties.map((x, j) => (
          <div key={j} className="flex items-center gap-1">
            <button type="button" onClick={() => setI(j)}
              className={`flex-1 min-w-0 text-left text-sm rounded-champ px-2 py-1.5 truncate ${j === k ? 'text-white' : 'text-iip-texte hover:bg-slate-100'}`}
              style={j === k ? { background: 'var(--c-principal)' } : undefined}>
              {j + 1}. {x.titre || <i className="opacity-70">sans titre</i>}
            </button>
          </div>))}
        <button type="button" className="bouton text-second w-full justify-center"
          onClick={() => { onChange([...parties, partieVide()]); setI(parties.length); }}>
          <IconPlus size={14} /> Ajouter une partie
        </button>
      </div>

      {p && (
        <div className="space-y-3 min-w-0">
          <div className="carte p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="intertitre flex-1">Partie {k + 1}</span>
              <button type="button" className="bouton text-second" title="Monter" disabled={k === 0}
                onClick={() => { onChange(deplacer(parties, k, -1)); setI(k - 1); }}><IconArrowUp size={14} /></button>
              <button type="button" className="bouton text-second" title="Descendre" disabled={k === parties.length - 1}
                onClick={() => { onChange(deplacer(parties, k, 1)); setI(k + 1); }}><IconArrowDown size={14} /></button>
              <button type="button" className="bouton bouton-detruire text-second" disabled={parties.length === 1}
                onClick={() => { onChange(parties.filter((_, j) => j !== k)); setI(Math.max(0, k - 1)); }}>
                <IconTrash size={14} /> Retirer la partie</button>
            </div>
            <input id={`partie-titre-${k}`} value={p.titre} onChange={e => majPartie('titre', e.target.value)}
              placeholder="Titre de la partie — « Introduire le recours »" className="controle text-sm w-full" />
            <textarea id={`partie-resume-${k}`} value={p.resume} rows={2} data-reponses="non"
              onChange={e => majPartie('resume', e.target.value)}
              placeholder="En une ou deux phrases : ce que couvre cette partie (facultatif)"
              className="w-full text-sm rounded-champ border border-slate-200 px-3 py-2" />
          </div>

          {p.points.map((pt, n) => (
            <div key={n} className="carte p-3 space-y-2" style={{ borderLeft: '3px solid var(--c-principal)' }}>
              <div className="flex items-center gap-1.5">
                <span className="text-second font-semibold text-slate-500 tabular-nums">{k + 1}.{n + 1}</span>
                <input value={pt.titre} onChange={e => majPoint(n, 'titre', e.target.value)}
                  placeholder="Titre du point — « Le délai »" className="controle text-sm flex-1 min-w-0" />
                <button type="button" className="bouton text-second" title="Monter" disabled={n === 0}
                  onClick={() => majPartie('points', deplacer(p.points, n, -1))}><IconArrowUp size={14} /></button>
                <button type="button" className="bouton text-second" title="Descendre" disabled={n === p.points.length - 1}
                  onClick={() => majPartie('points', deplacer(p.points, n, 1))}><IconArrowDown size={14} /></button>
                <button type="button" className="bouton bouton-detruire text-second" title="Retirer le point"
                  onClick={() => majPartie('points', p.points.filter((_, j) => j !== n))}><IconTrash size={14} /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input value={pt.qui} onChange={e => majPoint(n, 'qui', e.target.value)}
                  placeholder="Qui — « Le secrétariat », « La direction »… (facultatif)" className="controle text-sm" />
                <input value={pt.ou} onChange={e => majPoint(n, 'ou', e.target.value)}
                  placeholder="Où dans Lucie — « Étudiants → fiche → Procédures » (facultatif)" className="controle text-sm" />
              </div>
              <EditeurTexte valeur={pt.contenu} importer={false} onChange={h => majPoint(n, 'contenu', h)} />
              <textarea value={(pt.savoir || []).join('\n')} rows={2} data-reponses="non"
                onChange={e => majPoint(n, 'savoir', e.target.value.split('\n'))}
                placeholder="À savoir — une ligne par remarque (facultatif)"
                className="w-full text-sm rounded-champ border border-slate-200 px-3 py-2" />
            </div>))}
          <button type="button" className="bouton text-second" onClick={() => majPartie('points', [...p.points, pointVide()])}>
            <IconPlus size={14} /> Ajouter un point
          </button>
          <p className="text-mention text-slate-500 m-0">
            Pour montrer un bouton de Lucie, écrivez son nom entre doubles crochets : [[Enregistrer]] — il se dessinera
            comme à l'écran, et entre crochets sur le papier.
          </p>
        </div>)}
    </div>
  );
}

/** Ce que le serveur attend : les lignes vides de « à savoir » en moins. */
export const pourPublier = parties => ({
  parties: parties.map(p => ({ ...p, points: p.points.map(pt => ({ ...pt, savoir: (pt.savoir || []).map(s => s.trim()).filter(Boolean) })) })),
});
export const nouvellesParties = () => [partieVide()];

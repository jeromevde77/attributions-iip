import { useEffect, useRef, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { passeRole } from '../lib/droits.js';
import { DESIGN_MAISON, poserDesign } from '../lib/design.js';
import { TuileEtat, PastilleEtat, Encadre } from './ui.jsx';

/**
 * CONFIGURATION → FORMES ET COMPOSANTS (3.1.248, Charles, 10 octobre 2026 :
 * « Lucie devient mature, elle doit être paramétrable et non en dur ; c'est
 * l'administrateur qui règle »). Comme « Thèmes et couleurs » : le réglage
 * s'applique aussitôt à tout l'écran, et s'enregistre une demi-seconde après.
 * Des thèmes pour aller vite, puis chaque réglage à la main. L'aperçu emploie
 * les VRAIS composants : ce qu'on voit ici est ce que l'on verra partout.
 */
const GROUPES = [['rayons', 'Rayons'], ['tuiles', 'Tuiles et pastilles'], ['controles', 'Boutons, champs, onglets'], ['elevations', 'Ombres et fenêtres'], ['texte', 'Texte']];
const THEMES = {
  'Maison IIP': {},
  'Arrondi': { rayon_champ: 12, rayon_carte: 20, rayon_fenetre: 28, rayon_tuile: 14, tuile_coins: 'arrondis', rayon_pastille: 10 },
  'Anguleux': { rayon_champ: 2, rayon_carte: 4, rayon_fenetre: 6, rayon_panneau: 6, rayon_tuile: 2, rayon_pastille: 2, ombre: 'douce' },
  'Compact': { controle_hauteur: 30, texte: 92, titre_ecran: 15, rayon_champ: 6, rayon_carte: 10 },
  'Confort': { controle_hauteur: 42, texte: 110, titre_ecran: 20 },
};

export default function ReglageDesign() {
  const peut = passeRole(['admin']);
  const [cat, setCat] = useState(null);
  const [v, setV] = useState(null);
  const [etat, setEtat] = useState('');
  const minuterie = useRef(null);

  useEffect(() => {
    fetch('/api/config/design', { headers: authHeaders() }).then(r => r.json())
      .then(j => { setCat(j.catalogue || {}); setV(j.design || DESIGN_MAISON); }).catch(() => setEtat('Lecture impossible'));
  }, []);

  function changer(n) {
    setV(n); poserDesign(n);
    if (!peut) return;
    clearTimeout(minuterie.current); setEtat('…');
    minuterie.current = setTimeout(async () => {
      const r = await fetch('/api/config/design', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ design: n }) });
      setEtat(r.ok ? '✓ enregistré' : 'Refusé : seul l’administrateur règle le design');
    }, 500);
  }

  if (!cat || !v) return <div className="text-sm text-slate-400">{etat || 'Chargement…'}</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-second text-slate-600">Thèmes :</span>
        {Object.entries(THEMES).map(([nom, t]) => (
          <button key={nom} className="bouton" disabled={!peut} onClick={() => changer({ ...DESIGN_MAISON, ...t })}>{nom}</button>))}
        <span className="flex-1" />
        <span className="text-second text-slate-500">{peut ? etat : 'Lecture seule : seul l’administrateur règle le design.'}</span>
      </div>
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-[420px] grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {GROUPES.map(([g, titre]) => (
            <div key={g} className="carte p-3 space-y-2">
              <b className="text-sm">{titre}</b>
              {Object.entries(cat).filter(([, d]) => d.groupe === g).map(([k, d]) => (
                <label key={k} className="flex items-center gap-2 text-second">
                  <span className="flex-1">{d.libelle}</span>
                  {d.type === 'choix'
                    ? <select className="controle !h-8" value={v[k]} disabled={!peut} onChange={e => changer({ ...v, [k]: e.target.value })}>
                        {d.choix.map(c => <option key={c} value={c}>{c === 'marquee' ? 'marquée' : c}</option>)}</select>
                    : <>
                        <input type="range" min={d.min} max={d.max} step={1} value={v[k]} disabled={!peut} onChange={e => changer({ ...v, [k]: Number(e.target.value) })} className="w-28" />
                        <span className="w-12 text-right tabular-nums">{v[k]}{d.type === 'px' ? ' px' : ''}</span>
                      </>}
                </label>))}
            </div>))}
        </div>
        <div className="w-[360px] flex-none carte p-3 space-y-3">
          <b className="text-sm">Aperçu</b>
          <div className="titre-ecran" style={{ margin: 0 }}>Titre d’un écran</div>
          <div className="flex flex-wrap gap-2">
            <button className="bouton bouton-fort">Action principale</button>
            <button className="bouton">Neutre</button>
            <select className="controle"><option>Une liste</option></select>
          </div>
          <div className="segments flex h-9"><button className="px-3 bg-iip-blue text-white">Un</button><button className="px-3 bg-white text-slate-600">Deux</button><button className="px-3 bg-white text-slate-600">Trois</button></div>
          <div className="grid grid-cols-3 gap-2">
            <TuileEtat etat="reussi" valeur="42" libelle="Réussis" />
            <TuileEtat etat="surveiller" valeur="7" libelle="Ajournés" />
            <TuileEtat etat="corriger" valeur="3" libelle="Refusés" />
          </div>
          <div className="flex gap-2"><PastilleEtat etat="reussi">réussi</PastilleEtat><PastilleEtat etat="faveur">faveur</PastilleEtat><PastilleEtat etat="corriger">refusé</PastilleEtat></div>
          <Encadre etat="disponible" titre="Un encadré">Une phrase qui porte un état.</Encadre>
          <div className="flex gap-4 border-b border-slate-200"><span className="onglet-page onglet-page-actif">Onglet actif</span><span className="onglet-page">Autre</span></div>
          <div className="rounded-fenetre shadow-dessus bg-white p-3 text-second">Une fenêtre, son rayon et son ombre.</div>
        </div>
      </div>
      <p className="text-second text-slate-500">Ce qui suit les réglages : les composants de la maison (boutons, champs, segments, cartes, tuiles, pastilles, onglets, fenêtres) et l’échelle nommée du texte. Les écrans qui dessinent encore leurs propres tuiles ou boutons y viennent au fil des lots — inventaire dans les notes de conception.</p>
    </div>
  );
}

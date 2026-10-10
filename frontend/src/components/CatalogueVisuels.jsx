import { useState } from 'react';
import { Anneau, Barres, Repartition, Jauge, TrVolet, PastilleEtape, LienEtape } from './graphiques.jsx';
import { Etendue } from './statsUi.jsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';
import { IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { TuileEtat, PastilleEtat, Encadre, Fenetre, Tableau, TableauEntete, Th, Td, Tr, TrTotal, TrGroupe } from './ui.jsx';
import AgendaSemaine from './AgendaSemaine.jsx';
import { couleursGraphique } from '../lib/couleurs.js';
import { reglagesGraphique } from '../lib/design.js';
import { BoutonAnnulerReglage } from '../lib/annulerReglage.jsx';
import { useReglagesVisuels } from '../lib/reglages.js';

/**
 * LE CATALOGUE DES ÉLÉMENTS VISIBLES (3.1.260, Charles, 10 octobre 2026 : « tu n'as
 * pas répertorié tous les visuels — les tableaux, les titres… »). Chaque famille de
 * Lucie, dessinée par ses VRAIS composants, avec les réglages qui la gouvernent.
 * Un élément qui n'est pas ici n'est pas un standard : il se dessine à la main, et
 * c'est à corriger. Une famille nouvelle s'ajoute ici le jour où elle naît.
 */
const R = (cle, lib, toutes = null) => ({ cle, lib, toutes });
// UNE ÉTIQUETTE PEUT NOMMER UNE FAMILLE ENTIÈRE (Charles : « tu ne proposes qu'une série ») :
// les six séries, les cinq états — la boîte de propriétés les montre toutes.
const SERIES = R('serie_1', 'séries', ['serie_1', 'serie_2', 'serie_3', 'serie_4', 'serie_5', 'serie_6']);
const ETATS = R('reussi', 'états', ['reussi', 'faveur', 'disponible', 'attente', 'refuse']);
const FAMILLES = [
  { nom: 'Titres', role: 'Le titre d’un écran (un seul), le titre d’une carte, l’intertitre en petites majuscules.',
    formes: [R('titre_ecran', 'titre d’écran'), R('titre_carte', 'titre de carte'), R('titre_graisse', 'graisse'), R('intertitre_taille', 'intertitre'), R('intertitre_casse', 'casse'), R('intertitre_espace', 'interlettrage')],
    couleurs: [R('titre', 'titres'), R('intertitre', 'intertitres')],
    specimen: () => <div className="space-y-1.5"><div className="titre-ecran" style={{ margin: 0 }}>Titre d’un écran</div><h3 className="titre-carte">Titre d’une carte</h3><div className="intertitre">Intertitre</div></div> },
  { nom: 'Boutons', role: 'Trois emplois et pas un de plus : l’action principale (une par écran), produire une pièce, détruire ; le reste est neutre.',
    formes: [R('controle_hauteur', 'hauteur'), R('rayon_champ', 'rayon'), R('bouton_graisse', 'graisse')],
    couleurs: [R('bouton_fort', 'principal'), R('bouton_sortir', 'produire'), R('bouton_detruire', 'détruire'), R('fond_champ', 'neutre')],
    specimen: () => <div className="flex flex-wrap gap-2"><button className="bouton bouton-fort"><IconPlus size={15} />Principal</button><button className="bouton bouton-sortir"><IconSend size={15} />Produire</button><button className="bouton">Neutre</button><button className="bouton bouton-detruire"><IconTrash size={15} />Détruire</button></div> },
  { nom: 'Champs, listes, segments', role: 'Ce qu’on remplit ou choisit ; le segment dit un choix exclusif.',
    formes: [R('controle_hauteur', 'hauteur'), R('rayon_champ', 'rayon')], couleurs: [R('fond_champ', 'fond'), R('filet', 'contour'), R('segment_actif', 'segment choisi')],
    specimen: () => <div className="flex flex-wrap gap-2 items-center"><input className="controle w-40" placeholder="Un champ" readOnly /><select className="controle"><option>Une liste</option></select><div className="segments flex h-9"><button className="px-3 bg-iip-blue text-white">Un</button><button className="px-3 bg-white text-slate-600">Deux</button></div></div> },
  { nom: 'Onglets', role: 'Le soulignement : quelle face du même objet on regarde.',
    formes: [R('onglet_trait', 'trait')], couleurs: [R('accent', 'trait actif')],
    specimen: () => <div className="flex gap-4 border-b border-slate-200"><span className="onglet-page onglet-page-actif">Actif</span><span className="onglet-page">Autre</span></div> },
  { nom: 'Tuiles', role: 'Un chiffre et son état. Deux tailles : la grande (tableau de bord), la compacte (liste, frise).',
    formes: [R('rayon_tuile', 'rayon'), R('tuile_lisere', 'liseré'), R('tuile_coins', 'coins'), R('tuile_chiffre', 'chiffre'), R('tuile_espace', 'marge'), R('tuile_compacte_chiffre', 'chiffre compact')],
    couleurs: [R('fond_tuile', 'fond'), R('filet', 'contour'), ETATS],
    specimen: () => <div className="space-y-2"><div className="grid grid-cols-3 gap-2"><TuileEtat etat="reussi" valeur="42" libelle="Réussis" /><TuileEtat etat="surveiller" valeur="7" libelle="Ajournés" /><TuileEtat etat="corriger" valeur="3" libelle="Refusés" /></div><div className="flex gap-2"><TuileEtat taille="compacte" etat="faveur" valeur="4" libelle="faveurs" /><TuileEtat taille="compacte" valeur="88" libelle="inscrits" /></div></div> },
  { nom: 'Encadrés', role: 'Une phrase qui porte un état — la même forme que la tuile.',
    formes: [R('tuile_lisere', 'liseré'), R('rayon_tuile', 'rayon')], couleurs: [R('fond_tuile', 'fond'), ETATS],
    specimen: () => <Encadre etat="surveiller" titre="Un encadré">Trois recevabilités restent à contrôler.</Encadre> },
  { nom: 'Pastilles', role: 'Un état en ligne, plein, texte blanc.',
    formes: [R('rayon_pastille', 'rayon')], couleurs: [ETATS],
    specimen: () => <div className="flex gap-2"><PastilleEtat etat="reussi">réussi</PastilleEtat><PastilleEtat etat="faveur">faveur</PastilleEtat><PastilleEtat etat="surveiller">ajourné</PastilleEtat><PastilleEtat etat="corriger">refusé</PastilleEtat></div> },
  { nom: 'Tableaux', role: 'En-tête, lignes, regroupement, total (en premier, sous l’en-tête).',
    formes: [R('tableau_densite', 'densité'), R('tableau_zebre', 'alternance'), R('tableau_filets', 'filets'), R('tableau_entete_taille', 'en-tête'), R('rayon_carte', 'rayon')],
    couleurs: [R('fond_entete', 'en-tête'), R('fond_ligne', 'lignes'), R('fond_survol', 'survol'), R('tableau_total', 'total'), R('filet', 'filets')],
    specimen: () => <Tableau><thead><TableauEntete><Th>Section</Th><Th align="droite">Inscrits</Th></TableauEntete></thead><tbody><TrTotal><Td>Total</Td><Td align="droite">588</Td></TrTotal><TrGroupe><Td>Bacheliers</Td><Td /></TrGroupe><Tr><Td>TIM</Td><Td align="droite">312</Td></Tr><Tr><Td>Psychomotricité</Td><Td align="droite">190</Td></Tr><Tr><Td>AeSI</Td><Td align="droite">86</Td></Tr></tbody></Tableau> },
  { nom: 'Graphiques', role: 'Six séries dans l’ordre, la part vide, la grille, la référence.',
    formes: [R('graphique_rayon', 'rayon des barres'), R('graphique_grille', 'quadrillage'), R('graphique_legende', 'légende')],
    couleurs: [SERIES, R('graphique_vide', 'part vide'), R('graphique_grille', 'grille'), R('graphique_reference', 'référence')],
    specimen: () => { const G = couleursGraphique(), g = reglagesGraphique(); const d = [{ n: 'BA1', a: 120, b: 80, c: 30 }, { n: 'BA2', a: 90, b: 70, c: 20 }, { n: 'BA3', a: 60, b: 50, c: 15 }];
      return <div style={{ height: 170 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={d}>
        {g.grille !== 'aucun' && <CartesianGrid strokeDasharray={g.grille === 'plein' ? '0' : '3 3'} stroke={G.grille} />}
        <XAxis dataKey="n" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
        {g.legende !== 'aucune' && <Legend verticalAlign={g.legende === 'haut' ? 'top' : 'bottom'} iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        <Bar dataKey="a" name="Série 1" fill={G.series[0]} radius={g.rayon} /><Bar dataKey="b" name="Série 2" fill={G.series[1]} radius={g.rayon} /><Bar dataKey="c" name="Série 3" fill={G.series[2]} radius={g.rayon} />
      </BarChart></ResponsiveContainer></div>; } },
  { nom: 'Anneau (diagramme rond)', role: 'Les parts d’un tout, avec leur pourcentage ; la part vide quand il n’y a rien.',
    formes: [R('anneau_epaisseur', 'épaisseur')], couleurs: [SERIES, R('graphique_vide', 'part vide')],
    specimen: () => <Anneau centre="588" parts={[{ nom: 'TIM', valeur: 312 }, { nom: 'Psychomotricité', valeur: 190 }, { nom: 'AeSI', valeur: 86 }]} taille={120} /> },
  { nom: 'Barres horizontales', role: 'Des grandeurs à comparer, à l’échelle de la plus grande.',
    formes: [R('barre_hauteur', 'hauteur'), R('rayon_pastille', 'rayon')], couleurs: [SERIES, R('graphique_piste', 'fond')],
    specimen: () => <Barres lignes={[{ nom: 'Belgique', valeur: 420 }, { nom: 'France', valeur: 61 }, { nom: 'Maroc', valeur: 38 }]} /> },
  { nom: 'Répartition et jauge', role: 'Un tout coupé en états sur une ligne ; une part d’un objectif.',
    formes: [R('jauge_hauteur', 'hauteur'), R('jauge_forme', 'bouts')], couleurs: [ETATS, R('graphique_piste', 'fond')],
    specimen: () => <div className="space-y-2"><Repartition className="w-full" parts={[{ nom: 'réussi', valeur: 38, couleur: 'var(--c-reussi)' }, { nom: 'ajourné', valeur: 12, couleur: 'var(--c-attente)' }, { nom: 'refusé', valeur: 3, couleur: 'var(--c-refuse)' }]} /><Jauge valeur={72} etat="disponible" /><Jauge valeur={104} etat="corriger" /></div> },
  { nom: 'Étendue des notes', role: 'Du minimum au maximum, la médiane et la moyenne : la forme d’une distribution d’un coup d’œil.',
    formes: [R('jauge_hauteur', 'hauteur')], couleurs: [R('principal', 'repères'), R('graphique_piste', 'fond')],
    specimen: () => <div className="pt-2 pb-4"><Etendue d={{ min: 6, max: 18, mediane: 12, moyenne: 11.8 }} /></div> },
  { nom: 'Tableau à volets', role: 'Une ligne qui se déplie : le chevron dans la première cellule, le détail dessous, sur toute la largeur.',
    formes: [R('volet_retrait', 'retrait'), R('tableau_densite', 'densité')], couleurs: [R('fond_volet', 'détail'), R('fond_survol', 'survol')],
    specimen: ({ volet, setVolet }) => <Tableau><thead><TableauEntete><Th>Étudiant</Th><Th align="droite">UE</Th></TableauEntete></thead><tbody>
      <TrVolet cellules={['DUPONT Marie', '6']} ouvert={volet === 1} onBascule={() => setVolet(v => (v === 1 ? 0 : 1))} detail={<span className="text-second">246 · 248 · 249 · 254 · 257 · 260</span>} />
      <TrVolet cellules={['MARTIN Paul', '5']} ouvert={volet === 2} onBascule={() => setVolet(v => (v === 2 ? 0 : 2))} detail={<span className="text-second">246 · 248 · 254 · 257 · 260</span>} />
    </tbody></Tableau> },
  { nom: 'Frises d’étapes', role: 'Un circuit : étapes faites (vert, coche), courante (principal), à venir (blanche), refus (brique) ; le trait se remplit derrière ce qui est fait.',
    formes: [R('etape_taille', 'taille')], couleurs: [R('reussi', 'faite'), R('principal', 'courante'), R('refuse', 'refus')],
    specimen: () => <ol className="flex items-start m-0 p-0 list-none">{[['Demande', 'fait'], ['Recevabilité', 'fait'], ['Avis', 'courant'], ['Décision', 'avenir'], ['Validation', 'avenir']].map(([l, e], i, t) => (
      <li key={l} className="flex-1 min-w-0 relative">{i > 0 && <LienEtape fait={t[i - 1][1] === 'fait'} className="absolute top-[13px] right-1/2 w-full" />}
        <div className="relative z-10 flex flex-col items-center text-center"><PastilleEtape n={i + 1} etat={e} /><span className="mt-1 text-second">{l}</span></div></li>))}</ol> },
  { nom: 'Agenda de la semaine', role: 'La base de l’école et ce qu’on y peint (enseignants, sections, cours, locaux).',
    formes: [R('rayon_champ', 'rayon')], couleurs: [R('reussi', 'libre'), R('attente', 'éventuellement'), R('refuse', 'jamais'), R('principal', 'base')],
    specimen: () => <div style={{ maxWidth: 300 }}><AgendaSemaine compact jours={[1, 2, 3]} base={[{ jour: 1, debut: '08:00', fin: '10:00' }, { jour: 2, debut: '08:00', fin: '10:00' }, { jour: 3, debut: '10:15', fin: '12:15' }]} valeur={(j) => (j === 2 ? 0 : j === 3 ? 2 : 1)} /></div> },
  { nom: 'Fenêtres', role: 'Une seule fenêtre : bandeau, corps, pied qui ne défile pas ; le même voile partout.',
    formes: [R('rayon_fenetre', 'rayon'), R('voile', 'voile'), R('voile_flou', 'flou'), R('ombre', 'ombre')],
    couleurs: [R('fenetre_bandeau', 'bandeau'), R('fenetre_titre', 'titre'), R('fenetre_corps', 'corps'), R('fenetre_pied', 'pied')],
    specimen: ({ ouvrir }) => <button className="bouton" onClick={ouvrir}>Ouvrir une fenêtre</button> },
  { nom: 'Barre du haut et rail', role: 'Un seul objet de barre (icône, étiquette, état plein) ; le rail, ses rubriques et son sous-menu.',
    formes: [R('controle_hauteur', 'hauteur'), R('rayon_champ', 'rayon'), R('rayon_panneau', 'rail')],
    couleurs: [R('fond_menus', 'fond'), R('sous_menu', 'sous-menu'), R('menu_sombre', 'mode sombre')],
    specimen: () => <div className="flex gap-2 items-center"><span className="objet-barre">v3.1</span><span className="objet-barre">SC</span><span className="objet-barre objet-barre-etat" style={{ '--e': 'var(--c-attente)' }}>DEV</span></div> },
];

const LIB = { marquee: 'marquée', serree: 'serrée', aeree: 'aérée', pointille: 'pointillé', horizontaux: 'filets horizontaux', grille: 'grille complète' };

/* LES JEUX DE COULEURS (Charles : « prévois plutôt des jeux de couleurs ») : six séries
   choisies ensemble, qui vont ensemble — un clic, puis on retouche une série si besoin. */
export const JEUX_SERIES = [
  ['Lucie (actuel)', ['#19537E', '#05B7E6', '#F9B619', '#8E4F9A', '#4FA64A', '#D14F8A']],
  ['Uniforme', null],   // six nuances de la couleur principale de l'école, calculées
  ['Sombre', ['#0F2A47', '#1F4E5F', '#3B3B58', '#4A3F35', '#24493A', '#5A2E3A']],
  ['Argent', ['#3F4752', '#5B6573', '#7A8494', '#9AA3B1', '#BCC3CD', '#DCE0E6']],
  ['Contrastée (daltoniens)', ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00']],
  ['Douce', ['#4E79A7', '#A0CBE8', '#F28E2B', '#FFBE7D', '#59A14F', '#8CD17D']],
  ['Bleus', ['#0B3D66', '#19537E', '#2F6FB0', '#5A93D1', '#8DB8E8', '#C3DBF5']],
  ['Sobre', ['#16406A', '#6B7A90', '#9AA6B8', '#C3CAD6', '#0A8FBF', '#E0E5EC']],
  ['Vive', ['#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231', '#911EB4']],
];
/** Six nuances d'une teinte : de la couleur elle-même vers le clair. */
function camaieu(hex) {
  const c = String(hex || '#16406A').slice(1).match(/../g).map(x => parseInt(x, 16));
  return [0, 0.22, 0.4, 0.56, 0.7, 0.82].map(k => '#' + c.map(v => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('').toUpperCase());
}
function JeuxSeries({ rv }) {
  const actuel = [1, 2, 3, 4, 5, 6].map(i => String(rv.couleurDe(`serie_${i}`)).toUpperCase()).join();
  return (
    <div className="space-y-1.5">
      <div className="intertitre pt-1">Jeux de couleurs</div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        {JEUX_SERIES.map(([nom, c0]) => { const c = c0 || camaieu(rv.couleurDe('principal')); const choisi = c.join() === actuel; return (
          <button key={nom} type="button" disabled={!rv.peutCouleurs} onClick={() => rv.changerCouleurs(Object.fromEntries(c.map((x, i) => [`serie_${i + 1}`, x])))}
            className={`flex flex-col gap-1 p-1.5 rounded-champ border text-left ${choisi ? 'border-[color:var(--c-principal)] ring-1 ring-[color:var(--c-principal)]' : 'border-slate-200 hover:border-slate-400'}`}>
            <span className="flex h-4 rounded-pastille overflow-hidden">{c.map(x => <span key={x} className="flex-1" style={{ background: x }} />)}</span>
            <span className="text-mention">{nom}{choisi ? ' ✓' : ''}</span>
          </button>); })}
      </div>
    </div>);
}

/** Les réglages d'une famille, sous son spécimen. */
function PanneauReglages({ f, rv, cible }) {
  const formes = f.formes.filter(r => rv.catDesign[r.cle]);
  const couleurs = f.couleurs.flatMap(r => (r.toutes ? r.toutes.map(c => ({ cle: c, vise: r.cle })) : [r])).filter(r => rv.catCouleurs[r.cle]);
  return (
    <div className="space-y-2">
      {formes.length > 0 && <div className="intertitre pt-1">Formes</div>}
      {formes.map(r => { const d = rv.catDesign[r.cle], v = rv.design?.[r.cle] ?? d.valeur; return (
        <label key={r.cle} ref={el => { if (el && cible === r.cle) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
          className={`flex items-center gap-2 text-second rounded-champ px-1 -mx-1 ${cible === r.cle ? 'reglage-vise' : ''}`}>
          <span className="flex-1">{d.libelle}</span>
          {d.type === 'choix'
            ? <select className="controle !h-8" value={v} disabled={!rv.peutFormes} onChange={e => rv.changerForme(r.cle, e.target.value)}>{d.choix.map(c => <option key={c} value={c}>{LIB[c] || c}</option>)}</select>
            : <><input type="range" min={d.min} max={d.max} value={v} disabled={!rv.peutFormes} onChange={e => rv.changerForme(r.cle, Number(e.target.value))} className="w-28" />
                <span className="w-12 text-right tabular-nums">{v}{d.type === 'px' ? ' px' : ''}</span></>}
          {v !== d.valeur && rv.peutFormes && <button className="text-mention text-slate-400 hover:text-iip-blue" onClick={() => rv.changerForme(r.cle, d.valeur)} title="Valeur de la maison">défaut</button>}
        </label>); })}
      {couleurs.some(r => r.cle === 'serie_1') && <JeuxSeries rv={rv} />}
      {couleurs.length > 0 && <div className="intertitre pt-3">Couleurs</div>}
      {couleurs.map(r => { const d = rv.catCouleurs[r.cle], regle = !!rv.couleurs?.[r.cle] && rv.couleurs[r.cle] !== d.valeur; return (
        <label key={r.cle} ref={el => { if (el && cible === r.cle) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
          className={`flex items-center gap-2 text-second rounded-champ px-1 -mx-1 ${cible === r.cle || cible === r.vise ? 'reglage-vise' : ''}`}>
          <span className="flex-1">{d.libelle}{!regle && d.suit ? <span className="text-slate-400"> — suit {rv.catCouleurs[d.suit]?.libelle?.toLowerCase() || d.suit}</span> : null}</span>
          <input type="color" value={rv.couleurDe(r.cle)} disabled={!rv.peutCouleurs} onChange={e => rv.changerCouleur(r.cle, e.target.value.toUpperCase())} className="w-10 h-7 rounded-champ border border-slate-300 bg-white p-0.5" />
          {regle && rv.peutCouleurs && <button className="text-mention text-slate-400 hover:text-iip-blue" onClick={() => rv.changerCouleur(r.cle, d.valeur || null)}>défaut</button>}
        </label>); })}
      {!rv.peutFormes && <p className="text-mention text-slate-400">Les formes ne se règlent que par l’administrateur.</p>}
    </div>);
}

export default function CatalogueVisuels() {
  const rv = useReglagesVisuels();
  const [ouvert, setOuvert] = useState(null);
  const [cible, setCible] = useState(null);   // le réglage visé par l'étiquette cliquée
  const [fen, setFen] = useState(false);
  const [volet, setVolet] = useState(1);
  // UN CLIC RESTE SUR PLACE (Charles : « quand je clique sur les éléments, soit il va dans couleur, soit il quitte »).
  // L'étiquette ouvre les réglages de sa famille, sous le spécimen, et y désigne le sien.
  const chip = (r, onglet, f) => <button type="button" key={r.cle} onClick={() => { setOuvert(f.nom); setCible(r.cle); }}
    className="pastille-etat cursor-pointer" data-etat={onglet === 'design' ? 'neutre' : 'disponible'} title="Régler ici">{r.lib}</button>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><span className="flex-1" /><span className="text-second text-slate-500">{rv.etat}</span></div>
      <p className="text-sm text-slate-600 max-w-[900px]">Chaque élément visible de Lucie, dessiné par ses vrais composants. Cliquez sur un élément, ou sur une de ses étiquettes (grises : <b>formes</b> ; bleues : <b>couleurs</b>), pour ouvrir ses propriétés. Un élément absent d’ici n’est pas un standard : il est dessiné à la main, et il est à ramener ici. <b>« Régler »</b> ouvre les réglages d’une famille sous son spécimen : le changement s’applique aussitôt à tout Lucie.</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
        {FAMILLES.map(f => (
          <div key={f.nom} className="carte p-3 space-y-2 min-w-0">
            <div className="flex items-center gap-2"><h3 className="titre-carte flex-1">{f.nom}</h3>
              <button className="bouton bouton-compact" onClick={() => { setCible(null); setOuvert(f.nom); }}>Propriétés…</button></div>
            <p className="text-second text-slate-500">{f.role}</p>
            <div className="py-2 cursor-pointer rounded-champ hover:bg-[color:rgb(var(--gris-50))]" title="Cliquer pour régler"
              onClick={() => { setCible(null); setOuvert(f.nom); }}>{f.specimen({ ouvrir: () => setFen(true), volet, setVolet })}</div>
            <div className="flex flex-wrap gap-1 items-center"><span className="intertitre mr-1">Formes</span>{f.formes.map(r => chip(r, 'design', f))}</div>
            <div className="flex flex-wrap gap-1 items-center"><span className="intertitre mr-1">Couleurs</span>{f.couleurs.map(r => chip(r, 'couleurs', f))}</div>

          </div>))}
      </div>
      {/* LA BOÎTE DE PROPRIÉTÉS (Charles : « plutôt une boîte de dialogue qui change les
          propriétés »). Le spécimen à gauche, en direct ; les propriétés à droite, la
          propriété cliquée mise en évidence. Chaque changement vaut aussitôt pour tout Lucie. */}
      {ouvert && (() => { const f = FAMILLES.find(x => x.nom === ouvert); return f && (
        <Fenetre titre={`Propriétés — ${f.nom}`} sous={f.role} large="grande" onFermer={() => { setOuvert(null); setCible(null); }}
          pied={<><span className="text-second text-slate-500 min-w-0 flex-1">{rv.etat || 'Chaque changement s’applique aussitôt à tout Lucie et s’enregistre seul.'}</span>{(rv.peutFormes || rv.peutCouleurs) && <BoutonAnnulerReglage quoi={['design', 'couleurs']} />}<button className="bouton bouton-fort" onClick={() => { setOuvert(null); setCible(null); }}>Fermer</button></>}>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
            <div className="min-w-0"><div className="intertitre mb-2">Aperçu</div><div className="carte p-3">{f.specimen({ ouvrir: () => setFen(true), volet, setVolet })}</div></div>
            <div className="min-w-0">{rv.design && rv.couleurs ? <PanneauReglages f={f} rv={rv} cible={cible} /> : <span className="text-second text-slate-400">Chargement…</span>}</div>
          </div>
        </Fenetre>); })()}
      {fen && <Fenetre titre="Une fenêtre" sous="Bandeau, corps et pied réglables" onFermer={() => setFen(false)}
        pied={<><span className="text-second text-slate-500">Le pied ne défile jamais.</span><button className="bouton" onClick={() => setFen(false)}>Fermer</button><button className="bouton bouton-fort">Enregistrer</button></>}>
        <p className="text-sm">Le corps de la fenêtre.</p></Fenetre>}
    </div>
  );
}

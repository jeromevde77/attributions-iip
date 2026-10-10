import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts';
import { IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { TuileEtat, PastilleEtat, Encadre, Fenetre, Tableau, TableauEntete, Th, Td, Tr, TrTotal, TrGroupe } from './ui.jsx';
import AgendaSemaine from './AgendaSemaine.jsx';
import { couleursGraphique } from '../lib/couleurs.js';
import { reglagesGraphique } from '../lib/design.js';

/**
 * LE CATALOGUE DES ÉLÉMENTS VISIBLES (3.1.260, Charles, 10 octobre 2026 : « tu n'as
 * pas répertorié tous les visuels — les tableaux, les titres… »). Chaque famille de
 * Lucie, dessinée par ses VRAIS composants, avec les réglages qui la gouvernent.
 * Un élément qui n'est pas ici n'est pas un standard : il se dessine à la main, et
 * c'est à corriger. Une famille nouvelle s'ajoute ici le jour où elle naît.
 */
const R = (cle, lib) => ({ cle, lib });
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
    couleurs: [R('fond_tuile', 'fond'), R('filet', 'contour'), R('reussi', 'états…')],
    specimen: () => <div className="space-y-2"><div className="grid grid-cols-3 gap-2"><TuileEtat etat="reussi" valeur="42" libelle="Réussis" /><TuileEtat etat="surveiller" valeur="7" libelle="Ajournés" /><TuileEtat etat="corriger" valeur="3" libelle="Refusés" /></div><div className="flex gap-2"><TuileEtat taille="compacte" etat="faveur" valeur="4" libelle="faveurs" /><TuileEtat taille="compacte" valeur="88" libelle="inscrits" /></div></div> },
  { nom: 'Encadrés', role: 'Une phrase qui porte un état — la même forme que la tuile.',
    formes: [R('tuile_lisere', 'liseré'), R('rayon_tuile', 'rayon')], couleurs: [R('fond_tuile', 'fond'), R('attente', 'états…')],
    specimen: () => <Encadre etat="surveiller" titre="Un encadré">Trois recevabilités restent à contrôler.</Encadre> },
  { nom: 'Pastilles', role: 'Un état en ligne, plein, texte blanc.',
    formes: [R('rayon_pastille', 'rayon')], couleurs: [R('reussi', 'états…')],
    specimen: () => <div className="flex gap-2"><PastilleEtat etat="reussi">réussi</PastilleEtat><PastilleEtat etat="faveur">faveur</PastilleEtat><PastilleEtat etat="surveiller">ajourné</PastilleEtat><PastilleEtat etat="corriger">refusé</PastilleEtat></div> },
  { nom: 'Tableaux', role: 'En-tête, lignes, regroupement, total (en premier, sous l’en-tête).',
    formes: [R('tableau_densite', 'densité'), R('tableau_zebre', 'alternance'), R('tableau_filets', 'filets'), R('tableau_entete_taille', 'en-tête'), R('rayon_carte', 'rayon')],
    couleurs: [R('fond_entete', 'en-tête'), R('fond_ligne', 'lignes'), R('fond_survol', 'survol'), R('tableau_total', 'total'), R('filet', 'filets')],
    specimen: () => <Tableau><thead><TableauEntete><Th>Section</Th><Th align="droite">Inscrits</Th></TableauEntete></thead><tbody><TrTotal><Td>Total</Td><Td align="droite">588</Td></TrTotal><TrGroupe><Td>Bacheliers</Td><Td /></TrGroupe><Tr><Td>TIM</Td><Td align="droite">312</Td></Tr><Tr><Td>Psychomotricité</Td><Td align="droite">190</Td></Tr><Tr><Td>AeSI</Td><Td align="droite">86</Td></Tr></tbody></Tableau> },
  { nom: 'Graphiques', role: 'Six séries dans l’ordre, la part vide, la grille, la référence.',
    formes: [R('graphique_rayon', 'rayon des barres'), R('graphique_grille', 'quadrillage'), R('graphique_legende', 'légende')],
    couleurs: [R('serie_1', 'séries'), R('graphique_vide', 'part vide'), R('graphique_grille', 'grille'), R('graphique_reference', 'référence')],
    specimen: () => { const G = couleursGraphique(), g = reglagesGraphique(); const d = [{ n: 'BA1', a: 120, b: 80, c: 30 }, { n: 'BA2', a: 90, b: 70, c: 20 }, { n: 'BA3', a: 60, b: 50, c: 15 }];
      return <div style={{ height: 170 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={d}>
        {g.grille !== 'aucun' && <CartesianGrid strokeDasharray={g.grille === 'plein' ? '0' : '3 3'} stroke={G.grille} />}
        <XAxis dataKey="n" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
        {g.legende !== 'aucune' && <Legend verticalAlign={g.legende === 'haut' ? 'top' : 'bottom'} iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        <Bar dataKey="a" name="Série 1" fill={G.series[0]} radius={g.rayon} /><Bar dataKey="b" name="Série 2" fill={G.series[1]} radius={g.rayon} /><Bar dataKey="c" name="Série 3" fill={G.series[2]} radius={g.rayon} />
      </BarChart></ResponsiveContainer></div>; } },
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

export default function CatalogueVisuels() {
  const [fen, setFen] = useState(false);
  const chip = (r, onglet) => <a key={r.cle} href={`/configuration?onglet=${onglet}`} className="pastille-etat" data-etat={onglet === 'design' ? 'neutre' : 'disponible'} title={`Régler : ${r.cle}`}>{r.lib}</a>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 max-w-[900px]">Chaque élément visible de Lucie, dessiné par ses vrais composants. Les étiquettes grises mènent aux <b>formes</b> (Formes et composants), les bleues aux <b>couleurs</b> (Thèmes et couleurs). Un élément absent d’ici n’est pas un standard : il est dessiné à la main, et il est à ramener ici.</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
        {FAMILLES.map(f => (
          <div key={f.nom} className="carte p-3 space-y-2 min-w-0">
            <h3 className="titre-carte">{f.nom}</h3>
            <p className="text-second text-slate-500">{f.role}</p>
            <div className="py-2">{f.specimen({ ouvrir: () => setFen(true) })}</div>
            <div className="flex flex-wrap gap-1 items-center"><span className="intertitre mr-1">Formes</span>{f.formes.map(r => chip(r, 'design'))}</div>
            <div className="flex flex-wrap gap-1 items-center"><span className="intertitre mr-1">Couleurs</span>{f.couleurs.map(r => chip(r, 'couleurs'))}</div>
          </div>))}
      </div>
      {fen && <Fenetre titre="Une fenêtre" sous="Bandeau, corps et pied réglables" onFermer={() => setFen(false)}
        pied={<><span className="text-second text-slate-500">Le pied ne défile jamais.</span><button className="bouton" onClick={() => setFen(false)}>Fermer</button><button className="bouton bouton-fort">Enregistrer</button></>}>
        <p className="text-sm">Le corps de la fenêtre.</p></Fenetre>}
    </div>
  );
}

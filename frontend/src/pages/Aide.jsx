import { useState } from 'react';
import { IconSearch, IconX, IconChevronRight, IconChevronDown, IconHelpCircle } from '@tabler/icons-react';

/* ── Illustrations SVG schématiques ────────────────────────────────────────── */

const IlluNav = () => (
  <svg viewBox="0 0 400 80" className="w-full rounded-lg border border-gray-200 bg-gray-50">
    <rect x="0" y="0" width="400" height="80" fill="#1B2B4B" rx="4"/>
    <rect x="10" y="25" width="60" height="30" fill="#00AACC" rx="4"/>
    <text x="40" y="45" fill="white" fontSize="10" textAnchor="middle" fontFamily="sans-serif">Lucie</text>
    {['Attributions','Personnel','Listes','Procédures','Pilotage'].map((t,i) => (
      <g key={t}>
        <rect x={90+i*62} y="28" width={58} height="24" fill={i===0?"#00AACC":"transparent"} rx="3"/>
        <text x={119+i*62} y="44" fill={i===0?"white":"rgba(255,255,255,0.7)"} fontSize="9" textAnchor="middle" fontFamily="sans-serif">{t}</text>
      </g>
    ))}
    <rect x="335" y="20" width="55" height="40" fill="rgba(255,255,255,0.1)" rx="4"/>
    <text x="362" y="36" fill="white" fontSize="8" textAnchor="middle" fontFamily="sans-serif">Charles S.</text>
    <text x="362" y="48" fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle" fontFamily="sans-serif">admin</text>
  </svg>
);

const IlluAttributions = () => (
  <svg viewBox="0 0 400 160" className="w-full rounded-lg border border-gray-200 bg-white">
    <rect x="0" y="0" width="90" height="160" fill="#1B2B4B" rx="4"/>
    <text x="45" y="20" fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle" fontFamily="sans-serif">VUE</text>
    {['Par section','Vue complète'].map((t,i)=>(
      <rect key={t} x="5" y={28+i*28} width="80" height="22" fill={i===0?"#00AACC":"transparent"} rx="3"/>
    ))}
    <text x="45" y="43" fill="white" fontSize="8" textAnchor="middle" fontFamily="sans-serif">Par section</text>
    <text x="45" y="71" fill="rgba(255,255,255,0.6)" fontSize="8" textAnchor="middle" fontFamily="sans-serif">Vue complète</text>
    <text x="45" y="105" fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle" fontFamily="sans-serif">FILTRES</text>
    <rect x="5" y="112" width="80" height="14" fill="rgba(255,255,255,0.1)" rx="2"/>
    <text x="45" y="123" fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle" fontFamily="sans-serif">— Toutes —</text>
    {/* Zone principale */}
    <rect x="98" y="5" width="297" height="30" fill="#f8fafc" rx="3"/>
    <text x="108" y="25" fill="#1B2B4B" fontSize="11" fontFamily="sans-serif" fontWeight="bold">Optique</text>
    <text x="300" y="25" fill="#6b7280" fontSize="9" fontFamily="sans-serif">5 UE · 12 cours · 8 profs · 320p</text>
    <line x1="98" y1="40" x2="395" y2="40" stroke="#e5e7eb"/>
    <rect x="98" y="45" width="297" height="22" fill="#eff6ff" rx="2"/>
    <text x="108" y="60" fill="#1e40af" fontSize="9" fontFamily="sans-serif">▶ UE 101 — Anatomie et physiologie — BA1 — Q1</text>
    <rect x="98" y="72" width="297" height="18" fill="white" rx="0"/>
    <text x="118" y="85" fill="#374151" fontSize="8" fontFamily="sans-serif">101.1 — Cours magistral</text>
    <text x="300" y="85" fill="#6b7280" fontSize="8" fontFamily="sans-serif">CT   Ts   MARTIN S.   40p</text>
    <rect x="98" y="93" width="297" height="18" fill="#fafafa"/>
    <text x="118" y="106" fill="#374151" fontSize="8" fontFamily="sans-serif">101.2 — Travaux pratiques</text>
    <text x="300" y="106" fill="#6b7280" fontSize="8" fontFamily="sans-serif">PP    A   DUBOIS T.   20p</text>
  </svg>
);

const IlluPersonnel = () => (
  <svg viewBox="0 0 400 120" className="w-full rounded-lg border border-gray-200 bg-white">
    <text x="10" y="20" fill="#1B2B4B" fontSize="13" fontWeight="bold" fontFamily="sans-serif">Membres du personnel (139)</text>
    <rect x="270" y="5" width="120" height="22" fill="#f3f4f6" rx="11"/>
    <text x="330" y="20" fill="#9ca3af" fontSize="9" textAnchor="middle" fontFamily="sans-serif">Rechercher…</text>
    {/* Tableau */}
    <rect x="0" y="30" width="400" height="18" fill="#f8fafc"/>
    <text x="30" y="43" fill="#6b7280" fontSize="8" fontFamily="sans-serif">Nom et prénom</text>
    <text x="160" y="43" fill="#6b7280" fontSize="8" fontFamily="sans-serif">Email</text>
    <text x="290" y="43" fill="#6b7280" fontSize="8" fontFamily="sans-serif">Périodes</text>
    <text x="340" y="43" fill="#6b7280" fontSize="8" fontFamily="sans-serif">Anc. PO</text>
    {[
      ['BAGAYOKO Daouda','bagayoko@…',61,0,'#dcfce7'],
      ['ADAM Sylvie','sylvie.adam@…',318,12,'white'],
      ['BERLEMONT Christophe','christophe.b@…',240,8,'white'],
    ].map(([nom,mail,per,anc,bg],i)=>(
      <g key={nom}>
        <rect x="0" y={50+i*22} width="400" height="22" fill={bg}/>
        {bg!=='white'&&<rect x="0" y={50+i*22} width="3" height="22" fill="#16a34a"/>}
        <text x="30" y={65+i*22} fill="#111827" fontSize="9" fontFamily="sans-serif" fontWeight={bg!=='white'?'bold':'normal'}>{nom}</text>
        {bg!=='white'&&<rect x="88" y={54+i*22} width="22" height="11" fill="#16a34a" rx="5"/>}
        {bg!=='white'&&<text x="99" y={63+i*22} fill="white" fontSize="7" textAnchor="middle" fontFamily="sans-serif">NEW</text>}
        <text x="160" y={65+i*22} fill="#6b7280" fontSize="8" fontFamily="sans-serif">{mail}</text>
        <text x="300" y={65+i*22} fill="#1B2B4B" fontSize="9" fontFamily="sans-serif" fontWeight="bold">{per}</text>
        <text x="345" y={65+i*22} fill="#374151" fontSize="9" fontFamily="sans-serif">{anc}</text>
      </g>
    ))}
  </svg>
);

const IlluRecrutement = () => (
  <svg viewBox="0 0 400 130" className="w-full rounded-lg border border-gray-200 bg-white">
    {/* Rail */}
    <rect x="0" y="0" width="90" height="130" fill="#1B2B4B" rx="4"/>
    <text x="45" y="18" fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle" fontFamily="sans-serif">VUE</text>
    {['Candidats (11)','Cours à pourvoir','Vue parallèle'].map((t,i)=>(
      <g key={t}>
        <rect x="5" y={24+i*24} width="80" height="20" fill={i===0?"#00AACC":"transparent"} rx="3"/>
        <text x="45" y={38+i*24} fill={i===0?"white":"rgba(255,255,255,0.6)"} fontSize="7.5" textAnchor="middle" fontFamily="sans-serif">{t}</text>
      </g>
    ))}
    <text x="45" y="103" fill="rgba(255,255,255,0.5)" fontSize="7" textAnchor="middle" fontFamily="sans-serif">ACTIONS</text>
    <rect x="5" y="108" width="80" height="18" fill="#16a34a" rx="3"/>
    <text x="45" y="121" fill="white" fontSize="8" textAnchor="middle" fontFamily="sans-serif">+ Nouveau candidat</text>
    {/* Liste candidats */}
    {[
      ['BAGAYOKO','Droit, législation…','4.7/5','#16a34a'],
      ['Dacier','Construction de son projet…','4.5/5','#00AACC'],
      ['Delveaux','—','3.9/5','#d97706'],
    ].map(([nom,cours,note,col],i)=>(
      <g key={nom}>
        <rect x="98" y={5+i*40} width="295" height="36" fill={i===0?"#f0fdf4":"white"} rx="4" stroke="#e5e7eb" strokeWidth="1"/>
        <circle cx="116" cy={23+i*40} r="9" fill="#e5e7eb"/>
        <text x="116" y={27+i*40} fill="#374151" fontSize="9" textAnchor="middle" fontFamily="sans-serif">{nom[0]}</text>
        <text x="132" y={20+i*40} fill="#111827" fontSize="9" fontWeight="bold" fontFamily="sans-serif">{nom}</text>
        <text x="132" y={32+i*40} fill="#6b7280" fontSize="7.5" fontFamily="sans-serif">{cours}</text>
        <rect x="330" y={14+i*40} width="48" height="16" fill={col} rx="8"/>
        <text x="354" y={26+i*40} fill="white" fontSize="9" textAnchor="middle" fontFamily="sans-serif">{note}</text>
      </g>
    ))}
  </svg>
);

const IlluFicheCandidat = () => (
  <svg viewBox="0 0 400 150" className="w-full rounded-lg border border-gray-200 bg-white">
    <rect x="0" y="0" width="400" height="36" fill="#1B2B4B" rx="4"/>
    <circle cx="20" cy="18" r="10" fill="rgba(255,255,255,0.2)"/>
    <text x="20" y="22" fill="white" fontSize="9" textAnchor="middle" fontFamily="sans-serif">DB</text>
    <text x="40" y="14" fill="white" fontSize="11" fontWeight="bold" fontFamily="sans-serif">BAGAYOKO Daouda</text>
    <text x="40" y="27" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="sans-serif">bagayoko@…</text>
    <rect x="280" y="8" width="50" height="20" fill="rgba(255,255,255,0.15)" rx="3"/>
    <text x="305" y="22" fill="white" fontSize="8" textAnchor="middle" fontFamily="sans-serif">🖨 PDF</text>
    <rect x="335" y="8" width="55" height="20" fill="#16a34a" rx="3"/>
    <text x="362" y="22" fill="white" fontSize="8" textAnchor="middle" fontFamily="sans-serif">✅ Entretien</text>
    {/* 4 cadres */}
    {[
      ['COORDONNÉES','Nom, prénom, email, téléphone'],
      ['DIPLÔMES & TITRES','BAC Infirmier, AESI…'],
      ['DOCUMENTS','CV, diplôme, lettre…'],
      ['COURS ENVISAGÉS','UE 181 — Optique · ✅ Engager'],
    ].map(([titre,desc],i)=>(
      <g key={titre}>
        <rect x={2+i*99} y="42" width="97" height="104" fill="#f9fafb" rx="4" stroke="#e5e7eb" strokeWidth="1"/>
        <text x={50+i*99} y="57" fill="#1B2B4B" fontSize="7.5" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">{titre}</text>
        <text x={50+i*99} y="72" fill="#6b7280" fontSize="6.5" textAnchor="middle" fontFamily="sans-serif">{desc.split('·')[0]}</text>
        {desc.includes('·') && <text x={50+i*99} y="83" fill="#16a34a" fontSize="6.5" textAnchor="middle" fontFamily="sans-serif">{'·'+desc.split('·')[1]}</text>}
      </g>
    ))}
  </svg>
);

/* ── Contenu de l'aide ─────────────────────────────────────────────────────── */

const SECTIONS_AIDE = [
  {
    id: 'navigation',
    titre: 'Navigation dans Lucie',
    icone: '🧭',
    intro: 'Lucie est organisée en modules accessibles depuis la barre de navigation en haut de l\'écran. Chaque module correspond à une grande fonction de gestion de l\'établissement.',
    illustration: <IlluNav />,
    etapes: [
      { titre: 'La barre de navigation', texte: 'En haut de l\'écran, vous trouverez les onglets principaux : Attributions, Personnel, Listes, Procédures, Pilotage, Planification et Config. (admin). Cliquez sur un onglet pour y accéder.' },
      { titre: 'L\'année scolaire active', texte: 'En haut à gauche, l\'année scolaire active est affichée (ex: 2026-2027). Cliquez dessus pour changer d\'année et consulter les données d\'une année précédente.' },
      { titre: 'Votre profil', texte: 'En haut à droite, votre nom et rôle sont affichés (admin, éditeur, consultation). Le bouton de déconnexion s\'y trouve également.' },
      { titre: 'Rail latéral', texte: 'Sur la plupart des pages, un rail latéral gauche permet de filtrer l\'affichage (par section, par vue), d\'accéder aux actions (nouveau, imprimer) et de naviguer dans le module.' },
    ],
  },
  {
    id: 'attributions',
    titre: 'Attributions',
    icone: '📋',
    intro: 'Le module Attributions est le cœur de Lucie. Il vous permet de voir et modifier qui enseigne quoi, dans quelle section, pour quelle année.',
    illustration: <IlluAttributions />,
    etapes: [
      { titre: 'Vue par section', texte: 'La vue principale affiche les UE regroupées par section. Chaque UE peut être dépliée pour voir ses cours et les attributions détaillées (professeur, groupe, périodes).' },
      { titre: 'Attribuer un cours', texte: 'Cliquez sur le menu déroulant "PROFESSEUR" dans une ligne d\'attribution pour choisir un professeur. Les cases "À DÉSIGNER" indiquent les cours sans professeur attribué.' },
      { titre: 'Groupes', texte: 'Un cours peut être divisé en groupes (A, B, C…) avec des professeurs différents, ou enseigné à tous les étudiants (Ts = tous). Le type SPLIT indique un cours partagé entre profs avec les mêmes étudiants.' },
      { titre: 'Filtres', texte: 'Le rail gauche permet de filtrer par section, par UE, par professeur, par type de contrat (IIP/HELB), par quadrimestre. La recherche libre permet de trouver un cours par nom.' },
      { titre: 'Quadrimestre', texte: 'Le badge Q1/Q2/Q1Q2 sur chaque UE est cliquable pour modifier le quadrimestre d\'une organisation spécifique sans toucher au référentiel.' },
    ],
  },
  {
    id: 'personnel',
    titre: 'Personnel',
    icone: '👥',
    intro: 'Le module Personnel gère les fiches de tous les membres du personnel (professeurs, coordinateurs, direction). Il permet de consulter les attributions, générer des documents et gérer les accès.',
    illustration: <IlluPersonnel />,
    etapes: [
      { titre: 'Liste des membres', texte: 'La liste affiche tous les membres actifs. Les nouveaux membres (engagés dans les 30 derniers jours) apparaissent en tête de liste avec un fond vert et un badge NEW.' },
      { titre: 'Fiche membre', texte: 'Cliquez sur un nom pour ouvrir sa fiche. Elle affiche ses KPIs (périodes IIP, HELB, ancienneté), ses attributions regroupées par cours, son accès Lucie et ses documents.' },
      { titre: 'Générer un contrat', texte: 'Dans la fiche membre → Actions → "Générer contrat". Choisissez la date de signature et le représentant du PO. Le contrat est généré en .docx avec les attributions de l\'année active.' },
      { titre: 'Fiches PDF', texte: 'Le bouton "Fiche PDF" génère une fiche d\'attributions imprimable. Trois types disponibles : Global (IIP + HELB), IIP seul, HELB seul.' },
      { titre: 'Sélection multiple', texte: 'Cochez plusieurs membres pour les exporter en ZIP (un fichier HTML par prof) ou imprimer leurs fiches en un seul PDF combiné.' },
      { titre: 'À DÉSIGNER', texte: 'L\'entrée "À désigner" (badge orange) n\'est pas une personne — c\'est un emplacement réservé pour les cours sans professeur attribué. Elle n\'a pas de fiche.' },
    ],
  },
  {
    id: 'recrutement',
    titre: 'Recrutement',
    icone: '💼',
    intro: 'Le module Recrutement gère les candidats pour les postes à pourvoir. Il permet de suivre les candidatures, mener des entretiens structurés et engager un candidat en un clic.',
    illustration: <IlluRecrutement />,
    etapes: [
      { titre: 'Créer un candidat', texte: 'Dans le rail → "+ Nouveau candidat". Vous pouvez saisir manuellement les infos ou uploader un CV PDF : Lucie l\'analysera automatiquement et pré-remplira la fiche (nom, prénom, email, diplômes).' },
      { titre: 'Fiche candidat', texte: 'La fiche est organisée en 4 cadres : Coordonnées, Documents remis, Diplômes & Titres, Cours envisagés. Chaque section est éditable directement.' },
      { titre: 'Cours envisagés', texte: 'Dans le cadre 4, ajoutez les cours pour lesquels le candidat postule. Chaque cours a un statut (À voir, Entretien, Retenu, Refusé) et un bouton ✅ Engager.' },
      { titre: 'Entretien structuré', texte: 'Le bouton "Entretien" ouvre le guide d\'entretien structuré avec 8 axes d\'évaluation (contexte, expertise, pédagogie, écoute, psychologie, situationnel, comportemental, réflexivité). 2 questions sont tirées aléatoirement par axe.' },
      { titre: 'Engager un candidat', texte: 'Quand un cours est en statut "Retenu", le bouton ✅ Engager apparaît. En cliquant, Lucie crée automatiquement la fiche du professeur dans Personnel et remplace "À DÉSIGNER" dans les attributions.' },
      { titre: 'Rapport PDF', texte: 'Le bouton "Rapport PDF" dans le rail génère un rapport complet de tous les entretiens pour comparaison.' },
    ],
  },
  {
    id: 'pilotage',
    titre: 'Pilotage',
    icone: '📊',
    intro: 'Le module Pilotage donne une vue d\'ensemble de la dotation de l\'établissement : heures utilisées, ETP, équilibre IIP/HELB.',
    illustration: null,
    etapes: [
      { titre: 'Vue globale', texte: 'Le tableau de bord affiche le total des périodes attribuées vs disponibles, par section et par type (CT/PP).' },
      { titre: 'ETP', texte: 'Le calcul ETP suit la règle : CT÷800 + PP÷1000. Un ETP = 800 périodes CT ou 1000 périodes PP. Les prestations incomplètes sont affichées en fraction.' },
      { titre: 'Alertes', texte: 'Les sections en dépassement ou avec des cours non attribués (À DÉSIGNER) sont signalées en rouge.' },
    ],
  },
  {
    id: 'acces',
    titre: 'Gestion des accès',
    icone: '🔐',
    intro: 'La gestion des accès permet de donner à chaque membre du personnel un accès personnalisé à Lucie, avec des permissions précises par module et par section.',
    illustration: null,
    etapes: [
      { titre: '3 rôles', texte: 'Admin : accès complet. Éditeur : peut modifier. Consultation : lecture uniquement. Ces rôles définissent les capacités de base.' },
      { titre: 'Permissions par module', texte: 'Pour chaque module (Attributions, Personnel, Pilotage…), vous pouvez activer Lecture, Écriture, et "Tout" (voir toutes les sections). Sans "Tout", seules les sections cochées sont accessibles.' },
      { titre: 'Sections autorisées', texte: 'Quand "Tout" n\'est pas coché, des badges de sections apparaissent sous le module. Cochez les sections auxquelles la personne a accès.' },
      { titre: 'Créer un accès', texte: 'Dans la fiche membre → onglet "Accès Lucie" → configurer les permissions → "+ Créer l\'accès". Un mot de passe est généré et affiché une seule fois — notez-le.' },
      { titre: 'Nouveau mot de passe', texte: 'Si un membre perd son mot de passe, ouvrez sa fiche → Accès Lucie → "Nouveau mot de passe". Un nouveau mot de passe est généré et affiché immédiatement.' },
    ],
  },
  {
    id: 'astuces',
    titre: 'Astuces & raccourcis',
    icone: '✨',
    intro: 'Quelques fonctionnalités moins visibles qui peuvent vous faire gagner du temps.',
    illustration: null,
    etapes: [
      { titre: 'Analyse CV par Lucie', texte: 'Lors de la création d\'un candidat, glissez-déposez son CV PDF dans la zone d\'upload. Lucie (via IA) extrait automatiquement nom, prénom, email, téléphone, diplômes et résumé de profil.' },
      { titre: 'Badge NEW', texte: 'Les professeurs engagés dans les 30 derniers jours sont mis en évidence en vert dans la liste Personnel et dans la grille Attributions.' },
      { titre: 'Export ZIP', texte: 'Sélectionnez plusieurs membres dans Personnel → bouton "ZIP" → choisissez IIP, HELB ou Global. Vous téléchargez un fichier ZIP avec une fiche HTML par personne.' },
      { titre: 'Fiche PDF depuis la barre', texte: 'Dans la fiche membre, la barre marine contient directement le bouton "Fiche PDF" avec un menu déroulant (Global/IIP/HELB) qui s\'ouvre vers le haut.' },
      { titre: 'Quadrimestre par organisation', texte: 'Si une même UE est enseignée deux fois (Q1 et Q2), créez deux organisations séparées et définissez le quadrimestre sur chacune indépendamment via le badge cliquable.' },
      { titre: 'Champ de recherche', texte: 'Le champ de recherche est toujours à droite du titre de chaque page. Sur mobile, il se réduit automatiquement.' },
    ],
  },
];

/* ── Aide contextuelle par page ─────────────────────────────────────────────── */
export const AIDE_CONTEXTUELLE = {
  '/attributions': {
    titre: 'Attributions',
    points: [
      'Dépliez une UE pour voir ses cours et modifier les attributions',
      'Cliquez sur le nom du professeur pour le changer',
      'Le badge Q1/Q2 est cliquable pour modifier le quadrimestre de cette organisation',
      'Les cases "À DÉSIGNER" sont des postes à pourvoir — utilisez le module Recrutement',
      'Filtrez par section, UE ou professeur depuis le rail gauche',
    ],
    lien: 'attributions',
  },
  '/professeurs': {
    titre: 'Personnel',
    points: [
      'Cliquez sur un nom pour ouvrir la fiche complète',
      'Les membres en vert avec badge NEW ont été engagés dans les 30 derniers jours',
      'Sélectionnez plusieurs membres (cases à cocher) pour exporter en ZIP ou imprimer',
      'L\'onglet "Accès Lucie" dans la fiche permet de gérer les droits de connexion',
      'Le bouton "Générer contrat" crée un .docx avec les attributions de l\'année active',
    ],
    lien: 'personnel',
  },
  '/recrutement': {
    titre: 'Recrutement',
    points: [
      'Créez un candidat depuis le rail → "+ Nouveau candidat" (ou glissez un CV PDF)',
      'La fiche candidat comporte 4 cadres : Coordonnées, Documents, Diplômes, Cours envisagés',
      'Pour chaque cours, choisissez un statut et cliquez ✅ Engager pour créer la fiche prof',
      'Le bouton "Entretien" ouvre le guide structuré avec 8 axes d\'évaluation',
      'Le rapport PDF (rail) compile tous les entretiens pour comparaison',
    ],
    lien: 'recrutement',
  },
  '/pilotage': {
    titre: 'Pilotage',
    points: [
      'Vue globale de la dotation : périodes utilisées vs disponibles',
      'ETP calculé selon la règle : CT÷800 + PP÷1000',
      'Les sections en rouge ont des dépassements ou des postes non pourvus',
    ],
    lien: 'pilotage',
  },
};

/* ── Composant bouton d'aide contextuelle ───────────────────────────────────── */
export function BoutonAide({ page }) {
  const [ouvert, setOuvert] = useState(false);
  const aide = AIDE_CONTEXTUELLE[page];
  if (!aide) return null;

  return (
    <div className="relative">
      <button onClick={() => setOuvert(v => !v)}
        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-iip-turquoise/20 flex items-center justify-center text-gray-500 hover:text-iip-blue transition"
        title={`Aide — ${aide.titre}`}>
        <IconHelpCircle size={16} />
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl w-80 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-iip-blue">{aide.titre}</span>
              <button onClick={() => setOuvert(false)} className="text-gray-400 hover:text-gray-600"><IconX size={14}/></button>
            </div>
            <ul className="space-y-2">
              {aide.points.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-600">
                  <span className="text-iip-turquoise font-bold flex-shrink-0 mt-0.5">▸</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <a href={`/aide#${aide.lien}`}
              className="mt-3 block text-xs text-iip-turquoise hover:underline text-center">
              Voir le guide complet →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Page Aide principale ───────────────────────────────────────────────────── */
export default function Aide() {
  const [search, setSearch]     = useState('');
  const [ouverts, setOuverts]   = useState({ navigation: true });
  const [actif, setActif]       = useState('navigation');

  const toggle = id => setOuverts(prev => ({ ...prev, [id]: !prev[id] }));

  const filtrees = search.trim()
    ? SECTIONS_AIDE.map(s => ({
        ...s,
        etapes: s.etapes.filter(e =>
          e.titre.toLowerCase().includes(search.toLowerCase()) ||
          e.texte.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(s => s.etapes.length > 0 || s.titre.toLowerCase().includes(search.toLowerCase()))
    : SECTIONS_AIDE;

  return (
    <div className="flex h-full">
      {/* ── Sidebar navigation ── */}
      <div className="w-56 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto hidden md:block">
        <div className="p-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Rubriques</div>
          {SECTIONS_AIDE.map(s => (
            <button key={s.id} onClick={() => { setActif(s.id); document.getElementById(`aide-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition mb-1 ${
                actif === s.id ? 'bg-iip-blue text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <span>{s.icone}</span>
              <span className="truncate">{s.titre}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenu principal ── */}
      <div className="flex-1 overflow-y-auto">
        {/* En-tête */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 z-10 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-title text-iip-gold">Guide d'utilisation</h1>
            <p className="text-sm text-gray-500 mt-0.5">Tout ce qu'il faut savoir pour utiliser Lucie</p>
          </div>
          <div className="relative">
            <IconSearch size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dans l'aide…"
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:border-iip-turquoise" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"><IconX size={14}/></button>}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {filtrees.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">🔍</div>
              <div>Aucun résultat pour "<strong>{search}</strong>"</div>
            </div>
          )}

          {filtrees.map(section => (
            <div key={section.id} id={`aide-${section.id}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* En-tête section */}
              <button onClick={() => toggle(section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition">
                <span className="text-xl">{section.icone}</span>
                <div className="flex-1">
                  <div className="text-base font-bold text-iip-blue">{section.titre}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{section.intro}</div>
                </div>
                {ouverts[section.id] ? <IconChevronDown size={18} className="text-gray-400"/> : <IconChevronRight size={18} className="text-gray-400"/>}
              </button>

              {ouverts[section.id] && (
                <div className="border-t border-gray-100 px-5 pb-5">
                  {/* Illustration */}
                  {section.illustration && (
                    <div className="my-4">{section.illustration}</div>
                  )}

                  {/* Étapes */}
                  <div className="space-y-4 mt-4">
                    {section.etapes.map((etape, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-6 h-6 rounded-full bg-iip-blue text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                          {i + 1}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-800">{etape.titre}</div>
                          <div className="text-sm text-gray-600 mt-0.5 leading-relaxed">{etape.texte}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Footer */}
          <div className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
            Lucie — Institut Ilya Prigogine · Une question ? Contactez la direction
          </div>
        </div>
      </div>
    </div>
  );
}

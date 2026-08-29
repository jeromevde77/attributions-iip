import { useMemo, useState } from 'react';
import {
  IconSearch, IconX, IconHelpCircle, IconSchool, IconClipboardList, IconUsers,
  IconFolders, IconMail, IconChartBar, IconSettings, IconShieldLock,
  IconBriefcase, IconChevronRight,
} from '@tabler/icons-react';

/**
 * Aide de Lucie.
 *
 * Réécrite : les illustrations schématiques d'origine vieillissaient mal — un
 * dessin de la barre de navigation devient faux dès qu'un onglet change — et le
 * contenu datait d'avant la moitié des modules.
 *
 * Le parti retenu est celui du reste de l'application : aplats, gris, pas
 * d'image. Chaque rubrique explique ce que le module FAIT et pourquoi, plutôt
 * que de décrire l'emplacement des boutons — une description qui se périme à
 * chaque changement d'écran.
 */
const RUBRIQUES = [
  {
    id: 'demarrage', titre: 'Pour commencer', Icone: IconChevronRight,
    resume: "Les trois notions qui commandent tout le reste.",
    points: [
      { titre: "L'année de travail",
        texte: "Le sélecteur en haut à gauche fixe l'année sur laquelle porte tout ce que vous voyez. "
             + "Il accompagne chaque demande au serveur : changer d'année change réellement l'ensemble "
             + "des écrans. Si vous ne l'avez jamais modifié, Lucie s'aligne d'elle-même sur l'année "
             + "active de l'établissement." },
      { titre: "Votre rôle et votre périmètre",
        texte: "Le rôle détermine ce que vous pouvez faire, le périmètre les sections que vous voyez. "
             + "Une coordination limitée à TIM ne verra ni les étudiants ni les dates d'UE des autres "
             + "sections : ce n'est pas un défaut d'affichage, c'est le cloisonnement." },
      { titre: "Trois niveaux de données",
        texte: "Le RÉFÉRENTIEL décrit ce qui existe — unités, cours, prérequis — et ne change pas d'une "
             + "rentrée à l'autre. L'ORGANISATION dit ce qu'on ouvre cette année, avec ses dates. Les "
             + "ATTRIBUTIONS disent qui donne quoi. Les confondre est la source d'erreur la plus "
             + "fréquente." },
    ],
  },
  {
    id: 'etudiants', titre: 'Étudiants', Icone: IconSchool,
    resume: "Parcours, programme annuel, résultats, dossier réglementaire.",
    points: [
      { titre: "Le programme annuel",
        texte: "Il se construit à partir des unités organisées cette année. Lucie propose ce que "
             + "l'étudiant peut prendre en tenant compte des prérequis, et la vérification est "
             + "TRANSITIVE : une unité dont le prérequis a lui-même un prérequis non acquis reste "
             + "fermée." },
      { titre: "Prérequis légaux et règles internes",
        texte: "Un trait plein signale un prérequis du dossier pédagogique, qui bloque. Un trait "
             + "pointillé signale une règle interne de l'établissement, qui avertit sans interdire : "
             + "l'étudiant qui insiste peut prendre l'unité. Gris au sein d'une année, bleu d'une "
             + "année à l'autre." },
      { titre: "L'épreuve intégrée",
        texte: "Elle n'est proposée que si toutes les unités des années antérieures sont acquises. À "
             + "défaut elle reste ajoutable à la main, ce qui correspond à une décision du Conseil des "
             + "études." },
      { titre: "Les trois décisions",
        texte: "Réussite, ajournement et refus sont distincts : l'ajournement ouvre une seconde session "
             + "sur des acquis précis, le refus non. Aucune cote n'est enregistrée lorsque le seuil de "
             + "réussite n'est pas atteint." },
      { titre: "Aménagements raisonnables",
        texte: "Un onglet de la fiche suit la procédure du décret : demande, pièce produite, décision "
             + "motivée du Conseil des études, notification. Un document probant ouvre l'exonération "
             + "des droits d'inscription ; un rapport de spécialiste vaut cinq ans et ne se redemande "
             + "pas chaque année." },
      { titre: "Droit d'inscription et frais de scolarité",
        texte: "Deux documents distincts. Le premier revient à la Fédération et figure sur la fiche "
             + "d'inscription. Le second revient à l'établissement et fait l'objet d'une note séparée, "
             + "avec l'acompte et son échéance." },
    ],
  },
  {
    id: 'attributions', titre: 'Attributions', Icone: IconClipboardList,
    resume: "Qui donne quoi, avec quelles périodes.",
    points: [
      { titre: "Groupes et dédoublements",
        texte: "Trois cas. Un cours simple donné à tous porte « Ts ». Un cours partagé entre "
             + "professeurs avec les mêmes étudiants reste « Ts ». Un cours dont les étudiants sont "
             + "répartis prend des lettres A, B, C — sans trou, et en repartant de A à chaque "
             + "activité." },
      { titre: "Autonomie",
        texte: "Elle s'ajoute aux périodes de cours et compte dans la charge. Les calculs de dotation "
             + "doivent la comprendre : l'oublier retire près d'un cinquième de la charge réelle." },
      { titre: "IIP et HELB",
        texte: "Les attributions HELB apparaissent mais ne pèsent pas sur votre dotation. Elles sont "
             + "écartées de tous les calculs qui la concernent." },
    ],
  },
  {
    id: 'personnel', titre: 'Personnel', Icone: IconUsers,
    resume: "Fiches, charges, contrats, accès.",
    points: [
      { titre: "La charge et l'ETP",
        texte: "La charge affichée porte sur la seule année consultée. L'ETP suit la formule de "
             + "l'établissement — cours technique divisé par 800, pratique professionnelle par 1000 — "
             + "autonomie comprise." },
      { titre: "Accès Lucie",
        texte: "C'est ici, et nulle part ailleurs, qu'on accorde un accès à un membre du personnel. "
             + "Configuration n'en donne qu'une vue d'ensemble et ne gère que les comptes sans fiche, "
             + "comme celui d'un prestataire extérieur." },
      { titre: "Retirer un accès",
        texte: "Un compte qui a signé des attributions est désactivé plutôt que supprimé : son nom doit "
             + "rester lisible dans l'historique des décisions." },
    ],
  },
  {
    id: 'organisation', titre: 'Organisation', Icone: IconFolders,
    resume: "Ce qu'on ouvre cette année, et quand.",
    points: [
      { titre: "Dates d'unités",
        texte: "Elles commandent les comptages au premier dixième, donc la subvention. Une date de fin "
             + "antérieure au début est signalée avec l'unité concernée, et un filtre permet de les "
             + "corriger d'affilée." },
      { titre: "Ligne du temps",
        texte: "Les semaines sont numérotées en norme ISO et les congés apparaissent en arrière-plan. "
             + "Une unité dont les dates sortent de l'année académique élargit la vue plutôt que d'être "
             + "rabattue silencieusement sur le bord." },
      { titre: "Schéma de capitalisation",
        texte: "Il montre la structure d'une section. On y règle l'année d'études de chaque unité, "
             + "propre à l'année scolaire. Les prérequis, eux, relèvent du référentiel et se modifient "
             + "dans Configuration." },
    ],
  },
  {
    id: 'pilotage', titre: 'Pilotage', Icone: IconChartBar,
    resume: "Dotation, répartition des périodes, budget.",
    points: [
      { titre: "Dotation organique",
        texte: "Elle se lit par année civile, en périodes pondérées — 1,5 en supérieur, 1,25 en degré "
             + "supérieur — et ventilée par quadrimestre." },
      { titre: "Répartition des périodes",
        texte: "L'outil de préparation du document 2. La dotation est civile, l'enseignement "
             + "académique : chaque année scolaire se déclare sur deux années civiles. La clé 40-60 "
             + "n'est qu'une proposition ; lorsque les dates placent l'unité dans une seule année "
             + "civile, Lucie suit les dates." },
      { titre: "Enveloppes fermées",
        texte: "Conseiller qualité, congé-formation et inclusion sont financés à part. Leur "
             + "dépassement retombe sur la dotation organique, d'où le suivi séparé." },
      { titre: "Budget",
        texte: "Prévisions et dépenses par année civile et par section. Une coordination encode pour "
             + "les siennes, et le solde se calcule ligne à ligne." },
    ],
  },
  {
    id: 'acces', titre: 'Accès et validation', Icone: IconShieldLock,
    resume: "Rôles, profils, circuit de validation.",
    points: [
      { titre: "Cinq rôles",
        texte: "Direction et direction adjointe décident et valident. Le secrétariat lit partout, "
             + "encode les étudiants et produit les documents. La coordination encode pour ses "
             + "sections, sous validation. Le professeur consulte ce qui le concerne. La consultation "
             + "lit seulement." },
      { titre: "Profils",
        texte: "Un profil pose d'un coup le rôle et les cases. Croisé avec le périmètre, il donne "
             + "« coordination sur TIM ». C'est un modèle appliqué une fois : le modifier plus tard ne "
             + "change pas les fiches déjà établies." },
      { titre: "Demandes de validation",
        texte: "La saisie d'une coordination ne prend pas effet immédiatement : elle devient une "
             + "demande que la direction tranche. La donnée officielle reste juste tant que la décision "
             + "n'est pas prise." },
    ],
  },
  {
    id: 'documents', titre: 'Documents et communication', Icone: IconMail,
    resume: "Contrats, attestations, listes, courriers.",
    points: [
      { titre: "Centre d'impression",
        texte: "Listes, courriers et documents s'y produisent. Le secrétariat y a accès en écriture, "
             + "puisque c'est son métier." },
      { titre: "Attestations et mentions",
        texte: "La mention se calcule sur les unités déterminantes pour deux tiers et l'épreuve "
             + "intégrée pour un tiers, chaque unité intervenant proportionnellement à ses périodes." },
    ],
  },
  {
    id: 'config', titre: 'Configuration', Icone: IconSettings,
    resume: "Référentiels, prérequis, sauvegardes.",
    points: [
      { titre: "Prérequis",
        texte: "Ils constituent la bibliothèque : ils viennent du dossier pédagogique et valent pour "
             + "toutes les années. Les modifier fait bouger les grilles de parcours et les programmes "
             + "déjà établis. Réservé aux administrateurs." },
      { titre: "Sauvegardes",
        texte: "Une copie quotidienne, contrôlée à chaque exécution — intégrité et décompte des tables "
             + "principales. Une chute soudaine d'un décompte s'affiche en rouge. La restauration reste "
             + "manuelle, sur le serveur." },
    ],
  },
  {
    id: 'recrutement', titre: 'Recrutement', Icone: IconBriefcase,
    resume: "Candidatures, analyse de CV, engagement.",
    points: [
      { titre: "Analyse d'un curriculum",
        texte: "Le dépôt d'un CV en PDF pré-remplit la fiche du candidat. Les informations extraites "
             + "sont à vérifier : elles proviennent d'une lecture automatique." },
    ],
  },
];

// Aide contextuelle, affichée depuis l'en-tête de chaque page.
export const AIDE_CONTEXTUELLE = {
  '/attributions': { titre: 'Attributions', lien: 'attributions', points: [
    "« Ts » désigne un cours donné à tous ; les lettres A, B, C un cours dont les étudiants sont répartis.",
    "L'autonomie s'ajoute aux périodes de cours et compte dans la charge.",
    "Les attributions HELB ne pèsent pas sur la dotation de l'établissement.",
  ] },
  '/etudiants': { titre: 'Étudiants', lien: 'etudiants', points: [
    "Le programme annuel vérifie les prérequis de façon transitive.",
    "Un trait pointillé signale une règle interne : elle avertit sans interdire.",
    "Aucune cote n'est enregistrée lorsque le seuil de réussite n'est pas atteint.",
  ] },
  '/personnel': { titre: 'Personnel', lien: 'personnel', points: [
    "La charge affichée porte sur la seule année consultée.",
    "Les accès se règlent ici, dans l'onglet « Accès Lucie ».",
    "Un compte ayant signé des attributions est désactivé, non supprimé.",
  ] },
  '/pilotage': { titre: 'Pilotage', lien: 'pilotage', points: [
    "La dotation se lit par année civile, en périodes pondérées.",
    "La répartition prépare le document 2 sur deux années civiles.",
    "Les enveloppes fermées sont suivies à part de l'organique.",
  ] },
  '/configuration': { titre: 'Configuration', lien: 'config', points: [
    "Les prérequis valent pour toutes les années : les modifier est rétroactif.",
    "Les sauvegardes sont contrôlées à chaque exécution.",
  ] },
};

export function BoutonAide({ page }) {
  const [ouvert, setOuvert] = useState(false);
  const aide = AIDE_CONTEXTUELLE[page];
  if (!aide) return null;

  return (
    <div className="relative">
      <button onClick={() => setOuvert(v => !v)}
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-iip-turquoise/20 flex items-center
                   justify-center text-slate-500 hover:text-iip-blue transition"
        title={`Aide — ${aide.titre}`}>
        <IconHelpCircle size={16} />
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-xl
                          shadow-lg w-80 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13px] font-semibold text-iip-blue">{aide.titre}</span>
              <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-600">
                <IconX size={14} />
              </button>
            </div>
            <ul className="space-y-2">
              {aide.points.map((p, i) => (
                <li key={i} className="text-[12px] text-slate-600 leading-relaxed pl-3 border-l-2
                                       border-slate-200">
                  {p}
                </li>
              ))}
            </ul>
            <a href={`/aide#${aide.lien}`}
              className="mt-3 block text-[11.5px] text-iip-turquoise hover:underline text-center">
              Voir le guide complet
            </a>
          </div>
        </>
      )}
    </div>
  );
}

export default function Aide() {
  const [recherche, setRecherche] = useState('');
  const [ouverte, setOuverte] = useState('demarrage');

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return RUBRIQUES;
    return RUBRIQUES
      .map(r => ({ ...r, points: r.points.filter(p =>
        p.titre.toLowerCase().includes(q) || p.texte.toLowerCase().includes(q)) }))
      .filter(r => r.points.length || r.titre.toLowerCase().includes(q));
  }, [recherche]);

  return (
    <div className="p-5 space-y-4 max-w-[1100px]">
      <div>
        <h2 className="text-xl font-semibold text-iip-blue">Aide</h2>
        <p className="text-sm text-slate-500">
          Ce que fait chaque module, et pourquoi il le fait ainsi.
        </p>
      </div>

      <div className="relative max-w-md">
        <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher — autonomie, prérequis, dotation…"
          className="w-full border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-sm" />
        {recherche && (
          <button onClick={() => setRecherche('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <IconX size={15} />
          </button>
        )}
      </div>

      {!filtrees.length ? (
        <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          Rien ne correspond à « {recherche} ».
        </div>
      ) : (
        <div className="space-y-2">
          {filtrees.map(r => {
            const deployee = !!recherche || ouverte === r.id;
            return (
              <div key={r.id} id={`aide-${r.id}`}
                className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button onClick={() => setOuverte(o => (o === r.id ? null : r.id))}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <r.Icone size={18} stroke={1.6} className="text-slate-400 flex-none" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-iip-blue">{r.titre}</div>
                    <div className="text-[11.5px] text-slate-500">{r.resume}</div>
                  </div>
                  <span className="text-slate-400 text-[13px]">{deployee ? '−' : '+'}</span>
                </button>

                {deployee && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {r.points.map((p, i) => (
                      <div key={i} className="px-4 py-3">
                        <div className="text-[12.5px] font-medium text-slate-800 mb-0.5">{p.titre}</div>
                        <p className="text-[12px] text-slate-600 leading-relaxed">{p.texte}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400 pt-2">
        Les règles citées renvoient au décret du 16 avril 1991, au règlement des études et aux
        circulaires applicables ; en cas de divergence, ce sont ces textes qui font foi.
      </p>
    </div>
  );
}

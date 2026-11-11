import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { IconArrowLeft, IconArrowRight, IconX } from '@tabler/icons-react';

/**
 * LA VISITE GUIDÉE DE L'ESPACE (3.5.276, Charles, 9 novembre 2026 : « un pop up d'entrée pour les étudiants dans leur espace avec
 * un vrai tuto » ; tranché : une visite guidée — une bulle pointe chaque partie de l'écran, le reste voilé —, à la première entrée
 * après la confirmation du PAE, relançable depuis Aide ; les parties de l'espace et les gestes clés ; texte proposé par l'assistant,
 * relu par Charles sur la dev).
 *
 * Chaque étape vise une entrée du rail par `data-visite` (posé par `BoutonRail`) ; une étape dont l'entrée n'existe pas pour cet
 * étudiant (fonction éteinte) est sautée. Sans cible : une bulle au centre. Vue = `localStorage` par étudiant et par appareil.
 */
/* Une étape : `face` / `sous` = l'écran que la visite ouvre ; `cible` = ce qu'elle pointe — une entrée du rail (sa clé) ou
   « contenu » (l'écran ouvert). `pae: true` = l'étape du PAE, qui ouvre la confirmation quand elle est attendue. Une étape dont
   l'écran n'est pas ouvert pour cet étudiant est sautée (`dispo`). */
export const ETAPES_VISITE = [
  { cible: null, titre: 'Bienvenue dans votre espace',
    texte: 'Votre espace réunit ce que l’Institut vous adresse : votre programme, vos documents, vos résultats, vos messages et vos démarches. La visite ouvre chaque écran et vous montre ce qu’il contient.',
    gestes: ['« Suivant » pour avancer, « Passer » pour fermer.', 'À la fin, la visite vous mène à votre premier geste : vérifier votre programme de l’année (votre PAE), puis le confirmer ou dire ce qui ne va pas.', 'Vous pourrez relancer la visite à tout moment depuis « Aide ».'] },
  { face: 'aujourdhui', cible: 'contenu', titre: 'Aujourd’hui',
    texte: 'Votre point de départ, à chaque visite : ce qui vous attend, une ligne par chose.',
    gestes: ['Documents et règlements à signer, messages non lus : ils apparaissent ici en premier.', 'Touchez une ligne : elle vous mène là où la faire.', 'Plus bas, vos prochains examens : date, heure, local — et la partie, quand l’examen se passe en plusieurs fois.'] },
  { face: 'parcours', sous: 'parcours', cible: 'contenu', titre: 'Mon parcours — schéma et unités',
    texte: 'Votre formation d’un coup d’œil : ce que vous avez acquis, ce qui est à votre programme, ce qui vient ensuite.',
    gestes: ['Le schéma montre les unités de votre section et les liens entre elles (ce qu’il faut avoir réussi avant).',
      'Touchez une unité : ses cours, sa description (DUE) et son dossier pédagogique.'] },
  { face: 'parcours', sous: 'resultats', cible: 'contenu', titre: 'Mes résultats',
    texte: 'Les décisions du Conseil des études, unité par unité, dès que la délibération est close.',
    gestes: ['« Réussi » : l’unité est acquise, avec sa note sur 20.', '« NA » : non acquis. « Ajourné » : des acquis à représenter en seconde session.',
      'Ce qui fait foi reste la pièce que l’école vous remet (dans « Mes documents »).'] },
  { face: 'documents', cible: 'contenu', titre: 'Mes documents',
    texte: 'Les pièces que l’Institut vous remet (attestations, décisions du Conseil des études) et les règlements de l’école.',
    gestes: ['« Ouvrir » : la pièce s’affiche dans un nouvel onglet ; vous pouvez l’enregistrer ou l’imprimer.',
      'Puis « Accuser réception » : un code à six chiffres arrive sur votre adresse de l’institut ; tapez-le pour signer.',
      'Un accusé signé ne se modifie plus : il prouve que la pièce vous a été remise.',
      'Au-delà de 90 jours, un code vous est demandé pour rouvrir une pièce.'] },
  { face: 'messages', cible: 'contenu', titre: 'Messages',
    texte: 'Les messages du secrétariat, de votre coordination et de vos enseignants.',
    gestes: ['Touchez un message pour le lire : son auteur voit que vous l’avez lu.',
      'Écrivez votre réponse sous le message : elle va à la personne qui vous a écrit.'] },
  { face: 'demarches', sous: 'va', cible: 'contenu', titre: 'Mes démarches — valorisation',
    texte: 'Demander une dispense pour une unité, sur la base de ce que vous avez déjà appris (études, expérience).',
    gestes: ['Choisissez l’unité : le prix et la date limite s’affichent avant l’envoi.', 'Déposez vos pièces (diplômes, attestations).',
      'Suivez votre demande : reçue, recevable, avis, décision.'] },
  { face: 'demarches', sous: 'certificats', cible: 'contenu', titre: 'Mes démarches — mes absences',
    texte: 'Justifier une absence par un certificat médical.',
    gestes: ['Indiquez les dates de votre absence et déposez le certificat (photo ou PDF), au plus vite.',
      'L’école le reçoit ; accepté, vos absences de la période sont justifiées.'] },
  { face: 'demarches', sous: 'tfe', cible: 'contenu', titre: 'Mes démarches — mon TFE',
    texte: 'Votre travail de fin d’études : votre question de recherche, votre promoteur, vos remises et votre défense.',
    gestes: ['Proposez votre question de recherche : votre promoteur l’accepte ou vous la renvoie avec un mot.', 'Déposez vos remises ici, à la date prévue.'] },
  { face: 'demarches', sous: 'stage', cible: 'contenu', titre: 'Mes démarches — mon stage',
    texte: 'Votre lieu de stage, vos dates, votre superviseur et les pièces à fournir avant de commencer.' },
  { face: 'demarches', sous: 'amenagements', cible: 'contenu', titre: 'Mes démarches — aménagement raisonnable',
    texte: 'Où en est votre demande d’aménagement raisonnable, et les mesures accordées.' },
  { face: 'demarches', sous: 'sante', cible: 'contenu', titre: 'Mes démarches — ma santé',
    texte: 'Votre visite médicale du CESI : sa date, jusqu’à quand elle vaut, ou qu’elle reste à faire.',
    gestes: ['Pas de visite médicale, pas de stage et pas de réussite en fin d’année.', 'Vous recevez la convocation du CESI ; après la visite, l’école l’enregistre et elle paraît ici.'] },
  { face: 'frais', cible: 'contenu', titre: 'Mes frais',
    texte: 'Ce qui est dû, ce que vous avez versé, ce qui reste — et le QR code pour payer sans erreur de communication.' },
  { face: 'aide', cible: 'contenu', titre: 'Aide',
    texte: 'Le mode d’emploi de votre espace et la façon de lire vos résultats.',
    gestes: ['Le bouton « Revoir la visite guidée » relance cette visite.'] },
  { face: 'compte', cible: 'contenu', titre: 'Mon compte',
    texte: 'Votre mot de passe et vos appareils reconnus.',
    gestes: ['Trois appareils au plus sont reconnus ; sur un autre, un code vous est demandé en plus du mot de passe.',
      'Un appareil perdu ou un ordinateur partagé ? Retirez-le ici.'] },
  { cible: null, fin: 'pae', titre: 'À vous : votre PAE',
    texte: 'Votre premier geste : vérifier votre programme de l’année (votre PAE). Tout le reste en dépend : vos cours, vos examens, vos frais.',
    gestes: ['Relisez vos unités : numéro et intitulé.',
      'S’il est juste : le bouton vert « Je confirme mon PAE ».',
      'S’il ne l’est pas (une unité manque, une est en trop) : le bouton rouge « Mon PAE n’est pas juste, j’en informe la coordination ». Votre coordination reçoit votre message sur son tableau de bord et vous répond.'],
    bouton: 'Aller à mon PAE' },
  { cible: null, fin: 'aujourdhui', titre: 'C’est parti',
    texte: 'À chaque visite, commencez par « Aujourd’hui » : tout ce qui vous attend y est. Bonne année à l’Institut !', bouton: 'Commencer' },
];

// Une visite vue se retient par personne et par appareil ; `espace` sépare l'étudiant (« ») de l'enseignant (« ens. »).
const cleVue = (id, espace = '') => `lucie.visite.${espace}${id}`;
export const visiteVue = (id, espace = '') => { try { return !!localStorage.getItem(cleVue(id, espace)); } catch { return true; } };
const marquerVue = (id, espace = '') => { try { localStorage.setItem(cleVue(id, espace), new Date().toISOString()); } catch { /* navigation privée */ } };

const MARGE = 6;
const LARGEUR = 380;
const rectDe = sel => { const el = sel && document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; };

/**
 * `dispo(etape)` dit si l'écran de l'étape existe pour cet étudiant ; `aller(face, sous)` l'ouvre. La visite finit TOUJOURS sur le
 * PAE quand il est ouvert (3.5.278, Charles : « après le tour, tu vas à cette fenêtre ») : `onFin('pae')`, que la visite soit
 * suivie jusqu'au bout ou fermée.
 */
export default function VisiteGuidee({ etudiantId, etapes: catalogue = ETAPES_VISITE, espace = '', dispo = () => true, aller, depart = 0, onFin }) {
  const [etapes] = useState(() => {
    const paeOuvert = dispo({ face: 'parcours', sous: 'pae' });
    return catalogue.filter(e => (!e.face || dispo(e)) && (!e.cible || e.cible === 'contenu' || document.querySelector(`[data-visite="${e.cible}"]`))
      && (!e.fin || (e.fin === 'pae') === paeOuvert));
  });
  const [i, setI] = useState(() => Math.min(depart, etapes.length - 1));
  const [rect, setRect] = useState(null);
  const [rail, setRail] = useState(null);
  const [vue, setVue] = useState({ w: window.innerWidth, h: window.innerHeight });
  const e = etapes[i];

  const mesurer = useCallback(() => {
    setVue({ w: window.innerWidth, h: window.innerHeight });
    setRect(e?.cible ? rectDe(`[data-visite="${e.cible}"]`) : null);
    setRail(e?.face ? rectDe(`nav [data-visite="${e.face}"]`) : null);
  }, [e]);

  // L'écran de l'étape s'ouvre, la page remonte, l'entrée du rail se montre.
  useLayoutEffect(() => {
    if (e?.face) { aller?.(e.face, e.sous || null); window.scrollTo({ top: 0 }); }
    const el = e?.face && document.querySelector(`nav [data-visite="${e.face}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'center' });
    mesurer();
  }, [e]);   // eslint-disable-line react-hooks/exhaustive-deps
  // L'écran charge ses données : on remesure un moment (et à chaque redimensionnement ou défilement).
  useEffect(() => {
    const t = setInterval(mesurer, 250);
    const arret = setTimeout(() => clearInterval(t), 3000);
    window.addEventListener('resize', mesurer);
    window.addEventListener('scroll', mesurer, true);
    return () => { clearInterval(t); clearTimeout(arret); window.removeEventListener('resize', mesurer); window.removeEventListener('scroll', mesurer, true); };
  }, [mesurer]);

  const finir = useCallback(() => { marquerVue(etudiantId, espace); onFin?.(etapes[etapes.length - 1]?.fin || 'aujourdhui'); }, [etudiantId, espace, onFin, etapes]);
  useEffect(() => {
    const k = ev => {
      if (ev.key === 'Escape') finir();
      else if (ev.key === 'ArrowRight') setI(x => Math.min(x + 1, etapes.length - 1));
      else if (ev.key === 'ArrowLeft') setI(x => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [finir, etapes.length]);

  if (!e) return null;
  const dernier = i === etapes.length - 1;
  const telephone = vue.w < 768;
  const larg = Math.min(LARGEUR, vue.w - 32);
  const contenu = e.cible === 'contenu';

  // Le trou du voile : l'écran ouvert (borné à la fenêtre), ou l'entrée visée.
  const trou = rect && (contenu
    ? { top: Math.max(rect.top, 8), left: rect.left, width: rect.width, height: Math.min(rect.top + rect.height, vue.h - 8) - Math.max(rect.top, 8) }
    : rect);
  // La bulle : pour un écran, en bas à droite (en bas sur téléphone) ; pour une entrée, à côté ; sans cible, au centre.
  let pos;
  if (!trou) pos = { left: (vue.w - larg) / 2, top: Math.max(16, vue.h * 0.2) };
  else if (contenu) pos = telephone ? { left: 16, right: 16, bottom: 16 } : { right: 24, bottom: 24 };
  else if (trou.left + trou.width + 16 + larg < vue.w && trou.left < vue.w / 3) pos = { left: trou.left + trou.width + 16, top: Math.max(16, Math.min(trou.top - 12, vue.h - 380)) };
  else pos = { left: Math.max(16, Math.min(trou.left, vue.w - larg - 16)), top: trou.top + trou.height + 14 };

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Visite guidée de votre espace">
      {trou ? (
        <div className="absolute pointer-events-none rounded-carte transition-all duration-300 ease-ios"
          style={{ top: trou.top - MARGE, left: trou.left - MARGE, width: trou.width + 2 * MARGE, height: trou.height + 2 * MARGE,
            boxShadow: '0 0 0 9999px color-mix(in srgb, var(--c-principal) 55%, transparent), 0 0 0 3px var(--c-accent)' }} />
      ) : <div className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--c-principal) 55%, transparent)' }} />}
      {/* L'entrée du rail de l'écran ouvert, cerclée : on voit où le retrouver. */}
      {contenu && rail && (
        <div className="absolute pointer-events-none rounded-carte transition-all duration-300 ease-ios"
          style={{ top: rail.top - 4, left: rail.left - 4, width: rail.width + 8, height: rail.height + 8, boxShadow: '0 0 0 3px var(--c-accent)' }} />)}
      <div className="absolute bg-white rounded-fenetre shadow-dessus p-5 space-y-3 transition-all duration-300 ease-ios overflow-y-auto"
        style={{ ...pos, width: pos.right !== undefined && pos.left !== undefined ? undefined : larg, maxHeight: telephone ? '62vh' : '80vh' }}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500 tabular-nums">Étape {i + 1} sur {etapes.length}</div>
            <h2 className="titre-carte">{e.titre}</h2>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600 -mr-1" onClick={finir} aria-label="Fermer la visite"><IconX size={18} /></button>
        </div>
        <p className="text-sm text-slate-700">{e.texte}</p>
        {e.gestes?.length > 0 && (
          <ol className="space-y-1.5">
            {e.gestes.map((g, n) => (
              <li key={n} className="flex gap-2 text-sm text-slate-600">
                <span className="flex-none w-5 h-5 rounded-full text-white text-[11px] font-semibold inline-flex items-center justify-center mt-px"
                  style={{ background: 'var(--c-principal)' }}>{n + 1}</span>
                <span>{g}</span>
              </li>))}
          </ol>)}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex gap-1 mr-auto" aria-hidden="true">
            {etapes.map((_, n) => <span key={n} className="w-1.5 h-1.5 rounded-full" style={{ background: n === i ? 'var(--c-principal)' : 'rgb(var(--gris-300))' }} />)}
          </div>
          {!dernier && <button type="button" className="text-second text-slate-500 underline px-1" onClick={finir}>Passer</button>}
          {i > 0 && <button type="button" className="bouton" onClick={() => setI(i - 1)} aria-label="Étape précédente"><IconArrowLeft size={15} /></button>}
          <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={() => (dernier ? finir() : setI(i + 1))}>
            {dernier ? <>{e.bouton || 'Commencer'} <IconArrowRight size={15} /></> : <>Suivant <IconArrowRight size={15} /></>}</button>
        </div>
      </div>
    </div>);
}

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
export const ETAPES_VISITE = [
  { cible: null, titre: 'Bienvenue dans votre espace',
    texte: 'Votre espace réunit ce que l’Institut vous adresse : vos documents, vos résultats, vos messages et vos démarches. En une minute, voici où tout se trouve.',
    gestes: ['« Suivant » pour avancer, « Passer » pour fermer.', 'Vous pourrez relancer cette visite à tout moment depuis « Aide ».'] },
  { cible: 'aujourdhui', titre: 'Aujourd’hui',
    texte: 'Votre point de départ : ce qui vous attend, une ligne par chose. Touchez une ligne, elle vous mène là où la faire.',
    gestes: ['Un document à signer, un message non lu : ils apparaissent ici en premier.'] },
  { cible: 'parcours', titre: 'Mon parcours',
    texte: 'Votre formation, unité par unité.',
    gestes: ['« Schéma et unités » : ce que vous avez acquis, ce qui est à votre programme, ce qui vient ensuite — et le dossier pédagogique de chaque unité.',
      '« Mes résultats » : les décisions du Conseil des études, une fois la délibération close.',
      '« Mon PAE » : votre programme de l’année.'] },
  { cible: 'documents', titre: 'Mes documents',
    texte: 'Les pièces que l’Institut vous remet (attestations, décisions) et les règlements de l’école.',
    gestes: ['Ouvrez la pièce : elle s’affiche dans un nouvel onglet.',
      'Puis « Accuser réception » : un code à six chiffres arrive sur votre adresse de l’institut ; tapez-le pour signer.',
      'Un accusé signé ne se modifie plus : il prouve que la pièce vous a été remise.'] },
  { cible: 'messages', titre: 'Messages',
    texte: 'Les messages du secrétariat, de votre coordination et de vos enseignants.',
    gestes: ['Ouvrez un message : l’auteur voit que vous l’avez lu.',
      'Vous pouvez répondre en dessous : votre réponse va à la personne qui vous a écrit.'] },
  { cible: 'demarches', titre: 'Mes démarches',
    texte: 'Ce que vous demandez à l’école, et où en est votre demande.',
    gestes: ['Valorisation : demander une dispense pour une unité, déposer vos pièces, suivre la décision.',
      'Mes absences : déposer un certificat médical et les dates de votre absence, au plus vite.',
      'Selon votre section : votre TFE, votre stage, votre aménagement raisonnable.'] },
  { cible: 'frais', titre: 'Mes frais',
    texte: 'Ce qui est dû, ce que vous avez versé, ce qui reste — et le QR code pour payer sans erreur de communication.' },
  { cible: 'aide', titre: 'Aide',
    texte: 'Le mode d’emploi de votre espace et la façon de lire vos résultats (réussi, NA, ajourné…).',
    gestes: ['Le bouton « Revoir la visite guidée » relance cette visite.'] },
  { cible: 'compte', titre: 'Mon compte',
    texte: 'Votre mot de passe et vos appareils reconnus.',
    gestes: ['Trois appareils au plus sont reconnus ; sur un autre, un code vous est demandé en plus du mot de passe.',
      'Un appareil perdu ? Retirez-le ici.'] },
  { cible: null, titre: 'C’est parti',
    texte: 'Commencez par « Aujourd’hui » : tout ce qui vous attend y est. Bonne année à l’Institut !' },
];

const cleVue = id => `lucie.visite.${id}`;
export const visiteVue = id => { try { return !!localStorage.getItem(cleVue(id)); } catch { return true; } };
const marquerVue = id => { try { localStorage.setItem(cleVue(id), new Date().toISOString()); } catch { /* navigation privée */ } };

const MARGE = 6;
const LARGEUR = 340;

export default function VisiteGuidee({ etudiantId, onFin }) {
  // Les étapes dont la cible existe pour cet étudiant (une fonction éteinte n'a pas d'entrée dans le rail).
  const [etapes] = useState(() => ETAPES_VISITE.filter(e => !e.cible || document.querySelector(`[data-visite="${e.cible}"]`)));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [vue, setVue] = useState({ w: window.innerWidth, h: window.innerHeight });
  const e = etapes[i];

  const mesurer = useCallback(() => {
    setVue({ w: window.innerWidth, h: window.innerHeight });
    if (!e?.cible) { setRect(null); return; }
    const el = document.querySelector(`[data-visite="${e.cible}"]`);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [e]);

  useLayoutEffect(() => {
    const el = e?.cible && document.querySelector(`[data-visite="${e.cible}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'center' });
    mesurer();
  }, [mesurer, e]);
  useEffect(() => {
    window.addEventListener('resize', mesurer);
    window.addEventListener('scroll', mesurer, true);
    return () => { window.removeEventListener('resize', mesurer); window.removeEventListener('scroll', mesurer, true); };
  }, [mesurer]);

  const finir = useCallback(() => { marquerVue(etudiantId); onFin?.(); }, [etudiantId, onFin]);
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
  const larg = Math.min(LARGEUR, vue.w - 32);

  // La bulle : à droite de l'entrée sur grand écran (rail vertical), dessous sur téléphone (bande d'onglets en haut).
  let pos;
  if (!rect) pos = { left: (vue.w - larg) / 2, top: Math.max(16, vue.h * 0.22) };
  else if (rect.left + rect.width + 16 + larg < vue.w && rect.left < vue.w / 3) {
    pos = { left: rect.left + rect.width + 16, top: Math.max(16, Math.min(rect.top - 12, vue.h - 360)) };
  } else {
    pos = { left: Math.max(16, Math.min(rect.left, vue.w - larg - 16)), top: rect.top + rect.height + 14 };
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Visite guidée de votre espace">
      {/* Le voile, troué autour de l'entrée visée (une grande ombre portée par le cadre de l'entrée). */}
      {rect ? (
        <div className="absolute pointer-events-none rounded-carte transition-all duration-300 ease-ios"
          style={{ top: rect.top - MARGE, left: rect.left - MARGE, width: rect.width + 2 * MARGE, height: rect.height + 2 * MARGE,
            boxShadow: '0 0 0 9999px rgba(14, 42, 79, 0.55), 0 0 0 3px var(--c-accent, #05B7E6)' }} />
      ) : <div className="absolute inset-0" style={{ background: 'rgba(14, 42, 79, 0.55)' }} />}
      <div className="absolute bg-white rounded-fenetre shadow-dessus p-5 space-y-3 transition-all duration-300 ease-ios"
        style={{ ...pos, width: larg }}>
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
                  style={{ background: 'var(--c-principal, #16406A)' }}>{n + 1}</span>
                <span>{g}</span>
              </li>))}
          </ol>)}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex gap-1 mr-auto" aria-hidden="true">
            {etapes.map((_, n) => <span key={n} className="w-1.5 h-1.5 rounded-full" style={{ background: n === i ? 'var(--c-principal, #16406A)' : 'rgb(var(--gris-300, 203 213 225))' }} />)}
          </div>
          {!dernier && <button type="button" className="text-second text-slate-500 underline px-1" onClick={finir}>Passer</button>}
          {i > 0 && <button type="button" className="bouton" onClick={() => setI(i - 1)} aria-label="Étape précédente"><IconArrowLeft size={15} /></button>}
          <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={() => (dernier ? finir() : setI(i + 1))}>
            {dernier ? 'Commencer' : <>Suivant <IconArrowRight size={15} /></>}</button>
        </div>
      </div>
    </div>);
}

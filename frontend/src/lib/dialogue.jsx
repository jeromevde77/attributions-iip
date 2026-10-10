import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconAlertTriangle, IconInfoCircle, IconCircleCheck, IconHelpCircle } from '@tabler/icons-react';

/**
 * LES BOÎTES DU NAVIGATEUR SORTENT DE LUCIE (audit V3, 3 octobre 2026).
 *
 * `alert`, `confirm` et `prompt` étaient appelés 370 fois : une boîte grise
 * du système, à l'adresse « dev.lucie-iip.be indique », hors de la charte,
 * qui bloque tout l'onglet et qu'on valide d'un Entrée sans la lire. Une
 * confirmation qui ne ressemble pas à Lucie n'est pas lue comme Lucie.
 *
 * Trois fonctions, appelées comme celles qu'elles remplacent, mais qui
 * rendent une PROMESSE — on les attend :
 *
 *   if (!(await demander('Supprimer cette attribution ?'))) return;
 *   informer('Enregistré.');
 *   const motif = await saisir({ message: 'Motif de la réouverture', obligatoire: true });
 *
 * Elles acceptent un texte ou un objet { titre, message, confirmer, annuler,
 * ton: 'neutre' | 'alerte' | 'reussi', valeur, obligatoire, multiligne }.
 * Un seul hôte, `<Dialogues />`, monté à la racine (main.jsx) : un écran n'a
 * rien à poser pour s'en servir. Les demandes se suivent, elles ne
 * s'écrasent pas.
 */

let file = [];
const abonnes = new Set();
const prevenir = () => abonnes.forEach(f => f());

// Les messages hérités commencent souvent par un émoji qui disait le ton :
// on le retire du texte et on le lit comme un ton.
const TETES = [
  [/^\s*(⚠️?|❗|‼️?)\s*/u, 'alerte'],
  [/^\s*(❌|✗|✖️?|⛔|🚫)\s*/u, 'alerte'],
  [/^\s*(✅|✓|✔️?)\s*/u, 'reussi'],
  [/^\s*(ℹ️?|💡)\s*/u, 'neutre'],
];
const DESTRUCTIF = /\b(supprim|effac|retir|écras|ecras|réinitialis|vider|purg|détruir|annuler la|révoqu|dévalid|désactiv)/i;
const ERREUR = /\b(erreur|impossible|échec|echec|refus|introuvable|invalide|manque|manquant)/i;

function normaliser(entree, genre) {
  const o = typeof entree === 'object' && entree !== null ? { ...entree } : { message: entree };
  let message = String(o.message ?? '');
  let ton = o.ton;
  for (const [re, t] of TETES) {
    if (re.test(message)) { message = message.replace(re, ''); ton = ton || t; break; }
  }
  if (!ton) {
    if (genre === 'demander' && DESTRUCTIF.test(message)) ton = 'alerte';
    else if (genre === 'informer' && ERREUR.test(message)) ton = 'alerte';
    else ton = 'neutre';
  }
  return { ...o, message, ton, genre };
}

function pousser(genre, entree) {
  return new Promise(resoudre => {
    file = [...file, { ...normaliser(entree, genre), resoudre, id: Math.random() }];
    prevenir();
  });
}

/** Remplace `confirm()` : rend true (confirmé) ou false. */
export const demander = entree => pousser('demander', entree);
/** Remplace `alert()` : rend une promesse résolue à la fermeture. */
export const informer = entree => pousser('informer', entree);
/** Remplace `prompt()` : rend le texte saisi, ou null si l'on annule. */
export const saisir = entree => pousser('saisir', entree);
/** Une question à plusieurs réponses : { message, choix: [{ valeur, libelle, aide? }] }.
 *  Rend la valeur choisie, ou null si l'on annule (9 octobre 2026). */
export const choisir = entree => pousser('choisir', entree);

function fermer(reponse) {
  const [tete, ...reste] = file;
  file = reste;
  prevenir();
  tete?.resoudre(reponse);
}

const TITRES = { demander: 'Confirmer', informer: 'Information', saisir: 'Saisir', choisir: 'Choisir' };

export function Dialogues() {
  const courant = useSyncExternalStore(
    f => { abonnes.add(f); return () => abonnes.delete(f); },
    () => file[0] || null,
  );
  if (!courant) return null;
  return <Dialogue key={courant.id} d={courant} />;
}

function Dialogue({ d }) {
  const [valeur, setValeur] = useState(d.valeur ?? '');
  const refChamp = useRef(null);
  const refOk = useRef(null);
  const annuler = () => fermer(d.genre === 'demander' ? false : d.genre === 'saisir' || d.genre === 'choisir' ? null : undefined);
  const valider = () => {
    if (d.genre === 'saisir') {
      if (d.obligatoire && !String(valeur).trim()) return;
      fermer(valeur);
    } else if (d.genre === 'choisir') fermer((d.choix || [])[0]?.valeur ?? null);
    else fermer(d.genre === 'demander' ? true : undefined);
  };

  // ÉCHAP ANNULE CETTE BOÎTE, ET ELLE SEULE : la fenêtre ouverte dessous
  // écoute aussi Échap — sans l'arrêt en phase de capture, on fermait les deux.
  // ENTRÉE valide, sauf dans un champ de plusieurs lignes.
  useEffect(() => {
    const f = e => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); annuler(); }
      else if (e.key === 'Enter' && !(d.multiligne && e.target?.tagName === 'TEXTAREA')) {
        e.stopImmediatePropagation(); e.preventDefault(); valider();
      }
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  });
  useEffect(() => { (refChamp.current || refOk.current)?.focus(); }, []);

  const alerte = d.ton === 'alerte';
  const Ic = d.genre === 'saisir' || d.genre === 'choisir' ? IconHelpCircle
    : alerte ? IconAlertTriangle : d.ton === 'reussi' ? IconCircleCheck
    : d.genre === 'demander' ? IconHelpCircle : IconInfoCircle;
  const teinte = alerte ? 'var(--c-refuse)' : d.ton === 'reussi' ? 'var(--c-reussi)' : 'var(--c-principal)';
  const libelleOk = d.confirmer || (d.genre === 'informer' ? 'OK' : d.genre === 'saisir' ? 'Valider' : 'Confirmer');
  const bloque = d.genre === 'saisir' && d.obligatoire && !String(valeur).trim();

  return (
    <div role="alertdialog" aria-modal="true" aria-label={d.titre || TITRES[d.genre]}
      className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[14vh]"
      onMouseDown={e => e.target === e.currentTarget && d.genre !== 'saisir' && annuler()}>
      <div aria-hidden="true" className="absolute inset-0 voile-fenetre" />
      {/* Le bloc signalé : blanc, liseré et icône dans la couleur, texte à l'encre. */}
      <div className="relative bg-white rounded-r-fenetre shadow-dessus w-[460px] max-w-full overflow-hidden
                      border-l-4" style={{ borderLeftColor: teinte }}>
        <div className="flex gap-3 px-5 pt-5 pb-4">
          <Ic size={22} className="flex-none mt-0.5" style={{ color: teinte }} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-iip-texte">{d.titre || TITRES[d.genre]}</div>
            {d.message && (
              <div className="mt-1.5 text-sm text-slate-700 whitespace-pre-line break-words leading-relaxed
                              max-h-[50vh] overflow-y-auto">{d.message}</div>
            )}
            {d.genre === 'saisir' && (d.multiligne
              ? <textarea ref={refChamp} rows={4} value={valeur} onChange={e => setValeur(e.target.value)}
                  placeholder={d.indice || ''}
                  className="mt-3 w-full border border-slate-300 rounded-champ px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iip-blue/30" />
              : <input ref={refChamp} value={valeur} onChange={e => setValeur(e.target.value)}
                  placeholder={d.indice || ''} type={d.type || 'text'}
                  className="controle mt-3 w-full" />)}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          {d.genre !== 'informer' && (
            <button type="button" className="bouton" onClick={annuler}>{d.annuler || 'Annuler'}</button>
          )}
          {d.genre === 'choisir' ? (d.choix || []).map((c, i) => (
            <button key={c.valeur} type="button" ref={i === 0 ? refOk : undefined} title={c.aide || ''}
              onClick={() => fermer(c.valeur)} className={`bouton ${i === 0 ? 'bouton-fort' : ''}`}>
              {c.libelle}
            </button>
          )) : (
          <button type="button" ref={refOk} disabled={bloque} onClick={valider}
            className={`bouton ${alerte && d.genre === 'demander' ? 'bouton-detruire' : 'bouton-fort'}`}>
            {libelleOk}
          </button>)}
        </div>
      </div>
    </div>
  );
}

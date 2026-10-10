import { useEffect, useState } from 'react';
import { IconCalendarExclamation } from '@tabler/icons-react';
import { authHeaders, getAnnee, setAnnee } from '../lib/api.js';
import { anneeCourante, dejaAccepte, accepter, confirmerAnnee } from '../lib/annee.js';

/**
 * TRAVAILLER SANS LE SAVOIR DANS UNE AUTRE ANNÉE.
 *
 * L'année de travail est un réglage discret, en haut de l'écran, et il est
 * RÉMANENT : ouvert un jour sur 2025-2026 pour vérifier une charge passée, il
 * y reste le lendemain. On encode alors une attribution, on déplace une date
 * d'UE, on réorganise une section — et tout cela s'écrit dans une année qui
 * n'est plus la bonne. Rien ne le signale, rien ne le refuse, et l'erreur ne
 * se découvre qu'au moment où les chiffres ne tombent pas.
 *
 * C'est une erreur de contexte, pas une faute de saisie : elle ne se corrige
 * pas en relisant, parce que tout ce qu'on a tapé est juste — au mauvais
 * endroit. D'où deux garde-fous, et pas un de plus :
 *
 *  · À L'ENTRÉE de l'écran, on le dit une fois, franchement, avec de quoi
 *    changer d'année sur place. C'est le moment où la correction coûte le
 *    moins cher.
 *  · AU MOMENT D'ÉCRIRE (voir `confirmerAnnee`), on redemande — une fois par
 *    année et par session : celui qui a répondu « je sais ce que je fais » ne
 *    doit pas être interrogé à chaque cellule, sinon il cesse de lire.
 *
 * ON NE REFUSE PAS. Travailler sur une année passée est parfaitement légitime :
 * on prépare la suivante en juin, on corrige un encodage de l'an dernier. Un
 * écran qui interdirait obligerait à contourner.
 */

/**
 * À POSER EN TÊTE D'UN ÉCRAN QUI ÉCRIT. `quoi` nomme ce qu'on s'apprête à
 * modifier, au singulier et dans les mots de la maison : « l'organisation »,
 * « les attributions ».
 */
export default function GardeAnnee({ quoi = 'ces données' }) {
  const [courante, setCourante] = useState(null);
  const [annees, setAnnees] = useState([]);
  const [choix, setChoix] = useState('');
  const [ferme, setFerme] = useState(false);
  const regardee = getAnnee();

  useEffect(() => {
    anneeCourante().then(setCourante);
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => {});
  }, []);

  // Tant qu'on ne sait pas quelle est l'année en cours, on n'alarme pas :
  // une fenêtre qui s'ouvre sur une information qu'on n'a pas est pire que
  // pas de fenêtre du tout.
  if (!courante || courante === regardee) return null;
  if (ferme || dejaAccepte(regardee, quoi)) return null;

  const basculer = () => {
    const vers = choix || courante;
    setAnnee(vers);
    // L'année est lue au montage par presque tous les écrans : la recharge est
    // la seule façon honnête de garantir que PLUS RIEN n'est resté sur
    // l'ancienne.
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]
                    voile-fenetre">
      {/* LE DESSIN DES BOÎTES DE LUCIE (lib/dialogue.jsx) : liseré orange à
          gauche, coins droits de ce côté, l'action dans un pied. */}
      <div className="rounded-r-fenetre max-w-lg w-full shadow-dessus overflow-hidden border-l-4"
        style={{ borderLeftColor: 'var(--c-attente)', background: 'var(--c-fenetre_corps, #fff)' }}>
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <IconCalendarExclamation size={22} className="text-[color:var(--c-attente,var(--c-attente))] flex-none mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-iip-blue">
              Vous n'êtes pas dans l'année en cours
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Vous vous apprêtez à modifier {quoi} de <b>{regardee}</b>, alors que
              l'année en cours est <b>{courante}</b>. Ce qui sera encodé ici ne comptera
              pas pour {courante}.
            </p>
          </div>
        </div>

        <div className="px-5 pb-4 pl-[52px] space-y-2">
          <label className="block">
            <span className="block text-mention uppercase tracking-[.1em] text-slate-400 font-semibold mb-0.5">Changer d'année</span>
            <select value={choix || courante} onChange={e => setChoix(e.target.value)}
              className="controle w-full bg-white text-iip-texte">
              {(annees.length ? annees : [courante, regardee]).map(a => (
                <option key={a} value={a}>
                  {a}{a === courante ? ' — année en cours' : ''}
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-slate-500">
            Rester en {regardee} est légitime — on prépare l'année suivante, on corrige
            un encodage passé. L'avertissement ne reviendra pas pour cet écran tant que
            la session est ouverte.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button
            onClick={() => { accepter(regardee, quoi); setFerme(true); }}
            className="bouton">
            Rester en {regardee}
          </button>
          <button onClick={basculer} className="bouton bouton-fort">
            Travailler en {choix || courante}
          </button>
        </div>
      </div>
    </div>
  );
}

// La garde d'écriture vit dans lib/annee.js — la couche d'API l'appelle, et
// elle ne peut donc pas dépendre d'un composant.
export { confirmerAnnee };

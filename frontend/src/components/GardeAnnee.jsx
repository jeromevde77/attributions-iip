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
                    bg-[rgba(11,21,45,.32)] backdrop-blur-[3px]">
      <div className="bg-white rounded-fenetre max-w-lg w-full shadow-dessus overflow-hidden">
        <div className="px-5 py-4 flex items-start gap-3 border-b border-slate-200">
          <IconCalendarExclamation size={22} className="text-[color:var(--c-attente,#B45309)] flex-none mt-0.5" />
          <div>
            <h2 className="text-[15px] font-semibold text-iip-blue">
              Vous n'êtes pas dans l'année en cours
            </h2>
            <p className="text-[13px] text-slate-600 mt-1">
              Vous vous apprêtez à modifier {quoi} de <b>{regardee}</b>, alors que
              l'année en cours est <b>{courante}</b>. Ce qui sera encodé ici ne comptera
              pas pour {courante}.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <label className="block text-[11px] text-slate-500">
            Changer d'année
            <select value={choix || courante} onChange={e => setChoix(e.target.value)}
              className="block w-full mt-1 bg-white border border-slate-300 rounded-champ
                         px-2 h-9 text-[13px]">
              {(annees.length ? annees : [courante, regardee]).map(a => (
                <option key={a} value={a}>
                  {a}{a === courante ? ' — année en cours' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={basculer} className="bouton-fort controle px-3">
              Travailler en {choix || courante}
            </button>
            <button
              onClick={() => { accepter(regardee, quoi); setFerme(true); }}
              className="bouton controle px-3">
              Rester en {regardee}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Rester en {regardee} est légitime — on prépare l'année suivante, on corrige
            un encodage passé. L'avertissement ne reviendra pas pour cet écran tant que
            la session est ouverte.
          </p>
        </div>
      </div>
    </div>
  );
}

// La garde d'écriture vit dans lib/annee.js — la couche d'API l'appelle, et
// elle ne peut donc pas dépendre d'un composant.
export { confirmerAnnee };

import { useEffect, useState } from 'react';
import { IconBulb, IconTrash } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * LES AMÉLIORATIONS — CE QUE CEUX QUI S'EN SERVENT VOUDRAIENT.
 *
 * Les rubriques « à venir » tenaient lieu de carnet d'idées : une place
 * réservée dans un menu, annonçant un écran qui n'existe pas. C'est une
 * promesse faite à qui n'a rien demandé, et cela parasite le rail de ceux qui
 * travaillent — on vise une entrée, on tombe sur « à venir ».
 *
 * Une demande ne vit pas dans un menu. Elle s'écrit AU MOMENT OÙ L'ON BUTE,
 * pas trois jours plus tard en réunion — d'où une porte présente sur tous les
 * écrans, au même endroit —, et elle se retrouve ensuite dans un registre.
 *
 * ON RÉPOND, MÊME POUR DIRE NON. Une idée déposée et jamais commentée apprend
 * une seule chose à son auteur : que cela ne sert à rien d'écrire.
 */

const TEINTE = {
  nouvelle: 'border-l-[#1B2B4B]',
  retenue: 'border-l-[#0093B0]',
  en_cours: 'border-l-[#B45309]',
  faite: 'border-l-[#15803D]',
  ecartee: 'border-l-slate-300',
};

export default function Ameliorations({ ecran, onClose }) {
  const [etat, setEtat] = useState(null);
  const [titre, setTitre] = useState('');
  const [detail, setDetail] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const charger = () => fetch('/api/suggestions', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : { lignes: [], etats: [] }))
    .then(setEtat)
    .catch(() => setEtat({ lignes: [], etats: [] }));
  useEffect(() => { charger(); }, []);

  async function deposer() {
    if (!titre.trim()) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/suggestions', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre, detail, ecran }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      setTitre(''); setDetail('');
      await charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function majuscule(id, champs) {
    await fetch(`/api/suggestions/${id}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(champs),
    });
    await charger();
  }

  async function retirer(id) {
    if (!confirm('Retirer cette idée ?')) return;
    await fetch(`/api/suggestions/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  const etats = etat?.etats || [];

  return (
    <Fenetre icone={IconBulb} large="grande" onFermer={onClose}
      titre="Améliorations"
      sous="Ce qui manque, ce qui gêne, ce qui irait mieux autrement">
      <div className="flex-1 min-h-0 flex flex-col">

        <div className="flex-none px-5 py-3 border-b border-slate-200 space-y-2">
          <input value={titre} onChange={e => setTitre(e.target.value)}
            placeholder="En une phrase : ce qui manque ou ce qui gêne"
            className="controle w-full" />
          <textarea rows={3} value={detail} onChange={e => setDetail(e.target.value)}
            placeholder="Le contexte : quand cela arrive, ce que vous faites aujourd'hui à la place, ce que cela coûte"
            className="w-full border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]" />
          <div className="flex items-center gap-2">
            <button onClick={deposer} disabled={!titre.trim() || enCours}
              className="bouton bouton-fort disabled:opacity-40">Déposer l'idée</button>
            {ecran && (
              <span className="text-[11px] text-slate-400">
                Déposée depuis <b>{ecran}</b> — l'écran est enregistré avec elle.
              </span>
            )}
            {erreur && <span className="text-[12px] text-rose-700">{erreur}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0 p-3 space-y-2">
          {!etat ? (
            <div className="text-[13px] text-slate-400 px-2">Chargement…</div>
          ) : !etat.lignes.length ? (
            <div className="text-[13px] text-slate-400 px-2 py-6 text-center
                            border-2 border-dashed rounded-carte">
              Rien encore. La première idée est souvent la plus utile :
              c'est celle qui gêne tous les jours.
            </div>
          ) : etat.lignes.map(s => (
            <div key={s.id}
              className={`carte px-3 py-2 border-l-[3px] ${TEINTE[s.etat] || TEINTE.nouvelle}`}>
              <div className="flex items-start gap-2">
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium">{s.titre}</span>
                  <span className="block text-[11px] text-slate-400">
                    {s.auteur_nom || 'anonyme'}
                    {s.ecran ? ` · ${s.ecran}` : ''}
                    {s.cree_le ? ` · ${String(s.cree_le).slice(0, 10).split('-').reverse().join('/')}` : ''}
                  </span>
                </span>
                {etat.tout ? (
                  <select value={s.etat} onChange={e => majuscule(s.id, { etat: e.target.value })}
                    className="controle text-[12px] h-7 py-0">
                    {etats.map(e2 => <option key={e2.cle} value={e2.cle}>{e2.libelle}</option>)}
                  </select>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    {etats.find(e2 => e2.cle === s.etat)?.libelle || s.etat}
                  </span>
                )}
                <button onClick={() => retirer(s.id)}
                  className="text-slate-300 hover:text-red-500" title="Retirer">
                  <IconTrash size={14} />
                </button>
              </div>

              {s.detail && (
                <div className="text-[12px] text-slate-600 mt-1 whitespace-pre-wrap">
                  {s.detail}
                </div>
              )}

              {/* LA RÉPONSE FAITE À L'AUTEUR. Elle se lit sous son idée, pas
                  ailleurs : « on n'a jamais eu de retour » est le reproche que
                  ce registre existe pour éteindre. */}
              {etat.tout ? (
                <input defaultValue={s.reponse || ''}
                  placeholder="Réponse à l'auteur — même pour dire non, et pourquoi"
                  onBlur={e => e.target.value !== (s.reponse || '')
                    && majuscule(s.id, { reponse: e.target.value })}
                  className="mt-1.5 w-full border border-slate-200 rounded-champ
                             px-2 py-1 text-[12px]" />
              ) : s.reponse ? (
                <div className="mt-1.5 text-[12px] text-iip-blue border-l-2 border-slate-200 pl-2">
                  {s.reponse}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Fenetre>
  );
}

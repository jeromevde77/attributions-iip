import { useEffect, useState } from 'react';
import { IconChevronRight, IconArrowLeft, IconBolt, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import FeuilleDeliberation from '../components/FeuilleDeliberation.jsx';
import EncodageCours from '../components/EncodageCours.jsx';
import LiensCoursAcquis from '../components/LiensCoursAcquis.jsx';
import EncodageRapide from './EncodageRapide.jsx';

/**
 * Délibération — la porte d'entrée.
 *
 * On atteignait la feuille par un clic non annoncé sur un en-tête de colonne,
 * dans l'écran de saisie rapide : on arrivait au sens par l'accessoire, et
 * personne ne trouvait le chemin sans qu'on le lui montre.
 *
 * L'accès est ici inversé et nommé : les SECTIONS, puis leurs UNITÉS, puis la
 * feuille — et depuis la feuille, un étudiant. La saisie rapide devient ce
 * qu'elle est, un outil qu'on ouvre d'un bouton quand on veut aller vite.
 *
 * Chaque unité annonce ce qui reste à faire : sans cela l'écran ne serait
 * qu'un sommaire, et le Conseil chercherait encore par où commencer.
 */
export default function Deliberation() {
  const annee = getAnnee();
  const [plan, setPlan] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState(null);
  const [ueNum, setUeNum] = useState(null);
  const [rapide, setRapide] = useState(false);
  // Les COURS d'une unité, dépliés à la demande : c'est par eux que les
  // professeurs encodent, acquis par acquis.
  const [coursDeUe, setCoursDeUe] = useState({});   // ue_num → [cours]
  const [deplie, setDeplie] = useState(null);
  const [encoder, setEncoder] = useState(null);     // cours_code en saisie
  const [parametrer, setParametrer] = useState(null);  // ue_num en paramétrage

  async function ouvrirCours(ueNum) {
    if (deplie === ueNum) { setDeplie(null); return; }
    setDeplie(ueNum);
    if (coursDeUe[ueNum]) return;
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/cours?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setCoursDeUe(m => ({ ...m, [ueNum]: j }));
    } catch { /* la liste des cours est un confort, pas un bloquant */ }
  }

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/plan?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setPlan(j);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee]);

  if (rapide) {
    return (
      <div>
        <div className="px-5 pt-4">
          <button onClick={() => { setRapide(false); charger(); }}
            className="flex items-center gap-1.5 text-[12.5px] text-iip-blue hover:underline">
            <IconArrowLeft size={15} /> Retour à la délibération
          </button>
        </div>
        <EncodageRapide />
      </div>
    );
  }

  const sec = plan?.sections.find(s => s.section === section) || null;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Délibération</h2>
          <p className="text-sm text-slate-500">
            Année {annee} · choisissez une section, puis l'unité à délibérer.
          </p>
        </div>
        {/* La saisie rapide reste accessible, mais elle n'est plus le CHEMIN :
            on y va pour saisir vite, pas pour délibérer. */}
        <button onClick={() => setRapide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-iip-blue
                     text-iip-blue font-semibold rounded-lg">
          <IconBolt size={15} /> Encodage rapide
        </button>
      </div>

      {erreur && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
          {erreur}
        </div>
      )}

      {!plan ? (
        <div className="py-8 text-center text-slate-400 text-sm">Chargement…</div>
      ) : !plan.sections.length ? (
        <div className="py-10 text-center text-[13px] text-slate-500 border-2 border-dashed rounded-xl">
          Aucune inscription pour {annee} : il n'y a rien à délibérer.
        </div>
      ) : !sec ? (
        /* ── Les SECTIONS ─────────────────────────────────────────────── */
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plan.sections.map(s => (
            <button key={s.section} onClick={() => setSection(s.section)}
              className="text-left border border-slate-200 rounded-xl px-4 py-3
                         hover:border-iip-blue hover:bg-iip-blue/5 transition">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-iip-blue">{s.section}</span>
                <IconChevronRight size={16} className="text-slate-300" />
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5">
                {s.nb_ues} unité(s) · {s.inscrits} inscription(s)
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
                {s.a_delibierer > 0
                  ? <span className="text-amber-800 font-semibold">{s.a_delibierer} à délibérer</span>
                  : <span className="text-emerald-700 font-semibold">Tout est délibéré</span>}
                {s.non_motives > 0 && (
                  <span className="text-red-700 flex items-center gap-1">
                    <IconAlertTriangle size={12} /> {s.non_motives} échec(s) sans motivation
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* ── Les UNITÉS de la section ─────────────────────────────────── */
        <>
          <button onClick={() => setSection(null)}
            className="flex items-center gap-1.5 text-[12.5px] text-iip-blue hover:underline">
            <IconArrowLeft size={15} /> Toutes les sections
          </button>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200
                            flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-iip-blue">
                {sec.section}
                <span className="ml-2 font-normal text-slate-500">
                  {sec.nb_ues} unité(s) · {sec.inscrits} inscription(s)
                </span>
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {sec.ues.map(u => {
                const reste = u.inscrits - u.decides;
                return (
                  <div key={u.ue_num}>
                  <div className="w-full px-3 py-2 hover:bg-slate-50 flex items-center gap-3">
                    <button onClick={() => setUeNum(u.ue_num)}
                      className="font-bold text-iip-blue w-12 flex-none tabular-nums text-left
                                 hover:underline">{u.ue_num}</button>
                    <span className="flex-1 text-[12.5px] text-slate-700 truncate">
                      {u.ue_nom || `UE ${u.ue_num}`}
                      {u.ue_niv && <span className="ml-2 text-[10.5px] text-slate-400">{u.ue_niv}</span>}
                    </span>

                    {/* L'avancement, en clair : c'est ce qu'on vient chercher. */}
                    <span className="text-[11.5px] tabular-nums text-slate-500 w-28 text-right flex-none">
                      {u.decides}/{u.inscrits} décidé(s)
                    </span>
                    <span className="w-24 flex-none text-right">
                      {reste > 0
                        ? <span className="text-[11.5px] font-semibold text-amber-800">{reste} restant(s)</span>
                        : <span className="text-[11.5px] font-semibold text-emerald-700">complet</span>}
                    </span>
                    <span className="w-32 flex-none text-right">
                      {u.echecs_non_motives > 0 && (
                        <span className="text-[11.5px] text-red-700 flex items-center gap-1 justify-end">
                          <IconAlertTriangle size={12} /> {u.echecs_non_motives} sans motivation
                        </span>
                      )}
                    </span>
                    {/* Deux gestes distincts, nommés : délibérer l'unité, ou
                        encoder l'un de ses cours. */}
                    <button onClick={() => setUeNum(u.ue_num)}
                      className="px-2 py-1 text-[11.5px] rounded-lg border border-iip-blue
                                 text-iip-blue font-semibold flex-none">
                      Délibérer
                    </button>
                    <button onClick={() => ouvrirCours(u.ue_num)}
                      className="px-2 py-1 text-[11.5px] rounded-lg border border-slate-300
                                 text-slate-600 flex-none">
                      Encoder par cours
                    </button>
                    <IconChevronRight size={16} className="text-slate-300 flex-none" />
                  </div>

                  {deplie === u.ue_num && (
                    <div className="px-3 pb-2 pl-16 space-y-1">
                      {!coursDeUe[u.ue_num] ? (
                        <div className="text-[11.5px] text-slate-400">Chargement des cours…</div>
                      ) : !coursDeUe[u.ue_num].length ? (
                        <div className="text-[11.5px] text-amber-800 space-y-1">
                          <div>
                            Aucun cours n'a d'acquis rattaché dans cette unité : la saisie
                            par cours n'a rien à montrer.
                          </div>
                          <button onClick={() => setParametrer(u.ue_num)}
                            className="px-2 py-1 rounded-lg bg-iip-blue text-white font-semibold">
                            Paramétrer les cours et acquis
                          </button>
                        </div>
                      ) : coursDeUe[u.ue_num].map(c => (
                        <button key={c.cours_code} onClick={() => setEncoder(c.cours_code)}
                          className="w-full text-left px-2 py-1 rounded-lg hover:bg-slate-100
                                     flex items-center gap-2 text-[12px]">
                          <span className="font-mono text-[11px] text-slate-500 w-16 flex-none">
                            {c.cours_code}
                          </span>
                          <span className="flex-1 truncate text-slate-700">{c.cours_nom || '—'}</span>
                          <span className="text-[11px] text-slate-400">
                            {c.nb_acquis} acquis
                            {c.poids_cours_affiche != null && ` · poids ${c.poids_cours_affiche}`}
                          </span>
                        </button>
                      ))}
                      {!!(coursDeUe[u.ue_num] || []).length && (
                        <button onClick={() => setParametrer(u.ue_num)}
                          className="text-[11.5px] text-iip-blue underline">
                          Paramétrer les cours et acquis de cette unité
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11.5px] text-slate-500">
            Un échec sans motivation rend la décision attaquable : la motivation
            se pose dans la feuille, en cliquant sur le nom de l'étudiant.
          </p>
        </>
      )}

      {ueNum && (
        <FeuilleDeliberation ueNum={ueNum} annee={annee}
          onClose={() => { setUeNum(null); charger(); }} />
      )}

      {encoder && (
        <EncodageCours coursCode={encoder} annee={annee}
          onClose={() => { setEncoder(null); charger(); }}
          onParametrer={ue => { setEncoder(null); setParametrer(ue); }} />
      )}

      {parametrer && (
        <LiensCoursAcquis ueNum={parametrer} annee={annee}
          onClose={() => { setParametrer(null); setCoursDeUe({}); if (deplie) ouvrirCours(deplie); }}
          onEnregistre={() => setCoursDeUe({})} />
      )}
    </div>
  );
}

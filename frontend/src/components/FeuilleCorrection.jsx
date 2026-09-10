import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconX, IconSearch, IconAlertTriangle, IconCheck, IconRepeat, IconBrush,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { naviguerGrille, caseGrille } from '../lib/grilleClavier.js';
import PanneauAcquis from './PanneauAcquis.jsx';

/**
 * LA FEUILLE DE CORRECTION — toute l'unité sur une page, et modifiable.
 *
 * Une note change après la délibération : un professeur s'est trompé, une
 * copie a été retrouvée, un recours a été admis. Il fallait alors rouvrir la
 * revue et repasser DEVANT CHAQUE ÉTUDIANT pour retrouver celui-là. Sur une
 * unité de cent inscrits, personne ne le fait de bon cœur — et ce qui coûte
 * cher à corriger finit par ne pas l'être.
 *
 * Ici, tout tient sur une feuille : par cours, ses acquis, sa cote et son
 * ajournement ; puis la note d'unité et la décision. On modifie la case qu'on
 * veut, elle s'enregistre seule, et la ligne se recalcule.
 *
 * CE QUI EST CALCULÉ NE SE TAPE PAS. La cote d'un cours est une somme pondérée
 * d'acquis, celle de l'unité une somme pondérée de cours : les laisser saisir
 * permettrait d'écrire un total qui ne correspond à rien. Elles s'affichent,
 * elles ne s'éditent pas.
 *
 * ET L'ÉCART SE VOIT. Après un changement de note, ce qu'on cherche est
 * l'endroit où la décision inscrite ne correspond plus à ce que le calcul dit
 * — c'est précisément ce qu'on vient corriger. Ces lignes-là sont signalées,
 * et un filtre ne montre qu'elles.
 */

const DECISIONS = [
  { cle: 'reussi', l: 'Réussi', c: 'bg-emerald-600 border-emerald-700' },
  { cle: 'ajourne', l: 'Ajourné', c: 'bg-amber-500 border-amber-600' },
  { cle: 'refuse', l: 'Refusé', c: 'bg-red-600 border-red-700' },
  { cle: 'absent', l: 'Absent', c: 'bg-slate-500 border-slate-600' },
];
const LIB = Object.fromEntries(DECISIONS.map(d => [d.cle, d.l]));

const fmt = n => (n == null ? '—'
  : String(Math.round(Number(n) * 100) / 100).replace('.', ','));

/** Rouge sous dix, orange à dix-onze, vert au-delà — comme à l'encodage. */
function ton(v) {
  if (v == null) return 'text-slate-300';
  if (v < 10) return 'text-red-700 bg-red-50';
  if (v < 12) return 'text-amber-700 bg-amber-50';
  return 'text-emerald-700 bg-emerald-50';
}

export default function FeuilleCorrection({ ueNum, annee, onClose, onModifie }) {
  const [data, setData] = useState(null);
  const [session, setSession] = useState(1);
  const [choisie, setChoisie] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [ecartsSeuls, setEcartsSeuls] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [erreur, setErreur] = useState(null);
  const [dernier, setDernier] = useState(null);
  const grille = useRef(null);

  async function charger() {
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/feuille`
        + `?annee=${encodeURIComponent(annee)}&session=${session}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return null; }
      setErreur(null);
      // La feuille s'ouvre sur la session où l'on travaille vraiment, non sur
      // la première : on encode septembre, on referme, on rouvre — et l'on
      // retrouvait juin.
      if (!choisie && session !== 2 && (j.etat_session?.session === 2 || j.notes_s2 > 0)) {
        setChoisie(true); setSession(2); return null;
      }
      setData(j);
      return j;
    } catch (e) { setErreur(e.message); return null; }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum, annee, session]);

  /** Un appel qui écrit, puis relit : la ligne entière se recalcule. */
  async function ecrire(url, corps) {
    setEnAttente(n => n + 1);
    try {
      const rep = await fetch(url, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(corps) });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Enregistrement refusé.');
        return false;
      }
      setErreur(null); setDernier(Date.now());
      await charger(); onModifie?.();
      return true;
    } catch (e) { setErreur(e.message); return false; }
    finally { setEnAttente(n => n - 1); }
  }

  const poserNote = (etudId, coursCode, aaCode, v) => ecrire('/api/acquis/feuille/note', {
    etudiant_id: etudId, annee_scolaire: annee, ue_num: ueNum,
    cours_code: coursCode, aa_code: aaCode, session,
    points: v === '' ? null : Number(String(v).replace(',', '.')),
  });

  const basculerCours = (etudId, coursCode, ajourne) =>
    ecrire('/api/acquis/deliberation/ajustement', {
      etudiant_id: etudId, annee_scolaire: annee, ue_num: ueNum, session,
      portee: 'cours', code: coursCode, action: ajourne ? null : 'ajourne',
    });

  const basculerFaveur = (etudId, active) =>
    ecrire('/api/acquis/deliberation/ajustement', {
      etudiant_id: etudId, annee_scolaire: annee, ue_num: ueNum, session,
      portee: 'ue', code: '*', action: active ? null : 'faveur',
    });

  const poserDecision = (etudId, resultat, points) => ecrire('/api/acquis/decision', {
    etudiant_id: etudId, annee_scolaire: annee, ue_num: ueNum, session,
    resultat, points: points ?? null,
  });

  const cours = useMemo(
    () => (data?.cours || []).filter(c => c.acquis?.length), [data]);

  const lignes = useMemo(() => {
    if (!data) return [];
    const q = recherche.trim().toLowerCase();
    return data.etudiants.filter(e => {
      if (q && !`${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      if (!ecartsSeuls) return true;
      const c = data.cotes?.[e.id];
      return c && c.arrete && c.decision && c.arrete !== c.decision;
    });
  }, [data, recherche, ecartsSeuls]);

  const nbEcarts = useMemo(() => (data?.etudiants || []).filter(e => {
    const c = data.cotes?.[e.id];
    return c && c.arrete && c.decision && c.arrete !== c.decision;
  }).length, [data]);

  let colonne = 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1700px] mt-4
                      h-[94vh] overflow-hidden flex flex-col">

        <div className="flex-none px-5 pt-4 pb-2 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              Feuille de correction — UE {ueNum}
              {data?.ue?.ue_nom ? ` · ${data.ue.ue_nom}` : ''}
            </h3>
            <p className="text-[12px] text-slate-500">
              Toute l'unité sur une page : on corrige la case, elle s'enregistre seule.
              {enAttente > 0 && <span className="text-amber-700"> · enregistrement…</span>}
              {!enAttente && dernier && (
                <span className="text-emerald-700"> · <IconCheck size={11} className="inline" /> enregistré</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <div className="flex rounded-lg border border-slate-300 overflow-hidden">
              {[1, 2].map(s => (
                <button key={s} onClick={() => { setChoisie(true); setSession(s); }}
                  className={`px-2.5 py-1 text-[12px] ${session === s
                    ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                  {s === 1 ? '1re' : '2e'} session
                </button>
              ))}
            </div>
            <div className="relative">
              <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Étudiant…"
                className="pl-7 pr-2 py-1 text-[12px] border border-slate-300 rounded-lg w-36" />
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <IconX size={18} />
            </button>
          </div>
        </div>

        {erreur && (
          <div className="flex-none mx-5 mb-2 px-3 py-2 rounded-lg bg-red-50 border
                          border-red-200 text-[12px] text-red-800 flex items-start gap-1.5">
            <IconAlertTriangle size={14} className="flex-none mt-px" /> {erreur}
          </div>
        )}

        {/* CE QU'ON VIENT CORRIGER SE TROUVE ICI. Après un changement de note,
            la décision inscrite peut ne plus correspondre à ce que le calcul
            dit : ce sont ces lignes-là qu'on cherche, et elles se comptent. */}
        {!!nbEcarts && (
          <div className="flex-none mx-5 mb-2 px-3 py-2 rounded-lg bg-amber-50 border
                          border-amber-300 text-[12px] text-amber-900 flex items-center
                          justify-between gap-3">
            <span className="flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="flex-none mt-px" />
              <span><b>{nbEcarts} décision(s)</b> ne correspondent plus à ce que le calcul
                propose — c'est en général le signe d'une note modifiée depuis la séance.</span>
            </span>
            <button onClick={() => setEcartsSeuls(v => !v)}
              className={`flex-none px-2.5 py-1 rounded-lg border font-semibold ${ecartsSeuls
                ? 'bg-amber-600 border-amber-700 text-white'
                : 'bg-white border-amber-400 text-amber-900'}`}>
              {ecartsSeuls ? 'Voir tout le monde' : 'Ne voir que ceux-là'}
            </button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <PanneauAcquis colonnes={cours.flatMap(c => c.acquis.map(a => ({
            cours_code: c.cours_code, cours_nom: c.cours_nom,
            professeurs: c.professeurs, aa_code: a.aa_code,
            description: a.description, poids: a.poids })))} />

          <div className="flex-1 overflow-auto px-5 pb-4">
            {!data ? (
              <div className="py-10 text-center text-slate-400 text-sm">Chargement…</div>
            ) : !lignes.length ? (
              <div className="py-10 text-center text-slate-500 text-sm">
                {ecartsSeuls ? 'Aucune décision ne s’écarte du calcul.'
                  : 'Aucun étudiant ne correspond.'}
              </div>
            ) : (
              <table ref={grille} onKeyDown={ev => naviguerGrille(ev, grille.current)}
                className="text-[12px] border-separate border-spacing-0">
                <thead className="sticky top-0 z-20 bg-white">
                  <tr>
                    <th className="sticky left-0 z-30 bg-white text-left px-2 pb-1
                                   min-w-[190px]" />
                    {cours.map((c, i) => (
                      <th key={c.cours_code} colSpan={c.acquis.length + 2}
                        className={`px-2 py-1 border rounded-t-lg text-left align-bottom
                          ${i % 2 ? 'bg-slate-50 border-slate-200'
                                  : 'bg-iip-blue/5 border-iip-blue/20'}`}>
                        <div className="font-semibold text-iip-blue truncate max-w-[240px]">
                          {c.cours_nom || c.cours_code}
                        </div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          {c.cours_code}
                          {c.professeurs ? ` · ${c.professeurs}` : ''}
                        </div>
                      </th>
                    ))}
                    <th colSpan={2}
                      className="px-2 py-1 border-2 border-iip-blue/50 rounded-t-lg
                                 bg-iip-blue/10 align-bottom">
                      <div className="font-semibold text-iip-blue">Unité</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        cote et décision
                      </div>
                    </th>
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-30 bg-white text-left px-2 pb-1
                                   text-[10px] font-bold uppercase tracking-wide
                                   text-slate-500">Étudiant</th>
                    {cours.flatMap(c => [
                      ...c.acquis.map(a => (
                        <th key={`${c.cours_code}|${a.aa_code}`} title={a.description || ''}
                          className="px-1 pb-1 border-x text-[10px] font-bold text-iip-blue">
                          {a.aa_code}
                        </th>
                      )),
                      <th key={`${c.cours_code}|cote`}
                        className="px-1 pb-1 border-x text-[10px] font-bold text-slate-600">
                        cote
                      </th>,
                      ...(session >= 2 ? [] : [
                        <th key={`${c.cours_code}|aj`} title="À représenter"
                          className="px-1 pb-1 border-x text-[10px] font-bold text-amber-700">
                          à repr.
                        </th>,
                      ]),
                    ])}
                    <th className="px-1 pb-1 border-x-2 border-iip-blue/50 bg-iip-blue/10
                                   text-[10px] font-bold text-iip-blue">cote</th>
                    <th title="La cote telle qu'elle figurera sur les documents de l'étudiant"
                      className="px-1 pb-1 border-x bg-slate-50 text-[10px] font-bold
                                 text-slate-600">à l'étudiant</th>
                    <th className="px-1 pb-1 border-x-2 border-iip-blue/50 bg-iip-blue/10
                                   text-[10px] font-bold text-iip-blue min-w-[210px]">
                      décision
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {lignes.map((e, ligne) => {
                    const k = data.cotes?.[e.id] || {};
                    const ecart = k.arrete && k.decision && k.arrete !== k.decision;
                    colonne = 0;
                    return (
                      <tr key={e.id} className={ecart ? 'bg-amber-50/60' : 'hover:bg-slate-50/60'}>
                        <td className={`sticky left-0 z-10 px-2 py-0.5 whitespace-nowrap
                          border-b border-slate-100 ${ecart ? 'bg-amber-50' : 'bg-white'}`}>
                          <span className="font-medium text-slate-800">{e.nom}</span>{' '}
                          <span className="text-slate-500">{e.prenom}</span>
                          {ecart && (
                            <span title={`Le calcul propose « ${LIB[k.decision]} »`}
                              className="ml-1.5 text-[9px] uppercase tracking-wide
                                         text-amber-800 bg-amber-100 border border-amber-300
                                         rounded px-1 py-px">écart</span>
                          )}
                        </td>

                        {cours.flatMap(c => {
                          const m = data.mentions?.[e.id]?.[c.cours_code];
                          const ferme = data.a_representer
                            && !(data.a_representer[e.id] || []).includes(c.cours_code);
                          return [
                            ...c.acquis.map(a => {
                              const v = data.notes?.[e.id]?.[`${c.cours_code}|${a.aa_code}`];
                              const nc = colonne++;
                              return (
                                <td key={`${e.id}|${c.cours_code}|${a.aa_code}`}
                                  className="px-1 py-0.5 border-b border-slate-100 text-center">
                                  <input {...caseGrille(ligne, nc)}
                                    key={`${session}|${v ?? ''}`}
                                    defaultValue={v ?? ''} disabled={!!m || ferme}
                                    onBlur={ev => {
                                      if (String(ev.target.value) !== String(v ?? '')) {
                                        poserNote(e.id, c.cours_code, a.aa_code, ev.target.value);
                                      }
                                    }}
                                    className={`w-11 text-center py-0.5 border rounded
                                      disabled:bg-slate-100 disabled:text-slate-400
                                      ${ton(v)}`} />
                                </td>
                              );
                            }),
                            <td key={`${e.id}|${c.cours_code}|cote`}
                              className="px-1 py-0.5 border-b border-slate-100 text-center">
                              <span className={`inline-block min-w-[30px] px-1 py-0.5 rounded
                                font-bold tabular-nums ${k.na?.[c.cours_code]
                                  ? 'text-red-700 bg-red-50' : ton(k.cours?.[c.cours_code])}`}>
                                {k.na?.[c.cours_code] ? 'NA' : fmt(k.cours?.[c.cours_code])}
                              </span>
                            </td>,
                            ...(session >= 2 ? [] : [
                            <td key={`${e.id}|${c.cours_code}|aj`}
                              className="px-1 py-0.5 border-b border-slate-100 text-center">
                              <button disabled={enAttente > 0}
                                onClick={() => basculerCours(e.id, c.cours_code,
                                  k.ajourne?.[c.cours_code])}
                                title={k.ajourne?.[c.cours_code]
                                  ? 'Lever l’ajournement de ce cours'
                                  : 'Ajourner ce cours — à représenter'}
                                className={`w-6 h-6 rounded-full border flex items-center
                                  justify-center mx-auto ${k.ajourne?.[c.cours_code]
                                    ? 'bg-amber-500 border-amber-600 text-white'
                                    : 'bg-white border-slate-300 text-slate-400 hover:border-slate-500'}`}>
                                <IconRepeat size={11} />
                              </button>
                            </td>,
                            ]),
                          ];
                        })}

                        <td className="px-1 py-0.5 border-b border-x-2 border-iip-blue/50
                                       bg-iip-blue/5 text-center">
                          <span className={`inline-block min-w-[30px] px-1 py-0.5 rounded
                            font-bold tabular-nums ${k.ue_na ? 'text-red-700 bg-red-50'
                              : ton(k.ue)}`}>
                            {k.ue_na ? 'NA' : fmt(k.ue)}
                          </span>
                        </td>

                        {/* CE QUE L'ÉTUDIANT LIRA. La cote de travail sert au
                            Conseil ; celle-ci part sur ses documents, et la
                            circulaire y interdit tout chiffre sous dix. Les
                            deux se lisent côte à côte : c'est ainsi qu'on voit
                            qu'une faveur a bien porté la cote au seuil. */}
                        <td className="px-1 py-0.5 border-b border-x bg-slate-50 text-center">
                          <span className={`inline-block min-w-[30px] px-1 py-0.5 rounded
                            font-bold tabular-nums ${k.cote_etudiant === 'NA'
                              ? 'text-red-700 bg-red-50' : 'text-slate-700'}`}>
                            {k.cote_etudiant ?? '—'}
                          </span>
                        </td>

                        <td className="px-1 py-0.5 border-b border-x-2 border-iip-blue/50
                                       bg-iip-blue/5">
                          <div className="flex items-center gap-1 justify-center flex-wrap">
                            {DECISIONS
                              .filter(d => !(session >= 2 && d.cle === 'ajourne'))
                              .map(d => {
                                const actif = k.arrete === d.cle;
                                return (
                                  <button key={d.cle} disabled={enAttente > 0}
                                    onClick={() => poserDecision(e.id, d.cle, k.ue)}
                                    title={d.cle === k.decision
                                      ? 'Ce que le calcul propose' : undefined}
                                    className={`px-1.5 py-0.5 text-[11px] font-semibold
                                      rounded border ${actif ? `${d.c} text-white`
                                        : d.cle === k.decision
                                          ? 'bg-white border-slate-400 text-slate-700'
                                          : 'bg-white border-slate-200 text-slate-400'}`}>
                                    {d.l}
                                    {d.cle === k.decision && !actif && (
                                      <span className="ml-0.5 text-[8px]">•</span>
                                    )}
                                  </button>
                                );
                              })}
                            <button disabled={enAttente > 0}
                              onClick={() => basculerFaveur(e.id, k.faveur_ue)}
                              title={k.faveur_ue
                                ? 'Retirer la faveur accordée à l’unité'
                                : 'Accorder l’unité en faveur — la cote monte au seuil'}
                              className={`px-1.5 py-0.5 text-[11px] font-semibold rounded
                                border ${k.faveur_ue
                                  ? 'bg-amber-500 border-amber-600 text-white'
                                  : 'bg-white border-amber-300 text-amber-700'}`}>
                              <IconBrush size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex-none px-5 py-2.5 border-t border-slate-100 flex items-center
                        justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Le point <b>•</b> marque la décision que le calcul propose. Les cotes de cours
            et d'unité sont calculées : elles ne se saisissent pas.
          </p>
          <button onClick={onClose}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

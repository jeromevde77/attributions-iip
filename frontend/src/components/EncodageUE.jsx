import { useEffect, useMemo, useRef, useState } from 'react';
import { IconX, IconAlertTriangle, IconSearch, IconCheck, IconLink } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import PanneauAcquis from './PanneauAcquis.jsx';
import ClasseurNotes from './ClasseurNotes.jsx';
import { naviguerGrille, caseGrille } from '../lib/grilleClavier.js';

/**
 * SAISIE DES NOTES DE TOUTE UNE UNITÉ.
 *
 * Le professeur encode son cours, et rien d'autre : lui montrer les acquis de
 * ses collègues serait le mettre en position d'écraser leurs notes. Mais la
 * direction et le secrétariat, eux, encodent souvent pour l'unité entière — un
 * paquet de copies remis en bloc, une session rattrapée, une reprise après
 * coup. Ouvrir et refermer six grilles de cours pour les mêmes étudiants faisait
 * perdre la vue d'ensemble et retrouver six fois le même nom dans six listes.
 *
 * Ici, les étudiants sont en lignes et les acquis en colonnes, groupés sous leur
 * cours. Une note s'enregistre seule, à la sortie du champ : une séance
 * s'interrompt — un appel, une question — et un enregistrement global perdrait
 * tout ce qui n'a pas été validé.
 *
 * L'écriture passe par les mêmes routes que la saisie par cours : une note reste
 * la note d'un acquis DANS un cours.
 */
const SEUIL = 10;

/**
 * LA COULEUR D'UNE NOTE — trois états, et pas un de plus.
 *
 * L'échelle précédente séparait « bien » de « au seuil » et peignait l'échec
 * en ambre, la couleur de l'attention. Or ce n'est pas ce que le professeur
 * cherche du regard : il cherche ce qui est SOUS le seuil, et ce qui n'y est
 * que de justesse — 10 ou 11, la note qu'un point de correction fait basculer.
 *
 *   sous 10        rouge    l'acquis n'est pas maîtrisé
 *   10 et 11       orange   au seuil, mais de justesse
 *   12 et plus     vert     acquis
 */
const tonNote = n => {
  if (n == null || n === '') return 'border-slate-300';
  const v = Number(n);
  if (!Number.isFinite(v)) return 'border-slate-300';
  if (v < SEUIL) return 'border-red-300 bg-red-50 text-red-900';
  if (v < 12) return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-emerald-300 bg-emerald-50 text-emerald-900';
};

/** La même échelle, pour une cote qui s'affiche au lieu de s'éditer. */
const tonCote = n => {
  if (n == null) return 'text-slate-300';
  const v = Number(n);
  if (!Number.isFinite(v)) return 'text-slate-300';
  if (v < SEUIL) return 'text-red-700 bg-red-50';
  if (v < 12) return 'text-amber-800 bg-amber-50';
  return 'text-emerald-800 bg-emerald-50';
};

// LA COTE S'ÉCRIT COMME ELLE EST RETENUE. « toFixed(1) » imposait un décimal
// à des cotes que la maison arrondit à l'unité : la colonne affichait « 14,0 »
// là où le Conseil retient « 14 ». On écrit le nombre tel qu'il est.
const fmtCote = n => (n == null ? '—'
  : String(Math.round(Number(n) * 100) / 100).replace('.', ','));

// Les cours se distinguent par une teinte d'en-tête : sans elle, quinze
// colonnes d'acquis se ressemblent toutes et l'on ne sait plus où l'on est.
const TEINTES = [
  'bg-iip-blue/5 border-iip-blue/20', 'bg-emerald-50 border-emerald-200',
  'bg-amber-50 border-amber-200', 'bg-violet-50 border-violet-200',
  'bg-sky-50 border-sky-200', 'bg-rose-50 border-rose-200',
];

export default function EncodageUE({ ueNum, annee, onClose, onEnregistre, onParametrer }) {
  // LA GRILLE SE PARCOURT AU CLAVIER — le conteneur écoute les flèches, et
  // chaque case porte ses coordonnées. Le compteur de colonne se remet à zéro
  // à chaque ligne, pendant le rendu : c'est le plus simple, et il n'a de
  // sens que là.
  const grille = useRef(null);
  let colonne = 0;
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [session, setSession] = useState(1);
  // L'écran s'ouvrait TOUJOURS sur la première session. On encodait septembre,
  // on refermait, on rouvrait — et les notes de juin s'affichaient : rien
  // n'était perdu, mais tout donnait à croire que l'enregistrement n'avait pas
  // pris. La feuille s'ouvre désormais là où l'unité en est, tant que
  // personne n'a choisi de session à la main.
  const [choisie, setChoisie] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [enAttente, setEnAttente] = useState(0);
  const [dernier, setDernier] = useState(null);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/feuille`
        + `?annee=${encodeURIComponent(annee)}&session=${session}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
      if (!choisie && session !== 2 && (j.etat_session?.session === 2 || j.notes_s2 > 0)) {
        setChoisie(true); setSession(2);
      }
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum, annee, session]);

  // Une colonne par acquis, mais on garde son cours : c'est lui qui porte la
  // note, et c'est sous lui que la colonne se range.
  const colonnes = useMemo(() => (data?.cours || []).flatMap((c, i) =>
    (c.acquis || []).map(a => ({ ...a, cours: c, teinte: TEINTES[i % TEINTES.length] }))),
  [data]);

  const etudiants = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return data?.etudiants || [];
    return (data?.etudiants || []).filter(e =>
      `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q));
  }, [data, recherche]);

  async function poser(etudId, coursCode, aaCode, valeur) {
    const v = valeur === '' ? null : Number(String(valeur).replace(',', '.'));
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 20)) {
      setErreur('Note attendue entre 0 et 20.');
      return;
    }
    const cle = `${coursCode}|${aaCode}`;
    setData(d => ({ ...d,
      notes: { ...d.notes, [etudId]: { ...(d.notes[etudId] || {}), [cle]: v } } }));
    setEnAttente(n => n + 1);
    try {
      const rep = await fetch('/api/acquis/feuille/note', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etudId, annee_scolaire: annee, ue_num: ueNum,
          cours_code: coursCode, aa_code: aaCode, session, points: v,
        }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Enregistrement refusé.');
        await charger();
      } else {
        setErreur(null); setDernier(Date.now()); onEnregistre?.();
      }
    } catch (e) { setErreur(e.message); }
    finally { setEnAttente(n => n - 1); }
  }

  // NP ou PP ne visent pas un acquis mais l'épreuve : tous les acquis du cours
  // passent à zéro, avec la raison. Reposer la même mention l'enlève.
  async function poserMention(etudId, coursCode, mention) {
    setEnAttente(n => n + 1);
    try {
      const rep = await fetch(`/api/acquis/cours/${encodeURIComponent(coursCode)}/epreuve`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee, session, mention }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Enregistrement refusé.');
      } else setErreur(null);
      await charger(); onEnregistre?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnAttente(n => n - 1); }
  }

  const note = (e, col) => data?.notes?.[e.id]?.[`${col.cours.cours_code}|${col.aa_code}`];
  const mention = (e, coursCode) => data?.mentions?.[e.id]?.[coursCode];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl mt-6
                      max-h-[92vh] overflow-hidden flex flex-col">

        <div className="flex-none p-5 pb-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold text-iip-blue truncate">
              UE {ueNum}{data?.ue?.ue_nom ? ` · ${data.ue.ue_nom}` : ''}
            </h3>
            <p className="text-[12px] text-slate-500">
              {data && `${data.cours.length} cours · ${colonnes.length} acquis · `}
              {data && `${data.etudiants.length} étudiant(s)${
                data.a_representer ? ' à représenter' : ''} · `}{annee}
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
          <div className="flex-none mx-5 mt-3 px-3 py-2 rounded-lg bg-red-50 border
                          border-red-200 text-[12px] text-red-800 flex items-start gap-1.5">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* L'ÉNONCÉ DES ACQUIS, À CÔTÉ DE LA GRILLE. Elle ne montre que des
              codes ; le professeur qui corrige a l'énoncé sur sa copie, pas à
              l'écran, et rien n'est plus facile que de coter la mauvaise
              colonne quand on ne les distingue que par un numéro. */}
          <PanneauAcquis colonnes={(data?.cours || [])
            .filter(c => c.acquis?.length)
            .flatMap(c => c.acquis.map(a => ({
              cours_code: c.cours_code, cours_nom: c.cours_nom,
              professeurs: c.professeurs, aa_code: a.aa_code,
              description: a.description, poids: a.poids })))} />
        <div className="flex-1 overflow-auto p-5 pt-3">
          {/* CE QUE LA SECONDE SESSION ATTEND — et ce qu'elle n'attend pas.
              Sans un mot, une feuille plus courte se lit comme une perte
              d'étudiants ; et une colonne grisée, comme une panne. */}
          {data?.a_representer && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12px] text-amber-900">
              Seuls les <b>étudiants ajournés</b> figurent ici : les autres ne présentent pas
              de seconde session. Et pour chacun, seules les colonnes des <b>cours qu'il avait
              à représenter</b> sont ouvertes — les autres gardent la note de juin, que la
              seconde session ne doit ni redemander ni effacer.
            </div>
          )}
          {data?.a_representer && !data.etudiants.length && (
            <div className="py-10 text-center text-[12.5px] text-slate-500 border-2
                            border-dashed rounded-xl">
              Aucun étudiant ajourné en première session : il n'y a pas de seconde session
              à encoder pour cette unité.
            </div>
          )}
          {!data ? (
            <div className="py-10 text-center text-slate-400 text-sm">Chargement…</div>
          ) : data.sans_acquis ? (
            /* UN CUL-DE-SAC N'EST PAS UN MESSAGE.
               L'écran disait d'aller au paramétrage sans y conduire : il
               fallait fermer, retrouver l'unité, ouvrir le paramétrage. Le
               blocage lui-même porte donc maintenant la porte de sortie —
               réservée à qui peut la franchir, puisque relier les acquis
               engage toute l'unité et non le seul cours qu'on encodait. */
            <div className="py-10 text-center text-slate-500 text-sm space-y-3">
              <div>
                Aucun acquis n'est rattaché aux cours de cette unité.<br />
                <span className="text-slate-400">
                  Sans ce lien, il n'y a pas de colonne à remplir : la note d'un
                  acquis se pose dans un cours.
                </span>
              </div>
              {onParametrer ? (
                <button onClick={() => onParametrer(ueNum)}
                  className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                             font-semibold inline-flex items-center gap-1.5">
                  <IconLink size={14} /> Relier les acquis aux cours
                </button>
              ) : (
                <span className="text-slate-400 text-[12.5px] block">
                  Le paramétrage de l'unité est réservé à la direction.
                </span>
              )}
            </div>
          ) : !etudiants.length ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              {recherche ? 'Aucun étudiant ne correspond.' : 'Aucun étudiant inscrit à cette unité.'}
            </div>
          ) : (
            <table ref={grille} onKeyDown={ev => naviguerGrille(ev, grille.current)}
              className="text-[12px] border-separate border-spacing-0">
              <thead>
                {/* Les cours en bandeau, chacun couvrant ses acquis. */}
                <tr>
                  <th className="sticky left-0 z-20 bg-white text-left px-2 pb-1" />
                  {data.cours.filter(c => c.acquis?.length).map((c, i) => (
                    <th key={c.cours_code} colSpan={c.acquis.length + 2}
                      className={`px-2 py-1 border rounded-t-lg text-left align-bottom
                                  ${TEINTES[i % TEINTES.length]}`}>
                      <div className="font-semibold text-iip-blue truncate max-w-[220px]">
                        {c.cours_nom || c.cours_code}
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        {c.cours_code}{c.cours_per ? ` · ${c.cours_per} pér.` : ''}
                      </div>
                      {/* Qui porte le cours : le professeur se reconnaît dans
                          sa colonne, et le Conseil sait à qui s'adresser. */}
                      {c.professeurs && (
                        <div className="text-[10px] text-iip-blue/80 font-normal italic
                                        truncate max-w-[220px]" title={c.professeurs}>
                          {c.professeurs}
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="px-2 py-1 border rounded-t-lg align-bottom bg-slate-100
                                 border-slate-300">
                    <div className="font-semibold text-iip-blue">Unité</div>
                    <div className="text-[10px] text-slate-500 font-normal">calculée</div>
                  </th>
                </tr>
                <tr>
                  <th className="sticky left-0 z-20 bg-white text-left px-2 pb-1
                                 text-[10px] uppercase text-slate-400">Étudiant</th>
                  {data.cours.filter(c => c.acquis?.length).flatMap((c, i) => [
                    ...c.acquis.map(a => (
                      <th key={`${c.cours_code}|${a.aa_code}`}
                        title={a.description || a.aa_code}
                        className={`px-1 pb-1 border-x text-[10px] font-semibold text-slate-600
                                    ${TEINTES[i % TEINTES.length]}`}>
                        <div>{a.aa_code}</div>
                        {a.poids != null && (
                          <div className="text-[9px] font-normal text-slate-400">{a.poids}</div>
                        )}
                      </th>
                    )),
                    <th key={`${c.cours_code}|cote`}
                      className={`px-1 pb-1 border-x text-[10px] font-bold text-iip-blue
                                  ${TEINTES[i % TEINTES.length]}`}>
                      note
                    </th>,
                    <th key={`${c.cours_code}|mention`}
                      className={`px-1 pb-1 border-x text-[10px] text-slate-400 font-normal
                                  ${TEINTES[i % TEINTES.length]}`}>
                      épreuve
                    </th>,
                  ])}
                  <th className="px-1 pb-1 border-x text-[10px] font-bold text-iip-blue
                                 bg-slate-100">UE</th>
                </tr>
              </thead>
              <tbody>
                {etudiants.map((e, ligne) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 bg-white hover:bg-slate-50/60 px-2 py-0.5
                                   whitespace-nowrap border-b border-slate-100">
                      <span className="font-medium text-slate-800">{e.nom}</span>{' '}
                      <span className="text-slate-500">{e.prenom}</span>
                      {/* D'OÙ VIENT SA PRÉSENCE ICI. Devant une liste de
                          seconde session, la première question est « pourquoi
                          celui-là ? » — et rien n'y répondait. */}
                      {e.source_s2 === 'dossier' && (
                        <span title="Ajourné d'après le dossier : aucune décision de première
                                     session n'a été enregistrée pour cette unité"
                          className="ml-1.5 text-[9px] uppercase tracking-wide text-amber-700
                                     bg-amber-50 border border-amber-200 rounded px-1 py-px">
                          dossier
                        </span>
                      )}
                    </td>
                    {(() => { colonne = 0; return null; })()}
                    {data.cours.filter(c => c.acquis?.length).flatMap(c => {
                      const m = mention(e, c.cours_code);
                      // EN SECONDE SESSION, SEULS LES COURS À REPRÉSENTER.
                      // Les autres gardent la note de juin : rouvrir leur
                      // colonne, c'est inviter à la réécrire, et la seconde
                      // session effacerait ce qu'elle devait laisser.
                      const ferme = data.a_representer
                        && !(data.a_representer[e.id] || []).includes(c.cours_code);
                      return [
                        ...c.acquis.map(a => {
                          const col = { ...a, cours: c };
                          const v = note(e, col);
                          const nc = colonne++;
                          return (
                            <td key={`${e.id}|${c.cours_code}|${a.aa_code}`}
                              className="px-1 py-0.5 border-b border-slate-100 text-center">
                              {/* LA CASE DOIT SE REMONTER QUAND LA DONNÉE CHANGE.
                                  « defaultValue » n'est lu qu'au montage : la clé
                                  ne portant ni la session ni la note, la case
                                  gardait à l'écran ce qu'elle affichait avant le
                                  rechargement — les notes de juin sous l'onglet
                                  de septembre. Et « onBlur » comparait ce texte
                                  périmé à la donnée fraîche : quitter la case
                                  suffisait alors à réécrire l'ancienne note dans
                                  l'autre session. La clé porte donc la session et
                                  la valeur : à donnée nouvelle, case neuve. */}
                              <input {...caseGrille(ligne, nc)}
                                key={`${session}|${v ?? ''}`}
                                defaultValue={v ?? ''} disabled={!!m || ferme}
                                title={ferme
                                  ? 'Ce cours n’était pas à représenter : la note de première '
                                    + 'session reste acquise'
                                  : undefined}
                                onBlur={ev => {
                                  if (String(ev.target.value) !== String(v ?? '')) {
                                    poser(e.id, c.cours_code, a.aa_code, ev.target.value);
                                  }
                                }}
                                className={`w-12 text-center py-0.5 border rounded
                                            disabled:bg-slate-100 disabled:text-slate-400
                                            ${tonNote(v)}`} />
                            </td>
                          );
                        }),
                        // LA NOTE DU COURS, CALCULÉE ET NON SAISIE. Le
                        // professeur encodait ses acquis sans jamais voir ce
                        // qu'ils donnaient : la cote n'apparaissait qu'à la
                        // délibération, dans un autre écran. C'est pourtant en
                        // encodant qu'on repère la note tapée de travers.
                        <td key={`${e.id}|${c.cours_code}|cote`}
                          className="px-1 py-0.5 border-b border-slate-100 text-center">
                          <span title={data.cotes?.[e.id]?.na?.[c.cours_code]
                            ? 'Non acquis — le Conseil a ajourné ce cours, ou l’épreuve '
                              + 'n’a pas été présentée'
                            : 'Note du cours, calculée depuis les acquis et leurs poids'}
                            className={`inline-block min-w-[34px] px-1 py-0.5 rounded font-bold
                              tabular-nums ${data.cotes?.[e.id]?.na?.[c.cours_code]
                                ? 'text-red-700 bg-red-50'
                                : tonCote(data.cotes?.[e.id]?.cours?.[c.cours_code])}`}>
                            {data.cotes?.[e.id]?.na?.[c.cours_code]
                              ? 'NA' : fmtCote(data.cotes?.[e.id]?.cours?.[c.cours_code])}
                          </span>
                        </td>,
                        <td key={`${e.id}|${c.cours_code}|mention`}
                          className="px-1 py-0.5 border-b border-slate-100 text-center whitespace-nowrap">
                          {!ferme && ['NP', 'PP'].map(x => (
                            <button key={x}
                              onClick={() => poserMention(e.id, c.cours_code, m === x ? null : x)}
                              title={x === 'NP'
                                ? 'Note de présence — zéro, mais la seconde session reste ouverte'
                                : "Pas présenté — absence non justifiée, refus d'office"}
                              className={`px-1 mx-0.5 rounded text-[10px] font-semibold border
                                ${m === x
                    ? (x === 'NP' ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-red-100 border-red-300 text-red-700')
                    : 'border-slate-200 text-slate-400 hover:border-slate-400'}`}>
                              {x}
                            </button>
                          ))}
                        </td>,
                      ];
                    })}
                    {/* LA NOTE DE L'UNITÉ — vue, jamais saisie. Elle est la
                        somme pondérée des cours ; la laisser modifier, ce
                        serait permettre d'écrire un total qui ne correspond à
                        aucune des notes encodées. Le professeur la voit, le
                        Conseil la décide. */}
                    <td className="px-1 py-0.5 border-b border-slate-100 text-center
                                   bg-slate-50">
                      <span title={data.cotes?.[e.id]?.ue == null
                        ? 'Non calculable : un cours est non acquis, ou tout n’est pas encodé'
                        : 'Note de l’unité, calculée depuis les cours et leurs poids — '
                          + 'elle ne se saisit pas'}
                        className={`inline-block min-w-[38px] px-1.5 py-0.5 rounded font-bold
                          tabular-nums ${tonCote(data.cotes?.[e.id]?.ue)}`}>
                        {fmtCote(data.cotes?.[e.id]?.ue)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>

        <div className="flex-none px-5 py-2.5 border-t border-slate-100 flex items-center
                        justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Chaque note s'enregistre seule, en quittant la case. <b>NP</b> vaut zéro sur tout le
            cours en gardant la seconde session ; <b>PP</b> est l'absence non justifiée.
          </p>
          <div className="flex items-center gap-2 flex-none">
            {/* TOUS LES PROFESSEURS N'ENCODENT PAS À L'ÉCRAN. Le classeur part,
                revient rempli, et se relit sur les clés qu'il porte. */}
            <ClasseurNotes ueNum={ueNum} annee={annee} session={session}
              ueNom={data?.ue?.ue_nom}
              colonnes={(data?.cours || []).filter(c => c.acquis?.length)
                .flatMap(c => c.acquis.map(a => ({
                  cours_code: c.cours_code, cours_nom: c.cours_nom,
                  aa_code: a.aa_code, description: a.description, poids: a.poids })))}
              etudiants={data?.etudiants || []}
              note={(id, c) => data?.notes?.[id]?.[`${c.cours_code}|${c.aa_code}`] ?? null}
              mention={(id, cc) => data?.mentions?.[id]?.[cc] || null}
              ferme={(id, cc) => !!data?.a_representer
                && !(data.a_representer[id] || []).includes(cc)}
              onImporte={charger} />
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

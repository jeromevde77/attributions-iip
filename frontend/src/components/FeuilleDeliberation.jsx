import { useEffect, useMemo, useState } from 'react';
import {
  IconX, IconSearch, IconAlertTriangle, IconChevronLeft, IconChevronRight,
  IconArrowUp, IconRepeat, IconList, IconFileText, IconTrophy,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import TableauBordEtudiant from './TableauBordEtudiant.jsx';

/**
 * La FEUILLE DE DÉLIBÉRATION — un étudiant à la fois.
 *
 * On délibère un étudiant, pas une colonne : « Délibérer » ouvre donc
 * directement la fiche du premier inscrit, et l'on passe au suivant d'une
 * flèche. La vue en tableau reste accessible d'un bouton, pour comparer.
 *
 * TROIS NIVEAUX, dans l'ordre de lecture du Conseil :
 *   1. l'ACQUIS au global — consolidé sur tous les cours qui l'évaluent ;
 *   2. la note de chaque COURS ;
 *   3. la note de l'UNITÉ.
 * Rien n'est recalculé ici : le serveur seul délibère, l'écran montre.
 *
 * DEUX GESTES. La flèche verte lève un élément en échec — et le décret du
 * 16 avril 1991 fait le reste : l'élément vaut 10, son cours vaut 10, l'unité
 * vaut 10, badge doré. Le second geste ajourne : l'élément passe à NA, il est
 * à représenter, et les cours qui l'évaluent le sont avec lui.
 */

const fmt = n => n == null ? '—' : (Math.round(n * 100) / 100).toString().replace('.', ',');

/** Le cadre d'une note : le rouge de l'échec doit se voir sans être lu. */
function tonCadre({ na, faveur, echec }) {
  if (na) return 'border-slate-300 bg-slate-50 text-slate-500';
  if (faveur) return 'border-amber-400 bg-amber-50 text-amber-900';
  if (echec) return 'border-red-500 border-2 bg-red-50 text-red-800';
  return 'border-emerald-300 bg-emerald-50 text-emerald-900';
}

export default function FeuilleDeliberation({ ueNum, annee, onClose }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [idx, setIdx] = useState(0);
  const [tableau, setTableau] = useState(false);   // la vue d'ensemble
  const [bord, setBord] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

  const liste = useMemo(() => {
    if (!data) return [];
    const q = recherche.trim().toLowerCase();
    if (!q) return data.etudiants;
    return data.etudiants.filter(e =>
      `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q));
  }, [data, recherche]);

  const etud = liste[Math.min(idx, Math.max(liste.length - 1, 0))] || null;

  /** Poser ou retirer un ajustement. Le serveur renvoie l'étudiant recalculé. */
  async function ajuster(portee, code, action) {
    if (!etud) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/ajustement', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum,
          portee, code, action,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setData(d => ({ ...d,
        etudiants: d.etudiants.map(x => x.id === etud.id ? { ...x, ...j } : x) }));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 mt-20 text-[13px] text-slate-500">
          {erreur || 'Chargement…'}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mt-4
                      max-h-[94vh] overflow-hidden flex flex-col">

        {/* L'en-tête ne défile pas : on doit toujours savoir de qui l'on parle. */}
        <div className="flex-none px-4 py-3 border-b border-slate-100
                        flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-iip-blue truncate">
              UE {data.ue_num} · {data.ue_nom}
              {data.epreuve_integree && (
                <span className="ml-2 align-middle text-[10px] font-bold px-2 py-0.5 rounded-full
                                 bg-violet-100 text-violet-800 border border-violet-200">
                  épreuve intégrée
                </span>
              )}
            </h3>
            <p className="text-[11.5px] text-slate-500">
              {data.section || '—'} · {annee} · {data.etudiants.length} étudiant(s)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={recherche}
                onChange={e => { setRecherche(e.target.value); setIdx(0); }}
                placeholder="Filtrer…"
                className="border border-slate-300 rounded-lg pl-8 pr-2 py-1 text-[12px] w-36" />
            </div>
            <button onClick={() => setTableau(t => !t)}
              className="px-2.5 py-1 text-[12px] rounded-lg border border-slate-300
                         text-slate-600 flex items-center gap-1.5">
              {tableau ? <><IconFileText size={14} /> Fiche</> : <><IconList size={14} /> Tableau</>}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <IconX size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800 flex items-center gap-2">
              <IconAlertTriangle size={14} /> {erreur}
            </div>
          )}

          {data.sans_structure && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12.5px] text-amber-900">
              Cette unité n'est pas paramétrée : ses acquis ne sont pas rattachés à
              des cours, ou aucun cours n'y est déclaré. Les notes ne peuvent pas se
              consolider tant que ce lien n'existe pas.
            </div>
          )}

          {!liste.length ? (
            <div className="py-10 text-center text-[12.5px] text-slate-400 border-2
                            border-dashed rounded-xl">
              Aucun étudiant inscrit à cette unité pour {annee}.
            </div>
          ) : tableau ? (
            <VueTableau data={data} liste={liste}
              onOuvrir={e => { setIdx(liste.indexOf(e)); setTableau(false); }} />
          ) : etud ? (
            <>
              {/* Le passage d'un étudiant au suivant : c'est le geste du Conseil. */}
              <div className="flex items-center justify-between gap-3 px-3 py-2
                              rounded-xl bg-slate-50 border border-slate-200">
                <button disabled={idx <= 0} onClick={() => setIdx(i => i - 1)}
                  className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-30">
                  <IconChevronLeft size={16} />
                </button>
                <div className="text-center min-w-0">
                  <div className="text-[15px] font-bold text-iip-blue truncate">
                    {etud.nom} {etud.prenom}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {etud.id_ecampus || '—'} · {idx + 1} / {liste.length}
                  </div>
                </div>
                <button disabled={idx >= liste.length - 1} onClick={() => setIdx(i => i + 1)}
                  className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-30">
                  <IconChevronRight size={16} />
                </button>
              </div>

              <Fiche e={etud} data={data} onAjuster={ajuster} enCours={enCours}
                onBord={() => setBord(etud)} />
            </>
          ) : null}
        </div>
      </div>

      {bord && (
        <TableauBordEtudiant etudId={bord.id} ueNum={data.ue_num} annee={annee}
          onClose={() => setBord(null)} onDecide={charger} />
      )}
    </div>
  );
}

/* ═══ La fiche d'un étudiant ═══════════════════════════════════════════════ */

function Fiche({ e, data, onAjuster, enCours, onBord }) {
  const ue = e.ue || {};
  return (
    <div className="space-y-3">
      {/* ── 3. L'UNITÉ, en tête : c'est la conclusion qu'on cherche ────────── */}
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3
                       ${tonCadre(ue)}`}>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide opacity-70">
            Note de l'unité
          </div>
          <div className="text-[28px] font-bold leading-tight">
            {ue.na ? 'NA' : fmt(ue.note)}
            {!ue.na && <span className="text-[14px] font-normal opacity-60"> / 20</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {ue.faveur && (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full
                             bg-amber-400 text-amber-950 border border-amber-500
                             flex items-center gap-1">
              <IconTrophy size={13} /> faveur du Conseil
            </span>
          )}
          {ue.na && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full
                             bg-slate-200 text-slate-700">
              à représenter : {(ue.a_representer || []).join(' · ') || 'élément ajourné'}
            </span>
          )}
          <button onClick={onBord}
            className="text-[11.5px] px-2.5 py-1 rounded-lg bg-iip-blue text-white font-semibold">
            Parcours et décision
          </button>
        </div>
      </div>

      {ue.faveur && (
        <p className="text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200
                      rounded-lg px-3 py-2">
          Une faveur a été accordée : l'unité vaut exactement le seuil. Le Conseil
          ne peut attester la réussite sans maîtrise de tous les acquis, ni donner
          plus de 10/20 lorsque l'un d'eux ne l'est pas — décret du 16 avril 1991.
        </p>
      )}

      {/* ── 1. LES ACQUIS, au global ───────────────────────────────────────── */}
      <Bloc titre="Acquis d'apprentissage" sous="consolidés sur tous les cours qui les évaluent">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(e.acquis || []).map(a => (
            <Ligne key={a.aa_code} code={a.aa_code} nom={a.description}
              etat={a} enCours={enCours}
              onFaveur={v => onAjuster('aa', a.aa_code, v)} />
          ))}
          {!(e.acquis || []).length && (
            <div className="text-[12px] text-slate-400">Aucun acquis rattaché.</div>
          )}
        </div>
      </Bloc>

      {/* ── 2. LES COURS ───────────────────────────────────────────────────── */}
      <Bloc titre="Cours de l'unité"
        sous={data.epreuve_integree
          ? "épreuve commune : chaque cours reçoit la note de l'unité"
          : 'moyenne de leurs acquis, pondérée'}>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(e.cours || []).map(c => (
            <Ligne key={c.cours_code} code={c.cours_code} nom={c.cours_nom}
              etat={c} enCours={enCours}
              detail={c.aas_ajournes?.length
                ? `ajourné par ${c.aas_ajournes.join(', ')}` : null}
              onFaveur={v => onAjuster('cours', c.cours_code, v)} />
          ))}
          {!(e.cours || []).length && (
            <div className="text-[12px] text-slate-400">Aucun cours au référentiel.</div>
          )}
        </div>
      </Bloc>
    </div>
  );
}

function Bloc({ titre, sous, children }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        <span className="text-[12px] font-semibold text-iip-blue">{titre}</span>
        {sous && <span className="ml-2 text-[10.5px] text-slate-500">{sous}</span>}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

/**
 * Une ligne — un acquis ou un cours — avec sa note et les deux gestes.
 *
 * La flèche verte n'apparaît que sur un élément en échec : lever ce qui est
 * déjà réussi n'a pas de sens, et l'offrir inviterait à le faire.
 */
function Ligne({ code, nom, etat, detail, onFaveur, enCours }) {
  const { na, faveur, echec, note } = etat;
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 flex items-center gap-2 ${tonCadre(etat)}`}>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] font-bold">{code}</div>
        <div className="text-[10.5px] opacity-70 truncate" title={nom || ''}>
          {detail || nom || ''}
        </div>
      </div>

      <div className="text-[15px] font-bold tabular-nums w-12 text-right">
        {na ? 'NA' : fmt(note)}
      </div>

      <div className="flex flex-col gap-1">
        {/* Lever en faveur : le badge vert devient doré une fois posé. */}
        {(echec || faveur) && (
          <button disabled={enCours}
            onClick={() => onFaveur(faveur ? null : 'faveur')}
            title={faveur ? 'Retirer la faveur' : 'Forcer la réussite (faveur du Conseil)'}
            className={`w-6 h-6 rounded-full flex items-center justify-center border
              ${faveur ? 'bg-amber-400 border-amber-500 text-amber-950'
                       : 'bg-emerald-600 border-emerald-700 text-white'}`}>
            <IconArrowUp size={13} />
          </button>
        )}
        {/* Ajourner : l'élément est à représenter. */}
        <button disabled={enCours}
          onClick={() => onFaveur(na ? null : 'ajourne')}
          title={na ? 'Lever l\'ajournement' : 'Ajourner — à représenter'}
          className={`w-6 h-6 rounded-full flex items-center justify-center border
            ${na ? 'bg-slate-600 border-slate-700 text-white'
                 : 'bg-white border-slate-300 text-slate-500'}`}>
          <IconRepeat size={12} />
        </button>
      </div>
    </div>
  );
}

/* ═══ La vue d'ensemble ════════════════════════════════════════════════════ */

function VueTableau({ data, liste, onOuvrir }) {
  return (
    <div className="overflow-auto border border-slate-200 rounded-xl">
      <table className="text-[12px] border-collapse">
        <thead className="sticky top-0 bg-white z-10">
          <tr>
            <th className="sticky left-0 bg-white z-20 text-left px-3 py-2
                           border-b border-r border-slate-200 min-w-[170px]">Étudiant</th>
            {data.colonnes_acquis.map(a => (
              <th key={a.aa_code} title={a.description || ''}
                className="px-1 py-1.5 border-b border-slate-200 w-12 text-[9.5px]
                           font-bold text-iip-blue">{a.aa_code}</th>
            ))}
            {data.colonnes_cours.map(c => (
              <th key={c.cours_code} title={c.cours_nom || ''}
                className="px-1 py-1.5 border-b border-l border-slate-300 w-12
                           bg-slate-50 text-[9.5px] font-bold text-slate-700">
                {c.cours_code}
              </th>
            ))}
            <th className="px-2 py-1.5 border-b border-l-2 border-l-iip-blue/40
                           bg-iip-blue/5 w-14 text-[10px] text-iip-blue">UE</th>
          </tr>
        </thead>
        <tbody>
          {liste.map(e => {
            const parAA = Object.fromEntries((e.acquis || []).map(a => [a.aa_code, a]));
            const parCo = Object.fromEntries((e.cours || []).map(c => [c.cours_code, c]));
            return (
              <tr key={e.id} className="hover:bg-slate-50/60">
                <td className="sticky left-0 bg-white px-3 py-1 border-b border-r border-slate-100">
                  <button onClick={() => onOuvrir(e)} className="text-left w-full">
                    <div className="font-semibold text-iip-blue truncate hover:underline">{e.nom}</div>
                    <div className="text-[10.5px] text-slate-500 truncate">{e.prenom}</div>
                  </button>
                </td>
                {data.colonnes_acquis.map(a => <Case key={a.aa_code} etat={parAA[a.aa_code]} />)}
                {data.colonnes_cours.map(c => (
                  <Case key={c.cours_code} etat={parCo[c.cours_code]} bord />
                ))}
                <td className="border-b border-l-2 border-l-iip-blue/40 bg-iip-blue/5
                               px-2 text-center font-bold text-[12px]">
                  <span className={e.ue?.na ? 'text-slate-500'
                    : e.ue?.faveur ? 'text-amber-700'
                    : e.ue?.echec ? 'text-red-700' : 'text-emerald-700'}>
                    {e.ue?.na ? 'NA' : fmt(e.ue?.note)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Case({ etat, bord }) {
  if (!etat) return <td className={`border-b border-slate-100 ${bord ? 'border-l' : ''}`} />;
  return (
    <td className={`border-b border-slate-100 px-1 text-center text-[11px] font-semibold
      ${bord ? 'border-l border-slate-300 bg-slate-50/60' : ''}
      ${etat.na ? 'text-slate-500'
        : etat.faveur ? 'bg-amber-100 text-amber-900'
        : etat.echec ? 'bg-red-50 text-red-700 outline outline-1 outline-red-400'
        : 'text-emerald-700'}`}>
      {etat.na ? 'NA' : fmt(etat.note)}
    </td>
  );
}

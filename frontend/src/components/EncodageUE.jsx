import { useEffect, useMemo, useRef, useState } from 'react';
import { IconAlertTriangle, IconSearch, IconCheck, IconLink } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import PanneauAcquis from './PanneauAcquis.jsx';
import ClasseurNotes from './ClasseurNotes.jsx';
import { naviguerGrille, caseGrille } from '../lib/grilleClavier.js';
import { couleurBloc } from '../lib/blocs.js';

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
  const [vue, setVue] = useState('cours');         // 'cours' | 'acquis'
  const [niv, setNiv] = useState(null);            // le bloc de l'unité, pour le repère de couleur
  useEffect(() => {
    fetch(`/api/ref/ue/${ueNum}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(u => setNiv(u?.ue_niv || null)).catch(() => {});
  }, [ueNum, annee]);

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

  // Le bloc unique d'une épreuve intégrée n'est pas un cours : sa note s'écrit
  // sans cours, et c'est cette forme-là que le calcul lit.
  const EI = data?.code_epreuve_ue || '__ue__';
  const estEI = coursCode => !!data?.epreuve_integree && coursCode === EI;

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
          cours_code: estEI(coursCode) ? null : coursCode,
          aa_code: aaCode, session, points: v,
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
      const url = estEI(coursCode)
        ? `/api/acquis/ue/${ueNum}/epreuve`
        : `/api/acquis/cours/${encodeURIComponent(coursCode)}/epreuve`;
      const rep = await fetch(url, {
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
  const fermeDe = (e, coursCode) => !!data?.a_representer && !(data.a_representer[e.id] || []).includes(coursCode);
  const coursVus = (data?.cours || []).filter(c => c.acquis?.length);

  /* LA MENTION SE TAPE DANS LA CASE (refonte du 8 octobre 2026) : deux boutons
     NP / PP par cours et par étudiant faisaient l'essentiel du bruit. NP ou PP
     tapé dans n'importe quelle case d'un cours vaut pour TOUT le cours —
     c'est l'épreuve qui n'a pas été présentée, pas un acquis. Effacer la case,
     ou y taper une note, retire la mention. */
  async function sortieCase(e, c, a, texte, v, m) {
    const t = String(texte ?? '').trim().toUpperCase();
    if (t === 'NP' || t === 'PP') { if (t !== m) await poserMention(e.id, c.cours_code, t); return; }
    if (m) {
      if (t === m) return;
      await poserMention(e.id, c.cours_code, null);
      if (t !== '') await poser(e.id, c.cours_code, a.aa_code, t);
      return;
    }
    if (t !== '' && !/^\d{1,2}([.,]\d+)?$/.test(t)) { setErreur('Une note de 0 à 20, ou NP / PP pour l’épreuve du cours.'); return; }
    // On compare des NOMBRES : « 13,8 » affiché et « 13.8 » en base sont la même note.
    const avant = v == null || v === '' ? null : Number(v);
    const apres = t === '' ? null : Number(t.replace(',', '.'));
    if (avant !== apres) await poser(e.id, c.cours_code, a.aa_code, texte);
  }

  /* LA COULEUR D'UN ÉTAT EST UNE PASTILLE PLEINE (règle du 29 septembre 2026) :
     12 et plus vert, 10 ou 11 ocre, sous 10 brique ; un ajournement en ocre. */
  const fond = n => (n >= 12 ? 'var(--c-reussi)' : n >= 10 ? 'var(--c-attente)' : 'var(--c-refuse)');
  const Pastille = ({ n, na, ajourne, titre, large = false }) => (n == null && !na
    ? <span className="text-slate-300 tabular-nums" title={titre}>—</span>
    : <span title={titre} className={`inline-block ${large ? 'min-w-[46px] py-1 text-sm' : 'min-w-[38px] py-0.5 text-sm'} rounded-md text-center font-bold text-white tabular-nums`}
        style={{ background: na ? 'var(--c-refuse)' : ajourne ? 'var(--c-attente)' : fond(Math.round(Number(n))) }}>
        {na ? 'NA' : fmtCote(n)}
      </span>);

  // CE QUE DIT L'UNITÉ, ÉTUDIANT PAR ÉTUDIANT : acquis en défaut (aucune
  // compensation), cases encore vides — sur les seules colonnes ouvertes.
  const bilanUE = e => {
    let defaut = [], manque = 0;
    for (const c of coursVus) {
      if (fermeDe(e, c.cours_code)) continue;
      const m = mention(e, c.cours_code);
      if (m) { defaut.push(...c.acquis.map(a => a.aa_code)); continue; }
      for (const a of c.acquis) {
        const v = note(e, { ...a, cours: c });
        if (v == null || v === '') manque++;
        else if (Math.round(Number(v)) < SEUIL) defaut.push(a.aa_code);
      }
    }
    return { defaut: [...new Set(defaut)], manque };
  };
  const motUE = b => (b.manque ? 'incomplète' : b.defaut.length ? `${session === 2 ? 'refusée' : 'ajournée'} · ${b.defaut.length} AA` : 'réussie');

  // L'avancement : les cases remplies (note ou mention) sur les cases ouvertes.
  const avancement = useMemo(() => {
    let faites = 0, total = 0;
    for (const e of data?.etudiants || []) for (const c of coursVus) {
      if (fermeDe(e, c.cours_code)) continue;
      const m = mention(e, c.cours_code);
      for (const a of c.acquis) { total++; if (m || (note(e, { ...a, cours: c }) ?? '') !== '') faites++; }
    }
    return { faites, total };
  }, [data]);   // eslint-disable-line react-hooks/exhaustive-deps

  // LE PIED : moyenne et part des notes ≥ 10, colonne par colonne.
  const resume = vals => {
    const v = vals.filter(x => x != null && x !== '' && Number.isFinite(Number(x))).map(Number);
    if (!v.length) return { moy: '—', taux: '' };
    return { moy: (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1).replace('.', ','),
      taux: `${Math.round(v.filter(x => Math.round(x) >= SEUIL).length / v.length * 100)} %` };
  };

  // LA VUE « TOUS LES ACQUIS DE L'UE » : un acquis, une colonne — porté par
  // plusieurs cours, sa note est la moyenne de ses évaluations.
  const acquisUE = useMemo(() => {
    const m = new Map();
    for (const c of coursVus) for (const a of c.acquis) {
      const x = m.get(a.aa_code) || { aa_code: a.aa_code, description: a.description, cours: [], poids: a.poids };
      x.cours.push(c); m.set(a.aa_code, x);
    }
    return [...m.values()];
  }, [data]);   // eslint-disable-line react-hooks/exhaustive-deps
  const noteAcquis = (e, x) => {
    if (x.cours.some(c => mention(e, c.cours_code))) return x.cours.map(c => mention(e, c.cours_code)).find(Boolean);
    const v = x.cours.map(c => note(e, { aa_code: x.aa_code, cours: c })).filter(y => y != null && y !== '').map(Number);
    return v.length ? Math.round(v.reduce((s, y) => s + y, 0) / v.length) : null;
  };

  const ligneEtudiant = e => (
    <td className="sticky left-0 z-10 bg-white group-focus-within:bg-[#F1F6FB] px-4 py-1.5 border-b border-slate-100 min-w-[240px]">
      <div className="text-sm whitespace-nowrap"><span className="font-semibold">{String(e.nom || '').toUpperCase()}</span>{' '}{e.prenom}
        {e.source_s2 === 'dossier' && (
          <span title="Ajourné d'après le dossier : aucune décision de première session n'a été enregistrée pour cette unité"
            className="intertitre ml-1.5 text-white rounded px-1 py-px" style={{ background: 'var(--c-attente)' }}>dossier</span>)}
      </div>
      <div className="text-xs text-slate-400">{e.id_ecampus || ''}</div>
    </td>);

  const couleurRepere = data?.epreuve_integree ? 'var(--c-epreuve, #C9A227)' : (couleurBloc(niv) || 'var(--c-principal, #16406A)');

  return (
    <Fenetre titre={`UE ${ueNum}${data?.ue?.ue_nom ? ` — ${data.ue.ue_nom}` : ''}`}
      large="pleine" hauteurFixe onFermer={onClose}
      pied={<>
        <span className="text-xs text-slate-500">
          Chaque note s'enregistre en quittant la case · flèches et Entrée pour se déplacer ·
          <b> NP</b> ou <b>PP</b> tapé dans une case vaut pour l'épreuve de tout le cours (NP : zéro, seconde session ouverte ;
          PP : absence non justifiée) — effacer la case retire la mention.
        </span>
        {/* TOUS LES PROFESSEURS N'ENCODENT PAS À L'ÉCRAN. Le classeur part,
            revient rempli, et se relit sur les clés qu'il porte. */}
        <ClasseurNotes ueNum={ueNum} annee={annee} session={session}
          ueNom={data?.ue?.ue_nom}
          colonnes={coursVus.flatMap(c => c.acquis.map(a => ({
              cours_code: c.cours_code, cours_nom: c.cours_nom,
              aa_code: a.aa_code, description: a.description, poids: a.poids })))}
          etudiants={data?.etudiants || []}
          note={(id, c) => data?.notes?.[id]?.[`${c.cours_code}|${c.aa_code}`] ?? null}
          mention={(id, cc) => data?.mentions?.[id]?.[cc] || null}
          ferme={(id, cc) => !!data?.a_representer
            && !(data.a_representer[id] || []).includes(cc)}
          onImporte={charger} />
        <button onClick={onClose} className="bouton">Fermer</button>
      </>}>
      <div className="h-full -mx-5 flex flex-col">
        {/* L'EN-TÊTE : où l'on en est, et les vues (refonte du 8 octobre 2026). */}
        <div className="flex-none px-5 pb-3 space-y-3">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <p className="text-second text-slate-500 m-0">
              {data && (data.epreuve_integree
                ? `Épreuve intégrée · ${colonnes.length} acquis · `
                : `${coursVus.length} cours · ${acquisUE.length} acquis · `)}
              {data && `${data.etudiants.length} étudiant(s)${data.a_representer ? ' à représenter' : ''} · `}{annee}
            </p>
            <div className="flex items-center gap-5">
              {avancement.total > 0 && (
                <div className="flex flex-col items-end gap-1">
                  <div className="text-second text-slate-500"><b className="text-base text-iip-blue tabular-nums">{avancement.faites}</b> / {avancement.total} notes encodées</div>
                  <div className="h-1.5 w-48 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full" style={{ width: `${(avancement.faites / avancement.total) * 100}%`, background: 'var(--c-principal, #19537E)' }} />
                  </div>
                </div>)}
              <span className="text-second whitespace-nowrap">
                {enAttente > 0 ? <span className="text-slate-500">Enregistrement…</span>
                  : dernier ? <span style={{ color: 'var(--c-reussi)' }}><IconCheck size={13} className="inline -mt-0.5" /> Enregistré</span> : null}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="segments">
              {[['cours', 'Par cours'], ['acquis', 'Tous les acquis de l’UE']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setVue(k)}
                  className={`px-3 py-1 text-second ${vue === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
            </div>
            <div className="segments">
              {[1, 2].map(s => (
                <button key={s} type="button" onClick={() => { setChoisie(true); setSession(s); }}
                  className={`px-2.5 py-1 text-second ${session === s ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                  {s === 1 ? '1re' : '2e'} session
                </button>))}
            </div>
            <div className="relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Chercher un étudiant…"
                className="controle controle-icone w-56" />
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
              {[['var(--c-refuse)', 'sous 10'], ['var(--c-attente)', '10 ou 11'], ['var(--c-reussi)', '12 et plus']].map(([c, l]) => (
                <span key={l} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}</span>))}
            </div>
          </div>
        </div>

        {erreur && (
          <div className="flex-none mx-5 mb-3 bloc-etat px-3 py-2 text-second flex items-start gap-1.5" data-etat="corriger">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* L'ÉNONCÉ DES ACQUIS, À CÔTÉ DE LA GRILLE. */}
          <PanneauAcquis ueNum={ueNum} colonnes={coursVus.flatMap(c => c.acquis.map(a => ({
              cours_code: c.cours_code, cours_nom: c.cours_nom,
              professeurs: c.professeurs, aa_code: a.aa_code,
              description: a.description, poids: a.poids })))} />
        <div className="flex-1 overflow-auto p-5 pt-1">
          {data?.epreuve_integree && (
            <div className="mb-3 bloc-etat px-3 py-2 text-second" data-etat="neutre">
              Cette unité est évaluée par une <b>épreuve intégrée</b> : une seule grille,
              les <b>acquis de l'unité entière</b>, une note commune. Il n'y a pas de note
              par cours — <b>chaque cours de l'unité reçoit la note de l'unité</b>.
            </div>
          )}
          {data?.a_representer && (
            <div className="mb-3 bloc-etat px-3 py-2 text-second" data-etat="surveiller">
              Seuls les <b>étudiants ajournés</b> figurent ici : les autres ne présentent pas
              de seconde session. Et pour chacun, seules les colonnes des <b>cours qu'il avait
              à représenter</b> sont ouvertes — les autres gardent la note de juin, que la
              seconde session ne doit ni redemander ni effacer.
            </div>
          )}
          {data?.a_representer && !data.etudiants.length && (
            <div className="py-10 text-center text-sm text-slate-500 border-2 border-dashed rounded-xl">
              Aucun étudiant ajourné en première session : il n'y a pas de seconde session
              à encoder pour cette unité.
            </div>
          )}
          {!data ? (
            <div className="py-10 text-center text-slate-400 text-sm">Chargement…</div>
          ) : data.sans_acquis && !data.epreuve_integree ? (
            /* UN CUL-DE-SAC N'EST PAS UN MESSAGE : le blocage porte la porte de sortie. */
            <div className="py-10 text-center text-slate-500 text-sm space-y-3">
              <div>
                Aucun acquis n'est rattaché aux cours de cette unité.<br />
                <span className="text-slate-400">
                  Sans ce lien, il n'y a pas de colonne à remplir : la note d'un
                  acquis se pose dans un cours.
                </span>
              </div>
              {onParametrer ? (
                <button onClick={() => onParametrer(ueNum)} className="bouton bouton-fort inline-flex items-center gap-1.5">
                  <IconLink size={14} /> Relier les acquis aux cours
                </button>
              ) : (
                <span className="text-slate-400 text-sm block">
                  Le paramétrage de l'unité est réservé à la direction.
                </span>
              )}
            </div>
          ) : !etudiants.length ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              {recherche ? 'Aucun étudiant ne correspond.' : 'Aucun étudiant inscrit à cette unité.'}
            </div>
          ) : vue === 'acquis' ? (
            /* ── TOUS LES ACQUIS DE L'UE — la vue du Conseil, en lecture. ── */
            <div className="rounded-carte border border-slate-200 bg-white overflow-hidden inline-block min-w-full">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="intertitre sticky left-0 z-20 bg-white text-left px-4 py-3 border-b border-slate-200 align-bottom">Étudiant</th>
                  {acquisUE.map((x, i) => (
                    <th key={x.aa_code} title={x.description || x.aa_code}
                      className={`px-2 pt-3 pb-2 w-24 border-b border-slate-200 align-bottom text-center ${i && acquisUE[i - 1].cours[0] !== x.cours[0] ? 'border-l border-l-slate-300' : 'border-l border-l-slate-100'}`}
                      style={{ borderTop: `4px solid ${couleurRepere}` }}>
                      <div className="text-second font-bold">{x.aa_code}</div>
                      <div className="text-mention text-slate-500 font-normal truncate max-w-[88px] mx-auto">{x.cours.map(c => c.cours_code).join(' · ')}</div>
                      {x.poids != null && <div className="text-mention text-slate-400 font-normal">{x.poids}</div>}
                    </th>))}
                  <th className="px-3 pb-2 border-b border-l border-slate-200 align-bottom text-xs font-bold">Acquis<br />en défaut</th>
                  <th className="px-3 pb-2 border-b border-slate-200 align-bottom text-xs font-bold bg-[#F7F9FC]"
                    style={{ borderLeft: '2px solid var(--c-principal, #16406A)', borderTop: '4px solid var(--c-principal, #16406A)' }}>Note d'unité<div className="text-mention text-slate-400 font-normal">/20</div></th>
                  <th className="px-3 pb-2 border-b border-l border-slate-200 align-bottom text-left text-xs font-bold min-w-[150px]">Décision proposée</th>
                </tr>
              </thead>
              <tbody>
                {etudiants.map(e => {
                  const b = bilanUE(e);
                  return (
                    <tr key={e.id} className="group">
                      {ligneEtudiant(e)}
                      {acquisUE.map(x => {
                        const v = noteAcquis(e, x);
                        return (
                          <td key={x.aa_code} className="text-center border-b border-slate-100 border-l border-l-slate-50 tabular-nums">
                            {v == null ? <span className="text-slate-300">·</span>
                              : typeof v === 'string' ? <span className="text-xs font-bold text-slate-500">{v}</span>
                              : <span className={v < SEUIL ? 'font-bold' : ''} style={v < SEUIL ? { color: 'var(--c-refuse)' } : undefined}>{v}</span>}
                          </td>);
                      })}
                      <td className="px-3 text-center border-b border-l border-slate-100 text-second font-semibold" style={{ color: b.defaut.length ? 'var(--c-refuse)' : 'rgb(var(--gris-300))' }}>
                        {b.defaut.length ? `${b.defaut.length} · ${b.defaut.slice(0, 2).map(c => c.replace(/^AA/, '')).join(', ')}${b.defaut.length > 2 ? '…' : ''}` : '—'}
                      </td>
                      <td className="px-3 text-center border-b border-slate-100 bg-[#F7F9FC]" style={{ borderLeft: '2px solid var(--c-principal, #16406A)' }}>
                        <Pastille n={data.cotes?.[e.id]?.ue} ajourne={!!b.defaut.length} large
                          titre="Note de l’unité, calculée depuis les cours et leurs poids — elle ne se saisit pas" />
                      </td>
                      <td className="px-3 border-b border-l border-slate-100">
                        {b.manque ? <span className="inline-block text-second font-semibold text-slate-500 border border-slate-300 rounded-md px-2.5 py-0.5">Incomplète</span>
                          : <span className="inline-block text-second font-semibold text-white rounded-md px-2.5 py-1"
                              style={{ background: b.defaut.length ? (session === 2 ? 'var(--c-refuse)' : 'var(--c-attente)') : 'var(--c-reussi)' }}>
                              {b.defaut.length ? (session === 2 ? 'Refusée' : 'Ajournée') : 'Réussie'}</span>}
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 px-4 py-2 m-0 border-t border-slate-100">Note d'un acquis porté par plusieurs cours : la moyenne de ses évaluations. Pas de compensation :
              un seul acquis sous 10 {session === 2 ? 'refuse' : 'ajourne'} l'unité, quelle que soit sa note. La décision reste celle du Conseil.</p>
            </div>
          ) : (
            /* ── PAR COURS — la saisie. ── */
            <div className="rounded-carte border border-slate-200 bg-white overflow-hidden inline-block min-w-full">
            <table ref={grille} onKeyDown={ev => naviguerGrille(ev, grille.current)}
              className="text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th rowSpan={2} className="intertitre sticky left-0 z-20 bg-white text-left px-4 pb-2 align-bottom border-b border-slate-200">Étudiant</th>
                  {coursVus.map(c => (
                    <th key={c.cours_code} colSpan={c.acquis.length + 1}
                      className="px-3 pt-3 pb-1 text-left align-bottom border-l border-slate-200 font-normal"
                      style={{ borderTop: `4px solid ${couleurRepere}` }}>
                      <div className="font-semibold text-sm truncate max-w-[260px]">{c.cours_nom || c.cours_code}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[260px]" title={c.professeurs || undefined}>
                        {!c.integree && <>{c.cours_code}{c.cours_per ? ` · ${c.cours_per} pér.` : ''}</>}
                        {c.professeurs ? `${c.integree ? '' : ' · '}${c.professeurs}` : ''}
                      </div>
                    </th>
                  ))}
                  <th rowSpan={2} className="px-3 pb-2 align-bottom text-center bg-[#F7F9FC] border-b border-slate-200 min-w-[110px]"
                    style={{ borderLeft: '2px solid var(--c-principal, #16406A)', borderTop: '4px solid var(--c-principal, #16406A)' }}>
                    <div className="text-sm font-semibold">UE {ueNum}</div>
                    <div className="text-xs font-bold mt-2">Note d'unité</div>
                    <div className="text-mention text-slate-400 font-normal">/20</div>
                  </th>
                </tr>
                <tr>
                  {coursVus.flatMap((c, i) => [
                    ...c.acquis.map((a, j) => (
                      <th key={`${c.cours_code}|${a.aa_code}`} title={a.description || a.aa_code}
                        className={`px-1 pb-2 pt-1 w-16 text-center border-b border-slate-200 ${j === 0 ? 'border-l border-l-slate-200' : ''}`}>
                        <div className="text-xs font-semibold text-slate-700">{a.aa_code}</div>
                        {a.poids != null && <div className="text-mention font-normal text-slate-400">{a.poids}</div>}
                      </th>)),
                    <th key={`${c.cours_code}|cote`} className="px-1 pb-2 pt-1 w-[72px] text-center border-b border-slate-200">
                      <div className="text-xs font-bold">Cours</div>
                      <div className="text-mention font-normal text-slate-400">/20</div>
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {etudiants.map((e, ligne) => {
                  const b = bilanUE(e);
                  return (
                  <tr key={e.id} className="group focus-within:bg-[#F1F6FB]">
                    {ligneEtudiant(e)}
                    {(() => { colonne = 0; return null; })()}
                    {coursVus.flatMap(c => {
                      const m = mention(e, c.cours_code);
                      // EN SECONDE SESSION, SEULS LES COURS À REPRÉSENTER.
                      const ferme = fermeDe(e, c.cours_code);
                      const na = data.cotes?.[e.id]?.na?.[c.cours_code];
                      return [
                        ...c.acquis.map((a, j) => {
                          const col = { ...a, cours: c };
                          const v = note(e, col);
                          const nc = colonne++;
                          const sous = v != null && v !== '' && Math.round(Number(v)) < SEUIL;
                          return (
                            <td key={`${e.id}|${c.cours_code}|${a.aa_code}`}
                              className={`px-1 py-1 border-b border-slate-100 text-center ${j === 0 ? 'border-l border-l-slate-200' : ''}`}>
                              {/* LA CASE SE REMONTE QUAND LA DONNÉE CHANGE : la clé porte
                                  la session, la valeur et la mention (cf. l'historique :
                                  une case périmée réécrivait l'ancienne note). */}
                              <input {...caseGrille(ligne, nc)}
                                key={`${session}|${v ?? ''}|${m || ''}`}
                                defaultValue={m || (v == null ? '' : String(v).replace('.', ','))} disabled={ferme} placeholder="·"
                                title={ferme ? 'Ce cours n’était pas à représenter : la note de première session reste acquise'
                                  : m ? (m === 'NP' ? 'Note de présence — zéro, la seconde session reste ouverte' : "Pas présenté — absence non justifiée")
                                  : undefined}
                                onBlur={ev => sortieCase(e, c, a, ev.target.value, v, m)}
                                className={`w-14 h-8 text-center rounded-lg bg-transparent border border-transparent outline-none tabular-nums
                                  placeholder:text-slate-300 focus:bg-white focus:border-[var(--c-principal,#19537E)] focus:ring-1 focus:ring-[var(--c-principal,#19537E)]
                                  disabled:text-slate-300 ${m ? 'text-xs font-bold tracking-wide text-slate-500' : sous ? 'font-semibold' : 'text-iip-blue'}`}
                                style={sous && !m ? { color: 'var(--c-refuse)' } : undefined} />
                            </td>
                          );
                        }),
                        // LA NOTE DU COURS, CALCULÉE ET NON SAISIE — en pastille pleine.
                        <td key={`${e.id}|${c.cours_code}|cote`} className="px-1 py-1 border-b border-slate-100 text-center">
                          <Pastille n={data.cotes?.[e.id]?.cours?.[c.cours_code]} na={na}
                            titre={na ? 'Non acquis — le Conseil a ajourné ce cours, ou l’épreuve n’a pas été présentée'
                              : 'Note du cours, calculée depuis les acquis et leurs poids'} />
                        </td>,
                      ];
                    })}
                    {/* LA NOTE DE L'UNITÉ — vue, jamais saisie ; un acquis sous 10 l'ajourne. */}
                    <td className="px-2 py-1 border-b border-slate-100 text-center bg-[#F7F9FC]"
                      style={{ borderLeft: '2px solid var(--c-principal, #16406A)' }}>
                      <Pastille n={data.cotes?.[e.id]?.ue} ajourne={!!b.defaut.length} large
                        titre={data.cotes?.[e.id]?.ue == null ? 'Non calculable : un cours est non acquis, ou tout n’est pas encodé'
                          : 'Note de l’unité, calculée depuis les cours et leurs poids — elle ne se saisit pas'} />
                      <div className="text-mention font-semibold mt-0.5"
                        style={{ color: b.manque ? 'rgb(var(--gris-400))' : b.defaut.length ? 'var(--c-attente)' : 'var(--c-reussi)' }}>{motUE(b)}</div>
                    </td>
                  </tr>);
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-xs text-slate-500 border-t border-slate-200">Moyenne · réussite</td>
                  {coursVus.flatMap(c => [
                    ...c.acquis.map((a, j) => {
                      const r = resume(etudiants.map(e => (mention(e, c.cours_code) ? null : note(e, { ...a, cours: c }))));
                      return <td key={`p|${c.cours_code}|${a.aa_code}`} className={`bg-slate-50 py-2 text-center text-xs leading-tight text-slate-600 border-t border-slate-200 ${j === 0 ? 'border-l border-l-slate-200' : ''}`}>
                        {r.moy}<div className="text-slate-400">{r.taux}</div></td>;
                    }),
                    (() => { const r = resume(etudiants.map(e => data.cotes?.[e.id]?.cours?.[c.cours_code])); return (
                      <td key={`p|${c.cours_code}|cote`} className="bg-slate-50 py-2 text-center text-xs leading-tight font-semibold border-t border-slate-200">
                        {r.moy}<div className="text-slate-400 font-normal">{r.taux}</div></td>); })(),
                  ])}
                  {(() => { const r = resume(etudiants.map(e => data.cotes?.[e.id]?.ue)); return (
                    <td className="bg-slate-50 py-2 text-center text-xs leading-tight font-semibold border-t border-slate-200"
                      style={{ borderLeft: '2px solid var(--c-principal, #16406A)' }}>
                      {r.moy}<div className="text-slate-400 font-normal">{etudiants.filter(e => motUE(bilanUE(e)) === 'réussie').length} réussie(s)</div></td>); })()}
                </tr>
              </tfoot>
            </table>
            </div>
          )}
        </div>
        </div>

      </div>
    </Fenetre>
  );
}

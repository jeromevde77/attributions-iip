import { useEffect, useMemo, useState } from 'react';
import {
  IconX, IconSearch, IconAlertTriangle, IconChevronLeft, IconChevronRight,
  IconArrowUp, IconRepeat, IconList, IconFileText, IconMessage,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import TableauBordEtudiant from './TableauBordEtudiant.jsx';
import { MOTIFS_ECHEC, composerMotif, decomposerMotif } from './motifsEchec.js';

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
 * La fiche est une MATRICE : une colonne par cours, une ligne par acquis. La
 * somme d'une ligne dit ce que l'acquis vaut pour l'unité, la somme d'une
 * colonne ce que vaut le cours, et leur croisement la note de l'unité.
 */

const fmt = n => n == null ? '—' : (Math.round(n * 100) / 100).toString().replace('.', ',');

export default function FeuilleDeliberation({ ueNum, annee, onClose }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [idx, setIdx] = useState(0);
  const [tableau, setTableau] = useState(false);   // la vue d'ensemble
  const [bord, setBord] = useState(null);
  const [enCours, setEnCours] = useState(false);
  // La séance : les présences en ouverture, la visite des copies en clôture.
  const [seance, setSeance] = useState(null);
  const [etape, setEtape] = useState('presences');   // presences | fiche | cloture

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
  async function chargerSeance() {
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}/seance?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setSeance(j);
    } catch { /* la séance est un cadre, pas un bloquant */ }
  }
  useEffect(() => { charger(); chargerSeance(); /* eslint-disable-next-line */ }, [ueNum, annee]);

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

  /** La justification d'un acquis non acquis, enregistrée puis relue. */
  async function poserMotif(aaCode, texte) {
    if (!etud) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/motivation', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum,
          motifs: { [aaCode]: texte },
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setData(d => ({ ...d, etudiants: d.etudiants.map(x => x.id !== etud.id ? x
        : { ...x, acquis: x.acquis.map(a => a.aa_code === aaCode ? { ...a, motif: texte } : a) }) }));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * LA DÉCISION SE PREND ICI, et elle s'enregistre en passant au suivant.
   *
   * Elle n'a pas à être ressaisie dans un second écran : le calcul l'a déjà
   * dite — réussi, ajourné, refusé — et le Conseil l'a déjà prise en posant
   * ses ajustements. Ce qu'il reste à faire, c'est l'écrire.
   *
   * MAIS on ne quitte pas un échec sans motivation : une décision défavorable
   * non motivée est attaquable, et l'annexe 8 ou 9 ne pourrait pas être
   * produite. C'est le seul barrage de cet écran, et il est délibéré.
   */
  async function enregistrerPuisAvancer(pas) {
    if (!etud) return;
    const ue = etud.ue || {};
    const manquants = ue.motifs_manquants || [];
    if (ue.decision_proposee !== 'reussi' && manquants.length) {
      setErreur(`Justification requise avant de passer au suivant : `
        + `${manquants.join(', ')}. Cliquez sur la bulle rouge de l'acquis.`);
      return;
    }
    setEnCours(true); setErreur(null);
    try {
      if (ue.decision_proposee) {
        const rep = await fetch('/api/acquis/decision', {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({
            etudiant_id: etud.id, annee_scolaire: annee, ue_num: ueNum,
            resultat: ue.decision_proposee, points: ue.note,
          }),
        });
        if (!rep.ok) {
          const j = await rep.json().catch(() => ({}));
          setErreur(j.error || "La décision n'a pas pu être enregistrée.");
          return;
        }
        setData(d => ({ ...d, etudiants: d.etudiants.map(x => x.id === etud.id
          ? { ...x, resultat: ue.decision_proposee, points: ue.note } : x) }));
      }
      // Dernier étudiant : la séance se clôt, et la visite des copies se fixe.
      if (pas > 0 && idx >= liste.length - 1) setEtape('cloture');
      else setIdx(i => Math.max(0, Math.min(liste.length - 1, i + pas)));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * LE PROCÈS-VERBAL, à la clôture. Circulaire « Sanction des études »,
   * annexe 3 pour une unité ordinaire, annexe 5 pour une épreuve intégrée.
   * Il s'ouvre dans une fenêtre d'impression : c'est une pièce signée, elle
   * sort sur papier.
   */
  async function imprimerPV() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${ueNum}/pv?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (j.manques?.length) {
        setErreur(`Procès-verbal produit, mais il manque : ${j.manques.join(', ')}.`);
      }
      const f = window.open('', '_blank');
      if (!f) { setErreur('Le navigateur a bloqué la fenêtre d’impression.'); return; }
      f.document.write(j.html);
      f.document.close();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function enregistrerSeance(champs) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${ueNum}/seance`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, ...champs }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return false; }
      await chargerSeance();
      return true;
    } catch (e) { setErreur(e.message); return false; }
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

          {etape === 'presences' ? (
            <Presences seance={seance} enCours={enCours}
              onValider={membres => enregistrerSeance({
                membres, date_seance: new Date().toISOString().slice(0, 10),
              }).then(ok => ok && setEtape('fiche'))} />
          ) : etape === 'cloture' ? (
            <Cloture seance={seance?.seance} enCours={enCours} nb={liste.length}
              onRetour={() => setEtape('fiche')} onPV={imprimerPV}
              onClore={champs => enregistrerSeance({ ...champs, cloturee: 1 })} />
          ) : !liste.length ? (
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
                <button disabled={idx <= 0 || enCours} onClick={() => enregistrerPuisAvancer(-1)}
                  title="Enregistrer la décision et revenir au précédent"
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
                <button disabled={enCours} onClick={() => enregistrerPuisAvancer(1)}
                  title={idx >= liste.length - 1
                    ? 'Enregistrer et clore la délibération'
                    : 'Enregistrer la décision et passer au suivant'}
                  className="px-2.5 py-1.5 rounded-lg border border-iip-blue text-iip-blue
                             font-semibold text-[12px] flex items-center gap-1
                             disabled:opacity-30">
                  {idx >= liste.length - 1 ? 'Clore' : 'Suivant'}
                  <IconChevronRight size={16} />
                </button>
              </div>

              <Fiche e={etud} data={data} onAjuster={ajuster} onMotif={poserMotif}
                enCours={enCours} onBord={() => setBord(etud)} />
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

/* ═══ Les présences du Conseil ═════════════════════════════════════════════
 *
 * La composition fonde la validité de la décision : y siègent de droit tous
 * les professeurs qui ont des heures dans l'unité, la coordination de section
 * au titre du suivi pédagogique, et la direction ou son représentant. On ne
 * coche que la présence — la composition, elle, se déduit des attributions.
 */

function Presences({ seance, onValider, enCours }) {
  const [membres, setMembres] = useState(null);
  const [ajout, setAjout] = useState('');

  useEffect(() => { if (seance && !membres) setMembres(seance.membres); }, [seance, membres]);

  if (!membres) {
    return <div className="py-10 text-center text-[12.5px] text-slate-400">Chargement du Conseil…</div>;
  }

  const presents = membres.filter(m => m.present).length;
  const ton = { professeur: 'text-slate-700', coordination: 'text-sky-800',
                direction: 'text-iip-blue', ajoute: 'text-slate-600' };

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 rounded-xl bg-iip-blue/5 border border-iip-blue/20">
        <div className="text-[13px] font-semibold text-iip-blue">Conseil des études</div>
        <p className="text-[11.5px] text-slate-600">
          Cochez les présents avant d'ouvrir la délibération. La liste se déduit
          des attributions de l'unité ; elle est donc à jour de l'année en cours.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
        {membres.map((m, i) => (
          <label key={m.cle}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" checked={!!m.present}
              onChange={e => setMembres(l => l.map((x, k) =>
                k === i ? { ...x, present: e.target.checked } : x))}
              className="w-4 h-4 accent-iip-blue flex-none" />
            <span className="flex-1 min-w-0">
              <span className={`text-[12.5px] font-semibold ${ton[m.role] || 'text-slate-700'}`}>
                {m.nom}
              </span>
              <span className="block text-[11px] text-slate-500 truncate">{m.qualite}</span>
            </span>
            <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full flex-none
              ${m.present ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
              {m.present ? 'présent' : 'excusé'}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input value={ajout} onChange={e => setAjout(e.target.value)}
          placeholder="Ajouter un membre (nom, qualité)…"
          className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-[12.5px]" />
        <button disabled={!ajout.trim()}
          onClick={() => {
            setMembres(l => [...l, { cle: `ajout:${Date.now()}`, nom: ajout.trim(),
              qualite: 'Membre invité', role: 'ajoute', present: true }]);
            setAjout('');
          }}
          className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                     text-slate-600 disabled:opacity-40">
          Ajouter
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[12px] text-slate-500">
          <b className="text-iip-blue">{presents}</b> présent(s) sur {membres.length}
        </span>
        <button disabled={enCours || !presents} onClick={() => onValider(membres)}
          className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white font-semibold
                     disabled:opacity-40">
          Ouvrir la délibération
        </button>
      </div>
    </div>
  );
}

/* ═══ La clôture ═══════════════════════════════════════════════════════════
 *
 * La visite des copies est un droit de l'étudiant : la séance ne se clôt pas
 * sans avoir dit quand et où. Trois champs, et l'affaire est close.
 */

function Cloture({ seance, onClore, onRetour, onPV, enCours, nb }) {
  const [date, setDate] = useState(seance?.visite_date || '');
  const [heure, setHeure] = useState(seance?.visite_heure || '');
  const [local, setLocal] = useState(seance?.visite_local || '');
  const [close, setClose] = useState(!!seance?.cloturee);
  const complet = date && heure && local.trim();

  return (
    <div className="space-y-3 max-w-xl mx-auto py-4">
      <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
        <div className="text-[14px] font-semibold text-emerald-900">Délibération terminée</div>
        <p className="text-[12px] text-emerald-800">
          Les {nb} étudiant(s) de cette unité ont été délibérés et leurs décisions
          sont enregistrées.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <div className="text-[13px] font-semibold text-iip-blue">Visite des copies</div>
          <p className="text-[11.5px] text-slate-500">
            L'étudiant a le droit de consulter sa copie. La date, l'heure et le
            local figurent sur la notification qui lui est remise.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11.5px] text-slate-600">
            Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
          <label className="text-[11.5px] text-slate-600">
            Heure
            <input type="time" value={heure} onChange={e => setHeure(e.target.value)}
              className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
        </div>
        <label className="text-[11.5px] text-slate-600 block">
          Local
          <input value={local} onChange={e => setLocal(e.target.value)}
            placeholder="Bâtiment P, local 2.14…"
            className="w-full mt-0.5 border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={onRetour}
          className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
          Revenir aux fiches
        </button>
        <div className="flex items-center gap-2">
          {/* Le procès-verbal ne s'imprime qu'une fois la visite fixée : il en
              porte la date, et un PV incomplet devrait être refait. */}
          <button disabled={enCours || !close} onClick={onPV}
            title={close ? 'Circulaire « Sanction des études », annexes 3 et 5'
                         : 'Clôturez d’abord : le PV porte la date de communication'}
            className="px-3 py-2 text-[12.5px] rounded-lg border border-iip-blue
                       text-iip-blue font-semibold disabled:opacity-40
                       flex items-center gap-1.5">
            <IconFileText size={14} /> Procès-verbal
          </button>
          <button disabled={enCours || !complet} onClick={() => onClore({
              visite_date: date, visite_heure: heure, visite_local: local.trim() })
              .then(ok => ok && setClose(true))}
            title={complet ? '' : 'La date, l’heure et le local sont requis'}
            className="px-4 py-2 text-[13px] rounded-lg bg-emerald-600 text-white font-semibold
                       disabled:opacity-40">
            {close ? 'Enregistré' : 'Clore la délibération'}
          </button>
        </div>
      </div>

      {close && (
        <p className="text-[11.5px] text-emerald-800 text-center">
          Séance close. Le procès-verbal peut être imprimé, puis signé.
        </p>
      )}
    </div>
  );
}

/* ═══ La fiche d'un étudiant — LA MATRICE ══════════════════════════════════
 *
 * Une colonne par cours, une ligne par acquis. La case dit ce que cet acquis a
 * valu DANS ce cours ; la tuile en bout de ligne, ce qu'il vaut pour l'unité ;
 * la tuile en pied de colonne, ce que vaut le cours. Au croisement des deux
 * sommes, en bas à droite, la note de l'unité.
 *
 * Trois gestes, chacun à sa place :
 *   — l'AJOURNEMENT se pose sur une tuile de somme : cet acquis-là, ou ce
 *     cours-là, est à représenter ;
 *   — la FAVEUR se pose sur la seule note d'unité : c'est l'unité que le
 *     Conseil lève, et le décret fixe le reste ;
 *   — la JUSTIFICATION s'écrit sur l'acquis non acquis, en bout de ligne :
 *     c'est de lui qu'il faut rendre compte, et c'est lui que reprend l'annexe.
 */

function Fiche({ e, data, onAjuster, onMotif, enCours, onBord }) {
  const ue = e.ue || {};
  const acquis = e.acquis || [];
  const cours = e.cours || [];
  const [motifDe, setMotifDe] = useState(null);   // aa_code en cours de motivation

  // La note d'un acquis DANS un cours : c'est la case de la matrice.
  const caseDe = (a, coursCode) =>
    (a.evaluations || []).find(v => v.cours_code === coursCode) || null;

  const largeurCol = cours.length > 4 ? 'min-w-[74px]' : 'min-w-[92px]';

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="border-collapse text-[12px] w-full">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 text-left px-3 py-2 border-b border-r
                             border-slate-200 min-w-[200px] text-[11px] font-bold
                             uppercase tracking-wide text-slate-500">
                Acquis d'apprentissage
              </th>
              {cours.map(c => (
                <th key={c.cours_code} title={c.cours_nom || ''}
                  className={`px-1 py-2 border-b border-slate-200 ${largeurCol}`}>
                  <div className="font-mono text-[11px] font-bold text-iip-blue">{c.cours_code}</div>
                  <div className="font-normal text-[9px] text-slate-400 truncate">
                    {c.poids_cours_affiche != null ? `${c.poids_cours_affiche} %` : '—'}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 border-b border-l-2 border-l-iip-blue/40 bg-iip-blue/5
                             min-w-[104px] text-[10px] font-bold uppercase text-iip-blue">
                Acquis / UE
              </th>
            </tr>
          </thead>

          <tbody>
            {acquis.map(a => (
              <tr key={a.aa_code}>
                <td className="sticky left-0 bg-white z-10 px-3 py-1.5 border-b border-r
                               border-slate-100">
                  <div className="font-mono text-[11px] font-bold text-slate-600">{a.aa_code}</div>
                  <div className="text-[10.5px] text-slate-500 truncate max-w-[190px]"
                    title={a.description || ''}>{a.description || ''}</div>
                </td>

                {cours.map(c => {
                  const v = caseDe(a, c.cours_code);
                  return (
                    <td key={c.cours_code}
                      className="border-b border-slate-100 px-1 py-1 text-center">
                      {!v ? (
                        <span className="text-slate-300 text-[11px]">·</span>
                      ) : (
                        <div className={`rounded-lg py-1 text-[13px] font-semibold tabular-nums
                          ${c.na || a.na ? 'bg-slate-100 text-slate-400'
                            : v.note == null ? 'bg-slate-50 text-slate-300'
                            : v.note < data.seuil ? 'bg-red-50 text-red-700'
                            : 'bg-emerald-50 text-emerald-800'}`}>
                          {c.na || a.na ? 'NA' : fmt(v.note)}
                          {v.poids ? (
                            <span className="block text-[8.5px] font-normal opacity-60">
                              poids {v.poids}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* Somme de la ligne : ce que l'acquis vaut pour l'unité. */}
                <td className="border-b border-l-2 border-l-iip-blue/40 bg-iip-blue/5 px-1.5 py-1">
                  <TuileSomme etat={a} seuil={data.seuil} enCours={enCours}
                    onAjourner={() => onAjuster('aa', a.aa_code,
                      a.ajourne_directement ? null : 'ajourne')}
                    onMotiver={() => setMotifDe(m => m === a.aa_code ? null : a.aa_code)}
                    motif={a.motif} />
                </td>
              </tr>
            ))}

            {/* Somme des colonnes : ce que vaut chaque cours. */}
            <tr className="bg-slate-50">
              <td className="sticky left-0 bg-slate-50 z-10 px-3 py-2 border-t border-r
                             border-slate-200 text-[11px] font-bold uppercase
                             tracking-wide text-slate-500">
                Note du cours
              </td>
              {cours.map(c => (
                <td key={c.cours_code} className="border-t border-slate-200 px-1.5 py-1.5">
                  <TuileSomme etat={c} seuil={data.seuil} enCours={enCours}
                    onAjourner={() => onAjuster('cours', c.cours_code,
                      c.ajourne_directement ? null : 'ajourne')} />
                </td>
              ))}

              {/* Le croisement des deux sommes : la note de l'unité. */}
              <td className="border-t-2 border-t-iip-blue/40 border-l-2 border-l-iip-blue/40
                             bg-iip-blue/10 px-1.5 py-1.5">
                <TuileUE ue={ue} seuil={data.seuil} enCours={enCours}
                  onFaveur={() => onAjuster('ue', '*', ue.faveur_ue ? null : 'faveur')} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* La justification, sous la matrice, pour l'acquis choisi. */}
      {motifDe && (
        <Justification aa={acquis.find(a => a.aa_code === motifDe)}
          onFermer={() => setMotifDe(null)}
          onEnregistrer={t => onMotif(motifDe, t).then(() => setMotifDe(null))} />
      )}

      {/* Ce que le Conseil décide, et ce qu'il y a à représenter. */}
      <Decision e={e} ue={ue} onBord={onBord} />
    </div>
  );
}

/**
 * Une tuile de somme : la note, et l'ajournement qui s'y pose.
 * Le bouton de justification n'apparaît que sur un acquis en échec.
 */
function TuileSomme({ etat, seuil, onAjourner, onMotiver, motif, enCours }) {
  const { na, faveur, note } = etat;
  const echec = !na && note != null && note < seuil;
  return (
    <div className={`rounded-lg border px-2 py-1 flex items-center gap-1.5
      ${na ? 'border-slate-300 bg-slate-100 text-slate-600'
        : faveur ? 'border-amber-400 bg-amber-50 text-amber-900'
        : echec ? 'border-red-500 border-2 bg-red-50 text-red-800'
        : note == null ? 'border-slate-200 bg-white text-slate-300'
        : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
      <span className="text-[15px] font-bold tabular-nums flex-1 text-right">
        {na ? 'NA' : fmt(note)}
      </span>
      <span className="flex flex-col gap-0.5">
        <button disabled={enCours} onClick={onAjourner}
          title={na ? "Lever l'ajournement" : 'Ajourner — à représenter'}
          className={`w-5 h-5 rounded-full flex items-center justify-center border
            ${na ? 'bg-slate-600 border-slate-700 text-white'
                 : 'bg-white border-slate-300 text-slate-500 hover:border-slate-500'}`}>
          <IconRepeat size={11} />
        </button>
        {onMotiver && echec && (
          <button disabled={enCours} onClick={onMotiver}
            title={motif ? 'Modifier la justification' : 'Justifier cet acquis non acquis'}
            className={`w-5 h-5 rounded-full flex items-center justify-center border
              ${motif ? 'bg-iip-blue border-iip-blue text-white'
                      : 'bg-white border-red-400 text-red-600'}`}>
            <IconMessage size={11} />
          </button>
        )}
      </span>
    </div>
  );
}

/** La note de l'unité — et la faveur, qui ne se pose que là. */
function TuileUE({ ue, seuil, onFaveur, enCours }) {
  const echec = !ue.na && ue.note != null && ue.note < seuil;
  return (
    <div className={`rounded-lg border-2 px-2 py-1
      ${ue.na ? 'border-slate-400 bg-slate-100 text-slate-700'
        : ue.faveur ? 'border-amber-500 bg-amber-100 text-amber-950'
        : echec ? 'border-red-600 bg-red-50 text-red-800'
        : 'border-emerald-500 bg-emerald-50 text-emerald-900'}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[19px] font-bold tabular-nums flex-1 text-right leading-tight">
          {ue.na ? 'NA' : fmt(ue.note)}
        </span>
        {(echec || ue.faveur) && !ue.na && (
          <button disabled={enCours} onClick={onFaveur}
            title={ue.faveur ? 'Retirer la faveur'
              : "Lever l'unité en faveur — elle vaudra exactement le seuil"}
            className={`w-6 h-6 rounded-full flex items-center justify-center border
              ${ue.faveur ? 'bg-amber-400 border-amber-600 text-amber-950'
                          : 'bg-emerald-600 border-emerald-700 text-white'}`}>
            <IconArrowUp size={13} />
          </button>
        )}
      </div>
      <div className="text-[8.5px] font-bold uppercase tracking-wide opacity-70 text-right">
        {ue.faveur ? 'faveur' : "note de l'unité"}
      </div>
    </div>
  );
}

/* ═══ La justification d'un acquis non acquis ══════════════════════════════ */

function Justification({ aa, onFermer, onEnregistrer }) {
  const depart = decomposerMotif(aa?.motif || '');
  const [coches, setCoches] = useState(
    Object.fromEntries(depart.cles.map(c => [c, true])));
  const [libre, setLibre] = useState(depart.libre);
  const [ouvert, setOuvert] = useState(MOTIFS_ECHEC[0]?.groupe || null);

  const cles = Object.entries(coches).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className="border border-red-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-red-900">
          Justifier <span className="font-mono">{aa?.aa_code}</span> — acquis non acquis
        </span>
        <button onClick={onFermer} className="text-red-400 hover:text-red-700">
          <IconX size={16} />
        </button>
      </div>

      <div className="p-3 space-y-2 max-h-[42vh] overflow-y-auto">
        {MOTIFS_ECHEC.map(g => (
          <div key={g.groupe} className="border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setOuvert(o => o === g.groupe ? null : g.groupe)}
              className="w-full text-left px-2.5 py-1.5 bg-slate-50 text-[12px]
                         font-semibold text-slate-700 flex items-center justify-between">
              {g.groupe}
              <span className="text-[10px] text-slate-400">
                {g.motifs.filter(m => coches[m.cle]).length || ''}
              </span>
            </button>
            {ouvert === g.groupe && (
              <div className="divide-y divide-slate-100">
                {g.motifs.map(m => (
                  <label key={m.cle}
                    className="flex items-start gap-2 px-2.5 py-1.5 text-[11.5px]
                               text-slate-700 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={!!coches[m.cle]}
                      onChange={ev => setCoches(c => ({ ...c, [m.cle]: ev.target.checked }))}
                      className="mt-0.5 accent-iip-blue" />
                    <span>{m.texte}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        <textarea value={libre} onChange={ev => setLibre(ev.target.value)}
          rows={2} placeholder="Précision propre à cet étudiant (facultatif)…"
          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12px]" />
      </div>

      <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
        <button onClick={onFermer}
          className="px-3 py-1 text-[12px] rounded-lg border border-slate-300 text-slate-600">
          Annuler
        </button>
        <button onClick={() => onEnregistrer(composerMotif(cles, libre))}
          className="px-3 py-1 text-[12px] rounded-lg bg-iip-blue text-white font-semibold">
          Enregistrer la justification
        </button>
      </div>
    </div>
  );
}

/* ═══ La décision, sous la matrice ═════════════════════════════════════════ */

const LIB_RES = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé', absent: 'Absent' };

function Decision({ e, ue, onBord }) {
  const detail = ue.a_representer_detail || [];
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[12px]
                      font-semibold text-iip-blue">
        Décision du Conseil des études
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* La décision se déduit du calcul et s'enregistre en passant au
              suivant : elle n'a pas à être ressaisie ailleurs. */}
          <span className={`text-[12.5px] font-bold px-2.5 py-1 rounded-lg border
            ${ue.decision_proposee === 'reussi' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : ue.decision_proposee === 'refuse' ? 'bg-red-100 text-red-800 border-red-200'
              : ue.decision_proposee ? 'bg-amber-100 text-amber-900 border-amber-200'
              : 'bg-white text-slate-400 border-dashed border-slate-300'}`}>
            {LIB_RES[ue.decision_proposee] || 'Pas de note : rien à décider'}
            {!ue.na && ue.note != null && ` · ${fmt(ue.note)}/20`}
          </span>
          {e.resultat && e.resultat !== ue.decision_proposee && (
            <span className="text-[11px] text-slate-500">
              enregistré : {LIB_RES[e.resultat]}
            </span>
          )}
          {(ue.motifs_manquants || []).length > 0 && ue.decision_proposee !== 'reussi' && (
            <span className="text-[11.5px] text-red-800 bg-red-50 border border-red-200
                             rounded-lg px-2 py-1">
              À justifier avant de passer au suivant :
              {' '}{ue.motifs_manquants.join(', ')}
            </span>
          )}
          {ue.de_plein_droit && e.resultat !== 'reussi' && (
            <span className="text-[11.5px] text-emerald-800 bg-emerald-50 border
                             border-emerald-200 rounded-lg px-2 py-1">
              Réussite de plein droit : tous les acquis et tous les cours au seuil.
            </span>
          )}
          <button onClick={onBord}
            className="ml-auto text-[11.5px] px-2.5 py-1 rounded-lg bg-iip-blue
                       text-white font-semibold">
            Parcours et décision
          </button>
        </div>

        {ue.faveur && (
          <p className="text-[11.5px] text-amber-900 bg-amber-50 border border-amber-200
                        rounded-lg px-2.5 py-1.5">
            Faveur accordée : l'unité vaut exactement le seuil. Le Conseil ne peut
            attester la réussite sans maîtrise de tous les acquis, ni donner plus de
            10/20 lorsque l'un d'eux ne l'est pas — décret du 16 avril 1991.
          </p>
        )}

        {ue.na && (
          <div className="text-[11.5px] text-slate-700 bg-slate-50 border border-slate-200
                          rounded-lg px-2.5 py-1.5 space-y-1">
            <div className="font-semibold">Ajournement — à représenter :</div>
            {detail.length ? detail.map(c => (
              <div key={c.cours_code} className="pl-2">
                <span className="font-mono font-semibold">{c.cours_code}</span>
                {c.cours_nom ? ` · ${c.cours_nom}` : ''}
                {c.aas?.length ? (
                  <span className="text-slate-500"> — acquis {c.aas.join(', ')}</span>
                ) : null}
              </div>
            )) : (
              <div className="pl-2 text-slate-500">
                Acquis ajournés : {(e.acquis || []).filter(a => a.na)
                  .map(a => a.aa_code).join(', ') || '—'}
              </div>
            )}
          </div>
        )}
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

import { useEffect, useMemo, useState } from 'react';
import { IconX, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { MOTIFS_ECHEC, texteDuMotif, composerMotif, decomposerMotif } from './motifsEchec.js';

/**
 * Tableau de bord de délibération — un étudiant, à propos d'une unité.
 *
 * La feuille de délibération montre UNE unité et TOUS ses étudiants : elle sert
 * à comparer. Cet écran-ci fait l'inverse — un étudiant, tout son parcours — et
 * sert à décider. Le Conseil ne délibère pas une unité dans le vide.
 *
 * Trois sources, aucune recalculée ici :
 *  - /acquis/motivation  : les acquis de l'unité, leurs notes, leurs motifs ;
 *  - /acquis/parcours-bilan : le parcours, la moyenne, les crédits ;
 *  - /acquis/decision    : ce qu'on y pose.
 * Recalculer les notes une seconde fois, c'était s'exposer à deux chiffres
 * divergents pour la même unité.
 */

const SEUIL = 10;                       // RDE, art. 78
const DECISIONS = [
  { cle: 'reussi',  libelle: 'Réussi',   ton: 'bg-emerald-600' },
  { cle: 'ajourne', libelle: 'Ajourné',  ton: 'bg-amber-500' },
  { cle: 'refuse',  libelle: 'Refusé',   ton: 'bg-red-600' },
  { cle: 'absent',  libelle: 'Absent',   ton: 'bg-slate-400' },
];

// Une note se lit d'un coup d'œil : la couleur porte l'information, le chiffre
// la précise.
const tonNote = n => n == null ? 'bg-slate-100 text-slate-400'
  : n >= 14 ? 'bg-emerald-100 text-emerald-800'
  : n >= SEUIL ? 'bg-sky-100 text-sky-800'
  : n >= 8 ? 'bg-amber-100 text-amber-900'
  : 'bg-red-100 text-red-800';

const tonResultat = r => ({
  reussi: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ajourne: 'bg-amber-100 text-amber-900 border-amber-200',
  refuse: 'bg-red-100 text-red-800 border-red-200',
  absent: 'bg-slate-100 text-slate-500 border-slate-200',
}[r] || 'bg-white text-slate-500 border-slate-200');

const LIB_RESULTAT = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé', absent: 'Absent' };

export default function TableauBordEtudiant({ etudId, ueNum, annee, onClose, onDecide }) {
  const [detail, setDetail] = useState(null);   // acquis de l'unité
  const [bilan, setBilan] = useState(null);     // parcours, moyenne, crédits
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const [coches, setCoches] = useState({});
  const [motifs, setMotifs] = useState({});
  const [ouvert, setOuvert] = useState({});

  async function charger() {
    setErreur(null);
    try {
      const [d, b] = await Promise.all([
        fetch(`/api/acquis/motivation/${etudId}/${ueNum}?annee=${encodeURIComponent(annee)}`,
          { headers: authHeaders() }).then(r => r.json()),
        fetch(`/api/acquis/parcours-bilan/${etudId}?annee=${encodeURIComponent(annee)}`,
          { headers: authHeaders() }).then(r => r.json()),
      ]);
      if (d.error) throw new Error(d.error);
      if (b.error) throw new Error(b.error);
      setDetail(d); setBilan(b);
      setDecision(d.resultat || null);
      setNote(d.points ?? '');
      const dec = d.acquis.map(a => [a.aa_code, decomposerMotif(a.motif || '')]);
      setCoches(Object.fromEntries(dec.map(([c, x]) => [c, x.cles])));
      setMotifs(Object.fromEntries(dec.map(([c, x]) => [c, x.libre])));
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId, ueNum, annee]);

  // Les acquis groupés par cours : c'est ainsi que le dossier pédagogique les
  // organise, et ainsi que l'enseignant les a évalués.
  const parCours = useMemo(() => {
    const g = {};
    for (const a of (detail?.acquis || [])) {
      const cle = a.cours_code || '—';
      (g[cle] = g[cle] || { cours_code: a.cours_code, cours_nom: a.cours_nom, aas: [] }).aas.push(a);
    }
    return Object.values(g);
  }, [detail]);

  const nonMaitrises = (detail?.acquis || []).filter(a => a.non_maitrise);
  const sansMotif = nonMaitrises.filter(a =>
    !(coches[a.aa_code] || []).length && !(motifs[a.aa_code] || '').trim()).length;

  async function enregistrer() {
    setEnCours(true); setMessage(null);
    try {
      const rep = await fetch('/api/acquis/decision', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee, ue_num: ueNum,
                               resultat: decision, points: note === '' ? null : note }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }

      // La motivation part avec la décision : une décision de refus enregistrée
      // sans ses motifs est attaquable, et rien ne rappellerait d'y revenir.
      if (nonMaitrises.length) {
        const rep2 = await fetch('/api/acquis/motivation', {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee, ue_num: ueNum,
            motifs: Object.fromEntries(detail.acquis.map(a =>
              [a.aa_code, composerMotif(coches[a.aa_code], motifs[a.aa_code])])) }),
        });
        const j2 = await rep2.json();
        if (!rep2.ok) { setMessage({ type: 'err', texte: j2.error }); return; }
      }
      setMessage({ type: 'ok', texte: 'Décision et motivation enregistrées.' });
      await charger();
      onDecide && onDecide();
    } catch (e) { setMessage({ type: 'err', texte: e.message }); }
    finally { setEnCours(false); }
  }

  if (erreur) return <Cadre onClose={onClose}><div className="text-[13px] text-red-700">{erreur}</div></Cadre>;
  if (!detail || !bilan) return <Cadre onClose={onClose}><div className="py-8 text-center text-slate-400 text-sm">Chargement…</div></Cadre>;

  const e = bilan.etudiant;
  const ects = bilan.ects;
  const total = ects.total_section || 0;
  const pc = v => total ? Math.max(0, Math.min(100, (v / total) * 100)) : 0;

  return (
    <Cadre onClose={onClose}
      titre={`${e.prenom || ''} ${e.nom || ''}`.trim()}
      sous={`UE ${ueNum} · ${e.section || '—'} · ${annee}`}>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-[12.5px] ${message.type === 'ok'
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          : 'bg-red-50 border border-red-200 text-red-800'}`}>{message.texte}</div>
      )}

      {/* ── IDENTITÉ ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-slate-600">
        {e.id_ecampus && <span>Matricule <b>{e.id_ecampus}</b></span>}
        {e.date_naissance && <span>Né(e) le <b>{e.date_naissance}</b></span>}
        {e.email_ecole && <span className="text-slate-400">{e.email_ecole}</span>}
      </div>

      {/* ── CRÉDITS : la jauge ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            Crédits de la section {ects.section || ''}
          </span>
          <span className="text-[12px] text-slate-600">
            <b className="text-emerald-700">{ects.acquis}</b> acquis ·
            {' '}<b className="text-sky-700">{ects.programme}</b> au programme ·
            {' '}<b className="text-slate-400">{ects.restant}</b> à venir ·
            {' '}sur <b>{total || '—'}</b>
          </span>
        </div>
        <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex">
          <div style={{ width: `${pc(ects.acquis)}%` }} className="bg-emerald-500" title={`${ects.acquis} ECTS acquis`} />
          <div style={{ width: `${pc(ects.programme)}%` }} className="bg-sky-500" title={`${ects.programme} ECTS au programme`} />
        </div>
        {/* Le total se SOMME au référentiel : aucun total n'est stocké. S'il ne
            tombe pas rond, c'est le référentiel qui est incomplet — mieux vaut
            le dire que d'afficher une jauge fausse sans le signaler. */}
        {!total && (
          <p className="mt-1 text-[11.5px] text-amber-800 flex items-center gap-1">
            <IconAlertTriangle size={13} /> Aucun ECTS au référentiel de cette section : la jauge ne peut rien situer.
          </p>
        )}
      </div>

      {/* ── MOYENNE ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-6 border-t border-slate-200 pt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            Moyenne de l'année
          </div>
          <div className={`text-[26px] font-bold leading-tight ${
            bilan.moyenne == null ? 'text-slate-300'
              : bilan.moyenne >= SEUIL ? 'text-iip-blue' : 'text-red-700'}`}>
            {bilan.moyenne == null ? '—' : `${String(bilan.moyenne).replace('.', ',')}/20`}
          </div>
          <div className="text-[10.5px] text-slate-400">pondérée par les périodes du dossier pédagogique</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            Unités de l'année
          </div>
          <div className="text-[15px] font-bold text-slate-700">
            {bilan.cette_annee.filter(i => i.resultat === 'reussi').length}
            <span className="text-slate-400"> / {bilan.cette_annee.length} réussies</span>
          </div>
        </div>
        {/* Une unité notée mais sans périodes au référentiel n'entre pas dans la
            pondération : la moyenne serait juste en apparence et fausse en
            silence. */}
        {bilan.moyenne_sans_ponderation > 0 && (
          <div className="text-[11.5px] text-amber-800 flex items-start gap-1 max-w-sm">
            <IconAlertTriangle size={13} className="mt-0.5 flex-none" />
            {bilan.moyenne_sans_ponderation} unité(s) notée(s) sans périodes au référentiel :
            elles ne pèsent pas dans la moyenne.
          </div>
        )}
      </div>

      {/* ── LE PARCOURS, en badges ───────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
          Programme de l'année
        </div>
        <div className="flex flex-wrap gap-1.5">
          {bilan.cette_annee.map(i => (
            <Badge key={i.ue_num} i={i} courante={i.ue_num === ueNum} />
          ))}
          {!bilan.cette_annee.length && <span className="text-[12px] text-slate-400">Aucune inscription cette année.</span>}
        </div>

        {!!bilan.anterieures.length && (
          <>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-3 mb-1.5">
              Années antérieures
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bilan.anterieures.map(i => (
                <Badge key={`${i.annee_scolaire}-${i.ue_num}`} i={i} passe />
              ))}
            </div>
          </>
        )}

        {!!bilan.valorisations.length && (
          <div className="mt-2 text-[11.5px] text-violet-800">
            {bilan.valorisations.length} valorisation(s) :
            {' '}{bilan.valorisations.map(v => `UE ${v.ue_num}`).join(' · ')}
          </div>
        )}
      </div>

      {/* ── L'UNITÉ EN DÉLIBÉRATION ──────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
          UE {ueNum} — acquis d'apprentissage, par cours
        </div>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {parCours.map(co => (
            <div key={co.cours_code || '—'} className="px-3 py-2">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-mono text-[11px] text-slate-500">{co.cours_code || '—'}</span>
                <span className="text-[12.5px] font-semibold text-slate-700">{co.cours_nom || 'Cours non rattaché'}</span>
              </div>
              <div className="space-y-1">
                {co.aas.map(a => (
                  <div key={a.aa_code} className="flex items-center gap-2 text-[12px]">
                    <span className={`px-1.5 py-0.5 rounded font-bold tabular-nums text-[11.5px] ${tonNote(a.note)}`}>
                      {a.note == null ? '—' : String(a.note).replace('.', ',')}
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-400 w-20 flex-none truncate">{a.aa_code}</span>
                    <span className="flex-1 text-slate-700">{a.description || ''}</span>
                    {a.non_evalue && <span className="text-[10.5px] text-slate-400">non évalué</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!parCours.length && (
            <div className="px-3 py-4 text-[12.5px] text-slate-400">
              Aucun acquis au référentiel de cette unité.
            </div>
          )}
        </div>
        <p className="mt-1 text-[11.5px] text-slate-500">
          {detail.nb_non_maitrises} acquis non maîtrisé(s) · {detail.nb_non_evalues} non évalué(s).
          Une absence d'évaluation n'est pas un échec.
        </p>
      </div>

      {/* ── LA DÉCISION ──────────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
          Décision du Conseil des études
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DECISIONS.map(d => (
            <button key={d.cle} type="button" onClick={() => setDecision(d.cle)}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition ${
                decision === d.cle ? `${d.ton} text-white border-transparent`
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
              {d.libelle}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-[12px] text-slate-600 ml-2">
            Cote
            <input type="number" min="0" max="20" step="0.5" value={note}
              onChange={ev => setNote(ev.target.value)}
              className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-[12.5px]" />
            <span className="text-slate-400">/20</span>
          </label>
        </div>

        {/* La cote reste EN BASE quel que soit le résultat — pour la seconde
            session, pour un recours. Ce que la circulaire écarte, c'est sa
            communication : les documents remis portent « NA ». */}
        {note !== '' && Number(note) < SEUIL && decision === 'reussi' && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
            Cote sous le seuil de {SEUIL}/20 avec une décision de réussite. C'est possible —
            le Conseil délibère — mais la décision devra être motivée.
          </div>
        )}

        {/* ── MOTIVATION, exigée acquis par acquis ────────────────────────── */}
        {!!nonMaitrises.length && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                            flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                Motivation — {nonMaitrises.length} acquis non maîtrisé(s)
              </span>
              {sansMotif > 0 && (
                <span className="text-[11.5px] text-amber-800 flex items-center gap-1">
                  <IconAlertTriangle size={13} /> {sansMotif} sans motivation
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {nonMaitrises.map(a => (
                <div key={a.aa_code} className="px-3 py-2">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-mono text-[11px] text-slate-500">{a.aa_code}</span>
                    <span className="text-[12.5px] flex-1">{a.description || a.cours_nom}</span>
                    <span className="text-[11.5px] font-semibold text-red-700">
                      {a.note == null ? '—' : String(a.note).replace('.', ',')}/20
                    </span>
                  </div>

                  <button type="button"
                    onClick={() => setOuvert(o => ({ ...o, [a.aa_code]: !o[a.aa_code] }))}
                    className="text-[11.5px] text-iip-blue underline mb-1">
                    {ouvert[a.aa_code] ? 'Masquer les motivations types' : 'Choisir des motivations types'}
                    {!!(coches[a.aa_code] || []).length && ` · ${(coches[a.aa_code] || []).length} cochée(s)`}
                  </button>

                  {ouvert[a.aa_code] && (
                    <div className="mb-2 border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {MOTIFS_ECHEC.map(g => (
                        <div key={g.cle} className="px-2.5 py-2">
                          <div className="text-[10.5px] uppercase tracking-wide font-semibold mb-1"
                            style={{ color: g.couleur }}>{g.libelle}</div>
                          <div className="space-y-1">
                            {g.motifs.map(m => {
                              const pris = (coches[a.aa_code] || []).includes(m.cle);
                              return (
                                <label key={m.cle} className="flex items-start gap-2 text-[12px] cursor-pointer">
                                  <input type="checkbox" checked={pris} className="mt-0.5"
                                    onChange={() => setCoches(c => {
                                      const act = c[a.aa_code] || [];
                                      return { ...c, [a.aa_code]: pris
                                        ? act.filter(x => x !== m.cle) : [...act, m.cle] };
                                    })} />
                                  <span className={pris ? 'text-slate-800' : 'text-slate-600'}>{m.texte}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!!(coches[a.aa_code] || []).length && !ouvert[a.aa_code] && (
                    <div className="mb-1 text-[11.5px] text-slate-600 bg-slate-50
                                    border border-slate-200 rounded-lg px-2 py-1.5">
                      {(coches[a.aa_code] || []).map(texteDuMotif).filter(Boolean).join(' ')}
                    </div>
                  )}

                  <textarea rows={2} value={motifs[a.aa_code] || ''}
                    onChange={ev => setMotifs(m => ({ ...m, [a.aa_code]: ev.target.value }))}
                    placeholder={(coches[a.aa_code] || []).length
                      ? 'Précisions propres à ce dossier — ce qui a été observé'
                      : "Motivation — ce qui n'est pas maîtrisé, et pourquoi"}
                    className={`w-full border rounded-lg px-2 py-1.5 text-[12px] ${
                      (coches[a.aa_code] || []).length || (motifs[a.aa_code] || '').trim()
                        ? 'border-slate-300' : 'border-amber-300 bg-amber-50/50'}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={enregistrer} disabled={enCours}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                       font-semibold rounded-lg disabled:opacity-50">
            <IconCheck size={15} />
            {enCours ? 'Enregistrement…' : 'Enregistrer la décision'}
          </button>
          {sansMotif > 0 && decision && decision !== 'reussi' && (
            <span className="text-[11.5px] text-amber-800">
              {sansMotif} acquis sans motivation : la décision sera enregistrée, mais elle
              restera attaquable tant qu'ils ne sont pas motivés.
            </span>
          )}
        </div>
      </div>
    </Cadre>
  );
}

/** Une UE du parcours, en petit. La couleur porte le résultat, l'infobulle le détail. */
function Badge({ i, courante = false, passe = false }) {
  return (
    <span title={`${i.ue_nom || ''}${i.points != null ? ` · ${i.points}/20` : ''}`
        + `${i.ects ? ` · ${i.ects} ECTS` : ''}${passe ? ` · ${i.annee_scolaire}` : ''}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11.5px]
        ${tonResultat(i.resultat)} ${courante ? 'ring-2 ring-iip-blue ring-offset-1' : ''}`}>
      <b>{i.ue_num}</b>
      {i.points != null && <span className="tabular-nums">{String(i.points).replace('.', ',')}</span>}
      {i.resultat && <span className="opacity-70">{LIB_RESULTAT[i.resultat] || i.resultat}</span>}
      {!i.resultat && <span className="opacity-50">en cours</span>}
    </span>
  );
}

/** La fenêtre : en-tête fixe, corps qui défile — comme les autres. */
function Cadre({ children, onClose, titre, sous }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={ev => ev.target === ev.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mt-8
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-none p-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              {titre || 'Tableau de bord de délibération'}
            </h3>
            {sous && <p className="text-[12px] text-slate-500">{sous}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

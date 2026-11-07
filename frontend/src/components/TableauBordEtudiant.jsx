import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { authHeaders, api } from '../lib/api.js';
import { Fenetre, EnteteCarte, Encadre, PastilleEtat } from './ui.jsx';
import { MOTIFS_ECHEC, texteDuMotif, composerMotif, decomposerMotif } from './motifsEchec.js';
import { ouvrirApercu } from '../lib/apercu.js';

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
  { cle: 'reussi',  libelle: 'Réussi',   ton: 'var(--c-reussi)' },
  { cle: 'ajourne', libelle: 'Ajourné',  ton: 'var(--c-attente)' },
  { cle: 'refuse',  libelle: 'Refusé',   ton: 'var(--c-refuse)' },
  { cle: 'absent',  libelle: 'Absent',   ton: 'rgb(var(--gris-400))' },
];

// Une note se lit d'un coup d'œil : la couleur porte l'information, le chiffre
// la précise.
// Une note est une PASTILLE PLEINE (lib/etats.js) : l'état de la couleur réglée, le chiffre en blanc.
const tonNote = n => n == null ? 'neutre'
  : n >= 14 ? 'reussi'
  : n >= SEUIL ? 'disponible'
  : n >= 8 ? 'surveiller'
  : 'corriger';

const tonResultat = r => ({
  reussi: 'reussi', ajourne: 'surveiller', refuse: 'corriger', absent: 'neutre',
}[r] || 'neutre');

const LIB_RESULTAT = { reussi: 'Réussi', ajourne: 'Ajourné', refuse: 'Refusé', absent: 'Absent' };

export default function TableauBordEtudiant({ etudId, ueNum, annee, onClose, onDecide }) {
  const [detail, setDetail] = useState(null);   // acquis de l'unité
  const [bilan, setBilan] = useState(null);     // parcours, moyenne, crédits
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  const [decision, setDecision] = useState(null);
  // LA COTE NE SE SAISIT PLUS ICI. Elle vient du calcul de délibération, ou de
  // la décision que le Conseil y a prise. La ressaisir, c'était ouvrir la porte
  // à deux chiffres divergents pour la même unité.
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
      setDecision(d.resultat || d.decision_proposee || null);
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
                               resultat: decision,
                               // La cote délibérée, telle quelle.
                               points: detail?.note_deliberee ?? null }),
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

  if (erreur) return <Cadre onClose={onClose}><Encadre etat="corriger">{erreur}</Encadre></Cadre>;
  if (!detail || !bilan) return <Cadre onClose={onClose}><div className="py-8 text-center text-slate-400 text-sm">Chargement…</div></Cadre>;

  const e = bilan.etudiant;
  const ects = bilan.ects;
  const total = ects.total_section || 0;
  const pc = v => total ? Math.max(0, Math.min(100, (v / total) * 100)) : 0;

  return (
    <Cadre onClose={onClose}
      titre={`${(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim()}
      sous={`UE ${ueNum} · ${e.section || '—'} · ${annee}`}
      pied={<>
        <span className="text-second" style={{ color: 'var(--c-attente)' }}>
          {sansMotif > 0 && decision && decision !== 'reussi' && (<>
            {sansMotif} acquis sans motivation : la décision sera enregistrée, mais elle
            restera attaquable tant qu'ils ne sont pas motivés.
          </>)}
        </span>
        <button onClick={enregistrer} disabled={enCours}
          className="bouton bouton-fort inline-flex items-center gap-1.5">
          <IconCheck size={15} />
          {enCours ? 'Enregistrement…' : 'Enregistrer la décision'}
        </button>
      </>}>

      {message && (
        <div className="bloc-etat px-3 py-2 text-sm" data-etat={message.type === 'ok' ? 'reussi' : 'corriger'}>{message.texte}</div>
      )}

      {/* ── IDENTITÉ ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-second text-slate-600">
        {e.id_ecampus && <span>Matricule <b>{e.id_ecampus}</b></span>}
        {e.date_naissance && <span>Né(e) le <b>{e.date_naissance}</b></span>}
        {e.email_ecole && <span className="text-slate-400">{e.email_ecole}</span>}
      </div>

      {/* ── CRÉDITS : la jauge ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="intertitre">
            Crédits de la section {ects.section || ''}
          </span>
          <span className="text-second text-slate-600">
            <b style={{ color: 'var(--c-reussi)' }}>{ects.acquis}</b> acquis ·
            {' '}<b style={{ color: 'var(--c-disponible)' }}>{ects.programme}</b> au programme ·
            {' '}<b className="text-slate-400">{ects.restant}</b> à venir ·
            {' '}sur <b>{total || '—'}</b>
          </span>
        </div>
        <div className="h-4 rounded-full overflow-hidden flex" style={{ background: 'rgb(var(--gris-100))' }}>
          <div style={{ width: `${pc(ects.acquis)}%`, background: 'var(--c-reussi)' }} title={`${ects.acquis} ECTS acquis`} />
          <div style={{ width: `${pc(ects.programme)}%`, background: 'var(--c-disponible)' }} title={`${ects.programme} ECTS au programme`} />
        </div>
        {/* Le total se SOMME au référentiel : aucun total n'est stocké. S'il ne
            tombe pas rond, c'est le référentiel qui est incomplet — mieux vaut
            le dire que d'afficher une jauge fausse sans le signaler. */}
        {!total && (
          <p className="mt-1 text-second flex items-center gap-1" style={{ color: 'var(--c-attente)' }}>
            <IconAlertTriangle size={13} /> Aucun ECTS au référentiel de cette section : la jauge ne peut rien situer.
          </p>
        )}
      </div>

      {/* ── MOYENNE ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-6 border-t border-slate-200 pt-3">
        <div>
          <div className="intertitre">
            Moyenne de l'année
          </div>
          <div className={`text-2xl font-bold leading-tight ${
            bilan.moyenne == null ? 'text-slate-300'
              : bilan.moyenne >= SEUIL ? 'text-iip-blue' : ''}`}
            style={bilan.moyenne != null && bilan.moyenne < SEUIL ? { color: 'var(--c-refuse)' } : undefined}>
            {bilan.moyenne == null ? '—' : `${String(bilan.moyenne).replace('.', ',')}/20`}
          </div>
          <div className="text-xs text-slate-400">pondérée par les périodes du dossier pédagogique</div>
        </div>
        <div>
          <div className="intertitre">
            Unités de l'année
          </div>
          <div className="text-base font-bold text-slate-700">
            {bilan.cette_annee.filter(i => i.resultat === 'reussi').length}
            <span className="text-slate-400"> / {bilan.cette_annee.length} réussies</span>
          </div>
        </div>
        {/* Une unité notée mais sans périodes au référentiel n'entre pas dans la
            pondération : la moyenne serait juste en apparence et fausse en
            silence. */}
        {bilan.moyenne_sans_ponderation > 0 && (
          <div className="text-second flex items-start gap-1 max-w-sm" style={{ color: 'var(--c-attente)' }}>
            <IconAlertTriangle size={13} className="mt-0.5 flex-none" />
            {bilan.moyenne_sans_ponderation} unité(s) notée(s) sans périodes au référentiel :
            elles ne pèsent pas dans la moyenne.
          </div>
        )}
      </div>

      {/* ── LE PARCOURS, en badges ───────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-3">
        <div className="intertitre mb-1.5">
          Programme de l'année
        </div>
        <div className="flex flex-wrap gap-1.5">
          {bilan.cette_annee.map(i => (
            <Badge key={i.ue_num} i={i} courante={i.ue_num === ueNum} />
          ))}
          {!bilan.cette_annee.length && <span className="text-second text-slate-400">Aucune inscription cette année.</span>}
        </div>

        {!!bilan.anterieures.length && (
          <>
            <div className="intertitre mt-3 mb-1.5">
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
          <div className="mt-2 text-second text-slate-600">
            {bilan.valorisations.length} valorisation(s) :
            {' '}{bilan.valorisations.map(v => `UE ${v.ue_num}`).join(' · ')}
          </div>
        )}
      </div>

      {/* ── L'UNITÉ EN DÉLIBÉRATION ──────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-3">
        <div className="intertitre mb-1.5">
          UE {ueNum} — acquis d'apprentissage, par cours
        </div>
        <div className="carte overflow-hidden divide-y divide-slate-100">
          {parCours.map(co => (
            <div key={co.cours_code || '—'} className="px-3 py-2">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-mono text-xs text-slate-500">{co.cours_code || '—'}</span>
                <span className="text-sm font-semibold text-slate-700">{co.cours_nom || 'Cours non rattaché'}</span>
              </div>
              <div className="space-y-1">
                {co.aas.map(a => (
                  <div key={a.aa_code} className="flex items-center gap-2 text-second">
                    <PastilleEtat etat={tonNote(a.note)} className="min-w-[2.25rem] justify-center tabular-nums !text-second">
                      {a.note == null ? '—' : String(a.note).replace('.', ',')}
                    </PastilleEtat>
                    <span className="font-mono text-xs text-slate-400 w-20 flex-none truncate">{a.aa_code}</span>
                    <span className="flex-1 text-slate-700">{a.description || ''}</span>
                    {a.non_evalue && <span className="text-xs text-slate-400">non évalué</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!parCours.length && (
            <div className="px-3 py-4 text-sm text-slate-400">
              Aucun acquis au référentiel de cette unité.
            </div>
          )}
        </div>
        <p className="mt-1 text-second text-slate-500">
          {detail.nb_non_maitrises} acquis non maîtrisé(s) · {detail.nb_non_evalues} non évalué(s).
          Une absence d'évaluation n'est pas un échec.
        </p>
      </div>

      {/* ── LA DÉCISION ──────────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-3 space-y-2">
        <div className="intertitre">
          Décision du Conseil des études
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DECISIONS.map(d => (
            <button key={d.cle} type="button" onClick={() => setDecision(d.cle)}
              style={decision === d.cle ? { background: d.ton, borderColor: d.ton, color: '#fff' } : undefined}
              className="bouton">
              {d.libelle}
            </button>
          ))}
          {/* La cote est CELLE DE LA DÉLIBÉRATION : calculée, ou fixée au seuil
              par une faveur. Elle se lit, elle ne se ressaisit pas. */}
          <span className="ml-2 flex items-center gap-1.5 text-second text-slate-600">
            Cote délibérée
            <b className={`text-base tabular-nums ${
              detail?.ue_na ? 'text-slate-500' : ''}`}
              style={detail?.ue_na ? undefined : { color: detail?.ue_faveur ? 'var(--c-faveur)'
                : (detail?.note_deliberee ?? 0) < SEUIL ? 'var(--c-refuse)' : 'var(--c-reussi)' }}>
              {detail?.ue_na ? 'NA'
                : detail?.note_deliberee == null ? '—'
                : String(detail.note_deliberee).replace('.', ',')}
            </b>
            {!detail?.ue_na && detail?.note_deliberee != null && (
              <span className="text-slate-400">/20</span>
            )}
            {detail?.ue_faveur && (
              <PastilleEtat etat="faveur">faveur</PastilleEtat>
            )}
          </span>
        </div>

        <p className="text-xs text-slate-500">
          La cote vient de la délibération — du calcul, ou du seuil qu'impose une
          faveur. Elle se change dans la feuille de délibération, en ajustant les
          acquis ou les cours, non ici.
        </p>

        {/* La cote reste EN BASE quel que soit le résultat — pour la seconde
            session, pour un recours. Ce que la circulaire écarte, c'est sa
            communication : les documents remis portent « NA ». */}
        {detail?.note_deliberee != null && detail.note_deliberee < SEUIL
          && decision === 'reussi' && (
          <div className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">
            Cote délibérée sous le seuil de {SEUIL}/20 avec une décision de réussite.
            C'est possible — le Conseil délibère — mais la décision devra être motivée,
            et une faveur porterait l'unité à exactement {SEUIL}.
          </div>
        )}

        {/* ── MOTIVATION, exigée acquis par acquis ────────────────────────── */}
        {!!nonMaitrises.length && (
          <div className="carte overflow-hidden">
            <EnteteCarte titre={`Motivation — ${nonMaitrises.length} acquis non maîtrisé(s)`}>
              {sansMotif > 0 && (
                <span className="text-second flex items-center gap-1" style={{ color: 'var(--c-attente)' }}>
                  <IconAlertTriangle size={13} /> {sansMotif} sans motivation
                </span>
              )}
            </EnteteCarte>
            <div className="divide-y divide-slate-100">
              {nonMaitrises.map(a => (
                <div key={a.aa_code} className="px-3 py-2">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{a.aa_code}</span>
                    <span className="text-sm flex-1">{a.description || a.cours_nom}</span>
                    <span className="text-second font-semibold" style={{ color: 'var(--c-refuse)' }}>
                      {a.note == null ? '—' : String(a.note).replace('.', ',')}/20
                    </span>
                  </div>

                  <button type="button"
                    onClick={() => setOuvert(o => ({ ...o, [a.aa_code]: !o[a.aa_code] }))}
                    className="text-second text-iip-blue underline mb-1">
                    {ouvert[a.aa_code] ? 'Masquer les motivations types' : 'Choisir des motivations types'}
                    {!!(coches[a.aa_code] || []).length && ` · ${(coches[a.aa_code] || []).length} cochée(s)`}
                  </button>

                  {ouvert[a.aa_code] && (
                    <div className="carte overflow-hidden mb-2 divide-y divide-slate-100">
                      {MOTIFS_ECHEC.map(g => (
                        <div key={g.cle} className="px-2.5 py-2">
                          <div className="intertitre mb-1"
                            style={{ color: g.couleur }}>{g.libelle}</div>
                          <div className="space-y-1">
                            {g.motifs.map(m => {
                              const pris = (coches[a.aa_code] || []).includes(m.cle);
                              return (
                                <label key={m.cle} className="flex items-start gap-2 text-second cursor-pointer">
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
                    <div className="carte mb-1 text-second text-slate-600 px-2 py-1.5">
                      {(coches[a.aa_code] || []).map(texteDuMotif).filter(Boolean).join(' ')}
                    </div>
                  )}

                  <textarea rows={2} value={motifs[a.aa_code] || ''}
                    onChange={ev => setMotifs(m => ({ ...m, [a.aa_code]: ev.target.value }))}
                    placeholder={(coches[a.aa_code] || []).length
                      ? 'Précisions propres à ce dossier — ce qui a été observé'
                      : "Motivation — ce qui n'est pas maîtrisé, et pourquoi"}
                    style={(coches[a.aa_code] || []).length || (motifs[a.aa_code] || '').trim()
                      ? undefined : { borderColor: 'var(--c-attente)', borderLeftWidth: 4 }}
                    className="w-full border border-slate-300 rounded-lg bg-white px-2 py-1.5 text-second" />
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </Cadre>
  );
}

/** Une UE du parcours, en petit. La couleur porte le résultat, l'infobulle le détail.
 *
 * Le badge ouvre le descriptif de l'unité (DUE) : c'est le document qu'on tend
 * à l'étudiant qui demande ce qu'on attend de lui dans cette unité, et il était
 * jusqu'ici introuvable ailleurs que dans un Word du secrétariat. */
function Badge({ i, courante = false, passe = false }) {
  async function ouvrirDUE() {
    try {
      const j = await api.dueDocument(i.ue_num);
      ouvrirApercu({
        html: j.html, titre: `Descriptif de l'unité ${i.ue_num}`, sousTitre: i.ue_nom || undefined,
        nomFichier: `DUE_UE${i.ue_num}`, envoiPossible: false, astuceImpression: 'A4 portrait',
      });
    } catch { /* pas de descriptif accessible pour cette unité */ }
  }
  return (
    <span onClick={ouvrirDUE} role="button" tabIndex={0}
      onKeyDown={ev => ev.key === 'Enter' && ouvrirDUE()}
      title={`${i.ue_nom || ''}${i.points != null ? ` · ${i.points}/20` : ''}`
        + `${i.ects ? ` · ${i.ects} ECTS` : ''}${passe ? ` · ${i.annee_scolaire}` : ''}`
        + ' — cliquer pour le descriptif de l’unité'}
      data-etat={tonResultat(i.resultat)}
      className={`pastille-etat !text-second !px-2 !py-0.5 cursor-pointer hover:brightness-95
        ${courante ? 'ring-2 ring-iip-blue ring-offset-1' : ''}`}>
      <b>{i.ue_num}</b>
      {i.points != null && <span className="tabular-nums">{String(i.points).replace('.', ',')}</span>}
      {i.resultat && <span className="opacity-70">{LIB_RESULTAT[i.resultat] || i.resultat}</span>}
      {!i.resultat && <span className="opacity-50">en cours</span>}
    </span>
  );
}

/** La fenêtre : en-tête fixe, corps qui défile — la fenêtre commune. */
function Cadre({ children, onClose, titre, sous, pied = null }) {
  return (
    <Fenetre titre={titre || 'Tableau de bord de délibération'} sous={sous}
      large="grande" pied={pied} onFermer={onClose}>
      <div className="space-y-4">{children}</div>
    </Fenetre>
  );
}

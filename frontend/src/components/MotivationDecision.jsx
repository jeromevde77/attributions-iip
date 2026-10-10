import { useEffect, useState } from 'react';
import {
  IconDeviceFloppy, IconAlertTriangle, IconPrinter,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';
import { MOTIFS_ECHEC, texteDuMotif, composerMotif, decomposerMotif } from './motifsEchec.js';
import { ouvrirApercu } from '../lib/apercu.js';

/**
 * Motivation d'une décision d'ajournement ou de refus.
 *
 * Annexes 8 et 9 de la circulaire « Sanction des études ». Ce ne sont pas des
 * attestations mais des MOTIVATIONS : leur cœur est un tableau où chaque acquis
 * non maîtrisé reçoit sa justification. Une décision non motivée est attaquable.
 *
 * Les acquis étant encodés un à un, l'échec se DÉDUIT des notes : rien à
 * cocher, seul le motif reste à écrire.
 */
export default function MotivationDecision({ etudId, annee, onClose }) {
  // L'unité se choisit ici : seules celles en échec appellent une motivation,
  // autant ne proposer qu'elles.
  const [ues, setUes] = useState(null);
  const [ueNum, setUeNum] = useState(null);
  const [donnees, setDonnees] = useState(null);
  // Motivation d'un acquis = des énoncés COCHÉS dans le catalogue, plus des
  // précisions écrites à la main. La base ne connaît qu'une chaîne : on
  // compose à l'enregistrement, on décompose à la relecture.
  const [coches, setCoches] = useState({});   // aa_code → [clés d'énoncés]
  const [motifs, setMotifs] = useState({});   // aa_code → précisions libres
  const [catalogueOuvert, setCatalogueOuvert] = useState({});
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch(`/api/acquis/echecs/${etudId}?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
        return r.json();
      })
      .then(j => {
        setUes(j.unites || []);
        // Une seule unité en échec : on ouvre directement, sans choix inutile.
        if (j.unites?.length === 1) setUeNum(j.unites[0].ue_num);
      })
      .catch(e => { setUes([]); setMessage({ type: 'err', texte: String(e.message) }); });
  }, [etudId, annee]);

  useEffect(() => {
    if (!ueNum) return;
    setDonnees(null);
    fetch(`/api/acquis/motivation/${etudId}/${ueNum}?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) { setMessage({ type: 'err', texte: j.error }); return; }
        setDonnees(j);
        const dec = j.acquis.map(a => [a.aa_code, decomposerMotif(a.motif || '')]);
        setCoches(Object.fromEntries(dec.map(([c, d]) => [c, d.cles])));
        setMotifs(Object.fromEntries(dec.map(([c, d]) => [c, d.libre])));
      }).catch(e => setMessage({ type: 'err', texte: e.message }));
  }, [etudId, ueNum, annee]);

  /**
   * La route renvoie du JSON, non une page : l'ouvrir directement affichait du
   * code. On récupère le HTML et on l'imprime dans une fenêtre dédiée — Safari
   * imprime le document parent si l'on passe par un cadre.
   */
  async function produireDocument() {
    setEnCours(true); setMessage(null);
    try {
      const rep = await fetch(
        `/api/acquis/motivation/${etudId}/${ueNum}/document`
        + `?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      ouvrirApercu({
        html: j.html,
        titre: 'Motivation de la décision',
        sousTitre: `UE ${ueNum} · ${annee}`,
        nomFichier: `Motivation_UE${ueNum}_${annee}`,
        destinataire: { type: 'etudiant', id: etudId },
        typeDoc: 'motivation', astuceImpression: 'A4 portrait',
      });
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally { setEnCours(false); }
  }

  async function enregistrer() {
    setEnCours(true); setMessage(null);
    try {
      const rep = await fetch('/api/acquis/motivation', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee,
                               ue_num: ueNum,
                               motifs: Object.fromEntries(donnees.acquis.map(a =>
                                 [a.aa_code, composerMotif(coches[a.aa_code], motifs[a.aa_code])])) }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setMessage({ type: 'ok', texte: 'Motivations enregistrées.' });
    } finally { setEnCours(false); }
  }

  // Le choix de l'unité, tant qu'elle n'est pas faite.
  if (!ueNum) {
    return (
      <Fenetre titre={`Motiver une décision · ${annee}`} large="petite" onFermer={onClose}>
          {!ues ? (
            <p className="text-sm text-slate-400 py-4 text-center">Chargement…</p>
          ) : !ues.length ? (
            <p className="text-sm text-slate-500 py-4 text-center border-2
                          border-dashed rounded-xl">
              Aucune unité en refus ou ajournement pour cet étudiant en {annee}.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {ues.map(u => (
                <button key={u.ue_num} onClick={() => setUeNum(u.ue_num)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left
                             text-sm hover:bg-slate-50">
                  <span className="font-mono text-xs text-slate-500 w-10">{u.ue_num}</span>
                  <span className="flex-1 truncate">{u.ue_nom}</span>
                  <span className={`text-xs font-semibold ${
                    u.resultat === 'refuse' ? 'text-red-700' : 'text-amber-700'}`}>
                    {u.resultat === 'refuse' ? 'Refus' : 'Ajournement'}
                  </span>
                </button>
              ))}
            </div>
          )}
      </Fenetre>
    );
  }

  if (!donnees) {
    return (
      <Fenetre titre="Motivation d'une décision" large="petite" onFermer={onClose}>
        <div className="text-sm text-slate-500">Chargement…</div>
      </Fenetre>
    );
  }

  const nonMaitrises = donnees.acquis.filter(a => a.non_maitrise);
  const sansMotif = nonMaitrises.filter(a =>
    !(coches[a.aa_code] || []).length && !(motifs[a.aa_code] || '').trim()).length;
  const estRefus = donnees.resultat === 'refuse';

  return (
    <Fenetre large="moyenne" onFermer={onClose}
      titre={`Motivation d'une décision ${estRefus ? 'de refus' : "d'ajournement"}`}
      sous={`UE ${ueNum} · ${annee} · annexe ${estRefus ? '9' : '8'} de la circulaire Sanction des études`}
      pied={<>
        <span />
        <button onClick={produireDocument}
          disabled={!nonMaitrises.length || sansMotif > 0}
          title={sansMotif > 0
            ? 'Motivez chaque acquis avant de produire le document'
            : 'Produire le document réglementaire'}
          className="bouton bouton-sortir inline-flex items-center gap-1.5">
          <IconPrinter size={15} /> Produire le document
        </button>
        <button onClick={enregistrer} disabled={enCours || !nonMaitrises.length}
          className="bouton bouton-fort inline-flex items-center gap-1.5">
          <IconDeviceFloppy size={15} />
          {enCours ? 'Enregistrement…' : 'Enregistrer les motivations'}
        </button>
      </>}>
        <div className="space-y-4">

        {message && (
          <div className={`px-3 py-2 rounded-lg text-sm ${
            message.type === 'err' ? 'bg-red-500 border border-red-500 text-white'
              : 'bg-emerald-500 border border-emerald-500 text-white'}`}>
            {message.texte}
          </div>
        )}

        {/* Une décision non motivée est attaquable : on le dit avant, pas après. */}
        {sansMotif > 0 && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                          text-second text-amber-900">
            <div className="flex items-center gap-1.5 font-semibold">
              <IconAlertTriangle size={14} />
              {sansMotif} acquis non maîtrisé(s) sans motivation
            </div>
            La circulaire exige une justification par acquis. Une décision non motivée
            peut être contestée en recours.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Décision', donnees.resultat || '—'],
            ['Non maîtrisés', donnees.nb_non_maitrises],
            ['Non évalués', donnees.nb_non_evalues],
            ['Seuil', `${donnees.seuil}/20`]].map(([l, v]) => (
            <div key={l} className="border border-slate-200 rounded-xl px-3 py-2">
              <div className="text-mention uppercase tracking-wide text-slate-500
                              font-semibold">{l}</div>
              <div className="text-base font-bold text-iip-blue">{v}</div>
            </div>
          ))}
        </div>

        {!nonMaitrises.length ? (
          <div className="py-6 text-center text-sm text-slate-500 border-2
                          border-dashed rounded-xl">
            Aucun acquis en échec pour cette unité. Une motivation de refus n'a
            pas lieu d'être — vérifiez la décision encodée.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                            text-xs uppercase tracking-wide text-slate-500 font-semibold">
              Acquis d'apprentissage non maîtrisés · motivation
            </div>
            <div className="divide-y divide-slate-100">
              {nonMaitrises.map(a => (
                <div key={a.aa_code} className="px-3 py-2">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{a.aa_code}</span>
                    <span className="text-sm flex-1">{a.description || a.cours_nom}</span>
                    <span className="text-second font-semibold text-red-700">
                      {a.note}/20
                    </span>
                  </div>
                  {/* Le CATALOGUE : des énoncés qui se rapportent à l'acquis,
                      jamais à l'étudiant. On en coche un ou plusieurs, puis on
                      précise en toutes lettres — deux motivations identiques
                      mot pour mot sur deux dossiers s'affaiblissent l'une
                      l'autre. */}
                  <button type="button"
                    onClick={() => setCatalogueOuvert(o => ({ ...o, [a.aa_code]: !o[a.aa_code] }))}
                    className="text-second text-iip-blue underline mb-1">
                    {catalogueOuvert[a.aa_code] ? 'Masquer les motivations types' : 'Choisir des motivations types'}
                    {!!(coches[a.aa_code] || []).length &&
                      ` · ${(coches[a.aa_code] || []).length} cochée(s)`}
                  </button>

                  {catalogueOuvert[a.aa_code] && (
                    <div className="mb-2 border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {MOTIFS_ECHEC.map(g => (
                        <div key={g.cle} className="px-2.5 py-2">
                          <div className="text-xs uppercase tracking-wide font-semibold mb-1"
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

                  {!!(coches[a.aa_code] || []).length && !catalogueOuvert[a.aa_code] && (
                    <div className="mb-1 text-second text-slate-600 bg-slate-50
                                    border border-slate-200 rounded-lg px-2 py-1.5">
                      {(coches[a.aa_code] || []).map(texteDuMotif).filter(Boolean).join(' ')}
                    </div>
                  )}

                  {/* CE QUI PARTIRA SI PERSONNE N'ÉCRIT RIEN. La proposition
                      s'affiche en gris parce qu'elle n'est pas encore une
                      motivation : rien n'est enregistré tant qu'on n'y a pas
                      touché. Un clic la reprend dans la zone de texte, où elle
                      devient modifiable — et elle cesse alors d'être « restée
                      telle que proposée » au moment de clôturer. */}
                  {a.motif_propose && !(coches[a.aa_code] || []).length
                    && !(motifs[a.aa_code] || '').trim() && (
                    <button type="button"
                      onClick={() => setMotifs(m => ({ ...m, [a.aa_code]: a.motif_propose }))}
                      title="Reprendre cet énoncé pour le compléter ou le corriger"
                      className="w-full text-left mb-1 px-2 py-1.5 rounded-lg border
                                 border-dashed border-slate-300 bg-slate-50 whitespace-pre-line
                                 text-second text-slate-400 italic hover:text-slate-600
                                 hover:border-slate-400">
                      {a.motif_propose}
                      <span className="block mt-0.5 not-italic text-mention text-slate-400">
                        {a.motif_source === 'enseignant' ? 'Rédigé par l’enseignant avec sa note' : 'Proposé'} — rien n'est enregistré. Cliquez pour le reprendre.
                      </span>
                    </button>
                  )}

                  <textarea rows={2} value={motifs[a.aa_code] || ''}
                    onChange={e => setMotifs(m => ({ ...m, [a.aa_code]: e.target.value }))}
                    placeholder={(coches[a.aa_code] || []).length
                      ? "Précisions propres à ce dossier — ce qui a été observé"
                      : "Motivation — ce qui n'est pas maîtrisé, et pourquoi"}
                    className={`w-full border rounded-lg px-2 py-1.5 text-second
                      ${(coches[a.aa_code] || []).length || (motifs[a.aa_code] || '').trim()
                        ? 'border-slate-300' : 'border-amber-300 bg-amber-50/50'}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {donnees.nb_non_evalues > 0 && (
          <p className="text-second text-slate-500">
            {donnees.nb_non_evalues} acquis non évalué(s) : ils ne figurent pas ci-dessus.
            Une absence d'évaluation n'est pas un échec et ne peut motiver un refus.
          </p>
        )}
        </div>
    </Fenetre>
  );
}

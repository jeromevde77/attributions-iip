import { useEffect, useState } from 'react';
import {
  IconX, IconDeviceFloppy, IconAlertTriangle, IconPrinter,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

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
  const [motifs, setMotifs] = useState({});
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
        setMotifs(Object.fromEntries(j.acquis.map(a => [a.aa_code, a.motif || ''])));
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
      const w = window.open('', '_blank');
      if (!w) {
        setMessage({ type: 'err', texte: 'Fenêtre bloquée. Autorisez les fenêtres surgissantes.' });
        return;
      }
      w.document.open(); w.document.write(j.html); w.document.close();
      let lance = false;
      const lancer = () => { if (lance) return; lance = true; w.focus(); w.print(); };
      w.onload = lancer;
      setTimeout(lancer, 500);
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
                               ue_num: ueNum, motifs }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setMessage({ type: 'ok', texte: 'Motivations enregistrées.' });
    } finally { setEnCours(false); }
  }

  // Le choix de l'unité, tant qu'elle n'est pas faite.
  if (!ueNum) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-16 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Motiver une décision · {annee}
            </h3>
            <button onClick={onClose} className="text-slate-400"><IconX size={18} /></button>
          </div>
          {!ues ? (
            <p className="text-[12.5px] text-slate-400 py-4 text-center">Chargement…</p>
          ) : !ues.length ? (
            <p className="text-[12.5px] text-slate-500 py-4 text-center border-2
                          border-dashed rounded-xl">
              Aucune unité en refus ou ajournement pour cet étudiant en {annee}.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {ues.map(u => (
                <button key={u.ue_num} onClick={() => setUeNum(u.ue_num)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left
                             text-[12.5px] hover:bg-slate-50">
                  <span className="font-mono text-[11px] text-slate-500 w-10">{u.ue_num}</span>
                  <span className="flex-1 truncate">{u.ue_nom}</span>
                  <span className={`text-[11px] font-semibold ${
                    u.resultat === 'refuse' ? 'text-red-700' : 'text-amber-700'}`}>
                    {u.resultat === 'refuse' ? 'Refus' : 'Ajournement'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!donnees) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 mt-20 text-[13px] text-slate-500">
          Chargement…
        </div>
      </div>
    );
  }

  const nonMaitrises = donnees.acquis.filter(a => a.non_maitrise);
  const sansMotif = nonMaitrises.filter(a => !(motifs[a.aa_code] || '').trim()).length;
  const estRefus = donnees.resultat === 'refuse';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8 max-h-[88vh] overflow-hidden flex flex-col">

        <div className="flex-none p-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              Motivation d'une décision {estRefus ? 'de refus' : "d'ajournement"}
            </h3>
            <p className="text-[12px] text-slate-500">
              UE {ueNum} · {annee} · annexe {estRefus ? '9' : '8'} de la circulaire
              Sanction des études
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {message && (
          <div className={`px-3 py-2 rounded-lg text-[12.5px] ${
            message.type === 'err' ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {message.texte}
          </div>
        )}

        {/* Une décision non motivée est attaquable : on le dit avant, pas après. */}
        {sansMotif > 0 && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                          text-[12px] text-amber-900">
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
              <div className="text-[10px] uppercase tracking-wide text-slate-500
                              font-semibold">{l}</div>
              <div className="text-[15px] font-bold text-iip-blue">{v}</div>
            </div>
          ))}
        </div>

        {!nonMaitrises.length ? (
          <div className="py-6 text-center text-[12.5px] text-slate-500 border-2
                          border-dashed rounded-xl">
            Aucun acquis en échec pour cette unité. Une motivation de refus n'a
            pas lieu d'être — vérifiez la décision encodée.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                            text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Acquis d'apprentissage non maîtrisés · motivation
            </div>
            <div className="divide-y divide-slate-100">
              {nonMaitrises.map(a => (
                <div key={a.aa_code} className="px-3 py-2">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-mono text-[11px] text-slate-500">{a.aa_code}</span>
                    <span className="text-[12.5px] flex-1">{a.description || a.cours_nom}</span>
                    <span className="text-[11.5px] font-semibold text-red-700">
                      {a.note}/20
                    </span>
                  </div>
                  <textarea rows={2} value={motifs[a.aa_code] || ''}
                    onChange={e => setMotifs(m => ({ ...m, [a.aa_code]: e.target.value }))}
                    placeholder="Motivation — ce qui n'est pas maîtrisé, et pourquoi"
                    className={`w-full border rounded-lg px-2 py-1.5 text-[12px]
                      ${(motifs[a.aa_code] || '').trim()
                        ? 'border-slate-300' : 'border-amber-300 bg-amber-50/50'}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {donnees.nb_non_evalues > 0 && (
          <p className="text-[11.5px] text-slate-500">
            {donnees.nb_non_evalues} acquis non évalué(s) : ils ne figurent pas ci-dessus.
            Une absence d'évaluation n'est pas un échec et ne peut motiver un refus.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button onClick={enregistrer} disabled={enCours || !nonMaitrises.length}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                       font-semibold rounded-lg disabled:opacity-40">
            <IconDeviceFloppy size={15} />
            {enCours ? 'Enregistrement…' : 'Enregistrer les motivations'}
          </button>
          <button onClick={produireDocument}
            disabled={!nonMaitrises.length || sansMotif > 0}
            title={sansMotif > 0
              ? 'Motivez chaque acquis avant de produire le document'
              : 'Produire le document réglementaire'}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-iip-blue
                       text-iip-blue font-semibold rounded-lg disabled:opacity-40">
            <IconPrinter size={15} /> Produire le document
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

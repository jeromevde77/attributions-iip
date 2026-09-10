import { useRef, useState } from 'react';
import { IconTableExport, IconTableImport, IconCheck, IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { telechargerClasseur, lireClasseurNotes } from '../lib/classeurNotes.js';

/**
 * LE CLASSEUR QUI PART CHEZ LE PROFESSEUR, ET QUI REVIENT.
 *
 * Tous les professeurs n'encodent pas à l'écran : certains corrigent chez eux,
 * d'autres n'ouvrent Lucie qu'une fois l'an. Le secrétariat recopiait alors des
 * colonnes entières à la main — c'est là qu'on décale une ligne et qu'on donne
 * à quelqu'un la note de son voisin.
 *
 * RIEN NE S'ÉCRIT SANS QU'ON AIT VU CE QUI SERA ÉCRIT. Le fichier revenu est
 * relu, rapproché, et présenté avant d'être appliqué — avec ce qui n'a pas été
 * compris, dit franchement plutôt que passé sous silence.
 */
export default function ClasseurNotes({
  ueNum, ueNom, annee, session, colonnes, etudiants, note, mention, ferme, onImporte,
}) {
  const fichierRef = useRef(null);
  const [enCours, setEnCours] = useState(false);
  const [lu, setLu] = useState(null);       // ce que le fichier contient
  const [apercu, setApercu] = useState(null); // ce que le serveur en ferait
  const [erreur, setErreur] = useState('');

  const nomFichier = () => {
    const s = session === 2 ? 'S2' : 'S1';
    const a = String(annee || '').replace('-', '');
    return `Notes_UE${ueNum}_${s}_${a}.xlsx`;
  };

  const exporter = async () => {
    setEnCours(true); setErreur('');
    try {
      await telechargerClasseur({
        colonnes, etudiants, note, mention, ferme,
        ue_num: ueNum, ue_nom: ueNom, annee, session,
        titre: `UE ${ueNum}${ueNom ? ` — ${ueNom}` : ''}`,
      }, nomFichier());
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const relire = async (fichier) => {
    setEnCours(true); setErreur(''); setLu(null); setApercu(null);
    try {
      const r = await lireClasseurNotes(fichier);
      if (!r.lignes.length) {
        throw new Error('Aucune note lue dans ce classeur. Les cases sont-elles '
          + 'remplies, et est-ce bien le fichier exporté depuis Lucie ?');
      }
      setLu(r);
      // La simulation dit ce que le serveur ferait — qui il reconnaît, quels
      // acquis il ne connaît pas — avant que rien ne soit écrit.
      const rep = await fetch(`/api/acquis/ue/${ueNum}/notes/importer`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, lignes: r.lignes, simulation: true }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'relecture impossible');
      setApercu(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const appliquer = async () => {
    setEnCours(true); setErreur('');
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/notes/importer`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, lignes: lu.lignes, simulation: false }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'import impossible');
      setLu(null); setApercu(null);
      await onImporte?.();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  return (
    <>
      <input ref={fichierRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) relire(f); }} />
      <button onClick={exporter} disabled={enCours || !colonnes?.length}
        title="Exporter la grille en classeur, pour que le professeur la complète"
        className="px-2.5 py-1.5 text-[12px] rounded-lg border border-slate-300
                   text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
        <IconTableExport size={14} /> Exporter
      </button>
      <button onClick={() => fichierRef.current?.click()} disabled={enCours}
        title="Relire un classeur rempli et en reprendre les notes"
        className="px-2.5 py-1.5 text-[12px] rounded-lg border border-slate-300
                   text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
        <IconTableImport size={14} /> Importer
      </button>

      {(erreur || apercu) && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60] p-4"
          onClick={e => e.target === e.currentTarget && (setApercu(null), setErreur(''))}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mt-20
                          max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                            justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-iip-blue">
                Classeur relu — UE {ueNum}
              </h3>
              <button onClick={() => { setApercu(null); setErreur(''); setLu(null); }}
                className="text-slate-400 hover:text-slate-600"><IconX size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 text-[12.5px]">
              {erreur && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                                text-rose-900">{erreur}</div>
              )}

              {apercu && (
                <>
                  <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                    <b>{lu.notes} note(s)</b> lues sur {lu.colonnes} colonne(s), pour{' '}
                    <b>{apercu.total.rapproches}</b> étudiant(s) reconnu(s) sur{' '}
                    {apercu.total.etudiants}.
                  </div>

                  {!!apercu.total.inconnus && (
                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300
                                    text-amber-900">
                      <b>{apercu.total.inconnus} ligne(s) non rapprochée(s)</b> — leurs notes
                      ne seront pas écrites : {apercu.inconnus.join(' · ')}
                    </div>
                  )}
                  {!!apercu.total.non_inscrits && (
                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300
                                    text-amber-900">
                      {apercu.total.non_inscrits} étudiant(s) reconnu(s) mais non inscrit(s)
                      à cette unité — rien ne leur sera écrit.
                    </div>
                  )}
                  {!!apercu.acquis_inconnus?.length && (
                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300
                                    text-amber-900">
                      <b>Acquis inconnus en {annee} :</b> {apercu.acquis_inconnus.join(', ')}
                    </div>
                  )}
                  {!!lu.ignorees?.length && (
                    <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200
                                    text-slate-600">
                      <b>Colonnes ignorées</b> (elles ne portent pas de clé Lucie) :{' '}
                      {lu.ignorees.join(' · ')}
                    </div>
                  )}
                  {!!lu.soucis?.length && (
                    <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                                    text-rose-900">
                      <b>{lu.soucis.length} case(s) illisible(s)</b>, laissées de côté :
                      <ul className="list-disc ml-5 mt-0.5 text-[11.5px]">
                        {lu.soucis.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                  )}

                  <p className="text-[11.5px] text-slate-500">
                    Les notes écrites remplacent celles de la même session ; une case
                    laissée vide n'efface rien.
                  </p>
                </>
              )}
            </div>

            {apercu && (
              <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                              justify-end gap-2">
                <button onClick={() => { setApercu(null); setLu(null); }}
                  className="px-3 py-2 text-[12.5px] rounded-lg border border-slate-300
                             text-slate-600">Annuler</button>
                <button onClick={appliquer} disabled={enCours || !apercu.total.rapproches}
                  className="px-3 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                             font-semibold flex items-center gap-1.5 disabled:opacity-40">
                  <IconCheck size={15} /> Écrire {apercu.total.notes} note(s)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

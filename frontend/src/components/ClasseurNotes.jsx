import { useRef, useState } from 'react';
import { IconTableExport, IconTableImport, IconCheck } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
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
        className="px-2.5 py-1.5 text-second rounded-lg border border-slate-300
                   text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
        <IconTableExport size={14} /> Exporter
      </button>
      <button onClick={() => fichierRef.current?.click()} disabled={enCours}
        title="Relire un classeur rempli et en reprendre les notes"
        className="px-2.5 py-1.5 text-second rounded-lg border border-slate-300
                   text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
        <IconTableImport size={14} /> Importer
      </button>

      {(erreur || apercu) && (
        <Fenetre icone={IconTableImport} titre={`Classeur relu — UE ${ueNum}`}
          large="moyenne" onFermer={() => { setApercu(null); setErreur(''); setLu(null); }}
          pied={apercu && (<>
            <span />
            <button onClick={() => { setApercu(null); setLu(null); }}
              className="bouton">Annuler</button>
            <button onClick={appliquer} disabled={enCours || !apercu.total.rapproches}
              className="bouton bouton-fort flex items-center gap-1.5">
              <IconCheck size={15} /> Écrire {apercu.total.notes} note(s)
            </button>
          </>)}>
            <div className="space-y-3 text-sm">
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
                      <ul className="list-disc ml-5 mt-0.5 text-second">
                        {lu.soucis.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                  )}

                  <p className="text-second text-slate-500">
                    Les notes écrites remplacent celles de la même session ; une case
                    laissée vide n'efface rien.
                  </p>
                </>
              )}
            </div>

        </Fenetre>
      )}
    </>
  );
}

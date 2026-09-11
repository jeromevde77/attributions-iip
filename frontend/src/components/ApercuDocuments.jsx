import { useCallback, useEffect, useState } from 'react';
import { IconFileText, IconAlertTriangle, IconExternalLink } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';

/**
 * APERÇU DES DOCUMENTS — voir une pièce sans la produire.
 *
 * On ne jugeait une mise en page qu'en délibérant une unité réelle, donc en fin
 * de session et sur de vrais étudiants : au pire moment, et sans pouvoir
 * essayer. Les pièces s'ajustaient à l'aveugle.
 *
 * Deux familles, et l'écran le dit plutôt que de faire semblant. Les
 * attestations se rendent sur un DOSSIER FICTIF — « SPÉCIMEN Camille », un nom
 * qui ne peut pas passer pour un vrai. Le procès-verbal, la composition et les
 * motivations lisent la délibération en base : ils demandent une unité déjà
 * délibérée, faute de quoi l'aperçu montrerait une séance inventée.
 */
export default function ApercuDocuments({ onClose }) {
  const annee = getAnnee();
  const [catalogue, setCatalogue] = useState([]);
  const [choisi, setChoisi] = useState(null);
  const [niveau, setNiveau] = useState('superieur');
  const [ueNum, setUeNum] = useState('');
  const [session, setSession] = useState(1);
  const [html, setHtml] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/apercu/catalogue', { headers: authHeaders() })
      .then(r => r.json())
      .then(j => {
        setCatalogue(j.documents || []);
        setChoisi(c => c || j.documents?.[0] || null);
      })
      .catch(e => setErreur(e.message));
  }, []);

  const charger = useCallback(async () => {
    if (!choisi) return;
    setEnCours(true); setErreur(null); setHtml('');
    try {
      const p = new URLSearchParams({ annee, niveau });
      if (choisi.mode === 'unite') {
        if (!ueNum) {
          setErreur('Indiquez le numéro d’une unité déjà délibérée.');
          return;
        }
        p.set('ue_num', ueNum); p.set('session', String(session));
      }
      const rep = await fetch(`/api/apercu/${choisi.id}?${p}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.detail || j.error); return; }
      setHtml(j.html);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }, [choisi, annee, niveau, ueNum, session]);

  useEffect(() => { if (choisi?.mode === 'exemple') charger(); }, [choisi, niveau, charger]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-[1100px] max-w-full h-[88vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
          <IconFileText size={18} className="text-iip-blue" />
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-iip-blue">Aperçu des documents</h3>
            <p className="text-[11.5px] text-slate-500">
              Mise en page des pièces officielles, sur un dossier d’exemple.
            </p>
          </div>
          <button onClick={onClose}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
            Fermer
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="w-[300px] border-r border-slate-200 overflow-auto p-2 space-y-1">
            {catalogue.map(d => (
              <button key={d.id} onClick={() => { setChoisi(d); setHtml(''); setErreur(null); }}
                className={`w-full text-left px-2.5 py-2 rounded-lg border text-[12.5px]
                  ${choisi?.id === d.id ? 'border-iip-blue bg-iip-blue/5'
                    : 'border-transparent hover:bg-slate-50'}`}>
                <span className="block text-slate-800">{d.libelle}</span>
                <span className="block text-[11px] text-slate-500">
                  Annexe {d.annexe}
                  {d.mode === 'unite' && ' · sur une unité réelle'}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
              {choisi?.niveaux && (
                <select value={niveau} onChange={e => setNiveau(e.target.value)}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded">
                  <option value="superieur">Enseignement supérieur</option>
                  <option value="secondaire">Enseignement secondaire</option>
                </select>
              )}
              {choisi?.mode === 'unite' && (
                <>
                  <input value={ueNum} onChange={e => setUeNum(e.target.value)}
                    placeholder="N° d’unité" inputMode="numeric"
                    className="w-28 px-2 py-1 text-[12px] border border-slate-300 rounded" />
                  <select value={session} onChange={e => setSession(Number(e.target.value))}
                    className="px-2 py-1 text-[12px] border border-slate-300 rounded">
                    <option value={1}>1re session</option>
                    <option value={2}>2e session</option>
                  </select>
                  <button onClick={charger} disabled={enCours}
                    className="px-3 py-1 text-[12px] rounded-lg bg-iip-blue text-white
                               disabled:opacity-40">
                    Afficher
                  </button>
                </>
              )}
              <span className="flex-1" />
              {html && (
                <button onClick={() => {
                  const f = window.open('', '_blank');
                  if (f) { f.document.write(html); f.document.close(); }
                }}
                  className="px-2.5 py-1 text-[12px] rounded-lg border border-slate-300
                             text-slate-600 inline-flex items-center gap-1">
                  <IconExternalLink size={13} /> Ouvrir en pleine page
                </button>
              )}
            </div>

            {erreur && (
              <div className="m-3 px-3 py-2 rounded-lg bg-amber-50 text-amber-900 text-[12.5px]
                              flex items-start gap-2">
                <IconAlertTriangle size={15} className="flex-none mt-0.5" /> {erreur}
              </div>
            )}

            <div className="flex-1 min-h-0 bg-slate-100">
              {html
                ? <iframe title="Aperçu" srcDoc={html} className="w-full h-full border-0" />
                : (
                  <p className="p-6 text-[12.5px] text-slate-400">
                    {enCours ? 'Rendu en cours…'
                      : choisi?.mode === 'unite'
                        ? 'Cette pièce lit la délibération en base : indiquez une unité déjà délibérée.'
                        : 'Sélectionnez un document.'}
                  </p>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

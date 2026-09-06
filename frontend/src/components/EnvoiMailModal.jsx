import { useEffect, useMemo, useState } from 'react';
import { IconMail, IconX, IconAlertTriangle, IconCheck, IconSend, IconLoader2 } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { useEnvoiMail } from '../lib/envoiMail.js';

/**
 * Envoyer un ou plusieurs documents générés à leurs intéressés.
 *
 * Le composant ne compose rien : il reçoit des pièces déjà produites (HTML)
 * et une personne par pièce. Il retrouve les adresses connues, laisse choisir
 * ou corriger, puis remet le tout au serveur qui rend le PDF, l'attache et
 * consigne l'envoi.
 *
 * @param {Array<{ html: string, nom_fichier?: string,
 *                 destinataire: { type?: 'etudiant'|'professeur', id?: number,
 *                                 nom: string, email?: string } }>} pieces
 * @param {string} typeDoc      identifiant du document, pour le journal
 * @param {string} [sujet]      objet proposé
 * @param {string} [message]    corps proposé
 * @param {function} onClose
 */
export default function EnvoiMailModal({ pieces, typeDoc, sujet: sujetInitial = '',
                                         message: messageInitial = '', onClose }) {
  const etat = useEnvoiMail(true);                 // { actif, smtp, pdf } — relu à l'ouverture
  const [lignes, setLignes] = useState(null);      // une par pièce
  const [sujet, setSujet] = useState(sujetInitial);
  const [message, setMessage] = useState(messageInitial
    || "Bonjour,\n\nVeuillez trouver ci-joint votre document.\n\nCordialement,");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  // Les adresses connues, par type de personne, en un appel par type.
  useEffect(() => {
    let annule = false;
    (async () => {
      const parType = {};
      for (const p of pieces) {
        const d = p.destinataire || {};
        if (d.type && d.id) (parType[d.type] ||= new Set()).add(d.id);
      }
      const connues = {};
      for (const [type, ids] of Object.entries(parType)) {
        try {
          const rep = await fetch(`/api/envois/adresses?type=${type}&ids=${[...ids].join(',')}`,
                                  { headers: authHeaders() });
          const j = await rep.json();
          for (const x of j) connues[`${type}:${x.id}`] = x;
        } catch { /* on tombe sur la saisie libre */ }
      }
      if (annule) return;
      setLignes(pieces.map((p, i) => {
        const d = p.destinataire || {};
        const c = d.type && d.id ? connues[`${d.type}:${d.id}`] : null;
        const adresses = c?.adresses || [];
        const nom = d.nom || (c ? `${c.nom} ${c.prenom}` : '') || p.nom_fichier || `Pièce ${i + 1}`;
        return {
          idx: i, nom,
          type: d.type || null, id: d.id || null,
          adresses,
          email: d.email || adresses[0]?.email || '',
          coche: !!(d.email || adresses[0]?.email),
          nom_fichier: p.nom_fichier || null,
        };
      }));
    })();
    return () => { annule = true; };
  }, [pieces]);

  const retenues = useMemo(() => (lignes || []).filter(l => l.coche && l.email.trim()), [lignes]);
  const sansAdresse = useMemo(() => (lignes || []).filter(l => !l.email.trim()).length, [lignes]);

  function maj(idx, patch) {
    setLignes(ls => ls.map(l => l.idx === idx ? { ...l, ...patch } : l));
  }

  async function envoyer() {
    if (!sujet.trim() || !retenues.length) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/envois', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          sujet, message, type_doc: typeDoc,
          pieces: retenues.map(l => ({
            destinataire_type: l.type, destinataire_id: l.id, nom: l.nom,
            email: l.email.trim(), html: pieces[l.idx].html, nom_fichier: l.nom_fichier,
          })),
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || `erreur ${rep.status}`); return; }
      setResultat(j);
    } catch (e) {
      setErreur(e.message);
    } finally { setEnCours(false); }
  }

  const pret = etat && lignes;
  const bloque = etat && (!etat.actif || !etat.pdf);

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-3"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden"
           style={{ maxHeight: '92vh' }}>

        {/* Barre marine */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1B2B4B] flex-shrink-0">
          <div className="flex items-center gap-2 text-white">
            <IconMail size={18} />
            <div>
              <div className="font-bold text-sm">Envoyer par courriel</div>
              <div className="text-white/60 text-xs">
                {pieces.length} document{pieces.length > 1 ? 's' : ''} · un courriel par personne, PDF joint
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
            <IconX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {etat?.actif && etat.pdf && !etat.smtp && (
            <div className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <IconAlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>Le serveur n'a pas de configuration SMTP : les envois seront <b>simulés</b> et
                consignés dans le journal, mais aucun courriel ne partira.</span>
            </div>
          )}
          {etat && !etat.actif && (
            <div className="flex items-start gap-2 text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <IconAlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>L'envoi de documents par courriel est <b>désactivé</b> (Configuration → Courriels).</span>
            </div>
          )}
          {etat?.actif && !etat.pdf && (
            <div className="flex items-start gap-2 text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <IconAlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <span>Ce serveur ne sait pas produire de PDF ; l'envoi exige une pièce jointe PDF.
                {etat.pdf_raison ? ` (${etat.pdf_raison})` : ''}</span>
            </div>
          )}

          {resultat ? (
            <Bilan resultat={resultat} />
          ) : (
            <>
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-600">Objet</span>
                <input value={sujet} onChange={e => setSujet(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                  placeholder="Objet du courriel" />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-600">Message</span>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-[inherit]" />
              </label>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-slate-600">
                    Destinataires — {retenues.length} / {lignes?.length ?? pieces.length}
                  </span>
                  {sansAdresse > 0 && (
                    <span className="text-[11px] text-amber-700">
                      {sansAdresse} sans adresse connue : à saisir ou à laisser de côté
                    </span>
                  )}
                </div>
                {!lignes ? (
                  <div className="text-sm text-slate-400 py-4 text-center">Recherche des adresses…</div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-[13px]">
                      <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                        <tr>
                          <th className="w-8 px-2 py-1.5"></th>
                          <th className="text-left px-2 py-1.5">Personne</th>
                          <th className="text-left px-2 py-1.5">Adresse</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map(l => (
                          <tr key={l.idx} className={`border-t border-slate-100 ${!l.email ? 'bg-amber-50/40' : ''}`}>
                            <td className="px-2 py-1 text-center">
                              <input type="checkbox" checked={l.coche && !!l.email.trim()}
                                disabled={!l.email.trim()}
                                onChange={e => maj(l.idx, { coche: e.target.checked })} />
                            </td>
                            <td className="px-2 py-1">
                              <div className="font-medium text-slate-800">{l.nom}</div>
                              {l.nom_fichier && <div className="text-[11px] text-slate-400 truncate max-w-[260px]">{l.nom_fichier}</div>}
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-1.5">
                                {l.adresses.length > 1 && (
                                  <select value={l.adresses.some(a => a.email === l.email) ? l.email : '__libre'}
                                    onChange={e => maj(l.idx, e.target.value === '__libre'
                                      ? { email: '' } : { email: e.target.value, coche: true })}
                                    className="border border-slate-300 rounded-md px-1.5 py-1 text-[12px]">
                                    {l.adresses.map(a => <option key={a.email} value={a.email}>{a.libelle}</option>)}
                                    <option value="__libre">autre…</option>
                                  </select>
                                )}
                                <input value={l.email}
                                  onChange={e => maj(l.idx, { email: e.target.value, coche: !!e.target.value.trim() })}
                                  placeholder="adresse@…"
                                  className={`flex-1 border rounded-md px-2 py-1 text-[12px] ${
                                    l.email ? 'border-slate-300' : 'border-amber-300'}`} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {erreur && <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</div>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          {resultat ? (
            <button onClick={onClose}
              className="px-4 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg">Fermer</button>
          ) : (
            <>
              <button onClick={onClose}
                className="px-3.5 py-1.5 text-sm border border-slate-300 text-slate-600 font-semibold rounded-lg">
                Annuler
              </button>
              <button onClick={envoyer}
                disabled={!pret || bloque || enCours || !sujet.trim() || !retenues.length}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg disabled:opacity-40">
                {enCours ? <IconLoader2 size={15} className="animate-spin" /> : <IconSend size={15} />}
                {enCours ? 'Envoi en cours…' : `Envoyer${retenues.length > 1 ? ` (${retenues.length})` : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Bilan({ resultat }) {
  const { envoyes, simules, echecs, resultats } = resultat;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[12px]">
        {envoyes > 0 && <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1"><IconCheck size={13} /> {envoyes} envoyé{envoyes > 1 ? 's' : ''}</span>}
        {simules > 0 && <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200">{simules} simulé{simules > 1 ? 's' : ''} (SMTP absent)</span>}
        {echecs > 0 && <span className="px-2 py-1 rounded-md bg-red-50 text-red-800 border border-red-200">{echecs} en échec</span>}
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <tbody>
            {resultats.map((x, i) => (
              <tr key={i} className="border-t border-slate-100 first:border-t-0">
                <td className="px-2 py-1 w-5">
                  {x.statut === 'echec'
                    ? <IconAlertTriangle size={14} className="text-red-600" />
                    : <IconCheck size={14} className={x.statut === 'simule' ? 'text-amber-600' : 'text-emerald-600'} />}
                </td>
                <td className="px-2 py-1 font-medium text-slate-800">{x.nom}</td>
                <td className="px-2 py-1 text-slate-500">{x.email}</td>
                <td className="px-2 py-1 text-[11px] text-red-700">{x.erreur || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">L'envoi est consigné dans le journal des courriels.</p>
    </div>
  );
}

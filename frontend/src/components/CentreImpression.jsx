import { useEffect, useState } from 'react';
import { IconX, IconAlertTriangle, IconFileText, IconPrinter } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LE CENTRE D'IMPRESSION — plusieurs unités, un seul document.
 *
 * Les pièces se tiraient unité par unité. Une section, c'est vingt-sept fois
 * la même fenêtre, vingt-sept fichiers à ouvrir, à imprimer, à ranger — et
 * c'est là qu'une unité se perd. Le secrétariat, lui, ne travaille pas par
 * unité : il travaille par pile.
 *
 * On coche les unités, on coche les pièces, et tout sort dans une seule
 * enveloppe, chaque pièce sur sa page, les unités dans l'ordre.
 *
 * LES MANQUES PORTENT LEUR UNITÉ. Sur un lot, « il manque une date de
 * naissance » ne sert à rien si l'on ne sait pas chez qui.
 */
const PIECES = [
  { cle: 'pv', libelle: 'Procès-verbal de délibération',
    aide: 'Annexe 3 — ou 5 pour une épreuve intégrée', ton: 'border-iip-blue bg-iip-blue/5' },
  { cle: 'conseil', libelle: 'Composition du Conseil des études',
    aide: 'Membres, qualité, voix et quorum — RGE art. 22 et 25',
    ton: 'border-sky-300 bg-sky-50' },
  { cle: 'reussite', libelle: 'Attestations de réussite',
    aide: 'Une par étudiant réussi', ton: 'border-emerald-300 bg-emerald-50' },
  { cle: 'ajournement', libelle: "Notifications d'ajournement",
    aide: 'Annexe 8 — acquis et cours à représenter', ton: 'border-amber-300 bg-amber-50' },
  { cle: 'refus', libelle: 'Notifications de refus',
    aide: 'Annexe 9 — base légale et voies de recours', ton: 'border-red-300 bg-red-50' },
  { cle: 'listes', libelle: 'Listes des ajournés par cours',
    aide: 'Une par cours, pour les professeurs', ton: 'border-slate-400 bg-slate-50' },
];

export default function CentreImpression({ annee, section = null, onClose }) {
  const [etat, setEtat] = useState(null);
  const [sec, setSec] = useState(section);
  const [choisies, setChoisies] = useState(() => new Set());
  const [choix, setChoix] = useState({ pv: true, conseil: false, reussite: false,
    ajournement: false, refus: false, listes: false });
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    (async () => {
      setErreur(null);
      try {
        const rep = await fetch('/api/acquis/deliberation/documents-lot'
          + `?annee=${encodeURIComponent(annee)}${sec ? `&section=${encodeURIComponent(sec)}` : ''}`,
          { headers: authHeaders() });
        const j = await rep.json();
        if (!rep.ok) throw new Error(j.error);
        setEtat(j);
        // Les unités closes sont celles dont les pièces sont signables : ce
        // sont elles qu'on vient chercher.
        setChoisies(new Set(j.unites.filter(u => u.cloturee).map(u => u.ue_num)));
      } catch (e) { setErreur(e.message); }
    })();
  }, [annee, sec]);

  async function produire(sortie) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/documents-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_nums: [...choisies], ...choix }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (j.manques?.length) {
        setErreur(`${j.pieces} pièce(s) produite(s), mais : `
          + j.manques.slice(0, 6).join(' · ')
          + (j.manques.length > 6 ? ` … et ${j.manques.length - 6} autres.` : ''));
      }
      if (sortie === 'pdf') {
        const rp = await fetch('/api/impression/pdf', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ html: j.html, nom: (j.nom || 'documents').replace(/\.html$/, ''),
                                 pagination: 'si-plusieurs' }),
        });
        if (!rp.ok) {
          const e = await rp.json().catch(() => ({}));
          setErreur(e.error || 'Le PDF n’a pas pu être produit.'); return;
        }
        const url = URL.createObjectURL(await rp.blob());
        const a = document.createElement('a');
        a.href = url; a.download = (j.nom || 'documents').replace(/\.html$/, '') + '.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        return;
      }
      const f = window.open('', '_blank');
      if (!f) { setErreur('Le navigateur a bloqué la fenêtre d’impression.'); return; }
      f.document.write(j.html); f.document.close();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const unites = etat?.unites || [];
  const basculer = n => setChoisies(s => {
    const c = new Set(s); if (c.has(n)) c.delete(n); else c.add(n); return c;
  });
  const rien = !Object.values(choix).some(Boolean);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1000px] mt-6
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">Centre d'impression</h3>
            <p className="text-[12px] text-slate-500">
              Année <b>{annee}</b> · les pièces de plusieurs unités en un seul document,
              chacune sur sa page.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12.5px] text-amber-900 flex items-start gap-2">
              <IconAlertTriangle size={15} className="mt-px shrink-0" /> {erreur}
            </div>
          )}

          {!etat ? (
            <div className="py-8 text-center text-[12.5px] text-slate-400">Chargement…</div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] text-slate-500">Section :</span>
                <button onClick={() => setSec(null)}
                  className={`px-2 py-1 rounded-lg border text-[12px] ${!sec
                    ? 'border-iip-blue text-iip-blue font-semibold'
                    : 'border-slate-300 text-slate-600'}`}>toutes</button>
                {(etat.sections || []).map(x => (
                  <button key={x} onClick={() => setSec(x)}
                    className={`px-2 py-1 rounded-lg border text-[12px] ${sec === x
                      ? 'border-iip-blue text-iip-blue font-semibold'
                      : 'border-slate-300 text-slate-600'}`}>{x}</button>
                ))}
                <span className="flex-1" />
                <button onClick={() => setChoisies(new Set(unites.map(u => u.ue_num)))}
                  className="text-[12px] text-iip-blue underline">tout cocher</button>
                <button onClick={() => setChoisies(new Set())}
                  className="text-[12px] text-slate-500 underline">tout décocher</button>
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100
                              max-h-[32vh] overflow-y-auto">
                {!unites.length && (
                  <div className="px-3 py-6 text-center text-[12.5px] text-slate-400">
                    Aucune unité pour cette année.
                  </div>
                )}
                {unites.map(u => (
                  <label key={u.ue_num}
                    className="px-3 py-1.5 flex items-center gap-2 text-[12.5px]
                               cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={choisies.has(u.ue_num)}
                      onChange={() => basculer(u.ue_num)} />
                    <span className="w-16 tabular-nums text-slate-500">UE{u.ue_num}</span>
                    <span className="flex-1 truncate">{u.ue_nom}</span>
                    <span className="text-[11px] text-slate-400 w-14">{u.section}</span>
                    {/* Une séance ouverte produit des pièces sans date de
                        délibération : mieux vaut le voir avant d'imprimer. */}
                    <span className={`text-[11px] w-24 text-right ${u.cloturee
                      ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {u.cloturee ? `close · s${u.session}` : 'séance ouverte'}
                    </span>
                    <span className="text-[11.5px] text-slate-500 w-44 text-right">
                      {u.reussites} réussi · {u.ajournements} ajourné · {u.refus} refusé
                      {u.sans_decision ? ` · ${u.sans_decision} sans décision` : ''}
                    </span>
                  </label>
                ))}
              </div>

              <div>
                <div className="text-[12.5px] font-semibold text-iip-blue mb-1.5">
                  Les pièces à sortir
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PIECES.map(p => (
                    <label key={p.cle}
                      className={`flex items-start gap-2 px-3 py-2 rounded-xl border
                        cursor-pointer ${choix[p.cle] ? p.ton : 'border-slate-200'}`}>
                      <input type="checkbox" checked={!!choix[p.cle]} className="mt-0.5"
                        onChange={e => setChoix(c => ({ ...c, [p.cle]: e.target.checked }))} />
                      <span>
                        <span className="text-[12.5px] font-semibold text-slate-800">
                          {p.libelle}
                        </span>
                        <span className="block text-[11px] text-slate-500">{p.aide}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center
                        justify-between gap-3">
          <span className="text-[12px] text-slate-500">
            {choisies.size} unité(s) · {Object.values(choix).filter(Boolean).length} type(s) de pièce
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                         text-slate-600">Fermer</button>
            <button disabled={enCours || !choisies.size || rien}
              onClick={() => produire('impression')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] rounded-lg
                         border border-slate-300 text-slate-600 disabled:opacity-40">
              <IconPrinter size={14} /> Aperçu
            </button>
            <button disabled={enCours || !choisies.size || rien} onClick={() => produire('pdf')}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] rounded-lg
                         bg-iip-blue text-white font-semibold disabled:opacity-40">
              <IconFileText size={14} /> PDF — à imprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

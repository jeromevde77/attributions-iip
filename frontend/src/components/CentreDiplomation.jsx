import { useEffect, useState } from 'react';
import {
  IconX, IconAward, IconAlertTriangle, IconClock, IconSquare, IconSquareCheck,
  IconPrinter, IconCertificate,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LA DIPLOMATION D'UNE SECTION.
 *
 * En juin, les titres se produisaient sur des cotes RETAPÉES : les unités
 * déterminantes de TIM étaient écrites dans le code d'un écran, et les notes se
 * saisissaient à la main à côté de celles que le Conseil avait arrêtées. Rien
 * ne garantissait qu'elles concordent, et c'est un diplôme qui portait l'écart.
 *
 * Ici, rien ne se tape. La mention se calcule sur les délibérations, les
 * déterminantes se lisent au référentiel, et l'écran ne sert qu'à une chose :
 * ARRÊTER QUI REÇOIT UN TITRE. C'est une décision de direction, pas le
 * résultat d'une requête — d'où la sélection, et d'où le fait que rien n'est
 * coché d'office hors de ceux qui ont terminé cette année.
 *
 * CE QUI CLOCHE SE VOIT AVANT L'IMPRESSION. Une séance encore ouverte, une
 * date de naissance manquante, une déterminante sans cote : chacun est dit sur
 * la ligne concernée. Un diplôme se corrige mal une fois signé.
 */
export default function CentreDiplomation({ annee, onClose }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [d, setD] = useState(null);
  const [retenus, setRetenus] = useState(new Set());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [veut, setVeut] = useState({ diplome: true, attestation: true, liste: false });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); })
      .catch(() => {});
  }, []);

  async function charger(code) {
    setEnCours(true); setErreur(null); setD(null);
    try {
      const rep = await fetch(
        `/api/diplomes/dossier?section=${encodeURIComponent(code)}`
        + `&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setD(j);
      // Cochés d'office : ceux qui ont terminé CETTE année. Les diplômés des
      // années passées restent listés — on réédite parfois une pièce — mais
      // décochés, pour qu'on ne les glisse pas dans la promotion de cette année.
      setRetenus(new Set(j.proposes || []));
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  const basculer = id => setRetenus(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const produire = async () => {
    const pieces = Object.entries(veut).filter(([, v]) => v).map(([k]) => k);
    if (!retenus.size || !pieces.length) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/diplomes/pieces', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ section, annee, etudiants: [...retenus],
          pieces, date_deliberation: date }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      // LE DIPLÔME NE SE MÊLE PAS AUX AUTRES PIÈCES : il se compose en paysage,
      // sans marge ni pied, et un saut de page ne suffirait pas à le séparer
      // proprement des pièces portrait. Une fenêtre par nature de document.
      for (const html of [...(j.diplomes || []), ...(j.html ? [j.html] : [])]) {
        const w = window.open('', '_blank');
        if (!w) {
          setErreur('La fenêtre d’impression a été bloquée par le navigateur.');
          return;
        }
        w.document.write(html); w.document.close();
      }
      if (j.manques?.length) {
        setErreur(`${j.manques.length} pièce(s) comportent un champ à compléter : `
          + j.manques.slice(0, 3).join(' · '));
      }
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const liste = d?.diplomables || [];
  const nb = retenus.size;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mt-10
                      max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue flex items-center gap-2">
              <IconAward size={17} className="text-iip-turquoise" /> Diplomation
            </h3>
            <p className="text-[12px] text-slate-500">
              Les mentions sont calculées sur les délibérations. Vous arrêtez qui
              reçoit un titre.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-end
                        gap-3 flex-wrap">
          <label className="text-[11.5px] text-slate-600">
            <div className="font-semibold mb-0.5">Section</div>
            <select value={section}
              onChange={e => { setSection(e.target.value); if (e.target.value) charger(e.target.value); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px] min-w-[200px]">
              <option value="">— choisir —</option>
              {sections.map(s => (
                <option key={s.code || s} value={s.code || s}>
                  {s.code || s}{s.libelle ? ` — ${s.libelle}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11.5px] text-slate-600">
            <div className="font-semibold mb-0.5">Date de délibération</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]" />
          </label>
          <div className="text-[11.5px] text-slate-600">
            <div className="font-semibold mb-0.5">Pièces</div>
            <div className="flex gap-1">
              {[['diplome', 'Diplôme'], ['attestation', 'Attestation de section'],
                ['liste', 'Liste']].map(([k, l]) => (
                <button key={k} onClick={() => setVeut(v => ({ ...v, [k]: !v[k] }))}
                  className={`px-2 py-1.5 text-[11.5px] rounded-lg border font-medium
                    ${veut[k] ? 'bg-iip-blue border-iip-blue text-white'
                      : 'bg-white border-slate-300 text-slate-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 text-[12.5px]">
          {erreur && (
            <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                            text-rose-900">{erreur}</div>
          )}
          {enCours && <p className="text-slate-400 italic py-6 text-center">Calcul…</p>}
          {!section && !enCours && (
            <p className="text-slate-400 italic py-8 text-center">
              Choisissez une section.
            </p>
          )}

          {d && !enCours && (
            <>
              {!!d.determinantes_sans_periodes?.length && (
                <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300
                                text-amber-900 flex items-start gap-2">
                  <IconAlertTriangle size={15} className="mt-px flex-none" />
                  <span>
                    <b>Unité(s) déterminante(s) sans périodes</b> :{' '}
                    {d.determinantes_sans_periodes.join(', ')}. Elles pèsent alors
                    comme une seule période dans la mention — à compléter au
                    référentiel pour que la pondération soit juste.
                  </span>
                </div>
              )}

              <div className="text-[11px] text-slate-500">
                Mention : {Math.round((1 - d.regles_mention.poids_epreuve) * 100)} %
                pour les unités déterminantes (pondérées par leurs périodes),{' '}
                {Math.round(d.regles_mention.poids_epreuve * 100)} % pour l'épreuve
                intégrée{d.epreuve_integree ? ` (UE ${d.epreuve_integree})` : ''}.
              </div>

              {!liste.length ? (
                <p className="text-slate-400 italic py-8 text-center">
                  Personne n'est en conditions dans cette section.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                    {liste.map(x => {
                      const pris = retenus.has(x.id);
                      return (
                        <div key={x.id} className="px-3 py-2 flex items-start gap-2.5">
                          <button onClick={() => basculer(x.id)} className="mt-0.5 text-iip-blue">
                            {pris ? <IconSquareCheck size={16} />
                              : <IconSquare size={16} className="text-slate-300" />}
                          </button>
                          <div className={`flex-1 min-w-0 ${pris ? '' : 'opacity-45'}`}>
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-semibold text-iip-blue">
                                {x.nom} {x.prenom}
                              </span>
                              {x.mention.mention ? (
                                <span className="text-[11px] px-1.5 py-px rounded
                                                 bg-slate-100 text-slate-700 font-medium">
                                  {x.mention.mention} ·{' '}
                                  {String(x.mention.pourcent).replace('.', ',')} %
                                </span>
                              ) : (
                                <span className="text-[11px] px-1.5 py-px rounded
                                                 bg-red-50 text-red-700 font-medium">
                                  sans mention
                                </span>
                              )}
                              {x.annee_fin !== annee && (
                                <span className="text-[10.5px] text-slate-400">
                                  terminé en {x.annee_fin}
                                </span>
                              )}
                              {x.par_epreuve && !x.toutes_unites && (
                                <span className="text-[10.5px] text-slate-400"
                                  title="L'épreuve intégrée réussie vaut parcours complet">
                                  par l'épreuve intégrée
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {x.determinantes.map(u => (
                                <span key={u.ue_num}
                                  title={`${u.ue_nom || ''} · ${u.periodes || '?'} périodes`}
                                  className={`text-[10px] px-1.5 py-px rounded border
                                    ${u.cote == null
                                      ? 'bg-red-50 border-red-200 text-red-700'
                                      : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                  {u.ue_num} : {u.cote == null ? '—'
                                    : `${Math.round(u.cote)}/20`}
                                </span>
                              ))}
                              {x.epreuve && (
                                <span className="text-[10px] px-1.5 py-px rounded border
                                                 bg-violet-50 border-violet-200 text-violet-800">
                                  EI {x.epreuve.ue_num} : {x.epreuve.cote == null ? '—'
                                    : `${Math.round(x.epreuve.cote)}/20`}
                                </span>
                              )}
                            </div>
                            {!!x.reserves.length && (
                              <ul className="mt-1 text-[11px] text-amber-800">
                                {x.reserves.map((r, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <IconClock size={11} className="mt-0.5 flex-none" />
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {d && (
          <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                          justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              <b>{nb}</b> titre(s) retenu(s) sur {liste.length} en conditions
              {d.total.provisoires > 0 && (
                <span className="text-amber-700">
                  {' '}· {d.total.provisoires} dossier(s) dont une séance reste ouverte
                </span>
              )}
            </p>
            <button onClick={produire} disabled={enCours || !nb}
              className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                         font-semibold flex items-center gap-1.5 disabled:opacity-40">
              <IconCertificate size={15} /> Produire les pièces
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

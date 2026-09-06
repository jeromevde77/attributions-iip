import { useEffect, useMemo, useState } from 'react';
import { IconX, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Paramétrage des liens cours ↔ acquis d'une unité.
 *
 * LE LIEN EST LA PONDÉRATION : un acquis est évalué dans un cours dès qu'il y
 * porte un poids ; l'en retirer, c'est cesser de l'y évaluer. Il n'y a donc pas
 * deux gestes à faire — relier, puis pondérer — mais un seul.
 *
 * DIX POINTS À RÉPARTIR par cours, en nombres entiers de 1 à 10. Le barème sur
 * 100 des classeurs de suivi reste accepté tel quel : seul le RAPPORT entre les
 * poids entre dans le calcul, 3 sur 10 pèse comme 30 sur 100.
 *
 * La grille croise les acquis et les cours plutôt que de tracer des flèches :
 * le lien et son poids se lisent et se posent dans la même case, et l'on voit
 * d'un coup d'œil l'acquis qu'aucun cours n'évalue — c'est précisément ce qui
 * bloque la saisie.
 */
export default function LiensCoursAcquis({ ueNum, annee, onClose, onEnregistre }) {
  const [data, setData] = useState(null);
  const [poids, setPoids] = useState({});      // `${cours}|${aa}` → nombre ou ''
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/liens?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
      setPoids(Object.fromEntries(j.liens.map(l => [`${l.cours_code}|${l.aa_code}`, l.poids])));
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

  const sommes = useMemo(() => {
    const s = {};
    for (const [cle, v] of Object.entries(poids)) {
      const c = cle.split('|')[0];
      s[c] = (s[c] || 0) + (Number(v) || 0);
    }
    return s;
  }, [poids]);

  const etatCours = c => {
    const s = sommes[c] || 0;
    if (s === 0) return { ok: false, texte: 'aucun acquis', ton: 'text-slate-400' };
    if (Math.abs(s - 10) < 0.001) return { ok: true, texte: '10 / 10', ton: 'text-emerald-700' };
    if (Math.abs(s - 100) < 0.01) return { ok: true, texte: '100 (classeur)', ton: 'text-sky-700' };
    return { ok: false, texte: `${Math.round(s * 100) / 100} / 10`, ton: 'text-red-700' };
  };

  async function enregistrer(coursCode) {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const ponderations = (data.acquis || []).map(a => ({
        aa_code: a.aa_code,
        poids: Number(poids[`${coursCode}|${a.aa_code}`]) || 0,
      }));
      const rep = await fetch('/api/acquis/ponderations', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ ue_num: ueNum, cours_code: coursCode, ponderations }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setMessage(`Cours ${coursCode} enregistré.`);
      await charger();
      onEnregistre && onEnregistre();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const orphelins = (data?.acquis || []).filter(a =>
    !(data?.cours || []).some(c => Number(poids[`${c.cours_code}|${a.aa_code}`]) > 0));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mt-8
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-none p-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              UE {ueNum}{data?.ue_nom ? ` · ${data.ue_nom}` : ''} — cours et acquis
            </h3>
            <p className="text-[12px] text-slate-500">
              Reliez chaque acquis aux cours qui l'évaluent, et répartissez
              <b> dix points</b> par cours.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800">{erreur}</div>
          )}
          {message && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                            text-[12.5px] text-emerald-800">{message}</div>
          )}

          {!data ? (
            <div className="py-8 text-center text-slate-400 text-sm">Chargement…</div>
          ) : !data.cours.length ? (
            <div className="px-4 py-6 rounded-xl bg-amber-50 border border-amber-200
                            text-[13px] text-amber-900">
              Aucun cours au référentiel de cette unité pour {annee}. Les cours se
              déclarent dans le référentiel avant de pouvoir porter des acquis.
            </div>
          ) : !data.acquis.length ? (
            <div className="px-4 py-6 rounded-xl bg-amber-50 border border-amber-200
                            text-[13px] text-amber-900">
              Aucun acquis d'apprentissage au référentiel de cette unité.
            </div>
          ) : (
            <>
              {!!orphelins.length && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                text-[12.5px] text-amber-900 flex items-start gap-1.5">
                  <IconAlertTriangle size={15} className="mt-0.5 flex-none" />
                  <span>
                    <b>{orphelins.length} acquis</b> ne sont évalués par aucun cours :
                    {' '}{orphelins.map(a => a.aa_code).join(' · ')}.
                    Tant qu'ils le restent, ils ne peuvent recevoir aucune note.
                  </span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="text-[12px] border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white text-left px-3 py-1.5
                                     border-b border-r border-slate-200 min-w-[240px]">
                        Acquis d'apprentissage
                      </th>
                      {data.cours.map(c => (
                        <th key={c.cours_code}
                          className="px-2 py-1.5 border-b border-slate-200 text-center min-w-[92px]">
                          <div className="font-mono text-[11px] text-slate-600">{c.cours_code}</div>
                          <div className="font-sans font-normal text-[10px] text-slate-400 truncate max-w-[92px]"
                            title={c.cours_nom || ''}>{c.cours_nom || ''}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.acquis.map(a => {
                      const orphelin = !data.cours.some(c => Number(poids[`${c.cours_code}|${a.aa_code}`]) > 0);
                      return (
                        <tr key={a.aa_code} className={orphelin ? 'bg-amber-50/40' : ''}>
                          <td className="sticky left-0 bg-white px-3 py-1
                                         border-b border-r border-slate-100">
                            <div className="font-mono text-[11px] text-slate-600">{a.aa_code}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[240px]"
                              title={a.description || ''}>{a.description || ''}</div>
                          </td>
                          {data.cours.map(c => {
                            const cle = `${c.cours_code}|${a.aa_code}`;
                            const v = poids[cle];
                            return (
                              <td key={c.cours_code}
                                className="px-1 py-1 border-b border-slate-100 text-center">
                                <input type="number" min="0" max="100" step="1"
                                  value={v ?? ''}
                                  onChange={e => setPoids(m => ({ ...m, [cle]: e.target.value }))}
                                  placeholder="—"
                                  title="Poids de cet acquis dans ce cours — vide ou 0 : il n'y est pas évalué"
                                  className={`w-16 border rounded-lg px-1.5 py-1 text-[12.5px]
                                    text-center tabular-nums ${Number(v) > 0
                                      ? 'border-iip-blue/40 bg-iip-blue/5 font-semibold'
                                      : 'border-slate-200 text-slate-400'}`} />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* La somme par cours, et le bouton qui l'enregistre. */}
                    <tr className="bg-slate-50">
                      <td className="sticky left-0 bg-slate-50 px-3 py-2
                                     border-t border-r border-slate-200 font-semibold text-slate-600">
                        Dix points à répartir
                      </td>
                      {data.cours.map(c => {
                        const et = etatCours(c.cours_code);
                        return (
                          <td key={c.cours_code} className="px-1 py-2 border-t border-slate-200 text-center">
                            <div className={`text-[12px] font-bold tabular-nums ${et.ton}`}>{et.texte}</div>
                            <button onClick={() => enregistrer(c.cours_code)}
                              disabled={enCours || !et.ok}
                              title={et.ok ? 'Enregistrer ce cours'
                                : 'La somme doit valoir 10 avant enregistrement'}
                              className="mt-1 px-2 py-0.5 text-[11px] rounded-lg border
                                         border-iip-blue text-iip-blue font-semibold
                                         disabled:opacity-40 disabled:border-slate-300
                                         disabled:text-slate-400">
                              <IconCheck size={12} className="inline align-[-2px]" /> Enregistrer
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-[11.5px] text-slate-500">
                Une case vide ou à zéro signifie que ce cours n'évalue pas cet acquis.
                Un même acquis peut être évalué par plusieurs cours : sa note globale
                est alors la moyenne de ses évaluations, pondérée par ces poids.
                Le barème sur 100 des classeurs de suivi reste accepté — seul le
                rapport entre les poids entre dans le calcul.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

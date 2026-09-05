import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Droit d'inscription (DI) et droit d'inscription spécifique (DIS).
 *
 * DI : circulaire n° 9731 du 27/05/2026 — un forfait annuel, plus un tarif par
 * période, plafonné à 800 périodes toutes catégories confondues, le secondaire
 * étant compté en premier. Les UE en dispense complète en sont exclues.
 *
 * DIS : A.E. du 25/09/1991 — dû par les étudiants de nationalité étrangère non
 * exemptés, à raison d'un montant par période hebdomadaire, plafonné.
 */
export default function DroitInscription({ etudId, annee, peutEcrire = true }) {
  const [data, setData] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  // Le détail est OUVERT d'emblée : c'est ce qui explique le montant, et le
  // cacher derrière un clic obligeait à le chercher.
  const [detailOuvert, setDetailOuvert] = useState(true);

  async function charger() {
    const rep = await fetch(`/api/droit-inscription/etudiant/${etudId}?annee=${annee}`,
      { headers: authHeaders() });
    if (rep.ok) setData(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId, annee]);

  async function enregistrer(champs) {
    setEnregistrement(true);
    try {
      await fetch(`/api/droit-inscription/etudiant/${etudId}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          di_exonere: data.di.exonere, di_motif: data.di.motif,
          dis_soumis: data.dis.soumis || data.dis.exempte,
          dis_motif_exemption: data.dis.motif_exemption,
          dis_periodes_hebdo: data.dis.periodes_hebdo,
          ...champs,
        }),
      });
      await charger();
    } finally { setEnregistrement(false); }
  }

  if (!data) return <div className="py-6 text-sm text-slate-400">Chargement…</div>;
  const { di, dis, motifs_di, motifs_dis } = data;
  const eur = n => (n ?? 0).toFixed(2).replace('.', ',') + ' €';

  const f = data.frais;

  return (
    <div className="space-y-4">
      {/* LE MONTANT À PAYER, en tête. L'écran montrait deux droits sans jamais
          dire ce que l'étudiant doit verser : c'est pourtant la question. */}
      {f && (
        <div className="border-2 border-iip-blue/30 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-iip-blue/5 border-b border-iip-blue/20
                          flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[13px] font-semibold text-iip-blue">
              Montant à payer
            </span>
            <span className="text-[10.5px] text-slate-500">
              {f.periodes ?? '—'} périodes · {annee}
            </span>
          </div>

          <div className="p-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              {[['Droit d\u2019inscription', f.droit, di.exonere && 'exonéré'],
                ['Droit spécifique', f.droit_specifique,
                  !dis.soumis && (dis.exempte ? 'exempté' : 'non soumis')],
                ['Frais administratifs', f.frais_admin, null]].map(([lib, v, note]) => (
                <div key={lib}>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500
                                  font-semibold">{lib}</div>
                  <div className="text-[17px] font-bold text-slate-700">{eur(v)}</div>
                  {note && (
                    <div className="text-[10.5px] text-emerald-700">{note}</div>
                  )}
                </div>
              ))}

              <div className="ml-auto text-right">
                <div className="text-[10px] uppercase tracking-wide text-slate-500
                                font-semibold">Total</div>
                <div className="text-[30px] font-bold text-iip-blue leading-tight">
                  {eur(f.total)}
                </div>
              </div>
            </div>

            {/* L'acompte n'est pas un supplément : il s'impute sur le total
                (art. 16 §3). Le dire évite qu'on l'additionne. */}
            <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap
                            items-center gap-x-6 gap-y-2 text-[12px]">
              <span>
                <span className="text-slate-500">Acompte à l'inscription :</span>{' '}
                <b>{eur(f.acompte)}</b>
              </span>
              <span>
                <span className="text-slate-500">Solde :</span>{' '}
                <b>{eur(f.solde)}</b>
                {f.echeance_solde && (
                  <span className="text-slate-500"> pour le {f.echeance_solde}</span>
                )}
              </span>
              {f.verse != null && (
                <span className={f.verse >= f.total ? 'text-emerald-700' : 'text-amber-700'}>
                  <span className="text-slate-500">Versé :</span>{' '}
                  <b>{eur(f.verse)}</b>
                  {f.verse < f.total && ` · reste ${eur(f.total - f.verse)}`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Droit d'inscription ── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-iip-blue">Droit d'inscription</span>
          <span className="text-[10.5px] text-slate-400">
            Circulaire 9731 · {annee}
            {di.bareme.defaut ? ' · barème par défaut' : ''}
          </span>
        </div>

        <div className="p-4 space-y-3">
          {!di.detail.length ? (
            <div className="text-[12.5px] text-slate-400">
              Aucune UE inscrite pour cette année — le droit d'inscription se calcule sur le programme.
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Montant constaté
                  </div>
                  <div className={`text-[26px] font-bold leading-tight ${di.exonere ? 'text-slate-400 line-through' : 'text-iip-blue'}`}>
                    {eur(di.montant_arrondi)}
                  </div>
                  {di.exonere && (
                    <div className="text-[12px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                      <IconCheck size={13} /> Exonéré — montant dû : 0,00 €
                    </div>
                  )}
                </div>

                <div className="text-[11.5px] text-slate-600 text-right">
                  <div>Forfait : <b>{eur(di.forfait)}</b></div>
                  <div>
                    Secondaire : {di.retenues.secondaire} pér. × {String(di.bareme.tarif_secondaire).replace('.', ',')} €
                    = <b>{eur(di.montant_secondaire)}</b>
                  </div>
                  <div>
                    Supérieur : {di.retenues.superieur} pér. × {String(di.bareme.tarif_superieur).replace('.', ',')} €
                    = <b>{eur(di.montant_superieur)}</b>
                  </div>
                </div>
              </div>

              {di.plafond_atteint && (
                <div className="px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-[11.5px] text-sky-900">
                  Plafond de {di.bareme.plafond_periodes} périodes atteint : {di.periodes.total} périodes
                  au programme, dont {di.retenues.secondaire + di.retenues.superieur} facturées. Les
                  périodes du secondaire sont comptées en premier, conformément à la circulaire.
                </div>
              )}

              <label className="flex items-start gap-2 text-[12.5px]">
                <input type="checkbox" checked={di.exonere} disabled={!peutEcrire || enregistrement}
                  onChange={e => enregistrer({
                    di_exonere: e.target.checked,
                    di_motif: e.target.checked ? (di.motif || motifs_di[0].code) : null,
                  })}
                  className="mt-0.5" />
                <span>Exonéré du paiement</span>
              </label>

              {di.exonere && (
                <select value={di.motif || ''} disabled={!peutEcrire}
                  onChange={e => enregistrer({ di_exonere: true, di_motif: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]">
                  {motifs_di.map(m => <option key={m.code} value={m.code}>{m.libelle}</option>)}
                </select>
              )}

              <button onClick={() => setDetailOuvert(o => !o)}
                className="text-[11.5px] text-slate-500 underline">
                {detailOuvert ? 'Masquer le détail par UE' : `Détail des ${di.detail.length} UE`}
              </button>

              {detailOuvert && (
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b">
                      <th className="py-1 text-left">UE</th>
                      <th className="py-1 text-left w-24">Niveau</th>
                      <th className="py-1 text-right w-20">Périodes</th>
                      <th className="py-1 text-right w-24">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {di.detail.map(d => (
                      <tr key={d.ue_num} className={`border-b border-slate-100 last:border-0 ${d.dispensee ? 'opacity-50' : ''}`}>
                        <td className="py-1">
                          <b className="text-iip-blue">{d.ue_num}</b>
                          <span className="text-slate-600 ml-1.5">{d.ue_nom}</span>
                          {d.dispensee && <span className="ml-1.5 text-[10px] text-violet-600">dispense complète</span>}
                        </td>
                        <td className="py-1 text-slate-500">
                          {d.niveau === 'superieur' ? 'Supérieur' : 'Secondaire'}
                        </td>
                        <td className="py-1 text-right">
                          {d.dispensee
                            ? <span className="text-slate-400 line-through">{d.periodes_brutes}</span>
                            : d.periodes}
                          {!d.dispensee && d.periodes_facturees != null && d.periodes_facturees < d.periodes && (
                            <span className="block text-[9.5px] text-sky-700">{d.periodes_facturees} facturée(s)</span>
                          )}
                        </td>
                        <td className="py-1 text-right">{d.dispensee ? '—' : eur(d.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Droit d'inscription spécifique ── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-iip-blue">Droit d'inscription spécifique</span>
          <span className="text-[10.5px] text-slate-400">A.E. 25-09-1991, art. 2, 4°</span>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11.5px] text-slate-500">
            Dû par les étudiants de nationalité étrangère qui ne relèvent d'aucune des exemptions
            de l'article 1er — notamment les ressortissants de l'Union européenne, qui en sont exemptés.
          </p>

          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" checked={dis.soumis || dis.exempte} disabled={!peutEcrire || enregistrement}
              onChange={e => enregistrer({ dis_soumis: e.target.checked, dis_motif_exemption: null })}
              className="mt-0.5" />
            <span>Étudiant de nationalité étrangère, concerné par ce droit</span>
          </label>

          {(dis.soumis || dis.exempte) && (
            <>
              <select value={dis.motif_exemption || ''} disabled={!peutEcrire}
                onChange={e => enregistrer({ dis_soumis: true, dis_motif_exemption: e.target.value || null })}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px]">
                <option value="">Aucune exemption — droit dû</option>
                {motifs_dis.map(m => <option key={m.code} value={m.code}>{m.libelle}</option>)}
              </select>

              {!dis.exempte && (
                <div className="flex items-end gap-3 flex-wrap">
                  <label className="text-xs">
                    <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Périodes hebdomadaires
                    </span>
                    <input type="number" min="0" step="0.5" defaultValue={dis.periodes_hebdo || ''}
                      disabled={!peutEcrire}
                      onBlur={e => enregistrer({ dis_soumis: true, dis_periodes_hebdo: e.target.value })}
                      className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                  </label>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Montant</div>
                    <div className="text-[20px] font-bold text-iip-blue leading-tight">
                      {eur(dis.montant_du)}
                    </div>
                  </div>
                  {dis.plafond_atteint && (
                    <div className="text-[11px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1">
                      Plafonné à {eur(dis.plafond)}
                    </div>
                  )}
                </div>
              )}

              {dis.exempte && (
                <div className="flex items-center gap-1.5 text-[12.5px] text-emerald-700 font-semibold">
                  <IconCheck size={14} /> Exempté — aucun droit spécifique dû
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
        <IconAlertTriangle size={13} className="mt-0.5 flex-none" />
        Le droit est payé avant le premier dixième de la durée de l'UE : à défaut, l'étudiant
        n'est pas régulier et n'est pas comptabilisé pour l'encadrement ni la dotation.
      </p>
    </div>
  );
}

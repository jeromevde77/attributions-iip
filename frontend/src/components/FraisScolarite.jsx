import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';

/**
 * Frais de scolarité — RDE, titre V, art. 16 à 20.
 *
 * À distinguer du droit d'inscription, qui revient à la Fédération : ces frais
 * sont fixés par l'établissement et lui restent acquis.
 *
 *   frais administratifs = frais fixes + tarif par période du PAE
 *   acompte              = droit d'inscription (+ DIS) + frais fixes
 *   solde                = tarif × périodes, dû pour l'échéance (art. 17 §2)
 *
 * L'acompte n'est PAS un supplément : il s'impute sur le total (art. 16 §3).
 * Le calcul vient du serveur, qui retient les mêmes périodes que le droit
 * d'inscription — mêmes UE, mêmes dispenses — pour que les deux documents ne
 * se contredisent jamais.
 */
export default function FraisScolarite({ etudId, annee }) {
  const [f, setF] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [detailOuvert, setDetailOuvert] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      setF(null); setErreur(null);
      const rep = await fetch(`/api/frais-scolarite/etudiant/${etudId}?annee=${annee}`,
        { headers: authHeaders() });
      if (!vivant) return;
      if (rep.ok) setF(await rep.json());
      else setErreur((await rep.json().catch(() => ({}))).error || 'Calcul indisponible.');
    })();
    return () => { vivant = false; };
  }, [etudId, annee]);

  const eur = n => (n ?? 0).toFixed(2).replace('.', ',') + ' €';
  const num = n => String(n ?? 0).replace('.', ',');

  if (erreur) return <div className="text-[12.5px] text-slate-400">{erreur}</div>;
  if (!f) return <div className="py-4 text-[12.5px] text-slate-400">Calcul en cours…</div>;

  const b = f.bareme || {};
  const soldeRegle = f.verse >= f.total;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200
                      flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[13px] font-semibold text-iip-blue">Calcul des frais</span>
        <span className="text-[10.5px] text-slate-400">
          RDE art. 16 à 20 · {annee}{b.defaut ? ' · barème par défaut' : ''}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* La formule est écrite en toutes lettres : c'est elle qu'on vient
            vérifier quand un étudiant conteste, pas le seul résultat. */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="text-[12px] text-slate-600 space-y-0.5">
            <div>
              Frais fixes : <b>{eur(b.frais_fixes)}</b>
            </div>
            <div>
              Périodes du PAE : <b>{f.periodes}</b> × {num(b.par_periode)} €
              = <b>{eur(f.frais_variables)}</b>
            </div>
            <div className="text-[11px] text-slate-400">
              Hors UE en dispense complète : une unité valorisée n'est pas suivie.
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Frais administratifs
            </div>
            <div className="text-[26px] font-bold text-iip-blue leading-tight">
              {eur(f.frais_administratifs)}
            </div>
          </div>
        </div>

        {/* Ce que l'étudiant verse et quand. L'acompte s'impute sur le total. */}
        <div className="pt-3 border-t border-slate-200 grid gap-3
                        sm:grid-cols-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Acompte à l'inscription
            </div>
            <div className="text-[15px] font-bold text-slate-700">{eur(f.acompte)}</div>
            <div className="text-[10.5px] text-slate-400">
              Droit d'inscription + frais fixes · s'impute sur le total
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Solde
            </div>
            <div className="text-[15px] font-bold text-slate-700">{eur(f.solde)}</div>
            {f.echeance_solde && (
              <div className="text-[10.5px] text-slate-400">
                pour le {f.echeance_solde}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
              Total dû
            </div>
            <div className="text-[15px] font-bold text-iip-blue">{eur(f.total)}</div>
            <div className={`text-[10.5px] font-semibold ${soldeRegle ? 'text-emerald-700' : 'text-amber-700'}`}>
              Versé {eur(f.verse)}
              {!soldeRegle && ` · reste ${eur(f.restant)}`}
            </div>
          </div>
        </div>

        {!f.acompte_verse && f.verse > 0 && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                          text-[11.5px] text-amber-900">
            L'acompte n'est pas entièrement versé : {eur(f.verse)} sur {eur(f.acompte)}.
          </div>
        )}

        {!!(f.paiements && f.paiements.length) && (
          <>
            <button onClick={() => setDetailOuvert(o => !o)}
              className="text-[11.5px] text-slate-500 underline">
              {detailOuvert
                ? 'Masquer les versements'
                : `Détail des ${f.paiements.length} versement(s)`}
            </button>

            {detailOuvert && (
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b">
                    <th className="py-1 text-left w-28">Date</th>
                    <th className="py-1 text-left">Nature</th>
                    <th className="py-1 text-left">Moyen</th>
                    <th className="py-1 text-right w-24">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {f.paiements.map(p => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 text-slate-600">{p.date_paiement || '—'}</td>
                      <td className="py-1 text-slate-600">{p.nature || '—'}</td>
                      <td className="py-1 text-slate-500">{p.moyen || '—'}</td>
                      <td className="py-1 text-right font-semibold">{eur(p.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Le barème complet : ces tarifs-là ne dépendent pas du PAE, mais on
            vient les chercher ici et nulle part ailleurs. */}
        <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-500
                        flex flex-wrap gap-x-5 gap-y-1">
          <span>Duplicata de carte : <b>{eur(b.duplicata_carte)}</b></span>
          <span>Duplicata de document : <b>{eur(b.duplicata_document)}</b></span>
          <span>Copie d'épreuve : <b>{eur(b.copie_epreuve_page)}</b> la page</span>
        </div>
      </div>
    </div>
  );
}

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { saisir, informer } from '../lib/dialogue.jsx';

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

  const [recharge, setRecharge] = useState(0);
  const [qrPaiement, setQrPaiement] = useState(null);
  useEffect(() => {
    if (!f?.virement?.epc) { setQrPaiement(null); return; }
    QRCode.toDataURL(f.virement.epc, { errorCorrectionLevel: 'M', margin: 2, width: 192 }).then(setQrPaiement).catch(() => setQrPaiement(null));
  }, [f?.virement?.epc]);
  const droits = useDroits();
  useEffect(() => {
    let vivant = true;
    (async () => {
      setErreur(null);
      const rep = await fetch(`/api/frais-scolarite/etudiant/${etudId}?annee=${annee}`,
        { headers: authHeaders() });
      if (!vivant) return;
      if (rep.ok) setF(await rep.json());
      else setErreur((await rep.json().catch(() => ({}))).error || 'Calcul indisponible.');
    })();
    return () => { vivant = false; };
  }, [etudId, annee, recharge]);

  const eur = n => (n ?? 0).toFixed(2).replace('.', ',') + ' €';
  async function exonerer(d, motifDonne) {
    let motif = null;
    if (motifDonne !== null) {
      // Une boîte annulée rend null : on n'envoie rien (null, côté serveur, retirerait la dispense).
      motif = await saisir({ titre: 'Dispenser cette demande du forfait', obligatoire: true,
        message: 'Pourquoi cette demande ne paie-t-elle pas le forfait d’analyse ?' });
      if (!String(motif || '').trim()) return;
    }
    const rep = await fetch(`/api/frais-scolarite/va-exoneration/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ motif }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(`❌ ${j.error || 'Refusé'}`); return; }
    setRecharge(x => x + 1);
  }
  const num = n => String(n ?? 0).replace('.', ',');
  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const aujourdHui = () => new Date().toLocaleDateString('sv-SE');
  // Encaisser : la route est admin/éditeur/secrétariat (la direction et le secrétariat passent comme éditeur).
  const peutEncaisser = droits.passe('admin', 'editeur');
  const [saisie, setSaisie] = useState(null);
  async function encaisser() {
    const rep = await fetch('/api/frais-scolarite/paiement', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee, ...saisie, montant: String(saisie.montant).replace(',', '.') }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(`❌ ${j.error || 'Refusé'}`); return; }
    setSaisie(null); setRecharge(x => x + 1);
  }
  async function annulerVersement(p) {
    const motif = await saisir({ titre: `Annuler le versement de ${eur(p.montant)}`, obligatoire: true,
      message: 'Le versement reste lisible, barré, avec ce motif et votre nom.' });
    if (!String(motif || '').trim()) return;
    const rep = await fetch(`/api/frais-scolarite/paiement/${p.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ motif }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(`❌ ${j.error || 'Refusé'}`); return; }
    setRecharge(x => x + 1);
  }

  if (erreur) return <div className="text-sm text-slate-400">{erreur}</div>;
  if (!f) return <div className="py-4 text-sm text-slate-400">Calcul en cours…</div>;

  const b = f.bareme || {};
  const soldeRegle = f.verse >= f.total;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200
                      flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold text-iip-blue">Calcul des frais</span>
        <span className="text-xs text-slate-400">
          RDE art. 16 à 20 · {annee}{b.defaut ? ' · barème par défaut' : ''}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* La formule est écrite en toutes lettres : c'est elle qu'on vient
            vérifier quand un étudiant conteste, pas le seul résultat. */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="text-second text-slate-600 space-y-0.5">
            {f.sans_frais ? (
              <div>Aucun frais d’inscription complémentaire : la section <b>{f.section}</b> n’en perçoit pas
                (Configuration → Coût des périodes).</div>
            ) : (<>
            <div>
              Frais fixes : <b>{eur(b.frais_fixes)}</b>
            </div>
            <div>
              Périodes du PAE : <b>{f.periodes}</b> × {num(b.par_periode)} €
              = <b>{eur(f.frais_variables)}</b>
            </div></>)}
            <div className="text-xs text-slate-400">
              Hors UE en dispense complète : une unité valorisée n'est pas suivie.
            </div>
          </div>

          <div className="text-right">
            <div className="intertitre">
              Frais administratifs
            </div>
            <div className="text-2xl font-bold text-iip-blue leading-tight">
              {eur(f.frais_administratifs)}
            </div>
          </div>
        </div>

        {/* Ce que l'étudiant verse et quand. L'acompte s'impute sur le total. */}
        <div className="pt-3 border-t border-slate-200 grid gap-3
                        sm:grid-cols-3 text-second">
          <div>
            <div className="intertitre">
              Acompte à l'inscription
            </div>
            <div className="text-base font-bold text-slate-700">{eur(f.acompte)}</div>
            <div className="text-xs text-slate-400">
              Droit d'inscription + frais fixes · s'impute sur le total
            </div>
          </div>
          <div>
            <div className="intertitre">
              Solde
            </div>
            <div className="text-base font-bold text-slate-700">{eur(f.solde)}</div>
            {f.echeance_solde && (
              <div className="text-xs text-slate-400">
                pour le {fr(f.echeance_solde)}
              </div>
            )}
          </div>
          <div>
            <div className="intertitre">
              Total dû
            </div>
            <div className="text-base font-bold text-iip-blue">{eur(f.total)}</div>
            <div className={`text-xs font-semibold ${soldeRegle ? 'text-emerald-700' : 'text-amber-700'}`}>
              Versé {eur(f.verse)}
              {!soldeRegle && ` · reste ${eur(f.restant)}`}
            </div>
          </div>
        </div>

        {!f.acompte_verse && f.verse > 0 && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                          text-second text-amber-900">
            L'acompte n'est pas entièrement versé : {eur(f.verse)} sur {eur(f.acompte)}.
          </div>
        )}

        {/* LE FORFAIT D'ANALYSE DES DEMANDES DE VALORISATION (28 octobre 2026). */}
        {f.forfait_va?.demandes?.length > 0 && (
          <div className="border-t border-slate-200 pt-3 space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-iip-blue">Analyse des demandes de valorisation</span>
              <span className="text-sm font-bold">{eur(f.forfait_va.du)}</span>
            </div>
            <div className="text-xs text-slate-500">Chaque demande se compare aux frais d’inscription de SON unité : non inscrit,
              {` ${eur(f.forfait_va.par_ue)}`} ; frais de l’unité plus bas, portés à ce montant ; sinon {eur(f.forfait_va.supplement_ue)}. Admission : {eur(f.forfait_va.forfait_admission)}.</div>
            <table className="w-full text-second">
              <tbody>{f.forfait_va.demandes.map(d => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1">{d.nature === 'admission' ? 'Admission' : `${d.nature} · UE ${d.ue_num}${d.ue_nom ? ` — ${d.ue_nom}` : ''}`}</td>
                  <td className="py-1 text-slate-500">{d.exoneree ? `dispensée du forfait : ${d.exo_motif}` : d.calcul}</td>
                  <td className="py-1 text-right font-semibold whitespace-nowrap">{d.exoneree ? '—' : eur(d.du)}</td>
                  <td className="py-1 text-right">
                    {droits.passe('admin', 'editeur') && (d.exoneree
                      ? <button type="button" className="bouton h-7 px-2" onClick={() => exonerer(d, null)}>Rétablir</button>
                      : <button type="button" className="bouton h-7 px-2" onClick={() => exonerer(d)}>Dispenser…</button>)}
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}

        {/* COMMENT PAYER (3.1.444) : la communication structurée rattache le virement à ce
            dossier quand l'extrait de compte est importé — Étudiants → Extraits de compte. */}
        {f.virement?.communication && (
          <div className="border-t border-slate-200 pt-3 text-second text-slate-600 flex flex-wrap items-center gap-x-6 gap-y-1">
            {qrPaiement && <img src={qrPaiement} alt="QR code de paiement" width={96} height={96}
              title="À scanner avec l’application bancaire : compte, montant et communication se remplissent seuls." />}
            <div className="flex flex-col gap-1">
              <span>Communication structurée : <b className="text-iip-blue tabular-nums select-all">{f.virement.communication}</b></span>
              <span>Compte : {f.virement.iban ? <b className="select-all">{f.virement.iban}</b>
                : <span className="text-amber-700">à renseigner dans Configuration → Identité (sans lui, pas de QR code)</span>}</span>
              {f.virement.montant && f.virement.epc && <span>Le QR code porte <b>{eur(f.virement.montant)}</b>{f.acompte_verse ? '' : ' (acompte)'}.</span>}
            </div>
          </div>
        )}

        {/* LES VERSEMENTS (3.1.437) : la route existait, aucun écran ne l'appelait — les
            versements ne s'encodaient donc pas, et « reste à payer » était faux pour tous.
            Un versement s'ANNULE avec un motif, il ne s'efface pas. */}
        <div className="border-t border-slate-200 pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-iip-blue">Versements</span>
            {peutEncaisser && !saisie && (
              <button type="button" className="bouton h-8" onClick={() => setSaisie({ date_paiement: aujourdHui(),
                montant: f.restant > 0 ? String(f.acompte_verse ? f.restant : Math.min(f.restant, f.acompte - f.verse)).replace('.', ',') : '',
                nature: f.acompte_verse ? 'solde' : 'acompte', moyen: 'virement', remarque: '' })}>Encoder un versement</button>)}
          </div>
          {saisie && (
            <div className="flex flex-wrap items-end gap-2 text-second">
              <label className="flex flex-col gap-0.5">Date
                <input type="date" className="controle" value={saisie.date_paiement} onChange={e => setSaisie(x => ({ ...x, date_paiement: e.target.value }))} /></label>
              <label className="flex flex-col gap-0.5">Montant (€)
                <input className="controle w-28 text-right" inputMode="decimal" value={saisie.montant} onChange={e => setSaisie(x => ({ ...x, montant: e.target.value }))} /></label>
              <label className="flex flex-col gap-0.5">Nature
                <select className="controle" value={saisie.nature} onChange={e => setSaisie(x => ({ ...x, nature: e.target.value }))}>
                  {[['acompte', 'Acompte'], ['solde', 'Solde'], ['analyse_va', 'Analyse VA'], ['duplicata', 'Duplicata'], ['autre', 'Autre'], ['remboursement', 'Remboursement (négatif)']]
                    .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></label>
              <label className="flex flex-col gap-0.5">Moyen
                <select className="controle" value={saisie.moyen} onChange={e => setSaisie(x => ({ ...x, moyen: e.target.value }))}>
                  {[['virement', 'Virement'], ['bancontact', 'Bancontact'], ['especes', 'Espèces'], ['autre', 'Autre']]
                    .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></label>
              <label className="flex flex-col gap-0.5 flex-1 min-w-[10rem]">Remarque
                <input className="controle" value={saisie.remarque} placeholder="communication du virement…" onChange={e => setSaisie(x => ({ ...x, remarque: e.target.value }))} /></label>
              <button type="button" className="bouton bouton-fort h-9" onClick={encaisser}>Enregistrer</button>
              <button type="button" className="bouton h-9" onClick={() => setSaisie(null)}>Annuler</button>
            </div>)}
          {f.paiements.length ? (
            <table className="w-full text-second">
              <thead>
                <tr className="intertitre border-b">
                  <th className="py-1 text-left w-28">Date</th>
                  <th className="py-1 text-left">Nature</th>
                  <th className="py-1 text-left">Moyen</th>
                  <th className="py-1 text-left">Encodé par</th>
                  <th className="py-1 text-right w-24">Montant</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {f.paiements.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 text-slate-600">{fr(p.date_paiement)}</td>
                    <td className="py-1 text-slate-600">{p.nature || '—'}{p.remarque ? <span className="text-slate-400"> · {p.remarque}</span> : ''}</td>
                    <td className="py-1 text-slate-500">{p.moyen || '—'}</td>
                    <td className="py-1 text-slate-500">{p.encode_par || '—'}</td>
                    <td className="py-1 text-right font-semibold">{eur(p.montant)}</td>
                    <td className="py-1 text-right">{peutEncaisser && (
                      <button type="button" className="text-xs text-slate-400 hover:text-iip-texte underline" onClick={() => annulerVersement(p)}>annuler</button>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-second text-slate-400 m-0">Aucun versement encodé.</p>}
          {!!f.paiements_annules?.length && (
            <button type="button" onClick={() => setDetailOuvert(o => !o)} className="text-second text-slate-500 underline">
              {detailOuvert ? 'Masquer les versements annulés' : `${f.paiements_annules.length} versement(s) annulé(s)`}
            </button>)}
          {detailOuvert && f.paiements_annules?.map(p => (
            <div key={p.id} className="text-second text-slate-500">
              <span className="line-through decoration-slate-400">{fr(p.date_paiement)} · {p.nature} · {eur(p.montant)}</span>
              {' '}— annulé le {fr(String(p.annule_le).slice(0, 10))} par {p.annule_par} : {p.annule_motif}
            </div>))}
        </div>

        {/* Le barème complet : ces tarifs-là ne dépendent pas du PAE, mais on
            vient les chercher ici et nulle part ailleurs. */}
        <div className="pt-3 border-t border-slate-200 text-xs text-slate-500
                        flex flex-wrap gap-x-5 gap-y-1">
          <span>Duplicata de carte : <b>{eur(b.duplicata_carte)}</b></span>
          <span>Duplicata de document : <b>{eur(b.duplicata_document)}</b></span>
          <span>Copie d'épreuve : <b>{eur(b.copie_epreuve_page)}</b> la page</span>
        </div>
      </div>
    </div>
  );
}

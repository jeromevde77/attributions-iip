/**
 * LE RAPPORT STATISTIQUE, EN OUTIL (Charles, 8 octobre 2026 : « ce ne doit PAS
 * être une feuille mise en page, mais un outil comme les statistiques de
 * résultats… avec par la suite un print ou un envoi mis en page »).
 *
 * Les chiffres se lisent à l'écran — tuiles, anneau, barres, tableaux qu'on
 * déplie — et la pièce mise en page ne sort qu'au moment d'imprimer ou
 * d'envoyer. Les deux lisent le MÊME calcul (donneesCout + syntheseCout, côté
 * serveur) : l'écran et le papier ne peuvent pas différer.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconSend, IconRefresh, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Tuile } from './statsUi.jsx';
import InscritsPrevus from './InscritsPrevus.jsx';

const eur = n => `${Math.round(n || 0).toLocaleString('fr-BE')} €`;
const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const keur = n => `${Math.round((n || 0) / 1000).toLocaleString('fr-BE')} k€`;
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');
const e2 = n => (n ? n.toFixed(2).replace('.', ',') : '—');
const HELB = '#B83280';

function BadgeHelb({ libelle = 'HELB' }) {
  return <span className="ml-1.5 text-[10px] font-bold text-white rounded px-1.5 py-px align-middle" style={{ background: HELB }}>{libelle}</span>;
}

/** Un anneau : les parts d'un tout, la légende avec les pourcentages. */
function Anneau({ parts, total, centre }) {
  const t = total ?? parts.reduce((a, p) => a + p.valeur, 0);
  const R = 56, r = 34, C = 70;
  let angle = -Math.PI / 2;
  const arc = p => {
    const a0 = angle, a1 = angle + (t ? (p.valeur / t) * Math.PI * 2 : 0); angle = a1;
    const grand = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad, a) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M ${pt(R, a0)} A ${R} ${R} 0 1 1 ${pt(R, a0 + Math.PI)} A ${R} ${R} 0 1 1 ${pt(R, a0)} M ${pt(r, a0)} A ${r} ${r} 0 1 0 ${pt(r, a0 + Math.PI)} A ${r} ${r} 0 1 0 ${pt(r, a0)} Z`;
    return `M ${pt(R, a0)} A ${R} ${R} 0 ${grand} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${grand} 0 ${pt(r, a0)} Z`;
  };
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 140 140" className="w-36 h-36 flex-none" role="img" aria-label={parts.map(p => `${p.nom} ${pc(p.valeur, t)}`).join(', ')}>
        {parts.filter(p => p.valeur > 0).map(p => <path key={p.nom} d={arc(p)} style={{ fill: p.couleur }} fillRule="evenodd" />)}
        <text x={C} y={C + 5} textAnchor="middle" fontSize="15" fontWeight="700" style={{ fill: 'var(--c-texte, #16406A)' }}>{centre}</text>
      </svg>
      <ul className="m-0 p-0 list-none space-y-1 text-[12px] min-w-0">
        {parts.filter(p => p.valeur > 0).map(p => (
          <li key={p.nom} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: p.couleur }} />
            <span className="truncate">{p.nom}</span>
            <b className="tabular-nums ml-auto pl-2">{pc(p.valeur, t)}</b>
          </li>))}
      </ul>
    </div>);
}

/** Des barres horizontales, à l'échelle de la plus grande. */
function Barres({ lignes, couleur = 'var(--c-principal, #19537E)', format = eur }) {
  const max = Math.max(1, ...lignes.map(l => l.valeur));
  return (
    <div className="space-y-1.5">
      {lignes.map(l => (
        <div key={l.nom} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[12px]">
          <span className="truncate">{l.nom}</span>
          <div className="h-3 rounded bg-slate-100 overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(l.valeur / max) * 100}%`, background: l.couleur || couleur }} />
          </div>
          <span className="tabular-nums text-right w-24">{format(l.valeur)}</span>
        </div>))}
    </div>);
}

function Carte({ titre, sous, children, className = '' }) {
  return (
    <section className={`carte p-4 space-y-3 ${className}`}>
      {titre && <div><div className="text-[15px] font-semibold text-iip-blue">{titre}</div>
        {sous && <div className="text-[12px] text-slate-500">{sous}</div>}</div>}
      {children}
    </section>);
}

const Th = ({ children, n }) => <th className={`px-2 py-1.5 font-semibold ${n ? 'text-right' : 'text-left'}`}>{children}</th>;
const Td = ({ children, n, b, className = '', ...reste }) => <td {...reste} className={`px-2 py-1.5 ${n ? 'text-right tabular-nums' : ''} ${b ? 'font-semibold' : ''} ${className}`}>{children}</td>;

export default function RapportStatistique() {
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [tour, setTour] = useState(0);
  const [ouvertes, setOuvertes] = useState({});
  const [impression, setImpression] = useState(false);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => (r.ok ? r.json() : []))
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code || a).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => {
    let vivant = true;
    setEnCours(true); setErreur(null);
    fetch(`/api/rapports/cout-formations/donnees?annee=${encodeURIComponent(annee)}`, { headers: authHeaders({ 'X-Annee': annee }) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) setD(j); })
      .catch(e => { if (vivant) setErreur(e.message); })
      .finally(() => { if (vivant) setEnCours(false); });
    return () => { vivant = false; };
  }, [annee, tour]);

  // LA PIÈCE MISE EN PAGE, au moment de sortir : imprimer, PDF, envoyer.
  async function imprimer() {
    setImpression(true);
    try {
      const r = await fetch('/api/rapports/cout-formations/document', { method: 'POST', headers: authHeaders({ 'X-Annee': annee }), body: JSON.stringify({ annee }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      ouvrirApercu({ html: j.html, titre: j.titre, nomFichier: j.nom, envoiPossible: true, pdf: { orientation: 'paysage' } });
    } catch (e) { setErreur(e.message); } finally { setImpression(false); }
  }

  const Y = d?.synthese;
  const T = d?.total || {};
  const R = d?.recettes || {};
  const ins = d?.base_inscrits || 0;
  const percu = (R.di || 0) + (R.frais || 0);
  const sections = d?.sections || [];
  const parEtu = useMemo(() => sections.filter(S => S.inscrits && S.cout_complet)
    .map(S => ({ nom: S.section, valeur: S.cout_complet / S.inscrits })).sort((a, b) => b.valeur - a.valeur), [d]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={annee} onChange={e => setAnnee(e.target.value)} className="controle" title="Année académique">
          {[...new Set([annee, ...annees])].map(a => <option key={a}>{a}</option>)}
        </select>
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setTour(t => t + 1)} disabled={enCours}>
          <IconRefresh size={15} /> {enCours ? 'Calcul…' : 'Recalculer'}</button>
        <span className="flex-1" />
        <button type="button" className="bouton-sortir controle inline-flex items-center gap-1.5" disabled={!d || impression} onClick={imprimer}
          title="La pièce mise en page (A4 paysage) : imprimer, PDF ou envoyer">
          <IconSend size={15} /> {impression ? 'Composition…' : 'Imprimer ou envoyer'}</button>
      </div>
      <div className="carte-plate">
        <InscritsPrevus replie annee={annee} onEnregistre={() => setTour(t => t + 1)} />
      </div>
      {erreur && <div className="bloc-etat px-3 py-2 text-[13px]" data-etat="corriger">{erreur}</div>}
      {!d ? <p className="text-[13px] text-slate-400">{enCours ? 'Calcul du rapport…' : ''}</p> : (<>
        <div className="bloc-etat px-3 py-2 text-[12px] text-slate-600" data-etat="neutre">
          Montants au <b>coût de convention</b> : ce que coûte une période quand l'établissement doit l'acheter à la Fédération —
          pas les traitements réellement versés. Un membre du personnel absent peut être remplacé <b>sans coût supplémentaire</b> à
          partir de {d.remplacement_jours} jours ouvrables d'absence (circ. 9760, III.2.8).
        </div>

        <div className="flex flex-wrap gap-2">
          <Tuile valeur={eur(T.cout_complet)} libelle="Coût complet" precision={`${sections.length} section(s)`} ton="fort" />
          <Tuile valeur={eur(T.cout)} libelle="Cours" precision={`${k0(T.periodes)} périodes`} />
          <Tuile valeur={eur(T.cout_fonctions)} libelle="Fonctions" precision={`${d.nb_fonctions} fonction(s) encodée(s)`} />
          <Tuile valeur={e2(Y.etp_total.total)} libelle="ETP enseignants" precision={`${e2(Y.etp_total.cc)} CC · ${e2(Y.etp_total.exp)} EXP`} />
          <Tuile valeur={ins ? eur(T.cout_complet / ins) : '—'} libelle="Par étudiant" precision={`${k0(ins)} inscrits`} />
          <Tuile valeur={eur(percu)} libelle="Perçu (DI et frais)" precision={`couvre ${pc(percu, T.cout_complet)} du coût`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Carte titre="Coût complet — poste par poste" sous={`HELB comprise : ${eur(Y.cout_helb_total)}${Y.cout_en_periodes ? ' · * payées par des périodes, comprises dans les cours' : ''}`}>
            <Anneau parts={Y.postes} centre={keur(T.cout_complet)} />
          </Carte>
          <Carte titre="Coût complet par section">
            <Barres lignes={sections.filter(S => S.cout_complet).map(S => ({ nom: S.section, valeur: S.cout_complet }))} />
          </Carte>
          <Carte titre="Coût complet par étudiant inscrit">
            <Barres lignes={parEtu} couleur="#05B7E6" />
          </Carte>
        </div>

        {Y.cmb?.lignes?.length > 0 && (
        <Carte titre="Coût moyen brut pondéré, par niveau" sous="Total des périodes attribuées × une seule valeur par niveau — la lecture de la Haute École, à côté du coût détaillé de la circulaire.">
          <div className="overflow-x-auto">
          <table className="text-[13px] min-w-full">
            <thead className="tab-entete"><tr><Th>Niveau</Th><Th n>Périodes IIP</Th><Th n>Périodes HELB</Th><Th n>Total</Th><Th n>Coût moyen / période</Th>
              <Th n>Montant IIP</Th><Th n>Montant HELB</Th><Th n>Montant total</Th><Th n>Coût détaillé</Th></tr></thead>
            <tbody>{Y.cmb.lignes.map(l => (
              <tr key={l.niveau} className="border-b border-slate-100">
                <Td>{l.libelle}</Td><Td n>{k0(l.per_iip)}</Td><Td n>{l.per_helb ? k0(l.per_helb) : '—'}</Td><Td n b>{k0(l.periodes)}</Td>
                <Td n>{l.taux ? `${l.taux.toFixed(2).replace('.', ',')} €` : <i className="text-amber-700">à régler</i>}</Td>
                <Td n>{l.taux ? eur(l.montant_iip) : '—'}</Td><Td n>{l.taux && l.per_helb ? eur(l.montant_helb) : '—'}</Td>
                <Td n b>{l.taux ? eur(l.montant) : '—'}</Td><Td n>{eur(l.cout_detaille)}</Td>
              </tr>))}</tbody>
            {Y.cmb.lignes.length > 1 && (
            <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble{Y.cmb.a_regler.length ? ' — montants des niveaux chiffrés seulement' : ''}</Td>
              <Td n>{k0(Y.cmb.lignes.reduce((a, l) => a + l.per_iip, 0))}</Td><Td n>{k0(Y.cmb.lignes.reduce((a, l) => a + l.per_helb, 0))}</Td>
              <Td n>{k0(Y.cmb.total.periodes)}</Td><Td /><Td n>{eur(Y.cmb.total.montant_iip)}</Td><Td n>{eur(Y.cmb.total.montant_helb)}</Td>
              <Td n>{eur(Y.cmb.total.montant)}</Td><Td n>{eur(Y.cmb.total.cout_detaille)}</Td></tr></tfoot>)}
          </table></div>
          {Y.cmb.a_regler.length > 0 && (
            <p className="text-[12px] text-slate-600 mt-2">Coût moyen brut à régler pour <b>{Y.cmb.a_regler.join(', ')}</b> dans
              Configuration → Coût des périodes : ses périodes sont comptées, sans montant.</p>)}
        </Carte>)}

        <Carte titre="Les ETP par section" sous="Périodes CT ÷ 800 + PP ÷ 1 000, comme Pilotage — hors congés et activités Z ; le tronc commun réparti au prorata des étudiants.">
          <div className="overflow-x-auto">
          <table className="text-[13px] min-w-full">
            <thead className="tab-entete"><tr><Th>Section</Th><Th n>ETP total</Th><Th n>dont CC</Th><Th n>dont EXP</Th><Th n>% CC</Th><Th>Répartition</Th>
              {Y.etp_total.autre > 0 && <Th n>Sans statut</Th>}</tr></thead>
            <tbody>{Y.etp.map(E => (
              <tr key={E.section} className="border-b border-slate-100">
                <Td>{E.section}</Td><Td n b>{e2(E.total)}</Td><Td n>{e2(E.cc)}</Td><Td n>{e2(E.exp)}</Td><Td n>{pc(E.cc, E.total)}</Td>
                <Td><div className="flex h-2.5 w-40 rounded overflow-hidden bg-slate-100">
                  <div style={{ width: pc(E.cc, E.total), background: '#19537E' }} /><div style={{ width: pc(E.exp, E.total), background: '#05B7E6' }} /></div></Td>
                {Y.etp_total.autre > 0 && <Td n>{e2(E.autre)}</Td>}
              </tr>))}</tbody>
            <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble</Td><Td n>{e2(Y.etp_total.total)}</Td><Td n>{e2(Y.etp_total.cc)}</Td><Td n>{e2(Y.etp_total.exp)}</Td>
              <Td n>{pc(Y.etp_total.cc, Y.etp_total.total)}</Td><Td><span className="text-[11px] text-slate-500 font-normal">
                <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: '#19537E' }} />CC
                <span className="inline-block w-2 h-2 rounded-sm ml-3 mr-1" style={{ background: '#05B7E6' }} />EXP</span></Td>
              {Y.etp_total.autre > 0 && <Td n>{e2(Y.etp_total.autre)}</Td>}</tr></tfoot>
          </table></div>
        </Carte>

        <Carte titre="Section par section" sous="Coût des cours, part des fonctions au prorata des inscrits, coût complet et par étudiant.">
          <div className="overflow-x-auto">
          <table className="text-[13px] min-w-full">
            <thead className="tab-entete"><tr><Th>Section</Th><Th n>Cours</Th><Th n>dont CC</Th><Th n>dont EXP</Th><Th n>dont HELB</Th><Th n>Inscrits</Th><Th n>Fonctions</Th><Th n>Complet</Th><Th n>Par étudiant</Th></tr></thead>
            <tbody>{sections.map(S => (
              <tr key={S.section} className="border-b border-slate-100">
                <Td>{S.section}</Td><Td n>{eur(S.cout)}</Td><Td n>{eur(S.statuts?.CC?.cout)}</Td><Td n>{eur(S.statuts?.EXP?.cout)}</Td>
                <Td n>{S.cout_helb ? eur(S.cout_helb) : '—'}</Td>
                <Td n>{S.inscrits ? k0(S.inscrits) : '—'}{S.inscrits_prevus ? <span className="text-[10px] text-slate-400"> prévu</span> : ''}</Td>
                <Td n>{S.part_fonctions ? eur(S.part_fonctions) : '—'}</Td><Td n b>{eur(S.cout_complet)}</Td>
                <Td n>{S.inscrits ? eur(S.cout_complet / S.inscrits) : '—'}</Td>
              </tr>))}</tbody>
            <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble</Td><Td n>{eur(T.cout)}</Td><Td n>{eur(d.statuts?.CC?.cout)}</Td><Td n>{eur(d.statuts?.EXP?.cout)}</Td>
              <Td n>{eur(T.cout_helb)}</Td><Td n>{k0(ins)}</Td><Td n>{eur(T.cout_fonctions)}</Td><Td n>{eur(T.cout_complet)}</Td><Td n>{ins ? eur(T.cout_complet / ins) : '—'}</Td></tr></tfoot>
          </table></div>
        </Carte>

        <Carte titre="Droits d'inscription et frais" sous="Le calcul de la fiche Frais de scolarité de chaque étudiant ; le DIS revient à la Fédération.">
          <div className="overflow-x-auto">
          <table className="text-[13px] min-w-full">
            <thead className="tab-entete"><tr><Th>Section</Th><Th n>DI</Th><Th n>DIS</Th><Th n>Frais adm.</Th><Th n>Total dû</Th><Th n>Versé</Th><Th n>Par étudiant</Th></tr></thead>
            <tbody>{sections.filter(S => { const x = S.recettes || {}; return x.di || x.dis || x.frais || x.verse || S.recettes_tiers || S.inscrits; }).map(S => {
              const x = S.recettes || {}; const du = (x.di || 0) + (x.dis || 0) + (x.frais || 0); const t = S.recettes_tiers;
              return [
                (du || x.verse || !t) && <tr key={S.section} className="border-b border-slate-100">
                  <Td>{S.section}</Td><Td n>{k0(x.di)}</Td><Td n>{k0(x.dis)}</Td><Td n>{k0(x.frais)}</Td><Td n b>{k0(du)}</Td><Td n>{k0(x.verse)}</Td>
                  <Td n>{S.inscrits ? k0(du / S.inscrits) : '—'}</Td></tr>,
                t && <tr key={`${S.section}|tiers`} className="border-b border-slate-100">
                  <Td>{S.section}<BadgeHelb libelle={t.payeur || 'HELB'} /><span className="text-[11px] text-slate-500"> perçu par {t.payeur} · {t.etudiants} étudiant(s)</span></Td>
                  <Td n>0</Td><Td n>0</Td><Td n>0</Td><Td n b>0</Td><Td n>0</Td><Td n>0</Td></tr>,
              ]; })}</tbody>
            <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble — perçu par l'établissement</Td><Td n>{k0(R.di)}</Td><Td n>{k0(R.dis)}</Td><Td n>{k0(R.frais)}</Td>
              <Td n>{k0((R.di || 0) + (R.dis || 0) + (R.frais || 0))}</Td><Td n>{k0(R.verse)}</Td>
              <Td n>{R.etudiants ? k0(((R.di || 0) + (R.dis || 0) + (R.frais || 0)) / R.etudiants) : '—'}</Td></tr></tfoot>
          </table></div>
        </Carte>

        <Carte titre="Personnel administratif et coordinations" sous="Regroupés par fonction, sans les noms ; la part HELB a sa propre ligne.">
          {!Y.fonctions.length ? <p className="text-[13px] text-slate-500 m-0">Aucune fonction encodée pour cette année (onglet Fonctions de la fiche du personnel).</p> : (
          <div className="overflow-x-auto">
          <table className="text-[13px] min-w-full">
            <thead className="tab-entete"><tr><Th>Fonction</Th><Th>Portée</Th><Th n>Personnes</Th><Th n>ETP</Th><Th>Calcul</Th><Th n>Coût</Th></tr></thead>
            <tbody>{Y.fonctions.map((g, i) => (
              <tr key={i} className="border-b border-slate-100">
                <Td>{g.fonction}{g.helb && <BadgeHelb />}</Td><Td>{g.portees.join(', ')}</Td><Td n>{g.personnes}</Td>
                <Td n>{g.etp ? String(Math.round(g.etp * 100) / 100).replace('.', ',') : <span className="text-slate-400">à régler</span>}</Td>
                <Td className="text-[12px] text-slate-600">{g.calcul || (g.mode === 'periodes' ? 'payée par les périodes attribuées — aucune ligne de coordination à son nom' : 'ETP à régler (onglet Fonctions)')}</Td>
                <Td n>{g.cout ? eur(g.cout) : g.cout_periodes ? <i>{eur(g.cout_periodes)} *</i> : '—'}</Td>
              </tr>))}</tbody>
            <tfoot>
              <tr className="font-semibold bg-slate-50"><Td>Ensemble des fonctions</Td><Td /><Td /><Td /><Td>{Y.fonctions.some(g => g.helb) ? `dont HELB ${eur(Y.fonctions.filter(g => g.helb).reduce((a, g) => a + g.cout, 0))}` : ''}</Td><Td n>{eur(T.cout_fonctions)}</Td></tr>
              {Y.cout_en_periodes > 0 && <tr><Td className="text-[12px] text-slate-500" colSpan={5}>* payées par des périodes attribuées — déjà comprises dans le coût des cours, hors total</Td><Td n><i>{eur(Y.cout_en_periodes)} *</i></Td></tr>}
            </tfoot>
          </table></div>)}
        </Carte>

        {d.humains && (
          <Carte titre="Femmes et hommes" sous="Des personnes présentes : étudiants inscrits (hors archivés), personnel qui porte une attribution ou une fonction.">
            <div className="grid gap-4 lg:grid-cols-2">
              {[['Étudiants', 'etudiants'], ['Personnel', 'personnel']].map(([lib, k]) => (
                <div key={k} className="overflow-x-auto">
                  <div className="text-[13px] font-semibold mb-1">{lib}</div>
                  <table className="text-[13px] min-w-full">
                    <thead className="tab-entete"><tr><Th>Section</Th><Th n>Personnes</Th><Th n>Femmes</Th><Th n>Hommes</Th><Th n>% F</Th></tr></thead>
                    <tbody>{d.humains.lignes.filter(l => l[k]?.n).map(l => { const x = l[k]; const c = (x.n || 0) - (x.sexe_inconnu || 0); return (
                      <tr key={l.section} className="border-b border-slate-100"><Td>{l.section}</Td><Td n>{k0(x.n)}</Td><Td n>{k0(x.F)}</Td><Td n>{k0(x.M)}</Td><Td n>{pc(x.F || 0, c)}</Td></tr>); })}</tbody>
                    <tfoot>{(() => { const x = d.humains.ensemble?.[k] || {}; const c = (x.n || 0) - (x.sexe_inconnu || 0); return (
                      <tr className="font-semibold bg-slate-50"><Td>Ensemble (chacun une fois)</Td><Td n>{k0(x.n)}</Td><Td n>{k0(x.F)}</Td><Td n>{k0(x.M)}</Td><Td n>{pc(x.F || 0, c)}</Td></tr>); })()}</tfoot>
                  </table>
                </div>))}
            </div>
          </Carte>)}

        <Carte titre="Unité par unité" sous="Le coût de chaque unité, section par section — cliquez une section pour la déplier.">
          <div className="divide-y divide-slate-100">
            {sections.filter(S => S.ues?.length).map(S => {
              const o = !!ouvertes[S.section];
              return (
                <div key={S.section}>
                  <button type="button" onClick={() => setOuvertes(x => ({ ...x, [S.section]: !o }))}
                    className="w-full flex items-center gap-2 py-2 text-left text-[13px]">
                    {o ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                    <b>{S.section}</b><span className="text-slate-500">{S.ues.length} unité(s) · {eur(S.cout)} · {pc(S.statuts?.CC?.periodes, S.periodes)} CC</span>
                  </button>
                  {o && (
                    <table className="text-[13px] min-w-full mb-3">
                      <thead className="tab-entete"><tr><Th>Unité</Th><Th n>Niveau</Th><Th n>Périodes</Th><Th n>% CC</Th><Th n>Coût</Th></tr></thead>
                      <tbody>{S.ues.map(u => (
                        <tr key={u.ue_num} className="border-b border-slate-100">
                          <Td>UE {u.ue_num} — {u.ue_nom}{u.part ? <span className="text-[11px] text-slate-500"> · partagée : {Math.round(u.part * 100)} %</span> : null}</Td>
                          <Td n>{u.niveau || '—'}</Td><Td n>{k0(u.periodes)}</Td><Td n>{pc(u.statuts?.CC?.periodes, u.periodes)}</Td><Td n b>{eur(u.cout)}</Td>
                        </tr>))}</tbody>
                    </table>)}
                </div>);
            })}
          </div>
        </Carte>
      </>)}
    </div>
  );
}

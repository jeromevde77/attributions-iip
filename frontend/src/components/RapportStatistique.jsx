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
import { Chevron } from './ui.jsx';
import { IconSend, IconRefresh, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Tuile } from './statsUi.jsx';
import InscritsPrevus from './InscritsPrevus.jsx';
import { Anneau, Barres as BarresMaison } from './graphiques.jsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

const eur = n => `${Math.round(n || 0).toLocaleString('fr-BE')} €`;
const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const keur = n => `${Math.round((n || 0) / 1000).toLocaleString('fr-BE')} k€`;
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');
const e2 = n => (n ? n.toFixed(2).replace('.', ',') : '—');
const HELB = 'var(--c-helb)';

function BadgeHelb({ libelle = 'HELB' }) {
  return <span className="ml-1.5 text-mention font-bold text-white rounded px-1.5 py-px align-middle" style={{ background: HELB }}>{libelle}</span>;
}

// L'anneau et les barres sont ceux de la maison (components/graphiques.jsx, 3.1.261).
const Barres = props => <BarresMaison format={eur} {...props} />;

function Carte({ titre, sous, children, className = '' }) {
  return (
    <section className={`carte p-4 space-y-3 ${className}`}>
      {titre && <div><div className="text-base font-semibold text-iip-blue">{titre}</div>
        {sous && <div className="text-second text-slate-500">{sous}</div>}</div>}
      {children}
    </section>);
}

const Th = ({ children, n }) => <th className={`px-2 py-1.5 font-semibold ${n ? 'text-right' : 'text-left'}`}>{children}</th>;
const Td = ({ children, n, b, className = '', ...reste }) => <td {...reste} className={`px-2 py-1.5 ${n ? 'text-right tabular-nums' : ''} ${b ? 'font-semibold' : ''} ${className}`}>{children}</td>;


/* LES PERSONNES — SEXE ET NATIONALITÉS (Charles, 8 octobre 2026 : « tu n'affiches
   plus ou pas les données liées au sexe ni aux nationalités »). Des personnes
   présentes : étudiants inscrits (hors archivés), personnel qui porte une
   attribution ou une fonction ; l'ensemble compte chacun une fois. Les
   pourcentages portent sur ce qui est renseigné, et l'écran dit combien l'est. */
const COUL_SEXE = { F: 'var(--g-3)', M: 'var(--g-1)', X: 'var(--g-2)', NR: 'var(--g-vide)' };
const COUL_NAT = { be: 'var(--g-1)', ue: 'var(--g-2)', hors_ue: 'var(--g-3)', nat_inconnue: 'var(--g-vide)' };
function Personnes({ d }) {
  const [qui, setQui] = useState('etudiants');
  const H = d.humains;
  if (!H) return (
    <Carte titre="Les personnes — sexe et nationalités">
      <div className="bloc-etat px-3 py-2 text-sm" data-etat="surveiller">
        Les chiffres des personnes n'ont pas pu être calculés{d.humains_erreur ? ` : ${d.humains_erreur}` : ''}.
      </div>
    </Carte>);
  const x = H.ensemble?.[qui] || {};
  const sexeC = (x.n || 0) - (x.sexe_inconnu || 0);
  const natC = (x.n || 0) - (x.nat_inconnue || 0);
  const pays = Object.entries(x.pays || {}).sort((a, b) => b[1] - a[1]);
  return (
    <Carte titre="Les personnes — sexe et nationalités"
      sous="Des personnes présentes : étudiants inscrits (hors archivés), personnel qui porte une attribution ou une fonction. L'ensemble compte chacun une fois.">
      <div className="segments w-fit">
        {[['etudiants', 'Étudiants'], ['personnel', 'Personnel']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setQui(k)}
            className={`px-3 py-1 text-second ${qui === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <div className="text-sm font-semibold mb-1">Femmes et hommes <span className="text-slate-500 font-normal">· {k0(x.n)} personnes</span></div>
          <Anneau centre={k0(x.n)} parts={[['Femmes', x.F, 'F'], ['Hommes', x.M, 'M'], ['X', x.X, 'X'], ['Non renseigné', x.sexe_inconnu, 'NR']]
            .map(([nom, v, k]) => ({ nom, valeur: v || 0, couleur: COUL_SEXE[k] }))} />
          <div className="text-xs text-slate-500 mt-1">{pc(x.F || 0, sexeC)} de femmes parmi les {k0(sexeC)} dont le sexe est renseigné.</div>
        </div>
        <div>
          <div className="text-sm font-semibold mb-1">Nationalités</div>
          <Anneau centre={k0(x.n)} parts={[['Belgique', x.be, 'be'], ['Union européenne', x.ue, 'ue'], ['Hors Union européenne', x.hors_ue, 'hors_ue'], ['Non renseignée', x.nat_inconnue, 'nat_inconnue']]
            .map(([nom, v, k]) => ({ nom, valeur: v || 0, couleur: COUL_NAT[k] }))} />
          <div className="text-xs text-slate-500 mt-1">Nationalité renseignée pour {k0(natC)} sur {k0(x.n)}{x.nat_inconnue ? ' — à compléter dans les fiches' : ''}.</div>
        </div>
        <div>
          <div className="text-sm font-semibold mb-1">Les pays <span className="text-slate-500 font-normal">· {pays.length}</span></div>
          {!pays.length ? <p className="text-second text-slate-500 m-0">Aucune nationalité renseignée.</p> : (
            <Barres lignes={pays.slice(0, 12).map(([nom, v]) => ({ nom, valeur: v, couleur: nom === 'Belgique' ? COUL_NAT.be : '#5E9C8B' }))} format={v => `${k0(v)} · ${pc(v, natC)}`} />)}
          {pays.length > 12 && <div className="text-xs text-slate-500 mt-1">… et {pays.length - 12} autre(s) pays.</div>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm min-w-full">
          <thead className="tab-entete"><tr><Th>Section</Th><Th n>Personnes</Th><Th n>Femmes</Th><Th n>Hommes</Th><Th n>% F</Th>
            <Th n>Belgique</Th><Th n>UE</Th><Th n>Hors UE</Th><Th n>Non renseignée</Th></tr></thead>
          <tbody>{H.lignes.filter(l => l[qui]?.n).map(l => { const y = l[qui]; const c = (y.n || 0) - (y.sexe_inconnu || 0); const cn = (y.n || 0) - (y.nat_inconnue || 0); return (
            <tr key={l.section} className="border-b border-slate-100"><Td>{l.section}</Td><Td n>{k0(y.n)}</Td><Td n>{k0(y.F)}</Td><Td n>{k0(y.M)}</Td><Td n>{pc(y.F || 0, c)}</Td>
              <Td n>{k0(y.be)} <span className="text-xs text-slate-400">{pc(y.be || 0, cn)}</span></Td><Td n>{k0(y.ue)}</Td><Td n>{k0(y.hors_ue)}</Td>
              <Td n className={y.nat_inconnue ? 'text-slate-400' : ''}>{k0(y.nat_inconnue)}</Td></tr>); })}</tbody>
          <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble (chacun une fois)</Td><Td n>{k0(x.n)}</Td><Td n>{k0(x.F)}</Td><Td n>{k0(x.M)}</Td><Td n>{pc(x.F || 0, sexeC)}</Td>
            <Td n>{k0(x.be)} <span className="text-xs text-slate-400 font-normal">{pc(x.be || 0, natC)}</span></Td><Td n>{k0(x.ue)}</Td><Td n>{k0(x.hors_ue)}</Td><Td n>{k0(x.nat_inconnue)}</Td></tr></tfoot>
        </table>
      </div>
    </Carte>);
}

/* ÉTUDIANTS PAR ETP (Charles, 14 octobre 2026 : « cours, puis admin — direction comprise —, puis
   total » ; « en barres, pour comparer chaque section » ; « c'est étudiant/ETP ! »). Les ETP de cours
   sont ceux de cette carte ; les ETP administratifs, les fonctions d'établissement (emplois PNCC :
   direction, direction adjointe, secrétariat), répartis entre les sections au prorata des inscrits —
   c'est le nombre de dossiers qui fait le travail. Plus le chiffre est grand, plus un ETP porte
   d'étudiants. */
const inscritsDe = (sections, sec) => sections.find(S => S.section === sec)?.inscrits || 0;
const totalInscrits = (d, sections) => d?.humains?.ensemble?.etudiants?.n || sections.reduce((t, S) => t + (S.inscrits || 0), 0);
const r1 = n => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(1).replace('.', ','));
const parEtp = (etu, etp) => (etp ? etu / etp : null);
/* À ARMES ÉGALES (Charles, 14 octobre 2026 : « Orthoptie et soins de plaies n'ont aucun sens ») : les
   ETP d'une UE se partagent entre les sections de ses étudiants (le tronc commun), et l'étudiant compte
   au prorata des périodes qu'il suit — un ETE vaut un temps plein d'étudiant. Le calcul est au serveur
   (GET /api/pilotage/ratios). Quatre lectures, et le détail empilé — en ETP pour cent ETE, la seule
   grandeur qui s'additionne (« il manque la coordination, les admins… » ; « les deux »). */
const VUES_RATIO = [['groupe', 'Taille des groupes'], ['cours', 'Cours'], ['coord', 'Coordination'], ['admin', 'Administration'], ['tout', 'Tout compris'], ['empile', 'Détail empilé']];
const etpVue = (o, v) => (v === 'cours' ? o.etp_cours : v === 'coord' ? o.etp_coord : v === 'admin' ? o.etp_admin : o.etp_cours + o.etp_coord + o.etp_admin);
function RatiosEtp({ annee }) {
  const [R, setR] = useState(null);
  const [vue, setVue] = useState('groupe');
  useEffect(() => {
    let vivant = true; setR(null);
    fetch(`/api/pilotage/ratios?annee=${encodeURIComponent(annee)}`, { headers: authHeaders({ 'X-Annee': annee }) })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (vivant) setR(j); }).catch(() => {});
    return () => { vivant = false; };
  }, [annee]);
  if (!R) return <div className="text-second text-slate-500">Calcul des ratios…</div>;
  const L = (R.sections || []).filter(o => o.ete > 0);
  const som = k => L.reduce((t, o) => t + (o[k] || 0), 0);
  const ete = som('ete'), cours = som('etp_cours'), coord = som('etp_coord'), admin = R.etp_admin || 0;
  const n = L.reduce((t, o) => t + o.inscrits, 0);
  const detailAdmin = (R.admin || []).filter(a => a.etp).map(a => `${a.fonction} ${e2(a.etp)}`).join(', ');
  const barres = L.map(o => ({ section: o.section.replace(/_/g, ' '), inscrits: o.inscrits, ete: o.ete,
    valeur: vue === 'groupe' ? (o.groupe_moyen || 0) : +(parEtp(o.ete, etpVue(o, vue)) || 0).toFixed(1),
    cours: +(100 * o.etp_cours / o.ete).toFixed(2), coord: +(100 * o.etp_coord / o.ete).toFixed(2), admin: +(100 * o.etp_admin / o.ete).toFixed(2) }))
    .filter(b => vue === 'empile' || b.valeur > 0)
    .sort((a, b) => (vue === 'empile' ? (b.cours + b.coord + b.admin) - (a.cours + a.coord + a.admin) : b.valeur - a.valeur));
  const nomVue = VUES_RATIO.find(([k]) => k === vue)[1].toLowerCase();
  const perEtu = L.reduce((t, o) => t + (o.periodes || 0), 0), perProf = L.reduce((t, o) => t + (o.per_cours || 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Tuile ton="fort" valeur={perProf ? r1(perEtu / perProf) : '—'} libelle="étudiants devant un enseignant" precision="taille moyenne du groupe : périodes suivies ÷ périodes données" />
        <Tuile valeur={r1(parEtp(ete, cours))} libelle="ETE par ETP de cours" precision={`${e2(cours)} ETP`} />
        <Tuile valeur={r1(parEtp(ete, coord))} libelle="ETE par ETP de coordination" precision={`${e2(coord)} ETP`} />
        <Tuile valeur={r1(parEtp(ete, admin))} libelle="ETE par ETP administratif" precision={`${e2(admin)} ETP${detailAdmin ? ` — ${detailAdmin}` : ''}`} />
        <Tuile valeur={r1(parEtp(ete, cours + coord + admin))} libelle="ETE par ETP, tout compris" precision={`${e2(cours + coord + admin)} ETP`} />
        <Tuile valeur={r1(ete)} libelle="étudiants équivalents temps plein" precision={`${k0(n)} étudiants · 1 ETE = ${k0(R.periodes_temps_plein)} périodes suivies`} />
      </div>
      <div className="segments w-fit">
        {VUES_RATIO.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setVue(k)}
            className={`px-3 py-1 text-second ${vue === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
      </div>
      {barres.length > 0 && (
        <div style={{ width: '100%', height: Math.max(200, barres.length * 30 + 60) }}>
          <ResponsiveContainer>
            <BarChart data={barres} layout="vertical" margin={{ left: 20, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--g-grille, #E5E7EB)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="section" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, nom) => [r1(v), nom]} labelFormatter={(l, p) => { const x = p?.[0]?.payload; return x ? `${l} · ${x.inscrits} étudiants · ${r1(x.ete)} ETE` : l; }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {vue === 'empile' ? [
                <Bar key="c" dataKey="cours" stackId="e" name="cours" fill="var(--g-1)" />,
                <Bar key="o" dataKey="coord" stackId="e" name="coordination" fill="var(--g-2)" />,
                <Bar key="a" dataKey="admin" stackId="e" name="administration" fill="var(--g-3)" />,
              ] : <Bar dataKey="valeur" name={vue === 'groupe' ? 'étudiants devant un enseignant (moyenne)' : `ETE par ETP — ${nomVue}`} fill="var(--g-1)" label={{ position: 'right', fontSize: 10, formatter: r1 }} />}
            </BarChart>
          </ResponsiveContainer>
        </div>)}
      <div className="text-second text-slate-500">
        {vue === 'groupe' ? 'Combien d’étudiants un enseignant a devant lui, en moyenne sur toutes ses heures : périodes suivies par les étudiants ÷ périodes données. '
          : vue === 'empile' ? 'ETP pour cent étudiants équivalents temps plein : plus la barre est longue, plus la section coûte en personnel par étudiant. '
          : 'Combien d’étudiants équivalents temps plein un ETP porte : plus la barre est longue, plus la section est efficiente. '}
        Les ETP d'une UE suivie par plusieurs sections (tronc commun) se partagent au prorata de leurs inscrits ; l'administration, au prorata des ETE.
      </div>
    </div>);
}

/* CE QUE COÛTE ET RAPPORTE CHAQUE FORMATION (3.1.385, Charles, 15 octobre 2026) : le coût salarial (les
   périodes au barème — payées par la FWB, la HELB, ou sur fonds propres), le coût VÉRITABLE pour l'école
   (fonds propres + budget : prévu, puis réalisé l'année civile suivante), et ce que la formation rapporte
   (DI et frais, produits du budget). Les lignes des services se partagent au prorata des inscrits. */
function FinancesFormations({ annee }) {
  const [civile, setCivile] = useState(Number(String(annee).slice(0, 4)));
  const [f, setF] = useState(null);
  const [mode, setMode] = useState('prevu');
  useEffect(() => { setCivile(Number(String(annee).slice(0, 4))); }, [annee]);
  useEffect(() => {
    let vivant = true; setF(null);
    fetch(`/api/rapports/cout-formations/finances?annee=${encodeURIComponent(annee)}&civile=${civile}`, { headers: authHeaders({ 'X-Annee': annee }) })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (vivant) setF(j); }).catch(() => {});
    return () => { vivant = false; };
  }, [annee, civile]);
  if (!f) return <div className="text-second text-slate-500">Calcul…</div>;
  const T = f.total || {};
  const cv = r => (mode === 'prevu' ? r.cout_veritable_prevu : r.cout_veritable_realise);
  const so = r => (mode === 'prevu' ? r.solde_prevu : r.solde_realise);
  const signe = v => <span style={{ color: v < 0 ? 'var(--c-refuse)' : v > 0 ? 'var(--c-reussi)' : undefined }}>{eur(v)}</span>;
  const an0 = Number(String(annee).slice(0, 4));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Tuile valeur={keur(T.cout_salarial)} libelle="coût salarial" precision={`${keur(T.cout_fwb)} payés par la FWB · ${keur(T.cout_helb)} par la HELB`} />
        <Tuile ton="fort" valeur={keur(cv(T))} libelle={`coût véritable — ${mode === 'prevu' ? 'prévu' : 'réalisé'}`} precision={`${keur(T.cout_fp)} sur fonds propres · budget ${f.annee_civile}`} />
        <Tuile valeur={keur(T.rapporte)} libelle="ce que les formations rapportent" precision={`${keur(T.di_frais)} DI et frais · ${keur((T.budget_produits || 0) + (T.communs_produits || 0))} produits du budget`} />
        <Tuile valeur={keur(so(T))} libelle="solde pour l'école" precision="ce que rapportent les formations − leur coût véritable" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="segments w-fit">
          {[['prevu', 'Prévisionnel'], ['realise', 'Réalisé']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`px-3 py-1 text-second ${mode === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
        </div>
        <label className="text-second text-slate-600">Budget de l'année civile
          <select className="controle ml-2" value={civile} onChange={e => setCivile(Number(e.target.value))}>
            {[an0 - 1, an0, an0 + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm min-w-full">
          <thead className="tab-entete"><tr><Th>Section</Th><Th n>Inscrits</Th><Th n>Coût salarial</Th><Th n>dont FWB</Th><Th n>dont HELB</Th><Th n>Fonds propres</Th>
            <Th n>{mode === 'prevu' ? 'Budget prévu' : 'Dépensé'}</Th><Th n>Services (part)</Th><Th n>Coût véritable</Th><Th n>DI et frais</Th><Th n>Produits</Th><Th n>Rapporte</Th><Th n>Solde</Th></tr></thead>
          <tbody>
            <tr className="font-semibold bg-slate-50 border-b border-slate-300"><Td>Ensemble</Td><Td n>{k0(T.inscrits)}</Td><Td n>{eur(T.cout_salarial)}</Td><Td n>{eur(T.cout_fwb)}</Td><Td n>{eur(T.cout_helb)}</Td><Td n>{eur(T.cout_fp)}</Td>
              <Td n>{eur(mode === 'prevu' ? T.budget_charges : T.realise)}</Td><Td n>{eur(mode === 'prevu' ? T.communs_charges : T.communs_realise)}</Td><Td n>{eur(cv(T))}</Td>
              <Td n>{eur(T.di_frais)}</Td><Td n>{eur((T.budget_produits || 0) + (T.communs_produits || 0))}</Td><Td n>{eur(T.rapporte)}</Td><Td n>{signe(so(T))}</Td></tr>
            {f.sections.map(r => (
              <tr key={r.section} className="border-b border-slate-100"><Td>{r.section}</Td><Td n>{k0(r.inscrits)}</Td><Td n>{eur(r.cout_salarial)}</Td><Td n>{eur(r.cout_fwb)}</Td><Td n>{eur(r.cout_helb)}</Td><Td n>{eur(r.cout_fp)}</Td>
                <Td n>{eur(mode === 'prevu' ? r.budget_charges : r.realise)}</Td><Td n>{eur(mode === 'prevu' ? r.communs_charges : r.communs_realise)}</Td><Td n b>{eur(cv(r))}</Td>
                <Td n>{eur(r.di_frais)}</Td><Td n>{eur(r.budget_produits + r.communs_produits)}</Td><Td n b>{eur(r.rapporte)}</Td><Td n b>{signe(so(r))}</Td></tr>))}
          </tbody>
        </table>
      </div>
      {f.communs.length > 0 && (
        <p className="text-second text-slate-500 m-0">
          <b>Services répartis au prorata des inscrits</b> ({f.annee_civile}) : {f.communs.map(c => `${c.service} ${keur(c.charges)} de charges${c.produits ? `, ${keur(c.produits)} de produits` : ''}`).join(' · ')}.
          Une ligne du budget qui appartient à une formation se range sous la section, pas sous un service.
        </p>)}
      <p className="text-second text-slate-500 m-0">
        Le coût salarial est le prix des périodes au barème ; la FWB les paie, sauf les attributions cochées « payée sur fonds propres ».
        Le coût véritable est ce que l'école débourse : fonds propres et budget. Le réalisé se lit des dépenses encodées dans Budget.
      </p>
    </div>);
}

export default function RapportStatistique({ annee: anneeImposee = null } = {}) {
  const [anneeLocale, setAnnee] = useState(getAnnee());
  const annee = anneeImposee || anneeLocale;
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
        {!anneeImposee && <select value={annee} onChange={e => setAnnee(e.target.value)} className="controle" title="Année académique">
          {[...new Set([annee, ...annees])].map(a => <option key={a}>{a}</option>)}
        </select>}
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
      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {!d ? <p className="text-sm text-slate-400">{enCours ? 'Calcul du rapport…' : ''}</p> : (<>
        <div className="bloc-etat px-3 py-2 text-second text-slate-600" data-etat="neutre">
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
            <Barres lignes={parEtu} couleur="var(--g-2)" />
          </Carte>
        </div>

        {Y.cmb?.lignes?.length > 0 && (
        <Carte titre="Coût moyen brut pondéré, par niveau" sous="Total des périodes attribuées × une seule valeur par niveau — la lecture de la Haute École, à côté du coût détaillé de la circulaire.">
          <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
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
            <p className="text-second text-slate-600 mt-2">Coût moyen brut à régler pour <b>{Y.cmb.a_regler.join(', ')}</b> dans
              Configuration → Coût des périodes : ses périodes sont comptées, sans montant.</p>)}
        </Carte>)}

        <Personnes d={d} />

        <Carte titre="Les ETP par section" sous="Périodes CT ÷ 800 + PP ÷ 1 000, comme Pilotage — hors congés et activités Z ; le tronc commun réparti au prorata des étudiants.">
          <RatiosEtp annee={annee} />
          <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead className="tab-entete"><tr><Th>Section</Th><Th n>ETP total</Th><Th n>dont CC</Th><Th n>dont EXP</Th><Th n>% CC</Th><Th n>Inscrits</Th><Th>Répartition</Th>
              {Y.etp_total.autre > 0 && <Th n>Sans statut</Th>}</tr></thead>
            <tbody>{Y.etp.map(E => (
              <tr key={E.section} className="border-b border-slate-100">
                <Td>{E.section}</Td><Td n b>{e2(E.total)}</Td><Td n>{e2(E.cc)}</Td><Td n>{e2(E.exp)}</Td><Td n>{pc(E.cc, E.total)}</Td>
                <Td n>{k0(inscritsDe(sections, E.section))}</Td>
                <Td><div className="flex h-2.5 w-40 rounded overflow-hidden bg-slate-100">
                  <div style={{ width: pc(E.cc, E.total), background: 'var(--g-1)' }} /><div style={{ width: pc(E.exp, E.total), background: 'var(--g-2)' }} /></div></Td>
                {Y.etp_total.autre > 0 && <Td n>{e2(E.autre)}</Td>}
              </tr>))}</tbody>
            <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble</Td><Td n>{e2(Y.etp_total.total)}</Td><Td n>{e2(Y.etp_total.cc)}</Td><Td n>{e2(Y.etp_total.exp)}</Td>
              <Td n>{pc(Y.etp_total.cc, Y.etp_total.total)}</Td>
              <Td n>{k0(totalInscrits(d, sections))}</Td>
<Td><span className="text-xs text-slate-500 font-normal">
                <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: 'var(--g-1)' }} />CC
                <span className="inline-block w-2 h-2 rounded-sm ml-3 mr-1" style={{ background: 'var(--g-2)' }} />EXP</span></Td>
              {Y.etp_total.autre > 0 && <Td n>{e2(Y.etp_total.autre)}</Td>}</tr></tfoot>
          </table></div>
        </Carte>

        <Carte titre="Ce que coûte et rapporte chaque formation" sous="Coût salarial (payé par la FWB, la HELB ou sur fonds propres), coût véritable pour l'école, recettes et solde.">
          <FinancesFormations annee={annee} />
        </Carte>

        <Carte titre="Section par section" sous="Coût des cours, part des fonctions au prorata des inscrits, coût complet et par étudiant.">
          <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead className="tab-entete"><tr><Th>Section</Th><Th n>Cours</Th><Th n>dont CC</Th><Th n>dont EXP</Th><Th n>dont HELB</Th><Th n>Inscrits</Th><Th n>Fonctions</Th><Th n>Complet</Th><Th n>Par étudiant</Th></tr></thead>
            <tbody>{sections.map(S => (
              <tr key={S.section} className="border-b border-slate-100">
                <Td>{S.section}</Td><Td n>{eur(S.cout)}</Td><Td n>{eur(S.statuts?.CC?.cout)}</Td><Td n>{eur(S.statuts?.EXP?.cout)}</Td>
                <Td n>{S.cout_helb ? eur(S.cout_helb) : '—'}</Td>
                <Td n>{S.inscrits ? k0(S.inscrits) : '—'}{S.inscrits_prevus ? <span className="text-mention text-slate-400"> prévu</span> : ''}</Td>
                <Td n>{S.part_fonctions ? eur(S.part_fonctions) : '—'}</Td><Td n b>{eur(S.cout_complet)}</Td>
                <Td n>{S.inscrits ? eur(S.cout_complet / S.inscrits) : '—'}</Td>
              </tr>))}</tbody>
            <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble</Td><Td n>{eur(T.cout)}</Td><Td n>{eur(d.statuts?.CC?.cout)}</Td><Td n>{eur(d.statuts?.EXP?.cout)}</Td>
              <Td n>{eur(T.cout_helb)}</Td><Td n>{k0(ins)}</Td><Td n>{eur(T.cout_fonctions)}</Td><Td n>{eur(T.cout_complet)}</Td><Td n>{ins ? eur(T.cout_complet / ins) : '—'}</Td></tr></tfoot>
          </table></div>
        </Carte>

        <Carte titre="Droits d'inscription et frais" sous="Le calcul de la fiche Frais de scolarité de chaque étudiant ; le DIS revient à la Fédération.">
          <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead className="tab-entete"><tr><Th>Section</Th><Th n>DI</Th><Th n>DIS</Th><Th n>Frais adm.</Th><Th n>Total dû</Th><Th n>Versé</Th><Th n>Par étudiant</Th></tr></thead>
            <tbody>{sections.filter(S => { const x = S.recettes || {}; return x.di || x.dis || x.frais || x.verse || S.recettes_tiers || S.inscrits; }).map(S => {
              const x = S.recettes || {}; const du = (x.di || 0) + (x.dis || 0) + (x.frais || 0); const t = S.recettes_tiers;
              return [
                (du || x.verse || !t) && <tr key={S.section} className="border-b border-slate-100">
                  <Td>{S.section}</Td><Td n>{k0(x.di)}</Td><Td n>{k0(x.dis)}</Td><Td n>{k0(x.frais)}</Td><Td n b>{k0(du)}</Td><Td n>{k0(x.verse)}</Td>
                  <Td n>{S.inscrits ? k0(du / S.inscrits) : '—'}</Td></tr>,
                t && <tr key={`${S.section}|tiers`} className="border-b border-slate-100">
                  <Td>{S.section}<BadgeHelb libelle={t.payeur || 'HELB'} /><span className="text-xs text-slate-500"> perçu par {t.payeur} · {t.etudiants} étudiant(s)</span></Td>
                  <Td n>0</Td><Td n>0</Td><Td n>0</Td><Td n b>0</Td><Td n>0</Td><Td n>0</Td></tr>,
              ]; })}</tbody>
            <tfoot><tr className="font-semibold bg-slate-50"><Td>Ensemble — perçu par l'établissement</Td><Td n>{k0(R.di)}</Td><Td n>{k0(R.dis)}</Td><Td n>{k0(R.frais)}</Td>
              <Td n>{k0((R.di || 0) + (R.dis || 0) + (R.frais || 0))}</Td><Td n>{k0(R.verse)}</Td>
              <Td n>{R.etudiants ? k0(((R.di || 0) + (R.dis || 0) + (R.frais || 0)) / R.etudiants) : '—'}</Td></tr></tfoot>
          </table></div>
        </Carte>

        <Carte titre="Personnel administratif et coordinations" sous="Regroupés par fonction, sans les noms ; la part HELB a sa propre ligne.">
          {!Y.fonctions.length ? <p className="text-sm text-slate-500 m-0">Aucune fonction encodée pour cette année (onglet Fonctions de la fiche du personnel).</p> : (
          <div className="overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead className="tab-entete"><tr><Th>Fonction</Th><Th>Portée</Th><Th n>Personnes</Th><Th n>ETP</Th><Th>Calcul</Th><Th n>Coût</Th></tr></thead>
            <tbody>{Y.fonctions.map((g, i) => (
              <tr key={i} className="border-b border-slate-100">
                <Td>{g.fonction}{g.helb && <BadgeHelb />}</Td><Td>{g.portees.join(', ')}</Td><Td n>{g.personnes}</Td>
                <Td n>{g.etp ? String(Math.round(g.etp * 100) / 100).replace('.', ',') : <span className="text-slate-400">à régler</span>}</Td>
                <Td className="text-second text-slate-600">{g.calcul || (g.mode === 'periodes' ? 'payée par les périodes attribuées — aucune ligne de coordination à son nom' : 'ETP à régler (onglet Fonctions)')}</Td>
                <Td n>{g.cout ? eur(g.cout) : g.cout_periodes ? <i>{eur(g.cout_periodes)} *</i> : '—'}</Td>
              </tr>))}</tbody>
            <tfoot>
              <tr className="font-semibold bg-slate-50"><Td>Ensemble des fonctions</Td><Td /><Td /><Td /><Td>{Y.fonctions.some(g => g.helb) ? `dont HELB ${eur(Y.fonctions.filter(g => g.helb).reduce((a, g) => a + g.cout, 0))}` : ''}</Td><Td n>{eur(T.cout_fonctions)}</Td></tr>
              {Y.cout_en_periodes > 0 && <tr><Td className="text-second text-slate-500" colSpan={5}>* payées par des périodes attribuées — déjà comprises dans le coût des cours, hors total</Td><Td n><i>{eur(Y.cout_en_periodes)} *</i></Td></tr>}
            </tfoot>
          </table></div>)}
        </Carte>

        <Carte titre="Unité par unité" sous="Le coût de chaque unité, section par section — cliquez une section pour la déplier.">
          <div className="divide-y divide-slate-100">
            {sections.filter(S => S.ues?.length).map(S => {
              const o = !!ouvertes[S.section];
              return (
                <div key={S.section}>
                  <button type="button" onClick={() => setOuvertes(x => ({ ...x, [S.section]: !o }))}
                    className="w-full flex items-center gap-2 py-2 text-left text-sm">
                    <Chevron ouvert={o} size={15} />
                    <b>{S.section}</b><span className="text-slate-500">{S.ues.length} unité(s) · {eur(S.cout)} · {pc(S.statuts?.CC?.periodes, S.periodes)} CC</span>
                  </button>
                  {o && (
                    <table className="text-sm min-w-full mb-3">
                      <thead className="tab-entete"><tr><Th>Unité</Th><Th n>Niveau</Th><Th n>Périodes</Th><Th n>% CC</Th><Th n>Coût</Th></tr></thead>
                      <tbody>{S.ues.map(u => (
                        <tr key={u.ue_num} className="border-b border-slate-100">
                          <Td>UE {u.ue_num} — {u.ue_nom}{u.part ? <span className="text-xs text-slate-500"> · partagée : {Math.round(u.part * 100)} %</span> : null}</Td>
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

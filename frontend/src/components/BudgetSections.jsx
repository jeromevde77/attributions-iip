/**
 * LE BUDGET DES SECTIONS — les écrans (guide : docs/contexte/guide-budget-sections.md, partie C.4).
 *
 *   · Enveloppes : la coordination voit SA section (enveloppe, encodé, solde, répartition par
 *     catégorie) ; la direction, toutes (enveloppe, encodé, écart, € par étudiant, N-1), et
 *     l'impact sur la contribution de l'IIP à l'ASBL (A.5).
 *   · Investissements : à arbitrer, triés par priorité (A.7) — direction.
 *   · Inventaire de l'existant (C.3).
 *   · Paramètres de l'année (C.1) — direction.
 * Tout se lit du serveur (`/api/budget/sections`, `/parametres`, `/inventaire`) : aucun chiffre ici.
 */
import { useEffect, useState } from 'react';
import { IconPlus, IconTrash, IconRefresh } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Encadre, TuileEtat, EnteteCarte } from './ui.jsx';
import { demander, saisir } from '../lib/dialogue.jsx';

export const eur = n => (n == null ? '—' : (Number(n) || 0).toLocaleString('fr-BE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €');
export const eur2 = n => (n == null ? '—' : (Number(n) || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
export const PRIORITES = { indispensable: 'Indispensable', souhaitable: 'Souhaitable', si_possible: 'Si possible' };
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const STATUT = { prevu: ['À arbitrer', 'var(--c-attente)'], arbitre: ['Retenu', 'var(--c-reussi)'], refuse: ['Refusé', 'var(--c-refuse)'] };

async function appel(chemin, options = {}) {
  const r = await fetch('/api/budget' + chemin, { ...options, headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}
const Pastille = ({ statut }) => {
  const [l, c] = STATUT[statut] || STATUT.prevu;
  return <span className="pastille-etat" style={{ background: c, color: '#fff' }}>{l}</span>;
};

/* ── Les enveloppes ─────────────────────────────────────────────────────────── */
export function Enveloppes({ annee, onOuvrirSection }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => { setD(null); appel(`/sections?annee=${annee}`).then(setD).catch(e => setErreur(e.message)); }, [annee]);
  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (!d.sections.length) return <Encadre etat="neutre">Aucune section dans votre périmètre pour {annee}.</Encadre>;

  // LA COORDINATION : sa ou ses sections, en tuiles et par catégorie.
  if (!d.direction) {
    return (
      <div className="space-y-4">
        {d.sections.map(s => (
          <section key={s.section} className="space-y-2">
            <h3 className="titre-carte">{s.section} · {annee}</h3>
            <div className="flex flex-wrap gap-3">
              <TuileEtat taille="grande" etat="fort" valeur={eur(s.enveloppe)} libelle="Enveloppe de fonctionnement"
                precision={`disponible pour ${annee} · ${s.effectif} étudiants`} />
              <TuileEtat taille="grande" etat="neutre" valeur={eur(s.encode_fonctionnement)} libelle="Encodé (fonctionnement)" />
              <TuileEtat taille="grande" etat={s.solde < 0 ? 'corriger' : 'reussi'} valeur={eur(s.solde)} libelle={s.solde < 0 ? 'Dépassement' : 'Solde'} />
              <TuileEtat taille="grande" etat="disponible" valeur={eur(s.investissements)} libelle="Investissements demandés"
                precision={`hors enveloppe, arbitrés par la direction${s.reserve_invest ? ` · réserve ${eur(s.reserve_invest)}` : ''}`} />
            </div>
            <RepartitionCategories s={s} />
            <button type="button" className="bouton" onClick={() => onOuvrirSection(s.section)}>Encoder les lignes de {s.section}</button>
          </section>))}
      </div>
    );
  }

  // LA DIRECTION : toutes les sections, puis l'impact sur la contribution.
  const T = d.totaux;
  return (
    <div className="space-y-4">
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="tab-entete"><tr>
            <th className="px-3 py-1.5 text-left">Section</th><th className="px-2 text-right">Étudiants</th><th className="px-2 text-right">Pond.</th>
            <th className="px-2 text-right">Enveloppe</th><th className="px-2 text-right" title="Retenu par la direction, par tranches">Coussin</th>
            <th className="px-2 text-right" title="Ce que la coordination voit et répartit">Disponible</th><th className="px-2 text-right">Encodé</th><th className="px-2 text-right">Écart</th>
            <th className="px-2 text-right">€ / étudiant</th><th className="px-2 text-right">N-1</th><th className="px-2 text-right">Investissements</th>
            <th className="px-2 text-right">Exécution</th></tr></thead>
          <tbody>
            <tr className="ligne-total font-semibold">
              <td className="px-3 py-1.5">Total des sections</td><td className="px-2 text-right tabular-nums">{d.sections.reduce((s, x) => s + (x.effectif || 0), 0)}</td><td />
              <td className="px-2 text-right tabular-nums">{eur(T.enveloppes)}</td><td className="px-2 text-right tabular-nums">{eur(T.coussin)}</td>
              <td className="px-2 text-right tabular-nums">{eur(T.disponible)}</td><td className="px-2 text-right tabular-nums">{eur(T.encode)}</td>
              <td className="px-2 text-right tabular-nums">{eur(T.encode - T.disponible)}</td><td /><td className="px-2 text-right tabular-nums">{eur(T.contribution?.charges_n1)}</td>
              <td className="px-2 text-right tabular-nums">{eur(d.sections.reduce((s, x) => s + x.investissements, 0))}</td><td /></tr>
            {d.sections.map(s => (
              <tr key={s.section} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onOuvrirSection(s.section)}>
                <td className="px-3 py-1.5">{s.section}</td>
                <td className="px-2 text-right tabular-nums">{s.effectif ?? '—'}</td>
                <td className="px-2 text-right tabular-nums">{String(s.ponderation).replace('.', ',')}</td>
                <td className="px-2 text-right tabular-nums">{eur(s.enveloppe_brute)}</td>
                <td className="px-2 text-right tabular-nums text-slate-500">{eur(s.coussin)}</td>
                <td className="px-2 text-right tabular-nums font-semibold">{eur(s.enveloppe)}</td>
                <td className="px-2 text-right tabular-nums">{eur(s.encode_fonctionnement)}</td>
                <td className="px-2 text-right tabular-nums" style={{ color: s.ecart > 0 ? 'var(--c-refuse)' : undefined }}>{eur(s.ecart)}</td>
                <td className="px-2 text-right tabular-nums">{s.par_etudiant == null ? '—' : eur(s.par_etudiant)}</td>
                <td className="px-2 text-right tabular-nums text-slate-500">{eur(s.charges_n1)}</td>
                <td className="px-2 text-right tabular-nums">{eur(s.investissements)}{s.reserve_invest ? <span className="block text-mention text-slate-500">réserve {eur(s.reserve_invest)}</span> : null}</td>
                <td className="px-2 text-right tabular-nums">{s.taux_execution == null ? '—' : `${String(s.taux_execution).replace('.', ',')} %`}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <Contribution T={T} />
    </div>
  );
}

function RepartitionCategories({ s }) {
  if (!s.par_categorie.length) return <p className="text-second text-slate-500">Aucune ligne de fonctionnement encodée pour l'instant.</p>;
  const max = Math.max(...s.par_categorie.map(c => c.montant), 1);
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Répartition par catégorie" />
      <div className="p-3 space-y-1.5">
      {s.par_categorie.map(c => (
        <div key={c.groupe} className="grid grid-cols-[minmax(0,14rem)_1fr_6rem] items-center gap-2 text-second">
          <span className="truncate" title={c.groupe}>{c.groupe}</span>
          <div className="jauge"><div className="h-full" style={{ width: `${Math.round(c.montant / max * 100)}%`, background: 'var(--c-disponible)' }} /></div>
          <span className="text-right tabular-nums">{eur(c.montant)}</span>
        </div>))}
      </div>
    </section>
  );
}

function Contribution({ T }) {
  const c = T.contribution;
  if (!c) return <Encadre etat="surveiller">Pour calculer l'impact sur la contribution à l'ASBL, encodez le résultat de l'IIP de l'année précédente (Paramètres).</Encadre>;
  const ligne = (l, a, b, fort) => (
    <tr className={`border-t border-slate-100 ${fort ? 'font-semibold' : ''}`}><td className="px-3 py-1.5">{l}</td>
      <td className="px-3 text-right tabular-nums">{a}</td><td className="px-3 text-right tabular-nums">{b}</td></tr>);
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Impact sur la contribution de l'IIP à l'ASBL (à produits constants)" />
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="tab-entete"><tr><th className="px-3 py-1.5 text-left" /><th className="px-3 text-right">Année précédente</th><th className="px-3 text-right">Avec les enveloppes</th></tr></thead>
        <tbody>
          {ligne(`Enveloppes des sections (dont coussin de la direction : ${eur(T.coussin)})`, '', eur(T.enveloppes))}
          {ligne('Quote-part orthoptie (1/3 du budget de la HE)', '', eur(T.orthoptie))}
          {ligne('Charges des sections', eur(c.charges_n1), eur(c.charges_avec_enveloppes), true)}
          {ligne("Contribution de l'IIP à l'ASBL", eur(c.resultat_n1), eur(c.contribution), true)}
          {ligne(`Amortissement des investissements retenus${c.reserves_invest ? ` (ou des réserves : ${eur(c.reserves_invest)})` : ''}`, '',
            `− ${eur(Math.max(c.amortissements_accordes, c.amortissement_reserves))} / an`)}
          {ligne('Contribution, investissements compris', '', eur(c.contribution_avec_investissements), true)}
        </tbody>
      </table>
      </div>
      <p className="px-3 py-2 text-mention text-slate-500">Calcul à produits constants (guide A.5). Le changement de gestion est à annoncer et négocier avec la direction de l'ASBL.</p>
    </section>
  );
}

/* ── Les investissements à arbitrer ─────────────────────────────────────────── */
export function Investissements({ annee }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = () => appel(`/sections?annee=${annee}`).then(setD).catch(e => setErreur(e.message));
  useEffect(() => { setD(null); charger(); }, [annee]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function arbitrer(i, statut) {
    let motif = null;
    if (statut === 'refuse') { motif = await saisir({ message: `Motif du refus — ${i.details} (${i.section})`, confirmer: 'Refuser' }); if (!motif) return; }
    try { await appel(`/ligne/${i.id}/arbitrer`, { method: 'PUT', body: JSON.stringify({ statut, motif }) }); charger(); } catch (e) { setErreur(e.message); }
  }
  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (!d.investissements.length) return <Encadre etat="neutre">Aucun investissement demandé pour {annee} (un prix unitaire d'au moins {eur2(d.parametres.seuil_invest)} HT).</Encadre>;
  return (
    <div className="space-y-2">
      <p className="text-second text-slate-600">Arbitrés au niveau de l'école, hors enveloppe, dans l'ordre : sécurité et conformité · remplacement d'un matériel hors service · indispensable aux acquis d'apprentissage · qualité · confort et projets nouveaux (guide A.7).</p>
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="tab-entete"><tr><th className="px-3 py-1.5 text-left">Priorité</th><th className="px-2 text-left">Section</th><th className="px-2 text-left">Besoin</th>
            <th className="px-2 text-right">Total HT</th><th className="px-2 text-right">Amort. / an</th><th className="px-2 text-left">Mois</th><th className="px-2 text-left">Statut</th>{d.direction && <th />}</tr></thead>
          <tbody>
            {d.investissements.map(i => (
              <tr key={i.id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-1.5 whitespace-nowrap">{PRIORITES[i.priorite] || '—'}</td>
                <td className="px-2 py-1.5">{i.section}</td>
                <td className="px-2 py-1.5"><b>{i.details}</b> <span className="text-slate-500">· {i.quantite} × {eur2(i.prix_unitaire)}</span>
                  {i.tronc_commun && <span className="ml-1 text-mention text-slate-500">· tronc commun</span>}
                  {i.categorie && <div className="text-mention text-slate-500">{i.categorie}</div>}
                  {i.justification && <div className="text-second text-slate-600">{i.justification}</div>}
                  {i.motif_arbitrage && <div className="text-mention" style={{ color: 'var(--c-refuse)' }}>Motif : {i.motif_arbitrage}</div>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{eur(i.total_ht)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{eur(i.amortissement_annuel)}<div className="text-mention text-slate-500">{i.duree_amortissement} ans</div></td>
                <td className="px-2 py-1.5">{i.mois ? MOIS[i.mois - 1] : '—'}</td>
                <td className="px-2 py-1.5"><Pastille statut={i.statut} />{i.arbitre_par && <div className="text-mention text-slate-500">{i.arbitre_par}</div>}</td>
                {d.direction && <td className="px-2 py-1.5 whitespace-nowrap text-right">
                  {i.statut !== 'arbitre' && <button type="button" className="bouton bouton-compact" onClick={() => arbitrer(i, 'arbitre')}>Retenir</button>}{' '}
                  {i.statut !== 'refuse' && <button type="button" className="bouton bouton-compact" onClick={() => arbitrer(i, 'refuse')}>Refuser</button>}{' '}
                  {i.statut !== 'prevu' && <button type="button" className="bouton bouton-compact" onClick={() => arbitrer(i, 'prevu')}>Rouvrir</button>}</td>}
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── L'inventaire de l'existant ─────────────────────────────────────────────── */
export function Inventaire({ sections, sectionInitiale }) {
  const [section, setSection] = useState(sectionInitiale || sections[0] || '');
  const [d, setD] = useState(null);
  const [nouveau, setNouveau] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = () => section && appel(`/inventaire?section=${encodeURIComponent(section)}`).then(setD).catch(e => setErreur(e.message));
  useEffect(() => { setD(null); setErreur(null); charger(); }, [section]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function enregistrer(b) {
    try {
      await appel(b.id ? `/inventaire/${b.id}` : '/inventaire', { method: b.id ? 'PUT' : 'POST', body: JSON.stringify({ ...b, section }) });
      setNouveau(null); charger();
    } catch (e) { setErreur(e.message); }
  }
  async function retirer(b) {
    if (!(await demander(`Retirer « ${b.type_bien} » de l'inventaire de ${section} ?`))) return;
    try { await appel(`/inventaire/${b.id}`, { method: 'DELETE' }); charger(); } catch (e) { setErreur(e.message); }
  }
  const an = new Date().getFullYear();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="controle border border-slate-300 rounded-champ bg-white" value={section} onChange={e => setSection(e.target.value)}>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {d?.peut_ecrire && <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => setNouveau({ type_bien: '', description: '', quantite: 1, annee_achat: '', etat: 'bon' })}>
          <IconPlus size={14} /> Ajouter un bien</button>}
        <span className="text-second text-slate-500">Complétez l'inventaire avant d'encoder vos remplacements : il objective vos demandes (guide B.1).</span>
      </div>
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {nouveau && <BienForm b={nouveau} onEnregistrer={enregistrer} onAnnuler={() => setNouveau(null)} />}
      {!d ? <p className="text-sm text-slate-400">Chargement…</p> : !d.biens.length ? <Encadre etat="neutre">Aucun bien inventorié pour {section}.</Encadre> : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="tab-entete"><tr><th className="px-3 py-1.5 text-left">Type de bien</th><th className="px-2 text-left">Description</th>
              <th className="px-2 text-right">Qté</th><th className="px-2 text-right">Achat</th><th className="px-2 text-right">Âge</th><th className="px-2 text-left">État</th><th /></tr></thead>
            <tbody>{d.biens.map(b => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-3 py-1.5 font-semibold">{b.type_bien}</td><td className="px-2">{b.description || '—'}</td>
                <td className="px-2 text-right tabular-nums">{b.quantite}</td><td className="px-2 text-right tabular-nums">{b.annee_achat || '—'}</td>
                <td className="px-2 text-right tabular-nums">{b.annee_achat ? `${an - b.annee_achat} ans` : '—'}</td>
                <td className="px-2"><span className="pastille-etat" style={{ color: '#fff', background: b.etat === 'remplacer' ? 'var(--c-refuse)' : b.etat === 'surveiller' ? 'var(--c-attente)' : 'var(--c-reussi)' }}>{d.etats[b.etat]}</span></td>
                <td className="px-2 text-right whitespace-nowrap">{d.peut_ecrire && <>
                  <select className="text-second border border-slate-300 rounded-champ bg-white" value={b.etat} onChange={e => enregistrer({ ...b, etat: e.target.value })} aria-label="État">
                    {Object.entries(d.etats).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{' '}
                  <button type="button" className="text-slate-400 hover:text-red-600" title="Retirer" onClick={() => retirer(b)}><IconTrash size={14} /></button></>}</td>
              </tr>))}</tbody>
          </table>
        </div>)}
    </div>
  );
}

function BienForm({ b: b0, onEnregistrer, onAnnuler }) {
  const [b, setB] = useState(b0);
  const maj = (k, v) => setB(x => ({ ...x, [k]: v }));
  return (
    <div className="carte p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
      <label className="text-xs md:col-span-2"><span className="intertitre block mb-1">Type de bien</span>
        <input className="controle w-full border border-slate-300 rounded-champ" value={b.type_bien} placeholder="Ordinateur, siège, lampe à fente…" onChange={e => maj('type_bien', e.target.value)} /></label>
      <label className="text-xs md:col-span-2"><span className="intertitre block mb-1">Description</span>
        <input className="controle w-full border border-slate-300 rounded-champ" value={b.description} onChange={e => maj('description', e.target.value)} /></label>
      <label className="text-xs"><span className="intertitre block mb-1">Quantité</span>
        <input type="number" min="1" className="controle w-full border border-slate-300 rounded-champ text-right" value={b.quantite} onChange={e => maj('quantite', e.target.value)} /></label>
      <label className="text-xs"><span className="intertitre block mb-1">Année d'achat</span>
        <input type="number" className="controle w-full border border-slate-300 rounded-champ text-right" value={b.annee_achat} onChange={e => maj('annee_achat', e.target.value)} /></label>
      <label className="text-xs md:col-span-2"><span className="intertitre block mb-1">État</span>
        <select className="controle w-full border border-slate-300 rounded-champ bg-white" value={b.etat} onChange={e => maj('etat', e.target.value)}>
          <option value="bon">Bon</option><option value="surveiller">À surveiller</option><option value="remplacer">À remplacer</option></select></label>
      <div className="md:col-span-4 flex justify-end gap-2">
        <button type="button" className="bouton" onClick={onAnnuler}>Annuler</button>
        <button type="button" className="bouton bouton-fort" disabled={!b.type_bien.trim()} onClick={() => onEnregistrer(b)}>Enregistrer</button></div>
    </div>
  );
}

/* ── Les paramètres de l'année (direction) ──────────────────────────────────── */
export function Parametres({ annee }) {
  const [d, setD] = useState(null);
  const [P, setP] = useState(null);
  const [S, setS] = useState([]);
  const [message, setMessage] = useState(null);
  const charger = () => appel(`/parametres?annee=${annee}`).then(j => { setD(j); setP(j.parametres); setS(j.sections); }).catch(e => setMessage({ etat: 'corriger', texte: e.message }));
  useEffect(() => { setD(null); charger(); }, [annee]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function enregistrer() {
    try { await appel('/parametres', { method: 'PUT', body: JSON.stringify({ annee, parametres: P, sections: S }) }); setMessage({ etat: 'reussi', texte: 'Paramètres enregistrés.' }); charger(); }
    catch (e) { setMessage({ etat: 'corriger', texte: e.message }); }
  }
  async function recompter() {
    try {
      const sim = await appel('/parametres/effectifs', { method: 'POST', body: JSON.stringify({ annee }) });
      const diff = sim.lignes.filter(l => l.actuel !== l.lucie);
      if (!diff.length) { setMessage({ etat: 'reussi', texte: `Les effectifs figés correspondent aux inscrits de Lucie (année de ${sim.date}).` }); return; }
      if (!(await demander({ message: `Inscrits dans Lucie (année académique du ${sim.date}) :\n\n${diff.map(l => `${l.section} : ${l.actuel ?? '—'} → ${l.lucie}`).join('\n')}\n\nRemplacer les effectifs figés par ces chiffres ?`, confirmer: 'Remplacer' }))) return;
      await appel('/parametres/effectifs', { method: 'POST', body: JSON.stringify({ annee, ecrire: true }) });
      charger();
    } catch (e) { setMessage({ etat: 'corriger', texte: e.message }); }
  }
  if (!d) return message ? <Encadre etat={message.etat}>{message.texte}</Encadre> : <p className="text-sm text-slate-400">Chargement…</p>;
  const champ = (k, lib, props = {}) => (
    <label className="text-xs"><span className="intertitre block mb-1">{lib}</span>
      <input className="controle w-full border border-slate-300 rounded-champ text-right" value={P[k] ?? ''} onChange={e => setP(x => ({ ...x, [k]: e.target.value }))} {...props} /></label>);
  // Un taux s'écrit en pour cent à l'écran, en part (0,10) en base.
  const pct = (k, lib) => (
    <label className="text-xs"><span className="intertitre block mb-1">{lib} (%)</span>
      <input type="number" step="1" className="controle w-full border border-slate-300 rounded-champ text-right"
        value={P[k] == null || P[k] === '' ? '' : Math.round(Number(P[k]) * 1000) / 10}
        onChange={e => setP(x => ({ ...x, [k]: e.target.value === '' ? '' : Number(e.target.value) / 100 }))} /></label>);
  const majS = (i, k, v) => setS(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-3">
      {message && <Encadre etat={message.etat}>{message.texte}</Encadre>}
      <div className="carte p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        {champ('montant_etudiant', 'Montant par étudiant (€)', { type: 'number' })}
        {champ('seuil_invest', "Seuil d'investissement (€ HT)", { type: 'number', step: '0.01' })}
        {champ('amort_info', 'Amortissement informatique (ans)', { type: 'number' })}
        {champ('amort_mobilier', 'Amortissement mobilier et matériel (ans)', { type: 'number' })}
        {champ('date_effectifs', 'Date de référence des effectifs', { type: 'date' })}
        {champ('orthoptie_budget_he', 'Budget de fonctionnement orthoptie communiqué par la HE (€)', { type: 'number' })}
        <label className="text-xs"><span className="intertitre block mb-1">Quote-part de l'IIP</span>
          <select className="controle w-full border border-slate-300 rounded-champ bg-white" value={Math.abs(Number(P.orthoptie_part) - 1 / 3) < 0.001 ? '0.333333' : String(P.orthoptie_part)}
            onChange={e => setP(x => ({ ...x, orthoptie_part: Number(e.target.value) }))}>
            <option value="0.333333">un tiers</option><option value="0.5">la moitié</option><option value="0.25">un quart</option><option value="1">la totalité</option></select></label>
        {champ('resultat_n1', "Résultat de l'IIP l'année précédente (€)", { type: 'number' })}
      </div>
      <section className="carte overflow-hidden">
        <EnteteCarte titre="Coussin de la direction" sous="retenu sur chaque enveloppe, par tranches (la coordination ne voit que le disponible)" />
        <div className="p-3 grid grid-cols-2 md:grid-cols-5 gap-3">
          {pct('coussin_taux1', `Taux jusqu’au 1er seuil`)}
          {champ('coussin_seuil1', '1er seuil (€)', { type: 'number' })}
          {pct('coussin_taux2', 'Taux entre les seuils')}
          {champ('coussin_seuil2', '2e seuil (€)', { type: 'number' })}
          {pct('coussin_taux3', 'Taux au-delà du 2e seuil')}
        </div>
      </section>
      <div className="flex items-center gap-2">
        <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={recompter}><IconRefresh size={14} /> Recompter les effectifs dans Lucie</button>
        <span className="text-second text-slate-500">Les effectifs restent figés jusqu'à ce que vous les recomptiez ou les corrigiez ; un étudiant inscrit dans deux sections compte dans chacune.</span>
      </div>
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="tab-entete"><tr><th className="px-3 py-1.5 text-left">Section</th><th className="px-2 text-right">Socle (€)</th><th className="px-2 text-right">Pondération</th>
            <th className="px-2 text-right">Étudiants</th><th className="px-2 text-right">Charges N-1 (€)</th><th className="px-2 text-right">Produits N-1 (€)</th>
            <th className="px-2 text-right">Réserve d'investissement (€)</th><th className="px-2 text-center">Hors budget</th></tr></thead>
          <tbody>{S.map((s, i) => (
            <tr key={s.section} className="border-t border-slate-100">
              <td className="px-3 py-1">{s.section}</td>
              {['socle', 'ponderation', 'effectif', 'charges_n1', 'produits_n1', 'reserve_invest'].map(k => (
                <td key={k} className="px-1 py-1"><input type="number" step={k === 'ponderation' ? '0.1' : '1'} className="controle w-full border border-slate-300 rounded-champ text-right"
                  value={s[k] ?? ''} onChange={e => majS(i, k, e.target.value)} /></td>))}
              <td className="px-2 text-center"><input type="checkbox" checked={!!s.hors_budget} onChange={e => majS(i, 'hors_budget', e.target.checked)}
                title={s.section === 'Orthoptie' ? "L'orthoptie passe par sa quote-part" : 'La section ne reçoit pas d’enveloppe'} /></td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="flex justify-end"><button type="button" className="bouton bouton-fort" onClick={enregistrer}>Enregistrer les paramètres de {annee}</button></div>
    </div>
  );
}

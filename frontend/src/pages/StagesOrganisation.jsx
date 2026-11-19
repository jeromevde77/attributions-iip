/* LES STAGES — UNE SEULE PORTE (3.5.586, Charles, 19 novembre 2026 : « que la gestion des stages soit bien claire » ; maquette
 * validée, « on garde tout, code par étapes »). Organisation → Stages porte toute la chaîne, en six étapes numérotées qu'on
 * parcourt dans l'ordre et qui restent toutes cliquables :
 *   1 Les lieux — le répertoire de la section, ce que chacun accueille cette année, sa convention-cadre ;
 *   2 Affecter — les stages proposés d'après les UE de stage, puis l'affectation en lot (lieu, dates, superviseur) ;
 *   3 Les pièces — ce qui manque avant le premier jour (art. 51 et 55), « Relancer » ;
 *   4 Les conventions — lues du REGISTRE (Documentation → Conventions) : une par stage, déposée, signée, contresignée ;
 *   5 Le suivi — l'état DÉDUIT (à préparer, prêt, en cours, terminé ; rompu et annulé seuls posés à la main), les visites ;
 *   6 Évaluation et heures — les heures face au minimum de la section, les fiches d'évaluation.
 * Le stage d'un étudiant se retouche dans sa fiche (onglet Stages). Serveur : routes/stages.js (`etatDuStage`). */
import { useEffect, useMemo, useState } from 'react';
import { IconSend, IconCheck, IconPlus, IconUpload, IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat, TuileEtat, Fenetre } from '../components/ui.jsx';
import { authHeaders } from '../lib/api.js';
import { ouvrirOngletAttente } from '../lib/ongletAttente.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { VisitesTrajets } from '../components/VisitesStage.jsx';
import FichesEvaluation from '../components/FichesEvaluation.jsx';
import ImportLieuxStage from '../components/ImportLieuxStage.jsx';
import ConventionStage from '../components/ConventionStage.jsx';
import ChampsAdresse, { ChoixPays } from '../components/ChampsAdresse.jsx';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const appel = (url, o = {}) => fetch(url, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });
const plus = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const nomE = s => `${String(s.etud_nom || '').toUpperCase()} ${s.etud_prenom || ''}`.trim();

export const ETATS = {
  a_preparer: ['surveiller', 'à préparer'], pret: ['reussi', 'prêt'], en_cours: ['disponible', 'en cours'],
  termine: ['neutre', 'terminé'], rompu: ['corriger', 'rompu'], annule: ['indisponible', 'annulé'],
};
const CONV = { deposee: ['surveiller', 'à signer (direction)'], signee: ['reussi', 'signée par l’IIP'], contresignee: ['reussi', 'contresignée'] };
const PastEtat = ({ e }) => { const [t, l] = ETATS[e] || ['neutre', e || '—']; return <PastilleEtat etat={t}>{l}</PastilleEtat>; };

const ETAPES = [
  [1, 'Les lieux', 'Le répertoire de la section : l’adresse (elle part au supplément au diplôme), les UE accueillies, ce que chaque lieu reçoit cette année et sa convention-cadre.'],
  [2, 'Affecter', 'Chaque inscrit d’une UE de stage reçoit son stage : d’abord ceux que Lucie propose d’après les UE, aux dates de leur organisation ; puis le lieu, les dates et le superviseur, en lot.'],
  [3, 'Les pièces', 'Avant le premier jour (RDE art. 51 et 55) : autorisation, convention signée, visite médicale du CESI (fiche → Santé), casier de moins de six mois, vaccination.'],
  [4, 'Les conventions', 'Une seule source : le registre des conventions. On y dépose la convention d’un stage, la direction la signe d’un clic, et la date « convention signée » du stage s’en déduit.'],
  [5, 'Le suivi', 'L’état se déduit des pièces et des dates : à préparer, prêt, en cours, terminé. Seuls « rompu » et « annulé » se posent à la main, dans la fiche. Les visites et les trajets du superviseur se lisent ici.'],
  [6, 'Évaluation et heures', 'Les heures effectuées face au minimum de la section et l’attestation de stages (R-06) de chaque étudiant ; puis les fiches d’évaluation (superviseur, maître de stage par lien) qui versent leurs notes dans le carnet.'],
];
const ANCIENNES = { ensemble: 5, pieces: 3, lot: 2, propositions: 2, trajets: 5, fiches: 6 };

export default function StagesOrganisation({ annee }) {
  const [etape, setEtape] = useState(() => {
    try { const p = new URLSearchParams(window.location.search); return Number(p.get('etape')) || ANCIENNES[p.get('face')] || 1; } catch { return 1; }
  });
  const [d, setD] = useState(null);
  const [props, setProps] = useState([]);
  const [lieux, setLieux] = useState(null);
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const charger = () => {
    appel(`/api/stages?annee=${encodeURIComponent(annee)}`).then(setD).catch(e => setD({ erreur: e.message }));
    appel(`/api/stages/propositions?annee=${encodeURIComponent(annee)}`).then(l => setProps(Array.isArray(l) ? l : [])).catch(() => setProps([]));
    appel(`/api/stages/lieux?annee=${encodeURIComponent(annee)}`).then(l => setLieux(Array.isArray(l) ? l : [])).catch(() => setLieux([]));
  };
  useEffect(() => { if (annee) charger(); }, [annee]);
  const sections = useMemo(() => [...new Set([...(d?.stages || []).map(s => s.section), ...props.map(p => p.section)].filter(Boolean))].sort(), [d, props]);
  const stages = useMemo(() => (d?.stages || []).filter(s => (!section || s.section === section)
    && (!q || `${s.etud_nom} ${s.etud_prenom} ${s.lieu_nom || ''} ${s.professeur || ''} ${s.ue_num || ''}`.toLowerCase().includes(q.toLowerCase()))), [d, section, q]);
  const propsVues = props.filter(p => !section || p.section === section);
  const dans30 = plus(new Date().toISOString().slice(0, 10), 30);
  const parEtud = new Map(); for (const s of stages) if (s.minimum) parEtud.set(s.etudiant_id, s);
  const n = {
    stages: stages.filter(s => !['annule', 'rompu'].includes(s.etat)).length,
    sans: propsVues.length,
    incomplets: stages.filter(s => s.manquent?.length).length,
    rouges: stages.filter(s => s.urgence === 'rouge').length,
    aSigner: stages.filter(s => s.convention?.etat === 'deposee').length,
    sansConv: stages.filter(s => !s.convention && !s.convention_le && !['termine', 'rompu', 'annule'].includes(s.etat)).length,
    enCours: stages.filter(s => s.etat === 'en_cours').length,
    visites: stages.filter(s => s.prochaine_visite && s.prochaine_visite <= dans30).length,
    sousMin: [...parEtud.values()].filter(s => s.etat === 'termine' && s.cumul_heures < s.minimum).length,
    lieux: (lieux || []).filter(l => !section || l.section === section).length,
    places: (lieux || []).filter(l => !section || l.section === section).reduce((t, l) => t + (l.places || 0), 0),
  };
  const comptes = {
    1: `${n.lieux} lieu(x)${n.places ? ` · ${n.places} places` : ''}`, 2: n.sans ? `${n.sans} sans stage` : 'chacun a son stage', 3: n.incomplets ? `${n.incomplets} incomplet(s)` : 'rien ne manque',
    4: n.aSigner ? `${n.aSigner} à signer` : n.sansConv ? `${n.sansConv} sans convention` : 'à jour', 5: `${n.enCours} en cours`,
    6: n.sousMin ? `${n.sousMin} sous le minimum` : 'heures et fiches',
  };
  const aller = k => { setEtape(k); try { const u = new URL(window.location.href); u.searchParams.set('etape', k); u.searchParams.delete('face'); window.history.replaceState(null, '', u); } catch { /* */ } };
  const [, titre, aide] = ETAPES[etape - 1];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-ecran">Stages</h1>
        <p className="text-second text-slate-500">Toute la chaîne des stages de {annee}, du lieu à l’évaluation, en six étapes.</p>
      </div>
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
        <select className="controle border border-slate-300 rounded-champ text-sm" value={section} onChange={e => setSection(e.target.value)} aria-label="Section">
          <option value="">Toutes les sections</option>{sections.map(s => <option key={s}>{s}</option>)}</select>
        <input className="controle border border-slate-300 rounded-champ text-sm w-64" placeholder="Étudiant, lieu, superviseur, UE…" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher" />
      </div>
      {!d ? <div className="text-sm text-slate-500">Chargement…</div> : d.erreur ? <div className="text-sm text-red-700">{d.erreur}</div> : <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <TuileEtat valeur={n.stages} libelle="stages cette année" precision={section || 'toutes les sections'} onClick={() => aller(5)} />
          <TuileEtat etat={n.sans ? 'surveiller' : 'reussi'} valeur={n.sans} libelle="sans stage affecté" precision="étape 2" onClick={() => aller(2)} />
          <TuileEtat etat={n.rouges ? 'corriger' : n.incomplets ? 'surveiller' : 'reussi'} valeur={n.incomplets} libelle="dossiers incomplets" precision={n.rouges ? `dont ${n.rouges} urgent(s)` : 'étape 3'} onClick={() => aller(3)} />
          <TuileEtat etat={n.aSigner ? 'surveiller' : 'neutre'} valeur={n.aSigner} libelle="conventions à signer" precision={n.sansConv ? `${n.sansConv} sans convention` : 'étape 4'} onClick={() => aller(4)} />
          <TuileEtat etat={n.visites ? 'disponible' : 'neutre'} valeur={n.visites} libelle="visites à venir" precision="les 30 prochains jours" onClick={() => aller(5)} />
          <TuileEtat etat={n.sousMin ? 'corriger' : 'neutre'} valeur={n.sousMin} libelle="sous le minimum d’heures" precision="stages terminés" onClick={() => aller(6)} />
        </div>
        <FriseStages etape={etape} onEtape={aller} comptes={comptes} />
        {etape === 2 && <div className="carte overflow-hidden"><EnteteCarte titre={`${etape}. ${titre}`} sous={aide} /></div>}
        {etape === 2 && <Propositions annee={annee} section={section} recharger={charger} />}
        {etape === 2 && <Lot annee={annee} recharger={charger} />}
        {etape !== 2 && <div className="carte overflow-hidden">
          <EnteteCarte titre={`${etape}. ${titre}`} sous={aide} />
          {etape === 1 && <EtapeLieux lieux={lieux} section={section} annee={annee} recharger={charger} />}
          {etape === 3 && <Pieces stages={stages} recharger={charger} />}
          {etape === 4 && <EtapeConventions stages={stages} lieux={lieux} recharger={charger} />}
          {etape === 5 && <EtapeSuivi stages={stages} annee={annee} />}
          {etape === 6 && <EtapeHeures stages={stages} annee={annee} />}
        </div>}
        <div className="flex justify-between gap-2">
          <button className="bouton inline-flex items-center gap-1" disabled={etape === 1} onClick={() => aller(etape - 1)}><IconArrowLeft size={15} /> Étape précédente</button>
          <button className="bouton inline-flex items-center gap-1" disabled={etape === 6} onClick={() => aller(etape + 1)}>Étape suivante <IconArrowRight size={15} /></button>
        </div>
      </>}
    </div>
  );
}

/* La frise des six étapes : numéro, titre, ce qui attend. L'étape ouverte en marine ; toutes restent cliquables. */
function FriseStages({ etape, onEtape, comptes }) {
  return (
    <nav aria-label="Étapes des stages" className="carte p-2 flex flex-wrap gap-1.5">
      {ETAPES.map(([k, l]) => {
        const actif = k === etape;
        return (
          <button key={k} type="button" onClick={() => onEtape(k)} aria-current={actif ? 'step' : undefined}
            className={`flex items-center gap-2.5 flex-[1_1_10rem] min-w-0 rounded-champ px-2.5 py-1.5 text-left border ${actif ? 'border-[var(--c-principal,#16406A)] bg-[color-mix(in_srgb,var(--c-principal,#16406A)_7%,white)]' : 'border-transparent hover:bg-slate-50'}`}>
            <span className={`w-7 h-7 flex-none rounded-full inline-flex items-center justify-center text-sm font-semibold ${actif ? 'text-white' : 'border border-slate-300 text-slate-500'}`}
              style={actif ? { background: 'var(--c-principal, #16406A)' } : undefined}>{k}</span>
            <span className="min-w-0"><span className="block text-sm font-semibold truncate">{l}</span><span className="block text-mention text-slate-500 truncate">{comptes[k]}</span></span>
          </button>);
      })}
    </nav>
  );
}

/* 1. LES LIEUX — le répertoire de la section d'abord ; « tous les lieux » montre aussi ceux des autres sections. */
function EtapeLieux({ lieux, section, annee, recharger }) {
  const [tous, setTous] = useState(false);
  const [fiche, setFiche] = useState(null);
  const [importer, setImporter] = useState(false);
  if (!lieux) return <p className="px-4 py-3 text-sm text-slate-500 m-0">Chargement…</p>;
  const liste = lieux.filter(l => tous || !section || l.section === section);
  return (<>
    <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
      <button className="bouton bouton-fort inline-flex items-center gap-1" onClick={() => setFiche({ pays: 'Belgique', section: section || '' })}><IconPlus size={14} /> Ajouter un lieu</button>
      <button className="bouton inline-flex items-center gap-1" onClick={() => setImporter(true)}><IconUpload size={14} /> Importer un répertoire</button>
      {section && <label className="text-second text-slate-600 inline-flex items-center gap-1.5 ml-auto"><input type="checkbox" checked={tous} onChange={e => setTous(e.target.checked)} /> Montrer aussi les lieux des autres sections</label>}
    </div>
    {!liste.length ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Aucun lieu {section ? `dans le répertoire de ${section}` : 'encodé'}.</p> : (
      <Tableau dense>
        <TableauEntete><Th>Lieu</Th><Th>Service</Th><Th>Localité</Th><Th>Section</Th><Th>UE</Th><Th align="droite">Places {annee}</Th><Th align="droite">Occupées</Th><Th align="droite">Depuis toujours</Th><Th>Convention-cadre</Th></TableauEntete>
        <tbody>{liste.map(l => (
          <Tr key={l.id} onClick={() => setFiche(l)} className="cursor-pointer">
            <Td><span className="font-medium">{l.nom}</span></Td><Td ton="secondaire">{l.service || '—'}</Td><Td ton="secondaire">{l.localite || '—'}</Td>
            <Td ton="secondaire">{l.section || '—'}</Td><Td ton="secondaire">{l.ues || '—'}</Td>
            <Td align="droite" onClick={e => e.stopPropagation()}><Places lieu={l} annee={annee} onFait={recharger} /></Td>
            <Td align="droite">{l.places != null && (l.stages_annee || 0) > l.places
              ? <PastilleEtat etat="corriger" title="Plus d’étudiants que de places offertes">{l.stages_annee}</PastilleEtat> : (l.stages_annee || 0)}</Td>
            <Td align="droite" ton="secondaire">{l.nb_stages || 0}</Td>
            <Td>{l.cadre ? <PastilleEtat etat={CONV[l.cadre.etat]?.[0]}>{CONV[l.cadre.etat]?.[1]}{l.cadre.fin ? ` · jusqu’au ${fr(l.cadre.fin)}` : ''}</PastilleEtat> : <span className="text-slate-400">aucune</span>}</Td>
          </Tr>))}</tbody>
      </Tableau>)}
    {fiche && <FicheLieu lieu={fiche} onFermer={() => setFiche(null)} onFait={() => { setFiche(null); recharger(); }} />}
    {importer && <ImportLieuxStage onClose={() => setImporter(false)} onFini={() => { setImporter(false); recharger(); }} />}
  </>);
}

/* Les places qu'un lieu offre cette année : un champ qui s'enregistre en quittant. */
function Places({ lieu, annee, onFait }) {
  const [v, setV] = useState(lieu.places ?? '');
  useEffect(() => { setV(lieu.places ?? ''); }, [lieu.places]);
  const garder = async () => {
    if (String(v) === String(lieu.places ?? '')) return;
    try { await appel(`/api/stages/lieux/${lieu.id}/places`, { method: 'PUT', body: JSON.stringify({ annee, places: v === '' ? null : Number(v) }) }); onFait(); }
    catch (e) { informer({ message: e.message }); setV(lieu.places ?? ''); }
  };
  return <input type="number" min="0" className="border border-slate-300 rounded-champ text-sm w-16 px-1.5 py-0.5 text-right" value={v} placeholder="—"
    aria-label={`Places offertes par ${lieu.nom}`} onChange={e => setV(e.target.value)} onBlur={garder} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

function FicheLieu({ lieu, onFermer, onFait }) {
  const [v, setV] = useState(lieu);
  const [err, setErr] = useState(null);
  const pose = (k, x) => setV(o => ({ ...o, [k]: x }));
  const champ = 'controle border border-slate-300 rounded-champ text-sm w-full';
  const enregistrer = async () => {
    setErr(null);
    const corps = {}; for (const k of ['nom', 'service', 'adresse', 'cp', 'localite', 'pays', 'secteur', 'num_entreprise', 'site_web', 'contact_nom', 'contact_fonction', 'contact_tel', 'contact_email', 'agrement', 'remarques', 'section', 'ues', 'demande']) corps[k] = v[k] ?? null;
    try { await appel(lieu.id ? `/api/stages/lieux/${lieu.id}` : '/api/stages/lieux', { method: lieu.id ? 'PUT' : 'POST', body: JSON.stringify(corps) }); onFait(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Fenetre titre={lieu.id ? lieu.nom : 'Nouveau lieu de stage'} sous="L’adresse figure au supplément au diplôme : elle doit être complète." onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">{err && <span className="text-second text-[var(--c-refuse)] min-w-0">{err}</span>}
        <button className="bouton ml-auto" onClick={onFermer}>Annuler</button><button className="bouton bouton-fort" disabled={!v.nom} onClick={enregistrer}>Enregistrer</button></div>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <label className="block md:col-span-2">Nom de l’établissement<input className={champ} value={v.nom || ''} onChange={e => pose('nom', e.target.value)} /></label>
        <label className="block">Service ou département<input className={champ} value={v.service || ''} onChange={e => pose('service', e.target.value)} /></label>
        <label className="block">Secteur<input className={champ} value={v.secteur || ''} onChange={e => pose('secteur', e.target.value)} placeholder="hôpital, cabinet, école…" /></label>
        <ChampsAdresse valeurs={{ cp: v.cp, localite: v.localite, rue: v.adresse }} poser={(k, x) => pose({ cp: 'cp', localite: 'localite', rue: 'adresse' }[k], x)} />
        <label className="block">Pays<ChoixPays value={v.pays} onChange={x => pose('pays', x)} /></label>
        <label className="block">Section (répertoire)<input className={champ} value={v.section || ''} onChange={e => pose('section', e.target.value)} placeholder="TIM" /></label>
        <label className="block">UE accueillies<input className={champ} value={v.ues || ''} onChange={e => pose('ues', e.target.value)} placeholder="70, 75" /></label>
        <label className="block">Personne de contact<input className={champ} value={v.contact_nom || ''} onChange={e => pose('contact_nom', e.target.value)} /></label>
        <label className="block">Fonction<input className={champ} value={v.contact_fonction || ''} onChange={e => pose('contact_fonction', e.target.value)} /></label>
        <label className="block">Courriel<input className={champ} value={v.contact_email || ''} onChange={e => pose('contact_email', e.target.value)} /></label>
        <label className="block">Téléphone<input className={champ} value={v.contact_tel || ''} onChange={e => pose('contact_tel', e.target.value)} /></label>
        <label className="block">Agrément<input className={champ} value={v.agrement || ''} onChange={e => pose('agrement', e.target.value)} /></label>
        <label className="block">Comment y demander un stage<input className={champ} value={v.demande || ''} onChange={e => pose('demande', e.target.value)} placeholder="téléphone, courriel, formulaire…" /></label>
        <label className="block md:col-span-2">Remarques<textarea className="border border-slate-300 rounded-champ text-sm w-full p-2" rows={2} value={v.remarques || ''} onChange={e => pose('remarques', e.target.value)} /></label>
      </div>
    </Fenetre>
  );
}

/* 4. LES CONVENTIONS — lues du registre ; une ligne par stage, et la convention-cadre de son lieu. Un clic ouvre la convention
   du stage (déposer, ouvrir) ; la direction signe depuis son Accueil ou Documentation → Conventions. */
function EtapeConventions({ stages, recharger }) {
  const [ouvert, setOuvert] = useState(null);
  const actifs = stages.filter(s => !['rompu', 'annule'].includes(s.etat));
  const ordre = s => (s.convention?.etat === 'deposee' ? 1 : !s.convention && !s.convention_le ? 0 : 2);
  const liste = [...actifs].sort((a, b) => ordre(a) - ordre(b) || String(a.date_debut || '9').localeCompare(String(b.date_debut || '9')));
  return (<>
    <div className="px-4 pt-3 text-second text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
      <span>Le registre complet : <a className="underline" href="/documentation?vue=conventions">Documentation → Conventions</a>.</span>
      <span>Une date posée à la main avant le registre reste lue (« déclarée »).</span>
    </div>
    {!liste.length ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Aucun stage.</p> : (
      <Tableau dense>
        <TableauEntete><Th>Étudiant</Th><Th>Lieu</Th><Th>Début</Th><Th>Convention du stage</Th><Th>Convention-cadre du lieu</Th></TableauEntete>
        <tbody>{liste.map(s => (
          <Tr key={s.id} onClick={() => setOuvert(s)} className="cursor-pointer">
            <Td>{nomE(s)}</Td><Td>{s.lieu_nom || <span className="text-slate-400">lieu à choisir</span>}</Td><Td>{fr(s.date_debut)}</Td>
            <Td>{s.convention ? <PastilleEtat etat={CONV[s.convention.etat][0]}>{CONV[s.convention.etat][1]}</PastilleEtat>
              : s.convention_le ? <PastilleEtat etat="reussi">déclarée le {fr(s.convention_le)}</PastilleEtat>
              : <PastilleEtat etat={s.lieu_id ? 'corriger' : 'indisponible'}>{s.lieu_id ? 'à déposer' : 'pas encore'}</PastilleEtat>}</Td>
            <Td>{s.cadre ? <PastilleEtat etat={CONV[s.cadre.etat][0]}>{CONV[s.cadre.etat][1]}</PastilleEtat> : <span className="text-slate-400">{s.lieu_id ? 'aucune' : '—'}</span>}</Td>
          </Tr>))}</tbody>
      </Tableau>)}
    {ouvert && (
      <Fenetre titre={`Convention — ${nomE(ouvert)}`} sous={`${ouvert.lieu_nom || 'lieu à choisir'} · ${fr(ouvert.date_debut)} → ${fr(ouvert.date_fin)}`} onFermer={() => { setOuvert(null); recharger(); }}>
        {ouvert.lieu_id ? <ConventionStage stage={ouvert} peutEcrire onChange={recharger} />
          : <p className="text-sm text-slate-600 m-0">Le lieu de ce stage n’est pas encore choisi : la convention se passe avec un lieu (étape 2).</p>}
      </Fenetre>)}
  </>);
}

/* 5. LE SUIVI — l'état déduit, le superviseur, les visites ; la ligne du temps ; puis les visites et trajets. */
function EtapeSuivi({ stages, annee }) {
  const [etat, setEtat] = useState('');
  const [trajets, setTrajets] = useState(false);
  const liste = stages.filter(s => !etat || s.etat === etat);
  return (<>
    <div className="px-4 pt-3 flex flex-wrap items-center gap-2">
      <select className="controle border border-slate-300 rounded-champ text-sm" value={etat} onChange={e => setEtat(e.target.value)} aria-label="État">
        <option value="">Tous les états</option>{Object.entries(ETATS).map(([k, [, l]]) => <option key={k} value={k}>{l} ({stages.filter(s => s.etat === k).length})</option>)}</select>
      <button className="bouton ml-auto" onClick={() => setTrajets(t => !t)}>{trajets ? 'Revenir à la liste' : 'Visites et trajets'}</button>
    </div>
    {trajets ? <div className="p-4"><VisitesTrajets /></div> : <>
      <div className="p-4"><LigneStages stages={stages} annee={annee} /></div>
      <Tableau dense>
        <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th>UE</Th><Th>Lieu</Th><Th>Superviseur</Th><Th>Du</Th><Th>Au</Th><Th>État</Th><Th align="droite">Visites</Th><Th>Prochaine visite</Th></TableauEntete>
        <tbody>{liste.map(s => (
          <Tr key={s.id}>
            <Td><a className="underline-offset-2 hover:underline" href={`/etudiants?q=${encodeURIComponent(s.etud_nom)}`}>{nomE(s)}</a></Td>
            <Td ton="secondaire">{s.section || '—'}</Td><Td ton="secondaire">{s.ue_num ? `UE ${s.ue_num}` : '—'}</Td>
            <Td>{s.lieu_nom || <span className="text-slate-400">—</span>}</Td><Td ton="secondaire">{s.professeur || '—'}</Td>
            <Td>{fr(s.date_debut)}</Td><Td>{fr(s.date_fin)}</Td>
            <Td><span title={s.manquent?.length ? `Il manque : ${s.manquent.join(', ')}` : undefined}><PastEtat e={s.etat} /></span></Td>
            <Td align="droite" ton="secondaire" title="faites / en tout">{s.visites_faites || s.visites_prevues ? `${s.visites_faites} / ${s.visites_faites + s.visites_prevues}` : '—'}</Td>
            <Td ton="secondaire">{s.prochaine_visite ? fr(s.prochaine_visite) : '—'}</Td>
          </Tr>))}</tbody>
      </Tableau>
    </>}
  </>);
}

/* L'attestation de stages (R-06) d'un étudiant : composée par le serveur, rendue en PDF, ouverte dans un onglet. */
async function attestationStages(etudId) {
  const w = ouvrirOngletAttente('L’attestation de stages est en cours de composition…');
  try {
    const j = await appel(`/api/stages/etudiant/${etudId}/attestation`);
    const rp = await fetch('/api/impression/pdf', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: j.html, nom: j.nom, pagination: 'si-plusieurs' }) });
    if (!rp.ok) { const e = await rp.json().catch(() => ({})); throw new Error(e.error || 'Le PDF n’a pas pu être produit.'); }
    const url = URL.createObjectURL(await rp.blob());
    if (w) w.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { if (w) w.close(); informer({ message: e.message }); }
}

/* 6. ÉVALUATION ET HEURES — par étudiant : les heures de ses stages de l'année, son cumul (toutes années) face au minimum de
   sa section ; puis les fiches d'évaluation des UE de stage. */
function EtapeHeures({ stages, annee }) {
  const [vue, setVue] = useState('heures');
  const parEtud = new Map();
  for (const s of stages) {
    if (['annule', 'rompu'].includes(s.etat)) continue;
    const e = parEtud.get(s.etudiant_id) || { id: s.etudiant_id, nom: nomE(s), section: s.section, eff: 0, prev: 0, cumul: s.cumul_heures, minimum: s.minimum, termines: 0, n: 0, manque: 0, aConfirmer: 0 };
    e.eff += Number(s.heures_effectuees || 0); e.prev += Number(s.heures_prevues || 0); e.n += 1;
    if (s.etat === 'termine') { e.termines += 1; if (s.heures_effectuees == null) e.manque += 1; else if (!s.heures_confirmees) e.aConfirmer += 1; }
    parEtud.set(s.etudiant_id, e);
  }
  const liste = [...parEtud.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  return (<>
    <div className="px-4 pt-3 flex gap-1 border-b" style={{ borderColor: 'var(--menu-bord)' }}>
      {[['heures', 'Les heures'], ['fiches', 'Les fiches d’évaluation']].map(([k, l]) => <button key={k} onClick={() => setVue(k)} className={`onglet-page ${vue === k ? 'onglet-page-actif' : ''}`}>{l}</button>)}
    </div>
    {vue === 'fiches' ? <div className="p-4"><FichesEvaluation annee={annee} domaine="stage" /></div> : !liste.length ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Aucun stage.</p> : (
      <Tableau dense>
        <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th align="droite">Stages</Th><Th align="droite">Heures effectuées / prévues ({annee})</Th><Th align="droite">Cumul / minimum</Th><Th>À noter</Th><Th /></TableauEntete>
        <tbody>{liste.map(e => {
          const sous = e.minimum && e.cumul < e.minimum;
          return (
            <Tr key={e.id}>
              <Td>{e.nom}</Td><Td ton="secondaire">{e.section || '—'}</Td><Td align="droite">{e.n}</Td>
              <Td align="droite">{e.eff || '—'} / {e.prev || '—'}</Td>
              <Td align="droite">{e.minimum ? <PastilleEtat etat={sous ? (e.termines === e.n ? 'corriger' : 'neutre') : 'reussi'}>{e.cumul} / {e.minimum} h</PastilleEtat> : <span className="text-slate-400">{e.cumul} h · pas de minimum</span>}</Td>
              <Td ton="secondaire">{[e.manque ? `${e.manque} stage(s) terminé(s) sans heures effectuées` : '', e.aConfirmer ? `${e.aConfirmer} non confirmé(s) par le superviseur` : ''].filter(Boolean).join(' · ')}</Td>
              <Td align="droite">{e.termines > 0 && <button className="bouton px-2 py-0.5 text-second whitespace-nowrap" onClick={() => attestationStages(e.id)}>Attestation</button>}</Td>
            </Tr>);
        })}</tbody>
      </Tableau>)}
  </>);
}

/* La ligne du temps : par section, le nombre d'étudiants en stage chaque semaine. */
function LigneStages({ stages, annee }) {
  const sem = useMemo(() => {
    const a1 = Number(String(annee).split('-')[0]); const d = `${a1}-08-15`; const w = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    const l0 = w === 0 ? d : plus(d, 7 - w); return Array.from({ length: 52 }, (_, i) => plus(l0, 7 * i));
  }, [annee]);
  const sections = [...new Set(stages.map(s => s.section || '—'))].sort();
  if (!stages.some(s => s.date_debut)) return null;
  const compte = (sec, l) => stages.filter(s => (s.section || '—') === sec && s.date_debut && s.date_debut <= plus(l, 6) && (s.date_fin || s.date_debut) >= l && !['annule', 'rompu'].includes(s.statut)).length;
  const grille = sections.map(sec => sem.map(l => compte(sec, l)));
  const max = Math.max(1, ...grille.flat());
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return (
    <div>
      <div className="intertitre mb-1">Qui est en stage, quand — le nombre d’étudiants en stage chaque semaine, par section</div>
      <div className="overflow-x-auto"><div className="min-w-[760px] space-y-1">
        <div className="grid" style={{ gridTemplateColumns: '8rem repeat(52, minmax(0,1fr))' }}><div />
          {sem.map((l, i) => { const m = Number(plus(l, 3).slice(5, 7)); const prec = i ? Number(plus(sem[i - 1], 3).slice(5, 7)) : null; return <div key={l} className="text-mention text-slate-500 whitespace-nowrap overflow-visible">{m !== prec ? MOIS[m - 1] : ''}</div>; })}</div>
        {sections.map((sec, k) => (
          <div key={sec} className="grid items-end" style={{ gridTemplateColumns: '8rem repeat(52, minmax(0,1fr))' }}>
            <div className="text-second text-slate-600 pr-2 truncate">{sec}</div>
            {grille[k].map((n, i) => <div key={i} title={`${sec} · semaine du ${fr(sem[i])} · ${n} en stage`} className="relative h-6 mx-px">
              {n > 0 && <span className="absolute inset-x-0 bottom-0 rounded-t-[2px]" style={{ height: `${Math.max(15, (n / max) * 100)}%`, background: 'var(--c-serie_5, #4FA64A)' }} />}</div>)}
          </div>))}
      </div></div>
    </div>
  );
}

function Pieces({ stages, recharger }) {
  const liste = stages.filter(s => s.manquent?.length).sort((a, b) => (a.urgence === 'rouge' ? 0 : 1) - (b.urgence === 'rouge' ? 0 : 1) || String(a.date_debut || '9').localeCompare(String(b.date_debut || '9')));
  const relancer = async s => {
    if (!(await demander(`Envoyer à ${String(s.etud_nom).toUpperCase()} ${s.etud_prenom} (adresse d’école) la liste des pièces qui manquent ?`))) return;
    try { const r = await appel(`/api/stages/${s.id}/relancer`, { method: 'POST' }); informer({ message: `Relance envoyée à ${r.a} : ${r.pieces.join(', ')}.` }); recharger(); }
    catch (e) { informer({ message: e.message }); }
  };
  return (
    <div>
      <p className="px-4 pt-3 m-0 text-second text-slate-500">En rouge : début dans 14 jours ou moins, ou premier dixième de l’UE passé sans casier (art. 55 : exclusion de l’UE).</p>
      {!liste.length ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Rien ne manque : tous les stages à venir ont leurs pièces.</p> : (
        <Tableau dense>
          <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th>Lieu</Th><Th>Début</Th><Th>1/10 de l’UE</Th><Th>Il manque</Th><Th>Relancé</Th><Th /></TableauEntete>
          <tbody>{liste.map(s => (
            <Tr key={s.id}>
              <Td>{String(s.etud_nom).toUpperCase()} {s.etud_prenom}</Td><Td ton="secondaire">{s.section || '—'}</Td><Td>{s.lieu_nom || '—'}</Td>
              <Td>{s.urgence === 'rouge' ? <PastilleEtat etat="corriger">{fr(s.date_debut)}</PastilleEtat> : fr(s.date_debut)}</Td><Td ton="secondaire">{fr(s.dixieme)}</Td>
              <Td><span className="text-second">{s.manquent.join(' · ')}</span></Td><Td ton="secondaire">{s.relance_le ? fr(s.relance_le) : '—'}</Td>
              <Td align="droite"><button className="bouton px-2 py-0.5 text-second inline-flex items-center gap-1" onClick={() => relancer(s)}><IconSend size={13} /> Relancer</button></Td>
            </Tr>))}</tbody>
        </Tableau>)}
    </div>
  );
}

function Lot({ annee, recharger }) {
  const [choix, setChoix] = useState(null);
  const [lieux, setLieux] = useState([]);
  const [ue, setUe] = useState('');
  const [ins, setIns] = useState(null);
  const [coches, setCoches] = useState([]);
  const [v, setV] = useState({ lieu_id: '', date_debut: '', date_fin: '', professeur_id: '', maitre_stage: '', intitule: '' });
  const [plan, setPlan] = useState(null);
  useEffect(() => { appel(`/api/stages/choix?annee=${encodeURIComponent(annee)}`).then(setChoix).catch(e => setChoix({ erreur: e.message })); appel(`/api/stages/lieux?annee=${encodeURIComponent(annee)}`).then(l => setLieux(Array.isArray(l) ? l : l.lieux || [])).catch(() => {}); }, [annee]);
  useEffect(() => { setIns(null); setCoches([]); setPlan(null); if (ue) appel(`/api/stages/inscrits?annee=${encodeURIComponent(annee)}&ue_num=${ue}`).then(setIns).catch(e => setIns({ erreur: e.message })); }, [ue]);
  const org = o => { const x = ins?.organisations?.find(y => y.org === o); if (x) setV(w => ({ ...w, date_debut: x.du || '', date_fin: x.au || '' })); setCoches((ins?.inscrits || []).filter(i => (i.org || 1) === o).map(i => i.id)); };
  const corps = () => ({ annee, ue_num: Number(ue), etudiant_ids: coches, ...v, lieu_id: v.lieu_id ? Number(v.lieu_id) : '', professeur_id: v.professeur_id ? Number(v.professeur_id) : '' });
  const simuler = async () => { try { setPlan(await appel('/api/stages/lot', { method: 'POST', body: JSON.stringify(corps()) })); } catch (e) { informer({ message: e.message }); } };
  const ecrire = async () => { try { const r = await appel('/api/stages/lot', { method: 'POST', body: JSON.stringify({ ...corps(), ecrire: true }) }); informer({ message: `${r.ecrits} stage(s) écrits.` }); setPlan(null); recharger(); setUe(u => u); appel(`/api/stages/inscrits?annee=${encodeURIComponent(annee)}&ue_num=${ue}`).then(setIns); } catch (e) { informer({ message: e.message }); } };
  if (!choix) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (choix.erreur) return <div className="text-sm text-red-700">{choix.erreur}</div>;
  const champ = 'controle border border-slate-300 rounded-champ text-sm w-full';
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="carte overflow-hidden min-w-0">
        <EnteteCarte titre="1. L’unité et ses étudiants" sous="Cochez ceux qui reçoivent la même affectation. Une organisation coche les siens et reprend ses dates.">
          <select className="controle border border-slate-300 rounded-champ text-sm" value={ue} onChange={e => setUe(e.target.value)} aria-label="UE de stage">
            <option value="">— UE de stage —</option>{choix.ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} · {u.ue_nom} ({u.sections}) · {u.inscrits} inscrits</option>)}
          </select>
        </EnteteCarte>
        {!ue ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Choisissez une UE de stage.</p> : !ins ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Chargement…</p> : ins.erreur ? <p className="px-4 py-3 text-sm text-red-700 m-0">{ins.erreur}</p> : <>
          {ins.organisations.length > 1 && <div className="px-4 pt-3 flex flex-wrap gap-2 text-second">{ins.organisations.map(o => <button key={o.org} className="bouton px-2 py-0.5" onClick={() => org(o.org)}>Organisation {o.org} · {fr(o.du)} → {fr(o.au)}</button>)}</div>}
          <Tableau dense>
            <TableauEntete><Th><input type="checkbox" checked={ins.inscrits.length > 0 && coches.length === ins.inscrits.length} onChange={e => setCoches(e.target.checked ? ins.inscrits.map(i => i.id) : [])} aria-label="Tout cocher" /></Th><Th>Étudiant</Th><Th>Section</Th><Th>Org.</Th><Th>Stage</Th></TableauEntete>
            <tbody>{ins.inscrits.map(i => (
              <Tr key={i.id}><Td><input type="checkbox" checked={coches.includes(i.id)} onChange={e => setCoches(c => (e.target.checked ? [...c, i.id] : c.filter(x => x !== i.id)))} /></Td>
                <Td>{String(i.nom).toUpperCase()} {i.prenom}</Td><Td ton="secondaire">{i.section || '—'}</Td><Td ton="secondaire">{i.org || 1}</Td>
                <Td>{i.stage_id ? <PastilleEtat etat="disponible">existe</PastilleEtat> : <span className="text-slate-400">aucun</span>}</Td></Tr>))}</tbody>
          </Tableau>
        </>}
      </div>
      <div className="carte overflow-hidden self-start">
        <EnteteCarte titre="2. Ce qu’ils reçoivent" sous="Seuls les champs remplis s’écrivent ; un stage existant est complété." />
        <div className="px-4 py-3 space-y-2 text-sm">
          <label className="block">Lieu<select className={champ} value={v.lieu_id} onChange={e => setV({ ...v, lieu_id: e.target.value })}><option value="">—</option>{lieux.map(l => <option key={l.id} value={l.id}>{l.nom}{l.localite ? ` · ${l.localite}` : ''}{l.places != null ? ` — ${l.stages_annee || 0}/${l.places} places` : ''}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2"><label className="block">Du<input type="date" className={champ} value={v.date_debut} onChange={e => setV({ ...v, date_debut: e.target.value })} /></label>
            <label className="block">Au<input type="date" className={champ} value={v.date_fin} onChange={e => setV({ ...v, date_fin: e.target.value })} /></label></div>
          <label className="block">Professeur de stage<select className={champ} value={v.professeur_id} onChange={e => setV({ ...v, professeur_id: e.target.value })}><option value="">—</option>{choix.professeurs.map(p => <option key={p.id} value={p.id}>{p.nom}{p.stage ? ' ★' : ''}</option>)}</select></label>
          <label className="block">Maître de stage (facultatif)<input className={champ} value={v.maitre_stage} onChange={e => setV({ ...v, maitre_stage: e.target.value })} /></label>
          <label className="block">Intitulé (facultatif)<input className={champ} value={v.intitule} onChange={e => setV({ ...v, intitule: e.target.value })} placeholder="3e année – Stage 5" /></label>
          <p className="text-mention text-slate-500 m-0">★ : attribué à une UE de stage cette année.</p>
          <div className="flex gap-2 pt-1"><button className="bouton" disabled={!coches.length} onClick={simuler}>Voir ce qui sera écrit</button>
            <button className="bouton bouton-fort inline-flex items-center gap-1" disabled={!plan} onClick={ecrire}><IconCheck size={14} /> Affecter</button></div>
          {plan && <div className="text-second space-y-0.5 pt-1">
            <div><b>{plan.plan.filter(x => x.geste === 'créer').length}</b> créé(s), <b>{plan.plan.filter(x => x.geste === 'compléter').length}</b> complété(s){plan.plan.some(x => x.refus) ? `, ${plan.plan.filter(x => x.refus).length} écarté(s)` : ''}.</div>
            {plan.places && <div className={plan.places.depasse ? 'text-[var(--c-refuse)]' : 'text-slate-500'}>Ce lieu : {plan.places.apres} étudiant(s) pour {plan.places.offre} place(s){plan.places.depasse ? ' — au-delà de ce qu’il offre (vérifiez avec lui).' : '.'}</div>}
            {plan.plan.filter(x => x.refus).map(x => <div key={x.etudiant_id} className="text-[var(--c-refuse)]">{x.nom || x.etudiant_id} : {x.refus}</div>)}
          </div>}
        </div>
      </div>
    </div>
  );
}

function Propositions({ annee, section = '', recharger }) {
  const [l, setL] = useState(null);
  const [coches, setCoches] = useState([]);
  const charger = () => appel(`/api/stages/propositions?annee=${encodeURIComponent(annee)}`).then(x => { x = x.filter(p => !section || p.section === section); setL(x); setCoches(x.map(p => `${p.etudiant_id}|${p.ue_num}`)); }).catch(e => setL({ erreur: e.message }));
  useEffect(() => { charger(); }, [annee, section]);
  if (!l) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (l.erreur) return <div className="text-sm text-red-700">{l.erreur}</div>;
  const creer = async () => {
    if (!(await demander(`Créer ${coches.length} stage(s) aux dates de leur organisation ? Lieu et encadrant se complètent ensuite (Affecter en lot, ou la fiche).`))) return;
    try { const r = await appel('/api/stages/propositions', { method: 'POST', body: JSON.stringify({ annee, items: coches.map(k => { const [e, u] = k.split('|'); return { etudiant_id: Number(e), ue_num: Number(u) }; }) }) }); informer({ message: `${r.crees} stage(s) créé(s).` }); charger(); recharger(); }
    catch (e) { informer({ message: e.message }); }
  };
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre={`${l.length} stage(s) à créer d’après les UE de stage`} sous="Chaque inscrit d’une UE de stage qui n’a pas encore de stage pour elle, aux dates de son organisation (AESI : Toussaint–Noël, Carnaval–Pâques). Rien n’est écrit avant « Créer ».">
        <button className="bouton bouton-fort" disabled={!coches.length} onClick={creer}>Créer {coches.length}</button>
      </EnteteCarte>
      {!l.length ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Chaque inscrit d’une UE de stage a déjà son stage.</p> : (
        <Tableau dense>
          <TableauEntete><Th><input type="checkbox" checked={coches.length === l.length} onChange={e => setCoches(e.target.checked ? l.map(p => `${p.etudiant_id}|${p.ue_num}`) : [])} aria-label="Tout cocher" /></Th><Th>Étudiant</Th><Th>Section</Th><Th>UE</Th><Th>Org.</Th><Th>Du</Th><Th>Au</Th></TableauEntete>
          <tbody>{l.map(p => { const k = `${p.etudiant_id}|${p.ue_num}`; return (
            <Tr key={k}><Td><input type="checkbox" checked={coches.includes(k)} onChange={e => setCoches(c => (e.target.checked ? [...c, k] : c.filter(x => x !== k)))} /></Td>
              <Td>{p.nom}</Td><Td ton="secondaire">{p.section || '—'}</Td><Td>UE {p.ue_num} · {p.ue_nom}</Td><Td ton="secondaire">{p.org}</Td><Td>{fr(p.du)}</Td><Td>{fr(p.au)}</Td></Tr>); })}</tbody>
        </Tableau>)}
    </div>
  );
}


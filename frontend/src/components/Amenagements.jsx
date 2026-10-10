import { useEffect, useState } from 'react';
import { peutAmenager } from '../lib/droits.js';
import { IconAlertTriangle, IconPlus, IconTrash, IconShieldCheck, IconSend, IconUsers } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import EtapesAmenagement from './EtapesAmenagement.jsx';
import EnvoiMailModal from './EnvoiMailModal.jsx';
import { Tableau, TableauEntete, Th, Td, Tr, Badge } from './ui.jsx';
import { demander } from '../lib/dialogue.jsx';

/**
 * Aménagements raisonnables — décret du 30 juin 2016.
 *
 * L'écran suit la procédure : la demande, la pièce produite, la décision
 * motivée du Conseil des études, la notification par la direction, et le
 * recours éventuel. Les mesures accordées sont listées à part, car ce sont
 * elles qui devront être communiquées aux chargés de cours — sans que la
 * nature du handicap ait à circuler, le secret professionnel s'appliquant.
 */
const STATUTS = {
  demande:     { libelle: 'Demande introduite', ton: 'info' },
  instruction: { libelle: 'En instruction',     ton: 'alerte' },
  accepte:     { libelle: 'Accordé',            ton: 'succes' },
  partiel:     { libelle: 'Partiellement accordé', ton: 'alerte' },
  refuse:      { libelle: 'Refusé',             ton: 'danger' },
  recours:     { libelle: 'En recours',         ton: 'accent' },
};

const PORTEES = {
  toutes: 'Toutes activités', cours: 'Cours', epreuves: 'Épreuves', stage: 'Stage',
};

export default function Amenagements({ etudId, annee }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [ajout, setAjout] = useState(null);
  const [etape, setEtape] = useState('demande');
  const [refus, setRefus] = useState(null);      // { mesure, motif }

  async function charger() {
    const rep = await fetch(`/api/amenagements/etudiant/${etudId}?annee=${annee}`,
      { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : { dossiers: [], catalogue: [] });
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId, annee]);

  async function creerDossier() {
    const rep = await fetch('/api/amenagements/dossier', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    await charger();
  }

  async function majDossier(champs) {
    const rep = await fetch(`/api/amenagements/dossier/${data.courant.id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(champs),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) setMessage({ type: 'err', texte: j.error || `erreur ${rep.status}` });
    else if (j.rappel) setMessage({ type: 'rappel', texte: j.rappel });
    await charger();
  }

  async function ajouterMesure(m) {
    const rep = await fetch(`/api/amenagements/dossier/${data.courant.id}/mesure`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(m),
    });
    if (!rep.ok) { const j = await rep.json().catch(() => ({})); setMessage({ type: 'err', texte: j.error || `erreur ${rep.status}` }); }
    setAjout(null);
    await charger();
  }

  async function majMesure(m, patch) {
    const suite = { ...m, ...patch };
    const rep = await fetch(`/api/amenagements/mesure/${m.id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ precisions: suite.precisions, portee: suite.portee,
        ue_num: suite.ue_num, accorde: !!suite.accorde, motif_refus: suite.motif_refus }),
    });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) setMessage({ type: 'err', texte: j.error || `erreur ${rep.status}` });
    await charger();
  }

  async function supprimerMesure(id, sansConfirmer = false) {
    if (!sansConfirmer && !(await demander('Retirer cette mesure du dossier ?'))) return;
    await fetch(`/api/amenagements/mesure/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  if (!data) return <div className="py-8 text-center text-sm text-slate-400">Chargement…</div>;

  const d = data.courant;
  // Un champ d'un volet validé ne se modifie plus : on rouvre le volet.
  const VOLET_A = ['date_demande', 'soins_specifiques', 'annexes_nb', 'annexes_desc', 'signe_etudiant_le',
    'signe_reference_le', 'piece_type', 'piece_date', 'piece_auteur', 'piece_reference'];
  const VOLET_B = ['materiel_demande', 'materiel_desc', 'pedago_demande', 'pedago_desc',
    'rapport_annexes_nb', 'rapport_annexes_desc', 'transmis_cde_le'];
  const verrou = nom => {
    const ci = data.circuit;
    if (!ci || ci.hors_circuit) return false;
    return (VOLET_A.includes(nom) && !!ci.a?.valide_le) || (VOLET_B.includes(nom) && !!ci.b?.valide_le);
  };
  const champ = (nom, libelle, type = 'text') => (
    <label className="text-xs block">
      <span className="intertitre block mb-1">{libelle}</span>
      <input type={type} defaultValue={d[nom] || ''} disabled={verrou(nom)}
        onBlur={e => e.target.value !== (d[nom] || '') && majDossier({ [nom]: e.target.value })}
        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
    </label>
  );

  // LE CIRCUIT (2 octobre 2026) : A validée → B s'ouvre ; B validée → avis des
  // chargés de cours et décision. Le serveur le tient ; l'écran le montre.
  const c = data.circuit || null;
  const hors = !!c?.hors_circuit;
  const aOk = hors || !!c?.a?.valide_le;
  const bOk = hors || !!c?.b?.valide_le;
  const ouverte = cle => cle === 'demande' || (cle === 'rapport' ? aOk : bOk);
  const etapeVue = d && !ouverte(etape) ? 'demande' : etape;

  async function geste(chemin, methode = 'PUT') {
    const rep = await fetch(`/api/amenagements/dossier/${d.id}/${chemin}`, { method: methode, headers: authHeaders() });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || `erreur ${rep.status}` }); return false; }
    setMessage(null); await charger(); return true;
  }
  const quand = t => (t ? String(t).replace('T', ' ').slice(0, 16).split(' ').map((x, i) => (i ? x : x.split('-').reverse().join('/'))).join(' à ') : '');

  /* LA BARRE DE VALIDATION D'UN VOLET — verte quand il est validé, avec qui et
     quand ; sinon, le bouton et ce qui manque, nommé. */
  const barreValidation = (vol, libelle, route, suite) => {
    const v = c?.[vol] || {};
    if (hors) return null;
    return v.valide_le ? (
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--c-reussi, #3E7D5E)' }}>
        <b>{libelle} validé</b> le {quand(v.valide_le)} par {v.valide_par || '—'}.
        {suite && <span className="text-white/90">{suite}</span>}
        {/* ROUVRIR POUR CORRIGER, tant que le Conseil n'a pas tranché ; rouvrir la
            demande rouvre d'abord le rapport, qui en dépend (Charles, 8 octobre 2026). */}
        {v.peut !== false && !c?.decide && (
          <button type="button" className="ml-auto bouton h-7 text-second" style={{ background: 'var(--blanc)', color: 'var(--c-texte, #1B2B4B)' }}
            onClick={async () => {
              if (vol === 'a' && c?.b?.valide_le && !(await geste('valider-b', 'DELETE'))) return;
              await geste(route, 'DELETE');
            }}>Rouvrir pour corriger</button>)}
        {c?.decide && <span className="ml-auto text-second text-white/90">Le Conseil a décidé : le dossier ne se rouvre plus.</span>}
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        {v.peut !== false && <button type="button" className="bouton font-semibold disabled:opacity-40" disabled={!!v.manques?.length}
          style={v.manques?.length ? undefined : { background: 'var(--c-reussi, #3E7D5E)', borderColor: 'var(--c-reussi, #3E7D5E)', color: '#fff' }}
          onClick={() => geste(route)}>✓ Valider {libelle.toLowerCase()}</button>}
        <span className="text-second text-slate-500 min-w-0">
          {v.manques?.length ? `Il manque : ${v.manques.join(', ')}.` : 'Tout est complet.'}
        </span>
      </div>
    );
  };

  const tableMesures = (modeDecision) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-iip-blue">Mesures {modeDecision ? 'à trancher' : 'demandées'} ({d.mesures?.length || 0})</span>
        {!modeDecision && !c?.b?.valide_le && (
          <button onClick={() => setAjout({ nature: 'pedagogique', portee: 'toutes' })}
            className="flex items-center gap-1.5 text-second px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-50">
            <IconPlus size={14} /> Ajouter une mesure
          </button>
        )}
      </div>
      {ajout && !modeDecision && (
        <div className="border border-slate-200 rounded-xl p-3 mb-2 space-y-2">
          <select onChange={e => {
              const x = data.catalogue.find(y => y.code === e.target.value);
              setAjout(a0 => ({ ...a0, code: x?.code, libelle: x?.libelle, nature: x?.nature || a0.nature }));
            }} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="">— choisir dans le catalogue —</option>
            {[...new Set(data.catalogue.map(x => x.moment || 'Autres'))].map(mo => (
              <optgroup key={mo} label={mo}>
                {data.catalogue.filter(x => (x.moment || 'Autres') === mo).map(x => (
                  <option key={x.code} value={x.code}>{x.nature === 'materiel' ? 'Matériel' : 'Pédagogique'} · {x.libelle}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <input placeholder="Précisions — modalités concrètes (« tiers-temps », « 2 semaines »)"
            onChange={e => setAjout(a0 => ({ ...a0, precisions: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <div className="flex gap-2 items-center">
            <select value={ajout.portee} onChange={e => setAjout(a0 => ({ ...a0, portee: e.target.value }))}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              {Object.entries(PORTEES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="flex-1" />
            <button onClick={() => setAjout(null)} className="bouton">Annuler</button>
            <button onClick={() => ajouterMesure(ajout)} disabled={!ajout.libelle} className="bouton bouton-fort">Ajouter</button>
          </div>
        </div>
      )}
      {!d.mesures?.length ? (
        <div className="py-5 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          Aucune mesure. Un aménagement porte sur la manière d'accéder aux acquis d'apprentissage et de les évaluer, jamais sur les acquis eux-mêmes.
        </div>
      ) : (
        <Tableau dense>
          <TableauEntete>
            <Th>Aménagement</Th>
            <Th largeur="w-24">Nature</Th>
            <Th largeur="w-32">Portée</Th>
            {modeDecision && <Th largeur="w-48">Décision</Th>}
            {!modeDecision && !c?.b?.valide_le && <Th largeur="w-12" />}
          </TableauEntete>
          <tbody>
            {d.mesures.map(m => (
              <Tr key={m.id}>
                <Td>
                  <span className={modeDecision && !m.accorde ? 'line-through text-slate-400' : ''}>{m.libelle}</span>
                  {modeDecision || c?.b?.valide_le
                    ? (m.precisions && <span className="block text-xs text-slate-500">{m.precisions}</span>)
                    : <input defaultValue={m.precisions || ''} placeholder="précision (facultatif)"
                        onBlur={e => e.target.value !== (m.precisions || '') && majMesure(m, { precisions: e.target.value })}
                        className="block mt-0.5 w-full border border-slate-200 rounded px-1.5 py-0.5 text-second" />}
                  {modeDecision && !m.accorde && (
                    <textarea rows={2} defaultValue={m.motif_refus || ''} placeholder="Motif du refus — obligatoire"
                      onBlur={e => e.target.value.trim() && e.target.value !== (m.motif_refus || '') && majMesure(m, { accorde: false, motif_refus: e.target.value })}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1 text-second" />
                  )}
                </Td>
                <Td><Badge ton={m.nature === 'materiel' ? 'info' : 'accent'}>{m.nature === 'materiel' ? 'Matériel' : 'Pédagogique'}</Badge></Td>
                <Td ton="secondaire">{PORTEES[m.portee] || m.portee}</Td>
                {modeDecision && (
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => !m.accorde && majMesure(m, { accorde: true, motif_refus: null })}
                        className="px-2 py-0.5 text-second rounded-md border font-semibold"
                        style={m.accorde ? { background: 'var(--c-reussi, #3E7D5E)', borderColor: 'var(--c-reussi, #3E7D5E)', color: '#fff' } : { borderColor: 'rgb(var(--gris-300))', color: 'rgb(var(--gris-600))' }}>Accordée</button>
                      <button onClick={() => m.accorde && setRefus({ mesure: m, motif: '' })}
                        className="px-2 py-0.5 text-second rounded-md border font-semibold"
                        style={!m.accorde ? { background: 'var(--c-refuse, #9D4A38)', borderColor: 'var(--c-refuse, #9D4A38)', color: '#fff' } : { borderColor: 'rgb(var(--gris-300))', color: 'rgb(var(--gris-600))' }}>Refusée</button>
                    </div>
                  </Td>
                )}
                {!modeDecision && !c?.b?.valide_le && (
                  <Td align="droite">
                    <button onClick={() => supprimerMesure(m.id)} className="text-slate-300 hover:text-red-500"><IconTrash size={13} /></button>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Tableau>
      )}
      {refus && modeDecision && (
        <div className="mt-2 border border-slate-300 rounded-xl p-3 space-y-2">
          <div className="text-sm text-iip-blue font-semibold">Refuser « {refus.mesure.libelle} »</div>
          <textarea rows={2} autoFocus value={refus.motif} onChange={e => setRefus(r0 => ({ ...r0, motif: e.target.value }))}
            placeholder="Motif du refus — il figure sur la décision notifiée à l'étudiant"
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <div className="flex items-center gap-2">
            <span className="text-second text-slate-500 flex-1 min-w-0">{!refus.motif.trim() && 'Un refus se motive (art. 6 § 2).'}</span>
            <button onClick={() => setRefus(null)} className="bouton">Annuler</button>
            <button disabled={!refus.motif.trim()} className="bouton bouton-fort"
              onClick={async () => { await majMesure(refus.mesure, { accorde: false, motif_refus: refus.motif }); setRefus(null); }}>Refuser la mesure</button>
          </div>
        </div>
      )}
    </div>
  );

  const SENS = { realisable: ['réalisable', 'var(--c-reussi, #3E7D5E)'], adaptation: ['avec adaptation', 'var(--c-attente, #B45309)'], impossible: ['pas réalisable', 'var(--c-refuse, #9D4A38)'] };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="titre-carte">Aménagements raisonnables</h3>
          <p className="text-second text-slate-500">Décret du 30 juin 2016 · année {annee}</p>
        </div>
        {d && <Badge ton={STATUTS[d.statut]?.ton || 'neutre'}>{STATUTS[d.statut]?.libelle}</Badge>}
        {!d && peutAmenager() && (
          <button onClick={creerDossier}
            className="bouton bouton-fort flex items-center gap-1.5">
            <IconPlus size={15} /> Ouvrir un dossier
          </button>
        )}
      </div>

      {message && (
        <div data-etat={message.type === 'err' ? 'corriger' : message.type === 'rappel' ? 'surveiller' : 'reussi'}
          className="bloc-etat px-3 py-2 text-sm flex items-start justify-between gap-2">
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="opacity-60">✕</button>
        </div>
      )}

      {/* La pièce vaut au-delà de l'année : une ligne, pas un bandeau. */}
      {data.piece_valide && (
        <div className="flex items-start gap-1.5 text-second" style={{ color: data.piece_valide.perime ? 'var(--c-attente, #B45309)' : 'rgb(var(--gris-600))' }}>
          <IconShieldCheck size={14} className="mt-0.5 flex-none" />
          <span>Pièce au dossier ({data.piece_valide.annee_scolaire}) : {data.piece_valide.note}</span>
        </div>
      )}

      {!d ? (
        <div className="py-8 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">Aucun dossier pour {annee}.</div>
      ) : (
        <>
          <EtapesAmenagement d={d} circuit={c} etapeActive={etapeVue} onAller={k => ouverte(k) && setEtape(k)} />

          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            {/* ── A — LA DEMANDE ── */}
            {etapeVue === 'demande' && (
              <div className="space-y-3">
                {/* LES AMÉNAGEMENTS SE COCHENT (Charles, 2 octobre 2026 : « des
                    aménagements listés à sélectionner, et une case autre ; ne
                    laisse pas trop de choix »). Chaque case cochée est une mesure
                    du dossier, que le cadre B ajuste. */}
                <ChoixMesures d={d} catalogue={data.catalogue} verrou={!!c?.b?.valide_le || (!!c?.a?.valide_le && !hors)}
                  onAjouter={ajouterMesure} onRetirer={id => supprimerMesure(id, true)} onPreciser={(m, t) => majMesure(m, { precisions: t })} />
                <label className="text-xs block">
                  {/* CONFIDENTIEL, ET CE N'EST PAS UNE MESURE (3 octobre 2026) : des
                      mesures y étaient écrites — elles n'allaient alors ni aux
                      chargés de cours ni au Conseil. Une mesure se coche, ou
                      s'écrit dans « Autre ». */}
                  <span className="intertitre block mb-1">Soins spécifiques <span className="normal-case font-normal text-slate-400">— confidentiel, non transmis aux chargés de cours (facultatif)</span></span>
                  <textarea rows={2} defaultValue={d.soins_specifiques || ''} disabled={!!c?.a?.valide_le}
                    placeholder="Suivi logopédique, kinésithérapie, traitement… — une mesure se coche plus haut, ou s'écrit dans « Autre »"
                    onBlur={e => e.target.value !== (d.soins_specifiques || '') && majDossier({ soins_specifiques: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {champ('date_demande', 'Date de la demande', 'date')}
                  {champ('signe_etudiant_le', "Signé par l'étudiant le", 'date')}
                  {champ('signe_reference_le', 'Reçu et signé le', 'date')}
                  {champ('personne_reference', 'Personne de référence')}
                  {champ('annexes_nb', 'Annexes — nombre', 'number')}
                  <div className="md:col-span-3">{champ('annexes_desc', 'Annexes — description')}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <label className="text-xs block">
                    <span className="intertitre block mb-1">Pièce produite</span>
                    <select value={d.piece_type || ''} disabled={!!c?.a?.valide_le} onChange={e => majDossier({ piece_type: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                      <option value="">— à recevoir</option>
                      <option value="probant">Document probant (art. 7 § 2, 1°)</option>
                      <option value="rapport_specialiste">Rapport de spécialiste (art. 7 § 2, 2°)</option>
                    </select>
                  </label>
                  {champ('piece_date', 'Date de la pièce', 'date')}
                  {champ('piece_auteur', 'Auteur de la pièce')}
                  {champ('piece_reference', 'Référence')}
                </div>
                <UesConcernees dossierId={d.id} annee={annee} choisies={d.ues || []} onChange={charger} />
                {barreValidation('a', 'La demande', 'valider-a', 'Le rapport (volet B) est ouvert.')}
              </div>
            )}

            {/* ── B — LE RAPPORT ET LES MESURES ── */}
            {etapeVue === 'rapport' && (
              <div className="space-y-3">
                {/* Les mesures cochées au cadre A, à ajuster : précisions, ajouts,
                    retraits. Matériel et pédagogique se lisent de chaque mesure. */}
                {tableMesures(false)}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {champ('rapport_annexes_nb', 'Annexes — nombre', 'number')}
                  <div className="md:col-span-2">{champ('rapport_annexes_desc', 'Annexes — description')}</div>
                  {champ('transmis_cde_le', 'Transmis au Conseil le', 'date')}
                </div>
                <label className="text-xs block">
                  <span className="intertitre block mb-1">Difficultés entravant le parcours</span>
                  <textarea defaultValue={d.besoins || ''} rows={2}
                    onBlur={e => e.target.value !== (d.besoins || '') && majDossier({ besoins: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </label>
                <p className="text-second text-slate-500">Le rapport se valide par la personne de référence{d.personne_reference ? ` (${d.personne_reference})` : ''}, ou par la direction. Sa validation appelle les chargés de cours des unités concernées : ils rendent leur avis dans Mes cours.</p>
                {barreValidation('b', 'Le rapport', 'valider-b', 'Les chargés de cours sont appelés à rendre leur avis.')}
              </div>
            )}

            {/* ── LES AVIS DES CHARGÉS DE COURS ── */}
            {etapeVue === 'avis' && (
              <div className="space-y-2">
                <p className="text-second text-slate-500">
                  Mesure par mesure, l'avis de chaque chargé de cours des unités concernées — rendu dans Mes cours. Il ne voit que les mesures demandées (secret professionnel, art. 5). Le Conseil peut trancher sans tous les avis.
                </p>
                {!(c?.charges || []).length ? (
                  <p className="text-sm text-slate-500">Aucun chargé de cours attribué cette année aux unités concernées.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-second border-collapse">
                      <thead><tr className="tab-entete text-left">
                        <th className="px-2 py-1.5">Mesure demandée</th>
                        {c.charges.map(p => <th key={p.professeur_id} className="px-2 py-1.5">{p.nom}<div className="font-normal text-xs text-slate-500">UE {p.ues.join(', ')}</div></th>)}
                      </tr></thead>
                      <tbody>
                        {d.mesures.map(m => (
                          <tr key={m.id} className="border-b border-slate-100 align-top">
                            <td className="px-2 py-1.5"><b>{m.libelle}</b>{m.precisions && <div className="text-xs text-slate-500">{m.precisions}</div>}</td>
                            {c.charges.map(p => {
                              const a0 = c.avis.find(x => x.mesure_id === m.id && x.professeur_id === p.professeur_id);
                              return (
                                <td key={p.professeur_id} className="px-2 py-1.5">
                                  {a0 ? <>
                                    <span className="inline-block text-xs font-semibold text-white rounded-full px-2" style={{ background: SENS[a0.sens]?.[1] }}>{SENS[a0.sens]?.[0]}</span>
                                    {a0.motif && <div className="text-xs mt-0.5">{a0.motif}</div>}
                                  </> : <span className="inline-block text-xs font-semibold text-white rounded-full px-2 bg-slate-400">attendu</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── LA DÉCISION DU CONSEIL ── */}
            {etapeVue === 'decision' && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Décision du Conseil
                  <select value={d.statut} onChange={e => majDossier({ statut: e.target.value })}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    {Object.entries(STATUTS).map(([k, s0]) => <option key={k} value={k}>{s0.libelle}</option>)}
                  </select>
                </label>
                {tableMesures(true)}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {champ('cde_recu_le', 'Reçu par le Conseil le', 'date')}
                  {champ('cde_date', 'Date de la décision', 'date')}
                  {champ('delai_mise_oeuvre', 'Délai de mise en œuvre')}
                  {champ('conditions_particulieres', 'Conditions particulières')}
                </div>
                <label className="text-xs block">
                  <span className="intertitre block mb-1">Motivation — obligatoire, art. 6 § 2</span>
                  <textarea defaultValue={d.cde_motivation || ''} rows={3}
                    onBlur={e => e.target.value !== (d.cde_motivation || '') && majDossier({ cde_motivation: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {champ('notifie_le', 'Notifiée le', 'date')}
                  <label className="text-xs block">
                    <span className="intertitre block mb-1">Mode de notification</span>
                    <select value={d.notifie_par || ''} onChange={e => majDossier({ notifie_par: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                      <option value="">—</option>
                      <option value="recommande">Lettre recommandée</option>
                      <option value="courriel">Courriel</option>
                      <option value="main_propre">Remise en mains propres contre accusé</option>
                    </select>
                  </label>
                </div>
                {(['partiel', 'refuse', 'recours'].includes(d.statut) || d.recours_le) && (
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <div className="text-second font-semibold text-iip-blue">Recours devant la Commission de l'enseignement pour adultes inclusif</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {champ('recours_le', 'Recours introduit le', 'date')}
                      {champ('recours_decision_le', 'Décision de la Commission le', 'date')}
                    </div>
                    <label className="text-xs block">
                      <span className="intertitre block mb-1">Issue du recours</span>
                      <textarea defaultValue={d.recours_issue || ''} rows={2}
                        onBlur={e => e.target.value !== (d.recours_issue || '') && majDossier({ recours_issue: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                  </div>
                )}
                <PiecesDossier d={d} etudId={etudId} onChange={charger} setMessage={setMessage} />
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">
            Les échanges relatifs à la situation de l'étudiant sont couverts par le secret professionnel. Seules les mesures sont montrées aux chargés de cours, à l'exclusion de la nature du handicap.
          </p>
        </>
      )}

      {/* LES ANNÉES PASSÉES SE RELISENT. L'onglet en donnait le nombre, et
          rien d'autre : on savait qu'un dossier existait, jamais ce qu'il
          avait décidé — or c'est la première question devant une nouvelle
          demande. Lecture seule : un dossier clos ne se réécrit pas d'ici. */}
      <DossiersAnterieurs dossiers={data.dossiers.filter(x => x.annee_scolaire !== annee)}
        annee={annee} etudId={etudId} setMessage={setMessage} />
    </div>
  );
}

/** Produit une pièce du dossier et l'ouvre dans l'aperçu commun. */
async function produirePiece(dossierId, type, etudId, setMessage) {
  const rep = await fetch(`/api/amenagements/dossier/${dossierId}/piece/${type}`,
    { headers: authHeaders() });
  const j = await rep.json().catch(() => ({}));
  if (!rep.ok) {
    setMessage({ type: 'err', texte: j.error || `erreur ${rep.status}` });
    return null;
  }
  if (type !== 'mesures') {
    ouvrirApercu({
      html: j.html, titre: j.titre, sousTitre: 'Aménagements raisonnables',
      nomFichier: j.nom, typeDoc: `amenagement_${type}`, astuceImpression: 'A4 portrait',
      // La décision et sa notification partent à l'étudiant qu'elles nomment ;
      // le formulaire reste au dossier.
      ...(type === 'formulaire' ? { envoiPossible: false }
        : { destinataire: { type: 'etudiant', id: etudId } }),
    });
  }
  return j;
}

const PIECES = [
  ['formulaire', 'Demande (A et B)'],
  ['decision', 'Décision'],
  ['notification', 'Notification'],
];

/**
 * Les pièces du dossier, et la communication des mesures aux chargés de cours.
 *
 * La fiche « mesures » part aux chargés de cours des unités concernées, un
 * envoi par personne, par le centre d'envoi — qui tient son journal. Le
 * dossier, lui, garde QUAND et À QUI : c'est la question qu'on posera le jour
 * où un chargé de cours dira n'avoir rien reçu.
 */
function PiecesDossier({ d, etudId, onChange, setMessage }) {
  const [envoi, setEnvoi] = useState(null);      // { pieces, sujet }
  const [enCours, setEnCours] = useState(false);
  const accorde = ['accepte', 'partiel', 'recours'].includes(d.statut)
    && (d.mesures || []).some(m => m.accorde);

  async function communiquer() {
    setEnCours(true);
    try {
      const fiche = await produirePiece(d.id, 'mesures', etudId, setMessage);
      if (!fiche) return;
      const rep = await fetch(`/api/amenagements/dossier/${d.id}/charges-de-cours`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      if (!j.professeurs.length) {
        setMessage({ type: 'err', texte: "Aucun chargé de cours n'est attribué, cette année, "
          + 'aux unités concernées : les attributions sont à compléter avant de communiquer.' });
        return;
      }
      setEnvoi({
        sujet: 'Aménagements raisonnables — mesures à mettre en œuvre',
        pieces: j.professeurs.map(p => ({
          html: fiche.html, nom_fichier: fiche.nom,
          destinataire: { type: 'professeur', id: p.id,
            nom: `${p.nom} ${p.prenom || ''}`.trim(), email: p.adresse_mail || '' },
        })),
      });
    } finally { setEnCours(false); }
  }

  async function consigner(resultat) {
    const partis = (resultat?.resultats || [])
      .filter(x => x.statut === 'envoye' || x.statut === 'simule').map(x => x.nom);
    if (!partis.length) return;
    await fetch(`/api/amenagements/dossier/${d.id}/communication`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ destinataires: partis }),
    });
    onChange && onChange();
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="text-sm font-semibold text-iip-blue">Pièces du dossier</div>
      <div className="flex flex-wrap gap-2">
        {PIECES.map(([type, lib]) => (
          <button key={type} className="bouton bouton-sortir flex items-center gap-1.5"
            onClick={() => produirePiece(d.id, type, etudId, setMessage)}>
            <IconSend size={14} /> {lib}
          </button>
        ))}
        <button className="bouton bouton-sortir flex items-center gap-1.5" disabled={!accorde}
          onClick={async () => {
            const f = await produirePiece(d.id, 'mesures', etudId, setMessage);
            if (f) ouvrirApercu({ html: f.html, titre: f.titre, sousTitre: 'Aménagements raisonnables',
              nomFichier: f.nom, typeDoc: 'amenagement_mesures', envoiPossible: false });
          }}>
          <IconSend size={14} /> Fiche « mesures »
        </button>
        <button className="bouton bouton-fort flex items-center gap-1.5" disabled={!accorde || enCours}
          onClick={communiquer}>
          <IconUsers size={14} /> {enCours ? 'Préparation…' : 'Communiquer aux chargés de cours'}
        </button>
      </div>
      <div className="text-second text-slate-500">
        {d.communique_le
          ? <>Mesures communiquées le <b>{String(d.communique_le).slice(0, 10).split('-').reverse().join('/')}</b>
              {d.communique_par && <> par <b>{d.communique_par}</b></>}
              {d.communique_a && <> à {d.communique_a}</>}.</>
          : accorde
            ? 'Les mesures n\'ont pas encore été communiquées aux chargés de cours.'
            : 'La fiche « mesures » et sa communication attendent une décision qui accorde au moins une mesure.'}
      </div>
      {envoi && (
        <EnvoiMailModal pieces={envoi.pieces} typeDoc="amenagement_mesures" sujet={envoi.sujet}
          onEnvoye={consigner} onClose={() => setEnvoi(null)} />
      )}
    </div>
  );
}

const MODES_NOTIF = { recommande: 'lettre recommandée', courriel: 'courriel', main_propre: 'en mains propres' };
const jourFr = x => (x ? String(x).slice(0, 10).split('-').reverse().join('/') : '—');

/** Les dossiers des années précédentes, en lecture. */
function DossiersAnterieurs({ dossiers, annee, etudId, setMessage }) {
  if (!dossiers?.length) return null;
  // On regarde parfois une année passée : un dossier plus récent n'est alors
  // pas « précédent », et le titre ne doit pas le dire.
  const toutesAvant = dossiers.every(x => String(x.annee_scolaire) < String(annee));
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-iip-blue">
        {toutesAvant ? 'Années précédentes' : 'Autres années'} ({dossiers.length})
      </div>
      {dossiers.map(x => (
        <details key={x.id} className="border border-slate-200 rounded-xl">
          <summary className="cursor-pointer px-4 py-2 flex items-center gap-3 flex-wrap text-sm">
            <b>{x.annee_scolaire}</b>
            <Badge ton={STATUTS[x.statut]?.ton || 'neutre'}>{STATUTS[x.statut]?.libelle || x.statut}</Badge>
            <span className="text-slate-500 text-second">
              demande du {jourFr(x.date_demande)} · décision du {jourFr(x.cde_date)}
              {' '}· {(x.mesures || []).filter(m => m.accorde).length} mesure(s) accordée(s)
            </span>
          </summary>
          <div className="px-4 pb-3 space-y-2 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1 text-second text-slate-600">
              <div>Personne de référence : <b>{x.personne_reference || '—'}</b></div>
              <div>Notifiée le <b>{jourFr(x.notifie_le)}</b>{x.notifie_par && ` (${MODES_NOTIF[x.notifie_par] || x.notifie_par})`}</div>
              <div>Délai de mise en œuvre : <b>{x.delai_mise_oeuvre || '—'}</b></div>
              {x.recours_le && <div className="md:col-span-3">Recours introduit le <b>{jourFr(x.recours_le)}</b>
                {x.recours_decision_le && <> · Commission le <b>{jourFr(x.recours_decision_le)}</b></>}
                {x.recours_issue && <> — {x.recours_issue}</>}</div>}
            </div>
            {(x.mesures || []).length > 0 && (
              <ul className="list-disc pl-5 text-second">
                {x.mesures.map(m => (
                  <li key={m.id} className={m.accorde ? '' : 'text-slate-400'}>
                    <span className={m.accorde ? '' : 'line-through'}>{m.libelle}</span>
                    {m.precisions && <span className="text-slate-500"> — {m.precisions}</span>}
                    {' '}<span className="text-slate-400">({PORTEES[m.portee] || m.portee})</span>
                    {!m.accorde && m.motif_refus && <span className="text-slate-500"> · refusée : {m.motif_refus}</span>}
                  </li>
                ))}
              </ul>
            )}
            {x.cde_motivation && (
              <div className="text-second text-slate-600"><b>Motivation :</b> {x.cde_motivation}</div>
            )}
            <div className="flex gap-2 pt-1">
              {PIECES.map(([type, lib]) => (
                <button key={type} className="bouton bouton-sortir flex items-center gap-1.5 text-second"
                  onClick={() => produirePiece(x.id, type, etudId, setMessage)}>
                  <IconSend size={13} /> {lib}
                </button>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * Les unités concernées par la demande (cadre A.2 du formulaire).
 *
 * Le formulaire les fait COCHER dans une liste : une demande d'aménagement ne
 * porte pas forcément sur toute l'année — un tiers-temps peut ne concerner que
 * les épreuves écrites d'une unité.
 */
function UesConcernees({ dossierId, annee, choisies, onChange }) {
  const [ues, setUes] = useState(null);
  const [sel, setSel] = useState(new Set(choisies || []));
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { setSel(new Set(choisies || [])); }, [choisies]);

  useEffect(() => {
    // Les unités du PAE de l'étudiant, non tout le référentiel : lui proposer
    // des unités qu'il ne suit pas n'a pas de sens.
    fetch(`/api/amenagements/dossier/${dossierId}/ues-possibles`,
      { headers: authHeaders() })
      .then(r => r.json())
      .then(j => setUes(Array.isArray(j?.ues) ? j.ues : []))
      .catch(() => setUes([]));
  }, [dossierId]);

  async function enregistrer(prochain) {
    setEnCours(true);
    try {
      await fetch(`/api/amenagements/dossier/${dossierId}/ues`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ ues: [...prochain] }),
      });
      onChange && onChange();
    } finally { setEnCours(false); }
  }

  if (!ues) return <div className="text-second text-slate-400">Chargement des unités…</div>;
  if (!ues.length) {
    return (
      <div className="text-second text-slate-500 border border-slate-200 rounded-lg p-3">
        Cet étudiant n'est inscrit à aucune unité en {annee} : son programme doit
        être établi avant de désigner les unités concernées.
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-iip-blue">
          Unités concernées {sel.size > 0 && `(${sel.size})`}
        </span>
        <span className="text-xs text-slate-400">
          {enCours ? 'Enregistrement…' : 'Aucune cochée = toutes'}
        </span>
      </div>
      <div className="max-h-40 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-x-3">
        {ues.map(u => (
          <label key={u.ue_num}
            className="flex items-center gap-2 py-0.5 text-second cursor-pointer">
            <input type="checkbox" checked={sel.has(u.ue_num)}
              onChange={() => {
                const n = new Set(sel);
                n.has(u.ue_num) ? n.delete(u.ue_num) : n.add(u.ue_num);
                setSel(n);
                enregistrer(n);
              }} />
            <span className="font-mono text-xs text-slate-500 w-10 flex-none">
              {u.ue_num}
            </span>
            <span className="truncate">{u.ue_nom}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* La liste courte, à cocher, rangée par moment ; « Autre » s'écrit. */
function ChoixMesures({ d, catalogue, verrou, onAjouter, onRetirer, onPreciser }) {
  const [autre, setAutre] = useState('');
  const parCode = new Map((d.mesures || []).filter(m => m.code).map(m => [m.code, m]));
  const autres = (d.mesures || []).filter(m => !m.code || m.code === 'AUTRE' || !catalogue.some(x => x.code === m.code));
  const moments = [...new Set(catalogue.map(x => x.moment || 'Autres'))];
  return (
    <div>
      <div className="intertitre mb-1.5">Aménagements demandés</div>
      <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
        {moments.map(mo => (
          <div key={mo}>
            <div className="intertitre mt-1">{mo}</div>
            {catalogue.filter(x => (x.moment || 'Autres') === mo).map(x => {
              const m = parCode.get(x.code);
              return (
                <div key={x.code} className="flex flex-wrap items-center gap-2 py-0.5 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!m} disabled={verrou}
                      onChange={() => (m ? onRetirer(m.id) : onAjouter({ code: x.code, libelle: x.libelle, nature: x.nature, portee: 'toutes' }))} />
                    {x.libelle}
                  </label>
                  {m && (
                    <input defaultValue={m.precisions || ''} disabled={verrou} placeholder="précision"
                      onBlur={e => e.target.value !== (m.precisions || '') && onPreciser(m, e.target.value)}
                      className="border border-slate-200 rounded px-1.5 py-0.5 text-second w-40" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 text-sm">
        {autres.map(m => (
          <div key={m.id} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" checked disabled={verrou} onChange={() => onRetirer(m.id)} />
            <span>{m.libelle}</span>
          </div>
        ))}
        {!verrou && (
          <div className="flex items-center gap-2 py-0.5">
            <input type="checkbox" checked={false} disabled readOnly />
            <span className="text-slate-500">Autre :</span>
            <input value={autre} onChange={e => setAutre(e.target.value)} placeholder="décrire l'aménagement"
              onKeyDown={e => { if (e.key === 'Enter' && autre.trim()) { onAjouter({ code: 'AUTRE', libelle: autre.trim(), nature: 'pedagogique', portee: 'toutes' }); setAutre(''); } }}
              className="border border-slate-300 rounded px-1.5 py-0.5 text-second flex-1 max-w-md" />
            <button type="button" disabled={!autre.trim()} className="bouton text-second px-2 py-0.5 disabled:opacity-40"
              onClick={() => { onAjouter({ code: 'AUTRE', libelle: autre.trim(), nature: 'pedagogique', portee: 'toutes' }); setAutre(''); }}>Ajouter</button>
          </div>
        )}
      </div>
    </div>
  );
}

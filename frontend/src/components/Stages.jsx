import { useEffect, useState } from 'react';
import ChampsAdresse, { ChoixPays } from './ChampsAdresse.jsx';
import {
  IconPlus, IconTrash, IconAlertTriangle, IconBuilding, IconCheck,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import ChoixUnite from './ChoixUnite.jsx';
import ConventionStage from './ConventionStage.jsx';
import { Tableau, TableauEntete, Th, Td, Tr, Badge, Fenetre } from './ui.jsx';
import { demander, saisir } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';

/**
 * Stages d'un étudiant — RDE, titre XIII.
 *
 * Deux objets qu'il ne faut pas confondre : le LIEU, qui vit d'une année sur
 * l'autre et sert à plusieurs étudiants, et le STAGE, qui est la période
 * effectuée par un étudiant dans ce lieu. C'est l'adresse du lieu qui figure au
 * supplément au diplôme, d'où l'insistance sur sa complétude.
 *
 * L'écran suit les deux jalons de l'article 51 — autorisation écrite et
 * convention signée — et signale ce qui manque avant que le stage puisse
 * commencer, plutôt que de l'interdire : c'est le professeur de stage qui juge.
 */
const STATUTS = {
  prevu:    { libelle: 'Prévu',      ton: 'neutre' },
  autorise: { libelle: 'Autorisé',   ton: 'info' },
  en_cours: { libelle: 'En cours',   ton: 'alerte' },
  termine:  { libelle: 'Terminé',    ton: 'succes' },
  rompu:    { libelle: 'Rompu',      ton: 'danger' },
  annule:   { libelle: 'Annulé',     ton: 'danger' },
};

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

export default function Stages({ etudId, annee, peutEcrire = true }) {
  const [stages, setStages] = useState(null);
  const [lieux, setLieux] = useState([]);
  const [ouvert, setOuvert] = useState(null);
  const [message, setMessage] = useState(null);
  const [nouveauLieu, setNouveauLieu] = useState(null);
  const [minimum, setMinimum] = useState({ section: null, heures: null });

  async function charger() {
    const [s, l] = await Promise.all([
      fetch(`/api/stages/etudiant/${etudId}`, { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/stages/lieux', { headers: authHeaders() }).then(r => r.json()),
    ]);
    setStages(s.stages || []);
    setMinimum({ section: s.section || null, heures: s.minimum ?? null });
    setLieux(Array.isArray(l) ? l : []);
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function creer() {
    const rep = await fetch('/api/stages', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee, statut: 'prevu' }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setOuvert(j.id);
    await charger();
  }

  async function maj(id, champs) {
    const rep = await fetch(`/api/stages/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(champs),
    });
    const j = await rep.json();
    if (j.rappel) setMessage({ type: 'rappel', texte: j.rappel });
    await charger();
  }

  async function supprimer(id) {
    if (!(await demander('Supprimer ce stage du dossier ?'))) return;
    await fetch(`/api/stages/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  const peutReglerMin = passeRole(['admin', 'directeur', 'directeur_adjoint']);
  async function reglerMinimum() {
    const v = await saisir({ message: `Minimum d'heures de stage pour la section ${minimum.section} (vide = aucun) :`, valeur: String(minimum.heures ?? '') });
    if (v == null) return;
    const rep = await fetch('/api/stages/minimum', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ section: minimum.section, heures: String(v).replace(',', '.') }) });
    if (rep.ok) await charger();
  }

  async function creerLieu() {
    const rep = await fetch('/api/stages/lieux', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(nouveauLieu),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setNouveauLieu(null);
    await charger();
    return j.id;
  }

  if (!stages) return <div className="py-8 text-center text-sm text-slate-400">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-iip-blue">Stages</h3>
          <p className="text-second text-slate-500">
            Le lieu et son adresse figurent au supplément au diplôme.
          </p>
        </div>
        {peutEcrire && (
          <button onClick={creer}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg">
            <IconPlus size={15} /> Ajouter un stage
          </button>
        )}
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-sm flex items-start justify-between gap-2 ${
          message.type === 'rappel' ? 'bg-amber-500 border border-amber-500 text-white'
                                    : 'bg-red-500 border border-red-500 text-white'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="opacity-60">✕</button>
        </div>
      )}

      {!stages.length ? (
        <div className="py-8 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          Aucun stage enregistré.
        </div>
      ) : (
        /* UN TABLEAU À VOLETS, PAS DES TUILES (Charles, 8 octobre 2026 : « fais une
           liste ou un tableau à volets, moderne ; sur chaque ligne, en visible, le
           nombre d'heures, le lieu et la note, puis on déroule ; et la somme totale
           pour vérifier le minimum de 600 h en TIM »). */
        <div className="border border-slate-200 rounded-carte overflow-hidden">
          <div className="grid grid-cols-[6.5rem_minmax(0,1.3fr)_minmax(0,1.2fr)_4.5rem_3.5rem_5.5rem_2rem] gap-2 px-3 py-1.5 tab-entete text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Période</span><span>Stage</span><span>Lieu</span><span className="text-right">Heures</span>
            <span className="text-right">Note</span><span>Statut</span><span />
          </div>
          {/* LE TOTAL EN PREMIER (Charles, 8 octobre 2026 : « les totaux doivent TOUJOURS être en
              premier dans les tableaux, sinon on doit scroller »), face au minimum de la section. */}
          {(() => {
            const total = stages.filter(x => !['rompu', 'annule'].includes(x.statut))
              .reduce((t, x) => t + (Number(x.heures_effectuees ?? x.heures_prevues) || 0), 0);
            const min = Number(minimum.heures) || 0;
            const ok = !min || total >= min;
            return (
              <div className="grid grid-cols-[6.5rem_minmax(0,1.3fr)_minmax(0,1.2fr)_4.5rem_3.5rem_5.5rem_2rem] gap-2 items-center px-3 py-2 border-b-2 border-slate-200 bg-white text-sm">
                <span className="col-span-3 font-semibold text-slate-700">
                  Total · {stages.length} stage(s)
                  {min ? <span className="font-normal text-slate-500"> — minimum {minimum.section} : {min} h</span>
                    : minimum.section && <span className="font-normal text-slate-400"> — aucun minimum réglé pour {minimum.section}</span>}
                  {peutReglerMin && minimum.section && (
                    <button type="button" className="ml-2 text-xs underline text-iip-blue font-normal" onClick={reglerMinimum}>régler</button>)}
                </span>
                <span className="text-right tabular-nums font-bold">{total} h</span>
                <span className="col-span-3">
                  {min > 0 && (
                    <span className="inline-flex items-center rounded-full px-2 h-6 text-xs font-semibold text-white"
                      style={{ background: ok ? 'var(--c-reussi)' : 'var(--c-attente)' }}>
                      {ok ? 'minimum atteint' : `manque ${min - total} h`}</span>)}
                </span>
              </div>);
          })()}
          {stages.map(s => (
            <div key={s.id} className="border-t border-slate-100">
              <div role="button" tabIndex={0} onClick={() => setOuvert(o => (o === s.id ? null : s.id))}
                onKeyDown={e => { if (e.key === 'Enter') setOuvert(o => (o === s.id ? null : s.id)); }}
                className={`grid grid-cols-[6.5rem_minmax(0,1.3fr)_minmax(0,1.2fr)_4.5rem_3.5rem_5.5rem_2rem] gap-2 items-center px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 ${ouvert === s.id ? 'bg-slate-50' : 'bg-white'}`}>
                <span className="text-second text-slate-600 tabular-nums leading-tight">
                  {s.date_debut ? <>{fr(s.date_debut)}<span className="block text-slate-400">→ {fr(s.date_fin)}</span>
                    {/* Une fin avant le début : une faute de frappe dans le relevé, à corriger. */}
                    {s.date_fin && s.date_fin < s.date_debut && (
                      <span className="block text-mention font-semibold" style={{ color: 'var(--c-attente)' }}>fin avant début</span>)}</> : s.annee_scolaire}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-slate-800">{s.intitule || (s.ue_num ? `UE ${s.ue_num}` : '—')}</span>
                  {s.domaine && <span className="block truncate text-xs text-slate-500">{s.domaine}</span>}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{s.lieu_nom || <span className="text-slate-400 italic font-normal">lieu à préciser</span>}</span>
                  {s.localite && <span className="block truncate text-xs text-slate-500">{s.localite}</span>}
                </span>
                <span className="text-right tabular-nums font-semibold">{(s.heures_effectuees ?? s.heures_prevues) != null ? `${s.heures_effectuees ?? s.heures_prevues} h` : '—'}</span>
                <span className="text-right tabular-nums">{s.note_tuteur ?? '—'}</span>
                <span className="flex items-center gap-1 min-w-0">
                  <Badge ton={STATUTS[s.statut]?.ton || 'neutre'}>{STATUTS[s.statut]?.libelle || s.statut}</Badge>
                  {!s.pret && <IconAlertTriangle size={14} className="flex-none" style={{ color: 'var(--c-attente)' }} title={`${s.blocages.length} pièce(s) manquante(s)`} />}
                </span>
                <span className="flex justify-end">
                  {peutEcrire && (
                    <button type="button" title="Supprimer ce stage" aria-label="Supprimer ce stage"
                      onClick={e => { e.stopPropagation(); supprimer(s.id); }}
                      className="text-slate-400 hover:text-[color:var(--c-refuse)]"><IconTrash size={15} /></button>)}
                </span>
              </div>
              {ouvert === s.id && (
                <div className="border-t border-slate-100 p-4 space-y-3">
                  {!s.pret && (
                    <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                    text-second text-amber-900 flex items-start gap-1.5">
                      <IconAlertTriangle size={14} className="mt-0.5 flex-none" />
                      <span>
                        Avant tout démarrage : {s.blocages.join(', ')}. Aucun stage ne peut
                        débuter sans autorisation écrite ni convention signée — le non-respect
                        entraîne son annulation.
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <ChampTexte libelle="Intitulé (« 3e année – Stage 5 »)" valeur={s.intitule}
                      onValider={v => maj(s.id, { intitule: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Domaine" valeur={s.domaine}
                      onValider={v => maj(s.id, { domaine: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Note du stage" valeur={s.note_tuteur} type="number"
                      onValider={v => maj(s.id, { note_tuteur: v })} lecture={!peutEcrire} />
                  </div>

                  <Champ libelle="Lieu de stage">
                    <div className="flex gap-2">
                      <select value={s.lieu_id || ''} disabled={!peutEcrire}
                        onChange={e => maj(s.id, { lieu_id: e.target.value || null })}
                        className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">— à préciser —</option>
                        {/* LE RÉPERTOIRE DE LA SECTION D'ABORD (Charles, 3 octobre
                            2026) : les lieux connus pour cette UE, puis ceux de la
                            section, puis les autres. */}
                        {(() => {
                          const ue = String(s.ue_num || '');
                          const pourUE = l => l.section && l.section === s.section && ue && `,${l.ues || ''},`.includes(`,${ue},`);
                          const groupes = [
                            [`Répertoire ${s.section || ''}${ue ? ` — UE ${ue}` : ''}`, lieux.filter(pourUE)],
                            [`Répertoire ${s.section || ''}`, lieux.filter(l => l.section && l.section === s.section && !pourUE(l))],
                            ['Autres lieux', lieux.filter(l => !(l.section && l.section === s.section))],
                          ].filter(([, l]) => l.length);
                          const option = l => (
                            <option key={l.id} value={l.id}>
                              {l.nom}{l.service ? ` — ${l.service}` : ''}{l.secteur && l.secteur !== l.service ? ` — ${l.secteur}` : ''}{l.localite ? ` · ${l.localite}` : ''}
                              {l.nb_stages ? ` (${l.nb_stages})` : ''}
                            </option>
                          );
                          return groupes.length > 1 || (groupes[0] && groupes[0][0] !== 'Autres lieux')
                            ? groupes.map(([titre, l]) => <optgroup key={titre} label={titre}>{l.map(option)}</optgroup>)
                            : lieux.map(option);
                        })()}
                      </select>
                      {peutEcrire && (
                        <button onClick={() => setNouveauLieu({ pays: 'Belgique' })}
                          className="text-second px-2.5 py-1 border border-slate-300 rounded-lg
                                     hover:bg-slate-50 whitespace-nowrap">
                          Nouveau lieu
                        </button>
                      )}
                    </div>
                    {s.lieu_nom && (
                      <div className="text-xs text-slate-500 mt-1">
                        {[s.adresse, [s.cp, s.localite].filter(Boolean).join(' '), s.pays]
                          .filter(Boolean).join(', ')}
                        {!s.adresse && (
                          <span className="text-amber-700">
                            {' '}— adresse incomplète, elle figurera au supplément au diplôme
                          </span>
                        )}
                      </div>
                    )}
                  </Champ>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* L'UNITÉ SE CHOISIT, ELLE NE SE TAPE PAS (2.12.208). */}
                    <Champ libelle="UE">
                      <ChoixUnite value={s.ue_num} annee={s.annee_scolaire} disabled={!peutEcrire}
                        onChange={v => maj(s.id, { ue_num: v })} className="w-full" />
                    </Champ>
                    <ChampTexte libelle="Début" valeur={s.date_debut} type="date"
                      onValider={v => maj(s.id, { date_debut: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Fin" valeur={s.date_fin} type="date"
                      onValider={v => maj(s.id, { date_fin: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Heures prévues" valeur={s.heures_prevues} type="number"
                      onValider={v => maj(s.id, { heures_prevues: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Heures effectuées" valeur={s.heures_effectuees} type="number"
                      onValider={v => maj(s.id, { heures_effectuees: v })} lecture={!peutEcrire} />
                    <Champ libelle="Statut">
                      <select value={s.statut} disabled={!peutEcrire}
                        onChange={e => maj(s.id, { statut: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                        {Object.entries(STATUTS).map(([k, v]) => (
                          <option key={k} value={k}>{v.libelle}</option>
                        ))}
                      </select>
                    </Champ>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                    <ChampTexte libelle="Maître de stage" valeur={s.maitre_stage}
                      onValider={v => maj(s.id, { maitre_stage: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Fonction" valeur={s.maitre_fonction}
                      onValider={v => maj(s.id, { maitre_fonction: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Courriel" valeur={s.maitre_email} type="email"
                      onValider={v => maj(s.id, { maitre_email: v })} lecture={!peutEcrire} />
                  </div>

                  {/* Les jalons de l'article 51 et les pièces de l'article 55 */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                    <ChampTexte libelle="Autorisation le" valeur={s.autorisation_le} type="date"
                      onValider={v => maj(s.id, { autorisation_le: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Convention le" valeur={s.convention_le} type="date"
                      onValider={v => maj(s.id, { convention_le: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Casier modèle 2" valeur={s.casier_le} type="date"
                      onValider={v => maj(s.id, { casier_le: v })} lecture={!peutEcrire} />
                    <ChampTexte libelle="Médecine du travail" valeur={s.medecine_le} type="date"
                      onValider={v => maj(s.id, { medecine_le: v })} lecture={!peutEcrire} />
                  </div>

                  {/* La convention elle-même : déposée ici, signée d'un clic par la
                      direction depuis son Accueil (routes/conventions.js). */}
                  <ConventionStage stage={s} peutEcrire={peutEcrire} onChange={charger} />

                  <Champ libelle="Évaluation du tuteur">
                    <textarea defaultValue={s.evaluation_tuteur || ''} rows={2} readOnly={!peutEcrire}
                      onBlur={e => e.target.value !== (s.evaluation_tuteur || '')
                        && maj(s.id, { evaluation_tuteur: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                    <p className="text-xs text-slate-500 mt-1">
                      L'évaluation du tuteur est l'un des éléments pris en compte par le Conseil
                      des études, qui reste seul habilité à sanctionner les études.
                    </p>
                  </Champ>

                  {peutEcrire && (
                    <div className="flex justify-end">
                      <button onClick={() => supprimer(s.id)}
                        className="flex items-center gap-1.5 text-second text-slate-400 hover:text-red-600">
                        <IconTrash size={14} /> Retirer ce stage
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

        </div>
      )}

      {/* Création d'un lieu, sans quitter la fiche */}
      {nouveauLieu && (
        <Fenetre titre="Nouveau lieu de stage" large="moyenne" onFermer={() => setNouveauLieu(null)}
          pied={<>
            <span />
            <button onClick={() => setNouveauLieu(null)} className="bouton">Annuler</button>
            <button onClick={creerLieu} disabled={!nouveauLieu.nom}
              className="bouton bouton-fort">
              Créer
            </button>
          </>}>
          <div className="space-y-3">
            <p className="text-second text-slate-500">
              L'adresse complète figurera au supplément au diplôme de chaque étudiant accueilli.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* L'ADRESSE, PARTOUT LA MÊME : code postal → localité → rue. */}
              <ChampsAdresse valeurs={{ cp: nouveauLieu.cp, localite: nouveauLieu.localite, rue: nouveauLieu.adresse }}
                poser={(k, v) => setNouveauLieu(x => ({ ...x, [{ cp: 'cp', localite: 'localite', rue: 'adresse' }[k]]: v }))} />
              <label className="text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Pays</span>
                <ChoixPays value={nouveauLieu.pays} onChange={v => setNouveauLieu(x => ({ ...x, pays: v }))} />
              </label>
              {[['nom', 'Nom de l\u2019établissement'], ['service', 'Service ou département'],
                ['secteur', 'Secteur'], ['num_entreprise', 'N° d\u2019entreprise'],
                ['contact_nom', 'Personne de contact'], ['contact_email', 'Courriel'],
                ['contact_tel', 'Téléphone'], ['agrement', 'Agrément']].map(([k, l]) => (
                <label key={k} className="text-xs">
                  <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">{l}</span>
                  <input value={nouveauLieu[k] || ''}
                    onChange={e => setNouveauLieu(v => ({ ...v, [k]: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </label>
              ))}
            </div>
          </div>
        </Fenetre>
      )}
    </div>
  );
}

function Champ({ libelle, children }) {
  return (
    <label className="text-xs block">
      <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">{libelle}</span>
      {children}
    </label>
  );
}

function ChampTexte({ libelle, valeur, type = 'text', onValider, lecture }) {
  return (
    <Champ libelle={libelle}>
      <input type={type} defaultValue={valeur ?? ''} readOnly={lecture}
        onBlur={e => !lecture && e.target.value !== String(valeur ?? '')
          && onValider(e.target.value || null)}
        className={`w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm
                    ${lecture ? 'bg-slate-50 text-slate-600' : ''}`} />
    </Champ>
  );
}

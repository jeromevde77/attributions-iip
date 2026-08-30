import { useEffect, useState } from 'react';
import {
  IconPlus, IconTrash, IconAlertTriangle, IconBuilding, IconCheck,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Tableau, TableauEntete, Th, Td, Tr, Badge } from './ui.jsx';

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

  async function charger() {
    const [s, l] = await Promise.all([
      fetch(`/api/stages/etudiant/${etudId}`, { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/stages/lieux', { headers: authHeaders() }).then(r => r.json()),
    ]);
    setStages(s.stages || []);
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
    if (!window.confirm('Supprimer ce stage du dossier ?')) return;
    await fetch(`/api/stages/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
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
          <h3 className="text-[15px] font-semibold text-iip-blue">Stages</h3>
          <p className="text-[12px] text-slate-500">
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
        <div className={`px-3 py-2 rounded-lg text-[12.5px] flex items-start justify-between gap-2 ${
          message.type === 'rappel' ? 'bg-amber-50 border border-amber-200 text-amber-900'
                                    : 'bg-red-50 border border-red-200 text-red-800'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="opacity-60">✕</button>
        </div>
      )}

      {!stages.length ? (
        <div className="py-8 text-center text-[13px] text-slate-400 border-2 border-dashed rounded-xl">
          Aucun stage enregistré.
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map(s => (
            <div key={s.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <button onClick={() => setOuvert(o => (o === s.id ? null : s.id))}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                <IconBuilding size={16} className="text-slate-400 flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">
                    {s.lieu_nom || <span className="text-slate-400 italic">lieu à préciser</span>}
                    {s.localite && <span className="text-slate-500 font-normal"> · {s.localite}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {s.annee_scolaire}
                    {s.ue_num ? ` · UE ${s.ue_num}` : ''}
                    {s.date_debut ? ` · ${fr(s.date_debut)} → ${fr(s.date_fin)}` : ''}
                  </div>
                </div>
                {!s.pret && (
                  <Badge ton="alerte">
                    {s.blocages.length} pièce(s) manquante(s)
                  </Badge>
                )}
                <Badge ton={STATUTS[s.statut]?.ton || 'neutre'}>
                  {STATUTS[s.statut]?.libelle || s.statut}
                </Badge>
                <span className="text-slate-400 text-[13px]">{ouvert === s.id ? '−' : '+'}</span>
              </button>

              {ouvert === s.id && (
                <div className="border-t border-slate-100 p-4 space-y-3">
                  {!s.pret && (
                    <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                    text-[11.5px] text-amber-900 flex items-start gap-1.5">
                      <IconAlertTriangle size={14} className="mt-0.5 flex-none" />
                      <span>
                        Avant tout démarrage : {s.blocages.join(', ')}. Aucun stage ne peut
                        débuter sans autorisation écrite ni convention signée — le non-respect
                        entraîne son annulation.
                      </span>
                    </div>
                  )}

                  <Champ libelle="Lieu de stage">
                    <div className="flex gap-2">
                      <select value={s.lieu_id || ''} disabled={!peutEcrire}
                        onChange={e => maj(s.id, { lieu_id: e.target.value || null })}
                        className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                        <option value="">— à préciser —</option>
                        {lieux.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.nom}{l.localite ? ` · ${l.localite}` : ''}
                            {l.nb_stages ? ` (${l.nb_stages})` : ''}
                          </option>
                        ))}
                      </select>
                      {peutEcrire && (
                        <button onClick={() => setNouveauLieu({ pays: 'Belgique' })}
                          className="text-[12px] px-2.5 py-1 border border-slate-300 rounded-lg
                                     hover:bg-slate-50 whitespace-nowrap">
                          Nouveau lieu
                        </button>
                      )}
                    </div>
                    {s.lieu_nom && (
                      <div className="text-[11px] text-slate-500 mt-1">
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
                    <ChampTexte libelle="UE" valeur={s.ue_num} type="number"
                      onValider={v => maj(s.id, { ue_num: v })} lecture={!peutEcrire} />
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

                  <Champ libelle="Évaluation du tuteur">
                    <textarea defaultValue={s.evaluation_tuteur || ''} rows={2} readOnly={!peutEcrire}
                      onBlur={e => e.target.value !== (s.evaluation_tuteur || '')
                        && maj(s.id, { evaluation_tuteur: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                    <p className="text-[10.5px] text-slate-500 mt-1">
                      L'évaluation du tuteur est l'un des éléments pris en compte par le Conseil
                      des études, qui reste seul habilité à sanctionner les études.
                    </p>
                  </Champ>

                  {peutEcrire && (
                    <div className="flex justify-end">
                      <button onClick={() => supprimer(s.id)}
                        className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-red-600">
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
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setNouveauLieu(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-16 p-5 space-y-3">
            <div className="text-[15px] font-semibold text-iip-blue">Nouveau lieu de stage</div>
            <p className="text-[11.5px] text-slate-500">
              L'adresse complète figurera au supplément au diplôme de chaque étudiant accueilli.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[['nom', 'Nom de l\u2019établissement'], ['service', 'Service ou département'],
                ['adresse', 'Adresse'], ['cp', 'Code postal'], ['localite', 'Localité'],
                ['pays', 'Pays'], ['secteur', 'Secteur'], ['num_entreprise', 'N° d\u2019entreprise'],
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
            <div className="flex justify-end gap-2">
              <button onClick={() => setNouveauLieu(null)}
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
              <button onClick={creerLieu} disabled={!nouveauLieu.nom}
                className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
                Créer
              </button>
            </div>
          </div>
        </div>
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

import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendarEvent, IconChecklist, IconPlus, IconPrinter,
  IconCheck, IconChevronLeft, IconClock, IconUser,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { PageHeader, RailLateral } from '../components/ui.jsx';
import { nomDepuisChaine } from '../lib/nom.js';
import PreviewModal from '../components/PreviewModal.jsx';

/**
 * SUIVI D'ÉQUIPE — la réunion, et ce qu'elle laisse derrière elle.
 *
 * Une réunion de service se prépare dans un traitement de texte, se note sur un
 * carnet, et quinze jours plus tard on rouvre la séance en demandant « où en
 * est-on ? » — à quoi personne ne peut répondre. Ce qui manque n'est pas un
 * outil de gestion de projet : c'est le LIEN entre ce qui a été dit et ce qui a
 * été fait.
 *
 * L'écran tient donc en deux faces :
 *   · LES RÉUNIONS — l'ordre du jour, les présents, les notes, les tâches qui
 *     en sortent, et le procès-verbal qui s'imprime ;
 *   · LES TÂCHES — la même matière vue par personne, parce que c'est ainsi
 *     qu'on la lit en séance : « toi, tu as ces trois-là ».
 *
 * Ce qu'on ouvre en premier, c'est la réunion du jour avec, en tête, CE QUI
 * RESTE OUVERT des séances précédentes. C'est le premier point de tout suivi,
 * et c'est justement celui qu'on oublie de préparer.
 */

const STATUTS = [
  ['a_faire',    'à faire'],
  ['en_cours',   'en cours'],
  ['fait',       'fait'],
  ['abandonnee', 'abandonnée'],
];

const ROLES_CIBLES = [
  ['secretariat',       'Le secrétariat'],
  ['coordination',      'La coordination'],
  ['directeur_adjoint', 'La direction adjointe'],
  ['directeur',         'La direction'],
];

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

/** En retard : une échéance passée sur une tâche qui n'est ni faite ni abandonnée. */
const enRetard = t => t.echeance && t.echeance < aujourdhui()
  && t.statut !== 'fait' && t.statut !== 'abandonnee';

export default function SuiviEquipe() {
  const [vue, setVue] = useState('reunions');   // reunions | taches
  const [reunions, setReunions] = useState([]);
  const [ouverte, setOuverte] = useState(null); // détail d'une réunion
  const [taches, setTaches] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [types, setTypes] = useState([]);
  const [perimetre, setPerimetre] = useState({ sections: [], ues: [] });
  const [apercu, setApercu] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState('ouvertes');

  const api = async (chemin, options = {}) => {
    const rep = await fetch('/api/reunions' + chemin, {
      ...options,
      headers: { ...authHeaders(), 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!rep.ok) throw new Error((await rep.json().catch(() => ({}))).error || 'erreur');
    return rep.json();
  };

  const chargerReunions = () => api('/').then(setReunions).catch(() => {});
  const chargerTaches = () => api('/taches').then(setTaches).catch(() => {});

  useEffect(() => { chargerReunions(); chargerTaches();
    api('/personnes').then(setPersonnes).catch(() => {});
    api('/obligations').then(setObligations).catch(() => {});
    api('/types').then(setTypes).catch(() => {});
    api('/perimetre').then(setPerimetre).catch(() => {}); }, []);

  const ouvrir = id => api('/' + id).then(setOuverte).catch(() => {});

  async function nouvelleReunion(genre = 'secretariat') {
    const t = types.find(x => x.cle === genre);
    const { id } = await api('/', { method: 'POST', body: JSON.stringify({
      genre, titre: t?.libelle || 'Réunion', date_seance: aujourdhui(),
      heure_seance: new Date().toTimeString().slice(0, 5),
      // LES PRÉSENTS SONT PROPOSÉS, PAS SAISIS. L'équipe ne change pas d'une
      // semaine à l'autre : on précoche tout le monde et l'on décoche l'absent,
      // ce qui prend un clic au lieu de cinq.
      participants: personnes
        .filter(p => ['secretariat', 'directeur', 'directeur_adjoint'].includes(p.role))
        .map(p => ({ user_id: p.user_id, professeur_id: p.professeur_id,
                     nom: p.nom, present: 1 })),
    }) });
    await chargerReunions();
    ouvrir(id);
  }

  async function imprimer(chemin, corps) {
    const { html, nom, titre } = await api(chemin, {
      method: 'POST', body: JSON.stringify(corps || {}),
    });
    setApercu({ html, nom, titre });
  }

  const tachesOuvertes = useMemo(
    () => taches.filter(t => t.statut === 'a_faire' || t.statut === 'en_cours'), [taches]);

  return (
    <div className="relative">
      <RailLateral
        icon={IconChecklist} titre="Suivi d'équipe"
        sousTitre={`${tachesOuvertes.length} tâche(s) ouverte(s)`}
        impression={null}
        sections={[
          { label: 'Vue', items: [
            { key: 'reunions', label: 'Réunions', icon: IconCalendarEvent,
              actif: vue === 'reunions', onClick: () => { setVue('reunions'); setOuverte(null); } },
            { key: 'taches', label: 'Tâches', icon: IconChecklist,
              actif: vue === 'taches', onClick: () => { setVue('taches'); setOuverte(null); } },
          ]},
          { label: 'Actions', items: [
            { key: 'nouvelle', label: 'Nouvelle réunion', icon: IconPlus,
              onClick: () => nouvelleReunion() },
            { key: 'feuille', label: 'Feuille des tâches', icon: IconPrinter,
              couleur: 'var(--menu-accent)',
              onClick: () => imprimer('/taches/document') },
          ]},
        ]}
      />

      <div className="gouttiere-rail p-4 md:p-8">
        {ouverte ? (
          <DetailReunion reunion={ouverte} personnes={personnes} obligations={obligations}
            types={types} perimetre={perimetre} api={api}
            onRetour={() => { setOuverte(null); chargerReunions(); chargerTaches(); }}
            onRecharger={() => { ouvrir(ouverte.id); chargerTaches(); }}
            onImprimer={() => imprimer(`/${ouverte.id}/document`)} />
        ) : vue === 'reunions' ? (
          <>
            <PageHeader titre="Réunions" sous="Ordre du jour, décisions, et ce qui en découle"
              actions={
                /* ON CHOISIT LE TYPE, ON N'ÉCRIT PAS L'INTITULÉ. Écrit à la
                   main, « Réunion secrétariat », « réu secrét. » et
                   « Secrétariat 15/09 » désignent la même chose sans jamais se
                   regrouper : l'historique d'un type de réunion devient
                   introuvable. La liste est courte et connue. */
                <select value="" className="controle-fort controle px-3 text-[13px]
                    bg-iip-blue text-white rounded-champ border-0"
                  onChange={e => e.target.value && nouvelleReunion(e.target.value)}>
                  <option value="">+ Nouvelle réunion…</option>
                  {types.map(t => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
                </select>
              } />
            {!reunions.length && (
              <p className="text-[13px] text-slate-400">
                Aucune réunion cette année. La première se crée d'un bouton : l'ordre du
                jour, les présents et les tâches se remplissent ensuite, y compris pendant
                la séance.
              </p>
            )}
            <div className="carte overflow-hidden">
              {reunions.map(r => (
                <button key={r.id} onClick={() => ouvrir(r.id)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3
                             border-t border-slate-100 first:border-t-0 hover:bg-slate-50">
                  <span className="text-[13px] text-slate-500 w-24 flex-none tabular-nums">
                    {fr(r.date_seance)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-iip-blue truncate">
                      {r.titre}
                    </span>
                    {(r.organisateur_nom || r.section || r.ues_libelle) && (
                      <span className="block text-[11px] text-slate-400 truncate">
                        {[r.organisateur_nom && nomDepuisChaine(r.organisateur_nom),
                          r.section, r.ues_libelle && `UE ${r.ues_libelle}`]
                          .filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {r.nb_ouvertes > 0 && (
                    <span className="text-[11px] font-semibold text-amber-700">
                      {r.nb_ouvertes} ouverte(s)
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">{r.nb_taches} tâche(s)</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <VueTaches taches={taches} personnes={personnes} obligations={obligations} api={api}
            filtre={filtreStatut} setFiltre={setFiltreStatut}
            onRecharger={chargerTaches}
            onImprimer={() => imprimer('/taches/document')} />
        )}
      </div>

      {apercu && (
        <PreviewModal html={apercu.html} titre={apercu.titre} nomFichier={apercu.nom}
          astuceImpression="A4 portrait" onClose={() => setApercu(null)} />
      )}
    </div>
  );
}

// ─── UNE RÉUNION ────────────────────────────────────────────────────────────

function DetailReunion({ reunion, personnes, obligations, types = [], perimetre,
                        api, onRetour, onRecharger, onImprimer }) {
  const [champs, setChamps] = useState({
    titre: reunion.titre, genre: reunion.genre || 'secretariat',
    date_seance: reunion.date_seance,
    heure_seance: reunion.heure_seance || '', lieu: reunion.lieu || '',
    ordre_du_jour: reunion.ordre_du_jour || '', notes: reunion.notes || '',
    section: reunion.section || '',
    organisateur_user_id: reunion.organisateur_user_id || null,
    organisateur_professeur_id: reunion.organisateur_professeur_id || null,
    prochaine_date: reunion.prochaine_date || '',
    prochaine_heure: reunion.prochaine_heure || '',
    prochain_lieu: reunion.prochain_lieu || '',
    prochaine_qui: reunion.prochaine_qui || '',
  });
  const [ues, setUes] = useState(reunion.ues || []);
  const [participants, setParticipants] = useState(reunion.participants || []);
  const [enregistre, setEnregistre] = useState(false);

  const poser = (k, v) => { setChamps(c => ({ ...c, [k]: v })); setEnregistre(false); };

  async function enregistrer() {
    await api(`/${reunion.id}`, { method: 'PUT',
      body: JSON.stringify({ ...champs, participants, ues }) });
    setEnregistre(true);
    onRecharger();
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onRetour} className="bouton controle px-2.5 flex items-center gap-1.5">
          <IconChevronLeft size={16} /> Réunions
        </button>
        <div className="flex-1" />
        <button onClick={enregistrer} className="bouton-fort controle px-3">
          {enregistre ? 'Enregistré' : 'Enregistrer'}
        </button>
        <button onClick={onImprimer} className="bouton-sortir controle px-3
          flex items-center gap-1.5">
          <IconPrinter size={16} /> Procès-verbal
        </button>
      </div>

      {/* L'IDENTITÉ DE LA SÉANCE SUR UNE LIGNE — ce qui s'explique à gauche,
          ce qui se remplit à droite, comme à la délibération. */}
      <div className="carte px-3 py-2.5 flex flex-wrap items-end gap-x-4 gap-y-2 mb-3">
        <label className="text-[11px] text-slate-500">
          Type de réunion
          <select value={champs.genre}
            onChange={e => {
              const t = types.find(x => x.cle === e.target.value);
              poser('genre', e.target.value);
              // Changer de type renomme la séance tant qu'on n'a pas écrit un
              // intitulé à soi : « Réunion » ne dit rien, « COPIL » si.
              if (t && (!champs.titre || types.some(x => x.libelle === champs.titre))) {
                poser('titre', t.libelle);
              }
            }}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px] max-w-[16rem]">
            {types.map(t => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[200px] text-[11px] text-slate-500">
          Intitulé
          <input value={champs.titre} onChange={e => poser('titre', e.target.value)}
            className="block w-full mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px]" />
        </label>
        <label className="text-[11px] text-slate-500">
          Date
          <input type="date" value={champs.date_seance}
            onChange={e => poser('date_seance', e.target.value)}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ px-2 h-9 text-[13px]" />
        </label>
        <label className="text-[11px] text-slate-500">
          Heure
          <input type="time" value={champs.heure_seance}
            onChange={e => poser('heure_seance', e.target.value)}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ px-2 h-9 text-[13px]" />
        </label>
        <label className="text-[11px] text-slate-500">
          Lieu
          <input value={champs.lieu} onChange={e => poser('lieu', e.target.value)}
            placeholder="Secrétariat"
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ px-2 h-9 text-[13px]" />
        </label>
        {/* QUI CONVOQUE SUIT. C'est lui qui rouvrira les points à la séance
            suivante : les actions décidées ici apparaissent aussi sur SON
            tableau de bord, en plus de celui de leur responsable. */}
        <label className="text-[11px] text-slate-500">
          Organisée par
          <select
            value={champs.organisateur_user_id ? `u:${champs.organisateur_user_id}`
              : champs.organisateur_professeur_id ? `p:${champs.organisateur_professeur_id}` : ''}
            onChange={e => {
              const [g, v2] = e.target.value.split(':');
              poser('organisateur_user_id', g === 'u' ? Number(v2) : null);
              poser('organisateur_professeur_id', g === 'p' ? Number(v2) : null);
            }}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px] max-w-[14rem]">
            <option value="">—</option>
            {personnes.map(p2 => (
              <option key={p2.cle} value={p2.cle}>{nomDepuisChaine(p2.nom)}</option>
            ))}
          </select>
        </label>
      </div>

      {/* SUR QUOI PORTE CETTE SÉANCE. Une coordination de section ne parle pas
          de tout l'institut, et une équipe d'unité encore moins. Écrire « UE
          281 » dans le titre ne permet ni de retrouver, ni de regrouper. */}
      <div className="carte px-3 py-2.5 flex flex-wrap items-end gap-x-4 gap-y-2 mb-3">
        <label className="text-[11px] text-slate-500">
          Section
          <select value={champs.section}
            onChange={e => { poser('section', e.target.value); setUes([]); }}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px] max-w-[14rem]">
            <option value="">Toutes — portée générale</option>
            {(perimetre?.sections || []).map(s2 => <option key={s2} value={s2}>{s2}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[260px] text-[11px] text-slate-500">
          Unités concernées <span className="text-slate-400">— facultatif, plusieurs possibles</span>
          <select multiple value={ues.map(String)} size={3}
            onChange={e => setUes([...e.target.selectedOptions].map(o => Number(o.value)))}
            className="block w-full mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 py-1 text-[13px]">
            {(perimetre?.ues || [])
              .filter(u => !champs.section || u.section === champs.section)
              .map(u => (
                <option key={u.ue_num} value={u.ue_num}>
                  UE {u.ue_num} — {u.ue_nom}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        <div className="carte p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Ordre du jour
          </div>
          <textarea value={champs.ordre_du_jour} rows={5}
            onChange={e => poser('ordre_du_jour', e.target.value)}
            placeholder={'Un point par ligne\nRentrée AeSI\nDossiers en attente'}
            className="w-full bg-white border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]" />
        </div>
        <div className="carte p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Notes de séance
          </div>
          <textarea value={champs.notes} rows={5}
            onChange={e => poser('notes', e.target.value)}
            placeholder="Ce qui s'est dit, ce qui a été tranché."
            className="w-full bg-white border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]" />
        </div>
      </div>

      {/* LES PRÉSENTS, sur deux colonnes : un service de cinq personnes ne
          mérite pas cinq lignes pleine largeur. */}
      <div className="carte p-3 mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          Présents
        </div>
        <div className="grid sm:grid-cols-3 gap-x-4">
          {participants.map((p, i) => (
            <label key={p.id || p.cle || p.nom} className="flex items-center gap-2 py-0.5 text-[13px]">
              <input type="checkbox" checked={!!p.present}
                onChange={e => setParticipants(l => l.map((x, k) =>
                  k === i ? { ...x, present: e.target.checked ? 1 : 0 } : x))} />
              <span className={p.present ? '' : 'text-slate-400'}>{nomDepuisChaine(p.nom)}</span>
            </label>
          ))}
          <AjoutParticipant personnes={personnes} deja={participants}
            onAjout={p => setParticipants(l => [...l, p])} />
        </div>
      </div>

      {/* CE QUI RESTE OUVERT D'AVANT — le premier point de toute réunion de
          suivi, et celui qu'on oublie de préparer. */}
      {!!reunion.reste?.length && (
        <div className="mb-3">
          <h2 className="text-[13px] font-semibold text-iip-blue mb-1.5">
            Ce qui restait ouvert <span className="font-normal text-slate-400">
              — {reunion.reste.length} tâche(s) des séances précédentes</span>
          </h2>
          <ListeTaches taches={reunion.reste} personnes={personnes}
            obligations={obligations} api={api} onRecharger={onRecharger} compact />
        </div>
      )}

      {/* LA PROCHAINE SÉANCE SE FIXE MAINTENANT, quand tout le monde est là —
          pas trois semaines plus tard par courriels croisés. Quand, où, et qui
          est attendu : ces trois lignes s'affichent ensuite sur le tableau de
          bord de chacun des présents. */}
      <div className="carte px-3 py-2.5 flex flex-wrap items-end gap-x-4 gap-y-2 mb-3">
        <div className="flex-none text-[11px] font-semibold uppercase tracking-wider
                        text-slate-500 w-full sm:w-auto sm:mr-2">
          Prochaine séance
        </div>
        <label className="text-[11px] text-slate-500">
          Date
          <input type="date" value={champs.prochaine_date}
            onChange={e => poser('prochaine_date', e.target.value)}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px]" />
        </label>
        <label className="text-[11px] text-slate-500">
          Heure
          <input type="time" value={champs.prochaine_heure}
            onChange={e => poser('prochaine_heure', e.target.value)}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px]" />
        </label>
        <label className="text-[11px] text-slate-500">
          Lieu
          <input value={champs.prochain_lieu} placeholder={champs.lieu || 'Secrétariat'}
            onChange={e => poser('prochain_lieu', e.target.value)}
            className="block mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px]" />
        </label>
        <label className="flex-1 min-w-[220px] text-[11px] text-slate-500">
          Qui est attendu
          <input value={champs.prochaine_qui}
            placeholder="Les mêmes, ou : Florian, Natacha, la coordination TIM"
            onChange={e => poser('prochaine_qui', e.target.value)}
            className="block w-full mt-0.5 bg-white border border-slate-300 rounded-champ
                       px-2 h-9 text-[13px]" />
        </label>
      </div>

      <h2 className="text-[13px] font-semibold text-iip-blue mb-1.5">
        Décidé au cours de cette séance
      </h2>
      <ListeTaches taches={reunion.taches} personnes={personnes}
        obligations={obligations} api={api}
        onRecharger={onRecharger} reunionId={reunion.id} avecAjout />
    </>
  );
}

/**
 * AJOUTER QUELQU'UN, DANS TOUT LE PERSONNEL. Une réunion de service invite
 * parfois une coordination ou un enseignant : la liste proposée est celle des
 * membres du personnel, pas celle des comptes Lucie.
 */
function AjoutParticipant({ personnes, deja, onAjout }) {
  const restants = personnes.filter(p => !deja.some(d =>
    (p.user_id && d.user_id === p.user_id)
    || (p.professeur_id && d.professeur_id === p.professeur_id)));
  if (!restants.length) return null;
  return (
    <select value="" onChange={e => {
      const p = restants.find(x => x.cle === e.target.value);
      if (p) onAjout({ user_id: p.user_id || null, professeur_id: p.professeur_id || null,
                       nom: p.nom, present: 1 });
    }}
      className="mt-0.5 bg-white border border-slate-300 rounded-champ px-2 h-8 text-[12px]
                 text-slate-500">
      <option value="">+ Ajouter quelqu'un…</option>
      {restants.map(p => <option key={p.cle} value={p.cle}>{nomDepuisChaine(p.nom)}</option>)}
    </select>
  );
}

/** « u:3 », « p:12 », « r:secretariat » → les colonnes correspondantes. */
function responsableDepuisCle(cle) {
  const [genre, valeur] = String(cle || '').split(':');
  return {
    responsable_user_id:       genre === 'u' ? Number(valeur) : null,
    responsable_professeur_id: genre === 'p' ? Number(valeur) : null,
    responsable_role:          genre === 'r' ? valeur : null,
  };
}

/**
 * À QUI — le personnel complet, et les services.
 *
 * On ne proposait que les comptes Lucie : la moitié de l'équipe était
 * inassignable, et les enseignants, qui n'en ont pas, invisibles. Le compte
 * dit qui peut se connecter ; il ne dit pas qui travaille ici.
 */
function ChoixResponsable({ personnes, tache, onChange }) {
  const valeur = tache.responsable_user_id ? `u:${tache.responsable_user_id}`
    : tache.responsable_professeur_id ? `p:${tache.responsable_professeur_id}`
    : tache.responsable_role ? `r:${tache.responsable_role}` : '';
  return (
    <select value={valeur} onChange={e => onChange(responsableDepuisCle(e.target.value))}
      className={`bg-white border rounded-champ px-1.5 h-8 text-[12px] max-w-[12rem]
        ${valeur ? 'border-slate-300' : 'border-amber-300'}`}>
      <option value="">— qui ? —</option>
      <optgroup label="Personnel">
        {personnes.map(p => (
          <option key={p.cle} value={p.cle}>{nomDepuisChaine(p.nom)}</option>
        ))}
      </optgroup>
      <optgroup label="Un service">
        {ROLES_CIBLES.map(([cle, lib]) => (
          <option key={cle} value={`r:${cle}`}>{lib}</option>
        ))}
      </optgroup>
    </select>
  );
}

// ─── LES TÂCHES ─────────────────────────────────────────────────────────────

function ListeTaches({ taches, personnes, obligations = [], api, onRecharger,
                       reunionId, avecAjout, compact }) {
  const [nouvelle, setNouvelle] = useState({
    titre: '', responsable: '', echeance: '', echeance_id: '' });

  async function ajouter() {
    if (!nouvelle.titre.trim()) return;
    await api('/taches', { method: 'POST', body: JSON.stringify({
      titre: nouvelle.titre.trim(),
      echeance: nouvelle.echeance || null,
      reunion_id: reunionId || null,
      echeance_id: nouvelle.echeance_id ? Number(nouvelle.echeance_id) : null,
      ...responsableDepuisCle(nouvelle.responsable),
    }) });
    setNouvelle({ titre: '', responsable: nouvelle.responsable, echeance: '',
                  echeance_id: nouvelle.echeance_id });
    onRecharger();
  }

  async function majTache(t, champs) {
    await api(`/taches/${t.id}`, { method: 'PUT', body: JSON.stringify(champs) });
    onRecharger();
  }

  return (
    <div className="carte overflow-hidden">
      {taches.map(t => (
        <div key={t.id}
          className="px-3 py-2 flex items-center gap-3 border-t border-slate-100 first:border-t-0">
          {/* COCHER, C'EST LE GESTE DE LA RÉUNION — il doit être le plus court. */}
          <button onClick={() => majTache(t, { statut: t.statut === 'fait' ? 'a_faire' : 'fait' })}
            title={t.statut === 'fait' ? 'Rouvrir la tâche' : 'Marquer comme faite'}
            className={`w-5 h-5 flex-none grid place-items-center rounded-champ border
              ${t.statut === 'fait'
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-slate-300 text-transparent hover:border-emerald-500'}`}>
            <IconCheck size={13} />
          </button>

          <span className={`flex-1 min-w-0 text-[13px]
            ${t.statut === 'fait' || t.statut === 'abandonnee'
              ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            {t.titre}
            {t.reunion_date && compact && (
              <span className="text-[11px] text-slate-400"> · décidée le {fr(t.reunion_date)}</span>
            )}
          </span>

          {!!obligations.length && (
            <select value={t.echeance_id || ''} title="Obligation servie par cette action"
              onChange={e => majTache(t, { echeance_id: e.target.value ? Number(e.target.value) : null })}
              className="bg-white border border-slate-300 rounded-champ px-1.5 h-8 text-[12px]
                         max-w-[12rem] text-slate-600">
              <option value="">— sans obligation —</option>
              {obligations.map(o => (
                <option key={o.id} value={o.id}>
                  {o.libelle}{o.base_legale ? ` · ${o.base_legale}` : ''}
                </option>
              ))}
            </select>
          )}

          <ChoixResponsable personnes={personnes} tache={t}
            onChange={champs => majTache(t, champs)} />

          {/* POUR QUAND — la deuxième moitié de toute décision. « Qui fait
              quoi » sans « pour quand » n'est pas une action, c'est une
              intention : on la retrouve ouverte trois réunions plus tard. */}
          <input type="date" value={t.echeance || ''} title="Pour quand"
            onChange={e => majTache(t, { echeance: e.target.value || null })}
            className={`bg-white border rounded-champ px-1.5 h-8 text-[12px]
              ${enRetard(t) ? 'border-amber-500 text-amber-800'
                : t.echeance ? 'border-slate-300' : 'border-amber-300'}`} />

          <select value={t.statut} onChange={e => majTache(t, { statut: e.target.value })}
            className="bg-white border border-slate-300 rounded-champ px-1.5 h-8 text-[12px]">
            {STATUTS.map(([cle, lib]) => <option key={cle} value={cle}>{lib}</option>)}
          </select>
        </div>
      ))}

      {!taches.length && !avecAjout && (
        <div className="px-3 py-3 text-[13px] text-slate-400">Aucune tâche.</div>
      )}

      {avecAjout && (
        /* LA TÂCHE SE CRÉE LÀ OÙ ELLE SE DÉCIDE — au bas de la liste, sans
           fenêtre : en séance, ouvrir une modale pour trois mots coûte plus que
           de les taper. */
        <div className="px-3 py-2 flex items-center gap-2 border-t border-slate-200
                        bg-[color:var(--tab-repere)]">
          <IconPlus size={15} className="text-slate-400 flex-none" />
          <input value={nouvelle.titre}
            onChange={e => setNouvelle(n => ({ ...n, titre: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && ajouter()}
            placeholder="Ce qu'il y a à faire…"
            className="flex-1 min-w-0 bg-white border border-slate-300 rounded-champ
                       px-2 h-8 text-[13px]" />
          <select value={nouvelle.responsable}
            onChange={e => setNouvelle(n => ({ ...n, responsable: e.target.value }))}
            className="bg-white border border-slate-300 rounded-champ px-1.5 h-8 text-[12px]
                       max-w-[12rem]">
            <option value="">— qui ? —</option>
            <optgroup label="Personnel">
              {personnes.map(p => (
                <option key={p.cle} value={p.cle}>{nomDepuisChaine(p.nom)}</option>
              ))}
            </optgroup>
            <optgroup label="Un service">
              {ROLES_CIBLES.map(([cle, lib]) => (
                <option key={cle} value={`r:${cle}`}>{lib}</option>
              ))}
            </optgroup>
          </select>
          <input type="date" value={nouvelle.echeance} title="Pour quand"
            onChange={e => setNouvelle(n => ({ ...n, echeance: e.target.value }))}
            className="bg-white border border-slate-300 rounded-champ px-1.5 h-8 text-[12px]" />
          {!!obligations.length && (
            /* RATTACHER À CE QUE LA CIRCULAIRE IMPOSE — facultatif : tout ne
               découle pas d'une obligation, mais quand c'est le cas, le lien
               vaut mieux qu'un souvenir. Choisir l'obligation reprend sa date
               si l'action n'en a pas encore. */
            <select value={nouvelle.echeance_id} title="Obligation servie"
              onChange={e => {
                const o = obligations.find(x => String(x.id) === e.target.value);
                setNouvelle(n => ({ ...n, echeance_id: e.target.value,
                  echeance: n.echeance || (o?.date_due || '') }));
              }}
              className="bg-white border border-slate-300 rounded-champ px-1.5 h-8 text-[12px]
                         max-w-[12rem] text-slate-600">
              <option value="">— sans obligation —</option>
              {obligations.map(o => (
                <option key={o.id} value={o.id}>
                  {o.libelle}{o.base_legale ? ` · ${o.base_legale}` : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={ajouter} className="bouton controle px-3">Ajouter</button>
        </div>
      )}
    </div>
  );
}

/** La même matière, vue par personne : c'est ainsi qu'on la lit en séance. */
function VueTaches({ taches, personnes, obligations, api, filtre, setFiltre,
                    onRecharger, onImprimer }) {
  const visibles = taches.filter(t => filtre === 'toutes'
    || (filtre === 'ouvertes' && (t.statut === 'a_faire' || t.statut === 'en_cours'))
    || (filtre === 'retard' && enRetard(t)));

  const groupes = useMemo(() => {
    const m = new Map();
    for (const t of visibles) {
      const cle = t.responsable_nom || (t.responsable_role
        ? (ROLES_CIBLES.find(r => r[0] === t.responsable_role)?.[1] || t.responsable_role)
        : 'Sans responsable');
      if (!m.has(cle)) m.set(cle, []);
      m.get(cle).push(t);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [visibles]);

  const nbRetard = taches.filter(enRetard).length;

  return (
    <>
      <PageHeader titre="Tâches" sous="Ce que chacun a en charge"
        actions={
          <>
            <div className="segments">
              {[['ouvertes', 'Ouvertes'], ['retard', `En retard${nbRetard ? ` (${nbRetard})` : ''}`],
                ['toutes', 'Toutes']].map(([cle, lib]) => (
                <button key={cle} onClick={() => setFiltre(cle)}
                  className={filtre === cle
                    ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>
                  {lib}
                </button>
              ))}
            </div>
            <button onClick={onImprimer} className="bouton-sortir controle px-3
              flex items-center gap-1.5">
              <IconPrinter size={16} /> Imprimer
            </button>
          </>
        } />

      {!groupes.length && (
        <p className="text-[13px] text-slate-400">Rien à ce filtre.</p>
      )}

      {groupes.map(([nom, liste]) => (
        <div key={nom} className="mb-3">
          <h2 className="text-[13px] font-semibold text-iip-blue mb-1.5 flex items-center gap-2">
            <IconUser size={15} className="text-slate-400" />
            {nomDepuisChaine(nom)}
            <span className="font-normal text-slate-400">— {liste.length} tâche(s)</span>
            {liste.some(enRetard) && (
              <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                <IconClock size={13} /> {liste.filter(enRetard).length} en retard
              </span>
            )}
          </h2>
          <ListeTaches taches={liste} personnes={personnes} obligations={obligations}
            api={api} onRecharger={onRecharger} compact />
        </div>
      ))}
    </>
  );
}

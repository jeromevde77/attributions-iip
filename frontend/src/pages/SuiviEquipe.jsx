import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendarEvent, IconChecklist, IconPlus, IconPrinter, IconTimeline,
  IconCheck, IconChevronLeft, IconClock, IconUser, IconX, IconTrash,
  IconClipboardPlus, IconEye, IconSearch, IconLock,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import FriseEcheances from '../components/FriseEcheances.jsx';
import { PageHeader, RailLateral } from '../components/ui.jsx';
import { nomDepuisChaine, nomListe, parNom } from '../lib/nom.js';
import PreviewModal from '../components/PreviewModal.jsx';
import ConfierTache from '../components/ConfierTache.jsx';

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
  /* ON OUVRE SUR LA FRISE, PAS SUR LA LISTE DES RÉUNIONS — ET C'EST UN AVEU.
   *
   * La frise a été demandée, écrite, livrée… et son auteur ne l'a pas retrouvée
   * deux jours plus tard. Elle était derrière une entrée de rail nommée
   * « Tâches », portant `IconChecklist` — LA MÊME ICÔNE QUE LE TITRE DE L'ÉCRAN :
   * rail replié, le libellé disparaît, et il restait deux cases à cocher
   * identiques dont l'une ne menait nulle part de visible. Si le développeur ne
   * la trouve pas, le secrétariat ne la trouvera jamais.
   *
   * La question de l'écran est « où en sommes-nous ? », et la réponse est le
   * TEMPS : ce qui tombe cette semaine. La liste des réunions est la matière,
   * pas la réponse. La frise passe donc devant, et l'icône du temps la
   * désigne. */
  const [vue, setVue] = useState('taches');   // taches | reunions
  const [reunions, setReunions] = useState([]);
  const [ouverte, setOuverte] = useState(null); // détail d'une réunion
  const [taches, setTaches] = useState([]);
  const [personnes, setPersonnes] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [types, setTypes] = useState([]);
  const [perimetre, setPerimetre] = useState({ sections: [], ues: [] });
  const [apercu, setApercu] = useState(null);
  const [filtreStatut, setFiltreStatut] = useState('ouvertes');
  const [confier, setConfier] = useState(false);

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
          /* L'ICÔNE DU TEMPS POUR LA FRISE, JAMAIS CELLE DU TITRE DE L'ÉCRAN.
             `IconChecklist` désigne déjà Suivi d'équipe lui-même : le rail
             replié montrait deux fois le même dessin. */
          { label: 'Vue', items: [
            { key: 'taches', label: 'Échéances et tâches', icon: IconTimeline,
              actif: vue === 'taches', onClick: () => { setVue('taches'); setOuverte(null); } },
            { key: 'reunions', label: 'Réunions', icon: IconCalendarEvent,
              actif: vue === 'reunions', onClick: () => { setVue('reunions'); setOuverte(null); } },
          ]},
          { label: 'Actions', items: [
            /* CONFIER SE FAIT ICI, OÙ LA TÂCHE SE SUIT (21 septembre 2026) —
               l'entrée de l'Accueil était « une icône de trop ». */
            { key: 'confier', label: 'Confier une tâche', icon: IconClipboardPlus,
              onClick: () => setConfier(true) },
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
            onImprimer={version => imprimer(`/${ouverte.id}/document`, version ? { version } : {})} />
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
                  {r.a_du_confidentiel && (
                    <span title="Cette séance porte des notes confidentielles"
                      className="text-[color:var(--brique)] flex-none">
                      <IconLock size={14} />
                    </span>
                  )}
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

      {confier && (
        <ConfierTache onClose={() => setConfier(false)} onCree={() => chargerTaches()} />
      )}

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
    notes_confidentielles: reunion.notes_confidentielles || '',
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
  const [points, setPoints] = useState(reunion.points || []);
  const [enregistre, setEnregistre] = useState(false);

  const poser = (k, v) => { setChamps(c => ({ ...c, [k]: v })); setEnregistre(false); };
  const poserPoint = (i, k, v) => {
    setPoints(l => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
    setEnregistre(false);
  };

  // QUI EST DANS LA SALLE. C'est la première liste à proposer quand on confie
  // une action : neuf fois sur dix, celui qui la prend est assis là.
  const presents = participants.filter(p => p.present).map(p => ({
    cle: p.user_id ? `u:${p.user_id}` : p.professeur_id ? `p:${p.professeur_id}` : '',
    nom: p.nom,
  })).filter(p => p.cle);

  async function enregistrer(listePoints = points) {
    await api(`/${reunion.id}`, { method: 'PUT',
      body: JSON.stringify({ ...champs, participants, ues, points: listePoints }) });
    setEnregistre(true);
    onRecharger();
  }

  // UN POINT NAÎT ENREGISTRÉ. Il doit porter un identifiant avant qu'on puisse
  // y rattacher une action : créé seulement en mémoire, la première tâche
  // décidée dessous se retrouverait orpheline.
  async function ajouterPoint() {
    const liste = [...points, { intitule: '', notes: '' }];
    setPoints(liste);
    await enregistrer(liste);
  }

  // Les identifiants que le serveur vient d'attribuer redescendent dans l'état
  // local SANS écraser ce qui est en train d'être tapé : on ne reprend que ce
  // qui manque.
  useEffect(() => {
    setPoints(l => l.map((p, i) => (p.id ? p : { ...p, id: reunion.points?.[i]?.id })));
  }, [reunion]);

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
        <button onClick={() => onImprimer()} className="bouton-sortir controle px-3
          flex items-center gap-1.5"
          title="Le PV à diffuser : les notes confidentielles n'y figurent pas">
          <IconPrinter size={16} /> Procès-verbal
        </button>
        {/* LE PV INTÉGRAL, pour qui lit le confidentiel — marqué comme tel,
            il ne se diffuse pas. */}
        {reunion.peut_confidentiel && (
          <button onClick={() => onImprimer('integrale')} className="bouton controle px-3
            flex items-center gap-1.5 text-[color:var(--brique)]"
            title="PV intégral, notes confidentielles comprises — à ne pas diffuser">
            <IconLock size={16} /> PV intégral
          </button>
        )}
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
            {[...personnes].sort((a, b) => parNom(a.nom, b.nom)).map(p2 => (
              <option key={p2.cle} value={p2.cle}>{nomListe(p2.nom)}</option>
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

      {/* LES PRÉSENTS, sur deux colonnes : un service de cinq personnes ne
          mérite pas cinq lignes pleine largeur. */}
      <div className="carte p-3 mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          Présents
        </div>
        <div className="grid sm:grid-cols-3 gap-x-4">
          {/* PAR NOM DE FAMILLE, comme partout ailleurs : une liste rangée par
              prénom n'est rangée pour personne. */}
          {participants
            .map((p, i) => ({ p, i }))
            .sort((a, b) => parNom(a.p.nom, b.p.nom))
            .map(({ p, i }) => (
            <label key={p.id || p.cle || p.nom} className="flex items-center gap-2 py-0.5 text-[13px]">
              <input type="checkbox" checked={!!p.present}
                onChange={e => setParticipants(l => l.map((x, k) =>
                  k === i ? { ...x, present: e.target.checked ? 1 : 0 } : x))} />
              <span className={p.present ? '' : 'text-slate-400'}>{nomListe(p.nom)}</span>
            </label>
          ))}
          <AjoutParticipant personnes={personnes} deja={participants}
            onAjout={p => setParticipants(l => [...l, p])} />
        </div>
      </div>

      {/* L'ORDRE DU JOUR, POINT PAR POINT.
          Un pavé de texte pour les points et un autre pour les notes obligeait
          à refaire soi-même le rapprochement trois semaines plus tard : quelle
          remarque allait avec quel point, et quelle décision répondait à quoi.
          Chaque point porte donc son intitulé, ce qui s'y est dit, et les
          actions qui en sortent — et le procès-verbal s'écrit tout seul, dans
          l'ordre de la séance. */}
      <h2 className="text-[13px] font-semibold text-iip-blue mb-1.5">Ordre du jour</h2>
      {!points.length && (
        <p className="text-[13px] text-slate-400 mb-2">
          Aucun point. Le premier se crée d'un bouton : l'intitulé se pose avant la séance,
          les notes et les décisions se remplissent pendant.
        </p>
      )}
      {points.map((p, i) => (
        <div key={p.id || `neuf-${i}`} className="carte p-3 mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[13px] font-semibold text-slate-400 tabular-nums w-5 flex-none">
              {i + 1}.
            </span>
            <input value={p.intitule || ''} autoFocus={!p.intitule}
              onChange={e => poserPoint(i, 'intitule', e.target.value)}
              onBlur={() => enregistrer()}
              placeholder="Intitulé du point — « Rentrée AeSI »"
              className="flex-1 min-w-0 bg-white border border-slate-300 rounded-champ
                         px-2 h-9 text-[13px] font-semibold" />
            <button
              onClick={() => { const l = points.filter((_, j) => j !== i);
                               setPoints(l); enregistrer(l); }}
              title="Retirer ce point — les actions décidées dessous sont conservées"
              className="bouton controle px-2 text-slate-400 hover:text-[color:var(--brique)]">
              <IconTrash size={15} />
            </button>
          </div>
          {p.masque ? (
            <p className="flex items-center gap-1.5 text-[12px] text-slate-500 bg-slate-50
                          border border-slate-200 rounded-champ px-2 py-1.5 mb-2">
              <IconLock size={14} className="flex-none" />
              Point confidentiel — les notes sont réservées à la direction, à l'organisateur
              et aux participants de la séance.
            </p>
          ) : (
            <>
              <textarea value={p.notes || ''} rows={3}
                onChange={e => poserPoint(i, 'notes', e.target.value)}
                onBlur={() => enregistrer()}
                placeholder="Ce qui s'est dit, ce qui a été tranché."
                className={`w-full border rounded-champ px-2 py-1.5 text-[13px] mb-1
                  ${p.confidentiel ? 'bg-red-50/40 border-red-200' : 'bg-white border-slate-300'}`} />
              {reunion.peut_confidentiel && (
                <label className="flex items-center gap-1.5 text-[12px] text-slate-500 mb-2 cursor-pointer w-fit"
                  title="Les notes de ce point ne seront lues que par la direction, l'organisateur et les participants — et n'apparaîtront pas dans le PV diffusé">
                  <input type="checkbox" checked={!!p.confidentiel}
                    onChange={e => {
                      const l = points.map((x, j) => (j === i ? { ...x, confidentiel: e.target.checked } : x));
                      setPoints(l); enregistrer(l);
                    }} />
                  <IconLock size={13} className={p.confidentiel ? 'text-[color:var(--brique)]' : ''} />
                  Notes confidentielles
                </label>
              )}
            </>
          )}
          {p.id ? (
            <ListeTaches taches={(reunion.taches || []).filter(t => t.point_id === p.id)}
              personnes={personnes} presents={presents} obligations={obligations} api={api}
              onRecharger={onRecharger} reunionId={reunion.id} pointId={p.id} avecAjout />
          ) : (
            <p className="text-[11px] text-slate-400">
              Enregistrez le point pour pouvoir y décider des actions.
            </p>
          )}
        </div>
      ))}
      <button onClick={ajouterPoint}
        className="bouton controle px-3 flex items-center gap-1.5 mb-3">
        <IconPlus size={15} /> Ajouter un point
      </button>

      {/* CE QUI RESTE OUVERT D'AVANT — le premier point de toute réunion de
          suivi, et celui qu'on oublie de préparer. */}
      {!!reunion.reste?.length && (
        <div className="mb-3">
          <h2 className="text-[13px] font-semibold text-iip-blue mb-1.5">
            Ce qui restait ouvert <span className="font-normal text-slate-400">
              — {reunion.reste.length} tâche(s) des séances précédentes</span>
          </h2>
          <ListeTaches taches={reunion.reste} personnes={personnes} presents={presents}
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

      {/* CE QUI SE DÉCIDE HORS D'UN POINT — les divers, et tout ce qui a été
          noté avant que la séance ne soit tenue par points. */}
      <h2 className="text-[13px] font-semibold text-iip-blue mb-1.5">
        {points.length ? 'Divers — décidé hors des points' : 'Décidé au cours de cette séance'}
      </h2>
      <ListeTaches taches={(reunion.taches || []).filter(t => !t.point_id)}
        personnes={personnes} presents={presents}
        obligations={obligations} api={api}
        onRecharger={onRecharger} reunionId={reunion.id} avecAjout />

      <div className="carte p-3 mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
          Notes générales <span className="normal-case font-normal text-slate-400">
            — ce qui ne tient à aucun point</span>
        </div>
        <textarea value={champs.notes} rows={3}
          onChange={e => poser('notes', e.target.value)} onBlur={() => enregistrer()}
          placeholder="Rarement nécessaire : ce qui s'est dit se note sous son point."
          className="w-full bg-white border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]" />
      </div>

      {/* LE HUIS CLOS DE LA SÉANCE. Présent seulement pour qui peut le lire —
          le serveur ne l'envoie à personne d'autre. Jamais dans le PV diffusé. */}
      {reunion.peut_confidentiel && (
        <div className="carte p-3 mt-3 border-red-200 bg-red-50/30">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brique)]
                          mb-1 flex items-center gap-1.5">
            <IconLock size={13} /> Notes confidentielles
            <span className="normal-case font-normal text-slate-500">
              — direction, organisateur et participants uniquement ; absentes du PV diffusé</span>
          </div>
          <textarea value={champs.notes_confidentielles} rows={4}
            onChange={e => poser('notes_confidentielles', e.target.value)} onBlur={() => enregistrer()}
            placeholder="Ce qui ne sort pas de la salle."
            className="w-full bg-white border border-red-200 rounded-champ px-2 py-1.5 text-[13px]" />
        </div>
      )}
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
      {[...restants].sort((a, b) => parNom(a.nom, b.nom))
        .map(p => <option key={p.cle} value={p.cle}>{nomListe(p.nom)}</option>)}
    </select>
  );
}

/**
 * LES CLÉS DÉJÀ PORTÉES PAR UNE TÂCHE, quelle que soit sa génération.
 *
 * Les tâches d'avant n'ont qu'un responsable, dans les colonnes historiques ;
 * les nouvelles ont un équipage. L'écran ne doit pas avoir à le savoir.
 */
function clesDeTache(t) {
  if (t.responsables?.length) return t.responsables.map(x => x.cle).filter(Boolean);
  if (t.responsable_user_id) return [`u:${t.responsable_user_id}`];
  if (t.responsable_professeur_id) return [`p:${t.responsable_professeur_id}`];
  if (t.responsable_role) return [`r:${t.responsable_role}`];
  return [];
}

/**
 * À QUI — LES PRÉSENTS D'ABORD, LE PERSONNEL ENSUITE, LES SERVICES ENFIN.
 *
 * Neuf fois sur dix, celui qui prend l'action est dans la salle : c'est lui
 * qu'il faut trouver en premier, et non au milieu d'une liste de quarante
 * noms. La liste complète reste dessous — une réunion charge parfois quelqu'un
 * qui n'y était pas, et le lui cacher obligerait à rouvrir la tâche ailleurs.
 *
 * ET L'ON PEUT ÊTRE PLUSIEURS. « Florian et Natacha préparent les dossiers »
 * se notait en choisissant l'un des deux : l'autre ne voyait rien sur son
 * tableau de bord. Chaque nom retenu devient une pastille ; la première est
 * celle qui répond de l'action.
 */
function ChoixResponsables({ personnes, presents = [], tache, onChange, informes = false }) {
  const cles = informes ? (tache.informes || []).map(x => x.cle).filter(Boolean) : clesDeTache(tache);
  const exclus = informes ? clesDeTache(tache) : [];
  const nomDeCle = cle => {
    if (cle.startsWith('r:')) return ROLES_CIBLES.find(r => r[0] === cle.slice(2))?.[1] || cle.slice(2);
    const p = personnes.find(x => x.cle === cle);
    return p ? nomListe(p.nom)
      : nomListe([...(tache.responsables || []), ...(tache.informes || [])]
          .find(x => x.cle === cle)?.nom || '') || '—';
  };
  const dansLaSalle = presents
    .map(p => personnes.find(x => x.cle === p.cle) || p)
    .filter(p => p?.cle && !cles.includes(p.cle) && !exclus.includes(p.cle))
    .sort((a, b) => parNom(a.nom, b.nom));
  const restants = personnes
    .filter(p => !cles.includes(p.cle) && !exclus.includes(p.cle)
      && !dansLaSalle.some(d => d.cle === p.cle))
    .sort((a, b) => parNom(a.nom, b.nom));

  return (
    <div className={`flex flex-wrap items-center gap-1 min-w-[10rem] max-w-[18rem]
      ${cles.length || informes ? '' : 'rounded-champ ring-1 ring-amber-300 px-1 py-0.5'}`}>
      {cles.map((cle, i) => (
        <span key={cle} title={informes ? 'Au courant, sans en répondre'
                              : i === 0 ? "Répond de l'action" : undefined}
          className={`inline-flex items-center gap-1 rounded-champ px-1.5 h-6 text-[11px]
            ${!informes && i === 0 ? 'bg-iip-blue/10 text-iip-blue font-semibold'
                      : 'bg-slate-100 text-slate-600'}`}>
          {informes && <IconEye size={11} className="text-slate-400" />}
          {nomDeCle(cle)}
          <button onClick={() => onChange(cles.filter(c => c !== cle))}
            className="text-slate-400 hover:text-slate-700" title="Retirer">
            <IconX size={11} />
          </button>
        </span>
      ))}
      <select value="" onChange={e => e.target.value && onChange([...cles, e.target.value])}
        className="bg-white border border-slate-300 rounded-champ px-1 h-6 text-[11px]
                   text-slate-500 max-w-[8rem]">
        <option value="">{informes ? '+ au courant…' : cles.length ? '+ aussi…' : '— qui ? —'}</option>
        {!!dansLaSalle.length && (
          <optgroup label="Présents à la séance">
            {dansLaSalle.map(p => (
              <option key={p.cle} value={p.cle}>{nomListe(p.nom)}</option>
            ))}
          </optgroup>
        )}
        <optgroup label="Tout le personnel">
          {restants.map(p => <option key={p.cle} value={p.cle}>{nomListe(p.nom)}</option>)}
        </optgroup>
        <optgroup label="Un service">
          {ROLES_CIBLES.filter(([c]) => !cles.includes(`r:${c}`))
            .map(([cle, lib]) => <option key={cle} value={`r:${cle}`}>{lib}</option>)}
        </optgroup>
      </select>
    </div>
  );
}

// ─── LES TÂCHES ─────────────────────────────────────────────────────────────

/**
 * UN TITRE QUI SE CORRIGE SUR PLACE.
 *
 * Une fenêtre pour changer trois mots coûte plus que de les taper — c'est déjà
 * l'argument qui a fait poser la création au bas de la liste. Le titre suit la
 * même règle : il s'édite là où il se lit.
 */
function TitreModifiable({ tache, compact, onValider }) {
  const [edite, setEdite] = useState(false);
  const [texte, setTexte] = useState(tache.titre || '');
  useEffect(() => { setTexte(tache.titre || ''); }, [tache.titre]);

  function valider() {
    const t = texte.trim();
    setEdite(false);
    if (t && t !== tache.titre) onValider(t);
    else setTexte(tache.titre || '');
  }

  if (edite) {
    return (
      <input autoFocus value={texte} onChange={e => setTexte(e.target.value)}
        onBlur={valider}
        onKeyDown={e => {
          if (e.key === 'Enter') valider();
          // ÉCHAP REND LA MAIN SANS RIEN ÉCRIRE : sans lui, on ne peut plus
          // sortir d'une modification entamée par erreur qu'en la validant.
          if (e.key === 'Escape') { setTexte(tache.titre || ''); setEdite(false); }
        }}
        className="flex-1 min-w-0 bg-white border border-iip-blue rounded-champ
                   px-2 h-8 text-[13px]" />
    );
  }
  return (
    <button onClick={() => setEdite(true)} title="Corriger l'intitulé"
      className={`flex-1 min-w-0 text-left text-[13px] truncate
        hover:underline decoration-dotted underline-offset-2
        ${tache.statut === 'fait' || tache.statut === 'abandonnee'
          ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
      {tache.titre}
      {tache.reunion_date && compact && (
        <span className="text-[11px] text-slate-400"> · décidée le {fr(tache.reunion_date)}</span>
      )}
    </button>
  );
}

function ListeTaches({ taches, personnes, presents = [], obligations = [], api, onRecharger,
                       reunionId, pointId, avecAjout, compact }) {
  const [nouvelle, setNouvelle] = useState({
    titre: '', responsables: [], echeance: '', echeance_id: '' });

  async function ajouter() {
    if (!nouvelle.titre.trim()) return;
    await api('/taches', { method: 'POST', body: JSON.stringify({
      titre: nouvelle.titre.trim(),
      echeance: nouvelle.echeance || null,
      reunion_id: reunionId || null,
      point_id: pointId || null,
      echeance_id: nouvelle.echeance_id ? Number(nouvelle.echeance_id) : null,
      responsables: nouvelle.responsables,
    }) });
    // La suivante garde le même destinataire et la même échéance : en séance,
    // les actions viennent par grappes et se confient à la même personne.
    setNouvelle({ titre: '', responsables: nouvelle.responsables, echeance: '',
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
          className="px-3 py-2 flex flex-wrap items-center gap-3 border-t border-slate-100 first:border-t-0">
          {/* COCHER, C'EST LE GESTE DE LA RÉUNION — il doit être le plus court. */}
          <button onClick={() => majTache(t, { statut: t.statut === 'fait' ? 'a_faire' : 'fait' })}
            title={t.statut === 'fait' ? 'Rouvrir la tâche' : 'Marquer comme faite'}
            className={`w-5 h-5 flex-none grid place-items-center rounded-champ border
              ${t.statut === 'fait'
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'border-slate-300 text-transparent hover:border-emerald-500'}`}>
            <IconCheck size={13} />
          </button>

          {/* LE TITRE SE CORRIGE. Tout était modifiable sur cette ligne —
              responsable, échéance, statut, obligation — SAUF ce qu'on lit en
              premier. Une faute de frappe ou une consigne qui change n'avaient
              donc qu'une issue : supprimer la tâche et la refaire, ce qui perd
              sa date de création et son rattachement à la réunion qui l'a
              décidée. On clique dessus, on écrit, Entrée enregistre ; Échap
              rend la main sans rien changer. */}
          <TitreModifiable tache={t} compact={compact}
            onValider={titre => majTache(t, { titre })} />

          {!!obligations.length && (
            <select value={t.echeance_id || ''} title="Obligation servie par cette action"
              onChange={e => majTache(t, { echeance_id: e.target.value ? Number(e.target.value) : null })}
              className="bg-white border border-slate-300 rounded-champ px-1.5 h-8 text-[12px]
                         max-w-[12rem] text-slate-600">
              <option value="">— ne sert aucune obligation —</option>
              {obligations.map(o => (
                <option key={o.id} value={o.id}>
                  {o.libelle}{o.base_legale ? ` · ${o.base_legale}` : ''}
                </option>
              ))}
            </select>
          )}

          <ChoixResponsables personnes={personnes} presents={presents} tache={t}
            onChange={cles => majTache(t, { responsables: cles })} />

          {/* AU COURANT — voient la tâche, n'en répondent pas. */}
          <ChoixResponsables personnes={personnes} tache={t} informes
            onChange={cles => majTache(t, { informes: cles })} />

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
          <ChoixResponsables personnes={personnes} presents={presents}
            tache={{ responsables: nouvelle.responsables.map(c => ({ cle: c })) }}
            onChange={cles => setNouvelle(n => ({ ...n, responsables: cles }))} />
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
              <option value="">— ne sert aucune obligation —</option>
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

/**
 * LA MÊME MATIÈRE, FILTRÉE ET RANGÉE COMME ON LA CHERCHE (21 septembre 2026).
 * « Par date, par personne, par section » : trois questions, trois rangements.
 * Le filtre réduit, le regroupement range, le tri ordonne dans le groupe — et
 * aucun des trois n'efface les autres.
 */
const REGROUPER = [
  ['personne', 'Par personne'], ['echeance', 'Par échéance'],
  ['section', 'Par section'], ['aucun', 'Sans regroupement'],
];
const TRIER = [
  ['echeance', 'Échéance'], ['priorite', 'Priorité'],
  ['titre', 'Intitulé'], ['creation', 'Date de création'],
];

function lundi(d) {
  const x = new Date(d + 'T12:00:00'); const j = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - j); return x.toISOString().slice(0, 10);
}
function tranche(t) {
  if (!t.echeance) return [9, 'Sans échéance'];
  if (enRetard(t)) return [0, 'En retard'];
  const auj = aujourdhui(), l0 = lundi(auj);
  const l1 = new Date(l0 + 'T12:00:00'); l1.setDate(l1.getDate() + 7);
  const l2 = new Date(l0 + 'T12:00:00'); l2.setDate(l2.getDate() + 14);
  if (t.echeance < l1.toISOString().slice(0, 10)) return [1, 'Cette semaine'];
  if (t.echeance < l2.toISOString().slice(0, 10)) return [2, 'La semaine prochaine'];
  if (t.echeance.slice(0, 7) === auj.slice(0, 7)) return [3, 'Plus tard ce mois-ci'];
  return [4, 'Plus tard'];
}

function VueTaches({ taches, personnes, obligations, api, filtre, setFiltre,
                    onRecharger, onImprimer }) {
  const [recherche, setRecherche] = useState('');
  const [qui, setQui] = useState('');
  const [section, setSection] = useState('');
  const [regrouper, setRegrouper] = useState('personne');
  const [trier, setTrier] = useState('echeance');
  const libRole = r => ROLES_CIBLES.find(x => x[0] === r)?.[1] || r;

  // LA SECTION D'UNE TÂCHE : celle de la réunion qui l'a décidée, et celles
  // de ses responsables — une consigne de couloir n'a pas de réunion.
  const sectionsDe = t => {
    const out = new Set();
    if (t.reunion_section) out.add(t.reunion_section);
    for (const cle of clesDeTache(t)) {
      for (const sct of personnes.find(p => p.cle === cle)?.sections || []) out.add(sct);
    }
    return [...out];
  };
  const toutesSections = useMemo(() => [...new Set([
    ...taches.map(t => t.reunion_section).filter(Boolean),
    ...personnes.flatMap(p => p.sections || []),
  ])].sort(), [taches, personnes]);

  const visibles = taches.filter(t => {
    if (!(filtre === 'toutes'
      || (filtre === 'ouvertes' && (t.statut === 'a_faire' || t.statut === 'en_cours'))
      || (filtre === 'retard' && enRetard(t)))) return false;
    if (recherche.trim() && !(t.titre || '').toLowerCase().includes(recherche.trim().toLowerCase())) return false;
    if (qui && !clesDeTache(t).includes(qui) && !(t.informes || []).some(x => x.cle === qui)) return false;
    if (section && !sectionsDe(t).includes(section)) return false;
    return true;
  });

  const compare = (a, b) => {
    if (trier === 'priorite') return (b.priorite ?? 1) - (a.priorite ?? 1) || (a.echeance || '9').localeCompare(b.echeance || '9');
    if (trier === 'titre') return (a.titre || '').localeCompare(b.titre || '', 'fr');
    if (trier === 'creation') return String(b.cree_le || '').localeCompare(String(a.cree_le || '')) || b.id - a.id;
    return (a.echeance || '9').localeCompare(b.echeance || '9') || (b.priorite ?? 1) - (a.priorite ?? 1);
  };

  // UNE ACTION PORTÉE À DEUX FIGURE CHEZ LES DEUX. La ranger chez le seul
  // premier nommé revient à dire au second qu'elle ne le concerne pas — c'est
  // exactement ce qu'on lui reprochera en séance.
  const groupes = useMemo(() => {
    const m = new Map();
    const poser = (cle, t, rang = 0) => {
      if (!m.has(cle)) m.set(cle, { rang, liste: [] });
      m.get(cle).liste.push(t);
    };
    for (const t of visibles) {
      if (regrouper === 'aucun') poser('', t);
      else if (regrouper === 'echeance') { const [r, lib] = tranche(t); poser(lib, t, r); }
      else if (regrouper === 'section') {
        const l = sectionsDe(t);
        (l.length ? l : ['Sans section']).forEach(x => poser(x, t, x === 'Sans section' ? 1 : 0));
      } else {
        const cibles = t.responsables?.length
          ? t.responsables.map(x => x.nom || libRole(x.role) || 'Sans responsable')
          : [t.responsable_nom || (t.responsable_role ? libRole(t.responsable_role)
              : 'Sans responsable')];
        for (const c of [...new Set(cibles)]) poser(c, t);
      }
    }
    const l = [...m.entries()].map(([nom, g]) => [nom, g.liste.sort(compare), g.rang]);
    // Par NOM DE FAMILLE pour les personnes ; dans l'ordre du temps pour les
    // échéances ; par nom pour les sections.
    return l.sort((a, b) => a[2] - b[2] || (regrouper === 'personne' ? parNom(a[0], b[0])
      : a[0].localeCompare(b[0], 'fr')));
    // eslint-disable-next-line
  }, [visibles, regrouper, trier, personnes]);

  const nbRetard = taches.filter(enRetard).length;
  const filtresActifs = recherche || qui || section;

  return (
    <>
      <PageHeader titre="Échéances et tâches"
        sous="Trente jours devant, sept derrière — puis ce que chacun a en charge"
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

      <FriseEcheances taches={taches} />

      {/* FILTRER ET RANGER — des MOTS dans la barre de l'écran, pas des icônes
          dans le rail. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Chercher une tâche…" className="controle controle-icone text-[13px] w-56" />
        </div>
        <select value={qui} onChange={e => setQui(e.target.value)} className="controle text-[13px] max-w-[14rem]">
          <option value="">Toutes les personnes</option>
          {[...personnes].sort((a, b) => parNom(a.nom, b.nom)).map(p => (
            <option key={p.cle} value={p.cle}>{nomListe(p.nom)}</option>
          ))}
          <optgroup label="Un service">
            {ROLES_CIBLES.map(([c, lib]) => <option key={c} value={`r:${c}`}>{lib}</option>)}
          </optgroup>
        </select>
        <select value={section} onChange={e => setSection(e.target.value)} className="controle text-[13px]">
          <option value="">Toutes les sections</option>
          {toutesSections.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={regrouper} onChange={e => setRegrouper(e.target.value)} className="controle text-[13px]">
          {REGROUPER.map(([c, lib]) => <option key={c} value={c}>{lib}</option>)}
        </select>
        <label className="text-[12px] text-slate-500 flex items-center gap-1.5">
          Trier par
          <select value={trier} onChange={e => setTrier(e.target.value)} className="controle text-[13px]">
            {TRIER.map(([c, lib]) => <option key={c} value={c}>{lib}</option>)}
          </select>
        </label>
        {filtresActifs && (
          <button className="bouton controle px-2.5 text-[12px] flex items-center gap-1"
            onClick={() => { setRecherche(''); setQui(''); setSection(''); }}>
            <IconX size={13} /> Effacer les filtres
          </button>
        )}
        <span className="text-[12px] text-slate-500 ml-auto">{visibles.length} tâche(s)</span>
      </div>

      {!groupes.length && (
        <p className="text-[13px] text-slate-400">Rien à ce filtre.</p>
      )}

      {groupes.map(([nom, liste]) => (
        <div key={nom || 'tout'} className="mb-3">
          {regrouper !== 'aucun' && (
            <h2 className="text-[13px] font-semibold text-iip-blue mb-1.5 flex items-center gap-2">
              {regrouper === 'personne' && <IconUser size={15} className="text-slate-400" />}
              {regrouper === 'echeance' && <IconClock size={15} className="text-slate-400" />}
              {regrouper === 'personne' ? nomListe(nom) : nom}
              <span className="font-normal text-slate-400">— {liste.length} tâche(s)</span>
              {regrouper !== 'echeance' && liste.some(enRetard) && (
                <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                  <IconClock size={13} /> {liste.filter(enRetard).length} en retard
                </span>
              )}
            </h2>
          )}
          <ListeTaches taches={liste} personnes={personnes} obligations={obligations}
            api={api} onRecharger={onRecharger} compact />
        </div>
      ))}
    </>
  );
}

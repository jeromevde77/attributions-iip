/**
 * LE REGISTRE DES AMÉNAGEMENTS RAISONNABLES (Charles, 28 septembre 2026 :
 * « comme valorisation des acquis, un lien direct dans le rail, afin que cela
 * soit rapidement joint »).
 *
 * Les dossiers ne se lisaient que fiche par fiche, donc ils ne se lisaient pas.
 * Une ligne par dossier de l'année : l'étudiant, l'état de la procédure, ce qui
 * reste à faire, et les MESURES retenues — seules celles-ci circulent, la
 * nature du handicap et la pièce médicale restent au dossier (secret
 * professionnel, décret du 30 juin 2016, art. 5). Un clic ouvre la fiche sur
 * son onglet Aménagements.
 */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import { IconTrash } from '@tabler/icons-react';
import { TuileEtat, Fenetre } from '../components/ui.jsx';
import { FicheEtudiant } from './Etudiants.jsx';

const STATUTS = {
  demande: 'Demande introduite', instruction: 'En instruction', accepte: 'Accordé',
  partiel: 'Partiellement accordé', refuse: 'Refusé', recours: 'En recours',
};
const ETAT_STATUT = {
  demande: 'surveiller', instruction: 'surveiller', accepte: 'reussi', partiel: 'reussi',
  refuse: 'corriger', recours: 'corriger',
};
const PORTEES = { toutes: 'toutes activités', cours: 'cours', epreuves: 'épreuves', stage: 'stage' };
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

export default function RegistreAmenagements() {
  const [annee] = useState(getAnnee());
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [q, setQ] = useState('');
  const [section, setSection] = useState('');
  const [statut, setStatut] = useState('');
  const [fiche, setFiche] = useState(null);
  const [recharge, setRecharge] = useState(0);
  const [creation, setCreation] = useState(false);   // « Créer un aménagement »
  const [aSupprimer, setASupprimer] = useState(null); // ligne dont on demande la suppression

  useEffect(() => {
    let vivant = true;
    fetch(`/api/amenagements/registre?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => { if (vivant) setData(j); })
      .catch(e => { if (vivant) setErreur(e.message); });
    return () => { vivant = false; };
  }, [annee, recharge]);

  const lignes = data?.lignes || [];
  const sections = useMemo(() => [...new Set(lignes.map(l => l.section).filter(Boolean))].sort(), [lignes]);
  const visibles = lignes.filter(l =>
    (!section || l.section === section)
    && (!statut || (statut === 'a_faire' ? !!l.a_faire : l.statut === statut))
    && (!q || `${l.nom} ${l.prenom} ${l.id_ecampus || ''}`.toLowerCase().includes(q.toLowerCase())));
  const n = f => lignes.filter(f).length;

  return (
    <div className="space-y-3">
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[13px]">{erreur}</div>}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-w-3xl">
          <TuileEtat etat="neutre" valeur={lignes.length} libelle={`Dossiers ${annee}`} />
          <TuileEtat etat={n(l => l.a_faire === 'décision du Conseil à rendre') ? 'surveiller' : 'neutre'}
            valeur={n(l => l.a_faire === 'décision du Conseil à rendre')} libelle="Décisions à rendre" />
          <TuileEtat etat={n(l => l.a_faire === 'décision à notifier') ? 'surveiller' : 'neutre'}
            valeur={n(l => l.a_faire === 'décision à notifier')} libelle="Décisions à notifier" />
          <TuileEtat etat="reussi" valeur={n(l => ['accepte', 'partiel'].includes(l.statut))} libelle="Aménagements accordés" />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input className="controle w-64" placeholder="Nom, prénom ou matricule" value={q} onChange={e => setQ(e.target.value)} />
        <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="controle" value={statut} onChange={e => setStatut(e.target.value)}>
          <option value="">Tous les états</option>
          <option value="a_faire">Quelque chose reste à faire</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-[12px] text-slate-500">{visibles.length} dossier(s) affiché(s) sur {lignes.length}</span>
        <button type="button" className="bouton bouton-fort controle ml-auto" onClick={() => setCreation(true)}>
          Créer un aménagement
        </button>
      </div>

      {!data ? <p className="text-slate-400 text-[13px]">Chargement…</p> : !lignes.length ? (
        <p className="text-slate-500 text-[13px]">Aucun dossier d'aménagement raisonnable en {annee}. Un dossier s'ouvre depuis
          la fiche de l'étudiant, onglet Aménagements.</p>
      ) : (
        <div className="border border-slate-200 rounded-carte overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="tab-entete">
              <tr className="text-left text-[11px] text-slate-500">
                <th className="px-3 py-1.5">Étudiant</th><th className="px-2 py-1.5">Section</th>
                <th className="px-2 py-1.5">État</th><th className="px-2 py-1.5">Demande</th>
                <th className="px-2 py-1.5">Décision</th><th className="px-2 py-1.5">Notifiée</th>
                <th className="px-2 py-1.5">Mesures retenues</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(l => (
                <tr key={l.id} onClick={() => setFiche(l.etudiant_id)}
                  className="border-t border-slate-100 bg-white cursor-pointer hover:bg-slate-50 align-top">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <b>{(l.nom || '').toUpperCase()}</b> {l.prenom} <span className="text-slate-400">· {l.id_ecampus || '—'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{l.section || '—'}</td>
                  <td className="px-2 py-1.5">
                    <span data-etat={ETAT_STATUT[l.statut] || 'neutre'} className="bloc-etat inline-block px-2 py-0.5 text-[11.5px]">
                      {STATUTS[l.statut] || l.statut}
                    </span>
                    {l.a_faire && <div className="text-[11px] text-[color:var(--c-attente)] mt-0.5">{l.a_faire}</div>}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{fr(l.date_demande)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{fr(l.cde_date)}</td>
                  <td className="px-2 py-1.5 tabular-nums">{fr(l.notifie_le)}</td>
                  <td className="px-2 py-1.5">
                    {l.mesures.filter(m => m.accorde).length
                      ? <ul className="space-y-0.5">{l.mesures.filter(m => m.accorde).map((m, i) => (
                          <li key={i}>{m.libelle}<span className="text-slate-400">
                            {' · '}{m.nature === 'materiel' ? 'matériel' : 'pédagogique'}
                            {m.portee ? ` · ${PORTEES[m.portee] || m.portee}` : ''}
                            {m.ue_num ? ` · UE ${m.ue_num}` : ''}</span></li>))}</ul>
                      : <span className="text-slate-400">—</span>}
                    {l.ues.length > 0 && <div className="text-[11px] text-slate-400 mt-0.5">Unités concernées : {l.ues.join(', ')}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" title="Supprimer ce dossier"
                      onClick={e => { e.stopPropagation(); setASupprimer(l); }}
                      className="p-1 rounded-champ text-slate-400 hover:text-[color:var(--c-refuse)] hover:bg-slate-100">
                      <IconTrash size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Seules les mesures retenues figurent ici : la nature de la situation et les pièces restent au dossier de
        l'étudiant (secret professionnel, décret du 30 juin 2016, art. 5).
      </p>

      {creation && (
        <CreerAmenagement annee={annee} existants={lignes} onFermer={() => setCreation(false)}
          onOuvrir={id => { setCreation(false); setFiche(id); }} />
      )}

      {aSupprimer && (
        <SupprimerDossier ligne={aSupprimer} onFermer={() => setASupprimer(null)}
          onFait={() => { setASupprimer(null); setRecharge(x => x + 1); }} />
      )}

      {fiche && (
        <FicheEtudiant id={fiche} annee={annee} ongletInitial="amenagements"
          onClose={() => { setFiche(null); setRecharge(x => x + 1); }} />
      )}
    </div>
  );
}

/* CRÉER UN AMÉNAGEMENT DEPUIS LE REGISTRE (Charles, 29 septembre 2026 : « il
   manque un bouton "créer un AR" quand on est sur la page »). On choisit
   l'étudiant ; s'il a déjà un dossier cette année, on l'ouvre — un second
   dossier pour la même année ferait deux décisions pour une demande —, sinon
   il est créé, et la fiche s'ouvre sur l'onglet Aménagements pour le remplir. */
function CreerAmenagement({ annee, existants, onFermer, onOuvrir }) {
  const [q, setQ] = useState('');
  const [trouves, setTrouves] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setTrouves([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/etudiants?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : []).then(l => setTrouves((Array.isArray(l) ? l : []).slice(0, 10))).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const choisir = async e => {
    if (existants.some(l => l.etudiant_id === e.id)) { onOuvrir(e.id); return; }
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/amenagements/dossier', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: e.id, annee_scolaire: annee }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      onOuvrir(e.id);
    } catch (err) { setErreur(err.message); } finally { setEnCours(false); }
  };
  return (
    <Fenetre titre="Créer un aménagement raisonnable" large="petite" onFermer={onFermer}
      sous={`Année ${annee} — choisissez l'étudiant ; son dossier s'ouvre ensuite sur sa fiche`}>
      <div className="space-y-2 text-[13px]">
        <input className="controle w-full" autoFocus placeholder="Nom ou matricule…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="space-y-1 max-h-72 overflow-auto">
          {trouves.map(e => {
            const deja = existants.some(l => l.etudiant_id === e.id);
            return (
              <button key={e.id} type="button" disabled={enCours} onClick={() => choisir(e)}
                className="w-full text-left px-2.5 py-1.5 rounded-champ border border-slate-200 hover:bg-slate-50">
                <b>{(e.nom || '').toUpperCase()}</b> {e.prenom} <span className="text-slate-400">· {e.id_ecampus || '—'}</span>
                {deja && <span className="block text-[11.5px] text-slate-500">A déjà un dossier en {annee} : il s'ouvrira.</span>}
              </button>
            );
          })}
          {q.trim().length >= 2 && !trouves.length && <p className="text-slate-400 text-[12px]">Aucun étudiant ne correspond.</p>}
        </div>
        {erreur && <div data-etat="corriger" className="bloc-etat px-2.5 py-1.5">{erreur}</div>}
      </div>
    </Fenetre>
  );
}

/* SUPPRIMER UN DOSSIER (Charles, 29 septembre 2026). Un dossier sans décision
   — ouvert par erreur, en double — se supprime simplement ; un dossier décidé,
   notifié ou communiqué ne se supprime que par la direction, motif écrit : une
   décision a pu partir sur sa foi. Le serveur en garde un instantané complet. */
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
function SupprimerDossier({ ligne, onFermer, onFait }) {
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const engage = ['accepte', 'partiel', 'refuse', 'recours'].includes(ligne.statut)
    || ligne.cde_date || ligne.notifie_le || ligne.communique_le;
  const direction = DIRECTION.includes(getUser()?.role);
  const bloque = engage && (!direction || !motif.trim());
  const supprimer = async () => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/amenagements/dossier/${ligne.id}`, { method: 'DELETE', headers: authHeaders(),
        body: JSON.stringify({ motif: motif.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      onFait();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  return (
    <Fenetre titre="Supprimer le dossier d'aménagement" large="petite" onFermer={onFermer}
      sous={`${(ligne.nom || '').toUpperCase()} ${ligne.prenom || ''} — ${STATUTS[ligne.statut] || ligne.statut}`}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-[12px] text-slate-500 min-w-0 flex-1">
          {engage && !direction ? 'Réservé à la direction : ce dossier porte une décision.'
            : bloque ? 'Écrivez le motif de la suppression.' : 'La suppression est définitive.'}
        </span>
        <button type="button" className="bouton" onClick={onFermer}>Annuler</button>
        <button type="button" className="bouton bouton-detruire" disabled={bloque || enCours} onClick={supprimer}>
          Supprimer le dossier
        </button>
      </div>}>
      <div className="space-y-2 text-[13px]">
        <p>Le dossier, ses mesures et ses unités concernées sont supprimés. Lucie en garde une copie datée,
          avec votre nom{engage ? ' et le motif' : ''}.</p>
        {engage && <div data-etat="surveiller" className="bloc-etat px-2.5 py-1.5">
          Ce dossier porte une décision du Conseil{ligne.notifie_le ? ', notifiée à l\'étudiant' : ''}
          {ligne.communique_le ? ', communiquée aux chargés de cours' : ''}. Une pièce a pu partir sur sa foi.
        </div>}
        <textarea className="controle w-full h-20 py-1.5" placeholder={engage ? 'Motif (obligatoire)' : 'Motif (facultatif) — ex. dossier ouvert en double'}
          value={motif} onChange={e => setMotif(e.target.value)} />
        {erreur && <div data-etat="corriger" className="bloc-etat px-2.5 py-1.5">{erreur}</div>}
      </div>
    </Fenetre>
  );
}

/**
 * LE TRAVAIL DE FIN D'ÉTUDES D'UN ÉTUDIANT (3.1.366, Charles, 15 octobre 2026 : « comme pour les
 * stages, prévoir une partie TFE ; il faut pouvoir encoder le titre »). Une ligne par année : le
 * titre (seul obligatoire), l'unité, le promoteur choisi dans le personnel, les dates de dépôt et de
 * défense. Chaque champ s'enregistre en quittant la case.
 */
import { useEffect, useState } from 'react';
import { IconPlus, IconTrash, IconFileText } from '@tabler/icons-react';
import { api, authHeaders } from '../lib/api.js';
import ChoixUnite from './ChoixUnite.jsx';
import { demander } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';

const ECRIT = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];

/* LE JURY (3.1.378) : promoteur, copromoteur, lecteur, auditeur, président. Un nom importé que Lucie n'a
   pas reconnu reste en texte, en ocre, avec la liste pour le rattacher à une personne du personnel. */
const ROLES = [['promoteur', 'Promoteur'], ['copromoteur', 'Copromoteur'], ['lecteur', 'Lecteur'], ['auditeur', 'Auditeur'], ['president', 'Président du jury']];
function Jury({ membres, profs, peutEcrire, onChange }) {
  const [ajout, setAjout] = useState('');
  const poser = liste => onChange(liste.map(m => ({ role: m.role, professeur_id: m.professeur_id || null, nom_libre: m.professeur_id ? null : m.nom_libre })));
  const nomProf = p => `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();
  return (
    <div>
      <div className="text-second text-slate-600 mb-1">Jury</div>
      <div className="space-y-1.5">
        {ROLES.map(([role, libelle]) => membres.map((m, i) => ({ m, i })).filter(x => x.m.role === role).map(({ m, i }) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-36 shrink-0 text-slate-500">{libelle}</span>
            {m.nom_libre && !m.professeur_id && <span className="text-mention px-2 py-0.5 rounded-pastille text-white" style={{ background: 'var(--c-attente)' }} title="Nom importé, non reconnu dans le personnel">« {m.nom_libre} »</span>}
            <select className="controle flex-1 min-w-0" value={m.professeur_id || ''} disabled={!peutEcrire}
              onChange={e => poser(membres.map((x, j) => (j === i ? { ...x, professeur_id: e.target.value ? Number(e.target.value) : null } : x)))}>
              <option value="">{m.nom_libre ? '— rattacher à… —' : '— choisir —'}</option>
              {profs.map(p => <option key={p.id} value={p.id}>{nomProf(p)}</option>)}
            </select>
            {peutEcrire && <button type="button" className="bouton" title="Retirer" onClick={() => poser(membres.filter((_, j) => j !== i))}><IconTrash size={14} /></button>}
          </div>)))}
        {!membres.length && <div className="text-second text-slate-400">Aucun membre encodé.</div>}
        {peutEcrire && (
          <div className="flex items-center gap-2">
            <select className="controle" value={ajout} onChange={e => setAjout(e.target.value)}>
              <option value="">+ ajouter au jury…</option>
              {ROLES.map(([r, l]) => <option key={r} value={r}>{l}</option>)}
            </select>
            {ajout && (
              <select className="controle flex-1 min-w-0" value="" onChange={e => { if (!e.target.value) return; poser([...membres, { role: ajout, professeur_id: Number(e.target.value) }]); setAjout(''); }}>
                <option value="">— choisir la personne —</option>
                {profs.map(p => <option key={p.id} value={p.id}>{nomProf(p)}</option>)}
              </select>)}
          </div>)}
      </div>
    </div>);
}

function Ligne({ t, profs, peutEcrire, onEnregistre, onSupprime }) {
  const [v, setV] = useState(t);
  useEffect(() => setV(t), [t]);
  const garder = async (champ, valeur) => {
    if ((t[champ] ?? '') === (valeur ?? '')) return;
    await onEnregistre(t.id, { [champ]: valeur });
  };
  const champ = (k, props = {}) => ({
    value: v[k] ?? '', disabled: !peutEcrire,
    onChange: e => setV(x => ({ ...x, [k]: e.target.value })),
    onBlur: e => garder(k, e.target.value), ...props,
  });
  return (
    <div className="carte p-4 space-y-3">
      <div className="flex items-start gap-3">
        <IconFileText size={20} className="text-slate-400 mt-2 shrink-0" />
        <label className="flex-1 min-w-0 text-second text-slate-600">Titre du TFE
          <textarea rows={2} data-reponses="non" className="controle w-full mt-1 h-auto py-2 text-sm font-semibold" placeholder="Titre complet du travail"
            {...champ('titre')} onBlur={e => { if (e.target.value.trim()) garder('titre', e.target.value); else setV(x => ({ ...x, titre: t.titre })); }} />
        </label>
        {peutEcrire && (
          <button type="button" className="bouton bouton-detruire mt-6" title="Supprimer ce TFE" onClick={() => onSupprime(t)}>
            <IconTrash size={15} /></button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-second text-slate-600">Année
          <input className="controle w-full mt-1" {...champ('annee_scolaire')} />
        </label>
        <label className="text-second text-slate-600">Unité
          <ChoixUnite value={v.ue_num || ''} annee={v.annee_scolaire} disabled={!peutEcrire} className="w-full mt-1" vide="— aucune unité —"
            onChange={n => { setV(x => ({ ...x, ue_num: n })); onEnregistre(t.id, { ue_num: n }); }} />
        </label>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <label className="text-second text-slate-600">Dépôt
            <input type="date" className="controle w-full mt-1" {...champ('date_depot')} onChange={e => { setV(x => ({ ...x, date_depot: e.target.value })); garder('date_depot', e.target.value); }} />
          </label>
          <label className="text-second text-slate-600">Défense
            <input type="date" className="controle w-full mt-1" {...champ('date_defense')} onChange={e => { setV(x => ({ ...x, date_defense: e.target.value })); garder('date_defense', e.target.value); }} />
          </label>
          <label className="text-second text-slate-600">Heure
            <input className="controle w-full mt-1" placeholder="9h30" {...champ('heure_defense')} />
          </label>
        </div>
      </div>
      <Jury membres={t.membres || []} profs={profs} peutEcrire={peutEcrire} onChange={m => onEnregistre(t.id, { membres: m })} />
      <label className="block text-second text-slate-600">Remarques
        <textarea rows={2} className="controle w-full mt-1 h-auto py-2 text-sm" {...champ('remarques')} />
      </label>
      {t.maj_par && <div className="text-mention text-slate-400">Modifié par {t.maj_par} le {String(t.maj_le || '').slice(0, 16).replace('T', ' ')}</div>}
    </div>);
}

export default function Tfe({ etudId, annee }) {
  const [liste, setListe] = useState(null);
  const [profs, setProfs] = useState([]);
  const [titre, setTitre] = useState('');
  const [erreur, setErreur] = useState(null);
  const peutEcrire = passeRole(ECRIT);

  const charger = () => fetch(`/api/tfe/etudiant/${etudId}`, { headers: authHeaders() })
    .then(r => r.json()).then(l => setListe(Array.isArray(l) ? l : [])).catch(() => setListe([]));
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);
  useEffect(() => {
    api.professeurs(true).then(l => setProfs((Array.isArray(l) ? l : []).slice().sort((a, b) =>
      `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')))).catch(() => {});
  }, []);

  async function ecrire(url, method, body) {
    setErreur(null);
    const r = await fetch(url, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return false; }
    await charger(); return true;
  }
  async function ajouter() {
    if (!titre.trim()) return;
    if (await ecrire('/api/tfe', 'POST', { etudiant_id: etudId, annee_scolaire: annee, titre })) setTitre('');
  }
  async function supprimer(t) {
    if (!(await demander(`Supprimer le TFE « ${t.titre} » (${t.annee_scolaire}) ?`))) return;
    await ecrire(`/api/tfe/${t.id}`, 'DELETE');
  }

  if (liste === null) return <div className="text-second text-slate-500">Chargement…</div>;
  return (
    <div className="space-y-4">
      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {peutEcrire && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[280px] text-second text-slate-600">Nouveau TFE — {annee}
            <input className="controle w-full mt-1" placeholder="Titre du travail de fin d'études" value={titre}
              onChange={e => setTitre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ajouter(); }} />
          </label>
          <button type="button" className="bouton bouton-fort controle inline-flex items-center gap-1.5" disabled={!titre.trim()} onClick={ajouter}>
            <IconPlus size={15} /> Ajouter</button>
        </div>)}
      {!liste.length
        ? <p className="text-second text-slate-500">Aucun TFE encodé pour cet étudiant.</p>
        : liste.map(t => <Ligne key={t.id} t={t} profs={profs} peutEcrire={peutEcrire}
            onEnregistre={(id, champs) => ecrire(`/api/tfe/${id}`, 'PUT', champs)} onSupprime={supprimer} />)}
    </div>);
}

import { useEffect, useState } from 'react';
import { IconPlus, IconTrash, IconPrinter, IconPlane } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Fenetre, OutilFenetre, ListeEtats, LigneEtat, PastilleEtat, Encadre, EnteteCarte } from './ui.jsx';
import { saisir, informer, demander } from '../lib/dialogue.jsx';

/* LES VOYAGES D'ÉTUDES (3.5.230) — la « Procédure voyages » en Word devient une demande dans Lucie. Le référent écrit le projet et le
   devis (étudiants, accompagnateurs), le financement, puis soumet ; la direction valide, renvoie avec un mot, ou annule. La liste des
   participants se compose depuis Lucie. Monté dans Organisation (direction, secrétariat, coordination) et dans l'espace enseignant
   (L'école → Voyages d'études). Serveur : /api/voyages. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const eur = n => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
const ETAT = { brouillon: 'neutre', soumis: 'surveiller', valide: 'reussi', renvoye: 'corriger', annule: 'indisponible' };

function Devis({ partie, lignes, setLignes, rubriques, lecture }) {
  const mes = lignes.map((l, i) => ({ ...l, i })).filter(l => l.partie === partie);
  const maj = (i, k, v) => setLignes(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = mes.reduce((s, l) => s + (Number(l.montant) || 0) * (Number(l.nombre) || 0), 0);
  return (
    <div className="space-y-1.5">
      {mes.map(l => (
        <div key={l.i} className="flex flex-wrap items-center gap-1.5 text-second">
          <select className="controle !h-8" value={l.rubrique} disabled={lecture} onChange={e => maj(l.i, 'rubrique', e.target.value)}>
            {Object.entries(rubriques).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="controle !h-8 w-48" placeholder="détail (hôtel, train…)" value={l.libelle || ''} disabled={lecture} onChange={e => maj(l.i, 'libelle', e.target.value)} />
          <input type="date" className="controle !h-8" value={l.du || ''} disabled={lecture} onChange={e => maj(l.i, 'du', e.target.value)} />
          <input type="date" className="controle !h-8" value={l.au || ''} disabled={lecture} onChange={e => maj(l.i, 'au', e.target.value)} />
          <input type="number" step="0.01" className="controle !h-8 w-24" placeholder="tarif €" value={l.montant ?? ''} disabled={lecture} onChange={e => maj(l.i, 'montant', e.target.value)} />
          <span>×</span>
          <input type="number" className="controle !h-8 w-20" placeholder="nombre" value={l.nombre ?? ''} disabled={lecture} onChange={e => maj(l.i, 'nombre', e.target.value)} />
          <span className="tabular-nums w-24 text-right">{eur((Number(l.montant) || 0) * (Number(l.nombre) || 0))}</span>
          {!lecture && <button type="button" className="text-slate-400" aria-label="Retirer la ligne" onClick={() => setLignes(ls => ls.filter((_, j) => j !== l.i))}><IconTrash size={15} /></button>}
        </div>))}
      <div className="flex items-center gap-3">
        {!lecture && <button type="button" className="bouton !h-8 inline-flex items-center gap-1" onClick={() => setLignes(ls => [...ls, { partie, rubrique: 'transport', libelle: '', montant: '', nombre: '' }])}><IconPlus size={14} /> Ligne</button>}
        <span className="ml-auto text-sm">Total : <b className="tabular-nums">{eur(total)}</b></span>
      </div>
    </div>);
}

function Editeur({ id, d, onFermer, onFait }) {
  const [v, setV] = useState(() => d.voyages.find(x => x.id === id));
  const [lignes, setLignes] = useState(v?.lignes || []);
  const [erreur, setErreur] = useState(null);
  const [q, setQ] = useState('');
  const [proposes, setProposes] = useState(null);
  const lecture = !(['brouillon', 'renvoye'].includes(v.statut) && (v.referent_user_id === d.moi || d.direction));
  const f = v.financement || {};
  const champ = (k, label, props = {}) => (
    <label className="text-sm"><span className="block text-slate-500">{label}</span>
      <input className="controle mt-1 w-full" value={v[k] ?? ''} disabled={lecture} onChange={e => setV(x => ({ ...x, [k]: e.target.value }))} {...props} /></label>);
  const fin = (k, label) => (
    <div className="flex items-center gap-2 text-sm"><span className="w-32">{label}</span>
      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!f[k]?.oui} disabled={lecture} onChange={e => setV(x => ({ ...x, financement: { ...f, [k]: { ...f[k], oui: e.target.checked } } }))} /> oui</label>
      {f[k]?.oui && <input type="number" step="0.01" className="controle !h-8 w-28" placeholder="montant €" value={f[k]?.montant ?? ''} disabled={lecture} onChange={e => setV(x => ({ ...x, financement: { ...f, [k]: { ...f[k], montant: e.target.value } } }))} />}
    </div>);
  const appel = async (url, methode, corps) => {
    setErreur(null);
    const r = await fetch(`/api/voyages/${v.id}${url}`, { method: methode, headers: authHeaders(), body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Refusé.'); return null; }
    setV(j); setLignes(j.lignes || []); onFait?.(); return j;
  };
  const enregistrer = () => appel('', 'PUT', { ...Object.fromEntries(['titre', 'referent_tel', 'section', 'cursus', 'du', 'au', 'destination', 'groupe_cible', 'nb_etudiants', 'nb_accompagnateurs', 'programme'].map(k => [k, v[k]])), financement: v.financement || {}, lignes });
  const soumettre = async () => { if (!(await enregistrer())) return; if (await demander({ titre: 'Soumettre à la direction', message: 'La demande ne se modifie plus tant que la direction ne l’a pas renvoyée.', confirmer: 'Soumettre' })) await appel('/soumettre', 'POST'); };
  const decider = async decision => {
    let motif = null;
    if (decision !== 'valide') { motif = await saisir({ titre: decision === 'renvoye' ? 'Renvoyer au référent' : 'Annuler la demande', message: 'Un mot pour le référent.', obligatoire: true, confirmer: 'Envoyer' }); if (motif == null) return; }
    await appel('/decider', 'POST', { decision, motif });
  };
  const chercher = async () => {
    const r = await fetch(`/api/voyages/${v.id}/etudiants?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
    setProposes(r.ok ? await r.json() : []);
  };
  const ajouter = async parts => { const j = await appel('/participants', 'POST', { participants: parts }); if (j) informer(`✓ ${j.ajoutes} participant(s) ajouté(s).`); };
  const imprimer = async () => {
    const r = await fetch(`/api/voyages/${v.id}/document`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok) ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: v.titre, nomFichier: j.nom, envoiPossible: false });
  };
  const peutParticipants = v.referent_user_id === d.moi || d.direction;
  return (
    <Fenetre icone={IconPlane} titre={v.titre} sous={`${d.statuts[v.statut]}${v.referent_nom ? ` · référent ${v.referent_nom}` : ''}`} large="grande" onFermer={onFermer}
      outils={<OutilFenetre Icone={IconPrinter} titre="Imprimer la demande" onClick={imprimer} />}
      pied={<>
        <span className="text-second text-slate-500 min-w-0 flex-1">{erreur || (lecture ? (v.statut === 'valide' ? `Validée le ${fr(v.decide_le)} par ${v.decide_par}.` : 'En lecture.') : 'Enregistrez, puis soumettez à la direction.')}</span>
        {!lecture && <button type="button" className="bouton" onClick={enregistrer}>Enregistrer</button>}
        {!lecture && <button type="button" className="bouton bouton-fort" onClick={soumettre}>Soumettre à la direction</button>}
        {d.direction && v.statut === 'soumis' && <><button type="button" className="bouton" onClick={() => decider('renvoye')}>Renvoyer</button>
          <button type="button" className="bouton bouton-fort" onClick={() => decider('valide')}>Valider</button></>}
        {d.direction && !['annule', 'valide'].includes(v.statut) && <button type="button" className="bouton bouton-detruire" onClick={() => decider('annule')}>Annuler</button>}
      </>}>
      <div className="space-y-4">
        {v.motif && <Encadre etat={v.statut === 'valide' ? 'reussi' : 'corriger'} titre="Mot de la direction">{v.motif}</Encadre>}
        <section className="carte overflow-hidden"><EnteteCarte titre="Le projet" />
          <div className="px-4 py-3 grid gap-3 md:grid-cols-2">
            {champ('titre', 'Titre du projet')}
            {champ('referent_tel', 'Téléphone ou GSM du référent')}
            <label className="text-sm"><span className="block text-slate-500">Section</span>
              <select className="controle mt-1 w-full" value={v.section || ''} disabled={lecture} onChange={e => setV(x => ({ ...x, section: e.target.value }))}>
                <option value="">—</option>{(d.sections || []).map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}</select></label>
            {champ('cursus', 'Cursus, bloc')}
            {champ('du', 'Du', { type: 'date' })}{champ('au', 'Au', { type: 'date' })}
            {champ('destination', 'Destination')}{champ('groupe_cible', 'Groupe cible')}
            {champ('nb_etudiants', 'Nombre d’étudiants', { type: 'number', min: 0 })}{champ('nb_accompagnateurs', 'Nombre d’accompagnateurs', { type: 'number', min: 0 })}
            <label className="text-sm md:col-span-2"><span className="block text-slate-500">Programme</span>
              <textarea className="controle mt-1 w-full !h-auto py-2" rows={4} value={v.programme || ''} disabled={lecture} onChange={e => setV(x => ({ ...x, programme: e.target.value }))} data-reponses="voyage-programme" /></label>
          </div></section>
        <section className="carte overflow-hidden"><EnteteCarte titre="Devis — partie 1 : étudiants" />
          <div className="px-4 py-3"><Devis partie="etudiants" lignes={lignes} setLignes={setLignes} rubriques={d.rubriques} lecture={lecture} /></div></section>
        <section className="carte overflow-hidden"><EnteteCarte titre="Devis — partie 2 : accompagnateurs" />
          <div className="px-4 py-3"><Devis partie="accompagnateurs" lignes={lignes} setLignes={setLignes} rubriques={d.rubriques} lecture={lecture} /></div></section>
        <section className="carte overflow-hidden"><EnteteCarte titre="Financement" sous={`Coût global : ${eur(lignes.reduce((s, l) => s + (Number(l.montant) || 0) * (Number(l.nombre) || 0), 0))}`} />
          <div className="px-4 py-3 space-y-2">{fin('etudiants', 'Étudiants')}{fin('conseil_social', 'Conseil social')}{fin('he', 'Haute école')}
            <label className="block text-sm"><span className="text-slate-500">Remarques</span>
              <textarea className="controle mt-1 w-full !h-auto py-2" rows={2} value={f.remarques || ''} disabled={lecture} onChange={e => setV(x => ({ ...x, financement: { ...f, remarques: e.target.value } }))} /></label></div></section>
        <section className="carte overflow-hidden"><EnteteCarte titre={`Participants — ${v.participants?.length || 0}`} sous="Les étudiants de la section, le personnel, ou un nom libre." />
          <div className="px-4 py-3 space-y-2">
            {peutParticipants && <div className="flex flex-wrap items-center gap-2">
              <input className="controle !h-8 w-56" placeholder="Nom d’un étudiant…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && chercher()} />
              <button type="button" className="bouton !h-8" onClick={chercher}>Étudiants de la section</button>
              <button type="button" className="bouton !h-8" onClick={async () => { const n = await saisir({ titre: 'Ajouter un accompagnateur', message: 'NOM Prénom', confirmer: 'Ajouter', obligatoire: true }); if (n) ajouter([{ role: 'accompagnateur', nom: n }]); }}>Accompagnateur</button>
            </div>}
            {proposes && (
              <div className="border border-slate-200 rounded-champ p-2 max-h-56 overflow-auto space-y-1">
                {!proposes.length ? <p className="text-second text-slate-500 m-0">Personne.</p> : <>
                  <button type="button" className="bouton bouton-compact" onClick={() => ajouter(proposes.map(e => ({ role: 'etudiant', etudiant_id: e.id })))}>Ajouter les {proposes.length}</button>
                  {proposes.map(e => <button key={e.id} type="button" className="block text-left text-second hover:underline" onClick={() => ajouter([{ role: 'etudiant', etudiant_id: e.id }])}>+ {e.nom} <span className="text-slate-400">{e.section}</span></button>)}</>}
              </div>)}
            {(v.participants || []).map(p => (
              <div key={p.id} className="flex items-center gap-2 text-second">
                <PastilleEtat etat={p.role === 'accompagnateur' ? 'disponible' : 'neutre'}>{p.role === 'accompagnateur' ? 'accompagnateur' : 'étudiant'}</PastilleEtat>{p.nom}
                {peutParticipants && <button type="button" className="text-slate-400" aria-label="Retirer" onClick={() => appel(`/participants/${p.id}`, 'DELETE')}><IconTrash size={14} /></button>}
              </div>))}
          </div></section>
      </div>
    </Fenetre>);
}

export default function VoyagesEtudes({ annee }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const charger = () => fetch(`/api/voyages${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`, { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
    .then(setD).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, [annee]);   // eslint-disable-line react-hooks/exhaustive-deps
  const nouveau = async () => {
    const titre = await saisir({ titre: 'Nouveau voyage d’études', message: 'Titre du projet', obligatoire: true, confirmer: 'Créer' });
    if (!titre) return;
    const r = await fetch('/api/voyages', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ titre, annee }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return informer(j.error || 'Refusé.');
    await charger(); setOuvert(j.id);
  };
  if (erreur) return <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>;
  if (!d) return <p className="text-second text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2">
        <p className="m-0 text-sm text-slate-600 flex-1">Une demande par voyage : le projet, le devis (étudiants et accompagnateurs), le financement, puis la validation de la direction.</p>
        <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={nouveau}><IconPlus size={15} /> Nouveau voyage</button>
      </div>
      {!d.voyages.length ? <Encadre etat="neutre" titre="Aucun voyage">Aucune demande de voyage d’études pour {d.annee}.</Encadre>
        : <ListeEtats>{d.voyages.map(v => (
            <LigneEtat key={v.id} etat={ETAT[v.statut] || 'neutre'} icone={IconPlane} titre={v.titre}
              sous={`${v.section || '—'} · ${v.destination || 'destination à préciser'} · ${v.du ? `du ${fr(v.du)} au ${fr(v.au)}` : 'dates à préciser'} · ${eur(v.total)} · ${v.referent_nom || ''}`}
              meta={<PastilleEtat etat={ETAT[v.statut] || 'neutre'}>{d.statuts[v.statut]}</PastilleEtat>} onClick={() => setOuvert(v.id)} />))}</ListeEtats>}
      {ouvert && <Editeur key={ouvert} id={ouvert} d={d} onFermer={() => setOuvert(null)} onFait={charger} />}
    </div>);
}

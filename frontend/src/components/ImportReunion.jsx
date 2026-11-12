import { useState } from 'react';
import { IconFileImport, IconTrash, IconPlus, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, Encadre } from './ui.jsx';

/**
 * IMPORTER UN COMPTE RENDU (3.5.379, Charles, 12 novembre 2026 : « on sait importer ce document ou un document ? » ; Word, PDF et
 * texte, avec relecture). Lucie lit le fichier et propose : fiche, ordre du jour, points et leurs notes, tâches. On relit, on corrige,
 * on rattache chaque tâche à une PERSONNE de la liste (le nom lu dans le fichier n'est qu'une indication) ; « Créer la réunion » écrit
 * par les routes habituelles. Rien ne s'enregistre avant.
 */
const sans = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function personneDe(qui, personnes) {
  const mots = sans(qui).split(/[^a-z]+/).filter(m => m.length > 2);
  if (!mots.length) return '';
  const p = personnes.find(x => mots.every(m => sans(x.nom).includes(m)));
  return p?.cle || '';
}

export default function ImportReunion({ types = [], personnes = [], onFermer, onCree }) {
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const lire = async f => {
    if (!f) return;
    setErreur(null); setEnCours(true);
    try {
      const fichier = await new Promise((ok, ko) => { const x = new FileReader(); x.onload = () => ok(x.result); x.onerror = () => ko(new Error('Fichier illisible.')); x.readAsDataURL(f); });
      const rep = await fetch('/api/reunions/importer', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ fichier, nom: f.name }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || 'Le fichier ne se lit pas.');
      const genre = types.some(t => t.cle === j.genre) ? j.genre : (types[0]?.cle || j.genre);
      setR({ ...j, genre, ordre: (j.ordre_du_jour || []).join('\n'),
        taches: (j.taches || []).map(t => ({ ...t, garder: true, cle: personneDe(t.qui, personnes), echeance: t.echeance || '' })) });
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const maj = (k, v) => setR(x => ({ ...x, [k]: v }));
  const majPoint = (i, k, v) => setR(x => ({ ...x, points: x.points.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  const majTache = (i, k, v) => setR(x => ({ ...x, taches: x.taches.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const gardees = (r?.taches || []).filter(t => t.garder && t.titre.trim());
  const creer = async () => {
    setErreur(null); setEnCours(true);
    try {
      const rep = await fetch('/api/reunions', { method: 'POST', headers: authHeaders(), body: JSON.stringify({
        titre: r.titre, genre: r.genre, date_seance: r.date_seance || undefined, lieu: r.lieu || null, ordre_du_jour: r.ordre || null,
        notes: r.participants ? `Participants : ${r.participants}` : null, statut: 'tenue',
        points: r.points.filter(p => p.intitule.trim() || p.notes.trim()) }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || 'La réunion n’a pas pu être créée.');
      for (const t of gardees) {
        const rt = await fetch('/api/reunions/taches', { method: 'POST', headers: authHeaders(), body: JSON.stringify({
          titre: t.titre, reunion_id: j.id, echeance: t.echeance || null, responsables: t.cle ? [t.cle] : [],
          detail: !t.cle && t.qui ? `Indiqué dans le compte rendu : ${t.qui}` : null }) });
        if (!rt.ok) { const e = await rt.json().catch(() => ({})); throw new Error(`Tâche « ${t.titre.slice(0, 40)} » : ${e.error || 'refusée'}`); }
      }
      onCree(j.id);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  return (
    <Fenetre icone={IconFileImport} titre="Importer un compte rendu" sous="Word, PDF ou texte — relisez avant de créer la réunion"
      large="grande" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-second text-slate-500 flex-1 min-w-0">{r ? `${r.points.length} point(s) · ${gardees.length} tâche(s) — rien n’est enregistré avant « Créer la réunion ».` : ''}</span>
        <button type="button" className="bouton" onClick={onFermer}>Annuler</button>
        {r && <button type="button" className="bouton bouton-fort" disabled={enCours || !r.titre.trim()} onClick={creer}>{enCours ? 'Création…' : 'Créer la réunion'}</button>}
      </div>}>
      <div className="space-y-3 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600">Le compte rendu :</span>
          <input type="file" accept=".docx,.pdf,.md,.txt" onChange={e => lire(e.target.files?.[0])} />
          {enCours && !r && <span className="text-second text-slate-500">Lecture…</span>}
        </label>
        {erreur && <Encadre etat="corriger" icone={IconAlertTriangle} titre={erreur} />}
        {r?.avertissements?.map(a => <Encadre key={a} etat="surveiller" titre={a} />)}
        {r && <>
          <div className="grid gap-2 md:grid-cols-[1fr_12rem_10rem]">
            <label className="block"><span className="text-second text-slate-600">Titre</span>
              <input className="controle w-full" value={r.titre} onChange={e => maj('titre', e.target.value)} /></label>
            <label className="block"><span className="text-second text-slate-600">Type de réunion</span>
              <select className="controle w-full" value={r.genre} onChange={e => maj('genre', e.target.value)}>
                {types.map(t => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select></label>
            <label className="block"><span className="text-second text-slate-600">Date</span>
              <input type="date" className="controle w-full" value={r.date_seance || ''} onChange={e => maj('date_seance', e.target.value)} /></label>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block"><span className="text-second text-slate-600">Lieu</span>
              <input className="controle w-full" value={r.lieu} onChange={e => maj('lieu', e.target.value)} /></label>
            <label className="block"><span className="text-second text-slate-600">Participants (repris dans les notes)</span>
              <input className="controle w-full" value={r.participants} onChange={e => maj('participants', e.target.value)} /></label>
          </div>
          <label className="block"><span className="text-second text-slate-600">Ordre du jour (une ligne par point)</span>
            <textarea className="controle w-full !h-auto" rows={Math.min(8, Math.max(3, r.ordre.split('\n').length))} data-reponses="non"
              value={r.ordre} onChange={e => maj('ordre', e.target.value)} /></label>

          <div className="intertitre">Points et notes</div>
          {r.points.map((p, i) => (
            <div key={i} className="carte p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <input className="controle flex-1 font-semibold" value={p.intitule} onChange={e => majPoint(i, 'intitule', e.target.value)} />
                <button type="button" aria-label="Retirer ce point" className="text-slate-400 hover:text-red-700"
                  onClick={() => setR(x => ({ ...x, points: x.points.filter((_, j) => j !== i) }))}><IconTrash size={15} /></button>
              </div>
              <textarea className="controle w-full !h-auto text-second" rows={Math.min(10, Math.max(3, p.notes.split('\n').length + 1))} data-reponses="non"
                value={p.notes} onChange={e => majPoint(i, 'notes', e.target.value)} />
            </div>))}
          <button type="button" className="bouton" onClick={() => setR(x => ({ ...x, points: [...x.points, { intitule: '', notes: '' }] }))}><IconPlus size={14} /> Point</button>

          <div className="intertitre">Tâches</div>
          {!r.taches.length && <p className="text-second text-slate-500">Aucune tâche reconnue (un tableau « Quoi · Qui · Pour quand », ou une liste sous « Tâches » ou « Actions »).</p>}
          {r.taches.map((t, i) => (
            <div key={i} className={`grid gap-2 items-center md:grid-cols-[auto_1fr_14rem_9rem] ${t.garder ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={t.garder} onChange={e => majTache(i, 'garder', e.target.checked)} aria-label="Garder cette tâche" />
              <input className="controle w-full" value={t.titre} onChange={e => majTache(i, 'titre', e.target.value)} />
              <select className="controle w-full" value={t.cle} onChange={e => majTache(i, 'cle', e.target.value)}
                title={t.qui ? `Dans le compte rendu : ${t.qui}` : undefined}>
                <option value="">{t.qui ? `— à choisir (« ${t.qui} ») —` : '— personne —'}</option>
                {personnes.map(p => <option key={p.cle} value={p.cle}>{p.nom}</option>)}
              </select>
              <input type="date" className="controle w-full" value={t.echeance} onChange={e => majTache(i, 'echeance', e.target.value)}
                title={t.quand ? `Dans le compte rendu : ${t.quand}` : undefined} />
            </div>))}
        </>}
      </div>
    </Fenetre>);
}

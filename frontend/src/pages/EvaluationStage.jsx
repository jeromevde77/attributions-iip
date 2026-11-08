import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * LA FICHE DU MAÎTRE DE STAGE (3.5.213, Charles, 8 novembre 2026 : une porte pour le maître de stage).
 *
 * Hors session : le maître de stage n'a pas de compte. Il arrive ici par le lien que le professeur de stage lui a envoyé
 * (/evaluation-stage/<jeton>, 60 jours, un stage et une fiche). Il voit l'étudiant, le lieu, la période et les critères ;
 * il donne une note par critère (sur le maximum de la fiche) et peut revenir corriger tant que le lien vaut.
 * Serveur : routes/mesStages.js (`publique`).
 */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const valeurDe = n => (n ? (n.mention || (n.points == null ? '' : String(n.points).replace('.', ','))) : '');

const Tete = () => (
  <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-iip-blue text-white grid place-items-center text-second font-extrabold">IIP</div>
    <div className="leading-tight">
      <div className="text-sm font-bold text-iip-texte">Institut Ilya Prigogine</div>
      <div className="text-xs text-slate-500">Évaluation d’un stage</div>
    </div>
  </div>
);

export default function EvaluationStage() {
  const { jeton } = useParams();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [vals, setVals] = useState({});
  const [nom, setNom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState(null);

  const charger = () => fetch(`/api/evaluation-stage/${encodeURIComponent(jeton || '')}`)
    .then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Ce lien n’est pas valable.');
      setD(j); setNom(n => n || j.maitre || '');
      setVals(Object.fromEntries(j.fiche.criteres.map(c => [c.aa_code, valeurDe(c.note)])));
    })
    .catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, [jeton]);   // eslint-disable-line react-hooks/exhaustive-deps

  const envoyer = async e => {
    e.preventDefault();
    setEnvoi(true); setMessage(null);
    try {
      const r = await fetch(`/api/evaluation-stage/${encodeURIComponent(jeton)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, notes: d.fiche.criteres.map(c => ({ aa_code: c.aa_code, valeur: vals[c.aa_code] || '' })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Enregistrement refusé.');
      setMessage({ ok: true, texte: 'Merci : votre évaluation est enregistrée. Vous pouvez revenir la corriger par le même lien.' });
      charger();
    } catch (x) { setMessage({ ok: false, texte: x.message }); } finally { setEnvoi(false); }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-fond)' }}>
      <Tete />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {erreur && <div className="carte px-4 py-4 text-sm">{erreur}</div>}
        {!erreur && !d && <div className="text-second text-slate-500">Chargement…</div>}
        {d && (
          <form onSubmit={envoyer} className="space-y-4">
            <div>
              <h1 className="titre-ecran">{d.fiche.intitule}</h1>
              <p className="text-second text-slate-500">Stage de <b className="text-iip-texte">{d.etudiant}</b>{d.lieu ? ` — ${d.lieu}` : ''}{d.debut ? `, du ${fr(d.debut)} au ${fr(d.fin)}` : ''}.
                {d.unite ? ` Unité : ${d.unite}.` : ''}{d.superviseur ? ` Professeur de stage : ${d.superviseur}.` : ''}</p>
            </div>
            <div className="carte px-4 py-3 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-500">Votre nom</span>
                <input className="controle w-full mt-1" value={nom} onChange={e => setNom(e.target.value)} required maxLength={120} autoComplete="name" />
              </label>
              <p className="text-second text-slate-500">Pour chaque critère, une note sur {String(d.fiche.sur).replace('.', ',')}. Si vous n’avez pas pu l’observer, laissez la case vide.</p>
              {d.fiche.criteres.map(c => (
                <div key={c.aa_code} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start border-t border-slate-200 pt-3">
                  <div className="min-w-0">
                    <div className="text-sm">{c.description || c.aa_code}</div>
                    {c.consigne && <div className="text-second text-slate-500 whitespace-pre-line">{c.consigne}</div>}
                  </div>
                  <input className="controle w-28 text-right tabular-nums" inputMode="decimal" value={vals[c.aa_code] || ''} placeholder={`/ ${d.fiche.sur}`}
                    onChange={e => setVals(v => ({ ...v, [c.aa_code]: e.target.value }))} aria-label={`Note : ${c.description || c.aa_code}`} />
                </div>))}
              {!d.fiche.criteres.length && <div className="text-second text-slate-500">Cette fiche n’a pas encore de critères. Prévenez le professeur de stage.</div>}
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-end">
              {message && <span className="text-second min-w-0" style={{ color: message.ok ? 'var(--c-reussi)' : 'var(--c-refuse)' }}>{message.texte}</span>}
              <button type="submit" className="bouton bouton-fort" disabled={envoi || !d.fiche.criteres.length || !nom.trim()}>{envoi ? 'Enregistrement…' : 'Enregistrer l’évaluation'}</button>
            </div>
            <p className="text-mention text-slate-400">{d.rempli_le ? `Déjà enregistrée le ${fr(d.rempli_le)}. ` : ''}Lien personnel, valable jusqu’au {fr(d.expire_le)}. Les notes sont transmises au professeur de stage et entrent dans l’évaluation du cours.</p>
          </form>)}
      </div>
    </div>);
}

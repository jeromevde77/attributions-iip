import { useEffect, useState } from 'react';
import { IconFileText } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Fenetre, Encadre } from './ui.jsx';

/**
 * Formulaire pour l'obtention d'un visa ou d'un titre de séjour étudiant —
 * annexe 1 de l'arrêté ministériel du 28 mars 2022 (article 99 de l'arrêté
 * royal du 8 octobre 1981). La sœur de l'annexe 2.
 *
 * Lucie propose ce qu'elle sait — la situation (inscrit cette année ou non),
 * l'intitulé du grade et les crédits de la fiche de section, les crédits du
 * programme de l'année —, signale ce qu'elle ignore, et laisse à la direction
 * ce qui est une appréciation : les raisons d'un programme sous 54 crédits, les
 * conditions d'admission.
 */
const aujourdHui = () => new Date().toISOString().slice(0, 10);

export default function Annexe1({ etudId, annee, onClose }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [f, setF] = useState({ situation: 'definitive', echange_du: '', echange_au: '', date_ultime: '',
    grade: '', total_ects: '', mobilite: false, mobilite_mois: '', credits_annee: '', raisons: '',
    conditions: '', lieu: 'Anderlecht', date_document: aujourdHui() });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  useEffect(() => {
    fetch(`/api/annexe1/donnees/${etudId}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => {
        setD(j);
        setF(x => ({ ...x, situation: j.situation_proposee, grade: j.formation.grade || '',
          total_ects: j.formation.total_ects || '', credits_annee: j.credits_annee ?? '' }));
      })
      .catch(e => setErreur(e.message));
  }, [etudId, annee]);

  const produire = async () => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/annexe1/document', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: etudId, annee, ...f }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      ouvrirApercu({ html: j.html, titre: 'Visa ou titre de séjour étudiant (annexe 1)', sousTitre: annee,
        nomFichier: `Annexe1_${(d?.etudiant?.nom || '').toUpperCase()}_${annee}`,
        destinataire: { type: 'etudiant', id: etudId }, typeDoc: 'annexe1', astuceImpression: 'A4 portrait' });
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const def = f.situation === 'definitive';
  const admis = f.situation === 'admis' || f.situation === 'preparatoire_admis';
  const sous54 = def && Number(f.credits_annee) < 54;
  const lab = 'block text-[12px] text-slate-600';
  return (
    <Fenetre icone={IconFileText} titre="Visa ou titre de séjour étudiant" large="moyenne" onFermer={onClose}
      sous={`Annexe 1 de l'arrêté ministériel du 28 mars 2022 — Office des Étrangers · ${annee}`}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-[12px] text-slate-500 min-w-0 flex-1">
          {sous54 && !f.raisons.trim() ? 'Programme sous 54 crédits : la raison est attendue par le formulaire.' : ''}
        </span>
        <button type="button" className="bouton" onClick={onClose}>Fermer</button>
        <button type="button" className="bouton bouton-sortir" disabled={!d || enCours} onClick={produire}>
          {enCours ? 'Préparation…' : 'Produire le formulaire'}</button>
      </div>}>
      <div className="space-y-3 text-[13px]">
        {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
        {d?.manques?.length > 0 && (
          <Encadre etat="surveiller" titre="À compléter avant envoi">
            Lucie ne connaît pas {d.manques.join(', ')}. Ces champs resteront en pointillés : cette pièce part à une
            administration fédérale, mieux vaut un blanc qu'une valeur inventée.
          </Encadre>
        )}
        {d && (
          <p className="text-slate-600"><b>{(d.etudiant.nom || '').toUpperCase()} {d.etudiant.prenom}</b>
            {' '}· né(e) le {d.etudiant.date_naissance || '—'} · {d.etudiant.nationalite || 'nationalité inconnue'}</p>
        )}

        <fieldset className="space-y-1">
          <legend className="text-[12px] font-semibold text-slate-600 mb-1">Situation de l'étudiant</legend>
          {Object.entries(d?.situations || {}).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name="situation" checked={f.situation === k} onChange={() => set('situation', k)} /> {l}
            </label>
          ))}
        </fieldset>
        {f.situation === 'echange' && (
          <div className="grid grid-cols-2 gap-2">
            <label className={lab}>Échange du<input type="date" className="controle w-full" value={f.echange_du} onChange={e => set('echange_du', e.target.value)} /></label>
            <label className={lab}>au<input type="date" className="controle w-full" value={f.echange_au} onChange={e => set('echange_au', e.target.value)} /></label>
          </div>
        )}
        {admis && (
          <label className={lab}>Date ultime d'inscription
            <input type="date" className="controle w-56 block" value={f.date_ultime} onChange={e => set('date_ultime', e.target.value)} /></label>
        )}

        <div className="grid grid-cols-[1fr_140px] gap-2">
          <label className={lab}>Intitulé du grade académique
            <input className="controle w-full" value={f.grade} onChange={e => set('grade', e.target.value)} /></label>
          <label className={lab}>Crédits ECTS de la formation
            <input className="controle w-full" value={f.total_ects} onChange={e => set('total_ects', e.target.value)} /></label>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[12px] text-slate-600">Mobilité dans un autre État membre cette année :</span>
          <label className="flex items-center gap-1"><input type="radio" checked={!f.mobilite} onChange={() => set('mobilite', false)} /> Non</label>
          <label className="flex items-center gap-1"><input type="radio" checked={f.mobilite} onChange={() => set('mobilite', true)} /> Oui</label>
          {f.mobilite && <label className="text-[12px] text-slate-600 flex items-center gap-1">durée
            <input className="controle w-16" value={f.mobilite_mois} onChange={e => set('mobilite_mois', e.target.value)} /> mois</label>}
        </div>

        {def && (
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <label className={lab}>Crédits du programme annuel
              <input className="controle w-full" value={f.credits_annee} onChange={e => set('credits_annee', e.target.value)} /></label>
            <label className={lab}>Raisons d'un programme sous 54 crédits {sous54 ? '' : '(sans objet)'}
              <input className="controle w-full" value={f.raisons} placeholder="ex. étudiant en parcours, n'a pas validé toutes les UE"
                onChange={e => set('raisons', e.target.value)} /></label>
          </div>
        )}
        {admis && (
          <label className={lab}>Conditions d'admission spécifiques (ex. équivalence du diplôme secondaire)
            <textarea className="controle w-full h-16 py-1.5" value={f.conditions} onChange={e => set('conditions', e.target.value)} /></label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className={lab}>Fait à<input className="controle w-full" value={f.lieu} onChange={e => set('lieu', e.target.value)} /></label>
          <label className={lab}>Le<input type="date" className="controle w-full" value={f.date_document} onChange={e => set('date_document', e.target.value)} /></label>
        </div>
        <p className="text-[11px] text-slate-400">Crédits du programme annuel : la somme des ECTS des unités inscrites en {annee}.</p>
      </div>
    </Fenetre>
  );
}

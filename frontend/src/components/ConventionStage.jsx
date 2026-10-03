import { useEffect, useRef, useState } from 'react';
import { IconUpload, IconFileText, IconSignature, IconTrash } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { PastilleEtat } from './ui.jsx';

/**
 * LA CONVENTION D'UN STAGE — préparée ici, signée à l'Accueil du directeur
 * (routes/conventions.js). La coordination ou le secrétariat dépose le PDF ;
 * la griffe, elle, ne se pose que depuis le compte du signataire.
 * L'état se lit des traces : déposée → signée par l'IIP.
 */
export const frDate = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
export const nomEcran = (nom, prenom) => [String(nom || '').toUpperCase(), prenom].filter(Boolean).join(' ');

/** Ouvre le PDF dans un onglet. L'onglet s'ouvre AVANT la requête : ouvert
    après un `await`, le navigateur le bloque comme une fenêtre surgissante. */
export async function ouvrirConvention(id, version = 'original') {
  const w = window.open('', '_blank');
  const rep = await fetch(`/api/conventions/${id}/fichier?version=${version}`, { headers: authHeaders() });
  if (!rep.ok) {
    const j = await rep.json().catch(() => ({}));
    if (w) w.close();
    return j.error || 'Fichier introuvable.';
  }
  const url = URL.createObjectURL(await rep.blob());
  if (w) w.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return null;
}

const ETATS = {
  deposee: { etat: 'surveiller', libelle: 'À signer par la direction' },
  signee:  { etat: 'reussi',     libelle: 'Signée par l’IIP' },
  contresignee: { etat: 'reussi', libelle: 'Contresignée par le lieu' },
  retiree: { etat: 'corriger',   libelle: 'Retirée' },
};

export default function ConventionStage({ stage, peutEcrire, onChange }) {
  const [liste, setListe] = useState(null);
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);

  async function charger() {
    const j = await fetch(`/api/conventions?stage_id=${stage.id}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { conventions: [] })).catch(() => ({ conventions: [] }));
    setListe(j.conventions || []);
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [stage.id]);

  async function deposer(fichier) {
    if (!fichier) return;
    setEnvoi(true); setMessage(null);
    const fd = new FormData();
    fd.append('fichier', fichier);
    fd.append('stage_id', String(stage.id));
    fd.append('type', 'stage');
    fd.append('origine', 'lieu');
    // UN ENVOI DE FICHIER N'EST PAS DU JSON : on retire l'en-tête et le
    // navigateur écrit lui-même la frontière du multipart.
    const { 'Content-Type': _ct, ...h } = authHeaders();
    const rep = await fetch('/api/conventions', { method: 'POST', headers: { ...h, 'X-Annee': getAnnee() }, body: fd });
    const j = await rep.json().catch(() => ({}));
    setEnvoi(false);
    if (champ.current) champ.current.value = '';
    if (!rep.ok) { setMessage(j.error || 'Dépôt refusé.'); return; }
    await charger();
    onChange?.();
  }

  async function supprimer(c) {
    const rep = await fetch(`/api/conventions/${c.id}`, { method: 'DELETE', headers: authHeaders() });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { setMessage(j.error || 'Suppression refusée.'); return; }
    await charger();
  }

  async function ouvrir(id, version) {
    const err = await ouvrirConvention(id, version);
    if (err) setMessage(err);
  }

  if (!liste) return null;
  const active = liste.find(c => c.etat !== 'retiree');
  const anciennes = liste.filter(c => c.etat === 'retiree');

  return (
    <div className="pt-2 border-t border-slate-100">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Convention</span>
        {active ? (
          <>
            <PastilleEtat etat={ETATS[active.etat].etat}>{ETATS[active.etat].libelle}</PastilleEtat>
            <span className="text-[12px] text-slate-500">
              {active.etat === 'signee' || active.etat === 'contresignee'
                ? <>le {frDate(active.signe_le)} par {active.signe_par_nom} · réf. {active.reference}</>
                : <>déposée le {frDate(active.depose_le)} par {active.depose_par_nom}</>}
            </span>
            <span className="flex-1" />
            <button type="button" className="bouton" onClick={() => ouvrir(active.id, 'original')}
              title={active.fichier_nom}>
              <IconFileText size={14} /> Original
            </button>
            {active.a_signe && (
              <button type="button" className="bouton bouton-sortir" onClick={() => ouvrir(active.id, 'signe')}>
                <IconSignature size={14} /> Signée
              </button>
            )}
            {peutEcrire && active.etat === 'deposee' && (
              <button type="button" className="bouton" onClick={() => supprimer(active)}
                title="Retirer ce dépôt (avant signature seulement)">
                <IconTrash size={14} />
              </button>
            )}
          </>
        ) : (
          <>
            <span className="text-[12px] text-slate-400">aucune convention déposée</span>
            <span className="flex-1" />
            {peutEcrire && (
              <label className={`bouton ${envoi ? 'opacity-50 pointer-events-none' : ''}`}
                title={stage.lieu_id ? 'Déposer le PDF reçu du lieu : il part à la signature de la direction'
                  : 'Choisissez d’abord le lieu de stage'}>
                <IconUpload size={14} /> {envoi ? 'Envoi…' : 'Déposer la convention (PDF)'}
                <input ref={champ} type="file" accept="application/pdf,.pdf" className="hidden"
                  disabled={!stage.lieu_id || envoi} onChange={e => deposer(e.target.files?.[0])} />
              </label>
            )}
          </>
        )}
      </div>
      {anciennes.length > 0 && (
        <div className="text-[11px] text-slate-400 mt-1">
          {anciennes.map(c => (
            <div key={c.id}>Retirée le {frDate(c.retire_le)} par {c.retire_par} — {c.motif_retrait}</div>
          ))}
        </div>
      )}
      {message && <div className="text-[12px] text-red-700 mt-1">{message}</div>}
    </div>
  );
}

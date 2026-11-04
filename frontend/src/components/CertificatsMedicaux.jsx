/* LES CERTIFICATS MÉDICAUX (3.5.125) — face du Suivi des présences. Le secrétariat encode un certificat reçu (étudiant, période
 * d'absence, date de réception, fichier) ; remis dans les 3 jours ouvrables après le début de l'absence, il est accepté d'office
 * et les absences de la période deviennent justifiées ; au-delà, la direction décide. Professeurs et secrétariat sont prévenus.
 * Serveur : `routes/certificats.js`, `lib/certificatMedical.js`. */
import { useEffect, useState } from 'react';
import { IconFileUpload, IconFileText, IconSearch } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { saisir, demander } from '../lib/dialogue.jsx';
import { PastilleEtat } from './ui.jsx';

const aujourdHui = () => new Date().toISOString().slice(0, 10);
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const ETAT = {
  accepte: ['reussi', 'Accepté'],
  a_decider: ['surveiller', 'Hors délai — à décider'],
  refuse: ['corriger', 'Refusé'],
};

export default function CertificatsMedicaux() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [q, setQ] = useState('');
  const [trouves, setTrouves] = useState([]);
  const [etud, setEtud] = useState(null);
  const [du, setDu] = useState(aujourdHui());
  const [au, setAu] = useState(aujourdHui());
  const [recu, setRecu] = useState(aujourdHui());
  const [fichier, setFichier] = useState(null);
  const [limite, setLimite] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = () => fetch('/api/certificats-medicaux', { headers: authHeaders() })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  useEffect(() => {
    if (!du) return;
    fetch(`/api/certificats-medicaux/limite?du=${du}`, { headers: authHeaders() }).then(r => r.json()).then(j => setLimite(j.limite || null)).catch(() => setLimite(null));
  }, [du]);
  useEffect(() => {
    if (q.trim().length < 2 || etud) { setTrouves([]); return; }
    const t = setTimeout(() => fetch(`/api/etudiants?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => setTrouves(Array.isArray(l) ? l.slice(0, 8) : [])).catch(() => setTrouves([])), 250);
    return () => clearTimeout(t);
  }, [q, etud]);

  async function enregistrer() {
    setErreur(null); setMessage(null); setEnvoi(true);
    try {
      const fd = new FormData();
      fd.append('etudiant_id', etud.id); fd.append('du', du); fd.append('au', au); fd.append('recu_le', recu);
      if (fichier) fd.append('fichier', fichier);
      const h = authHeaders(); delete h['Content-Type'];
      const r = await fetch('/api/certificats-medicaux', { method: 'POST', headers: h, body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMessage(j.hors_delai
        ? `Enregistré hors délai (limite : ${fr(j.limite)}) : la direction décide. Professeurs et secrétariat sont prévenus.`
        : `Accepté : les absences de la période sont justifiées${j.seances_justifiees ? ` (${j.seances_justifiees} séance(s) déjà encodée(s))` : ''}. Professeurs et secrétariat sont prévenus.`);
      setEtud(null); setQ(''); setFichier(null);
      charger();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  }
  async function decider(c, decision) {
    let motif = null;
    if (decision === 'refuse') {
      motif = await saisir({ titre: 'Refuser le certificat', message: 'Pourquoi ? Le motif est gardé et transmis.', valeur: '' });
      if (!motif || !motif.trim()) return;
    } else if (!(await demander(`Accepter le certificat de ${c.nom} ${c.prenom} malgré le délai ? Les absences de la période deviendront justifiées.`))) return;
    const r = await fetch(`/api/certificats-medicaux/${c.id}/decision`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ decision, motif }) });
    const j = await r.json(); if (!r.ok) setErreur(j.error); else charger();
  }
  async function ouvrir(c) {
    const r = await fetch(`/api/certificats-medicaux/${c.id}/fichier`, { headers: authHeaders() });
    if (!r.ok) { setErreur('Fichier introuvable.'); return; }
    window.open(URL.createObjectURL(await r.blob()), '_blank');
  }

  const horsDelai = limite && recu > limite;
  return (
    <div className="space-y-3">
      <p className="text-second text-slate-500">
        Un certificat remis dans les {d?.delai ?? 3} jours ouvrables après le début de l’absence est accepté d’office : les absences de la
        période deviennent « justifiées — certificat médical », y compris celles encodées plus tard. Au-delà, la direction décide.
      </p>
      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {message && <div className="bloc-etat px-3 py-2 text-sm" data-etat="reussi">{message}</div>}

      {d?.peut_encoder && (
        <div className="carte p-3 space-y-2">
          <div className="intertitre">Encoder un certificat reçu</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-second text-slate-600 relative">
              <div className="mb-0.5">Étudiant</div>
              {etud ? (
                <button type="button" className="controle bouton" onClick={() => { setEtud(null); setQ(''); }} title="Changer d’étudiant">
                  {String(etud.nom || '').toUpperCase()} {etud.prenom}{etud.sections ? ` · ${etud.sections}` : ''} ✕</button>
              ) : (
                <div className="relative">
                  <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="controle controle-icone w-72" placeholder="Nom ou matricule" value={q} onChange={e => setQ(e.target.value)} />
                  {trouves.length > 0 && (
                    <div className="absolute z-20 mt-1 w-80 carte bg-white shadow-flottant py-1">
                      {trouves.map(t => (
                        <button key={t.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={() => { setEtud(t); setTrouves([]); }}>
                          {String(t.nom || '').toUpperCase()} {t.prenom} <span className="text-slate-400">{t.id_ecampus || ''} {t.sections || ''}</span></button>))}
                    </div>)}
                </div>)}
            </label>
            <label className="text-second text-slate-600"><div className="mb-0.5">Absent du</div>
              <input type="date" className="controle" value={du} onChange={e => { setDu(e.target.value); if (au < e.target.value) setAu(e.target.value); }} /></label>
            <label className="text-second text-slate-600"><div className="mb-0.5">au</div>
              <input type="date" className="controle" value={au} min={du} onChange={e => setAu(e.target.value)} /></label>
            <label className="text-second text-slate-600"><div className="mb-0.5">Reçu le</div>
              <input type="date" className="controle" value={recu} onChange={e => setRecu(e.target.value)} /></label>
            <label className="bouton controle inline-flex items-center gap-1.5 cursor-pointer">
              <IconFileUpload size={15} /> {fichier ? fichier.name : 'Le certificat (PDF, photo)'}
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => setFichier(e.target.files?.[0] || null)} />
            </label>
            <button type="button" className="bouton bouton-fort controle" disabled={!etud || !du || !au || envoi} onClick={enregistrer}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
          {limite && (
            <p className="text-second m-0" style={{ color: horsDelai ? 'var(--c-attente)' : undefined }}>
              Limite de remise : <b>{fr(limite)}</b>{horsDelai ? ' — reçu après la limite : il attendra la décision de la direction.' : ' — dans le délai.'}
            </p>)}
        </div>)}

      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="tab-entete">
            <th className="px-3 py-1.5 text-left">Étudiant</th><th className="px-2 py-1.5 text-left">Absence</th>
            <th className="px-2 py-1.5 text-left">Reçu le</th><th className="px-2 py-1.5 text-left">Limite</th>
            <th className="px-2 py-1.5 text-left">État</th><th className="px-2 py-1.5 text-right">Séances justifiées</th>
            <th className="px-2 py-1.5 text-left">Déposé par</th><th className="px-2 py-1.5" />
          </tr></thead>
          <tbody>
            {(d?.certificats || []).map(c => {
              const [etat, lib] = ETAT[c.statut] || ['neutre', c.statut];
              return (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 whitespace-nowrap">{String(c.nom || '').toUpperCase()} {c.prenom}
                    {c.section && <span className="ml-1.5 text-mention text-slate-400">{c.section}</span>}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">du {fr(c.du)} au {fr(c.au)}</td>
                  <td className="px-2 py-1.5">{fr(c.recu_le)}</td>
                  <td className="px-2 py-1.5">{fr(c.limite)}</td>
                  <td className="px-2 py-1.5"><PastilleEtat etat={etat}>{lib}</PastilleEtat>
                    {c.motif_refus && <div className="text-mention text-slate-500">{c.motif_refus}</div>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.seances_justifiees || 0}</td>
                  <td className="px-2 py-1.5 text-second text-slate-500">{c.depose_par === 'etudiant' ? 'l’étudiant (espace)' : c.cree_par || 'secrétariat'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    {c.nom_fichier && <button type="button" className="bouton controle mr-1 inline-flex items-center gap-1" onClick={() => ouvrir(c)}><IconFileText size={15} /> Voir</button>}
                    {d.peut_decider && c.statut === 'a_decider' && <>
                      <button type="button" className="bouton controle mr-1" onClick={() => decider(c, 'accepte')}>Accepter</button>
                      <button type="button" className="bouton bouton-detruire controle" onClick={() => decider(c, 'refuse')}>Refuser</button>
                    </>}
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
        {d && !d.certificats.length && <p className="px-3 py-4 text-sm text-slate-400">Aucun certificat encodé.</p>}
      </div>
    </div>
  );
}

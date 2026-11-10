/* LE SUIVI DE SANTÉ DANS LA FICHE (3.5.283, Charles, 10 novembre 2026, d'après la note du secrétariat : « organisme CESI, date de
 * l'examen du formulaire de santé ; pas de visite médicale, pas de stage et pas de réussite »). Onglet « Santé » : l'état de la
 * visite (valable jusqu'au…, échue, aucune), encoder une visite (organisme CESI par défaut, date du formulaire, formulaire du CESI
 * déposé), joindre le formulaire plus tard, retirer une visite encodée par erreur (motif). La direction règle la durée de
 * validité. Les stages lisent cette visite (« Visite médicale (CESI) »). Serveur : /api/sante. */
import { useCallback, useEffect, useState } from 'react';
import { IconStethoscope, IconUpload, IconFileText, IconTrash, IconDeviceFloppy } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { saisir } from '../lib/dialogue.jsx';
import { EnteteCarte, Encadre, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const aujourdHui = () => new Date().toISOString().slice(0, 10);

export default function SuiviSante({ etudId }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [organisme, setOrganisme] = useState('CESI');
  const [date, setDate] = useState(aujourdHui());
  const [remarque, setRemarque] = useState('');
  const [fichier, setFichier] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [mois, setMois] = useState('');
  const charger = useCallback(() => {
    fetch(`/api/sante/etudiant/${etudId}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => { setD(j); setOrganisme(j.organisme_defaut || 'CESI'); setMois(String(j.validite_mois || 12)); })
      .catch(e => setErreur(e.message));
  }, [etudId]);
  useEffect(() => { charger(); }, [charger]);

  const envoyerFichier = async (url, champs) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(champs)) if (v !== null && v !== undefined) fd.append(k, v);
    const h = authHeaders(); delete h['Content-Type'];
    const r = await fetch(url, { method: 'POST', headers: h, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    return j;
  };
  async function enregistrer() {
    setErreur(null); setMessage(null); setEnvoi(true);
    try {
      await envoyerFichier(`/api/sante/etudiant/${etudId}`, { organisme, date_examen: date, remarque: remarque.trim() || null, fichier });
      setMessage('Visite enregistrée.'); setRemarque(''); setFichier(null); charger();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  }
  async function joindre(v, f) {
    setErreur(null);
    try { await envoyerFichier(`/api/sante/${v.id}/formulaire`, { fichier: f }); charger(); } catch (e) { setErreur(e.message); }
  }
  async function retirer(v) {
    const motif = await saisir({ titre: 'Retirer cette visite', message: `Visite du ${fr(v.date_examen)} : pourquoi la retirer ? Elle reste lisible, barrée.`, obligatoire: true });
    if (!motif || !String(motif).trim()) return;
    const r = await fetch(`/api/sante/${v.id}`, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ motif }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErreur(j.error || `Erreur ${r.status}`); else charger();
  }
  async function reglerValidite() {
    setErreur(null);
    const r = await fetch('/api/sante/reglage', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ validite_mois: Number(mois) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErreur(j.error || `Erreur ${r.status}`); else { setMessage(`Une visite vaut désormais ${j.validite_mois} mois, pour tous les étudiants.`); charger(); }
  }
  const ouvrir = v => {
    const w = window.open('', '_blank');
    fetch(`/api/sante/${v.id}/formulaire`, { headers: authHeaders() })
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error('Formulaire introuvable.'))))
      .then(b => { const u = URL.createObjectURL(b); if (w) w.location = u; else window.open(u, '_blank'); })
      .catch(e => { w?.close(); setErreur(e.message); });
  };

  if (erreur && !d) return <div className="p-5"><Encadre etat="corriger">{erreur}</Encadre></div>;
  if (!d) return <p className="p-5 text-sm text-slate-400">Chargement…</p>;
  const a = d.actuelle;
  return (
    <div className="p-5 space-y-4">
      {a.etat === 'valide' && <Encadre etat="reussi" titre="Visite médicale en ordre">
        Visite du {fr(a.date)}{a.visite?.organisme ? ` (${a.visite.organisme})` : ''} — valable jusqu’au {fr(a.jusqu_au)}.</Encadre>}
      {a.etat === 'echue' && <Encadre etat="corriger" titre="Visite médicale échue">
        La dernière visite date du {fr(a.date)} ; elle valait jusqu’au {fr(a.jusqu_au)}. Pas de visite médicale, pas de stage et pas de réussite en fin d’année : une nouvelle visite est à faire.</Encadre>}
      {a.etat === 'aucune' && <Encadre etat="surveiller" titre="Pas encore de visite médicale">
        Aucune visite encodée. Pas de visite médicale, pas de stage et pas de réussite en fin d’année : dès que le CESI envoie le formulaire de santé, encodez sa date ici.</Encadre>}
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {message && <Encadre etat="reussi">{message}</Encadre>}

      {d.peut_encoder && (
        <section className="carte overflow-hidden">
          <EnteteCarte icone={IconStethoscope} titre="Encoder une visite médicale"
            sous="La date est celle du formulaire de santé envoyé par le CESI (un formulaire par étudiant)." />
          <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <label className="text-sm"><span className="text-slate-600">Suivi médical / organisme</span>
              <input className="controle w-full mt-1" value={organisme} onChange={e => setOrganisme(e.target.value)} /></label>
            <label className="text-sm"><span className="text-slate-600">Date de l’examen</span>
              <input type="date" className="controle w-full mt-1" value={date} max={aujourdHui()} onChange={e => setDate(e.target.value)} /></label>
            <label className="text-sm"><span className="text-slate-600">Formulaire de santé (PDF ou photo)</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full mt-1 text-sm" onChange={e => setFichier(e.target.files?.[0] || null)} /></label>
            <label className="text-sm"><span className="text-slate-600">Remarque (facultatif)</span>
              <input className="controle w-full mt-1" data-reponses="non" value={remarque} onChange={e => setRemarque(e.target.value)} /></label>
          </div>
          <div className="px-4 pb-4 flex justify-end">
            <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={envoi || !date} onClick={enregistrer}>
              <IconDeviceFloppy size={15} /> Enregistrer la visite</button>
          </div>
        </section>)}

      <section className="carte overflow-hidden">
        <EnteteCarte titre="Visites encodées" sous={`Une visite vaut ${d.validite_mois} mois (réglé par la direction).`} />
        {d.visites.length ? (
          <Tableau className="!border-0 !rounded-none">
            <TableauEntete><Th>Date de l’examen</Th><Th>Organisme</Th><Th>Valable jusqu’au</Th><Th>Formulaire</Th><Th>Encodée par</Th><Th /></TableauEntete>
            <tbody>{d.visites.map(v => {
              const retiree = !!v.retire_le;
              const jusqu = (() => { const x = new Date(`${v.date_examen}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + d.validite_mois); return x.toISOString().slice(0, 10); })();
              return (
                <Tr key={v.id} className={retiree ? 'opacity-60' : ''}>
                  <Td className={retiree ? 'line-through' : ''}>{fr(v.date_examen)}</Td>
                  <Td>{v.organisme || '—'}{v.remarque ? <span className="block text-xs text-slate-500">{v.remarque}</span> : null}
                    {retiree ? <span className="block text-xs text-slate-500">Retirée le {fr(v.retire_le)} par {v.retire_par || '—'} : {v.retire_motif}</span> : null}</Td>
                  <Td>{retiree ? '—' : fr(jusqu)}</Td>
                  <Td>{v.a_formulaire
                    ? <button type="button" className="text-iip-blue underline inline-flex items-center gap-1" onClick={() => ouvrir(v)}><IconFileText size={14} /> Ouvrir</button>
                    : (!retiree && d.peut_encoder
                      ? <label className="text-iip-blue underline inline-flex items-center gap-1 cursor-pointer"><IconUpload size={14} /> Joindre
                          <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png" onChange={e => e.target.files?.[0] && joindre(v, e.target.files[0])} /></label>
                      : <span className="text-slate-400">—</span>)}</Td>
                  <Td className="text-xs text-slate-500">{v.cree_par || '—'} · {fr(v.cree_le)}</Td>
                  <Td align="droite">{!retiree && d.peut_encoder && (
                    <button type="button" className="text-slate-400 hover:text-slate-700" title="Retirer (encodée par erreur)" onClick={() => retirer(v)}><IconTrash size={15} /></button>)}</Td>
                </Tr>);
            })}</tbody>
          </Tableau>
        ) : <p className="p-4 text-sm text-slate-500">Aucune visite encodée.</p>}
      </section>

      {d.peut_regler && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">Une visite médicale vaut</span>
          <input type="number" min="1" max="120" className="controle w-20" value={mois} onChange={e => setMois(e.target.value)} />
          <span className="text-slate-600">mois, pour tous les étudiants.</span>
          <button type="button" className="bouton" disabled={String(mois) === String(d.validite_mois)} onClick={reglerValidite}>Enregistrer</button>
        </div>)}
    </div>);
}

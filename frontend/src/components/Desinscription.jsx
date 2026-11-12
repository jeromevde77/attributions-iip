import { useCallback, useEffect, useState } from 'react';
import { IconUserMinus, IconCheck, IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, EnteteCarte, Encadre, ListeEtats, LigneEtat, PastilleEtat } from './ui.jsx';
import { saisir } from '../lib/dialogue.jsx';

/**
 * LA DÉSINSCRIPTION (3.5.392, Charles, 12 novembre 2026 : « un bouton désinscrire ; il vérifie si l'étudiant peut être désinscrit et
 * quels frais sont remboursés selon le RDE »). Toute l'année ou des unités ; la date de la demande fait foi (RDE art. 19 §3) ; Lucie
 * calcule (art. 19 §1-§2, art. 16 §4), le secrétariat confirme. Les demandes faites en ligne par l'étudiant attendent ici.
 */
const eur = n => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const aujourdHui = () => new Date().toLocaleDateString('sv-SE');
const api = async (chemin, corps) => {
  const r = await fetch(`/api/desinscription${chemin}`, corps ? { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(corps) } : { headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Refusé.');
  return j;
};

function Calcul({ a }) {
  return (
    <div className="space-y-2">
      <Encadre etat={a.avant_dixieme ? 'disponible' : 'surveiller'} titre={a.regle} />
      <table className="w-full text-sm">
        <tbody>
          <tr><td>Unités</td><td className="text-right">{a.portee === 'annee' ? 'toute l’année' : a.unites.map(u => `UE ${u.ue_num}`).join(', ')}</td></tr>
          {a.unites.map(u => <tr key={u.ue_num} className="text-second text-slate-500"><td className="pl-3">UE {u.ue_num} {u.ue_nom}</td>
            <td className="text-right">1er dixième : {fr(u.dixieme)}{u.avant_dixieme === true ? ' · avant' : u.avant_dixieme === false ? ' · dépassé' : ''}</td></tr>)}
          <tr><td>Frais de l’année aujourd’hui</td><td className="text-right">{eur(a.frais.total_avant)}</td></tr>
          <tr><td>Restent dus après la désinscription</td><td className="text-right font-semibold">{eur(a.frais.du)}</td></tr>
          <tr><td>Déjà versé</td><td className="text-right">{eur(a.frais.verse)}</td></tr>
          <tr><td className="font-semibold">À rembourser à l’étudiant</td><td className="text-right font-semibold">{eur(a.frais.rembourse)}</td></tr>
          {a.frais.reste_du > 0 && <tr><td className="font-semibold">Reste à payer par l’étudiant</td><td className="text-right font-semibold">{eur(a.frais.reste_du)}</td></tr>}
        </tbody>
      </table>
    </div>);
}

function FenetreDesinscrire({ etudId, annee, ues, onFermer, onFait }) {
  const [toute, setToute] = useState(true);
  const [choix, setChoix] = useState(() => new Set());
  const [date, setDate] = useState(aujourdHui());
  const [motif, setMotif] = useState('');
  const [a, setA] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const corps = { annee, ues: toute ? null : [...choix], date };
  useEffect(() => {
    if (!toute && !choix.size) { setA(null); return; }
    let vivant = true; setErreur(null);
    api(`/etudiant/${etudId}/apercu`, corps).then(x => vivant && setA(x)).catch(e => { if (vivant) { setA(null); setErreur(e.message); } });
    return () => { vivant = false; };
  }, [toute, choix, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const valider = async () => {
    setEnCours(true); setErreur(null);
    try {
      const d = await api(`/etudiant/${etudId}/demande`, { ...corps, motif });
      await api(`/${d.id}/confirmer`, {});
      onFait();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  return (
    <Fenetre icone={IconUserMinus} titre="Désinscrire" sous={`Année ${annee} · RDE art. 19`} large="moyenne" ton="alerte" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-second text-slate-500 flex-1 min-w-0">{!a ? 'Choisissez ce qui est désinscrit.' : 'Les unités quittent le programme ; les frais suivent le calcul ci-dessus.'}</span>
        <button type="button" className="bouton" onClick={onFermer}>Annuler</button>
        <button type="button" className="bouton bouton-detruire" disabled={!a || enCours} onClick={valider}>{enCours ? 'Désinscription…' : 'Désinscrire'}</button>
      </div>}>
      <div className="space-y-3 text-sm">
        <div className="segments">
          <button type="button" className={toute ? 'actif' : ''} aria-pressed={toute} onClick={() => setToute(true)}>Toute l’année</button>
          <button type="button" className={!toute ? 'actif' : ''} aria-pressed={!toute} onClick={() => setToute(false)}>Des unités</button>
        </div>
        {!toute && <div className="flex flex-wrap gap-x-4 gap-y-1">{ues.map(u => (
          <label key={u.ue_num} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={choix.has(u.ue_num)}
            onChange={() => setChoix(c => { const n = new Set(c); n.has(u.ue_num) ? n.delete(u.ue_num) : n.add(u.ue_num); return n; })} />UE {u.ue_num}</label>))}</div>}
        <label className="flex items-center gap-2"><span className="text-slate-600">Date de la demande (reçue au secrétariat)</span>
          <input type="date" className="controle" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="block"><span className="text-slate-600">Motif (facultatif)</span>
          <input className="controle w-full mt-1" value={motif} onChange={e => setMotif(e.target.value)} /></label>
        {erreur && <Encadre etat="corriger" titre={erreur} />}
        {a && <Calcul a={a} />}
      </div>
    </Fenetre>);
}

export default function Desinscription({ etudId, annee, ues = [], onChange }) {
  const [l, setL] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [voir, setVoir] = useState(null);
  const charger = useCallback(() => {
    api(`/etudiant/${etudId}`).then(j => setL(j.demandes || [])).catch(() => setL([]));
  }, [etudId]);
  useEffect(() => { charger(); }, [charger]);
  const fait = () => { setOuvert(false); setVoir(null); charger(); onChange?.(); };
  const ouvrirDemande = async d => {
    try { setVoir({ d, a: await api(`/etudiant/${etudId}/apercu`, { annee: d.annee_scolaire, ues: d.portee === 'annee' ? null : d.ues, date: d.demande_le }) }); }
    catch (e) { setVoir({ d, erreur: e.message }); }
  };
  const refuser = async d => {
    const motif = await saisir({ titre: 'Refuser la demande de désinscription', obligatoire: true, message: 'Pourquoi ?' });
    if (!String(motif || '').trim()) return;
    await api(`/${d.id}/refuser`, { motif }).catch(() => {}); fait();
  };
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Désinscription" sous="RDE art. 19 — la date de la demande fait foi">
        <button type="button" className="bouton" onClick={() => setOuvert(true)}><IconUserMinus size={15} /> Désinscrire…</button>
      </EnteteCarte>
      {l.length > 0 && (
        <ListeEtats className="!border-0 !rounded-none">
          {l.map(d => (
            <LigneEtat key={d.id} etat={d.statut === 'demandee' ? 'surveiller' : d.statut === 'confirmee' ? 'neutre' : 'indisponible'}
              titre={`${d.portee === 'annee' ? 'Toute l’année' : `UE ${d.ues.join(', ')}`} · demandée le ${fr(d.demande_le)}${d.source === 'en_ligne' ? ' (en ligne)' : ''}`}
              sous={d.statut === 'confirmee' ? `Confirmée le ${fr(d.confirme_le)} par ${d.confirme_par || '—'} · restent dus ${eur(d.du)} · à rembourser ${eur(d.rembourse)}`
                : d.statut === 'refusee' ? `Refusée : ${d.refus_motif || ''}` : (d.motif || 'À confirmer')}
              droite={d.statut === 'demandee' ? <span className="flex gap-2">
                <button type="button" className="bouton" onClick={() => ouvrirDemande(d)}>Voir et confirmer</button>
                <button type="button" className="bouton" onClick={() => refuser(d)}>Refuser</button></span>
                : <PastilleEtat etat={d.statut === 'confirmee' ? 'neutre' : 'indisponible'}>{d.statut === 'confirmee' ? 'désinscrit' : 'refusée'}</PastilleEtat>} />))}
        </ListeEtats>)}
      {ouvert && <FenetreDesinscrire etudId={etudId} annee={annee} ues={ues} onFermer={() => setOuvert(false)} onFait={fait} />}
      {voir && (
        <Fenetre icone={IconUserMinus} titre="Demande de désinscription" sous={`demandée le ${fr(voir.d.demande_le)}`} large="moyenne" ton="alerte" onFermer={() => setVoir(null)}
          pied={<div className="flex items-center gap-2 w-full justify-end">
            <button type="button" className="bouton" onClick={() => setVoir(null)}><IconX size={14} /> Fermer</button>
            <button type="button" className="bouton bouton-detruire" disabled={!voir.a}
              onClick={async () => { try { await api(`/${voir.d.id}/confirmer`, {}); fait(); } catch (e) { setVoir(v => ({ ...v, erreur: e.message })); } }}>
              <IconCheck size={14} /> Confirmer la désinscription</button></div>}>
          {voir.erreur && <Encadre etat="corriger" titre={voir.erreur} />}
          {voir.a && <Calcul a={voir.a} />}
        </Fenetre>)}
    </section>);
}

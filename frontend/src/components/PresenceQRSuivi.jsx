/**
 * LE SUIVI DE LA PRÉSENCE PAR QR, CÔTÉ SECRÉTARIAT (lot 4, 28 octobre 2026).
 *
 * Trois faces dans une seule fenêtre (rail Étudiants → Inscrire) :
 *  - les TÉLÉPHONES liés : qui, quel appareil, depuis quand, dernier scan ; les
 *    deux gestes du secrétariat — désactiver un téléphone (perdu, prêté, changé)
 *    et autoriser un nouveau téléphone au-delà de la limite de la semaine.
 *    Chaque geste se motive et s'écrit au journal au nom de la personne connectée ;
 *  - le JOURNAL, en ajout seul : liens, refus, désactivations, autorisations ;
 *  - les RÉGLAGES : durée du QR, fenêtre de scan, limite, domaines d'adresse.
 *    Lus par le secrétariat, changés par la direction.
 * Serveur : `routes/presenceQrSuivi.js`, métier dans `lib/presenceQr.js`.
 */
import { useEffect, useState } from 'react';
import { IconQrcode, IconSearch, IconDeviceMobileOff, IconDeviceMobilePlus } from '@tabler/icons-react';
import OutilsAFaces from './OutilsAFaces.jsx';
import { PastilleEtat } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { saisir, informer } from '../lib/dialogue.jsx';
import { useDroits } from '../lib/droits.js';

const API = '/api/presence-qr-suivi';
const fr = d => (d ? new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const nom = x => `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim();
async function appel(chemin, options = {}) {
  const r = await fetch(API + chemin, { ...options, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

const ETATS = { actif: ['reussi', 'actif'], expire: ['indisponible', 'expiré'], desactive: ['corriger', 'désactivé'] };

function Telephones() {
  const [q, setQ] = useState('');
  const [tous, setTous] = useState(false);
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = () => appel(`/appareils?q=${encodeURIComponent(q)}${tous ? '&tous=1' : ''}`)
    .then(j => { setListe(j.appareils); setErreur(null); }).catch(e => setErreur(e.message));
  useEffect(() => { const t = setTimeout(charger, 250); return () => clearTimeout(t); }, [q, tous]); // eslint-disable-line

  const desactiver = async a => {
    const motif = await saisir({ titre: `Désactiver le téléphone de ${nom(a)}`,
      message: 'Pourquoi ? (téléphone perdu, prêté, changé…) — le motif est gardé au journal.' });
    if (motif == null) return;
    try { await appel(`/appareils/${a.id}/desactiver`, { method: 'POST', body: JSON.stringify({ motif }) }); charger(); }
    catch (e) { informer(`❌ ${e.message}`); }
  };
  const autoriser = async a => {
    const motif = await saisir({ titre: `Autoriser un nouveau téléphone pour ${nom(a)}`,
      message: 'L’étudiant pourra lier UN nouveau téléphone, même s’il en a déjà lié un cette semaine. Pourquoi ?' });
    if (motif == null) return;
    try {
      await appel(`/etudiants/${a.etudiant_id}/autoriser`, { method: 'POST', body: JSON.stringify({ motif }) });
      informer(`✓ ${nom(a)} peut lier un nouveau téléphone : il scanne le QR en classe et suit les étapes habituelles.`);
    } catch (e) { informer(`❌ ${e.message}`); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, matricule ou adresse"
            className="controle controle-icone border border-slate-300 rounded-champ bg-white w-72" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-second text-slate-600">
          <input type="checkbox" checked={tous} onChange={e => setTous(e.target.checked)} />
          Montrer aussi les anciens téléphones
        </label>
        {liste && <span className="text-second text-slate-500 ml-auto">{liste.length} téléphone(s)</span>}
      </div>
      {erreur && <p className="text-sm" style={{ color: 'var(--c-corriger)' }}>{erreur}</p>}
      {liste && !liste.length && (
        <p className="text-sm text-slate-500">Aucun téléphone lié{q ? ' pour cette recherche' : ''}. Un téléphone se lie la première fois qu’un étudiant scanne le QR en classe.</p>
      )}
      {!!liste?.length && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="tab-entete text-left">
              <th className="px-2 py-1.5">Étudiant</th><th className="px-2 py-1.5">Téléphone</th>
              <th className="px-2 py-1.5">Lié le</th><th className="px-2 py-1.5">Dernier scan</th>
              <th className="px-2 py-1.5 text-right">Présences par QR</th><th className="px-2 py-1.5">État</th><th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>
              {liste.map(a => (
                <tr key={a.id} className="border-b border-slate-100 align-top">
                  <td className="px-2 py-1.5"><b>{String(a.nom || '').toUpperCase()}</b> {a.prenom}
                    <div className="text-second text-slate-500">{[a.id_ecampus, a.email_ecole].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-2 py-1.5">{a.appareil || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fr(a.cree_le)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fr(a.dernier_usage_le)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.scans}</td>
                  <td className="px-2 py-1.5">
                    <PastilleEtat etat={ETATS[a.etat]?.[0]}>{ETATS[a.etat]?.[1]}</PastilleEtat>
                    {a.revoque_le && <div className="text-second text-slate-500 mt-0.5">{fr(a.revoque_le)} · {a.revoque_par} — {a.revoque_motif}</div>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    {a.etat === 'actif' && (
                      <button type="button" className="bouton" onClick={() => desactiver(a)} title="Désactiver ce téléphone (motif demandé)">
                        <IconDeviceMobileOff size={15} /> Désactiver</button>)}
                    {' '}
                    <button type="button" className="bouton" onClick={() => autoriser(a)}
                      title="Lever la limite d'un changement par semaine, pour le prochain téléphone lié">
                      <IconDeviceMobilePlus size={15} /> Autoriser un nouveau</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Journal() {
  const [type, setType] = useState('');
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    appel(`/journal${type ? `?type=${type}` : ''}`).then(j => { setD(j); setErreur(null); }).catch(e => setErreur(e.message));
  }, [type]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={type} onChange={e => setType(e.target.value)} className="controle border border-slate-300 rounded-champ bg-white">
          <option value="">Tous les événements</option>
          {Object.entries(d?.types || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="text-second text-slate-500">Le journal ne se modifie ni ne s’efface : il garde chaque geste et chaque refus.</span>
      </div>
      {erreur && <p className="text-sm" style={{ color: 'var(--c-corriger)' }}>{erreur}</p>}
      {d && !d.journal.length && <p className="text-sm text-slate-500">Rien au journal pour l’instant.</p>}
      {!!d?.journal.length && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="tab-entete text-left">
              <th className="px-2 py-1.5">Quand</th><th className="px-2 py-1.5">Événement</th><th className="px-2 py-1.5">Étudiant</th>
              <th className="px-2 py-1.5">Séance</th><th className="px-2 py-1.5">Détail</th><th className="px-2 py-1.5">Par</th>
            </tr></thead>
            <tbody>
              {d.journal.map(x => (
                <tr key={x.id} className="border-b border-slate-100 align-top">
                  <td className="px-2 py-1.5 whitespace-nowrap">{fr(x.le)}</td>
                  <td className="px-2 py-1.5">{x.libelle}</td>
                  <td className="px-2 py-1.5">{x.nom ? <><b>{String(x.nom).toUpperCase()}</b> {x.prenom}</> : '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{x.seance || '—'}</td>
                  <td className="px-2 py-1.5">{x.raison || '—'}</td>
                  <td className="px-2 py-1.5">{x.par || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CHAMPS = [
  ['rotation_s', 'Le QR change toutes les', 'secondes'],
  ['validite_s', 'Un QR scanné reste valable', 'secondes (marge réseau)'],
  ['avant_min', 'Le scan s’ouvre', 'minutes avant le début du cours'],
  ['apres_min', 'et se ferme', 'minutes après le début'],
  ['appairages_semaine', 'Téléphones qu’un étudiant peut lier par semaine', ''],
];

function Reglages() {
  const droits = useDroits();
  const modifiable = droits.passe('admin');
  const [d, setD] = useState(null);
  const [v, setV] = useState({});
  const [message, setMessage] = useState(null);
  const charger = () => appel('/reglages').then(j => {
    setD(j); setV({ ...j.reglages, domaines: j.reglages.domaines.join(', ') });
  }).catch(e => setMessage({ ko: true, t: e.message }));
  useEffect(() => { charger(); }, []);
  const enregistrer = async () => {
    setMessage(null);
    try {
      await appel('/reglages', { method: 'PUT', body: JSON.stringify(v) });
      setMessage({ t: 'Réglages enregistrés. Ils valent dès le prochain QR projeté.' }); charger();
    } catch (e) { setMessage({ ko: true, t: e.message }); }
  };
  if (!d) return message ? <p className="text-sm">{message.t}</p> : <p className="text-sm text-slate-400">Chargement…</p>;
  return (
    <div className="space-y-4 max-w-5xl">
      {!d.secret && (
        <p className="text-sm" style={{ color: 'var(--c-corriger)' }}>
          La clé qui signe les QR n’est pas posée sur ce serveur : la présence par QR est indisponible. À régler par le technicien (variable PRESENCE_QR_SECRET, ou JWT_SECRET).
        </p>
      )}
      <div className="grid gap-2.5">
        {CHAMPS.map(([k, avant, apres]) => (
          <label key={k} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-80">{avant}</span>
            <input type="number" min={d.bornes[k][0]} max={d.bornes[k][1]} value={v[k] ?? ''} disabled={!modifiable}
              onChange={e => setV(x => ({ ...x, [k]: e.target.value }))}
              className="controle w-24 border border-slate-300 rounded-champ bg-white text-right" />
            <span className="text-slate-500">{apres}</span>
            <span className="text-second text-slate-400">(défaut {d.defauts[k]} · de {d.bornes[k][0]} à {d.bornes[k][1]})</span>
          </label>
        ))}
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-80">Adresses d’école acceptées (domaines)</span>
          <input value={v.domaines ?? ''} disabled={!modifiable} onChange={e => setV(x => ({ ...x, domaines: e.target.value }))}
            className="controle flex-1 min-w-[16rem] border border-slate-300 rounded-champ bg-white" />
        </label>
      </div>
      {modifiable
        ? <div className="flex items-center gap-3"><button type="button" className="bouton bouton-fort" onClick={enregistrer}>Enregistrer</button>
            {message && <span className="text-sm" style={message.ko ? { color: 'var(--c-corriger)' } : undefined}>{message.t}</span>}</div>
        : <p className="text-second text-slate-500">Ces réglages se changent à la direction.</p>}
    </div>
  );
}

export default function PresenceQRSuivi({ faceInitiale = 'telephones', onFermer }) {
  return (
    <OutilsAFaces icone={IconQrcode} titre="Présence par QR"
      sous="Les téléphones liés, le journal, les réglages"
      faceInitiale={faceInitiale} onFermer={onFermer}
      faces={[
        { cle: 'telephones', label: 'Téléphones liés', rendu: <Telephones /> },
        { cle: 'journal', label: 'Journal', rendu: <Journal /> },
        { cle: 'reglages', label: 'Réglages', rendu: <Reglages /> },
      ]} />
  );
}

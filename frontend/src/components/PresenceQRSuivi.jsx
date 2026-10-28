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
import { IconQrcode, IconSearch, IconDeviceMobileOff, IconDeviceMobilePlus, IconMailForward } from '@tabler/icons-react';
import OutilsAFaces from './OutilsAFaces.jsx';
import { PastilleEtat } from './ui.jsx';
import { authHeaders, getAnnee } from '../lib/api.js';
import { saisir, informer, demander } from '../lib/dialogue.jsx';
import { useDroits } from '../lib/droits.js';

const API = '/api/presence-qr-suivi';
const fr = d => (d ? new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const nom = x => `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`.trim();
const hm = m => { const x = Math.round(m || 0); return `${Math.floor(x / 60)}h${String(x % 60).padStart(2, '0')}`; };
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

/* LES ABSENCES AU-DELÀ DU SEUIL : qui, dans quelle UE, combien ; l'avis à
   l'étudiant se lit avant de partir, et rien ne part sans ce clic. */
function Absences() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState('');
  const annee = getAnnee();
  const charger = () => appel(`/alertes?annee=${encodeURIComponent(annee)}`).then(j => { setD(j); setErreur(null); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []); // eslint-disable-line
  const prevenir = async a => {
    try {
      const m = await appel(`/alertes/avis?etudiant=${a.etudiant_id}&ue=${a.ue_num}&annee=${encodeURIComponent(annee)}`);
      const ok = await demander({ titre: `Prévenir ${nom(a)} ?`, confirmer: 'Envoyer',
        message: `${m.mention_manquante ? 'La mention réglementaire du seuil global n’est pas rédigée (Réglages) : l’avis partira sans elle.\n\n' : ''}À : ${m.to}\nObjet : ${m.subject}\n\n${m.text}` });
      if (!ok) return;
      await appel('/alertes/avis', { method: 'POST', body: JSON.stringify({ etudiant: a.etudiant_id, ue: a.ue_num, annee }) });
      informer(`✓ Avis envoyé à ${m.to}.`); charger();
    } catch (e) { informer(`❌ ${e.message}`); }
  };
  const n = filtre.trim().toLowerCase();
  const liste = (d?.alertes || []).filter(a => !n || `${a.nom} ${a.prenom} ${a.id_ecampus || ''} ${a.ue_num} ${a.ue_nom}`.toLowerCase().includes(n));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filtre} onChange={e => setFiltre(e.target.value)} placeholder="Nom, matricule ou UE"
            className="controle controle-icone border border-slate-300 rounded-champ bg-white w-72" />
        </div>
        {d && <span className="text-second text-slate-500">Seuils : <b>{d.seuil} %</b> d’absences sans justificatif, <b>{d.seuil_global} %</b> {d.base_globale === 'injustifiees' ? 'd’absences sans motif valable (condition d’assiduité)' : 'de toutes les absences'} — sur les heures tenues ({annee}), réglables dans Réglages.</span>}
        {d && <span className="text-second text-slate-500 ml-auto">{liste.length} situation(s)</span>}
      </div>
      {erreur && <p className="text-sm" style={{ color: 'var(--c-corriger)' }}>{erreur}</p>}
      {d && d.mention_proposee && d.alertes.some(a => a.depasse_global) && (
        <p className="text-sm" style={{ color: 'var(--c-surveiller)' }}>
          La mention du seuil de {d.seuil_global} % est le texte proposé par Lucie : à vérifier sur le décret et le règlement des études (Réglages, par la direction).</p>
      )}
      {d && !d.mention_global && d.alertes.some(a => a.depasse_global) && (
        <p className="text-sm" style={{ color: 'var(--c-surveiller)' }}>
          La mention réglementaire du seuil de {d.seuil_global} % n’est pas encore rédigée (Réglages, par la direction) : les avis partent sans elle.</p>
      )}
      {!d && !erreur && <p className="text-sm text-slate-400">Calcul des présences de toutes les unités…</p>}
      {d && !liste.length && <p className="text-sm text-slate-500">Aucun étudiant au-delà du seuil{n ? ' pour cette recherche' : ''}.</p>}
      {!!liste.length && (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="tab-entete text-left">
              <th className="px-2 py-1.5">Étudiant</th><th className="px-2 py-1.5">Unité</th>
              <th className="px-2 py-1.5 text-right">Sans justificatif</th><th className="px-2 py-1.5 text-right">{d?.base_globale === 'injustifiees' ? `Seuil de ${d?.seuil_global} %` : 'Toutes absences'}</th><th className="px-2 py-1.5 text-right">Heures</th>
              <th className="px-2 py-1.5">Prévenu</th><th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>
              {liste.map(a => (
                <tr key={`${a.etudiant_id}-${a.ue_num}`} className="border-b border-slate-100 align-top">
                  <td className="px-2 py-1.5"><b>{String(a.nom || '').toUpperCase()}</b> {a.prenom}
                    <div className="text-second text-slate-500">{a.id_ecampus || ''}</div></td>
                  <td className="px-2 py-1.5">UE {a.ue_num}<div className="text-second text-slate-500">{a.ue_nom}</div></td>
                  <td className="px-2 py-1.5 text-right">
                    {a.taux > d.seuil ? <PastilleEtat etat="surveiller">{String(a.taux).replace('.', ',')} %</PastilleEtat>
                      : <span className="tabular-nums">{String(a.taux).replace('.', ',')} %</span>}
                    <div className="text-second text-slate-500">{a.absences} séance(s)</div></td>
                  <td className="px-2 py-1.5 text-right">
                    {a.depasse_global ? <PastilleEtat etat="corriger">{String(a.taux_total).replace('.', ',')} %</PastilleEtat>
                      : <span className="tabular-nums">{String(a.taux_total).replace('.', ',')} %</span>}
                    {a.depasse_global && <div className="text-second" style={{ color: 'var(--c-corriger)' }}>au-delà de {d.seuil_global} %</div>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{hm(a.absent_min + (a.justifie_min || 0))} / {hm(a.du_min)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{a.prevenu_le ? fr(a.prevenu_le) : '—'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" className="bouton bouton-sortir" onClick={() => prevenir(a)} title="Lire l’avis, puis l’envoyer à l’adresse d’école">
                      <IconMailForward size={15} /> Prévenir l’étudiant</button>
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

const CHAMPS = [
  ['rotation_s', 'Le QR change toutes les', 'secondes'],
  ['validite_s', 'Un QR scanné reste valable', 'secondes (marge réseau)'],
  ['avant_min', 'Le scan s’ouvre', 'minutes avant le début du cours'],
  ['apres_min', 'et se ferme', 'minutes après le début'],
  ['appairages_semaine', 'Téléphones qu’un étudiant peut lier par semaine', ''],
  ['seuil_absence_pct', 'Signaler un étudiant au-delà de', '% d’absences sans justificatif'],
  ['seuil_global_pct', 'et au-delà de', '% (second seuil, ci-dessous)'],
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
          <span className="w-80">Le second seuil se compte sur</span>
          <select value={v.seuil_global_base || 'toutes'} disabled={!modifiable}
            onChange={e => setV(x => ({ ...x, seuil_global_base: e.target.value }))}
            className="controle border border-slate-300 rounded-champ bg-white">
            <option value="toutes">toutes les absences (justifiées comprises)</option>
            <option value="injustifiees">les absences sans motif valable</option>
          </select>
        </label>
        <label className="flex flex-wrap items-start gap-2 text-sm">
          <span className="w-80 pt-1.5">Mention réglementaire au-delà du second seuil
            <span className="block text-second text-slate-400">Reprise telle quelle dans l’avis à l’étudiant (RGE / ROI). Vide : l’avis s’en passe.</span></span>
          <textarea rows={3} maxLength={800} value={v.mention_seuil_global ?? ''} disabled={!modifiable} data-reponses="mention-seuil-absences"
            onChange={e => setV(x => ({ ...x, mention_seuil_global: e.target.value }))}
            className="flex-1 min-w-[16rem] border border-slate-300 rounded-champ bg-white px-2 py-1.5" />
        </label>
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

export default function PresenceQRSuivi({ faceInitiale = 'absences', onFermer }) {
  return (
    <OutilsAFaces icone={IconQrcode} titre="Suivi des présences"
      sous="Les absences au-delà du seuil, les téléphones liés au QR, le journal, les réglages"
      faceInitiale={faceInitiale} onFermer={onFermer}
      faces={[
        { cle: 'absences', label: 'Absences au-delà du seuil', rendu: <Absences /> },
        { cle: 'telephones', label: 'Téléphones liés', rendu: <Telephones /> },
        { cle: 'journal', label: 'Journal', rendu: <Journal /> },
        { cle: 'reglages', label: 'Réglages', rendu: <Reglages /> },
      ]} />
  );
}

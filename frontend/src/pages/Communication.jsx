import { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconEraser, IconMail, IconSend, IconSpeakerphone, IconTrash, IconUser, IconUserOff, IconX } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { Fenetre } from '../components/ui.jsx';
import ChoixRecherche from '../components/ChoixRecherche.jsx';

/**
 * LA COMMUNICATION (3.1.278, Charles, 10 octobre 2026 : « envoyer des notifications sur le
 * tableau de bord de tous, d'une partie, d'une section… selon les droits, avec copie par
 * courriel éventuellement — à terme, supprimer les courriels pour les infos » ; « à des
 * groupes : les profs d'une UE, d'une section » ; « quand c'est lu, un petit v vert »).
 * Écrire, choisir les groupes (ils s'additionnent), VOIR qui recevra, envoyer. Le
 * registre dit qui a lu (✓ vert) et permet de retirer un message envoyé par erreur.
 */
const heure = s => { const d = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const VERT = 'var(--c-reussi)';

function Puce({ children, onRetirer }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pastille text-second border border-slate-300">
      {children}
      <button type="button" aria-label="Retirer" onClick={onRetirer} className="text-slate-400 hover:text-slate-700"><IconX size={12} /></button>
    </span>
  );
}

export default function Communication() {
  const annee = getAnnee();
  const [c, setC] = useState(null);                 // cibles
  const [titre, setTitre] = useState('');
  const [texte, setTexte] = useState('');
  const [crit, setCrit] = useState({ tous: false, sections: [], ues: [], roles: [], professeurs: [], utilisateurs: [] });
  const [courriel, setCourriel] = useState(false);
  const [apercu, setApercu] = useState(null);
  const [voirListe, setVoirListe] = useState(false);
  const [envois, setEnvois] = useState([]);
  const [detail, setDetail] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const chargerEnvois = () => fetch('/api/communication/envoyes', { headers: authHeaders() }).then(r => r.ok ? r.json() : []).then(setEnvois).catch(() => {});
  useEffect(() => {
    fetch(`/api/communication/cibles?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => r.json()).then(setC).catch(() => setC({ erreur: true }));
    chargerEnvois();
  }, [annee]);

  // L'aperçu se recalcule à chaque changement de groupes : on voit avant d'envoyer.
  const vide = !crit.tous && !crit.sections.length && !crit.ues.length && !crit.roles.length && !crit.professeurs.length && !crit.utilisateurs.length;
  useEffect(() => {
    if (vide) { setApercu(null); return; }
    const t = setTimeout(() => fetch('/api/communication/apercu', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ critere: crit, annee }) })
      .then(r => r.json()).then(setApercu).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [crit, annee, vide]);

  const basculer = (k, v) => setCrit(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] }));
  const ajouter = (k, v) => v && setCrit(x => (x[k].includes(v) ? x : { ...x, [k]: [...x[k], v] }));

  const optionsUE = useMemo(() => (c?.ues || []).map(u => ({ valeur: u.ue_num, libelle: u.ue_nom || `UE ${u.ue_num}`, detail: u.section })), [c]);
  const optionsPers = useMemo(() => (c?.personnes || []).map(p => ({ valeur: p.professeur_id ? `p${p.professeur_id}` : `u${p.utilisateur_id}`, libelle: p.nom, detail: p.compte ? 'compte Lucie' : 'sans compte' })), [c]);
  const nomPers = v => (c?.personnes || []).find(p => (p.professeur_id ? `p${p.professeur_id}` : `u${p.utilisateur_id}`) === v)?.nom || v;

  async function envoyer() {
    if (!titre.trim() || !texte.trim() || !apercu?.nb) return;
    if (!(await demander({ titre: 'Envoyer le message', message: `« ${titre} » à ${apercu.nb} personne(s) — ${apercu.resume}.${courriel ? '\n\nUne copie part aussi par courriel.' : ''}`, confirmer: 'Envoyer' }))) return;
    setEnCours(true);
    const r = await fetch('/api/communication', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ titre, texte, critere: crit, canal_email: courriel, annee }) });
    const j = await r.json().catch(() => ({}));
    setEnCours(false);
    if (!r.ok) { await informer(`❌ ${j.error || 'Envoi impossible'}`); return; }
    await informer(`✓ Envoyé à ${j.nb} personne(s). Le message est sur leur tableau de bord.`);
    setTitre(''); setTexte(''); setCrit({ tous: false, sections: [], ues: [], roles: [], professeurs: [], utilisateurs: [] }); setCourriel(false);
    chargerEnvois();
  }
  /* LE MÉNAGE (3.1.279) : mêmes groupes que l'envoi ; on dit combien de comptes, puis on vide. */
  async function vider() {
    const corps = { critere: crit, annee };
    const sim = await fetch('/api/communication/vider', { method: 'POST', headers: authHeaders(), body: JSON.stringify(corps) }).then(r => r.json()).catch(() => ({}));
    if (!sim.comptes) { await informer('Aucun compte Lucie parmi ces destinataires : rien à vider.'); return; }
    if (!(await demander({ titre: 'Vider les tableaux de bord', message: `Les notifications reçues jusqu’à maintenant quittent le tableau de bord de ${sim.comptes} compte(s). Les messages de la Communication et les vœux restent. Rien n’est effacé de Lucie.`, confirmer: 'Vider' }))) return;
    const r = await fetch('/api/communication/vider', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: false }) });
    const j = await r.json().catch(() => ({}));
    await informer(r.ok ? `✓ ${j.comptes} tableau(x) de bord vidé(s).` : `❌ ${j.error || 'Impossible'}`);
  }
  async function ouvrir(id) {
    const r = await fetch(`/api/communication/${id}`, { headers: authHeaders() });
    setDetail(r.ok ? await r.json() : null);
  }
  async function retirer(m) {
    if (!(await demander({ titre: 'Retirer ce message', message: `« ${m.titre} » quitte les tableaux de bord de ses destinataires. Il reste au registre. Un courriel déjà parti ne se rappelle pas.`, confirmer: 'Retirer' }))) return;
    await fetch(`/api/communication/${m.id}/retirer`, { method: 'POST', headers: authHeaders() });
    setDetail(null); chargerEnvois();
  }

  if (!c) return <div className="p-5 text-sm text-slate-400">Chargement…</div>;
  if (c.erreur || c.error) return <div className="p-5 text-sm text-slate-500">{c.error || 'L’envoi de messages est réservé à la direction, au secrétariat et aux coordinations.'}</div>;

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="titre-ecran mb-0 flex items-center gap-2"><IconSpeakerphone size={20} /> Communication</h2>
        <p className="text-sm text-slate-500">Un message sur le tableau de bord des personnes choisies ; le courriel n’est qu’une copie, si vous la cochez.{!c.toutes_sections && ' Vous écrivez aux personnes de vos sections.'}</p>
      </div>

      <div className="carte p-4 space-y-3">
        <label className="block">
          <span className="intertitre block mb-1">Titre</span>
          <input value={titre} onChange={e => setTitre(e.target.value)} maxLength={200} className="controle w-full" placeholder="Ex. : Rentrée des enseignants — lundi 12 octobre" data-reponses="non" />
        </label>
        <label className="block">
          <span className="intertitre block mb-1">Message</span>
          <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={7} data-reponses="communication"
            className="w-full border border-slate-300 rounded-champ px-3 py-2 text-sm" placeholder="Une ligne vide sépare deux paragraphes." />
        </label>

        <div className="space-y-2">
          <span className="intertitre block">Destinataires — les groupes s’additionnent</span>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={crit.tous} onChange={e => setCrit(x => ({ ...x, tous: e.target.checked }))} />
            {c.toutes_sections ? 'Tout le personnel de l’année (enseignants attribués et comptes Lucie)' : 'Toutes les personnes de mes sections'}</label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-second text-slate-600 mr-1">Sections :</span>
            {c.sections.map(s => (
              <button key={s} type="button" onClick={() => basculer('sections', s)} aria-pressed={crit.sections.includes(s)}
                className={`px-2 py-0.5 rounded-pastille text-second border ${crit.sections.includes(s) ? 'bg-iip-blue text-white border-iip-blue' : 'border-slate-300 text-slate-600'}`}>{s}</button>))}
          </div>
          {Object.keys(c.roles || {}).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-second text-slate-600 mr-1">Rôles :</span>
              {Object.entries(c.roles).map(([k, l]) => (
                <button key={k} type="button" onClick={() => basculer('roles', k)} aria-pressed={crit.roles.includes(k)}
                  className={`px-2 py-0.5 rounded-pastille text-second border ${crit.roles.includes(k) ? 'bg-iip-blue text-white border-iip-blue' : 'border-slate-300 text-slate-600'}`}>{l}</button>))}
            </div>)}
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-second text-slate-600">Les enseignants d’une UE :</span>
              <ChoixRecherche options={optionsUE} valeur="" vide="Ajouter une UE…" placeholder="Numéro ou nom de l’UE" onChange={v => ajouter('ues', Number(v))} />
              <div className="flex flex-wrap gap-1">{crit.ues.map(u => <Puce key={u} onRetirer={() => basculer('ues', u)}>UE {u}</Puce>)}</div>
            </div>
            <div className="space-y-1">
              <span className="text-second text-slate-600">Des personnes :</span>
              <ChoixRecherche options={optionsPers} valeur="" vide="Ajouter une personne…" placeholder="Nom" onChange={v => v && ajouter(v[0] === 'p' ? 'professeurs' : 'utilisateurs', Number(String(v).slice(1)))} />
              <div className="flex flex-wrap gap-1">
                {crit.professeurs.map(id => <Puce key={`p${id}`} onRetirer={() => basculer('professeurs', id)}>{nomPers(`p${id}`)}</Puce>)}
                {crit.utilisateurs.map(id => <Puce key={`u${id}`} onRetirer={() => basculer('utilisateurs', id)}>{nomPers(`u${id}`)}</Puce>)}
              </div>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={courriel} onChange={e => setCourriel(e.target.checked)} />
          <IconMail size={15} className="text-slate-500" /> Envoyer aussi une copie par courriel</label>

        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-slate-200">
          <span className="text-second text-slate-600 min-w-0 flex-1">
            {vide ? 'Choisissez au moins un groupe.' : !apercu ? 'Calcul des destinataires…'
              : <>{apercu.nb} personne{apercu.nb > 1 ? 's' : ''} — {apercu.resume}
                  {apercu.sans_compte > 0 && <> · <b>{apercu.sans_compte}</b> sans compte Lucie (le message les attendra{courriel ? ', le courriel les prévient' : ''})</>}
                  {' '}<button type="button" className="underline" onClick={() => setVoirListe(true)}>voir la liste</button></>}
          </span>
          <button className="bouton" disabled={vide || !apercu?.nb} onClick={vider}
            title="Pour ces mêmes personnes : retirer de leur tableau de bord les notifications reçues jusqu'ici (rappels, notes encodées…). Les messages et les vœux restent.">
            <IconEraser size={15} className="inline -mt-0.5 mr-1" />Vider leurs tableaux de bord</button>
          <button className="bouton bouton-fort" disabled={enCours || !titre.trim() || !texte.trim() || !apercu?.nb} onClick={envoyer}>
            <IconSend size={15} className="inline -mt-0.5 mr-1" />{enCours ? 'Envoi…' : 'Envoyer'}</button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="intertitre">Messages envoyés</div>
        {!envois.length ? <p className="text-sm text-slate-500">Aucun message envoyé pour l’instant.</p>
          : <div className="carte overflow-hidden">
              {envois.map(m => (
                <button key={m.id} type="button" onClick={() => ouvrir(m.id)}
                  className="w-full text-left px-3 py-2 border-t border-slate-100 first:border-t-0 flex items-center gap-3 hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className={`text-sm font-medium ${m.retire_le ? 'line-through text-slate-400' : ''}`}>{m.titre}</span>
                    <span className="block text-mention text-slate-500">{heure(m.envoye_le)} · {m.cree_par} · {m.resume_cible}{m.canal_email ? ' · copie courriel' : ''}{m.retire_le ? ` · retiré par ${m.retire_par}` : ''}</span>
                  </span>
                  <span className="text-second tabular-nums whitespace-nowrap flex items-center gap-1" style={{ color: m.lus === m.nb ? VERT : undefined }}>
                    <IconCheck size={14} style={{ color: VERT }} /> {m.lus}/{m.nb} lu{m.lus > 1 ? 's' : ''}
                  </span>
                </button>))}
            </div>}
      </div>

      {voirListe && apercu && (
        <Fenetre titre={`Destinataires (${apercu.nb})`} sous={apercu.resume} onFermer={() => setVoirListe(false)}
          pied={<button className="bouton bouton-fort" onClick={() => setVoirListe(false)}>Fermer</button>}>
          <ul className="text-sm divide-y divide-slate-100">
            {apercu.destinataires.map(d => (
              <li key={`${d.professeur_id}-${d.utilisateur_id}`} className="py-1.5 flex items-center gap-2">
                {d.compte ? <IconUser size={14} className="text-slate-500" /> : <IconUserOff size={14} className="text-slate-400" />}
                <span className="flex-1">{d.nom}</span>
                <span className="text-mention text-slate-400">{d.compte ? 'compte Lucie' : 'sans compte'}{d.email ? '' : ' · pas d’adresse'}</span>
              </li>))}
          </ul>
        </Fenetre>)}

      {detail && (
        <Fenetre titre={detail.titre} sous={`${heure(detail.envoye_le)} · ${detail.cree_par} · ${detail.resume_cible || ''}`} large="grande" onFermer={() => setDetail(null)}
          pied={<>
            <span className="text-second text-slate-500 min-w-0 flex-1">{detail.destinataires.filter(d => d.lu_le).length} sur {detail.destinataires.length} ont lu.</span>
            {!detail.retire_le && <button className="bouton bouton-detruire" onClick={() => retirer(detail)}><IconTrash size={14} className="inline -mt-0.5 mr-1" />Retirer</button>}
            <button className="bouton bouton-fort" onClick={() => setDetail(null)}>Fermer</button></>}>
          <div className="texte-corpus text-sm mb-4 border-l-2 border-slate-200 pl-3" dangerouslySetInnerHTML={{ __html: detail.corps_html }} />
          <ul className="text-sm divide-y divide-slate-100">
            {detail.destinataires.map(d => (
              <li key={d.id} className="py-1.5 flex items-center gap-2">
                {d.lu_le ? <IconCheck size={16} stroke={2.5} style={{ color: VERT }} title="Lu" /> : <span className="w-4" />}
                <span className="flex-1">{d.nom}</span>
                <span className="text-mention text-slate-400">
                  {d.lu_le ? `lu le ${heure(d.lu_le)}` : d.compte ? 'pas encore lu' : 'sans compte Lucie'}
                  {d.email_envoye_le ? ' · courriel parti' : d.email_erreur ? ' · courriel en échec' : ''}
                </span>
              </li>))}
          </ul>
        </Fenetre>)}
    </div>
  );
}

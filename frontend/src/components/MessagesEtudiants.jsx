/**
 * LES MESSAGES AUX ÉTUDIANTS (3.1.516, Charles, 30 octobre 2026). Écrire — à des sections, aux inscrits d'UE, à des
 * étudiants choisis, dans son périmètre — après avoir vu QUI recevra ; puis suivre : ✓ lu, et les réponses, qui
 * reviennent à l'auteur (la direction lit tout). Un message se retire, il ne s'efface pas.
 * Serveur : routes/messagesEtudiants.js, lib/messagesEtudiants.js.
 */
import { useCallback, useEffect, useState } from 'react';
import { IconMessages, IconSend, IconCheck, IconChecks, IconX, IconArrowBackUp, IconPaperclip, IconMail, IconTrash } from '@tabler/icons-react';
import { ICONES_MESSAGE, IMPORTANCES_MESSAGE } from '../lib/messages.js';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';

const jour = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const VERT = 'var(--c-reussi)';
const lireFichier = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });
/** Le pictogramme d'un message, dans la couleur de son importance. */
export function Picto({ icone, importance, taille = 18 }) {
  const I = (ICONES_MESSAGE[icone] || ICONES_MESSAGE['porte-voix']).Icone;
  return <I size={taille} style={{ color: (IMPORTANCES_MESSAGE[importance] || IMPORTANCES_MESSAGE.info).couleur }} className="flex-none" />;
}
async function appel(methode, chemin, corps) {
  const r = await fetch(`/api/messages-etudiants${chemin}`, { method: methode,
    headers: { ...authHeaders(), ...(corps ? { 'Content-Type': 'application/json' } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

function Ecrire({ onEnvoye, onErreur }) {
  const [c, setC] = useState(null);
  const [sections, setSections] = useState([]);
  const [ues, setUes] = useState([]);
  const [choisis, setChoisis] = useState([]);
  const [q, setQ] = useState('');
  const [trouves, setTrouves] = useState([]);
  const [apercu, setApercu] = useState(null);
  const [objet, setObjet] = useState('');
  const [corps, setCorps] = useState('');
  const [importance, setImportance] = useState('info');
  const [icone, setIcone] = useState('porte-voix');
  const [accuse, setAccuse] = useState(false);
  const [courriel, setCourriel] = useState(false);
  const [pieces, setPieces] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const joindre = async fichiers => {
    const l = [...pieces];
    for (const f of Array.from(fichiers || [])) {
      if (l.length >= 5) break;
      if (f.size > 10 * 1024 * 1024) { onErreur(new Error(`${f.name} dépasse 10 Mo.`)); continue; }
      l.push({ nom: f.name, contenu: await lireFichier(f) });
    }
    setPieces(l);
  };
  useEffect(() => { appel('GET', '/cibles').then(setC).catch(onErreur); }, [onErreur]);
  useEffect(() => {
    if (q.trim().length < 2) { setTrouves([]); return undefined; }
    const t = setTimeout(() => appel('GET', `/etudiants?q=${encodeURIComponent(q.trim())}`).then(setTrouves).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const critere = { sections, ues, etudiants: choisis.map(e => e.id) };
  const vide = !sections.length && !ues.length && !choisis.length;
  useEffect(() => {
    if (vide) { setApercu(null); return undefined; }
    const t = setTimeout(() => appel('POST', '/apercu', { critere }).then(setApercu).catch(onErreur), 250);
    return () => clearTimeout(t);
  }, [JSON.stringify(critere)]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return <p className="text-sm text-slate-500">Chargement…</p>;
  const bascule = (l, set, v) => set(l.includes(v) ? l.filter(x => x !== v) : [...l, v]);
  const envoyer = async () => {
    if (!(await demander({ titre: 'Envoyer le message', confirmer: 'Envoyer', message: `« ${objet} » (${IMPORTANCES_MESSAGE[importance].libelle.toLowerCase()}) à ${apercu.nb} étudiant${apercu.nb > 1 ? 's' : ''}. Ils le liront dans leur espace.${accuse ? '\n\nUn accusé de lecture est demandé.' : ''}${pieces.length ? `\n\nDocument(s) joint(s) : ${pieces.map(p => p.nom).join(', ')}.` : ''}${courriel ? '\n\nUne copie entière part aussi par courriel, à leur adresse de l’institut.' : '\n\nUn courriel les avertit qu’un message les attend (sans le contenu).'}` }))) return;
    setEnCours(true);
    try { await appel('POST', '/', { objet, corps, critere, importance, icone, accuse_demande: accuse, canal_email: courriel, pieces }); onEnvoye(); } catch (e) { onErreur(e); } finally { setEnCours(false); }
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3 min-w-0">
        <div className="intertitre">À qui ?</div>
        {c.sections.length > 0 && <div className="flex flex-wrap gap-2">
          {c.sections.map(s => <label key={s} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={sections.includes(s)} onChange={() => bascule(sections, setSections, s)} />{s}</label>)}
        </div>}
        {c.ues.length > 0 && <div className="border border-slate-200 rounded-champ max-h-48 overflow-auto divide-y divide-slate-100">
          {c.ues.map(u => <label key={u.ue_num} className="flex items-center gap-2 px-2 py-1 text-second">
            <input type="checkbox" checked={ues.includes(Number(u.ue_num))} onChange={() => bascule(ues, setUes, Number(u.ue_num))} />
            <span className="tabular-nums text-slate-500 w-14">UE {u.ue_num}</span><span className="truncate">{u.ue_nom}</span></label>)}
        </div>}
        <div className="relative">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Un étudiant — nom ou matricule…" className="controle w-full" data-reponses="non" />
          {trouves.length > 0 && <div className="absolute z-10 left-0 right-0 bg-white border border-slate-200 rounded-champ shadow-flottant max-h-56 overflow-auto">
            {trouves.map(e => <button key={e.id} type="button" className="block w-full text-left px-3 py-1.5 text-second hover:bg-slate-50"
              onClick={() => { if (!choisis.some(x => x.id === e.id)) setChoisis([...choisis, e]); setQ(''); }}>{e.nom} <span className="text-slate-400">{e.matricule || ''}</span></button>)}
          </div>}
        </div>
        {choisis.length > 0 && <div className="flex flex-wrap gap-1.5">{choisis.map(e => (
          <span key={e.id} className="inline-flex items-center gap-1 text-second border border-slate-200 rounded-full px-2 py-0.5">{e.nom}
            <button type="button" aria-label="Retirer" onClick={() => setChoisis(choisis.filter(x => x.id !== e.id))}><IconX size={12} /></button></span>))}</div>}
        {apercu && <div className="bloc-etat px-3 py-2 text-second" data-etat="disponible">
          <b>{apercu.nb} étudiant{apercu.nb > 1 ? 's' : ''}</b> recevr{apercu.nb > 1 ? 'ont' : 'a'} ce message ({apercu.resume}).
          {apercu.sans_espace > 0 && <> {apercu.sans_espace} n’ont pas d’espace (pas d’adresse de l’institut ni de code) : ils ne le recevront pas.</>}
          <div className="text-slate-500 mt-1 max-h-24 overflow-auto">{apercu.destinataires.filter(d => d.espace).map(d => d.nom).join(', ')}</div>
        </div>}
      </div>
      <div className="space-y-3 min-w-0">
        <div className="intertitre">Le message</div>
        <input value={objet} onChange={e => setObjet(e.target.value)} placeholder="Objet" className="controle w-full" />
        <textarea value={corps} onChange={e => setCorps(e.target.value)} rows={9} placeholder="Votre message…" className="w-full border border-slate-300 rounded-champ px-3 py-2 text-sm" data-reponses="Message aux étudiants" />
        <div className="space-y-1.5">
          <span className="intertitre block">Documents joints</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {pieces.map((p, i) => <span key={i} className="inline-flex items-center gap-1 text-second border border-slate-200 rounded-full px-2 py-0.5"><IconPaperclip size={12} /> {p.nom}
              <button type="button" aria-label="Retirer" onClick={() => setPieces(x => x.filter((_, j) => j !== i))}><IconX size={12} /></button></span>)}
            {pieces.length < 5 && <label className="bouton cursor-pointer inline-flex items-center gap-1.5"><IconPaperclip size={15} /> Joindre un document
              <input type="file" multiple className="hidden" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.pptx" onChange={e => { joindre(e.target.files); e.target.value = ''; }} /></label>}
          </div>
          <span className="text-second text-slate-500">PDF, image, Word, Excel ou PowerPoint — 5 au plus, 10 Mo chacun. Ils s’ouvrent dans l’espace et partent avec la copie par courriel.</span>
        </div>
        <div>
          <span className="intertitre block mb-1">Importance — la couleur du message</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(IMPORTANCES_MESSAGE).map(([k, v]) => (
              <button key={k} type="button" aria-pressed={importance === k} onClick={() => setImportance(k)}
                className={`px-2.5 py-1 rounded-pastille text-second border ${importance === k ? 'text-white font-semibold' : 'text-slate-600'}`}
                style={importance === k ? { background: v.couleur, borderColor: v.couleur } : { borderColor: v.couleur }}>{v.libelle}</button>))}
          </div>
        </div>
        <div>
          <span className="intertitre block mb-1">Pictogramme</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(ICONES_MESSAGE).map(([k, { Icone, libelle }]) => (
              <button key={k} type="button" title={libelle} aria-label={libelle} aria-pressed={icone === k} onClick={() => setIcone(k)}
                className={`w-8 h-8 grid place-items-center rounded-champ border ${icone === k ? 'border-[color:var(--c-principal)] bg-slate-100' : 'border-slate-200'}`}>
                <Icone size={17} style={{ color: icone === k ? IMPORTANCES_MESSAGE[importance].couleur : undefined }} />
              </button>))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={accuse} onChange={e => setAccuse(e.target.checked)} />
          Demander un accusé de lecture (« J’en ai pris connaissance »)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={courriel} onChange={e => setCourriel(e.target.checked)} />
          <IconMail size={15} className="text-slate-500" /> Envoyer aussi une copie entière par courriel (adresse de l’institut)</label>
        <p className="text-second text-slate-500">L’étudiant le lit dans son espace et peut y répondre : sa réponse vous revient ici, et sur votre tableau de bord.</p>
        <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={!apercu?.nb || !objet.trim() || !corps.trim() || enCours} onClick={envoyer}>
          <IconSend size={15} /> {enCours ? 'Envoi…' : 'Envoyer'}</button>
      </div>
    </div>
  );
}

function Detail({ id, onRetour, onErreur }) {
  const [m, setM] = useState(null);
  const [reponse, setReponse] = useState({});
  const charger = useCallback(() => appel('GET', `/${id}`).then(setM).catch(onErreur), [id, onErreur]);
  useEffect(() => { charger(); }, [charger]);
  if (!m) return <p className="text-sm text-slate-500">Chargement…</p>;
  const lus = m.destinataires.filter(d => d.lu_le).length;
  const confirmes = m.destinataires.filter(d => d.accuse_le).length;
  const ouvrirPiece = async p => {
    const r = await fetch(`/api/messages-etudiants/${id}/piece/${p.id}`, { headers: authHeaders() });
    if (!r.ok) { onErreur(new Error('Document introuvable.')); return; }
    window.open(URL.createObjectURL(await r.blob()), '_blank');
  };
  const repondre = async d => {
    try { await appel('POST', `/${id}/repondre`, { etudiant_id: d.etudiant_id, corps: reponse[d.etudiant_id] }); setReponse(r => ({ ...r, [d.etudiant_id]: '' })); charger(); }
    catch (e) { onErreur(e); }
  };
  const retirer = async () => {
    if (!(await demander('Retirer ce message de l’espace des étudiants ? Il reste au registre, avec son fil.'))) return;
    try { await appel('POST', `/${id}/retirer`); charger(); } catch (e) { onErreur(e); }
  };
  return (
    <div className="space-y-3">
      <button type="button" className="text-second text-iip-blue underline inline-flex items-center gap-1" onClick={onRetour}><IconArrowBackUp size={14} /> Tous les messages</button>
      <div className="bloc-etat px-4 py-3 space-y-1" data-etat={m.retire_le ? 'neutre' : (IMPORTANCES_MESSAGE[m.importance] || IMPORTANCES_MESSAGE.info).etat}>
        <div className="text-sm font-semibold text-iip-texte flex items-center gap-2"><Picto icone={m.icone} importance={m.importance} /> {m.objet}</div>
        <div className="text-second text-slate-500">{m.auteur_nom} · {jour(m.envoye_le)} · {m.resume}{m.canal_email ? ' · copie courriel' : ''}
          {m.retire_le ? ` · retiré le ${jour(m.retire_le)} par ${m.retire_par}` : ''}</div>
        <div className="text-second flex items-center gap-1" style={{ color: VERT }}><IconCheck size={14} /> {lus}/{m.destinataires.length} lu{lus > 1 ? 's' : ''}
          {m.accuse_demande ? <> · <IconChecks size={14} /> {confirmes} confirmé{confirmes > 1 ? 's' : ''}</> : null}</div>
        <div className="text-sm text-slate-700 whitespace-pre-line pt-1">{m.corps}</div>
        {(m.pieces || []).length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{m.pieces.map(p => (
          <button key={p.id} type="button" className="inline-flex items-center gap-1 text-second border border-slate-200 rounded-full px-2 py-0.5 hover:bg-slate-50" onClick={() => ouvrirPiece(p)}>
            <IconPaperclip size={12} /> {p.nom}</button>))}</div>}
        {!m.retire_le && <button type="button" className="bouton bouton-detruire mt-2 inline-flex items-center gap-1" onClick={retirer}><IconTrash size={14} /> Retirer</button>}
      </div>
      <div className="divide-y divide-slate-100 border border-slate-200 rounded-carte">
        {m.destinataires.map(d => (
          <div key={d.etudiant_id} className="px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0">{d.nom}</span>
              {d.accuse_le ? <IconChecks size={16} stroke={2.5} style={{ color: VERT }} title="Confirmé" />
                : d.lu_le ? <IconCheck size={16} stroke={2.5} style={{ color: VERT }} title="Lu" /> : <span className="w-4" />}
              <span className="text-second text-slate-500">
                {d.accuse_le ? `confirmé le ${jour(d.accuse_le)}` : d.lu_le ? `lu le ${jour(d.lu_le)}${m.accuse_demande ? ' · pas encore confirmé' : ''}` : 'pas encore lu'}
                {d.courriel_le ? ' · courriel parti' : ''}</span>
            </div>
            {d.fil.map(f => (
              <div key={f.id} className={`text-second rounded-champ px-3 py-1.5 whitespace-pre-line ${f.de === 'etudiant' ? 'border border-slate-200' : 'bloc-etat ml-8'}`}>
                <span className="text-slate-500">{f.de === 'etudiant' ? d.nom : f.auteur} · {jour(f.le)} — </span>{f.corps}</div>))}
            {d.fil.some(f => f.de === 'etudiant') && !m.retire_le && (
              <div className="flex gap-2">
                <input value={reponse[d.etudiant_id] || ''} onChange={e => setReponse(r => ({ ...r, [d.etudiant_id]: e.target.value }))}
                  placeholder={`Répondre à ${d.nom}…`} className="controle flex-1 min-w-0" />
                <button type="button" className="bouton" disabled={!String(reponse[d.etudiant_id] || '').trim()} onClick={() => repondre(d)}>Répondre</button>
              </div>)}
          </div>))}
      </div>
    </div>
  );
}

export default function MessagesEtudiants({ onFermer, titre = 'Messages aux étudiants' }) {
  const [face, setFace] = useState('envoyes');
  const [l, setL] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [erreur, setErreur] = useState(null);
  const echec = useCallback(e => setErreur(e.message), []);
  const charger = useCallback(() => appel('GET', '/').then(setL).catch(echec), [echec]);
  useEffect(() => { charger(); }, [charger]);
  return (
    <Fenetre icone={IconMessages} titre={titre} large="grande" onFermer={onFermer}
      sous="Ils les lisent dans leur espace étudiant, et y répondent ; un courriel les en avertit, sans le contenu.">
      <div className="space-y-4">
        <div className="flex gap-4 border-b border-slate-200">
          {[['envoyes', 'Envoyés'], ['ecrire', 'Écrire']].map(([k, t]) => (
            <button key={k} type="button" className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`} onClick={() => { setFace(k); setOuvert(null); }}>{t}</button>))}
        </div>
        {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
        {face === 'ecrire' && <Ecrire onErreur={echec} onEnvoye={() => { setFace('envoyes'); charger(); }} />}
        {face === 'envoyes' && (ouvert ? <Detail id={ouvert} onErreur={echec} onRetour={() => { setOuvert(null); charger(); }} />
          : !l ? <p className="text-sm text-slate-500">Chargement…</p>
            : !l.length ? <p className="text-sm text-slate-500">Aucun message envoyé. « Écrire » pour commencer.</p>
              : <div className="divide-y divide-slate-100 border border-slate-200 rounded-carte">
                {l.map(m => (
                  <button key={m.id} type="button" className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-50" onClick={() => setOuvert(m.id)}>
                    <Picto icone={m.icone} importance={m.importance} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${m.retire_le ? 'line-through text-slate-400' : 'text-iip-texte'}`}>{m.objet}</span>
                      <span className="block text-second text-slate-500 truncate">{m.auteur_nom} · {jour(m.envoye_le)} · {m.resume}{m.canal_email ? ' · copie courriel' : ''}{m.nb_pieces ? ` · ${m.nb_pieces} document${m.nb_pieces > 1 ? 's' : ''}` : ''}</span>
                    </span>
                    <span className="text-second tabular-nums whitespace-nowrap flex items-center gap-1" style={{ color: VERT }}>
                      <IconCheck size={14} /> {m.lus}/{m.n} lu{m.lus > 1 ? 's' : ''}
                      {m.accuse_demande ? <> · <IconChecks size={14} /> {m.accuses} confirmé{m.accuses > 1 ? 's' : ''}</> : null}</span>
                    {m.reponses > 0 && <span className="pastille-etat whitespace-nowrap" data-etat={m.reponses_non_lues ? 'disponible' : 'neutre'}>
                      {m.reponses} réponse{m.reponses > 1 ? 's' : ''}{m.reponses_non_lues ? ` · ${m.reponses_non_lues} nouvelle${m.reponses_non_lues > 1 ? 's' : ''}` : ''}</span>}
                  </button>))}
              </div>)}
      </div>
    </Fenetre>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api, authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { documentModele } from '../lib/modeleDocument.js';
import { useEnvoiMail } from '../lib/envoiMail.js';
import { peutGeste } from '../lib/droits.js';
import EnvoiMailModal from './EnvoiMailModal.jsx';

/**
 * UNE LETTRE PAR ÉTUDIANT, À PARTIR D'UN MODÈLE DE L'ATELIER (Charles,
 * 9 octobre 2026 : « je veux écrire une lettre individuelle à chaque étudiant —
 * une confirmation d'inscription ; comment je sélectionne l'étudiant ? »).
 *
 * Le modèle se compose une fois, dans l'atelier de Lucie, avec les données
 * « Étudiant » ; ici on choisit QUI le reçoit — une section, une unité, ou
 * nommément — et chaque étudiant reçoit SA lettre, à imprimer ou à lui envoyer.
 * Les boutons sont en haut : on ne déroule pas la liste pour produire.
 */
export default function LettresModele({ annee }) {
  const envoiMail = useEnvoiMail();
  const [modeles, setModeles] = useState([]);
  const [modele, setModele] = useState('');
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [ues, setUes] = useState([]);
  const [ue, setUe] = useState('');
  const [etudiants, setEtudiants] = useState([]);
  const [q, setQ] = useState('');
  const [coches, setCoches] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const [produits, setProduits] = useState(null);   // { nom, format, margins, documents }
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    fetch('/api/templates', { headers: authHeaders() }).then(r => r.json())
      .then(l => { const ls = Array.isArray(l) ? l : []; setModeles(ls); const c = ls.find(t => /confirmation d.inscription/i.test(t.nom)); if (c) setModele(String(c.id)); })
      .catch(() => {});
    api.sections().then(l => setSections(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);
  useEffect(() => { setUe(''); if (!section) { setUes([]); return; } api.ue(section).then(l => setUes(Array.isArray(l) ? l : [])).catch(() => setUes([])); }, [section, annee]);
  useEffect(() => {
    setEtudiants([]); setCoches(new Set()); setProduits(null);
    if (!section && !ue) return;
    const p = new URLSearchParams({ annee }); if (section) p.set('section', section); if (ue) p.set('ue_num', ue);
    fetch(`/api/listes/etudiants?${p}`, { headers: authHeaders() }).then(r => r.json())
      .then(j => setEtudiants((j.lignes || []).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i)))
      .catch(() => setEtudiants([]));
  }, [section, ue, annee]);
  useEffect(() => { setProduits(null); }, [coches, modele]);

  const n = s0 => String(s0 || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const vus = useMemo(() => etudiants.filter(e => !q.trim() || n(`${e.nom} ${e.prenom} ${e.matricule || ''}`).includes(n(q))), [etudiants, q]);
  const tous = vus.length > 0 && vus.every(e => coches.has(e.id));
  const basculer = id => setCoches(s => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const nomModele = modeles.find(t => String(t.id) === modele)?.nom || 'Lettre';

  async function produire() {
    setEnCours(true); setErreur(null); setProduits(null);
    try {
      const r = await fetch(`/api/templates/${modele}/lot`, { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ etudiants: [...coches], annee, section: section || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setProduits(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }
  // Un modèle de l'atelier revient déjà dans l'enveloppe commune (pied de Lucie, logo) : on la prend telle quelle.
  const html = docs => (docs.length === 1 && docs[0].enveloppe) ? docs[0].enveloppe
    : (produits?.enveloppe && docs.length === produits.documents.length) ? produits.enveloppe
    : documentModele(docs, { titre: nomModele, format: produits?.format, margins: produits?.margins });
  const fichier = d => `${nomModele}_${d.nom}`.replace(/[^\p{L}\p{N}]+/gu, '_');
  const apercu = k => {
    const d = produits.documents[k];
    const nav = produits.documents.length > 1 ? (
      <span className="flex items-center gap-1 text-[12px] text-slate-500">
        <button type="button" className="bouton controle px-2" disabled={k === 0} onClick={() => apercu(k - 1)}>◀</button>
        <span className="tabular-nums px-1">{k + 1} / {produits.documents.length}</span>
        <button type="button" className="bouton controle px-2" disabled={k === produits.documents.length - 1} onClick={() => apercu(k + 1)}>▶</button>
      </span>) : null;
    ouvrirApercu({ html: html([d]), titre: `${nomModele} — ${d.nom}`, nomFichier: fichier(d), envoiPossible: false, actionExtra: nav });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={modele} onChange={e => setModele(e.target.value)} className="controle min-w-[16rem]" title="Le modèle composé dans l'atelier de Lucie">
          <option value="">— Choisir un modèle —</option>
          {modeles.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
        </select>
        <select value={section} onChange={e => setSection(e.target.value)} className="controle">
          <option value="">— Section —</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <select value={ue} onChange={e => setUe(e.target.value)} className="controle max-w-[22rem]" disabled={!section}>
          <option value="">Toute la section</option>
          {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {(u.ue_nom || '').slice(0, 44)}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un étudiant…" className="controle w-56" data-reponses="non" />
      </div>

      {/* LES BOUTONS EN HAUT, TOUJOURS. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="bouton bouton-fort" disabled={enCours || !modele || !coches.size} onClick={produire}>
          {enCours ? 'Production…' : `Produire ${coches.size || ''} lettre(s)`}</button>
        {produits?.documents?.length > 0 && <>
          <button type="button" className="bouton" onClick={() => apercu(0)}>Aperçu, une par une</button>
          <button type="button" className="bouton bouton-sortir" onClick={() => ouvrirApercu({ html: html(produits.documents),
            titre: `${nomModele} — ${produits.documents.length} étudiant(s)`, nomFichier: `${nomModele}_lot`.replace(/[^\p{L}\p{N}]+/gu, '_'), envoiPossible: false })}>
            Tout imprimer</button>
          {envoiMail?.actif && peutGeste('envois.envoyer') && (
            <button type="button" className="bouton bouton-sortir" onClick={() => setEnvoi(true)}>Envoyer à chacun ({produits.documents.length})</button>)}
        </>}
        {!modele && <span className="text-[12px] text-slate-500">Choisissez d’abord le modèle (composé dans Configuration → L’atelier de Lucie).</span>}
        {modele && !coches.size && etudiants.length > 0 && <span className="text-[12px] text-slate-500">Cochez les étudiants qui reçoivent la lettre.</span>}
      </div>
      {erreur && <div className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}

      {!section && !ue ? (
        <p className="text-[13px] text-slate-500">Choisissez une section, puis éventuellement une unité : ses étudiants s’affichent ici.</p>
      ) : (
        <div className="border border-slate-200 rounded-carte overflow-hidden bg-white">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="tab-entete text-left">
                <th className="px-3 py-1.5 w-8"><input type="checkbox" checked={tous}
                  onChange={() => setCoches(s => { const x = new Set(s); vus.forEach(e => (tous ? x.delete(e.id) : x.add(e.id))); return x; })} /></th>
                <th className="px-3 py-1.5">Étudiant</th><th className="px-3 py-1.5">Matricule</th><th className="px-3 py-1.5">Adresse de l’école</th>
              </tr>
              <tr className="tab-repere font-semibold"><td></td><td className="px-3 py-1" colSpan="3">{coches.size} sur {vus.length} coché(s)</td></tr>
            </thead>
            <tbody>
              {vus.map(e => (
                <tr key={e.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => basculer(e.id)}>
                  <td className="px-3 py-1" onClick={ev => ev.stopPropagation()}><input type="checkbox" checked={coches.has(e.id)} onChange={() => basculer(e.id)} /></td>
                  <td className="px-3 py-1 whitespace-nowrap"><b className="text-iip-blue">{String(e.nom || '').toUpperCase()}</b> {e.prenom}</td>
                  <td className="px-3 py-1 text-slate-600">{e.matricule || e.id_ecampus || '—'}</td>
                  <td className="px-3 py-1 text-slate-600">{e.email_ecole || <span className="text-slate-400">aucune</span>}</td>
                </tr>))}
              {!vus.length && <tr><td colSpan="4" className="px-3 py-4 text-slate-400">Aucun étudiant.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {envoi && (
        <EnvoiMailModal typeDoc="lettre_modele" sujet={`${nomModele} — ${annee}`} contenu={`${nomModele} — ${annee}`}
          pieces={produits.documents.map(d => ({ html: html([d]), nom_fichier: fichier(d),
            destinataire: { type: 'etudiant', id: d.etudiant_id, nom: d.nom } }))}
          onClose={() => setEnvoi(false)} />)}
    </div>
  );
}

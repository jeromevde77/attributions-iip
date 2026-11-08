import { useEffect, useRef, useState } from 'react';
import { IconUpload, IconFileText, IconTrash, IconDownload } from '@tabler/icons-react';
import { ListeEtats, LigneEtat, Encadre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';

/* LES SUPPORTS DE COURS (3.5.211, Charles, 7 novembre 2026 ; tranché : par cours, dans l'espace de l'étudiant). Onglet
   « Supports » d'un cours de Mes cours (et de l'espace enseignant, par le relais) : déposer un fichier (PDF, Word, Excel,
   PowerPoint, image ; 15 Mo), le titre proposé d'après le nom ; la liste, la plus récente en tête ; retirer (il sort de l'espace
   des étudiants). Tant que la fonction n'est pas ouverte (Mise en service), l'écran le dit : on peut déjà déposer. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const taille = n => (n > 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

export default function SupportsCours({ coursCode, annee }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [titre, setTitre] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);
  const base = `/api/mes-cours/supports`;
  const charger = () => fetch(`${base}/${encodeURIComponent(coursCode)}${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`, { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); setD(j); })
    .catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, [coursCode, annee]);   // eslint-disable-line react-hooks/exhaustive-deps

  const choisir = f => {
    if (!f) return;
    if (d && f.size > d.max_mo * 1048576) { informer(`Le fichier dépasse ${d.max_mo} Mo.`); return; }
    setFichier(f); setTitre(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };
  const deposer = async () => {
    setEnvoi(true);
    try {
      const contenu = await new Promise((ok, ko) => { const lr = new FileReader(); lr.onload = () => ok(lr.result); lr.onerror = ko; lr.readAsDataURL(fichier); });
      const r = await fetch(`${base}/${encodeURIComponent(coursCode)}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, titre, nom: fichier.name, contenu }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Dépôt refusé.');
      setFichier(null); setTitre(''); if (champ.current) champ.current.value = '';
      charger();
    } catch (e) { informer(e.message); } finally { setEnvoi(false); }
  };
  const ouvrir = async s => {
    const w = window.open('', '_blank');
    try {
      const r = await fetch(`${base}/fichier/${s.id}`, { headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Fichier introuvable.');
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location = url; else window.location.href = url;
    } catch (e) { if (w) w.close(); informer(e.message); }
  };
  const retirer = async s => {
    if (!(await demander(`Retirer « ${s.titre} » ? Il disparaît de l’espace des étudiants.`))) return;
    try { const r = await fetch(`${base}/${s.id}`, { method: 'DELETE', headers: authHeaders() }); if (!r.ok) throw new Error('Retrait refusé.'); charger(); }
    catch (e) { informer(e.message); }
  };

  if (erreur) return <Encadre etat="corriger" titre="Supports">{erreur}</Encadre>;
  if (!d) return <div className="text-second text-slate-500 py-6">Chargement…</div>;
  return (
    <div className="space-y-4 py-2">
      <p className="text-second text-slate-500">Les fichiers de ce cours pour vos étudiants : les inscrits les trouvent dans leur espace, Mon parcours, sous le cours ; un nouveau support y porte la marque « nouveau » pendant une semaine.</p>
      {!d.ouvert && <Encadre etat="surveiller" titre="Pas encore ouvert aux étudiants">La direction ouvre les supports dans l’espace des étudiants (Configuration → Mise en service). Vous pouvez déjà déposer : ils y seront dès l’ouverture.</Encadre>}
      <div className="carte px-4 py-3 flex flex-wrap items-center gap-3">
        <input ref={champ} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png" onChange={e => choisir(e.target.files?.[0])} />
        <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => champ.current?.click()}><IconUpload size={16} /> Choisir un fichier</button>
        {fichier ? <>
          <span className="text-second text-slate-500 min-w-0 truncate">{fichier.name} · {taille(fichier.size)}</span>
          <input className="controle flex-1 min-w-[12rem]" value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre lu par les étudiants" aria-label="Titre du support" />
          <button type="button" className="bouton bouton-fort" disabled={envoi || !titre.trim()} onClick={deposer}>{envoi ? 'Dépôt…' : 'Déposer'}</button>
        </> : <span className="text-second text-slate-500">PDF, Word, Excel, PowerPoint ou image — {d.max_mo} Mo au plus.</span>}
      </div>
      {!d.supports.length ? <div className="text-second text-slate-500">Aucun support déposé pour ce cours.</div> : (
        <ListeEtats>
          {d.supports.map(s => (
            <LigneEtat key={s.id} etat="disponible" icone={IconFileText} titre={s.titre}
              sous={`${s.nom} · ${taille(s.taille || 0)} · déposé le ${fr(s.depose_le)}${s.depose_par ? ` par ${s.depose_par}` : ''}`}
              droite={<span className="flex items-center gap-1">
                <button type="button" className="bouton" title="Ouvrir" onClick={() => ouvrir(s)}><IconDownload size={16} /></button>
                <button type="button" className="bouton" title="Retirer" onClick={() => retirer(s)}><IconTrash size={16} /></button>
              </span>} />))}
        </ListeEtats>)}
    </div>);
}

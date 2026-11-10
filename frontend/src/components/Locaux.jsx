import { useEffect, useState } from 'react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { useDroits } from '../lib/droits.js';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, Encadre } from './ui.jsx';

/* LES LOCAUX (3.5.302, Charles : « tout ce qui est lié à l'organisation au même endroit, avec l'horaire » ; étude « Le temps de
   l'école »). La table `local` existait, lue par les sessions, les horaires et la configuration des cours, sans écran pour la
   tenir. Ajouter, corriger (au départ du champ), retirer — un local retiré disparaît des listes, il n'est pas effacé.
   Serveur : /api/locaux (direction et secrétariat écrivent ; la direction retire). */
const api = (url, o = {}) => fetch(`/api/locaux${url}`, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });

function Champ({ valeur, onPoser, type = 'text', largeur = 'w-full', lecture }) {
  const [v, setV] = useState(valeur ?? '');
  useEffect(() => setV(valeur ?? ''), [valeur]);
  return <input type={type} className={`controle !h-8 ${largeur}`} value={v} disabled={lecture} data-reponses="non"
    onChange={e => setV(e.target.value)} onBlur={() => { if (String(v) !== String(valeur ?? '')) onPoser(v); }} />;
}

export default function Locaux() {
  const { passe } = useDroits();
  const ecrit = passe('admin', 'editeur');
  const [l, setL] = useState(null);
  const [nouveau, setNouveau] = useState({ nom: '', type: '', places: '', equipements: '' });
  const [erreur, setErreur] = useState(null);
  const charger = () => api('/').then(x => { setL(Array.isArray(x) ? x : []); setErreur(null); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const poser = async (x, champ, v) => {
    try { await api(`/${x.id}`, { method: 'PATCH', body: JSON.stringify({ [champ]: champ === 'places' ? (v === '' ? null : Number(v)) : v }) }); charger(); }
    catch (e) { informer({ message: e.message }); }
  };
  const ajouter = async () => {
    try { await api('/', { method: 'POST', body: JSON.stringify({ ...nouveau, places: nouveau.places === '' ? null : Number(nouveau.places) }) });
      setNouveau({ nom: '', type: '', places: '', equipements: '' }); charger(); }
    catch (e) { informer({ message: e.message }); }
  };
  const retirer = async x => {
    if (!(await demander(`Retirer le local « ${x.nom} » des listes ?\n\nIl n'est pas effacé : les séances et les épreuves qui le citent le gardent.`))) return;
    try { await api(`/${x.id}`, { method: 'DELETE' }); charger(); } catch (e) { informer({ message: e.message }); }
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-ecran">Locaux</h1>
        <p className="text-second text-slate-500 m-0">Les salles de l’école : on les choisit pour les séances de l’horaire, les épreuves et les visites des copies.</p>
      </div>
      {erreur && <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>}
      <section className="carte overflow-hidden">
        <EnteteCarte titre={`${l?.length ?? '…'} local(aux)`} sous={ecrit ? 'Un champ se corrige en le quittant.' : 'En lecture.'} />
        <Tableau dense className="!border-0 !rounded-none">
          <TableauEntete><Th>Nom</Th><Th>Type</Th><Th align="droite">Places</Th><Th>Équipements</Th><Th largeur="w-10" /></TableauEntete>
          <tbody>
            {(l || []).map(x => (
              <Tr key={x.id}>
                <Td><Champ valeur={x.nom} lecture={!ecrit} onPoser={v => poser(x, 'nom', v)} /></Td>
                <Td><Champ valeur={x.type} lecture={!ecrit} largeur="w-40" onPoser={v => poser(x, 'type', v)} /></Td>
                <Td align="droite"><Champ type="number" valeur={x.places} lecture={!ecrit} largeur="w-20" onPoser={v => poser(x, 'places', v)} /></Td>
                <Td><Champ valeur={x.equipements} lecture={!ecrit} onPoser={v => poser(x, 'equipements', v)} /></Td>
                <Td>{passe('admin') && <button type="button" className="text-slate-400 hover:text-red-700" title="Retirer des listes" aria-label={`Retirer ${x.nom}`} onClick={() => retirer(x)}><IconTrash size={15} /></button>}</Td>
              </Tr>))}
            {ecrit && (
              <Tr>
                <Td><input className="controle !h-8 w-full" placeholder="Nouveau local…" value={nouveau.nom} data-reponses="non" onChange={e => setNouveau(n => ({ ...n, nom: e.target.value }))} /></Td>
                <Td><input className="controle !h-8 w-40" placeholder="ex. auditoire, labo" value={nouveau.type} data-reponses="non" onChange={e => setNouveau(n => ({ ...n, type: e.target.value }))} /></Td>
                <Td align="droite"><input type="number" className="controle !h-8 w-20" value={nouveau.places} onChange={e => setNouveau(n => ({ ...n, places: e.target.value }))} /></Td>
                <Td><input className="controle !h-8 w-full" placeholder="ex. projecteur, 20 PC" value={nouveau.equipements} data-reponses="non" onChange={e => setNouveau(n => ({ ...n, equipements: e.target.value }))} /></Td>
                <Td><button type="button" className="bouton bouton-fort !px-2" disabled={!nouveau.nom.trim()} onClick={ajouter} aria-label="Ajouter le local"><IconPlus size={15} /></button></Td>
              </Tr>)}
          </tbody>
        </Tableau>
      </section>
    </div>
  );
}

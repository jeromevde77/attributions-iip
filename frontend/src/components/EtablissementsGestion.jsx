import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { demander, informer, saisir } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';
import { chargerIdentite } from '../lib/identite.js';

/**
 * LES ÉTABLISSEMENTS (3.1.253, Charles, 10 octobre 2026 : « deux établissements —
 * HELB et IIP, ou EPFC et Soralia — gérés par le même conseil d'administration ;
 * chacun ses étudiants, ou un mélange comme ici »). Le choix de l'établissement
 * dont on règle l'identité, ses quatre images (logo, logo blanc, signature, cachet)
 * et le rattachement des sections. Images et établissements : l'administrateur.
 */
const IMAGES = [
  ['logo', 'Logo', 'En-tête et pied des pièces, atelier.'],
  ['logo_blanc', 'Logo blanc', 'Fonds sombres : menus en mode sombre, bandeaux.'],
  ['signature', 'Signature de la direction', 'Bloc de signature des pièces.'],
  ['cachet', 'Cachet', 'Sceau de l’établissement sur les pièces signées.'],
];

export default function EtablissementsGestion({ etabId, setEtabId }) {
  const admin = passeRole(['admin']);
  const [liste, setListe] = useState(null);
  const [images, setImages] = useState({});
  const [enCours, setEnCours] = useState('');

  const charger = async () => {
    const r = await fetch('/api/etablissement/liste', { headers: authHeaders() });
    setListe(r.ok ? await r.json() : { etablissements: [], sections: [] });
    const i = await fetch(`/api/etablissement/images?id=${etabId}`, { headers: authHeaders() });
    setImages(i.ok ? await i.json() : {});
  };
  useEffect(() => { charger(); }, [etabId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function importer(cle, fichier) {
    if (!fichier) return;
    if (fichier.size > 2 * 1024 * 1024) { await informer('❌ Image trop lourde (2 Mo au plus).'); return; }
    const data = await new Promise((ok, ko) => { const lr = new FileReader(); lr.onload = () => ok(lr.result); lr.onerror = ko; lr.readAsDataURL(fichier); });
    setEnCours(cle);
    try {
      const r = await fetch(`/api/etablissement?id=${etabId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ...(await (await fetch(`/api/etablissement?id=${etabId}`, { headers: authHeaders() })).json()), [cle]: data }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      await charger(); if (etabId === 1) chargerIdentite(true);
    } catch (e) { await informer(`❌ ${e.message}`); } finally { setEnCours(''); }
  }
  async function retirer(cle, libelle) {
    if (!(await demander(`Retirer l’image « ${libelle} » ? ${etabId === 1 ? 'L’image d’origine reprendra sa place.' : ''}`))) return;
    const actuel = await (await fetch(`/api/etablissement?id=${etabId}`, { headers: authHeaders() })).json();
    const r = await fetch(`/api/etablissement?id=${etabId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ...actuel, [cle]: '' }) });
    if (!r.ok) { await informer(`❌ ${(await r.json().catch(() => ({}))).error || r.status}`); return; }
    await charger(); if (etabId === 1) chargerIdentite(true);
  }
  async function ajouter() {
    const nom = await saisir({ titre: 'Nouvel établissement', message: 'Son nom (ex. Haute École Libre de Bruxelles)' });
    if (!nom) return;
    const code = await saisir({ titre: 'Nouvel établissement', message: 'Son code court (ex. HELB, EPFC)' });
    if (!code) return;
    const r = await fetch('/api/etablissement', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ etab_nom: nom, code }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await informer(`❌ ${j.error || r.status}`); return; }
    await charger(); setEtabId(j.id);
  }
  async function supprimer() {
    if (!(await demander('Retirer cet établissement ? Refusé s’il porte encore des sections.'))) return;
    const r = await fetch(`/api/etablissement/${etabId}`, { method: 'DELETE', headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await informer(`❌ ${j.error || r.status}`); return; }
    setEtabId(1);
  }
  async function rattacher(code, id) {
    const r = await fetch(`/api/etablissement/${id}/sections`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ sections: [code] }) });
    if (!r.ok) { await informer(`❌ ${(await r.json().catch(() => ({}))).error || r.status}`); return; }
    await charger();
  }

  if (!liste) return null;
  const etabs = liste.etablissements;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segments flex h-9">
          {etabs.map(e => <button key={e.id} onClick={() => setEtabId(e.id)} className={`px-3 ${e.id === etabId ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`} title={e.etab_nom || ''}>{e.code || e.nom_court || `n° ${e.id}`}</button>)}
        </div>
        {admin && <button className="bouton" onClick={ajouter}>+ Établissement</button>}
        {admin && etabId !== 1 && <button className="bouton bouton-detruire" onClick={supprimer}>Retirer cet établissement</button>}
      </div>
      <div className="carte p-3 space-y-2">
        <b className="text-sm">Images de l’établissement</b>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {IMAGES.map(([cle, libelle, aide]) => (
            <div key={cle} className="bloc-etat tuile-grande space-y-2" data-etat="neutre">
              <div className="flex items-center gap-2"><b className="text-sm flex-1">{libelle}</b>
                {admin && images[cle] && <button className="text-xs text-slate-400 hover:text-iip-blue" onClick={() => retirer(cle, libelle)}>retirer</button>}</div>
              <div className="h-20 grid place-items-center rounded-champ" style={{ background: cle === 'logo_blanc' ? 'var(--c-principal)' : 'var(--c-fond_ligne, #fff)', border: '1px dashed var(--c-filet, #CBD5E1)' }}>
                {images[cle] ? <img src={images[cle]} alt={libelle} className="max-h-16 max-w-[90%] object-contain" /> : <span className="text-xs text-slate-400">aucune image</span>}
              </div>
              <div className="text-xs text-slate-500">{aide}</div>
              {admin && <label className="bouton !h-8 w-full justify-center cursor-pointer">
                {enCours === cle ? 'Import…' : 'Importer une image'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => { importer(cle, e.target.files?.[0]); e.target.value = ''; }} />
              </label>}
            </div>))}
        </div>
        {!admin && <p className="text-xs text-slate-500">Seul l’administrateur change les images.</p>}
      </div>
      {etabs.length > 1 && (
        <div className="carte p-3 space-y-2">
          <b className="text-sm">Sections et établissements</b>
          <p className="text-xs text-slate-500">Chaque section appartient à un établissement : ses pièces en portent l’identité, et l’accès par section cloisonne ce qui doit l’être.</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {liste.sections.map(s => (
              <label key={s.code} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate" title={s.libelle || ''}>{s.code}</span>
                <select className="controle !h-8" value={s.etablissement_id} disabled={!admin} onChange={e => rattacher(s.code, Number(e.target.value))}>
                  {etabs.map(e => <option key={e.id} value={e.id}>{e.code || e.etab_nom}</option>)}
                </select>
              </label>))}
          </div>
        </div>)}
    </div>
  );
}

/* (CS) MA PHOTO D'IDENTITÉ (3.5.606, demande du secrétariat) : l'étudiant dépose une photo de type identité, sur fond blanc ; le
 * secrétariat la vérifie. Le dépôt attend le relevé de Lucie (quelques secondes). Serveur : portail/src/serveur.js
 * (/api/portail/photo) ; Lucie : backend/src/lib/photoEtudiant.js. La photo est réduite ici (1 000 px au plus, JPEG) avant l'envoi. */
import { useCallback, useEffect, useRef, useState } from 'react';
import ChargementLucie from '../components/ChargementLucie.jsx';
import { IconCamera, IconCheck } from '@tabler/icons-react';
import { Encadre } from '../components/ui.jsx';

const jourFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

/** Réduit l'image (1 000 px de haut au plus) et la rend en JPEG. */
function reduire(fichier) {
  return new Promise((ok, ko) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? ok(b) : ko(new Error('Image illisible.'))), 'image/jpeg', 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Cette image ne s’ouvre pas : choisissez une photo JPEG ou PNG.')); };
    img.src = url;
  });
}

export default function MaPhoto({ appel, jeton, onErreur }) {
  const [d, setD] = useState(null);
  const [apercu, setApercu] = useState(null);   // { blob, url }
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);
  const charger = useCallback(() => appel('GET', '/photo').then(setD).catch(onErreur), [appel, onErreur]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { if (!d?.dernier_envoi || d.dernier_envoi.releve_le) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [d, charger]);

  const choisir = async f => {
    if (!f) return;
    try { const blob = await reduire(f); setApercu({ blob, url: URL.createObjectURL(blob) }); } catch (e) { onErreur(e); }
  };
  const envoyer = async () => {
    setEnvoi(true);
    try {
      const tk = jeton();
      const r = await fetch('/api/portail/photo', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) }, body: apercu.blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setApercu(null); if (champ.current) champ.current.value = ''; charger();
    } catch (e) { onErreur(e); } finally { setEnvoi(false); }
  };

  if (!d) return <ChargementLucie />;
  const p = d.photo;
  const enCours = d.dernier_envoi && !d.dernier_envoi.releve_le;
  const der = p?.derniere;
  return (
    <div className="space-y-4 max-w-2xl">
      {enCours && <Encadre etat="disponible" titre="Envoi en cours">Votre photo arrive à l’école ; cela prend quelques secondes.</Encadre>}
      {!enCours && d.dernier_envoi?.erreur && <Encadre etat="corriger" titre="La photo n’a pas été reçue">{d.dernier_envoi.erreur}</Encadre>}
      {!enCours && der?.statut === 'a_valider' && <Encadre etat="disponible" titre="Photo reçue">Déposée le {jourFr(der.depose_le)} : le secrétariat la vérifie.</Encadre>}
      {!enCours && der?.statut === 'refusee' && <Encadre etat="corriger" titre="Votre photo n’a pas été acceptée">
        {der.motif || 'Elle ne convient pas.'} Déposez-en une autre ci-dessous.</Encadre>}
      {!enCours && der?.statut === 'retiree' && <Encadre etat="surveiller" titre="Votre photo a été retirée de votre dossier">
        {der.motif || ''} Déposez-en une autre ci-dessous.</Encadre>}
      {!enCours && p?.a_photo && der?.statut !== 'a_valider' && der?.statut !== 'refusee' && <Encadre etat="reussi" titre="Votre photo est dans votre dossier">
        Acceptée le {jourFr(p.acceptee_le)}. Vous pouvez la remplacer si elle n’est plus à jour.</Encadre>}
      {!enCours && !p?.a_photo && !der && <Encadre etat="surveiller" titre="Votre photo d’identité est demandée">
        Le secrétariat a besoin d’une photo de vous pour votre dossier et votre carte d’étudiant.</Encadre>}

      <section className="carte overflow-hidden">
        <div className="entete-carte"><div className="min-w-0"><div className="titre-carte">Déposer ma photo</div></div></div>
        <div className="px-4 py-3 space-y-3 text-sm">
          <ul className="list-disc pl-5 text-slate-600 space-y-0.5">
            <li>une photo <b>récente</b>, de type photo d’identité ;</li>
            <li>sur <b>fond blanc</b> ou très clair, uni ;</li>
            <li>de face, le visage entier et bien éclairé, sans lunettes de soleil ni couvre-chef (sauf motif religieux ou médical) ;</li>
            <li>seul·e sur la photo, sans filtre.</li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <label className="bouton cursor-pointer"><IconCamera size={16} /> Choisir ou prendre une photo
              <input ref={champ} type="file" accept="image/jpeg,image/png" capture="user" className="hidden" onChange={e => choisir(e.target.files?.[0])} /></label>
            {apercu && <button type="button" className="bouton bouton-fort" disabled={envoi} onClick={envoyer}><IconCheck size={16} /> Envoyer cette photo</button>}
          </div>
          {apercu && <img src={apercu.url} alt="Aperçu de la photo" className="max-h-64 rounded-champ border border-slate-200" />}
        </div>
      </section>
    </div>);
}

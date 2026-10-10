/**
 * NOTIFIER LES DÉCISIONS DE VA À L'ÉTUDIANT (Charles, 7 octobre 2026 : « quand
 * est-ce que l'étudiant est prévenu ? »). La pièce vient du serveur
 * (lib/pieceNotificationVA.js) : toutes les demandes de l'année dont la
 * décision est validée, avec la motivation du Conseil. Elle s'imprime, ou part
 * par le centre d'envoi à l'adresse de l'école — et c'est l'envoi qui pose la
 * date de notification sur chaque dossier, au nom de qui a envoyé.
 */
import { useState } from 'react';
import { IconSend, IconPrinter } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Fenetre } from './ui.jsx';
import EnvoiMailModal from './EnvoiMailModal.jsx';

export default function NotificationVA({ etudId, annee, nom, onFait, compact = false }) {
  const [piece, setPiece] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function ouvrir() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/etudiants/${etudId}/valorisations/notification?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); setPiece({ vide: true }); return; }
      setPiece(j);
    } finally { setEnCours(false); }
  }

  async function consigner(resultat) {
    const parti = (resultat?.resultats || []).some(x => x.statut === 'envoye' || x.statut === 'simule');
    if (!parti) return;
    await fetch(`/api/etudiants/${etudId}/valorisations/notifier`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ ids: piece.ids, detail: 'notification envoyée par courriel' }),
    });
    onFait?.();
  }

  return (
    <>
      <button type="button" className={`bouton bouton-sortir flex items-center gap-1.5 ${compact ? 'text-second' : ''}`} disabled={enCours}
        onClick={ouvrir} title="La lettre à l'étudiant : chaque décision validée et sa motivation par le Conseil">
        <IconSend size={14} /> {enCours ? 'Préparation…' : 'Notifier les décisions'}
      </button>
      {piece && !envoi && (
        <Fenetre titre="Notification des décisions de valorisation" sous={`${nom || ''} · ${annee}`} onFermer={() => { setPiece(null); setErreur(null); }}
          pied={!piece.vide && <>
            <button type="button" className="bouton bouton-fort flex items-center gap-1.5" onClick={() => setEnvoi(true)}>
              <IconSend size={14} /> Envoyer à l’étudiant</button>
            <button type="button" className="bouton bouton-sortir flex items-center gap-1.5"
              onClick={() => ouvrirApercu({ html: piece.html, titre: piece.titre, nomFichier: piece.nom, typeDoc: 'valorisation_notification',
                astuceImpression: 'A4 portrait', destinataire: { type: 'etudiant', id: etudId } })}>
              <IconPrinter size={14} /> Aperçu, imprimer</button>
            <span className="text-second text-slate-500 min-w-0">L’envoi enregistre la date de notification sur chaque dossier.</span>
          </>}>
          {erreur ? <div data-etat="corriger" className="bloc-etat px-3 py-2 text-sm">{erreur}</div> : (
            <div className="text-sm space-y-2">
              <p>La pièce porte <b>{piece.ids.length}</b> décision(s) validée(s) par la direction, avec la motivation du Conseil des études.
                L’avis des chargés de cours n’y figure pas.</p>
              {piece.en_cours?.length > 0 && <p className="text-slate-600">Encore à l’examen, et signalées comme telles : UE {piece.en_cours.join(', ')}.</p>}
              <iframe title="Aperçu" srcDoc={piece.html} className="w-full h-[55vh] border border-slate-200 rounded-champ bg-white" />
            </div>)}
        </Fenetre>)}
      {envoi && piece && (
        <EnvoiMailModal typeDoc="valorisation_notification" sujet="Valorisation des acquis — notification des décisions"
          pieces={[{ html: piece.html, nom_fichier: piece.nom, destinataire: { type: 'etudiant', id: etudId } }]}
          contenu="valorisation des acquis — notification" onEnvoye={consigner}
          onClose={() => { setEnvoi(false); setPiece(null); }} />)}
    </>
  );
}

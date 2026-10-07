import { useEffect, useRef, useState } from 'react';
import { informer } from '../lib/dialogue.jsx';
import { peutGeste } from '../lib/droits.js';
import { IconSend, IconX, IconDownload, IconMail } from '@tabler/icons-react';
import EnvoiMailModal from './EnvoiMailModal.jsx';
import { useEnvoiMail } from '../lib/envoiMail.js';
import { authHeaders } from '../lib/api.js';

/**
 * Modale d'aperçu d'un document HTML avant impression / sauvegarde PDF.
 * @param {string} html        - Document HTML complet.
 * @param {string} [titre]     - Nom du prof ou titre principal (barre marine).
 * @param {string} [sousTitre] - Type de document (ex: "Fiche IIP · 2026-2027").
 * @param {string} [nomFichier] - Nom suggéré pour l'enregistrement.
 * @param {object} [destinataire] - { type: 'etudiant'|'professeur', id, nom, email } :
 *                                  s'il est connu, le document peut lui être envoyé par courriel.
 * @param {string} [typeDoc]   - Identifiant du document pour le journal des envois.
 * @param {string} [sujetMail] - Objet proposé pour le courriel.
 * @param {function} onClose
 */
export default function PreviewModal({ html, titre = 'Document', sousTitre, nomFichier, onClose, actionExtra,
                                       destinataire = null, typeDoc = null, sujetMail = null,
                                       // Faux quand le document porte PLUSIEURS personnes : un
                                       // envoi force un document par personne, et c'est alors
                                       // l'écran appelant qui propose l'envoi, pièce par pièce.
                                       envoiPossible = true,
                                       astuceImpression = "⊞ Choisir « Paysage » à l'impression",
                                       /* LE PDF DU SERVEUR, QUAND LA PIÈCE LE DEMANDE ({ orientation })
                                          (5 octobre 2026, schéma de capitalisation : « quand
                                          j'imprime, c'est plus d'une page »). L'impression du
                                          navigateur dépend de ses réglages — marges, échelle,
                                          orientation ; le PDF du serveur impose A4, l'orientation
                                          et le pied, et c'est lui qui a été vérifié. */
                                       pdf = null }) {
  const iframeRef = useRef(null);
  const [pret, setPret] = useState(false);
  /* LA SIGNATURE NE SORT JAMAIS NUE (1er octobre 2026 : « ma signature doit
     toujours être avec la protection fac-similé »). Ce qui s'AFFICHE et
     s'IMPRIME ici porte le fac-similé, posé par le serveur
     (lib/protectionSignature.js) ; tant qu'il n'est pas arrivé, la signature
     est masquée. L'ENVOI garde l'original : il pose son propre fac-similé,
     au nom du destinataire. */
  // Une pièce qui porte déjà les vagues de sécurité n'a pas de second filigrane.
  const signe = /class="paraphe"/.test(html || '') && /--paraphe\s*:\s*url\(/.test(html || '')
    && !/class="filigrane-cloture"/.test(html || '');
  const masque = signe ? String(html).replace(/--paraphe\s*:\s*url\([^)]*\)/g, '--paraphe:none') : html;
  const [htmlAffiche, setHtmlAffiche] = useState(masque);
  useEffect(() => {
    setHtmlAffiche(masque);
    if (!signe) return;
    let vivant = true;
    fetch('/api/impression/proteger', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ html, piece: [titre, sousTitre].filter(Boolean).join(' — ') || nomFichier || 'Document',
        destinataire_nom: destinataire?.nom || null }) })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (vivant && j?.html) setHtmlAffiche(j.html); }).catch(() => {});
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);
  const [envoi, setEnvoi] = useState(false);
  const [pdfEnCours, setPdfEnCours] = useState(false);
  async function telechargerPdf() {
    setPdfEnCours(true);
    try {
      const r = await fetch('/api/impression/pdf', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ html: htmlAffiche, nom: nomFichier || titre, orientation: pdf?.orientation || 'portrait',
          ...(pdf?.marge_basse ? { marge_basse: pdf.marge_basse } : {}),
          ...(pdf?.pied === false ? { pied: false, pagination: 'jamais' } : {}) }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erreur ${r.status}`); }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${String(nomFichier || titre || 'document').replace(/[^A-Za-z0-9_.-]+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { console.error('[preview] PDF :', e); informer(e.message || 'Le PDF n’a pas pu être composé.'); }
    finally { setPdfEnCours(false); }
  }
  const envoiMail = useEnvoiMail();

  /* UNE PIÈCE EN PAYSAGE S'IMPRIME DEPUIS LE PDF DU SERVEUR (Charles,
     7 octobre 2026 : « il propose toujours une impression à 66 % et non en
     pleine page »). Safari ignore la consigne @page « A4 landscape » : il
     imprime en portrait et réduit la page de 297 mm pour la faire tenir dans
     210 mm. Le PDF, lui, porte des pages paysage — le navigateur l'imprime tel
     quel. La fenêtre s'ouvre tout de suite (sinon le bloqueur la refuse), le
     PDF y arrive dès qu'il est composé. */
  const paysage = pdf?.orientation === 'paysage' || /size:\s*A4\s+landscape/.test(htmlAffiche || '');
  async function imprimerPdf() {
    const w = window.open('', '_blank');
    try { if (w) w.document.write('<p style="font:14px system-ui;padding:24px;color:#16406A">Composition du PDF en A4 paysage…</p>'); } catch { /* */ }
    try {
      const r = await fetch('/api/impression/pdf', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ html: htmlAffiche, nom: nomFichier || titre, orientation: 'paysage',
          ...(pdf?.marge_basse ? { marge_basse: pdf.marge_basse } : {}),
          ...(pdf?.pied === false ? { pied: false, pagination: 'jamais' } : {}) }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      // Pas de PDF (serveur sans moteur) : on retombe sur le navigateur, en le disant.
      try { w?.close(); } catch { /* */ }
      informer(`${e.message || 'Le PDF n’a pas pu être composé.'} — impression par le navigateur : choisissez « Paysage » et l’échelle 100 %.`);
      imprimerNavigateur();
    }
  }
  function imprimer() { if (paysage) imprimerPdf(); else imprimerNavigateur(); }

  function imprimerNavigateur() {
    // Safari imprime le document PARENT lorsqu'on lui demande d'imprimer un
    // cadre alimenté par srcDoc : on obtenait une capture de l'écran, fenêtre
    // d'aperçu comprise. Une fenêtre dédiée porte le document seul, et
    // l'impression y est fidèle sur tous les navigateurs.
    const w = window.open('', '_blank');
    if (!w) {
      // Fenêtre bloquée : on retombe sur le cadre, imparfait mais fonctionnel
      // sur les navigateurs qui le gèrent.
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      try {
        if (nomFichier) iframe.contentDocument.title = nomFichier;
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) { console.error('[preview] impression échouée :', e); }
      return;
    }

    w.document.open();
    w.document.write(htmlAffiche);
    w.document.close();
    try { w.document.title = nomFichier || titre; } catch { /* sans conséquence */ }

    // Le document peut être prêt avant ou après la pose du gestionnaire selon
    // le navigateur : on couvre les deux, en n'imprimant qu'une fois.
    let lance = false;
    const lancer = () => {
      if (lance) return;
      lance = true;
      w.focus();
      w.print();
    };
    w.onload = lancer;
    setTimeout(lancer, 400);
  }

  return (
    /* LA FENÊTRE D'APERÇU REJOINT LES AUTRES.
       Elle gardait la forme d'avant : une barre marine pleine, un médaillon
       d'initiales, un bouton turquoise et une astuce en jaune. Toutes les
       autres fenêtres de Lucie sont désormais claires, tenues par un filet,
       leur titre en marine — c'est la règle du blanc réservé à ce qui se
       remplit, et elle vaut ici comme ailleurs. Un aperçu qui ne ressemble à
       aucune autre fenêtre donne l'impression d'avoir changé d'application au
       moment d'imprimer. */
    <div className="fixed inset-0 z-50 flex flex-col items-center p-2 sm:p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div aria-hidden="true"
        className="absolute inset-0 bg-[rgba(11,21,45,.32)] backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-fenetre shadow-dessus w-full max-w-5xl
                      flex flex-col overflow-hidden" style={{ height: '95vh' }}>

        {/* L'EN-TÊTE EST TON SUR TON, et un filet le sépare du document. */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0
                        border-b border-slate-200" style={{ background: 'var(--barre-fond, #F8FAFC)' }}>
          <div className="min-w-0">
            <div className="titre-ecran mb-0 truncate">{titre}</div>
            <div className="text-[11px] text-slate-400 truncate">
              {[sousTitre, nomFichier].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {astuceImpression && <span className="text-[11px] text-slate-400 hidden lg:inline">
              {astuceImpression}
            </span>}
            {pdf && (
              <button onClick={telechargerPdf} disabled={!pret || pdfEnCours}
                title={`Le PDF composé par le serveur — A4 ${pdf.orientation === 'paysage' ? 'paysage' : 'portrait'} imposé, quel que soit le navigateur`}
                className="bouton-sortir controle px-3 flex items-center gap-1.5 disabled:opacity-40">
                <IconSend size={15} /> {pdfEnCours ? 'PDF…' : `PDF — A4 ${pdf.orientation === 'paysage' ? 'paysage' : 'portrait'}`}
              </button>
            )}
            <button onClick={imprimer} disabled={!pret}
              className={`${pdf ? 'bouton' : 'bouton-sortir'} controle px-3 flex items-center gap-1.5 disabled:opacity-40`}>
              {!pdf && <IconSend size={15} />} {paysage ? 'Imprimer — A4 paysage' : pdf ? 'Imprimer (navigateur)' : 'Imprimer / PDF'}
            </button>
            {envoiPossible && envoiMail?.actif && peutGeste('envois.envoyer') && (
              <button onClick={() => setEnvoi(true)} disabled={!pret}
                title="Envoyer ce document par courriel — PDF joint ou dans le corps du message"
                className="bouton controle px-3 flex items-center gap-1.5 disabled:opacity-40">
                <IconMail size={15} /> Envoyer
              </button>
            )}
            {actionExtra}
            <button onClick={onClose} aria-label="Fermer"
              className="controle w-9 grid place-items-center rounded-champ
                         text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <IconX size={17} />
            </button>
          </div>
        </div>

        {/* ── iframe ── */}
        <iframe
          ref={iframeRef}
          srcDoc={htmlAffiche}
          onLoad={() => setPret(true)}
          title={nomFichier || titre}
          className="flex-1 w-full border-0 bg-gray-100"
        />
      </div>
      {envoi && (
        <EnvoiMailModal apercu={false}
          pieces={[{ html, nom_fichier: nomFichier || titre,
                     destinataire: destinataire || { nom: titre || nomFichier || 'Document' } }]}
          typeDoc={typeDoc || 'apercu'}
          contenu={[sousTitre, titre].filter(Boolean).join(' — ') || nomFichier || ''}
          sujet={sujetMail || [sousTitre, titre].filter(Boolean).join(' — ') || 'Votre document'}
          onClose={() => setEnvoi(false)} />
      )}
    </div>
  );
}

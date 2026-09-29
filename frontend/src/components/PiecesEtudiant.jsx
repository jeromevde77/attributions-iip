/**
 * TOUTES LES PIÈCES D'UN ÉTUDIANT, EN UNE LISTE (Charles, 29 septembre 2026 :
 * « je dois pouvoir sortir TOUS les documents étudiants depuis Éditions —
 * c'est pour simplifier le travail de mon équipe »).
 *
 * UNE SEULE LISTE, DEUX PORTES : Éditions (on choisit l'étudiant) et la fiche
 * de l'étudiant (« Imprimer ou envoyer »). Deux listes écrites à la main
 * avaient divergé : la fiche ne proposait ni la fiche d'inscription, ni les
 * pièces du congé-éducation, ni celles des aménagements raisonnables, et
 * Éditions ne proposait que les attestations de réussite. Une pièce qu'on ne
 * trouve pas là où on la cherche n'existe pas pour celui qui la cherche.
 *
 * Les pièces qui ne concernent pas l'étudiant (pas de dossier d'aménagement,
 * pas de congé-éducation cette année) ne s'affichent pas : une porte qui mène
 * à un refus n'aide personne.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconFileText, IconFileZip, IconCertificate, IconWorld, IconBriefcase, IconAccessible } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { GroupeFenetre, PieceFenetre } from './ui.jsx';
import MotivationDecision from './MotivationDecision.jsx';
import Annexe1 from './Annexe1.jsx';
import Annexe2 from './Annexe2.jsx';

const nomDe = e => `${String(e?.nom || '').toUpperCase()} ${e?.prenom || ''}`.trim();

export default function PiecesEtudiant({ etud, annee }) {
  const id = etud?.id;
  const [cep, setCep] = useState(null);
  const [dossierAR, setDossierAR] = useState(null);
  const [modale, setModale] = useState(null);    // 'motivation' | 'annexe1' | 'annexe2'
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null);

  useEffect(() => {
    if (!id) return;
    setCep(null); setDossierAR(null);
    fetch(`/api/cep/etudiant/${id}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => setCep(j?.cep || null)).catch(() => {});
    fetch(`/api/amenagements/etudiant/${id}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => setDossierAR(j?.courant || null)).catch(() => {});
  }, [id, annee]);

  const destinataire = { type: 'etudiant', id, nom: nomDe(etud) };
  /** Une pièce rendue par une route GET qui répond { html }. */
  const apercu = async (cle, url, titre, typeDoc) => {
    setEnCours(cle); setErreur(null);
    try {
      const r = await fetch(url, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      if (j.manques?.length && typeof j.manques[0] === 'object') {
        setErreur(`Des mentions obligatoires manquent : ${j.manques.map(m => `UE ${m.ue_num} — ${(m.manques || []).join(', ')}`).join(' · ')}`);
      }
      ouvrirApercu({ html: j.html, titre: j.titre || titre, sousTitre: nomDe(etud), nomFichier: j.nom ? String(j.nom).replace(/\.html$/, '') : undefined,
        typeDoc, destinataire, astuceImpression: 'A4 portrait' });
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const archive = async () => {
    setEnCours('pdfs'); setErreur(null);
    try {
      const r = await fetch(`/api/attestations/etudiant/${id}/pdfs?annee=toutes`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Les PDF n’ont pas pu être produits.'); }
      const nom = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'attestations.zip';
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = nom;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };

  const a = encodeURIComponent(annee);
  const groupes = [
    ['Résultats', [
      { cle: 'att', icone: IconCertificate, titre: `Attestations de réussite — ${annee}`, sous: 'Une par unité réussie cette année',
        clic: () => apercu('att', `/api/attestations/etudiant/${id}/document?annee=${a}`, `Attestations de réussite — ${annee}`, 'attestation_reussite') },
      { cle: 'att-toutes', icone: IconCertificate, titre: 'Attestations de réussite — toutes les années', sous: 'Tout le parcours, en un document',
        clic: () => apercu('att-toutes', `/api/attestations/etudiant/${id}/document?annee=toutes`, 'Attestations de réussite — toutes les années', 'attestation_reussite') },
      { cle: 'pdfs', icone: IconFileZip, titre: 'Attestations de réussite — un PDF par unité', sous: 'Toutes les années, une archive', clic: archive },
      { cle: 'parcours', icone: IconFileText, titre: 'Parcours de formation', sous: 'Schéma de capitalisation et unités acquises',
        clic: () => apercu('parcours', `/api/etudiants/${id}/fiche-parcours/document?annee=${a}`, 'Parcours de formation', 'parcours') },
      { cle: 'motivation', icone: IconFileText, titre: 'Motiver un refus ou un ajournement', sous: 'Annexes 8 et 9 — par acquis',
        clic: () => setModale('motivation') },
    ]],
    ['Inscription', [
      { cle: 'fiche', icone: IconFileText, titre: "Fiche d'inscription / reçu", sous: annee,
        clic: () => apercu('fiche', `/api/etudiants/${id}/fiche-inscription?annee=${a}`, "Fiche d'inscription / reçu", 'fiche_inscription') },
      { cle: 'frais', icone: IconFileText, titre: 'Frais de scolarité', sous: annee,
        clic: () => apercu('frais', `/api/frais-scolarite/etudiant/${id}/document?annee=${a}`, 'Frais de scolarité', 'frais_scolarite') },
    ]],
    ['Office des Étrangers', [
      { cle: 'annexe1', icone: IconWorld, titre: 'Visa ou titre de séjour étudiant (annexe 1)', sous: "Ressortissant d'un pays tiers",
        clic: () => setModale('annexe1') },
      { cle: 'annexe2', icone: IconWorld, titre: 'Progrès des études (annexe 2)', sous: 'Réclame la nationalité',
        clic: () => setModale('annexe2') },
    ]],
    ...(cep && cep.region !== 'flandre' ? [['Congé-éducation payé', [
      { cle: 'cep-i', icone: IconBriefcase, titre: "Attestation d'inscription régulière", sous: 'Toutes les unités — à remettre à l’employeur',
        clic: () => apercu('cep-i', `/api/cep/etudiant/${id}/piece/inscription?annee=${a}`, "Attestation d'inscription — CEP", 'cep_inscription') },
      { cle: 'cep-a', icone: IconBriefcase, titre: "Attestation d'assiduité", sous: 'Par période de trois mois',
        clic: () => apercu('cep-a', `/api/cep/etudiant/${id}/piece/assiduite?annee=${a}`, "Attestation d'assiduité — CEP", 'cep_assiduite') },
    ]]] : []),
    ...(dossierAR ? [['Aménagements raisonnables', [
      ['formulaire', 'Demande (cadres A et B)', 'Pièce confidentielle'],
      ['decision', 'Décision du Conseil des études', 'Motivée — art. 6 § 2'],
      ['notification', 'Notification de la décision', 'Lettre et décision, avec les recours'],
      ['mesures', 'Fiche « mesures » — chargés de cours', 'Les seules mesures retenues'],
    ].map(([t, titre, sous]) => ({ cle: `ar-${t}`, icone: IconAccessible, titre, sous,
      clic: () => apercu(`ar-${t}`, `/api/amenagements/dossier/${dossierAR.id}/piece/${t}`, titre, `amenagement_${t}`) }))]] : []),
  ];

  if (!id) return null;
  return (
    <div>
      {groupes.map(([titre, pieces]) => (
        <GroupeFenetre key={titre} titre={titre}>
          <div className="grid gap-1.5 md:grid-cols-2">
            {pieces.map(p => (
              <PieceFenetre key={p.cle} icone={p.icone} titre={p.titre}
                sous={enCours === p.cle ? 'Production…' : p.sous} desactive={!!enCours} onClick={p.clic} />
            ))}
          </div>
        </GroupeFenetre>
      ))}
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[12.5px] mt-2">{erreur}</div>}
      {/* HORS DE LA FENÊTRE QUI LES APPELLE : rendues dedans, elles s'y
          retrouvaient enfermées, derrière le voile. */}
      {modale && createPortal(
        modale === 'motivation' ? <MotivationDecision etudId={id} annee={annee} onClose={() => setModale(null)} />
          : modale === 'annexe1' ? <Annexe1 etudId={id} annee={annee} onClose={() => setModale(null)} />
            : <Annexe2 etudId={id} annee={annee} onClose={() => setModale(null)} />,
        document.body)}
    </div>
  );
}

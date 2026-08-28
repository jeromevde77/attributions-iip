import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Axe from '../components/Axe.jsx';
import Attributions from './Attributions.jsx';
import Planification from './Planification.jsx';
import DatesUE from '../components/DatesUE.jsx';
import StructureSection from './StructureSection.jsx';
import Rentree from './Rentree.jsx';
import { authHeaders } from '../lib/api.js';

/**
 * Axe ORGANISATION — « Qu'organise-t-on cette année ? »
 *
 * L'axe annuel, dans l'ordre du travail de rentrée. L'onglet par défaut est
 * Attributions : l'écran le plus utilisé garde son nom et reste à un clic.
 * Les Organisations d'UE (tableau + planificateur en ligne du temps) y
 * trouvent leur adresse principale ; Configuration → Paramétrage annuel y
 * renvoie désormais.
 */
export default function Organisation({ ongletInitial }) {
  const [params] = useSearchParams();
  const ongletDemande = params.get('onglet') || ongletInitial;
  const [annee, setAnnee] = useState('');
  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        const a = (Array.isArray(l) ? l : []).find(x => x.active) || (Array.isArray(l) ? l[0] : null);
        if (a?.code) setAnnee(a.code);
      })
      .catch(() => {});
  }, []);

  return (
    <Axe
      titre="Organisation"
      question="« Qu'organise-t-on cette année ? »"
      ongletInitial={ongletDemande}
      onglets={[
        { key: 'attributions', label: 'Attributions', sansMarge: true,
          rendu: <Attributions /> },
        { key: 'organisations', label: "Organisations d'UE",
          rendu: annee
            ? <DatesUE annee={annee} />
            : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div> },
        { key: 'rentree', label: 'Rentrée', sansMarge: true,
          rendu: annee
            ? <Rentree annee={annee} />
            : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div> },
        { key: 'structure', label: 'Schéma de capitalisation', sansMarge: true,
          rendu: annee
            ? <StructureSection annee={annee} />
            : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div> },
        { key: 'planification', label: 'Horaires & planification', sansMarge: true,
          rendu: <Planification /> },
        { key: 'locaux', label: 'Locaux', futur: true,
          description: "Les locaux quitteront Configuration pour rejoindre le travail d'organisation." },
      ]}
    />
  );
}

/* IMPORTER ET PROPOSER UNE AMÉLIORATION, DANS LA BARRE DU HAUT (3.5.130, Charles : « simplifier les menus »). Ils étaient sur
 * chaque rail ; « Importer » ne paraît que sur un axe qui en a une porte (`lib/barreOutils.js`), « Proposer une amélioration »
 * partout. */
import { lazy, Suspense, useState } from 'react';
import { IconDatabaseImport, IconBulb } from '@tabler/icons-react';
import { useImport } from '../lib/barreOutils.js';

const Ameliorations = lazy(() => import('./Ameliorations.jsx'));

export default function OutilsBarre() {
  const importer = useImport();
  const [idees, setIdees] = useState(false);
  return (<>
    {importer && (
      <button type="button" onClick={importer} aria-label="Importer" title="Importer (classeurs, listes)"
        className="objet-barre objet-barre-icone"><IconDatabaseImport size={16} /></button>)}
    <button type="button" onClick={() => setIdees(true)} aria-label="Proposer une amélioration" title="Proposer une amélioration"
      className="objet-barre objet-barre-icone"><IconBulb size={16} /></button>
    {idees && (
      <Suspense fallback={null}>
        <Ameliorations ecran={document.title || window.location.pathname} onClose={() => setIdees(false)} />
      </Suspense>)}
  </>);
}

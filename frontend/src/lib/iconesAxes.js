/**
 * L'ICÔNE DE CHAQUE RUBRIQUE, ÉCRITE UNE FOIS (Charles, 3 octobre 2026 :
 * « vérifie que les icônes du rail et du menu soient bien identiques et
 * liées »). La barre du haut et le rail de chaque écran lisent ici : changer
 * un dessin le change partout, et deux dessins pour un même territoire ne
 * peuvent plus exister.
 */
import { IconHome, IconChalkboard, IconChalkboardTeacher, IconBooks, IconReportAnalytics,
  IconLibrary, IconSettings } from '@tabler/icons-react';
import { IconEtudiant } from '../components/IconesLucie.jsx';

export const ICONE_AXE = {
  accueil: IconHome,
  mesCours: IconChalkboard,
  etudiants: IconEtudiant,
  personnel: IconChalkboardTeacher,
  organisation: IconBooks,
  gestion: IconReportAnalytics,
  documentation: IconLibrary,
  configuration: IconSettings,
};

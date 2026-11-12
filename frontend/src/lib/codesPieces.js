// ─────────────────────────────────────────────────────────────────────────────
// LES CODES DES PIÈCES ÉTUDIANTES (3.5.376, Charles, 12 novembre 2026 : « numéroter les types de documents étudiants, ils deviennent
// nombreux ; et peut-être des codes couleurs » ; tranché : par famille — R-01, I-01… — ; à l'écran, sur la pièce imprimée, et une
// liste de référence ; un filet discret par famille, jamais une couleur d'état).
// DEUX COPIES, UNE TABLE : celle-ci (écrans) et backend/src/lib/codesPieces.js (pièces, liste imprimable). Qui change l'une change
// l'autre. Un code ne se réattribue jamais : une pièce retirée garde le sien, une pièce nouvelle prend le suivant de sa famille.
// ─────────────────────────────────────────────────────────────────────────────
export const FAMILLES = [
  { k: 'R', nom: 'Résultats', couleur: '#19537E' },
  { k: 'I', nom: 'Inscription', couleur: '#05B7E6' },
  { k: 'A', nom: 'Office des Étrangers', couleur: '#F9B619' },
  { k: 'C', nom: 'Congé-éducation payé', couleur: '#64748B' },
  { k: 'V', nom: 'Valorisation des acquis', couleur: '#0F766E' },
  { k: 'M', nom: 'Aménagements raisonnables', couleur: '#7C6F5B' },
];

/** code, clé du catalogue (lib/documents.js), nom, usage — et les clés que les écrans emploient pour la même pièce. */
export const PIECES = [
  { code: 'R-01', cle: 'attestation_reussite', nom: 'Attestation de réussite d’unité', usage: 'Une par unité réussie ; signée, cachetée, QR d’authenticité.', alias: ['reussite', 'att', 'att-toutes'] },
  { code: 'R-02', cle: 'motivation_ajournement', nom: 'Motivation d’une décision d’ajournement', usage: 'Acquis par acquis, avec les cours à représenter (annexe 8).', alias: ['ajournement'] },
  { code: 'R-03', cle: 'motivation_refus', nom: 'Motivation d’une décision de refus', usage: 'Acquis par acquis, voies de recours (annexe 9).', alias: ['refus', 'motivation_decision', 'motivation'] },
  { code: 'R-04', cle: 'bulletin', nom: 'Bulletin de parcours', usage: 'Toutes les unités, année après année, et le schéma.', alias: [] },
  { code: 'R-05', cle: 'parcours', nom: 'Parcours de formation', usage: 'Schéma de capitalisation et unités acquises (paysage).', alias: [] },
  { code: 'I-01', cle: 'fiche_inscription', nom: 'Fiche d’inscription / reçu', usage: 'PAE, droits d’inscription, engagement signé.', alias: ['fiche'] },
  { code: 'I-02', cle: 'attestation_inscription', nom: 'Attestation d’inscription', usage: 'Mutuelle, CPAS, employeur… : dates, congés, bloc, crédits.', alias: ['att_inscription', 'att-ins'] },
  { code: 'I-03', cle: 'attestation_allocations', nom: 'Attestation d’inscription — allocations familiales', usage: 'Pour la caisse d’allocations familiales.', alias: ['att_allocations', 'att-af'] },
  { code: 'I-04', cle: 'frais_scolarite', nom: 'Frais de scolarité', usage: 'Ce qui est dû, versé, et le QR de paiement.', alias: ['frais'] },
  { code: 'I-05', cle: 'pae', nom: 'Programme annuel de l’étudiant (PAE)', usage: 'Les unités de l’année et leurs crédits.', alias: [] },
  { code: 'A-01', cle: 'annexe1', nom: 'Visa ou titre de séjour étudiant (annexe 1)', usage: 'Ressortissant d’un pays tiers, séjour limité aux études.', alias: [] },
  { code: 'A-02', cle: 'annexe2', nom: 'Progrès des études (annexe 2)', usage: 'Crédits de l’année et progression, pour l’Office des Étrangers.', alias: [] },
  { code: 'C-01', cle: 'cep_inscription', nom: 'Congé-éducation — attestation d’inscription régulière', usage: 'À l’employeur, au plus tard le 31 octobre.', alias: ['cep-i'] },
  { code: 'C-02', cle: 'cep_assiduite', nom: 'Congé-éducation — attestation d’assiduité', usage: 'Par période de trois mois, d’après les présences.', alias: ['cep-a'] },
  { code: 'C-03', cle: 'cep_seconde_session', nom: 'Congé-éducation — attestation de seconde session', usage: 'Unités ajournées et dates de seconde session.', alias: ['cep-s'] },
  { code: 'V-01', cle: 'valorisation_notification', nom: 'Valorisation — notification des décisions', usage: 'À l’étudiant, après la séance de valorisation.', alias: [] },
  { code: 'V-02', cle: 'valorisation_ue', nom: 'Valorisation — PV et attestations', usage: 'Annexe 4 et attestations de réussite par valorisation.', alias: [] },
  { code: 'M-01', cle: 'amenagement_formulaire', nom: 'Aménagements — demande (cadres A et B)', usage: 'Le formulaire de la demande.', alias: [] },
  { code: 'M-02', cle: 'amenagement_decision', nom: 'Aménagements — décision du Conseil des études', usage: 'Décision motivée.', alias: [] },
  { code: 'M-03', cle: 'amenagement_notification', nom: 'Aménagements — notification de la décision', usage: 'Lettre et décision, une enveloppe.', alias: [] },
  { code: 'M-04', cle: 'amenagement_mesures', nom: 'Aménagements — fiche « mesures »', usage: 'Aux chargés de cours : les seules mesures accordées.', alias: [] },
];

const parCle = new Map(PIECES.flatMap(p => [[p.cle, p], ...p.alias.map(a => [a, p])]));
export const pieceDe = cle => parCle.get(cle) || null;
export const familleDe = code => FAMILLES.find(f => f.k === String(code || '')[0]) || null;


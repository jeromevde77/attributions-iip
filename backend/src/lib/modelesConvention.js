// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES MODÈLES DE CONVENTION : le texte vit dans Lucie, les données
// viennent de Lucie.
//
// (Charles, 3 octobre 2026 : les conventions s'intègrent à Lucie, avec des
// textes modèles qui y vivent ; le registre est une face de Documentation.)
//
// TROIS FAMILLES SE COMPOSENT, UNE QUATRIÈME SE DÉPOSE :
//   cadre_stage     Convention-cadre de stage (IIP ↔ institution d'accueil),
//                   annuelle, renouvelée tacitement ;
//   partenariat     Partenariat pédagogique (exemple : l'école Les Pommiers) ;
//   etablissements  Convention entre établissements (exemple : CREA – IIP) ;
//   partenaire      Document du partenaire — un PDF reçu, qu'on dépose et
//                   qu'on signe : aucun modèle, on n'écrit pas le texte d'autrui.
// La mise à disposition de locaux n'est pas une affaire de Lucie : la HELB en
// est le référent (Charles, 3 octobre 2026).
//
// LE TEXTE EST UN TEXTE DU CORPUS. Il s'écrit avec l'éditeur de Documentation,
// passe par le même filtre (`assainir`, lib/texteCorpus.js) et se versionne
// comme lui : une version publiée ne se modifie plus, corriger = publier la
// suivante en disant ce qui change. Une convention composée garde le numéro de
// la version qui l'a produite.
//
// LES DONNÉES NE S'ÉCRIVENT PAS DANS LE TEXTE. Un champ s'y désigne par un
// jeton « {{champ}} » ; la composition le remplace. Le bloc de l'Institut —
// nom, adresse, représentant, qualité, téléphone, courriel, pouvoir
// organisateur — vient d'`identiteEtablissement()` et de la table
// `etablissement` : c'est ainsi que « Directeur a.i. » et l'adresse du campus
// de la Plaine, que portaient les modèles Word, ne peuvent plus revenir.
// ─────────────────────────────────────────────────────────────────────────────

export const FAMILLES = {
  cadre_stage:    { libelle: 'Convention-cadre de stage', type: 'stage', modele: true, tacite: true },
  partenariat:    { libelle: 'Partenariat pédagogique', type: 'partenariat', modele: true },
  etablissements: { libelle: 'Convention entre établissements', type: 'collaboration', modele: true },
  partenaire:     { libelle: 'Document du partenaire', type: null, modele: false },
};

/* LES CHAMPS QU'UN MODÈLE PEUT CITER. Un jeton inconnu est refusé à la
 * publication : il resterait sinon imprimé tel quel, « {{partenaire.nmo}} »,
 * sur une pièce qu'on signe. `bloc` : le champ produit des paragraphes ou une
 * liste, il doit occuper seul son paragraphe. */
const CHAMPS_IIP = [
  ['iip.nom', "Nom de l'établissement (Configuration → Établissement)"],
  ['iip.adresse', "Adresse de l'établissement"],
  ['iip.representant', 'Signataire réglé dans Configuration (Prénom NOM)'],
  ['iip.qualite', 'Qualité du signataire (Directeur)'],
  ['iip.tel', "Téléphone de l'établissement"],
  ['iip.email', "Courriel de contact de l'établissement"],
  ['iip.po', "Pouvoir organisateur et son numéro d'entreprise"],
  ['iip.ville', "Ville de l'établissement"],
];
const CHAMPS_PARTENAIRE = [
  ['partenaire.nom', 'Dénomination du partenaire'],
  ['partenaire.adresse', 'Adresse (légale) du partenaire'],
  ['partenaire.representant', 'Représentant du partenaire'],
  ['partenaire.fonction', 'Fonction du représentant'],
  ['partenaire.tel', 'Téléphone du partenaire'],
  ['partenaire.email', 'Courriel du partenaire'],
];
export const CHAMPS = {
  cadre_stage: [
    ...CHAMPS_IIP, ...CHAMPS_PARTENAIRE,
    ['annee', 'Année académique'],
    ['periode.debut', 'Date de prise de cours'],
    ['cursus', 'Cursus concernés (liste)', true],
    ['signatures', 'Place du bloc de signatures (à défaut : en fin de texte)'],
  ],
  partenariat: [
    ...CHAMPS_IIP, ...CHAMPS_PARTENAIRE,
    ['partenaire.po', 'Pouvoir organisateur du partenaire'],
    ['partenaire.sigle', 'Appellation courte du partenaire (« l’école Les Pommiers »)'],
    ['partenaire.interlocuteurs', 'Interlocuteurs du partenaire pour l’évaluation'],
    ['annee', 'Année académique'],
    ['periode.debut', 'Début de la convention'],
    ['periode.fin', 'Fin de la convention'],
    ['objet', 'Objet du partenariat'],
    ['cursus', 'Cursus (« bachelier en Psychomotricité »)'],
    ['ue', "Unité d'enseignement"],
    ['cours', 'Cours concernés'],
    ['enseignant_referent', 'Enseignant référent'],
    ['seances', 'Dates des séances (liste)', true],
    ['horaires', 'Horaires des séances (paragraphes)', true],
    ['organisation', 'Organisation des séances (paragraphes)', true],
    ['locaux', 'Locaux et matériel mis à disposition'],
    ['annexes', 'Annexes (paragraphe omis si vide)'],
    ['signatures', 'Place du bloc de signatures (à défaut : en fin de texte)'],
  ],
  etablissements: [
    ...CHAMPS_IIP, ...CHAMPS_PARTENAIRE,
    ['partenaire.sigle', 'Appellation courte du partenaire (« CREA »)'],
    ['annee', 'Année académique'],
    ['signatures', 'Place du bloc de signatures (à défaut : en fin de texte)'],
  ],
};
const BLOCS = new Set(Object.values(CHAMPS).flat().filter(c => c[2]).map(c => c[0]));

/** Les champs requis pour composer — ce qui manque est nommé, rien ne sort à trous. */
export const REQUIS = {
  cadre_stage: ['partenaire.nom', 'partenaire.adresse', 'partenaire.representant', 'partenaire.fonction',
                'periode.debut', 'cursus'],
  partenariat: ['partenaire.nom', 'partenaire.adresse', 'partenaire.representant', 'partenaire.fonction',
                'partenaire.sigle', 'periode.debut', 'periode.fin', 'objet', 'cursus', 'ue', 'cours',
                'enseignant_referent', 'seances', 'horaires', 'organisation', 'locaux'],
  etablissements: ['partenaire.nom', 'partenaire.representant', 'partenaire.fonction', 'partenaire.sigle'],
};
export const LIBELLE_CHAMP = Object.fromEntries(Object.values(CHAMPS).flat().map(c => [c[0], c[1]]));

const JETON = /\{\{\s*([a-z_]+(?:\.[a-z_]+)?)\s*\}\}/g;

/** Les jetons qu'un texte cite, et ceux que la famille ne connaît pas. */
export function jetonsInconnus(famille, html) {
  const connus = new Set((CHAMPS[famille] || []).map(c => c[0]));
  const vus = new Set([...String(html || '').matchAll(JETON)].map(m => m[1]));
  return [...vus].filter(j => !connus.has(j));
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const vide = v => v == null || (Array.isArray(v) ? !v.length : !String(v).trim());

/** Un texte libre multiligne → des paragraphes (bloc) ou des <br> (en ligne). */
function enParagraphes(t) {
  return String(t || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    .map(b => `<p>${esc(b).replace(/\n/g, '<br>')}</p>`).join('');
}
function enBloc(cle, v) {
  if (Array.isArray(v)) return `<ul>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return enParagraphes(v);
}
function enLigne(v) {
  if (Array.isArray(v)) return esc(v.join(', '));
  return esc(String(v).trim()).replace(/\n+/g, '<br>');
}
const majuscule = s => s.replace(/^(\s*)(\S)/, (m, a, b) => a + b.toUpperCase());

/**
 * Le texte d'un modèle, ses jetons remplacés.
 *   — un jeton « bloc » seul dans son paragraphe remplace le paragraphe ;
 *   — une ligne (segment entre deux <br>) ou un paragraphe dont TOUS les jetons
 *     sont vides disparaît : « Tél. : » sans numéro ne s'imprime pas ;
 *   — un jeton en début de paragraphe prend une majuscule (« L’école… »).
 * `{{signatures}}` est remplacé par `signatures` (HTML déjà composé).
 */
export function remplirModele(html, valeurs, signatures = '') {
  let h = String(html || '');
  const val = cle => (cle === 'signatures' ? null : valeurs[cle]);

  // Le bloc de signatures, à sa place.
  h = h.replace(/<p[^>]*>\s*\{\{\s*signatures\s*\}\}\s*<\/p>/g, '\u0000SIGN\u0000');

  // Les blocs seuls dans leur paragraphe.
  h = h.replace(/<p[^>]*>\s*\{\{\s*([a-z_.]+)\s*\}\}\s*<\/p>/g, (m, cle) => {
    if (!BLOCS.has(cle)) return m;
    const v = val(cle);
    return vide(v) ? '' : enBloc(cle, v);
  });

  // Paragraphes et éléments de liste : on retire ce qui ne porte que du vide.
  h = h.replace(/<(p|li|h[1-4])([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, attrs, corps) => {
    if (!JETON.test(corps)) { JETON.lastIndex = 0; return m; }
    JETON.lastIndex = 0;
    const segments = corps.split(/<br\s*\/?>/i).filter(seg => {
      const jetons = [...seg.matchAll(JETON)].map(x => x[1]);
      return !jetons.length || jetons.some(j => !vide(val(j)));
    });
    if (!segments.length) return '';
    let c = segments.join('<br>').replace(JETON, (x, cle) => (vide(val(cle)) ? '……………' : enLigne(val(cle))));
    // Majuscule si le paragraphe COMMENCE par un jeton.
    if (/^\s*(?:<(?:strong|b|em)>)?\s*\{\{/.test(segments[0])) {
      c = c.replace(/^(\s*(?:<(?:strong|b|em)>)?)([^<]*)/, (x, a, t) => a + majuscule(t));
    }
    return `<${tag}${attrs}>${c}</${tag}>`;
  });

  // Un jeton resté hors paragraphe (cellule de tableau…).
  h = h.replace(JETON, (x, cle) => (vide(val(cle)) ? '……………' : enLigne(val(cle))));

  return h.includes('\u0000SIGN\u0000') ? h.replace('\u0000SIGN\u0000', signatures) : h + signatures;
}

/** Le marqueur posé dans la case de la griffe — invisible à l'impression, lu
 *  dans le PDF pour savoir où apposer le fac-similé (services : conventions). */
export const MARQUE_CACHET = 'LUCIECACHETIIP';

/** Le bloc de signatures : deux colonnes, et la case de la griffe de l'IIP. */
export function blocSignatures({ iipNom, iipSignataire, iipQualite, partNom, partRepresentant, partFonction }) {
  return `
<div class="conv-signatures">
  <table class="conv-sign"><tr>
    <td>
      <div class="conv-pour">Pour l'${esc(iipNom)}</div>
      <div class="conv-nom">${esc(iipSignataire)}</div>
      <div class="conv-qual">${esc(iipQualite)}</div>
      <div class="conv-case"><span class="conv-marque">${MARQUE_CACHET}</span></div>
    </td>
    <td>
      <div class="conv-pour">Pour ${esc(partNom)}</div>
      <div class="conv-nom">${esc(partRepresentant || '')}</div>
      <div class="conv-qual">${esc(partFonction || '')}</div>
      <div class="conv-case conv-case-part"><span class="conv-lu">Date, signature et cachet</span></div>
    </td>
  </tr></table>
</div>`;
}

/** Les styles du corps d'une convention — l'enveloppe commune fait le reste. */
export const STYLES_CONVENTION = `
  .conv { font-size: 9.5pt; text-align: justify; }
  .conv h2 { font-size: 10.5pt; margin: 5mm 0 1.5mm; letter-spacing: -.1pt; }
  .conv h3 { font-size: 9.5pt; margin: 3mm 0 1mm; }
  .conv p { margin: 1.2mm 0; line-height: 1.45; }
  .conv ul, .conv ol { margin: 1mm 0 1.5mm; padding-left: 6mm; }
  .conv li { margin: 0.6mm 0; line-height: 1.4; }
  .conv li > p { margin: 0; }   /* l'éditeur range le texte d'un élément de liste dans un paragraphe */
  .conv-signatures { margin-top: 8mm; break-inside: avoid; page-break-inside: avoid; }
  .conv-signatures + p { margin-top: 5mm; }
  table.conv-sign { width: 100%; border-collapse: collapse; margin: 0; }
  table.conv-sign td { border: 0; width: 50%; padding: 0 3mm 0 0; vertical-align: top; font-size: 9.5pt; }
  table.conv-sign td:last-child { padding: 0 0 0 3mm; }
  .conv-pour { font-weight: 700; color: #1B2B4B; }
  .conv-nom { margin-top: 1mm; }
  .conv-qual { color: #475569; }
  .conv-case { position: relative; width: 72mm; height: 34mm; margin-top: 3mm;
               border: 0.3mm dashed #CBD2DC; border-radius: 1.5mm; }
  .conv-marque { position: absolute; top: 0; left: 0; font-size: 4pt; line-height: 1;
                 color: #FFFFFF; }
  .conv-lu { position: absolute; bottom: 1.5mm; left: 2mm; font-size: 7pt; color: #94A3B8; }
`;

// ── Les textes de départ ────────────────────────────────────────────────────
// Repris des modèles Word fournis par la direction, la langue corrigée, la
// numérotation rendue explicite, les données remplacées par des jetons. LA
// SUBSTANCE N'A PAS ÉTÉ TOUCHÉE : chaque correction est dite dans la note de
// la version 1, pour que la direction la relise et la défasse si besoin.

const CADRE_STAGE = `
<h2>1. Parties à la convention</h2>
<h3>a. Personne responsable dans l'établissement d'enseignement pour adultes</h3>
<p>Dénomination : {{iip.nom}}<br>Adresse : {{iip.adresse}}<br>Représenté par {{iip.representant}}, {{iip.qualite}}<br>Tél. : {{iip.tel}}<br>Courriel : {{iip.email}}</p>
<h3>b. Personne responsable dans l'institution d'accueil</h3>
<p>Dénomination : {{partenaire.nom}}<br>Adresse légale : {{partenaire.adresse}}<br>Représentée par {{partenaire.representant}}, assurant la fonction de {{partenaire.fonction}}<br>Tél. : {{partenaire.tel}}<br>Courriel : {{partenaire.email}}</p>
<p>Les personnes ci-référencées sont expressément les personnes responsables de la transmission de toute communication.</p>
<h2>2. Modalités pratiques</h2>
<h3>a. Période concernée</h3>
<p>La présente convention est valable pour la durée d'une année académique prenant cours à partir du {{periode.debut}}.</p>
<p>Elle est tacitement renouvelée. Toutefois, chaque partie peut rompre la convention de manière unilatérale, moyennant un préavis de trois mois, notifié à l'autre partie par courrier recommandé et par courriel.</p>
<h3>b. Cursus concernés</h3>
<p>{{cursus}}</p>
<h2>3. Engagements respectifs</h2>
<h3>a. L'institution d'accueil s'engage à :</h3>
<ul>
<li>avant le début de l'année académique concernée par le stage, communiquer à la personne responsable à l'Institut Ilya Prigogine (ou à son délégué) le nombre et le niveau d'études des étudiants-stagiaires qu'elle peut accueillir, pour l'année académique concernée, au sein des différents services. Ces quotas sont déterminés par l'institution d'accueil afin de garantir aux étudiants-stagiaires un accueil adéquat et un apport suffisant des éléments de connaissances, d'aptitudes et d'attitudes nécessaires à leur formation professionnelle, et ce dans le respect des dispositions légales régissant l'organisation de l'enseignement supérieur et des objectifs de stage définis dans le document annexé à la présente convention ;</li>
<li>désigner un référent dans l'institution d'accueil pour chaque étudiant-stagiaire accueilli ;</li>
<li>transmettre le règlement de l'institution au responsable dans l'Institut Ilya Prigogine et à l'étudiant-stagiaire ;</li>
<li>accueillir l'étudiant-stagiaire au sein de l'institution d'accueil ;</li>
<li>respecter la planification du stage établie de commun accord avec l'Institut Ilya Prigogine ainsi que l'horaire à prester par l'étudiant-stagiaire, dans le respect de la commission paritaire régissant le règlement de travail de l'institution d'accueil ;</li>
<li>respecter les dispositions en matière d'hygiène et de sécurité ;</li>
<li>fournir à l'étudiant-stagiaire les mêmes conditions de travail et le même matériel que ceux mis à la disposition du personnel (en ce compris les tenues et leur entretien) ;</li>
<li>accompagner l'étudiant-stagiaire dans le développement de ses compétences ;</li>
<li>respecter le caractère personnel et confidentiel de toutes les informations concernant l'établissement d'enseignement et l'étudiant-stagiaire.</li>
</ul>
<h3>b. L'Institut Ilya Prigogine s'engage à :</h3>
<ul>
<li>assurer une guidance de stage par des enseignants référents ; celle-ci sera adaptée au nombre d'étudiants-stagiaires et tiendra compte des spécificités et des moyens disponibles ;</li>
<li>informer les étudiants-stagiaires de leurs obligations ;</li>
<li>transmettre une copie de la convention de stage à l'étudiant-stagiaire ;</li>
<li>communiquer à l'institution d'accueil :
<ul><li>le planning général ;</li><li>les plages horaires ;</li><li>les types de stages ;</li><li>le nombre d'étudiants-stagiaires planifié par service et/ou discipline ;</li></ul></li>
<li>communiquer en temps utile à l'institution d'accueil toute modification des plannings de stage ;</li>
<li>organiser une rencontre annuelle avec l'institution d'accueil concernant l'organisation des stages et l'encadrement des étudiants-stagiaires.</li>
</ul>
<h2>4. Encadrement pédagogique</h2>
<h3>a. Rôle du référent dans l'institution d'accueil</h3>
<ul>
<li>Accueillir l'étudiant-stagiaire ou organiser son accueil ;</li>
<li>veiller au bon déroulement du stage, organiser et coordonner le travail confié à l'étudiant-stagiaire en tenant compte des objectifs et des critères de stage, de façon à ce que les tâches s'inscrivent dans le programme de formation et ne dépassent à aucun moment le niveau de compétence visé ;</li>
<li>veiller à l'intégration et au bien-être de l'étudiant durant son stage ; être une personne de confiance pour l'étudiant-stagiaire ;</li>
<li>apporter son expérience et sa connaissance à l'étudiant-stagiaire et assurer la formation de celui-ci dans son cadre d'exercice ;</li>
<li>être responsable, par délégation de son cadre, de l'accompagnement de l'étudiant-stagiaire ;</li>
<li>communiquer en cours de stage toute remarque ou observation utile à l'étudiant-stagiaire dans le lieu de stage ;</li>
<li>conseiller et guider l'étudiant-stagiaire en collaboration étroite avec l'enseignant référent ;</li>
<li>favoriser les contacts, au sein du lieu de stage, avec l'équipe et avec l'étudiant-stagiaire ;</li>
<li>collaborer à l'évaluation de l'étudiant-stagiaire selon les dispositions communiquées par l'Institut Ilya Prigogine ;</li>
<li>en cas de manquement grave de l'étudiant-stagiaire, le signaler sans délai à l'enseignant référent et à la personne responsable à l'Institut Ilya Prigogine au moyen d'un rapport écrit. Le cas échéant, proposer, en concertation avec l'Institut Ilya Prigogine, le renvoi de l'étudiant-stagiaire de son stage.</li>
</ul>
<h3>b. Rôle de l'enseignant référent</h3>
<ul>
<li>Déterminer, en concertation avec le référent dans l'institution d'accueil, les objectifs opérationnels attendus au terme de la période de stage ;</li>
<li>proposer et communiquer un agenda des rencontres au référent dans l'institution d'accueil et à l'étudiant-stagiaire ;</li>
<li>accompagner l'étudiant-stagiaire, le conseiller et le guider tout au long de ses activités de stage ;</li>
<li>s'assurer de l'intégration et du bien-être de l'étudiant durant son stage ; être à l'écoute de l'étudiant-stagiaire ;</li>
<li>communiquer en cours de stage toute remarque ou observation utile à l'étudiant-stagiaire et au référent dans l'institution d'accueil ;</li>
<li>conseiller et guider l'étudiant-stagiaire en collaboration étroite avec le référent dans l'institution d'accueil ;</li>
<li>entretenir les contacts avec le lieu de stage et avec l'étudiant-stagiaire dans le lieu de stage ;</li>
<li>participer à l'évaluation de l'étudiant-stagiaire, conformément aux dispositions déterminées par l'Institut Ilya Prigogine.</li>
</ul>
<h2>5. Horaires</h2>
<p>L'horaire de travail de l'étudiant-stagiaire est établi en concertation entre le responsable de l'Institut Ilya Prigogine et le responsable dans l'institution d'accueil (ou leurs délégués), selon les horaires en vigueur dans le lieu de stage, les nécessités pédagogiques et dans le respect de la législation relative au travail du personnel. L'étudiant-stagiaire accueilli est surnuméraire par rapport au personnel en place et ne remplace en aucun cas un membre du personnel.</p>
<p>Tout changement du planning et/ou des plages horaires est convenu de commun accord entre l'institution d'accueil et l'Institut Ilya Prigogine (ou leurs délégués). L'institution d'accueil en informe l'étudiant-stagiaire, l'enseignant référent et le référent dans l'institution d'accueil. Le cas échéant, l'horaire peut être adapté de commun accord pour un motif impérieux invoqué par l'étudiant-stagiaire.</p>
<p>Durant une période de stage, une permutation de service peut être effectuée à des fins pédagogiques, à titre exceptionnel et en accord avec l'ensemble des parties (le référent dans l'institution d'accueil, l'enseignant référent et l'étudiant-stagiaire). Sous réserve de cet accord, l'étudiant-stagiaire peut être temporairement et provisoirement détaché dans un autre service si un nouvel apprentissage est préconisé.</p>
<h2>6. Absences et retards</h2>
<ul>
<li>Toute absence doit être signalée par l'étudiant-stagiaire à l'Institut Ilya Prigogine et à son lieu de stage. Cette absence fait l'objet d'une récupération après concertation avec l'ensemble des parties à la présente convention et en conformité avec le règlement de l'Institut Ilya Prigogine ;</li>
<li>si l'absence se prolonge au-delà d'un jour, l'Institut Ilya Prigogine communique au référent dans l'institution d'accueil tout élément concernant cette absence ;</li>
<li>le référent dans l'institution d'accueil relaie à l'Institut Ilya Prigogine toute absence injustifiée de l'étudiant-stagiaire.</li>
</ul>
<h2>7. Évaluations et litiges</h2>
<ul>
<li>Au terme de la période de stage, le responsable du lieu de stage s'engage à évaluer l'étudiant-stagiaire conformément aux dispositions communiquées par l'Institut Ilya Prigogine.</li>
<li>Nonobstant l'évaluation finale, l'institution d'accueil communique régulièrement, et chaque fois que nécessaire, à l'enseignant référent et à l'étudiant-stagiaire, par écrit, toute remarque relative à la qualité du travail de ce dernier s'inscrivant dans le référentiel de compétences.</li>
<li>Tout manquement avéré et constaté par le référent au sein de l'institution d'accueil ou par l'enseignant référent sera notifié dans un rapport et transmis, endéans les cinq jours au plus, au responsable de l'Institut Ilya Prigogine et au responsable dans l'institution d'accueil. À la demande de n'importe quelle partie contractante, une rencontre peut être organisée avec l'étudiant-stagiaire dans les délais les plus brefs et dans le respect des droits de la défense. Cependant, tout manquement grave conduisant à l'interruption d'une période de stage ou à l'exclusion de l'étudiant-stagiaire doit faire l'objet d'une concertation préalable entre les parties contractantes et l'étudiant-stagiaire.</li>
</ul>
<h2>8. Assurances</h2>
<p>L'étudiant-stagiaire et l'enseignant référent relèvent de la responsabilité de l'établissement d'enseignement où ils sont respectivement inscrits et engagés.</p>
<p>L'étudiant-stagiaire est couvert par l'assurance accident du travail et par l'assurance responsabilité civile souscrites par la HELB - Ilya Prigogine.</p>
<ul>
<li>Dénomination de la compagnie d'assurance : ETHIAS</li>
<li>Police d'assurance scolaire : 45.425.074</li>
<li>Police d'assurance contre les accidents du travail : 6.569.518</li>
</ul>
<p>L'Institut Ilya Prigogine joint à la présente convention la ou les attestation(s) de la compagnie d'assurance où la période de couverture est clairement stipulée.</p>
<p>L'institution d'accueil fait explicitement mention, dans son contrat d'assurance en responsabilité civile, de la participation d'étudiants-stagiaires et d'enseignants référents aux activités de l'institution.</p>
<p>Tout accident survenu à l'étudiant-stagiaire ou causé par son fait doit être porté à la connaissance des référents, de la personne responsable dans l'Institut Ilya Prigogine et du responsable dans l'institution d'accueil. Un rapport circonstancié sera transmis, dans les plus brefs délais, à la personne responsable dans l'Institut Ilya Prigogine.</p>
<h2>9. Non-rémunération</h2>
<ul>
<li>En aucun cas, la convention de stage ne donne naissance à un contrat de travail ou à un contrat d'occupation d'étudiant, au sens des dispositions contenues dans la loi du 3 juillet 1978 relative aux contrats de travail (M.B., 22 août 1978).</li>
<li>Si, après la fin de ses études, l'étudiant-stagiaire est engagé par le lieu de stage, la durée du stage ne peut pas être prise en compte dans le calcul de son ancienneté sous contrat de travail ou sous contrat d'occupation d'étudiant.</li>
<li>Le stage est non rémunéré, conformément à l'article 104 de la loi-programme du 2 août 2002 (M.B., 29 août 2002).</li>
</ul>
<h2>10. Examens médicaux</h2>
<ul>
<li>Conformément aux dispositions du titre IV du livre X du Code du bien-être au travail, l'institution d'accueil confie l'examen médical des étudiants-stagiaires au SEPPT de l'ASBL Ilya Prigogine (pouvoir organisateur de l'Institut Ilya Prigogine).</li>
<li>L'institution d'accueil fournit les analyses de risques établies pour les différents terrains de stage ainsi qu'un document relatif à la surveillance de santé des étudiants-stagiaires, au plus tard pour le 30 août de chaque année.</li>
<li>Dans le cadre de la protection de la maternité, l'étudiante-stagiaire enceinte ou allaitante se conforme à la politique en vigueur au sein de l'institution d'accueil. Elle peut se voir interdire de poursuivre son stage.</li>
</ul>
<h2>11. Suivi de la convention et de sa mise en application</h2>
<ul>
<li>La présente convention est reconduite de manière tacite. Toutefois, dans une démarche de qualité visant à améliorer l'encadrement des étudiants-stagiaires, un bilan annuel d'évaluation est organisé entre les parties.</li>
<li>Il pourra être mis fin à la présente convention de commun accord.</li>
<li>Chaque partie peut rompre la convention de manière unilatérale, moyennant un préavis de trois mois, notifié par courrier recommandé et par courriel (supra, point 2.a).</li>
<li>La présente convention peut être dénoncée immédiatement pour des raisons impérieuses telles que — sans être exhaustif — une modification essentielle de structure ou un changement fondamental de législation.</li>
<li>En aucun cas, une partie ne pourra prétendre à un dédommagement à charge de l'autre partie.</li>
</ul>
<h2>12. Droit applicable et juridictions compétentes</h2>
<ul>
<li>La présente convention est soumise au droit belge.</li>
<li>Tout différend relatif à l'exécution, à l'interprétation ou à la fin de la présente convention qui n'aura pu être réglé à l'amiable relève de la compétence exclusive des juridictions belges du rôle linguistique francophone.</li>
</ul>
<h2>13. Documents annexes</h2>
<h3>a. Le lieu d'accueil</h3>
<ul>
<li>Politique d'accueil des étudiants-stagiaires ;</li>
<li>analyse des risques liés au(x) terrain(s) de stage ;</li>
<li>fiche(s) de poste de travail ;</li>
<li>attentes de l'institution ou du service vis-à-vis de l'étudiant-stagiaire.</li>
</ul>
<h3>b. L'Institut Ilya Prigogine</h3>
<ul>
<li>Document descriptif relatif au déroulement et aux contenus du stage ;</li>
<li>attestation(s) d'assurance responsabilité civile et dommages corporels de l'Institut Ilya Prigogine pour l'année concernée ;</li>
<li>grille d'évaluation du stage de l'étudiant-stagiaire par le service.</li>
</ul>
<p>Fait le ……………………, en deux exemplaires originaux, chacune des parties reconnaissant avoir reçu le sien.</p>
<p>{{signatures}}</p>
`;

const NOTE_CADRE = [
  'Repris du modèle Word « Convention cadre IIP 2023-2024 ». Ce qui a changé, sans toucher aux engagements :',
  '— le bloc de l’Institut n’est plus écrit dans le texte : nom, adresse, signataire et qualité, téléphone, courriel viennent de Configuration → Établissement (« Directeur a.i. » ne peut plus revenir) ; l’année et la date de prise de cours sont des champs ;',
  '— la numérotation des Word (1., a., puces) est écrite en clair, 1 à 13, pour que le renvoi « supra, point 2.a » reste juste ;',
  '— « établissement de promotion sociale » devient « établissement d’enseignement pour adultes » ; titres sans capitales, accents rétablis (Modalités, Évaluations, Pédagogique…) ; « Tel / E-mail » deviennent « Tél. / Courriel » ;',
  '— point 8 : il manquait le verbe — « L’étudiant-stagiaire et l’enseignant référent [relèvent] de la responsabilité… » ;',
  '— « enseignant-référent » / « enseignant référent » unifiés ; « l’institution de stage » devient « l’institution d’accueil » ; « endéans les 5 jours maximum » devient « endéans les cinq jours au plus » ; « rompre le contrat » devient « rompre la convention » ; « Celle-ci peut se voir interdire » devient « Elle peut… » (l’étudiante) ; ponctuation des listes ;',
  '— le bloc de signatures (deux colonnes) est produit par Lucie.',
  'À VÉRIFIER par la direction : le point 8 dit l’assurance « souscrite par la HELB - Ilya Prigogine », le modèle de partenariat dit « par l’ASBL Ilya Prigogine » — repris tel quel.',
].join('\n');

const PARTENARIAT = `
<h2>1. Parties à la convention</h2>
<p><strong>Entre</strong></p>
<p><strong>{{iip.nom}}</strong><br>Adresse : {{iip.adresse}}<br>Représenté par {{iip.representant}}, {{iip.qualite}}<br>Tél. : {{iip.tel}}<br>Courriel : {{iip.email}}<br>Pouvoir organisateur : {{iip.po}}</p>
<p>ci-après dénommé « l'Institut »,</p>
<p><strong>et</strong></p>
<p><strong>{{partenaire.nom}}</strong><br>Adresse : {{partenaire.adresse}}<br>Représenté(e) par {{partenaire.representant}}, {{partenaire.fonction}}<br>Tél. : {{partenaire.tel}}<br>Courriel : {{partenaire.email}}<br>Pouvoir organisateur : {{partenaire.po}}</p>
<p>ci-après dénommé(e) « {{partenaire.sigle}} »,</p>
<p>ci-après dénommés ensemble « les parties ».</p>
<h2>2. Objet</h2>
<p>La présente convention a pour objet de formaliser un partenariat entre les parties visant à {{objet}}.</p>
<p>Cette activité est réalisée dans le cadre du {{cursus}}, unité d'enseignement {{ue}}, et plus particulièrement {{cours}}, sous la supervision de {{enseignant_referent}}, enseignant référent de l'Institut.</p>
<h2>3. Modalités pratiques</h2>
<h3>a. Période concernée</h3>
<p>La présente convention est valable du {{periode.debut}} au {{periode.fin}}.</p>
<p>Les séances auront lieu aux dates suivantes :</p>
<p>{{seances}}</p>
<p>{{horaires}}</p>
<h3>b. Organisation des séances</h3>
<p>{{organisation}}</p>
<h3>c. Locaux et matériel</h3>
<p>{{partenaire.sigle}} met à disposition {{locaux}}.</p>
<p>Les étudiants et l'enseignant référent de l'Institut feront bon usage du matériel mis à disposition. Ce sont eux qui mettront le matériel en place pour chaque séance et qui le rangeront à la fin des séances.</p>
<p>L'Institut pourra amener son matériel et le stocker sur place le cas échéant. Il sera récupéré au plus tard à la fin du partenariat.</p>
<p>Il est convenu que le matériel appartenant à l'Institut et laissé sur place ne sera pas utilisé par {{partenaire.sigle}} en dehors des séances faisant l'objet de la présente convention.</p>
<h2>4. Évaluation du partenariat</h2>
<p>À l'issue du partenariat, l'enseignant référent de l'Institut et {{partenaire.interlocuteurs}} s'entretiendront en vue de mesurer et d'apprécier la réalisation des objectifs de la présente convention, et de renouveler le partenariat le cas échéant.</p>
<h2>5. Assurances</h2>
<p>Les étudiants et l'enseignant référent de l'Institut sont couverts par l'assurance responsabilité civile souscrite par l'ASBL Ilya Prigogine.</p>
<ul>
<li>Compagnie d'assurance : ETHIAS</li>
<li>Police d'assurance scolaire : 45.425.074</li>
</ul>
<p>{{partenaire.sigle}} fait explicitement mention, dans son contrat d'assurance en responsabilité civile, de la participation d'étudiants extérieurs et d'enseignants référents aux activités de l'institution.</p>
<p>Tout accident survenu à un étudiant de l'Institut ou causé par son fait doit être porté à la connaissance de l'enseignant référent, du directeur de l'Institut et de la direction de {{partenaire.sigle}}. Un rapport circonstancié sera transmis, dans les plus brefs délais, au directeur de l'Institut.</p>
<p>Le matériel de {{partenaire.sigle}} utilisé par les étudiants et l'enseignant de l'Institut est assuré par {{partenaire.sigle}}.</p>
<h2>6. Fin de la convention</h2>
<p>La présente convention prend fin le {{periode.fin}}.</p>
<p>Si un désaccord devait survenir avant cette date, les parties tenteront de trouver une solution pour poursuivre le partenariat jusqu'à son terme. À défaut, il pourra être mis fin à la présente convention de commun accord.</p>
<h2>7. Droit applicable et juridictions compétentes</h2>
<ul>
<li>La présente convention est soumise au droit belge.</li>
<li>Tout différend relatif à l'exécution, à l'interprétation ou à la fin de la présente convention qui n'aura pu être réglé à l'amiable relève de la compétence exclusive des juridictions belges du rôle linguistique francophone.</li>
</ul>
<p>Fait le ……………………, en deux exemplaires originaux, chacune des parties reconnaissant avoir reçu le sien.</p>
<p>{{signatures}}</p>
<p>Annexe : {{annexes}}</p>
`;

const NOTE_PARTENARIAT = [
  'Repris du modèle Word « Convention Partenariat IIP - École des Pommiers 2026-2027 », rendu applicable à tout partenaire. Ce qui a changé, sans toucher aux engagements :',
  '— le bloc de l’Institut vient de Configuration → Établissement ; le pouvoir organisateur s’écrit « ASBL Ilya Prigogine » avec son numéro d’entreprise — l’adresse du campus de la Plaine, fausse, ne peut plus revenir ;',
  '— tout ce qui nommait l’école Les Pommiers devient un champ : partenaire, appellation courte (« l’école Les Pommiers »), objet, cursus, UE, cours, enseignant référent, période, dates des séances, horaires, organisation, locaux, interlocuteurs pour l’évaluation, annexe ;',
  '— « en dehors des sessions de psychomotricité » devient « en dehors des séances faisant l’objet de la présente convention » ; « de la directrice de l’école » devient « de la direction de <partenaire> » ;',
  '— numérotation écrite en clair (1 à 7, a à c) ; titres sans capitales, accents rétablis ; « Mr » devient « M. » ; « C’est eux qui » devient « Ce sont eux qui » ; « prend fin au » devient « prend fin le » ; « récupéré à la fin du partenariat au plus tard » devient « récupéré au plus tard à la fin du partenariat » ;',
  '— le bloc de signatures (deux colonnes) est produit par Lucie ; l’annexe ne s’imprime que si elle est renseignée.',
].join('\n');

const ETABLISSEMENTS = `
<p><strong>Entre</strong></p>
<p>{{iip.nom}}, ci-après dénommé « IIP », représenté par {{iip.representant}}, {{iip.qualite}},</p>
<p><strong>et</strong></p>
<p>{{partenaire.nom}}, ci-après dénommé(e) « {{partenaire.sigle}} », représenté(e) par {{partenaire.representant}}, {{partenaire.fonction}}.</p>
<h2>Étant préalablement établi ce qui suit</h2>
<p>L'ASBL Ilya Prigogine organise de l'enseignement par ses deux établissements, à savoir l'Institut Ilya Prigogine et la HELB Ilya Prigogine. Ensemble, ces deux établissements accueillent environ 4 000 étudiants et forment des étudiants, notamment dans le domaine de la santé. Le département santé de la HELB et l'IIP partagent des bâtiments sis sur le campus Erasme.</p>
<h2>Il est convenu ce qui suit</h2>
<h3>Article 1</h3>
<p>L'IIP organise des formations dans le domaine de la santé. Ces formations sont construites sur la base de dossiers pédagogiques (DP) de l'enseignement pour adultes et sont destinées aux personnels travaillant dans le monde de la santé. Dans le cadre de cette convention, ces formations sont organisées avec le soutien du {{partenaire.sigle}}.</p>
<h3>Article 2</h3>
<p>Le {{partenaire.sigle}} communique à l'IIP, avant le mois de mai de l'année académique précédente, la liste des UE qu'il désire ouvrir en partenariat avec l'IIP. Les deux parties se mettent d'accord sur les UE à ouvrir dans la mesure des nécessités.</p>
<h3>Article 3</h3>
<p>Le {{partenaire.sigle}}, par son secrétariat ou sa coordinatrice, communique les documents suivants un mois avant la formation :</p>
<ul>
<li>la liste des personnes qu'il souhaite inscrire aux formations ;</li>
<li>la liste des formateurs ainsi qu'un dossier complet comprenant les documents indispensables à la création des contrats ;</li>
<li>les jours, dates et heures de formation ainsi que toutes les informations utiles.</li>
</ul>
<p>En cas de non-respect des délais, singulièrement pour la liste des intervenants, un délai supplémentaire pour le paiement (réalisé par la FWB) est possible, vu le temps de traitement des services de l'administration.</p>
<h3>Article 4</h3>
<p>Les frais liés à l'organisation des formations, en ce compris les salaires des intervenants, sont pris en charge par l'IIP sous la forme d'un paiement en périodes (voir dossier pédagogique).</p>
<p>L'IIP rédige et fournit les documents légaux (contrats, PS12, CEP, attestations, diplômes, etc.).</p>
<h3>Article 5</h3>
<p>Le prix des formations est calculé comme suit :</p>
<ul>
<li>droit d'inscription FWB au 01.06.2023 : 32 € + 0,42 € × périodes prévues ;</li>
<li>droit complémentaire : 25 € de frais d'inscription + 0,25 € × périodes prévues.</li>
</ul>
<p>La somme est à verser sur la base d'une demande de créance, à 30 jours fin de mois, sur le compte de l'IIP.</p>
<h3>Article 6</h3>
<p>Au moins une fois par an, la responsable du {{partenaire.sigle}} rencontre la direction de l'IIP afin de faire le point sur ses besoins en matière de formation, et de maintenir ainsi un lien solide entre les partenaires.</p>
<p>Fait en double exemplaire à {{iip.ville}}, le ……………………</p>
<p>{{signatures}}</p>
`;

const NOTE_ETABLISSEMENTS = [
  'Repris du modèle Word « Convention cadre CREA – IIP ». Ce qui a changé, sans toucher aux articles :',
  '— le nom de l’Institut, son signataire et sa qualité viennent de Configuration → Établissement : la dénomination longue « Institut Supérieur de Promotion Sociale Libre de Bruxelles Ilya Prigogine » et « Directeur a.i. » ne s’écrivent plus dans le texte ; le partenaire (CREA), son appellation courte et sa représentante sont des champs ; l’année académique est portée en tête ;',
  '— « dossiers pédagogiques (DP) en Promotion Sociale (EPS) » devient « dossiers pédagogiques (DP) de l’enseignement pour adultes » ; « destinés » devient « destinées » (les formations) ; « sur base de » devient « sur la base de » ; « via » devient « par » ;',
  '— article 3 : « un délais supplémentaire … peut-être possible » devient « un délai supplémentaire … est possible » ; « Liste des personnes » devient « la liste des personnes » ;',
  '— article 6 : la phrase sans verbe « Ceci afin de maintenir… » est rattachée à la précédente ; « la Direction » devient « la direction » ;',
  '— « 4000 » devient « 4 000 » ; « campus d’Erasme » devient « campus Erasme » ; le bloc de signatures (deux colonnes) est produit par Lucie.',
].join('\n');

export const SEMENCES = {
  cadre_stage: { texte: CADRE_STAGE.trim(), note: NOTE_CADRE },
  partenariat: { texte: PARTENARIAT.trim(), note: NOTE_PARTENARIAT },
  etablissements: { texte: ETABLISSEMENTS.trim(), note: NOTE_ETABLISSEMENTS },
};

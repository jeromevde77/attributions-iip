/**
 * LA FICHE D'ATTRIBUTIONS D'UN MEMBRE DU PERSONNEL — composée par le serveur.
 *
 * Elle était écrite dans l'écran (Professeurs.jsx) avec son propre dessin :
 * bandeau turquoise, en-tête de tableau marine, encadré gris « Récapitulatif »,
 * pied de page posé sous le dernier paragraphe, paysage imposé et marges du
 * navigateur. Une dixième enveloppe, en somme — et c'est elle qui partait chez
 * les professeurs. « Le bas de page n'est pas en bas, les couleurs non plus. »
 *
 * Elle passe donc par L'enveloppe (`lib/document.js`) : A4 portrait, marges de
 * 18 mm, en-tête de l'établissement, pied commun sur chaque feuille. Son corps
 * suit le gabarit B — « le rapport » — : une rangée de tuiles qui dit ce que la
 * liste démontre, puis la liste. Tuiles et styles de tableau sont ceux des
 * rapports (`routes/rapports.js`), repris et non réécrits.
 */
import { envelopperDocument } from './document.js';
import { tuile, rangeeTuiles, STYLE_RAPPORT, STYLE_REPORTING } from '../routes/rapports.js';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const n0 = n => Math.round(n || 0).toLocaleString('fr-BE').replace(/ | /g, ' ');
const n4 = n => (Math.round((n || 0) * 10000) / 10000).toFixed(4).replace('.', ',');
const per = n => (n == null ? '0' : String(n).replace('.', ','));

/* LE TABLEAU A DEUX TONS : l'en-tête et la ligne de section sont le même
   objet — l'un nomme les colonnes, l'autre un paquet de lignes —, donc le même
   fond ; la donnée reste blanche. Le bloc (BA1, BA2, BA3, FC) et la mention RT
   sont des étiquettes NEUTRES : ils précisent, ils n'alertent pas. */
const STYLE_FICHE = `
  table.attr { table-layout: fixed; }
  table.attr th { background:#EDF2F8; color:#1B2B4B; border-bottom:0.4mm solid #94A3B8;
                  padding-top:1.8mm; padding-bottom:1.8mm; }
  table.attr th:first-child, table.attr td:first-child { padding-left:2mm; }
  table.attr th:last-child, table.attr td:last-child { padding-right:2mm; }
  table.attr tr.section td { background:#EDF2F8; color:#1B2B4B; font-weight:700;
                             font-size:9pt; border-bottom:0.25mm solid #C4CDD9; }
  table.attr tr.section td .fin { font-weight:400; color:#64748b; }
  table.attr td.ue { white-space:nowrap; }
  table.attr td.t { font-weight:700; color:#1B2B4B; }
  table.attr .act { color:#64748b; }
  table.attr tr.total td { background:#FAFAFB; border-top:0.8pt solid #1B2B4B;
                           border-bottom:0; font-weight:700; }
  .etiq { display:inline-block; font-size:6.5pt; font-weight:700; color:#475569;
          border:0.25mm solid #94A3B8; border-radius:1mm; padding:0 1mm;
          margin-left:1.2mm; letter-spacing:.2pt; vertical-align:1px; }
  .note-etp { font-size:8pt; color:#64748b; margin:-5mm 0 6mm; }
  table.tuiles { margin-bottom:7mm; }
  .tuile-val { font-size:18pt; }`;

/**
 * @param {object} d   ce que rend `donneesFicheAttributions()`
 * @param {object} [o]
 * @param {?string} [o.contrat]  'IIP', 'HELB'… ; null = toutes les lignes
 * @returns {{ html: string, nom: string, titre: string } | null}
 *          null quand le filtre ne laisse aucune ligne.
 */
export function composerFicheAttributions(d, { contrat = null } = {}) {
  const { prof, annee, nominations, bilan_nomination } = d;
  const lignes = contrat
    ? d.attributions.filter(a => (a.contrat_mdp || 'IIP') === contrat)
    : d.attributions;
  if (contrat && !lignes.length) return null;

  /* L'autonomie suit le TYPE DE COURS auquel elle se rattache : c'est ainsi
     que l'ETP se calcule — (CT + aut. CT) / 800 + (PP + aut. PP) / 1000. Les
     totaux se refont sur les lignes RETENUES : une fiche filtrée qui
     afficherait l'ETP de tous les contrats dirait autre chose que son tableau. */
  let ct = 0, pp = 0, autCt = 0, autPp = 0;
  for (const a of lignes) {
    if (a.type_cours === 'CT') { ct += a.per || 0; autCt += a.aut || 0; }
    else { pp += a.per || 0; autPp += a.aut || 0; }
  }
  const chargeCt = ct + autCt, chargePp = pp + autPp;
  const etpCt = chargeCt / 800, etpPp = chargePp / 1000;
  const total = chargeCt + chargePp;

  const tuiles = rangeeTuiles([
    tuile({ valeur: per(chargeCt), unite: 'pér.', libelle: 'Charge de cours (CT)',
      precision: `${n4(etpCt)} ETP${autCt ? ` · dont ${per(autCt)} d'autonomie` : ''}` }),
    tuile({ valeur: per(chargePp), unite: 'pér.', libelle: 'Pratique professionnelle (PP)',
      precision: `${n4(etpPp)} ETP${autPp ? ` · dont ${per(autPp)} d'autonomie` : ''}` }),
    tuile({ valeur: n4(etpCt + etpPp), unite: 'ETP', libelle: 'Charge totale', ton: 'fort',
      precision: `${per(total)} périodes` }),
  ]);

  // Une ligne de section par paquet, avec son total : la section n'a plus
  // besoin d'une colonne qui la répète à chaque ligne.
  const parSection = new Map();
  for (const a of lignes) {
    const s = a.section || '—';
    if (!parSection.has(s)) parSection.set(s, []);
    parSection.get(s).push(a);
  }
  const corpsTableau = [...parSection.entries()].map(([sec, rows]) => {
    const sTot = rows.reduce((s, a) => s + (a.per || 0) + (a.aut || 0), 0);
    return `<tr class="section"><td colspan="5">${esc(sec)}</td>
        <td class="n">${per(sTot)} <span class="fin">pér.</span></td></tr>`
      + rows.map(a => `<tr>
        <td class="ue">UE ${esc(a.ue_num)}${a.ue_niv ? `<span class="etiq">${esc(a.ue_niv)}</span>` : ''}</td>
        <td>${esc(a.cours_nom || a.code_cours || '—')}${a.activite_nom
          ? ` <span class="act">(${esc(a.activite_nom)})</span>` : ''}${a.est_rt
          ? '<span class="etiq" title="Remplacement temporaire">RT</span>' : ''}</td>
        <td>${esc(a.type_cours || '—')}</td>
        <td class="n">${per(a.per)}</td>
        <td class="n">${per(a.aut)}</td>
        <td class="n t">${per((a.per || 0) + (a.aut || 0))}</td>
      </tr>`).join('');
  }).join('');

  const tableau = `<table class="attr">
    <colgroup><col style="width:25mm"><col><col style="width:15mm">
      <col style="width:16mm"><col style="width:16mm"><col style="width:20mm"></colgroup>
    <thead><tr><th>Unité</th><th>Cours</th><th>Type</th>
      <th class="n">Pér.</th><th class="n">Aut.</th><th class="n">Total</th></tr></thead>
    <tbody>${corpsTableau || '<tr><td colspan="6" class="vide">Aucune attribution.</td></tr>'}
    ${/* Le total est la DERNIÈRE ligne du corps, pas un pied de tableau :
         un <tfoot> se répète au bas de chaque feuille, et la page 1 d'une
         fiche de deux pages affichait le total général à mi-liste. */''}
    <tr class="repere total"><td colspan="3">Total</td>
      <td class="n">${per(ct + pp)}</td><td class="n">${per(autCt + autPp)}</td>
      <td class="n">${per(total)}</td></tr></tbody>
  </table>`;

  /* L'ENGAGEMENT À TITRE DÉFINITIF. Le bilan de couverture porte un ÉTAT —
     couvert, ou non —, et c'est donc le seul endroit de la pièce où le liseré
     prend une couleur : vert (réussi) ou brique (à corriger). */
  let nomin = '';
  if (nominations && nominations.length) {
    const b = bilan_nomination;
    const bilan = b ? rangeeTuiles([
      tuile({ valeur: n4(b.etp_nomme), unite: 'ETP', libelle: 'Nommé' }),
      tuile({ valeur: n4(b.etp_couvert), unite: 'ETP', libelle: 'Couvert',
        precision: `dont RT ${n4(b.etp_rt)} ETP` }),
      tuile({ valeur: b.couvert ? 'Couvert' : n4(b.etp_manque),
        unite: b.couvert ? '' : 'ETP',
        libelle: b.couvert ? 'La nomination est couverte' : 'Manque à couvrir',
        precision: b.couvert ? null : `~${n0(b.etp_manque * 800)} pér. CT`,
        couleur: b.couvert ? '#3E7D5E' : '#9D4A38' }),
    ]) : '';
    nomin = `<h2>Engagement à titre définitif</h2>
      <table class="attr">
        <colgroup><col><col style="width:15mm"><col style="width:26mm"><col style="width:22mm"></colgroup>
        <thead><tr><th>Dossier pédagogique (code FWB)</th><th>Type</th>
          <th class="n">Nommé (pér.)</th><th class="n">ETP</th></tr></thead>
        <tbody>${nominations.map(n => `<tr>
          <td>${esc(n.libelle)} <span class="act">${n.code_fwb === 'INCONNU'
            ? '(code inconnu)' : esc(n.code_fwb || '')}</span></td>
          <td>${esc(n.type_charge || '')}</td>
          <td class="n">${per(n.periodes)}</td>
          <td class="n">${n4(n.etp)}</td></tr>`).join('')}</tbody>
      </table>
      ${bilan}`;
  }

  const identite = `${prof.prenom || ''} ${(prof.nom || '').toUpperCase()}`.trim();
  const fonction = prof.fonction || prof.statut || null;
  const corps = `${tuiles}
    <div class="note-etp">ETP : CT ÷ 800, PP ÷ 1000, autonomie comprise dans son type de cours.</div>
    ${tableau}
    ${nomin}`;

  const titre = "Fiche d'attributions";
  const nom = `Fiche_attr_${prof.nom || ''}_${prof.prenom || ''}_${annee}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
  return {
    titre, nom,
    html: envelopperDocument({
      html: corps,
      titre: `${titre} — ${identite} — ${annee}`,
      orientation: 'portrait',
      styles: STYLE_RAPPORT + STYLE_REPORTING + STYLE_FICHE,
      entete: {
        titre,
        sous: [identite, fonction].filter(Boolean).join(' · '),
        ligne: [`Année académique ${annee}`, contrat ? `contrat ${contrat}` : null]
          .filter(Boolean).join(' · '),
      },
    }),
  };
}

export default composerFicheAttributions;

/**
 * LE CONTRÔLE DES PAE FACE AUX PRÉREQUIS LÉGAUX (3.1.44, Charles, 5 octobre
 * 2026 : « est-ce que Lucie calcule bien le PAE possible ? » puis « je devrais
 * pouvoir sortir cela de Lucie »).
 *
 * Une inscription de l'année dont le prérequis légal n'est pas ACQUIS (réussi,
 * ou valorisé en totalité, une année antérieure) est conforme dans trois cas,
 * ceux du moteur du PAE (lib/pae.js) :
 *   · le prérequis est suivi la même année, au MÊME BLOC (« sous réserve ») ;
 *   · il a été AJOURNÉ l'an dernier (cadenas : la seconde session le dira) ;
 *   · une DÉROGATION motivée est enregistrée pour l'unité.
 * Le reste est hors règle, et se régularise dossier par dossier.
 *
 * Une seule fonction pour l'écran (Contrôler les dossiers) et pour la pièce
 * (Éditions → Listes et rapports) : deux calculs finiraient par différer.
 */
import db from '../db/index.js';

const precedente = annee => {
  const m = /^(\d{4})-(\d{4})$/.exec(String(annee || ''));
  return m ? `${Number(m[1]) - 1}-${Number(m[2]) - 1}` : null;
};

export function controlePrerequisPae(annee, { sections = null } = {}) {
  const avant = precedente(annee);
  const lignes = db.prepare(`
    SELECT i.etudiant_id, e.nom, e.prenom, e.id_ecampus AS matricule, i.ue_num, p.prerequis_num,
           p.section AS section,
           (SELECT ue_niv FROM ue WHERE ue_num = i.ue_num AND annee_scolaire = ? LIMIT 1) AS niv_ue,
           (SELECT ue_nom FROM ue WHERE ue_num = i.ue_num AND annee_scolaire = ? LIMIT 1) AS nom_ue,
           (SELECT ue_niv FROM ue WHERE ue_num = p.prerequis_num AND annee_scolaire = ? LIMIT 1) AS niv_pre,
           (SELECT ue_nom FROM ue WHERE ue_num = p.prerequis_num AND annee_scolaire = ? LIMIT 1) AS nom_pre,
           EXISTS (SELECT 1 FROM etudiant_inscription s WHERE s.etudiant_id = i.etudiant_id
                     AND s.ue_num = p.prerequis_num AND s.annee_scolaire = ?) AS meme_annee,
           EXISTS (SELECT 1 FROM etudiant_inscription a WHERE a.etudiant_id = i.etudiant_id
                     AND a.ue_num = p.prerequis_num AND a.annee_scolaire = ? AND a.resultat = 'ajourne') AS attente,
           EXISTS (SELECT 1 FROM pae_derogation d WHERE d.etudiant_id = i.etudiant_id
                     AND d.ue_num = i.ue_num AND d.annee_scolaire = ?) AS derogation,
           (SELECT GROUP_CONCAT(r.annee_scolaire || ' : ' || COALESCE(r.resultat, 'en cours'), ' · ')
              FROM etudiant_inscription r WHERE r.etudiant_id = i.etudiant_id AND r.ue_num = p.prerequis_num) AS historique,
           (SELECT COUNT(*) FROM etudiant_valorisation v WHERE v.etudiant_id = i.etudiant_id
              AND v.ue_num = p.prerequis_num) AS valorisations
      FROM etudiant_inscription i
      JOIN etudiant e ON e.id = i.etudiant_id
      JOIN ue_prerequis p ON p.ue_num = i.ue_num AND p.type = 'legal'
                         AND (p.annee_scolaire IS NULL OR p.annee_scolaire = ?)
     WHERE i.annee_scolaire = ?
       AND NOT EXISTS (SELECT 1 FROM etudiant_inscription r WHERE r.etudiant_id = i.etudiant_id
                         AND r.ue_num = p.prerequis_num AND r.resultat IN ('reussi','va') AND r.annee_scolaire < ?)
       AND NOT EXISTS (SELECT 1 FROM etudiant_valorisation v WHERE v.etudiant_id = i.etudiant_id
                         AND v.ue_num = p.prerequis_num AND v.type = 'complete' AND v.decision_le IS NOT NULL
                         AND COALESCE(v.decision, 'accordee') = 'accordee')
     ORDER BY p.section, e.nom, e.prenom, i.ue_num`)
    .all(annee, annee, annee, annee, annee, avant, annee, annee, annee, annee);

  const dansPerimetre = l => !sections || !l.section || sections.includes(l.section);
  const vues = lignes.filter(dansPerimetre);
  const conformes = { meme_bloc: 0, cadenas: 0, derogation: 0 };
  const hors = [];
  for (const l of vues) {
    if (l.attente) { conformes.cadenas++; continue; }
    if (l.meme_annee && String(l.niv_ue || '').toUpperCase() === String(l.niv_pre || '').toUpperCase()) { conformes.meme_bloc++; continue; }
    if (l.derogation) { conformes.derogation++; continue; }
    hors.push({ ...l, ...constatDe(l) });
  }
  return {
    annee, total: vues.length,
    conformes: { ...conformes, total: conformes.meme_bloc + conformes.cadenas + conformes.derogation },
    hors, etudiants: new Set(hors.map(h => h.etudiant_id)).size,
  };
}

/** Ce que l'on constate, et ce qu'il faut faire. `gravite` : corriger | surveiller. */
function constatDe(l) {
  const h = l.historique || '';
  const refus = h.match(/(\d{4}-\d{4}) : refuse/);
  if (refus && l.meme_annee) return { constat: 'Prérequis refusé, repris cette année dans un bloc inférieur',
    action: 'Retirer l’UE du PAE : son prérequis doit être réussi avant.', gravite: 'corriger' };
  if (refus) return { constat: `Prérequis refusé (${refus[1]}), non repris`,
    action: 'Retirer l’UE du PAE et inscrire le prérequis, ou motiver une dérogation.', gravite: 'corriger' };
  if (l.meme_annee) return { constat: 'Prérequis suivi cette année, mais d’un bloc inférieur',
    action: 'Retirer l’UE du PAE, ou motiver une dérogation.', gravite: 'corriger' };
  if (l.valorisations) return { constat: 'Valorisation du prérequis ouverte, mais non accordée en totalité',
    action: 'Achever le dossier de valorisation ; à défaut, retirer l’UE.', gravite: 'surveiller' };
  return { constat: 'Aucune trace du prérequis dans Lucie',
    action: 'Vérifier un parcours antérieur ou une valorisation à encoder ; à défaut, retirer l’UE.', gravite: 'surveiller' };
}

/** Le prénom sans les initiales d'eCampus (« Malcom S, C. » → « Malcom »). */
export const prenomSeul = p => String(p || '').replace(/\s+[A-Z](,|\.)?(\s+[A-Z]\.?)*\.?$/, '').trim() || String(p || '');

/** Le corps de la pièce : tuiles, puis le tableau par section, puis la méthode. */
export function corpsControlePae(c) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const nb = n => Number(n).toLocaleString('fr-BE');
  const tuile = (v, lib, prec, etat) => `<div class="tuile e-${etat}"><div class="v">${v}</div><div class="l">${lib}</div>${prec ? `<div class="p">${prec}</div>` : ''}</div>`;
  const parSection = new Map();
  for (const l of c.hors) { const s = l.section || '—'; if (!parSection.has(s)) parSection.set(s, []); parSection.get(s).push(l); }
  let corps = `
<p class="intro">Contrôle des programmes annuels (PAE) de <b>${esc(c.annee)}</b> face aux <b>prérequis légaux</b> des unités,
tels que le moteur du PAE de Lucie les applique : un prérequis légal doit être <b>acquis</b> (réussi ou valorisé en totalité) ;
il peut être suivi la même année s’il est du <b>même bloc</b> ; un prérequis <b>ajourné</b> l’an dernier ouvre sa suite avec un cadenas ;
toute exception se motive par une <b>dérogation</b>, tracée au dossier.</p>
<div class="tuiles">
${tuile(nb(c.total), 'inscriptions dont le prérequis n’est pas encore acquis', 'dans le périmètre', 'neutre')}
${tuile(nb(c.conformes.total), 'conformes', `${c.conformes.meme_bloc} même bloc · ${c.conformes.cadenas} cadenas · ${c.conformes.derogation} dérogations`, 'reussi')}
${tuile(nb(c.hors.length), 'inscriptions hors règle', 'sans dérogation', c.hors.length ? 'corriger' : 'reussi')}
${tuile(nb(c.etudiants), 'étudiants concernés', 'à régulariser', c.etudiants ? 'surveiller' : 'reussi')}
</div>`;
  if (!c.hors.length) return corps + '<p class="intro"><b>Aucune inscription hors règle.</b></p>';
  corps += `<table class="liste"><thead><tr><th style="width:24%">Étudiant</th><th style="width:22%">UE inscrite</th>
<th style="width:22%">Prérequis légal</th><th>Constat et action</th></tr></thead><tbody>`;
  for (const [sec, ls] of parSection) {
    corps += `<tr class="groupe"><td colspan="4">${esc(sec)} · ${ls.length} inscription${ls.length > 1 ? 's' : ''}</td></tr>`;
    for (const l of ls) corps += `<tr>
<td><b>${esc(prenomSeul(l.prenom))} ${esc(String(l.nom || '').toUpperCase())}</b><div class="g">${esc(l.matricule || 'sans matricule')}</div></td>
<td><b>UE ${l.ue_num}</b> · ${esc(l.niv_ue || '')}<div class="g">${esc(l.nom_ue || '')}</div></td>
<td><b>UE ${l.prerequis_num}</b> · ${esc(l.niv_pre || '')}<div class="g">${esc(l.nom_pre || '')}</div><div class="g">Historique : ${esc(l.historique || 'aucun')}</div></td>
<td><div class="constat e-${l.gravite}">${esc(l.constat)}</div><div class="action">${esc(l.action)}</div></td></tr>`;
  }
  return corps + `</tbody></table>
<h3>Méthode et limites</h3>
<ul class="note">
<li>Inscriptions de l’année, prérequis légaux de l’année, réussites et valorisations des années antérieures, dérogations enregistrées.</li>
<li>Une inscription entrée par l’import eCampus n’est pas bloquée : l’import inscrit ce qu’eCampus contient et signale.</li>
<li>« Aucune trace » ne veut pas dire « erreur » : un parcours antérieur ou une valorisation non encore encodés suffisent à l’expliquer. C’est un examen dossier par dossier.</li>
<li>L’ouverture d’un bloc (part du bloc précédent acquise) se contrôle à part : Contrôler les dossiers → Au-delà du bloc atteint.</li>
</ul>`;
}

export const STYLES_CONTROLE_PAE = `
.intro{font-size:9.5pt;line-height:1.45;margin:0 0 4mm}
.tuiles{display:flex;gap:3mm;margin:0 0 5mm}
.tuile{flex:1;border:0.3mm solid #D8DCE4;border-left-width:1mm;border-radius:0 2.6mm 2.6mm 0;padding:2.2mm 3mm;background:#fff}
.tuile .v{font-size:15pt;font-weight:700;color:#1B2B4B;line-height:1.1}.tuile .l{font-size:8.5pt;color:#1B2B4B}.tuile .p{font-size:7.5pt;color:#6B7280;margin-top:.6mm}
.e-reussi{border-left-color:#3E7D5E}.e-corriger{border-left-color:#9D4A38}.e-surveiller{border-left-color:#B45309}.e-neutre{border-left-color:#1B2B4B}
table.liste{font-size:8.5pt;width:100%;border-collapse:collapse}
table.liste th{text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.04em;color:#475569;background:#EEF1F5;padding:1.6mm 2mm;border-bottom:0.3mm solid #C9CED8}
table.liste td{padding:1.8mm 2mm;border-bottom:0.2mm solid #E5E7EB;vertical-align:top;color:#1B2B4B}
table.liste tr{page-break-inside:avoid}
table.liste tr.groupe td{background:#EEF1F5;font-weight:700;font-size:8.5pt;padding:1.4mm 2mm}
.g{color:#6B7280;font-size:7.8pt;margin-top:.4mm}
.constat{font-weight:700;border-left:1mm solid;padding-left:1.6mm}.constat.e-corriger{border-color:#9D4A38}.constat.e-surveiller{border-color:#B45309}
.action{margin-top:.8mm;padding-left:2.6mm;color:#334155}
h3{font-size:10pt;color:#1B2B4B;margin:6mm 0 2mm}
ul.note{font-size:8.5pt;color:#334155;margin:0;padding-left:4mm;line-height:1.45}`;

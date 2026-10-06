// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Document d'offre d'emploi (mise en page)
//
// Génère le HTML d'une offre publiable : aperçu, impression et corps du mail.
// Fonction pure (données → HTML), testable sans serveur ; les routes ne font
// que rassembler les données et appeler ce gabarit.
//
// Design : flat, marine #1B2B4B / turquoise #00AACC, Inter, zéro icône
// décorative — le document doit rester sobre en pièce jointe comme imprimé.
// ─────────────────────────────────────────────────────────────────────────────

const ech = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const frDate = iso => iso
  ? String(iso).slice(0, 10).split('-').reverse().join('/')
  : null;

/**
 * @param {object} o        Le poste/offre (colonnes de recrutement_poste)
 * @param {string[]} titres Libellés des titres visés (référentiel + extras)
 * @param {string[]} acquis Acquis d'apprentissage du cours (facultatif)
 * @param {object} etab     { nom, adresse, mail } de l'établissement
 */
/* L'APPEL À CANDIDATURE DE L'INSTITUT (5 octobre 2026, modèle
   « Modèle_appel_IIP.docx ») : les points dans l'ordre du modèle, et la phrase
   des candidatures telle quelle — lettre, CV, diplôme, à la direction, à
   l'adresse du service RH, dans les six jours ouvrables suivant la parution au
   Prigoginews. */
const FONCTIONS = { CC: 'Chargé(e) de cours', EXP: 'Expert(e)' };
/** « SOHET Charles » → « Charles Sohet ». */
const prenomNom = t => {
  const m = /^([A-ZÀ-ÖØ-Þ' -]{2,})\s+(.+)$/.exec(String(t || '').trim());
  if (!m) return String(t || '');
  const nom = m[1].trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  return `${m[2].trim()} ${nom}`;
};
/** Six jours ouvrables (lundi-vendredi) après une date ISO. */
export function joursOuvrablesApres(iso, n = 6) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  let k = 0;
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); const j = d.getUTCDay(); if (j !== 0 && j !== 6) k++; }
  return d.toISOString().slice(0, 10);
}

export function documentOffre(o, titres = [], acquis = [], etab = {}) {
  const nomEtab = etab.nom || 'Institut Ilya Prigogine';
  const fonction = FONCTIONS[o.fonction] || null;
  const charge = o.total_periodes ? `${o.total_periodes} périodes` : null;
  const limite = joursOuvrablesApres(o.date_publication, 6);
  const vide = '<span style="color:#B45309">à compléter</span>';
  const ligne = (libelle, valeur) => `
    <div style="margin-bottom:10px;font-size:13px;color:#1E293B;line-height:1.5">
      <b style="color:#1B2B4B">${libelle} :</b> ${valeur || vide}
    </div>`;
  const bloc = (libelle, corps) => `
    <div style="margin-bottom:12px;font-size:13px;color:#1E293B;line-height:1.5">
      <div style="font-weight:700;color:#1B2B4B;margin-bottom:3px">${libelle} :</div>
      <div>${corps || vide}</div>
    </div>`;
  const liste = items => items.length
    ? `<ul style="margin:0;padding-left:18px">${items.map(t => `<li style="margin-bottom:3px">${ech(t)}</li>`).join('')}</ul>`
    : '';
  const texte = t => (t ? ech(t).replace(/\n/g, '<br>') : '');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Appel à candidature — ${ech(o.cours_nom || o.code_cours || '')}</title>
<style>@media print { body { -webkit-print-color-adjust: exact; } }</style>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Inter','Segoe UI',system-ui,sans-serif">
<div style="max-width:660px;margin:0 auto;padding:24px 16px">
  <div style="background:#1B2B4B;border-radius:12px 12px 0 0;padding:22px 26px">
    <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.6px">APPEL À CANDIDATURE</div>
    <div style="color:#C9D6EA;font-size:12px;margin-top:4px">${ech(nomEtab)} – Enseignement pour adultes${etab.cursus ? ` – ${ech(etab.cursus)}` : ''}</div>
  </div>
  <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:24px 26px">
    ${ligne('Fonction', fonction && ech(fonction))}
    ${ligne('Charge totale', charge && ech(charge))}
    ${ligne('Cours à conférer', o.cours_nom && `${ech(o.cours_nom)}${o.code_cours ? ` <span style="color:#64748B">(${ech(o.code_cours)}${o.ue_num ? ` · UE ${ech(o.ue_num)}` : ''})</span>` : ''}`)}
    ${bloc('Contenu synthétique', texte(o.description))}
    ${bloc('Profil du/de la candidat·e', texte(o.profil))}
    ${bloc('Titres', liste(titres))}
    <div style="margin-bottom:12px;font-size:13px;color:#1E293B;line-height:1.5">
      La possession d’un titre pédagogique (CAPAES), de même qu’une expérience pédagogique, seront appréciées.
    </div>
    ${o.competences ? bloc('Compétences attendues', texte(o.competences)) : ''}
    ${ligne('Prise de fonction', o.prise_de_fonction && frDate(o.prise_de_fonction))}

    <div style="border-top:1px solid #E2E8F0;margin-top:16px;padding-top:14px;font-size:12.5px;color:#1E293B;line-height:1.6">
      Les candidatures accompagnées d’une lettre de motivation et d’un CV à jour (et copie du diplôme) sont à
      adresser à la direction de l’Institut, Monsieur ${ech(prenomNom(etab.directeur || 'SOHET Charles'))}, via l’adresse
      <a href="mailto:${ech(etab.mail)}" style="color:#1B2B4B;font-weight:600">${ech(etab.mail)}</a>,
      dans les 6 jours ouvrables suivant la parution de la présente annonce au Prigoginews${limite ? `, soit au plus tard le <b>${frDate(limite)}</b>` : ''}.
    </div>
  </div>
  <div style="text-align:center;font-size:10px;color:#94A3B8;padding:10px">
    ${o.date_publication ? `Paru le ${frDate(o.date_publication)}` : 'Projet d’appel — non publié'}${o.publie_par ? ` · ${ech(o.publie_par)}` : ''}
  </div>
</div>
</body></html>`;
}

export function sujetOffre(o, etab = {}) {
  const nomEtab = etab.nom || 'Institut Ilya Prigogine';
  return `Appel à candidature — ${o.cours_nom || o.intitule || o.code_cours || 'enseignant'} (${nomEtab})`;
}

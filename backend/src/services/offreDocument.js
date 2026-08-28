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
export function documentOffre(o, titres = [], acquis = [], etab = {}) {
  const nomEtab = etab.nom || 'Institut Ilya Prigogine';
  const charge = o.total_periodes
    ? `${o.periodes_cours ?? '—'} périodes × ${o.nb_groupes ?? 1} groupe${(o.nb_groupes || 1) > 1 ? 's' : ''} = ${o.total_periodes} périodes`
    : `${o.periodes_cours ?? '—'} périodes`;

  const bloc = (titre, corps) => corps ? `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#00AACC;margin-bottom:4px">${titre}</div>
      <div style="font-size:13px;color:#1E293B;line-height:1.5">${corps}</div>
    </div>` : '';

  const liste = items => items.length
    ? `<ul style="margin:0;padding-left:18px">${items.map(t => `<li style="margin-bottom:3px">${ech(t)}</li>`).join('')}</ul>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Offre d'emploi — ${ech(o.fonction || o.code_cours || '')}</title>
<style>@media print { body { -webkit-print-color-adjust: exact; } }</style>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Inter','Segoe UI',system-ui,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="background:#1B2B4B;border-radius:12px 12px 0 0;padding:22px 26px">
    <div style="color:#fff;font-size:19px;font-weight:800;letter-spacing:.3px">${ech(nomEtab)}</div>
    <div style="color:#8FA3C4;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-top:3px">Offre d'emploi — Enseignement de promotion sociale</div>
  </div>
  <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:24px 26px">

    <div style="font-size:17px;font-weight:700;color:#1B2B4B;margin-bottom:2px">
      ${ech(o.intitule || o.fonction || `Chargé(e) de cours — ${o.code_cours || ''}`)}
    </div>
    <div style="font-size:12.5px;color:#64748B;margin-bottom:18px">
      ${[o.section && `Section ${ech(o.section)}`, o.ue_num && `UE ${ech(o.ue_num)}`,
         o.code_cours && ech(o.code_cours), o.quadrimestre && `Quadrimestre ${ech(o.quadrimestre)}`]
        .filter(Boolean).join(' · ')}
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
      ${[['Charge', charge],
         ['Type', o.type_cours === 'PP' ? 'Pratique professionnelle' : o.type_cours === 'CT' ? 'Cours techniques' : o.type_cours],
         ['Postes', o.nb_postes],
         ['Horaire', o.horaire_indicatif]]
        .filter(([, v]) => v)
        .map(([l, v]) => `<div style="border:1px solid #E2E8F0;border-left:3px solid #00AACC;border-radius:9px;padding:8px 12px;min-width:110px">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#94A3B8">${l}</div>
          <div style="font-size:13px;font-weight:600;color:#1B2B4B;margin-top:2px">${ech(v)}</div>
        </div>`).join('')}
    </div>

    ${bloc('Profil recherché', o.profil ? ech(o.profil).replace(/\n/g, '<br>') : '')}
    ${bloc('Titres visés', liste(titres))}
    ${bloc('Compétences', o.competences ? ech(o.competences).replace(/\n/g, '<br>') : '')}
    ${bloc("Acquis d'apprentissage du cours", liste(acquis.slice(0, 8)))}

    <div style="border-top:1px solid #E2E8F0;margin-top:18px;padding-top:14px;font-size:12.5px;color:#1E293B;line-height:1.6">
      <b style="color:#1B2B4B">Candidatures</b> — curriculum vitae et copie des titres à adresser à
      <a href="mailto:${ech(etab.mail || 'direction@institut-prigogine.be')}" style="color:#00AACC;font-weight:600">${ech(etab.mail || 'direction@institut-prigogine.be')}</a>${o.date_limite ? `, au plus tard le <b>${frDate(o.date_limite)}</b>` : ''}.
      ${etab.adresse ? `<br>${ech(etab.adresse)}` : ''}
    </div>
  </div>
  <div style="text-align:center;font-size:10px;color:#94A3B8;padding:10px">
    ${o.date_publication ? `Offre publiée le ${frDate(o.date_publication)}` : 'Projet d\u2019offre — non publiée'}${o.publie_par ? ` · ${ech(o.publie_par)}` : ''}
  </div>
</div>
</body></html>`;
}

export function sujetOffre(o, etab = {}) {
  const nomEtab = etab.nom || 'Institut Ilya Prigogine';
  return `Offre d'emploi — ${o.intitule || o.fonction || o.code_cours || 'enseignant'} (${nomEtab})`;
}

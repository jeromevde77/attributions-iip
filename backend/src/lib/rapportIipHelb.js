/**
 * L'IIP ET LA HELB SUR PLUSIEURS ANNÉES (3.5.428, Charles, 13 novembre 2026 : « dans Éditions, un rapport graphique, visuel, qui montre
 * l'évolution sur les années entre les deux — la Haute École veut une comparaison car elle pense dépenser plus ; noter aussi le cadre
 * administratif, la coordination ; même si cela prend plusieurs pages, complet » ; tranché : une section au choix, ETP et périodes,
 * coûts en euros, cadre administratif, étudiants ; la première année d'une section se dit comme telle).
 *
 * Rien n'est recalculé à part : les ETP au barème du Pilotage (CT/800 + PP/1000), les coûts, les inscrits et les fonctions viennent
 * de donneesCout (le rapport « Coûts des formations »), année par année. Le cadre administratif (direction, secrétariat : fonctions
 * d'établissement) se partage au prorata des inscrits, comme dans ce rapport ; les coordinations de la section se lisent fonction par
 * fonction, part HELB comprise. Une année sans fonction encodée le dit.
 */
import db from '../db/index.js';
import { donneesCout } from './coutFormation.js';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const n2 = n => (n || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = n => `${n0(n)} €`;
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const court = a => `${String(a).slice(0, 4)}-${String(a).slice(7, 9)}`;
const IIP = '#19537E', HELB = '#C2408A';
const NATURES = { Cours: 'Cours', EI: 'Épreuve intégrée', ES: 'Encadrement de stages', COCUR: 'Coordination de cursus',
  COSTA: 'Coordination des stages', COTFE: 'Coordination des TFE', COSEC: 'Coordination de section', CP: 'Coordination pédagogique' };

/** Les attributions d'une section pour une année, regroupées. */
function attributions(section, annee) {
  return db.prepare(`
    SELECT COALESCE(bloc, '—') AS bloc, COALESCE(contrat_mdp, 'IIP') AS contrat,
      CASE WHEN UPPER(COALESCE(type_cours, 'CT')) = 'PP' THEN 'PP' ELSE 'CT' END AS type,
      COALESCE(NULLIF(coordination_encadrement, ''), 'Cours') AS nature, cours_ept_ad AS ept,
      professeur_id, professeur, SUM(total_attribue_professeur) AS periodes
    FROM v_attribution_complete
    WHERE annee_scolaire = ? AND section = ? AND COALESCE(en_conge, 0) = 0
    GROUP BY 1,2,3,4,5,6,7`).all(annee, section)
    .map(l => ({ ...l, etp: (l.periodes || 0) / (l.type === 'PP' ? 1000 : 800), helb: l.contrat === 'HELB' }));
}

/** Une année : périodes, ETP, coûts, inscrits, fonctions. */
function annee(section, a) {
  const L = attributions(section, a);
  const som = (f, filtre = () => true) => L.filter(filtre).reduce((t, l) => t + f(l), 0);
  let d = null;
  try { d = donneesCout(a); } catch (e) { console.error('[iip-helb] coût', a, e.message); }
  const S = d?.sections.find(x => x.section === section) || null;
  const missions = d?.missions || [];
  const pncc = missions.filter(m => m.pncc);
  const coutPncc = pncc.reduce((t, m) => t + (m.cout || 0), 0);
  const inscrits = S?.inscrits || 0;
  const base = d?.base_inscrits || 0;
  const partAdmin = base ? coutPncc * inscrits / base : 0;
  const coord = missions.filter(m => !m.pncc && m.section_code === section).map(m => ({
    fonction: m.fonction, personne: `${String(m.nom || '').toUpperCase()} ${m.prenom || ''}`.trim(),
    etp: Number(m.etp) || 0, etp_helb: Number(m.etp_helb) || 0, cout: m.cout || 0, cout_periodes: m.cout_periodes || 0, mode: m.mode,
    cout_helb: m.mode === 'etp800' ? (m.etp_helb_compte || 0) * 800 * (m.tarif_ct || 0) : 0,
  }));
  return {
    annee: a, lignes: L,
    per_iip: som(l => l.periodes, l => !l.helb), per_helb: som(l => l.periodes, l => l.helb),
    etp_iip: som(l => l.etp, l => !l.helb), etp_helb: som(l => l.etp, l => l.helb),
    profs_iip: new Set(L.filter(l => !l.helb && l.professeur_id).map(l => l.professeur_id)).size,
    profs_helb: new Set(L.filter(l => l.helb && l.professeur_id).map(l => l.professeur_id)).size,
    cout_iip: S?.cout_iip || 0, cout_helb: S?.cout_helb || 0, inscrits,
    admin: { fonctions: pncc.map(m => ({ fonction: m.fonction, etp: Number(m.etp) || 0, cout: m.cout || 0 })), cout: coutPncc, part: partAdmin, base },
    coord,
    coord_helb: coord.reduce((t, c) => t + c.cout_helb, 0),
    coord_iip: coord.reduce((t, c) => t + (c.cout - c.cout_helb), 0),
  };
}

/* ── LES GRAPHIQUES, EN SVG, SANS SCRIPT ─────────────────────────────────────────────────────────────────────────────────── */
/** Colonnes empilées IIP / HELB par année, la valeur de chaque part et le total au-dessus. Largeur fixe : le texte ne se déforme pas. */
function colonnesEmpilees(Y, cle, fmt, titre) {
  const W = 640, H = 230, bas = 190, haut = 30, larg = Math.min(90, (W - 60) / Y.length - 30);
  const tot = y => (y[cle + '_iip'] || 0) + (y[cle + '_helb'] || 0);
  const max = Math.max(...Y.map(tot), 0) || 1;
  const h = v => (v / max) * (bas - haut);
  const pas = (W - 40) / Y.length;
  const cols = Y.map((y, i) => {
    const x = 30 + pas * i + (pas - larg) / 2;
    const hi = h(y[cle + '_iip'] || 0), hh = h(y[cle + '_helb'] || 0);
    const yI = bas - hi, yH = yI - hh;
    const txt = (v, yy, coul = '#fff') => (v && (v / max) * (bas - haut) > 14
      ? `<text x="${x + larg / 2}" y="${yy}" text-anchor="middle" font-size="10" fill="${coul}" font-weight="600">${fmt(v)}</text>` : '');
    return `<rect x="${x}" y="${yI}" width="${larg}" height="${hi}" fill="${IIP}" rx="2"/>
      <rect x="${x}" y="${yH}" width="${larg}" height="${hh}" fill="${HELB}" rx="2"/>
      ${txt(y[cle + '_iip'], yI + hi / 2 + 4)}${txt(y[cle + '_helb'], yH + hh / 2 + 4)}
      <text x="${x + larg / 2}" y="${yH - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="#1B2B4B">${fmt(tot(y))}</text>
      <text x="${x + larg / 2}" y="${bas + 15}" text-anchor="middle" font-size="11" fill="#475569">${court(y.annee)}</text>`;
  }).join('');
  return `<div class="cadre"><h3>${titre}</h3>
    <svg viewBox="0 0 ${W} ${H}" width="170mm" height="${(170 * H / W).toFixed(1)}mm">
      <line x1="20" y1="${bas}" x2="${W - 10}" y2="${bas}" stroke="#CBD5E1" stroke-width="1"/>${cols}</svg>
    <div class="legendes"><span class="leg"><i style="background:${IIP}"></i>IIP</span><span class="leg"><i style="background:${HELB}"></i>HELB</span></div></div>`;
}
/** La part de la HELB, une barre par année. */
function partsParAnnee(Y, cle, titre) {
  return `<div class="cadre"><h3>${titre}</h3><table class="barres">${Y.map(y => {
    const i = y[cle + '_iip'] || 0, h = y[cle + '_helb'] || 0, t = i + h || 1;
    return `<tr><td class="barres-lib">${esc(y.annee)}</td><td class="barres-piste" style="background:transparent">
      <div class="parts"><span class="part" style="width:${(i / t) * 100}%;background:${IIP}"></span><span class="part" style="width:${(h / t) * 100}%;background:${HELB}"></span></div></td>
      <td class="barres-val">IIP ${pc(i, t)} · HELB ${pc(h, t)}</td></tr>`;
  }).join('')}</table></div>`;
}

/* ── LE DOCUMENT ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function documentIipHelb(p) {
  const section = p.section || 'TIM';
  const toutes = db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ? ORDER BY 1').all(section).map(r => r.a);
  const annees = (p.annees?.length ? p.annees : toutes.slice(-4)).filter(a => toutes.includes(a)).sort();
  if (!annees.length) {
    return { corps: `<p>Aucune attribution en ${esc(section)} pour les années choisies.</p>`, titre: 'IIP et HELB', nom: 'IIP-HELB.html',
      entete: { titre: `IIP et HELB — ${section}`, sous: '' } };
  }
  const Y = annees.map(a => annee(section, a));
  for (const y of Y) {
    y.etp = y.etp_iip + y.etp_helb; y.per = y.per_iip + y.per_helb;
    // Le coût de la section pour chacun : ses cours, ses coordinations (part HELB à la HELB), et pour l'IIP sa part du cadre administratif.
    y.tout_iip = y.cout_iip + y.coord_iip + y.admin.part; y.tout_helb = y.cout_helb + y.coord_helb;
  }
  const premiere = toutes[0];
  const a0 = Y[0], aN = Y[Y.length - 1];
  const evol = (k) => (a0[k] ? `${aN[k] >= a0[k] ? '+' : '−'}${Math.round(Math.abs((aN[k] - a0[k]) / a0[k]) * 100)} %` : '—');
  const totHelb = Y.reduce((t, y) => t + y.tout_helb, 0), totIip = Y.reduce((t, y) => t + y.tout_iip, 0);

  const bref = [
    `Sur ${Y.length} année${Y.length > 1 ? 's' : ''} (${esc(annees[0])} à ${esc(annees[annees.length - 1])}), la section ${esc(section)} a coûté
      <b>${eur(totIip)}</b> à l'IIP et <b>${eur(totHelb)}</b> à la HELB, cadre administratif et coordinations compris : la HELB en porte
      <b>${pc(totHelb, totIip + totHelb)}</b>.`,
    `En ${esc(aN.annee)}, la charge d'enseignement est de <b>${n2(aN.etp)} ETP</b> : <b>${n2(aN.etp_iip)}</b> à l'IIP (${pc(aN.etp_iip, aN.etp)})
      et <b>${n2(aN.etp_helb)}</b> à la HELB (${pc(aN.etp_helb, aN.etp)}).`,
    Y.length > 1 ? `De ${esc(a0.annee)} à ${esc(aN.annee)}, l'ETP de l'IIP évolue de ${evol('etp_iip')} et celui de la HELB de ${evol('etp_helb')} ;
      les inscrits passent de ${n0(a0.inscrits)} à ${n0(aN.inscrits)}.` : '',
    premiere && annees.includes(premiere) ? `${esc(premiere)} est la première année de la section dans Lucie : une section qui ouvre ne compte que ses premiers blocs.` : '',
    Y.some(y => !y.admin.fonctions.length) ? `Le cadre administratif et les coordinations ne sont encodés que pour ${Y.filter(y => y.admin.fonctions.length).map(y => esc(y.annee)).join(', ') || 'aucune année'} :
      les autres années ne portent que le coût des cours.` : '',
  ];

  const ligneAnnee = (y) => `<tr><td>${esc(y.annee)}</td>
    <td class="n">${n0(y.per_iip)}</td><td class="n">${n0(y.per_helb)}</td>
    <td class="n">${n2(y.etp_iip)}</td><td class="n">${n2(y.etp_helb)}</td><td class="n g">${n2(y.etp)}</td>
    <td class="n">${pc(y.etp_helb, y.etp)}</td><td class="n">${y.profs_iip} / ${y.profs_helb}</td>
    <td class="n">${n0(y.inscrits)}</td><td class="n">${y.inscrits ? n2(y.etp / y.inscrits * 100) : '—'}</td></tr>`;

  const tableCouts = `<table><thead><tr><th>Année</th><th class="n">Cours IIP</th><th class="n">Cours HELB</th><th class="n">Coord. IIP</th>
    <th class="n">Coord. HELB</th><th class="n">Cadre admin. (IIP)</th><th class="n">Total IIP</th><th class="n">Total HELB</th><th class="n">Part HELB</th>
    <th class="n">Par étudiant</th></tr></thead><tbody>
    <tr class="repere"><td>Ensemble</td><td class="n">${eur(Y.reduce((t, y) => t + y.cout_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.cout_helb, 0))}</td>
      <td class="n">${eur(Y.reduce((t, y) => t + y.coord_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.coord_helb, 0))}</td>
      <td class="n">${eur(Y.reduce((t, y) => t + y.admin.part, 0))}</td><td class="n">${eur(totIip)}</td><td class="n">${eur(totHelb)}</td>
      <td class="n">${pc(totHelb, totIip + totHelb)}</td><td class="n"></td></tr>
    ${Y.map(y => `<tr><td>${esc(y.annee)}</td><td class="n">${eur(y.cout_iip)}</td><td class="n">${eur(y.cout_helb)}</td>
      <td class="n">${y.coord.length ? eur(y.coord_iip) : '—'}</td><td class="n">${y.coord.length ? eur(y.coord_helb) : '—'}</td>
      <td class="n">${y.admin.fonctions.length ? eur(y.admin.part) : '—'}</td><td class="n g">${eur(y.tout_iip)}</td><td class="n g">${eur(y.tout_helb)}</td>
      <td class="n">${pc(y.tout_helb, y.tout_iip + y.tout_helb)}</td>
      <td class="n">${y.inscrits ? eur((y.tout_iip + y.tout_helb) / y.inscrits) : '—'}</td></tr>`).join('')}</tbody></table>`;

  // Par bloc et par nature : ETP IIP / HELB par année.
  const croise = (cleDe, libelle, titre) => {
    const cles = [...new Set(Y.flatMap(y => y.lignes.map(cleDe)))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
    const v = (y, k, h) => y.lignes.filter(l => cleDe(l) === k && l.helb === h).reduce((t, l) => t + l.etp, 0);
    return `<h2>${titre}</h2><table><thead><tr><th>${libelle}</th>${Y.map(y => `<th class="n" colspan="2">${esc(court(y.annee))}</th>`).join('')}</tr>
      <tr><th></th>${Y.map(() => '<th class="n">IIP</th><th class="n">HELB</th>').join('')}</tr></thead><tbody>
      ${cles.map(k => `<tr><td>${esc(NATURES[k] || (/^\d+$/.test(String(k)) ? `Autre (${k})` : k))}</td>${Y.map(y => `<td class="n">${v(y, k, false) ? n2(v(y, k, false)) : '—'}</td>
        <td class="n">${v(y, k, true) ? n2(v(y, k, true)) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };

  // Les coordinations et le cadre administratif, année par année.
  const fonctions = Y.map(y => `<h3>${esc(y.annee)}</h3>${!y.coord.length && !y.admin.fonctions.length
    ? '<p class="fin">Aucune fonction encodée pour cette année (onglet Fonctions de la fiche du personnel).</p>'
    : `<table><thead><tr><th>Fonction</th><th>Personne</th><th class="n">ETP</th><th class="n">dont HELB</th><th class="n">Coût IIP</th><th class="n">Coût HELB</th></tr></thead><tbody>
      ${y.coord.map(c => `<tr><td>${esc(c.fonction)}</td><td>${esc(c.personne)}</td><td class="n">${c.etp ? n2(c.etp) : '—'}</td><td class="n">${c.etp_helb ? n2(c.etp_helb) : '—'}</td>
        <td class="n">${c.mode === 'periodes' ? `<i>${eur(c.cout_periodes)}</i> *` : c.cout - c.cout_helb ? eur(c.cout - c.cout_helb) : '—'}</td>
        <td class="n">${c.cout_helb ? eur(c.cout_helb) : '—'}</td></tr>`).join('')}
      ${y.admin.fonctions.length ? `<tr class="repere"><td colspan="2">Cadre administratif de l'établissement (${y.admin.fonctions.map(f => esc(f.fonction)).filter((v, i, t) => t.indexOf(v) === i).join(', ')})</td>
        <td class="n">${n2(y.admin.fonctions.reduce((t, f) => t + f.etp, 0))}</td><td class="n">—</td>
        <td class="n">${eur(y.admin.cout)}</td><td class="n">—</td></tr>
        <tr><td colspan="4">— part de ${esc(section)} : ${n0(y.inscrits)} inscrits sur ${n0(y.admin.base)} (${pc(y.inscrits, y.admin.base)})</td>
        <td class="n g">${y.admin.cout ? eur(y.admin.part) : 'ETP à régler'}</td><td class="n">—</td></tr>` : ''}
      </tbody></table>`}`).join('');

  // Les professeurs : qui porte la charge, année par année.
  const profs = new Map();
  for (const y of Y) for (const l of y.lignes) {
    const k = `${l.professeur || 'À désigner'}|${l.helb ? 'HELB' : 'IIP'}`;
    if (!profs.has(k)) profs.set(k, {});
    profs.get(k)[y.annee] = (profs.get(k)[y.annee] || 0) + l.etp;
  }
  const rangProfs = [...profs.entries()].sort((a, b) => (b[1][aN.annee] || 0) - (a[1][aN.annee] || 0) || a[0].localeCompare(b[0], 'fr'));
  const tableProfs = `<table><thead><tr><th>Professeur</th><th>Contrat</th>${Y.map(y => `<th class="n">${esc(court(y.annee))}</th>`).join('')}</tr></thead><tbody>
    ${rangProfs.map(([k, v]) => { const [nom, c] = k.split('|'); return `<tr><td>${esc(nom)}</td>
      <td><span class="marque" style="background:${c === 'HELB' ? HELB : IIP}">${c}</span></td>
      ${Y.map(y => `<td class="n">${v[y.annee] ? n2(v[y.annee]) : '—'}</td>`).join('')}</tr>`; }).join('')}</tbody></table>`;

  const corps = `
    <style>
      h2 { font-size:12pt; margin:8mm 0 2mm; color:#1B2B4B; }
      .saut { break-before: page; }
      .en-bref ul { margin:1mm 0 0 4mm; padding:0; } .en-bref li { margin:0 0 1.5mm; font-size:9.5pt; line-height:1.4; }
      td.g { font-weight:700; }
      tbody td:first-child { white-space:nowrap; }
      .fin { color:#64748b; font-size:8pt; }
    </style>
    <table class="tuiles"><tr>
      <td class="tuile"><div class="tuile-boite fort" style="border-left-color:#1B2B4B"><div class="tuile-val">${n2(aN.etp)}<span class="tuile-u">ETP</span></div>
        <div class="tuile-lib">Charge ${esc(aN.annee)}</div><div class="tuile-fin">${n0(aN.per)} périodes</div></div></td>
      <td class="tuile"><div class="tuile-boite" style="border-left-color:${IIP}"><div class="tuile-val">${pc(aN.etp_iip, aN.etp)}</div>
        <div class="tuile-lib">Part de l'IIP</div><div class="tuile-fin">${n2(aN.etp_iip)} ETP · ${aN.profs_iip} enseignant(s)</div></div></td>
      <td class="tuile"><div class="tuile-boite" style="border-left-color:${HELB}"><div class="tuile-val">${pc(aN.etp_helb, aN.etp)}</div>
        <div class="tuile-lib">Part de la HELB</div><div class="tuile-fin">${n2(aN.etp_helb)} ETP · ${aN.profs_helb} enseignant(s)</div></div></td>
      <td class="tuile"><div class="tuile-boite" style="border-left-color:#1B2B4B"><div class="tuile-val">${n0(aN.inscrits)}</div>
        <div class="tuile-lib">Inscrits ${esc(aN.annee)}</div><div class="tuile-fin">${Y.length > 1 ? `${n0(a0.inscrits)} en ${esc(a0.annee)}` : ''}</div></div></td>
    </tr></table>
    <div class="en-bref"><h3>En bref</h3><ul>${bref.filter(Boolean).map(x => `<li>${x}</li>`).join('')}</ul></div>

    ${colonnesEmpilees(Y, 'etp', n2, 'La charge d’enseignement, en ETP')}
    ${partsParAnnee(Y, 'etp', 'Qui porte la charge d’enseignement')}

    <h2 class="saut">La charge, année par année</h2>
    <table><thead><tr><th>Année</th><th class="n">Pér. IIP</th><th class="n">Pér. HELB</th><th class="n">ETP IIP</th><th class="n">ETP HELB</th>
      <th class="n">ETP total</th><th class="n">Part HELB</th><th class="n">Ens. IIP / HELB</th><th class="n">Inscrits</th><th class="n">ETP / 100 ét.</th></tr></thead>
      <tbody>${Y.map(ligneAnnee).join('')}</tbody></table>

    ${colonnesEmpilees(Y.map(y => ({ annee: y.annee, cout_iip: y.tout_iip, cout_helb: y.tout_helb })), 'cout', v => `${n0(v / 1000)} k€`, 'Le coût de la section, cadre administratif et coordinations compris')}
    ${partsParAnnee(Y.map(y => ({ annee: y.annee, cout_iip: y.tout_iip, cout_helb: y.tout_helb })), 'cout', 'Qui paie')}

    <h2 class="saut">Les coûts, poste par poste</h2>
    ${tableCouts}
    <p class="fin">Coût des cours : les périodes attribuées au barème de la circulaire des conventions (CT, PP, cours spéciaux, par niveau),
      comme le rapport « Coûts des formations ». Coordinations : la part HELB d'une fonction compte toujours ; une coordination tenue par
      un enseignant qui a des périodes est déjà payée par elles (* montant indicatif, non ajouté). Cadre administratif (direction,
      secrétariat) : emplois de l'établissement, partagés entre les sections au prorata de leurs inscrits ; il est porté par l'IIP.</p>

    ${croise(l => l.bloc, 'Bloc', 'La charge par bloc d’études (ETP)')}
    ${croise(l => l.nature, 'Nature', 'La charge par nature (ETP)')}

    <h2 class="saut">Les coordinations et le cadre administratif</h2>
    ${fonctions}

    <h2 class="saut">Qui porte la charge — par enseignant (ETP)</h2>
    ${tableProfs}

    <h2>Méthode</h2>
    <p class="fin">Source : les attributions de Lucie (les années ${esc(annees.filter(a => a < '2025-2026').join(', ') || '—')} reprises des fichiers
      d'attributions de la direction), hors congés. ETP au barème du Pilotage : périodes CT ÷ 800 + PP ÷ 1 000, autonomie comprise ; une
      attribution sans type compte en CT. « HELB » : attributions dont le contrat est HELB. Inscrits : ceux des chiffres clés de l'année.
      ${premiere ? `Première année de ${esc(section)} dans Lucie : ${esc(premiere)}.` : ''}</p>`;

  return {
    corps,
    titre: `IIP et HELB — ${section}`,
    nom: `IIP-HELB-${section}-${annees.map(court).join('_')}.html`,
    entete: { titre: `IIP et HELB : la charge et le coût de ${section}`, sous: `${annees.join(' · ')} · enseignement, coordinations, cadre administratif` },
  };
}

/** Pour l'aperçu en tableau et le tableur : une ligne par année. */
export function lignesIipHelb(p) {
  const section = p.section || 'TIM';
  const annees = (p.annees?.length ? p.annees : []).sort();
  return annees.map(a => {
    const y = annee(section, a);
    return { annee: a, section, etp_iip: Math.round(y.etp_iip * 100) / 100, etp_helb: Math.round(y.etp_helb * 100) / 100,
      per_iip: Math.round(y.per_iip), per_helb: Math.round(y.per_helb), cout_iip: Math.round(y.cout_iip + y.coord_iip + y.admin.part),
      cout_helb: Math.round(y.cout_helb + y.coord_helb), inscrits: y.inscrits };
  });
}

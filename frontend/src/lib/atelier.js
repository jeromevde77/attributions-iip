/**
 * L'ATELIER DES PIÈCES — composer un modèle en glissant des éléments tout faits
 * (Charles, 9 octobre 2026 : « mes secrétaires, qui n'ont aucune notion de code
 * ni même de mise en page, doivent y parvenir »).
 *
 * Un moteur sans React : la page est faite de zones éditables (contenteditable)
 * qu'un rendu React redessinerait sous le curseur. React monte le conteneur,
 * l'Atelier le remplit et rend compte de chaque changement par `onChange`.
 *
 * Le modèle se garde sous deux formes, écrites ensemble par Editeur.jsx :
 *   · la STRUCTURE (les éléments et leurs réglages), pour rouvrir l'Atelier ;
 *   · le HTML, styles intégrés, avec les {{champs}} habituels — c'est lui que
 *     la production des pièces remplit, comme pour tout autre modèle.
 */

export const ETATS = [['fort', 'Marine', '#16406A'], ['reussi', 'Réussi', '#3E7D5E'], ['disponible', 'En cours', '#2F6FB0'],
  ['surveiller', 'Attention', '#B45309'], ['corriger', 'Problème', '#9D4A38'], ['faveur', 'Faveur', '#6B46C1'], ['neutre', 'Neutre', '#CBD5E1']];
const coul = k => (ETATS.find(e => e[0] === k) || ETATS[6])[2];
const LOGO = '<svg viewBox="0 0 220 60" xmlns="http://www.w3.org/2000/svg"><path d="M30 8a26 26 0 1 0 0 44" fill="none" stroke="#F9B619" stroke-width="5"/><path d="M38 12a20 20 0 1 0 0 36" fill="none" stroke="#05B7E6" stroke-width="4"/><text x="58" y="34" font-family="Arial" font-size="24" font-weight="700" fill="#19537E">institut</text><text x="58" y="50" font-family="Arial" font-size="12" fill="#F9B619">Ilya Prigogine</text></svg>';
const FORME = { rayon: 10, coins: { tl: 0, tr: 1, br: 1, bl: 0 }, bande: 4, pos: 'gauche' };
const clone = o => JSON.parse(JSON.stringify(o));
const chip = (k, l) => `<span class="chip" data-d="${k}" contenteditable="false">${l}</span>`;

export const MODELES = {
  entete: { lib: "En-tête de l'Institut", p: {} },
  titre: { lib: 'Titre de la pièce', p: { titre: 'Titre de la pièce', sous: 'Sous-titre' } },
  texte: { lib: 'Paragraphe', p: { html: 'Écrivez votre texte ici.' } },
  tuile: { lib: 'Tuile chiffrée', p: { v: '12', l: 'Libellé', pr: 'précision', etat: 'fort', largeur: 32, hauteur: 0, ...FORME } },
  rangee: { lib: 'Rangée de 3 tuiles' },
  train: { lib: 'Petit train', p: { largeur: 100, hauteur: 0, bande: 3, pos: 'bas', rayon: 10, coins: { tl: 1, tr: 1, br: 1, bl: 1 },
    wagons: [['—', 'section', 'fort', 1], ['—', 'niveau', 'disponible', 1], ['0', 'ECTS', 'reussi', 1]] } },
  encadre: { lib: 'Encadré', p: { t: 'À retenir', html: 'Votre message.', etat: 'disponible', largeur: 100, hauteur: 0, ...FORME } },
  tableau: { lib: 'Tableau', p: { style: 'marine', zebre: true, rayon: 0, coins: { tl: 1, tr: 1, br: 1, bl: 1 },
    lignes: [['Colonne 1', 'Colonne 2', 'Colonne 3'], ['', '', ''], ['', '', '']] } },
  logo: { lib: 'Logo', p: { largeur: 28 } },
  signature: { lib: 'Signature', p: { lieu: 'Fait à Bruxelles, le …', qual: 'Le Directeur', nom: '' } },
  filet: { lib: 'Ligne dorée', p: {} },
  pied: { lib: 'Bas de page', p: {} },
};
const VIG = {
  entete: '<div style="width:86%"><div style="height:3px;background:#C9A84C;margin-bottom:4px"></div><div style="height:5px;width:60%;background:#1B2B4B;border-radius:2px"></div></div>',
  titre: '<div style="width:80%;border-left:3px solid #C9A84C;padding-left:5px"><div style="height:6px;width:80%;background:#1B2B4B;border-radius:2px"></div><div style="height:3px;width:50%;background:#AAB2BF;border-radius:2px;margin-top:3px"></div></div>',
  texte: '<div style="width:80%"><div style="height:3px;background:#AAB2BF;margin:2px 0"></div><div style="height:3px;background:#AAB2BF;margin:2px 0"></div><div style="height:3px;width:60%;background:#AAB2BF;margin:2px 0"></div></div>',
  tuile: '<div style="width:46%;height:28px;border:1px solid #D8DCE4;border-left:3px solid #16406A;border-radius:0 5px 5px 0;background:#fff"></div>',
  rangee: '<div style="display:flex;gap:3px;width:86%">' + '<div style="flex:1;height:26px;border:1px solid #D8DCE4;border-left:3px solid #3E7D5E;border-radius:0 4px 4px 0;background:#fff"></div>'.repeat(3) + '</div>',
  train: '<div style="display:flex;width:86%;height:26px;border:1px solid #D8DCE4;border-radius:5px;background:#fff;overflow:hidden">' + ['#16406A', '#2F6FB0', '#3E7D5E'].map(c => `<div style="flex:1;position:relative;border-left:1px solid #E6E9EE"><div style="position:absolute;left:3px;right:3px;bottom:0;height:3px;background:${c}"></div></div>`).join('') + '</div>',
  encadre: '<div style="width:84%;height:26px;border:1px solid #D8DCE4;border-left:3px solid #2F6FB0;border-radius:0 5px 5px 0;background:#fff"></div>',
  tableau: '<div style="width:80%;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#CBD5E1;border:1px solid #CBD5E1">' + '<div style="height:6px;background:#1B2B4B"></div>'.repeat(3) + '<div style="height:6px;background:#fff"></div>'.repeat(6) + '</div>',
  logo: '<div style="width:60%">' + LOGO + '</div>',
  signature: '<div style="width:80%;display:flex;justify-content:flex-end"><div style="width:50%;border-bottom:1px solid #94A3B8;height:16px"></div></div>',
  filet: '<div style="width:80%;height:2px;background:#C9A84C"></div>',
  pied: '<div style="width:86%;border-top:1px solid #C9A84C;padding-top:3px"><div style="height:3px;width:70%;margin:auto;background:#AAB2BF"></div></div>',
};

const CSS = `
.atelier-lucie{display:grid;grid-template-columns:230px minmax(0,1fr) 260px;height:100%;min-height:0;font-size:13px;color:#1B2B4B}
.atelier-lucie .at-col{overflow:auto;padding:12px;background:#fff}
.atelier-lucie .at-g{border-right:1px solid #E2E8F0}.atelier-lucie .at-d{border-left:1px solid #E2E8F0}
.atelier-lucie .at-tc{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#64748B;margin:2px 0 8px}
.atelier-lucie .at-aide{font-size:12px;color:#64748B;line-height:1.45;margin:0 0 10px}
.atelier-lucie .at-cartes{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:16px}
.atelier-lucie .at-carte{border:1px solid #E2E8F0;border-radius:10px;padding:7px;cursor:grab;background:#fff;display:flex;flex-direction:column;gap:5px;user-select:none;text-align:left}
.atelier-lucie .at-carte:hover{border-color:#2F6FB0;background:#F8FAFC}
.atelier-lucie .at-vig{height:40px;border-radius:6px;background:#F6F7F9;border:1px solid #E6E9EE;display:flex;align-items:center;justify-content:center;overflow:hidden}
.atelier-lucie .at-lib{font-size:12px;font-weight:500;line-height:1.25}
.atelier-lucie .at-cat{font-size:11px;color:#64748B;margin:8px 0 4px}
.atelier-lucie .at-donnees{display:flex;flex-wrap:wrap;gap:5px}
.atelier-lucie .at-donnee{font-size:12px;padding:3px 8px;border-radius:999px;border:1px solid #2F6FB0;color:#16406A;background:#EEF4FB;cursor:pointer}
.atelier-lucie .at-centre{overflow:auto;background:#EEF1F5;display:flex;flex-direction:column;min-height:0}
.atelier-lucie .at-outils{position:sticky;top:0;z-index:8;display:flex;gap:8px;align-items:center;padding:8px 16px;background:#EEF1F5}
.atelier-lucie .at-outils button{height:32px;padding:0 12px;white-space:nowrap;flex:none;border-radius:8px;border:1px solid #CBD5E1;background:#fff;font-size:12.5px;cursor:pointer}
.atelier-lucie .at-outils button.on{background:#E7EEF6;border-color:#16406A;color:#16406A}
.atelier-lucie .feuille{width:794px;max-width:calc(100% - 32px);margin:4px auto 40px;background:#fff;box-shadow:0 1px 2px rgba(16,32,64,.06),0 8px 28px rgba(16,32,64,.10);min-height:1123px;padding:56px 60px 30px;position:relative;display:flex;flex-direction:column;font-family:Arial,Helvetica,sans-serif;font-size:13px}
.atelier-lucie .flux{display:flex;flex-wrap:wrap;gap:12px;align-content:flex-start;flex:1}
.atelier-lucie .bloc{position:relative;width:100%;border-radius:4px;outline:1px dashed transparent;outline-offset:4px}
.atelier-lucie .bloc:hover{outline-color:#A9C3E0}.atelier-lucie .bloc.sel{outline:2px solid #2F6FB0}
.atelier-lucie .apercu .bloc{outline:none!important}
.atelier-lucie .poignee{position:absolute;width:12px;height:12px;background:#fff;border:2px solid #2F6FB0;border-radius:3px;z-index:5;display:none}
.atelier-lucie .bloc.sel .poignee{display:block}.atelier-lucie .apercu .poignee{display:none!important}
.atelier-lucie .p-e{right:-11px;top:50%;margin-top:-6px;cursor:ew-resize}.atelier-lucie .p-s{bottom:-11px;left:50%;margin-left:-6px;cursor:ns-resize}.atelier-lucie .p-se{right:-11px;bottom:-11px;cursor:nwse-resize}
.atelier-lucie .mesure{position:absolute;top:-30px;right:0;background:#1B2B4B;color:#fff;font-size:11.5px;font-weight:600;padding:3px 7px;border-radius:5px;display:none;z-index:6;white-space:nowrap}
.atelier-lucie .bloc.redim .mesure{display:block}
.atelier-lucie .saisir{position:absolute;top:-30px;left:0;display:none;gap:4px;z-index:6}
.atelier-lucie .bloc.sel .saisir{display:flex}.atelier-lucie .apercu .saisir{display:none!important}
.atelier-lucie .saisir button{height:24px;padding:0 8px;border-radius:6px;border:1px solid #2F6FB0;background:#fff;color:#1B2B4B;font-size:11.5px;cursor:pointer}
.atelier-lucie .saisir .grip{cursor:grab}
.atelier-lucie .indic{height:3px;background:#2F6FB0;border-radius:2px;width:100%;margin:-6px 0}
.atelier-lucie [contenteditable="true"]{outline:none;cursor:text}.atelier-lucie [contenteditable="true"]:focus{background:#F2F7FD}
.atelier-lucie .chip{display:inline-block;padding:0 6px;border-radius:4px;background:#E7EEF6;color:#16406A;border:1px solid #9DB9D8;font-size:.92em;white-space:nowrap}
.atelier-lucie .apercu .chip{background:#FEF3C7;border-color:#F3D27A;color:#7A5A00}
.atelier-lucie .en-tete .cf{font-size:8.5px;letter-spacing:.32em;color:#8A93A3;font-weight:700;padding-bottom:8px}
.atelier-lucie .en-tete .id{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #D8DCE4;padding-bottom:10px}
.atelier-lucie .en-tete .etab{font-size:18px;font-weight:700}.atelier-lucie .en-tete .adr{font-size:10.5px;color:#5B6577}.atelier-lucie .en-tete .mat{font-size:10px;color:#8A93A3;text-align:right}
.atelier-lucie .cadre-titre{border-left:4px solid #C9A84C;padding:4px 0 4px 16px}
.atelier-lucie .cadre-titre .t{font-size:21px;font-weight:700;line-height:1.15}.atelier-lucie .cadre-titre .s{font-size:12.5px;color:#5B6577;margin-top:4px}
.atelier-lucie .texte{line-height:1.6;text-align:justify}
.atelier-lucie .tuile,.atelier-lucie .encadre{border:1px solid #D8DCE4;padding:10px 14px;background:#fff;height:100%}
.atelier-lucie .tuile{display:flex;flex-direction:column;justify-content:center}
.atelier-lucie .tuile .v{font-size:24px;font-weight:700;line-height:1.1}.atelier-lucie .tuile .l{font-size:12px}.atelier-lucie .tuile .p{font-size:11px;color:#6B7486}
.atelier-lucie .encadre .t{font-weight:700;font-size:12.5px;margin-bottom:3px}
.atelier-lucie .tab-cadre{border:1px solid #CBD5E1;overflow:hidden}
.atelier-lucie table.doc{width:100%;border-collapse:collapse;font-size:12px}
.atelier-lucie table.doc td,.atelier-lucie table.doc th{border-right:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;padding:6px 9px;text-align:left;vertical-align:top}
.atelier-lucie table.doc tr>*:last-child{border-right:none}.atelier-lucie table.doc tr:last-child>*{border-bottom:none}
.atelier-lucie table.doc.marine th{background:#1B2B4B;color:#fff;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase}
.atelier-lucie table.doc.sobre th{background:#EDF2F8}
.atelier-lucie table.doc.leger td,.atelier-lucie table.doc.leger th{border-right:none}
.atelier-lucie table.doc.zebre tr:nth-child(odd):not(:first-child) td{background:#F6F8FB}
.atelier-lucie .ajout-tab{display:none;gap:6px;margin-top:6px}.atelier-lucie .bloc.sel .ajout-tab{display:flex}.atelier-lucie .apercu .ajout-tab{display:none!important}
.atelier-lucie .ajout-tab button{flex:1;height:28px;border:1px dashed #2F6FB0;border-radius:6px;background:#F5F9FD;color:#16406A;font-size:12px;cursor:pointer}
.atelier-lucie .train{display:flex;border:1px solid #D8DCE4;background:#fff;height:100%;overflow:hidden}
.atelier-lucie .wagon{position:relative;padding:8px 14px 12px;min-width:40px;display:flex;flex-direction:column;justify-content:center}
.atelier-lucie .wagon+.wagon{border-left:1px solid #D8DCE4}
.atelier-lucie .wagon .v{font-size:20px;font-weight:700;line-height:1.1}.atelier-lucie .wagon .l{font-size:11.5px;color:#5B6577}
.atelier-lucie .wagon .barre-w{position:absolute;left:8px;right:8px;bottom:0;border-radius:3px 3px 0 0}
.atelier-lucie .wagon.wsel{background:#F2F7FD}.atelier-lucie .apercu .wagon.wsel{background:none}
.atelier-lucie .sep-w{position:absolute;top:0;bottom:0;right:-5px;width:10px;cursor:col-resize;z-index:4}
.atelier-lucie .bloc.sel .sep-w:hover{background:rgba(47,111,176,.18)}.atelier-lucie .apercu .sep-w{display:none}
.atelier-lucie .signature{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-top:8px}
.atelier-lucie .signature .qual{text-align:center}.atelier-lucie .ligne-sig{width:190px;border-bottom:1px solid #94A3B8;height:46px;margin-bottom:4px}
.atelier-lucie .filet-or{height:2px;background:#C9A84C;width:100%}
.atelier-lucie .pied{margin-top:auto;padding-top:14px;width:100%}
.atelier-lucie .pied .ligne{border-top:1px solid #C9A84C;padding-top:6px;text-align:center;font-size:8.5px;color:#4B5563;line-height:1.5}
.atelier-lucie .logo svg{display:block;width:100%;height:auto}
.atelier-lucie .groupe{margin-bottom:16px}.atelier-lucie .groupe h4{margin:0 0 7px;font-size:11.5px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.05em}
.atelier-lucie .pastilles{display:flex;flex-wrap:wrap;gap:7px}
.atelier-lucie .pastille{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10.5px;color:#64748B;cursor:pointer;background:none;border:none;padding:0;width:50px}
.atelier-lucie .pastille i{width:24px;height:24px;border-radius:50%;display:block;border:3px solid #fff;box-shadow:0 0 0 1px #CBD5E1}
.atelier-lucie .pastille.on i{box-shadow:0 0 0 2px #16406A}
.atelier-lucie .seg{display:flex;border:1px solid #CBD5E1;border-radius:8px;overflow:hidden}
.atelier-lucie .seg button{flex:1;height:30px;border:none;background:#fff;font-size:12px;cursor:pointer}
.atelier-lucie .seg button+button{border-left:1px solid #CBD5E1}.atelier-lucie .seg button.on{background:#E7EEF6;color:#16406A;font-weight:600}
.atelier-lucie .rang{display:flex;gap:6px;flex-wrap:wrap}
.atelier-lucie .rang button{height:30px;padding:0 10px;border-radius:8px;border:1px solid #CBD5E1;background:#fff;font-size:12px;cursor:pointer}
.atelier-lucie .danger{color:#9D4A38}
.atelier-lucie .vide{color:#64748B;line-height:1.5;border:1px dashed #CBD5E1;border-radius:10px;padding:12px}
.atelier-lucie .coins{position:relative;width:90px;height:58px;border:2px solid #CBD5E1;border-radius:6px;margin:6px 0 10px 12px}
.atelier-lucie .coin{position:absolute;width:20px;height:20px;border-radius:50%;border:2px solid #CBD5E1;background:#fff;cursor:pointer;padding:0}
.atelier-lucie .coin.on{background:#16406A;border-color:#16406A}
.atelier-lucie .coin.tl{left:-11px;top:-11px}.atelier-lucie .coin.tr{right:-11px;top:-11px}.atelier-lucie .coin.br{right:-11px;bottom:-11px}.atelier-lucie .coin.bl{left:-11px;bottom:-11px}
.atelier-lucie .curseur{display:flex;align-items:center;gap:10px;font-size:12px}.atelier-lucie .curseur input{flex:1;accent-color:#16406A}
.atelier-lucie .curseur b{min-width:40px;text-align:right;font-variant-numeric:tabular-nums}
`;

const rayon = p => { const r = p.rayon || 0, c = p.coins || {}; return `${c.tl ? r : 0}px ${c.tr ? r : 0}px ${c.br ? r : 0}px ${c.bl ? r : 0}px`; };
function forme(p) {
  const b = p.bande ?? 4, pos = p.pos || 'gauche';
  const cotes = { gauche: 'left', haut: 'top', bas: 'bottom' };
  let st = `border-radius:${rayon(p)};`;
  if (pos !== 'aucune' && b > 0 && cotes[pos]) st += `border-${cotes[pos]}:${b}px solid ${coul(p.etat)};`;
  return st;
}
const redimensionnable = t => ['tuile', 'encadre', 'logo', 'train'].includes(t);
const hauteurLibre = t => ['tuile', 'encadre', 'train'].includes(t);

/* ── L'EXPORT : le HTML du modèle, styles intégrés, champs en {{clé}} ── */
const versChamps = h => String(h || '').replace(/<span[^>]*data-d="([^"]+)"[^>]*>[\s\S]*?<\/span>/g, '{{$1}}');
export function exporterHtml(blocs) {
  const T = 'font-family:Arial,Helvetica,sans-serif;color:#1B2B4B';
  const larg = p => (p.largeur && p.largeur < 100 ? `width:calc(${p.largeur}% - 8px);` : 'width:100%;');
  const haut = p => (p.hauteur ? `height:${p.hauteur}px;` : '');
  const cadreBloc = (p, contenu) => `<div style="display:inline-block;vertical-align:top;box-sizing:border-box;${larg(p)}${haut(p)}margin:0 8px 10px 0">${contenu}</div>`;
  const out = [];
  for (const b of blocs) {
    const p = b.p, v = versChamps;
    switch (b.type) {
      case 'entete': out.push(`<div style="${T};margin-bottom:12px"><div style="font-size:7pt;letter-spacing:.3em;color:#8A93A3;font-weight:700;padding-bottom:6px">COMMUNAUTÉ FRANÇAISE DE BELGIQUE — ENSEIGNEMENT POUR ADULTES</div><table style="width:100%;border-collapse:collapse;border-bottom:1px solid #D8DCE4"><tr><td style="padding:0 0 8px;border:none"><div style="font-size:15pt;font-weight:700">{{etab.etab_nom}}</div><div style="font-size:8.5pt;color:#5B6577">{{etab.adresse}}</div></td><td style="padding:0 0 8px;border:none;text-align:right;font-size:8pt;color:#8A93A3">FASE {{etab.num_fase}}</td></tr></table></div>`); break;
      case 'titre': out.push(`<div style="${T};border-left:4px solid #C9A84C;padding:3px 0 3px 14px;margin:10px 0 12px"><div style="font-size:17pt;font-weight:700;line-height:1.15">${v(p.titre)}</div><div style="font-size:10pt;color:#5B6577;margin-top:3px">${v(p.sous)}</div></div>`); break;
      case 'texte': out.push(`<div style="${T};font-size:10pt;line-height:1.6;text-align:justify;margin:0 0 10px">${v(p.html)}</div>`); break;
      case 'tuile': out.push(cadreBloc(p, `<div style="${T};box-sizing:border-box;height:100%;border:1px solid #D8DCE4;${forme(p)}padding:8px 12px;background:#fff"><div style="font-size:17pt;font-weight:700;line-height:1.1">${v(p.v)}</div><div style="font-size:9pt">${v(p.l)}</div><div style="font-size:8pt;color:#6B7486">${v(p.pr)}</div></div>`)); break;
      case 'encadre': out.push(cadreBloc(p, `<div style="${T};box-sizing:border-box;height:100%;border:1px solid #D8DCE4;${forme(p)}padding:8px 12px;background:#fff"><div style="font-weight:700;font-size:9.5pt;margin-bottom:2px">${v(p.t)}</div><div style="font-size:9.5pt;line-height:1.5">${v(p.html)}</div></div>`)); break;
      case 'train': {
        const tot = p.wagons.reduce((t, w) => t + (w[3] || 1), 0);
        out.push(cadreBloc(p, `<table style="${T};width:100%;height:100%;border-collapse:separate;border-spacing:0;border:1px solid #D8DCE4;border-radius:${rayon(p)};overflow:hidden"><tr>${p.wagons.map((w, i) => `<td style="width:${Math.round((w[3] || 1) / tot * 100)}%;padding:6px 12px ${p.pos !== 'aucune' ? 8 + (p.bande || 3) : 8}px;${i ? 'border-left:1px solid #D8DCE4;' : ''}vertical-align:middle;${p.pos !== 'aucune' && p.bande ? `box-shadow:inset 0 -${p.bande}px 0 ${coul(w[2])};` : ''}"><div style="font-size:14pt;font-weight:700;line-height:1.1">${v(w[0])}</div><div style="font-size:8.5pt;color:#5B6577">${v(w[1])}</div></td>`).join('')}</tr></table>`));
        break;
      }
      case 'tableau': {
        const L = p.lignes, n = L.length;
        const th = p.style === 'marine' ? 'background:#1B2B4B;color:#fff;font-size:8pt;letter-spacing:.04em;text-transform:uppercase;' : p.style === 'sobre' ? 'background:#EDF2F8;' : '';
        out.push(`<div style="border:1px solid #CBD5E1;border-radius:${rayon(p)};overflow:hidden;margin:0 0 12px"><table style="${T};width:100%;border-collapse:collapse;font-size:9pt">${L.map((l, i) => `<tr>${l.map((c, j) => {
          const bords = `${j < l.length - 1 && p.style !== 'leger' ? 'border-right:1px solid #CBD5E1;' : ''}${i < n - 1 ? 'border-bottom:1px solid #CBD5E1;' : ''}`;
          const fond = i > 0 && p.zebre && i % 2 === 0 ? 'background:#F6F8FB;' : '';
          return i === 0 ? `<th style="text-align:left;padding:5px 8px;${bords}${th}">${v(c)}</th>` : `<td style="padding:5px 8px;vertical-align:top;${bords}${fond}">${v(c)}</td>`;
        }).join('')}</tr>`).join('')}</table></div>`);
        break;
      }
      case 'logo': out.push(`<div style="width:${p.largeur || 28}%;margin:0 0 10px">{{etab.logo}}</div>`); break;
      case 'signature': out.push(`<table style="${T};width:100%;border-collapse:collapse;margin-top:14px;font-size:9.5pt"><tr><td style="border:none;vertical-align:bottom">${v(p.lieu)}</td><td style="border:none;width:220px;text-align:center"><div style="border-bottom:1px solid #94A3B8;height:42px;margin-bottom:4px"></div>${v(p.qual)}<br><b>${v(p.nom)}</b></td></tr></table>`); break;
      case 'filet': out.push('<div style="height:2px;background:#C9A84C;margin:6px 0 12px"></div>'); break;
      case 'pied': out.push(`<div data-pied="true" style="${T};border-top:1px solid #C9A84C;padding-top:5px;text-align:center;font-size:7pt;color:#4B5563;line-height:1.5;margin-top:18px">{{etab.etab_nom}} • {{etab.adresse}}</div>`); break;
      default:
    }
  }
  return out.join('\n');
}

/** Monte l'Atelier dans `el`. Rend { detruire, structure }. */
export function monterAtelier(el, { structure = null, champs = {}, onChange = () => {} } = {}) {
  if (!document.getElementById('atelier-lucie-css')) {
    const st = document.createElement('style'); st.id = 'atelier-lucie-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  let n = 0, blocs = [], sel = null, wagonSel = 0, histo = [], enApercu = false, derniereZone = null;
  const nouveau = (type, p) => ({ id: ++n, type, p: clone(p || MODELES[type].p || {}) });
  if (Array.isArray(structure) && structure.length) { blocs = structure.map(b => ({ ...clone(b), id: ++n })); }
  else blocs = [nouveau('entete'), nouveau('titre'), nouveau('texte'), nouveau('signature'), nouveau('pied')];
  const sortie = () => blocs.map(({ type, p }) => ({ type, p }));
  const signaler = () => onChange(sortie(), exporterHtml(blocs));
  const memoriser = () => { histo.push(JSON.stringify(blocs)); if (histo.length > 60) histo.shift(); };

  el.classList.add('atelier-lucie');
  el.innerHTML = `<aside class="at-col at-g"><div class="at-tc">Éléments tout faits</div>
      <p class="at-aide">Glissez un élément sur la feuille, ou cliquez dessus pour l'ajouter sous l'élément choisi.</p>
      <div class="at-cartes"></div>
      <div class="at-tc">Données de Lucie</div>
      <p class="at-aide">Cliquez dans un texte de la feuille, puis sur une donnée : elle se remplira toute seule.</p>
      <input class="controle at-cherche" placeholder="Chercher une donnée…" style="width:100%;margin-bottom:6px" data-reponses="non">
      <div class="at-donnees-cats"></div></aside>
    <main class="at-centre"><div class="at-outils"><b style="font-size:13px;white-space:nowrap">L’atelier de Lucie</b><button data-o="annuler">↶ Annuler</button><button data-o="apercu">Voir le rendu</button>
      <span style="font-size:12px;color:#64748B">Cliquez un élément pour le régler à droite ; tirez ses poignées pour le dimensionner.</span></div>
      <div class="feuille"><div class="flux"></div><div class="pied-zone"></div></div></main>
    <aside class="at-col at-d at-reglages"></aside>`;
  const $ = s => el.querySelector(s);
  const feuille = $('.feuille'), flux = $('.flux');

  const ed = (k, html, cls = '') => `<div class="${cls}" contenteditable="${enApercu ? 'false' : 'true'}" data-k="${k}">${html}</div>`;
  function contenu(b) {
    const p = b.p;
    switch (b.type) {
      case 'entete': return `<div class="en-tete"><div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE — ENSEIGNEMENT POUR ADULTES</div><div class="id"><div><div class="etab">Institut Ilya Prigogine</div><div class="adr">Campus Erasme, Bât. P, route de Lennik 808, 1070 Bruxelles</div></div><div class="mat">FASE 292</div></div></div>`;
      case 'titre': return `<div class="cadre-titre">${ed('titre', p.titre, 't')}${ed('sous', p.sous, 's')}</div>`;
      case 'texte': return `<div class="texte">${ed('html', p.html)}</div>`;
      case 'tuile': return `<div class="tuile" style="${forme(p)}">${ed('v', p.v, 'v')}${ed('l', p.l, 'l')}${ed('pr', p.pr, 'p')}</div>`;
      case 'encadre': return `<div class="encadre" style="${forme(p)}">${ed('t', p.t, 't')}${ed('html', p.html)}</div>`;
      case 'train': return `<div class="train" style="border-radius:${rayon(p)}">${p.wagons.map((w, i) => `<div class="wagon ${b.id === sel && wagonSel === i ? 'wsel' : ''}" data-w="${i}" style="flex:${w[3] || 1} 1 0">`
        + `<div class="v" contenteditable="${!enApercu}" data-wk="${i}-0">${w[0]}</div><div class="l" contenteditable="${!enApercu}" data-wk="${i}-1">${w[1]}</div>`
        + (p.pos !== 'aucune' && p.bande > 0 ? `<div class="barre-w" style="height:${p.bande}px;background:${coul(w[2])}"></div>` : '')
        + (i < p.wagons.length - 1 ? `<span class="sep-w" data-sep="${i}"></span>` : '') + '</div>').join('')}</div>`;
      case 'tableau': return `<div class="tab-cadre" style="border-radius:${rayon(p)}"><table class="doc ${p.style} ${p.zebre ? 'zebre' : ''}">${p.lignes.map((l, i) => `<tr>${l.map((c, j) => (i === 0
        ? `<th contenteditable="${!enApercu}" data-cell="${i}-${j}">${c}</th>` : `<td contenteditable="${!enApercu}" data-cell="${i}-${j}">${c}</td>`)).join('')}</tr>`).join('')}</table></div>
        <div class="ajout-tab"><button data-act="lig">+ Ajouter une ligne</button><button data-act="col">+ Ajouter une colonne</button></div>`;
      case 'logo': return `<div class="logo">${LOGO}</div>`;
      case 'signature': return `<div class="signature">${ed('lieu', p.lieu)}<div class="qual"><div class="ligne-sig"></div>${ed('qual', p.qual)}${ed('nom', p.nom || '…', '')}</div></div>`;
      case 'filet': return '<div class="filet-or"></div>';
      case 'pied': return '<div class="pied"><div class="ligne">Institut Ilya Prigogine • adresse et coordonnées de l’établissement — le pied commun de Lucie</div></div>';
      default: return '';
    }
  }
  const bloc = id => blocs.find(b => b.id === +id);
  function rendre() {
    flux.innerHTML = ''; $('.pied-zone').innerHTML = '';
    for (const b of blocs) {
      const d = document.createElement('div');
      d.className = `bloc${b.id === sel ? ' sel' : ''}`; d.dataset.id = b.id;
      if (redimensionnable(b.type)) d.style.width = `calc(${b.p.largeur}% - ${b.p.largeur < 100 ? 8 : 0}px)`;
      if (hauteurLibre(b.type) && b.p.hauteur) d.style.height = `${b.p.hauteur}px`;
      d.innerHTML = contenu(b) + `<div class="saisir"><button class="grip" draggable="true" title="Glisser pour déplacer">⠿ Déplacer</button><button data-act="dup">Dupliquer</button><button data-act="suppr" class="danger">Retirer</button></div>`
        + (redimensionnable(b.type) ? `<span class="poignee p-e" data-r="e"></span>${hauteurLibre(b.type) ? '<span class="poignee p-s" data-r="s"></span><span class="poignee p-se" data-r="se"></span>' : ''}<span class="mesure"></span>` : '');
      (b.type === 'pied' ? $('.pied-zone') : flux).appendChild(d);
    }
    feuille.classList.toggle('apercu', enApercu);
    reglages();
  }
  function reglages() {
    const r = $('.at-reglages'), b = bloc(sel);
    if (!b || enApercu) { r.innerHTML = `<div class="at-tc">Réglages</div><div class="vide">${enApercu ? 'Vous voyez la pièce sans les poignées ; les données sont surlignées en jaune. Cliquez « Revenir à l’édition » pour la modifier.' : 'Cliquez sur un élément de la feuille pour le régler ici.'}</div>`; return; }
    let h = `<div class="at-tc">${MODELES[b.type].lib}</div>`;
    const past = (cle, val) => `<div class="pastilles">${ETATS.map(([k, l, c]) => `<button class="pastille ${val === k ? 'on' : ''}" data-${cle}="${k}"><i style="background:${c}"></i>${l}</button>`).join('')}</div>`;
    if (['tuile', 'encadre'].includes(b.type)) h += `<div class="groupe"><h4>Couleur</h4>${past('etat', b.p.etat)}</div>`;
    if (b.type === 'train') {
      const w = b.p.wagons[wagonSel] || b.p.wagons[0];
      h += `<div class="groupe"><h4>Wagons</h4><div class="rang"><button data-act="wplus">+ Wagon</button><button class="danger" data-act="wmoins">− Wagon</button></div>
        <p class="at-aide" style="margin-top:8px">Cliquez un wagon pour le choisir ; tirez la séparation entre deux wagons pour changer leurs largeurs.</p></div>
        <div class="groupe"><h4>Couleur du wagon ${wagonSel + 1}</h4>${past('wetat', w[2])}</div>`;
    }
    if (['tuile', 'encadre', 'train', 'tableau'].includes(b.type)) {
      const c = b.p.coins || {};
      h += `<div class="groupe"><h4>Coins</h4><div style="display:flex;gap:20px;align-items:center"><div class="coins">${['tl', 'tr', 'br', 'bl'].map(k => `<button class="coin ${k} ${c[k] ? 'on' : ''}" data-coin="${k}" title="Arrondir ce coin"></button>`).join('')}</div>
        <p class="at-aide" style="margin:0;flex:1">Cliquez un coin pour l'arrondir ou le rendre droit.</p></div>
        <div class="curseur"><span>Arrondi</span><input type="range" min="0" max="28" step="1" value="${b.p.rayon || 0}" data-curseur="rayon"><b>${b.p.rayon || 0} px</b></div></div>`;
    }
    if (['tuile', 'encadre', 'train'].includes(b.type)) {
      const choix = b.type === 'train' ? [['bas', 'En bas'], ['aucune', 'Aucune']] : [['gauche', 'Gauche'], ['haut', 'Haut'], ['bas', 'Bas'], ['aucune', 'Aucune']];
      h += `<div class="groupe"><h4>Bande de couleur</h4><div class="seg">${choix.map(([k, l]) => `<button data-pos="${k}" class="${(b.p.pos || 'gauche') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="curseur" style="margin-top:10px"><span>Épaisseur</span><input type="range" min="1" max="14" step="1" value="${b.p.bande ?? 4}" data-curseur="bande"><b>${b.p.bande ?? 4} px</b></div></div>`;
    }
    if (redimensionnable(b.type)) {
      h += `<div class="groupe"><h4>Largeur</h4><div class="seg">${[[25, '¼'], [33, '⅓'], [50, '½'], [66, '⅔'], [100, 'Toute']].map(([v, l]) => `<button data-larg="${v}" class="${Math.abs(b.p.largeur - v) < 2 ? 'on' : ''}">${l}</button>`).join('')}</div>
        <p class="at-aide" style="margin-top:8px">Ou tirez la poignée à droite de l'élément${hauteurLibre(b.type) ? ', et celle du bas pour la hauteur' : ''}.</p>
        ${hauteurLibre(b.type) && b.p.hauteur ? '<div class="rang"><button data-act="hauto">Hauteur automatique</button></div>' : ''}</div>`;
    }
    if (b.type === 'tableau') {
      h += `<div class="groupe"><h4>Présentation</h4><div class="seg">${[['marine', 'Marine'], ['sobre', 'Sobre'], ['leger', 'Léger']].map(([k, l]) => `<button data-style="${k}" class="${b.p.style === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" data-zebre ${b.p.zebre ? 'checked' : ''}> Une ligne sur deux en gris</label></div>
        <div class="groupe"><h4>Lignes et colonnes</h4><div class="rang"><button data-act="lig">+ Ligne</button><button data-act="col">+ Colonne</button><button class="danger" data-act="moinslig">− Ligne</button><button class="danger" data-act="moinscol">− Colonne</button></div></div>`;
    }
    if (['entete', 'pied'].includes(b.type)) h += '<p class="at-aide">Élément de la charte de l’Institut : il est le même sur toutes les pièces.</p>';
    h += '<div class="groupe"><div class="rang"><button data-act="dup">Dupliquer</button><button class="danger" data-act="suppr">Retirer</button></div></div>';
    r.innerHTML = h;
  }
  function action(act, b) {
    if (!b) return; memoriser();
    const L = b.p.lignes;
    if (act === 'suppr') { blocs = blocs.filter(x => x !== b); sel = null; }
    if (act === 'dup') { const c = nouveau(b.type, b.p); blocs.splice(blocs.indexOf(b) + 1, 0, c); sel = c.id; }
    if (act === 'lig') L.push(L[0].map(() => ''));
    if (act === 'col') L.forEach((l, i) => l.push(i === 0 ? 'Nouvelle colonne' : ''));
    if (act === 'moinslig' && L.length > 2) L.pop();
    if (act === 'moinscol' && L[0].length > 1) L.forEach(l => l.pop());
    if (act === 'hauto') b.p.hauteur = 0;
    if (act === 'wplus') { b.p.wagons.splice(wagonSel + 1, 0, ['0', 'libellé', 'neutre', 1]); wagonSel++; }
    if (act === 'wmoins' && b.p.wagons.length > 1) { b.p.wagons.splice(wagonSel, 1); wagonSel = Math.max(0, wagonSel - 1); }
    rendre(); signaler();
  }
  function inserer(k, i) {
    if (enApercu) basculer();
    if (k === 'pied' && blocs.some(b => b.type === 'pied')) return;
    memoriser();
    const neufs = k === 'rangee'
      ? [['Inscrits', 'fort'], ['Réussites', 'reussi'], ['Ajournés', 'surveiller']].map(([l, e]) => nouveau('tuile', { ...clone(MODELES.tuile.p), v: '0', l, etat: e, largeur: 33 }))
      : [nouveau(k)];
    if (k === 'pied') blocs.push(neufs[0]); else blocs.splice(i, 0, ...neufs);
    sel = neufs[0].id; rendre(); signaler();
    el.querySelector(`.bloc[data-id="${sel}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function basculer() { enApercu = !enApercu; $('[data-o="apercu"]').textContent = enApercu ? 'Revenir à l’édition' : 'Voir le rendu'; $('[data-o="apercu"]').classList.toggle('on', enApercu); rendre(); }

  // Palette
  for (const [k, m] of Object.entries(MODELES)) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'at-carte'; c.draggable = true;
    c.innerHTML = `<span class="at-vig">${VIG[k]}</span><span class="at-lib">${m.lib}</span>`;
    c.addEventListener('dragstart', e => { glisse = { palette: k }; e.dataTransfer.setData('text/plain', k); });
    c.addEventListener('click', () => {
      // Sans élément choisi, on ajoute au-dessus de la signature (ou du bas de page).
      const fin = blocs.findIndex(b => b.type === 'signature' || b.type === 'pied');
      const i = sel ? blocs.findIndex(b => b.id === sel) + 1 : (fin >= 0 ? fin : blocs.length);
      inserer(k, i);
    });
    $('.at-cartes').appendChild(c);
  }
  // Données
  function dessinerDonnees(f = '') {
    const z = $('.at-donnees-cats'); z.innerHTML = '';
    const q = f.toLowerCase();
    for (const [cat, liste] of Object.entries(champs)) {
      const l = liste.filter(c => !q || c.label.toLowerCase().includes(q));
      if (!l.length) continue;
      const t = document.createElement('div'); t.className = 'at-cat'; t.textContent = cat; z.appendChild(t);
      const w = document.createElement('div'); w.className = 'at-donnees'; z.appendChild(w);
      for (const c of l) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'at-donnee'; b.textContent = c.label.replace(/^[^\wÀ-ÿ]+/, '');
        b.addEventListener('mousedown', e => e.preventDefault());
        b.addEventListener('click', () => {
          if (!derniereZone) return;
          const s = getSelection(); s.removeAllRanges(); s.addRange(derniereZone);
          const span = document.createElement('span'); span.className = 'chip'; span.dataset.d = c.key; span.contentEditable = 'false'; span.textContent = b.textContent;
          derniereZone.deleteContents(); derniereZone.insertNode(span); derniereZone.setStartAfter(span); derniereZone.collapse(true);
          span.parentElement.closest('[contenteditable="true"]')?.dispatchEvent(new Event('input', { bubbles: true }));
        });
        w.appendChild(b);
      }
    }
  }
  dessinerDonnees();
  $('.at-cherche').addEventListener('input', e => dessinerDonnees(e.target.value));

  // Feuille : sélection, saisie, actions
  feuille.addEventListener('mousedown', e => {
    const d = e.target.closest('.bloc'); if (!d || enApercu) return;
    const w = e.target.closest('.wagon');
    if (w && !e.target.closest('.sep-w')) { wagonSel = +w.dataset.w; d.querySelectorAll('.wagon').forEach(x => x.classList.toggle('wsel', +x.dataset.w === wagonSel)); }
    if (+d.dataset.id !== sel) { sel = +d.dataset.id; el.querySelectorAll('.bloc').forEach(x => x.classList.toggle('sel', x === d)); }
    reglages();
  });
  feuille.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a) action(a.dataset.act, bloc(a.closest('.bloc').dataset.id)); });
  feuille.addEventListener('focusin', () => memoriser());
  feuille.addEventListener('input', e => {
    const d = e.target.closest('.bloc'), b = bloc(d?.dataset.id); if (!b) return;
    const t = e.target.closest('[data-k],[data-cell],[data-wk]');
    if (t?.dataset.k) b.p[t.dataset.k] = t.innerHTML;
    if (t?.dataset.wk) { const [i, j] = t.dataset.wk.split('-').map(Number); b.p.wagons[i][j] = t.innerHTML; }
    if (t?.dataset.cell) { const [i, j] = t.dataset.cell.split('-').map(Number); b.p.lignes[i][j] = t.innerHTML; }
    signaler();
  });
  const surSelection = () => {
    const s = getSelection();
    if (s.rangeCount && s.anchorNode && el.contains(s.anchorNode) && s.anchorNode.parentElement?.closest('[contenteditable="true"]')) derniereZone = s.getRangeAt(0).cloneRange();
  };
  document.addEventListener('selectionchange', surSelection);

  // Réglages
  const R = $('.at-reglages');
  R.addEventListener('click', e => {
    const b = bloc(sel), t = e.target.closest('button'); if (!b || !t) return;
    const d = t.dataset;
    if (d.etat) { memoriser(); b.p.etat = d.etat; }
    else if (d.wetat) { memoriser(); b.p.wagons[wagonSel][2] = d.wetat; }
    else if (d.larg) { memoriser(); b.p.largeur = +d.larg; }
    else if (d.style) { memoriser(); b.p.style = d.style; }
    else if (d.pos) { memoriser(); b.p.pos = d.pos; }
    else if (d.coin) { memoriser(); b.p.coins = { ...(b.p.coins || {}) }; b.p.coins[d.coin] = b.p.coins[d.coin] ? 0 : 1; if (!b.p.rayon) b.p.rayon = 10; }
    else if (d.act) { action(d.act, b); return; }
    else return;
    rendre(); signaler();
  });
  R.addEventListener('pointerdown', e => { if (e.target.dataset.curseur) memoriser(); });
  R.addEventListener('input', e => {
    const k = e.target.dataset.curseur, b = bloc(sel); if (!k || !b) return;
    b.p[k] = +e.target.value; e.target.nextElementSibling.textContent = `${e.target.value} px`;
    const d = el.querySelector(`.bloc[data-id="${b.id}"]`); const tmp = document.createElement('div'); tmp.innerHTML = contenu(b);
    d.replaceChild(tmp.firstElementChild, d.firstElementChild); signaler();
  });
  R.addEventListener('change', e => { if (e.target.hasAttribute('data-zebre')) { memoriser(); bloc(sel).p.zebre = e.target.checked; rendre(); signaler(); } });

  // Redimensionner
  let redim = null, sep = null;
  feuille.addEventListener('pointerdown', e => {
    const s0 = e.target.closest('.sep-w');
    if (s0 && !enApercu) {
      e.preventDefault(); const d = s0.closest('.bloc'), b = bloc(d.dataset.id), i = +s0.dataset.sep, ws = d.querySelectorAll('.wagon'); memoriser();
      const a = ws[i].getBoundingClientRect().width, c = ws[i + 1].getBoundingClientRect().width;
      sep = { d, b, i, x0: e.clientX, a, c, tot: (b.p.wagons[i][3] || 1) + (b.p.wagons[i + 1][3] || 1) }; s0.setPointerCapture(e.pointerId); return;
    }
    const pg = e.target.closest('.poignee'); if (!pg) return;
    e.preventDefault(); const d = pg.closest('.bloc'), b = bloc(d.dataset.id); memoriser();
    const r0 = d.getBoundingClientRect();
    redim = { d, b, sens: pg.dataset.r, x0: e.clientX, y0: e.clientY, w0: r0.width, h0: r0.height, lf: flux.getBoundingClientRect().width };
    d.classList.add('redim'); pg.setPointerCapture(e.pointerId);
  });
  const bouge = e => {
    if (sep) {
      const { d, b, i, x0, a, c, tot } = sep; const na = Math.max(40, Math.min(a + c - 40, a + e.clientX - x0));
      b.p.wagons[i][3] = tot * na / (a + c); b.p.wagons[i + 1][3] = tot - b.p.wagons[i][3];
      const ws = d.querySelectorAll('.wagon'); ws[i].style.flex = `${b.p.wagons[i][3]} 1 0`; ws[i + 1].style.flex = `${b.p.wagons[i + 1][3]} 1 0`; return;
    }
    if (!redim) return;
    const { d, b, sens, x0, y0, w0, h0, lf } = redim;
    if (sens.includes('e')) { let pc = Math.round((w0 + e.clientX - x0) / lf * 100); pc = Math.max(15, Math.min(100, pc)); for (const s of [25, 33, 50, 66, 100]) if (Math.abs(pc - s) <= 2) pc = s; b.p.largeur = pc; d.style.width = `calc(${pc}% - ${pc < 100 ? 8 : 0}px)`; }
    if (sens.includes('s')) { const hh = Math.max(48, Math.round(h0 + e.clientY - y0)); b.p.hauteur = hh; d.style.height = `${hh}px`; }
    d.querySelector('.mesure').textContent = `${b.p.largeur} % · ${Math.round(b.p.largeur / 100 * 170)} mm${b.p.hauteur ? ` × ${Math.round(b.p.hauteur * 0.2646)} mm` : ''}`;
  };
  const lache = () => { if (sep) { sep = null; signaler(); } if (redim) { redim.d.classList.remove('redim'); redim = null; reglages(); signaler(); } };
  document.addEventListener('pointermove', bouge); document.addEventListener('pointerup', lache);

  // Glisser-déposer
  let glisse = null; const indic = document.createElement('div'); indic.className = 'indic';
  const position = (x, y) => {
    const els = [...flux.querySelectorAll(':scope > .bloc')];
    for (let i = 0; i < els.length; i++) { const r = els[i].getBoundingClientRect(); if (y < r.top || (y < r.bottom && x < r.left + r.width / 2)) return i; }
    return els.length;
  };
  feuille.addEventListener('dragstart', e => { const g = e.target.closest('.grip'); if (g) { glisse = { deplacer: +g.closest('.bloc').dataset.id }; e.dataTransfer.setData('text/plain', 'x'); } });
  feuille.addEventListener('dragover', e => {
    if (!glisse) return; e.preventDefault(); const i = position(e.clientX, e.clientY); const els = [...flux.children].filter(x => x !== indic);
    if (els[i]) flux.insertBefore(indic, els[i]); else flux.appendChild(indic);
  });
  feuille.addEventListener('drop', e => {
    e.preventDefault(); if (!glisse) return; const i = position(e.clientX, e.clientY); indic.remove();
    if (glisse.palette) inserer(glisse.palette, i);
    else { memoriser(); const b = bloc(glisse.deplacer), k = blocs.indexOf(b); blocs.splice(k, 1); blocs.splice(i > k ? i - 1 : i, 0, b); rendre(); signaler(); }
    glisse = null;
  });
  const finGlisse = () => { glisse = null; indic.remove(); };
  document.addEventListener('dragend', finGlisse);

  // Barre de l'Atelier et clavier
  $('.at-outils').addEventListener('click', e => {
    const o = e.target.closest('[data-o]')?.dataset.o;
    if (o === 'apercu') basculer();
    if (o === 'annuler') { const h = histo.pop(); if (h) { blocs = JSON.parse(h); rendre(); signaler(); } }
  });
  const clavier = e => {
    if (!el.isConnected || !el.contains(document.activeElement) && document.activeElement !== document.body) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !e.target.closest('[contenteditable="true"],input,textarea')) { e.preventDefault(); action('suppr', bloc(sel)); }
  };
  document.addEventListener('keydown', clavier);

  rendre(); signaler();
  return {
    structure: sortie,
    detruire() {
      document.removeEventListener('selectionchange', surSelection);
      document.removeEventListener('pointermove', bouge); document.removeEventListener('pointerup', lache);
      document.removeEventListener('dragend', finGlisse); document.removeEventListener('keydown', clavier);
      el.innerHTML = ''; el.classList.remove('atelier-lucie');
    },
  };
}

/* ── LE MODÈLE ENREGISTRÉ : la structure voyage avec le HTML ──
   Un commentaire en tête du contenu, en base64 (les accolades d'un {{champ}}
   ne doivent pas y être lues par le serveur). */
const MARQUE = /^<!--atelier:([A-Za-z0-9+/=]+)-->/;
export function lireStructure(contenu) {
  const m = MARQUE.exec(String(contenu || ''));
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch { return null; }
}
export function ecrireContenu(structure, html) {
  return `<!--atelier:${btoa(unescape(encodeURIComponent(JSON.stringify(structure))))}-->\n${html}`;
}

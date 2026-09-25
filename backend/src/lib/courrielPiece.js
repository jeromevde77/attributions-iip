/**
 * UNE PIÈCE DANS LE CORPS D'UN COURRIEL NE SE MET PAS EN PAGE COMME SUR PAPIER.
 *
 * Le bloc de clôture des pièces (sceau, lieu et date, qualité, nom, signature)
 * est une grille CSS dont le sceau et la signature sont des IMAGES DE FOND
 * passées par variables CSS. Le navigateur et le rendu PDF les affichent ;
 * les messageries non : Gmail et Outlook ignorent la grille, les variables et
 * les images de fond, et bloquent les images en `data:`. Le courriel arrivait
 * donc avec « Fait en un exemplaire… » d'un côté, la qualité de l'autre, et
 * aucune signature (Charles, 25 septembre 2026).
 *
 * Pour le courriel seulement, chaque bloc de clôture est reconstruit en
 * TABLEAU, styles en ligne, et les deux images partent en pièces jointes
 * INCORPORÉES (référencées par `cid:`), que les messageries affichent. La
 * pièce elle-même — PDF, impression — n'est pas touchée.
 *
 * LE FAC-SIMILÉ SUIT LA PERSONNE : un bloc « sans-paraphe » garde son trait
 * de signature manuscrite, sans image.
 */

const CID_SCEAU = 'sceau-iip@lucie';
const CID_PARAPHE = 'paraphe@lucie';

/** « data:image/png;base64,… » → pièce jointe incorporée. */
function versPiece(dataUri, cid, nom) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUri || ''));
  if (!m) return null;
  return { filename: nom, content: Buffer.from(m[2], 'base64'), contentType: m[1], cid };
}

/** Le dernier `--nom:url("…")` déclaré dans le document : c'est lui qui s'applique. */
function variableImage(html, nom) {
  const re = new RegExp(`--${nom}\\s*:\\s*url\\(["']?([^"')]+)["']?\\)`, 'g');
  let m, dernier = null;
  while ((m = re.exec(html))) dernier = m[1];
  return dernier;
}

/** Le bloc <div …> qui commence à `debut`, balises imbriquées comprises. */
function blocDiv(html, debut) {
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = debut;
  let profondeur = 0, m;
  while ((m = re.exec(html))) {
    profondeur += m[0][1] === '/' ? -1 : 1;
    if (profondeur === 0) return { fin: re.lastIndex, texte: html.slice(debut, re.lastIndex) };
  }
  return null;
}

function interieur(bloc, classe) {
  const i = bloc.search(new RegExp(`<div class="${classe}"[^>]*>`));
  if (i < 0) return null;
  const b = blocDiv(bloc, i);
  if (!b) return null;
  return b.texte.slice(b.texte.indexOf('>') + 1, b.texte.lastIndexOf('</div>'));
}

const POLICE = 'font-family:Arial,Helvetica,sans-serif';

function legendeEnLigne(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<div class="qualite"(?: style="([^"]*)")?>/g,
      (_, st) => `<div style="${POLICE};font-size:12px;color:#334155;line-height:1.35;${st || ''}">`)
    .replace(/<div class="nom"(?: style="([^"]*)")?>/g,
      (_, st) => `<div style="${POLICE};font-size:14px;font-weight:700;color:#1B2B4B;margin-top:2px;${st || ''}">`);
}

/**
 * @param {string} html  la pièce, telle qu'elle s'imprime
 * @returns {{ html: string, pieces: Array<{filename, content, contentType, cid}> }}
 */
export function preparerPourCourriel(html) {
  let doc = String(html || '');
  const sceau = variableImage(doc, 'sceau');
  const paraphe = variableImage(doc, 'paraphe');
  let avecSceau = false, avecParaphe = false;

  const re = /<div class="cloture([^"]*)">/g;
  let sortie = '', curseur = 0, m;
  while ((m = re.exec(doc))) {
    const bloc = blocDiv(doc, m.index);
    if (!bloc) break;
    const t = bloc.texte;
    const lieu = interieur(t, 'lieu');
    const legende = interieur(t, 'legende');
    // Seuls les blocs à sceau et signature se reconstruisent ; les autres
    // sont du texte, qu'une messagerie lit correctement.
    if (lieu == null || legende == null || !/class="(sceau|paraphe)"/.test(t)) continue;

    const sansParaphe = /\bsans-paraphe\b/.test(m[1]);
    const imgSceau = /class="sceau"/.test(t) && sceau
      ? `<img src="cid:${CID_SCEAU}" alt="Sceau de l'établissement" width="84" height="84" style="display:block;border:0">`
      : '';
    const imgParaphe = !sansParaphe && paraphe
      ? `<img src="cid:${CID_PARAPHE}" alt="Signature" width="174" style="display:block;border:0;margin:0 auto;height:auto">`
      : '<div style="height:56px;border-bottom:1px solid #94a3b8;width:174px;margin:0 auto"></div>';
    avecSceau ||= !!imgSceau;
    avecParaphe ||= !sansParaphe && !!paraphe;

    const tableau = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="border-collapse:collapse;margin-top:28px;${POLICE}">
  <tr>
    <td width="30%" valign="bottom" align="left" style="padding:0">${imgSceau}</td>
    <td valign="bottom" align="center" style="padding:0 12px 4px;${POLICE};font-size:12px;color:#334155">
      ${lieu.trim()}</td>
    <td width="36%" valign="bottom" align="center" style="padding:0">
      ${imgParaphe}
      <div style="border-top:1px solid #94a3b8;margin-top:2px;padding-top:4px;text-align:center">
        ${legendeEnLigne(legende).trim()}</div>
    </td>
  </tr>
</table>`;
    sortie += doc.slice(curseur, m.index) + tableau;
    curseur = bloc.fin;
    re.lastIndex = bloc.fin;
  }
  doc = sortie + doc.slice(curseur);

  const pieces = [
    avecSceau && versPiece(sceau, CID_SCEAU, 'sceau.png'),
    avecParaphe && versPiece(paraphe, CID_PARAPHE, 'signature.png'),
  ].filter(Boolean);
  return { html: doc, pieces };
}

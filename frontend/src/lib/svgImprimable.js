/**
 * UN SVG D'ÉCRAN, PRÊT POUR LE PAPIER (3.1.35).
 *
 * Le dessin d'écran lit ses couleurs dans des variables (`var(--c-…)`) et des
 * classes que la pièce imprimée ne connaît pas : copié tel quel, il sortirait
 * en noir. On recopie donc, élément par élément, ce que le navigateur a
 * RÉELLEMENT calculé, et l'on retire ce qui ne sert qu'à la souris (les zones
 * de clic transparentes).
 */
const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity',
  'stroke-opacity', 'font-size', 'font-weight', 'font-family', 'letter-spacing'];

export function svgImprimable(svg) {
  if (!svg) return null;
  const copie = svg.cloneNode(true);
  const orig = [svg, ...svg.querySelectorAll('*')];
  const dest = [copie, ...copie.querySelectorAll('*')];
  orig.forEach((o, i) => {
    const d = dest[i];
    if (!d) return;
    const cs = getComputedStyle(o);
    const st = PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';');
    d.setAttribute('style', st);
    d.removeAttribute('class');
    if (d.getAttribute('stroke') === 'transparent' || cs.getPropertyValue('stroke') === 'transparent'
        && cs.getPropertyValue('fill') === 'none') d.setAttribute('data-retirer', '1');
  });
  copie.querySelectorAll('[data-retirer]').forEach(n => n.remove());
  copie.removeAttribute('width'); copie.removeAttribute('height');
  copie.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copie.setAttribute('style', 'width:100%;height:auto');
  return copie.outerHTML;
}

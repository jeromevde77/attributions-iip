// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LE TEXTE DU DOSSIER PÉDAGOGIQUE, EN MARQUES SIMPLES (3.1.350)
//
// L'import du dossier Word écrit chaque rubrique en lignes : « ## Rubrique », « ### Intertitre »
// (l'intitulé d'un cours, « Finalités générales »), « - point » et deux espaces de plus par
// sous-niveau. Ces fonctions en font du HTML structuré — pour la DUE, la pièce imprimée — et le
// découpent en rubriques. La même conversion vit côté écran (frontend/src/lib/texteDossier.js) :
// les deux se tiennent à l'identique.
// ─────────────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* UN POINT COMMENCE PAR UNE MAJUSCULE (3.5.159, Charles : « mettre des majuscules quand il s'agit d'un nouveau point ») : le
   dossier écrit « d’énumérer… », suite de « L’étudiant sera capable : » ; à l'écran, chaque point se lit seul. Le texte n'est
   pas modifié, seulement son affichage. */
const majuscule = t => String(t ?? '').replace(/^([«"“(\s]*)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());
/* LE NOM D'UN COURS, À PEU PRÈS (3.5.159, UE 250 : « 4.1.Techniques de positionnement… » pour le cours « Technique de
   positionnement… ») : sans numéro de tête, sans accents ni ponctuation, et chaque mot sans son « s » final. */
const NUMERO_TETE = /^\s*\d+(\.\d+)+\.?\s*/;
export const cleCours = x => String(x || '').replace(NUMERO_TETE, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(w => (w.length > 3 ? w.replace(/s$/, '') : w)).join(' ');
export const memeCours = (a, b) => {
  const x = cleCours(a), y = cleCours(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // L'un contient l'autre, à longueur voisine : « Pratique des écrits » pour « Pratique des écrits - Psychomotricité », jamais une
  // phrase du programme qui cite « médecine nucléaire » en passant.
  if ((x.includes(y) || y.includes(x)) && Math.min(x.length, y.length) / Math.max(x.length, y.length) >= 0.55) return true;
  // Les mêmes mots, à une variante près (« Anatomie humaine, physiologie… » pour « Anatomie, physiologie… » ; « résonnance » pour
  // « résonance » ; « soins de base » pour « soins de ») : au moins 70 % de mots communs.
  const mots = z => new Set(z.split(' ').filter(w => w.length > 2 && !VIDES.has(w)).map(w => w.replace(/nn/g, 'n')));
  const A = mots(x), B = mots(y);
  if (A.size < 2 || B.size < 2) return false;
  const communs = [...A].filter(w => B.has(w)).length;
  return communs / new Set([...A, ...B]).size >= 0.7;
};
const VIDES = new Set(['des', 'les', 'aux', 'une', 'par', 'pour', 'dans', 'sur', 'avec', 'autonomie']);
/* Un intertitre numéroté (« 4.1.Techniques… », « 1.2. Finalités particulières ») : un numéro à deux niveaux au moins, puis un
   intitulé court qui ne ferme pas une phrase. */
const estNumerote = l => NUMERO_TETE.test(l) && /^\s*\d+(\.\d+)+\.?\s*\p{Lu}/u.test(l) && l.length < 160 && !/[;:]$/.test(l.trim());
const intertitreNumerote = l => l.trim().replace(/^(\d+(?:\.\d+)+\.?)\s*/, '$1 ').replace(/\s*:$/, '');

export const RUBRIQUES_DP = ['Finalités', 'Capacités préalables', "Acquis d'apprentissage", 'Degré de maîtrise',
  'Programme', 'Constitution des groupes', 'Chargés de cours'];

/** Lignes marquées → HTML. `intertitre` : 'h4' (éditeur de la fiche) ou 'strong' (DUE, pièce). */
export function texteVersHtml(texte, { intertitre = 'strong' } = {}) {
  let h = ''; let ouverts = 0;
  const fermer = n => { while (ouverts > n) { h += '</li></ul>'; ouverts--; } };
  for (const brut of String(texte || '').split('\n')) {
    const puce = /^( *)- (.*)$/.exec(brut);
    if (puce) {
      const n = Math.floor(puce[1].length / 2) + 1;
      if (n > ouverts) { while (ouverts < n) { h += '<ul><li>'; ouverts++; } h = h.replace(/<li>$/, '<li>'); }
      else { fermer(n); h += '</li><li>'; }
      h += `<p>${esc(majuscule(puce[2]))}</p>`;
      continue;
    }
    const l = brut.trim();
    fermer(0);
    if (!l) continue;
    const t = /^###\s+(.*)$/.exec(l);
    if (t) h += intertitre === 'h4' ? `<h4>${esc(t[1])}</h4>` : `<p><strong>${esc(t[1])}</strong></p>`;
    else if (/^##\s+/.test(l)) continue;
    else h += `<p>${esc(l)}</p>`;
  }
  fermer(0);
  return h.replace(/<ul><li><\/li><li>/g, '<ul><li>');
}

/** Le texte entier → { rubrique: texte }. */
export function rubriquesDuTexte(texte) {
  const out = {}; let cle = null;
  for (const l of String(texte || '').split('\n')) {
    const m = /^##\s+(.*)$/.exec(l);
    if (m) { cle = m[1].trim(); out[cle] = []; continue; }
    if (cle) out[cle].push(l);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

/** { rubrique: texte } → le texte entier, dans l'ordre du dossier. */
export function texteDesRubriques(rubriques) {
  const cles = [...RUBRIQUES_DP, ...Object.keys(rubriques).filter(k => !RUBRIQUES_DP.includes(k))];
  return cles.filter(k => String(rubriques[k] || '').trim()).map(k => `## ${k}\n${String(rubriques[k]).trim()}`).join('\n\n');
}

// ── Recopié À L'IDENTIQUE de frontend/src/lib/texteDossier.js (3.1.382) : la DUE reçoit le dossier
//    structuré exactement comme la fiche d'UE le montre. Les deux se tiennent ensemble.
/* LES DOSSIERS IMPORTÉS AVANT 3.1.356 SONT À PLAT (Charles, 14 octobre 2026 : « tu ne mets pas de
 * structure ni de mise en page ») : ni puces ni intertitres, seulement des lignes. On les structure à
 * l'ouverture, par ce que le texte laisse voir — l'intitulé d'un cours ou un sous-titre connu devient
 * un intertitre ; ce qui suit une phrase finissant par « : » devient une liste, jusqu'au prochain
 * intertitre ou à la prochaine phrase en « : ». Les sous-puces ne se devinent pas : un réimport du
 * Word les rend. Un texte qui porte déjà des marques n'est pas touché. */
const SOUS_TITRES = /^(finalit[ée]s g[ée]n[ée]rales|finalit[ée]s particuli[èe]res|capacit[ée]s|titres? (pouvant en )?ten(ant|ir) lieu)\s*:?$/i;
export function structurerAPlat(texte, intitulesCours = []) {
  let t = String(texte || '');
  if (!t.trim() || /^###\s/m.test(t)) return t;
  const estCours = l => !/[;,]$/.test(l.trim()) && intitulesCours.some(n => memeCours(l, n));
  /* LES INTITULÉS COLLÉS (3.5.159, UE 70 : « L’étudiant sera capable : Théorie et concepts de l’éducation… », « …procédés de
     l’intervention psychomotrice ; Méthodologie de l’observation… ») : l'import a mis l'intitulé d'un cours au bout d'une ligne.
     On le remet sur sa propre ligne. Et le tiret long d'une énumération (« – ») vaut une puce. */
  const decoller = l => {
    // Chaque coupure possible (« ; », « : », « , » suivis d'une majuscule), de la dernière à la première : la queue qui nomme un
    // cours devient sa ligne, et ce qui précède se relit de même (deux intitulés collés sur une ligne).
    const coupures = [...l.matchAll(/[;:,]\s+(?=\p{Lu})/gu)].reverse();
    for (const c of coupures) {
      const queue = l.slice(c.index + c[0].length).trim();
      if (!/[;:]/.test(queue) && intitulesCours.some(n => memeCours(queue, n))) return [...decoller(l.slice(0, c.index + 1)), queue];
    }
    return [l];
  };
  const titre = l => estCours(l) || estNumerote(l) || SOUS_TITRES.test(l.trim().replace(NUMERO_TETE, ''));
  t = t.split('\n').flatMap(l => decoller(l.replace(/^(\s*)[–•]\s+/, '$1- '))).join('\n');
  // Déjà ses puces (programme importé en 3.1.342) : il ne lui manque que ses intertitres.
  if (/^( *)- /m.test(t)) {
    return t.split('\n').map(l => (!/^\s*- /.test(l) && titre(l) ? `### ${intertitreNumerote(l)}` : l)).join('\n');
  }
  const out = []; let liste = false; let sous = false;
  for (const brut of t.split('\n')) {
    const l = brut.trim();
    if (!l) { liste = false; sous = false; continue; }
    // Les sous-points d'un point en « : » — jusqu'à celui qui ferme par « ; » ou « . ».
    if (sous) { out.push(`  - ${l}`); if (/[;.]$/.test(l)) sous = false; continue; }
    // Un intertitre (un cours, « Finalités générales ») ouvre une liste : ses points suivent.
    if (titre(l)) { out.push(`### ${intertitreNumerote(l)}`); liste = true; sous = false; continue; }
    // Un point en « : » au milieu d'une liste : c'est une puce, et ce qui suit, ses sous-puces.
    if (/:$/.test(l) && liste && /^- /.test(out[out.length - 1] || '')) { out.push(`- ${l}`); sous = true; continue; }
    if (/:$/.test(l)) { out.push(l); liste = true; continue; }
    // Une ligne en « , » qui ne suit pas une puce est une phrase de contexte (« en vue de…, ») ;
    // après une puce, c'est la suite de l'énumération.
    const precedente = out[out.length - 1] || '';
    if (liste && !(/,$/.test(l) && !/^- /.test(precedente))) { out.push(`- ${l}`); continue; }
    out.push(l);
  }
  return out.join('\n');
}

/* LE DEGRÉ DE MAÎTRISE RANGÉ DANS LES ACQUIS (Charles, 15 octobre 2026 : « degré de maîtrise au mauvais
 * endroit »). Les dossiers importés avant 3.1.356 n'avaient pas de rubrique « Degré de maîtrise » : sa
 * phrase (« Pour la détermination du degré de maîtrise, il sera tenu compte… ») et ses critères
 * suivaient les acquis. On les rend à leur rubrique à l'ouverture, quand elle est vide. */
const DEBUT_DEGRE = /^\s*(-\s+)?pour la d[ée]termination du degr[ée] de ma[iî]trise/i;
export function separerDegre(rub) {
  const A = "Acquis d'apprentissage", D = 'Degré de maîtrise';
  const lignes = String(rub[A] || '').split('\n');
  const i = lignes.findIndex(l => DEBUT_DEGRE.test(l));
  if (i < 0 || String(rub[D] || '').trim()) return rub;
  const degre = lignes.slice(i).filter(l => l.trim()).map((l, k) => {
    const t = l.replace(/^\s*-\s+/, '').trim();
    return k === 0 ? t : `- ${t}`;
  });
  return { ...rub, [A]: lignes.slice(0, i).join('\n').trimEnd(), [D]: degre.join('\n') };
}

/** Les rubriques d'un dossier, prêtes pour l'écran : structurées, le degré de maîtrise à sa place. */
export function rubriquesDuDossier(texte, intitulesCours = []) {
  const brutes = separerDegre(rubriquesDuTexte(texte));
  return Object.fromEntries(Object.entries(brutes).map(([k, v]) => [k, structurerAPlat(v, intitulesCours)]));
}

/* LE PROGRAMME, COURS PAR COURS (Charles, 15 octobre 2026 : « je veux que tu scindes par cours… ce sera
 * plus simple, car les DUE vont importer depuis cet endroit »). Le texte reste UN texte (la rubrique
 * « Programme », un « ### » par cours) ; l'écran le découpe en une introduction commune et un bloc par
 * cours, et le recompose à chaque frappe. Chaque cours de l'UE a son bloc, même vide ; un intertitre
 * qui ne nomme aucun cours garde le sien. */
export function decouperProgramme(texte, intitulesCours = []) {
  const blocs = []; const pre = [];
  let cur = null;
  for (const l of String(texte || '').split('\n')) {
    const m = /^###\s+(.*)$/.exec(l.trim());
    if (m) { cur = { nom: m[1].trim(), lignes: [] }; blocs.push(cur); continue; }
    (cur ? cur.lignes : pre).push(l);
  }
  const cours = blocs.map(b => ({ nom: b.nom, texte: b.lignes.join('\n').trim() }));
  // Un intertitre du dossier qui nomme un cours à peu près (« Pratique des écrits » pour « Pratique des
  // écrits - Psychomotricité ») vaut ce cours : on ne lui ajoute pas un second bloc vide.
  const proche = memeCours;
  for (const n of intitulesCours) if (n && !cours.some(c => proche(c.nom, n))) cours.push({ nom: n, texte: '' });
  return { preambule: pre.join('\n').trim(), cours };
}
export function recomposerProgramme(preambule, cours) {
  const parts = [];
  if (String(preambule || '').trim()) parts.push(String(preambule).trim());
  for (const c of cours) if (String(c.texte || '').trim()) parts.push(`### ${c.nom}\n${String(c.texte).trim()}`);
  return parts.join('\n');
}

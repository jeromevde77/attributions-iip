/**
 * LE CLASSEUR DE NOTES — celui qu'on envoie au professeur, et qui revient.
 *
 * Tous les professeurs n'encodent pas à l'écran. Certains corrigent chez eux,
 * d'autres n'ouvrent Lucie qu'une fois l'an, et le secrétariat recopiait alors
 * des colonnes entières à la main — c'est là qu'on décale une ligne et qu'on
 * donne à quelqu'un la note de son voisin.
 *
 * LE FICHIER QUI REVIENT DOIT POUVOIR ÊTRE RELU SANS DEVINER. Un classeur se
 * trie, se filtre, se recopie : on ne peut pas se fier à l'ordre des lignes ni
 * à celui des colonnes, ni même aux en-têtes, qu'un professeur reformulera.
 * Chaque colonne porte donc, sur une PREMIÈRE LIGNE MASQUÉE, sa clé technique
 * « cours|acquis », et chaque ligne porte l'identifiant du dossier. Le
 * rapprochement se fait là-dessus, jamais sur un libellé.
 *
 * ON NE LIT QUE CE QUE L'ON A ÉCRIT. Une colonne ajoutée par le professeur,
 * une feuille de brouillon, une ligne de total : tout ce qui ne porte pas de
 * clé connue est ignoré et signalé. Mieux vaut annoncer qu'on n'a pas lu une
 * colonne que d'écrire une note au mauvais endroit.
 */

const CLE = '§'; // sépare les segments de la clé technique, hors de tout libellé

/** Les trois colonnes d'identité, toujours en tête. */
const IDENT = ['Matricule', 'Nom', 'Prénom'];

/**
 * @param {object} o
 * @param {Array} o.colonnes  [{ cours_code, cours_nom, aa_code, description }]
 * @param {Array} o.etudiants [{ id, nom, prenom, id_ecampus }]
 * @param {(etudiantId:number, col:object) => number|null} o.note
 * @param {(etudiantId:number, coursCode:string) => string|null} [o.mention]
 * @param {(etudiantId:number, coursCode:string) => boolean} [o.ferme]
 */
export async function construireClasseur({
  colonnes, etudiants, note, mention, ferme,
  ue_num, ue_nom, annee, session, titre,
}) {
  const XLSX = await import('xlsx');

  // ── La feuille des notes ──────────────────────────────────────────────────
  //
  // Ligne 1 : les clés techniques, masquée — c'est elle qui fait foi au retour.
  // Ligne 2 : le cours, pour se repérer d'un coup d'œil.
  // Ligne 3 : l'acquis, code ET énoncé — un code nu ne dit rien à personne.
  const cleCol = c => `${c.cours_code}${CLE}${c.aa_code}`;
  const lignes = [
    ['#cle', '', '', ...colonnes.map(cleCol)],
    ['', '', '', ...colonnes.map(c => c.cours_nom || c.cours_code)],
    [...IDENT, ...colonnes.map(c => `${c.aa_code}${c.description
      ? ` — ${String(c.description).slice(0, 120)}` : ''}`)],
  ];
  for (const e of etudiants) {
    lignes.push([
      e.id_ecampus || '', e.nom || '', e.prenom || '',
      ...colonnes.map(c => {
        // UNE CASE FERMÉE N'EST PAS UNE CASE VIDE. En seconde session, un cours
        // qui ne se représente pas garde sa note de juin : on écrit « — » pour
        // que le professeur ne la remplisse pas, et la relecture l'ignore.
        if (ferme?.(e.id, c.cours_code)) return '—';
        const m = mention?.(e.id, c.cours_code);
        if (m) return m;
        const v = note(e.id, c);
        return v == null ? '' : v;
      }),
    ]);
  }
  // L'identifiant du dossier voyage à part, en dernière colonne, pour que le
  // rapprochement tienne même si deux étudiants portent le même nom.
  lignes[0].push('#id');
  lignes[1].push('');
  lignes[2].push('Identifiant Lucie — ne pas modifier');
  etudiants.forEach((e, i) => lignes[3 + i].push(e.id));

  const ws = XLSX.utils.aoa_to_sheet(lignes);
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 16 },
    ...colonnes.map(() => ({ wch: 14 })), { wch: 14 }];
  // La ligne des clés ne regarde personne : elle est masquée, non supprimée.
  ws['!rows'] = [{ hidden: true }, { hpx: 18 }, { hpx: 46 }];
  // Le nom et le prénom restent visibles quand on fait défiler vers la droite,
  // et les trois lignes d'en-tête quand on descend.
  ws['!freeze'] = { xSplit: 3, ySplit: 3 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range(
    { s: { r: 2, c: 0 }, e: { r: 2 + etudiants.length, c: IDENT.length + colonnes.length } }) };

  // ── La feuille des acquis : le référentiel, en clair ──────────────────────
  const ref = [['Cours', 'Code du cours', 'Acquis', 'Énoncé de l’acquis', 'Poids']];
  for (const c of colonnes) {
    ref.push([c.cours_nom || '', c.cours_code, c.aa_code, c.description || '',
      c.poids ?? '']);
  }
  const wsRef = XLSX.utils.aoa_to_sheet(ref);
  wsRef['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 90 }, { wch: 8 }];

  // ── Le mode d'emploi, court ───────────────────────────────────────────────
  const aide = [
    ['Feuille de notes — ' + (titre || `UE ${ue_num}`)],
    [],
    ['Unité', `${ue_num || ''} ${ue_nom || ''}`.trim()],
    ['Année', annee || ''],
    ['Session', session === 2 ? 'Seconde session' : 'Première session'],
    [],
    ['Comment remplir'],
    ['1.', 'Une note sur 20 par case, sans décimale — l’établissement arrondit à l’unité.'],
    ['2.', 'Une case laissée vide veut dire « pas encore encodé » : elle n’efface rien.'],
    ['3.', 'Pour dire qu’une épreuve n’a rien produit, écrivez NP (note de présence) '
         + 'ou PP (pas présenté) au lieu d’un chiffre.'],
    ['4.', 'Un tiret « — » marque une case fermée : n’y écrivez pas, elle ne sera pas relue.'],
    [],
    ['À ne pas faire'],
    ['•', 'Ne supprimez ni ne déplacez les colonnes : chacune porte une clé cachée '
        + 'qui dit à Lucie de quel acquis et de quel cours il s’agit.'],
    ['•', 'Ne changez pas la dernière colonne « Identifiant Lucie » : c’est elle qui '
        + 'rattache chaque ligne au bon dossier.'],
    ['•', 'Vous pouvez trier, filtrer, colorier : rien de tout cela ne gêne la relecture.'],
    [],
    ['L’onglet « Acquis » donne l’énoncé complet de chaque acquis.'],
  ];
  const wsAide = XLSX.utils.aoa_to_sheet(aide);
  wsAide['!cols'] = [{ wch: 6 }, { wch: 100 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsAide, 'Mode d’emploi');
  XLSX.utils.book_append_sheet(wb, ws, 'Notes');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Acquis');
  return { wb, XLSX };
}

/** Écrire le classeur et le proposer au téléchargement. */
export async function telechargerClasseur(opts, nomFichier) {
  const { wb, XLSX } = await construireClasseur(opts);
  XLSX.writeFile(wb, nomFichier);
}

/**
 * RELIRE LE CLASSEUR REVENU.
 *
 * Renvoie les lignes au format attendu par POST /acquis/ue/:ue/notes/importer,
 * plus ce qui n'a pas été compris — pour le dire, pas pour le taire.
 */
export async function lireClasseurNotes(fichier) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
  const nom = wb.SheetNames.find(n => n.toLowerCase().startsWith('note'))
    || wb.SheetNames[0];
  const grille = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: '' });

  // LA LIGNE DES CLÉS SE CHERCHE, elle ne se suppose pas : un classeur revient
  // parfois avec une ligne ajoutée en tête, ou la ligne masquée supprimée.
  const iCle = grille.findIndex(l => String(l?.[0] || '').trim() === '#cle');
  if (iCle < 0) {
    throw new Error('Ce classeur ne porte plus sa ligne de clés (« #cle »). '
      + 'Il a probablement été recréé plutôt que rempli : réexportez-le depuis '
      + 'Lucie et recommencez.');
  }
  const cles = grille[iCle];
  const iId = cles.findIndex(c => String(c || '').trim() === '#id');

  const colonnes = [];
  const ignorees = [];
  cles.forEach((c, i) => {
    const t = String(c || '').trim();
    if (!t || t === '#cle' || t === '#id') return;
    const [cours, aa] = t.split(CLE);
    if (cours && aa) colonnes.push({ i, cours_code: cours, aa_code: aa });
    else ignorees.push(t);
  });
  // Une colonne ajoutée par le professeur n'a pas de clé : on la nomme au
  // lieu de la lire au hasard.
  const enTete = grille[iCle + 2] || [];
  enTete.forEach((h, i) => {
    if (i < IDENT.length || i === iId) return;
    if (!colonnes.some(c => c.i === i) && String(h || '').trim()) {
      ignorees.push(String(h).trim());
    }
  });

  const MENTIONS = new Set(['NP', 'PP']);
  const lignes = [];
  const soucis = [];
  for (let r = iCle + 3; r < grille.length; r++) {
    const l = grille[r];
    if (!l || !l.length) continue;
    const nomE = String(l[1] || '').trim();
    const prenom = String(l[2] || '').trim();
    const id = iId >= 0 ? Number(l[iId]) : null;
    if (!nomE && !prenom && !id) continue;
    // UNE LIGNE SANS IDENTIFIANT N'EST PAS UNE LIGNE DE LUCIE. Un professeur
    // ajoute volontiers une ligne de total, une moyenne, une remarque : elles
    // portent un texte en colonne « Nom » mais aucun identifiant. Les lire
    // ferait signaler des cases illisibles qui n'en sont pas.
    if (iId >= 0 && !(Number(id) > 0)) continue;

    const acquis = [];
    for (const c of colonnes) {
      const brut = String(l[c.i] ?? '').trim();
      if (!brut || brut === '—' || brut === '-') continue;
      const maj = brut.toUpperCase();
      if (MENTIONS.has(maj)) { acquis.push({ code: c.aa_code, cours: [c.cours_code], mention: maj }); continue; }
      const n = Number(brut.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 20) {
        soucis.push(`${nomE} ${prenom} · ${c.cours_code} ${c.aa_code} : « ${brut} » `
          + `n’est pas une note sur 20`);
        continue;
      }
      acquis.push({ code: c.aa_code, cours: [c.cours_code], note: n });
    }
    if (acquis.length) {
      lignes.push({ etudiant_id: id || undefined, matricule: String(l[0] || '').trim(),
                    nom: nomE, prenom, acquis });
    }
  }

  return {
    lignes,
    colonnes: colonnes.length,
    ignorees: [...new Set(ignorees)],
    soucis,
    notes: lignes.reduce((n, l) => n + l.acquis.length, 0),
  };
}

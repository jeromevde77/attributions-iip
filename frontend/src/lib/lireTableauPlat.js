/**
 * LIRE UN TABLEAU PLAT DE DÉLIBÉRATIONS — une ligne par étudiant, unité et session.
 *
 * Le classeur de suivi est une feuille par unité, avec ses blocs de colonnes.
 * Une REPRISE D'HISTORIQUE, elle, arrive sous une autre forme : un tableau
 * unique où chaque ligne porte tout — l'unité, la session, l'étudiant, sa
 * décision, sa cote, sa justification, et les dates du jury qui l'a prise.
 *
 * DEUX PRINCIPES.
 *
 * 1. LES EN-TÊTES NE SONT PAS GARANTIS. Un fichier de reprise est fabriqué
 *    pour l'occasion ; ses colonnes s'appellent comme celui qui l'a produit
 *    les a nommées. On les reconnaît donc par leur sens — accents, casse,
 *    ponctuation et espaces neutralisés —, et ce qui n'est pas reconnu se
 *    désigne à la main. Un import qui exige des en-têtes exacts est un import
 *    qu'on n'utilise pas.
 *
 * 2. RIEN N'EST DEVINÉ SUR LE FOND. Une décision illisible n'est pas rangée
 *    dans « ajourné » parce que c'est le cas le plus fréquent : elle est
 *    signalée, et sa ligne est écartée. Sur trois mille lignes, une règle
 *    approximative fabrique des dizaines de décisions fausses que personne ne
 *    relira.
 */

/**
 * Neutralise ce qui distingue « N° d'UE », « ue_num » et « UE ».
 *
 * LES MOTS DE LIAISON TOMBENT AUSSI. « Date de délibération » et « Date
 * délibération » désignent la même colonne ; les garder obligerait à prévoir
 * chaque tournure, et une colonne non reconnue est une colonne à redésigner
 * à la main sur un fichier de trois mille lignes.
 */
const LIAISONS = /\b(de|du|des|d|la|le|les|l|au|aux|en|pour|a)\b/g;
const cle = t => String(t ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/['’]/g, ' ')
  .replace(LIAISONS, ' ')
  .replace(/[^a-z0-9]/g, '');

/**
 * Les champs que Lucie sait utiliser, et les en-têtes qui les désignent.
 * L'ordre compte : le premier motif qui s'applique gagne, ce qui évite que
 * « date d'envoi des résultats » soit pris pour « date de délibération ».
 */
export const CHAMPS = [
  { cle: 'ue_num', libelle: 'Unité', requis: true,
    motifs: ['uenum', 'ue', 'nue', 'numerouе', 'numeroue', 'unite', 'uniteenseignement'] },
  { cle: 'session', libelle: 'Session', requis: true,
    motifs: ['session', 'deliberations1s2', 's1s2', 'sess', 's'] },
  { cle: 'matricule', libelle: 'Matricule', requis: false,
    motifs: ['matricule', 'idecampus', 'ecampus', 'numeroetudiant', 'matr'] },
  { cle: 'nom', libelle: 'Nom', requis: true, motifs: ['nom', 'nomeleve', 'nometudiant'] },
  { cle: 'prenom', libelle: 'Prénom', requis: true, motifs: ['prenom', 'prenometudiant'] },
  { cle: 'decision', libelle: 'Décision', requis: true,
    motifs: ['decision', 'resultat', 'deliberation', 'decisionjury'] },
  { cle: 'note', libelle: 'Cote de l’unité', requis: false,
    motifs: ['note', 'cote', 'noteue', 'coteue', 'resultatchiffre', 'points'] },
  { cle: 'justification', libelle: 'Justification', requis: false,
    motifs: ['justification', 'motif', 'motivation', 'justificationencodee', 'commentaire'] },
  { cle: 'date_seance', libelle: 'Date de délibération', requis: false,
    motifs: ['datedeliberation', 'datedelib', 'datejury', 'dateseance', 'datedeseance'] },
  { cle: 'heure_seance', libelle: 'Heure de délibération', requis: false,
    motifs: ['heuredebut', 'heuredeliberation', 'heurejury', 'heureseance', 'debut'] },
  { cle: 'visite_date', libelle: 'Visite des copies — date', requis: false,
    motifs: ['datevisite', 'datedevisite', 'visitedescopies', 'visitecopies', 'datecopies'] },
  { cle: 'visite_heure', libelle: 'Visite des copies — heure', requis: false,
    motifs: ['heurevisite', 'creneauvisite', 'creneau', 'plagevisite'] },
  { cle: 'visite_local', libelle: 'Visite des copies — local', requis: false,
    motifs: ['localvisite', 'local', 'lieuvisite', 'salle'] },
  { cle: 'session2_date', libelle: 'Épreuves de septembre — date', requis: false,
    motifs: ['epreuvessecondesessiondate', 'epreuvesseptembredate',
             'dateepreuvessecondesession', 'dateepreuvesseptembre', 'datesecondesession',
             'dateepreuves2', 'dates2', 'epreuvessecondesession', 'epreuvesseptembre',
             'secondesession', 'datesession2'] },
  { cle: 'session2_heure', libelle: 'Épreuves de septembre — heure', requis: false,
    motifs: ['epreuvessecondesessionheure', 'epreuvesseptembreheure',
             'heureepreuvessecondesession', 'heureepreuvesseptembre',
             'heuresecondesession', 'heuresession2', 'heures2'] },
  { cle: 'session2_local', libelle: 'Épreuves de septembre — local', requis: false,
    motifs: ['epreuvessecondesessionlocal', 'epreuvesseptembrelocal',
             'localepreuvessecondesession', 'localepreuvesseptembre',
             'localsecondesession', 'localsession2', 'locals2'] },
  { cle: 'president_nom', libelle: 'Présidence', requis: false,
    motifs: ['presidence', 'president', 'presidentjury', 'presidentdujury'] },
];

/**
 * LE PLANNING N'EST PAS UN TABLEAU DE DÉCISIONS.
 *
 * Il porte une ligne par UNITÉ et session — date, créneau, local, présidence
 * —, sans un seul étudiant. C'est l'autre moitié de la reprise : les
 * décisions viennent de l'export, les séances viennent du planning. Les lire
 * dans le même écran évite d'avoir à recopier douze dates à la main.
 *
 * On le reconnaît à ce qui lui manque : ni nom, ni prénom.
 */
export function estPlanning(colonnes) {
  return colonnes.nom == null && colonnes.prenom == null;
}

/** Les séances d'un planning : une par unité et par session. */
export function construirePlanning(lignes, colonnes) {
  const val = (l, champ) => {
    const i = colonnes[champ];
    return i == null ? null : l[i];
  };
  const parUE = new Map();
  const rejets = [];

  for (let n = 1; n < lignes.length; n++) {
    const l = lignes[n] || [];
    const ueNum = Number(String(val(l, 'ue_num') ?? '').replace(/\D/g, ''));
    if (!ueNum) continue;
    const brut = String(val(l, 'session') ?? '').trim();
    const ses = /2/.test(brut) ? 2 : (/1/.test(brut) ? 1 : null);
    if (!ses) {
      rejets.push({ ligne: n + 1, ue_num: ueNum, etudiant: '—',
                    motif: brut ? `session « ${brut} » illisible` : 'session absente' });
      continue;
    }
    const date = versISO(val(l, 'date_seance'));
    if (!date) {
      rejets.push({ ligne: n + 1, ue_num: ueNum, etudiant: '—',
                    motif: 'date de délibération illisible' });
      continue;
    }
    const u = parUE.get(ueNum) || { ue_num: ueNum, etudiants: [], seance: {} };
    parUE.set(ueNum, u);
    // Une unité peut figurer deux fois au planning — juin et septembre. La
    // dernière ligne d'une même session l'emporte : un planning se corrige
    // en le rééditant, et c'est la version du bas qui est la bonne.
    u.seance[`s${ses}`] = {
      date_seance: date,
      heure_seance: versHeure(val(l, 'heure_seance')),
      visite_date: versISO(val(l, 'visite_date')),
      visite_heure: versHeure(val(l, 'visite_heure')),
      visite_local: String(val(l, 'visite_local') ?? '').trim() || null,
      // LA DATE DES ÉPREUVES DE SEPTEMBRE, quand le planning la porte. Elle
      // n'est pas la date de la délibération de seconde session : c'est le
      // jour où l'ajourné REPASSE, et c'est elle que l'annexe 8 lui annonce.
      // L'annexe la lit sur la séance de PREMIÈRE session — c'est là que le
      // Conseil l'a fixée —, aussi la porte-t-on telle que le fichier la
      // donne, sur la ligne où elle est écrite.
      session2_date: versISO(val(l, 'session2_date')),
      session2_heure: versHeure(val(l, 'session2_heure')),
      session2_local: String(val(l, 'session2_local') ?? '').trim() || null,
    };
    const pres = String(val(l, 'president_nom') ?? '').trim();
    if (pres) {
      u.seance[`s${ses}`].president_nom = pres;
      u.seance[`s${ses}`].president_role = 'autre';
    }
  }

  const unites = [...parUE.values()].sort((a, b) => a.ue_num - b.ue_num).map(u => ({
    ...u,
    resume: {
      etudiants: 0, s1: 0, s2: 0, cotes: 0, motifs: 0,
      date_s1: u.seance.s1?.date_seance || u.seance.s2?.date_seance || null,
      seances: Object.keys(u.seance).length,
    },
  }));
  return { unites, rejets };
}

/** Le vocabulaire des décisions : celui du classeur, et celui de Lucie. */
const DECISIONS = {
  c: 'reussi', r: 'refuse', aj: 'ajourne',
  reussi: 'reussi', reussite: 'reussi', capitalise: 'reussi', capitalisee: 'reussi',
  ajourne: 'ajourne', ajournee: 'ajourne', ajournement: 'ajourne',
  refuse: 'refuse', refusee: 'refuse', refus: 'refuse',
};

/**
 * Une date, quelle que soit la forme reçue — le tableur en rend trois : une
 * chaîne ISO, une chaîne belge, ou un nombre de jours depuis 1900.
 */
export function versISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Le calendrier d'Excel commence le 30/12/1899, et croit 1900 bissextile.
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

/** Une heure « 17:00 », « 17h », « 17h30 » ou une fraction de jour. */
export function versHeure(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const mn = Math.round(v * 24 * 60);
    return `${String(Math.floor(mn / 60)).padStart(2, '0')}:${String(mn % 60).padStart(2, '0')}`;
  }
  const m = String(v).trim().match(/^(\d{1,2})\s*[h:]\s*(\d{2})?/i);
  return m ? `${String(m[1]).padStart(2, '0')}:${m[2] || '00'}` : null;
}

/** Reconnaît les colonnes du fichier. Rend { champ → index }, et les doutes. */
export function reconnaitreColonnes(entetes) {
  const norm = entetes.map(cle);
  const trouve = {};
  const pris = new Set();
  for (const c of CHAMPS) {
    for (const motif of c.motifs) {
      const i = norm.findIndex((h, k) => h === motif && !pris.has(k));
      if (i >= 0) { trouve[c.cle] = i; pris.add(i); break; }
    }
    // À défaut d'égalité, une correspondance par préfixe — « date_delib_jury ».
    if (trouve[c.cle] == null) {
      for (const motif of c.motifs) {
        const i = norm.findIndex((h, k) => h.startsWith(motif) && !pris.has(k) && h.length > 1);
        if (i >= 0) { trouve[c.cle] = i; pris.add(i); break; }
      }
    }
  }
  return {
    colonnes: trouve,
    manquants: CHAMPS.filter(c => c.requis && trouve[c.cle] == null).map(c => c.libelle),
  };
}

/**
 * Transforme les lignes du tableau en la charge utile que Lucie sait écrire —
 * la même que celle du classeur de suivi, pour que le mode migration s'y
 * applique sans rien changer.
 *
 * `lignes[0]` porte les en-têtes ; `colonnes` associe chaque champ à un index,
 * qu'il vienne de la reconnaissance ou de la main de l'utilisateur.
 */
export function construireUnites(lignes, colonnes) {
  const val = (l, champ) => {
    const i = colonnes[champ];
    return i == null ? null : l[i];
  };
  const parUE = new Map();
  const rejets = [];

  for (let n = 1; n < lignes.length; n++) {
    const l = lignes[n] || [];
    const ueNum = Number(String(val(l, 'ue_num') ?? '').replace(/\D/g, ''));
    const nom = String(val(l, 'nom') ?? '').trim();
    const prenom = String(val(l, 'prenom') ?? '').trim();
    if (!ueNum || (!nom && !prenom)) continue;   // ligne vide ou séparateur

    const brut = String(val(l, 'decision') ?? '').trim();
    const decision = DECISIONS[cle(brut)] || null;
    if (!decision) {
      // ON N'INVENTE PAS UNE DÉCISION. Une ligne dont le code est inconnu —
      // le « X » de l'UE 248, une case vide — est écartée et nommée.
      rejets.push({ ligne: n + 1, ue_num: ueNum, etudiant: `${nom} ${prenom}`.trim(),
                    motif: brut ? `décision « ${brut} » inconnue` : 'aucune décision' });
      continue;
    }

    const ses = String(val(l, 'session') ?? '1').match(/2/) ? 2 : 1;
    const u = parUE.get(ueNum) || { ue_num: ueNum, etudiants: [], seance: {}, _par: new Map() };
    parUE.set(ueNum, u);

    const idc = `${String(val(l, 'matricule') ?? '').trim()}|${nom}|${prenom}`;
    let e = u._par.get(idc);
    if (!e) {
      e = { matricule: String(val(l, 'matricule') ?? '').trim(), nom, prenom,
            s1: { notes: [] }, s2: { notes: [] } };
      u._par.set(idc, e);
      u.etudiants.push(e);
    }
    const bloc = ses === 2 ? e.s2 : e.s1;
    bloc.decision = decision;
    bloc.note_ue = val(l, 'note');
    bloc.justification = String(val(l, 'justification') ?? '').trim() || null;

    // LA SÉANCE EST PORTÉE PAR CHAQUE LIGNE, mais elle est UNE. On prend la
    // première valeur rencontrée pour la session : les lignes d'une même
    // délibération portent la même date, et si elles divergent c'est le
    // fichier qu'il faut corriger, pas Lucie qui doit arbitrer.
    const s = (u.seance[`s${ses}`] ||= {});
    const poser = (k, v) => { if (v != null && v !== '' && s[k] == null) s[k] = v; };
    poser('date_seance', versISO(val(l, 'date_seance')));
    poser('heure_seance', versHeure(val(l, 'heure_seance')));
    poser('visite_date', versISO(val(l, 'visite_date')));
    poser('visite_heure', versHeure(val(l, 'visite_heure')));
    poser('visite_local', String(val(l, 'visite_local') ?? '').trim() || null);
    poser('session2_date', versISO(val(l, 'session2_date')));
    const pres = String(val(l, 'president_nom') ?? '').trim();
    if (pres && s.president_nom == null) { s.president_nom = pres; s.president_role = 'autre'; }
  }

  const unites = [...parUE.values()]
    .sort((a, b) => a.ue_num - b.ue_num)
    .map(({ _par, ...u }) => ({
      ...u,
      resume: {
        etudiants: u.etudiants.length,
        s1: u.etudiants.filter(e => e.s1.decision).length,
        s2: u.etudiants.filter(e => e.s2.decision).length,
        cotes: u.etudiants.filter(e => e.s1.note_ue != null || e.s2.note_ue != null).length,
        motifs: u.etudiants.filter(e => e.s1.justification || e.s2.justification).length,
        date_s1: u.seance.s1?.date_seance || null,
      },
    }));

  return { unites, rejets };
}

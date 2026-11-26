/* (CS) LE CONTRÔLE DE L'HORAIRE (3.5.746, Charles, 26 novembre 2026 : « peux-tu faire la liste des erreurs de ce type pour les
   détecter ? » puis « oui, un contrôle de l'horaire » dans Lucie). Les séances que l'horaire et les attributions ne racontent pas de la
   même façon, en quatre familles — chacune avec son geste :
   1. le professeur de la séance n'a aucune attribution pour ce cours (doublon de fiche, remplaçant, erreur de l'horaire) ;
   2. le cours est connu, mais la séance ne nomme personne ;
   3. la séance n'est rattachée à aucun cours de Lucie (« matière à préciser », points, stages, réservations) ;
   4. le nom de l'horaire ne correspond à aucune fiche (« c'est la même personne »).
   Les séances annulées n'entrent pas. Le périmètre de la coordination borne tout. */
import db from '../db/index.js';

const nomP = p => (p?.nom ? `${String(p.nom).toUpperCase()} ${p.prenom || ''}`.trim() : null);

function attributionsDuCours(annee) {
  const m = new Map();
  for (const a of db.prepare(`SELECT a.id, a.code_cours, a.code, a.professeur_id, p.nom, p.prenom,
      (SELECT libelle FROM activite_type t WHERE t.id = a.activite_id) activite
      FROM attribution a LEFT JOIN professeur p ON p.id = a.professeur_id
      WHERE a.annee_scolaire = ? AND a.code_cours IS NOT NULL AND COALESCE(a.en_conge, 0) = 0`).all(annee)) {
    if (!m.has(a.code_cours)) m.set(a.code_cours, []);
    m.get(a.code_cours).push({ id: a.id, code: a.code, professeur_id: a.professeur_id, prof: nomP(a) || 'à désigner', activite: a.activite });
  }
  return m;
}

export function controleHoraire(annee, { sections = null, section = null } = {}) {
  const seances = db.prepare(`SELECT s.id, s.date, s.heure_debut, s.heure_fin, s.section, s.cours_code, s.matiere, s.sous_groupe,
      s.professeur_id, s.professeur_texte, p.nom, p.prenom,
      (SELECT cours_nom FROM cours c WHERE c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire LIMIT 1) cours_nom
    FROM horaire_seance s LEFT JOIN professeur p ON p.id = s.professeur_id
    WHERE s.annee_scolaire = ? AND COALESCE(s.annule, 0) = 0 ORDER BY s.date, s.heure_debut`).all(annee)
    .filter(s => (!sections || sections.includes(s.section)) && (!section || s.section === section));
  const parCours = attributionsDuCours(annee);
  const groupes = new Map();
  const ranger = (famille, cle, s, extra) => {
    const k = `${famille}|${cle}`;
    if (!groupes.has(k)) groupes.set(k, { famille, cle: k, section: s.section, cours_code: s.cours_code || null, cours_nom: s.cours_nom || null,
      matiere: s.matiere || null, groupe: s.sous_groupe || null, ids: [], dates: [], ...extra });
    const g = groupes.get(k); g.ids.push(s.id); g.dates.push(s.date);
  };
  for (const s of seances) {
    const att = s.cours_code ? parCours.get(s.cours_code) || [] : [];
    if (!s.professeur_id && String(s.professeur_texte || '').trim()) {
      ranger('nom', `${s.section}|${s.professeur_texte}`, s, { texte: s.professeur_texte }); continue;
    }
    if (!s.cours_code) { ranger('sans_cours', `${s.section}|${s.matiere || ''}`, s, { prof: nomP(s) }); continue; }
    if (!att.length) continue;   // un cours sans attribution (enseignement de la HELB, par ex.) : rien à comparer
    if (!s.professeur_id) { ranger('sans_prof', `${s.section}|${s.cours_code}|${s.sous_groupe || ''}`, s, { candidats: att }); continue; }
    if (!att.some(a => a.professeur_id === s.professeur_id)) {
      ranger('autre_prof', `${s.section}|${s.cours_code}|${s.sous_groupe || ''}|${s.professeur_id}`, s,
        { prof: nomP(s), professeur_id: s.professeur_id, candidats: att });
    }
  }
  const ORDRE = { autre_prof: 1, sans_prof: 2, sans_cours: 3, nom: 4 };
  const lignes = [...groupes.values()].map(g => ({ ...g, n: g.ids.length, premiere: g.dates[0], derniere: g.dates[g.dates.length - 1],
    dates: [...new Set(g.dates)].map(d => `${d.slice(8, 10)}/${d.slice(5, 7)}`) }))
    .sort((a, b) => ORDRE[a.famille] - ORDRE[b.famille] || String(a.section).localeCompare(String(b.section))
      || String(a.cours_code || a.matiere || '').localeCompare(String(b.cours_code || b.matiere || ''), 'fr', { numeric: true }));
  const compte = f => lignes.filter(l => l.famille === f).reduce((t, l) => t + l.n, 0);
  return { annee, lignes, totaux: { autre_prof: compte('autre_prof'), sans_prof: compte('sans_prof'), sans_cours: compte('sans_cours'), nom: compte('nom') },
    sections: [...new Set(seances.map(s => s.section).filter(Boolean))].sort() };
}

/** Donner aux séances le professeur d'une attribution du même cours, et les relier à elle. */
export function prendreAttribution(ids, attributionId, { sections = null, par = null } = {}) {
  const a = db.prepare('SELECT id, code_cours, professeur_id FROM attribution WHERE id = ?').get(Number(attributionId));
  if (!a) throw Object.assign(new Error('Attribution inconnue.'), { status: 404 });
  const lire = db.prepare('SELECT id, section, cours_code FROM horaire_seance WHERE id = ?');
  const maj = db.prepare(`UPDATE horaire_seance SET professeur_id = ?, attribution_id = ?, modifie_lucie = 1,
    modifie_par = ?, modifie_le = datetime('now') WHERE id = ?`);
  let n = 0;
  db.transaction(() => {
    for (const id of ids || []) {
      const s = lire.get(Number(id));
      if (!s || s.cours_code !== a.code_cours) continue;
      if (sections && !sections.includes(s.section)) continue;
      n += maj.run(a.professeur_id || null, a.id, par, s.id).changes;
    }
  })();
  return { modifiees: n };
}

// ─────────────────────────────────────────────────────────────────────────────
// LES DATES D'UN ENSEIGNANT (3.5.142, Charles, 6 novembre 2026 : « Mon agenda, avec les dates des examens, des délibérations,
// etc., avec l'agenda de l'école » ; tranché : une face « Mes dates », et aussi dans l'agenda du téléphone).
//   · les EXAMENS de ses cours : `epreuve_session1` (s1_*) et `deliberation_session2` (s2_*) — une ligne par cours, ou par
//     unité quand l'épreuve est commune (cours vide) ;
//   · les DÉLIBÉRATIONS de ses unités : `deliberation_seance` (session, organisation, date, heure) ;
//   · l'ÉCOLE : congés, fermetures totales, jours fériés et fermés, grands moments destinés aux enseignants.
// Ses unités et ses cours : ceux de ses attributions (`attributionsDe`), la règle de Mes cours.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { tousLesPassages } from './passages.js';
import { attributionsDe } from './etudiantsCours.js';

/** L'agenda de l'école tel qu'un enseignant le lit (sorti de portailEnseignants.js). */
export async function agendaEcoleProf(annee) {
  const out = [];
  try {
    const { semaines52, fermetures, plus } = await import('./agendaEcole.js');
    const { moments } = await import('./ligneTemps.js');
    const { joursFeries } = await import('../routes/horaire.js');
    const sem = semaines52(annee);
    /* LA FERMETURE DE L'AGENDA FAIT FOI (3.5.145, Charles, 6 novembre 2026 : « pourquoi mets-tu que c'est congé de Toussaint ? » —
       le calendrier des cours mettait l'automne une semaine trop tard, la fermeture peinte dans l'agenda de l'école était juste).
       Les congés de l'enseignant sont les semaines que l'agenda ferme : en entier (« École fermée »), ou en partie (« Congé »). Le
       calendrier des cours n'est plus lu ici. */
    for (const [lundi, f] of fermetures(annee)) {
      if (f.fermeture === 'totale') out.push({ type: 'ferme', du: lundi, au: plus(lundi, 6), libelle: f.libelle || 'École fermée' });
      else if (f.fermeture === 'partielle') out.push({ type: 'conge', du: lundi, au: plus(lundi, 6), libelle: f.libelle || 'Congé' });
    }
    const ans = [...new Set([sem[0].slice(0, 4), sem[51].slice(0, 4)])].map(Number);
    for (const an of ans) for (const [date, libelle] of joursFeries(an)) if (date >= sem[0] && date <= plus(sem[51], 6)) out.push({ type: 'ferie', du: date, au: date, libelle });
    for (const m of moments(annee, { user: { role: 'professeur' } })) {
      if (m.type === 'horaires') continue;
      out.push({ type: m.type === 'formation' ? 'formation' : 'moment', du: m.du, au: m.au || m.du, libelle: m.titre || m.libelle_type, genre: m.libelle_type,
        heure_debut: m.heure_debut || null, heure_fin: m.heure_fin || null, lieu: m.lieu || null });
    }
  } catch (e) { console.error('[dates enseignant] école :', e.message); }
  return out.sort((a, b) => a.du.localeCompare(b.du));
}

/** Examens et délibérations des unités et cours d'un professeur, pour une année. */
export function examensEtDeliberations(profId, annee) {
  const attrs = profId ? attributionsDe(profId, annee) : [];
  const ues = new Set(attrs.map(a => Number(a.ue_num)).filter(Boolean));
  const cours = new Set(attrs.map(a => String(a.code_cours || '')).filter(Boolean));
  if (!ues.size) return [];
  const nom = (u) => { try { return db.prepare('SELECT MAX(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(u, annee)?.n || ''; } catch { return ''; } };
  const nomCours = (c) => { try { return db.prepare('SELECT MAX(cours_nom) n FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(c, annee)?.n || ''; } catch { return ''; } };
  const out = [];
  const aPassages = new Map();
  for (const p of tousLesPassages(annee)) { const k = `${p.session}|${p.ue_num}|${p.cours_code || ''}`; if (!aPassages.has(k)) aPassages.set(k, []); aPassages.get(k).push(p); }
  for (const [t, k, session] of [['epreuve_session1', 's1', 1], ['deliberation_session2', 's2', 2]]) {
    let l = [];
    try {
      l = db.prepare(`SELECT ue_num, cours_code, ${k}_date AS date, ${k}_heure AS heure, ${k}_local AS local, ${k}_adresse AS adresse
        FROM ${t} WHERE annee_scolaire = ? AND ${k}_date IS NOT NULL AND ${k}_date <> ''`).all(annee);
    } catch { l = []; }
    for (const e of l) {
      if (!ues.has(Number(e.ue_num))) continue;
      const c = String(e.cours_code || '');
      if (c && !cours.has(c)) continue;
      // PLUSIEURS PASSAGES (3.5.284) : un événement par passage (partie, groupe), à la place de la date unique.
      const ps = aPassages.get(`${session}|${e.ue_num}|${c}`);
      if (ps) {
        for (const p of ps) out.push({ type: 'examen', session, date: String(p.date).slice(0, 10), heure: p.heure || null, ue_num: Number(e.ue_num), cours_code: c || null,
          titre: `Examen S${session} — ${c ? `${c} ${nomCours(c)}` : `UE ${e.ue_num} ${nom(e.ue_num)}`}${p.partie ? ` · ${p.partie}` : ''}${ps.length > 1 ? ` (passage ${p.rang}/${ps.length})` : ''}`.trim(),
          lieu: [p.local, p.adresse].filter(Boolean).join(', ') || null, uid: `examen-p${p.id}` });
        continue;
      }
      out.push({ type: 'examen', session, date: String(e.date).slice(0, 10), heure: e.heure || null, ue_num: Number(e.ue_num), cours_code: c || null,
        titre: `Examen S${session} — ${c ? `${c} ${nomCours(c)}` : `UE ${e.ue_num} ${nom(e.ue_num)}`}`.trim(),
        lieu: [e.local, e.adresse].filter(Boolean).join(', ') || null, uid: `examen-s${session}-${e.ue_num}-${c || 'ue'}` });
    }
  }
  try {
    const l = db.prepare(`SELECT id, ue_num, COALESCE(session, 1) session, COALESCE(num_organisation, 0) org, date_seance date, heure_seance heure
      FROM deliberation_seance WHERE annee_scolaire = ? AND date_seance IS NOT NULL AND date_seance <> ''`).all(annee);
    for (const d of l) {
      if (!ues.has(Number(d.ue_num))) continue;
      out.push({ type: 'deliberation', session: d.session, date: String(d.date).slice(0, 10), heure: d.heure || null, ue_num: Number(d.ue_num),
        titre: `Délibération S${d.session} — UE ${d.ue_num} ${nom(d.ue_num)}${d.org ? ` (org. ${d.org})` : ''}`.trim(), lieu: null, uid: `deliberation-${d.id}` });
    }
  } catch { /* table absente */ }
  return out.sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
}

/** Pour l'agenda du téléphone : un examen ou une délibération avec heure dure 2 h (une durée par défaut lisible) ; sans heure, la journée. */
export function evenementsDesDates(liste) {
  const plus2 = h => { const [a, b] = String(h).split(':').map(Number); const m = Math.min(23 * 60 + 59, a * 60 + (b || 0) + 120); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  return liste.map(x => ({ uid: x.uid, date: x.date, heure_debut: x.heure ? String(x.heure).slice(0, 5) : null, heure_fin: x.heure ? plus2(String(x.heure).slice(0, 5)) : null,
    titre: x.titre, local_texte: x.lieu || '', description: `${x.type === 'examen' ? 'Date d’examen' : 'Séance de délibération'} posée dans Lucie.` }));
}

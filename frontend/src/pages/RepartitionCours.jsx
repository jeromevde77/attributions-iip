import { useEffect, useMemo, useState } from 'react';
import { IconUsersGroup, IconAlertTriangle, IconWand, IconFileSpreadsheet, IconX } from '@tabler/icons-react';
import { api, authHeaders, getAnnee } from '../lib/api.js';

/**
 * RÉPARTITION DES ÉTUDIANTS — le croisement attributions × PAE.
 *
 * Les colonnes viennent des ATTRIBUTIONS : pour chaque cours de l'unité, ses
 * groupes tels qu'ils sont attribués (organisation, lettre, professeurs).
 * Les lignes viennent du PAE : les inscrits de l'unité, avec leur
 * organisation de délibération en badge. La case dit « il a cours ici ».
 *
 * Trois règles, posées par Charles (24 septembre 2026) :
 *  1. cocher HORS de l'organisation de délibération se CONFIRME ;
 *  2. un cours sans groupe = « Tous » — chaque inscrit y est d'office,
 *     rien ne s'écrit ;
 *  3. le plafond par groupe (référentiel du cours) est SUGGÉRÉ : dépassé,
 *     l'effectif passe en ambre, il ne bloque pas.
 *
 * Rien ne s'écrit avant « Enregistrer ».
 */
const cle = (eid, code) => `${eid}|${code}`;
const cleGroupe = (g) => `${g.num_organisation}|${g.groupe || ''}`;

/* UN CLASSEUR DE GROUPES (Jérôme, 24 septembre 2026) : les groupes de labo se
 * composent dans Excel — « Groupe 1 — 17 étudiants », puis Nom, Prénom, Mail,
 * Cours suivis. On le relit tel quel : un titre « Groupe N » ouvre un groupe,
 * la ligne d'en-têtes dit où sont les colonnes, chaque ligne suivante est un
 * étudiant. Une feuille « Tous les groupes » suffit si elle existe ; sinon on
 * lit toutes les feuilles, sans compter deux fois le même étudiant. */
const sansAccent = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normNom = t => sansAccent(t).toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
const premierMot = t => normNom(t).split(' ')[0] || '';
/* LE RANG D'UN GROUPE, qu'il s'écrive en chiffre ou en lettre : les
 * attributions de TIM nomment leurs groupes A, B, C, D… quand le classeur
 * dit Groupe 1, 2, 3, 4 (Jérôme, 24 septembre 2026). 1 = A, 2 = B, etc. Une
 * étiquette de plus d'une lettre (« Ts ») n'a pas de rang : elle ne se
 * confond avec aucun groupe. */
const rangGroupe = t => {
  const m = /\d+/.exec(String(t ?? ''));
  if (m) return Number(m[0]);
  const mots = normNom(t).split(' ').filter(Boolean);
  const der = mots[mots.length - 1] || '';
  return der.length === 1 ? der.charCodeAt(0) - 64 : null;
};
const lettre = n => (n >= 1 && n <= 26 ? String.fromCharCode(64 + n) : '');

async function lireClasseurGroupes(fichier) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
  const tous = wb.SheetNames.find(n => /tous/i.test(n));
  const lignes = [], vus = new Set();
  for (const nom of (tous ? [tous] : wb.SheetNames)) {
    const M = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: null });
    let groupe = null, col = null;
    for (const r of M) {
      const c0 = String(r[0] ?? '').trim();
      const titre = /^groupe\s+(\w+)/i.exec(c0);
      if (titre) { groupe = titre[1]; col = null; continue; }
      const entetes = r.map(v => normNom(v));
      if (entetes.includes('NOM') && entetes.some(v => v.startsWith('PRENOM'))) {
        col = {
          nom: entetes.indexOf('NOM'),
          prenom: entetes.findIndex(v => v.startsWith('PRENOM')),
          mail: entetes.findIndex(v => v === 'MAIL' || v.startsWith('E MAIL') || v === 'EMAIL'),
          cours: entetes.findIndex(v => v.startsWith('COURS')),
        };
        continue;
      }
      if (!groupe || !col || !r[col.nom]) continue;
      const mail = col.mail >= 0 ? String(r[col.mail] ?? '').trim().toLowerCase() : '';
      const ligne = {
        nom: String(r[col.nom]).trim(), prenom: String(r[col.prenom] ?? '').trim(), mail, groupe,
        // « 255.1 + 250.1 » : les cours que l'étudiant suit dans ce groupe.
        // Sans colonne, le groupe vaut pour tous les cours de l'unité.
        cours: col.cours >= 0 && r[col.cours]
          ? String(r[col.cours]).split(/[+,;/]/).map(x => x.trim()).filter(Boolean) : null,
      };
      const k = mail || `${normNom(ligne.nom)}|${normNom(ligne.prenom)}`;
      if (vus.has(k)) continue;
      vus.add(k); lignes.push(ligne);
    }
  }
  return lignes;
}

export default function RepartitionCours() {
  const annee = getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [ues, setUes] = useState(null);
  const [ueNum, setUeNum] = useState(null);
  const [data, setData] = useState(null);       // { cours, etudiants, affectations }
  const [attente, setAttente] = useState(new Map()); // clé → { retirer } | { org, groupe }
  const [coches, setCoches] = useState(new Set());
  const [q, setQ] = useState('');
  const [erreur, setErreur] = useState(null);
  const [saving, setSaving] = useState(false);
  // Le classeur reste chargé d'une UE à l'autre : un même fichier couvre
  // souvent deux unités (250 et 255), qu'on applique l'une après l'autre.
  const [classeur, setClasseur] = useState(null);   // { nom, lignes }
  const [choixBloc, setChoixBloc] = useState({});   // cours_code → cle du bloc retenu

  useEffect(() => {
    api.sections().then(l => setSections(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!section) { setUes(null); setUeNum(null); setData(null); return; }
    setErreur(null);
    fetch(`/api/etudiants/repartition-cours?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Erreur');
        setUes(j.ues); setUeNum(null); setData(null);
      })
      .catch(e => setErreur(e.message));
  }, [section, annee]);

  async function ouvrirUE(num) {
    setUeNum(num); setData(null); setAttente(new Map()); setCoches(new Set()); setErreur(null);
    try {
      const r = await fetch(`/api/etudiants/repartition-cours/ue?ue_num=${num}&annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erreur');
      setData(j);
    } catch (e) { setErreur(e.message); }
  }

  // L'état AFFICHÉ : ce que le serveur connaît, recouvert des changements en attente.
  const affect = useMemo(() => {
    const m = new Map();
    for (const a of (data?.affectations || [])) {
      m.set(cle(a.etudiant_id, `${a.cours_code}#${a.activite_id || 0}`),
        { org: a.num_organisation, groupe: a.groupe_code || null });
    }
    for (const [k, v] of attente) {
      if (v.retirer) m.delete(k); else m.set(k, { org: v.org, groupe: v.groupe });
    }
    return m;
  }, [data, attente]);

  const etudiants = useMemo(() => {
    const l = data?.etudiants || [];
    const t = q.trim().toLowerCase();
    return t ? l.filter(e => `${e.nom} ${e.prenom}`.toLowerCase().includes(t)) : l;
  }, [data, q]);

  // Les cours qui se répartissent (les « Tous » ne comptent pas les lignes
  // incomplètes : chacun y est d'office).
  const coursAvecGroupes = useMemo(
    () => (data?.cours || []).filter(c => !c.sans_groupe), [data]);

  const manquants = (e) => coursAvecGroupes
    .filter(c => !affect.has(cle(e.id, c.cle))).length;

  function confirmerOrg(noms, orgEtu, orgGroupe) {
    return window.confirm(
      `${noms} ${noms.includes(',') ? 'sont' : 'est'} en organisation ${orgEtu} pour la `
      + `délibération, et ce groupe est en organisation ${orgGroupe}.\n\n`
      + `Placer quand même dans ce groupe ?`);
  }

  function poser(e, c, g) {
    const k = cle(e.id, c.cle);
    const actuel = affect.get(k);
    setAttente(prev => {
      const n = new Map(prev);
      if (actuel && actuel.org === g.num_organisation && (actuel.groupe || null) === (g.groupe || null)) {
        // Recocher sa propre case la retire.
        const serveur = (data?.affectations || []).some(a =>
          a.etudiant_id === e.id && a.cours_code === c.cours_code
          && (a.activite_id || 0) === (c.activite_id || 0));
        if (serveur) n.set(k, { retirer: true }); else n.delete(k);
      } else {
        n.set(k, { org: g.num_organisation, groupe: g.groupe || null });
      }
      return n;
    });
  }

  function cliquerCase(e, c, g) {
    const k = cle(e.id, c.cle);
    const actuel = affect.get(k);
    const dejaLa = actuel && actuel.org === g.num_organisation
      && (actuel.groupe || null) === (g.groupe || null);
    // Hors de l'organisation de délibération : on confirme (règle 1).
    if (!dejaLa && e.num_organisation != null && g.num_organisation !== e.num_organisation) {
      if (!confirmerOrg(`${e.nom} ${e.prenom}`, e.num_organisation, g.num_organisation)) return;
    }
    poser(e, c, g);
  }

  function placerCoches(c, g) {
    const cibles = etudiants.filter(e => coches.has(e.id));
    if (!cibles.length) return;
    const horsOrg = cibles.filter(e =>
      e.num_organisation != null && g.num_organisation !== e.num_organisation);
    if (horsOrg.length
      && !confirmerOrg(horsOrg.map(e => `${e.nom} ${e.prenom}`).join(', '),
        horsOrg[0].num_organisation, g.num_organisation)) return;
    for (const e of cibles) poser(e, c, g);
    // LA SÉLECTION RESTE : c'est elle qui permet d'enchaîner — les mêmes dix
    // noms, un clic sur 333.1·A, puis 333.2·B, puis 333.3·C (Charles,
    // 25 septembre). On la vide soi-même quand on passe au groupe suivant.
  }

  // « Proposer depuis la délibération » : quand UN seul groupe du cours porte
  // l'organisation de l'étudiant, il s'y range ; deux groupes (A/B) dans la
  // même organisation restent un choix humain.
  function proposer() {
    setAttente(prev => {
      const n = new Map(prev);
      for (const e of (data?.etudiants || [])) {
        if (e.num_organisation == null) continue;
        for (const c of coursAvecGroupes) {
          const k = cle(e.id, c.cle);
          if (affect.has(k) || n.has(k)) continue;
          const candidats = c.groupes.filter(g => g.num_organisation === e.num_organisation);
          if (candidats.length === 1) {
            n.set(k, { org: candidats[0].num_organisation, groupe: candidats[0].groupe || null });
          }
        }
      }
      return n;
    });
  }

  async function enregistrer() {
    if (!attente.size) return;
    setSaving(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/repartition-cours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          ue_num: ueNum, annee,
          affectations: [...attente].map(([k, v]) => {
            const [eid, ...reste] = k.split('|');
            const [code, act] = reste.join('|').split('#');
            const base = { etudiant_id: Number(eid), cours_code: code, activite_id: Number(act) || 0 };
            return v.retirer ? { ...base, retirer: true }
              : { ...base, num_organisation: v.org, groupe_code: v.groupe };
          }),
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      await ouvrirUE(ueNum);
    } catch (e) { setErreur(e.message); }
    finally { setSaving(false); }
  }

  // Effectifs par groupe, sur l'état affiché.
  const effectif = (c, g) => (data?.etudiants || []).filter(e => {
    const a = affect.get(cle(e.id, c.cle));
    return a && a.org === g.num_organisation && (a.groupe || null) === (g.groupe || null);
  }).length;

  const etiquette = (g) => `Org ${g.num_organisation}${g.groupe ? ` · Gr. ${g.groupe}` : ''}`;

  async function chargerClasseur(f) {
    if (!f) return;
    setErreur(null);
    try {
      const lignes = await lireClasseurGroupes(f);
      if (!lignes.length) throw new Error("Aucun groupe reconnu : le classeur doit porter des titres « Groupe 1 », « Groupe 2 »… suivis d'une ligne Nom / Prénom.");
      setClasseur({ nom: f.name, lignes }); setChoixBloc({});
    } catch (e) { setErreur(e.message); }
  }

  /* CE QUE LE CLASSEUR FERAIT ICI — calculé, montré, et rien n'est posé tant
   * qu'on n'a pas cliqué « Placer ». Même alors, rien ne s'écrit avant
   * « Enregistrer » : l'import remplit la grille, il ne la court-circuite pas. */
  const apercu = useMemo(() => {
    if (!classeur || !data) return null;
    const inscrits = data.etudiants || [];
    const parMail = new Map();
    for (const e of inscrits) for (const m of [e.email_ecole, e.email_perso]) {
      if (m) parMail.set(String(m).trim().toLowerCase(), e);
    }
    const trouver = l => {
      if (l.mail && parMail.has(l.mail)) return parMail.get(l.mail);
      const memes = inscrits.filter(e => normNom(e.nom) === normNom(l.nom)
        && premierMot(e.prenom) === premierMot(l.prenom));
      return memes.length === 1 ? memes[0] : null;
    };

    const codesUE = [...new Set((data.cours || []).map(c => c.cours_code))];
    // Le cours qui se coupe en groupes, c'est une ACTIVITÉ : s'il y en a
    // plusieurs, on retient celle qui porte les numéros du classeur, et on
    // demande quand il reste un doute.
    const numsClasseur = new Set(classeur.lignes.map(l => rangGroupe(l.groupe)));
    const blocs = {}, ambigus = {}, sansGroupes = [];
    for (const code of codesUE) {
      const cands = coursAvecGroupes.filter(c => c.cours_code === code);
      if (!cands.length) {
        if (classeur.lignes.some(l => !l.cours || l.cours.includes(code))) sansGroupes.push(code);
        continue;
      }
      const couvre = c => [...numsClasseur].filter(n => c.groupes.some(g => rangGroupe(g.groupe) === n)).length;
      const tri = [...cands].sort((a, b) => couvre(b) - couvre(a));
      if (choixBloc[code]) blocs[code] = cands.find(c => c.cle === choixBloc[code]) || tri[0];
      else {
        blocs[code] = tri[0];
        if (tri.length > 1 && couvre(tri[0]) === couvre(tri[1])) ambigus[code] = cands;
      }
    }

    const poses = [], deja = [], introuvables = [], absents = {};
    for (const l of classeur.lignes) {
      const codes = (l.cours || codesUE).filter(c => codesUE.includes(c));
      if (!codes.length) continue;                 // ce groupe ne concerne pas cette UE
      const e = trouver(l);
      if (!e) { introuvables.push(l); continue; }
      for (const code of codes) {
        const c = blocs[code];
        if (!c) continue;
        const n = rangGroupe(l.groupe);
        const gs = c.groupes.filter(g => rangGroupe(g.groupe) === n);
        if (!gs.length) {
          const k = `${c.cle}|${l.groupe}`;
          (absents[k] ||= { c, groupe: l.groupe, noms: [] }).noms.push(`${l.nom} ${l.prenom}`);
          continue;
        }
        const g = gs.find(x => x.num_organisation === e.num_organisation) || gs[0];
        const a = affect.get(cle(e.id, c.cle));
        if (a && a.org === g.num_organisation && (a.groupe || null) === (g.groupe || null)) deja.push({ e, c, g });
        else poses.push({ e, c, g });
      }
    }
    const lusIci = new Set(classeur.lignes.map(trouver).filter(Boolean).map(e => e.id));
    const horsClasseur = inscrits.filter(e => !lusIci.has(e.id));
    return { poses, deja, introuvables, absents: Object.values(absents), ambigus, sansGroupes, horsClasseur };
  }, [classeur, data, coursAvecGroupes, affect, choixBloc]);

  function appliquerClasseur() {
    if (!apercu?.poses.length) return;
    setAttente(prev => {
      const n = new Map(prev);
      for (const { e, c, g } of apercu.poses) {
        n.set(cle(e.id, c.cle), { org: g.num_organisation, groupe: g.groupe || null });
      }
      return n;
    });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <IconUsersGroup size={18} className="text-iip-turquoise" />
        <span className="font-semibold text-iip-blue text-[15px]">Répartition des étudiants</span>
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-gray-300 rounded-champ px-3 py-1.5 text-sm bg-white">
          <option value="">— Choisir une section —</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.code} — {s.libelle}</option>)}
        </select>
        {/* Une section porte vite vingt UE : un sélecteur, pas un mur de
            pastilles (Charles, 25 septembre). */}
        {ues && (
          <select value={ueNum ?? ''}
            onChange={e => e.target.value && ouvrirUE(Number(e.target.value))}
            className="border border-gray-300 rounded-champ px-3 py-1.5 text-sm bg-white max-w-[440px]">
            <option value="">— Choisir une UE ({ues.length}) —</option>
            {ues.map(u => (
              <option key={u.ue_num} value={u.ue_num}>
                UE {u.ue_num} — {u.ue_nom || ''} ({u.inscrits} inscrit{u.inscrits > 1 ? 's' : ''})
              </option>
            ))}
          </select>
        )}
        <span className="text-[11.5px] font-bold text-iip-blue bg-iip-light rounded-full px-3 py-1">{annee}</span>
        {data && (
          <span className="ml-auto flex gap-2 flex-wrap">
            <label title="Un classeur Excel : « Groupe 1 », « Groupe 2 »… puis Nom, Prénom, Mail, Cours suivis"
              className="px-3 py-1.5 text-[12.5px] font-semibold rounded-champ border border-slate-300 text-slate-600 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50">
              <IconFileSpreadsheet size={14} /> Importer des groupes
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { chargerClasseur(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button onClick={proposer}
              className="px-3 py-1.5 text-[12.5px] font-semibold rounded-champ border border-iip-turquoise text-iip-turquoise inline-flex items-center gap-1.5">
              <IconWand size={14} /> Proposer depuis la délibération
            </button>
            <button onClick={enregistrer} disabled={saving || !attente.size}
              className="px-3 py-1.5 text-[12.5px] font-semibold rounded-champ bg-iip-blue text-white disabled:opacity-40">
              {saving ? 'Enregistrement…'
                : attente.size ? `Enregistrer (${attente.size} changement${attente.size > 1 ? 's' : ''})`
                : 'Enregistrer'}
            </button>
          </span>
        )}
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 rounded-champ px-3 py-2 text-sm text-red-700">{erreur}</div>
      )}

      {apercu && (
        <div className="border border-iip-turquoise/40 bg-iip-turquoise/5 rounded-carte px-3 py-2.5 text-[12.5px] space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <IconFileSpreadsheet size={15} className="text-iip-turquoise" />
            <b className="text-iip-blue">{classeur.nom}</b>
            <span className="text-slate-500">
              {classeur.lignes.length} étudiants lus · {new Set(classeur.lignes.map(l => l.groupe)).size} groupes · appliqué à l'UE {ueNum}
            </span>
            <button onClick={appliquerClasseur} disabled={!apercu.poses.length}
              className="ml-auto px-3 py-1 text-[12px] font-semibold rounded-champ bg-iip-turquoise text-white disabled:opacity-40">
              Placer {apercu.poses.length} affectation{apercu.poses.length > 1 ? 's' : ''} dans la grille
            </button>
            <button onClick={() => setClasseur(null)} title="Fermer le classeur" className="text-slate-400 hover:text-slate-600">
              <IconX size={15} />
            </button>
          </div>
          {Object.entries(apercu.ambigus).map(([code, cands]) => (
            <div key={code} className="flex items-center gap-2 text-amber-800">
              <IconAlertTriangle size={14} />
              {code} se coupe en groupes dans plusieurs activités : lesquelles reçoivent ce classeur ?
              <select value={choixBloc[code] || ''} onChange={e => setChoixBloc(p => ({ ...p, [code]: e.target.value }))}
                className="border border-amber-300 rounded px-2 py-0.5 bg-white">
                <option value="">— {cands[0].activite_libelle || 'sans activité'} (par défaut) —</option>
                {cands.map(c => <option key={c.cle} value={c.cle}>{c.activite_libelle || 'sans activité'}</option>)}
              </select>
            </div>
          ))}
          {apercu.deja.length > 0 && (
            <div className="text-slate-500">{apercu.deja.length} affectation(s) déjà en place, inchangées.</div>
          )}
          {apercu.absents.map(a => (
            <div key={a.c.cle + a.groupe} className="text-amber-800">
              <IconAlertTriangle size={13} className="inline -mt-0.5 mr-1" />
              <b>Groupe {a.groupe}{/^\d+$/.test(a.groupe) && lettre(Number(a.groupe)) ? ` (${lettre(Number(a.groupe))})` : ''}</b> n'existe pas dans les attributions de {a.c.cours_code}
              {a.c.activite_libelle ? ` · ${a.c.activite_libelle}` : ''} ({a.noms.length} étudiant{a.noms.length > 1 ? 's' : ''} en attente).
              Ajoutez la ligne d'attribution de ce groupe, puis réimportez.
            </div>
          ))}
          {apercu.sansGroupes.length > 0 && (
            <div className="text-amber-800">
              <IconAlertTriangle size={13} className="inline -mt-0.5 mr-1" />
              {apercu.sansGroupes.join(', ')} : aucune activité coupée en groupes dans les attributions — rien à placer.
            </div>
          )}
          {apercu.introuvables.length > 0 && (
            <details className="text-red-700">
              <summary className="cursor-pointer">
                <b>{apercu.introuvables.length}</b> étudiant(s) du classeur ne sont pas inscrits à l'UE {ueNum} en {annee}
                {' '}(PAE à compléter, ou nom/mail différent dans Lucie)
              </summary>
              <div className="mt-1 columns-2 md:columns-3 text-[12px]">
                {apercu.introuvables.map((l, i) => (
                  <div key={i}>{l.nom} {l.prenom} <span className="text-slate-400">· gr. {l.groupe}</span></div>
                ))}
              </div>
            </details>
          )}
          {apercu.horsClasseur.length > 0 && (
            <details className="text-slate-600">
              <summary className="cursor-pointer">
                {apercu.horsClasseur.length} inscrit(s) de l'UE {ueNum} absent(s) du classeur
              </summary>
              <div className="mt-1 columns-2 md:columns-3 text-[12px]">
                {apercu.horsClasseur.map(e => <div key={e.id}>{e.nom} {e.prenom}</div>)}
              </div>
            </details>
          )}
        </div>
      )}

      {ues && !ues.length && (
        <p className="text-sm text-slate-400">Aucune UE pour cette section en {annee}.</p>
      )}

      {data && (<>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un étudiant…"
            className="border border-gray-300 rounded-champ px-3 py-1.5 text-sm w-56" />
          {coches.size > 0 && (
            <span className="text-[12.5px] font-semibold text-iip-blue bg-iip-turquoise/10 border border-iip-turquoise/40 rounded-champ px-3 py-1.5 inline-flex items-center gap-2">
              {coches.size} coché(s) — cliquez l'en-tête d'un groupe pour les y placer
              <i className="not-italic font-normal text-slate-500">(la sélection reste : enchaînez 333.1·A, 333.2·B…)</i>
              <button onClick={() => setCoches(new Set())}
                className="underline font-normal text-slate-500">Tout décocher</button>
            </span>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-carte bg-white">
          <table className="w-full text-[12.5px]" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th rowSpan="2" className="text-left px-3 py-2 bg-slate-50 sticky left-0 min-w-[220px] border-b border-slate-200">
                  <input type="checkbox" className="mr-2 align-middle"
                    checked={etudiants.length > 0 && etudiants.every(e => coches.has(e.id))}
                    onChange={ev => setCoches(ev.target.checked ? new Set(etudiants.map(e => e.id)) : new Set())} />
                  Étudiant
                </th>
                {(data.cours || []).map(c => (
                  <th key={c.cle} colSpan={c.sans_groupe ? 1 : c.groupes.length}
                    className="px-2 py-1.5 bg-slate-50 border-b border-l-2 border-slate-200 text-iip-blue">
                    {c.cours_code} · {c.cours_nom}
                    {/* CE SONT LES ACTIVITÉS QUI SE COUPENT EN GROUPES : la
                        théorie avec tous, le laboratoire en huit groupes. */}
                    {c.activite_libelle && (
                      <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">
                        {c.activite_libelle}
                      </span>
                    )}
                    <span className="block text-[10px] font-normal text-slate-400">
                      {c.cours_per ? `${c.cours_per} pér.` : ''}
                      {c.sans_groupe ? ' · sans groupe'
                        : ` · ${c.groupes.length} groupes${c.plafond_groupe ? ` · plafond ${c.plafond_groupe}` : ''}`}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {(data.cours || []).map(c => c.sans_groupe ? (
                  <th key={c.cle} className="px-2 py-1 bg-slate-50 border-b border-l border-dashed border-slate-200 text-[10.5px] text-emerald-700">
                    Tous{c.groupes[0]?.professeurs ? <span className="block font-normal text-slate-400">{c.groupes[0].professeurs}</span> : null}
                  </th>
                ) : c.groupes.map(g => (
                  /* L'EN-TÊTE ENTIER PLACE LES COCHÉS : on sélectionne dix
                     noms, on clique 333.1·A, puis 333.2·B — la sélection
                     reste, le geste s'enchaîne. */
                  <th key={c.cle + cleGroupe(g)}
                    onClick={() => coches.size && placerCoches(c, g)}
                    title={coches.size
                      ? `Placer les ${coches.size} coché(s) dans ${etiquette(g)} — ${c.cours_nom}${c.activite_libelle ? ` · ${c.activite_libelle}` : ''}`
                      : ''}
                    className={`px-2 py-1 bg-slate-50 border-b border-l border-dashed border-slate-200 text-[10.5px] text-iip-turquoise-dark min-w-[92px]
                      ${coches.size ? 'cursor-pointer hover:bg-iip-turquoise/15 select-none' : ''}`}>
                    {etiquette(g)}
                    {coches.size > 0 && (
                      <span className="block text-[9.5px] font-bold text-iip-blue">⊕ placer {coches.size}</span>
                    )}
                    <span className="block font-normal text-slate-400">{g.professeurs || '—'}</span>
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {etudiants.map(e => {
                const manque = manquants(e);
                return (
                  <tr key={e.id} className={`border-b border-slate-100 ${manque ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-1.5 text-left sticky left-0 bg-inherit backdrop-blur">
                      <input type="checkbox" className="mr-2 align-middle" checked={coches.has(e.id)}
                        onChange={() => setCoches(s => {
                          const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n;
                        })} />
                      {e.nom} {e.prenom}
                      {e.num_organisation != null
                        ? <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-iip-light text-iip-blue">Org {e.num_organisation}</span>
                        : <span className="ml-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#B45309]">non réparti</span>}
                      {manque > 0 && (
                        <span className="block text-[10px] text-[#B45309]">
                          <IconAlertTriangle size={10} className="inline -mt-0.5" /> {manque} cours sans groupe
                        </span>
                      )}
                    </td>
                    {(data.cours || []).map(c => c.sans_groupe ? (
                      <td key={c.cle} className="text-center border-l border-dashed border-slate-100">
                        <span title="Cours sans groupe : suivi par tous les inscrits"
                          className="inline-block w-[15px] h-[15px] rounded bg-emerald-100 text-emerald-700 text-[10px] leading-[15px]">✓</span>
                      </td>
                    ) : c.groupes.map(g => {
                      const a = affect.get(cle(e.id, c.cle));
                      const ici = a && a.org === g.num_organisation && (a.groupe || null) === (g.groupe || null);
                      const enAttente = attente.has(cle(e.id, c.cle));
                      return (
                        <td key={c.cle + cleGroupe(g)} className="text-center border-l border-dashed border-slate-100">
                          <button onClick={() => cliquerCase(e, c, g)}
                            title={`${e.nom} ${e.prenom} — ${c.cours_nom}${c.activite_libelle ? ` · ${c.activite_libelle}` : ''} — ${etiquette(g)}`}
                            className={`inline-block w-[15px] h-[15px] rounded border align-middle
                              ${ici ? 'bg-iip-turquoise border-iip-turquoise text-white text-[10px] leading-[13px]'
                                : 'bg-white border-slate-300 hover:border-iip-turquoise'}
                              ${ici && enAttente ? 'ring-2 ring-iip-turquoise/30' : ''}`}>
                            {ici ? '✓' : ''}
                          </button>
                        </td>
                      );
                    }))}
                  </tr>
                );
              })}
              {!etudiants.length && (
                <tr><td colSpan="99" className="text-center text-slate-400 py-6">Aucun inscrit à cette unité.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-[11.5px] text-iip-blue">
                <td className="px-3 py-1.5 text-left sticky left-0 bg-slate-50">
                  Effectif par groupe
                  <span className="font-normal text-slate-400"> · {data.etudiants.length} inscrit{data.etudiants.length > 1 ? 's' : ''}</span>
                </td>
                {(data.cours || []).map(c => c.sans_groupe ? (
                  <td key={c.cle} className="text-center border-l border-dashed border-slate-200">{data.etudiants.length}</td>
                ) : c.groupes.map(g => {
                  const n = effectif(c, g);
                  const trop = c.plafond_groupe && n > c.plafond_groupe;
                  return (
                    <td key={c.cle + cleGroupe(g)}
                      title={trop ? `Au-dessus du plafond suggéré (${c.plafond_groupe})` : ''}
                      className={`text-center border-l border-dashed border-slate-200 ${trop ? 'text-[#B45309]' : ''}`}>
                      {n}{trop ? ' ⚠' : ''}
                    </td>
                  );
                }))}
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-[11.5px] text-slate-400">
          Une case par cours — ou par activité du cours (théorie, laboratoire…) quand ce sont
          elles qui se coupent en groupes — et par étudiant ; recocher la même case la retire. Cocher hors de
          l'organisation de délibération demande confirmation. Rien ne s'écrit avant « Enregistrer ».
        </p>
      </>)}
    </div>
  );
}

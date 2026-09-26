import { useEffect, useState } from 'react';
import { IconBooks, IconChevronLeft, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';

/**
 * MES COURS — la porte du professeur.
 *
 * Ses cours de l'année, tels que les attributions les lui donnent ; pour
 * chacun, la liste de SES étudiants (ses groupes quand la répartition
 * existe, tous les inscrits de l'unité sinon) et la saisie de ses notes.
 *
 * LA NOTE SAISIE ICI EST UNE PROPOSITION : elle n'entre pas au dossier — la
 * coordination la reprend dans l'encodage officiel. L'écran le dit, pour que
 * personne ne croie son travail terminé à sa place.
 */
export default function MesCours() {
  /* L'ANNÉE SE CHOISIT ICI (Charles, 26 septembre 2026 : « on a importé 61
     étudiants pour le stage B1 en 25-26, et ils sont 155 dans la liste de
     Véronique »). La porte montrait l'année de travail — 2026-2027 — sans
     rien pour en changer : les notes de l'année qui se termine étaient hors
     d'atteinte. Ce choix ne touche pas l'année de travail du reste de Lucie. */
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => (r.ok ? r.json() : []))
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code || a).filter(Boolean).sort().reverse()))
      .catch(() => {});
  }, []);
  const [cours, setCours] = useState(null);
  const [ouvert, setOuvert] = useState(null);      // cours_code
  const [feuille, setFeuille] = useState(null);    // { etudiants, ... }
  const [notes, setNotes] = useState({});          // etudiant_id → saisie
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [caseActive, setCaseActive] = useState(null);   // { id, k, r, ci } — la case que visent PP et NP

  useEffect(() => {
    fetch(`/api/mes-cours?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!ok) throw new Error(j.error || 'Erreur'); setCours(j.cours); })
      .catch(e => setErreur(e.message));
  }, [annee]);

  /* LA FEUILLE NOTE PAR ACQUIS, comme la feuille officielle : une colonne par
     AA du cours. Sans AA rattachés, une seule colonne — la note de cours
     (clé ''). */
  const colonnes = (f) => (f?.acquis?.length ? f.acquis.map(a => a.aa_code) : ['']);

  async function ouvrir(code) {
    setOuvert(code); setFeuille(null); setNotes({}); setFait(null); setErreur(null);
    try {
      const r = await fetch(`/api/mes-cours/${encodeURIComponent(code)}/etudiants?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erreur');
      setFeuille(j);
      const cols = colonnes(j);
      setNotes(Object.fromEntries(j.etudiants.map(e => [e.id,
        Object.fromEntries(cols.map(c => [c, (e.notes || {})[c] ?? '']))])));
    } catch (e) { setErreur(e.message); }
  }

  async function enregistrer() {
    setEnCours(true); setErreur(null); setFait(null);
    try {
      const lignes = [];
      for (const [id, par] of Object.entries(notes)) {
        for (const [aa, n] of Object.entries(par)) {
          lignes.push({ etudiant_id: Number(id), aa_code: aa, note: n });
        }
      }
      const r = await fetch(`/api/mes-cours/${encodeURIComponent(ouvert)}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ annee, notes: lignes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erreur');
      setFait(`${j.proposees} note(s) proposée(s) — la coordination les reprendra dans l'encodage officiel.`);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const c = (cours || []).find(x => x.cours_code === ouvert);

  return (
    /* L'ESPACE SERT (Jérôme, 24 septembre 2026 : « optimiser sur l'espace,
       valable partout »). Une colonne de 768 px au milieu de l'écran mettait
       le nom à un bout de la ligne et la note à l'autre, et renvoyait le
       bouton à la ligne. La page prend la largeur ; le tableau, lui, ne
       prend que celle qu'il lui faut. */
    <div className="px-4 py-3 md:px-6 space-y-2.5">
      <div className="flex items-center gap-2">
        <IconBooks size={20} className="text-iip-turquoise" />
        <h1 className="text-[17px] font-semibold text-iip-blue m-0">Mes cours</h1>
        <select value={annee} onChange={e => { setAnnee(e.target.value); setOuvert(null); setFeuille(null); }}
          title="L'année des cours affichés — sans changer l'année de travail du reste de Lucie"
          className="controle border border-slate-300 rounded-champ bg-white text-[13px] font-semibold">
          {(annees.length ? annees : [annee]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {erreur && (
        <div className="bg-red-50 border border-red-200 rounded-carte px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <IconAlertTriangle size={16} className="flex-none mt-0.5" />{erreur}
        </div>
      )}

      {!ouvert && cours && (() => {
        /* DEUX LISTES : mes cours, puis ceux de ma section (coordination —
           Charles, 26 septembre 2026). La seconde se lit par UNITÉ et se
           filtre : une section, ce sont des dizaines de cours. */
        const q = filtre.trim().toLowerCase();
        const garde = x => !q || `${x.cours_code} ${x.cours_nom || ''} ${x.ue_num} ${x.ue_nom || ''}`.toLowerCase().includes(q);
        const miens = cours.filter(x => x.a_moi !== false).filter(garde);
        const section = cours.filter(x => x.a_moi === false).filter(garde);
        const parUe = [];
        for (const x of section) {
          const g = parUe.find(y => y.ue_num === x.ue_num);
          if (g) g.cours.push(x); else parUe.push({ ue_num: x.ue_num, ue_nom: x.ue_nom, cours: [x] });
        }
        const carte = x => (
          <button key={x.cours_code} onClick={() => ouvrir(x.cours_code)}
            className="w-full text-left bg-white border border-slate-200 rounded-carte px-3 py-2 hover:border-iip-turquoise flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-iip-blue text-[13px]">{x.cours_code} · {x.cours_nom || ''}</div>
              <div className="text-[12px] text-slate-500 truncate">
                {x.a_moi === false ? (x.section || '') : <>UE {x.ue_num}{x.ue_nom ? ` — ${x.ue_nom}` : ''} · {x.groupes.join(' + ')}</>}
              </div>
            </div>
            <span className="flex-none text-[12px] font-semibold text-iip-turquoise-dark text-right">
              {x.nb_etudiants} étudiant{x.nb_etudiants > 1 ? 's' : ''}
              {!x.repartition && x.nb_etudiants > 0 && (
                <span className="block font-normal text-slate-400">toute l'unité</span>
              )}
            </span>
          </button>
        );
        const aSection = cours.some(x => x.a_moi === false);
        return (
          <div className="space-y-3">
            {aSection && (
              <input value={filtre} onChange={e => setFiltre(e.target.value)}
                placeholder="Chercher un cours ou une unité…"
                className="controle w-72 max-w-full border border-slate-300 rounded-champ bg-white" />
            )}
            {(miens.length > 0 || !aSection) && (
              <div className="space-y-1.5">
                {aSection && <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mes attributions</div>}
                <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {!cours.length && <p className="text-sm text-slate-400">Aucune attribution pour {annee}.</p>}
                  {miens.map(carte)}
                </div>
              </div>
            )}
            {parUe.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Les cours de ma section <span className="normal-case font-normal">— en tant que coordination</span>
                </div>
                {parUe.map(g => (
                  <div key={g.ue_num} className="space-y-1">
                    <div className="text-[12px] font-semibold text-iip-blue">UE {g.ue_num}{g.ue_nom ? ` — ${g.ue_nom}` : ''}</div>
                    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">{g.cours.map(carte)}</div>
                  </div>
                ))}
              </div>
            )}
            {q && !miens.length && !parUe.length && <p className="text-sm text-slate-400">Aucun cours ne correspond.</p>}
          </div>
        );
      })()}

      {ouvert && (() => {
        const cols = colonnes(feuille);
        const nEtu = feuille?.etudiants?.length || 0;
        const saisies = feuille ? feuille.etudiants.reduce((t, e) =>
          t + cols.filter(k => String(notes[e.id]?.[k] ?? '').trim() !== '').length, 0) : 0;
        const total = nEtu * cols.length;
        /* DES ENTIERS DE 0 À 20, OU PP, NP, CM (Charles, 26 septembre 2026). */
        const MENTIONS = ['PP', 'NP', 'CM'];
        const valeurOk = v => { const t = String(v ?? '').trim().toUpperCase();
          if (!t || MENTIONS.includes(t)) return true;
          return /^\d{1,2}$/.test(t) && Number(t) <= 20; };
        // La frappe elle-même est filtrée : chiffres, ou les lettres d'une mention.
        const saisieAdmise = v => { const t = String(v).toUpperCase();
          return t === '' || /^\d{1,2}$/.test(t) && Number(t) <= 20
            || MENTIONS.some(m => m.startsWith(t)); };
        const invalides = feuille ? feuille.etudiants.reduce((t, e) =>
          t + cols.filter(k => !valeurOk(notes[e.id]?.[k])).length, 0) : 0;
        /* LES FLÈCHES ET ENTRÉE, COMME DANS UN TABLEUR (Charles, 26 septembre
           2026 : « pour le moment ce sont des cases non liées »). Haut, bas et
           Entrée changent de ligne ; gauche et droite changent d'acquis. */
        const deplacer = (ev, r, k) => {
          const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[ev.key];
          if (!d) return;
          const cible = document.querySelector(`[data-case="${r + d[0]}:${k + d[1]}"]`);
          if (cible) { ev.preventDefault(); cible.focus(); cible.select?.(); }
        };
        const nomAA = (a, i) => `AA ${i + 1}`;
        /* LA NOTE DU COURS, CALCULÉE EN ENCODANT (Charles, 26 septembre 2026).
           Moyenne des acquis pondérée par leur poids dans le cours — le niveau 1
           du modèle de calcul : INDICATIVE, la note qui fait foi reste celle de
           l'encodage officiel. Une case vide n'est pas évaluée et sort du calcul ;
           PP et NP n'ont pas de valeur chiffrée et en sortent aussi. */
        const poidsDe = {};
        (feuille?.acquis || []).forEach(a => { poidsDe[a.aa_code] = Number(a.poids) > 0 ? Number(a.poids) : 1; });
        /* LES POIDS SE VOIENT (Charles, 26 septembre 2026 : « il faut qu'on voie
           les pondérations, sinon le prof va penser que c'est faux »). Dits en
           POURCENTAGE de la note du cours : c'est vrai quelle que soit l'année
           — points sur 10 depuis 2026-2027, % du classeur avant. Sans
           pondération réglée, les poids sont égaux, et l'écran le DIT. */
        const pondere = (feuille?.acquis || []).some(a => Number(a.poids) > 0);
        const sommePoids = cols.reduce((t, k) => t + (poidsDe[k] ?? 1), 0) || 1;
        const partDe = k => Math.round(((poidsDe[k] ?? 1) / sommePoids) * 100);
        const noteCours = id => {
          let s = 0, p = 0, mentions = 0;
          for (const k of cols) {
            const t = String(notes[id]?.[k] ?? '').trim().toUpperCase();
            if (!t) continue;
            if (MENTIONS.includes(t)) { mentions++; continue; }
            const n = Number(t.replace(',', '.'));
            if (!Number.isFinite(n) || n < 0 || n > 20) return { erreur: true };
            const w = cols.length > 1 ? (poidsDe[k] ?? 1) : 1;
            s += n * w; p += w;
          }
          return p ? { note: s / p, partielle: mentions > 0 } : { note: null, mentions };
        };
        /* PP ET NP AU BOUTON (Charles : « pour PP/NP je veux un bouton ») : ils
           se posent dans la case où l'on se trouve, et l'on passe à la ligne
           suivante — comme si on avait tapé la valeur puis Entrée. */
        const poserMention = m => {
          if (!caseActive) return;
          const { id, k, r, ci } = caseActive;
          setNotes(n => ({ ...n, [id]: { ...n[id], [k]: m } }));
          const suivante = document.querySelector(`[data-case="${r + 1}:${ci}"]`);
          if (suivante) { suivante.focus(); suivante.select?.(); }
        };
        return (
          <div className="space-y-3">
            {/* LE COURS DANS UNE TUILE (Charles, 26 septembre 2026). */}
            <div data-etat="fort" className="bloc-etat px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-0 flex-1">
                <button onClick={() => { setOuvert(null); setFeuille(null); }}
                  className="text-[12px] text-slate-500 hover:text-iip-blue inline-flex items-center gap-1">
                  <IconChevronLeft size={14} /> Mes cours
                  {c && <span className="text-slate-400">· UE {c.ue_num}{c.ue_nom ? ` — ${c.ue_nom}` : ''}</span>}
                </button>
                <div className="text-[15px] font-semibold leading-snug">{ouvert} · {c?.cours_nom || ''}</div>
                <div className="text-[12px] text-slate-500">
                  {feuille?.portee === 'coordination' ? 'Cours de votre section — en tant que coordination'
                    : (c?.groupes || []).join(' + ')} · {annee}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[17px] font-bold tabular-nums">{nEtu}</div>
                <div className="text-[11px] text-slate-500">étudiant{nEtu > 1 ? 's' : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-[17px] font-bold tabular-nums">{saisies} / {total}</div>
                <div className="text-[11px] text-slate-500">notes saisies</div>
                <div className="h-1.5 w-32 bg-slate-100 rounded-full overflow-hidden mt-1">
                  <div className="h-full" style={{ width: `${total ? (saisies / total) * 100 : 0}%`, background: 'var(--c-disponible)' }} />
                </div>
              </div>
            </div>

            {fait && <p className="text-[13px] m-0" style={{ color: 'var(--c-reussi)' }}>✓ {fait}</p>}
            {!feuille && !erreur && <p className="text-sm text-slate-400">Chargement…</p>}

            {feuille && (
              <div className="grid gap-3 items-start lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="carte overflow-x-auto">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 text-[12px] text-slate-500">
                    <span className="min-w-0 flex-1">
                      {caseActive ? <>Dans la case active :</> : <>Cliquez une case, puis :</>}
                    </span>
                    <button type="button" disabled={!caseActive} onMouseDown={ev => ev.preventDefault()}
                      onClick={() => poserMention('PP')} className="bouton h-7 px-2.5 disabled:opacity-40"
                      title="Pas présenté">PP · pas présenté</button>
                    <button type="button" disabled={!caseActive} onMouseDown={ev => ev.preventDefault()}
                      onClick={() => poserMention('NP')} className="bouton h-7 px-2.5 disabled:opacity-40"
                      title="Note de présence">NP · note de présence</button>
                    <button type="button" disabled={!caseActive} onMouseDown={ev => ev.preventDefault()}
                      onClick={() => poserMention('CM')} className="bouton h-7 px-2.5 disabled:opacity-40"
                      title="Certificat médical">CM · certificat médical</button>
                    <button type="button" disabled={!caseActive} onMouseDown={ev => ev.preventDefault()}
                      onClick={() => poserMention('')} className="bouton h-7 px-2.5 disabled:opacity-40">Effacer</button>
                  </div>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="tab-entete text-left">
                        <th className="py-1.5 px-3">Étudiant</th>
                        {feuille.repartition && <th className="py-1.5 pr-4">Groupe</th>}
                        {feuille.acquis?.length
                          ? feuille.acquis.map((a, i) => (
                              <th key={a.aa_code} className="py-1.5 px-1 w-20 text-center" title={`${a.aa_code} — ${a.description || ''}`}>
                                {nomAA(a, i)}
                                <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-500">{partDe(a.aa_code)} %</span>
                              </th>
                            ))
                          : <th className="py-1.5 px-1 w-20 text-center">Note /20</th>}
                        {cols.length > 1 && (
                          <th className="py-1.5 px-2 w-20 text-center" title="Moyenne des acquis pondérée par leur poids dans le cours — indicative">Cours</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {feuille.etudiants.map((e, r) => (
                        <tr key={e.id} className="border-t border-slate-100 bg-white">
                          <td className="py-0.5 px-3 whitespace-nowrap"><b>{(e.nom || '').toUpperCase()}</b> {e.prenom}
                            <span className="text-slate-400 text-[11px]"> · {e.id_ecampus || '—'}</span></td>
                          {feuille.repartition && (
                            <td className="py-0.5 pr-4 text-[12px] text-slate-500 whitespace-nowrap">{e.groupe}</td>
                          )}
                          {cols.map((k, ci) => {
                            const v = notes[e.id]?.[k] ?? '';
                            const ok = valeurOk(v);
                            const t = String(v).trim().toUpperCase();
                            return (
                              <td key={k} className="py-0.5 px-1 text-center whitespace-nowrap">
                                <input value={v} data-case={`${r}:${ci}`} inputMode="numeric" maxLength={2}
                                  onKeyDown={ev => deplacer(ev, r, ci)}
                                  onFocus={ev => { ev.target.select(); setCaseActive({ id: e.id, k, r, ci }); }}
                                  onChange={ev => { const val = ev.target.value.toUpperCase();
                                    if (saisieAdmise(val)) setNotes(n => ({ ...n, [e.id]: { ...n[e.id], [k]: val } })); }}
                                  title={t === 'PP' ? 'Pas présenté' : t === 'NP' ? 'Note de présence' : t === 'CM' ? 'Certificat médical' : undefined}
                                  className={`w-16 h-7 border rounded-champ px-1 text-[13px] text-center tabular-nums
                                    ${!ok ? 'border-[#C2412D] bg-[#FBEDEA]'
                                      : MENTIONS.includes(t) ? 'border-slate-300 bg-slate-100 font-semibold text-slate-600'
                                      : v !== '' ? 'border-[#C3D6EE] bg-[#EAF1FA]' : 'border-slate-300 bg-white'}`} />
                                {/* « /20 » : l'échelle se lit à côté de chaque note (Charles). */}
                                <span className="ml-0.5 text-[10px] text-slate-400">/20</span>
                              </td>
                            );
                          })}
                          {cols.length > 1 && (() => {
                            const nc = noteCours(e.id);
                            return (
                              <td className="py-0.5 px-2 text-center tabular-nums font-semibold whitespace-nowrap">
                                {nc.erreur ? <span className="text-slate-300">—</span>
                                  : nc.note != null
                                    ? <span title={nc.partielle ? 'Calculée sans les acquis marqués PP, NP ou CM' : 'Indicative : moyenne pondérée des acquis'}
                                        style={{ color: nc.note < 10 ? 'var(--c-refuse)' : 'var(--c-reussi)' }}>
                                        {nc.note.toFixed(1).replace('.', ',')}{nc.partielle ? '*' : ''}
                                      </span>
                                    : nc.mentions ? <span className="text-slate-400 text-[12px]">—</span>
                                    : <span className="text-slate-300">·</span>}
                              </td>
                            );
                          })()}
                        </tr>
                      ))}
                      {!feuille.etudiants.length && (
                        <tr><td colSpan={3 + cols.length} className="py-4 text-center text-slate-400">
                          Aucun étudiant — la répartition de ce cours ne vous en attribue pas encore.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* CE QUE L'ON ÉVALUE, À CÔTÉ DE LA SAISIE : l'en-tête « AA 1 »
                    ne dit rien seul, et la bulle au survol ne se lit pas en
                    tapant des notes. */}
                <div className="carte px-3 py-2.5 space-y-2.5 lg:sticky lg:top-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ce que vous évaluez</div>
                  {cols.length > 1 && !pondere && (
                    <div data-etat="surveiller" className="bloc-etat px-2 py-1.5 text-[11.5px]">
                      La pondération de ce cours n'est pas encore réglée : les acquis pèsent autant l'un que l'autre
                      dans la note du cours. Elle se règle dans Organisation → Pondérations.
                    </div>
                  )}
                  {feuille.acquis?.length ? feuille.acquis.map((a, i) => {
                    const n = feuille.etudiants.filter(e => String(notes[e.id]?.[a.aa_code] ?? '').trim() !== '').length;
                    return (
                      <div key={a.aa_code} className="pl-2 border-l-[3px]" style={{ borderLeftColor: 'var(--c-disponible)' }}>
                        <div className="text-[12.5px] font-semibold">{nomAA(a, i)} <span className="font-normal text-slate-400">· {a.aa_code}</span></div>
                        <div className="text-[12px] text-slate-600 leading-snug">{a.description || '—'}</div>
                        <div className="text-[11px] text-slate-400">
                          <b className="text-slate-600">{partDe(a.aa_code)} % de la note du cours</b>
                          {a.poids != null && Number(a.poids) > 0 ? ` (${String(a.poids).replace('.', ',')} sur ${String(Math.round(sommePoids * 10) / 10).replace('.', ',')})` : ''}
                          {' · '}{n} note{n > 1 ? 's' : ''} sur {nEtu}
                        </div>
                      </div>
                    );
                  }) : <div className="text-[12px] text-slate-600">Aucun acquis rattaché à ce cours : une note de cours, sur 20.</div>}
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2 leading-snug">
                    Une note entière sur 20 par acquis (0 à 20). <b>PP</b> : pas présenté. <b>NP</b> : note de présence. <b>CM</b> : certificat médical.
                    Une case vide n'est pas évaluée — elle ne compte pas comme zéro.
                    La colonne « Cours » est la moyenne pondérée des acquis, indicative ; * : sans les PP, NP et CM.
                    Les flèches et Entrée passent d'une case à l'autre.
                  </div>
                </div>
              </div>
            )}

            {feuille && (
              <div className="flex items-center gap-3 justify-end border-t border-slate-200 pt-2">
                <span className="text-[12px] text-slate-500 min-w-0 flex-1">
                  {invalides ? <span style={{ color: '#C2412D' }}>{invalides} case{invalides > 1 ? 's' : ''} à corriger : un nombre entier de 0 à 20, PP, NP ou CM.</span>
                    : 'Vos notes sont des propositions : la coordination les reprend dans l’encodage officiel.'}
                </span>
                <button onClick={enregistrer} disabled={enCours || !!invalides}
                  className="bouton-fort controle px-3 disabled:opacity-40">
                  {enCours ? 'Enregistrement…' : 'Enregistrer mes propositions'}
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

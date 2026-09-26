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
  const annee = getAnnee();
  const [cours, setCours] = useState(null);
  const [ouvert, setOuvert] = useState(null);      // cours_code
  const [feuille, setFeuille] = useState(null);    // { etudiants, ... }
  const [notes, setNotes] = useState({});          // etudiant_id → saisie
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [filtre, setFiltre] = useState('');

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
        <span className="text-[11.5px] font-bold text-iip-blue bg-iip-light rounded-full px-3 py-1">{annee}</span>
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

      {ouvert && (
        <div className="bg-white border border-slate-200 rounded-carte px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { setOuvert(null); setFeuille(null); }}
              className="text-[13px] text-iip-blue inline-flex items-center gap-1">
              <IconChevronLeft size={15} /> Mes cours
            </button>
            <b className="text-[14.5px] text-iip-blue">{ouvert} · {c?.cours_nom || ''}</b>
            {/* L'explication tient sur une ligne ; le détail, au survol. */}
            <span className="text-[12px] text-slate-500"
              title="Vos notes sont des propositions : elles n'entrent pas au dossier de l'étudiant — la coordination les reprend dans l'encodage officiel. Une note vidée retire la proposition. Décimales admises.">
              · {feuille?.acquis?.length ? <>une note <b>par acquis</b>, sur 20</> : <>une note de cours, sur 20</>}
              {' '}— <b>propositions</b>, reprises par la coordination <span className="text-slate-400">ⓘ</span>
            </span>
            <button onClick={enregistrer} disabled={enCours || !feuille}
              className="ml-auto px-3 py-1 text-[13px] font-semibold rounded-champ bg-iip-blue text-white disabled:opacity-40">
              {enCours ? 'Enregistrement…' : 'Proposer mes notes'}
            </button>
          </div>

          {fait && <p className="text-[13px] text-emerald-700 m-0">✓ {fait}</p>}
          {!feuille && !erreur && <p className="text-sm text-slate-400">Chargement…</p>}

          {feuille && (
            <div className="overflow-x-auto">
            <table className="w-auto text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase text-slate-400 text-left border-b border-slate-200">
                  <th className="py-1 pr-8">Étudiant</th>
                  {feuille.repartition && <th className="py-1 pr-4">Groupe</th>}
                  {feuille.acquis?.length
                    ? feuille.acquis.map(a => (
                        <th key={a.aa_code} className="py-1 px-1 w-16 text-center"
                          title={a.description || a.aa_code}>
                          {a.aa_code}
                        </th>
                      ))
                    : <th className="py-1 px-1 w-16 text-center">/20</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {feuille.etudiants.map(e => (
                  <tr key={e.id}>
                    <td className="py-0.5 pr-8 whitespace-nowrap"><b>{(e.nom || '').toUpperCase()}</b> {e.prenom}
                      <span className="text-slate-400 text-[11.5px]"> · {e.id_ecampus || '—'}</span></td>
                    {feuille.repartition && (
                      <td className="py-0.5 pr-4 text-[12px] text-iip-turquoise-dark whitespace-nowrap">{e.groupe}</td>
                    )}
                    {colonnes(feuille).map(c => (
                      <td key={c} className="py-0.5 px-1 text-center">
                        <input value={notes[e.id]?.[c] ?? ''} inputMode="decimal"
                          onChange={ev => setNotes(n => ({ ...n,
                            [e.id]: { ...n[e.id], [c]: ev.target.value } }))}
                          className="w-14 h-7 border border-slate-300 rounded-champ px-1 text-[13px] text-center tabular-nums" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!feuille.etudiants.length && (
                  <tr><td colSpan={2 + colonnes(feuille).length} className="py-4 text-center text-slate-400">
                    Aucun étudiant — la répartition de ce cours ne vous en attribue pas encore.
                  </td></tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

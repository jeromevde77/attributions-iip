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
    <div className="max-w-3xl mx-auto p-4 space-y-3">
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

      {!ouvert && cours && (
        <div className="space-y-2">
          {!cours.length && (
            <p className="text-sm text-slate-400">Aucune attribution pour {annee}.</p>
          )}
          {cours.map(x => (
            <button key={x.cours_code} onClick={() => ouvrir(x.cours_code)}
              className="w-full text-left bg-white border border-slate-200 rounded-carte px-4 py-3 hover:border-iip-turquoise flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-iip-blue text-[14px]">
                  {x.cours_code} · {x.cours_nom || ''}</div>
                <div className="text-[12px] text-slate-500">
                  UE {x.ue_num}{x.ue_nom ? ` — ${x.ue_nom}` : ''} · {x.groupes.join(' + ')}
                </div>
              </div>
              <span className="flex-none text-[12px] font-semibold text-iip-turquoise-dark">
                {x.nb_etudiants} étudiant{x.nb_etudiants > 1 ? 's' : ''}
                {!x.repartition && x.nb_etudiants > 0 && (
                  <span className="block font-normal text-slate-400">toute l'unité</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {ouvert && (
        <div className="bg-white border border-slate-200 rounded-carte p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { setOuvert(null); setFeuille(null); }}
              className="text-[13px] text-iip-blue inline-flex items-center gap-1">
              <IconChevronLeft size={15} /> Mes cours
            </button>
            <b className="text-[14.5px] text-iip-blue">{ouvert} · {c?.cours_nom || ''}</b>
            <button onClick={enregistrer} disabled={enCours || !feuille}
              className="ml-auto px-4 py-1.5 text-[13px] font-semibold rounded-champ bg-iip-blue text-white disabled:opacity-40">
              {enCours ? 'Enregistrement…' : 'Proposer mes notes'}
            </button>
          </div>

          <p className="text-[12px] text-slate-500 bg-iip-light/60 rounded-champ px-3 py-2 m-0">
            {feuille?.acquis?.length
              ? <>Une note <b>par acquis d'apprentissage</b>, sur 20 — comme la feuille
                  officielle. </>
              : <>Ce cours n'a pas d'acquis rattachés dans le référentiel : une note de
                  cours, sur 20. </>}
            Vos notes sont des <b>propositions</b> : elles n'entrent pas au dossier de
            l'étudiant — la coordination les reprend dans l'encodage officiel. Une note
            vidée retire la proposition. Décimales admises.
          </p>

          {fait && <p className="text-[13px] text-emerald-700 m-0">✓ {fait}</p>}
          {!feuille && !erreur && <p className="text-sm text-slate-400">Chargement…</p>}

          {feuille && (
            <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase text-slate-400 text-left border-b border-slate-200">
                  <th className="py-1.5">Étudiant</th>
                  {feuille.repartition && <th className="py-1.5">Groupe</th>}
                  {feuille.acquis?.length
                    ? feuille.acquis.map(a => (
                        <th key={a.aa_code} className="py-1.5 w-24 text-center"
                          title={a.description || a.aa_code}>
                          {a.aa_code}
                        </th>
                      ))
                    : <th className="py-1.5 w-24">Note /20</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {feuille.etudiants.map(e => (
                  <tr key={e.id}>
                    <td className="py-1.5"><b>{(e.nom || '').toUpperCase()}</b> {e.prenom}
                      <span className="text-slate-400 text-[11.5px]"> · {e.id_ecampus || '—'}</span></td>
                    {feuille.repartition && (
                      <td className="py-1.5 text-[12px] text-iip-turquoise-dark">{e.groupe}</td>
                    )}
                    {colonnes(feuille).map(c => (
                      <td key={c} className="py-1.5 text-center">
                        <input value={notes[e.id]?.[c] ?? ''} inputMode="decimal"
                          onChange={ev => setNotes(n => ({ ...n,
                            [e.id]: { ...n[e.id], [c]: ev.target.value } }))}
                          className="w-16 border border-slate-300 rounded-champ px-1.5 py-1 text-[13px] text-center tabular-nums" />
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

import { useEffect, useRef, useState } from 'react';
import { IconSitemap, IconFileText, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * PLACER LES ÉTUDIANTS DANS LEUR SECTION — d'après le rapport eCampus « Pack UF ».
 *
 * Demandé par Charles le 21 septembre 2026 : « sais-tu te servir de mon
 * document Word pour placer les étudiants sans section dans une section ? ».
 * Le rapport dit de quel PACK est chaque matricule ; on dit, une fois par
 * pack, de quelle SECTION il est. Lucie propose ce qu'elle reconnaît
 * (« Bachelier 1 en Psychomotricité » → Psychomotricité) et ne devine rien
 * d'autre : « B1 - Opto-Ortho » se tranche à la main.
 *
 * Seuls les étudiants SANS section sont placés. Un rattachement existant a été
 * décidé par quelqu'un : s'il diffère du rapport, on le montre, on n'y touche
 * pas.
 */
export default function RattacherPack({ onClose, onTermine }) {
  const [sections, setSections] = useState([]);
  const [fichier, setFichier] = useState(null);
  const [packs, setPacks] = useState(null);
  const [corresp, setCorresp] = useState({});
  const [rapport, setRapport] = useState(null);
  const [simuleSur, setSimuleSur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const entree = useRef(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setSections(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const cle = JSON.stringify(corresp);
  const simule = rapport?.etape === 'simulation' && simuleSur === cle;
  const fait = rapport?.etape === 'ecriture';

  // Même règle que partout : l'en-tête JSON d'authHeaders() ne doit pas
  // partir avec un fichier — c'est le navigateur qui écrit le multipart.
  async function envoyer(f, extra) {
    const fd = new FormData();
    fd.append('fichier', f);
    for (const [k, v] of Object.entries(extra || {})) fd.append(k, v);
    const { 'Content-Type': _json, ...entetes } = authHeaders();
    const r = await fetch('/api/etudiants/rattacher-pack', { method: 'POST', headers: entetes, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Refusé.');
    return j;
  }

  async function analyser(f) {
    if (!f) return;
    setEnCours(true); setErreur(null); setRapport(null); setPacks(null);
    try {
      const j = await envoyer(f);
      setFichier(f); setPacks(j.packs);
      setCorresp(Object.fromEntries(j.packs.map(p => [p.libelle, p.section_proposee || ''])));
    } catch (e) { setErreur(e.message); setFichier(null); }
    finally { setEnCours(false); }
  }

  async function lancer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const j = await envoyer(fichier, { correspondances: JSON.stringify(corresp), simulation: String(simulation) });
      setRapport(j);
      if (simulation) setSimuleSur(cle); else onTermine?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const libSection = code => sections.find(s0 => s0.code === code)?.libelle || code;

  return (
    <Fenetre icone={IconSitemap} large="grande" onFermer={onClose}
      titre="Placer les étudiants dans leur section"
      sous="D’après le rapport eCampus « Pack UF » (Word) — seuls les étudiants sans section sont placés"
      pied={<>
        {!fait && (
          <>
            <button className="bouton disabled:opacity-40" disabled={!packs || enCours} onClick={() => lancer(true)}>
              Simuler
            </button>
            <button className="bouton bouton-fort disabled:opacity-40" disabled={!simule || enCours || !rapport.nb_a_placer}
              onClick={() => lancer(false)}>
              {simule ? `Placer ${rapport.nb_a_placer} étudiant(s)` : 'Placer'}
            </button>
          </>
        )}
        <span className="text-[12px] text-slate-500 min-w-0">
          {fait ? `Fait : ${rapport.nb_a_placer} étudiant(s) placé(s).`
            : !packs ? 'Choisissez le rapport Pack UF.'
              : !simule ? 'Vérifiez les sections, puis simulez : rien ne s’écrit avant.'
                : !rapport.nb_a_placer ? 'Personne à placer.' : null}
        </span>
        <button className="bouton ml-auto" onClick={onClose}>{fait ? 'Fermer' : 'Annuler'}</button>
      </>}>
      <div className="space-y-3">
        {erreur && (
          <div className="carte p-3 text-[12px] text-rose-700 flex items-start gap-1.5">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button className="bouton" disabled={enCours || fait} onClick={() => entree.current?.click()}>
            <IconFileText size={15} className="inline -mt-0.5 mr-1" />
            {fichier ? 'Autre rapport' : 'Choisir le rapport (.docx)'}
          </button>
          <input ref={entree} type="file" accept=".docx" className="hidden"
            onChange={e => { analyser(e.target.files?.[0]); e.target.value = ''; }} />
          {fichier && <span className="text-[12px] text-slate-500">« {fichier.name} »</span>}
        </div>

        {packs && (
          <div className="carte overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="tab-entete text-left">
                  <th className="px-3 py-1.5">Pack eCampus</th>
                  <th className="px-3 py-1.5 w-24">Étudiants</th>
                  <th className="px-3 py-1.5 w-72">Section dans Lucie</th>
                </tr>
              </thead>
              <tbody>
                {packs.map(p => (
                  <tr key={p.libelle} className="border-t border-slate-100 bg-white">
                    <td className="px-3 py-1.5">
                      {p.libelle}
                      <div className="text-[11px] text-slate-400">{p.unites.join(' · ')}</div>
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">{p.etudiants}</td>
                    <td className="px-3 py-1.5">
                      <select value={corresp[p.libelle] || ''} disabled={fait}
                        onChange={e => setCorresp(c => ({ ...c, [p.libelle]: e.target.value }))}
                        className="controle text-[13px] w-full">
                        <option value="">— ne pas placer —</option>
                        {sections.map(s0 => <option key={s0.code} value={s0.code}>{s0.libelle || s0.code}</option>)}
                      </select>
                      {!p.section_proposee && !corresp[p.libelle] && (
                        <div className="text-[11px] text-[#B45309] mt-0.5">Lucie ne sait pas : à choisir.</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rapport && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              {rapport.etape === 'simulation' ? 'Simulation — rien n’a été écrit' : 'Effectué'}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[[rapport.nb_a_placer, rapport.etape === 'simulation' ? 'à placer' : 'placés', '#1B2B4B'],
                [rapport.deja_meme, 'déjà dans cette section', null],
                [rapport.deja_autre.length, 'dans une autre section', rapport.deja_autre.length ? '#B45309' : null],
                [rapport.introuvables.length, 'introuvables dans Lucie', rapport.introuvables.length ? '#B45309' : null],
              ].map(([n, lib, rail]) => (
                <div key={lib} className="rounded-carte border border-slate-200 bg-white px-3 py-2"
                  style={{ borderLeftWidth: 3, borderLeftColor: rail || 'transparent' }}>
                  <div className="text-[17px] font-semibold tabular-nums">{n}</div>
                  <div className="text-[11px] text-slate-500">{lib}</div>
                </div>
              ))}
            </div>
            {Object.keys(rapport.par_section).length > 0 && (
              <div className="text-[12px] text-slate-600">
                {Object.entries(rapport.par_section).map(([c, n]) => `${libSection(c)} : ${n}`).join(' · ')}
              </div>
            )}
            {rapport.deja_autre.length > 0 && (
              <details className="text-[12px]">
                <summary className="cursor-pointer text-slate-600">
                  Dans une autre section que celle du rapport ({rapport.deja_autre.length}) — non modifiés
                </summary>
                <div className="mt-1 max-h-40 overflow-auto">
                  {rapport.deja_autre.map(x => (
                    <div key={x.matricule}>{x.qui} ({x.matricule}) : {libSection(x.actuelle)} dans Lucie, {x.pack} dans le rapport</div>
                  ))}
                </div>
              </details>
            )}
            {rapport.introuvables.length > 0 && (
              <details className="text-[12px]">
                <summary className="cursor-pointer text-slate-600">
                  Introuvables dans Lucie ({rapport.introuvables.length}) — à créer d’abord
                </summary>
                <div className="mt-1 max-h-40 overflow-auto">
                  {rapport.introuvables.map(x => <div key={x.matricule}>{x.nom} ({x.matricule}) — {x.pack}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </Fenetre>
  );
}

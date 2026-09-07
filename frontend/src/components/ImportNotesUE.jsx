import { useEffect, useMemo, useState } from 'react';
import {
  IconX, IconUpload, IconAlertTriangle, IconCheck, IconFileSpreadsheet, IconWand,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * IMPORTER LES NOTES D'UNE UNITÉ, COLONNE PAR COLONNE.
 *
 * Les notes existent déjà, dans un classeur. Les retaper — quarante-huit
 * étudiants et trois cotes chacun pour la seule UE 282 — c'est cent cinquante
 * saisies pour des chiffres qu'on possède.
 *
 * Mais aucun classeur ne ressemble au suivant : l'un tient une note par acquis,
 * l'autre une colonne par couple cours-acquis, et les en-têtes répètent le même
 * code d'acquis autant de fois qu'il est évalué de cours. Deviner mène à
 * l'erreur silencieuse — une note rangée sous le mauvais cours ne se voit
 * nulle part.
 *
 * L'écran part donc de LUCIE, non du fichier : il énumère les couples
 * cours-acquis de l'unité, tels que la pondération les établit, et demande pour
 * chacun la colonne qui le porte. Une proposition automatique dégrossit le
 * travail ; c'est l'œil qui tranche.
 *
 * Rien n'est écrit avant qu'une simulation n'ait montré ce qui sera fait.
 */
export default function ImportNotesUE({ ueNum, annee, onClose, onImporte }) {
  const [structure, setStructure] = useState(null);  // les couples attendus par Lucie
  const [classeur, setClasseur] = useState(null);    // { nom, feuilles, XLSX, wb }
  const [feuille, setFeuille] = useState('');
  const [matrice, setMatrice] = useState(null);      // le tableau brut de la feuille
  const [ligneEntete, setLigneEntete] = useState(0);
  const [session, setSession] = useState(1);
  const [bareme, setBareme] = useState(20);
  const [arrondi, setArrondi] = useState(true);
  const [ident, setIdent] = useState({ matricule: -1, nom: -1, prenom: -1 });
  const [assoc, setAssoc] = useState({});            // « cours|aa » → index de colonne
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const net = v => String(v ?? '').replace(/ /g, ' ').trim();
  const col = i => {
    let s = '', n = i + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m) / 26); }
    return s;
  };

  // ── Ce que Lucie attend ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const rep = await fetch(`/api/acquis/ue/${ueNum}/feuille`
          + `?annee=${encodeURIComponent(annee)}&session=1`, { headers: authHeaders() });
        const j = await rep.json();
        if (!rep.ok) throw new Error(j.error);
        setStructure(j);
      } catch (e) { setErreur(e.message); }
    })();
  }, [ueNum, annee]);

  const couples = useMemo(() => (structure?.cours || []).flatMap(c =>
    (c.acquis || []).map(a => ({ cle: `${c.cours_code}|${a.aa_code}`, cours: c, aa: a }))),
  [structure]);

  // ── Le fichier ─────────────────────────────────────────────────────────────
  async function lireFichier(f) {
    setErreur(null); setEnCours(true); setRapport(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      setClasseur({ nom: f.name, feuilles: wb.SheetNames, XLSX, wb });
      const nom = wb.SheetNames.find(n => net(n) === String(ueNum)) || wb.SheetNames[0];
      setFeuille(nom);
      ouvrirFeuille(wb, XLSX, nom);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  function ouvrirFeuille(wb, XLSX, nom) {
    const M = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: null });
    setMatrice(M);
    // La ligne d'en-tête : la première qui nomme un matricule ou un acquis.
    let r0 = 0;
    for (let r = 0; r < Math.min(M.length, 30); r++) {
      const L = (M[r] || []).map(net);
      if (L.some(v => /matricule/i.test(v)) || L.some(v => /^AA\s*\d/i.test(v))) { r0 = r; break; }
    }
    setLigneEntete(r0);
    proposer(M, r0);
  }

  /**
   * LA PROPOSITION.
   *
   * Les en-têtes répètent le code d'acquis autant de fois qu'il y a de cours
   * qui l'évaluent : « AA282.1 · AA282.1 · AA282.2 ». On distribue donc les
   * colonnes d'un même code sur ses couples, dans l'ordre. Et si le classeur
   * porte deux séries — sur cent puis sur vingt —, on retient la DERNIÈRE :
   * c'est la cotation définitive qui vient en fin de tableau.
   */
  function proposer(M, r0, listeCouples = couples) {
    const L = (M[r0] || []).map(net);
    const suivant = { matricule: -1, nom: -1, prenom: -1 };
    L.forEach((v, i) => {
      if (suivant.matricule < 0 && /matricule/i.test(v)) suivant.matricule = i;
      if (suivant.nom < 0 && /^nom$/i.test(v)) suivant.nom = i;
      if (suivant.prenom < 0 && /^pr[ée]nom$/i.test(v)) suivant.prenom = i;
    });
    setIdent(suivant);

    const parCode = {};
    L.forEach((v, i) => {
      const c = v.replace(/\s+/g, '').toUpperCase();
      if (/^AA\d/.test(c)) (parCode[c] ||= []).push(i);
    });
    const a = {}, compte = {};
    for (const cp of listeCouples) {
      const code = String(cp.aa.aa_code).replace(/\s+/g, '').toUpperCase();
      const cols = parCode[code] || [];
      if (!cols.length) continue;
      const parts = listeCouples.filter(x =>
        String(x.aa.aa_code).replace(/\s+/g, '').toUpperCase() === code).length;
      const depart = Math.max(0, cols.length - parts);
      const k = compte[code] = (compte[code] ?? -1) + 1;
      if (cols[depart + k] != null) a[cp.cle] = cols[depart + k];
    }
    setAssoc(a);

    // Un barème sur cent se voit : des valeurs au-dessus de vingt.
    const cols = Object.values(a);
    let grand = 0, total = 0;
    for (let r = r0 + 1; r < Math.min(M.length, r0 + 30); r++) {
      for (const c of cols) {
        const v = Number((M[r] || [])[c]);
        if (Number.isFinite(v)) { total++; if (v > 20) grand++; }
      }
    }
    setBareme(total && grand / total > 0.1 ? 100 : 20);
  }

  // La structure arrive parfois après le fichier : on repropose alors.
  useEffect(() => {
    if (matrice && couples.length && !Object.keys(assoc).length) proposer(matrice, ligneEntete);
  }, [couples.length]);

  // ── Les lignes à envoyer ───────────────────────────────────────────────────
  const lignes = useMemo(() => {
    if (!matrice) return [];
    const out = [];
    for (let r = ligneEntete + 1; r < matrice.length; r++) {
      const L = matrice[r] || [];
      const matricule = ident.matricule >= 0 ? net(L[ident.matricule]) : '';
      const nom = ident.nom >= 0 ? net(L[ident.nom]) : '';
      const prenom = ident.prenom >= 0 ? net(L[ident.prenom]) : '';
      if (!matricule && !nom) continue;
      const notes = [];
      for (const cp of couples) {
        const c = assoc[cp.cle];
        if (c == null) continue;
        const v = L[c];
        if (v === null || v === '' || v === undefined) continue;
        notes.push({ cours_code: cp.cours.cours_code, aa_code: cp.aa.aa_code, valeur: v });
      }
      out.push({ matricule, nom, prenom, notes });
    }
    return out;
  }, [matrice, ligneEntete, ident, assoc, couples]);

  async function envoyer(simulation) {
    if (!lignes.length) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/notes/importer`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, arrondi, bareme, simulation, lignes }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setRapport(j);
      if (!simulation) onImporte?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  // Les colonnes proposées au choix : lettre, en-tête, premier échantillon.
  const optionsColonnes = useMemo(() => {
    if (!matrice) return [];
    const L = matrice[ligneEntete] || [];
    const ex = matrice[ligneEntete + 1] || [];
    const n = Math.max(L.length, ex.length);
    return Array.from({ length: n }, (_, i) => ({
      i,
      libelle: `${col(i)} · ${net(L[i]) || '(sans titre)'}`
        + (ex[i] != null && ex[i] !== '' ? ` · ex. ${net(ex[i])}` : ''),
    }));
  }, [matrice, ligneEntete]);

  const associees = Object.keys(assoc).length;
  const doublons = useMemo(() => {
    const vus = {}, out = [];
    for (const [cle, c] of Object.entries(assoc)) {
      if (vus[c]) out.push(cle); else vus[c] = cle;
    }
    return out;
  }, [assoc]);

  const Sel = ({ valeur, onChange }) => (
    <select value={valeur ?? -1} onChange={e => onChange(Number(e.target.value))}
      className="w-full text-[11.5px] border border-slate-300 rounded px-1.5 py-1 bg-white">
      <option value={-1}>— aucune —</option>
      {optionsColonnes.map(o => <option key={o.i} value={o.i}>{o.libelle}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue flex items-center gap-2">
              <IconFileSpreadsheet size={17} className="text-iip-turquoise" />
              Importer les notes — UE {ueNum}
            </h3>
            <p className="text-[12px] text-slate-500">
              {structure?.ue?.ue_nom ? `${structure.ue.ue_nom} · ` : ''}
              {couples.length} cote(s) attendue(s) · {annee}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12px] text-red-800 flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
            </div>
          )}

          {structure && !couples.length && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                            text-[12px] text-amber-900">
              Aucun acquis n'est rattaché aux cours de cette unité : reliez-les d'abord
              dans le paramétrage, sinon il n'y a nulle part où ranger les notes.
            </div>
          )}

          <label className="flex items-center gap-3 border-2 border-dashed border-iip-turquoise/30
                            rounded-lg p-3.5 cursor-pointer hover:border-iip-turquoise/60">
            <IconUpload size={20} className="text-iip-turquoise flex-none" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-iip-blue truncate">
                {classeur ? classeur.nom : 'Cliquer pour choisir le classeur'}
              </div>
              <div className="text-[11px] text-slate-400">
                Matricule, nom, prénom, puis une colonne par cote (.xlsx, .xlsm)
              </div>
            </div>
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv" className="sr-only"
              onChange={e => e.target.files[0] && lireFichier(e.target.files[0])} />
          </label>

          {classeur && matrice && (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Feuille</span>
                  <select value={feuille}
                    onChange={e => {
                      setFeuille(e.target.value); setRapport(null);
                      ouvrirFeuille(classeur.wb, classeur.XLSX, e.target.value);
                    }}
                    className="w-full text-[12px] border border-slate-300 rounded-lg px-2 py-1.5">
                    {classeur.feuilles.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Ligne d'en-tête</span>
                  <input type="number" min="1" value={ligneEntete + 1}
                    onChange={e => {
                      const r = Math.max(0, Number(e.target.value) - 1);
                      setLigneEntete(r); setRapport(null); proposer(matrice, r);
                    }}
                    className="w-full text-[12px] border border-slate-300 rounded-lg px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Session</span>
                  <select value={session}
                    onChange={e => { setSession(Number(e.target.value)); setRapport(null); }}
                    className="w-full text-[12px] border border-slate-300 rounded-lg px-2 py-1.5">
                    <option value={1}>1re session</option>
                    <option value={2}>2e session</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Barème</span>
                  <select value={bareme}
                    onChange={e => { setBareme(Number(e.target.value)); setRapport(null); }}
                    className="w-full text-[12px] border border-slate-300 rounded-lg px-2 py-1.5">
                    <option value={20}>Sur 20</option>
                    <option value={100}>Sur 100 (÷ 5)</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {[['matricule', 'Matricule'], ['nom', 'Nom'], ['prenom', 'Prénom']].map(([k, lib]) => (
                  <label key={k} className="block">
                    <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">{lib}</span>
                    <Sel valeur={ident[k]} onChange={v => setIdent(x => ({ ...x, [k]: v }))} />
                  </label>
                ))}
              </div>

              {/* ── LES COTES ATTENDUES, COURS PAR COURS ── */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-slate-600">
                    <b>{associees}</b> / {couples.length} cote(s) associée(s)
                  </span>
                  <button onClick={() => { proposer(matrice, ligneEntete); setRapport(null); }}
                    className="text-[11px] px-2 py-1 rounded-lg border border-iip-gold/60
                               text-iip-blue hover:bg-amber-50 flex items-center gap-1">
                    <IconWand size={12} /> Reproposer
                  </button>
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {(structure?.cours || []).filter(c => c.acquis?.length).map(c => (
                    <div key={c.cours_code}>
                      <div className="px-3 py-1 bg-iip-blue/5 text-[11px] font-semibold text-iip-blue">
                        {c.cours_code} · {c.cours_nom || ''}
                      </div>
                      {c.acquis.map(a => {
                        const cle = `${c.cours_code}|${a.aa_code}`;
                        return (
                          <div key={cle} className="px-3 py-1.5 flex items-center gap-2">
                            <span className="text-[11.5px] w-28 flex-none text-slate-700"
                              title={a.description || ''}>
                              {a.aa_code}
                              {a.poids != null && <span className="text-slate-400"> · {a.poids}</span>}
                            </span>
                            <div className="flex-1 min-w-0">
                              <Sel valeur={assoc[cle]}
                                onChange={v => {
                                  setRapport(null);
                                  setAssoc(x => {
                                    const y = { ...x };
                                    if (v < 0) delete y[cle]; else y[cle] = v;
                                    return y;
                                  });
                                }} />
                            </div>
                            {doublons.includes(cle) && (
                              <span title="Cette colonne sert déjà à une autre cote"
                                className="text-amber-600 flex-none">
                                <IconAlertTriangle size={13} />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {!!doublons.length && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                text-[11.5px] text-amber-900">
                  Une même colonne sert à plusieurs cotes. C'est légitime si un acquis reçoit
                  la même note dans deux cours — sinon, corrigez.
                </div>
              )}

              <label className="flex items-center gap-2 text-[12px] text-slate-700">
                <input type="checkbox" checked={arrondi} className="w-4 h-4 accent-iip-blue"
                  onChange={e => { setArrondi(e.target.checked); setRapport(null); }} />
                Arrondir à l'unité
              </label>

              <div className="text-[11.5px] text-slate-500">
                {lignes.length} ligne(s) d'étudiants lues,
                {' '}{lignes.reduce((n, l) => n + l.notes.length, 0)} cote(s) au total.
              </div>
            </>
          )}

          {rapport && (
            <div className={`rounded-lg border p-3 text-[12px] space-y-1.5 ${rapport.simulation
              ? 'bg-sky-50 border-sky-200 text-sky-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
              <div className="font-semibold flex items-center gap-1.5">
                {rapport.simulation
                  ? 'Simulation — rien n’a été écrit'
                  : <><IconCheck size={14} /> Import effectué</>}
              </div>
              <div>
                <b>{rapport.total.rapproches}</b> étudiant(s) reconnu(s) sur {rapport.total.etudiants}
                {' · '}<b>{rapport.total.notes}</b> note(s)
              </div>
              {!!rapport.total.inconnus && (
                <div className="text-amber-800">
                  {rapport.total.inconnus} non retrouvé(s) : {rapport.inconnus.slice(0, 5).join(' · ')}
                  {rapport.inconnus.length > 5 ? ' …' : ''}
                </div>
              )}
              {!!rapport.total.non_inscrits && (
                <div className="text-amber-800">
                  {rapport.total.non_inscrits} non inscrit(s) à cette unité — ignoré(s).
                </div>
              )}
              {!!rapport.acquis_inconnus.length && (
                <div className="text-amber-800">
                  Acquis absents du référentiel : {rapport.acquis_inconnus.join(', ')}.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                        justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
            Fermer
          </button>
          <button onClick={() => envoyer(true)} disabled={enCours || !lignes.length || !associees}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                       text-slate-600 disabled:opacity-40">
            Simuler
          </button>
          <button onClick={() => envoyer(false)}
            disabled={enCours || !rapport || !rapport.simulation}
            title={!rapport?.simulation ? 'Simulez d’abord' : ''}
            className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white font-semibold
                       disabled:opacity-40">
            Importer
          </button>
        </div>
      </div>
    </div>
  );
}

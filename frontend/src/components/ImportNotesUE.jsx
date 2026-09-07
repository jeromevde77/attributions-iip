import { useState } from 'react';
import {
  IconX, IconUpload, IconAlertTriangle, IconCheck, IconFileSpreadsheet,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * IMPORTER LES NOTES D'UNE UNITÉ DEPUIS UN CLASSEUR DE SUIVI.
 *
 * Les notes existent déjà — dans les classeurs de suivi, une feuille par unité,
 * une note par acquis. Les retaper étudiant par étudiant, pour quarante-huit
 * étudiants et quinze acquis, c'est sept cents saisies pour des chiffres qu'on
 * possède.
 *
 * Ces classeurs sont larges et pleins d'échafaudages : pour l'UE 282, quatorze
 * blocs de quinze colonnes, dont douze ne servent qu'à pondérer. L'écran
 * recense donc les blocs qui portent des notes sur vingt, les nomme par leur
 * étiquette de session, et propose celui de la session demandée — en laissant
 * choisir, car le classeur en compte parfois plusieurs.
 *
 * Rien n'est écrit avant que la simulation n'ait montré ce qui sera fait.
 */
export default function ImportNotesUE({ ueNum, annee, onClose, onImporte }) {
  const [classeur, setClasseur] = useState(null);   // { nom, feuilles, XLSX, wb }
  const [feuille, setFeuille] = useState('');
  const [session, setSession] = useState(1);
  const [arrondi, setArrondi] = useState(true);
  const [reperes, setReperes] = useState(null);     // le bloc retenu
  const [blocs, setBlocs] = useState([]);           // tous les blocs de notes trouvés
  const [apercu, setApercu] = useState(null);       // lignes lues
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const net = v => String(v ?? '').replace(/ /g, ' ').trim();

  async function lireFichier(f) {
    setErreur(null); setEnCours(true); setRapport(null); setApercu(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      setClasseur({ nom: f.name, feuilles: wb.SheetNames, XLSX, wb });
      // Une feuille porte souvent le numéro de l'unité : on la propose.
      const probable = wb.SheetNames.find(n => net(n) === String(ueNum)) || '';
      setFeuille(probable);
      if (probable) detecter(wb, XLSX, probable);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * TROUVER LES BLOCS DE NOTES.
   *
   * Ces classeurs sont larges : pour l'UE 282, quatorze blocs de quinze
   * colonnes, dont douze ne servent qu'à pondérer. Trois seulement portent des
   * notes sur vingt — première session, seconde session, et le report final —
   * et rien ne les distingue sur la ligne des codes.
   *
   * Ce qui les distingue, c'est l'étiquette au-dessus : « AA282.1.S1 »,
   * « AA282.1.S2A », « AA282.1.S2 ». On les recense donc tous, on les nomme, et
   * l'on propose celui qui correspond à la session demandée — en laissant
   * choisir, car le classeur peut en compter d'autres.
   */
  function detecter(wb, XLSX, nomFeuille, sessionVoulue = session) {
    const M = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { header: 1, defval: null });
    const estCode = v => /^AA\s*\d+(\.\d+)?$/i.test(net(v));

    let ligneCodes = -1, meilleur = 0;
    for (let r = 0; r < Math.min(M.length, 40); r++) {
      const n = (M[r] || []).filter(estCode).length;
      if (n > meilleur) { meilleur = n; ligneCodes = r; }
    }
    if (ligneCodes < 0) {
      setBlocs([]); setReperes(null); setApercu(null);
      setErreur("Aucune ligne de cette feuille ne porte de codes d'acquis (AA…).");
      return;
    }

    // Les codes se suivent sans interruption d'un bloc à l'autre : on découpe
    // donc sur l'étiquette de session, qui change, et non sur un trou.
    const ligne = M[ligneCodes] || [];
    const dessus = M[ligneCodes - 1] || [];
    const etiq = (c) => {
      for (let r = Math.max(0, ligneCodes - 6); r < ligneCodes; r++) {
        const v = net((M[r] || [])[c]).toUpperCase();
        const m = v.match(/\.(S\d[A-Z]?)$/);
        if (m) return m[1];
      }
      return '';
    };
    const bande = (c) => {
      let dernier = '';
      for (let x = 0; x <= c; x++) { const v = net((M[0] || [])[x]); if (v) dernier = v; }
      return dernier;
    };

    const trouves = [];
    let debut = -1, tag = null;
    for (let c = 0; c <= ligne.length; c++) {
      const ok = c < ligne.length && estCode(ligne[c]);
      const t = ok ? etiq(c) : null;
      if (ok && (debut < 0 || t === tag)) { if (debut < 0) { debut = c; tag = t; } continue; }
      if (debut >= 0) {
        const sur20 = (() => {
          for (let x = debut; x <= c - 1; x++) if (/^\/\s*20$/.test(net(dessus[x]))) return true;
          return false;
        })();
        if (sur20) {
          trouves.push({ debut, fin: c - 1, tag: tag || '', bande: bande(debut),
            n: c - debut });
        }
      }
      debut = ok ? c : -1; tag = ok ? t : null;
    }

    if (!trouves.length) {
      setBlocs([]); setReperes(null); setApercu(null);
      setErreur('Aucun bloc de notes sur 20 trouvé dans cette feuille.');
      return;
    }

    // La session voulue : l'étiquette S1 ou S2 d'abord, la bande ensuite.
    const cherche = `S${sessionVoulue}`;
    const choisi = trouves.find(b => b.tag === cherche)
      || trouves.find(b => b.tag.startsWith(cherche))
      || trouves.find(b => new RegExp(sessionVoulue === 1 ? 'premi' : 'deuxi', 'i').test(b.bande))
      || trouves[0];

    setBlocs(trouves);
    poser(M, ligne, ligneCodes, choisi);
    setErreur(null);
  }

  // Retenir un bloc : on en déduit les colonnes d'identité et on relit.
  function poser(M, ligne, ligneCodes, bloc) {
    let colMat = ligne.findIndex(v => /matricule/i.test(net(v)));
    if (colMat < 0) {
      let mieux = 0;
      for (let c = 0; c < 12; c++) {
        let n = 0;
        for (let r = ligneCodes + 1; r < Math.min(M.length, ligneCodes + 25); r++) {
          if (/^\d{2}-\d{3,6}$/.test(net((M[r] || [])[c]))) n++;
        }
        if (n > mieux) { mieux = n; colMat = c; }
      }
    }
    const rep = {
      ligneCodes, colDebut: bloc.debut, colFin: bloc.fin, colMat,
      colNom: ligne.findIndex(v => /^nom$/i.test(net(v))),
      colPre: ligne.findIndex(v => /^pr[ée]nom$/i.test(net(v))),
      ligneDebut: ligneCodes + 1, tag: bloc.tag, bande: bloc.bande, M,
    };
    setReperes(rep);
    lireLignes(M, rep);
  }

  function choisirBloc(i) {
    if (!reperes?.M) return;
    const M = reperes.M;
    poser(M, M[reperes.ligneCodes] || [], reperes.ligneCodes, blocs[i]);
    setRapport(null);
  }

  function lireLignes(M, rep) {
    const codes = [];
    for (let c = rep.colDebut; c <= rep.colFin; c++) {
      codes.push(net((M[rep.ligneCodes] || [])[c]).replace(/\s+/g, '').toUpperCase());
    }
    const out = [];
    for (let r = rep.ligneDebut; r < M.length; r++) {
      const L = M[r] || [];
      const matricule = net(L[rep.colMat]);
      const nom = rep.colNom >= 0 ? net(L[rep.colNom]) : '';
      const prenom = rep.colPre >= 0 ? net(L[rep.colPre]) : '';
      if (!matricule && !nom) continue;
      const notes = {};
      codes.forEach((code, i) => {
        const v = L[rep.colDebut + i];
        if (v !== null && v !== '' && v !== undefined) notes[code] = v;
      });
      if (!Object.keys(notes).length && !matricule) continue;
      out.push({ matricule, nom, prenom, notes });
    }
    setApercu({ codes, lignes: out });
  }

  function changerFeuille(nom) {
    setFeuille(nom); setRapport(null);
    if (classeur && nom) detecter(classeur.wb, classeur.XLSX, nom);
  }

  async function envoyer(simulation) {
    if (!apercu?.lignes.length) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/notes/importer`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, session, arrondi, simulation, lignes: apercu.lignes }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setRapport(j);
      if (!simulation) onImporte?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const col = i => {
    let s = '', n = i + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m) / 26); }
    return s;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-10
                      max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue flex items-center gap-2">
              <IconFileSpreadsheet size={17} className="text-iip-turquoise" />
              Importer les notes — UE {ueNum}
            </h3>
            <p className="text-[12px] text-slate-500">
              Depuis un classeur de suivi · {annee}
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

          <label className="flex items-center gap-3 border-2 border-dashed border-iip-turquoise/30
                            rounded-lg p-3.5 cursor-pointer hover:border-iip-turquoise/60">
            <IconUpload size={20} className="text-iip-turquoise flex-none" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-iip-blue truncate">
                {classeur ? classeur.nom : 'Cliquer pour choisir le classeur'}
              </div>
              <div className="text-[11px] text-slate-400">
                Le fichier de suivi de la section (.xlsm, .xlsx)
              </div>
            </div>
            <input type="file" accept=".xlsm,.xlsx,.xls" className="sr-only"
              onChange={e => e.target.files[0] && lireFichier(e.target.files[0])} />
          </label>

          {classeur && (
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Feuille</span>
                <select value={feuille} onChange={e => changerFeuille(e.target.value)}
                  className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2 py-1.5">
                  <option value="">— choisir —</option>
                  {classeur.feuilles.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">Session</span>
                <select value={session}
                  onChange={e => {
                    const v = Number(e.target.value); setSession(v); setRapport(null);
                    if (classeur && feuille) detecter(classeur.wb, classeur.XLSX, feuille, v);
                  }}
                  className="w-full text-[12.5px] border border-slate-300 rounded-lg px-2 py-1.5">
                  <option value={1}>1re session</option>
                  <option value={2}>2e session</option>
                </select>
              </label>
              <label className="flex items-end gap-2 pb-1.5">
                <input type="checkbox" checked={arrondi} className="w-4 h-4 accent-iip-blue"
                  onChange={e => { setArrondi(e.target.checked); setRapport(null); }} />
                <span className="text-[12px] text-slate-700">Arrondir à l'unité</span>
              </label>
            </div>
          )}

          {reperes && apercu && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {blocs.length > 1 && (
                <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">Bloc de notes</span>
                  <select
                    value={blocs.findIndex(b => b.debut === reperes.colDebut)}
                    onChange={e => choisirBloc(Number(e.target.value))}
                    className="flex-1 text-[12px] border border-slate-300 rounded-lg px-2 py-1">
                    {blocs.map((b, i) => (
                      <option key={i} value={i}>
                        {col(b.debut)}..{col(b.fin)} · {b.n} acquis
                        {b.tag ? ` · ${b.tag}` : ''}{b.bande ? ` · ${b.bande}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="bg-slate-50 px-3 py-2 text-[11.5px] text-slate-600">
                Bloc retenu : <b>{col(reperes.colDebut)}</b> à <b>{col(reperes.colFin)}</b>
                {reperes.tag ? <> · <b>{reperes.tag}</b></> : null}
                {' '}· codes en ligne <b>{reperes.ligneCodes + 1}</b>
                {' '}· matricules en <b>{col(reperes.colMat)}</b>
                <span className="float-right">
                  {apercu.codes.length} acquis · {apercu.lignes.length} étudiants
                </span>
              </div>
              <div className="px-3 py-2 text-[11px] text-slate-500 border-b border-slate-100">
                {apercu.codes.join(' · ')}
              </div>
              <div className="max-h-40 overflow-auto divide-y divide-slate-50">
                {apercu.lignes.slice(0, 6).map((l, i) => (
                  <div key={i} className="px-3 py-1 text-[11.5px] flex gap-2">
                    <span className="font-mono text-slate-400 w-20 flex-none">{l.matricule}</span>
                    <span className="flex-1 truncate text-slate-700">{l.nom} {l.prenom}</span>
                    <span className="text-slate-500 flex-none">
                      {Object.entries(l.notes).slice(0, 4)
                        .map(([c, v]) => `${c}=${Math.round(Number(v) * 10) / 10}`).join(' ')}
                      {Object.keys(l.notes).length > 4 ? ' …' : ''}
                    </span>
                  </div>
                ))}
                {apercu.lignes.length > 6 && (
                  <div className="px-3 py-1 text-[11px] text-slate-400">
                    … et {apercu.lignes.length - 6} autres.
                  </div>
                )}
              </div>
            </div>
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
                {rapport.total.notes > 0 && (
                  <span className="opacity-70"> (une par cours où l’acquis est évalué)</span>
                )}
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
                  Acquis absents du référentiel de l’unité : {rapport.acquis_inconnus.join(', ')}.
                </div>
              )}
              {!!rapport.acquis_sans_cours.length && (
                <div className="text-amber-800">
                  Acquis rattachés à aucun cours (pondération manquante), donc non écrits :
                  {' '}{rapport.acquis_sans_cours.join(', ')}.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                        justify-between gap-2">
          <p className="text-[11px] text-slate-500 flex-1">
            La note d’un acquis est écrite dans chaque cours qui l’évalue, selon la pondération.
          </p>
          <button onClick={() => envoyer(true)} disabled={enCours || !apercu?.lignes.length}
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

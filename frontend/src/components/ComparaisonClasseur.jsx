import { useState } from 'react';
import { IconUpload, IconX, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Tableau, TableauEntete, Th, Td, Tr, Badge } from './ui.jsx';

/**
 * Comparaison d'un classeur de coordination avec la base, SANS rien écrire.
 *
 * Un import qui écrase silencieusement vaut moins qu'un tableau qu'on peut
 * lire et contester. On montre donc d'abord les écarts, dans les deux sens :
 * ce que le classeur apporte, et ce que la base porte et que le classeur
 * ignore — celui-là, on oublie toujours de le regarder.
 *
 * Format attendu : ligne 1 l'année scolaire, ligne 2 l'intitulé, ligne 3 les
 * en-têtes et les numéros d'UE, les étudiants à partir de la ligne 4.
 */
const CODES = {
  c: { sens: 'réussi' }, r: { sens: 'refusé' }, f: { sens: 'réussi par faveur' },
  np: { sens: 'non présenté' }, va: { sens: 'valorisation' }, vp: { sens: 'valorisation' },
  x: { sens: 'à suivre', ignorer: true },
  '-': { sens: 'indéterminé', ignorer: true }, '?': { sens: 'indéterminé', ignorer: true },
};

export default function ComparaisonClasseur({ onClose }) {
  const [annee, setAnnee] = useState('2025-2026');
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [vue, setVue] = useState('divergents');
  const [resume, setResume] = useState(null);

  async function lire(fichier) {
    setErreur(null); setRapport(null); setEnCours(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
      // La feuille qui porte le plus de lignes : c'est celle de tous les étudiants.
      const nomFeuille = wb.SheetNames.reduce((a, n) => {
        const f = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
        return f.length > (a.n || 0) ? { nom: n, n: f.length } : a;
      }, {}).nom;
      const grille = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], {
        header: 1, blankrows: false, defval: null,
      });
      if (grille.length < 4) throw new Error('Ce classeur ne ressemble pas au format attendu.');

      const [ligneAnnee, , ligneEntetes] = grille;
      const norm = s => String(s || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

      // Colonnes d'identité
      const idx = {};
      ligneEntetes.forEach((h, i) => {
        const n = norm(h);
        if (n.startsWith('nometud') || n === 'nom') idx.nom = i;
        else if (n.startsWith('preetud') || n === 'prenom') idx.prenom = i;
        else if (n.includes('emailecole') || n.includes('mailecole')) idx.email = i;
      });
      if (idx.nom == null) throw new Error("Colonne « NomEtud » introuvable en ligne 3.");

      // Colonnes de résultats : celles dont la ligne 1 porte l'année visée.
      const court = annee.slice(2, 4) + '-' + annee.slice(7, 9);   // 2025-2026 → 25-26
      const colonnes = [];
      ligneAnnee.forEach((a, i) => {
        const ue = ligneEntetes[i];
        if (String(a || '').trim() === court && ue != null) {
          const s = String(ue).trim();
          const num = parseInt(s, 10);
          if (!isNaN(num)) colonnes.push({ i, ue_num: num, code: s.includes('.') ? s : null });
        }
      });
      if (!colonnes.length) {
        throw new Error(`Aucune colonne pour « ${court} » en ligne 1. `
          + `Vérifiez l'année choisie.`);
      }

      const compte = {};
      const lignes = [];
      for (let r = 3; r < grille.length; r++) {
        const g = grille[r];
        if (!g || !g[idx.nom]) continue;
        const cellules = [];
        for (const col of colonnes) {
          const v = g[col.i];
          if (v == null || String(v).trim() === '') continue;
          const brut = String(v).trim();
          const bas = brut.toLowerCase();
          compte[bas] = (compte[bas] || 0) + 1;
          if (CODES[bas]?.ignorer) continue;
          const n = Number(brut.replace(',', '.'));
          cellules.push({
            ue_num: col.ue_num, code: col.code || String(col.ue_num), brut,
            points: !isNaN(n) && n >= 0 && n <= 20 ? n : null,
          });
        }
        if (cellules.length) {
          lignes.push({
            nom: String(g[idx.nom]).trim(),
            prenom: idx.prenom != null ? String(g[idx.prenom] || '').trim() : '',
            email: idx.email != null ? String(g[idx.email] || '').trim() : '',
            cellules,
          });
        }
      }
      setResume({ feuille: nomFeuille, colonnes: colonnes.length, etudiants: lignes.length, compte });

      const rep = await fetch('/api/import-historique/comparer', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, lignes }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setRapport(j);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const listes = {
    divergents: rapport?.divergents || [],
    nouveaux: rapport?.nouveaux || [],
    absents: rapport?.absents || [],
    inconnus: rapport?.inconnus || [],
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mt-8 p-5 space-y-4
                      max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-20 bg-white -mx-5 px-5 -mt-5 pt-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              Comparer un classeur de coordination
            </h3>
            <p className="text-[12px] text-slate-500">
              Rien n'est écrit : ce tableau montre seulement les écarts.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Année à comparer
            </span>
            <input value={annee} onChange={e => setAnnee(e.target.value)}
              placeholder="2025-2026"
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-36" />
          </label>
          <label className="inline-flex items-center gap-2 px-3 py-2 text-[12.5px] border
                            border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
            <IconUpload size={15} /> {enCours ? 'Lecture…' : 'Choisir le classeur'}
            <input type="file" accept=".xls,.xlsx,.xlsm,.csv" className="hidden"
              onChange={ev => ev.target.files[0] && lire(ev.target.files[0])} />
          </label>
        </div>

        {erreur && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
            {erreur}
          </div>
        )}

        {resume && (
          <div className="text-[11.5px] text-slate-600 bg-slate-50 rounded-lg p-2.5">
            Feuille <b>{resume.feuille}</b> · {resume.colonnes} colonne(s) pour {annee} ·{' '}
            {resume.etudiants} étudiant(s) porteurs d'au moins un résultat.
            <div className="mt-1">
              Codes rencontrés :{' '}
              {Object.entries(resume.compte).sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([k, n]) => (
                  <span key={k} className="mr-2">
                    <b>{k}</b> ({n}){CODES[k] ? ` = ${CODES[k].sens}` : ' — inconnu'}
                  </span>
                ))}
            </div>
          </div>
        )}

        {rapport && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[['Identiques', rapport.identiques, 'text-emerald-700'],
                ['Divergents', rapport.nb_divergents, 'text-red-700'],
                ['Absents en base', rapport.nb_nouveaux, 'text-iip-blue'],
                ['Absents du classeur', rapport.nb_absents, 'text-amber-700'],
                ['Non rapprochés', rapport.nb_inconnus + rapport.nb_ambigus, 'text-slate-600'],
              ].map(([l, v, ton]) => (
                <div key={l} className="border border-slate-200 rounded-xl px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{l}</div>
                  <div className={`text-[18px] font-bold ${ton}`}>{v}</div>
                </div>
              ))}
            </div>

            {rapport.nb_divergents > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                              text-[12px] text-amber-900 flex items-start gap-1.5">
                <IconAlertTriangle size={14} className="mt-0.5 flex-none" />
                <span>
                  {rapport.nb_divergents} résultat(s) diffèrent entre le classeur et la base.
                  Examinez-les avant d'envisager le moindre import : l'un des deux se trompe.
                </span>
              </div>
            )}

            <div className="flex gap-1 border-b border-slate-200">
              {[['divergents', 'Divergents', rapport.nb_divergents],
                ['nouveaux', 'Absents en base', rapport.nb_nouveaux],
                ['absents', 'Absents du classeur', rapport.nb_absents],
                ['inconnus', 'Non rapprochés', rapport.nb_inconnus]].map(([k, l, n]) => (
                <button key={k} onClick={() => setVue(k)}
                  className={`px-3 py-1.5 text-[12px] font-semibold border-b-2 -mb-px ${
                    vue === k ? 'border-iip-blue text-iip-blue'
                              : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {l} ({n})
                </button>
              ))}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {!listes[vue].length ? (
                <div className="py-8 text-center text-[12.5px] text-slate-400">
                  Rien dans cette catégorie.
                </div>
              ) : vue === 'inconnus' ? (
                <Tableau dense>
                  <TableauEntete><Th>Nom</Th><Th>Prénom</Th><Th>Courriel</Th></TableauEntete>
                  <tbody>
                    {listes.inconnus.map((x, i) => (
                      <Tr key={i}><Td>{x.nom}</Td><Td>{x.prenom}</Td>
                        <Td ton="secondaire">{x.email || '—'}</Td></Tr>
                    ))}
                  </tbody>
                </Tableau>
              ) : (
                <Tableau dense>
                  <TableauEntete>
                    <Th>Étudiant</Th><Th largeur="w-20">UE</Th><Th largeur="w-20">Activité</Th>
                    <Th largeur="w-24">Classeur</Th><Th largeur="w-24">Base</Th>
                  </TableauEntete>
                  <tbody>
                    {listes[vue].map((x, i) => (
                      <Tr key={i}>
                        <Td>{x.etudiant || `#${x.etudiant_id}`}</Td>
                        <Td ton="secondaire">{x.ue_num}</Td>
                        <Td ton="secondaire">{x.code || '—'}</Td>
                        <Td>{x.classeur != null
                          ? <Badge ton="info">{x.classeur}</Badge> : '—'}</Td>
                        <Td>{x.base != null
                          ? <Badge ton={vue === 'divergents' ? 'alerte' : 'neutre'}>{x.base}</Badge>
                          : '—'}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tableau>
              )}
            </div>

            <p className="text-[11px] text-slate-500">
              Aucune écriture n'a eu lieu. Ce tableau sert à décider, pas à importer.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

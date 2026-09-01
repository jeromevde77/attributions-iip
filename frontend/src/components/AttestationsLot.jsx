import { useEffect, useMemo, useState } from 'react';
import {
  IconPrinter, IconFileZip, IconAlertTriangle, IconSearch, IconX,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Tableau, TableauEntete, Th, Td, Tr, Badge } from './ui.jsx';

/**
 * Génération groupée des attestations de réussite.
 *
 * Chaque couple « étudiant × unité réussie » donne une attestation : ce sont
 * des pièces distinctes, et c'est à cette maille que la sélection se raisonne.
 * On croise librement années, sections, unités et étudiants — un même écran
 * sert donc à tirer les attestations d'un étudiant, celles d'une unité pour
 * toute une promotion, ou celles d'une section sur plusieurs années.
 *
 * Deux sorties : un document unique à imprimer d'un trait, ou une archive de
 * pièces séparées lorsqu'il faut les remettre individuellement.
 */
export default function AttestationsLot({ onClose }) {
  const [annees, setAnnees] = useState([]);
  const [sections, setSections] = useState([]);
  const [ues, setUes] = useState([]);

  const [selAnnees, setSelAnnees] = useState([]);
  const [selSections, setSelSections] = useState([]);
  const [selUes, setSelUes] = useState([]);
  const [recherche, setRecherche] = useState('');

  const [candidats, setCandidats] = useState(null);
  const [exclus, setExclus] = useState(new Set());
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        if (!Array.isArray(l)) return;
        const codes = l.map(a => a.code || a).filter(Boolean);
        setAnnees(codes);
        // L'année écoulée par défaut : c'est d'elle qu'on tire les attestations.
        const courante = codes.find(c => c === new Date().getFullYear() - 1 + '-' + new Date().getFullYear());
        setSelAnnees(courante ? [courante] : codes.slice(-2, -1));
      }).catch(() => {});
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
  }, []);

  // Les unités proposées suivent les sections retenues.
  useEffect(() => {
    const qs = new URLSearchParams();
    if (selSections.length === 1) qs.set('section', selSections[0]);
    fetch(`/api/ref/ue?${qs}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setUes(l); }).catch(() => {});
  }, [selSections]);

  async function chercher() {
    if (!selAnnees.length) { setMessage({ type: 'err', texte: 'Choisissez au moins une année.' }); return; }
    setEnCours(true); setMessage(null);
    try {
      const qs = new URLSearchParams({ annees: selAnnees.join(',') });
      if (selSections.length) qs.set('sections', selSections.join(','));
      if (selUes.length) qs.set('ues', selUes.join(','));
      const rep = await fetch(`/api/attestations/candidats?${qs}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setCandidats(j.candidats);
      setExclus(new Set());
    } finally { setEnCours(false); }
  }

  const retenus = useMemo(() => {
    if (!candidats) return [];
    const q = recherche.trim().toLowerCase();
    return candidats.filter(c => {
      if (exclus.has(`${c.etudiant_id}|${c.ue_num}|${c.annee_scolaire}`)) return false;
      if (!q) return true;
      return `${c.nom} ${c.prenom} ${c.ue_num} ${c.ue_nom || ''}`.toLowerCase().includes(q);
    });
  }, [candidats, exclus, recherche]);

  async function produire(separes) {
    if (!retenus.length) return;
    setEnCours(true); setMessage(null);
    try {
      const rep = await fetch('/api/attestations/lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          paires: retenus.map(c => ({
            etudiant_id: c.etudiant_id, ue_num: c.ue_num, annee_scolaire: c.annee_scolaire,
          })),
          separes,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }

      if (j.nb_manquants) {
        setMessage({
          type: 'alerte',
          texte: `${j.total} attestation(s) produite(s), mais ${j.nb_manquants} comporte(nt) `
               + `des mentions absentes — elles apparaissent en ambre dans les documents.`,
        });
      }

      if (separes) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const d of j.documents) {
          zip.file(d.nom_fichier, j.enveloppe.replace('__CORPS__', d.corps));
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `attestations_${selAnnees.join('_')}_${j.total}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
      } else {
        // Une fenêtre dédiée : Safari imprime le document parent si on passe
        // par un cadre.
        const w = window.open('', '_blank');
        if (!w) {
          setMessage({ type: 'err', texte: "Fenêtre bloquée. Autorisez les fenêtres surgissantes." });
          return;
        }
        w.document.open(); w.document.write(j.html); w.document.close();
        let lance = false;
        const lancer = () => { if (lance) return; lance = true; w.focus(); w.print(); };
        w.onload = lancer;
        setTimeout(lancer, 500);
      }
    } finally { setEnCours(false); }
  }

  const bascule = (liste, set, v) =>
    set(liste.includes(v) ? liste.filter(x => x !== v) : [...liste, v]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mt-10 p-5 space-y-4
                      max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">Attestations de réussite</h3>
            <p className="text-[12px] text-slate-500">
              Une attestation par unité réussie. Croisez années, sections et unités.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        {message && (
          <div className={`px-3 py-2 rounded-lg text-[12.5px] ${
            message.type === 'err' ? 'bg-red-50 border border-red-200 text-red-800'
                                   : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
            {message.texte}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Groupe titre={`Années (${selAnnees.length})`} obligatoire>
            {annees.map(a => (
              <Case key={a} coche={selAnnees.includes(a)}
                onChange={() => bascule(selAnnees, setSelAnnees, a)}>{a}</Case>
            ))}
          </Groupe>

          <Groupe titre={`Sections (${selSections.length || 'toutes'})`}>
            {sections.map(s => (
              <Case key={s.code} coche={selSections.includes(s.code)}
                onChange={() => bascule(selSections, setSelSections, s.code)}>
                {s.libelle || s.code}
              </Case>
            ))}
          </Groupe>

          <Groupe titre={`Unités (${selUes.length || 'toutes'})`}>
            {ues.length > 60 && !selSections.length ? (
              <p className="text-[11px] text-slate-400 p-1">
                Choisissez d'abord une section pour restreindre la liste.
              </p>
            ) : ues.map(u => (
              <Case key={u.ue_num} coche={selUes.includes(u.ue_num)}
                onChange={() => bascule(selUes, setSelUes, u.ue_num)}>
                <span className="text-slate-500">{u.ue_num}</span> {u.ue_nom}
              </Case>
            ))}
          </Groupe>
        </div>

        <button onClick={chercher} disabled={enCours || !selAnnees.length}
          className="px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg
                     disabled:opacity-40">
          {enCours ? 'Recherche…' : 'Chercher les attestations'}
        </button>

        {candidats && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[13px] font-semibold text-iip-blue">
                {retenus.length} attestation(s) ·{' '}
                {new Set(retenus.map(c => c.etudiant_id)).size} étudiant(s)
              </span>
              <div className="relative">
                <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={recherche} onChange={e => setRecherche(e.target.value)}
                  placeholder="Filtrer…"
                  className="border border-slate-300 rounded-lg pl-8 pr-2 py-1 text-[12px] w-48" />
              </div>
            </div>

            {!retenus.length ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400 border-2 border-dashed rounded-xl">
                Aucune unité réussie ne correspond à cette sélection.
              </div>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto">
                  <Tableau dense>
                    <TableauEntete>
                      <Th>Étudiant</Th>
                      <Th largeur="w-16">UE</Th>
                      <Th>Intitulé</Th>
                      <Th largeur="w-24">Année</Th>
                      <Th largeur="w-16" />
                    </TableauEntete>
                    <tbody>
                      {retenus.slice(0, 200).map(c => (
                        <Tr key={`${c.etudiant_id}|${c.ue_num}|${c.annee_scolaire}`}>
                          <Td>{c.nom} {c.prenom}</Td>
                          <Td ton="secondaire">{c.ue_num}</Td>
                          <Td ton="secondaire">{c.ue_nom}</Td>
                          <Td ton="secondaire">{c.annee_scolaire}</Td>
                          <Td align="droite">
                            <button
                              onClick={() => setExclus(s => new Set([...s,
                                `${c.etudiant_id}|${c.ue_num}|${c.annee_scolaire}`]))}
                              title="Retirer de la sélection"
                              className="text-slate-300 hover:text-red-500">
                              <IconX size={13} />
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Tableau>
                  {retenus.length > 200 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      200 premières lignes affichées ; la génération portera sur les {retenus.length}.
                    </p>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => produire(false)} disabled={enCours}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                               font-semibold rounded-lg disabled:opacity-40">
                    <IconPrinter size={15} /> Un seul document
                  </button>
                  <button onClick={() => produire(true)} disabled={enCours}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm border border-iip-blue
                               text-iip-blue font-semibold rounded-lg disabled:opacity-40">
                    <IconFileZip size={15} /> Archive de pièces séparées
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                  <IconAlertTriangle size={13} className="mt-0.5 flex-none" />
                  Les pièces séparées sont nommées <b>nom_prénom_UE&lt;numéro&gt;_année</b>.
                  Le document unique enchaîne les attestations, chacune sur sa page.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Groupe({ titre, obligatoire, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {titre}{obligatoire && <span className="text-red-500"> *</span>}
      </div>
      <div className="border border-slate-300 rounded-lg max-h-40 overflow-y-auto
                      divide-y divide-slate-100">
        {children}
      </div>
    </div>
  );
}

function Case({ coche, onChange, children }) {
  return (
    <label className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" checked={coche} onChange={onChange} className="flex-none" />
      <span className="text-[12px] text-slate-700 truncate">{children}</span>
    </label>
  );
}

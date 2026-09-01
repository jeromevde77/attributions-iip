import { useEffect, useMemo, useState } from 'react';
import {
  IconPrinter, IconFileZip, IconFileTypePdf, IconSearch, IconX, IconAlertTriangle,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';

/**
 * Centre d'impression.
 *
 * Dix points d'impression s'étaient dispersés dans l'application, chacun avec
 * sa fenêtre et son aperçu. On choisit ici le document, puis les destinataires,
 * puis la forme : document unique, archive de pièces séparées, ou PDF là où le
 * serveur sait en produire.
 */
export default function CentreImpression({ onClose, documentInitial = null,
                                           anneeInitiale = null }) {
  const [catalogue, setCatalogue] = useState(null);
  const [pdfPossible, setPdfPossible] = useState(false);
  const [docCle, setDocCle] = useState(documentInitial);

  const [annees, setAnnees] = useState([]);
  const [sections, setSections] = useState([]);
  const [ues, setUes] = useState([]);

  const [annee, setAnnee] = useState(anneeInitiale || '');
  const [section, setSection] = useState('');
  const [ue, setUe] = useState('');

  const [destinataires, setDestinataires] = useState(null);
  const [exclus, setExclus] = useState(new Set());
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  const doc = catalogue?.find(d => d.cle === docCle) || null;

  useEffect(() => {
    fetch('/api/impression/catalogue', { headers: authHeaders() })
      .then(r => r.json())
      .then(j => {
        setCatalogue(j.documents || []);
        setPdfPossible(!!j.pdf);
        if (!docCle && j.documents?.length) setDocCle(j.documents[0].cle);
      })
      .catch(e => setMessage({ type: 'err', texte: e.message }));

    fetch('/api/impression/valeurs/annee', { headers: authHeaders() })
      .then(r => r.json()).then(l => {
        if (!Array.isArray(l)) return;
        setAnnees(l);
        if (!anneeInitiale && l.length) setAnnee(l[0].valeur);
      }).catch(() => {});

    fetch('/api/impression/valeurs/section', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); })
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  // Les unités proposées suivent la section retenue.
  useEffect(() => {
    if (!doc?.parametres?.includes('ue')) { setUes([]); return; }
    const qs = new URLSearchParams();
    if (section) qs.set('section', section);
    fetch(`/api/impression/valeurs/ue?${qs}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setUes(l); })
      .catch(() => {});
  }, [section, doc]);

  // Changer de document invalide la sélection précédente.
  useEffect(() => { setDestinataires(null); setExclus(new Set()); }, [docCle]);

  async function chercher() {
    if (!annee) { setMessage({ type: 'err', texte: 'Choisissez une année.' }); return; }
    setEnCours(true); setMessage(null);
    try {
      const qs = new URLSearchParams({ document: docCle, annee });
      if (section) qs.set('section', section);
      if (ue) qs.set('ue', ue);
      const rep = await fetch(`/api/impression/destinataires?${qs}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setDestinataires(j);
      setExclus(new Set());
    } finally { setEnCours(false); }
  }

  const cle = d => `${d.etudiant_id || d.professeur_id}|${d.ue_num ?? ''}|${d.annee_scolaire ?? ''}`;

  const retenus = useMemo(() => {
    if (!destinataires) return [];
    const q = recherche.trim().toLowerCase();
    return destinataires.destinataires.filter(d => {
      if (exclus.has(cle(d))) return false;
      if (!q) return true;
      return `${d.nom} ${d.prenom} ${d.ue_num ?? ''}`.toLowerCase().includes(q);
    });
  }, [destinataires, exclus, recherche]);

  /**
   * La production passe par la route du document lui-même : le centre ne
   * compose pas, il orchestre. C'est ce qui évite de dupliquer la mise en page,
   * source des régressions passées.
   */
  async function produire(forme) {
    if (!retenus.length) return;
    setEnCours(true); setMessage(null);
    try {
      if (docCle === 'attestation_reussite') {
        const rep = await fetch('/api/attestations/lot', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({
            paires: retenus.map(d => ({
              etudiant_id: d.etudiant_id, ue_num: d.ue_num,
              annee_scolaire: d.annee_scolaire,
            })),
            separes: forme === 'zip',
          }),
        });
        const j = await rep.json();
        if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
        if (j.nb_manquants) {
          setMessage({ type: 'alerte', texte:
            `${j.total} pièce(s) produite(s), dont ${j.nb_manquants} avec des `
            + `mentions absentes — signalées en ambre dans les documents.` });
        }
        if (forme === 'zip') return await archiver(j);
        if (forme === 'pdf') return await enPdf(j.html, `attestations_${annee}`);
        return imprimer(j.html);
      }

      // Documents à pièce unique : on les produit un par un.
      const pieces = [];
      for (const d of retenus.slice(0, forme === 'html' ? 60 : 200)) {
        const html = await produireUn(d);
        if (html) pieces.push({ nom: nommer(d), html });
      }
      if (!pieces.length) {
        setMessage({ type: 'err', texte: "Aucune pièce n'a pu être produite." });
        return;
      }
      if (forme === 'zip') {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (const p of pieces) zip.file(`${p.nom}.html`, p.html);
        await telecharger(await zip.generateAsync({ type: 'blob' }),
                          `${docCle}_${annee}_${pieces.length}.zip`);
        return;
      }
      // Assemblage : les pièces s'enchaînent, chacune sur sa page.
      const assemble = pieces.length === 1 ? pieces[0].html
        : assembler(pieces.map(p => p.html));
      if (forme === 'pdf') return await enPdf(assemble, `${docCle}_${annee}`);
      imprimer(assemble);
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally { setEnCours(false); }
  }

  async function produireUn(d) {
    const id = d.etudiant_id || d.professeur_id;
    const routes = {
      fiche_inscription: `/api/etudiants/${id}/fiche-inscription?annee=${encodeURIComponent(annee)}`,
      frais_scolarite: `/api/frais-scolarite/etudiant/${id}/document?annee=${encodeURIComponent(annee)}`,
    };
    if (docCle === 'annexe2') {
      const rep = await fetch('/api/annexe2/document', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: id, annee, motif: '', avis: 'Néant' }),
      });
      return rep.ok ? (await rep.json()).html : null;
    }
    const url = routes[docCle];
    if (!url) throw new Error(`Le document « ${doc?.libelle} » n'est pas encore branché ici.`);
    const rep = await fetch(url, { headers: authHeaders() });
    return rep.ok ? (await rep.json()).html : null;
  }

  /** Les pièces s'enchaînent dans un seul document, chacune sur sa page. */
  function assembler(htmls) {
    const corps = htmls.map((h, i) => {
      const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(h);
      const c = m ? m[1] : h;
      return i === 0 ? c
        : `<div style="break-before:page;page-break-before:always"></div>${c}`;
    }).join('\n');
    return htmls[0].replace(/(<body[^>]*>)[\s\S]*(<\/body>)/i, `$1${corps}$2`);
  }

  function nommer(d) {
    const propre = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return (doc?.nomFichier || '{nom}_{prenom}_{annee}')
      .replace('{nom}', propre(d.nom)).replace('{prenom}', propre(d.prenom))
      .replace('{ue}', d.ue_num ?? '').replace('{annee}', annee);
  }

  async function archiver(j) {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const d of j.documents) {
      zip.file(d.nom_fichier, j.enveloppe.replace('__CORPS__', d.corps));
    }
    await telecharger(await zip.generateAsync({ type: 'blob' }),
                      `attestations_${annee}_${j.total}.zip`);
  }

  async function enPdf(html, nom) {
    const rep = await fetch('/api/impression/pdf', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ html, nom }),
    });
    if (!rep.ok) {
      const e = await rep.json().catch(() => ({}));
      setMessage({ type: 'err', texte: e.error || "Le PDF n'a pas pu être produit." });
      return;
    }
    await telecharger(await rep.blob(), `${nom}.pdf`);
  }

  async function telecharger(blob, nom) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  }

  /** Fenêtre dédiée : Safari imprime le document parent depuis un cadre. */
  function imprimer(html) {
    const w = window.open('', '_blank');
    if (!w) {
      setMessage({ type: 'err', texte: 'Fenêtre bloquée. Autorisez les fenêtres surgissantes.' });
      return;
    }
    w.document.open(); w.document.write(html); w.document.close();
    let lance = false;
    const lancer = () => { if (lance) return; lance = true; w.focus(); w.print(); };
    w.onload = lancer;
    setTimeout(lancer, 500);
  }

  const groupes = useMemo(() => {
    const g = {};
    for (const d of catalogue || []) (g[d.groupe] ||= []).push(d);
    return g;
  }, [catalogue]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mt-8 p-5 space-y-4
                      max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">Centre d'impression</h3>
            <p className="text-[12px] text-slate-500">
              Choisissez le document, les destinataires, puis la forme.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400"><IconX size={18} /></button>
        </div>

        {message && (
          <div className={`px-3 py-2 rounded-lg text-[12.5px] ${
            message.type === 'err' ? 'bg-red-50 border border-red-200 text-red-800'
                                   : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
            {message.texte}
          </div>
        )}

        {/* 1 — le document */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1.5">
            Document
          </div>
          <div className="space-y-2">
            {Object.entries(groupes).map(([g, docs]) => (
              <div key={g}>
                <div className="text-[11px] text-slate-400 mb-1">{g}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {docs.map(d => (
                    <button key={d.cle} onClick={() => setDocCle(d.cle)}
                      className={`text-left px-3 py-2 rounded-xl border transition
                        ${docCle === d.cle ? 'border-iip-blue bg-iip-blue/5'
                                           : 'border-slate-200 hover:bg-slate-50'}`}>
                      <div className="text-[12.5px] font-semibold text-iip-blue">{d.libelle}</div>
                      <div className="text-[11px] text-slate-500">{d.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2 — les filtres */}
        {doc && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-200 pt-3">
            <Choix libelle="Année" valeur={annee} onChange={setAnnee}
              options={annees} obligatoire />
            {doc.parametres?.includes('section') && (
              <Choix libelle="Section" valeur={section} onChange={setSection}
                options={sections} vide="Toutes" />
            )}
            {doc.parametres?.includes('ue') && (
              <Choix libelle="Unité" valeur={ue} onChange={setUe}
                options={ues.map(u => ({ valeur: u.valeur, libelle: `${u.valeur} — ${u.libelle}` }))}
                vide="Toutes" />
            )}
          </div>
        )}

        <button onClick={chercher} disabled={enCours || !doc || !annee}
          className="px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg
                     disabled:opacity-40">
          {enCours ? 'Recherche…' : 'Chercher les destinataires'}
        </button>

        {/* 3 — la sélection */}
        {destinataires && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[13px] font-semibold text-iip-blue">
                {retenus.length} pièce(s) · {destinataires.personnes} personne(s)
              </span>
              <div className="relative">
                <IconSearch size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={recherche} onChange={e => setRecherche(e.target.value)}
                  placeholder="Filtrer…"
                  className="border border-slate-300 rounded-lg pl-8 pr-2 py-1 text-[12px] w-48" />
              </div>
            </div>

            {!retenus.length ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400
                              border-2 border-dashed rounded-xl">
                Personne ne correspond à cette sélection.
              </div>
            ) : (
              <>
                <div className="max-h-56 overflow-y-auto">
                  <Tableau dense>
                    <TableauEntete>
                      <Th>Nom</Th>
                      {destinataires.maille === 'etudiant_ue' && <Th largeur="w-16">UE</Th>}
                      <Th largeur="w-24">Année</Th>
                      <Th largeur="w-12" />
                    </TableauEntete>
                    <tbody>
                      {retenus.slice(0, 200).map(d => (
                        <Tr key={cle(d)}>
                          <Td>{d.nom} {d.prenom}</Td>
                          {destinataires.maille === 'etudiant_ue' && (
                            <Td ton="secondaire">{d.ue_num}</Td>
                          )}
                          <Td ton="secondaire">{d.annee_scolaire || annee}</Td>
                          <Td align="droite">
                            <button onClick={() => setExclus(s => new Set([...s, cle(d)]))}
                              title="Retirer" className="text-slate-300 hover:text-red-500">
                              <IconX size={13} />
                            </button>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Tableau>
                  {retenus.length > 200 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      200 premières lignes affichées ; la production portera sur les {retenus.length}.
                    </p>
                  )}
                </div>

                {/* 4 — la forme */}
                <div className="flex gap-2 flex-wrap">
                  {pdfPossible && (
                    <button onClick={() => produire('pdf')} disabled={enCours}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue
                                 text-white font-semibold rounded-lg disabled:opacity-40">
                      <IconFileTypePdf size={15} /> PDF
                    </button>
                  )}
                  <button onClick={() => produire('html')} disabled={enCours}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm border
                               border-iip-blue text-iip-blue font-semibold rounded-lg
                               disabled:opacity-40">
                    <IconPrinter size={15} /> Imprimer
                  </button>
                  <button onClick={() => produire('zip')} disabled={enCours}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm border
                               border-slate-300 text-slate-600 font-semibold rounded-lg
                               disabled:opacity-40">
                    <IconFileZip size={15} /> Pièces séparées
                  </button>
                </div>

                {!pdfPossible && (
                  <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
                    <IconAlertTriangle size={13} className="mt-0.5 flex-none" />
                    Ce serveur ne produit pas de PDF. À l'impression, décochez
                    « En-têtes et pieds de page » pour retirer l'adresse et la numérotation.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Choix({ libelle, valeur, onChange, options, vide, obligatoire }) {
  return (
    <label className="block text-xs">
      <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {libelle}{obligatoire && <span className="text-red-500"> *</span>}
      </span>
      <select value={valeur} onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
        {vide && <option value="">{vide}</option>}
        {options.map(o => (
          <option key={o.valeur} value={o.valeur}>{o.libelle || o.valeur}</option>
        ))}
      </select>
    </label>
  );
}

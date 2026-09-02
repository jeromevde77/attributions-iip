import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle, IconFileTypePdf, IconFileZip, IconPrinter, IconSearch, IconSquare, IconSquareCheck, IconX,
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
                                           anneeInitiale = null, preselection = []}) {
  const [catalogue, setCatalogue] = useState(null);
  const [pdfPossible, setPdfPossible] = useState(false);
  const [docCle, setDocCle] = useState(documentInitial);

  const [annees, setAnnees] = useState([]);
  const [sections, setSections] = useState([]);
  const [ues, setUes] = useState([]);

  const [annee, setAnnee] = useState(anneeInitiale || '');
  const [section, setSection] = useState('');
  // Plusieurs unités à la fois : neuf cents attestations d'un coup sont
  // ingérables, et une seule unité est souvent trop peu.
  const [uesChoisies, setUesChoisies] = useState(new Set());

  const [destinataires, setDestinataires] = useState(null);
  // Sélection EXPLICITE plutôt qu'exclusion : on voit ce qu'on va produire,
  // et « tout décocher puis cocher trois personnes » devient possible.
  const [coches, setCoches] = useState(new Set());
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState(false);
  // Le temps d'un lot dépend du serveur : plutôt que d'inventer une estimation,
  // on MESURE le premier et on s'en sert pour annoncer les suivants.
  const [travail, setTravail] = useState(null);   // { total, debut, estime }

  const cadenceMs = () => {
    const v = Number(localStorage.getItem('impression_ms_par_piece'));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  // La date portée par le document. Le jour même par défaut, mais une
  // attestation se signe souvent à une date décidée — délibération, courrier —
  // et non le jour où on l'imprime.
  const [dateDoc, setDateDoc] = useState(() => new Date().toISOString().slice(0, 10));
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
  useEffect(() => { setDestinataires(null); setCoches(new Set()); }, [docCle]);

  async function chercher() {
    if (!annee) { setMessage({ type: 'err', texte: 'Choisissez une année.' }); return; }
    setEnCours(true); setMessage(null);
    try {
      const qs = new URLSearchParams({ document: docCle, annee });
      if (section) qs.set('section', section);
      if (uesChoisies.size) qs.set('ues', [...uesChoisies].join(','));
      const rep = await fetch(`/api/impression/destinataires?${qs}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setDestinataires(j);
      // Si la liste a transmis une sélection, on ne coche QUE ceux-là : c'est
      // le geste de l'utilisateur, il prime sur le « tout coché » par défaut.
      const pre = new Set(preselection.map(Number));
      // La clé se calcule une seule fois : la recalculer à chaque rendu de
      // chaque ligne coûtait plus cher que tout le reste.
      for (const d of j.destinataires) d._k = cle(d);
      setCoches(new Set(
        j.destinataires
          .filter(d => !pre.size || pre.has(Number(d.etudiant_id)))
          .map(cle)));
    } finally {
      setEnCours(false);
      setTravail(t => {
        if (t?.total) {
          const ms = (Date.now() - t.debut) / t.total;
          // Moyenne glissante : une mesure isolée peut être trompeuse.
          const ancien = cadenceMs();
          localStorage.setItem('impression_ms_par_piece',
            String(ancien ? Math.round((ancien * 2 + ms) / 3) : Math.round(ms)));
        }
        return null;
      });
    }
  }

  const cle = d => `${d.etudiant_id || d.professeur_id}|${d.ue_num ?? ''}|${d.annee_scolaire ?? ''}`;

  // Ce que la recherche laisse voir…
  const affiches = useMemo(() => {
    if (!destinataires) return [];
    const q = recherche.trim().toLowerCase();
    if (!q) return destinataires.destinataires;
    return destinataires.destinataires.filter(d =>
      `${d.nom} ${d.prenom} ${d.ue_num ?? ''}`.toLowerCase().includes(q));
  }, [destinataires, recherche]);

  // …et ce qui sera réellement produit. La recherche ne décoche rien : on peut
  // chercher « Dupont », le cocher, puis chercher autre chose sans le perdre.
  const retenus = useMemo(
    () => (destinataires?.destinataires || []).filter(d => coches.has(d._k)),
    [destinataires, coches]);

  // useCallback : sans identité stable, chaque rendu donnerait une NOUVELLE
  // fonction à 400 lignes et annulerait la mémoïsation.
  const basculer = useCallback(d => setCoches(s => {
    const n = new Set(s);
    n.has(d._k) ? n.delete(d._k) : n.add(d._k);
    return n;
  }), []);

  // « Tout cocher » ne porte que sur ce qui est AFFICHÉ : après une recherche,
  // il doit cocher le résultat, non la liste entière.
  const toutCocher = valeur => setCoches(s => {
    const n = new Set(s);
    for (const d of affiches) valeur ? n.add(d._k) : n.delete(d._k);
    return n;
  });

  // Mémoïsé : cette boucle tournait à CHAQUE rendu, donc à chaque case cochée.
  const tousCoches = useMemo(
    () => affiches.length > 0 && affiches.every(d => coches.has(d._k)),
    [affiches, coches]);

  /**
   * La production passe par la route du document lui-même : le centre ne
   * compose pas, il orchestre. C'est ce qui évite de dupliquer la mise en page,
   * source des régressions passées.
   */
  async function produire(forme) {
    const total = retenus.length;
    const cad = cadenceMs();
    setTravail({
      total,
      debut: Date.now(),
      estime: cad ? Math.round((total * cad) / 1000) : null,
    });
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
            date_document: dateDoc,
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

        {preselection.length > 0 && (
          <div className="px-3 py-2 rounded-lg bg-iip-turquoise/10 border
                          border-iip-turquoise/30 text-[12.5px] text-iip-blue">
            {preselection.length} étudiant(s) viennent de la liste. Choisissez le document,
            puis cherchez : ils seront cochés, les autres non.
          </div>
        )}

        {travail && (
          <div className="px-3 py-2.5 rounded-lg bg-iip-blue/5 border border-iip-blue/30
                          text-[12.5px] text-iip-blue">
            <div className="font-semibold">
              Votre demande est en cours de traitement.
            </div>
            <div className="text-slate-600 mt-0.5">
              {travail.total} document(s).{' '}
              {travail.estime
                ? `Environ ${travail.estime < 60
                    ? travail.estime + ' seconde(s)'
                    : Math.round(travail.estime / 60) + ' minute(s)'}, d'après vos lots précédents.`
                : "La durée dépend du serveur ; le premier lot servira de repère."}
              {travail.total > 200 && ' Ne fermez pas cette fenêtre.'}
            </div>
          </div>
        )}

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
            {doc.parametres?.includes('ue') && ues.length > 0 && (
              <div className="text-xs w-full">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-500 uppercase tracking-wide">
                    Unités {uesChoisies.size ? `(${uesChoisies.size})` : '— toutes'}
                  </span>
                  <button onClick={() => setUesChoisies(s =>
                    s.size === ues.length ? new Set() : new Set(ues.map(u => u.valeur)))}
                    className="text-[11.5px] text-iip-blue font-semibold">
                    {uesChoisies.size === ues.length ? 'Tout décocher' : 'Tout cocher'}
                  </button>
                </div>
                <div className="border border-slate-300 rounded-lg max-h-36 overflow-y-auto
                                divide-y divide-slate-100">
                  {ues.map(u => (
                    <label key={u.valeur}
                      className={`flex items-center gap-2 px-2 py-1 cursor-pointer text-[12px]
                        ${uesChoisies.has(u.valeur) ? 'bg-iip-blue/5' : 'hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={uesChoisies.has(u.valeur)}
                        onChange={() => { setUesChoisies(s => {
                          const n = new Set(s);
                          n.has(u.valeur) ? n.delete(u.valeur) : n.add(u.valeur);
                          return n;
                        }); setDestinataires(null); }} />
                      <span className="font-mono text-[11px] text-slate-500 w-10 flex-none">
                        {u.valeur}
                      </span>
                      <span className="truncate">{u.libelle}</span>
                    </label>
                  ))}
                </div>
                <span className="block text-[10.5px] text-slate-400 mt-0.5">
                  Aucune cochée = toutes les unités.
                </span>
              </div>
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

            {/* Compte et boutons AU-DESSUS de la liste, et collés en haut : avec
                cent étudiants cochés, il fallait redescendre chercher le bouton. */}
            <div className="sticky top-0 z-10 bg-white pt-1 pb-2 -mx-1 px-1
                            border-b border-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <button onClick={() => toutCocher(!tousCoches)}
                    className="flex items-center gap-1.5 text-[12.5px] text-iip-blue font-semibold">
                    {tousCoches ? <IconSquareCheck size={16} /> : <IconSquare size={16} />}
                    {tousCoches ? 'Tout décocher' : 'Tout cocher'}
                  </button>
                  <span className="text-[13px] font-semibold text-iip-blue">
                    {retenus.length} sélectionné(s) sur {destinataires.total}
                  </span>
                </div>

                <div className="flex gap-2 flex-wrap items-center">
                  <label className="flex items-center gap-1.5 text-[12px] text-slate-600 mr-1">
                    <span className="whitespace-nowrap">Date du document</span>
                    <input type="date" value={dateDoc}
                      onChange={e => setDateDoc(e.target.value)}
                      title="Date portée par le document, et non celle de l'impression"
                      className="border border-slate-300 rounded-lg px-2 py-1 text-[12px]" />
                  </label>
                  {pdfPossible && (
                    <button onClick={() => produire('pdf')} disabled={enCours || !retenus.length}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm bg-iip-blue
                                 text-white font-semibold rounded-lg disabled:opacity-40">
                      <IconFileTypePdf size={15} /> PDF
                    </button>
                  )}
                  <button onClick={() => produire('html')} disabled={enCours || !retenus.length}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm border
                               border-iip-blue text-iip-blue font-semibold rounded-lg
                               disabled:opacity-40">
                    <IconPrinter size={15} /> Imprimer
                  </button>
                  <button onClick={() => produire('zip')} disabled={enCours || !retenus.length}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm border
                               border-slate-300 text-slate-600 font-semibold rounded-lg
                               disabled:opacity-40">
                    <IconFileZip size={15} /> Pièces séparées
                  </button>
                </div>
              </div>
            </div>

            {!affiches.length ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400
                              border-2 border-dashed rounded-xl">
                Personne ne correspond à cette sélection.
              </div>
            ) : (
              <>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl
                                divide-y divide-slate-100">
                  {affiches.slice(0, 400).map(d => (
                    <Ligne key={d._k} d={d} coche={coches.has(d._k)}
                      avecUE={destinataires.maille === 'etudiant_ue'}
                      annee={annee} onBasculer={basculer} />
                  ))}
                  {affiches.length > 400 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      400 premières lignes affichées ; la production portera sur les {retenus.length}.
                    </p>
                  )}
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

/**
 * Une ligne de la liste, mémoïsée.
 *
 * Sans cela, cocher une case redessinait les quatre cents lignes : le
 * navigateur ne repeignait qu'une fois le travail terminé, d'où la lenteur et
 * l'impression qu'il fallait cliquer dans la fenêtre pour voir la liste.
 */
const Ligne = memo(function Ligne({ d, coche, avecUE, annee, onBasculer }) {
  return (
    <label className={`flex items-center gap-3 px-3 py-1.5 cursor-pointer text-[12.5px]
                       ${coche ? 'bg-iip-blue/5' : 'hover:bg-slate-50'}`}>
      <input type="checkbox" checked={coche} onChange={() => onBasculer(d)} />
      <span className="flex-1 min-w-0 truncate"><b>{d.nom}</b> {d.prenom}</span>
      {avecUE && d.ue_num != null && (
        <span className="text-slate-500 flex-none">UE {d.ue_num}</span>
      )}
      <span className="text-slate-400 flex-none">{d.annee_scolaire || annee}</span>
    </label>
  );
});

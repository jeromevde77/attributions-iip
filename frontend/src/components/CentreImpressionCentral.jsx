import { useCallback, useEffect, useMemo, useState } from 'react';
import { nomPropre } from '../lib/nom.js';
import {
  IconPrinter, IconUsers, IconSchool, IconChartBar, IconCalendarStats,
  IconBooks, IconAlertTriangle, IconChevronRight, IconChevronDown, IconSearch,
  IconDownload,
} from '@tabler/icons-react';
import PreviewModal from './PreviewModal.jsx';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre, GroupeFenetre, PieceFenetre } from './ui.jsx';

/**
 * LE CENTRE D'IMPRESSION — un seul endroit d'où tout sort.
 *
 * Dix-huit écrans produisaient des documents, chacun avec sa mécanique et ses
 * options : on ne savait plus où sortir quoi, et la même pièce s'obtenait
 * différemment selon le chemin pris. Les boutons restent où ils sont — on les
 * cherche là où on travaille — mais ils mènent ici.
 *
 * L'onglet Étudiants croise DEUX AXES. Le PÉRIMÈTRE — une section, des unités,
 * des cours pris dans des unités différentes — construit la liste ; la
 * SÉLECTION la restreint à ceux qu'on coche. On peut donc aussi bien sortir
 * toute une section que trois dossiers.
 *
 * UN COURS NE DÉSIGNE QUE DES PERSONNES : les pièces de délibération sont des
 * pièces d'unité, et le restent.
 */

const ONGLETS = [
  { cle: 'etudiants', label: 'Étudiants', icon: IconSchool },
  { cle: 'personnel', label: 'Personnel', icon: IconUsers },
  { cle: 'pilotage', label: 'Pilotage', icon: IconChartBar },
  { cle: 'organisation', label: 'Organisation', icon: IconCalendarStats },
  { cle: 'referentiels', label: 'Référentiels', icon: IconBooks },
];

const PIECES = [
  { cle: 'reussite', label: 'Attestations de réussite', nominatif: true },
  { cle: 'ajournement', label: 'Motivations d’ajournement', nominatif: true },
  { cle: 'refus', label: 'Motivations de refus', nominatif: true },
  { cle: 'pv', label: 'Procès-verbal de délibération', nominatif: false },
  { cle: 'conseil', label: 'Composition du Conseil', nominatif: false },
  { cle: 'grille', label: 'Grille de délibération', nominatif: false },
];

/**
 * LES RAPPORTS D'UN DOMAINE.
 *
 * Le catalogue vient du serveur : ajouter un rapport n'y ajoute pas d'écran.
 * On voit d'abord ce qu'on emporte — cinquante lignes d'aperçu — avant de
 * télécharger : un tableur qu'on découvre après coup se refait deux fois.
 */
function OngletRapports({ domaine }) {
  /* L'ANNÉE SE CHOISIT ICI. Le centre reprenait l'année de travail sans
     jamais la montrer : pour sortir la charge de l'an dernier — ce que
     demandent la dotation, le COPIL et l'AEQES —, il fallait changer l'année
     de toute l'application, faire la pièce, puis penser à la remettre. */
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [session, setSession] = useState(1);
  // UN RAPPORT DE CURSUS NE SE DEMANDE PAS COMME UN RAPPORT D'ÉTABLISSEMENT.
  // Vide, le rapport porte sur toute la maison — c'est ce que veulent le
  // Conseil et la dotation ; choisie, il ne parle que d'une section — c'est ce
  // que veut une coordination. Le même modèle sert les deux.
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  /* LA PORTÉE — le niveau de détail, et ce qu'on a choisi à ce niveau. Un
     logiciel de gestion sert à montrer LES données qu'on choisit : on descend
     de l'établissement à la section, de la section à l'unité, de l'unité au
     cours, au lieu d'avoir une entrée de menu par échelle. */
  const [portee, setPortee] = useState({ niveau: 'etablissement', ue_num: '', code_cours: '' });
  /* L'EFFECTIF SE COMPTE, OU SE POSE. Lucie connaît les inscrits et c'est le
     défaut ; mais une pièce de COPIL se prépare souvent AVANT les
     inscriptions — on projette la rentrée, on simule l'ouverture d'une
     section. Laissé vide, le champ ne change rien. */
  const [etudiants, setEtudiants] = useState('');
  const [ues, setUes] = useState([]);
  const [coursUe, setCoursUe] = useState([]);
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [document0, setDocument0] = useState(null);

  // IMPRIMER, ET PAS SEULEMENT TÉLÉCHARGER. Un tableur se rouvre et s'édite ;
  // il ne se dépose pas dans un dossier, ne s'annexe pas à un courrier et ne
  // se présente pas au Conseil. Pour tout ce qui doit être MONTRÉ plutôt que
  // retravaillé, la pièce manquait — et donc, en pratique, la fonction.
  // La pièce est déjà composée sous les yeux : imprimer ne la recalcule pas,
  // il l'ouvre. Refaire l'appel risquerait d'imprimer autre chose que ce qui
  // est affiché — c'est précisément ce qu'on veut rendre impossible.
  function imprimer() {
    if (!apercu?.html) return;
    setDocument0(apercu);
  }

  useEffect(() => {
    fetch('/api/rapports/catalogue', { headers: authHeaders() })
      .then(r => r.json()).then(j => setCatalogue(j.rapports || []))
      .catch(e => setErreur(e.message));
    fetch(`/api/reunions/perimetre?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json())
      .then(j => { setSections(j.sections || []); setUes(j.ues || []); })
      .catch(() => { /* sans la liste, le filtre reste sur « toutes » */ });
  }, [annee]);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => setAnnees([annee]));
    // eslint-disable-next-line
  }, []);

  // Les cours d'une unité ne se chargent qu'au moment où l'on descend jusque-là.
  useEffect(() => {
    if (portee.niveau !== 'cours' || !portee.ue_num) { setCoursUe([]); return; }
    fetch(`/api/ref/cours?annee=${encodeURIComponent(annee)}&ue_num=${encodeURIComponent(portee.ue_num)}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(l => setCoursUe(Array.isArray(l) ? l : []))
      .catch(() => setCoursUe([]));
  }, [portee.niveau, portee.ue_num, annee]);

  const liste = useMemo(
    () => (catalogue || []).filter(r => r.domaine === domaine), [catalogue, domaine]);
  useEffect(() => { setChoisi(null); setApercu(null); }, [domaine]);

  const corps = (r) => JSON.stringify({
    annee,
    ...(r.params.includes('session') ? { session } : {}),
    ...(r.params.includes('section') && section ? { section } : {}),
    ...(r.params.includes('portee')
      ? { portee: { ...portee, section: section || null } } : {}),
    ...(r.params.includes('etudiants') && etudiants ? { etudiants: Number(etudiants) } : {}),
  });

  /*
   * CE QU'ON VOIT EST CE QUI SORT.
   *
   * L'aperçu montrait un tableau de cinquante lignes : des colonnes grises,
   * sans en-tête d'établissement, sans tuiles, sans graphique — c'est-à-dire
   * tout sauf la pièce. On choisissait « ETP pour TIM » et l'on découvrait un
   * listing ; le document, lui, n'apparaissait qu'après avoir cliqué sur
   * Imprimer, et il ne lui ressemblait pas. Deux rendus pour une même pièce,
   * donc deux occasions de se tromper.
   *
   * L'aperçu EST le document : la page réelle, dans son enveloppe, à l'échelle.
   * Imprimer n'ajoute plus rien — c'est la même page qui part.
   */
  async function voir(r) {
    setChoisi(r); setApercu(null); setErreur(null); setEnCours(true);
    try {
      const rep = await fetch(`/api/rapports/${r.id}/document`, {
        method: 'POST', headers: authHeaders(), body: corps(r),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setApercu(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  // Changer de section ou de session refait la pièce : un aperçu qui ne suit
  // pas ses paramètres ment sur ce qui s'imprimera.
  useEffect(() => { if (choisi) voir(choisi); // eslint-disable-next-line
  }, [section, session, annee, portee, etudiants]);

  async function telecharger() {
    if (!choisi) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/rapports/${choisi.id}/xlsx`, {
        method: 'POST', headers: authHeaders(), body: corps(choisi),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Le tableur n’a pas pu être produit.');
        return;
      }
      const url = URL.createObjectURL(await rep.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${choisi.id}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-[340px] border-r border-slate-200 overflow-auto p-2 space-y-1">
        {liste.map(r => (
          <button key={r.id} onClick={() => voir(r)}
            className={`w-full text-left px-2.5 py-2 rounded-lg border text-[13px]
              ${choisi?.id === r.id ? 'border-iip-blue bg-iip-blue/5'
                : 'border-transparent hover:bg-slate-50'}`}>
            <span className="block text-slate-800">{r.libelle}</span>
            <span className="block text-[11px] text-slate-500">{r.aide}</span>
          </button>
        ))}
        {catalogue && !liste.length && (
          <p className="p-4 text-[13px] text-slate-400">
            Aucun rapport dans ce domaine pour l’instant.
          </p>
        )}
        {!catalogue && <p className="p-4 text-[12px] text-slate-400">Chargement…</p>}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            className="px-2 py-1 text-[12px] border border-slate-300 rounded"
            title="Année sur laquelle porte la pièce">
            {(annees.length ? annees : [annee]).map(a =>
              <option key={a} value={a}>{a}</option>)}
          </select>

          {choisi?.portees?.length > 1 && (
            <>
              <select value={portee.niveau}
                onChange={e => setPortee(p => ({ ...p, niveau: e.target.value }))}
                className="px-2 py-1 text-[12px] border border-slate-300 rounded"
                title="Jusqu'où descendre">
                {choisi.portees.map(n => (
                  <option key={n} value={n}>{{
                    etablissement: "Tout l'établissement", section: 'Une section',
                    ue: 'Une unité', cours: 'Un cours',
                  }[n] || n}</option>
                ))}
              </select>
              {portee.niveau !== 'etablissement' && (
                <select value={section} onChange={e => setSection(e.target.value)}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded">
                  <option value="">Toutes les sections</option>
                  {sections.map(s2 => <option key={s2} value={s2}>{s2}</option>)}
                </select>
              )}
              {(portee.niveau === 'ue' || portee.niveau === 'cours') && (
                <select value={portee.ue_num}
                  onChange={e => setPortee(p => ({ ...p, ue_num: e.target.value, code_cours: '' }))}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded max-w-[16rem]">
                  <option value="">— choisir une unité —</option>
                  {ues.filter(u => !section || u.section === section).map(u => (
                    <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>
                  ))}
                </select>
              )}
              {portee.niveau === 'cours' && !!coursUe.length && (
                <select value={portee.code_cours}
                  onChange={e => setPortee(p => ({ ...p, code_cours: e.target.value }))}
                  className="px-2 py-1 text-[12px] border border-slate-300 rounded max-w-[16rem]">
                  <option value="">Tous les cours de l'unité</option>
                  {coursUe.map(c => (
                    <option key={c.cours_code} value={c.cours_code}>
                      {c.cours_code} — {c.cours_nom}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {choisi?.params?.includes('section') && (
            <select value={section}
              onChange={e => { setSection(e.target.value); setApercu(null); }}
              className="px-2 py-1 text-[12px] border border-slate-300 rounded">
              <option value="">Toutes les sections</option>
              {sections.map(s2 => <option key={s2} value={s2}>{s2}</option>)}
            </select>
          )}
          {choisi?.params?.includes('etudiants') && (
            <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
              Étudiants
              <input type="number" min="0" value={etudiants} placeholder="inscrits"
                onChange={e => setEtudiants(e.target.value)}
                title="Laissez vide pour compter les inscrits encodés dans Lucie ; posez un nombre pour simuler."
                className="w-20 px-2 py-1 text-[12px] border border-slate-300 rounded" />
            </label>
          )}
          {choisi?.params?.includes('session') && (
            <select value={session}
              onChange={e => { setSession(Number(e.target.value)); setApercu(null); }}
              className="px-2 py-1 text-[12px] border border-slate-300 rounded">
              <option value={1}>1re session</option>
              <option value={2}>2e session</option>
            </select>
          )}
          <span className="flex-1" />
          {apercu && (
            <span className="text-[12px] text-slate-500">
              {apercu.nb} ligne(s){apercu.tronque ? ' · 50 premières affichées' : ''}
            </span>
          )}
          {/* IMPRIMER D'ABORD, comme dans le rail : c'est le geste le plus
              fréquent, et il porte la couleur qui le fait trouver. */}
          <button onClick={imprimer} disabled={!choisi || enCours}
            className="controle controle-fort">
            <IconPrinter size={14} /> Imprimer
          </button>
          {/* Une pièce mise en page ne sort pas en tableur : elle n'a pas de
              lignes à retrier, elle a une forme. */}
          {!choisi?.piece && (
            <button onClick={telecharger} disabled={!choisi || enCours}
              className="controle">
              <IconDownload size={14} /> Tableur
            </button>
          )}
        </div>

        {erreur && (
          <div className="m-3 px-3 py-2 rounded-lg bg-amber-50 text-amber-900 text-[13px]
                          flex items-start gap-2">
            <IconAlertTriangle size={15} className="flex-none mt-0.5" /> {erreur}
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0 bg-slate-100 p-3">
          {!choisi && (
            <p className="p-6 text-[13px] text-slate-400">
              Choisissez un rapport à gauche.
            </p>
          )}
          {choisi && !apercu && !erreur && (
            <p className="p-6 text-[13px] text-slate-400">
              {enCours ? 'Composition de la pièce…' : '—'}
            </p>
          )}
          {apercu?.html && (
            /* La page telle qu'elle sortira. Le cadre est isolé : les styles
               du document ne débordent pas sur l'application, et ceux de
               l'application ne viennent pas l'embellir — ce qu'on voit est
               donc bien ce qui s'imprime. */
            <iframe title="Aperçu de la pièce" srcDoc={apercu.html}
              className="w-full bg-white rounded-carte shadow-pose border border-slate-200"
              style={{ height: 'calc(100vh - 14rem)', minHeight: '32rem' }} />
          )}
        </div>
      </div>

      {document0 && (
        <PreviewModal html={document0.html} titre={document0.titre}
          sousTitre={document0.nb ? `${document0.nb} ligne(s)` : null}
          nomFichier={document0.nom}
          typeDoc="rapport"
          astuceImpression="Le format est déjà posé : imprimez tel quel."
          onClose={() => setDocument0(null)} />
      )}
    </div>
  );
}

function OngletEtudiants({ perimetre = null }) {
  const annee = getAnnee();
  const [arbre, setArbre] = useState(null);
  // LE CONTEXTE SUIT LE BOUTON. Ouvrir le centre depuis la délibération d'une
  // unité sans que cette unité soit déjà choisie ferait recommencer un travail
  // qu'on venait de faire : on arrive là où l'on était.
  const [session, setSession] = useState(perimetre?.session === 2 ? 2 : 1);
  const [sections, setSections] = useState(() => new Set(perimetre?.sections || []));
  const [ues, setUes] = useState(() => new Set(perimetre?.ue_nums || []));
  const [cours, setCours] = useState(() => new Set(perimetre?.cours_codes || []));
  const [deplie, setDeplie] = useState(() => new Set());
  const [recherche, setRecherche] = useState('');
  const [liste, setListe] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [choix, setChoix] = useState({ reussite: true, ajournement: true, refus: true });
  const [separer, setSeparer] = useState(
    () => localStorage.getItem('impression.separer') === '1');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch(`/api/perimetre/arborescence?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(setArbre).catch(e => setErreur(e.message));
  }, [annee]);

  const bascule = (set, valeur) => {
    const n = new Set(set);
    n.has(valeur) ? n.delete(valeur) : n.add(valeur);
    return n;
  };

  const charger = useCallback(async () => {
    setErreur(null);
    if (!sections.size && !ues.size && !cours.size) { setListe(null); return; }
    try {
      const rep = await fetch('/api/perimetre/etudiants', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session,
          sections: [...sections], ue_nums: [...ues], cours_codes: [...cours],
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setListe(j);
      // Tous cochés par défaut DANS LE PÉRIMÈTRE choisi : la sélection sert à
      // restreindre, non à tout reconstruire. Rien n'est coché tant qu'aucun
      // périmètre n'est posé.
      setCoches(new Set(j.etudiants.filter(e => e.decide).map(e => e.id)));
    } catch (e) { setErreur(e.message); }
  }, [annee, session, sections, ues, cours]);
  useEffect(() => { charger(); }, [charger]);

  const etudiants = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = liste?.etudiants || [];
    return q ? l.filter(e => `${e.nom} ${e.prenom}`.toLowerCase().includes(q)) : l;
  }, [liste, recherche]);

  async function produire() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/documents-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session, separer,
          ue_nums: (liste?.unites || []).map(u => u.ue_num),
          etudiants: [...coches],
          ...choix,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (j.manques?.length) {
        setErreur(`${j.pieces} pièce(s), mais : ${j.manques.slice(0, 4).join(' · ')}`
          + (j.manques.length > 4 ? ' …' : ''));
      }
      const tout = j.separes
        ? [...(j.collectif ? [j.collectif] : []), ...j.documents]
        : [{ nom: (j.nom || 'documents').replace(/\.html$/, ''), html: j.html }];
      for (const d of tout) {
        const rp = await fetch('/api/impression/pdf', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ html: d.html, nom: d.nom, pagination: 'si-plusieurs' }),
        });
        if (!rp.ok) { setErreur(`${d.etudiant || d.nom} : PDF non produit.`); return; }
        const url = URL.createObjectURL(await rp.blob());
        const a = document.createElement('a');
        a.href = url; a.download = `${d.nom}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        await new Promise(r => setTimeout(r, 350));
      }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const rien = !sections.size && !ues.size && !cours.size;

  return (
    <div className="flex min-h-0 flex-1">
      {/* LE PÉRIMÈTRE */}
      <div className="w-[340px] border-r border-slate-200 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200">
          <div className="text-[13px] font-semibold text-iip-blue mb-1.5">Périmètre</div>
          <div className="segments w-full">
            {[[1, '1re session'], [2, '2e session']].map(([v, lib]) => (
              <button key={v} onClick={() => setSession(v)}
                className={`flex-1 px-2 py-1 text-[12px] ${session === v
                  ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                {lib}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-2">
          {(arbre?.sections || []).map(sec => (
            <div key={sec}>
              <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50
                                cursor-pointer">
                <input type="checkbox" checked={sections.has(sec)}
                  onChange={() => setSections(s => bascule(s, sec))}
                  className="w-4 h-4 accent-iip-blue" />
                <span className="text-[13px] font-medium text-slate-800">{sec}</span>
              </label>
              <div className="pl-4">
                {(arbre?.unites || []).filter(u => u.section === sec).map(u => (
                  <div key={u.ue_num}>
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5">
                      <input type="checkbox" checked={ues.has(u.ue_num)}
                        disabled={sections.has(sec)}
                        onChange={() => setUes(s => bascule(s, u.ue_num))}
                        className="w-3.5 h-3.5 accent-iip-blue disabled:opacity-40" />
                      <button onClick={() => setDeplie(d => bascule(d, u.ue_num))}
                        className="text-slate-400 hover:text-slate-700">
                        {deplie.has(u.ue_num)
                          ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                      </button>
                      <span className="text-[12px] text-slate-700 truncate">
                        <b>{u.ue_num}</b> {u.ue_nom}
                      </span>
                    </div>
                    {deplie.has(u.ue_num) && (
                      <div className="pl-8">
                        {u.cours.map(c => (
                          <label key={c.cours_code}
                            className="flex items-center gap-1.5 px-1.5 py-0.5 cursor-pointer">
                            <input type="checkbox" checked={cours.has(c.cours_code)}
                              disabled={sections.has(sec) || ues.has(u.ue_num)}
                              onChange={() => setCours(s => bascule(s, c.cours_code))}
                              className="w-3.5 h-3.5 accent-iip-blue disabled:opacity-40" />
                            <span className="text-[12px] text-slate-500 truncate">
                              {c.cours_code} {c.cours_nom}
                            </span>
                          </label>
                        ))}
                        {!u.cours.length && (
                          <div className="text-[11px] text-slate-400 px-1.5">aucun cours</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!arbre && <div className="text-[12px] text-slate-400 p-2">Chargement…</div>}
        </div>

        <div className="px-3 py-2 border-t border-slate-200 text-[11px] text-slate-500">
          Un cours sert à désigner des personnes : les pièces restent celles de
          leur unité.
        </div>
      </div>

      {/* LES PERSONNES ET LES PIÈCES */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <div className="relative">
            <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Un nom…"
              className="pl-7 pr-2 py-1 text-[12px] border border-slate-300 rounded-lg w-48" />
          </div>
          <button onClick={() => setCoches(new Set(etudiants.filter(e => e.decide).map(e => e.id)))}
            className="text-[12px] text-iip-blue underline">tout cocher</button>
          <button onClick={() => setCoches(new Set())}
            className="text-[12px] text-slate-500 underline">tout décocher</button>
          <span className="flex-1" />
          <span className="text-[12px] text-slate-500">
            {coches.size} / {etudiants.length} étudiant(s)
            {liste?.unites?.length ? ` · ${liste.unites.length} unité(s)` : ''}
          </span>
        </div>

        {/* CE QU'ON PRODUIT SE DÉCIDE AVANT DE CHOISIR QUI.
            Le choix des pièces et le bouton vivaient SOUS la liste : avec
            seize étudiants on les voyait, avec deux cents il fallait
            parcourir tout l'écran pour les atteindre, et le bouton
            disparaissait à mesure que le travail grossissait. Ils passent
            au-dessus : la liste peut alors s'allonger autant qu'elle veut. */}
        <div className="border-b border-slate-200 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {PIECES.map(p => (
              <label key={p.cle}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
                  cursor-pointer text-[12px] ${choix[p.cle]
                    ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200 text-slate-600'}`}>
                <input type="checkbox" checked={!!choix[p.cle]}
                  onChange={() => setChoix(c => ({ ...c, [p.cle]: !c[p.cle] }))}
                  className="w-3.5 h-3.5 accent-iip-blue" />
                {p.label}
                {!p.nominatif && <span className="text-[10px] text-slate-400">collectif</span>}
              </label>
            ))}
          </div>

          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 text-amber-900 text-[13px]
                            flex items-start gap-2">
              <IconAlertTriangle size={15} className="flex-none mt-0.5" /> {erreur}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" checked={separer}
                onChange={e => {
                  setSeparer(e.target.checked);
                  localStorage.setItem('impression.separer', e.target.checked ? '1' : '0');
                }}
                className="w-4 h-4 accent-iip-blue" />
              Un document par étudiant
            </label>
            <span className="flex-1" />
            <button onClick={produire} disabled={enCours || !coches.size}
              className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">
              <IconPrinter size={14} />
              {enCours ? 'Production…' : `Produire pour ${coches.size} étudiant(s)`}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0">
          {rien && (
            <p className="p-6 text-[13px] text-slate-400">
              Choisissez un périmètre à gauche : une section, des unités, ou des
              cours.
            </p>
          )}
          {!rien && !etudiants.length && (
            <p className="p-6 text-[13px] text-slate-400">
              Aucun étudiant dans ce périmètre.
            </p>
          )}
          {etudiants.map(e => (
            <label key={e.id}
              className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-100
                          cursor-pointer ${e.decide ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={coches.has(e.id)} disabled={!e.decide}
                onChange={() => setCoches(s => bascule(s, e.id))}
                className="w-4 h-4 accent-iip-blue" />
              <span className="flex-1 min-w-0">
                <span className="text-[13px] font-medium">{nomPropre(e.nom, e.prenom)}</span>
                <span className="block text-[11px] text-slate-500">
                  {e.decide
                    ? `${e.reussites} réussite(s) · ${e.echecs} échec(s) sur ${e.unites.length} unité(s)`
                    : 'aucune décision pour cette session'}
                </span>
              </span>
            </label>
          ))}
        </div>

      </div>
    </div>
  );
}

/**
 * LES PIÈCES PROPRES À L'ÉCRAN D'OÙ L'ON VIENT.
 *
 * Certaines éditions ne sont pas des rapports du catalogue : elles ont leur
 * propre fenêtre, bâtie pour elles. Elles occupaient chacune une icône du
 * rail — « Rapport de la liste », « Rapport PAE » —, ce qui revenait à
 * afficher un sommaire au mur plutôt que dans le livre. Elles se déclarent
 * ici, en tête du centre : une pièce de plus ne coûte plus une icône.
 */
function PiecesDeLEcran({ pieces, onChoisir }) {
  if (!pieces || !pieces.length) return null;
  return (
    <GroupeFenetre titre="Pièces de cet écran">
      {pieces.map(p => (
        <PieceFenetre key={p.cle} icone={p.icon} titre={p.label} sous={p.description}
          onClick={() => onChoisir(p)} />
      ))}
    </GroupeFenetre>
  );
}

export default function CentreImpressionCentral({ ongletInitial = 'etudiants',
                                                  perimetre = null, pieces = null,
                                                  onClose }) {
  const [onglet, setOnglet] = useState(ongletInitial);

  return (
    <Fenetre icone={IconPrinter} titre="Éditions"
      sous="Tout ce que Lucie imprime, au même endroit."
      large="pleine" onFermer={onClose}>

      <PiecesDeLEcran pieces={pieces}
        onChoisir={p => { onClose?.(); p.onClick?.(); }} />

      {/* Les domaines : ce qu'on sort ici porte sur les étudiants, le
          personnel, l'établissement… Le domaine ouvert est le seul en marine. */}
      <div className="flex gap-1 flex-wrap mb-4 pb-3 border-b border-slate-200">
        {ONGLETS.map(o => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`px-3 py-1.5 rounded-champ text-[13px] inline-flex items-center gap-1.5
              transition-colors duration-150 ease-ios
              ${onglet === o.cle
                ? 'bg-iip-blue text-white font-semibold'
                : 'text-slate-500 hover:bg-slate-100'}`}>
            <o.icon size={14} /> {o.label}
          </button>
        ))}
      </div>

      {onglet === 'etudiants'
        ? <OngletEtudiants perimetre={perimetre} />
        : <OngletRapports domaine={onglet} />}
    </Fenetre>
  );
}

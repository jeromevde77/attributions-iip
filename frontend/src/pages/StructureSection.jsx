import { useEffect, useRef, useState } from 'react';
import { IconAlertTriangle, IconCopy, IconListCheck, IconSend } from '@tabler/icons-react';
import SchemaCapitalisation from '../components/SchemaCapitalisation.jsx';
import Assistant from '../components/Assistant.jsx';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { svgImprimable } from '../lib/svgImprimable.js';
import { ouvrirApercu } from '../lib/apercu.js';

/**
 * Structure d'une section — schéma de capitalisation éditable.
 *
 * Les prérequis (ue_prerequis) sont la structure stable de la section. L'année
 * d'études dans laquelle chaque UE est placée relève de l'organisation et se
 * modifie ici, par section et par année scolaire.
 */
export default function StructureSection({ annee, sectionInitiale = '' }) {
  const [sections, setSections] = useState([]);
  // Ouvert depuis le laboratoire temporel, il montre la section qu'on y regarde.
  const [section, setSection] = useState(sectionInitiale);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [assistantOuvert, setAssistantOuvert] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        if (!Array.isArray(l)) return;
        setSections(l);
        if (l.length && !section) setSection(l[0].code);
      })
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  const zoneSchema = useRef(null);
  async function imprimerSchema() {
    // Le plus grand dessin de la zone : le schéma lui-même, pas une icône.
    const svgs = [...(zoneSchema.current?.querySelectorAll('svg') || [])]
      .sort((a, b) => b.querySelectorAll('path, rect').length - a.querySelectorAll('path, rect').length);
    const svg = svgImprimable(svgs[0]);
    if (!svg) { await informer('Ouvrez d’abord le schéma de la section.'); return; }
    const rep = await fetch('/api/capitalisation/document', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ section, annee, svg }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { await informer(j.error || 'La pièce n’a pas pu être composée.'); return; }
    ouvrirApercu({ html: j.html, titre: `Schéma de capitalisation — ${section}`, nomFichier: j.nom,
      envoiPossible: false, astuceImpression: null, pdf: { orientation: 'paysage', marge_basse: 14 } });
  }

  async function charger() {
    if (!section || !annee) return;
    setData(null);
    const rep = await fetch(
      `/api/capitalisation/structure?section=${encodeURIComponent(section)}&annee=${annee}`,
      { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : { nodes: [], edges: [], colonnes: [] });
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [section, annee]);

  async function changerNiveau(ueNum, niveau) {
    const rep = await fetch('/api/capitalisation/niveau', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ section, annee, ue_num: ueNum, niveau }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
    setMessage({ type: 'ok', texte: `UE ${ueNum} placée en ${j.niveau || 'niveau du référentiel'}` });
    await charger();
  }

  async function changerQuadri(ueNum, quadri) {
    const rep = await fetch('/api/capitalisation/niveau', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ section, annee, ue_num: ueNum, quadri }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
    setMessage({ type: 'ok', texte: `UE ${ueNum} prévue en ${j.quadri || 'quadrimestre du référentiel'} dans ${section}` });
    await charger();
  }

  async function reprendreAnDernier() {
    const [a1, a2] = annee.split('-').map(Number);
    const source = `${a1 - 1}-${a2 - 1}`;
    if (!(await demander(`Reprendre les années d'études définies en ${source} pour la section ${section} ?`))) return;
    const rep = await fetch('/api/capitalisation/reprendre', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ section, annee, annee_source: source }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
    setMessage({ type: 'ok', texte: `${j.reprises} affectation(s) reprise(s) de ${source}` });
    await charger();
  }

  return (
    <div className="p-5 space-y-4 max-w-none">
      <div>
        <h2 className="titre-ecran mb-0">Schéma de capitalisation</h2>
        <p className="text-sm text-slate-500">
          Structure de la section : les prérequis et l'année d'études de chaque UE — {annee}
        </p>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'ok'
            ? 'bg-emerald-500 text-white border border-emerald-500'
            : 'bg-red-500 text-white border border-red-500'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <button onClick={reprendreAnDernier}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
          <IconCopy size={15} /> Reprendre l'an dernier
        </button>
        {/* LA PIÈCE IMPRIMÉE (3.1.35) : le dessin de l'écran, flèches en
            couloirs comprises, habillé de l'enveloppe commune en A4 paysage. */}
        <button onClick={imprimerSchema} disabled={!data?.nodes?.length}
          className="bouton bouton-sortir controle inline-flex items-center gap-1.5 disabled:opacity-40">
          <IconSend size={15} /> Imprimer le schéma
        </button>
        <button onClick={() => setAssistantOuvert(o => !o)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-iip-turquoise text-iip-turquoise rounded-lg hover:bg-iip-turquoise/5">
          <IconListCheck size={15} /> {assistantOuvert ? "Masquer l'assistant" : 'Mise en route de la section'}
        </button>
      </div>

      {assistantOuvert && section && annee && (
        <Assistant cle="section" params={{ section, annee }}
          onFerme={() => setAssistantOuvert(false)} />
      )}

      {data?.alertes?.length > 0 && (
        <div className="bloc-etat etat-surveiller px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-1.5">
            <IconAlertTriangle size={15} /> Incohérences de progression
          </div>
          <ul className="space-y-1">
            {data.alertes.map((a, i) => (
              <li key={i} className="text-second text-amber-800">{a.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div ref={zoneSchema}>
      <SchemaCapitalisation
        data={data}
        mode="structure"
        onNiveau={changerNiveau}
        onQuadri={changerQuadri}
        titre={`Structure — ${section}`}
      />
      </div>

      <p className="text-xs text-slate-400 border-t pt-3">
        Les liens de prérequis relèvent du référentiel : ils se modifient dans
        Configuration → Prérequis UE, et valent pour toutes les années. Ici ne se règle
        que l'année d'études de chaque UE, propre à la section et à l'année scolaire.
        L'année d'études, elle, est propre à la section et à l'année scolaire : la changer
        met à jour ce schéma, la grille de parcours et la proposition de PAE des étudiants.
      </p>
    </div>
  );
}

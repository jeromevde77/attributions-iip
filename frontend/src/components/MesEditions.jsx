import { useEffect, useMemo, useState } from 'react';
import { IconWriting, IconChartBar, IconChartHistogram, IconUsers, IconFileTypePdf, IconFileSpreadsheet, IconFileText, IconAlertTriangle, IconEye } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { EnteteCarte, ListeEtats, LigneEtat, Encadre } from './ui.jsx';

/**
 * MES ÉDITIONS (3.5.340, Charles, 11 novembre 2026 : « un centre Éditions pour les profs : listes d'étudiants, résultats de leurs
 * cours, étudiants en seconde session, dispensés, présences, statistiques… »). L'enseignant choisit UN de ses cours, puis une
 * pièce : « Aperçu » l'ouvre dans l'aperçu commun ; « PDF » et « Excel » la téléchargent. Le catalogue et les pièces
 * viennent du serveur (`GET /api/mes-cours/editions/catalogue`, `GET /api/mes-cours/editions/:piece?cours=`), sous la règle
 * d'accès de Mes cours. Monté dans Mes cours (fenêtre) et dans l'espace enseignant (face « Mes éditions »), où les téléchargements
 * passent par le relais.
 */
const ICONES = { examens: IconWriting, resultats: IconChartBar, statistiques: IconChartHistogram, etudiants: IconUsers };

async function telecharger(url, nomParDefaut) {
  const r = await fetch(url, { headers: authHeaders() });
  const type = r.headers.get('Content-Type') || '';
  if (!r.ok || type.includes('application/json')) {
    const j = await r.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || 'La pièce n’a pas pu être produite.'), { html: j.html, nom: j.nom });
  }
  const blob = await r.blob();
  const m = /filename="?([^";]+)"?/i.exec(r.headers.get('Content-Disposition') || '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m ? decodeURIComponent(m[1]) : nomParDefaut;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export default function MesEditions({ annee: anneeProp = null }) {
  const annee = anneeProp || getAnnee();
  const [cours, setCours] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [choisi, setChoisi] = useState('');
  const [session, setSession] = useState(1);
  const [enCours, setEnCours] = useState(null);     // `${piece}|${format}`
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    setErreur(null);
    fetch(`/api/mes-cours?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Vos cours ne se lisent pas.'); return j; })
      .then(j => { const l = j.cours || []; setCours(l); setChoisi(c => (l.some(x => x.cours_code === c) ? c : (l.find(x => x.a_moi) || l[0])?.cours_code || '')); })
      .catch(e => { setCours([]); setErreur(e.message); });
    fetch('/api/mes-cours/editions/catalogue', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setCatalogue).catch(() => setCatalogue(null));
  }, [annee]);

  const c = useMemo(() => (cours || []).find(x => x.cours_code === choisi) || null, [cours, choisi]);
  const url = (piece, format, avecSession) => `/api/mes-cours/editions/${piece}?cours=${encodeURIComponent(choisi)}&annee=${encodeURIComponent(annee)}`
    + `${avecSession ? `&session=${session}` : ''}${format ? `&format=${format}` : ''}`;

  const apercu = async p => {
    setErreur(null); setEnCours(`${p.id}|html`);
    try {
      const r = await fetch(url(p.id, 'html', p.session), { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.html) throw new Error(j.error || 'La pièce n’a pas pu être composée.');
      ouvrirApercu({ html: j.html, titre: p.libelle, sousTitre: j.sous || `${choisi} · ${annee}`, nomFichier: j.nom, envoiPossible: false,
        astuceImpression: p.paysage ? 'A4 paysage' : 'A4 portrait' });
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const sortir = async (p, format) => {
    setErreur(null); setEnCours(`${p.id}|${format}`);
    try { await telecharger(url(p.id, format, p.session), `${p.id}_${choisi}.${format}`); }
    catch (e) {
      // Sans PDF sur le serveur : l'aperçu, d'où l'on imprime.
      if (e.html) ouvrirApercu({ html: e.html, titre: p.libelle, nomFichier: e.nom, envoiPossible: false, astuceImpression: p.paysage ? 'A4 paysage' : 'A4 portrait' });
      else setErreur(e.message);
    } finally { setEnCours(null); }
  };

  if (cours === null) return <p className="text-second text-slate-500">Chargement…</p>;
  const miens = cours.filter(x => x.a_moi), section = cours.filter(x => !x.a_moi);
  const libelle = x => `UE ${x.ue_num} · ${x.cours_code}${x.cours_nom ? ` — ${x.cours_nom}` : ''}`;

  return (
    <div className="space-y-3">
      <div className="carte overflow-hidden">
        <EnteteCarte icone={IconFileText} titre="Pour quel cours ?" sous={c ? `${c.nb_etudiants ?? 0} étudiant(s) · ${annee}` : annee}>
          <select className="controle text-sm min-w-0 max-w-full" value={choisi} onChange={e => setChoisi(e.target.value)} aria-label="Le cours">
            {!cours.length && <option value="">Aucun cours cette année</option>}
            {miens.length > 0 && <optgroup label="Mes cours">{miens.map(x => <option key={x.cours_code} value={x.cours_code}>{libelle(x)}</option>)}</optgroup>}
            {section.length > 0 && <optgroup label="Cours de ma section">{section.map(x => <option key={x.cours_code} value={x.cours_code}>{libelle(x)}</option>)}</optgroup>}
          </select>
          <div className="segments flex" role="group" aria-label="Session">
            {[1, 2].map(n => <button key={n} type="button" onClick={() => setSession(n)} title="Pour les pièces qui dépendent de la session"
              className={session === n ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{n === 1 ? '1re session' : '2e session'}</button>)}
          </div>
        </EnteteCarte>
      </div>

      {erreur && <Encadre etat="corriger" icone={IconAlertTriangle} titre={erreur} />}
      {!catalogue && <Encadre etat="surveiller" titre="Le catalogue des pièces ne se lit pas." />}

      {choisi && catalogue && catalogue.familles.map(f => {
        const pieces = catalogue.pieces.filter(p => p.famille === f.k);
        const Ic = ICONES[f.k] || IconFileText;
        return (
          <div key={f.k} className="carte overflow-hidden">
            <EnteteCarte icone={Ic} titre={f.libelle} />
            <ListeEtats className="!border-0 !rounded-none">
              {pieces.map(p => (
                <LigneEtat key={p.id} etat="disponible" titre={p.libelle} sous={p.aide}
                  meta={p.session ? <span className="text-mention text-slate-400">S{session}</span> : null}
                  droite={(
                    <span className="flex-none flex items-center gap-1.5">
                      {enCours?.startsWith(`${p.id}|`) && <span className="text-mention text-slate-400">…</span>}
                      <button type="button" className="bouton inline-flex items-center gap-1" disabled={!!enCours} onClick={() => apercu(p)}
                        title="Ouvrir l’aperçu"><IconEye size={15} /> Aperçu</button>
                      <button type="button" className="bouton inline-flex items-center gap-1" disabled={!!enCours} onClick={() => sortir(p, 'pdf')}
                        title="Télécharger le PDF"><IconFileTypePdf size={15} /> PDF</button>
                      {p.tableur && <button type="button" className="bouton inline-flex items-center gap-1" disabled={!!enCours} onClick={() => sortir(p, 'xlsx')}
                        title="Télécharger le classeur Excel"><IconFileSpreadsheet size={15} /> Excel</button>}
                    </span>
                  )} />
              ))}
            </ListeEtats>
          </div>
        );
      })}
      <p className="text-mention text-slate-400">Ces pièces portent vos cotes de travail : elles sont pour vous, pas pour les étudiants.</p>
    </div>
  );
}

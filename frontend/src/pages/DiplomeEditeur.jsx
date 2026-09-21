import { useEffect, useState } from 'react';
import { estDirection } from '../lib/modules.js';
import { IconDeviceFloppy, IconEye, IconRefresh, IconPhoto, IconX, IconArrowUp, IconArrowDown, IconPlus, IconSignature } from '@tabler/icons-react';

const tok = () => localStorage.getItem('token');
const af = (url, opts = {}) => fetch(url, {
  ...opts,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...(opts.headers || {}) },
}).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });

/* LES SIGNATAIRES D'ORIGINE — ceux d'une co-diplomation HELB. Recopie du
 * défaut serveur (SIGNATAIRES_DEFAUT) pour l'aperçu et le point de départ
 * d'une section nouvelle ; le serveur, lui, applique le sien. */
const SIGNATAIRES_DEFAUT = [
  { qualite: "La Présidente du jury\nd'épreuve intégrée,", nom: '{{president_jury}}' },
  { qualite: 'La Directrice du département\nsanté de la HELB,', nom: 'Catherine Romanus' },
  { qualite: 'La Directrice-Présidente\nde la HELB,', nom: 'Annick Vandeuren' },
  { qualite: "Le Directeur\nde l'Institut Ilya Prigogine,", nom: '{{directeur}}' },
];
const echap = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const blocSignatures = liste => liste.map(x => `<div class="sig-col">
      <div class="role">${echap(x.qualite).replace(/\n/g, '<br>')}</div>
      <div class="nom">${echap(x.nom)}</div>
    </div>`).join('');

function remplaceVars(tpl, vars) {
  let h = tpl;
  for (const [k, v] of Object.entries(vars)) h = h.split(k).join(v ?? '');
  return h;
}

// Étudiant témoin + données propres au diplôme pour l'aperçu
const VARS_DEMO = (etab, assets) => ({
  '{{annee}}': etab.annee || '2025-2026',
  '{{domaine}}': 'Sciences de la santé publique',
  '{{intitule_section}}': 'Bachelier technologue en imagerie médicale',
  '{{grade_academique}}': 'Bachelier technologue en imagerie médicale',
  '{{code_section}}': '914300S36D3',
  '{{date_approbation}}': '5 juillet 2024',
  '{{total_ects}}': '180',
  '{{duree_annees}}': '3',
  '{{nom_etudiant}}': 'TCHAGNAOU',
  '{{prenom_etudiant}}': 'Ahamadou',
  '{{genre}}': 'M',
  '{{article_titulaire}}': 'Le',
  '{{titulaire_nom}}': 'Ahamadou Tchagnaou',
  '{{lieu_naissance}}': 'Bruxelles (Belgique)',
  '{{date_naissance}}': '12 mars 1998',
  '{{registre_national}}': '98.03.12-123.45',
  '{{mention}}': 'Distinction',
  '{{date_deliberation}}': '23 juin 2026',
  '{{president_jury}}': 'Marie Lambert',
  '{{directeur}}': etab.directeur || 'SOHET Charles',
  '{{nom_etab}}': etab.nom || 'INSTITUT ILYA PRIGOGINE',
  '{{adresse_etab}}': etab.adresse || '',
  '{{matricule_etab}}': etab.matricule || '2.132.070',
  '{{fase_etab}}': etab.fase || '292',
  '{{ville_etab}}': etab.ville || 'Anderlecht',
  '{{logo_iip}}': assets.logo_iip || '',
  '{{logo_helb}}': assets.logo_helb || '',
  '{{sceau}}': assets.sceau || '',
  '{{signature_directeur}}': assets.signature || '',
});

export default function DiplomeEditeur({ assets = {} }) {
  const [html, setHtml] = useState('');
  const [initial, setInitial] = useState('');
  const [etab, setEtab] = useState({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoHelb, setLogoHelb] = useState('');
  const [signatures, setSignatures] = useState({});   // { section: [{ qualite, nom }] }
  const [sections, setSections] = useState([]);
  const [secSig, setSecSig] = useState('');
  const [liste, setListe] = useState(null);          // liste en cours d'édition
  const [sigOk, setSigOk] = useState(false);

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const peutEcrire = estDirection(me);

  useEffect(() => {
    Promise.all([
      af('/api/config/diplome_template').then(d => d.valeur).catch(() => ''),
      af('/api/config/attestation_etab').then(d => { try { return JSON.parse(d.valeur); } catch { return {}; } }).catch(() => ({})),
      af('/api/config/diplome_logo_helb').then(d => d.valeur).catch(() => ''),
      af('/api/config/diplome_signatures').then(d => { try { return JSON.parse(d.valeur) || {}; } catch { return {}; } }).catch(() => ({})),
      af('/api/ref/sections').catch(() => []),
    ]).then(([tpl, e, helb, sig, secs]) => {
      setHtml(tpl); setInitial(tpl); setEtab(e); setLogoHelb(helb || '');
      setSignatures(sig && typeof sig === 'object' ? sig : {});
      setSections(Array.isArray(secs) ? secs : []);
    }).finally(() => setLoading(false));
  }, []);

  /* Choisir une section charge SA liste ; sans liste propre, on part des
     signataires d'origine — c'est ce que son diplôme porte aujourd'hui. */
  useEffect(() => {
    if (!secSig) { setListe(null); return; }
    const l = signatures[secSig];
    setListe((Array.isArray(l) && l.length ? l : SIGNATAIRES_DEFAUT).map(x => ({ ...x })));
  }, [secSig, signatures]);

  const propre = !!(secSig && Array.isArray(signatures[secSig]) && signatures[secSig].length);
  const listeModifiee = liste && JSON.stringify(liste) !== JSON.stringify(
    (propre ? signatures[secSig] : SIGNATAIRES_DEFAUT));

  const poser = (i, patch) => setListe(l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const deplacer = (i, d) => setListe(l => {
    const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  async function enregistrerSignatures(nouvelle) {
    setErr('');
    const suivant = { ...signatures };
    if (nouvelle === null) delete suivant[secSig];
    else suivant[secSig] = nouvelle.filter(x => x.qualite.trim() || x.nom.trim());
    try {
      await af('/api/config/diplome_signatures', { method: 'PUT', body: JSON.stringify({ valeur: JSON.stringify(suivant) }) });
      setSignatures(suivant); setSigOk(true); setTimeout(() => setSigOk(false), 2500);
    } catch (e) { setErr(e.message); }
  }

  const dirty = html !== initial;

  const apercu = () => {
    // L'aperçu signe avec la section choisie ci-dessous, sinon avec la liste d'origine.
    const vars = VARS_DEMO(etab, { ...assets, logo_helb: logoHelb });
    const avecSig = html.split('{{signatures}}').join(blocSignatures(liste || SIGNATAIRES_DEFAUT));
    const rendu = remplaceVars(avecSig, vars);
    const w = window.open('', '_blank');
    if (!w) { alert('Autorisez les pop-ups pour voir l’aperçu.'); return; }
    w.document.open(); w.document.write(rendu); w.document.close();
  };

  const importerHelb = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setErr('Veuillez sélectionner un fichier image (PNG de préférence).'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = String(reader.result || '');
      setLogoHelb(dataUri);
      setErr('');
      try {
        await af('/api/config/diplome_logo_helb', { method: 'PUT', body: JSON.stringify({ valeur: dataUri }) });
        setSaved(true); setTimeout(() => setSaved(false), 2500);
      } catch (e) { setErr(e.message); }
    };
    reader.readAsDataURL(file);
  };
  const retirerHelb = async () => {
    setLogoHelb('');
    try { await af('/api/config/diplome_logo_helb', { method: 'PUT', body: JSON.stringify({ valeur: '' }) }); } catch (e) { setErr(e.message); }
  };

  const enregistrer = async () => {
    setErr(''); setBusy(true);
    try {
      await af('/api/config/diplome_template', { method: 'PUT', body: JSON.stringify({ valeur: html }) });
      setInitial(html); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const restaurer = async () => {
    if (!confirm('Restaurer le modèle de diplôme par défaut ? Vos modifications non enregistrées seront perdues.')) return;
    try { const d = await af('/api/config/diplome_template_defaut'); setHtml(d.valeur); } catch (e) { setErr(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement du modèle…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-title text-lg text-iip-blue">Modèle de diplôme</h2>
          <p className="text-xs text-gray-500">Co-diplomation HELB · enseignement pour adultes. Éditez le HTML ; les champs <code>{'{{...}}'}</code> sont remplis avec les données de l'étudiant (comme l'attestation).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={apercu} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"><IconEye size={16}/> Aperçu</button>
          {peutEcrire && <button onClick={restaurer} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"><IconRefresh size={16}/> Défaut</button>}
          {peutEcrire && <button onClick={enregistrer} disabled={!dirty || busy} className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white disabled:opacity-40"><IconDeviceFloppy size={16}/> {busy ? '…' : 'Enregistrer'}</button>}
        </div>
      </div>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
      {saved && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Modèle enregistré.</div>}
      {!peutEcrire && <div className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Lecture seule — seule la direction (admin) peut modifier le modèle.</div>}

      {peutEcrire && (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-sm text-gray-600 flex items-center gap-1.5"><IconPhoto size={16}/> Logo HELB (co-diplomation) :</span>
          {logoHelb
            ? <span className="flex items-center gap-2">
                <img src={logoHelb} alt="Logo HELB" className="h-8 w-auto border border-gray-100 rounded bg-white" />
                <button onClick={retirerHelb} className="text-gray-400 hover:text-red-500" title="Retirer"><IconX size={15}/></button>
              </span>
            : <span className="text-xs text-gray-400 italic">aucun logo importé</span>}
          <label className="ml-auto text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-iip-blue hover:bg-gray-50 cursor-pointer">
            Importer une image…
            <input type="file" accept="image/*" className="hidden" onChange={e => { importerHelb(e.target.files?.[0]); e.target.value=''; }} />
          </label>
        </div>
      )}


      {/* LES SIGNATAIRES, SECTION PAR SECTION.
          Demandé par Charles le 21 septembre 2026 : le bloc de signature
          change d'une section à l'autre — quatre signatures pour une
          co-diplomation HELB, deux pour un titre propre de l'IIP. Le modèle
          reste unique ; seul l'emplacement {{signatures}} change de contenu.
          Le bloc « Au nom du Gouvernement… le titulaire » n'en fait pas
          partie : il est le même pour toutes les sections. */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-iip-blue flex items-center gap-1.5">
            <IconSignature size={16}/> Signataires par section
          </span>
          <select value={secSig} onChange={e => setSecSig(e.target.value)}
            className="controle text-[13px] min-w-[14rem]">
            <option value="">— choisir une section —</option>
            {sections.map(s0 => (
              <option key={s0.code} value={s0.code}>
                {s0.libelle || s0.code}{Array.isArray(signatures[s0.code]) && signatures[s0.code].length ? ' ✓' : ''}
              </option>
            ))}
          </select>
          {secSig && (
            <span className="text-[12px] text-gray-500">
              {propre ? 'Liste propre à cette section.'
                : 'Pas encore de liste propre : son diplôme porte les signataires d’origine (co-diplomation HELB).'}
            </span>
          )}
        </div>
        {liste && (
          <>
            <div className="space-y-1.5">
              {liste.map((x, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[11px] text-gray-400 w-4 pt-2 tabular-nums">{i + 1}</span>
                  <textarea rows={2} value={x.qualite} disabled={!peutEcrire}
                    onChange={e => poser(i, { qualite: e.target.value })}
                    placeholder="Qualité — « Le Directeur » ↵ « de l'Institut Ilya Prigogine, »"
                    className="controle h-auto py-1 text-[13px] flex-1" />
                  <input value={x.nom} disabled={!peutEcrire}
                    onChange={e => poser(i, { nom: e.target.value })}
                    placeholder="Nom — ou {{directeur}}, {{president_jury}}"
                    className="controle text-[13px] w-64" />
                  {peutEcrire && (
                    <span className="flex gap-0.5 pt-1">
                      <button className="bouton px-1.5" title="Monter" onClick={() => deplacer(i, -1)}><IconArrowUp size={14}/></button>
                      <button className="bouton px-1.5" title="Descendre" onClick={() => deplacer(i, 1)}><IconArrowDown size={14}/></button>
                      <button className="bouton px-1.5" title="Retirer" onClick={() => setListe(l => l.filter((_, j) => j !== i))}><IconX size={14}/></button>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              De gauche à droite sur le diplôme, dans cet ordre. Une qualité sur deux lignes s’écrit avec un retour
              à la ligne. <code>{'{{directeur}}'}</code> et <code>{'{{president_jury}}'}</code> se remplissent
              d’eux-mêmes. « Au nom du Gouvernement… le titulaire » reste commun à toutes les sections.
            </p>
            {peutEcrire && (
              <div className="flex flex-wrap items-center gap-2">
                <button className="bouton" onClick={() => setListe(l => [...l, { qualite: '', nom: '' }])}>
                  <IconPlus size={14} className="inline -mt-0.5 mr-1"/>Ajouter un signataire
                </button>
                <button className="bouton bouton-fort disabled:opacity-40" disabled={!listeModifiee && propre}
                  onClick={() => enregistrerSignatures(liste)}>
                  Enregistrer pour {sections.find(s0 => s0.code === secSig)?.libelle || secSig}
                </button>
                {propre && (
                  <button className="bouton" onClick={() => { if (confirm('Revenir aux signataires d’origine pour cette section ?')) enregistrerSignatures(null); }}>
                    Revenir à la liste d’origine
                  </button>
                )}
                {sigOk && <span className="text-[12px] text-green-700">Signataires enregistrés.</span>}
              </div>
            )}
            {!html.includes('{{signatures}}') && (
              <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Votre modèle n’a pas d’emplacement <code>{'{{signatures}}'}</code> : Lucie remplacera son bloc de
                signatures actuel par la liste de la section. Pour le rendre explicite, remplacez dans le modèle les
                colonnes de signataires par <code>{'{{signatures}}'}</code>, ou restaurez le modèle par défaut.
              </p>
            )}
          </>
        )}
      </div>

      <textarea
        value={html}
        onChange={e => setHtml(e.target.value)}
        readOnly={!peutEcrire}
        spellCheck={false}
        className="w-full h-[60vh] font-mono text-[12px] leading-snug border border-gray-300 rounded-lg p-3 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-iip-turquoise"
      />

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer text-iip-blue">Champs disponibles</summary>
        <div className="mt-1 grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-0.5 font-mono">
          {['{{nom_etudiant}}','{{prenom_etudiant}}','{{genre}}','{{lieu_naissance}}','{{date_naissance}}','{{registre_national}}','{{intitule_section}}','{{grade_academique}}','{{code_section}}','{{date_approbation}}','{{total_ects}}','{{duree_annees}}','{{domaine}}','{{mention}}','{{annee}}','{{date_deliberation}}','{{president_jury}}','{{directeur}}','{{ville_etab}}','{{nom_etab}}','{{adresse_etab}}','{{matricule_etab}}','{{fase_etab}}','{{logo_iip}}','{{logo_helb}}','{{sceau}}','{{signature_directeur}}','{{signatures}}'].map(v => <span key={v}>{v}</span>)}
        </div>
      </details>
    </div>
  );
}

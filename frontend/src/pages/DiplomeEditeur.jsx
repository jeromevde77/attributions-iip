import { useEffect, useState } from 'react';
import { estDirection } from '../lib/modules.js';
import { IconDeviceFloppy, IconEye, IconRefresh, IconPhoto, IconX, IconArrowUp, IconArrowDown, IconPlus, IconSignature } from '@tabler/icons-react';
import { ouvrirApercu } from '../lib/apercu.js';
import { demander } from '../lib/dialogue.jsx';

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
// Titre propre de l'IIP : le jury et la direction, sans la HELB.
const SIGNATAIRES_IIP = [
  { qualite: "La Présidente du jury\nd'épreuve intégrée,", nom: '{{president_jury}}' },
  { qualite: "Le Directeur\nde l'Institut Ilya Prigogine,", nom: '{{directeur}}' },
];
// Un modèle enregistré avant 2.12.108 porte l'image HELB en dur : c'est
// l'emplacement des logos. Même lecture que le serveur (poserLogos).
const avecEmplacementLogos = h => (/\{\{\s*logos\s*\}\}/.test(h) ? h
  : h.replace(/<img[^>]*\{\{\s*logo_helb\s*\}\}[^>]*>/, '{{logos}}'));
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

/**
 * LES SIGNATAIRES, À LA SOURIS (Charles, 27 septembre 2026 : « je dois avoir un
 * éditeur pour choisir qui signe ; des tuiles transparentes à droite du modèle,
 * et on glisse autant que possible »).
 *
 * À gauche, le diplôme tel qu'il sortira, redessiné à chaque geste. À droite,
 * les signataires connus en tuiles : on les glisse dans la rangée des
 * signatures, dans l'ordre de gauche à droite ; on les réordonne en les
 * glissant dans la rangée ; on en retire un par sa croix. Un clic sur une tuile
 * posée en ouvre le libellé. Rien ne s'écrit avant « Enregistrer ».
 */
function EditeurSignataires({ liste, setListe, palette, peutEcrire, rendu }) {
  const [survol, setSurvol] = useState(null);
  const [edition, setEdition] = useState(null);
  const lire = e => { try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return null; } };
  const deposer = (e, index) => {
    e.preventDefault(); setSurvol(null);
    const d = lire(e); if (!d || !peutEcrire) return;
    setListe(l => {
      const n = [...l];
      if (d.de === 'palette') n.splice(index, 0, { qualite: d.item.qualite, nom: d.item.nom });
      else if (d.de === 'ligne') {
        const [x] = n.splice(d.index, 1);
        n.splice(d.index < index ? index - 1 : index, 0, x);
      }
      return n;
    });
  };
  const Tuile = ({ x, onX, ...rest }) => (
    <div {...rest} className={`relative select-none rounded-champ border border-dashed border-slate-300 bg-white/60 backdrop-blur-sm px-2.5 py-1.5 text-xs leading-snug text-iip-blue ${peutEcrire ? 'cursor-grab active:cursor-grabbing hover:border-iip-blue' : ''} ${rest.className || ''}`}>
      <div className="whitespace-pre-line">{x.qualite || <i className="text-slate-400">qualité</i>}</div>
      <div className="font-semibold mt-0.5">{x.nom || <i className="text-slate-400 font-normal">nom</i>}</div>
      {onX && peutEcrire && (
        <button type="button" onClick={e => { e.stopPropagation(); onX(); }} title="Retirer"
          className="absolute -top-2 -right-2 w-5 h-5 grid place-items-center rounded-full bg-white border border-slate-300 text-slate-500 hover:text-iip-texte">
          <IconX size={11} />
        </button>
      )}
    </div>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] items-start">
      <div className="space-y-2 min-w-0">
        {/* La rangée des signatures : là où l'on dépose, dans l'ordre du diplôme. */}
        <div className="rounded-carte border border-slate-200 bg-slate-50/60 p-2">
          <div className="text-xs text-slate-500 mb-1.5">Signataires du diplôme, de gauche à droite — glissez une tuile ici</div>
          <div className="flex flex-wrap items-stretch gap-2 min-h-[3.5rem]"
            onDragOver={e => { e.preventDefault(); if (survol == null) setSurvol(liste.length); }}
            onDragLeave={() => setSurvol(null)}
            onDrop={e => deposer(e, survol ?? liste.length)}>
            {liste.map((x, i) => (
              <div key={i} className="flex items-stretch gap-2"
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSurvol(i); }}
                onDrop={e => { e.stopPropagation(); deposer(e, i); }}>
                {survol === i && <div className="w-1 rounded-full bg-iip-blue" />}
                <Tuile x={x} draggable={peutEcrire}
                  onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ de: 'ligne', index: i }))}
                  onClick={() => peutEcrire && setEdition(edition === i ? null : i)}
                  onX={() => { setListe(l => l.filter((_, j) => j !== i)); setEdition(null); }}
                  className={edition === i ? 'ring-2 ring-iip-blue/30' : ''} />
              </div>
            ))}
            {survol === liste.length && <div className="w-1 rounded-full bg-iip-blue" />}
            {!liste.length && <span className="text-second text-slate-400 self-center">Aucun signataire : glissez-en un depuis la droite.</span>}
          </div>
          {edition != null && liste[edition] && (
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <textarea rows={2} value={liste[edition].qualite} autoFocus
                onChange={e => setListe(l => l.map((x, j) => (j === edition ? { ...x, qualite: e.target.value } : x)))}
                placeholder="Qualité — « Le Directeur » ↵ « de l'Institut Ilya Prigogine, »"
                className="controle h-auto py-1 text-sm flex-1 min-w-[16rem]" />
              <input value={liste[edition].nom}
                onChange={e => setListe(l => l.map((x, j) => (j === edition ? { ...x, nom: e.target.value } : x)))}
                placeholder="Nom — ou {{directeur}}, {{president_jury}}" className="controle text-sm w-64" />
              <button type="button" className="bouton bouton-compact" onClick={() => setEdition(null)}>OK</button>
            </div>
          )}
        </div>
        {/* Le diplôme, redessiné à chaque geste. */}
        <div className="rounded-carte border border-slate-200 bg-white overflow-hidden">
          <div style={{ width: '100%', aspectRatio: '297 / 210', position: 'relative' }}>
            <iframe title="Aperçu du diplôme" srcDoc={rendu} className="absolute inset-0 border-0"
              style={{ width: '1123px', height: '794px', transform: 'scale(var(--k))', transformOrigin: '0 0' }}
              ref={el => { if (!el) return; const f = () => el.style.setProperty('--k', String(el.parentElement.clientWidth / 1123)); f(); new ResizeObserver(f).observe(el.parentElement); }} />
          </div>
        </div>
      </div>
      {/* Les tuiles disponibles : on les glisse, elles restent ici. */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signataires disponibles</div>
        {palette.map((x, i) => (
          <Tuile key={i} x={x} draggable={peutEcrire}
            onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ de: 'palette', item: x }))}
            onDoubleClick={() => peutEcrire && setListe(l => [...l, { ...x }])}
            title="Glissez vers la rangée des signatures (ou double-cliquez)" />
        ))}
        {peutEcrire && (
          <Tuile x={{ qualite: 'Nouveau signataire', nom: '' }} draggable
            onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ de: 'palette', item: { qualite: '', nom: '' } }))}
            onDoubleClick={() => setListe(l => [...l, { qualite: '', nom: '' }])}
            className="border-iip-blue/40 text-slate-500" />
        )}
        <p className="text-xs text-slate-500">
          <code>{'{{directeur}}'}</code> et <code>{'{{president_jury}}'}</code> se remplissent d'eux-mêmes.
          « Au nom du Gouvernement… le titulaire » reste commun à toutes les sections.
        </p>
      </div>
    </div>
  );
}

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
  // LE PRÉSIDENT DU JURY, PAR SECTION (7 octobre 2026) — une autre personne que le directeur.
  const [presidents, setPresidents] = useState({});   // { section: nom }
  const [presidentSaisi, setPresidentSaisi] = useState('');
  useEffect(() => {
    af('/api/config/diplome_president_jury').then(d => { try { setPresidents(JSON.parse(d.valeur) || {}); } catch { setPresidents({}); } })
      .catch(() => setPresidents({}));
  }, []);
  const [sections, setSections] = useState([]);
  const [secSig, setSecSig] = useState('');
  const [liste, setListe] = useState(null);          // liste en cours d'édition
  const [sigOk, setSigOk] = useState(false);
  const [cologo, setCologo] = useState({});           // { section: bool } — co-diplomation HELB
  // Les VRAIES données de la section choisie : l'aperçu ne montre plus TIM pour tout le monde.
  const [donneesSec, setDonneesSec] = useState(null);
  useEffect(() => {
    if (!secSig) { setDonneesSec(null); return; }
    af(`/api/diplomes/donnees-section?section=${encodeURIComponent(secSig)}`).then(setDonneesSec).catch(() => setDonneesSec(null));
  }, [secSig]);
  const varsSection = d => (d ? {
    '{{intitule_section}}': d.intitule_section, '{{grade_academique}}': d.grade_academique,
    '{{code_section}}': d.code_section, '{{domaine}}': d.domaine, '{{date_approbation}}': d.date_approbation,
    '{{duree_annees}}': d.duree_annees, '{{total_ects}}': d.total_ects, '{{type_enseignement}}': d.type_enseignement,
  } : { '{{type_enseignement}}': 'Enseignement supérieur de type court' });
  const coDiplomee = sec => !!sec && (cologo[sec] ?? sec === 'TIM');
  const signatairesDefaut = sec => (coDiplomee(sec) ? SIGNATAIRES_DEFAUT : SIGNATAIRES_IIP);

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const peutEcrire = estDirection(me);

  useEffect(() => {
    Promise.all([
      af('/api/config/diplome_template').then(d => d.valeur).catch(() => ''),
      af('/api/config/attestation_etab').then(d => { try { return JSON.parse(d.valeur); } catch { return {}; } }).catch(() => ({})),
      af('/api/config/diplome_logo_helb').then(d => d.valeur).catch(() => ''),
      af('/api/config/diplome_signatures').then(d => { try { return JSON.parse(d.valeur) || {}; } catch { return {}; } }).catch(() => ({})),
      af('/api/ref/sections').catch(() => []),
      af('/api/config/diplome_cologo_helb').then(d => { try { return JSON.parse(d.valeur) || {}; } catch { return {}; } }).catch(() => ({})),
    ]).then(([tpl, e, helb, sig, secs, co]) => {
      setCologo(co && typeof co === 'object' ? co : {});
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
    setListe((Array.isArray(l) && l.length ? l : signatairesDefaut(secSig)).map(x => ({ ...x })));
  }, [secSig, signatures, cologo]);

  const propre = !!(secSig && Array.isArray(signatures[secSig]) && signatures[secSig].length);
  const listeModifiee = liste && JSON.stringify(liste) !== JSON.stringify(
    (propre ? signatures[secSig] : signatairesDefaut(secSig)));

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

  /* UN SEUL MODÈLE, identique partout (Charles, 27 septembre 2026) : ce qui
     change d'une section à l'autre — ses données, le logo de co-diplomation,
     les signataires — passe par des champs, jamais par une copie du modèle. */
  const modele = html;
  const setModele = setHtml;
  const dirty = html !== initial;
  /* LE LOGO SELON LA SECTION : l'image importée est le logo de CO-DIPLOMATION
     (IIP et HELB ensemble) — elle remplace celui de l'IIP, comme au serveur. */
  const logosDe = sec => (logoHelb && coDiplomee(sec)
    ? `<img src="${logoHelb}" class="logo-img" alt="Institut Ilya Prigogine — HELB" />`
    : `<img src="${assets.logo_iip || ''}" class="logo-img" alt="Institut Ilya Prigogine" />`);

  /* Le rendu du diplôme avec la liste en cours — la même règle que le
     serveur (poserSignatures) : l'emplacement {{signatures}} s'il existe,
     sinon les colonnes écrites en dur dans le bloc des signatures. */
  const rendre = (l) => {
    // Une donnée de section absente se VOIT dans l'aperçu : elle manquera aussi sur le diplôme.
    const vs = Object.fromEntries(Object.entries(varsSection(donneesSec)).map(([k, v]) => [k, v || `[${k.slice(2, -2)} à compléter]`]));
    const vars = { ...VARS_DEMO(etab, { ...assets, logo_helb: logoHelb }), ...vs };
    const bloc = blocSignatures(l || signatairesDefaut(secSig));
    let h = avecEmplacementLogos(modele);
    if (/\{\{\s*signatures\s*\}\}/.test(h)) h = h.split('{{signatures}}').join(bloc);
    else h = h.replace(/(<div class="signatures">)[\s\S]*?(<div class="gouv">)/, `$1\n    ${bloc}\n    $2`);
    return remplaceVars(h.split('{{logos}}').join(logosDe(secSig)), vars);
  };
  // Les tuiles : les signataires d'origine, puis tous ceux déjà posés ailleurs.
  const palette = (() => {
    const vus = new Set(), out = [];
    for (const x of [...SIGNATAIRES_DEFAUT, ...SIGNATAIRES_IIP, ...Object.values(signatures).flat()]) {
      if (!x) continue;
      const k = `${x.qualite}|${x.nom}`; if (vus.has(k)) continue; vus.add(k); out.push({ qualite: x.qualite || '', nom: x.nom || '' });
    }
    return out;
  })();

  const apercu = () => {
    // L'aperçu est celui de la section choisie en tête : son modèle, son logo, ses signataires.
    ouvrirApercu({ html: rendre(liste), titre: `Aperçu du modèle de diplôme${secSig ? ' — ' + (sections.find(x => x.code === secSig)?.libelle || secSig) : ''}`,
                   nomFichier: 'Diplome_apercu', envoiPossible: false });
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
      setInitial(html);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const restaurer = async () => {
    if (!(await demander('Restaurer le modèle de diplôme par défaut ? Vos modifications non enregistrées seront perdues.'))) return;
    try { const d = await af('/api/config/diplome_template_defaut'); setModele(d.valeur); } catch (e) { setErr(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement du modèle…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-title text-lg text-iip-blue">Modèle de diplôme</h2>
          <p className="text-xs text-gray-500">Une page identique pour toutes les sections. Ce qui change se remplit seul : les données de la section et de l'étudiant (champs <code>{'{{...}}'}</code>), le logo si co-diplomation, les signataires.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={apercu} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"><IconEye size={16}/> Aperçu</button>
          {peutEcrire && <button onClick={restaurer} className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"><IconRefresh size={16}/> Défaut</button>}
          {peutEcrire && <button onClick={enregistrer} disabled={!dirty || busy} className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white disabled:opacity-40"><IconDeviceFloppy size={16}/> {busy ? '…' : 'Enregistrer'}</button>}
        </div>
      </div>

      {err && <div className="bloc-etat etat-corriger text-sm text-red-600 px-3 py-2">{err}</div>}
      {saved && <div className="bloc-etat etat-reussi text-sm text-green-700 px-3 py-2">Modèle enregistré.</div>}
      {!peutEcrire && <div className="text-xs text-gray-500 bg-amber-500 border border-amber-500 rounded-lg px-3 py-2">Lecture seule — seule la direction (admin) peut modifier le modèle.</div>}

      {/* LA SECTION D'ABORD (Charles, 27 septembre 2026 : « en fonction de la
          section, le contenu est différent ») : elle décide du modèle, du logo
          et des signataires — tout ce qui suit parle de CE diplôme-là. */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
        <span className="text-sm font-semibold text-iip-blue">Section</span>
        <select value={secSig} onChange={e => setSecSig(e.target.value)} className="controle text-sm min-w-[14rem]">
          <option value="">— choisir la section à prévisualiser —</option>
          {sections.map(s0 => (
            <option key={s0.code} value={s0.code}>
              {s0.libelle || s0.code}
            </option>
          ))}
        </select>
        {secSig && (
          <>
            <label className="flex items-center gap-1.5 text-second text-gray-700">
              <input type="checkbox" checked={coDiplomee(secSig)} disabled={!peutEcrire}
                onChange={async e => {
                  const suivant = { ...cologo, [secSig]: e.target.checked };
                  try {
                    await af('/api/config/diplome_cologo_helb', { method: 'PUT', body: JSON.stringify({ valeur: JSON.stringify(suivant) }) });
                    setCologo(suivant);
                  } catch (er) { setErr(er.message); }
                }} />
              Co-diplomation HELB <span className="text-gray-400">— logo IIP + HELB, signataires HELB par défaut</span>
            </label>
          </>
        )}
      </div>

      {peutEcrire && (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <span className="text-sm text-gray-600 flex items-center gap-1.5"><IconPhoto size={16}/> Logo de co-diplomation (IIP + HELB) :</span>
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
          {!secSig && <span className="text-second text-gray-500">Choisissez une section en tête pour régler ses signataires.</span>}
          {secSig && (
            <span className="text-second text-gray-500">
              {propre ? 'Liste propre à cette section.'
                : coDiplomee(secSig) ? 'Pas encore de liste propre : les signataires de la co-diplomation HELB.'
                : 'Pas encore de liste propre : le jury et la direction de l’IIP.'}
            </span>
          )}
        </div>
        {secSig && (
          <div className="flex flex-wrap items-end gap-2 border border-slate-200 rounded-lg p-2.5">
            <label className="text-second"><span className="block text-slate-600">Président(e) du jury d’épreuve intégrée — {secSig}</span>
              <input key={secSig} className="controle w-72 text-sm" defaultValue={presidents[secSig] || ''} disabled={!peutEcrire}
                placeholder="Prénom NOM — une autre personne que le directeur"
                onChange={e => setPresidentSaisi(e.target.value)} /></label>
            {peutEcrire && <button className="bouton" onClick={async () => {
              const nom = (presidentSaisi || presidents[secSig] || '').trim();
              const suivant = { ...presidents, [secSig]: nom };
              if (!nom) delete suivant[secSig];
              try {
                await af('/api/config/diplome_president_jury', { method: 'PUT', body: JSON.stringify({ valeur: JSON.stringify(suivant) }) });
                setPresidents(suivant); setSigOk(true); setTimeout(() => setSigOk(false), 2500);
              } catch (e) { setErr(e.message); }
            }}>Enregistrer le président</button>}
            <span className="text-xs text-slate-500 min-w-0">Remplit <code>{'{{president_jury}}'}</code>. Le titulaire, le président du jury et la direction
              sont trois personnes différentes : un diplôme qui porterait deux fois le même nom ne sort pas.</span>
            {presidents[secSig] && etab.directeur && presidents[secSig].toLowerCase().replace(/\s+/g, ' ').split(' ').sort().join(' ')
              === etab.directeur.toLowerCase().replace(/\s+/g, ' ').split(' ').sort().join(' ') && (
              <span className="text-second text-amber-700">⚠ C’est le nom du directeur : choisissez une autre personne.</span>)}
          </div>)}
        {liste && (
          <>
            <EditeurSignataires liste={liste} setListe={setListe} palette={palette}
              peutEcrire={peutEcrire} rendu={rendre(liste)} />
            {peutEcrire && (
              <div className="flex flex-wrap items-center gap-2">
                <button className="bouton bouton-fort disabled:opacity-40" disabled={!listeModifiee && propre}
                  onClick={() => enregistrerSignatures(liste)}>
                  Enregistrer pour {sections.find(s0 => s0.code === secSig)?.libelle || secSig}
                </button>
                {propre && (
                  <button className="bouton" onClick={async () => { if (await demander('Revenir aux signataires d’origine pour cette section ?')) enregistrerSignatures(null); }}>
                    Revenir à la liste d’origine
                  </button>
                )}
                {sigOk && <span className="text-second text-green-700">Signataires enregistrés.</span>}
              </div>
            )}
            {!modele.includes('{{signatures}}') && (
              <p className="text-second text-white bg-amber-500 border border-amber-500 rounded px-2 py-1">
                Votre modèle n’a pas d’emplacement <code>{'{{signatures}}'}</code> : Lucie remplacera son bloc de
                signatures actuel par la liste de la section. Pour le rendre explicite, remplacez dans le modèle les
                colonnes de signataires par <code>{'{{signatures}}'}</code>, ou restaurez le modèle par défaut.
              </p>
            )}
          </>
        )}
      </div>

      <textarea
        value={modele}
        onChange={e => setModele(e.target.value)}
        readOnly={!peutEcrire}
        spellCheck={false}
        className="w-full h-[60vh] font-mono text-second leading-snug border border-gray-300 rounded-lg p-3 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-iip-turquoise"
      />

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer text-iip-blue">Champs disponibles</summary>
        <div className="mt-1 grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-0.5 font-mono">
          {['{{nom_etudiant}}','{{prenom_etudiant}}','{{genre}}','{{lieu_naissance}}','{{date_naissance}}','{{registre_national}}','{{intitule_section}}','{{grade_academique}}','{{type_enseignement}}','{{code_section}}','{{date_approbation}}','{{total_ects}}','{{duree_annees}}','{{domaine}}','{{mention}}','{{annee}}','{{date_deliberation}}','{{president_jury}}','{{directeur}}','{{ville_etab}}','{{nom_etab}}','{{adresse_etab}}','{{matricule_etab}}','{{fase_etab}}','{{logo_iip}}','{{logo_helb}}','{{sceau}}','{{signature_directeur}}','{{signatures}}','{{logos}}'].map(v => <span key={v}>{v}</span>)}
        </div>
      </details>
    </div>
  );
}

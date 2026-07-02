import { useEffect, useState } from 'react';
import { IconDeviceFloppy, IconEye, IconRefresh } from '@tabler/icons-react';

const tok = () => localStorage.getItem('token');
const af = (url, opts = {}) => fetch(url, {
  ...opts,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...(opts.headers || {}) },
}).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });

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

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const peutEcrire = me?.role === 'admin';

  useEffect(() => {
    Promise.all([
      af('/api/config/diplome_template').then(d => d.valeur).catch(() => ''),
      af('/api/config/attestation_etab').then(d => { try { return JSON.parse(d.valeur); } catch { return {}; } }).catch(() => ({})),
    ]).then(([tpl, e]) => { setHtml(tpl); setInitial(tpl); setEtab(e); }).finally(() => setLoading(false));
  }, []);

  const dirty = html !== initial;

  const apercu = () => {
    const rendu = remplaceVars(html, VARS_DEMO(etab, assets));
    const w = window.open('', '_blank');
    if (!w) { alert('Autorisez les pop-ups pour voir l’aperçu.'); return; }
    w.document.open(); w.document.write(rendu); w.document.close();
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

      <textarea
        value={html}
        onChange={e => setHtml(e.target.value)}
        readOnly={!peutEcrire}
        spellCheck={false}
        className="w-full h-[60vh] font-mono text-[12px] leading-snug border border-gray-300 rounded-lg p-3 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-iip-turquoise"
      />

      <details className="text-xs text-gray-500">
        <summary className="cursor-pointer text-iip-blue">Champs disponibles</summary>
        <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 font-mono">
          {['{{nom_etudiant}}','{{prenom_etudiant}}','{{genre}}','{{lieu_naissance}}','{{date_naissance}}','{{registre_national}}','{{intitule_section}}','{{grade_academique}}','{{code_section}}','{{date_approbation}}','{{total_ects}}','{{duree_annees}}','{{domaine}}','{{mention}}','{{annee}}','{{date_deliberation}}','{{president_jury}}','{{directeur}}','{{ville_etab}}','{{nom_etab}}','{{adresse_etab}}','{{matricule_etab}}','{{fase_etab}}','{{logo_iip}}','{{logo_helb}}','{{sceau}}','{{signature_directeur}}'].map(v => <span key={v}>{v}</span>)}
        </div>
      </details>
    </div>
  );
}

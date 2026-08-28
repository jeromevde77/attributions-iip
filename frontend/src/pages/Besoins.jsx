import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconTargetArrow, IconBriefcase, IconAlertTriangle, IconCheck, IconX,
  IconSend, IconEye, IconMailForward, IconRefresh, IconChevronRight, IconSchool, IconCertificate,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';

const fr = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

const PORTEE = {
  requis:    { label: 'Titre requis',    classe: 'bg-iip-blue/10 text-iip-blue' },
  suffisant: { label: 'Titre suffisant', classe: 'bg-emerald-100 text-emerald-800' },
  penurie:   { label: 'Pénurie',         classe: 'bg-amber-100 text-amber-900' },
  ajoute:    { label: 'Ajouté',          classe: 'bg-slate-100 text-slate-600' },
};

const STATUT_OFFRE = {
  brouillon: { label: 'Brouillon', classe: 'bg-slate-100 text-slate-600' },
  publiee:   { label: 'Publiée',   classe: 'bg-emerald-100 text-emerald-800' },
  pourvue:   { label: 'Pourvue',   classe: 'bg-iip-blue/10 text-iip-blue' },
  close:     { label: 'Close',     classe: 'bg-slate-100 text-slate-500' },
  ouvert:    { label: 'Ouverte',   classe: 'bg-emerald-100 text-emerald-800' },
};

/**
 * Étude des besoins → offres d'emploi.
 *
 * Ordre imposé : un besoin naît d'attributions non pourvues, il donne lieu à une
 * offre par cours, et seule la publication ouvre le recrutement.
 */
export default function Besoins({ annee: anneeProp }) {
  const navigate = useNavigate();
  // Utilisable comme page autonome ou intégré dans Personnel : si l'année n'est
  // pas fournie, on récupère l'année active.
  const [anneeAuto, setAnneeAuto] = useState('');
  const annee = anneeProp || anneeAuto;
  useEffect(() => {
    if (anneeProp) return;
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        const a = (Array.isArray(l) ? l : []).find(x => x.active) || (Array.isArray(l) ? l[0] : null);
        if (a?.code) setAnneeAuto(a.code);
      })
      .catch(() => {});
  }, [anneeProp]);
  const [onglet, setOnglet] = useState('besoins');
  const [data, setData] = useState(null);
  const [offres, setOffres] = useState([]);
  const [apercu, setApercu] = useState(null);        // { html, titre }
  const [envoi, setEnvoi] = useState(null);          // { offre, destinataires, message? }

  async function ouvrirApercu(o) {
    const rep = await fetch(`/api/besoins/offre/${o.id}/document`, { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setApercu({ html: j.html, titre: j.sujet });
  }

  async function envoyerOffre() {
    if (!envoi) return;
    const rep = await fetch(`/api/besoins/offre/${envoi.offre.id}/envoyer`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ destinataires: envoi.destinataires }),
    });
    const j = await rep.json();
    if (!rep.ok) { setEnvoi(e => ({ ...e, erreur: j.error })); return; }
    setEnvoi(e => ({ ...e, fait: true, mode: j.mode, avertissement: j.avertissement,
                     nb: j.destinataires.length }));
  }

  const [section, setSection] = useState('');
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState(null);
  const [brouillon, setBrouillon] = useState(null);   // besoin en cours de transformation
  const [detail, setDetail] = useState(null);         // offre ouverte

  async function charger() {
    if (!annee) return;
    setChargement(true);
    try {
      const p = new URLSearchParams({ annee });
      if (section) p.set('section', section);
      const rep = await fetch(`/api/besoins?${p}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error || `Erreur ${rep.status}` }); return; }
      setData(j);
      const rep2 = await fetch(`/api/besoins/offres?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j2 = await rep2.json();
      setOffres(Array.isArray(j2) ? j2 : []);
    } finally { setChargement(false); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, section]);

  async function preparerOffre(b) {
    // Récupérer les titres visés par le cours pour les montrer avant création
    let titres = [];
    try {
      const rep = await fetch(`/api/besoins/titres-cours/${encodeURIComponent(b.code_cours)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      titres = j.titres || [];
    } catch { /* le cours peut n'avoir aucun titre rattaché */ }

    setBrouillon({
      annee, section: b.section, ue_num: b.ue_num, code_cours: b.code_cours,
      quadrimestre: b.quadrimestre, type_cours: b.type_cours,
      periodes_cours: b.periodes_par_groupe, nb_groupes: b.nb_groupes,
      total_periodes: b.total_periodes, nb_postes: b.nb_groupes,
      intitule: `${b.cours_nom || b.code_cours}${b.section ? ' — ' + b.section : ''}`,
      profil: '', competences: '', horaire_indicatif: '', date_limite: '',
      titres, titres_extra: [],
    });
  }

  async function creerOffre() {
    const rep = await fetch('/api/besoins/offre', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify(brouillon),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'échec' }); return; }
    setBrouillon(null);
    setMessage({ type: 'ok', texte: `Offre créée en brouillon : ${j.intitule}` });
    setDetail(j);
    await charger();
  }

  async function publier(id) {
    const rep = await fetch(`/api/besoins/offre/${id}/publier`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ canal_publication: 'Site IIP' }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'échec' }); return; }
    setMessage({ type: 'ok', texte: 'Offre publiée — le recrutement peut commencer.' });
    setDetail(j);
    await charger();
  }

  async function ouvrirOffre(id) {
    const rep = await fetch(`/api/besoins/offre/${id}`, { headers: authHeaders() });
    if (rep.ok) setDetail(await rep.json());
  }

  const besoins = data?.besoins || [];
  const sections = [...new Set(besoins.map(b => b.section).filter(Boolean))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue flex items-center gap-2">
            <IconTargetArrow size={22} className="text-iip-turquoise" />
            Besoins en personnel
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Un besoin naît d'un cours non pourvu. Il donne lieu à une offre, et
            seule la publication ouvre le recrutement.
          </p>
        </div>
        <button onClick={charger}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1.5">
          <IconRefresh size={15} /> Actualiser
        </button>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between gap-3
          ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)}><IconX size={15} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Cours à pourvoir" valeur={data?.total ?? '—'} />
        <Kpi label="Périodes à pourvoir" valeur={data?.total_periodes ?? '—'} />
        <Kpi label="Sans offre" valeur={data?.sans_offre ?? '—'}
             ton={data?.sans_offre ? 'alerte' : 'neutre'} />
        <Kpi label="Offres publiées"
             valeur={offres.filter(o => o.statut === 'publiee').length} ton="bon" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[['besoins', `Besoins (${besoins.length})`], ['offres', `Offres (${offres.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${onglet === k
              ? 'border-iip-turquoise text-iip-blue' : 'border-transparent text-slate-500'}`}>
            {l}
          </button>
        ))}
        {sections.length > 1 && onglet === 'besoins' && (
          <select value={section} onChange={e => setSection(e.target.value)}
            className="ml-auto mb-1 border border-slate-300 rounded-lg px-2 py-1 text-sm">
            <option value="">Toutes les sections</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {chargement && <div className="text-sm text-slate-400 py-8 text-center">Chargement…</div>}

      {/* ── BESOINS ── */}
      {!chargement && onglet === 'besoins' && (
        besoins.length ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Cours</th>
                  <th className="px-3 py-2 text-left w-24">Section</th>
                  <th className="px-3 py-2 text-left w-20">Quadri</th>
                  <th className="px-3 py-2 text-left w-28">Groupes</th>
                  <th className="px-3 py-2 text-left w-32">À pourvoir</th>
                  <th className="px-3 py-2 w-40"></th>
                </tr>
              </thead>
              <tbody>
                {besoins.map((b, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800">{b.cours_nom || b.code_cours}</div>
                      <div className="text-[11px] text-slate-500">
                        UE {b.ue_num}{b.ue_nom ? ` · ${b.ue_nom}` : ''} · {b.code_cours}
                        {b.type_cours ? ` · ${b.type_cours}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{b.section}</td>
                    <td className="px-3 py-2.5 text-slate-600">{b.quadrimestre || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-iip-blue">{b.nb_groupes}</span>
                      {b.groupes && <span className="text-[11px] text-slate-500 ml-1">({b.groupes})</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-iip-blue">{b.total_periodes} pér.</div>
                      <div className="text-[11px] text-slate-500">{b.periodes_par_groupe} / groupe</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {b.offres_existantes > 0
                        ? <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 justify-end">
                            <IconCheck size={13} /> {b.offres_existantes} offre(s)
                          </span>
                        : <button onClick={() => preparerOffre(b)}
                            className="text-[12px] px-2.5 py-1.5 rounded-lg bg-iip-blue text-white font-semibold flex items-center gap-1.5 ml-auto">
                            <IconBriefcase size={14} /> Créer l'offre
                          </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            {data?.message || 'Aucun cours à pourvoir : toutes les attributions sont assignées.'}
          </div>
        )
      )}

      {/* ── OFFRES ── */}
      {!chargement && onglet === 'offres' && (
        offres.length ? (
          <div className="space-y-2">
            {offres.map(o => {
              const s = STATUT_OFFRE[o.statut] || STATUT_OFFRE.brouillon;
              return (
                <div key={o.id} className="border border-slate-200 rounded-xl px-4 py-3 bg-white flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <button onClick={() => ouvrirOffre(o.id)} className="text-left">
                      <div className="font-medium text-slate-800">{o.intitule}</div>
                      <div className="text-[11px] text-slate-500">
                        {o.total_periodes ? `${o.total_periodes} pér.` : ''}
                        {o.nb_groupes ? ` · ${o.nb_groupes} groupe(s)` : ''}
                        {o.date_publication ? ` · publiée le ${fr(o.date_publication)}` : ''}
                      </div>
                    </button>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.classe}`}>{s.label}</span>
                  <button onClick={() => ouvrirApercu(o)}
                    className="text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1">
                    <IconEye size={14} /> Aperçu
                  </button>
                  {o.statut === 'publiee' && (
                    <button onClick={() => setEnvoi({ offre: o, destinataires: '' })}
                      className="text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1">
                      <IconMailForward size={14} /> Envoyer
                    </button>
                  )}
                  {o.statut === 'brouillon' && (
                    <button onClick={() => publier(o.id)}
                      className="text-[12px] px-2.5 py-1.5 rounded-lg bg-iip-turquoise text-white font-semibold flex items-center gap-1.5">
                      <IconSend size={14} /> Publier
                    </button>
                  )}
                  {o.statut === 'publiee' && (
                    <button onClick={() => navigate('/recrutement')}
                      className="text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1">
                      Recrutement <IconChevronRight size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            Aucune offre. Créez-en une depuis l'onglet Besoins.
          </div>
        )
      )}

      {/* ── Préparation d'une offre ── */}
      {brouillon && (
        <Modale titre="Nouvelle offre d'emploi" onFermer={() => setBrouillon(null)}>
          <div className="space-y-3 text-sm">
            <Champ label="Intitulé">
              <input value={brouillon.intitule}
                onChange={e => setBrouillon(b => ({ ...b, intitule: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </Champ>

            <div className="grid grid-cols-3 gap-3">
              <Champ label="Périodes / groupe">
                <input type="number" value={brouillon.periodes_cours || ''}
                  onChange={e => setBrouillon(b => ({ ...b,
                    periodes_cours: e.target.value,
                    total_periodes: (Number(e.target.value) || 0) * (Number(b.nb_groupes) || 0) }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </Champ>
              <Champ label="Groupes">
                <input type="number" value={brouillon.nb_groupes || ''}
                  onChange={e => setBrouillon(b => ({ ...b,
                    nb_groupes: e.target.value,
                    total_periodes: (Number(b.periodes_cours) || 0) * (Number(e.target.value) || 0) }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </Champ>
              <Champ label="Total à pourvoir">
                <input value={`${brouillon.total_periodes || 0} pér.`} readOnly
                  className="w-full border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1.5 font-semibold text-iip-blue" />
              </Champ>
            </div>

            <Champ label="Postes à pourvoir">
              <input type="number" value={brouillon.nb_postes || ''}
                onChange={e => setBrouillon(b => ({ ...b, nb_postes: e.target.value }))}
                className="w-28 border border-slate-300 rounded-lg px-2.5 py-1.5" />
              <span className="text-[11px] text-slate-500 ml-2">
                un seul professeur peut assurer plusieurs groupes
              </span>
            </Champ>

            {/* Titres visés, repris du référentiel */}
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <IconCertificate size={13} /> Titres visés par ce cours
              </div>
              {brouillon.titres.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {brouillon.titres.map(t => {
                    const p = PORTEE[t.portee] || PORTEE.requis;
                    return (
                      <span key={t.titre_id || t.id}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium ${p.classe}`}>
                        {t.libelle} <span className="opacity-60">· {p.label}</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-amber-700 flex items-center gap-1.5">
                  <IconAlertTriangle size={13} />
                  Aucun titre n'est rattaché à ce cours. Le rattachement se fait dans le référentiel.
                </p>
              )}
            </div>

            <Champ label="Compétences attendues">
              <textarea rows={2} value={brouillon.competences}
                onChange={e => setBrouillon(b => ({ ...b, competences: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Horaire indicatif">
                <input value={brouillon.horaire_indicatif}
                  onChange={e => setBrouillon(b => ({ ...b, horaire_indicatif: e.target.value }))}
                  placeholder="ex. mardi soir" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </Champ>
              <Champ label="Date limite de candidature">
                <input type="date" value={brouillon.date_limite}
                  onChange={e => setBrouillon(b => ({ ...b, date_limite: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
              </Champ>
            </div>

            <p className="text-[11px] text-slate-400">
              Les acquis d'apprentissage rattachés au cours seront joints automatiquement à l'offre.
            </p>

            <div className="flex gap-2 pt-1">
              <button onClick={creerOffre}
                className="px-3 py-2 rounded-lg bg-iip-blue text-white text-sm font-semibold">
                Créer en brouillon
              </button>
              <button onClick={() => setBrouillon(null)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Annuler</button>
            </div>
          </div>
        </Modale>
      )}

      {/* ── Détail d'une offre ── */}
      {detail && (
        <Modale titre={detail.intitule} onFermer={() => setDetail(null)}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold
                ${(STATUT_OFFRE[detail.statut] || STATUT_OFFRE.brouillon).classe}`}>
                {(STATUT_OFFRE[detail.statut] || STATUT_OFFRE.brouillon).label}
              </span>
              <span className="text-slate-600">
                {detail.total_periodes} périodes · {detail.nb_groupes} groupe(s) · {detail.nb_postes} poste(s)
              </span>
            </div>

            {detail.titres?.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Titres visés</div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.titres.map(t => {
                    const p = PORTEE[t.portee] || PORTEE.requis;
                    return <span key={t.id} className={`px-2 py-1 rounded-lg text-[11px] font-medium ${p.classe}`}>
                      {t.libelle} <span className="opacity-60">· {p.label}</span></span>;
                  })}
                </div>
              </div>
            )}

            {detail.acquis?.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <IconSchool size={13} /> Acquis d'apprentissage du cours
                </div>
                <ul className="space-y-1">
                  {detail.acquis.map(a => (
                    <li key={a.aa_code} className="text-[12.5px] text-slate-700 flex gap-2">
                      <span className="text-[10px] font-bold text-iip-blue bg-iip-blue/8 px-1.5 py-0.5 rounded h-fit">
                        {a.aa_code}
                      </span>
                      <span>{a.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.statut === 'brouillon' && (
              <button onClick={() => publier(detail.id)}
                className="px-3 py-2 rounded-lg bg-iip-turquoise text-white text-sm font-semibold flex items-center gap-1.5">
                <IconSend size={15} /> Publier l'offre
              </button>
            )}
          </div>
        </Modale>
      )}

      {apercu && (
        <PreviewModal html={apercu.html} titre="Offre d'emploi"
          sousTitre={apercu.titre} nomFichier="offre_emploi"
          astuceImpression="Portrait conseillé"
          onClose={() => setApercu(null)} />
      )}

      {envoi && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
             onClick={() => setEnvoi(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3"
               onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-iip-blue">
              Envoyer l'offre — {envoi.offre.intitule || envoi.offre.code_cours}
            </div>
            {envoi.fait ? (
              <>
                <div className={`px-3 py-2.5 rounded-lg text-sm ${envoi.mode === 'smtp'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                  {envoi.mode === 'smtp'
                    ? `Offre envoyée à ${envoi.nb} destinataire(s). L'envoi est tracé dans Lucie.`
                    : envoi.avertissement}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setEnvoi(null)}
                    className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold">Fermer</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[12.5px] text-slate-500">
                  Le document mis en page part tel que l'aperçu le montre. Adresses
                  séparées par des virgules ou des retours à la ligne.
                </p>
                <textarea rows={3} value={envoi.destinataires} autoFocus
                  onChange={e => setEnvoi(v => ({ ...v, destinataires: e.target.value }))}
                  placeholder="forem@exemple.be, federation@exemple.be…"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                {envoi.erreur && <div className="text-[12.5px] text-red-700">{envoi.erreur}</div>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEnvoi(null)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
                  <button onClick={envoyerOffre} disabled={!envoi.destinataires.trim()}
                    className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40 flex items-center gap-1.5">
                    <IconMailForward size={15} /> Envoyer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valeur, ton }) {
  const c = ton === 'alerte' ? 'border-l-red-500' : ton === 'bon' ? 'border-l-emerald-500' : 'border-l-iip-turquoise';
  return (
    <div className={`bg-white border border-slate-200 border-l-[3px] ${c} rounded-xl px-4 py-3`}>
      <div className="text-2xl font-bold text-iip-blue leading-tight">{valeur}</div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold mt-0.5">{label}</div>
    </div>
  );
}

function Champ({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}

function Modale({ titre, onFermer, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFermer}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold text-iip-blue">{titre}</h3>
          <button onClick={onFermer} className="text-slate-400 hover:text-slate-700"><IconX size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

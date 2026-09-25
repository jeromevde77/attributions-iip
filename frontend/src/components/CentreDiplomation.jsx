import { useEffect, useState } from 'react';
import { nomPropre } from '../lib/nom.js';
import {
  IconX, IconAward, IconAlertTriangle, IconClock, IconSquare, IconSquareCheck,
  IconSquareMinus, IconCertificate, IconEye, IconFileTypePdf, IconMail,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { useEnvoiMail } from '../lib/envoiMail.js';
import PreviewModal from './PreviewModal.jsx';
import EnvoiMailModal from './EnvoiMailModal.jsx';

// La date de délibération, telle qu'elle s'écrit au bas de la liste des
// diplômés (la route l'imprime telle quelle, contrairement au PV).
const dateLongue = iso => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * LA DIPLOMATION D'UNE SECTION.
 *
 * En juin, les titres se produisaient sur des cotes RETAPÉES : les unités
 * déterminantes de TIM étaient écrites dans le code d'un écran, et les notes se
 * saisissaient à la main à côté de celles que le Conseil avait arrêtées. Rien
 * ne garantissait qu'elles concordent, et c'est un diplôme qui portait l'écart.
 *
 * Ici, rien ne se tape. La mention se calcule sur les délibérations, les
 * déterminantes se lisent au référentiel, et l'écran ne sert qu'à une chose :
 * ARRÊTER QUI REÇOIT UN TITRE. C'est une décision de direction, pas le
 * résultat d'une requête — d'où la sélection, et d'où le fait que rien n'est
 * coché d'office hors de ceux qui ont terminé cette année.
 *
 * CE QUI CLOCHE SE VOIT AVANT L'IMPRESSION. Une séance encore ouverte, une
 * date de naissance manquante, une déterminante sans cote : chacun est dit sur
 * la ligne concernée. Un diplôme se corrige mal une fois signé.
 */
export default function CentreDiplomation({ annee, onClose }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [d, setD] = useState(null);
  const [retenus, setRetenus] = useState(new Set());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [veut, setVeut] = useState({ diplome: true, attestation: true, liste: false, pv: false });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  // Ce qui a été produit, en attente d'être vu, imprimé, tiré en PDF ou envoyé.
  const [produits, setProduits] = useState(null);
  const [manques, setManques] = useState([]);
  const [apercu, setApercu] = useState(null);
  const [envoi, setEnvoi] = useState(null);
  const [pdfEnCours, setPdfEnCours] = useState(null);
  const envoiMail = useEnvoiMail();

  // UNE PIÈCE PRODUITE NE SURVIT PAS À UN CHANGEMENT DE SÉLECTION. Sinon on
  // imprimerait, sous le nom de la sélection affichée, les titres d'une autre.
  useEffect(() => { setProduits(null); setManques([]); }, [retenus, veut, date, section]);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); })
      .catch(() => {});
  }, []);

  async function charger(code) {
    setEnCours(true); setErreur(null); setD(null);
    try {
      const rep = await fetch(
        `/api/diplomes/dossier?section=${encodeURIComponent(code)}`
        + `&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setD(j);
      // Cochés d'office : ceux qui ont terminé CETTE année. Les diplômés des
      // années passées restent listés — on réédite parfois une pièce — mais
      // décochés, pour qu'on ne les glisse pas dans la promotion de cette année.
      setRetenus(new Set(j.proposes || []));
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  const basculer = id => setRetenus(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  /**
   * PRODUIRE, PUIS CHOISIR CE QU'ON EN FAIT.
   *
   * Les pièces s'ouvraient chacune dans une fenêtre, après l'aller-retour au
   * serveur : le navigateur ne reconnaît plus alors le clic de l'utilisateur,
   * et il bloquait tout — « la fenêtre d'impression a été bloquée ». On
   * produit donc d'abord ; chaque pièce attend ensuite son geste — aperçu et
   * impression, PDF, envoi —, et c'est CE clic qui ouvre ce qui doit l'être.
   */
  const produire = async () => {
    const titres = veut.diplome || veut.attestation;
    if (!retenus.size || !(titres || veut.liste || veut.pv)) return;
    setEnCours(true); setErreur(null); setProduits(null); setManques([]);
    const ids = [...retenus];
    const poster = (url, corps) => fetch(url, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(corps),
    }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; });
    try {
      const [t, l, pv] = await Promise.all([
        titres ? poster('/api/diplomes/pieces', {
          section, annee, etudiants: ids, date_deliberation: date,
          pieces: ['diplome', 'attestation'].filter(k => veut[k]),
        }) : null,
        veut.liste ? poster('/api/diplomes/document', {
          section, annee, etudiants: ids, date: dateLongue(date),
        }) : null,
        veut.pv ? poster('/api/diplomes/pv-section', {
          section, annee, etudiants: ids, date,
        }) : null,
      ]);
      const an = String(annee).replace(/\W/g, '');
      const out = [];
      if (t?.diplomes_lot) out.push({
        cle: 'diplome', titre: 'Diplômes', nb: t.diplomes.length,
        detail: 'A4 paysage, sans marge — sur le papier à diplôme',
        html: t.diplomes_lot, nom: `Diplomes_${section}_${an}`, paysage: true,
      });
      if (t?.html) out.push({
        cle: 'attestation', titre: 'Attestations de réussite de section',
        nb: t.par_etudiant?.length || 0, detail: 'une page par étudiant',
        html: t.html, nom: `Attestations_section_${section}_${an}`,
        envoi: (t.par_etudiant || []).map(e => ({
          html: e.attestation,
          nom_fichier: `Attestation_section_${e.nom}_${e.prenom}_${an}`,
          destinataire: { type: 'etudiant', id: e.id, nom: nomPropre(e.nom, e.prenom) },
        })),
      });
      if (l?.html) out.push({
        cle: 'liste', titre: 'Liste des étudiants diplômés', nb: l.nb,
        detail: 'formulaire de la Fédération', html: l.html,
        nom: `Liste_diplomes_${section}_${an}`,
      });
      if (pv?.html) out.push({
        cle: 'pv', titre: `Procès-verbal de délibération de section (annexe ${pv.annexe})`,
        nb: pv.nb, detail: 'fait en deux exemplaires', html: pv.html,
        nom: `PV_section_${section}_${an}`,
      });
      setProduits(out);
      setManques([...(t?.manques || []), ...(l?.manques || []), ...(pv?.manques || [])]);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  // Le PDF se rend au serveur : format imposé, et le pied sur chaque feuille
  // pour les pièces administratives. Le diplôme garde SA page — il ne porte ni
  // pied ni marge, c'est son modèle qui décide.
  async function enPdf(p) {
    setPdfEnCours(p.cle); setErreur(null);
    try {
      const rep = await fetch('/api/impression/pdf', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify(p.paysage
          ? { html: p.html, nom: p.nom, pied: false, orientation: 'paysage', page_css: true }
          : { html: p.html, nom: p.nom, pagination: 'si-plusieurs' }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        throw new Error(j.error || 'Le rendu PDF a échoué.');
      }
      const url = URL.createObjectURL(await rep.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `${p.nom}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setErreur(e.message); } finally { setPdfEnCours(null); }
  }

  const liste = d?.diplomables || [];
  const nb = retenus.size;
  const tous = liste.length > 0 && liste.every(x => retenus.has(x.id));
  const aucun = nb === 0;
  const cocherTout = () => setRetenus(new Set(liste.map(x => x.id)));
  const decocherTout = () => setRetenus(new Set());
  const cetteAnnee = () => setRetenus(new Set(d?.proposes || []));
  const nbPieces = ['diplome', 'attestation', 'liste', 'pv'].filter(k => veut[k]).length;

  return (
    <div className="fixed inset-0 bg-[rgba(11,21,45,.32)] backdrop-blur-[3px] flex items-start justify-center z-[60] p-4">
      <div className="bg-white rounded-fenetre shadow-dessus w-full max-w-4xl mt-10
                      max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue flex items-center gap-2">
              <IconAward size={17} className="text-iip-turquoise" /> Diplomation
            </h3>
            <p className="text-[12px] text-slate-500">
              Les mentions sont calculées sur les délibérations. Vous arrêtez qui
              reçoit un titre.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-end
                        gap-3 flex-wrap">
          <label className="text-[12px] text-slate-600">
            <div className="font-semibold mb-0.5">Section</div>
            <select value={section}
              onChange={e => { setSection(e.target.value); if (e.target.value) charger(e.target.value); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-[13px] min-w-[200px]">
              <option value="">— choisir —</option>
              {sections.map(s => (
                <option key={s.code || s} value={s.code || s}>
                  {s.code || s}{s.libelle ? ` — ${s.libelle}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] text-slate-600">
            <div className="font-semibold mb-0.5">Date de délibération</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-[13px]" />
          </label>
          <div className="text-[12px] text-slate-600">
            <div className="font-semibold mb-0.5">Pièces</div>
            <div className="flex gap-1">
              {[['diplome', 'Diplôme'], ['attestation', 'Attestation de section'],
                ['liste', 'Liste des diplômés'], ['pv', 'PV de section']].map(([k, l]) => (
                <button key={k} onClick={() => setVeut(v => ({ ...v, [k]: !v[k] }))}
                  className={`px-2 py-1.5 text-[12px] rounded-lg border font-medium
                    ${veut[k] ? 'bg-iip-blue border-iip-blue text-white'
                      : 'bg-white border-slate-300 text-slate-600'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 text-[13px]">
          {erreur && (
            <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                            text-rose-900">{erreur}</div>
          )}
          {!!produits?.length && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 tab-entete text-[12px] font-semibold text-iip-blue">
                Pièces prêtes — {nb} étudiant(s)
              </div>
              <div className="divide-y divide-slate-100">
                {produits.map(p => (
                  <div key={p.cle} className="px-3 py-2 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800">
                        {p.titre} <span className="text-slate-400 font-normal">· {p.nb}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">{p.detail}</div>
                    </div>
                    <button onClick={() => setApercu(p)}
                      className="bouton controle px-3 flex items-center gap-1.5">
                      <IconEye size={15} /> Aperçu et impression
                    </button>
                    <button onClick={() => enPdf(p)} disabled={!!pdfEnCours}
                      className="bouton-sortir controle px-3 flex items-center gap-1.5
                                 disabled:opacity-40">
                      <IconFileTypePdf size={15} />
                      {pdfEnCours === p.cle ? 'Rendu…' : 'PDF'}
                    </button>
                    {p.envoi && envoiMail?.actif && (
                      <button onClick={() => setEnvoi(p)} disabled={!p.envoi.length}
                        title="Chaque étudiant reçoit SA pièce, à son adresse de l'école"
                        className="bouton controle px-3 flex items-center gap-1.5
                                   disabled:opacity-40">
                        <IconMail size={15} /> Envoyer aux étudiants
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!!manques.length && (
                <div className="px-3 py-2 border-t border-amber-200 bg-amber-50
                                text-[12px] text-amber-900 flex items-start gap-2">
                  <IconAlertTriangle size={14} className="mt-px flex-none" />
                  <span>
                    <b>{manques.length} champ(s) à compléter</b> avant signature :{' '}
                    {manques.slice(0, 4).join(' · ')}{manques.length > 4 ? ' …' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          {enCours && <p className="text-slate-400 italic py-6 text-center">Calcul…</p>}
          {!section && !enCours && (
            <p className="text-slate-400 italic py-8 text-center">
              Choisissez une section.
            </p>
          )}

          {d && !enCours && (
            <>
              {!!d.determinantes_sans_periodes?.length && (
                <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300
                                text-amber-900 flex items-start gap-2">
                  <IconAlertTriangle size={15} className="mt-px flex-none" />
                  <span>
                    <b>Unité(s) déterminante(s) sans périodes</b> :{' '}
                    {d.determinantes_sans_periodes.join(', ')}. Elles pèsent alors
                    comme une seule période dans la mention — à compléter au
                    référentiel pour que la pondération soit juste.
                  </span>
                </div>
              )}

              <div className="text-[11px] text-slate-500">
                Mention : {Math.round((1 - d.regles_mention.poids_epreuve) * 100)} %
                pour les unités déterminantes (pondérées par leurs périodes),{' '}
                {Math.round(d.regles_mention.poids_epreuve * 100)} % pour l'épreuve
                intégrée{d.epreuve_integree ? ` (UE ${d.epreuve_integree})` : ''}.
              </div>

              {!liste.length ? (
                <p className="text-slate-400 italic py-8 text-center">
                  Personne n'est en conditions dans cette section.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 tab-entete flex items-center gap-2.5
                                  text-[12px] text-slate-600">
                    <button onClick={tous ? decocherTout : cocherTout}
                      title={tous ? 'Tout décocher' : 'Tout cocher'}
                      className="text-iip-blue">
                      {tous ? <IconSquareCheck size={16} />
                        : aucun ? <IconSquare size={16} className="text-slate-400" />
                          : <IconSquareMinus size={16} />}
                    </button>
                    <span className="font-semibold">{nb} / {liste.length}</span>
                    <span className="text-slate-300">·</span>
                    <button onClick={cocherTout} disabled={tous}
                      className="hover:text-iip-blue disabled:opacity-40">Tout cocher</button>
                    <button onClick={decocherTout} disabled={aucun}
                      className="hover:text-iip-blue disabled:opacity-40">Aucun</button>
                    {!!d?.proposes?.length && d.proposes.length !== liste.length && (
                      <button onClick={cetteAnnee}
                        title="Ceux qui ont terminé cette année — la sélection proposée à l'ouverture"
                        className="hover:text-iip-blue">
                        Terminé en {annee} ({d.proposes.length})
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                    {liste.map(x => {
                      const pris = retenus.has(x.id);
                      return (
                        <div key={x.id} className="px-3 py-2 flex items-start gap-2.5">
                          <button onClick={() => basculer(x.id)} className="mt-0.5 text-iip-blue">
                            {pris ? <IconSquareCheck size={16} />
                              : <IconSquare size={16} className="text-slate-300" />}
                          </button>
                          <div className={`flex-1 min-w-0 ${pris ? '' : 'opacity-45'}`}>
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-semibold text-iip-blue">
                                {nomPropre(x.nom, x.prenom)}
                              </span>
                              {x.mention.mention ? (
                                <span className="text-[11px] px-1.5 py-px rounded
                                                 bg-slate-100 text-slate-700 font-medium">
                                  {x.mention.mention} ·{' '}
                                  {String(x.mention.pourcent).replace('.', ',')} %
                                </span>
                              ) : (
                                <span className="text-[11px] px-1.5 py-px rounded
                                                 bg-red-50 text-red-700 font-medium">
                                  sans mention
                                </span>
                              )}
                              {x.annee_fin !== annee && (
                                <span className="text-[11px] text-slate-400">
                                  terminé en {x.annee_fin}
                                </span>
                              )}
                              {x.par_epreuve && !x.toutes_unites && (
                                <span className="text-[11px] text-slate-400"
                                  title="L'épreuve intégrée réussie vaut parcours complet">
                                  par l'épreuve intégrée
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {x.determinantes.map(u => (
                                <span key={u.ue_num}
                                  title={`${u.ue_nom || ''} · ${u.periodes || '?'} périodes`}
                                  className={`text-[10px] px-1.5 py-px rounded border
                                    ${u.cote == null
                                      ? 'bg-red-50 border-red-200 text-red-700'
                                      : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                  {u.ue_num} : {u.cote == null ? '—'
                                    : `${Math.round(u.cote)}/20`}
                                </span>
                              ))}
                              {x.epreuve && (
                                <span className="text-[10px] px-1.5 py-px rounded border
                                                 bg-violet-50 border-violet-200 text-violet-800">
                                  EI {x.epreuve.ue_num} : {x.epreuve.cote == null ? '—'
                                    : `${Math.round(x.epreuve.cote)}/20`}
                                </span>
                              )}
                            </div>
                            {!!x.reserves.length && (
                              <ul className="mt-1 text-[11px] text-amber-800">
                                {x.reserves.map((r, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <IconClock size={11} className="mt-0.5 flex-none" />
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {d && (
          <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                          justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              <b>{nb}</b> titre(s) retenu(s) sur {liste.length} en conditions
              {d.total.provisoires > 0 && (
                <span className="text-amber-700">
                  {' '}· {d.total.provisoires} dossier(s) dont une séance reste ouverte
                </span>
              )}
            </p>
            <button onClick={produire} disabled={enCours || !nb || !nbPieces}
              className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white
                         font-semibold flex items-center gap-1.5 disabled:opacity-40">
              <IconCertificate size={15} /> Produire les pièces
            </button>
          </div>
        )}
      </div>

      {apercu && (
        <PreviewModal html={apercu.html} titre={apercu.titre}
          sousTitre={`${section} · ${annee} · ${apercu.nb} pièce(s)`}
          nomFichier={apercu.nom} envoiPossible={false}
          astuceImpression={apercu.paysage
            ? "⊞ « Paysage », marges « Aucune », sur le papier à diplôme" : null}
          onClose={() => setApercu(null)} />
      )}
      {envoi && (
        <EnvoiMailModal pieces={envoi.envoi} typeDoc="attestation_section"
          sujet={`${envoi.titre} — ${section} ${String(annee).replace('-', '/')}`}
          onClose={() => setEnvoi(null)} />
      )}
    </div>
  );
}

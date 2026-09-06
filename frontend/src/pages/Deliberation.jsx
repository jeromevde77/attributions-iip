import { useEffect, useState } from 'react';
import { IconChevronRight, IconArrowLeft, IconBolt, IconAlertTriangle,
  IconRotate, IconPrinter } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import FeuilleDeliberation from '../components/FeuilleDeliberation.jsx';
import EncodageCours from '../components/EncodageCours.jsx';
import SchemaLiensAA from '../components/SchemaLiensAA.jsx';
import EncodageRapide from './EncodageRapide.jsx';

/**
 * Délibération — la porte d'entrée.
 *
 * On atteignait la feuille par un clic non annoncé sur un en-tête de colonne,
 * dans l'écran de saisie rapide : on arrivait au sens par l'accessoire, et
 * personne ne trouvait le chemin sans qu'on le lui montre.
 *
 * L'accès est ici inversé et nommé : les SECTIONS, puis leurs UNITÉS, puis la
 * feuille — et depuis la feuille, un étudiant. La saisie rapide devient ce
 * qu'elle est, un outil qu'on ouvre d'un bouton quand on veut aller vite.
 *
 * Chaque unité annonce ce qui reste à faire : sans cela l'écran ne serait
 * qu'un sommaire, et le Conseil chercherait encore par où commencer.
 */
export default function Deliberation() {
  const annee = getAnnee();
  const [plan, setPlan] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState(null);
  const [ueNum, setUeNum] = useState(null);
  const [rapide, setRapide] = useState(false);
  // Les COURS d'une unité, dépliés à la demande : c'est par eux que les
  // professeurs encodent, acquis par acquis.
  const [coursDeUe, setCoursDeUe] = useState({});   // ue_num → [cours]
  const [deplie, setDeplie] = useState(null);
  const [encoder, setEncoder] = useState(null);     // cours_code en saisie
  const [parametrer, setParametrer] = useState(null);  // ue_num en paramétrage
  const [docs, setDocs] = useState(null);           // le générateur de documents
  const [choix, setChoix] = useState({ reussite: true, ajournement: true, refus: true });
  const [annuler, setAnnuler] = useState(null);     // ue en cours d'annulation
  const [enCours, setEnCours] = useState(false);

  /**
   * LES DOCUMENTS DE LA SÉANCE. Le secrétariat sort trois piles — attestations
   * de réussite, notifications d'ajournement, notifications de refus — et il
   * les sortait jusqu'ici dossier par dossier, depuis la fiche de chaque
   * étudiant.
   */
  async function ouvrirDocuments(u) {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${u.ue_num}/documents?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setDocs({ ...j, ue_nom: u.ue_nom });
      setChoix({ reussite: true, ajournement: true, refus: true });
    } catch (e) { setErreur(e.message); }
  }

  async function produireDocuments() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/ue/${docs.ue_num}/documents`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ...choix }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (j.manques?.length) {
        setErreur(`${j.pieces} pièce(s) produite(s), mais : ${j.manques.slice(0, 6).join(' · ')}`
          + (j.manques.length > 6 ? ` … et ${j.manques.length - 6} autres.` : ''));
      }
      const f = window.open('', '_blank');
      if (!f) { setErreur('Le navigateur a bloqué la fenêtre d’impression.'); return; }
      f.document.write(j.html); f.document.close();
      setDocs(null);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * ANNULER LA DÉLIBÉRATION d'une unité : effacer les décisions et les
   * ajustements, garder les notes encodées. Le geste est destructeur, il se
   * confirme.
   */
  async function annulerDeliberation() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/deliberation/ue/${annuler.ue_num}?annee=${encodeURIComponent(annee)}`,
        { method: 'DELETE', headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setAnnuler(null);
      charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function ouvrirCours(ueNum) {
    if (deplie === ueNum) { setDeplie(null); return; }
    setDeplie(ueNum);
    if (coursDeUe[ueNum]) return;
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/cours?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setCoursDeUe(m => ({ ...m, [ueNum]: j }));
    } catch { /* la liste des cours est un confort, pas un bloquant */ }
  }

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/deliberation/plan?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setPlan(j);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee]);

  if (rapide) {
    return (
      <div>
        <div className="px-5 pt-4">
          <button onClick={() => { setRapide(false); charger(); }}
            className="flex items-center gap-1.5 text-[12.5px] text-iip-blue hover:underline">
            <IconArrowLeft size={15} /> Retour à la délibération
          </button>
        </div>
        <EncodageRapide />
      </div>
    );
  }

  const sec = plan?.sections.find(s => s.section === section) || null;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Délibération</h2>
          <p className="text-sm text-slate-500">
            Année {annee} · choisissez une section, puis l'unité à délibérer.
          </p>
        </div>
        {/* La saisie rapide reste accessible, mais elle n'est plus le CHEMIN :
            on y va pour saisir vite, pas pour délibérer. */}
        <button onClick={() => setRapide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-iip-blue
                     text-iip-blue font-semibold rounded-lg">
          <IconBolt size={15} /> Encodage rapide
        </button>
      </div>

      {erreur && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
          {erreur}
        </div>
      )}

      {!plan ? (
        <div className="py-8 text-center text-slate-400 text-sm">Chargement…</div>
      ) : !plan.sections.length ? (
        <div className="py-10 text-center text-[13px] text-slate-500 border-2 border-dashed rounded-xl">
          Aucune inscription pour {annee} : il n'y a rien à délibérer.
        </div>
      ) : !sec ? (
        /* ── Les SECTIONS ─────────────────────────────────────────────── */
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {plan.sections.map(s => (
            <button key={s.section} onClick={() => setSection(s.section)}
              className="text-left border border-slate-200 rounded-xl px-4 py-3
                         hover:border-iip-blue hover:bg-iip-blue/5 transition">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-iip-blue">{s.section}</span>
                <IconChevronRight size={16} className="text-slate-300" />
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5">
                {s.nb_ues} unité(s) · {s.inscrits} inscription(s)
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
                {s.a_delibierer > 0
                  ? <span className="text-amber-800 font-semibold">{s.a_delibierer} à délibérer</span>
                  : <span className="text-emerald-700 font-semibold">Tout est délibéré</span>}
                {s.non_motives > 0 && (
                  <span className="text-red-700 flex items-center gap-1">
                    <IconAlertTriangle size={12} /> {s.non_motives} échec(s) sans motivation
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* ── Les UNITÉS de la section ─────────────────────────────────── */
        <>
          <button onClick={() => setSection(null)}
            className="flex items-center gap-1.5 text-[12.5px] text-iip-blue hover:underline">
            <IconArrowLeft size={15} /> Toutes les sections
          </button>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200
                            flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-iip-blue">
                {sec.section}
                <span className="ml-2 font-normal text-slate-500">
                  {sec.nb_ues} unité(s) · {sec.inscrits} inscription(s)
                </span>
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {sec.ues.map(u => {
                const reste = u.inscrits - u.decides;
                return (
                  <div key={u.ue_num}>
                  <div className="w-full px-3 py-2 hover:bg-slate-50 flex items-center gap-3">
                    <button onClick={() => setUeNum(u.ue_num)}
                      className="font-bold text-iip-blue w-12 flex-none tabular-nums text-left
                                 hover:underline">{u.ue_num}</button>
                    <span className="flex-1 text-[12.5px] text-slate-700 truncate">
                      {u.ue_nom || `UE ${u.ue_num}`}
                      {u.ue_niv && <span className="ml-2 text-[10.5px] text-slate-400">{u.ue_niv}</span>}
                    </span>

                    {/* L'avancement, en clair : c'est ce qu'on vient chercher. */}
                    <span className="text-[11.5px] tabular-nums text-slate-500 w-28 text-right flex-none">
                      {u.decides}/{u.inscrits} décidé(s)
                    </span>
                    <span className="w-24 flex-none text-right">
                      {reste > 0
                        ? <span className="text-[11.5px] font-semibold text-amber-800">{reste} restant(s)</span>
                        : <span className="text-[11.5px] font-semibold text-emerald-700">complet</span>}
                    </span>
                    <span className="w-32 flex-none text-right">
                      {u.echecs_non_motives > 0 && (
                        <span className="text-[11.5px] text-red-700 flex items-center gap-1 justify-end">
                          <IconAlertTriangle size={12} /> {u.echecs_non_motives} sans motivation
                        </span>
                      )}
                    </span>
                    {/* Deux gestes distincts, nommés : délibérer l'unité, ou
                        encoder l'un de ses cours. */}
                    <button onClick={() => setUeNum(u.ue_num)}
                      className="px-2 py-1 text-[11.5px] rounded-lg border border-iip-blue
                                 text-iip-blue font-semibold flex-none">
                      Délibérer
                    </button>
                    <button onClick={() => ouvrirCours(u.ue_num)}
                      className="px-2 py-1 text-[11.5px] rounded-lg border border-slate-300
                                 text-slate-600 flex-none">
                      Encoder par cours
                    </button>
                    {u.decides > 0 && (
                      <button onClick={() => setAnnuler(u)}
                        title="Annuler la délibération de cette unité — les notes encodées sont conservées"
                        className="px-2 py-1 text-[11.5px] rounded-lg border border-slate-300
                                   text-slate-500 flex-none flex items-center gap-1
                                   hover:border-red-400 hover:text-red-700">
                        <IconRotate size={13} />
                      </button>
                    )}
                    {/* Les documents de la séance : le secrétariat sort les
                        trois piles d'ici, non dossier par dossier. */}
                    <button onClick={() => ouvrirDocuments(u)}
                      title="Attestations de réussite, notifications d'ajournement et de refus"
                      className="px-2 py-1 text-[11.5px] rounded-lg border border-iip-blue
                                 text-iip-blue font-semibold flex-none flex items-center gap-1">
                      <IconPrinter size={13} />
                    </button>
                    <IconChevronRight size={16} className="text-slate-300 flex-none" />
                  </div>

                  {deplie === u.ue_num && (
                    <div className="px-3 pb-2 pl-16 space-y-1">
                      {!coursDeUe[u.ue_num] ? (
                        <div className="text-[11.5px] text-slate-400">Chargement des cours…</div>
                      ) : !coursDeUe[u.ue_num].length ? (
                        <div className="text-[11.5px] text-amber-800 space-y-1">
                          <div>
                            Aucun cours n'a d'acquis rattaché dans cette unité : la saisie
                            par cours n'a rien à montrer.
                          </div>
                          <button onClick={() => setParametrer(u.ue_num)}
                            className="px-2 py-1 rounded-lg bg-iip-blue text-white font-semibold">
                            Paramétrer les cours et acquis
                          </button>
                        </div>
                      ) : coursDeUe[u.ue_num].map(c => (
                        <button key={c.cours_code} onClick={() => setEncoder(c.cours_code)}
                          className="w-full text-left px-2 py-1 rounded-lg hover:bg-slate-100
                                     flex items-center gap-2 text-[12px]">
                          <span className="font-mono text-[11px] text-slate-500 w-16 flex-none">
                            {c.cours_code}
                          </span>
                          <span className="flex-1 truncate text-slate-700">{c.cours_nom || '—'}</span>
                          <span className="text-[11px] text-slate-400">
                            {c.nb_acquis} acquis
                            {c.poids_cours_affiche != null && ` · poids ${c.poids_cours_affiche}`}
                          </span>
                        </button>
                      ))}
                      {!!(coursDeUe[u.ue_num] || []).length && (
                        <button onClick={() => setParametrer(u.ue_num)}
                          className="text-[11.5px] text-iip-blue underline">
                          Paramétrer les cours et acquis de cette unité
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11.5px] text-slate-500">
            Un échec sans motivation rend la décision attaquable : la motivation
            se pose dans la feuille, en cliquant sur le nom de l'étudiant.
          </p>
        </>
      )}

      {ueNum && (
        <FeuilleDeliberation ueNum={ueNum} annee={annee}
          onClose={() => { setUeNum(null); charger(); }} />
      )}

      {encoder && (
        <EncodageCours coursCode={encoder} annee={annee}
          onClose={() => { setEncoder(null); charger(); }}
          onParametrer={ue => { setEncoder(null); setParametrer(ue); }} />
      )}

      {annuler && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setAnnuler(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-24 p-5 space-y-3">
            <div>
              <h3 className="text-[15px] font-semibold text-iip-blue">
                Annuler la délibération de l'UE {annuler.ue_num}
              </h3>
              <p className="text-[12px] text-slate-500">
                {annuler.ue_nom || ''} · {annuler.decides} décision(s) enregistrée(s)
              </p>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2
                            text-[12.5px] text-red-900">
              <div className="font-semibold">Seront effacés</div>
              <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                <li>les décisions du Conseil : résultat, cote, mention ;</li>
                <li>les faveurs et les ajournements ;</li>
                <li>la clôture de la séance et la date de visite des copies.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2
                            text-[12.5px] text-emerald-900">
              <div className="font-semibold">Seront conservés</div>
              <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                <li>les notes encodées par les professeurs ;</li>
                <li>les motivations d'échec déjà écrites ;</li>
                <li>les présences du Conseil.</li>
              </ul>
            </div>

            <p className="text-[11.5px] text-slate-500">
              La délibération repartira de ce qui a été encodé. Cette action
              n'est pas réversible.
            </p>

            <div className="flex justify-end gap-2">
              <button onClick={() => setAnnuler(null)}
                className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                           text-slate-600">
                Renoncer
              </button>
              <button onClick={annulerDeliberation} disabled={enCours}
                className="px-4 py-2 text-[12.5px] rounded-lg bg-red-600 text-white
                           font-semibold disabled:opacity-40">
                Annuler la délibération
              </button>
            </div>
          </div>
        </div>
      )}

      {docs && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setDocs(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mt-20 p-5 space-y-3">
            <div>
              <h3 className="text-[15px] font-semibold text-iip-blue">
                Documents — UE {docs.ue_num}
              </h3>
              <p className="text-[12px] text-slate-500">
                {docs.ue_nom || ''} · {annee}
                {docs.cloturee
                  ? ' · séance close'
                  : ' · séance non close — les pièces resteront provisoires'}
              </p>
            </div>

            <div className="space-y-1.5">
              {[
                { cle: 'reussite', libelle: 'Attestations de réussite',
                  aide: 'Une par étudiant, pour cette unité',
                  liste: docs.reussites, ton: 'border-emerald-300 bg-emerald-50' },
                { cle: 'ajournement', libelle: "Notifications d'ajournement",
                  aide: 'Annexe 8 — acquis à représenter',
                  liste: docs.ajournements, ton: 'border-amber-300 bg-amber-50' },
                { cle: 'refus', libelle: 'Notifications de refus',
                  aide: 'Annexe 9 — base légale et voies de recours',
                  liste: docs.refus, ton: 'border-red-300 bg-red-50' },
              ].map(t => (
                <label key={t.cle}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border cursor-pointer
                    ${!t.liste.length ? 'border-slate-200 bg-slate-50 opacity-60'
                      : choix[t.cle] ? t.ton : 'border-slate-200'}`}>
                  <input type="checkbox" checked={!!choix[t.cle] && !!t.liste.length}
                    disabled={!t.liste.length}
                    onChange={e => setChoix(c => ({ ...c, [t.cle]: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 accent-iip-blue" />
                  <span className="flex-1 min-w-0">
                    <span className="text-[12.5px] font-semibold text-slate-800">
                      {t.liste.length} {t.libelle.toLowerCase()}
                    </span>
                    <span className="block text-[11px] text-slate-500">{t.aide}</span>
                    {!!t.liste.length && (
                      <span className="block text-[10.5px] text-slate-400 truncate">
                        {t.liste.map(x => x.nom).join(', ')}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            {!!docs.sans_decision.length && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                              text-[11.5px] text-amber-900">
                <b>{docs.sans_decision.length} étudiant(s) sans décision</b> : aucune pièce
                ne peut être produite pour eux tant que le Conseil n'a pas délibéré.
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              Toutes les pièces sortent dans un seul document, chacune sur sa page,
              prêtes à imprimer et à signer.
            </p>

            <div className="flex justify-end gap-2">
              <button onClick={() => setDocs(null)}
                className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                           text-slate-600">
                Fermer
              </button>
              <button onClick={produireDocuments} disabled={enCours}
                className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                           font-semibold disabled:opacity-40 flex items-center gap-1.5">
                <IconPrinter size={14} /> Produire les documents
              </button>
            </div>
          </div>
        </div>
      )}

      {parametrer && (
        <SchemaLiensAA ueNum={parametrer} annee={annee}
          onClose={() => { setParametrer(null); setCoursDeUe({}); if (deplie) ouvrirCours(deplie); }}
          onEnregistre={() => setCoursDeUe({})} />
      )}
    </div>
  );
}

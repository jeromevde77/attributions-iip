/* LA FICHE DU COURS (3.5.129) — onglet « Le cours » de Mes cours. Ce que le professeur doit savoir de son cours : l'unité,
 * les périodes, l'autonomie, l'évaluation (examens et remédiation), les acquis avec leur part dans le cours, et le passage du
 * programme du dossier pédagogique qui concerne ce cours. Serveur : `GET /api/mes-cours/:cours/fiche` ; le programme vient du
 * dossier de l'UE (`/api/ref/ue/:num`), découpé comme à l'étape 0 (`rubriquesDuDossier`, `decouperProgramme`). */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { rubriquesDuDossier, decouperProgramme } from '../lib/texteDossier.js';
import EditeurRubrique from './EditeurRubrique.jsx';
import { TuileEtat, Encadre, EnteteCarte, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';

const nb = v => (v == null || v === '' ? '—' : String(Math.round(Number(v) * 10) / 10).replace('.', ','));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export default function FicheCours({ coursCode, annee, sansEntete = false }) {
  const [f, setF] = useState(null);
  const [dp, setDp] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    setF(null); setDp(null); setErreur(null);
    fetch(`/api/mes-cours/${encodeURIComponent(coursCode)}/fiche?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setF(j);
        const d = await fetch(`/api/ref/ue/${j.cours.ue_num}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() }).then(x => (x.ok ? x.json() : null)).catch(() => null);
        setDp(d || {}); })
      .catch(e => setErreur(e.message));
  }, [coursCode, annee]);

  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!f) return <p className="text-sm text-slate-400">Chargement…</p>;
  const c = f.cours;
  // Le programme de CE cours, dans le dossier pédagogique de l'UE.
  let programme = null;
  if (dp?.ue_dp) {
    const coursUE = (dp.cours || []).filter(x => String(x.ct_pp || '').toUpperCase() !== 'Z');
    const R = rubriquesDuDossier(dp.ue_dp, coursUE.map(x => x.cours_nom));
    const P = decouperProgramme(R['Programme'] || '', coursUE.map(x => x.cours_nom).filter(Boolean));
    programme = { preambule: P.preambule, texte: (P.cours.find(x => norm(x.nom) === norm(c.cours_nom)) || P.cours.find(x => norm(x.nom).includes(norm(c.cours_nom)) || norm(c.cours_nom).includes(norm(x.nom))))?.texte || null };
  }
  const evaluation = (Number(c.cours_ev1) || 0) + (Number(c.cours_vc1) || 0);
  return (
    <div className="space-y-3">
      {/* Dans la tuile de l'espace, l'unité et le cours sont déjà en tête (3.5.169) : on ne les redit pas. */}
      {!sansEntete && <div>
        <div className="text-second text-slate-500">UE {f.ue.ue_num} — {f.ue.ue_nom}{f.ue.section ? ` · ${f.ue.section}` : ''}{f.ue.ects ? ` · ${nb(f.ue.ects)} ECTS` : ''}</div>
        <div className="titre-carte">{c.cours_code} · {c.cours_nom}{c.ct_pp ? <span className="ml-2 text-second text-slate-400">{c.ct_pp}</span> : null}</div>
      </div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <TuileEtat etat="neutre" valeur={nb(c.cours_per)} libelle="périodes de cours" />
        <TuileEtat etat="neutre" valeur={nb(c.cours_autonomie)} libelle="périodes d’autonomie"
          precision={f.autonomie_placee != null ? `${nb(f.autonomie_placee)} placée(s) dans la grille de l’année` : `UE : ${nb(c.ue_autonomie)} au total`} />
        <TuileEtat etat="neutre" valeur={nb(evaluation)} libelle="heures d’évaluation"
          precision={`examens ${nb(c.cours_ev1)} · remédiation ${nb(c.cours_vc1)}`} />
        <TuileEtat etat="neutre" valeur={nb(c.heures)} libelle="heures (grille étudiant)" />
      </div>

      <div className="carte overflow-hidden">
        <EnteteCarte titre="Acquis d’apprentissage évalués dans ce cours" />
        {f.acquis.length ? (
          <Tableau className="!border-0 !rounded-none">
            <TableauEntete><Th largeur="w-24">Acquis</Th><Th>Énoncé</Th>
              <Th align="droite" largeur="w-20">Poids</Th><Th align="droite" largeur="w-20">Part</Th></TableauEntete>
            <tbody>{f.acquis.map(a => (
              <Tr key={a.aa_code} className="align-top">
                <Td className="font-semibold whitespace-nowrap">{a.aa_code}</Td>
                <Td className="whitespace-pre-line">{a.description || '—'}</Td>
                <Td align="droite" className="tabular-nums">{nb(a.poids)}</Td>
                <Td align="droite" className="tabular-nums">{a.part != null ? `${nb(a.part)} %` : '—'}</Td>
              </Tr>))}</tbody>
          </Tableau>
        ) : <p className="px-3 py-3 text-sm text-slate-500 m-0">Aucun acquis n’est encore rattaché à ce cours pour {annee} (Unité → croiser les acquis et le programme).</p>}
      </div>

      <div className="space-y-2">
        <div className="intertitre">Programme du cours — dossier pédagogique</div>
        {!dp ? <p className="text-sm text-slate-400">Chargement du dossier…</p>
          : !dp.ue_dp ? <p className="text-sm text-slate-500">Aucun dossier pédagogique importé pour cette unité cette année.</p>
          : <>
            {programme?.texte ? <EditeurRubrique titre={c.cours_nom} texte={programme.texte} lecture />
              : <p className="text-sm text-slate-500">Le dossier ne nomme pas ce cours dans son programme : voyez le dossier complet (étape 0 de l’unité).</p>}
            {programme?.preambule && <EditeurRubrique titre="Introduction commune à tous les cours de l’unité" texte={programme.preambule} lecture />}
          </>}
      </div>
    </div>
  );
}

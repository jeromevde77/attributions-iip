import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';

const r = Router();

r.post('/', authRequired, async (req, res) => {
  const { pdf_base64, media_type = 'application/pdf' } = req.body || {};
  if (!pdf_base64) return res.status(400).json({ error: 'pdf_base64 requis' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API Anthropic non configurée (ANTHROPIC_API_KEY manquante)' });

  const systemPrompt = `Tu es un assistant RH de l'Institut Ilya Prigogine (enseignement supérieur pour adultes, Bruxelles).
Tu analyses des CV de candidats enseignants et retournes UNIQUEMENT un objet JSON valide, sans markdown, sans explication.

Structure JSON attendue :
{
  "prenom": "string ou null",
  "nom": "string ou null",
  "email": "string ou null",
  "telephone": "string ou null",
  "notes": "résumé du profil en 2-3 phrases",
  "fonction": "fonction/spécialité principale ou null",
  "qualifications": [
    {
      "niveau": "CESS|BES|BES_PLUS|BAC|MASTER|DOCTORAT ou null",
      "diplome": "code ou null",
      "diplome_autre": "intitulé exact si pas dans la liste ou null",
      "titre_peda": "AESI|AESS|CAP|CAPAES ou null"
    }
  ]
}

Niveaux : CESS=secondaire, BES=brevet infirmier, BAC=bachelier, MASTER=master, DOCTORAT
Si une information n'est pas trouvée, mets null.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type, data: pdf_base64 } },
            { type: 'text', text: 'Analyse ce CV et retourne le JSON demandé.' },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Erreur API Anthropic' });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'Erreur lors de l\'analyse : ' + e.message });
  }
});

/* LES QUESTIONS D'ENTRETIEN PROPRES À UN COURS (audit du 28 octobre 2026) : l'écran du
   recrutement appelait le service d'IA DEPUIS LE NAVIGATEUR, sans clé — l'appel échouait
   toujours, et il aurait envoyé les données hors de Lucie. Il passe désormais ici, côté
   serveur, avec la clé de l'établissement. Le texte de la demande se compose ICI, à partir
   de champs : la route n'accepte pas un texte libre à transmettre tel quel. */
r.post('/questions', authRequired, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Clé API Anthropic non configurée (ANTHROPIC_API_KEY manquante)' });
  const b = req.body || {};
  const court = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const cours = court(b.cours, 200), ue = court(b.ue_num, 10), section = court(b.section, 80);
  const activites = (Array.isArray(b.activites) ? b.activites : []).slice(0, 20).map(x => court(x, 120)).filter(Boolean);
  const acquis = (Array.isArray(b.acquis) ? b.acquis : []).slice(0, 30).map(a => `- ${court(a?.code, 20)} : L'étudiant sera capable ${court(a?.description, 400)}`);
  if (!cours && !ue) return res.status(400).json({ error: 'Le cours ou l’UE est requis.' });
  const texte = `Tu aides à recruter un professeur pour ce cours à l'Institut Ilya Prigogine (enseignement de promotion sociale, Bruxelles).

Cours : ${cours} — UE ${ue} — Section ${section}
${activites.length ? `Activités : ${activites.join(', ')}` : ''}
${acquis.length ? `\nAcquis d'apprentissage visés :\n${acquis.join('\n')}` : ''}

Génère 6 à 8 questions d'entretien SPÉCIFIQUES à ce cours et à ces acquis d'apprentissage.
Ces questions complètent une grille générale (connaissance formation, expérience, pédagogie, contraintes) déjà posée.
Tester ici la maîtrise disciplinaire et la capacité à enseigner CES contenus précis.

Réponds en JSON strict sans backticks : {"questions":["question 1","question 2",...]}`;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, messages: [{ role: 'user', content: texte }] }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Erreur API Anthropic' });
    }
    const data = await response.json();
    const brut = (data.content || []).map(x => x.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(brut);
    res.json({ questions: Array.isArray(parsed.questions) ? parsed.questions.map(q => String(q)) : [] });
  } catch (e) {
    res.status(500).json({ error: 'Erreur lors de la génération : ' + e.message });
  }
});

export default r;

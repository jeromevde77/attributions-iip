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

export default r;

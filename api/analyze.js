export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { company } = req.body || {};
  if (!company) return res.status(400).json({ error: 'Falta el campo company' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada en el servidor' });

  const prompt = `Eres un experto en análisis comercial y estrategia de ventas B2B, especializado en ecommerce, marketplaces y expansión internacional. Tu tarea es hacer el "discovery" de una empresa para entender si encaja como potencial vendor en Alibaba.com.

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin backticks, sin texto adicional) con exactamente esta estructura:

{
  "empresa": "nombre de la empresa",
  "catalogo": {
    "tipo": "Fabricante | Distribuidor/Importador | Fabricante y Distribuidor",
    "private_label": "Sí | No | Posiblemente",
    "num_skus": "estimación aproximada como texto (ej: ~500 SKUs, +2.000 referencias...)",
    "producto_estrella": "nombre o descripción del producto principal",
    "venta_online_propia": "Sí | No",
    "plataforma_ecommerce": "nombre de la plataforma o N/D si no se detecta",
    "marketplaces": "lista de marketplaces donde vende o 'Ninguno detectado'"
  },
  "estrategia_comercial": {
    "exportador": "Sí | No | Posiblemente",
    "mercados": "descripción de países/regiones donde opera",
    "tipos_cliente": "descripción de los tipos de clientes (B2B, B2C, retailers, etc.)",
    "adquisicion_clientes": "descripción de cómo adquieren clientes"
  },
  "negociacion": {
    "enfoque": "párrafo de 3-5 frases con el enfoque de negociación específico para esta empresa para que empiece a vender en Alibaba.com.",
    "argumentos_clave": ["argumento 1", "argumento 2", "argumento 3"]
  },
  "confianza": "alta | media | baja"
}

Analiza esta empresa: ${company}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Error de la API' });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno del servidor' });
  }
}

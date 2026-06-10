export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { company } = req.body || {};
  if (!company) return res.status(400).json({ error: 'Falta el campo company' });

  const groqKey = process.env.GROQ_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY no configurada' });
  if (!tavilyKey) return res.status(500).json({ error: 'TAVILY_API_KEY no configurada' });

  try {
    // PASO 1: Buscar información real de la empresa con Tavily
    const searchRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: `${company} empresa productos catalogo ecommerce exportacion facturación mercados`,
        search_depth: 'advanced',
        max_results: 6,
        include_answer: true
      })
    });

    let searchContext = '';
    let sources = [];
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      sources = (searchData.results || []).map(r => ({ title: r.title, url: r.url }));
      const snippets = (searchData.results || []).map(r => `[${r.title}]: ${r.content}`).join('\n\n');
      searchContext = searchData.answer ? `Resumen: ${searchData.answer}\n\nFuentes:\n${snippets}` : snippets;
    }

    // PASO 2: Analizar con Groq usando la información encontrada
    const prompt = `Eres un experto en análisis comercial B2B especializado en ecommerce y marketplaces internacionales. Analiza la empresa "${company}" para evaluar su perfil como potencial vendor en Alibaba.com.

${searchContext ? `Información encontrada en internet sobre esta empresa:\n${searchContext}\n\n` : ''}

Basándote en esta información, responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks) con esta estructura exacta:

{
  "empresa": "nombre oficial de la empresa",
  "facturacion_anual": "estimación de facturación anual (ej: ~50M€, +200M€, desconocido...)",
  "catalogo": {
    "tipo": "Fabricante | Distribuidor/Importador | Fabricante y Distribuidor",
    "private_label": "Sí | No | Posiblemente",
    "num_skus": "estimación aproximada (ej: ~500 SKUs, +2.000 referencias...)",
    "producto_estrella": "producto o categoría principal",
    "venta_online_propia": "Sí | No",
    "plataforma_ecommerce": "plataforma detectada o N/D",
    "marketplaces": "marketplaces donde vende o Ninguno detectado"
  },
  "estrategia_comercial": {
    "exportador": "Sí | No | Posiblemente",
    "mercados": "países o regiones donde opera",
    "tipos_cliente": "tipos de clientes (B2B, B2C, retailers, etc.)",
    "adquisicion_clientes": "cómo adquieren clientes"
  },
  "negociacion": {
    "enfoque": "párrafo de 3-5 frases con el enfoque de negociación específico para convencer a esta empresa de vender en Alibaba.com",
    "argumentos_clave": ["argumento 1", "argumento 2", "argumento 3"],
    "objeciones": [
      {"objecion": "objeción probable 1", "respuesta": "cómo rebatirla"},
      {"objecion": "objeción probable 2", "respuesta": "cómo rebatirla"},
      {"objecion": "objeción probable 3", "respuesta": "cómo rebatirla"}
    ]
  },
  "confianza": "alta | media | baja"
}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return res.status(groqRes.status).json({ error: err.error?.message || 'Error de Groq' });
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    result.sources = sources;
    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno del servidor' });
  }
}

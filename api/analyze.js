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
    "enfoque": "Escribe un pitch de venta estructurado para convencer a esta empresa de vender en Alibaba.com con estas 5 secciones: 1) EL GANCHO: frase potente y específica para esta empresa. 2) SU RETO ACTUAL: el dolor comercial específico que tiene hoy (ferias, mercados saturados, stock, etc.). 3) LA SOLUCIÓN: cómo Alibaba.com resuelve ese reto concreto para SU modelo de negocio y SUS productos. 4) EL ROI: 2-3 beneficios tangibles y específicos mencionando capacidades reales de Alibaba.com como RFQs, Smart Assistant, Verified Supplier, MOQ protection. 5) ELEVATOR PITCH: párrafo de 4-5 frases listo para decir en voz alta a su director comercial usando el nombre de la empresa y detalles reales de su negocio. Usa saltos de línea entre secciones.",
 Menciona sus productos reales, sus mercados actuales, su situación competitiva y por qué Alibaba.com es la solución para su caso particular. NO uses frases genéricas como 'ampliar mercado' o 'aumentar ventas'. Habla de buyers específicos en Alibaba.com que compran exactamente lo que esta empresa vende, del volumen de RFQs en su categoría, y de competidores suyos que ya venden en Alibaba.com.",
    "argumentos_clave": [
      "argumento 1: muy específico para esta empresa, con datos concretos de Alibaba.com relevantes para su categoría de producto",
      "argumento 2: basado en sus mercados actuales y cómo Alibaba.com los complementa o abre nuevos compradores B2B",
      "argumento 3: basado en su modelo de negocio concreto (fabricante/distribuidor) y cómo encaja en Alibaba.com"
    ],
    "objeciones": [
      {"objecion": "objeción MUY probable y específica para este tipo de empresa y sector, no genérica", "respuesta": "respuesta concreta con datos o ejemplos reales de Alibaba.com que rebatan exactamente esa objeción"},
      {"objecion": "segunda objeción específica del sector o modelo de negocio de esta empresa", "respuesta": "respuesta con solución concreta que ofrece Alibaba.com para ese caso"},
      {"objecion": "tercera objeción relacionada con su situación actual (exportación, canales, marca...)", "respuesta": "respuesta con ejemplos de cómo otras empresas similares lo resolvieron en Alibaba.com"}
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

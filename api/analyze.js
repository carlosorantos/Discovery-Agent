// ... Tu código anterior de Groq ...

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return res.status(groqRes.status).json({ error: err.error?.message || 'Error de Groq' });
    }

    const groqData = await groqRes.json();
    let raw = groqData.choices?.[0]?.message?.content || '';
    
    // 1. Limpiar bloques de código Markdown si la IA los puso
    let clean = raw.replace(/```json|```/g, '').trim();
    
    // 🔥 NUEVO: Escapar saltos de línea reales dentro de los strings para que no rompan JSON.parse
    // Esto convierte los "Enters" invisibles en caracteres "\n" válidos para JSON
    clean = clean.replace(/[\n\r\t]/g, function (match) {
      if (match === '\n') return '\\n';
      if (match === '\r') return '\\r';
      if (match === '\t') return '\\t';
      return match;
    });

    // 2. Intentar parsear el resultado ya saneado
    try {
      const result = JSON.parse(clean);
      result.sources = sources;
      return res.status(200).json(result);
    } catch (parseError) {
      console.error("Error parseando el JSON saneado:", parseError);
      // Si falla, te devuelve el texto plano para que puedas ver en logs qué inventó la IA
      return res.status(500).json({ 
        error: "La IA no devolvió un formato JSON válido", 
        rawOutput: clean 
      });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error interno del servidor' });
  }
}

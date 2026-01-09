'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

export async function generateCategoryDescription(categoryName: string) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('IA Error: GOOGLE_API_KEY no configurada');
    return {
      success: false,
      error:
        'La llave de IA no está configurada. Por favor, revisa tu archivo .env.local',
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Intentamos con gemini-2.5-flash
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
      Actúa como Chanchito, un asistente experto en finanzas personales y arquitectura de datos.
      El usuario quiere crear una categoría llamada "${categoryName}".
      
      Genera una descripción detallada (máximo 250 caracteres) que explique qué tipos de gastos incluye esta categoría.
      Esta descripción es CRUCIAL porque se usará para entrenar un modelo de clasificación automática.
      
      Ejemplo Input: "Supermercado"
      Ejemplo Output: "Compras de alimentos, bebidas, artículos de limpieza e higiene personal en tiendas grandes o almacenes."
      
      Ejemplo Input: "Salidas"
      Ejemplo Output: "Gastos en restaurantes, bares, cine, teatro y cualquier actividad recreativa o social fuera de casa."
      
      Devuelve SOLO el texto de la descripción, sin comillas, sin introducciones, sin puntos finales innecesarios.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      throw new Error('La IA devolvió una respuesta vacía');
    }

    return { success: true, text: text.trim() };
  } catch (error: any) {
    console.error('Error detallado de IA:', error);

    // Si falla el 2.5-flash, el error 404 sugiere que quizás debas usar gemini-1.5-flash o revisar la versión del SDK
    if (
      error.message?.includes('404') ||
      error.message?.includes('not found')
    ) {
      return {
        success: false,
        error:
          'El modelo gemini-2.5-flash no fue encontrado. Verifica si tu API Key tiene acceso a este modelo o si la región está soportada.',
      };
    }

    return {
      success: false,
      error:
        'No pude generar la descripción. Verifica tu conexión o intenta escribirla manualmente.',
    };
  }
}

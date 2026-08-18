export const TEMA_STORAGE_KEY = "chanchito-tema";

export type Tema = "dia" | "noche";

/**
 * Se inyecta en el <head>, antes de que React hidrate. Sin esto la app
 * renderiza en Día y recién después salta a Noche: un flash de papel crema
 * en la cara, cada vez que se abre la app.
 *
 * Va como string y no como componente porque tiene que ejecutarse de forma
 * sincrónica durante el parseo del documento.
 */
export const temaScript = `(function(){try{var t=localStorage.getItem("${TEMA_STORAGE_KEY}");if(t!=="dia"&&t!=="noche"){t="dia"}document.documentElement.setAttribute("data-theme",t==="noche"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;

export function leerTema(): Tema {
  if (typeof document === "undefined") return "dia";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "noche" : "dia";
}

export function aplicarTema(tema: Tema) {
  document.documentElement.setAttribute("data-theme", tema === "noche" ? "dark" : "light");
  try {
    localStorage.setItem(TEMA_STORAGE_KEY, tema);
  } catch {
    // Modo privado o storage bloqueado: el tema vale para esta sesión y listo.
  }
}

/**
 * Tema visual de la app: oscuro (identidad original) o claro.
 * Se persiste en localStorage y se aplica como atributo en <html> para que
 * el CSS (html[data-tema='claro']) sobreescriba las variables de color.
 */

const KEY = 'rgf_tema_v1';

export function obtenerTema() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'claro' ? 'claro' : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema === 'claro' ? 'claro' : 'oscuro';
  // El color de la barra del sistema (PWA instalada) acompaña al tema
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'claro' ? '#f4f4ef' : '#0a0a0a');
}

export function guardarTema(tema) {
  try { localStorage.setItem(KEY, tema); } catch { /* modo privado */ }
  aplicarTema(tema);
}

/**
 * Plantilla del correo de recuperación.
 *
 * HTML para correo, no para navegador: todo va en tablas y con estilos
 * en línea porque Gmail, Outlook y compañía descartan <style> y flexbox.
 * La paleta es la de la app (fondo #0a0a0a, acento lima #d4ff00) para que
 * el mensaje se sienta parte del reto y no un correo genérico.
 */

const ACENTO = '#d4ff00';
const FONDO = '#0a0a0a';
const TARJETA = '#141414';
const TEXTO = '#ededed';
const TENUE = '#8a8a8a';
const FUENTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Versión de texto plano: la ven quien bloquea HTML y los lectores de pantalla. */
export function textoPlano({ nombre, codigo, minutos }) {
  return [
    `Hola ${nombre},`,
    '',
    `Tu código para restablecer la contraseña es: ${codigo}`,
    '',
    `Caduca en ${minutos} minutos.`,
    '',
    'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
    '',
    '— RetoGymFit',
  ].join('\n');
}

export function html({ nombre, codigo, reto, minutos }) {
  // El código se parte en dígitos para poder espaciarlos sin depender de
  // letter-spacing, que Outlook ignora.
  const digitos = [...codigo].map((d) => `
              <td style="padding:0 5px;">
                <div style="font-family:${FUENTE};font-size:30px;font-weight:700;color:${ACENTO};
                            background:#1e1e1e;border:1px solid #2e2e2e;border-radius:10px;
                            width:44px;height:56px;line-height:56px;text-align:center;">${d}</div>
              </td>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tu código de recuperación</title>
</head>
<body style="margin:0;padding:0;background:${FONDO};">
  <!-- Preheader: el resumen que muestra la bandeja antes de abrir -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Tu código es ${codigo} y caduca en ${minutos} minutos.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${FONDO};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:480px;background:${TARJETA};border:1px solid #242424;border-radius:18px;overflow:hidden;">

          <tr>
            <td style="padding:32px 32px 8px;text-align:center;">
              <div style="font-family:${FUENTE};font-size:12px;font-weight:700;letter-spacing:2px;
                          color:${ACENTO};text-transform:uppercase;">${reto}</div>
              <h1 style="margin:14px 0 0;font-family:${FUENTE};font-size:23px;line-height:1.3;
                         font-weight:700;color:${TEXTO};">Restablece tu contraseña</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px 0;">
              <p style="margin:0;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${TENUE};text-align:center;">
                Hola <b style="color:${TEXTO};">${nombre}</b>, usa este código para volver a entrar:
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 20px 6px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>${digitos}</tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px 0;">
              <p style="margin:0;font-family:${FUENTE};font-size:13px;color:${TENUE};text-align:center;">
                Caduca en <b style="color:${TEXTO};">${minutos} minutos</b>.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 32px 0;">
              <div style="height:1px;background:#242424;line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px 30px;">
              <p style="margin:0;font-family:${FUENTE};font-size:13px;line-height:1.6;color:${TENUE};text-align:center;">
                ¿No fuiste tú? Ignora este correo — tu contraseña sigue igual y nadie
                puede entrar sin este código.
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 0;font-family:${FUENTE};font-size:11px;color:#5a5a5a;text-align:center;">
          RetoGymFit · Correo automático, no respondas a este mensaje.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

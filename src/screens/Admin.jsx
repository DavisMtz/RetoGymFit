/**
 * Panel del super usuario: ver, ajustar y corregir libremente los datos de
 * todos los participantes (registros, estado, pagos del bote, publicaciones
 * del feed) en ambos retos. Los cambios de registros se replican también a
 * la hoja de Google Sheets (upsert/borrado de la fila) para no capturar dos
 * veces. El acceso lo validan las reglas de Firestore (admin@retogymfit.app).
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast, vibrate, Avatar, StatusStrip, FilasSkeleton } from '../components/ui';
import { LISTA_RETOS, getReto } from '../config/retos';
import {
  adminObtenerUsuarios, adminActualizarUsuario, adminGuardarRegistro, adminBorrarRegistro,
  adminObtenerPagos, adminAgregarPago, adminBorrarPago,
  adminObtenerPosts, adminActualizarPost, adminBorrarPost,
  obtenerHistorial, obtenerRankingSemanal, obtenerComentarios, borrarComentario,
} from '../data/queries';
import { sincronizarRegistroAdmin, borrarRegistroSheet } from '../lib/sheets';
import { hoyMX } from '../lib/dates';

const ESTATUS = ['CUMPLE', 'NO CUMPLE', 'JUSTIFICADO'];

function hace(ts) {
  if (!ts?.toDate) return 'ahora';
  const mins = Math.max(0, Math.round((Date.now() - ts.toDate().getTime()) / 60000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (mins < 1440) return `hace ${Math.round(mins / 60)} h`;
  return `hace ${Math.round(mins / 1440)} d`;
}

function FormRegistro({ reto, usuario, registro, onGuardado, onCancelar }) {
  const toast = useToast();
  const editando = Boolean(registro);
  const [fecha, setFecha] = useState(registro?.fecha || hoyMX());
  const [tipo, setTipo] = useState(registro?.tipo || 'Gimnasio');
  const [minutos, setMinutos] = useState(registro ? String(registro.minutos) : '');
  const [calorias, setCalorias] = useState(registro ? String(registro.calorias) : '');
  const [estatus, setEstatus] = useState(registro?.estatus || 'CUMPLE');
  const [notas, setNotas] = useState(registro?.notas || '');
  const [enviando, setEnviando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    if (!fecha.match(/^\d{4}-\d{2}-\d{2}$/)) { toast('Fecha inválida', true); return; }
    setEnviando(true);
    vibrate(30);
    try {
      const datos = { fecha, tipo, minutos, calorias, estatus, notas: notas.trim(), evidencia: registro?.evidencia ?? 'ADMIN' };
      const reg = await adminGuardarRegistro(reto.id, usuario, datos);
      sincronizarRegistroAdmin(reto, reg); // crea o actualiza la fila en Google Sheets
      toast(editando ? 'Registro actualizado ✓' : 'Registro añadido ✓');
      onGuardado();
    } catch {
      toast('No se pudo guardar el registro.', true);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar}>
      <div className="row-2">
        <div className="field">
          <label className="field-label">Fecha</label>
          <input type="date" value={fecha} disabled={editando} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Actividad</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {reto.actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="row-2">
        <div className="field">
          <label className="field-label">Minutos</label>
          <div className="field-with-unit" data-unit="min">
            <input type="number" min="0" max="1440" placeholder="0" inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Calorías</label>
          <div className="field-with-unit" data-unit="kcal">
            <input type="number" min="0" placeholder="0" inputMode="numeric" value={calorias} onChange={(e) => setCalorias(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Estatus</label>
        <select value={estatus} onChange={(e) => setEstatus(e.target.value)}>
          {ESTATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="field-label">Notas</label>
        <textarea rows="2" maxLength="500" value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      <button className="btn-dark" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar registro'}</button>
      <button className="btn-secondary" type="button" onClick={onCancelar}>Cancelar</button>
    </form>
  );
}

export default function Admin() {
  const { cerrarSesion } = useAuth();
  const toast = useToast();

  const [retoId, setRetoId] = useState('mixto');
  const reto = getReto(retoId);

  const [usuarios, setUsuarios] = useState(null);
  const [diasSemana, setDiasSemana] = useState({});   // usuarioId → días cumplidos esta semana
  const [abierto, setAbierto] = useState(null);       // usuarioId expandido
  const [historial, setHistorial] = useState({});     // usuarioId → registros
  const [pagos, setPagos] = useState(null);
  const [posts, setPosts] = useState(null);
  const [postAbierto, setPostAbierto] = useState(null);     // postId expandido
  const [comentarios, setComentarios] = useState({});       // postId → comentarios
  const [modalRegistro, setModalRegistro] = useState(null); // { usuario, registro|null }
  const [modalBorrar, setModalBorrar] = useState(null);     // { usuario, registro }
  const [modalEditarPost, setModalEditarPost] = useState(null); // post
  const [modalBorrarPost, setModalBorrarPost] = useState(null); // post
  const [textoPost, setTextoPost] = useState('');
  const [modalPago, setModalPago] = useState(false);
  const [modalSalir, setModalSalir] = useState(false);
  const [pago, setPago] = useState({ fecha: hoyMX(), usuario: '', monto: '', notas: '' });
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setUsuarios(null); setPagos(null); setAbierto(null); setHistorial({});
    setPosts(null); setPostAbierto(null); setComentarios({});
    try {
      const [us, ranking, ps, po] = await Promise.all([
        adminObtenerUsuarios(retoId),
        obtenerRankingSemanal(getReto(retoId)),
        adminObtenerPagos(retoId),
        adminObtenerPosts(retoId),
      ]);
      setUsuarios(us);
      setDiasSemana(Object.fromEntries(ranking.map((r) => [r.usuarioId, r.dias])));
      setPagos(ps);
      setPosts(po);
    } catch {
      toast('Error al cargar datos del reto', true);
      setUsuarios([]); setPagos([]); setPosts([]);
    }
  }, [retoId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const cargarHistorial = useCallback(async (usuarioId) => {
    try {
      const h = await obtenerHistorial(retoId, usuarioId, 30);
      setHistorial((prev) => ({ ...prev, [usuarioId]: h }));
    } catch {
      toast('No pude cargar el historial', true);
    }
  }, [retoId, toast]);

  function toggleUsuario(u) {
    vibrate(12);
    const nuevo = abierto === u.id ? null : u.id;
    setAbierto(nuevo);
    if (nuevo && !historial[u.id]) cargarHistorial(u.id);
  }

  async function cambiarEstado(u) {
    const nuevo = u.estado === 'Activo' ? 'Baja' : 'Activo';
    try {
      await adminActualizarUsuario(retoId, u.id, { estado: nuevo });
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, estado: nuevo } : x)));
      toast(`${u.nombre.split(' ')[0]} ahora está: ${nuevo}`);
    } catch {
      toast('No se pudo cambiar el estado.', true);
    }
  }

  async function borrarRegistro() {
    const { usuario, registro } = modalBorrar;
    setModalBorrar(null);
    try {
      await adminBorrarRegistro(retoId, registro.id);
      borrarRegistroSheet(reto, registro); // quita también la fila de Google Sheets
      toast('Registro eliminado ✓ (también de la hoja)');
      await cargarHistorial(usuario.id);
    } catch {
      toast('No se pudo eliminar.', true);
    }
  }

  // ——— moderación del feed

  function togglePost(p) {
    vibrate(12);
    const nuevo = postAbierto === p.id ? null : p.id;
    setPostAbierto(nuevo);
    if (nuevo && !comentarios[p.id] && (p.numComentarios || 0) > 0) {
      obtenerComentarios(retoId, p.id)
        .then((cs) => setComentarios((prev) => ({ ...prev, [p.id]: cs })))
        .catch(() => toast('No pude cargar los comentarios', true));
    }
  }

  async function guardarPost(e) {
    e.preventDefault();
    const post = modalEditarPost;
    const texto = textoPost.trim();
    if (!texto && !post.fotoURL) { toast('La publicación no puede quedar vacía', true); return; }
    setEnviando(true);
    try {
      await adminActualizarPost(retoId, post.id, { texto, editadoPorAdmin: true });
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, texto } : p)));
      setModalEditarPost(null);
      toast('Publicación actualizada ✓');
    } catch {
      toast('No se pudo actualizar.', true);
    } finally {
      setEnviando(false);
    }
  }

  async function borrarPost() {
    const post = modalBorrarPost;
    setModalBorrarPost(null);
    try {
      await adminBorrarPost(retoId, post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      toast('Publicación eliminada');
    } catch {
      toast('No se pudo eliminar la publicación.', true);
    }
  }

  async function borrarComentarioAdmin(post, c) {
    try {
      await borrarComentario(retoId, post.id, c.id);
      setComentarios((prev) => ({ ...prev, [post.id]: (prev[post.id] || []).filter((x) => x.id !== c.id) }));
      setPosts((prev) => prev.map((p) => (p.id === post.id
        ? { ...p, numComentarios: Math.max(0, (p.numComentarios || 0) - 1) } : p)));
      toast('Comentario eliminado');
    } catch {
      toast('No se pudo borrar el comentario.', true);
    }
  }

  async function agregarPago(e) {
    e.preventDefault();
    if (!pago.usuario.trim() || !(Number(pago.monto) > 0)) { toast('Indica participante y monto', true); return; }
    setEnviando(true);
    try {
      await adminAgregarPago(retoId, pago);
      toast('Pago registrado ✓');
      setModalPago(false);
      setPago({ fecha: hoyMX(), usuario: '', monto: '', notas: '' });
      setPagos(await adminObtenerPagos(retoId));
    } catch {
      toast('No se pudo registrar el pago.', true);
    } finally {
      setEnviando(false);
    }
  }

  async function borrarPago(p) {
    try {
      await adminBorrarPago(retoId, p.id);
      setPagos((prev) => prev.filter((x) => x.id !== p.id));
      toast('Pago eliminado');
    } catch {
      toast('No se pudo eliminar el pago.', true);
    }
  }

  const bote = pagos === null ? null : pagos.reduce((t, p) => t + (Number(p.monto) || 0), 0);
  const activos = (usuarios || []).filter((u) => u.estado === 'Activo').length;
  const iconos = Object.fromEntries(reto.actividades.map((a) => [a.id, a.icono]));
  const fotosUsuarios = Object.fromEntries((usuarios || []).filter((u) => u.photoURL).map((u) => [u.id, u.photoURL]));

  return (
    <div className="app-shell">
      <header className="header">
        <div className="brand">
          <div className="brand-avatar">
            <div className="brand-avatar-img">⚡</div>
            <span className="brand-avatar-badge">A</span>
          </div>
          <div className="brand-text">
            <b>Panel Admin</b>
            <span>Super usuario</span>
          </div>
        </div>
        <button className="rules-pill" type="button" onClick={() => { vibrate(); setModalSalir(true); }}>Salir</button>
      </header>
      <StatusStrip />

      <div className="rank-tabs" role="tablist">
        {LISTA_RETOS.map((r) => (
          <button
            key={r.id}
            className={`rank-tab ${retoId === r.id ? 'active' : ''}`}
            role="tab"
            onClick={() => { vibrate(); setRetoId(r.id); }}
          >
            {r.subtitulo}
          </button>
        ))}
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat-tile">
          <div className="st-num">{usuarios === null ? '—' : activos}</div>
          <div className="st-label">Participantes<br />activos</div>
        </div>
        <div className="stat-tile">
          <div className="st-num">{bote === null ? '—' : `$${bote.toLocaleString('es-MX')}`}</div>
          <div className="st-label">Bote<br />acumulado</div>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><h2 className="card-title">Participantes</h2></div>
        {usuarios === null && <FilasSkeleton rows={5} />}
        {usuarios !== null && !usuarios.length && <div className="rank-empty">Sin participantes en este reto.</div>}
        {(usuarios || []).map((u) => (
          <div className={`admin-user ${abierto === u.id ? 'open' : ''}`} key={u.id}>
            <button className="admin-user-head" type="button" onClick={() => toggleUsuario(u)}>
              <Avatar nombre={u.nombre} url={u.photoURL} className="rank-av" />
              <div className="admin-user-info">
                <b>{u.nombre}</b>
                <span>
                  {u.estado === 'Activo' ? `${diasSemana[u.id] || 0}d esta semana` : 'De baja'}
                  {u.hasPassword ? ' · cuenta activa' : ' · sin contraseña'}
                </span>
              </div>
              <span className={`chip-estatus ${u.estado === 'Activo' ? 'cumple' : 'nocumple'}`}>{u.estado}</span>
            </button>
            {abierto === u.id && (
              <div className="admin-user-body">
                <div className="admin-actions">
                  <button className="admin-btn" type="button" onClick={() => { vibrate(); setModalRegistro({ usuario: u, registro: null }); }}>
                    ＋ Añadir registro
                  </button>
                  <button className="admin-btn" type="button" onClick={() => { vibrate(); cambiarEstado(u); }}>
                    {u.estado === 'Activo' ? '⏸ Dar de baja' : '▶ Reactivar'}
                  </button>
                </div>
                {!historial[u.id] && <div className="rank-empty" style={{ padding: '16px' }}>Cargando historial…</div>}
                {historial[u.id] && !historial[u.id].length && (
                  <div className="rank-empty" style={{ padding: '16px' }}>Sin registros aún.</div>
                )}
                {(historial[u.id] || []).map((r) => (
                  <div className="hist-row admin-hist" key={r.id}>
                    <div className="hist-icon">{iconos[r.tipo] || '💪'}</div>
                    <div className="hist-info">
                      <div className="hist-tipo">
                        {r.fecha.slice(5)} <span className={`chip-estatus ${r.estatus === 'CUMPLE' ? 'cumple' : r.estatus === 'JUSTIFICADO' ? 'justificado' : 'nocumple'}`}>{r.estatus}</span>
                      </div>
                      <div className="hist-meta">
                        {r.tipo}{r.minutos > 0 ? ` · ${r.minutos} min` : ''}{r.calorias > 0 ? ` · ${r.calorias} kcal` : ''}
                      </div>
                    </div>
                    <div className="admin-row-actions">
                      <button className="icon-btn" type="button" aria-label="Editar" onClick={() => { vibrate(); setModalRegistro({ usuario: u, registro: r }); }}>✏️</button>
                      <button className="icon-btn danger" type="button" aria-label="Eliminar" onClick={() => { vibrate(); setModalBorrar({ usuario: u, registro: r }); }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head"><h2 className="card-title">Publicaciones del feed</h2></div>
        {posts === null && <FilasSkeleton rows={3} />}
        {posts !== null && !posts.length && <div className="rank-empty">Nadie ha publicado en este reto.</div>}
        {(posts || []).map((p) => (
          <div className={`admin-user ${postAbierto === p.id ? 'open' : ''}`} key={p.id}>
            <button className="admin-user-head" type="button" onClick={() => togglePost(p)}>
              <Avatar nombre={p.nombre} url={fotosUsuarios[p.usuarioId]} className="rank-av" />
              <div className="admin-user-info">
                <b>{p.nombre}</b>
                <span>
                  {hace(p.creadoEn)}
                  {p.fotoURL ? ' · 📷 foto' : ''}
                  {` · ${Object.keys(p.reacciones || {}).length} reacciones · ${p.numComentarios || 0} comentarios`}
                </span>
              </div>
            </button>
            {postAbierto === p.id && (
              <div className="admin-user-body">
                {p.texto && <p className="post-text" style={{ padding: '10px 14px 0' }}>{p.texto}</p>}
                {p.fotoURL && (
                  <img className="post-photo" src={p.fotoURL} alt="" loading="lazy" style={{ margin: '10px 14px 0', maxWidth: 'calc(100% - 28px)', borderRadius: '12px' }} />
                )}
                <div className="admin-actions">
                  <button className="admin-btn" type="button" onClick={() => { vibrate(); setTextoPost(p.texto || ''); setModalEditarPost(p); }}>
                    ✏️ Editar texto
                  </button>
                  <button className="admin-btn" type="button" onClick={() => { vibrate(); setModalBorrarPost(p); }}>
                    🗑️ Eliminar publicación
                  </button>
                </div>
                {(p.numComentarios || 0) > 0 && !comentarios[p.id] && (
                  <div className="rank-empty" style={{ padding: '12px' }}>Cargando comentarios…</div>
                )}
                {(comentarios[p.id] || []).map((c) => (
                  <div className="hist-row admin-hist" key={c.id}>
                    <div className="hist-icon">💬</div>
                    <div className="hist-info">
                      <div className="hist-tipo">{c.nombre}</div>
                      <div className="hist-meta">{c.texto}</div>
                    </div>
                    <div className="admin-row-actions">
                      <button className="icon-btn danger" type="button" aria-label="Eliminar comentario" onClick={() => { vibrate(); borrarComentarioAdmin(p, c); }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Pagos del bote</h2>
          <button className="admin-btn" type="button" onClick={() => { vibrate(); setModalPago(true); }}>＋ Pago</button>
        </div>
        {pagos === null && <FilasSkeleton rows={2} />}
        {pagos !== null && !pagos.length && <div className="rank-empty">Sin pagos capturados.</div>}
        {(pagos || []).map((p) => (
          <div className="hist-row admin-hist" key={p.id}>
            <div className="hist-icon">💸</div>
            <div className="hist-info">
              <div className="hist-tipo">${(Number(p.monto) || 0).toLocaleString('es-MX')} · {p.usuario}</div>
              <div className="hist-meta">{p.fecha}{p.notas ? ` · ${p.notas}` : ''}</div>
            </div>
            <div className="admin-row-actions">
              <button className="icon-btn danger" type="button" aria-label="Eliminar pago" onClick={() => { vibrate(); borrarPago(p); }}>🗑️</button>
            </div>
          </div>
        ))}
      </section>

      {/* Modal añadir/editar registro */}
      <div className={`modal-overlay ${modalRegistro ? 'show' : ''}`}>
        <div className="modal" style={{ textAlign: 'left' }}>
          {modalRegistro && (
            <>
              <h2 style={{ textAlign: 'center' }}>{modalRegistro.registro ? 'Editar registro' : 'Nuevo registro'}</h2>
              <p style={{ textAlign: 'center' }}>{modalRegistro.usuario.nombre}</p>
              <FormRegistro
                key={`${modalRegistro.usuario.id}-${modalRegistro.registro?.id || 'nuevo'}`}
                reto={reto}
                usuario={modalRegistro.usuario}
                registro={modalRegistro.registro}
                onCancelar={() => setModalRegistro(null)}
                onGuardado={async () => {
                  const uid = modalRegistro.usuario.id;
                  setModalRegistro(null);
                  await cargarHistorial(uid);
                }}
              />
            </>
          )}
        </div>
      </div>

      {/* Modal confirmar borrado de registro */}
      <div className={`modal-overlay ${modalBorrar ? 'show' : ''}`}>
        <div className="modal">
          <h2>¿Eliminar registro?</h2>
          <p>
            {modalBorrar && `${modalBorrar.usuario.nombre} · ${modalBorrar.registro.fecha} · ${modalBorrar.registro.tipo}. `}
            También se eliminará su fila en la hoja de Google Sheets.
          </p>
          <button className="btn-dark" type="button" onClick={borrarRegistro}>Sí, eliminar</button>
          <button className="btn-secondary" type="button" onClick={() => setModalBorrar(null)}>Cancelar</button>
        </div>
      </div>

      {/* Modal editar publicación */}
      <div className={`modal-overlay ${modalEditarPost ? 'show' : ''}`}>
        <div className="modal" style={{ textAlign: 'left' }}>
          {modalEditarPost && (
            <>
              <h2 style={{ textAlign: 'center' }}>Editar publicación</h2>
              <p style={{ textAlign: 'center' }}>{modalEditarPost.nombre}</p>
              <form onSubmit={guardarPost}>
                <div className="field">
                  <label className="field-label">Texto</label>
                  <textarea rows="4" maxLength="500" value={textoPost} onChange={(e) => setTextoPost(e.target.value)} />
                </div>
                <button className="btn-dark" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar cambios'}</button>
                <button className="btn-secondary" type="button" onClick={() => setModalEditarPost(null)}>Cancelar</button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Modal confirmar borrado de publicación */}
      <div className={`modal-overlay ${modalBorrarPost ? 'show' : ''}`}>
        <div className="modal">
          <h2>¿Eliminar publicación?</h2>
          <p>
            {modalBorrarPost && `Publicación de ${modalBorrarPost.nombre}. `}
            Se borrará para todo el equipo, con sus comentarios y reacciones. Esta acción no se puede deshacer.
          </p>
          <button className="btn-dark" type="button" onClick={borrarPost}>Sí, eliminar</button>
          <button className="btn-secondary" type="button" onClick={() => setModalBorrarPost(null)}>Cancelar</button>
        </div>
      </div>

      {/* Modal nuevo pago */}
      <div className={`modal-overlay ${modalPago ? 'show' : ''}`}>
        <div className="modal" style={{ textAlign: 'left' }}>
          <h2 style={{ textAlign: 'center' }}>Registrar pago</h2>
          <form onSubmit={agregarPago}>
            <div className="row-2">
              <div className="field">
                <label className="field-label">Fecha</label>
                <input type="date" value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label">Monto (MXN)</label>
                <input type="number" min="0" step="0.01" placeholder="65" inputMode="decimal" value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Participante</label>
              <select value={pago.usuario} onChange={(e) => setPago({ ...pago, usuario: e.target.value })}>
                <option value="">Elige…</option>
                {(usuarios || []).map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Notas</label>
              <input type="text" maxLength="120" placeholder="GYM semana 5" value={pago.notas} onChange={(e) => setPago({ ...pago, notas: e.target.value })} />
            </div>
            <button className="btn-dark" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar pago'}</button>
            <button className="btn-secondary" type="button" onClick={() => setModalPago(false)}>Cancelar</button>
          </form>
        </div>
      </div>

      {/* Modal salir */}
      <div className={`modal-overlay ${modalSalir ? 'show' : ''}`}>
        <div className="modal">
          <h2>¿Salir del panel?</h2>
          <p>Cerrarás la sesión de administrador.</p>
          <button className="btn-dark" type="button" onClick={cerrarSesion}>Sí, salir</button>
          <button className="btn-secondary" type="button" onClick={() => setModalSalir(false)}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

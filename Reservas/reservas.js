const express = require('express');
const router = express.Router();
const { connectDB } = require('../database.js'); 
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'appSolicitudReserva.log' })
  ],
});

// =============================================================
// POST: CREACIÓN DE NUEVA SOLICITUD DE RESERVA - POSTGRESQL
// =============================================================
router.post('/', async (req, res) => {
  logger.info('[INFO] Intento de crear nueva solicitud de reserva.');
  const data = req.body;
  
  // CAPTURAR USUARIO PARA AUDITORÍA
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  logger.info(`[INFO] Usuario que crea la solicitud: ${usuario}`);
  
  let client;

  // Sanitizar horas para PostgreSQL
  const sanitizeTime = (timeString) => {
    if (!timeString) return null;
    if (/^\d{2}:\d{2}$/.test(timeString)) return timeString + ":00";
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) return timeString;
    return null;
  };

  const horaInicioSanitizada = sanitizeTime(data.HoraInicio);
  const horaFinSanitizada = sanitizeTime(data.HoraFin);
  logger.info(`[INFO] Horas normalizadas: Inicio=${horaInicioSanitizada}, Fin=${horaFinSanitizada}`);

  // IDs de catálogo
  const ID_TIPO_SOLICITANTE_INTERNO = 1;
  const ID_TIPO_SOLICITANTE_EXTERNO = 2;
  const ID_ESTADO_PENDIENTE = 4;

  let idEmpleado = null;
  let idSolicitanteExterno = null;
  let idTipoSolicitante = null;

  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Validación de conflicto de horario - PostgreSQL
    logger.info('[INFO] Verificando conflicto de horario para la nueva solicitud.');
    const conflictCheckQuery = `
      SELECT
          s.idsolicitud as "IdSolicitud",
          s.nombreevento as "NombreEvento",
          TO_CHAR(s.horainicio, 'HH24:MI:SS') as "HoraInicio",
          TO_CHAR(s.horafin, 'HH24:MI:SS') as "HoraFin",
          sal.nombre as "NombreSalon"
      FROM solicitudes s
      INNER JOIN solicitudsalones ss ON s.idsolicitud = ss.idsolicitud
      INNER JOIN salones sal ON ss.idsalon = sal.idsalon 
      WHERE
          ss.idsalon = $1
          AND s.fechaevento = $2
          AND s.idestado IN (4, 5)
          AND (
              (s.horainicio < $4 AND s.horafin > $3)
              OR ($3 < s.horafin AND $4 > s.horainicio)
          );
    `;

    const conflictResult = await client.query(conflictCheckQuery, [
      data.IdSalon, 
      data.FechaEvento,
      horaInicioSanitizada,
      horaFinSanitizada
    ]);

    if (conflictResult.rows.length > 0) {
      await client.query('ROLLBACK');
      logger.warn(`[WARN] Conflicto de horario detectado. Rollback. Solicitud cancelada.`);
      const conflictInfo = conflictResult.rows.map(r => ({
        IdSolicitud: r.IdSolicitud,
        NombreEvento: r.NombreEvento,
        HoraInicio: r.HoraInicio,
        HoraFin: r.HoraFin,
        NombreSalon: r.NombreSalon
      }));
      return res.status(409).json({
        message: 'Conflicto de horario. Ya existe una solicitud PENDIENTE o AUTORIZADA para este salón en el horario solicitado.',
        isConflict: true,
        conflicts: conflictInfo
      });
    }
    logger.info('[INFO] No se detectó conflicto de horario. Continuando con el registro.');

    // 1. Solicitud Interna o Externa
    if (data.TipoSolicitud === 'Interna') {
      idTipoSolicitante = ID_TIPO_SOLICITANTE_INTERNO;
      idEmpleado = data.IdEmpleado || null;
      if (!idEmpleado) throw new Error("ID de Empleado faltante para solicitud Interna.");
    } else if (data.TipoSolicitud === 'Externa') {
      idTipoSolicitante = ID_TIPO_SOLICITANTE_EXTERNO;

      if (!data.EmailExterno || !data.NombreSolicitanteExterno || !data.EmpresaExterna) {
        throw new Error("Datos de Solicitante Externo faltantes.");
      }

      // Buscar o crear solicitante externo
      let result = await client.query(
        'SELECT idsolicitanteexterno FROM solicitantesexternos WHERE email = $1',
        [data.EmailExterno]
      );

      if (result.rows.length > 0) {
        idSolicitanteExterno = result.rows[0].idsolicitanteexterno;
      } else {
        result = await client.query(
          `INSERT INTO solicitantesexternos (nombre, empresa, email, telefono) 
           VALUES ($1, $2, $3, $4) RETURNING idsolicitanteexterno`,
          [data.NombreSolicitanteExterno, data.EmpresaExterna, data.EmailExterno, data.TelefonoExterno || null]
        );
        idSolicitanteExterno = result.rows[0].idsolicitanteexterno;
        logger.info(`[INFO] Nuevo solicitante externo creado: ${idSolicitanteExterno}`);
      }
    }

    // 2. Insertar en Solicitudes
    const solicitudResult = await client.query(
      `INSERT INTO solicitudes 
        (idtiposolicitante, nombreevento, fechaevento, horainicio, horafin, participantes, observaciones, idestado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING idsolicitud`,
      [idTipoSolicitante, data.NombreEvento, data.FechaEvento, horaInicioSanitizada, 
       horaFinSanitizada, data.NumParticipantes, data.Observaciones || '', ID_ESTADO_PENDIENTE]
    );

    const idSolicitud = solicitudResult.rows[0].idsolicitud;
    logger.info(`[INFO] Registro de Solicitud principal creado: ${idSolicitud}`);

    // 3. Insertar en SolicitudesSolicitantes
    await client.query(
      `INSERT INTO solicitudessolicitantes (idsolicitud, idempleado, idsolicitanteexterno)
        VALUES ($1, $2, $3)`,
      [idSolicitud, idEmpleado, idSolicitanteExterno]
    );

    // 4. Insertar en SolicitudSalones
    const solicitudSalonResult = await client.query(
      `INSERT INTO solicitudsalones (idsolicitud, idsalon, idcapacidad, nota)
        VALUES ($1, $2, $3, $4) RETURNING idsolicitudsalon`,
      [idSolicitud, data.IdSalon, data.IdCapacidad, data.NotaSalon || null]
    );
    const idSolicitudSalon = solicitudSalonResult.rows[0].idsolicitudsalon;

    // DEBUG: Mostrar estructura de datos recibida
    console.log('=== ESTRUCTURA DE DATOS RECIBIDA ===');
    console.log('Tipo de ServiciosSeleccionados:', typeof data.ServiciosSeleccionados);
    console.log('Es array?', Array.isArray(data.ServiciosSeleccionados));
    if (Array.isArray(data.ServiciosSeleccionados) && data.ServiciosSeleccionados.length > 0) {
      console.log('Primer elemento de ServiciosSeleccionados:', data.ServiciosSeleccionados[0]);
      console.log('Keys del primer elemento:', Object.keys(data.ServiciosSeleccionados[0]));
    }
    console.log('====================================');

    // 5. Insertar detalles (Servicios, Equipo, Degustaciones) - VERSIÓN CORREGIDA
    const insertDetails = async (details, table, columnId) => {
      if (Array.isArray(details) && details.length > 0) {
        console.log(`[DEBUG] Insertando en ${table}:`, details);
        
        for (const detail of details) {
          // EXTRAER ID CORRECTAMENTE - Respeta mayúsculas del frontend
          let detailId;
          let detailNota = null;

          if (typeof detail === 'object' && detail !== null) {
            // Buscar el ID con las claves exactas que usa el frontend
            if (columnId === 'idservicio') {
              detailId = detail.IdServicio;
              console.log('IdServicio encontrado:', detailId);
            } else if (columnId === 'idequipo') {
              detailId = detail.IdEquipo;
              console.log('IdEquipo encontrado:', detailId);
            } else if (columnId === 'iddegustacion') {
              detailId = detail.IdDegustacion;
              console.log('IdDegustacion encontrado:', detailId);
            } else {
              detailId = detail[columnId] || detail.id;
            }
            
            detailNota = detail.Nota || null;
          }

          // Validar que tenemos un ID válido
          if (detailId === null || detailId === undefined || isNaN(detailId)) {
            console.warn(`[WARN] ID inválido para ${table}:`, detail);
            continue;
          }

          console.log(`[INFO] Insertando en ${table}: ID=${detailId}, Nota=${detailNota}`);

          // Construir consulta SQL
          let sqlQuery = `INSERT INTO ${table} (idsolicitudsalon, ${columnId}`;
          let sqlValues = 'VALUES ($1, $2';
          const params = [idSolicitudSalon, detailId];

          if ((table === 'solicitudservicios' || table === 'solicitudequipo' || table === 'solicituddegustaciones') && detailNota !== null) {
            sqlQuery += ', nota';
            sqlValues += ', $3';
            params.push(detailNota);
          }
          
          sqlQuery += ') ' + sqlValues + ')';
          
          try {
            await client.query(sqlQuery, params);
            console.log(`[SUCCESS] Registro insertado en ${table}: ID=${detailId}`);
          } catch (err) {
            console.error(`[ERROR] Error al insertar en ${table}:`, err.message);
            throw err;
          }
        }
      } else {
        console.log(`[INFO] No hay detalles para insertar en ${table}`);
      }
    };

    // Insertar los detalles
    await insertDetails(data.ServiciosSeleccionados, 'solicitudservicios', 'idservicio');
    await insertDetails(data.EquipoSeleccionado, 'solicitudequipo', 'idequipo');
    if (data.RequiereDegustacion === 'SI') {
      await insertDetails(data.DegustacionesSeleccionadas, 'solicituddegustaciones', 'iddegustacion');
    }

    // 6. Commit
    await client.query('COMMIT');
    logger.info(`[INFO] Solicitud de reserva ${idSolicitud} finalizada con COMMIT por usuario: ${usuario}`);

    res.status(201).json({
      Message: 'Solicitud enviada exitosamente. Estado: PENDIENTE.',
      IdSolicitud: idSolicitud
    });

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.warn(`[WARN] Transacción con ROLLBACK debido a error.`);
    logger.error(`[ERR] Error al procesar la solicitud de reserva: ${err.message}`);
    res.status(500).json({ error: 'Error al procesar la solicitud. ' + err.message });
  } finally {
    if (client) client.release();
  }
});

// =============================================================
// GET: BÚSQUEDA DE SOLICITANTES EXTERNOS POR COINCIDENCIA - POSTGRESQL
// =============================================================
router.get('/solicitantes-externos/search', async (req, res) => {
  const query = req.query.q;

  if (!query || query.length < 3) {
    return res.status(200).json([]);
  }

  try {
    const client = await connectDB();
    const searchTerm = `%${query}%`;

    const result = await client.query(`
      SELECT 
        idsolicitanteexterno as "IdSolicitanteExterno",
        nombre as "Nombre",
        empresa as "Empresa",
        email as "Email",
        telefono as "Telefono"
      FROM 
        solicitantesexternos
      WHERE 
        email ILIKE $1 OR 
        nombre ILIKE $1 OR 
        empresa ILIKE $1
      ORDER BY
        nombre
    `, [searchTerm]);

    res.status(200).json(result.rows);

  } catch (err) {
    logger.error(`[ERROR] Error al buscar solicitantes externos: ${err.message}`);
    res.status(500).json([]);
  }
});

// =============================================================
// GET: OBTENER SOLICITUDES PARA CALENDARIO - POSTGRESQL
// =============================================================
router.get('/calendario', async (req, res) => {
  logger.info('[INFO] Intento de obtener solicitudes para calendario.');
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        s.idsolicitud as "IdSolicitud", 
        s.nombreevento as "NombreEvento", 
        s.fechaevento as "FechaEvento", 
        TO_CHAR(s.horainicio, 'HH24:MI:SS') as "HoraInicio", 
        TO_CHAR(s.horafin, 'HH24:MI:SS') as "HoraFin", 
        s.idestado as "IdEstado",
        sal.nombre as "NombreSalon"
      FROM 
        solicitudes s
      INNER JOIN
        solicitudsalones ssal ON s.idsolicitud = ssal.idsolicitud
      INNER JOIN
        salones sal ON ssal.idsalon = sal.idsalon
      WHERE 
        s.idestado IN (4, 5)
    `);

    const eventos = result.rows.map(solicitud => {
      const fecha = new Date(solicitud.FechaEvento).toISOString().split('T')[0];
      const horaInicioLimpia = solicitud.HoraInicio;
      const horaFinLimpia = solicitud.HoraFin;

      let colorEvento;
      let estadoTexto;
      
      if (solicitud.IdEstado === 5) { 
        colorEvento = '#2a8617ff';
        estadoTexto = 'AUTORIZADA';
      } else if (solicitud.IdEstado === 4) { 
        colorEvento = '#e6650fff';
        estadoTexto = 'PENDIENTE';
      } else {
        colorEvento = '#501d1bff'; 
        estadoTexto = 'OTRO';
      }

      return {
        id: solicitud.IdSolicitud,
        title: `${solicitud.NombreEvento} (${solicitud.NombreSalon}) - ${estadoTexto}`,
        start: `${fecha}T${horaInicioLimpia}`, 
        end: `${fecha}T${horaFinLimpia}`,
        color: colorEvento,
        extendedProps: { 
          estado: estadoTexto,
          idEstado: solicitud.IdEstado,
          salon: solicitud.NombreSalon,
          IdSolicitud: solicitud.IdSolicitud 
        }
      };
    });

    res.status(200).json(eventos);

  } catch (err) {
    logger.error(`[ERROR] Error al obtener solicitudes para calendario: ${err.message}`);
    res.status(500).json({ message: 'Error al cargar eventos del calendario.' });
  }
});

// =============================================================
// GET: VERIFICAR SUPERPOSICIÓN DE HORARIO - POSTGRESQL
// =============================================================
router.get('/check-overlap', async (req, res) => {
  logger.info('[INFO] Intento de verificar superposición de horario.');
  const { fecha, horaInicio } = req.query;
  
  if (!fecha || !horaInicio) {
    return res.status(400).json({ message: "Fecha y HoraInicio son requeridos." });
  }

  const horaInicioLimpia = horaInicio.length === 5 ? `${horaInicio}:00` : horaInicio;

  try {
    const client = await connectDB();
    
    const query = `
      SELECT 
        s.idsolicitud as "IdSolicitud", 
        s.nombreevento as "NombreEvento", 
        TO_CHAR(s.horainicio, 'HH24:MI:SS') as "HoraInicio",
        TO_CHAR(s.horafin, 'HH24:MI:SS') as "HoraFin"
      FROM solicitudes s
      WHERE 
        s.fechaevento = $1
        AND s.idestado IN (4, 5) 
        AND (
          (s.horainicio <= $2 AND s.horafin > $2)
          OR (s.horainicio = $2)
        );
    `;
    
    const result = await client.query(query, [fecha, horaInicioLimpia]);

    if (result.rows.length > 0) {
      const conflictInfo = result.rows.map(r => ({
        IdSolicitud: r.IdSolicitud,
        NombreEvento: r.NombreEvento,
        HoraInicio: r.HoraInicio,
        HoraFin: r.HoraFin
      }));
      res.status(200).json({ isConflict: true, conflicts: conflictInfo });
    } else {
      res.status(200).json({ isConflict: false });
    }

  } catch (err) {
    logger.error(`[ERROR] Error al verificar superposición de horario: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al verificar disponibilidad.', error: err.message });
  }
});

// =============================================================
// GET: OBTENER SOLICITUD POR ID (COMPLETO) - POSTGRESQL
// =============================================================
router.get('/:id', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Intento de obtener solicitud con ID: ${idSolicitud}`);

  try {
    const client = await connectDB();
    
    // Consulta principal de la solicitud - PostgreSQL
    const solicitudQuery = `
      SELECT 
        s.idsolicitud as "idSolicitud",
        s.idtiposolicitante as "IdTipoSolicitante",
        s.nombreevento AS "NombreEvento",
        s.fechaevento AS "FechaEvento",
        s.horainicio AS "HoraInicio",
        s.horafin AS "HoraFin",
        s.participantes AS "Participantes",
        s.observaciones AS "Observaciones",
        s.idestado AS "IdEstado",
        s.fechasolicitud AS "FechaSolicitud",
        ss.idsalon as "IdSalon",
        ss.idcapacidad as "IdCapacidad",
        ss.nota as "NotaSalon",
        se.nombre as "NombreSolicitanteExterno",
        se.empresa as "EmpresaExterna",
        ssol.idempleado as "IdEmpleado",  
        se.email as "EmailExterno",
        se.telefono as "TelefonoExterno",
        TO_CHAR(s.horainicio, 'HH24:MI:SS') as "HoraInicio",
        TO_CHAR(s.horafin, 'HH24:MI:SS') as "HoraFin"
      FROM solicitudes s
      LEFT JOIN solicitudsalones ss ON s.idsolicitud = ss.idsolicitud
      LEFT JOIN solicitudessolicitantes ssol ON s.idsolicitud = ssol.idsolicitud
      LEFT JOIN solicitantesexternos se ON ssol.idsolicitanteexterno = se.idsolicitanteexterno
      WHERE s.idsolicitud = $1
    `;

    const solicitudResult = await client.query(solicitudQuery, [idSolicitud]);

    if (solicitudResult.rows.length === 0) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    const solicitud = solicitudResult.rows[0];

    // Cargar servicios seleccionados
    const serviciosResult = await client.query(`
      SELECT ss.idservicio as "IdServicio", ss.nota as "Nota" 
      FROM solicitudservicios ss
      INNER JOIN solicitudsalones ssal ON ss.idsolicitudsalon = ssal.idsolicitudsalon
      WHERE ssal.idsolicitud = $1
    `, [idSolicitud]);
    solicitud.ServiciosSeleccionados = serviciosResult.rows;

    // Cargar equipo seleccionado
    const equipoResult = await client.query(`
      SELECT se.idequipo as "IdEquipo", se.nota as "Nota" 
      FROM solicitudequipo se
      INNER JOIN solicitudsalones ssal ON se.idsolicitudsalon = ssal.idsolicitudsalon
      WHERE ssal.idsolicitud = $1
    `, [idSolicitud]);
    solicitud.EquipoSeleccionado = equipoResult.rows;

    // Cargar degustaciones seleccionadas
    const degustacionesResult = await client.query(`
      SELECT sd.iddegustacion as "IdDegustacion", sd.nota as "Nota" 
      FROM solicituddegustaciones sd
      INNER JOIN solicitudsalones ssal ON sd.idsolicitudsalon = ssal.idsolicitudsalon
      WHERE ssal.idsolicitud = $1
    `, [idSolicitud]);
    solicitud.DegustacionesSeleccionadas = degustacionesResult.rows;

    // Determinar el tipo de solicitud basado en los datos
    if (solicitud.idtiposolicitante === 1) {
      solicitud.TipoSolicitud = 'Interna';
    } else if (solicitud.idtiposolicitante === 2) {
      solicitud.TipoSolicitud = 'Externa';
    }

    // Determinar si requiere degustación
    solicitud.RequiereDegustacion = solicitud.DegustacionesSeleccionadas.length > 0 ? 'SI' : 'NO';

    res.status(200).json(solicitud);

  } catch (err) {
    logger.error(`[ERROR] Error al obtener solicitud por ID ${idSolicitud}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al obtener solicitud.' });
  }
});

// =============================================================
// PUT: ACTUALIZAR SOLICITUD COMPLETA CON AUDITORÍA - POSTGRESQL
// =============================================================
router.put('/:id', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Intento de actualizar solicitud completa con ID: ${idSolicitud}`);
  const data = req.body;
  
  // CAPTURAR USUARIO PARA AUDITORÍA
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  logger.info(`[INFO] Usuario que modifica la solicitud ${idSolicitud}: ${usuario}`);
  
  let client;

  // Sanitizar horas
  const sanitizeTime = (timeString) => {
    if (!timeString) return null;
    if (/^\d{2}:\d{2}$/.test(timeString)) return timeString + ":00";
    if (/^\d{2}:\d{2}:\d{2}$/.test(timeString)) return timeString;
    return null;
  };
  const horaInicioSanitizada = sanitizeTime(data.HoraInicio);
  const horaFinSanitizada = sanitizeTime(data.HoraFin);

  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Validación de conflicto de horario (excluyendo la solicitud actual)
    logger.info('[INFO] Verificando conflicto de horario para la actualización.');
    const conflictCheckQuery = `
      SELECT
        s.idsolicitud as "IdSolicitud",
        s.nombreevento as "NombreEvento",
        TO_CHAR(s.horainicio, 'HH24:MI:SS') as "HoraInicio",
        TO_CHAR(s.horafin, 'HH24:MI:SS') as "HoraFin",
        sal.nombre as "NombreSalon"
      FROM solicitudes s
      INNER JOIN solicitudsalones ss ON s.idsolicitud = ss.idsolicitud
      INNER JOIN salones sal ON ss.idsalon = sal.idsalon 
      WHERE
        ss.idsalon = $1
        AND s.fechaevento = $2
        AND s.idestado IN (4, 5)
        AND s.idsolicitud != $3
        AND (
          (s.horainicio < $5 AND s.horafin > $4)
          OR ($4 < s.horafin AND $5 > s.horainicio)
        );
    `;

    const conflictResult = await client.query(conflictCheckQuery, [
      data.IdSalon, 
      data.FechaEvento,
      idSolicitud,
      horaInicioSanitizada,
      horaFinSanitizada
    ]);

    if (conflictResult.rows.length > 0) {
      await client.query('ROLLBACK');
      logger.warn(`[WARN] Conflicto de horario detectado. Rollback. Actualización cancelada.`);
      const conflictInfo = conflictResult.rows.map(r => ({
        IdSolicitud: r.IdSolicitud,
        NombreEvento: r.NombreEvento,
        HoraInicio: r.HoraInicio,
        HoraFin: r.HoraFin,
        NombreSalon: r.NombreSalon
      }));
      return res.status(409).json({
        message: 'Conflicto de horario. Ya existe otra solicitud PENDIENTE o AUTORIZADA para este salón en el horario solicitado.',
        isConflict: true,
        conflicts: conflictInfo
      });
    }

    // Obtener valores actuales para auditoría
    const valoresActuales = await client.query(`
      SELECT fechaevento, horainicio, horafin, nombreevento 
      FROM solicitudes 
      WHERE idsolicitud = $1
    `, [idSolicitud]);

    if (valoresActuales.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    const actual = valoresActuales.rows[0];

    // Determinar tipo de solicitante
    let idTipoSolicitante;
    let idEmpleado = null;
    let idSolicitanteExterno = null;

    if (data.TipoSolicitud === 'Interna') {
      idTipoSolicitante = 1; // Interno
      idEmpleado = data.IdEmpleado || null;
      if (!idEmpleado) throw new Error("ID de Empleado faltante para solicitud Interna.");
    } else if (data.TipoSolicitud === 'Externa') {
      idTipoSolicitante = 2; // Externo

      if (!data.EmailExterno || !data.NombreSolicitanteExterno || !data.EmpresaExterna) {
        throw new Error("Datos de Solicitante Externo faltantes.");
      }

      // Buscar o crear solicitante externo
      let result = await client.query(
        'SELECT idsolicitanteexterno FROM solicitantesexternos WHERE email = $1',
        [data.EmailExterno]
      );

      if (result.rows.length > 0) {
        idSolicitanteExterno = result.rows[0].idsolicitanteexterno;
      } else {
        result = await client.query(
          `INSERT INTO solicitantesexternos (nombre, empresa, email, telefono) 
           VALUES ($1, $2, $3, $4) RETURNING idsolicitanteexterno`,
          [data.NombreSolicitanteExterno, data.EmpresaExterna, data.EmailExterno, data.TelefonoExterno || null]
        );
        idSolicitanteExterno = result.rows[0].idsolicitanteexterno;
        logger.info(`[INFO] Nuevo solicitante externo creado: ${idSolicitanteExterno}`);
      }
    }

    // Actualizar tabla principal Solicitudes
    const updateSolicitudQuery = `
      UPDATE solicitudes SET 
        idtiposolicitante = $1,
        nombreevento = $2,
        fechaevento = $3,
        horainicio = $4,
        horafin = $5,
        participantes = $6,
        observaciones = $7
      WHERE idsolicitud = $8;
    `;

    await client.query(updateSolicitudQuery, [
      idTipoSolicitante, data.NombreEvento, data.FechaEvento, horaInicioSanitizada,
      horaFinSanitizada, data.NumParticipantes, data.Observaciones || '', idSolicitud
    ]);

    // =============================================================
    // SISTEMA DE AUDITORÍA PARA CAMBIOS CRÍTICOS - POSTGRESQL
    // =============================================================
    
    // Función helper para auditoría - POSTGRESQL
    const registrarAuditoria = async (campo, valorAnterior, valorNuevo, motivo, usuarioAuditoria) => {
      if (valorAnterior != valorNuevo) {
        console.log(`📝 AUDITORÍA: Cambio en ${campo} - De: ${valorAnterior} → A: ${valorNuevo} - Usuario: ${usuarioAuditoria}`);
        
        await client.query(`
          INSERT INTO auditoriacambiosevento 
          (idsolicitud, campomodificado, valoranterior, valornuevo, motivo, usuario)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [idSolicitud, campo, valorAnterior, valorNuevo, motivo || 'Sin motivo especificado', usuarioAuditoria]);
      }
    };

    // Registrar cambios en campos críticos
    const fechaEventoAnterior = new Date(actual.fechaevento).toISOString().split('T')[0];
    const horaInicioAnterior = actual.horainicio.toISOString().substring(11, 16);
    const horaFinAnterior = actual.horafin.toISOString().substring(11, 16);

    await registrarAuditoria('FechaEvento', fechaEventoAnterior, data.FechaEvento, data.MotivoCambioFecha, usuario);
    await registrarAuditoria('HoraInicio', horaInicioAnterior, data.HoraInicio, data.MotivoCambioHorario, usuario);
    await registrarAuditoria('HoraFin', horaFinAnterior, data.HoraFin, data.MotivoCambioHorario, usuario);
    
    // Auditoría para cambio de nombre del evento
    if (actual.nombreevento !== data.NombreEvento) {
      await registrarAuditoria('NombreEvento', actual.nombreevento, data.NombreEvento, 'Cambio en nombre del evento', usuario);
    }

    // =============================================================
    // FIN SISTEMA DE AUDITORÍA
    // =============================================================

    // Actualizar SolicitudSalones
    await client.query(`
      UPDATE solicitudsalones SET 
        idsalon = $1,
        idcapacidad = $2,
        nota = $3
      WHERE idsolicitud = $4;
    `, [data.IdSalon, data.IdCapacidad, data.NotaSalon || null, idSolicitud]);

    // Actualizar SolicitudesSolicitantes
    await client.query(`
      UPDATE solicitudessolicitantes SET 
        idempleado = $1,
        idsolicitanteexterno = $2
      WHERE idsolicitud = $3;
    `, [idEmpleado, idSolicitanteExterno, idSolicitud]);

    // Obtener IdSolicitudSalon para las tablas de detalles
    const salonResult = await client.query(
      'SELECT idsolicitudsalon FROM solicitudsalones WHERE idsolicitud = $1', 
      [idSolicitud]
    );
    
    const idSolicitudSalon = salonResult.rows[0].idsolicitudsalon;

    // Eliminar registros existentes en tablas de detalles
    await client.query('DELETE FROM solicitudservicios WHERE idsolicitudsalon = $1', [idSolicitudSalon]);
    await client.query('DELETE FROM solicitudequipo WHERE idsolicitudsalon = $1', [idSolicitudSalon]);
    await client.query('DELETE FROM solicituddegustaciones WHERE idsolicitudsalon = $1', [idSolicitudSalon]);

    // Insertar nuevos detalles - USANDO LA MISMA FUNCIÓN CORREGIDA DEL POST
    const insertDetails = async (details, table, columnId) => {
      if (Array.isArray(details) && details.length > 0) {
        console.log(`[DEBUG] Insertando en ${table}:`, details);
        
        for (const detail of details) {
          // EXTRAER ID CORRECTAMENTE - Respeta mayúsculas del frontend
          let detailId;
          let detailNota = null;

          if (typeof detail === 'object' && detail !== null) {
            // Buscar el ID con las claves exactas que usa el frontend
            if (columnId === 'idservicio') {
              detailId = detail.IdServicio;
              console.log('IdServicio encontrado:', detailId);
            } else if (columnId === 'idequipo') {
              detailId = detail.IdEquipo;
              console.log('IdEquipo encontrado:', detailId);
            } else if (columnId === 'iddegustacion') {
              detailId = detail.IdDegustacion;
              console.log('IdDegustacion encontrado:', detailId);
            } else {
              detailId = detail[columnId] || detail.id;
            }
            
            detailNota = detail.Nota || null;
          }

          // Validar que tenemos un ID válido
          if (detailId === null || detailId === undefined || isNaN(detailId)) {
            console.warn(`[WARN] ID inválido para ${table}:`, detail);
            continue;
          }

          console.log(`[INFO] Insertando en ${table}: ID=${detailId}, Nota=${detailNota}`);

          // Construir consulta SQL
          let sqlQuery = `INSERT INTO ${table} (idsolicitudsalon, ${columnId}`;
          let sqlValues = 'VALUES ($1, $2';
          const params = [idSolicitudSalon, detailId];

          if ((table === 'solicitudservicios' || table === 'solicitudequipo' || table === 'solicituddegustaciones') && detailNota !== null) {
            sqlQuery += ', nota';
            sqlValues += ', $3';
            params.push(detailNota);
          }
          
          sqlQuery += ') ' + sqlValues + ')';
          
          try {
            await client.query(sqlQuery, params);
            console.log(`[SUCCESS] Registro insertado en ${table}: ID=${detailId}`);
          } catch (err) {
            console.error(`[ERROR] Error al insertar en ${table}:`, err.message);
            throw err;
          }
        }
      } else {
        console.log(`[INFO] No hay detalles para insertar en ${table}`);
      }
    };

    await insertDetails(data.ServiciosSeleccionados, 'solicitudservicios', 'idservicio');
    await insertDetails(data.EquipoSeleccionado, 'solicitudequipo', 'idequipo');
    if (data.RequiereDegustacion === 'SI') {
      await insertDetails(data.DegustacionesSeleccionadas, 'solicituddegustaciones', 'iddegustacion');
    }

    await client.query('COMMIT');
    logger.info(`[INFO] Solicitud ${idSolicitud} actualizada exitosamente con auditoría por usuario: ${usuario}`);

    res.status(200).json({ 
      Message: 'Solicitud actualizada exitosamente.', 
      IdSolicitud: idSolicitud 
    });

  } catch (err) {
    await client.query('ROLLBACK');
    logger.warn(`[WARN] Transacción de actualización para ID ${idSolicitud} revertida.`);
    logger.error(`[ERROR] Error al actualizar solicitud ID ${idSolicitud}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al actualizar la solicitud.', error: err.message });
  } finally {
    if (client) client.release();
  }
});

// =============================================================
// PUT: ACTUALIZAR SOLO EL ESTADO - POSTGRESQL
// =============================================================
router.put('/:id/estado', async (req, res) => {
  const idSolicitud = req.params.id;
  const { IdEstado } = req.body;
  
  logger.info(`[INFO] Actualizando estado de solicitud ${idSolicitud} a ${IdEstado}`);

  try {
    const client = await connectDB();
    
    await client.query(
      'UPDATE solicitudes SET idestado = $1 WHERE idsolicitud = $2',
      [IdEstado, idSolicitud]
    );

    logger.info(`[INFO] Estado de solicitud ${idSolicitud} actualizado a ${IdEstado}`);
    res.status(200).json({ Message: 'Estado actualizado exitosamente.' });

  } catch (err) {
    logger.error(`[ERROR] Error al actualizar estado de solicitud ${idSolicitud}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al actualizar estado.' });
  }
});

// =============================================================
// GET: GENERAR CONTRATO EN PDF PARA SOLICITUD AUTORIZADA - POSTGRESQL
// =============================================================
router.get('/:id/contrato', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Generando contrato para solicitud: ${idSolicitud}`);

  try {
    const client = await connectDB();

    // Obtener datos completos de la solicitud autorizada
    const solicitudQuery = `
      SELECT 
        s.idsolicitud as "IdSolicitud",
        s.nombreevento as "NombreEvento",
        TO_CHAR(s.fechaevento, 'YYYY-MM-DD') as "FechaEvento",
        TO_CHAR(s.horainicio, 'HH24:MI:SS') as "HoraInicio",
        TO_CHAR(s.horafin, 'HH24:MI:SS') as "HoraFin",
        s.participantes as "Participantes",
        s.observaciones as "Observaciones",
        ss.idsalon as "IdSalon",
        ss.idcapacidad as "IdCapacidad",
        ss.nota as "NotaSalon",
        se.nombre as "NombreSolicitanteExterno",
        se.empresa as "EmpresaExterna",
        se.email as "EmailExterno",
        se.telefono as "TelefonoExterno",
        ssol.idempleado as "IdEmpleado",
        CONCAT(emp.nombre, ' ', emp.apellido) as "NombreEmpleado",
        emp.email as "EmailEmpleado",
        dep.nombre as "DepartamentoEmpleado",
        sal.nombre as "NombreSalon",
        STRING_AGG(tc.nombre || ': ' || TO_CHAR(c.monto, 'FM999,999,999.00'), ' | ') as "CostosConcatenados",
        tm.nombre as "NombreTipoMontaje",
        cap.cantidadpersonas as "CantidadPersonas",
        est.nombre as "EstadoSolicitud"
      FROM solicitudes s
      LEFT JOIN solicitudsalones ss ON s.idsolicitud = ss.idsolicitud
      LEFT JOIN solicitudessolicitantes ssol ON ssol.idsolicitud = s.idsolicitud
      LEFT JOIN solicitantesexternos se ON ssol.idsolicitanteexterno = se.idsolicitanteexterno
      LEFT JOIN empleados emp ON ssol.idempleado = emp.idempleado
      LEFT JOIN departamento dep ON emp.iddepartamento = dep.iddepartamento
      LEFT JOIN costos c ON ss.idsalon = c.idsalon
      LEFT JOIN tiposcosto tc ON tc.idtipocosto = c.idtipocosto
      LEFT JOIN capacidades cap ON ss.idcapacidad = cap.idcapacidad
      LEFT JOIN tiposmontaje tm ON cap.idtipomontaje = tm.idtipomontaje
      LEFT JOIN estadosgenerales est ON s.idestado = est.idestado 
      LEFT JOIN salones sal ON ss.idsalon = sal.idsalon
      WHERE s.idsolicitud = $1 AND s.idestado = 5
      GROUP BY 
        s.idsolicitud, s.nombreevento, s.fechaevento, s.horainicio, s.horafin, s.participantes, s.observaciones,
        ss.idsalon, ss.idcapacidad, ss.nota, se.nombre, se.empresa, se.email, se.telefono, ssol.idempleado,
        emp.nombre, emp.apellido, emp.email, dep.nombre, sal.nombre, tm.nombre, cap.cantidadpersonas, est.nombre
    `;

    const solicitudResult = await client.query(solicitudQuery, [idSolicitud]);

    if (solicitudResult.rows.length === 0) {
      return res.status(404).json({ message: 'Solicitud no encontrada o no autorizada.' });
    }

    const solicitud = solicitudResult.rows[0];

    // Obtener servicios seleccionados
    const serviciosResult = await client.query(`
      SELECT 
        serv.nombre as "NombreServicio",
        ss.nota as "Nota"
      FROM solicitudservicios ss
      INNER JOIN servicios serv ON ss.idservicio = serv.idservicio
      INNER JOIN solicitudsalones ssal ON ss.idsolicitudsalon = ssal.idsolicitudsalon
      WHERE ssal.idsolicitud = $1
    `, [idSolicitud]);

    // Obtener equipo seleccionado
    const equipoResult = await client.query(`
      SELECT 
        eq.nombre as "NombreEquipoOpcional",
        se.nota as "Nota"
      FROM solicitudequipo se
      INNER JOIN equipoopcional eq ON se.idequipo = eq.idequipo
      INNER JOIN solicitudsalones ssal ON se.idsolicitudsalon = ssal.idsolicitudsalon
      WHERE ssal.idsolicitud = $1
    `, [idSolicitud]);

    // Obtener degustaciones seleccionadas
    const degustacionesResult = await client.query(`
      SELECT 
        deg.nombre as "Nombre",
        sd.nota as "Nota"
      FROM solicituddegustaciones sd
      INNER JOIN degustaciones deg ON sd.iddegustacion = deg.iddegustacion
      INNER JOIN solicitudsalones ssal ON sd.idsolicitudsalon = ssal.idsolicitudsalon
      WHERE ssal.idsolicitud = $1
    `, [idSolicitud]);

    // Preparar datos para el contrato
    const contratoData = {
      IdSolicitud: solicitud.IdSolicitud,
      NombreEvento: solicitud.NombreEvento,
      FechaEvento: solicitud.FechaEvento,
      HoraInicio: solicitud.HoraInicio,
      HoraFin: solicitud.HoraFin,
      Participantes: solicitud.Participantes,
      NombreSalon: solicitud.NombreSalon,
      TipoMontaje: solicitud.NombreTipoMontaje,
      Capacidad: solicitud.CantidadPersonas,
      Costos: solicitud.CostosConcatenados || 'Por definir',
      
      // Datos del solicitante
      Solicitante: solicitud.IdEmpleado ? {
        Tipo: 'Interno',
        Nombre: solicitud.NombreEmpleado,
        Email: solicitud.EmailEmpleado,
        Departamento: solicitud.DepartamentoEmpleado
      } : {
        Tipo: 'Externo',
        Nombre: solicitud.NombreSolicitanteExterno,
        Empresa: solicitud.EmpresaExterna,
        Email: solicitud.EmailExterno,
        Telefono: solicitud.TelefonoExterno
      },
      
      // Servicios y adicionales
      Servicios: serviciosResult.rows,
      Equipo: equipoResult.rows,
      Degustaciones: degustacionesResult.rows,
      
      // Fecha de generación
      FechaGeneracion: new Date().toLocaleDateString('es-ES'),
      HoraGeneracion: new Date().toLocaleTimeString('es-ES')
    };

    // Enviar datos del contrato (el frontend generará el PDF)
    res.status(200).json(contratoData);

  } catch (err) {
    logger.error(`[ERROR] Error al generar contrato para solicitud ${idSolicitud}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al generar contrato.' });
  }
});

// =============================================================
// GET: OBTENER TIPOS DE PAGO - POSTGRESQL
// =============================================================
router.get('/tipos-pago', async (req, res) => {
  logger.info('[INFO] Obteniendo tipos de pago');
  
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT idtipopago as "IdTipoPago", nombre as "Nombre", descripcion as "Descripcion" 
      FROM tipospago 
      ORDER BY nombre
    `);
    
    res.status(200).json(result.rows);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener tipos de pago: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener tipos de pago' });
  }
});

// =============================================================
// GET: OBTENER COSTOS DEL SALÓN - POSTGRESQL
// =============================================================
router.get('/salones/:id/costos', async (req, res) => {
  const idSalon = req.params.id;
  logger.info(`[INFO] Obteniendo costos para salón: ${idSalon}`);
  
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        COALESCE((SELECT monto FROM costos WHERE idsalon = $1 AND idtipocosto = 1 ORDER BY fecharegistro DESC LIMIT 1), 0) as "PrecioBase",
        COALESCE((SELECT monto FROM costos WHERE idsalon = $1 AND idtipocosto = 2 ORDER BY fecharegistro DESC LIMIT 1), 0) as "DepositoReembolsable"
    `, [idSalon]);
    
    // Si ambos son 0, probablemente no hay costos registrados
    if (result.rows[0].PrecioBase === 0 && result.rows[0].DepositoReembolsable === 0) {
      return res.status(404).json({ 
        message: 'No se encontraron costos registrados para este salón' 
      });
    }
    
    res.status(200).json(result.rows[0]);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener costos del salón: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener costos del salón' });
  }
});

// =============================================================
// POST: CREAR PAGO PARA SOLICITUD - POSTGRESQL
// =============================================================
router.post('/:id/pago', async (req, res) => {
  const idSolicitud = req.params.id;
  const pagoData = req.body;
  
  logger.info(`[INFO] Creando pago para solicitud: ${idSolicitud}`);
  
  let client;
  
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Verificar que la solicitud existe y está pendiente
    const solicitudCheck = await client.query(
      'SELECT idestado FROM solicitudes WHERE idsolicitud = $1', 
      [idSolicitud]
    );
    
    if (solicitudCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }
    
    const estadoActual = solicitudCheck.rows[0].idestado;
    if (estadoActual !== 4) { // 4 = PENDIENTE
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Solo se pueden crear pagos para solicitudes pendientes' });
    }

    // Insertar el pago
    const pagoResult = await client.query(`
      INSERT INTO pagos (idsolicitud, idtipopago, montototal, anticipo, saldo, numerocomprobante, observaciones, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Completado') RETURNING idpago
    `, [
      idSolicitud, pagoData.IdTipoPago, pagoData.MontoTotal, pagoData.Anticipo, 
      pagoData.Saldo, pagoData.NumeroComprobante || null, pagoData.Observaciones || null
    ]);
    
    const idPago = pagoResult.rows[0].idpago;
    
    // Actualizar estado de la solicitud a AUTORIZADA (5)
    await client.query(
      'UPDATE solicitudes SET idestado = $1 WHERE idsolicitud = $2',
      [5, idSolicitud]
    );
    
    await client.query('COMMIT');
    
    logger.info(`[INFO] Pago ${idPago} creado y solicitud ${idSolicitud} autorizada`);
    
    res.status(201).json({
      Message: 'Pago registrado y solicitud autorizada exitosamente',
      IdPago: idPago,
      IdSolicitud: idSolicitud
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`[ERROR] Error al crear pago: ${err.message}`);
    res.status(500).json({ error: 'Error al procesar el pago: ' + err.message });
  } finally {
    if (client) client.release();
  }
});

// =============================================================
// GET: OBTENER PAGO POR SOLICITUD - POSTGRESQL
// =============================================================
router.get('/:id/pago', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Obteniendo pago para solicitud: ${idSolicitud}`);
  
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        p.*,
        tp.nombre as "TipoPagoNombre"
      FROM pagos p
      INNER JOIN tipospago tp ON p.idtipopago = tp.idtipopago
      WHERE p.idsolicitud = $1
    `, [idSolicitud]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No se encontró pago para esta solicitud' });
    }
    
    res.status(200).json(result.rows[0]);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener pago: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener información del pago' });
  }
});

// =============================================================
// GET: OBTENER TIPOS DE COSTOS DISPONIBLES - POSTGRESQL
// =============================================================
router.get('/tipos-costo', async (req, res) => {
  logger.info('[INFO] Obteniendo tipos de costo');
  
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT idtipocosto as "IdTipoCosto", nombre as "Nombre" 
      FROM tiposcosto 
      ORDER BY nombre
    `);
    
    res.status(200).json(result.rows);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener tipos de costo: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener tipos de costo' });
  }
});

module.exports = router;
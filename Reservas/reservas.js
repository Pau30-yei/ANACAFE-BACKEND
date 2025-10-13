const express = require('express');
const router = express.Router();
const sql = require('mssql');
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
// POST: CREACIÓN DE NUEVA SOLICITUD DE RESERVA
// =============================================================
router.post('/', async (req, res) => {
  logger.info('[INFO] Intento de crear nueva solicitud de reserva.');
  const data = req.body;
  
  // CAPTURAR USUARIO PARA AUDITORÍA
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  logger.info(`[INFO] Usuario que crea la solicitud: ${usuario}`);
  
  let transaction;

  // Sanitizar horas
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
    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Validación de conflicto de horario
    logger.info('[INFO] Verificando conflicto de horario para la nueva solicitud.');
    const conflictCheckQuery = `
      SELECT
          S.IdSolicitud,
          S.NombreEvento,
          CONVERT(VARCHAR, S.HoraInicio, 8) AS HoraInicio,
          CONVERT(VARCHAR, S.HoraFin, 8) AS HoraFin,
          SAL.Nombre AS NombreSalon
      FROM Solicitudes S
      INNER JOIN SolicitudSalones SS ON S.IdSolicitud = SS.IdSolicitud
      INNER JOIN Salones SAL ON SS.IdSalon = SAL.IdSalon 
      WHERE
          SS.IdSalon = @IdSalon
          AND S.FechaEvento = @FechaEvento
          AND S.IdEstado IN (4, 5)
          AND (
              (S.HoraInicio < @HoraFinSanitizada AND S.HoraFin > @HoraInicioSanitizada)
              OR (@HoraInicioSanitizada < S.HoraFin AND @HoraFinSanitizada > S.HoraInicio)
          );
    `;

    const conflictRequest = new sql.Request(transaction);
    conflictRequest.input('IdSalon', sql.Int, data.IdSalon); 
    conflictRequest.input('FechaEvento', sql.Date, data.FechaEvento);
    conflictRequest.input('HoraInicioSanitizada', sql.VarChar(8), horaInicioSanitizada);
    conflictRequest.input('HoraFinSanitizada', sql.VarChar(8), horaFinSanitizada);

    const conflictResult = await conflictRequest.query(conflictCheckQuery);

    if (conflictResult.recordset.length > 0) {
      await transaction.rollback();
      logger.warn(`[WARN] Conflicto de horario detectado. Rollback. Solicitud cancelada.`);
      const conflictInfo = conflictResult.recordset.map(r => ({
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

      let result = await (transaction.request()
        .input('Email', sql.NVarChar(100), data.EmailExterno)
        .query('SELECT IdSolicitanteExterno FROM [dbo].[SolicitantesExternos] WHERE Email = @Email'));

      if (result.recordset.length > 0) {
        idSolicitanteExterno = result.recordset[0].IdSolicitanteExterno;
      } else {
        result = await (transaction.request()
          .input('Nombre', sql.NVarChar(100), data.NombreSolicitanteExterno)
          .input('Empresa', sql.NVarChar(100), data.EmpresaExterna)
          .input('Email', sql.NVarChar(100), data.EmailExterno)
          .input('Telefono', sql.NVarChar(20), data.TelefonoExterno || null)
          .query(`
            INSERT INTO [dbo].[SolicitantesExternos] (Nombre, Empresa, Email, Telefono) 
            VALUES (@Nombre, @Empresa, @Email, @Telefono);
            SELECT SCOPE_IDENTITY() AS IdSolicitanteExterno;
          `));
        idSolicitanteExterno = result.recordset[0].IdSolicitanteExterno;
        logger.info(`[INFO] Nuevo solicitante externo creado: ${idSolicitanteExterno}`);
      }
    }

    // 2. Insertar en Solicitudes
    const solicitudResult = await (transaction.request()
      .input('IdTipoSolicitante', sql.Int, idTipoSolicitante)
      .input('NombreEvento', sql.NVarChar(200), data.NombreEvento)
      .input('FechaEvento', sql.Date, data.FechaEvento)
      .input('HoraInicio', sql.VarChar(8), horaInicioSanitizada) 
      .input('HoraFin', sql.VarChar(8), horaFinSanitizada)   
      .input('Participantes', sql.Int, data.NumParticipantes)
      .input('Observaciones', sql.NVarChar(sql.MAX), data.Observaciones || '')
      .input('IdEstado', sql.Int, ID_ESTADO_PENDIENTE)
      .query(`
        INSERT INTO [dbo].[Solicitudes] 
        (IdTipoSolicitante, NombreEvento, FechaEvento, HoraInicio, HoraFin, Participantes, Observaciones, IdEstado)
        VALUES (@IdTipoSolicitante, @NombreEvento, @FechaEvento, @HoraInicio, @HoraFin, @Participantes, @Observaciones, @IdEstado);
        SELECT SCOPE_IDENTITY() AS IdSolicitud;
      `));

    const idSolicitud = solicitudResult.recordset[0].IdSolicitud;
    logger.info(`[INFO] Registro de Solicitud principal creado: ${idSolicitud}`);

    console.log('DEBUG - IdEmpleado:', idEmpleado, 'Tipo:', typeof idEmpleado);
    logger.info(`[DEBUG] IdEmpleado a insertar: ${idEmpleado}, Tipo: ${typeof idEmpleado}`);

    // 3. Insertar en SolicitudesSolicitantes
    await (transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdEmpleado', sql.Int, idEmpleado)
      .input('IdSolicitanteExterno', sql.Int, idSolicitanteExterno)
      .query(`
        INSERT INTO [dbo].[SolicitudesSolicitantes] (IdSolicitud, IdEmpleado, IdSolicitanteExterno)
        VALUES (@IdSolicitud, @IdEmpleado, @IdSolicitanteExterno);
      `));

    // 4. Insertar en SolicitudSalones
    const solicitudSalonResult = await (transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdSalon', sql.Int, data.IdSalon)
      .input('IdCapacidad', sql.Int, data.IdCapacidad)
      .input('Nota', sql.NVarChar(200), data.NotaSalon || null)
      .query(`
        INSERT INTO [dbo].[SolicitudSalones] (IdSolicitud, IdSalon, IdCapacidad, Nota)
        VALUES (@IdSolicitud, @IdSalon, @IdCapacidad, @Nota);
        SELECT SCOPE_IDENTITY() AS IdSolicitudSalon;
      `));
    const idSolicitudSalon = solicitudSalonResult.recordset[0].IdSolicitudSalon;

    // 5. Insertar detalles (Servicios, Equipo, Degustaciones)
    const insertDetails = async (details, table, columnId) => {
      if (Array.isArray(details) && details.length > 0) {
        for (const detail of details) {
          const detailId = typeof detail === 'object' ? detail[columnId] : detail;
          const detailNota = typeof detail === 'object' && detail.Nota ? detail.Nota : null; 

          const detailRequest = new sql.Request(transaction); 
          
          let sqlQuery = `INSERT INTO [dbo].[${table}] (IdSolicitudSalon, ${columnId}`;
          let sqlValues = 'VALUES (@IdSolicitudSalon, @DetailId';

          if ((table === 'SolicitudServicios' || table === 'SolicitudEquipo' || table === 'SolicitudDegustaciones') && detailNota !== null) {
            sqlQuery += ', Nota';
            sqlValues += ', @Nota';
            detailRequest.input('Nota', sql.NVarChar(200), detailNota); 
          }
          
          sqlQuery += ') ' + sqlValues + ')';
          
          await (detailRequest
            .input('IdSolicitudSalon', sql.Int, idSolicitudSalon)
            .input('DetailId', sql.Int, detailId)
            .query(sqlQuery)); 
        }
      }
    };

    await insertDetails(data.ServiciosSeleccionados, 'SolicitudServicios', 'IdServicio');
    await insertDetails(data.EquipoSeleccionado, 'SolicitudEquipo', 'IdEquipo');
    if (data.RequiereDegustacion === 'SI') {
      await insertDetails(data.DegustacionesSeleccionadas, 'SolicitudDegustaciones', 'IdDegustacion');
    }

    // 6. Commit
    await transaction.commit();
    logger.info(`[INFO] Solicitud de reserva ${idSolicitud} finalizada con COMMIT por usuario: ${usuario}`);

    res.status(201).json({
      message: 'Solicitud enviada exitosamente. Estado: PENDIENTE.',
      idSolicitud: idSolicitud
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    logger.warn(`[WARN] Transacción con ROLLBACK debido a error.`);
    logger.error(`[ERR] Error al procesar la solicitud de reserva: ${err.message}`);
    res.status(500).json({ error: 'Error al procesar la solicitud. ' + err.message });
  }
});

// =============================================================
// GET: BÚSQUEDA DE SOLICITANTES EXTERNOS POR COINCIDENCIA
// =============================================================
router.get('/solicitantes-externos/search', async (req, res) => {
  const query = req.query.q;

  if (!query || query.length < 3) {
    return res.status(200).json([]);
  }

  try {
    const pool = await connectDB();
    const searchTerm = `%${query}%`;

    const result = await pool.request()
      .input('SearchTerm', sql.NVarChar(100), searchTerm)
      .query(`
        SELECT 
          IdSolicitanteExterno,
          Nombre,
          Empresa,
          Email,
          Telefono
        FROM 
          [dbo].[SolicitantesExternos]
        WHERE 
          Email LIKE @SearchTerm OR 
          Nombre LIKE @SearchTerm OR 
          Empresa LIKE @SearchTerm
        ORDER BY
          Nombre
      `);

    res.status(200).json(result.recordset);

  } catch (err) {
    logger.error(`[ERROR] Error al buscar solicitantes externos: ${err.message}`);
    res.status(500).json([]);
  }
});

// =============================================================
// GET: OBTENER SOLICITUDES PARA CALENDARIO
// =============================================================
router.get('/calendario', async (req, res) => {
  logger.info('[INFO] Intento de obtener solicitudes para calendario.');
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          S.IdSolicitud, 
          S.NombreEvento, 
          S.FechaEvento, 
          S.HoraInicio, 
          S.HoraFin, 
          S.IdEstado,
          SAL.Nombre AS NombreSalon
        FROM 
          [dbo].[Solicitudes] S
        INNER JOIN
          [dbo].[SolicitudSalones] SSAL ON S.IdSolicitud = SSAL.IdSolicitud
        INNER JOIN
          [dbo].[Salones] SAL ON SSAL.IdSalon = SAL.IdSalon
        WHERE 
          S.IdEstado IN (4, 5);
      `);

    const eventos = result.recordset.map(solicitud => {
      const fecha = solicitud.FechaEvento.toISOString().split('T')[0];
      const horaInicioLimpia = solicitud.HoraInicio.toISOString().substring(11, 19);
      const horaFinLimpia = solicitud.HoraFin.toISOString().substring(11, 19);

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
        extendedProps: 
        { 
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
// GET: VERIFICAR SUPERPOSICIÓN DE HORARIO
// =============================================================
router.get('/check-overlap', async (req, res) => {
  logger.info('[INFO] Intento de verificar superposición de horario.');
  const { fecha, horaInicio } = req.query;
  
  if (!fecha || !horaInicio) {
    return res.status(400).json({ message: "Fecha y HoraInicio son requeridos." });
  }

  const horaInicioLimpia = horaInicio.length === 5 ? `${horaInicio}:00` : horaInicio;

  try {
    const pool = await connectDB();
    const request = pool.request();
    
    const query = `
      SELECT 
        S.IdSolicitud, 
        S.NombreEvento, 
        S.HoraInicio,
        S.HoraFin
      FROM Solicitudes AS S
      WHERE 
        S.FechaEvento = @FechaEvento
        AND S.IdEstado IN (4, 5) 
        AND (
          (S.HoraInicio <= @HoraInicio AND S.HoraFin > @HoraInicio)
          OR (S.HoraInicio = @HoraInicio)
        );
    `;
    
    request.input('FechaEvento', sql.Date, fecha);
    request.input('HoraInicio', sql.VarChar(8), horaInicioLimpia);
    
    const result = await request.query(query);

    if (result.recordset.length > 0) {
      const conflictInfo = result.recordset.map(r => ({
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
// GET: OBTENER SOLICITUD POR ID (COMPLETO) 
// =============================================================
router.get('/:id', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Intento de obtener solicitud con ID: ${idSolicitud}`);

  try {
    const pool = await connectDB();
    
    // Consulta principal de la solicitud - CORREGIDA para formatear horas
    const solicitudQuery = `
      SELECT 
        S.*,
        SS.IdSalon,
        SS.IdCapacidad,
        SS.Nota AS NotaSalon,
        SE.Nombre AS NombreSolicitanteExterno,
        SE.Empresa AS EmpresaExterna,
        SSol.IdEmpleado,  
        SE.Email AS EmailExterno,
        SE.Telefono AS TelefonoExterno,
        CONVERT(VARCHAR(8), S.HoraInicio, 108) AS HoraInicioFormateada,
        CONVERT(VARCHAR(8), S.HoraFin, 108) AS HoraFinFormateada
      FROM Solicitudes S
      LEFT JOIN SolicitudSalones SS ON S.IdSolicitud = SS.IdSolicitud
      LEFT JOIN SolicitudesSolicitantes SSol ON S.IdSolicitud = SSol.IdSolicitud
      LEFT JOIN SolicitantesExternos SE ON SSol.IdSolicitanteExterno = SE.IdSolicitanteExterno
      WHERE S.IdSolicitud = @IdSolicitud
    `;

    const solicitudResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(solicitudQuery);

    if (solicitudResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    const solicitud = solicitudResult.recordset[0];

    // Usar las horas formateadas para el frontend
    solicitud.HoraInicio = solicitud.HoraInicioFormateada;
    solicitud.HoraFin = solicitud.HoraFinFormateada;

    // Eliminar los campos temporales
    delete solicitud.HoraInicioFormateada;
    delete solicitud.HoraFinFormateada;

    // Cargar servicios seleccionados
    const serviciosResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
        SELECT SS.IdServicio, SS.Nota 
        FROM SolicitudServicios SS
        INNER JOIN SolicitudSalones SSal ON SS.IdSolicitudSalon = SSal.IdSolicitudSalon
        WHERE SSal.IdSolicitud = @IdSolicitud
      `);
    solicitud.ServiciosSeleccionados = serviciosResult.recordset;

    // Cargar equipo seleccionado
    const equipoResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
        SELECT SE.IdEquipo, SE.Nota 
        FROM SolicitudEquipo SE
        INNER JOIN SolicitudSalones SSal ON SE.IdSolicitudSalon = SSal.IdSolicitudSalon
        WHERE SSal.IdSolicitud = @IdSolicitud
      `);
    solicitud.EquipoSeleccionado = equipoResult.recordset;

    // Cargar degustaciones seleccionadas
    const degustacionesResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
        SELECT SD.IdDegustacion, SD.Nota 
        FROM SolicitudDegustaciones SD
        INNER JOIN SolicitudSalones SSal ON SD.IdSolicitudSalon = SSal.IdSolicitudSalon
        WHERE SSal.IdSolicitud = @IdSolicitud
      `);
    solicitud.DegustacionesSeleccionadas = degustacionesResult.recordset;

    // Determinar el tipo de solicitud basado en los datos
    if (solicitud.IdTipoSolicitante === 1) {
      solicitud.TipoSolicitud = 'Interna';
    } else if (solicitud.IdTipoSolicitante === 2) {
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
// PUT: ACTUALIZAR SOLICITUD COMPLETA CON AUDITORÍA CORREGIDA
// =============================================================
router.put('/:id', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Intento de actualizar solicitud completa con ID: ${idSolicitud}`);
  const data = req.body;
  
  // CAPTURAR USUARIO PARA AUDITORÍA
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  logger.info(`[INFO] Usuario que modifica la solicitud ${idSolicitud}: ${usuario}`);
  
  let transaction;

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
    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Validación de conflicto de horario (excluyendo la solicitud actual)
    logger.info('[INFO] Verificando conflicto de horario para la actualización.');
    const conflictCheckQuery = `
      SELECT
        S.IdSolicitud,
        S.NombreEvento,
        CONVERT(VARCHAR, S.HoraInicio, 8) AS HoraInicio,
        CONVERT(VARCHAR, S.HoraFin, 8) AS HoraFin,
        SAL.Nombre AS NombreSalon
      FROM Solicitudes S
      INNER JOIN SolicitudSalones SS ON S.IdSolicitud = SS.IdSolicitud
      INNER JOIN Salones SAL ON SS.IdSalon = SAL.IdSalon 
      WHERE
        SS.IdSalon = @IdSalon
        AND S.FechaEvento = @FechaEvento
        AND S.IdEstado IN (4, 5)
        AND S.IdSolicitud != @IdSolicitud
        AND (
          (S.HoraInicio < @HoraFinSanitizada AND S.HoraFin > @HoraInicioSanitizada)
          OR (@HoraInicioSanitizada < S.HoraFin AND @HoraFinSanitizada > S.HoraInicio)
        );
    `;

    const conflictRequest = new sql.Request(transaction);
    conflictRequest.input('IdSolicitud', sql.Int, idSolicitud);
    conflictRequest.input('IdSalon', sql.Int, data.IdSalon); 
    conflictRequest.input('FechaEvento', sql.Date, data.FechaEvento);
    conflictRequest.input('HoraInicioSanitizada', sql.VarChar(8), horaInicioSanitizada);
    conflictRequest.input('HoraFinSanitizada', sql.VarChar(8), horaFinSanitizada);

    const conflictResult = await conflictRequest.query(conflictCheckQuery);

    if (conflictResult.recordset.length > 0) {
      await transaction.rollback();
      logger.warn(`[WARN] Conflicto de horario detectado. Rollback. Actualización cancelada.`);
      const conflictInfo = conflictResult.recordset.map(r => ({
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
    const valoresActuales = await transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
        SELECT FechaEvento, HoraInicio, HoraFin, NombreEvento 
        FROM Solicitudes 
        WHERE IdSolicitud = @IdSolicitud
      `);

    if (valoresActuales.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    const actual = valoresActuales.recordset[0];

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
      let result = await (transaction.request()
        .input('Email', sql.NVarChar(100), data.EmailExterno)
        .query('SELECT IdSolicitanteExterno FROM [dbo].[SolicitantesExternos] WHERE Email = @Email'));

      if (result.recordset.length > 0) {
        idSolicitanteExterno = result.recordset[0].IdSolicitanteExterno;
      } else {
        result = await (transaction.request()
          .input('Nombre', sql.NVarChar(100), data.NombreSolicitanteExterno)
          .input('Empresa', sql.NVarChar(100), data.EmpresaExterna)
          .input('Email', sql.NVarChar(100), data.EmailExterno)
          .input('Telefono', sql.NVarChar(20), data.TelefonoExterno || null)
          .query(`
            INSERT INTO [dbo].[SolicitantesExternos] (Nombre, Empresa, Email, Telefono) 
            VALUES (@Nombre, @Empresa, @Email, @Telefono);
            SELECT SCOPE_IDENTITY() AS IdSolicitanteExterno;
          `));
        idSolicitanteExterno = result.recordset[0].IdSolicitanteExterno;
        logger.info(`[INFO] Nuevo solicitante externo creado: ${idSolicitanteExterno}`);
      }
    }

    // Actualizar tabla principal Solicitudes
    const updateSolicitudQuery = `
      UPDATE Solicitudes SET 
        IdTipoSolicitante = @IdTipoSolicitante,
        NombreEvento = @NombreEvento,
        FechaEvento = @FechaEvento,
        HoraInicio = @HoraInicio,
        HoraFin = @HoraFin,
        Participantes = @Participantes,
        Observaciones = @Observaciones
      WHERE IdSolicitud = @IdSolicitud;
    `;

    await (transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdTipoSolicitante', sql.Int, idTipoSolicitante)
      .input('NombreEvento', sql.NVarChar(200), data.NombreEvento)
      .input('FechaEvento', sql.Date, data.FechaEvento)
      .input('HoraInicio', sql.VarChar(8), horaInicioSanitizada)
      .input('HoraFin', sql.VarChar(8), horaFinSanitizada)
      .input('Participantes', sql.Int, data.NumParticipantes)
      .input('Observaciones', sql.NVarChar(sql.MAX), data.Observaciones || '')
      .query(updateSolicitudQuery));

    // =============================================================
    // SISTEMA DE AUDITORÍA PARA CAMBIOS CRÍTICOS - CORREGIDO
    // =============================================================
    
    // Función helper para auditoría - ACTUALIZADA para usar la columna 'Usuario'
    const registrarAuditoria = async (campo, valorAnterior, valorNuevo, motivo, usuarioAuditoria) => {
      if (valorAnterior != valorNuevo) {
        console.log(`📝 AUDITORÍA: Cambio en ${campo} - De: ${valorAnterior} → A: ${valorNuevo} - Usuario: ${usuarioAuditoria}`);
        
        await transaction.request()
          .input('IdSolicitud', sql.Int, idSolicitud)
          .input('CampoModificado', sql.VarChar(50), campo)
          .input('ValorAnterior', sql.VarChar(255), valorAnterior)
          .input('ValorNuevo', sql.VarChar(255), valorNuevo)
          .input('Motivo', sql.VarChar(500), motivo || 'Sin motivo especificado')
          .input('Usuario', sql.NVarChar(100), usuarioAuditoria) // Usando 'Usuario' según tu tabla
          .query(`
            INSERT INTO AuditoriaCambiosEvento 
            (IdSolicitud, CampoModificado, ValorAnterior, ValorNuevo, Motivo, Usuario)
            VALUES (@IdSolicitud, @CampoModificado, @ValorAnterior, @ValorNuevo, @Motivo, @Usuario)
          `);
      }
    };

    // Registrar cambios en campos críticos - PASANDO EL USUARIO
    const fechaEventoAnterior = actual.FechaEvento.toISOString().split('T')[0];
    const horaInicioAnterior = actual.HoraInicio.toISOString().substring(11, 16);
    const horaFinAnterior = actual.HoraFin.toISOString().substring(11, 16);

    await registrarAuditoria('FechaEvento', fechaEventoAnterior, data.FechaEvento, data.MotivoCambioFecha, usuario);
    await registrarAuditoria('HoraInicio', horaInicioAnterior, data.HoraInicio, data.MotivoCambioHorario, usuario);
    await registrarAuditoria('HoraFin', horaFinAnterior, data.HoraFin, data.MotivoCambioHorario, usuario);
    
    // Auditoría para cambio de nombre del evento
    if (actual.NombreEvento !== data.NombreEvento) {
      await registrarAuditoria('NombreEvento', actual.NombreEvento, data.NombreEvento, 'Cambio en nombre del evento', usuario);
    }

    // =============================================================
    // FIN SISTEMA DE AUDITORÍA
    // =============================================================

    // Actualizar SolicitudSalones
    await (transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdSalon', sql.Int, data.IdSalon)
      .input('IdCapacidad', sql.Int, data.IdCapacidad)
      .input('Nota', sql.NVarChar(200), data.NotaSalon || null)
      .query(`
        UPDATE SolicitudSalones SET 
          IdSalon = @IdSalon,
          IdCapacidad = @IdCapacidad,
          Nota = @Nota
        WHERE IdSolicitud = @IdSolicitud;
      `));

    // Actualizar SolicitudesSolicitantes
    await (transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdEmpleado', sql.Int, idEmpleado)
      .input('IdSolicitanteExterno', sql.Int, idSolicitanteExterno)
      .query(`
        UPDATE SolicitudesSolicitantes SET 
          IdEmpleado = @IdEmpleado,
          IdSolicitanteExterno = @IdSolicitanteExterno
        WHERE IdSolicitud = @IdSolicitud;
      `));

    // Obtener IdSolicitudSalon para las tablas de detalles
    const salonResult = await (transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query('SELECT IdSolicitudSalon FROM SolicitudSalones WHERE IdSolicitud = @IdSolicitud'));
    
    const idSolicitudSalon = salonResult.recordset[0].IdSolicitudSalon;

    // Eliminar registros existentes en tablas de detalles
    await (transaction.request()
      .input('IdSolicitudSalon', sql.Int, idSolicitudSalon)
      .query('DELETE FROM SolicitudServicios WHERE IdSolicitudSalon = @IdSolicitudSalon'));
    
    await (transaction.request()
      .input('IdSolicitudSalon', sql.Int, idSolicitudSalon)
      .query('DELETE FROM SolicitudEquipo WHERE IdSolicitudSalon = @IdSolicitudSalon'));
    
    await (transaction.request()
      .input('IdSolicitudSalon', sql.Int, idSolicitudSalon)
      .query('DELETE FROM SolicitudDegustaciones WHERE IdSolicitudSalon = @IdSolicitudSalon'));

    // Insertar nuevos detalles
    const insertDetails = async (details, table, columnId) => {
      if (Array.isArray(details) && details.length > 0) {
        for (const detail of details) {
          const detailId = typeof detail === 'object' ? detail[columnId] : detail;
          const detailNota = typeof detail === 'object' && detail.Nota ? detail.Nota : null; 

          const detailRequest = new sql.Request(transaction); 
          
          let sqlQuery = `INSERT INTO [dbo].[${table}] (IdSolicitudSalon, ${columnId}`;
          let sqlValues = 'VALUES (@IdSolicitudSalon, @DetailId';

          if ((table === 'SolicitudServicios' || table === 'SolicitudEquipo' || table === 'SolicitudDegustaciones') && detailNota !== null) {
            sqlQuery += ', Nota';
            sqlValues += ', @Nota';
            detailRequest.input('Nota', sql.NVarChar(200), detailNota); 
          }
          
          sqlQuery += ') ' + sqlValues + ')';
          
          await (detailRequest
            .input('IdSolicitudSalon', sql.Int, idSolicitudSalon)
            .input('DetailId', sql.Int, detailId)
            .query(sqlQuery)); 
        }
      }
    };

    await insertDetails(data.ServiciosSeleccionados, 'SolicitudServicios', 'IdServicio');
    await insertDetails(data.EquipoSeleccionado, 'SolicitudEquipo', 'IdEquipo');
    if (data.RequiereDegustacion === 'SI') {
      await insertDetails(data.DegustacionesSeleccionadas, 'SolicitudDegustaciones', 'IdDegustacion');
    }

    await transaction.commit();
    logger.info(`[INFO] Solicitud ${idSolicitud} actualizada exitosamente con auditoría por usuario: ${usuario}`);

    res.status(200).json({ 
      message: 'Solicitud actualizada exitosamente.', 
      idSolicitud: idSolicitud 
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    logger.warn(`[WARN] Transacción de actualización para ID ${idSolicitud} revertida.`);
    logger.error(`[ERROR] Error al actualizar solicitud ID ${idSolicitud}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al actualizar la solicitud.', error: err.message });
  }
});

// =============================================================
// PUT: ACTUALIZAR SOLO EL ESTADO
// =============================================================
router.put('/:id/estado', async (req, res) => {
  const idSolicitud = req.params.id;
  const { IdEstado } = req.body;
  
  logger.info(`[INFO] Actualizando estado de solicitud ${idSolicitud} a ${IdEstado}`);

  try {
    const pool = await connectDB();
    
    await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdEstado', sql.Int, IdEstado)
      .query('UPDATE Solicitudes SET IdEstado = @IdEstado WHERE IdSolicitud = @IdSolicitud');

    logger.info(`[INFO] Estado de solicitud ${idSolicitud} actualizado a ${IdEstado}`);
    res.status(200).json({ message: 'Estado actualizado exitosamente.' });

  } catch (err) {
    logger.error(`[ERROR] Error al actualizar estado de solicitud ${idSolicitud}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al actualizar estado.' });
  }
});

// =============================================================
// GET: GENERAR CONTRATO EN PDF PARA SOLICITUD AUTORIZADA
// =============================================================
router.get('/:id/contrato', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Generando contrato para solicitud: ${idSolicitud}`);

  try {
    const pool = await connectDB();

    // Obtener datos completos de la solicitud autorizada
    const solicitudQuery = `
      SELECT 
    S.IdSolicitud,
    S.NombreEvento,
    FORMAT(S.FechaEvento, 'yyyy-MM-dd') AS FechaEvento,
    CONVERT(VARCHAR, S.HoraInicio, 108) AS HoraInicio,
    CONVERT(VARCHAR, S.HoraFin, 108) AS HoraFin,
    S.Participantes,
    S.Observaciones,
    SS.IdSalon,
    SS.IdCapacidad,
    SS.Nota AS NotaSalon,
    SE.Nombre AS NombreSolicitanteExterno,
    SE.Empresa AS EmpresaExterna,
    SE.Email AS EmailExterno,
    SE.Telefono AS TelefonoExterno,
    SSol.IdEmpleado,
    EMP.Nombre + ' ' + EMP.Apellido AS NombreEmpleado,  -- Concatenar nombre y apellido
    EMP.Email AS EmailEmpleado,
    DEP.Nombre AS DepartamentoEmpleado,
    SAL.Nombre AS NombreSalon,
    STRING_AGG(TC.Nombre + ': ' + FORMAT(C.Monto, 'N2'), ' | ') AS CostosConcatenados,
    TM.Nombre AS NombreTipoMontaje,
    CAP.CantidadPersonas,
    EST.Nombre AS EstadoSolicitud
FROM Solicitudes S
LEFT JOIN SolicitudSalones SS ON S.IdSolicitud = SS.IdSolicitud
LEFT JOIN SolicitudesSolicitantes SSol ON SSol.IdSolicitud = S.IdSolicitud
LEFT JOIN SolicitantesExternos SE ON SSol.IdSolicitanteExterno = SE.IdSolicitanteExterno
LEFT JOIN Empleados EMP ON SSol.IdEmpleado = EMP.IdEmpleado
LEFT JOIN Departamento DEP ON EMP.IdDepartamento = DEP.IdDepartamento
LEFT JOIN Costos C ON SS.IdSalon = C.IdSalon
LEFT JOIN TiposCosto TC ON TC.IdTipoCosto = C.IdTipoCosto
LEFT JOIN Capacidades CAP ON SS.IdCapacidad = CAP.IdCapacidad
LEFT JOIN TiposMontaje TM ON CAP.IdTipoMontaje = TM.IdTipoMontaje
LEFT JOIN EstadosGenerales EST ON S.IdEstado = EST.IdEstado 
LEFT JOIN Salones SAL ON SS.IdSalon = SAL.IdSalon
WHERE S.IdSolicitud = @IdSolicitud AND S.IdEstado = 5
GROUP BY 
    S.IdSolicitud,
    S.NombreEvento,
    S.FechaEvento,
    S.HoraInicio,
    S.HoraFin,
    S.Participantes,
    S.Observaciones,
    SS.IdSalon,
    SS.IdCapacidad,
    SS.Nota,
    SE.Nombre,
    SE.Empresa,
    SE.Email,
    SE.Telefono,
    SSol.IdEmpleado,
    EMP.Nombre,
    EMP.Apellido,
    EMP.Email,
    DEP.Nombre,
    SAL.Nombre,
    TM.Nombre,
    CAP.CantidadPersonas,
    EST.Nombre
    `;

    const solicitudResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(solicitudQuery);

    if (solicitudResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Solicitud no encontrada o no autorizada.' });
    }

    const solicitud = solicitudResult.recordset[0];

    // Obtener servicios seleccionados
    const serviciosResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
        SELECT 
          SERV.Nombre AS NombreServicio,
          SS.Nota
        FROM SolicitudServicios SS
        INNER JOIN Servicios SERV ON SS.IdServicio = SERV.IdServicio
        INNER JOIN SolicitudSalones SSal ON SS.IdSolicitudSalon = SSal.IdSolicitudSalon
        WHERE SSal.IdSolicitud = @IdSolicitud
      `);

    // Obtener equipo seleccionado
    const equipoResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
        SELECT 
          EQ.Nombre AS NombreEquipoOpcional,
          SE.Nota
        FROM SolicitudEquipo SE
        INNER JOIN EquipoOpcional EQ ON SE.IdEquipo = EQ.IdEquipo
        INNER JOIN SolicitudSalones SSal ON SE.IdSolicitudSalon = SSal.IdSolicitudSalon
        WHERE SSal.IdSolicitud = @IdSolicitud
      `);

    // Obtener degustaciones seleccionadas
    const degustacionesResult = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
		SELECT 
          DEG.Nombre,
          SD.Nota
        FROM SolicitudDegustaciones SD
        INNER JOIN Degustaciones DEG ON SD.IdDegustacion = DEG.IdDegustacion
        INNER JOIN SolicitudSalones SSal ON SD.IdSolicitudSalon = SSal.IdSolicitudSalon
        WHERE SSal.IdSolicitud = @IdSolicitud
      `);

    // Preparar datos para el contrato
    const contratoData = {
      idSolicitud: solicitud.IdSolicitud,
      nombreEvento: solicitud.NombreEvento,
      fechaEvento: solicitud.FechaEvento,
      horaInicio: solicitud.HoraInicio,
      horaFin: solicitud.HoraFin,
      participantes: solicitud.Participantes,
      nombreSalon: solicitud.NombreSalon,
      tipoMontaje: solicitud.NombreTipoMontaje,
      capacidad: solicitud.CantidadPersonas,
      costos: solicitud.CostosConcatenados || 'Por definir',
      
      // Datos del solicitante
      solicitante: solicitud.IdEmpleado ? {
        tipo: 'Interno',
        nombre: solicitud.NombreEmpleado,
        email: solicitud.EmailEmpleado,
        departamento: solicitud.DepartamentoEmpleado
      } : {
        tipo: 'Externo',
        nombre: solicitud.NombreSolicitanteExterno,
        empresa: solicitud.EmpresaExterna,
        email: solicitud.EmailExterno,
        telefono: solicitud.TelefonoExterno
      },
      
      // Servicios y adicionales
      servicios: serviciosResult.recordset,
      equipo: equipoResult.recordset,
      degustaciones: degustacionesResult.recordset,
      
      // Fecha de generación
      fechaGeneracion: new Date().toLocaleDateString('es-ES'),
      horaGeneracion: new Date().toLocaleTimeString('es-ES')
    };

    // Enviar datos del contrato (el frontend generará el PDF)
    res.status(200).json(contratoData);

  } catch (err) {
    logger.error(`[ERROR] Error al generar contrato para solicitud ${idSolicitud}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al generar contrato.' });
  }
});

// =============================================================
// GET: OBTENER TIPOS DE PAGO
// =============================================================
router.get('/tipos-pago', async (req, res) => {
  logger.info('[INFO] Obteniendo tipos de pago');
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query('SELECT IdTipoPago, Nombre, Descripcion FROM TiposPago ORDER BY Nombre');
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener tipos de pago: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener tipos de pago' });
  }
});

// =============================================================
// GET: OBTENER COSTOS DEL SALÓN (USANDO TABLAS EXISTENTES)
// =============================================================
router.get('/salones/:id/costos', async (req, res) => {
  const idSalon = req.params.id;
  logger.info(`[INFO] Obteniendo costos para salón: ${idSalon}`);
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdSalon', sql.Int, idSalon)
      .query(`
        SELECT 
          PrecioBase = ISNULL((SELECT TOP 1 Monto FROM Costos WHERE IdSalon = @IdSalon AND IdTipoCosto = 1 ORDER BY FechaRegistro DESC), 0),
          DepositoReembolsable = ISNULL((SELECT TOP 1 Monto FROM Costos WHERE IdSalon = @IdSalon AND IdTipoCosto = 2 ORDER BY FechaRegistro DESC), 0)
      `);
    
    // Si ambos son 0, probablemente no hay costos registrados
    if (result.recordset[0].PrecioBase === 0 && result.recordset[0].DepositoReembolsable === 0) {
      return res.status(404).json({ 
        message: 'No se encontraron costos registrados para este salón' 
      });
    }
    
    res.status(200).json(result.recordset[0]);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener costos del salón: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener costos del salón' });
  }
});

// =============================================================
// POST: CREAR PAGO PARA SOLICITUD
// =============================================================
router.post('/:id/pago', async (req, res) => {
  const idSolicitud = req.params.id;
  const pagoData = req.body;
  
  logger.info(`[INFO] Creando pago para solicitud: ${idSolicitud}`);
  
  let transaction;
  
  try {
    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Verificar que la solicitud existe y está pendiente
    const solicitudCheck = await transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query('SELECT IdEstado FROM Solicitudes WHERE IdSolicitud = @IdSolicitud');
    
    if (solicitudCheck.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }
    
    const estadoActual = solicitudCheck.recordset[0].IdEstado;
    if (estadoActual !== 4) { // 4 = PENDIENTE
      await transaction.rollback();
      return res.status(400).json({ message: 'Solo se pueden crear pagos para solicitudes pendientes' });
    }

    // Insertar el pago
    const pagoResult = await transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdTipoPago', sql.Int, pagoData.IdTipoPago)
      .input('MontoTotal', sql.Decimal(10,2), pagoData.MontoTotal)
      .input('Anticipo', sql.Decimal(10,2), pagoData.Anticipo)
      .input('Saldo', sql.Decimal(10,2), pagoData.Saldo)
      .input('NumeroComprobante', sql.VarChar(100), pagoData.NumeroComprobante || null)
      .input('Observaciones', sql.VarChar(500), pagoData.Observaciones || null)
      .query(`
        INSERT INTO Pagos (IdSolicitud, IdTipoPago, MontoTotal, Anticipo, Saldo, NumeroComprobante, Observaciones, Estado)
        VALUES (@IdSolicitud, @IdTipoPago, @MontoTotal, @Anticipo, @Saldo, @NumeroComprobante, @Observaciones, 'Completado');
        SELECT SCOPE_IDENTITY() AS IdPago;
      `);
    
    const idPago = pagoResult.recordset[0].IdPago;
    
    // Actualizar estado de la solicitud a AUTORIZADA (5)
    await transaction.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .input('IdEstado', sql.Int, 5) // 5 = AUTORIZADA
      .query('UPDATE Solicitudes SET IdEstado = @IdEstado WHERE IdSolicitud = @IdSolicitud');
    
    await transaction.commit();
    
    logger.info(`[INFO] Pago ${idPago} creado y solicitud ${idSolicitud} autorizada`);
    
    res.status(201).json({
      message: 'Pago registrado y solicitud autorizada exitosamente',
      idPago: idPago,
      idSolicitud: idSolicitud
    });
    
  } catch (err) {
    if (transaction) await transaction.rollback();
    logger.error(`[ERROR] Error al crear pago: ${err.message}`);
    res.status(500).json({ error: 'Error al procesar el pago: ' + err.message });
  }
});

// =============================================================
// GET: OBTENER PAGO POR SOLICITUD
// =============================================================
router.get('/:id/pago', async (req, res) => {
  const idSolicitud = req.params.id;
  logger.info(`[INFO] Obteniendo pago para solicitud: ${idSolicitud}`);
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdSolicitud', sql.Int, idSolicitud)
      .query(`
        SELECT 
          P.*,
          TP.Nombre AS TipoPagoNombre
        FROM Pagos P
        INNER JOIN TiposPago TP ON P.IdTipoPago = TP.IdTipoPago
        WHERE P.IdSolicitud = @IdSolicitud
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'No se encontró pago para esta solicitud' });
    }
    
    res.status(200).json(result.recordset[0]);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener pago: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener información del pago' });
  }
});

// =============================================================
// GET: OBTENER TIPOS DE COSTOS DISPONIBLES
// =============================================================
router.get('/tipos-costo', async (req, res) => {
  logger.info('[INFO] Obteniendo tipos de costo');
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query('SELECT IdTipoCosto, Nombre FROM TiposCosto ORDER BY Nombre');
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener tipos de costo: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener tipos de costo' });
  }
});

module.exports = router;
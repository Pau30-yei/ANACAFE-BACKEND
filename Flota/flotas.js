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
    new winston.transports.File({ filename: 'appGestionFlotas.log' })
  ],
});

// =============================================================
// MIDDLEWARE PARA LOGGING
// =============================================================
router.use((req, res, next) => {
  logger.info(`[${req.method}] ${req.originalUrl}`);
  next();
});

// =============================================================
// GET: OBTENER CONDUCTORES (EMPLEADOS DEL DEPARTAMENTO PILOTOS)
// =============================================================
router.get('/conductores', async (req, res) => {
  logger.info('[INFO] Obteniendo lista de conductores');
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          e.IdEmpleado,
          e.Nombre,
          e.Apellido,
          e.Email,
          e.Telefono,
          e.FechaIngreso,
          d.Nombre AS Departamento,
          lc.NumeroLicencia,
          lc.TipoLicencia,
          lc.FechaCaducidad,
          lc.IdEstado AS EstadoLicencia,
          eg.Nombre AS EstadoLicenciaNombre
        FROM Empleados e
        INNER JOIN Departamento d ON e.IdDepartamento = d.IdDepartamento
        LEFT JOIN LicenciasConductores lc ON e.IdEmpleado = lc.IdEmpleado
        LEFT JOIN EstadosGenerales eg ON lc.IdEstado = eg.IdEstado
        WHERE d.Nombre = 'Pilotos' OR d.Nombre LIKE '%Pilot%'
        ORDER BY e.Nombre, e.Apellido
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener conductores: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener lista de conductores' });
  }
});

// =============================================================
// GET: OBTENER VEHÍCULOS
// =============================================================
router.get('/vehiculos', async (req, res) => {
  logger.info('[INFO] Obteniendo lista de vehículos');
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          v.*,
          tv.Nombre AS TipoVehiculo,
          eg.Nombre AS EstadoNombre
        FROM Vehiculos v
        INNER JOIN TiposVehiculo tv ON v.IdTipoVehiculo = tv.IdTipoVehiculo
        INNER JOIN EstadosGenerales eg ON v.IdEstado = eg.IdEstado
        ORDER BY v.IdEstado, v.Marca, v.Modelo
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener vehículos: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener lista de vehículos' });
  }
});

// =============================================================
// GET: OBTENER VEHÍCULO POR ID
// =============================================================
router.get('/vehiculos/:id', async (req, res) => {
  const idVehiculo = req.params.id;
  logger.info(`[INFO] Obteniendo vehículo con ID: ${idVehiculo}`);
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdVehiculo', sql.Int, idVehiculo)
      .query(`
        SELECT 
          v.*,
          tv.Nombre AS TipoVehiculo,
          eg.Nombre AS EstadoNombre
        FROM Vehiculos v
        INNER JOIN TiposVehiculo tv ON v.IdTipoVehiculo = tv.IdTipoVehiculo
        INNER JOIN EstadosGenerales eg ON v.IdEstado = eg.IdEstado
        WHERE v.IdVehiculo = @IdVehiculo
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Vehículo no encontrado' });
    }
    
    res.status(200).json(result.recordset[0]);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener vehículo ${idVehiculo}: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener vehículo' });
  }
});

// =============================================================
// GET: OBTENER TIPOS DE VEHÍCULO
// =============================================================
router.get('/tipos-vehiculo', async (req, res) => {
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          tv.*,
          eg.Nombre AS EstadoNombre
        FROM TiposVehiculo tv
        INNER JOIN EstadosGenerales eg ON tv.IdEstado = eg.IdEstado
        ORDER BY tv.Nombre
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener tipos de vehículo: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener tipos de vehículo' });
  }
});

// =============================================================
// GET: OBTENER TIPOS DE ASIGNACIÓN
// =============================================================
router.get('/tipos-asignacion', async (req, res) => {
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          ta.*,
          eg.Nombre AS EstadoNombre
        FROM TiposAsignacion ta
        INNER JOIN EstadosGenerales eg ON ta.IdEstado = eg.IdEstado
        WHERE ta.IdEstado = 1
        ORDER BY ta.Nombre
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener tipos de asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener tipos de asignación' });
  }
});

// =============================================================
// GET: OBTENER TIPOS DE MANTENIMIENTO
// =============================================================
router.get('/tipos-mantenimiento', async (req, res) => {
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          tm.*,
          eg.Nombre AS EstadoNombre
        FROM TiposMantenimiento tm
        INNER JOIN EstadosGenerales eg ON tm.IdEstado = eg.IdEstado
        WHERE tm.IdEstado = 1
        ORDER BY tm.Nombre
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener tipos de mantenimiento: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener tipos de mantenimiento' });
  }
});

// =============================================================
// POST: CREAR NUEVA ASIGNACIÓN DE VEHÍCULO
// =============================================================
router.post('/asignaciones', async (req, res) => {
  logger.info('[INFO] Creando nueva asignación de vehículo');
  const data = req.body;
  
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  let transaction;
  
  try {
    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Verificar disponibilidad del vehículo
    const disponibilidadCheck = await transaction.request()
      .input('IdVehiculo', sql.Int, data.IdVehiculo)
      .input('FechaInicio', sql.Date, data.FechaInicio)
      .input('FechaFin', sql.Date, data.FechaFin)
      .query(`
        SELECT IdAsignacion 
        FROM AsignacionesVehiculos 
        WHERE IdVehiculo = @IdVehiculo 
          AND IdEstado IN (1, 4, 5) -- Activo, Pendiente, Autorizada
          AND (
            (FechaInicio <= @FechaFin AND FechaFin >= @FechaInicio) OR
            (@FechaFin IS NULL AND FechaInicio <= @FechaInicio)
          )
      `);

    if (disponibilidadCheck.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({ 
        message: 'El vehículo no está disponible en las fechas solicitadas',
        isConflict: true 
      });
    }

    // Verificar que el conductor tenga licencia vigente
    const licenciaCheck = await transaction.request()
      .input('IdConductor', sql.Int, data.IdConductor)
      .query(`
        SELECT 1 
        FROM LicenciasConductores 
        WHERE IdEmpleado = @IdConductor 
          AND FechaCaducidad > GETDATE()
          AND IdEstado = 1
      `);

    if (licenciaCheck.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'El conductor no tiene una licencia vigente'
      });
    }

    // Crear la asignación
    const asignacionResult = await transaction.request()
      .input('IdVehiculo', sql.Int, data.IdVehiculo)
      .input('IdConductor', sql.Int, data.IdConductor)
      .input('IdSolicitante', sql.Int, data.IdSolicitante)
      .input('IdTipoAsignacion', sql.Int, data.IdTipoAsignacion)
      .input('FechaInicio', sql.Date, data.FechaInicio)
      .input('FechaFin', sql.Date, data.FechaFin)
      .input('Destino', sql.NVarChar(500), data.Destino)
      .input('Proposito', sql.NVarChar(1000), data.Proposito)
      .input('KilometrajeInicial', sql.Decimal(10,2), data.KilometrajeInicial)
      .input('NivelCombustibleInicial', sql.NVarChar(50), data.NivelCombustibleInicial)
      .input('Observaciones', sql.NVarChar(1000), data.Observaciones || '')
      .input('UsuarioRegistro', sql.NVarChar(100), usuario)
      .query(`
        INSERT INTO AsignacionesVehiculos (
          IdVehiculo, IdConductor, IdSolicitante, IdTipoAsignacion, FechaInicio, FechaFin,
          Destino, Proposito, KilometrajeInicial, NivelCombustibleInicial, Observaciones, UsuarioRegistro
        )
        OUTPUT INSERTED.IdAsignacion
        VALUES (
          @IdVehiculo, @IdConductor, @IdSolicitante, @IdTipoAsignacion, @FechaInicio, @FechaFin,
          @Destino, @Proposito, @KilometrajeInicial, @NivelCombustibleInicial, @Observaciones, @UsuarioRegistro
        )
      `);

    const idAsignacion = asignacionResult.recordset[0].IdAsignacion;

    // Actualizar estado del vehículo a "En Uso" (9)
    await transaction.request()
      .input('IdVehiculo', sql.Int, data.IdVehiculo)
      .input('KilometrajeActual', sql.Decimal(10,2), data.KilometrajeInicial)
      .query(`
        UPDATE Vehiculos 
        SET IdEstado = 9, KilometrajeActual = @KilometrajeActual
        WHERE IdVehiculo = @IdVehiculo
      `);

    await transaction.commit();
    logger.info(`[INFO] Asignación ${idAsignacion} creada por usuario: ${usuario}`);

    res.status(201).json({
      message: 'Asignación creada exitosamente',
      idAsignacion: idAsignacion
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    logger.error(`[ERROR] Error al crear asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al crear la asignación: ' + err.message });
  }
});

// =============================================================
// GET: OBTENER ASIGNACIONES ACTIVAS
// =============================================================
router.get('/asignaciones/activas', async (req, res) => {
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          a.*,
          v.Marca,
          v.Modelo,
          v.Placa,
          c.Nombre + ' ' + c.Apellido AS NombreConductor,
          s.Nombre + ' ' + s.Apellido AS NombreSolicitante,
          ta.Nombre AS TipoAsignacion,
          eg.Nombre AS EstadoNombre
        FROM AsignacionesVehiculos a
        INNER JOIN Vehiculos v ON a.IdVehiculo = v.IdVehiculo
        INNER JOIN Empleados c ON a.IdConductor = c.IdEmpleado
        INNER JOIN Empleados s ON a.IdSolicitante = s.IdEmpleado
        INNER JOIN TiposAsignacion ta ON a.IdTipoAsignacion = ta.IdTipoAsignacion
        INNER JOIN EstadosGenerales eg ON a.IdEstado = eg.IdEstado
        WHERE a.IdEstado IN (1, 4, 5) -- Activo, Pendiente, Autorizada
        ORDER BY a.FechaAsignacion DESC
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener asignaciones activas: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener asignaciones activas' });
  }
});

// =============================================================
// GET: OBTENER HISTORIAL DE ASIGNACIONES (DEBE IR ANTES DE :id)
// =============================================================
router.get('/asignaciones/historial', async (req, res) => {
  const { fechaInicio, fechaFin, idVehiculo, idConductor } = req.query;
  
  logger.info('[INFO] Obteniendo historial de asignaciones');
  
  try {
    const pool = await connectDB();
    let request = pool.request();
    
    let query = `
      SELECT 
        a.*,
        v.Marca,
        v.Modelo,
        v.Placa,
        c.Nombre + ' ' + c.Apellido AS NombreConductor,
        s.Nombre + ' ' + s.Apellido AS NombreSolicitante,
        ta.Nombre AS TipoAsignacion,
        eg.Nombre AS EstadoNombre,
        rv.KilometrajeEntrada,
        rv.KilometrajeSalida,
        (rv.KilometrajeEntrada - rv.KilometrajeSalida) AS KilometrosRecorridos
      FROM AsignacionesVehiculos a
      INNER JOIN Vehiculos v ON a.IdVehiculo = v.IdVehiculo
      INNER JOIN Empleados c ON a.IdConductor = c.IdEmpleado
      INNER JOIN Empleados s ON a.IdSolicitante = s.IdEmpleado
      INNER JOIN TiposAsignacion ta ON a.IdTipoAsignacion = ta.IdTipoAsignacion
      INNER JOIN EstadosGenerales eg ON a.IdEstado = eg.IdEstado
      LEFT JOIN RegistroViajes rv ON a.IdAsignacion = rv.IdAsignacion
      WHERE 1=1
    `;
    
    if (fechaInicio) {
      request.input('FechaInicio', sql.Date, fechaInicio);
      query += ' AND a.FechaInicio >= @FechaInicio';
    }
    
    if (fechaFin) {
      request.input('FechaFin', sql.Date, fechaFin);
      query += ' AND a.FechaInicio <= @FechaFin';
    }
    
    if (idVehiculo) {
      request.input('IdVehiculo', sql.Int, idVehiculo);
      query += ' AND a.IdVehiculo = @IdVehiculo';
    }
    
    if (idConductor) {
      request.input('IdConductor', sql.Int, idConductor);
      query += ' AND a.IdConductor = @IdConductor';
    }
    
    query += ' ORDER BY a.FechaAsignacion DESC';
    
    const result = await request.query(query);
    
    logger.info(`[INFO] Historial obtenido: ${result.recordset.length} registros`);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener historial: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener historial de asignaciones' });
  }
});

// =============================================================
// GET: OBTENER REGISTROS DE VIAJE POR ASIGNACIÓN
// =============================================================
router.get('/asignaciones/:id/viajes', async (req, res) => {
  const idAsignacion = req.params.id;
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .query(`
        SELECT 
          rv.*,
          eg.Nombre AS EstadoNombre
        FROM RegistroViajes rv
        INNER JOIN EstadosGenerales eg ON rv.IdEstado = eg.IdEstado
        WHERE rv.IdAsignacion = @IdAsignacion
        ORDER BY rv.FechaSalida DESC
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener registros de viaje: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener registros de viaje' });
  }
});

// =============================================================
// PUT: FINALIZAR ASIGNACIÓN
// =============================================================
router.put('/asignaciones/:id/finalizar', async (req, res) => {
  const idAsignacion = req.params.id;
  const data = req.body;
  
  logger.info(`[INFO] Finalizando asignación: ${idAsignacion}`);
  
  let transaction;
  
  try {
    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Verificar que la asignación existe y está activa
    const asignacionCheck = await transaction.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .query(`
        SELECT IdAsignacion, IdVehiculo, KilometrajeInicial
        FROM AsignacionesVehiculos 
        WHERE IdAsignacion = @IdAsignacion 
          AND IdEstado IN (1, 4, 5)
      `);

    if (asignacionCheck.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'La asignación no existe o no está activa' });
    }

    const asignacion = asignacionCheck.recordset[0];

    // Validar que el kilometraje final sea mayor al inicial
    if (data.KilometrajeFinal <= asignacion.KilometrajeInicial) {
      await transaction.rollback();
      return res.status(400).json({ 
        message: 'El kilometraje final debe ser mayor al kilometraje inicial' 
      });
    }

    // Actualizar asignación a estado "Finalizada" (6)
    await transaction.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .input('ObservacionesCierre', sql.NVarChar(1000), data.Observaciones || '')
      .query(`
        UPDATE AsignacionesVehiculos 
        SET IdEstado = 11, -- Finalizada
            Observaciones = ISNULL(Observaciones, '') + ' | Cierre: ' + @ObservacionesCierre
        WHERE IdAsignacion = @IdAsignacion
      `);

    // Actualizar vehículo a "Disponible" (8)
    await transaction.request()
      .input('IdVehiculo', sql.Int, asignacion.IdVehiculo)
      .input('KilometrajeFinal', sql.Decimal(10,2), data.KilometrajeFinal)
      .query(`
        UPDATE Vehiculos 
        SET IdEstado = 8, KilometrajeActual = @KilometrajeFinal
        WHERE IdVehiculo = @IdVehiculo
      `);

    // Crear registro de viaje
    await transaction.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .input('KilometrajeFinal', sql.Decimal(10,2), data.KilometrajeFinal)
      .input('NivelCombustibleFinal', sql.NVarChar(50), data.NivelCombustibleFinal)
      .input('Observaciones', sql.NVarChar(1000), data.Observaciones || '')
      .query(`
        INSERT INTO RegistroViajes (
          IdAsignacion, FechaSalida, FechaEntrada,
          KilometrajeSalida, KilometrajeEntrada,
          NivelCombustibleSalida, NivelCombustibleEntrada,
          Observaciones
        )
        SELECT 
          IdAsignacion,
          FechaAsignacion,
          GETDATE(),
          KilometrajeInicial,
          @KilometrajeFinal,
          NivelCombustibleInicial,
          @NivelCombustibleFinal,
          @Observaciones
        FROM AsignacionesVehiculos
        WHERE IdAsignacion = @IdAsignacion
      `);

    await transaction.commit();
    
    logger.info(`[INFO] Asignación ${idAsignacion} finalizada exitosamente`);
    
    res.status(200).json({ 
      message: 'Asignación finalizada exitosamente',
      kilometrosRecorridos: data.KilometrajeFinal - asignacion.KilometrajeInicial
    });
    
  } catch (err) {
    if (transaction) await transaction.rollback();
    logger.error(`[ERROR] Error al finalizar asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al finalizar la asignación: ' + err.message });
  }
});

// =============================================================
// PUT: AUTORIZAR ASIGNACIÓN
// =============================================================
router.put('/asignaciones/:id/autorizar', async (req, res) => {
  const idAsignacion = req.params.id;
  const { Usuario } = req.body;
  
  logger.info(`[INFO] Autorizando asignación: ${idAsignacion}`);
  
  try {
    const pool = await connectDB();
    
    // Verificar que la asignación existe y está pendiente
    const asignacionCheck = await pool.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .query(`
        SELECT IdAsignacion, IdEstado, IdVehiculo
        FROM AsignacionesVehiculos 
        WHERE IdAsignacion = @IdAsignacion AND IdEstado = 4 -- Pendiente
      `);

    if (asignacionCheck.recordset.length === 0) {
      return res.status(404).json({ 
        message: 'La asignación no existe o no está pendiente de autorización' 
      });
    }

    const asignacion = asignacionCheck.recordset[0];

    // Actualizar estado a "Autorizada" (5)
    await pool.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .input('UsuarioAutorizacion', sql.NVarChar(100), Usuario || 'Sistema')
      .query(`
        UPDATE AsignacionesVehiculos 
        SET IdEstado = 5, 
            FechaAutorizacion = GETDATE(),
            UsuarioRegistro = @UsuarioAutorizacion
        WHERE IdAsignacion = @IdAsignacion
      `);

    // Actualizar estado del vehículo a "En Uso" (9)
    await pool.request()
      .input('IdVehiculo', sql.Int, asignacion.IdVehiculo)
      .query(`
        UPDATE Vehiculos 
        SET IdEstado = 9
        WHERE IdVehiculo = @IdVehiculo
      `);

    logger.info(`[INFO] Asignación ${idAsignacion} autorizada por: ${Usuario}`);
    
    res.status(200).json({ 
      message: 'Asignación autorizada exitosamente'
    });
    
  } catch (err) {
    logger.error(`[ERROR] Error al autorizar asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al autorizar la asignación: ' + err.message });
  }
});

// =============================================================
// PUT: ACTUALIZAR ASIGNACIÓN
// =============================================================
router.put('/asignaciones/:id', async (req, res) => {
  const idAsignacion = req.params.id;
  const data = req.body;
  
  logger.info(`[INFO] Actualizando asignación: ${idAsignacion}`);
  
  try {
    const pool = await connectDB();
    
    // Verificar que la asignación existe y está pendiente o autorizada
    const asignacionCheck = await pool.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .query(`
        SELECT IdAsignacion, IdEstado 
        FROM AsignacionesVehiculos 
        WHERE IdAsignacion = @IdAsignacion AND IdEstado IN (4, 5) -- Pendiente o Autorizada
      `);

    if (asignacionCheck.recordset.length === 0) {
      return res.status(404).json({ 
        message: 'La asignación no existe o no se puede editar' 
      });
    }

    // Actualizar asignación
    await pool.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .input('FechaInicio', sql.Date, data.FechaInicio)
      .input('FechaFin', sql.Date, data.FechaFin)
      .input('Destino', sql.NVarChar(500), data.Destino)
      .input('Proposito', sql.NVarChar(1000), data.Proposito)
      .input('Observaciones', sql.NVarChar(1000), data.Observaciones || '')
      .query(`
        UPDATE AsignacionesVehiculos 
        SET FechaInicio = @FechaInicio,
            FechaFin = @FechaFin,
            Destino = @Destino,
            Proposito = @Proposito,
            Observaciones = @Observaciones,
            FechaActualizacion = GETDATE()
        WHERE IdAsignacion = @IdAsignacion
      `);

    logger.info(`[INFO] Asignación ${idAsignacion} actualizada exitosamente`);
    
    res.status(200).json({ 
      message: 'Asignación actualizada exitosamente'
    });
    
  } catch (err) {
    logger.error(`[ERROR] Error al actualizar asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al actualizar la asignación: ' + err.message });
  }
});

// =============================================================
// DELETE: CANCELAR ASIGNACIÓN
// =============================================================
router.delete('/asignaciones/:id', async (req, res) => {
  const idAsignacion = req.params.id;
  const { Usuario, Motivo } = req.body;
  
  logger.info(`[INFO] Cancelando asignación: ${idAsignacion}`);
  
  let transaction;
  
  try {
    const pool = await connectDB();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Verificar que la asignación existe y está activa/pendiente/autorizada
    const asignacionCheck = await transaction.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .query(`
        SELECT IdAsignacion, IdVehiculo, IdEstado 
        FROM AsignacionesVehiculos 
        WHERE IdAsignacion = @IdAsignacion AND IdEstado IN (1, 4, 5)
      `);

    if (asignacionCheck.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        message: 'La asignación no existe o no se puede cancelar' 
      });
    }

    const asignacion = asignacionCheck.recordset[0];

    // Actualizar asignación a estado "Cancelada" (6)
    await transaction.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .input('Observaciones', sql.NVarChar(1000), 
             `Cancelada por: ${Usuario}. Motivo: ${Motivo || 'No especificado'}`)
      .query(`
        UPDATE AsignacionesVehiculos 
        SET IdEstado = 6,
            Observaciones = ISNULL(Observaciones, '') + ' | ' + @Observaciones
        WHERE IdAsignacion = @IdAsignacion
      `);

    // Si el vehículo estaba en uso, volver a disponible
    if (asignacion.IdEstado === 1 || asignacion.IdEstado === 5) { // Activo o Autorizada
      await transaction.request()
        .input('IdVehiculo', sql.Int, asignacion.IdVehiculo)
        .query(`
          UPDATE Vehiculos 
          SET IdEstado = 8 -- Disponible
          WHERE IdVehiculo = @IdVehiculo
        `);
    }

    await transaction.commit();
    
    logger.info(`[INFO] Asignación ${idAsignacion} cancelada por: ${Usuario}`);
    
    res.status(200).json({ 
      message: 'Asignación cancelada exitosamente'
    });
    
  } catch (err) {
    if (transaction) await transaction.rollback();
    logger.error(`[ERROR] Error al cancelar asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al cancelar la asignación: ' + err.message });
  }
});

// =============================================================
// GET: OBTENER ASIGNACIÓN POR ID (ESTA DEBE IR ÚLTIMA)
// =============================================================
router.get('/asignaciones/:id', async (req, res) => {
  const idAsignacion = req.params.id;
  logger.info(`[INFO] Obteniendo asignación con ID: ${idAsignacion}`);
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .query(`
        SELECT 
          a.*,
          v.Marca,
          v.Modelo,
          v.Placa,
          c.Nombre + ' ' + c.Apellido AS NombreConductor,
          s.Nombre + ' ' + s.Apellido AS NombreSolicitante,
          ta.Nombre AS TipoAsignacion,
          eg.Nombre AS EstadoNombre
        FROM AsignacionesVehiculos a
        INNER JOIN Vehiculos v ON a.IdVehiculo = v.IdVehiculo
        INNER JOIN Empleados c ON a.IdConductor = c.IdEmpleado
        INNER JOIN Empleados s ON a.IdSolicitante = s.IdEmpleado
        INNER JOIN TiposAsignacion ta ON a.IdTipoAsignacion = ta.IdTipoAsignacion
        INNER JOIN EstadosGenerales eg ON a.IdEstado = eg.IdEstado
        WHERE a.IdAsignacion = @IdAsignacion
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Asignación no encontrada' });
    }
    
    res.status(200).json(result.recordset[0]);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener asignación ${idAsignacion}: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener asignación' });
  }
});

// =============================================================
// GET: OBTENER MANTENIMIENTOS POR VEHÍCULO
// =============================================================
router.get('/vehiculos/:id/mantenimientos', async (req, res) => {
  const idVehiculo = req.params.id;
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdVehiculo', sql.Int, idVehiculo)
      .query(`
        SELECT 
          m.*,
          tm.Nombre AS TipoMantenimiento,
          eg.Nombre AS EstadoNombre
        FROM MantenimientosVehiculos m
        INNER JOIN TiposMantenimiento tm ON m.IdTipoMantenimiento = tm.IdTipoMantenimiento
        INNER JOIN EstadosGenerales eg ON m.IdEstado = eg.IdEstado
        WHERE m.IdVehiculo = @IdVehiculo
        ORDER BY m.FechaMantenimiento DESC
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener mantenimientos: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener mantenimientos del vehículo' });
  }
});

// =============================================================
// POST: CREAR MANTENIMIENTO
// =============================================================
router.post('/mantenimientos', async (req, res) => {
  logger.info('[INFO] Creando nuevo mantenimiento');
  const data = req.body;
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdVehiculo', sql.Int, data.IdVehiculo)
      .input('IdTipoMantenimiento', sql.Int, data.IdTipoMantenimiento)
      .input('Descripcion', sql.NVarChar(500), data.Descripcion)
      .input('FechaMantenimiento', sql.Date, data.FechaMantenimiento)
      .input('Kilometraje', sql.Decimal(10,2), data.Kilometraje)
      .input('Costo', sql.Decimal(10,2), data.Costo)
      .input('Proveedor', sql.NVarChar(100), data.Proveedor || null)
      .input('Observaciones', sql.NVarChar(500), data.Observaciones || null)
      .query(`
        INSERT INTO MantenimientosVehiculos (
          IdVehiculo, IdTipoMantenimiento, Descripcion, FechaMantenimiento,
          Kilometraje, Costo, Proveedor, Observaciones
        )
        OUTPUT INSERTED.IdMantenimiento
        VALUES (
          @IdVehiculo, @IdTipoMantenimiento, @Descripcion, @FechaMantenimiento,
          @Kilometraje, @Costo, @Proveedor, @Observaciones
        )
      `);
    
    const idMantenimiento = result.recordset[0].IdMantenimiento;
    
    // Si es mantenimiento correctivo, cambiar estado del vehículo a "Mantenimiento"
    if (data.IdTipoMantenimiento === 2) { // Correctivo
      await pool.request()
        .input('IdVehiculo', sql.Int, data.IdVehiculo)
        .query('UPDATE Vehiculos SET IdEstado = 10 WHERE IdVehiculo = @IdVehiculo');
    }
    
    logger.info(`[INFO] Mantenimiento ${idMantenimiento} creado exitosamente`);
    
    res.status(201).json({
      message: 'Mantenimiento creado exitosamente',
      idMantenimiento: idMantenimiento
    });
    
  } catch (err) {
    logger.error(`[ERROR] Error al crear mantenimiento: ${err.message}`);
    res.status(500).json({ error: 'Error al crear mantenimiento: ' + err.message });
  }
});

// =============================================================
// GET: OBTENER CARGAS DE COMBUSTIBLE POR VEHÍCULO
// =============================================================
router.get('/vehiculos/:id/combustible', async (req, res) => {
  const idVehiculo = req.params.id;
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdVehiculo', sql.Int, idVehiculo)
      .query(`
        SELECT 
          cc.*,
          eg.Nombre AS EstadoNombre
        FROM CargasCombustible cc
        INNER JOIN EstadosGenerales eg ON cc.IdEstado = eg.IdEstado
        WHERE cc.IdVehiculo = @IdVehiculo
        ORDER BY cc.FechaCarga DESC
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener cargas de combustible: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener cargas de combustible' });
  }
});

// =============================================================
// POST: REGISTRAR CARGA DE COMBUSTIBLE
// =============================================================
router.post('/combustible', async (req, res) => {
  logger.info('[INFO] Registrando carga de combustible');
  const data = req.body;
  
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdVehiculo', sql.Int, data.IdVehiculo)
      .input('IdAsignacion', sql.Int, data.IdAsignacion || null)
      .input('CantidadLitros', sql.Decimal(10,2), data.CantidadLitros)
      .input('CostoTotal', sql.Decimal(10,2), data.CostoTotal)
      .input('KilometrajeActual', sql.Decimal(10,2), data.KilometrajeActual)
      .input('EstacionServicio', sql.NVarChar(100), data.EstacionServicio || null)
      .input('NumeroFactura', sql.NVarChar(100), data.NumeroFactura || null)
      .input('Observaciones', sql.NVarChar(500), data.Observaciones || null)
      .input('UsuarioRegistro', sql.NVarChar(100), usuario)
      .query(`
        INSERT INTO CargasCombustible (
          IdVehiculo, IdAsignacion, CantidadLitros, CostoTotal, KilometrajeActual,
          EstacionServicio, NumeroFactura, Observaciones, UsuarioRegistro
        )
        OUTPUT INSERTED.IdCargaCombustible
        VALUES (
          @IdVehiculo, @IdAsignacion, @CantidadLitros, @CostoTotal, @KilometrajeActual,
          @EstacionServicio, @NumeroFactura, @Observaciones, @UsuarioRegistro
        )
      `);
    
    const idCargaCombustible = result.recordset[0].IdCargaCombustible;
    
    // Actualizar kilometraje del vehículo
    await pool.request()
      .input('IdVehiculo', sql.Int, data.IdVehiculo)
      .input('KilometrajeActual', sql.Decimal(10,2), data.KilometrajeActual)
      .query('UPDATE Vehiculos SET KilometrajeActual = @KilometrajeActual WHERE IdVehiculo = @IdVehiculo');
    
    logger.info(`[INFO] Carga de combustible ${idCargaCombustible} registrada por: ${usuario}`);
    
    res.status(201).json({
      message: 'Carga de combustible registrada exitosamente',
      idCargaCombustible: idCargaCombustible
    });
    
  } catch (err) {
    logger.error(`[ERROR] Error al registrar carga de combustible: ${err.message}`);
    res.status(500).json({ error: 'Error al registrar carga de combustible: ' + err.message });
  }
});

// =============================================================
// GET: OBTENER REPORTES ESTADÍSTICOS
// =============================================================
router.get('/reportes/estadisticas', async (req, res) => {
  const { mes, anio } = req.query;
  
  try {
    const pool = await connectDB();
    let request = pool.request();
    
    let whereClause = 'WHERE 1=1';
    
    if (mes && anio) {
      request.input('Mes', sql.Int, mes);
      request.input('Anio', sql.Int, anio);
      whereClause += ' AND MONTH(a.FechaAsignacion) = @Mes AND YEAR(a.FechaAsignacion) = @Anio';
    }
    
    const query = `
      -- Total de asignaciones
      SELECT COUNT(*) AS TotalAsignaciones FROM AsignacionesVehiculos a ${whereClause};
      
      -- Asignaciones por estado
      SELECT eg.Nombre AS Estado, COUNT(*) AS Cantidad
      FROM AsignacionesVehiculos a
      INNER JOIN EstadosGenerales eg ON a.IdEstado = eg.IdEstado
      ${whereClause.replace('a.', 'a.')}
      GROUP BY eg.Nombre;
      
      -- Kilómetros totales recorridos
      SELECT ISNULL(SUM(rv.KilometrajeEntrada - rv.KilometrajeSalida), 0) AS TotalKilometros
      FROM RegistroViajes rv
      INNER JOIN AsignacionesVehiculos a ON rv.IdAsignacion = a.IdAsignacion
      ${whereClause.replace('a.', 'a.')};
      
      -- Costo total de combustible
      SELECT ISNULL(SUM(cc.CostoTotal), 0) AS TotalCombustible
      FROM CargasCombustible cc
      INNER JOIN AsignacionesVehiculos a ON cc.IdAsignacion = a.IdAsignacion
      ${whereClause.replace('a.', 'a.')};
      
      -- Vehículos más utilizados
      SELECT TOP 5 v.Marca, v.Modelo, v.Placa, COUNT(*) AS TotalAsignaciones
      FROM AsignacionesVehiculos a
      INNER JOIN Vehiculos v ON a.IdVehiculo = v.IdVehiculo
      ${whereClause.replace('a.', 'a.')}
      GROUP BY v.Marca, v.Modelo, v.Placa
      ORDER BY TotalAsignaciones DESC;
    `;
    
    const result = await request.query(query);
    
    const estadisticas = {
      totalAsignaciones: result.recordsets[0][0].TotalAsignaciones,
      asignacionesPorEstado: result.recordsets[1],
      totalKilometros: result.recordsets[2][0].TotalKilometros,
      totalCombustible: result.recordsets[3][0].TotalCombustible,
      vehiculosMasUtilizados: result.recordsets[4]
    };
    
    res.status(200).json(estadisticas);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener reportes estadísticos: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener reportes estadísticos' });
  }
});

// =============================================================
// GET: GENERAR CONTRATO EN PDF PARA ASIGNACIÓN AUTORIZADA
// =============================================================
router.get('/asignaciones/:id/contrato', async (req, res) => {
  const idAsignacion = req.params.id;
  logger.info(`[INFO] Generando contrato para asignación: ${idAsignacion}`);

  try {
    const pool = await connectDB();

    // Obtener datos completos de la asignación autorizada
    const asignacionQuery = `
      SELECT 
        a.IdAsignacion,
        a.FechaInicio,
        a.FechaFin,
        a.Destino,
        a.Proposito,
        a.KilometrajeInicial,
        a.NivelCombustibleInicial,
        a.Observaciones,
        v.Marca,
        v.Modelo,
        v.Placa,
        v.Color,
        v.Anio,
        c.Nombre + ' ' + c.Apellido AS NombreConductor,
        lc.NumeroLicencia,
        lc.TipoLicencia,
        lc.FechaCaducidad,
        c.Telefono,
        c.Email,
        s.Nombre + ' ' + s.Apellido AS NombreSolicitante,
        d.Nombre AS DepartamentoSolicitante,
        s.Email AS EmailSolicitante,
        ta.Nombre AS TipoAsignacion,
        eg.Nombre AS EstadoAsignacion
      FROM AsignacionesVehiculos a
      INNER JOIN Vehiculos v ON a.IdVehiculo = v.IdVehiculo
      INNER JOIN Empleados c ON a.IdConductor = c.IdEmpleado
      INNER JOIN Empleados s ON a.IdSolicitante = s.IdEmpleado
      INNER JOIN Departamento d ON s.IdDepartamento = d.IdDepartamento
      INNER JOIN LicenciasConductores lc ON c.IdEmpleado = lc.IdEmpleado
      INNER JOIN TiposAsignacion ta ON a.IdTipoAsignacion = ta.IdTipoAsignacion
      INNER JOIN EstadosGenerales eg ON a.IdEstado = eg.IdEstado
      WHERE a.IdAsignacion = @IdAsignacion AND a.IdEstado = 11 -- Autorizada
    `;

    const asignacionResult = await pool.request()
      .input('IdAsignacion', sql.Int, idAsignacion)
      .query(asignacionQuery);

    if (asignacionResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Asignación no encontrada o no autorizada.' });
    }

    const asignacion = asignacionResult.recordset[0];
    const formatDate = (date) => {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Preparar datos para el contrato
    const contratoData = {
      idAsignacion: asignacion.IdAsignacion,
      fechaInicio: asignacion.FechaInicio,
      fechaFin: asignacion.FechaFin ,
      destino: asignacion.Destino,
      proposito: asignacion.Proposito,
      tipoAsignacion: asignacion.TipoAsignacion,
      kilometrajeInicial: asignacion.KilometrajeInicial,
      nivelCombustibleInicial: asignacion.NivelCombustibleInicial,
      observaciones: asignacion.Observaciones,
      
      vehiculo: {
        marca: asignacion.Marca,
        modelo: asignacion.Modelo,
        placa: asignacion.Placa,
        color: asignacion.Color,
        anio: asignacion.Anio
      },
      
      conductor: {
        nombre: asignacion.NombreConductor,
        numeroLicencia: asignacion.NumeroLicencia,
        tipoLicencia: asignacion.TipoLicencia,
        fechaCaducidad: asignacion.FechaCaducidad.toISOString().split('T')[0],
        telefono: asignacion.Telefono,
        email: asignacion.Email
      },
      
      solicitante: {
        nombre: asignacion.NombreSolicitante,
        departamento: asignacion.DepartamentoSolicitante,
        email: asignacion.EmailSolicitante
      },
      
      fechaGeneracion: new Date().toLocaleDateString('es-ES'),
      horaGeneracion: new Date().toLocaleTimeString('es-ES')
    };

    // Enviar datos del contrato (el frontend generará el PDF)
    res.status(200).json(contratoData);

  } catch (err) {
    logger.error(`[ERROR] Error al generar contrato para asignación ${idAsignacion}: ${err.message}`);
    res.status(500).json({ message: 'Error interno del servidor al generar contrato.' });
  }
});


// =============================================================
// CRUD DE VEHÍCULOS
// =============================================================

// POST: CREAR NUEVO VEHÍCULO
router.post('/vehiculos', async (req, res) => {
  logger.info('[INFO] Creando nuevo vehículo');
  const data = req.body;
  
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  
  try {
    const pool = await connectDB();
    
    // Verificar si la placa ya existe
    const placaCheck = await pool.request()
      .input('Placa', sql.NVarChar(20), data.Placa)
      .query('SELECT IdVehiculo FROM Vehiculos WHERE Placa = @Placa');
    
    if (placaCheck.recordset.length > 0) {
      return res.status(409).json({ message: 'Ya existe un vehículo con esta placa' });
    }
    
    const result = await pool.request()
      .input('Marca', sql.NVarChar(100), data.Marca)
      .input('Modelo', sql.NVarChar(100), data.Modelo)
      .input('Anio', sql.Int, data.Anio)
      .input('Placa', sql.NVarChar(20), data.Placa)
      .input('NumeroChasis', sql.NVarChar(100), data.NumeroChasis)
      .input('NumeroMotor', sql.NVarChar(100), data.NumeroMotor)
      .input('Color', sql.NVarChar(50), data.Color)
      .input('IdTipoVehiculo', sql.Int, data.IdTipoVehiculo)
      .input('TarjetaCirculacion', sql.NVarChar(100), data.TarjetaCirculacion)
      .input('FechaVencimientoTarjeta', sql.Date, data.FechaVencimientoTarjeta)
      .input('PolizaSeguro', sql.NVarChar(100), data.PolizaSeguro)
      .input('FechaVencimientoSeguro', sql.Date, data.FechaVencimientoSeguro)
      .input('KilometrajeActual', sql.Decimal(10,2), data.KilometrajeActual || 0)
      .input('Observaciones', sql.NVarChar(1000), data.Observaciones || '')
      .input('UsuarioRegistro', sql.NVarChar(100), usuario)
      .query(`
        INSERT INTO Vehiculos (
          Marca, Modelo, Anio, Placa, NumeroChasis, NumeroMotor, Color, 
          IdTipoVehiculo, TarjetaCirculacion, FechaVencimientoTarjeta, 
          PolizaSeguro, FechaVencimientoSeguro, KilometrajeActual, Observaciones
        )
        OUTPUT INSERTED.IdVehiculo
        VALUES (
          @Marca, @Modelo, @Anio, @Placa, @NumeroChasis, @NumeroMotor, @Color,
          @IdTipoVehiculo, @TarjetaCirculacion, @FechaVencimientoTarjeta,
          @PolizaSeguro, @FechaVencimientoSeguro, @KilometrajeActual, @Observaciones
        )
      `);
    
    const idVehiculo = result.recordset[0].IdVehiculo;
    
    logger.info(`[INFO] Vehículo ${idVehiculo} creado por: ${usuario}`);
    
    res.status(201).json({
      message: 'Vehículo creado exitosamente',
      idVehiculo: idVehiculo
    });
    
  } catch (err) {
    logger.error(`[ERROR] Error al crear vehículo: ${err.message}`);
    res.status(500).json({ error: 'Error al crear vehículo: ' + err.message });
  }
});

// PUT: ACTUALIZAR VEHÍCULO
router.put('/vehiculos/:id', async (req, res) => {
  const idVehiculo = req.params.id;
  const data = req.body;
  
  logger.info(`[INFO] Actualizando vehículo: ${idVehiculo}`);
  
  try {
    const pool = await connectDB();
    
    // Verificar que el vehículo existe
    const vehiculoCheck = await pool.request()
      .input('IdVehiculo', sql.Int, idVehiculo)
      .query('SELECT IdVehiculo FROM Vehiculos WHERE IdVehiculo = @IdVehiculo');
    
    if (vehiculoCheck.recordset.length === 0) {
      return res.status(404).json({ message: 'Vehículo no encontrado' });
    }
    
    await pool.request()
      .input('IdVehiculo', sql.Int, idVehiculo)
      .input('Marca', sql.NVarChar(100), data.Marca)
      .input('Modelo', sql.NVarChar(100), data.Modelo)
      .input('Anio', sql.Int, data.Anio)
      .input('Placa', sql.NVarChar(20), data.Placa)
      .input('NumeroChasis', sql.NVarChar(100), data.NumeroChasis)
      .input('NumeroMotor', sql.NVarChar(100), data.NumeroMotor)
      .input('Color', sql.NVarChar(50), data.Color)
      .input('IdTipoVehiculo', sql.Int, data.IdTipoVehiculo)
      .input('TarjetaCirculacion', sql.NVarChar(100), data.TarjetaCirculacion)
      .input('FechaVencimientoTarjeta', sql.Date, data.FechaVencimientoTarjeta)
      .input('PolizaSeguro', sql.NVarChar(100), data.PolizaSeguro)
      .input('FechaVencimientoSeguro', sql.Date, data.FechaVencimientoSeguro)
      .input('KilometrajeActual', sql.Decimal(10,2), data.KilometrajeActual)
      .input('IdEstado', sql.Int, data.IdEstado)
      .input('Observaciones', sql.NVarChar(1000), data.Observaciones || '')
      .query(`
        UPDATE Vehiculos SET
          Marca = @Marca,
          Modelo = @Modelo,
          Anio = @Anio,
          Placa = @Placa,
          NumeroChasis = @NumeroChasis,
          NumeroMotor = @NumeroMotor,
          Color = @Color,
          IdTipoVehiculo = @IdTipoVehiculo,
          TarjetaCirculacion = @TarjetaCirculacion,
          FechaVencimientoTarjeta = @FechaVencimientoTarjeta,
          PolizaSeguro = @PolizaSeguro,
          FechaVencimientoSeguro = @FechaVencimientoSeguro,
          KilometrajeActual = @KilometrajeActual,
          IdEstado = @IdEstado,
          Observaciones = @Observaciones
        WHERE IdVehiculo = @IdVehiculo
      `);
    
    logger.info(`[INFO] Vehículo ${idVehiculo} actualizado exitosamente`);
    
    res.status(200).json({ message: 'Vehículo actualizado exitosamente' });
    
  } catch (err) {
    logger.error(`[ERROR] Error al actualizar vehículo: ${err.message}`);
    res.status(500).json({ error: 'Error al actualizar vehículo: ' + err.message });
  }
});

// DELETE: ELIMINAR VEHÍCULO (BORRADO LÓGICO)
router.delete('/vehiculos/:id', async (req, res) => {
  const idVehiculo = req.params.id;
  const { Usuario, Motivo } = req.body;
  
  logger.info(`[INFO] Eliminando vehículo: ${idVehiculo}`);
  
  try {
    const pool = await connectDB();
    
    // Verificar que el vehículo no tiene asignaciones activas
    const asignacionesCheck = await pool.request()
      .input('IdVehiculo', sql.Int, idVehiculo)
      .query(`
        SELECT IdAsignacion 
        FROM AsignacionesVehiculos 
        WHERE IdVehiculo = @IdVehiculo AND IdEstado IN (1, 4, 5)
      `);
    
    if (asignacionesCheck.recordset.length > 0) {
      return res.status(409).json({ 
        message: 'No se puede eliminar el vehículo porque tiene asignaciones activas' 
      });
    }
    
    // Actualizar estado a "Inactivo" (2)
    await pool.request()
      .input('IdVehiculo', sql.Int, idVehiculo)
      .input('Observaciones', sql.NVarChar(1000), 
             `Eliminado por: ${Usuario}. Motivo: ${Motivo || 'No especificado'}`)
      .query(`
        UPDATE Vehiculos 
        SET IdEstado = 2, 
            Observaciones = ISNULL(Observaciones, '') + ' | ' + @Observaciones
        WHERE IdVehiculo = @IdVehiculo
      `);
    
    logger.info(`[INFO] Vehículo ${idVehiculo} eliminado por: ${Usuario}`);
    
    res.status(200).json({ message: 'Vehículo eliminado exitosamente' });
    
  } catch (err) {
    logger.error(`[ERROR] Error al eliminar vehículo: ${err.message}`);
    res.status(500).json({ error: 'Error al eliminar vehículo: ' + err.message });
  }
});

// =============================================================
// CRUD DE LICENCIAS
// =============================================================

// GET: OBTENER TODAS LAS LICENCIAS
router.get('/licencias', async (req, res) => {
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .query(`
        SELECT 
          lc.*,
          e.Nombre + ' ' + e.Apellido AS NombreConductor,
          d.Nombre AS Departamento,
          eg.Nombre AS EstadoNombre
        FROM LicenciasConductores lc
        INNER JOIN Empleados e ON lc.IdEmpleado = e.IdEmpleado
        INNER JOIN Departamento d ON e.IdDepartamento = d.IdDepartamento
        INNER JOIN EstadosGenerales eg ON lc.IdEstado = eg.IdEstado
        ORDER BY e.Nombre, e.Apellido
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener licencias: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener licencias' });
  }
});

// POST: CREAR NUEVA LICENCIA
router.post('/licencias', async (req, res) => {
  logger.info('[INFO] Creando nueva licencia');
  const data = req.body;
  
  const usuario = data.Usuario || 'UsuarioNoIdentificado';
  
  try {
    const pool = await connectDB();
    
    // Verificar si el empleado ya tiene una licencia activa
    const licenciaCheck = await pool.request()
      .input('IdEmpleado', sql.Int, data.IdEmpleado)
      .query(`
        SELECT IdLicencia 
        FROM LicenciasConductores 
        WHERE IdEmpleado = @IdEmpleado AND IdEstado = 1
      `);
    
    if (licenciaCheck.recordset.length > 0) {
      return res.status(409).json({ 
        message: 'El empleado ya tiene una licencia activa' 
      });
    }
    
    const result = await pool.request()
      .input('IdEmpleado', sql.Int, data.IdEmpleado)
      .input('NumeroLicencia', sql.NVarChar(50), data.NumeroLicencia)
      .input('TipoLicencia', sql.NVarChar(50), data.TipoLicencia)
      .input('FechaExpedicion', sql.Date, data.FechaExpedicion)
      .input('FechaCaducidad', sql.Date, data.FechaCaducidad)
      .input('Estado', sql.Int, data.Estado)
      .input('Restricciones', sql.NVarChar(500), data.Restricciones || '')
      .input('UsuarioRegistro', sql.NVarChar(100), usuario)
      .query(`
        INSERT INTO LicenciasConductores (
          IdEmpleado, NumeroLicencia, TipoLicencia, FechaExpedicion, 
          FechaCaducidad,IdEstado, Restricciones
        )
        OUTPUT INSERTED.IdLicencia
        VALUES (
          @IdEmpleado, @NumeroLicencia, @TipoLicencia, @FechaExpedicion,
          @FechaCaducidad,@Estado, @Restricciones
        )
      `);
    
    const idLicencia = result.recordset[0].IdLicencia;
    
    logger.info(`[INFO] Licencia ${idLicencia} creada por: ${usuario}`);
    
    res.status(201).json({
      message: 'Licencia creada exitosamente',
      idLicencia: idLicencia
    });
    
  } catch (err) {
    logger.error(`[ERROR] Error al crear licencia: ${err.message}`);
    res.status(500).json({ error: 'Error al crear licencia: ' + err.message });
  }
});

// PUT: ACTUALIZAR LICENCIA
router.put('/licencias/:id', async (req, res) => {
  const idLicencia = req.params.id;
  const data = req.body;
  
  logger.info(`[INFO] Actualizando licencia: ${idLicencia}`);
  
  try {
    const pool = await connectDB();
    
    await pool.request()
      .input('IdLicencia', sql.Int, idLicencia)
      .input('NumeroLicencia', sql.NVarChar(50), data.NumeroLicencia)
      .input('TipoLicencia', sql.NVarChar(50), data.TipoLicencia)
      .input('FechaExpedicion', sql.Date, data.FechaExpedicion)
      .input('FechaCaducidad', sql.Date, data.FechaCaducidad)
      .input('Estado', sql.Int, data.Estado)
      .input('Restricciones', sql.NVarChar(500), data.Restricciones || '')
      .input('IdEstado', sql.Int, data.IdEstado)
      .query(`
        UPDATE LicenciasConductores SET
          NumeroLicencia = @NumeroLicencia,
          TipoLicencia = @TipoLicencia,
          FechaExpedicion = @FechaExpedicion,
          FechaCaducidad = @FechaCaducidad,
          IdEstado = @IdEstado,
          Restricciones = @Restricciones
        WHERE IdLicencia = @IdLicencia
      `);
    
    logger.info(`[INFO] Licencia ${idLicencia} actualizada exitosamente`);
    
    res.status(200).json({ message: 'Licencia actualizada exitosamente' });
    
  } catch (err) {
    logger.error(`[ERROR] Error al actualizar licencia: ${err.message}`);
    res.status(500).json({ error: 'Error al actualizar licencia: ' + err.message });
  }
});

// DELETE: ELIMINAR LICENCIA (BORRADO FÍSICO)
router.delete('/licencias/:id', async (req, res) => {
  const idLicencia = req.params.id;
  const { Usuario, Motivo } = req.body; 
  
  logger.info(`[INFO] Intentando ELIMINAR FÍSICAMENTE licencia: ${idLicencia} por ${Usuario}`);

  try {
    const pool = await connectDB();
    
    // PASO 1: Obtener el IdEmpleado asociado a la licencia
    const resultConductor = await pool.request()
      .input('IdLicencia', sql.Int, idLicencia)
      .query('SELECT IdEmpleado FROM LicenciasConductores WHERE IdLicencia = @IdLicencia');

    if (resultConductor.recordset.length === 0) {
        return res.status(404).json({ error: 'Licencia no encontrada.' });
    }
    const idConductor = resultConductor.recordset[0].IdEmpleado;

    // PASO 2: Verificar si el conductor (dueño de la licencia) está en alguna ASIGNACIÓN ACTIVA
    // La lógica de asignación activa dependerá de tus estados, pero generalmente es por IdEstado.
    // Asumo que IdEstado = 1 indica "Activa".
    const resultAsignacion = await pool.request()
      .input('IdConductor', sql.Int, idConductor)
      .query(`
        SELECT TOP 1 * FROM AsignacionesVehiculos 
        WHERE IdConductor = @IdConductor AND IdEstado = 1; 
      `); 
    
    if (resultAsignacion.recordset.length > 0) {
      // Si se encuentra una asignación activa, devolver un error 409 Conflict
      logger.warn(`[WARN] Intento de eliminación de Licencia ${idLicencia} fallido: En asignación activa.`);
      return res.status(409).json({ 
        message: 'No se puede eliminar la licencia porque el conductor tiene una o más ASIGNACIONES ACTIVAS.', 
        code: 'LICENCIA_EN_USO' 
      });
    }

    // PASO 3: Si no hay asignaciones activas, proceder con la eliminación física
    await pool.request()
      .input('IdLicencia', sql.Int, idLicencia)
      .query('DELETE FROM LicenciasConductores WHERE IdLicencia = @IdLicencia');
    
    logger.info(`[INFO] Licencia ${idLicencia} ELIMINADA FÍSICAMENTE por: ${Usuario}`);
    
    res.status(200).json({ message: 'Licencia eliminada exitosamente' });
    
  } catch (err) {
    logger.error(`[ERROR] Error al eliminar licencia: ${err.message}`);
    res.status(500).json({ error: 'Error interno al eliminar la licencia: ' + err.message });
  }
});
// =============================================================
// GET: OBTENER EMPLEADOS POR DEPARTAMENTO (PILOTOS)
// =============================================================
router.get('/empleados/pilotos/', async (req, res) => {
  const idDepartamento = req.params.idDepartamento;
  
  try {
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('IdDepartamento', sql.Int, idDepartamento)
      .query(`
        SELECT 
          e.*,
          d.Nombre AS Departamento
        FROM Empleados e
        INNER JOIN Departamento d ON e.IdDepartamento = d.IdDepartamento
        WHERE d.Nombre LIKE '%Pilotos%' OR d.Nombre LIKE '%Mecánicos%'
        ORDER BY e.Nombre, e.Apellido
      `);
    
    res.status(200).json(result.recordset);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener empleados por departamento: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

module.exports = router;
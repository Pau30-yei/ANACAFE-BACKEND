const express = require('express');
const router = express.Router();
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        e.idempleado as "IdEmpleado",
        e.nombre as "Nombre",
        e.apellido as "Apellido",
        e.email as "Email",
        e.telefono as "Telefono",
        e.fechaingreso as "FechaIngreso",
        d.nombre as "Departamento",
        lc.numerolicencia as "NumeroLicencia",
        lc.tipolicencia as "TipoLicencia",
        lc.fechacaducidad as "FechaCaducidad",
        lc.idestado as "EstadoLicencia",
        eg.nombre as "EstadoLicenciaNombre"
      FROM empleados e
      INNER JOIN departamento d ON e.iddepartamento = d.iddepartamento
      LEFT JOIN licenciasconductores lc ON e.idempleado = lc.idempleado
      LEFT JOIN estadosgenerales eg ON lc.idestado = eg.idestado
      WHERE d.nombre = 'Pilotos' OR d.nombre LIKE '%Pilot%'
      ORDER BY e.nombre, e.apellido
    `);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        v.IdVehiculo AS "IdVehiculo",
        v.Marca AS "Marca",
        v.Modelo AS "Modelo",
        v.Anio AS "Anio",
        v.Placa AS "Placa",
        v.NumeroChasis AS "NumeroChasis",
        v.NumeroMotor AS "NumeroMotor",
        v.Color AS "Color",
        v.IdTipoVehiculo AS "IdTipoVehiculo",
        v.TarjetaCirculacion AS "TarjetaCirculacion",
        v.FechaVencimientoTarjeta AS "FechaVencimientoTarjeta",
        v.PolizaSeguro AS "PolizaSeguro",
        v.FechaVencimientoSeguro AS "FechaVencimientoSeguro",
        v.KilometrajeActual AS "KilometrajeActual",
        v.IdEstado AS "IdEstado",
        v.Observaciones AS "Observaciones",
        v.FechaRegistro AS "FechaRegistro",
        tv.nombre as "TipoVehiculo",
        eg.nombre as "EstadoNombre"
      FROM vehiculos v
      INNER JOIN tiposvehiculo tv ON v.idtipovehiculo = tv.idtipovehiculo
      INNER JOIN estadosgenerales eg ON v.idestado = eg.idestado
      ORDER BY v.idestado, v.marca, v.modelo
    `);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
         v.IdVehiculo AS "IdVehiculo",
        v.Marca AS "Marca",
        v.Modelo AS "Modelo",
        v.Anio AS "Anio",
        v.Placa AS "Placa",
        v.NumeroChasis AS "NumeroChasis",
        v.NumeroMotor AS "NumeroMotor",
        v.Color AS "Color",
        v.IdTipoVehiculo AS "IdTipoVehiculo",
        v.TarjetaCirculacion AS "TarjetaCirculacion",
        v.FechaVencimientoTarjeta AS "FechaVencimientoTarjeta",
        v.PolizaSeguro AS "PolizaSeguro",
        v.FechaVencimientoSeguro AS "FechaVencimientoSeguro",
        v.KilometrajeActual AS "KilometrajeActual",
        v.IdEstado AS "IdEstado",
        v.Observaciones AS "Observaciones",
        v.FechaRegistro AS "FechaRegistro",
        tv.nombre as "TipoVehiculo",
        eg.nombre as "EstadoNombre"
      FROM vehiculos v
      INNER JOIN tiposvehiculo tv ON v.idtipovehiculo = tv.idtipovehiculo
      INNER JOIN estadosgenerales eg ON v.idestado = eg.idestado
      WHERE v.idvehiculo = $1
    `, [idVehiculo]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Vehículo no encontrado' });
    }
    
    res.status(200).json(result.rows[0]);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        tv.IdTipoVehiculo AS "IdTipoVehiculo",
        tv.Nombre AS "Nombre",
        tv.descripcion AS "Descripcion",
        tv.idestado AS "IdEstado",
        eg.nombre as "EstadoNombre"
      FROM tiposvehiculo tv
      INNER JOIN estadosgenerales eg ON tv.idestado = eg.idestado
      ORDER BY tv.nombre
    `);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
      ta.IdTipoAsignacion as "IdTipoAsignacion"
      ,ta.Nombre as "Nombre"
      ,ta.Descripcion as "Descripcion"
      ,ta.IdEstado as "IdEstado"
      ,eg.nombre as "EstadoNombre"
      FROM tiposasignacion ta
      INNER JOIN estadosgenerales eg ON ta.idestado = eg.idestado
      WHERE ta.idestado = 1
      ORDER BY ta.nombre
    `);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        tm.IdTipoMantenimiento AS "IdTipoMantenimiento"
      ,tm.Nombre AS "Nombre"
      ,tm.Descripcion AS "Descripcion"
      ,tm.IdEstado AS "IdEstado",
        eg.nombre as "EstadoNombre"
      FROM tiposmantenimiento tm
      INNER JOIN estadosgenerales eg ON tm.idestado = eg.idestado
      WHERE tm.idestado = 1
      ORDER BY tm.nombre
    `);
    
    res.status(200).json(result.rows);
    
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
  let client;
  
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Verificar disponibilidad del vehículo
    const disponibilidadCheck = await client.query(`
      SELECT idasignacion AS "IdAsignacion"
      FROM asignacionesvehiculos 
      WHERE idvehiculo = $1 
        AND idestado IN (1, 4, 5) -- Activo, Pendiente, Autorizada
        AND (
          (fechainicio <= $2 AND fechafin >= $3) OR
          ($2 IS NULL AND fechainicio <= $3)
        )
    `, [data.IdVehiculo, data.FechaFin, data.FechaInicio]);

    if (disponibilidadCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        message: 'El vehículo no está disponible en las fechas solicitadas',
        isConflict: true 
      });
    }

    // Verificar que el conductor tenga licencia vigente
    const licenciaCheck = await client.query(`
      SELECT 1 
      FROM licenciasconductores 
      WHERE idempleado = $1 
        AND fechacaducidad > CURRENT_DATE
        AND idestado = 1
    `, [data.IdConductor]);

    if (licenciaCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'El conductor no tiene una licencia vigente'
      });
    }

    // Crear la asignación
    const asignacionResult = await client.query(`
      INSERT INTO asignacionesvehiculos (
        idvehiculo, idconductor, idsolicitante, idtipoasignacion, fechainicio, fechafin,
        destino, proposito, kilometrajeinicial, nivelcombustibleinicial, observaciones, usuarioregistro
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING idasignacion
    `, [
      data.IdVehiculo, data.IdConductor, data.IdSolicitante, data.IdTipoAsignacion, 
      data.FechaInicio, data.FechaFin, data.Destino, data.Proposito, 
      data.KilometrajeInicial, data.NivelCombustibleInicial, data.Observaciones || '', usuario
    ]);
    
    const idAsignacion = asignacionResult.rows[0].idasignacion;

    // Actualizar estado del vehículo a "En Uso" (9)
    await client.query(`
      UPDATE vehiculos 
      SET idestado = 9, kilometrajeactual = $1
      WHERE idvehiculo = $2
    `, [data.KilometrajeInicial, data.IdVehiculo]);

    await client.query('COMMIT');
    logger.info(`[INFO] Asignación ${idAsignacion} creada por usuario: ${usuario}`);

    res.status(201).json({
      message: 'Asignación creada exitosamente',
      idAsignacion: idAsignacion
    });

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error(`[ERROR] Error al crear asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al crear la asignación: ' + err.message });
  } finally {
    if (client) client.release();
  }
});

// =============================================================
// GET: OBTENER ASIGNACIONES ACTIVAS
// =============================================================
router.get('/asignaciones/activas', async (req, res) => {
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
      a.IdAsignacion AS "IdAsignacion"
      ,a.IdVehiculo AS "IdVehiculo"
      ,a.IdConductor AS "IdConductor"
      ,a.IdSolicitante AS "IdSolicitante"
      ,a.IdTipoAsignacion AS "IdTipoAsignacion"
      ,a.FechaAsignacion AS "FechaAsignacion"
      ,a.FechaInicio AS "FechaInicio"
      ,a.FechaFin AS "FechaFin"
      ,a.Destino AS "Destino"
      ,a.Proposito AS "Proposito"
      ,a.KilometrajeInicial AS "KilometrajeInicial"
      ,a.NivelCombustibleInicial AS "NivelCombustibleInicial"
      ,a.Observaciones AS "Observaciones"
      ,a.IdEstado AS "IdEstado"
      ,a.UsuarioRegistro AS "UsuarioRegistro"
      ,a.FechaAutorizacion AS "FechaAutorizacion"
      ,a.FechaActualizacion AS "FechaActualizacion",
        v.marca as "Marca",
        v.modelo as "Modelo",
        v.placa as "Placa",
        CONCAT(c.nombre, ' ', c.apellido) as "NombreConductor",
        CONCAT(s.nombre, ' ', s.apellido) as "NombreSolicitante",
        ta.nombre as "TipoAsignacion",
        eg.nombre as "EstadoNombre"
      FROM asignacionesvehiculos a
      INNER JOIN vehiculos v ON a.idvehiculo = v.idvehiculo
      INNER JOIN empleados c ON a.idconductor = c.idempleado
      INNER JOIN empleados s ON a.idsolicitante = s.idempleado
      INNER JOIN tiposasignacion ta ON a.idtipoasignacion = ta.idtipoasignacion
      INNER JOIN estadosgenerales eg ON a.idestado = eg.idestado
      WHERE a.idestado IN (1, 4, 5) -- Activo, Pendiente, Autorizada
      ORDER BY a.fechaasignacion DESC
    `);
    
    res.status(200).json(result.rows);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener asignaciones activas: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener asignaciones activas' });
  }
});

// =============================================================
// GET: OBTENER HISTORIAL DE ASIGNACIONES
// =============================================================
router.get('/asignaciones/historial', async (req, res) => {
  const { fechaInicio, fechaFin, idVehiculo, idConductor } = req.query;
  
  logger.info('[INFO] Obteniendo historial de asignaciones');
  
  try {
    const client = await connectDB();
    
    let query = `
      SELECT 
      a.IdAsignacion AS "IdAsignacion"
      ,a.IdVehiculo AS "IdVehiculo"
      ,a.IdConductor AS "IdConductor"
      ,a.IdSolicitante AS "IdSolicitante"
      ,a.IdTipoAsignacion AS "IdTipoAsignacion"
      ,a.FechaAsignacion AS "FechaAsignacion"
      ,a.FechaInicio AS "FechaInicio"
      ,a.FechaFin AS "FechaFin"
      ,a.Destino AS "Destino"
      ,a.Proposito AS "Proposito"
      ,a.KilometrajeInicial AS "KilometrajeInicial"
      ,a.NivelCombustibleInicial AS "NivelCombustibleInicial"
      ,a.Observaciones AS "Observaciones"
      ,a.IdEstado AS "IdEstado"
      ,a.UsuarioRegistro AS "UsuarioRegistro"
      ,a.FechaAutorizacion AS "FechaAutorizacion"
      ,a.FechaActualizacion AS "FechaActualizacion",
        v.marca as "Marca",
        v.modelo as "Modelo",
        v.placa as "Placa",
        CONCAT(c.nombre, ' ', c.apellido) as "NombreConductor",
        CONCAT(s.nombre, ' ', s.apellido) as "NombreSolicitante",
        ta.nombre as "TipoAsignacion",
        eg.nombre as "EstadoNombre",
        rv.kilometrajeentrada as "KilometrajeEntrada",
        rv.kilometrajesalida as "KilometrajeSalida",
        (rv.kilometrajeentrada - rv.kilometrajesalida) as "KilometrosRecorridos"
      FROM asignacionesvehiculos a
      INNER JOIN vehiculos v ON a.idvehiculo = v.idvehiculo
      INNER JOIN empleados c ON a.idconductor = c.idempleado
      INNER JOIN empleados s ON a.idsolicitante = s.idempleado
      INNER JOIN tiposasignacion ta ON a.idtipoasignacion = ta.idtipoasignacion
      INNER JOIN estadosgenerales eg ON a.idestado = eg.idestado
      LEFT JOIN registroviajes rv ON a.idasignacion = rv.idasignacion
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (fechaInicio) {
      paramCount++;
      query += ` AND a.fechainicio >= $${paramCount}`;
      params.push(fechaInicio);
    }
    
    if (fechaFin) {
      paramCount++;
      query += ` AND a.fechainicio <= $${paramCount}`;
      params.push(fechaFin);
    }
    
    if (idVehiculo) {
      paramCount++;
      query += ` AND a.idvehiculo = $${paramCount}`;
      params.push(idVehiculo);
    }
    
    if (idConductor) {
      paramCount++;
      query += ` AND a.idconductor = $${paramCount}`;
      params.push(idConductor);
    }
    
    query += ' ORDER BY a.fechaasignacion DESC';
    
    const result = await client.query(query, params);
    
    logger.info(`[INFO] Historial obtenido: ${result.rows.length} registros`);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        rv.IdRegistroViaje AS "IdRegistroViaje"
      ,rv.IdAsignacion AS "IdAsignacion"
      ,rv.FechaSalida AS "FechaSalida"
      ,rv.FechaEntrada AS "FechaEntrada"
      ,rv.KilometrajeSalida AS "KilometrajeSalida"
      ,rv.KilometrajeEntrada AS "KilometrajeEntrada"
      ,rv.NivelCombustibleSalida AS "NivelCombustibleSalida"
      ,rv.NivelCombustibleEntrada AS "NivelCombustibleEntrada"
      ,rv.CombustibleConsumido AS "CombustibleConsumido"
      ,rv.Observaciones AS "Observaciones"
      ,rv.IdEstado AS "IdEstado",
        eg.nombre as "EstadoNombre"
      FROM registroviajes rv
      INNER JOIN estadosgenerales eg ON rv.idestado = eg.idestado
      WHERE rv.idasignacion = $1
      ORDER BY rv.fechasalida DESC
    `, [idAsignacion]);
    
    res.status(200).json(result.rows);
    
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
  
  let client;
  
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Verificar que la asignación existe y está activa
    const asignacionCheck = await client.query(`
      SELECT idasignacion AS "IdAsignacion", idvehiculo AS "IdVehiculo", kilometrajeinicial AS "KilometrajeInicial"
      FROM asignacionesvehiculos 
      WHERE idasignacion = $1 
        AND idestado IN (1, 4, 5)
    `, [idAsignacion]);

    if (asignacionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'La asignación no existe o no está activa' });
    }

    const asignacion = asignacionCheck.rows[0];

    // Validar que el kilometraje final sea mayor al inicial
    if (data.KilometrajeFinal <= asignacion.kilometrajeinicial) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'El kilometraje final debe ser mayor al kilometraje inicial' 
      });
    }

    // Actualizar asignación a estado "Finalizada" (11)
    await client.query(`
      UPDATE asignacionesvehiculos 
      SET idestado = 11,
          observaciones = COALESCE(observaciones, '') || ' | Cierre: ' || $1
      WHERE idasignacion = $2
    `, [data.Observaciones || '', idAsignacion]);

    // Actualizar vehículo a "Disponible" (8)
    await client.query(`
      UPDATE vehiculos 
      SET idestado = 8, kilometrajeactual = $1
      WHERE idvehiculo = $2
    `, [data.KilometrajeFinal, asignacion.idvehiculo]);

    // Crear registro de viaje
    await client.query(`
      INSERT INTO registroviajes (
        idasignacion, fechasalida, fechaentrada,
        kilometrajesalida, kilometrajeentrada,
        nivelcombustiblesalida, nivelcombustibleentrada,
        observaciones
      )
      SELECT 
        idasignacion AS "IdAsignacion",
        fechaasignacion AS "FechaAsignacion",
        NOW(),
        kilometrajeinicial AS "KilometrajeInicial",
        $1,
        nivelcombustibleinicial AS "NivelCombustibleInicial",
        $2,
        $3
      FROM asignacionesvehiculos
      WHERE idasignacion = $4
    `, [data.KilometrajeFinal, data.NivelCombustibleFinal, data.Observaciones || '', idAsignacion]);

    await client.query('COMMIT');
    
    logger.info(`[INFO] Asignación ${idAsignacion} finalizada exitosamente`);
    
    res.status(200).json({ 
      message: 'Asignación finalizada exitosamente',
      kilometrosRecorridos: data.KilometrajeFinal - asignacion.kilometrajeinicial
    });
    
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error(`[ERROR] Error al finalizar asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al finalizar la asignación: ' + err.message });
  } finally {
    if (client) client.release();
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
    const client = await connectDB();
    
    // Verificar que la asignación existe y está pendiente
    const asignacionCheck = await client.query(`
      SELECT idasignacion AS "IdAsignacion", idestado AS "IdEstado", idvehiculo AS "IdVehiculo"
      FROM asignacionesvehiculos 
      WHERE idasignacion = $1 AND idestado = 4 -- Pendiente
    `, [idAsignacion]);

    if (asignacionCheck.rows.length === 0) {
      return res.status(404).json({ 
        message: 'La asignación no existe o no está pendiente de autorización' 
      });
    }

    const asignacion = asignacionCheck.rows[0];

    // Actualizar estado a "Autorizada" (5)
    await client.query(`
      UPDATE asignacionesvehiculos 
      SET idestado = 5, 
          fechaautorizacion = NOW(),
          usuarioregistro = $1
      WHERE idasignacion = $2
    `, [Usuario || 'Sistema', idAsignacion]);

    // Actualizar estado del vehículo a "En Uso" (9)
    await client.query(`
      UPDATE vehiculos 
      SET idestado = 9
      WHERE idvehiculo = $1
    `, [asignacion.idvehiculo]);

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
    const client = await connectDB();
    
    // Verificar que la asignación existe y está pendiente o autorizada
    const asignacionCheck = await client.query(`
      SELECT idasignacion AS "IdAsignacion", idestado  AS "IdEstado"
      FROM asignacionesvehiculos 
      WHERE idasignacion = $1 AND idestado IN (4, 5) -- Pendiente o Autorizada
    `, [idAsignacion]);

    if (asignacionCheck.rows.length === 0) {
      return res.status(404).json({ 
        message: 'La asignación no existe o no se puede editar' 
      });
    }

    // Actualizar asignación
    await client.query(`
      UPDATE asignacionesvehiculos 
      SET fechainicio = $1,
          fechafin = $2,
          destino = $3,
          proposito = $4,
          observaciones = $5,
          fechaactualizacion = NOW()
      WHERE idasignacion = $6
    `, [
      data.FechaInicio, data.FechaFin, data.Destino, 
      data.Proposito, data.Observaciones || '', idAsignacion
    ]);

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
  
  let client;
  
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Verificar que la asignación existe y está activa/pendiente/autorizada
    const asignacionCheck = await client.query(`
      SELECT idasignacion AS "IdAsignacion" , idvehiculo AS "IdVehiculo", idestado  AS "IdEstado"
      FROM asignacionesvehiculos 
      WHERE idasignacion = $1 AND idestado IN (1, 4, 5)
    `, [idAsignacion]);

    if (asignacionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        message: 'La asignación no existe o no se puede cancelar' 
      });
    }

    const asignacion = asignacionCheck.rows[0];

    // Actualizar asignación a estado "Cancelada" (6)
    await client.query(`
      UPDATE asignacionesvehiculos 
      SET idestado = 6,
          observaciones = COALESCE(observaciones, '') || ' | ' || $1
      WHERE idasignacion = $2
    `, [`Cancelada por: ${Usuario}. Motivo: ${Motivo || 'No especificado'}`, idAsignacion]);

    // Si el vehículo estaba en uso, volver a disponible
    if (asignacion.idestado === 1 || asignacion.idestado === 5) { // Activo o Autorizada
      await client.query(`
        UPDATE vehiculos 
        SET idestado = 8 -- Disponible
        WHERE idvehiculo = $1
      `, [asignacion.idvehiculo]);
    }

    await client.query('COMMIT');
    
    logger.info(`[INFO] Asignación ${idAsignacion} cancelada por: ${Usuario}`);
    
    res.status(200).json({ 
      message: 'Asignación cancelada exitosamente'
    });
    
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error(`[ERROR] Error al cancelar asignación: ${err.message}`);
    res.status(500).json({ error: 'Error al cancelar la asignación: ' + err.message });
  } finally {
    if (client) client.release();
  }
});

// =============================================================
// GET: OBTENER ASIGNACIÓN POR ID
// =============================================================
router.get('/asignaciones/:id', async (req, res) => {
  const idAsignacion = req.params.id;
  logger.info(`[INFO] Obteniendo asignación con ID: ${idAsignacion}`);
  
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
      a.IdAsignacion AS "IdAsignacion"
      ,a.IdVehiculo AS "IdVehiculo"
      ,a.IdConductor AS "IdConductor"
      ,a.IdSolicitante AS "IdSolicitante"
      ,a.IdTipoAsignacion AS "IdTipoAsignacion"
      ,a.FechaAsignacion AS "FechaAsignacion"
      ,a.FechaInicio AS "FechaInicio"
      ,a.FechaFin AS "FechaFin"
      ,a.Destino AS "Destino"
      ,a.Proposito AS "Proposito"
      ,a.KilometrajeInicial AS "KilometrajeInicial"
      ,a.NivelCombustibleInicial AS "NivelCombustibleInicial"
      ,a.Observaciones AS "Observaciones"
      ,a.IdEstado AS "IdEstado"
      ,a.UsuarioRegistro AS "UsuarioRegistro"
      ,a.FechaAutorizacion AS "FechaAutorizacion"
      ,a.FechaActualizacion AS "FechaActualizacion",
        v.marca as "Marca",
        v.modelo as "Modelo",
        v.placa as "Placa",
        CONCAT(c.nombre, ' ', c.apellido) as "NombreConductor",
        CONCAT(s.nombre, ' ', s.apellido) as "NombreSolicitante",
        ta.nombre as "TipoAsignacion",
        eg.nombre as "EstadoNombre"
      FROM asignacionesvehiculos a
      INNER JOIN vehiculos v ON a.idvehiculo = v.idvehiculo
      INNER JOIN empleados c ON a.idconductor = c.idempleado
      INNER JOIN empleados s ON a.idsolicitante = s.idempleado
      INNER JOIN tiposasignacion ta ON a.idtipoasignacion = ta.idtipoasignacion
      INNER JOIN estadosgenerales eg ON a.idestado = eg.idestado
      WHERE a.idasignacion = $1
    `, [idAsignacion]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Asignación no encontrada' });
    }
    
    res.status(200).json(result.rows[0]);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        m.*,
        tm.nombre as "TipoMantenimiento",
        eg.nombre as "EstadoNombre"
      FROM mantenimientosvehiculos m
      INNER JOIN tiposmantenimiento tm ON m.idtipomantenimiento = tm.idtipomantenimiento
      INNER JOIN estadosgenerales eg ON m.idestado = eg.idestado
      WHERE m.idvehiculo = $1
      ORDER BY m.fechamantenimiento DESC
    `, [idVehiculo]);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      INSERT INTO mantenimientosvehiculos (
        idvehiculo, idtipomantenimiento, descripcion, fechamantenimiento,
        kilometraje, costo, proveedor, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING idmantenimiento
    `, [
      data.IdVehiculo, data.IdTipoMantenimiento, data.Descripcion, data.FechaMantenimiento,
      data.Kilometraje, data.Costo, data.Proveedor || null, data.Observaciones || null
    ]);
    
    const idMantenimiento = result.rows[0].idmantenimiento;
    
    // Si es mantenimiento correctivo, cambiar estado del vehículo a "Mantenimiento"
    if (data.IdTipoMantenimiento === 2) { // Correctivo
      await client.query(`
        UPDATE vehiculos SET idestado = 10 WHERE idvehiculo = $1
      `, [data.IdVehiculo]);
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        cc.*,
        eg.nombre as "EstadoNombre"
      FROM cargascombustible cc
      INNER JOIN estadosgenerales eg ON cc.idestado = eg.idestado
      WHERE cc.idvehiculo = $1
      ORDER BY cc.fechacarga DESC
    `, [idVehiculo]);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      INSERT INTO cargascombustible (
        idvehiculo, idasignacion, cantidadlitros, costototal, kilometrajeactual,
        estacionservicio, numerofactura, observaciones, usuarioregistro
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING idcargacombustible
    `, [
      data.IdVehiculo, data.IdAsignacion || null, data.CantidadLitros, data.CostoTotal, 
      data.KilometrajeActual, data.EstacionServicio || null, data.NumeroFactura || null, 
      data.Observaciones || null, usuario
    ]);
    
    const idCargaCombustible = result.rows[0].idcargacombustible;
    
    // Actualizar kilometraje del vehículo
    await client.query(`
      UPDATE vehiculos SET kilometrajeactual = $1 WHERE idvehiculo = $2
    `, [data.KilometrajeActual, data.IdVehiculo]);
    
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
    const client = await connectDB();
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;
    
    if (mes && anio) {
      paramCount++;
      whereClause += ` AND EXTRACT(MONTH FROM a.fechaasignacion) = $${paramCount}`;
      params.push(mes);
      paramCount++;
      whereClause += ` AND EXTRACT(YEAR FROM a.fechaasignacion) = $${paramCount}`;
      params.push(anio);
    }
    
    // Total de asignaciones
    const totalAsignaciones = await client.query(`
      SELECT COUNT(*) as "TotalAsignaciones" 
      FROM asignacionesvehiculos a ${whereClause}
    `, params);
    
    // Asignaciones por estado
    const asignacionesPorEstado = await client.query(`
      SELECT eg.nombre as "Estado", COUNT(*) as "Cantidad"
      FROM asignacionesvehiculos a
      INNER JOIN estadosgenerales eg ON a.idestado = eg.idestado
      ${whereClause.replace('a.', 'a.')}
      GROUP BY eg.nombre
    `, params);
    
    // Kilómetros totales recorridos
    const totalKilometros = await client.query(`
      SELECT COALESCE(SUM(rv.kilometrajeentrada - rv.kilometrajesalida), 0) as "TotalKilometros"
      FROM registroviajes rv
      INNER JOIN asignacionesvehiculos a ON rv.idasignacion = a.idasignacion
      ${whereClause.replace('a.', 'a.')}
    `, params);
    
    // Costo total de combustible
    const totalCombustible = await client.query(`
      SELECT COALESCE(SUM(cc.costototal), 0) as "TotalCombustible"
      FROM cargascombustible cc
      INNER JOIN asignacionesvehiculos a ON cc.idasignacion = a.idasignacion
      ${whereClause.replace('a.', 'a.')}
    `, params);
    
    // Vehículos más utilizados
    const vehiculosMasUtilizados = await client.query(`
      SELECT v.marca as "Marca", v.modelo as "Modelo", v.placa as "Placa", COUNT(*) as "TotalAsignaciones"
      FROM asignacionesvehiculos a
      INNER JOIN vehiculos v ON a.idvehiculo = v.idvehiculo
      ${whereClause.replace('a.', 'a.')}
      GROUP BY v.marca, v.modelo, v.placa
      ORDER BY "TotalAsignaciones" DESC
      LIMIT 5
    `, params);
    
    const estadisticas = {
      totalAsignaciones: totalAsignaciones.rows[0].TotalAsignaciones,
      asignacionesPorEstado: asignacionesPorEstado.rows,
      totalKilometros: totalKilometros.rows[0].TotalKilometros,
      totalCombustible: totalCombustible.rows[0].TotalCombustible,
      vehiculosMasUtilizados: vehiculosMasUtilizados.rows
    };
    
    res.status(200).json(estadisticas);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener reportes estadísticos: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener reportes estadísticos' });
  }
});


// =============================================================
// GET: GENERAR CONTRATO EN PDF PARA ASIGNACIÓN AUTORIZADA O FINALIZADA
// =============================================================
router.get('/asignaciones/:id/contrato', async (req, res) => {
  const idAsignacion = req.params.id;
  logger.info(`[INFO] Generando contrato para asignación: ${idAsignacion}`);

  try {
    const client = await connectDB();

    // Obtener datos completos de la asignación (autorizada o finalizada)
    const asignacionResult = await client.query(`
      SELECT 
        a.idasignacion as "IdAsignacion",
        a.fechainicio as "FechaInicio",
        a.fechafin as "FechaFin",
        a.destino as "Destino",
        a.Proposito AS "Proposito",
        a.kilometrajeinicial as "KilometrajeInicial",
        a.nivelcombustibleinicial as "NivelCombustibleInicial",
        a.observaciones as "Observaciones",
        v.marca as "Marca",
        v.modelo as "Modelo",
        v.placa as "Placa",
        v.color as "Color",
        v.anio as "Anio",
        CONCAT(c.nombre, ' ', c.apellido) as "NombreConductor",
        lc.numerolicencia as "NumeroLicencia",
        lc.tipolicencia as "TipoLicencia",
        lc.fechacaducidad as "FechaCaducidad",
        c.telefono as "Telefono",
        c.email as "Email",
        CONCAT(s.nombre, ' ', s.apellido) as "NombreSolicitante",
        d.nombre as "DepartamentoSolicitante",
        s.email as "EmailSolicitante",
        ta.nombre as "TipoAsignacion",
        eg.nombre as "EstadoAsignacion"
      FROM asignacionesvehiculos a
      INNER JOIN vehiculos v ON a.idvehiculo = v.idvehiculo
      INNER JOIN empleados c ON a.idconductor = c.idempleado
      INNER JOIN empleados s ON a.idsolicitante = s.idempleado
      INNER JOIN departamento d ON s.iddepartamento = d.iddepartamento
      INNER JOIN licenciasconductores lc ON c.idempleado = lc.idempleado
      INNER JOIN tiposasignacion ta ON a.idtipoasignacion = ta.idtipoasignacion
      INNER JOIN estadosgenerales eg ON a.idestado = eg.idestado
      WHERE a.idasignacion = $1 AND a.idestado IN (5, 11) -- Autorizada o Finalizada
    `, [idAsignacion]);

    if (asignacionResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Asignación no encontrada, no autorizada o no finalizada.' 
      });
    }

    const asignacion = asignacionResult.rows[0];

    // Preparar datos para el contrato
    const contratoData = {
      idAsignacion: asignacion.IdAsignacion,
      fechaInicio: new Date(asignacion.FechaInicio).toLocaleDateString('es-ES'),
      fechaFin: asignacion.FechaFin ? new Date(asignacion.FechaFin).toLocaleDateString('es-ES') : 'Permanente',
      destino: asignacion.Destino,
      proposito: asignacion.Proposito,
      tipoAsignacion: asignacion.TipoAsignacion,
      kilometrajeInicial: parseFloat(asignacion.KilometrajeInicial),
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
        fechaCaducidad: new Date(asignacion.FechaCaducidad).toLocaleDateString('es-ES'),
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

    // Enviar datos del contrato
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
    const client = await connectDB();
    
    // Verificar si la placa ya existe
    const placaCheck = await client.query(
      'SELECT idvehiculo FROM vehiculos WHERE placa = $1',
      [data.Placa]
    );
    
    if (placaCheck.rows.length > 0) {
      return res.status(409).json({ message: 'Ya existe un vehículo con esta placa' });
    }
    
    const result = await client.query(`
      INSERT INTO vehiculos (
        marca, modelo, anio, placa, numerochasis, numeromotor, color, 
        idtipovehiculo, tarjetacirculacion, fechavencimientotarjeta, 
        polizaseguro, fechavencimientoseguro, kilometrajeactual,idestado, observaciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,8, $14) RETURNING idvehiculo
    `, [
      data.Marca, data.Modelo, data.Anio, data.Placa, data.NumeroChasis, data.NumeroMotor, data.Color,
      data.IdTipoVehiculo, data.TarjetaCirculacion, data.FechaVencimientoTarjeta,
      data.PolizaSeguro, data.FechaVencimientoSeguro, data.KilometrajeActual || 0, data.Observaciones || ''
    ]);
    
    const idVehiculo = result.rows[0].idvehiculo;
    
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
    const client = await connectDB();
    
    // Verificar que el vehículo existe
    const vehiculoCheck = await client.query(
      'SELECT idvehiculo FROM vehiculos WHERE idvehiculo = $1',
      [idVehiculo]
    );
    
    if (vehiculoCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Vehículo no encontrado' });
    }
    
    await client.query(`
      UPDATE vehiculos SET
        marca = $1,
        modelo = $2,
        anio = $3,
        placa = $4,
        numerochasis = $5,
        numeromotor = $6,
        color = $7,
        idtipovehiculo = $8,
        tarjetacirculacion = $9,
        fechavencimientotarjeta = $10,
        polizaseguro = $11,
        fechavencimientoseguro = $12,
        kilometrajeactual = $13,
        idestado = $14,
        observaciones = $15
      WHERE idvehiculo = $16
    `, [
      data.Marca, data.Modelo, data.Anio, data.Placa, data.NumeroChasis, data.NumeroMotor, data.Color,
      data.IdTipoVehiculo, data.TarjetaCirculacion, data.FechaVencimientoTarjeta,
      data.PolizaSeguro, data.FechaVencimientoSeguro, data.KilometrajeActual, data.IdEstado,
      data.Observaciones || '', idVehiculo
    ]);
    
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
    const client = await connectDB();
    
    // Verificar que el vehículo no tiene asignaciones activas
    const asignacionesCheck = await client.query(`
      SELECT idasignacion 
      FROM asignacionesvehiculos 
      WHERE idvehiculo = $1 AND idestado IN (1, 4, 5)
    `, [idVehiculo]);
    
    if (asignacionesCheck.rows.length > 0) {
      return res.status(409).json({ 
        message: 'No se puede eliminar el vehículo porque tiene asignaciones activas' 
      });
    }
    
    // Actualizar estado a "Inactivo" (2)
    await client.query(`
      UPDATE vehiculos 
      SET idestado = 2, 
          observaciones = COALESCE(observaciones, '') || ' | ' || $1
      WHERE idvehiculo = $2
    `, [`Eliminado por: ${Usuario}. Motivo: ${Motivo || 'No especificado'}`, idVehiculo]);
    
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
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        lc.idlicencia AS "IdLicencia"
      ,lc.IdEmpleado AS "IdEmpleado"
      ,lc.NumeroLicencia AS "NumeroLicencia"
      ,lc.TipoLicencia AS "TipoLicencia"
      ,lc.FechaExpedicion AS "FechaExpedicion"
      ,lc.FechaCaducidad AS "FechaCaducidad"
      ,lc.Restricciones AS "Restricciones"
      ,lc.DocumentoLicencia AS "DocumentoLicencia"
      ,lc.IdEstado AS "IdEstado"
      ,lc.FechaRegistro AS "FechaRegistro",
        CONCAT(e.nombre, ' ', e.apellido) as "NombreConductor",
        d.nombre as "Departamento",
        eg.nombre as "EstadoNombre"
      FROM licenciasconductores lc
      INNER JOIN empleados e ON lc.idempleado = e.idempleado
      INNER JOIN departamento d ON e.iddepartamento = d.iddepartamento
      INNER JOIN estadosgenerales eg ON lc.idestado = eg.idestado
      ORDER BY e.nombre, e.apellido
    `);
    
    res.status(200).json(result.rows);
    
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
    const client = await connectDB();
    
    // Verificar si el empleado ya tiene una licencia activa
    const licenciaCheck = await client.query(`
      SELECT idlicencia 
      FROM licenciasconductores 
      WHERE idempleado = $1 AND idestado = 1
    `, [data.IdEmpleado]);
    
    if (licenciaCheck.rows.length > 0) {
      return res.status(409).json({ 
        message: 'El empleado ya tiene una licencia activa' 
      });
    }
    
    const result = await client.query(`
      INSERT INTO licenciasconductores (
        idempleado, numerolicencia, tipolicencia, fechaexpedicion, 
        fechacaducidad, idestado, restricciones
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING idlicencia
    `, [
      data.IdEmpleado, data.NumeroLicencia, data.TipoLicencia, data.FechaExpedicion,
      data.FechaCaducidad, data.Estado, data.Restricciones || ''
    ]);
    
    const idLicencia = result.rows[0].idlicencia;
    
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
    const client = await connectDB();
    
    await client.query(`
      UPDATE licenciasconductores SET
        numerolicencia = $1,
        tipolicencia = $2,
        fechaexpedicion = $3,
        fechacaducidad = $4,
        idestado = $5,
        restricciones = $6
      WHERE idlicencia = $7
    `, [
      data.NumeroLicencia, data.TipoLicencia, data.FechaExpedicion,
      data.FechaCaducidad, data.IdEstado, data.Restricciones || '', idLicencia
    ]);
    
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
    const client = await connectDB();
    
    // PASO 1: Obtener el IdEmpleado asociado a la licencia
    const resultConductor = await client.query(
      'SELECT idempleado FROM licenciasconductores WHERE idlicencia = $1',
      [idLicencia]
    );

    if (resultConductor.rows.length === 0) {
        return res.status(404).json({ error: 'Licencia no encontrada.' });
    }
    const idConductor = resultConductor.rows[0].idempleado;

    // PASO 2: Verificar si el conductor está en alguna ASIGNACIÓN ACTIVA
    const resultAsignacion = await client.query(`
      SELECT * FROM asignacionesvehiculos 
      WHERE idconductor = $1 AND idestado = 1
    `, [idConductor]);
    
    if (resultAsignacion.rows.length > 0) {
      logger.warn(`[WARN] Intento de eliminación de Licencia ${idLicencia} fallido: En asignación activa.`);
      return res.status(409).json({ 
        message: 'No se puede eliminar la licencia porque el conductor tiene una o más ASIGNACIONES ACTIVAS.', 
        code: 'LICENCIA_EN_USO' 
      });
    }

    // PASO 3: Si no hay asignaciones activas, proceder con la eliminación física
    await client.query(
      'DELETE FROM licenciasconductores WHERE idlicencia = $1',
      [idLicencia]
    );
    
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
router.get('/empleados/pilotos', async (req, res) => {
  try {
    const client = await connectDB();
    
    const result = await client.query(`
      SELECT 
        e.idempleado as "IdEmpleado",
        e.nombre as "Nombre",
        e.apellido as "Apellido",
        e.email as "Email",
        e.telefono as "Telefono",
        e.fechaingreso as "FechaIngreso",
        d.nombre as "Departamento"
      FROM empleados e
      INNER JOIN departamento d ON e.iddepartamento = d.iddepartamento
      WHERE d.nombre LIKE '%Pilotos%' OR d.nombre LIKE '%Mecánicos%'
      ORDER BY e.nombre, e.apellido
    `);
    
    res.status(200).json(result.rows);
    
  } catch (err) {
    logger.error(`[ERROR] Error al obtener empleados por departamento: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener empleados' });
  }
});

module.exports = router;
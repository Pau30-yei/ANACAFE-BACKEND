const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { connectDB } = require('../database.js');
const winston = require('winston');

// Configuración de Winston para el logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'app.log' }) 
    ],
});

// Obtener todos los usuarios (JOIN Empleados)
router.get('/', async (req, res) => {
    logger.info('[INFO] Intento de obtener todos los usuarios.');
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
              SELECT
                U.[IdUsuario] AS id,
                E.nombre,
                E.apellido,
                E.Email as email,
                -- Datos del Empleado
                CONCAT(E.Nombre, ' ', E.Apellido) AS Nombre, -- Concatenado para la UI
                E.[Email] AS Email,
                -- Datos del Usuario (Acceso)
                U.[Clave] AS clave,
                U.[IdRol] AS idRol,
                U.[IdStatus] AS idStatus,
                U.[FechaCreacion] AS fechaCreacion,
                U.[FechaModificacion] AS fechaModificacion,
                U.[EnSesion] AS enSesion,
                U.[IdEmpleado] AS idEmpleado,
				-- Datos del Departamento (CLAVE para el frontend)
                D.[IdDepartamento] AS IdDepartamento,
                D.[Nombre] AS NombreDepartamento
            FROM [dbo].[Usuarios] AS U
            INNER JOIN [dbo].[Empleados] AS E ON E.IdEmpleado = U.IdEmpleado
			LEFT JOIN Departamento D ON E.IdDepartamento = D.IdDepartamento 
        `);
        logger.info('[INFO] Usuarios obtenidos exitosamente.');
        res.json(result.recordset);
        
    } catch (err) {
        logger.error(`[ERR] Error al obtener usuarios: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Agregar usuario (Requiere doble inserción con transacción)
router.post('/', async (req, res) => {
    const { nombre, apellido, email, clave, idRol, idStatus, idDepartamento } = req.body;
    logger.info(`[INFO] Intento de agregar nuevo usuario: ${email}`);

    let transaction; // <-- declarar aquí, fuera del try

    try {
        const pool = await connectDB();
        transaction = new sql.Transaction(pool); // <-- ahora se inicializa dentro del try
        await transaction.begin();

        let newUserId = null;
        let newIdEmpleado = null;

        // 1. Insertar en Empleados
    const empleadoResult = await transaction.request()
    .input('Nombre', sql.NVarChar, nombre)
    .input('Apellido', sql.NVarChar, apellido || '')
    .input('Email', sql.NVarChar, email)
    .input('idDepartamento', sql.Int, idDepartamento)
    .query(`
        INSERT INTO [dbo].[Empleados] (Nombre, Apellido, Email, IdDepartamento) 
        VALUES (@Nombre, @Apellido, @Email, @IdDepartamento);
        SELECT SCOPE_IDENTITY() AS IdEmpleado;
    `);
        newIdEmpleado = empleadoResult.recordset[0].IdEmpleado;

        // 2. Insertar en Usuarios
        const usuarioResult = await transaction.request()
            .input('IdEmpleado', sql.Int, newIdEmpleado)
            .input('Clave', sql.NVarChar, clave)
            .input('IdRol', sql.Int, idRol)
            .input('IdStatus', sql.Int, idStatus)
            .query(`
                INSERT INTO [dbo].[Usuarios] (IdEmpleado, Clave, IdRol, IdStatus, FechaCreacion, FechaModificacion, EnSesion)
                VALUES (@IdEmpleado, @Clave, @IdRol, @IdStatus, GETDATE(), GETDATE(), 0);
                SELECT SCOPE_IDENTITY() AS IdUsuario;
            `);
            
        newUserId = usuarioResult.recordset[0].IdUsuario;

        await transaction.commit();

        logger.info(`[INFO] Usuario ${email} agregado exitosamente con ID: ${newUserId}.`);
        res.status(201).json({ id: newUserId, idEmpleado: newIdEmpleado, nombre, apellido, email, clave, idRol, idStatus });

    } catch (err) {
        if (transaction) {   // <-- ahora no falla, porque transaction siempre existe
            await transaction.rollback();
        }
        logger.error(`[ERR] Error al agregar usuario ${email}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// Actualizar usuario (Requiere doble actualización con transacción)
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, apellido, email, clave, idRol, idStatus } = req.body;

  logger.warn(`[WARN] Intento de actualizar usuario con ID: ${id}`);

  let transaction; // ✅ declaración global para el scope del handler

  try {
    const pool = await connectDB();
    transaction = new sql.Transaction(pool); // ✅ asignación dentro del try
    await transaction.begin();

    // 1. Obtener el IdEmpleado asociado al IdUsuario
    const userResult = await transaction.request()
      .input('IdUsuario', sql.Int, id)
      .query('SELECT IdEmpleado FROM [dbo].[Usuarios] WHERE IdUsuario = @IdUsuario');

    if (userResult.recordset.length === 0) {
      await transaction.rollback();
      logger.warn(`[WARN] Intento de actualización fallido. Usuario con ID ${id} no encontrado.`);
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const idEmpleado = userResult.recordset[0].IdEmpleado;

    // 2. Actualizar Empleados
    await transaction.request()
      .input('IdEmpleado', sql.Int, idEmpleado)
      .input('Nombre', sql.NVarChar, nombre)
      .input('Apellido', sql.NVarChar, apellido || '')
      .input('Email', sql.NVarChar, email)
      .input('idDepartamento', sql.Int, req.body.idDepartamento)
      .query(`
        UPDATE [dbo].[Empleados]
        SET Nombre = @Nombre, Apellido = @Apellido, Email = @Email, IdDepartamento = @IdDepartamento
        WHERE IdEmpleado = @IdEmpleado
      `);

    // 3. Actualizar Usuarios
    await transaction.request()
      .input('IdUsuario', sql.Int, id)
      .input('Clave', sql.NVarChar, clave)
      .input('IdRol', sql.Int, idRol)
      .input('IdStatus', sql.Int, idStatus)
      .query(`
        UPDATE [dbo].[Usuarios]
        SET Clave = @Clave, IdRol = @IdRol, IdStatus = @IdStatus, FechaModificacion = GETDATE()
        WHERE IdUsuario = @IdUsuario
      `);

    await transaction.commit();
    logger.info(`[INFO] Usuario con ID ${id} actualizado exitosamente.`);
    res.json({ id, nombre, apellido, email, clave, idRol, idStatus });

  } catch (err) {
    if (transaction) { // ✅ ahora transaction existe aunque falle antes
      await transaction.rollback();
    }
    logger.error(`[ERR] Error al actualizar usuario con ID ${id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


// Eliminar usuario, sus módulos y su registro de empleado (transacción triple)
router.delete('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    logger.warn(`[WARN] Intento de eliminar usuario con ID: ${id}`); 

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        // Buscar IdEmpleado antes de borrar el Usuario
        const userResult = await transaction.request()
            .input('IdUsuario', sql.Int, id)
            .query('SELECT IdEmpleado FROM [dbo].[Usuarios] WHERE IdUsuario = @IdUsuario');

        const idEmpleado = userResult.recordset.length > 0 ? userResult.recordset[0].IdEmpleado : null;
        
        // 1. Eliminar módulos asignados
        await transaction.request()
            .input('IdUsuario', sql.Int, id)
            .query('DELETE FROM [dbo].[ModulosPorUsuario] WHERE IdUsuario = @IdUsuario');

        // 2. Eliminar el usuario (registro de acceso)
        await transaction.request()
            .input('IdUsuario', sql.Int, id)
            .query('DELETE FROM [dbo].[Usuarios] WHERE IdUsuario = @IdUsuario');
        
        // 3. Eliminar el registro de empleado asociado (si se encontró IdEmpleado)
        if (idEmpleado) {
            await transaction.request()
                .input('IdEmpleado', sql.Int, idEmpleado)
                .query('DELETE FROM [dbo].[Empleados] WHERE IdEmpleado = @IdEmpleado');
        } else {
             logger.warn(`[WARN] No se encontró IdEmpleado para el usuario ${id}, solo se eliminó de Usuarios.`);
        }

        await transaction.commit();
        logger.info(`[INFO] Usuario con ID ${id} (y su empleado/módulos) eliminados exitosamente.`);
        res.sendStatus(204);

    } catch (err) {
        if (transaction) {
            await transaction.rollback();
        }
        logger.error(`[ERR] Error al eliminar usuario con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});


// GET /departamentos
router.get('/departamentos', async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT IdDepartamento, Nombre FROM [dbo].[Departamento]
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

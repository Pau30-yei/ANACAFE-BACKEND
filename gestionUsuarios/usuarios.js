const express = require('express');
const router = express.Router();
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
    let client;
    try {
        client = await connectDB();
        const result = await client.query(`
             SELECT
                u.idusuario AS "id",
                e.nombre,
                e.apellido,
                e.email AS "email",
                -- Datos del Empleado
                CONCAT(e.nombre, ' ', e.apellido) AS "Nombre", -- Concatenado para la UI
                CONCAT(e.nombre, ' ', e.apellido) AS nombrecompleto,
                e.email AS "Email",
                u.clave AS "clave",
                u.idrol AS "idRol",
                u.idstatus AS "idStatus",
                u.fechacreacion AS "fechaCreacion",
                u.fechamodificacion AS "fechaModificacion",
                u.ensesion AS "enSesion",
                u.idempleado AS "idEmpleado",
                d.iddepartamento AS "IdDepartamento",
                d.nombre AS "NombreDepartamento"
            FROM usuarios AS u
            INNER JOIN empleados AS e ON e.idempleado = u.idempleado
            LEFT JOIN departamento d ON e.iddepartamento = d.iddepartamento 
            order by u.idusuario asc
        `);
        logger.info('[INFO] Usuarios obtenidos exitosamente.');
        res.json(result.rows);
        
    } catch (err) {
        logger.error(`[ERR] Error al obtener usuarios: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// Agregar usuario (Requiere doble inserción con transacción)
router.post('/', async (req, res) => {
    const { nombre, apellido, email, clave, idRol, idStatus, idDepartamento } = req.body;
    logger.info(`[INFO] Intento de agregar nuevo usuario: ${email}`);

    let client;
    try {
        client = await connectDB();
        await client.query('BEGIN');

        // 1. Insertar en Empleados
        const empleadoQuery = `
            INSERT INTO empleados (nombre, apellido, email, iddepartamento) 
            VALUES ($1, $2, $3, $4)
            RETURNING idempleado;
        `;
        const empleadoResult = await client.query(empleadoQuery, [nombre, apellido || '', email, idDepartamento]);
        const newIdEmpleado = empleadoResult.rows[0].idempleado;

        // 2. Insertar en Usuarios
        const usuarioQuery = `
            INSERT INTO usuarios (idempleado, clave, idrol, idstatus, fechacreacion, fechamodificacion, ensesion)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
            RETURNING idusuario;
        `;
        const usuarioResult = await client.query(usuarioQuery, [newIdEmpleado, clave, idRol, idStatus]);
        const newUserId = usuarioResult.rows[0].idusuario;

        await client.query('COMMIT');

        logger.info(`[INFO] Usuario ${email} agregado exitosamente con ID: ${newUserId}.`);
        res.status(201).json({ id: newUserId, idEmpleado: newIdEmpleado, nombre, apellido, email, clave, idRol, idStatus });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        logger.error(`[ERR] Error al agregar usuario ${email}: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// Actualizar usuario (Requiere doble actualización con transacción)
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { nombre, apellido, email, clave, idRol, idStatus, idDepartamento } = req.body;

  logger.warn(`[WARN] Intento de actualizar usuario con ID: ${id}`);

  let client;
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // 1. Obtener el IdEmpleado asociado al IdUsuario
    const userResult = await client.query('SELECT idempleado FROM usuarios WHERE idusuario = $1', [id]);

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn(`[WARN] Intento de actualización fallido. Usuario con ID ${id} no encontrado.`);
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const idEmpleado = userResult.rows[0].idempleado;

    // 2. Actualizar Empleados
    await client.query(
      `UPDATE empleados
       SET nombre = $1, apellido = $2, email = $3, iddepartamento = $4
       WHERE idempleado = $5`,
      [nombre, apellido || '', email, idDepartamento, idEmpleado]
    );

    // 3. Actualizar Usuarios
    await client.query(
      `UPDATE usuarios
       SET clave = $1, idrol = $2, idstatus = $3, fechamodificacion = CURRENT_TIMESTAMP
       WHERE idusuario = $4`,
      [clave, idRol, idStatus, id]
    );

    await client.query('COMMIT');
    logger.info(`[INFO] Usuario con ID ${id} actualizado exitosamente.`);
    res.json({ id, nombre, apellido, email, clave, idRol, idStatus, idDepartamento });

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error(`[ERR] Error al actualizar usuario con ID ${id}: ${err.message}`);
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Eliminar usuario, sus módulos y su registro de empleado (transacción triple)
router.delete('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    logger.warn(`[WARN] Intento de eliminar usuario con ID: ${id}`); 

    let client;
    try {
        client = await connectDB();
        await client.query('BEGIN');

        // Buscar IdEmpleado antes de borrar el Usuario
        const userResult = await client.query('SELECT idempleado FROM usuarios WHERE idusuario = $1', [id]);
        const idEmpleado = userResult.rows.length > 0 ? userResult.rows[0].idempleado : null;
        
        // 1. Eliminar módulos asignados
        await client.query('DELETE FROM modulosporusuario WHERE idusuario = $1', [id]);

        // 2. Eliminar el usuario (registro de acceso)
        await client.query('DELETE FROM usuarios WHERE idusuario = $1', [id]);
        
        // 3. Eliminar el registro de empleado asociado (si se encontró IdEmpleado)
        if (idEmpleado) {
            await client.query('DELETE FROM empleados WHERE idempleado = $1', [idEmpleado]);
        } else {
             logger.warn(`[WARN] No se encontró IdEmpleado para el usuario ${id}, solo se eliminó de Usuarios.`);
        }

        await client.query('COMMIT');
        logger.info(`[INFO] Usuario con ID ${id} (y su empleado/módulos) eliminados exitosamente.`);
        res.sendStatus(204);

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        logger.error(`[ERR] Error al eliminar usuario con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// GET /departamentos
router.get('/departamentos', async (req, res) => {
    let client;
    try {
        client = await connectDB();
        const result = await client.query('SELECT iddepartamento AS "IdDepartamento", nombre AS "Nombre" FROM departamento');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
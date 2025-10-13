// modulos.js
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { connectDB } = require('../database.js');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
    transports: [new winston.transports.Console()],
});

// GET / - Obtener todos los módulos
router.get('/', async (req, res) => {
    logger.info('[INFO] Intento de obtener todos los módulos.');
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT [IdModulo] AS id, [NombreModulo] AS nombre, [Descripcion] AS descripcion
            FROM [dbo].[Modulos]
        `);
        logger.info('[INFO] Módulos obtenidos exitosamente.');
        res.json(result.recordset);
    } catch (err) {
        logger.error(`[ERR] Error al obtener módulos: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// GET /:id - Obtener un módulo por su ID
router.get('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    logger.info(`[INFO] Intento de obtener módulo con ID: ${id}`);
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdModulo', sql.Int, id)
            .query('SELECT [IdModulo] AS id, [NombreModulo] AS nombre, [Descripcion] AS descripcion FROM [dbo].[Modulos] WHERE IdModulo = @IdModulo');
        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Módulo no encontrado.' });
        }
        logger.info(`[INFO] Módulo con ID ${id} obtenido exitosamente.`);
        res.json(result.recordset[0]);
    } catch (err) {
        logger.error(`[ERR] Error al obtener módulo con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// POST / - Crear un nuevo módulo
router.post('/', async (req, res) => {
    const { nombre, descripcion } = req.body;
    logger.info('[INFO] Intento de agregar un nuevo módulo.');
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('NombreModulo', sql.NVarChar(255), nombre)
            .input('Descripcion', sql.NVarChar(sql.MAX), descripcion)
            .query('INSERT INTO [dbo].[Modulos] ([NombreModulo], [Descripcion]) VALUES (@NombreModulo, @Descripcion); SELECT SCOPE_IDENTITY() AS id;');
        const newId = result.recordset[0].id;
        logger.info(`[INFO] Módulo agregado exitosamente con ID: ${newId}`);
        res.status(201).json({ id: newId, nombre, descripcion });
    } catch (err) {
        logger.error(`[ERR] Error al agregar módulo: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id - Actualizar un módulo
router.put('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { nombre, descripcion } = req.body;
    logger.info(`[INFO] Intento de actualizar módulo con ID: ${id}`);
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdModulo', sql.Int, id)
            .input('NombreModulo', sql.NVarChar(255), nombre)
            .input('Descripcion', sql.NVarChar(sql.MAX), descripcion)
            .query('UPDATE [dbo].[Modulos] SET NombreModulo = @NombreModulo, Descripcion = @Descripcion WHERE IdModulo = @IdModulo;');
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Módulo no encontrado.' });
        }
        logger.info(`[INFO] Módulo con ID ${id} actualizado exitosamente.`);
        res.json({ id: id, nombre, descripcion });
    } catch (err) {
        logger.error(`[ERR] Error al actualizar módulo con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /:id - Eliminar un módulo
router.delete('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    logger.info(`[INFO] Intento de eliminar módulo con ID: ${id}`);
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdModulo', sql.Int, id)
            .query('DELETE FROM [dbo].[Modulos] WHERE IdModulo = @IdModulo');
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'Módulo no encontrado.' });
        }
        logger.info(`[INFO] Módulo con ID ${id} eliminado exitosamente.`);
        res.sendStatus(204);
    } catch (err) {
        logger.error(`[ERR] Error al eliminar módulo con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// GET /usuario/:idUsuario/asignados - Obtener módulos asignados a un usuario
router.get('/usuario/:idUsuario/asignados', async (req, res) => {
    const idUsuario = parseInt(req.params.idUsuario);
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('idUsuario', sql.Int, idUsuario)
            .query('SELECT [IdModulo] AS idModulo FROM [dbo].[ModulosPorUsuario] WHERE IdUsuario = @idUsuario');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /asignar/:idUsuario - Asignar módulos a un usuario
router.post('/asignar/:idUsuario', async (req, res) => {
    const idUsuario = parseInt(req.params.idUsuario);
    const { modulos } = req.body;
    if (!Array.isArray(modulos)) {
        return res.status(400).json({ message: 'Se requiere una lista de IDs de módulos.' });
    }
    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        await transaction.request()
            .input('idUsuario', sql.Int, idUsuario)
            .query('DELETE FROM [dbo].[ModulosPorUsuario] WHERE IdUsuario = @idUsuario');
        if (modulos.length > 0) {
            const request = transaction.request();
            request.input('idUsuario', sql.Int, idUsuario); 
            const values = modulos.map(idModulo => `(@idUsuario, ${idModulo})`).join(', ');
            const insertQuery = `INSERT INTO [dbo].[ModulosPorUsuario] (IdUsuario, IdModulo) VALUES ${values};`;
            await request.query(insertQuery);
        }
        await transaction.commit();
        res.status(200).json({ message: 'Módulos asignados correctamente.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
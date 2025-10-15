const express = require('express');
const router = express.Router();
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
    let client;
    try {
        client = await connectDB();
        const result = await client.query(`
           SELECT idmodulo AS id, nombremodulo AS nombre, descripcion
            FROM modulos
            order by idmodulo ASC
        `);
        logger.info('[INFO] Módulos obtenidos exitosamente.');
        res.json(result.rows);
    } catch (err) {
        logger.error(`[ERR] Error al obtener módulos: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// GET /:id - Obtener un módulo por su ID
router.get('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    logger.info(`[INFO] Intento de obtener módulo con ID: ${id}`);
    let client;
    try {
        client = await connectDB();
        const result = await client.query(
            'SELECT idmodulo AS id, nombremodulo AS nombre, descripcion FROM modulos WHERE idmodulo = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Módulo no encontrado.' });
        }
        logger.info(`[INFO] Módulo con ID ${id} obtenido exitosamente.`);
        res.json(result.rows[0]);
    } catch (err) {
        logger.error(`[ERR] Error al obtener módulo con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// POST / - Crear un nuevo módulo
router.post('/', async (req, res) => {
    const { nombre, descripcion } = req.body;
    logger.info('[INFO] Intento de agregar un nuevo módulo.');
    let client;
    try {
        client = await connectDB();
        const result = await client.query(
            'INSERT INTO modulos (nombremodulo, descripcion) VALUES ($1, $2) RETURNING idmodulo AS id',
            [nombre, descripcion]
        );
        const newId = result.rows[0].id;
        logger.info(`[INFO] Módulo agregado exitosamente con ID: ${newId}`);
        res.status(201).json({ id: newId, nombre, descripcion });
    } catch (err) {
        logger.error(`[ERR] Error al agregar módulo: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// PUT /:id - Actualizar un módulo
router.put('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { nombre, descripcion } = req.body;
    logger.info(`[INFO] Intento de actualizar módulo con ID: ${id}`);
    let client;
    try {
        client = await connectDB();
        const result = await client.query(
            'UPDATE modulos SET nombremodulo = $1, descripcion = $2 WHERE idmodulo = $3',
            [nombre, descripcion, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Módulo no encontrado.' });
        }
        logger.info(`[INFO] Módulo con ID ${id} actualizado exitosamente.`);
        res.json({ id: id, nombre, descripcion });
    } catch (err) {
        logger.error(`[ERR] Error al actualizar módulo con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// DELETE /:id - Eliminar un módulo
router.delete('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    logger.info(`[INFO] Intento de eliminar módulo con ID: ${id}`);
    let client;
    try {
        client = await connectDB();
        const result = await client.query('DELETE FROM modulos WHERE idmodulo = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Módulo no encontrado.' });
        }
        logger.info(`[INFO] Módulo con ID ${id} eliminado exitosamente.`);
        res.sendStatus(204);
    } catch (err) {
        logger.error(`[ERR] Error al eliminar módulo con ID ${id}: ${err.message}`);
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// GET /usuario/:idUsuario/asignados - Obtener módulos asignados a un usuario
router.get('/usuario/:idUsuario/asignados', async (req, res) => {
    const idUsuario = parseInt(req.params.idUsuario);
    let client;
    try {
        client = await connectDB();
        const result = await client.query(
            'SELECT idmodulo AS "idModulo" FROM modulosporusuario WHERE idusuario = $1',
            [idUsuario]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// POST /asignar/:idUsuario - Asignar módulos a un usuario
router.post('/asignar/:idUsuario', async (req, res) => {
    const idUsuario = parseInt(req.params.idUsuario);
    const { modulos } = req.body;
    if (!Array.isArray(modulos)) {
        return res.status(400).json({ message: 'Se requiere una lista de IDs de módulos.' });
    }
    let client;
    try {
        client = await connectDB();
        await client.query('BEGIN');

        // Eliminar módulos actuales
        await client.query('DELETE FROM modulosporusuario WHERE idusuario = $1', [idUsuario]);

        // Insertar nuevos módulos
        if (modulos.length > 0) {
            const values = modulos.map((idModulo, index) => `($1, $${index + 2})`).join(', ');
            const query = `INSERT INTO modulosporusuario (idusuario, idmodulo) VALUES ${values}`;
            await client.query(query, [idUsuario, ...modulos]);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Módulos asignados correctamente.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
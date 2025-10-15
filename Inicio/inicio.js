const express = require('express');
const router = express.Router();
const { connectDB } = require('../database.js');

// Endpoint para obtener la información del usuario
router.get('/infouser', async (req, res) => {
    let client;
    try {
        const idUsuario = req.query.id;  
        console.log(`[INFO] Petición recibida en /infouser con idUsuario = ${idUsuario}`);

        if (!idUsuario) {
            console.warn('[WARN] No se recibió idUsuario en la query');
            return res.status(400).json({ message: 'Se requiere un id de usuario.' });
        }

        console.log('[INFO] Conectando a la base de datos...');
        client = await connectDB();
        console.log('[INFO] Conexión a la base de datos establecida.');

        // Usar tu función específica ObtenerRolesDeUsuario
        console.log(`[INFO] Ejecutando función ObtenerRolesDeUsuario con IdUsuario = ${idUsuario}`);
        const result = await client.query('SELECT * FROM ObtenerRolesDeUsuario($1)', [idUsuario]);
        console.log('[INFO] Función ejecutada correctamente.');
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log('[INFO] Usuario encontrado:', user);

            // Obtener módulos del usuario usando tu función específica
            console.log(`[INFO] Ejecutando función sp_ModulosPorUsuario con IdUsuario = ${idUsuario}`);
            const resultModulos = await client.query(
                'SELECT * FROM sp_modulosporusuario($1)',
                [idUsuario]
            );
            console.log('[INFO] Función sp_ModulosPorUsuario ejecutada correctamente.');

            const modulos = resultModulos.rows.map(m => m.idmodulo);
            console.log('[INFO] IDs de módulos asignados al usuario:', modulos);

            // Devuelve rol + módulos
            res.json({
                idUsuario: user.idusuario,
                nombre: user.nombre, 
                rol: user.nombrerol,
                email: user.email,
                modulos
            });
        } else {
            console.warn(`[WARN] No se encontró usuario con idUsuario = ${idUsuario}`);
            res.status(404).json({ message: 'Usuario no encontrado.' });
        }
    } catch (err) {
        console.error('[ERROR] Ocurrió un error:', err);
        res.status(500).json({ message: 'Error interno del servidor.' });
    } finally {
        if (client) {
            console.log('[INFO] Cerrando conexión a la base de datos.');
            client.release();
        }
    }
});

module.exports = router;
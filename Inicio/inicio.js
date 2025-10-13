const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { connectDB } = require('../database.js');

// Endpoint para obtener la información del usuario
router.get('/infouser', async (req, res) => {
    let pool;
    try {
        // Se asume que el idUsuario viene de la query string (e.g., /infouser?id=1)
        const idUsuario = req.query.id;  
        console.log(`[INFO] Petición recibida en /infouser con idUsuario = ${idUsuario}`);

        if (!idUsuario) {
            console.warn('[WARN] No se recibió idUsuario en la query');
            return res.status(400).json({ message: 'Se requiere un id de usuario.' });
        }

        console.log('[INFO] Conectando a la base de datos...');
        pool = await connectDB();
        console.log('[INFO] Conexión a la base de datos establecida.');

        const request = pool.request();
        request.input('IdUsuario', sql.Int, idUsuario);
        
        // Ejecución del SP que ya devuelve Nombre
        console.log(`[INFO] Ejecutando procedimiento almacenado ObtenerRolesDeUsuario con IdUsuario = ${idUsuario}`);
        const result = await request.execute('ObtenerRolesDeUsuario');
        console.log('[INFO] Procedimiento ejecutado correctamente.');
        console.log('[DEBUG] Result completo:', JSON.stringify(result, null, 2));

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            // user ahora contiene Nombre, NombreRol, Email, etc.
            console.log('[INFO] Usuario encontrado:', user);

            // Obtener módulos del usuario
            console.log(`[INFO] Ejecutando procedimiento almacenado sp_ModulosPorUsuario con IdUsuario = ${idUsuario}`);
            const resultModulos = await pool.request()
                .input('IdUsuario', sql.Int, idUsuario)
                .execute('sp_ModulosPorUsuario');
            console.log('[INFO] Procedimiento sp_ModulosPorUsuario ejecutado correctamente.');
            console.log('[DEBUG] Modulos encontrados:', JSON.stringify(resultModulos.recordset, null, 2));

            const modulos = resultModulos.recordset.map(m => m.IdModulo);
            console.log('[INFO] IDs de módulos asignados al usuario:', modulos);

            // Devuelve rol + módulos
            res.json({
                idUsuario: user.IdUsuario,
                // CAMBIO CLAVE: Ahora se usa el campo Nombre devuelto por el SP
                nombre: user.Nombre, 
                rol: user.NombreRol,
                email: user.Email,
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
        if (pool) {
            console.log('[INFO] Cerrando conexión a la base de datos.');
            // pool.close(); // Comentar o manejar si la función connectDB ya gestiona la conexión pooling
        }
    }
});

module.exports = router;

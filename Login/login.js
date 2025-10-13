const express = require('express');
const router = express.Router();
const sql = require('mssql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Conexión a SQL Server
const { connectDB } = require('../database.js');

// Clave secreta para JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Función auxiliar para registrar historial
async function registrarHistorial(pool, idUsuario, idTipoLogin, idMotivo) {
    try {
        console.log("Registrando historial:", { idUsuario, idTipoLogin, idMotivo });
        await pool.request()
            .input('IdUsuario', sql.Int, idUsuario)
            .input('IdTipoLogin', sql.Int, idTipoLogin)
            .input('IdMotivo', sql.Int, idMotivo)
            .execute('sp_RegistrarHistorial');
    } catch (err) {
        console.error('Error al registrar historial:', err);
    }
}

// ================== LOGIN ==================
router.post('/', async (req, res) => {
    const { email, clave } = req.body;
    console.log("Intento de login con:", { email, clave });

    try {
        const pool = await connectDB();

        // Buscar usuario
        const result = await pool.request()
            .input('Email', sql.NVarChar, email)
            .execute('sp_BuscarUsuarioPorEmail');

        console.log("Resultado de sp_BuscarUsuarioPorEmail:", result.recordset);

        const user = result.recordset[0];

        if (!user) {
            console.log("Usuario no encontrado:", email);
            await registrarHistorial(pool, 0, 2, 2);
            return res.status(400).json({ message: 'Usuario no encontrado' });
        }

        console.log(" Usuario encontrado:", user);

        if (user.IdStatus === 3) {
            console.log(" Usuario bloqueado:", user.IdUsuario);
            await registrarHistorial(pool, user.IdUsuario, 2, 4);
            return res.status(403).json({ message: 'Usuario bloqueado' });
        }

        // Validar contraseña
        let validPassword = false;
        if (user.Clave && user.Clave.startsWith('$2b$')) {
            validPassword = await bcrypt.compare(clave, user.Clave);
            console.log("Comparando hash bcrypt:", validPassword);
        } else {
            validPassword = (clave === user.Clave);
            console.log("Comparando clave en texto plano:", validPassword);
            if (validPassword) {
                const hashedPassword = await bcrypt.hash(clave, 10);
                console.log(" Guardando clave hasheada en BD:", hashedPassword);
                await pool.request()
                    .input('IdUsuario', sql.Int, user.IdUsuario)
                    .input('Clave', sql.NVarChar, hashedPassword)
                    .execute('sp_ActualizarClave');
            }
        }

        if (!validPassword) {
            console.log("Contraseña incorrecta para usuario:", user.IdUsuario);
            await registrarHistorial(pool, user.IdUsuario, 2, 1);

            const fallosResult = await pool.request()
                .input('IdUsuario', sql.Int, user.IdUsuario)
                .execute('sp_ContarFallos');

            const fallos = fallosResult.recordset[0].Fallos;
            console.log(`Usuario ${user.IdUsuario} lleva ${fallos} intentos fallidos`);

            if (fallos >= 3) {
                console.log(`Usuario ${user.IdUsuario} bloqueado por múltiples intentos`);
                await pool.request()
                    .input('IdUsuario', sql.Int, user.IdUsuario)
                    .execute('sp_BloquearUsuario');
                return res.status(403).json({ message: 'Usuario bloqueado por múltiples intentos fallidos' });
            }

            return res.status(400).json({ message: `Contraseña incorrecta. Intentos fallidos: ${fallos}` });
        }

        // Resetear fallos
        console.log(`Reseteando fallos de usuario ${user.IdUsuario}`);
        await pool.request()
            .input('IdUsuario', sql.Int, user.IdUsuario)
            .execute('sp_ResetearFallos');

        // Revisar si ya está en sesión
        if (user.EnSesion) {
            console.log(`Usuario ${user.IdUsuario} ya tiene sesión activa`);
            return res.status(403).json({ message: 'Ya hay una sesión activa. Cierre sesión anterior para continuar.' });
        }

        // Marcar como en sesión
        console.log(`Marcando usuario ${user.IdUsuario} como EnSesion = true`);
        await pool.request()
            .input('IdUsuario', sql.Int, user.IdUsuario)
            .input('EnSesion', sql.Bit, true)
            .execute('sp_ActualizarSesion');

        // Obtener módulos
        const modulosResult = await pool.request()
            .input('IdUsuario', sql.Int, user.IdUsuario)
            .execute('sp_ModulosPorUsuario');
        //Muestra los nombres de los modulos
        /*const modulos = modulosResult.recordset.map(m => m.NombreModulo);
        console.log(`Módulos asignados a ${user.IdUsuario}:`, modulos);*/

        //  IDs de los modulos
        const modulos = modulosResult.recordset.map(m => m.IdModulo);

        console.log(`Módulos asignados a ${user.IdUsuario}:`, modulos);

        // Generar token
        const token = jwt.sign({
            idUsuario: user.IdUsuario,
            nombre: user.Nombre,
            idRol: user.IdRol,
            email: user.Email,
            modulos
        }, JWT_SECRET, { expiresIn: '8h' });

        console.log(`Token JWT generado para ${user.IdUsuario}`);

        // Registrar login
        await registrarHistorial(pool, user.IdUsuario, 1, 1);

        return res.json({
            message: 'Login exitoso',
            user: {
                id: user.IdUsuario,
                nombre: user.Nombre,
                rol: user.IdRol,
                email: user.Email,
                modulos
            },
            token
        });

    } catch (err) {
        console.error('ERROR EN LOGIN:', err);
        return res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
    }
});

// ================== LOGOUT ==================
router.post('/logout', async (req, res) => {
    const { idUsuario } = req.body;
    console.log("Logout solicitado para usuario:", idUsuario);

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdUsuario', sql.Int, idUsuario)
            .input('EnSesion', sql.Bit, false)
            .execute('sp_ActualizarSesion');

        console.log("Resultado de sp_ActualizarSesion:", result);

        res.json({ message: 'Sesión cerrada correctamente' });
    } catch (err) {
        console.error('ERROR EN LOGOUT:', err);
        res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
    }
});

// ================== Middleware ==================
function validarModulo(modulosPermitidos) {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            console.log("No se envió Authorization Header");
            return res.status(401).json({ message: 'Token no proporcionado' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log("No se envió token válido");
            return res.status(401).json({ message: 'Token inválido' });
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            console.log("Token decodificado:", decoded);

            const tieneModulo = decoded.modulos.some(mod => modulosPermitidos.includes(mod));
            if (!tieneModulo) {
                console.log(`Usuario ${decoded.idUsuario} no tiene permiso para módulos:`, modulosPermitidos);
                return res.status(403).json({ message: 'No tiene permiso para este módulo' });
            }

            console.log(`Usuario ${decoded.idUsuario} autorizado para módulo(s):`, modulosPermitidos);
            req.usuario = decoded;
            next();
        } catch (err) {
            console.error("Token inválido o expirado:", err.message);
            return res.status(401).json({ message: 'Token inválido o expirado' });
        }
    };
}

// ================== Ruta protegida ==================
router.get('/reservas', validarModulo(['reservas']), (req, res) => {
    console.log(`Acceso concedido al módulo de reservas para usuario:`, req.usuario);
    res.json({ message: `Bienvenido ${req.usuario.nombre} al módulo de reservas` });
});

module.exports = router;

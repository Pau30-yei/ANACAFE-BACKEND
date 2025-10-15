const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Conexión a PostgreSQL
const { connectDB } = require('../database.js');

// Clave secreta para JWT
const JWT_SECRET = process.env.JWT_SECRET;

// Función auxiliar para registrar historial
async function registrarHistorial(client, idUsuario, idTipoLogin, idMotivo) {
    try {
        console.log("Registrando historial:", { idUsuario, idTipoLogin, idMotivo });
        await client.query(
            'SELECT sp_registrarhistorial($1, $2, $3)',
            [idUsuario, idTipoLogin, idMotivo]
        );
    } catch (err) {
        console.error('Error al registrar historial:', err);
    }
}

// ================== LOGIN ==================
router.post('/', async (req, res) => {
    const { email, clave } = req.body;
    console.log("Intento de login con:", { email, clave });

    let client;
    try {
        client = await connectDB();

        // Buscar usuario usando tu función específica
        const result = await client.query(
            'SELECT * FROM sp_buscarusuarioporemail($1)',
            [email]
        );

        console.log("Resultado de sp_buscarusuarioporemail:", result.rows);

        const user = result.rows[0];

        if (!user) {
            console.log("Usuario no encontrado:", email);
            await registrarHistorial(client, 0, 2, 2);
            return res.status(400).json({ message: 'Usuario no encontrado' });
        }

        console.log("Usuario encontrado:", user);

        if (user.idstatus === 3) {
            console.log("Usuario bloqueado:", user.idusuario);
            await registrarHistorial(client, user.idusuario, 2, 4);
            return res.status(403).json({ message: 'Usuario bloqueado' });
        }

        // Validar contraseña
        let validPassword = false;
        if (user.clave && user.clave.startsWith('$2b$')) {
            validPassword = await bcrypt.compare(clave, user.clave);
            console.log("Comparando hash bcrypt:", validPassword);
        } else {
            validPassword = (clave === user.clave);
            console.log("Comparando clave en texto plano:", validPassword);
            if (validPassword) {
                const hashedPassword = await bcrypt.hash(clave, 10);
                console.log("Guardando clave hasheada en BD:", hashedPassword);
                await client.query(
                    'SELECT sp_actualizarclave($1, $2)',
                    [user.idusuario, hashedPassword]
                );
            }
        }

        if (!validPassword) {
            console.log("Contraseña incorrecta para usuario:", user.idusuario);
            await registrarHistorial(client, user.idusuario, 2, 1);

            const fallosResult = await client.query(
                'SELECT * FROM sp_contarfallos($1)',
                [user.idusuario]
            );

            const fallos = fallosResult.rows[0].fallos;
            console.log(`Usuario ${user.idusuario} lleva ${fallos} intentos fallidos`);

            if (fallos >= 3) {
                console.log(`Usuario ${user.idusuario} bloqueado por múltiples intentos`);
                await client.query(
                    'SELECT sp_bloquearusuario($1)',
                    [user.idusuario]
                );
                return res.status(403).json({ message: 'Usuario bloqueado por múltiples intentos fallidos' });
            }

            return res.status(400).json({ message: `Contraseña incorrecta. Intentos fallidos: ${fallos}` });
        }

        // Resetear fallos
        console.log(`Reseteando fallos de usuario ${user.idusuario}`);
        await client.query(
            'SELECT sp_resetearfallos($1)',
            [user.idusuario]
        );

        // Revisar si ya está en sesión
        if (user.ensesion) {
            console.log(`Usuario ${user.idusuario} ya tiene sesión activa`);
            return res.status(403).json({ message: 'Ya hay una sesión activa. Cierre sesión anterior para continuar.' });
        }

        // Marcar como en sesión
        console.log(`Marcando usuario ${user.idusuario} como EnSesion = true`);
        await client.query(
            'SELECT sp_actualizarsesion($1, $2)',
            [user.idusuario, true]
        );

        // Obtener módulos usando tu función específica
        const modulosResult = await client.query(
            'SELECT * FROM sp_modulosporusuario($1)',
            [user.idusuario]
        );

        // IDs de los módulos
        const modulos = modulosResult.rows.map(m => m.idmodulo);
        console.log(`Módulos asignados a ${user.idusuario}:`, modulos);

        // Generar token
        const token = jwt.sign({
            idUsuario: user.idusuario,
            nombre: user.nombre,
            idRol: user.idrol,
            email: user.email,
            modulos
        }, JWT_SECRET, { expiresIn: '8h' });

        console.log(`Token JWT generado para ${user.idusuario}`);

        // Registrar login exitoso
        await registrarHistorial(client, user.idusuario, 1, 1);

        return res.json({
            message: 'Login exitoso',
            user: {
                id: user.idusuario,
                nombre: user.nombre,
                rol: user.idrol,
                email: user.email,
                modulos
            },
            token
        });

    } catch (err) {
        console.error('ERROR EN LOGIN:', err);
        return res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
    } finally {
        if (client) {
            client.release();
        }
    }
});

// ================== LOGOUT ==================
router.post('/logout', async (req, res) => {
    const { idUsuario } = req.body;
    console.log("Logout solicitado para usuario:", idUsuario);

    let client;
    try {
        client = await connectDB();
        await client.query(
            'SELECT sp_actualizarsesion($1, $2)',
            [idUsuario, false]
        );

        res.json({ message: 'Sesión cerrada correctamente' });
    } catch (err) {
        console.error('ERROR EN LOGOUT:', err);
        res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
    } finally {
        if (client) {
            client.release();
        }
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
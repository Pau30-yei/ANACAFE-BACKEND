const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { connectDB } = require('../database.js'); 
const winston = require('winston'); 

// (Asumiendo que tienes configurado Winston como en 'usuarios.js')
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'appPilotos.log' }) 
    ],
});
// **********************************************
// * CRUD PARA [dbo].[AsignacionesVehiculos] *
// **********************************************

// 1. OBTENER TODAS LAS ASIGNACIONES (READ)
router.get('/', async (req, res) => {
    logger.info('[INFO] Intento de obtener todas las asignaciones.');
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT 
                A.IdAsignacion AS id,
                A.IdVehiculo,
                V.Placa AS placa,
                V.Marca AS marcaVehiculo,
                V.Modelo AS modeloVehiculo,
                A.IdPiloto,
                E.Nombre + ' ' + E.Apellido AS nombrePiloto,
                A.FechaInicio,
                A.OdometroSalida,
                A.FechaFin,
                A.OdometroEntrada,
                A.Observaciones
            FROM [dbo].[AsignacionesVehiculos] AS A
            INNER JOIN [dbo].[Vehiculos] AS V ON V.IdVehiculo = A.IdVehiculo
            INNER JOIN [dbo].[Empleados] AS E ON E.IdEmpleado = A.IdPiloto
            ORDER BY A.FechaInicio DESC;
        `);
        logger.info('[INFO] Asignaciones obtenidas exitosamente.');
        res.json(result.recordset);
    } catch (err) {
        logger.error(`[ERR] Error al obtener asignaciones: ${err.message}`);
        res.status(500).json({ error: 'Error al obtener asignaciones de la BD.' });
    }
});

// 2. CREAR NUEVA ASIGNACIÓN (CREATE)
router.post('/', async (req, res) => {
    const { IdVehiculo, IdPiloto, FechaInicio, OdometroSalida, FechaFin, OdometroEntrada, Observaciones } = req.body;
    logger.info(`[INFO] Intentando crear asignación para Piloto: ${IdPiloto}`);

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdVehiculo', sql.Int, IdVehiculo)
            .input('IdPiloto', sql.Int, IdPiloto)
            .input('FechaInicio', sql.Date, FechaInicio)
            .input('OdometroSalida', sql.Int, OdometroSalida)
            .input('FechaFin', sql.Date, FechaFin || null) 
            .input('OdometroEntrada', sql.Int, OdometroEntrada || null) 
            .input('Observaciones', sql.NVarChar(255), Observaciones || null) 
            .query(`
                INSERT INTO [dbo].[AsignacionesVehiculos] (IdVehiculo, IdPiloto, FechaInicio, OdometroSalida, FechaFin, OdometroEntrada, Observaciones)
                VALUES (@IdVehiculo, @IdPiloto, @FechaInicio, @OdometroSalida, @FechaFin, @OdometroEntrada, @Observaciones);
                SELECT SCOPE_IDENTITY() AS id;
            `);
            
        const newId = result.recordset[0].id;
        logger.info(`[INFO] Asignación ${newId} creada.`);
        res.status(201).json({ id: newId, ...req.body });

    } catch (err) {
        logger.error(`[ERR] Error al crear asignación: ${err.message}`);
        res.status(500).json({ error: 'Error al crear la asignación.' });
    }
});

// 3. ACTUALIZAR ASIGNACIÓN (UPDATE)
router.put('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { IdVehiculo, IdPiloto, FechaInicio, OdometroSalida, FechaFin, OdometroEntrada, Observaciones } = req.body;

    logger.warn(`[WARN] Intentando actualizar asignación ID: ${id}`);

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdAsignacion', sql.Int, id)
            .input('IdVehiculo', sql.Int, IdVehiculo)
            .input('IdPiloto', sql.Int, IdPiloto)
            .input('FechaInicio', sql.Date, FechaInicio)
            .input('OdometroSalida', sql.Int, OdometroSalida)
            .input('FechaFin', sql.Date, FechaFin || null) 
            .input('OdometroEntrada', sql.Int, OdometroEntrada || null) 
            .input('Observaciones', sql.NVarChar(255), Observaciones || null) 
            .query(`
                UPDATE [dbo].[AsignacionesVehiculos]
                SET 
                    IdVehiculo = @IdVehiculo, 
                    IdPiloto = @IdPiloto, 
                    FechaInicio = @FechaInicio, 
                    OdometroSalida = @OdometroSalida, 
                    FechaFin = @FechaFin, 
                    OdometroEntrada = @OdometroEntrada,
                    Observaciones = @Observaciones
                WHERE IdAsignacion = @IdAsignacion
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada.' });
        }

        logger.info(`[INFO] Asignación ID ${id} actualizada.`);
        res.json({ id, ...req.body });

    } catch (err) {
        logger.error(`[ERR] Error al actualizar asignación ID ${id}: ${err.message}`);
        res.status(500).json({ error: 'Error al actualizar la asignación.' });
    }
});

// 4. ELIMINAR ASIGNACIÓN (DELETE)
router.delete('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    logger.warn(`[WARN] Intentando eliminar asignación ID: ${id}`); 

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdAsignacion', sql.Int, id)
            .query('DELETE FROM [dbo].[AsignacionesVehiculos] WHERE IdAsignacion = @IdAsignacion');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Asignación no encontrada.' });
        }

        logger.info(`[INFO] Asignación ID ${id} eliminada.`);
        res.sendStatus(204); // No Content

    } catch (err) {
        logger.error(`[ERR] Error al eliminar asignación ID ${id}: ${err.message}`);
        res.status(500).json({ error: 'Error al eliminar la asignación.' });
    }
});


// **********************************************
// * RUTAS DE SOPORTE (PILOTOS Y VEHÍCULOS) *
// **********************************************

// Obtener Pilotos (Empleados del departamento 'Pilotos')
router.get('/pilotos/disponibles', async (req, res) => {
    const ID_DEPARTAMENTO_PILOTOS = 3; 

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('IdDepartamento', sql.Int, ID_DEPARTAMENTO_PILOTOS)
            .query(`
                SELECT 
                    IdEmpleado AS id, 
                    Nombre + ' ' + Apellido AS nombreCompleto
                FROM [dbo].[Empleados] 
                WHERE IdDepartamento = @IdDepartamento
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener Vehículos (Todos, o idealmente solo los no asignados actualmente)
router.get('/vehiculos/disponibles', async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT 
                IdVehiculo AS id, 
                Placa, 
                Marca, 
                Modelo
            FROM [dbo].[Vehiculos]
            WHERE Activo = 1 
            -- (Opcional: Agregar lógica para filtrar vehículos ya asignados con FechaFin IS NULL)
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
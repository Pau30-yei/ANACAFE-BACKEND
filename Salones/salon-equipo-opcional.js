const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

const logger = {
  info: (msg, meta = "") => console.log(`INFO: ${msg}`, meta),
  warn: (msg, meta = "") => console.warn(`WARN: ${msg}`, meta),
  error: (msg, meta = "") => console.error(`ERROR: ${msg}`, meta),
};

// ================================
// GET equipos opcionales por salón
// ================================
router.get("/salon/:idSalon", async (req, res) => {
  const { idSalon } = req.params;
  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("idSalon", sql.Int, idSalon)
      .query(`
        SELECT 
            seo.Id,
            seo.IdSalon,
            s.Nombre AS NombreSalon,
            seo.IdEquipo AS IdEquipo, -- Mapeo a IdEquipo para el frontend
            eo.Nombre AS NombreEquipoOpcional,
            seo.Nota
        FROM SalonEquipoOpcional seo
        LEFT JOIN EquipoOpcional eo ON seo.IdEquipo = eo.IdEquipo
        LEFT JOIN Salones s ON seo.IdSalon = s.IdSalon
        WHERE seo.IdSalon = @idSalon
        ORDER BY seo.Id
      `);

    res.json(result.recordset);
  } catch (err) {
    logger.error("Error al obtener equipos de salón", err);
    res.status(500).json({ message: "Error del servidor al obtener equipos de salón." });
  }
});

// ----------------------------------------------------

// ===============================
// POST agregar equipo a salón (Con validación de duplicidad)
// ===============================
router.post("/", async (req, res) => {
  // Nota: IdEquipo de la petición Angular mapea a IdEquipo en la DB
  const { IdSalon, IdEquipo, Nota } = req.body; 
  
  if (!IdSalon || !IdEquipo) {
    logger.warn("IdSalon o IdEquipo faltante en la solicitud", req.body);
    return res.status(400).json({ message: "IdSalon y IdEquipo son campos requeridos." });
  }

  try {
    const pool = await connectDB();
    
    // 1. VALIDACIÓN DE DUPLICIDAD
    const check = await pool.request()
        .input("IdSalon", sql.Int, IdSalon)
        .input("IdEquipo", sql.Int, IdEquipo)
        .query(`SELECT COUNT(*) AS total FROM SalonEquipoOpcional 
                WHERE IdSalon = @IdSalon AND IdEquipo = @IdEquipo`);
    
    if (check.recordset[0].total > 0) {
        logger.warn("Intento de asignar equipo duplicado", { IdSalon, IdEquipo });
        // Código 409: Conflict
        return res.status(409).json({ message: "Este equipo ya está asignado a este salón." }); 
    }

    // 2. INSERCIÓN
    const result = await pool.request()
      .input("IdSalon", sql.Int, IdSalon)
      .input("IdEquipo", sql.Int, IdEquipo) // Uso IdEquipo para la columna real de la DB
      .input("Nota", sql.NVarChar(255), Nota || null) 
      .query(`
        INSERT INTO SalonEquipoOpcional (IdSalon, IdEquipo, Nota)
        VALUES (@IdSalon, @IdEquipo, @Nota);
        -- Devolver el registro recién insertado
        SELECT Id, IdSalon, @IdEquipo AS IdEquipo, Nota FROM SalonEquipoOpcional WHERE Id = SCOPE_IDENTITY();
      `);

    logger.info("Equipo de salón agregado correctamente", { IdSalon, IdEquipo });
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    logger.error("Error al agregar equipo de salón", err);
    res.status(500).json({ message: "Error del servidor al agregar el equipo de salón." });
  }
});

// ----------------------------------------------------

// ===============================
// PUT actualizar relación SalonEquipoOpcional (Con validación de duplicidad excluyendo el registro actual)
// ===============================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  // Nota: IdEquipo de la petición Angular mapea a IdEquipo en la DB
  const { IdSalon, IdEquipo, Nota } = req.body; 

  if (!id || isNaN(parseInt(id)) || !IdEquipo || !IdSalon) {
    logger.warn("Datos inválidos en la solicitud de actualización", req.body);
    return res.status(400).json({ message: "Datos de relación incompletos o inválidos." });
  }

  try {
    const pool = await connectDB();
    
    // 1. VALIDACIÓN DE DUPLICIDAD en UPDATE:
    // Busca duplicados con el mismo IdSalon e IdEquipo, EXCLUYENDO el ID del registro actual.
    const check = await pool.request()
        .input("IdSalon", sql.Int, IdSalon)
        .input("IdEquipo", sql.Int, IdEquipo)
        .input("idRelacionActual", sql.Int, id) 
        .query(`
            SELECT COUNT(*) AS total FROM SalonEquipoOpcional 
            WHERE IdSalon = @IdSalon 
            AND IdEquipo = @IdEquipo 
            AND Id <> @idRelacionActual
        `); 
    
    if (check.recordset[0].total > 0) {
        logger.warn("Intento de asignar equipo duplicado en edición", { id, IdSalon, IdEquipo });
        // Código 409: Conflict
        return res.status(409).json({ message: "No se puede cambiar a este equipo, ya está asignado a este salón por otra relación." }); 
    }

    // 2. ACTUALIZACIÓN DE LA RELACIÓN
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("IdEquipo", sql.Int, IdEquipo) // Uso IdEquipo para la columna real de la DB
      .input("Nota", sql.NVarChar(255), Nota || null)
      .query(`
        UPDATE SalonEquipoOpcional
        SET 
            IdEquipo = @IdEquipo,
            Nota = @Nota
        WHERE Id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      logger.warn("Relación SalonEquipoOpcional no encontrada al actualizar", { id });
      return res.status(404).json({ message: "Relación SalonEquipoOpcional no encontrada." });
    }

    logger.info("Equipo de salón actualizado correctamente", { id, IdEquipo });
    res.json({ message: "Equipo de salón actualizado correctamente." });
  } catch (err) {
    logger.error("Error al actualizar equipo de salón", err);
    res.status(500).json({ message: "Error del servidor al actualizar el equipo de salón." });
  }
});

// ----------------------------------------------------

// ================================
// DELETE eliminar relación SalonEquipoOpcional
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    logger.warn("ID de SalonEquipoOpcional inválido para eliminación", { id });
    return res.status(400).json({ message: "ID de SalonEquipoOpcional requerido y debe ser un número." });
  }

  try {
    logger.info("Eliminando equipo de salón", { id });

    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM SalonEquipoOpcional WHERE Id = @id");

    if (result.rowsAffected[0] === 0) {
      logger.warn("Relación SalonEquipoOpcional no encontrada al eliminar", { id });
      return res.status(404).json({ message: "Relación SalonEquipoOpcional no encontrada." });
    }

    logger.info("Equipo de salón eliminado correctamente", { id });
    res.json({ message: "Equipo de salón eliminado correctamente." });
  } catch (err) {
    logger.error("Error al eliminar equipo de salón", err);
    res.status(500).json({ message: "Error del servidor al eliminar el equipo de salón." });
  }
});

module.exports = router;
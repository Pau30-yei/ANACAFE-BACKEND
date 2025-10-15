const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

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
  let client;
  try {
    client = await connectDB();
const result = await client.query(`
        SELECT 
            seo.id as "Id",
            seo.idsalon as "IdSalon",
            s.nombre as "NombreSalon",
            seo.idequipo as "IdEquipo",
            eo.nombre as "NombreEquipoOpcional",
            seo.nota as "Nota"
        FROM salonequipoopcional seo
        LEFT JOIN equipoopcional eo ON seo.idequipo = eo.idequipo
        LEFT JOIN salones s ON seo.idsalon = s.idsalon
        WHERE seo.idsalon = $1
        ORDER BY seo.id
      `, [idSalon]);

    res.json(result.rows);
  } catch (err) {
    logger.error("Error al obtener equipos de salón", err);
    res.status(500).json({ message: "Error del servidor al obtener equipos de salón." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    
    // 1. VALIDACIÓN DE DUPLICIDAD
    const check = await client.query(
        `SELECT COUNT(*) AS total FROM salonequipoopcional 
                WHERE idsalon = $1 AND idequipo = $2`, 
        [IdSalon, IdEquipo]);
    
    if (parseInt(check.rows[0].total) > 0) {
        logger.warn("Intento de asignar equipo duplicado", { IdSalon, IdEquipo });
        // Código 409: Conflict
        return res.status(409).json({ message: "Este equipo ya está asignado a este salón." }); 
    }

    // 2. INSERCIÓN
    const result = await client.query(
      `INSERT INTO salonequipoopcional (idsalon, idequipo, nota)
        VALUES ($1, $2, $3) RETURNING id, idsalon, idequipo, nota`,
      [IdSalon, IdEquipo, Nota]
    );

    logger.info("Equipo de salón agregado correctamente", { IdSalon, IdEquipo });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error("Error al agregar equipo de salón", err);
    res.status(500).json({ message: "Error del servidor al agregar el equipo de salón." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    
    // 1. VALIDACIÓN DE DUPLICIDAD en UPDATE:
    // Busca duplicados con el mismo IdSalon e IdEquipo, EXCLUYENDO el ID del registro actual.
    const check = await client.query(
        `SELECT COUNT(*) AS total FROM salonequipoopcional 
            WHERE idsalon = $1 
            AND idequipo = $2 
            AND id <> $3`,
        [IdSalon, IdEquipo, id]
    ); 
    
    if (parseInt(check.rows[0].total) > 0) {
        logger.warn("Intento de asignar equipo duplicado en edición", { id, IdSalon, IdEquipo });
        // Código 409: Conflict
        return res.status(409).json({ message: "No se puede cambiar a este equipo, ya está asignado a este salón por otra relación." }); 
    }

    // 2. ACTUALIZACIÓN DE LA RELACIÓN
    const result = await client.query(
      `UPDATE salonequipoopcional
        SET 
            idequipo = $1,
            nota = $2
        WHERE id = $3`,
      [IdEquipo, Nota, id]
    );

    if (result.rowCount === 0) {
      logger.warn("Relación SalonEquipoOpcional no encontrada al actualizar", { id });
      return res.status(404).json({ message: "Relación SalonEquipoOpcional no encontrada." });
    }

    logger.info("Equipo de salón actualizado correctamente", { id, IdEquipo });
    res.json({ message: "Equipo de salón actualizado correctamente." });
  } catch (err) {
    logger.error("Error al actualizar equipo de salón", err);
    res.status(500).json({ message: "Error del servidor al actualizar el equipo de salón." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    logger.info("Eliminando equipo de salón", { id });

    client = await connectDB();
    const result = await client.query("DELETE FROM salonequipoopcional WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      logger.warn("Relación SalonEquipoOpcional no encontrada al eliminar", { id });
      return res.status(404).json({ message: "Relación SalonEquipoOpcional no encontrada." });
    }

    logger.info("Equipo de salón eliminado correctamente", { id });
    res.json({ message: "Equipo de salón eliminado correctamente." });
  } catch (err) {
    logger.error("Error al eliminar equipo de salón", err);
    res.status(500).json({ message: "Error del servidor al eliminar el equipo de salón." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// Logger simple (puedes luego reemplazar por winston o pino)
const logger = {
  info: (msg, meta = "") => console.log(`INFO: ${msg}`, meta),
  warn: (msg, meta = "") => console.warn(`WARN: ${msg}`, meta),
  error: (msg, meta = "") => console.error(`ERROR: ${msg}`, meta),
};

// ================================
// GET capacidades por salón
// ================================
router.get("/salon/:idSalon", async (req, res) => {
  const { idSalon } = req.params;
  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("idSalon", sql.Int, idSalon)
      .query(`
        SELECT 
            c.IdCapacidad,
            c.IdSalon,
            s.Nombre AS NombreSalon,
            c.IdTipoMontaje,
            tm.Nombre AS NombreTipoMontaje,
            c.CantidadPersonas
        FROM Capacidades c
        LEFT JOIN TiposMontaje tm ON c.IdTipoMontaje = tm.IdTipoMontaje
        LEFT JOIN Salones s ON c.IdSalon = s.IdSalon
        WHERE c.IdSalon = @idSalon
        ORDER BY c.IdCapacidad
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error del servidor al obtener capacidades." });
  }
});

// ================================
// POST agregar nueva capacidad
// ================================
router.post("/", async (req, res) => {
  const { idSalon, IdTipoMontaje, CantidadPersonas } = req.body;

  if (!idSalon || !IdTipoMontaje || !CantidadPersonas) {
    logger.warn("Solicitud inválida al agregar capacidad", req.body);
    return res.status(400).json({ message: "Todos los campos son requeridos." });
  }

  try {
    logger.info("Agregando nueva capacidad", { idSalon, IdTipoMontaje, CantidadPersonas });

    const pool = await connectDB();
    await pool.request()
      .input("idSalon", sql.Int, idSalon)
      .input("IdTipoMontaje", sql.Int, IdTipoMontaje)
      .input("CantidadPersonas", sql.Int, CantidadPersonas)
      .query("INSERT INTO Capacidades (IdSalon, IdTipoMontaje, CantidadPersonas) VALUES (@idSalon, @IdTipoMontaje, @CantidadPersonas)");

    logger.info("Capacidad agregada correctamente");
    res.status(201).json({ message: "Capacidad agregada correctamente." });
  } catch (err) {
    logger.error("Error al agregar capacidad", err);
    res.status(500).json({ message: "Error del servidor al agregar la capacidad." });
  }
});

// ================================
// PUT actualizar capacidad
// ================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { IdTipoMontaje, CantidadPersonas } = req.body;

  if (!id || isNaN(parseInt(id))) {
    logger.warn("ID de capacidad inválido para actualización", { id });
    return res.status(400).json({ message: "ID de capacidad requerido y debe ser un número." });
  }
  
  if (!IdTipoMontaje || !CantidadPersonas) {
    logger.warn("Datos incompletos en actualización de capacidad", req.body);
    return res.status(400).json({ message: "Tipo de montaje y cantidad de personas son requeridos." });
  }

  try {
    logger.info("Actualizando capacidad", { id, IdTipoMontaje, CantidadPersonas });

    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("IdTipoMontaje", sql.Int, IdTipoMontaje)
      .input("CantidadPersonas", sql.Int, CantidadPersonas)
      .query("UPDATE Capacidades SET IdTipoMontaje = @IdTipoMontaje, CantidadPersonas = @CantidadPersonas WHERE IdCapacidad = @id");

    if (result.rowsAffected[0] === 0) {
      logger.warn("Capacidad no encontrada al actualizar", { id });
      return res.status(404).json({ message: "Capacidad no encontrada." });
    }

    logger.info("Capacidad actualizada correctamente", { id });
    res.json({ message: "Capacidad actualizada correctamente." });
  } catch (err) {
    logger.error("Error al actualizar capacidad", err);
    res.status(500).json({ message: "Error del servidor al actualizar la capacidad." });
  }
});

// ================================
// DELETE eliminar capacidad
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    logger.warn("ID de capacidad inválido para eliminación", { id });
    return res.status(400).json({ message: "ID de capacidad requerido y debe ser un número." });
  }

  try {
    logger.info("Eliminando capacidad", { id });

    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM Capacidades WHERE IdCapacidad = @id");

    if (result.rowsAffected[0] === 0) {
      logger.warn("Capacidad no encontrada al eliminar", { id });
      return res.status(404).json({ message: "Capacidad no encontrada." });
    }

    logger.info("Capacidad eliminada correctamente", { id });
    res.json({ message: "Capacidad eliminada correctamente." });
  } catch (err) {
    logger.error("Error al eliminar capacidad", err);
    res.status(500).json({ message: "Error del servidor al eliminar la capacidad." });
  }
});

module.exports = router;

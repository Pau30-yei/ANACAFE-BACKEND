const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

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
  let client;
  try {
    client = await connectDB();
    const result = await client.query(`
        SELECT 
            c.idcapacidad AS "IdCapacidad",
            c.idsalon AS "IdSalon",
            s.nombre AS "NombreSalon",
            c.idtipomontaje AS "IdTipoMontaje",
            tm.nombre AS "NombreTipoMontaje",
            c.cantidadpersonas AS "CantidadPersonas"
        FROM capacidades c
        LEFT JOIN tiposmontaje tm ON c.idtipomontaje = tm.idtipomontaje
        LEFT JOIN salones s ON c.idsalon = s.idsalon
        WHERE c.idsalon = $1
        ORDER BY c.idcapacidad
      `, [idSalon]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error del servidor al obtener capacidades." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    logger.info("Agregando nueva capacidad", { idSalon, IdTipoMontaje, CantidadPersonas });

    client = await connectDB();
    await client.query(
      "INSERT INTO capacidades (idsalon, idtipomontaje, cantidadpersonas) VALUES ($1, $2, $3)",
      [idSalon, IdTipoMontaje, CantidadPersonas]
    );

    logger.info("Capacidad agregada correctamente");
    res.status(201).json({ message: "Capacidad agregada correctamente." });
  } catch (err) {
    logger.error("Error al agregar capacidad", err);
    res.status(500).json({ message: "Error del servidor al agregar la capacidad." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    logger.info("Actualizando capacidad", { id, IdTipoMontaje, CantidadPersonas });

    client = await connectDB();
    const result = await client.query(
      "UPDATE capacidades SET idtipomontaje = $1, cantidadpersonas = $2 WHERE idcapacidad = $3",
      [IdTipoMontaje, CantidadPersonas, id]
    );

    if (result.rowCount === 0) {
      logger.warn("Capacidad no encontrada al actualizar", { id });
      return res.status(404).json({ message: "Capacidad no encontrada." });
    }

    logger.info("Capacidad actualizada correctamente", { id });
    res.json({ message: "Capacidad actualizada correctamente." });
  } catch (err) {
    logger.error("Error al actualizar capacidad", err);
    res.status(500).json({ message: "Error del servidor al actualizar la capacidad." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    logger.info("Eliminando capacidad", { id });

    client = await connectDB();
    const result = await client.query("DELETE FROM capacidades WHERE idcapacidad = $1", [id]);

    if (result.rowCount === 0) {
      logger.warn("Capacidad no encontrada al eliminar", { id });
      return res.status(404).json({ message: "Capacidad no encontrada." });
    }

    logger.info("Capacidad eliminada correctamente", { id });
    res.json({ message: "Capacidad eliminada correctamente." });
  } catch (err) {
    logger.error("Error al eliminar capacidad", err);
    res.status(500).json({ message: "Error del servidor al eliminar la capacidad." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
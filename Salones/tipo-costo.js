const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

const logger = {
  info: (msg, meta = "") => console.log(`INFO: ${msg}`, meta),
  warn: (msg, meta = "") => console.warn(`WARN: ${msg}`, meta),
  error: (msg, meta = "") => console.error(`ERROR: ${msg}`, meta),
};

// ===============================
// 1. GET (READ): Obtener todos los tipos de costo
// ===============================
router.get("/", async (req, res) => {
  let client;
  try {
    client = await connectDB();
     const result = await client.query(`
      SELECT 
        idtipocosto as "IdTipoCosto",
        nombre as "Nombre"
      FROM tiposcosto 
      ORDER BY nombre
    `);
    res.json(result.rows);
  } catch (err) {
    logger.error("[ERROR] Error al obtener tipos de costo:", err);
    res.status(500).json({ message: "Error del servidor al obtener tipos de costo." });
  } finally {
    if (client) client.release();
  }
});

// ===============================
// 2. POST (CREATE): Agregar un nuevo tipo de costo
// ===============================
router.post("/", async (req, res) => {
  const { Nombre } = req.body;

  if (!Nombre || Nombre.trim() === '') {
    return res.status(400).json({ message: "El nombre es un campo requerido." });
  }

  let client;
  try {
    client = await connectDB();
    const result = await client.query(
      "INSERT INTO tiposcosto (nombre) VALUES ($1) RETURNING idtipocosto",
      [Nombre]
    );

    const nuevoId = result.rows[0].idtipocosto;
    res.status(201).json({ 
        message: "Tipo de costo agregado correctamente.", 
        IdTipoCosto: nuevoId 
    });
  } catch (err) {
    logger.error("[ERROR] Error al agregar tipo de costo:", err);
    if (err.code === '23505') {
         return res.status(409).json({ message: "Ya existe un tipo de costo con ese nombre." });
    }
    res.status(500).json({ message: "Error del servidor al agregar el tipo de costo." });
  } finally {
    if (client) client.release();
  }
});

// ===============================
// 3. PUT (UPDATE): Actualizar un tipo de costo por ID
// ===============================
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { Nombre } = req.body;

  if (isNaN(id) || !Nombre || Nombre.trim() === '') {
    return res.status(400).json({ message: "ID o Nombre inválido." });
  }

  let client;
  try {
    client = await connectDB();
    const result = await client.query(
      "UPDATE tiposcosto SET nombre = $1 WHERE idtipocosto = $2",
      [Nombre, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Tipo de costo no encontrado." });
    }
    
    res.json({ message: "Tipo de costo actualizado correctamente." });
  } catch (err) {
    logger.error("[ERROR] Error al actualizar tipo de costo:", err);
     if (err.code === '23505') {
         return res.status(409).json({ message: "Ya existe un tipo de costo con ese nombre." });
    }
    res.status(500).json({ message: "Error del servidor al actualizar el tipo de costo." });
  } finally {
    if (client) client.release();
  }
});

// ===============================
// 4. DELETE (DELETE): Eliminar un tipo de costo por ID
// ===============================
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "ID de tipo de costo inválido." });
  }

  let client;
  try {
    client = await connectDB();

    // Validación de uso
    const checkUsage = await client.query(
        "SELECT COUNT(*) AS total FROM costos WHERE idtipocosto = $1",
        [id]
    );
        
    if (parseInt(checkUsage.rows[0].total) > 0) {
        return res.status(400).json({ 
            message: "No se puede eliminar este Tipo de Costo porque está asignado a uno o más Salones en la tabla de Costos." 
        });
    }

    const result = await client.query("DELETE FROM tiposcosto WHERE idtipocosto = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Tipo de costo no encontrado." });
    }

    res.json({ message: "Tipo de costo eliminado correctamente." });
  } catch (err) {
    logger.error("[ERROR] Error al eliminar tipo de costo:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el tipo de costo." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
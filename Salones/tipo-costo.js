const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

const logger = {
  info: (msg, meta = "") => console.log(`INFO: ${msg}`, meta),
  warn: (msg, meta = "") => console.warn(`WARN: ${msg}`, meta),
  error: (msg, meta = "") => console.error(`ERROR: ${msg}`, meta),
};

// ===============================
// 1. GET (READ): Obtener todos los tipos de costo
// ===============================
router.get("/", async (req, res) => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query("SELECT * FROM TiposCosto ORDER BY Nombre");
    res.json(result.recordset);
  } catch (err) {
    logger.error("[ERROR] Error al obtener tipos de costo:", err);
    res.status(500).json({ message: "Error del servidor al obtener tipos de costo." });
  }
});

// ===============================
// 2. POST (CREATE): Agregar un nuevo tipo de costo
// Body: { "Nombre": "Nuevo Tipo" }
// ===============================
router.post("/", async (req, res) => {
  const { Nombre } = req.body;

  if (!Nombre || Nombre.trim() === '') {
    return res.status(400).json({ message: "El nombre es un campo requerido." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("Nombre", sql.VarChar(100), Nombre)
      .query("INSERT INTO TiposCosto (Nombre) VALUES (@Nombre); SELECT SCOPE_IDENTITY() AS IdTipoCosto;");

    const nuevoId = result.recordset[0].IdTipoCosto;
    res.status(201).json({ 
        message: "Tipo de costo agregado correctamente.", 
        IdTipoCosto: nuevoId 
    });
  } catch (err) {
    logger.error("[ERROR] Error al agregar tipo de costo:", err);
    // Manejo de error por clave duplicada (si la BD tiene restricción UNIQUE en Nombre)
    if (err.message.includes('unique constraint')) {
         return res.status(409).json({ message: "Ya existe un tipo de costo con ese nombre." });
    }
    res.status(500).json({ message: "Error del servidor al agregar el tipo de costo." });
  }
});

// ===============================
// 3. PUT (UPDATE): Actualizar un tipo de costo por ID
// Body: { "Nombre": "Nombre Actualizado" }
// ===============================
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { Nombre } = req.body;

  if (isNaN(id) || !Nombre || Nombre.trim() === '') {
    return res.status(400).json({ message: "ID o Nombre inválido." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("Nombre", sql.VarChar(100), Nombre)
      .query("UPDATE TiposCosto SET Nombre = @Nombre WHERE IdTipoCosto = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Tipo de costo no encontrado." });
    }
    
    res.json({ message: "Tipo de costo actualizado correctamente." });
  } catch (err) {
    logger.error("[ERROR] Error al actualizar tipo de costo:", err);
     if (err.message.includes('unique constraint')) {
         return res.status(409).json({ message: "Ya existe un tipo de costo con ese nombre." });
    }
    res.status(500).json({ message: "Error del servidor al actualizar el tipo de costo." });
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

  try {
    const pool = await connectDB();

    // ----------------------------------------------------------------------
    //  LÓGICA DE VALIDACIÓN DE USO (Foreign Key Check) 
    // Asegura que no se pueda eliminar un tipo de costo si está siendo referenciado en la tabla 'Costos'.
    // ----------------------------------------------------------------------
    const checkUsage = await pool.request()
        .input("id", sql.Int, id)
        .query("SELECT COUNT(*) AS total FROM Costos WHERE IdTipoCosto = @id");
        
    if (checkUsage.recordset[0].total > 0) {
        return res.status(400).json({ 
            message: "No se puede eliminar este Tipo de Costo porque está asignado a uno o más Salones en la tabla de Costos." 
        });
    }

    // ----------------------------------------------------------------------
    // Eliminar si no está en uso
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM TiposCosto WHERE IdTipoCosto = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Tipo de costo no encontrado." });
    }

    res.json({ message: "Tipo de costo eliminado correctamente." });
  } catch (err) {
    logger.error("[ERROR] Error al eliminar tipo de costo:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el tipo de costo." });
  }
});

module.exports = router;
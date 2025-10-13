const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js"); 
const sql = require("mssql");

const logger = {
  info: (msg, meta = "") => console.log(`INFO: ${msg}`, meta),
  warn: (msg, meta = "") => console.warn(`WARN: ${msg}`, meta),
  error: (msg, meta = "") => console.error(`ERROR: ${msg}`, meta),
};

// ===================================
// 1. GET (READ): Obtener costos por salón
// ===================================
router.get("/salon/:idSalon", async (req, res) => {
  const idSalon = parseInt(req.params.idSalon);
  if (isNaN(idSalon)) {
    return res.status(400).json({ message: "ID de salón inválido." });
  }
  
  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("idSalon", sql.Int, idSalon)
      .query(`
        SELECT 
            c.IdCosto,
            c.IdSalon,
            tc.IdTipoCosto,
            tc.Nombre AS NombreTipoCosto,
            c.Monto,
            c.FechaRegistro
        FROM Costos c
        LEFT JOIN TiposCosto tc ON c.IdTipoCosto = tc.IdTipoCosto
        WHERE c.IdSalon = @idSalon
        ORDER BY tc.Nombre
      `);

    res.json(result.recordset);
  } catch (err) {
    logger.error("Error al obtener costos:", err);
    res.status(500).json({ message: "Error del servidor." });
  }
});

// ===================================
// 2. POST (CREATE): Agregar un nuevo costo a un salón
// Body: { "IdSalon": 1, "IdTipoCosto": 2, "Monto": 150.00 }
// ===================================
router.post("/", async (req, res) => {
  const { IdSalon, IdTipoCosto, Monto } = req.body;
  
  if (!IdSalon || !IdTipoCosto || Monto === undefined || isNaN(parseFloat(Monto)) || parseFloat(Monto) < 0) {
    return res.status(400).json({ message: "Datos incompletos o inválidos: IdSalon, IdTipoCosto y Monto son requeridos y Monto debe ser un número >= 0." });
  }

  try {
    const pool = await connectDB();
    
    // ----------------------------------------------------------------------
    //  LÓGICA DE VALIDACIÓN DE UNICIDAD (IdSalon + IdTipoCosto) 
    // Esto asegura que un mismo salón no tenga dos veces el mismo tipo de costo ( dos Precios Base).
    // ----------------------------------------------------------------------
    const checkUnique = await pool.request()
        .input("IdSalon", sql.Int, IdSalon)
        .input("IdTipoCosto", sql.Int, IdTipoCosto)
        .query("SELECT COUNT(*) AS count FROM Costos WHERE IdSalon = @IdSalon AND IdTipoCosto = @IdTipoCosto");
        
    if (checkUnique.recordset[0].count > 0) {
        // Devuelve un error 409 Conflict si ya existe la combinación
        return res.status(409).json({ message: "Este tipo de costo ya está asignado a este salón. Para cambiar el monto, debe actualizar el costo existente." });
    }
    // ----------------------------------------------------------------------
    
    const result = await pool.request()
      .input("IdSalon", sql.Int, IdSalon)
      .input("IdTipoCosto", sql.Int, IdTipoCosto)
      .input("Monto", sql.Decimal(18, 2), Monto)
      .query("INSERT INTO Costos (IdSalon, IdTipoCosto, Monto) VALUES (@IdSalon, @IdTipoCosto, @Monto); SELECT SCOPE_IDENTITY() AS IdCosto;");

    res.status(201).json({ 
      message: "Costo agregado correctamente.", 
      IdCosto: result.recordset[0].IdCosto 
    });
  } catch (err) {
    logger.error("Error al agregar costo:", err);
    res.status(500).json({ message: "Error del servidor al agregar el costo." });
  }
});

// ===================================
// 3. PUT (UPDATE): Actualizar el monto de un costo existente
// Body: { "Monto": 200.00 }
// ===================================
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { Monto } = req.body;

  if (isNaN(id) || Monto === undefined || isNaN(parseFloat(Monto)) || parseFloat(Monto) < 0) {
    return res.status(400).json({ message: "ID o Monto inválido. El monto debe ser un número >= 0." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("Monto", sql.Decimal(18, 2), Monto)
      .query("UPDATE Costos SET Monto = @Monto, FechaRegistro = GETDATE() WHERE IdCosto = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Costo no encontrado." });
    }
    
    res.json({ message: "Monto del costo actualizado correctamente." });
  } catch (err) {
    logger.error("Error al actualizar monto del costo:", err);
    res.status(500).json({ message: "Error del servidor al actualizar el costo." });
  }
});

// ===================================
// 4. DELETE (DELETE): Eliminar Costo por IdCosto
// ===================================
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ message: "ID de costo inválido." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM Costos WHERE IdCosto = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Costo no encontrado." });
    }

    res.json({ message: "Costo eliminado correctamente." });

  } catch (err) {
    logger.error("Error al eliminar costo:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el costo." });
  }
});

module.exports = router;
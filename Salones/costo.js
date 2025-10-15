const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js"); 

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
  
  let client;
  try {
    client = await connectDB();
    const result = await client.query(`
        SELECT 
            c.idcosto AS "IdCosto",
            c.idsalon AS "IdSalon",
            tc.idtipocosto AS "IdTipoCosto",
            tc.nombre AS "NombreTipoCosto",
            c.monto AS "Monto",
            c.fecharegistro AS "FechaRegistro"
        FROM costos c
        LEFT JOIN tiposcosto tc ON c.idtipocosto = tc.idtipocosto
        WHERE c.idsalon = $1
        ORDER BY tc.nombre
      `, [idSalon]);

    res.json(result.rows);
  } catch (err) {
    logger.error("Error al obtener costos:", err);
    res.status(500).json({ message: "Error del servidor." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    
    // ----------------------------------------------------------------------
    //  LÓGICA DE VALIDACIÓN DE UNICIDAD (IdSalon + IdTipoCosto) 
    // Esto asegura que un mismo salón no tenga dos veces el mismo tipo de costo ( dos Precios Base).
    // ----------------------------------------------------------------------
    const checkUnique = await client.query(
        "SELECT COUNT(*) AS count FROM costos WHERE idsalon = $1 AND idtipocosto = $2", 
        [IdSalon, IdTipoCosto]);
        
    if (parseInt(checkUnique.rows[0].count) > 0) {
        // Devuelve un error 409 Conflict si ya existe la combinación
        return res.status(409).json({ message: "Este tipo de costo ya está asignado a este salón. Para cambiar el monto, debe actualizar el costo existente." });
    }
    // ----------------------------------------------------------------------
    
    const result = await client.query(
      "INSERT INTO costos (idsalon, idtipocosto, monto) VALUES ($1, $2, $3) RETURNING idcosto",
      [IdSalon, IdTipoCosto, Monto]
    );

    res.status(201).json({ 
      message: "Costo agregado correctamente.", 
      IdCosto: result.rows[0].idcosto 
    });
  } catch (err) {
    logger.error("Error al agregar costo:", err);
    res.status(500).json({ message: "Error del servidor al agregar el costo." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    const result = await client.query(
      "UPDATE costos SET monto = $1, fecharegistro = CURRENT_TIMESTAMP WHERE idcosto = $2",
      [Monto, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Costo no encontrado." });
    }
    
    res.json({ message: "Monto del costo actualizado correctamente." });
  } catch (err) {
    logger.error("Error al actualizar monto del costo:", err);
    res.status(500).json({ message: "Error del servidor al actualizar el costo." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    const result = await client.query("DELETE FROM costos WHERE idcosto = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Costo no encontrado." });
    }

    res.json({ message: "Costo eliminado correctamente." });

  } catch (err) {
    logger.error("Error al eliminar costo:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el costo." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
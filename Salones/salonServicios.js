const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// ================================
// GET servicios por salón
// ================================
router.get("/salon/:idSalon", async (req, res) => {
  const { idSalon } = req.params;
  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("idSalon", sql.Int, idSalon)
      .query(`
        SELECT ss.Id, ss.IdSalon, ss.IdServicio, ss.Nota,
               s.Nombre AS NombreSalon,
               srv.Nombre AS NombreServicio
        FROM SalonServicios ss
        INNER JOIN Salones s ON ss.IdSalon = s.IdSalon
        INNER JOIN Servicios srv ON ss.IdServicio = srv.IdServicio
        WHERE ss.IdSalon = @idSalon
        ORDER BY ss.Id
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error al obtener servicios del salón:", err);
    res.status(500).json({ message: "Error al obtener servicios del salón." });
  }
});

// ================================
// POST agregar servicio a salón
// ================================
router.post("/", async (req, res) => {
  const { IdSalon, IdServicio, Nota } = req.body;

  // Validación de datos obligatorios
  if (!IdSalon || !IdServicio || isNaN(parseInt(IdSalon)) || isNaN(parseInt(IdServicio))) {
    return res.status(400).json({ message: "Faltan campos obligatorios o son inválidos: IdSalon e IdServicio." });
  }

  try {
    const pool = await connectDB();
    
    // *** CORRECCIÓN CLAVE ***: Uso de SCOPE_IDENTITY() para obtener el ID de inserción
    const query = `
      INSERT INTO SalonServicios (IdSalon, IdServicio, Nota) 
      VALUES (@IdSalon, @IdServicio, @Nota);
      SELECT SCOPE_IDENTITY() AS Id;
    `;
    
    const result = await pool.request()
      .input("IdSalon", sql.Int, IdSalon)
      .input("IdServicio", sql.Int, IdServicio)
      .input("Nota", sql.VarChar, Nota || "")
      .query(query);

    // Obtener el ID insertado
    const nuevoId = result.recordset[0].Id;

    res.status(201).json({ 
        Id: nuevoId, // Devolvemos el ID al cliente
        message: "Servicio de salón agregado correctamente." 
    });

  } catch (err) {
    console.error("Error detallado al agregar servicio a salón:", err);
    
    // Manejo de error de duplicado (si tiene una clave única en (IdSalon, IdServicio))
    if (err.number === 2627) {
        return res.status(409).json({ message: "Este servicio ya está asignado al salón." });
    }
    // Manejo de error de clave foránea (IdSalon o IdServicio no existe)
    if (err.number === 547) {
        return res.status(400).json({ message: "El ID de Salón o ID de Servicio proporcionado no existe." });
    }
    
    res.status(500).json({ message: err.message, number: err.number });
  }
});
// ================================
// PUT actualizar servicio de salón
// ================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { IdServicio, Nota } = req.body; // No necesitamos IdSalon en el PUT si Id es la clave

  if (!IdServicio) {
    return res.status(400).json({ message: "Falta el campo obligatorio IdServicio." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("IdServicio", sql.Int, IdServicio)
      .input("Nota", sql.VarChar, Nota || "")
      .query("UPDATE SalonServicios SET IdServicio = @IdServicio, Nota = @Nota WHERE Id = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Registro no encontrado." });
    }

    res.json({ message: "Servicio de salón actualizado correctamente." });
  } catch (err) {
    console.error("Error al actualizar servicio de salón:", err);
    res.status(500).json({ message: "Error del servidor al actualizar servicio." });
  }
});

// ================================
// DELETE eliminar servicio de salón
// ================================
// DELETE eliminar servicio de salón (depurado)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Validación: asegurarse que sea un número
  const idNum = parseInt(id);
  if (isNaN(idNum)) {
    return res.status(400).json({ message: "ID inválido." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, idNum)
      .query("DELETE FROM SalonServicios WHERE Id = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Registro no encontrado o ya eliminado." });
    }

    res.json({ message: "Servicio de salón eliminado correctamente." });
  } catch (err) {
    console.error("Error al eliminar servicio de salón:", err);

    // Manejo de error de clave foránea
    if (err.number === 547) {
      return res.status(400).json({ message: "No se puede eliminar porque está relacionado con otro registro." });
    }

    res.status(500).json({ message: err.message || "Error del servidor al eliminar." });
  }
});

module.exports = router;
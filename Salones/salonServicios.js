const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

// ================================
// GET servicios por salón
// ================================
router.get("/salon/:idSalon", async (req, res) => {
  const { idSalon } = req.params;
  let client;
  try {
    client = await connectDB();
          const result = await client.query(`
        SELECT 
          ss.id as "Id", 
          ss.idsalon as "IdSalon", 
          ss.idservicio as "IdServicio", 
          ss.nota as "Nota",
          s.nombre as "NombreSalon",
          srv.nombre as "NombreServicio"
        FROM salonservicios ss
        INNER JOIN salones s ON ss.idsalon = s.idsalon
        INNER JOIN servicios srv ON ss.idservicio = srv.idservicio
        WHERE ss.idsalon = $1
        ORDER BY ss.id
      `, [idSalon]);

    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener servicios del salón:", err);
    res.status(500).json({ message: "Error al obtener servicios del salón." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    
    const query = `
      INSERT INTO salonservicios (idsalon, idservicio, nota) 
      VALUES ($1, $2, $3) RETURNING id;
    `;
    
    const result = await client.query(query, [IdSalon, IdServicio, Nota || ""]);

    // Obtener el ID insertado
    const nuevoId = result.rows[0].id;

    res.status(201).json({ 
        Id: nuevoId, // Devolvemos el ID al cliente
        message: "Servicio de salón agregado correctamente." 
    });

  } catch (err) {
    console.error("Error detallado al agregar servicio a salón:", err);
    
    // Manejo de error de duplicado (si tiene una clave única en (IdSalon, IdServicio))
    if (err.code === '23505') {
        return res.status(409).json({ message: "Este servicio ya está asignado al salón." });
    }
    // Manejo de error de clave foránea (IdSalon o IdServicio no existe)
    if (err.code === '23503') {
        return res.status(400).json({ message: "El ID de Salón o ID de Servicio proporcionado no existe." });
    }
    
    res.status(500).json({ message: err.message, number: err.code });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    const result = await client.query(
      "UPDATE salonservicios SET idservicio = $1, nota = $2 WHERE id = $3",
      [IdServicio, Nota || "", id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Registro no encontrado." });
    }

    res.json({ message: "Servicio de salón actualizado correctamente." });
  } catch (err) {
    console.error("Error al actualizar servicio de salón:", err);
    res.status(500).json({ message: "Error del servidor al actualizar servicio." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    const result = await client.query("DELETE FROM salonservicios WHERE id = $1", [idNum]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Registro no encontrado o ya eliminado." });
    }

    res.json({ message: "Servicio de salón eliminado correctamente." });
  } catch (err) {
    console.error("Error al eliminar servicio de salón:", err);

    // Manejo de error de clave foránea
    if (err.code === '23503') {
      return res.status(400).json({ message: "No se puede eliminar porque está relacionado con otro registro." });
    }

    res.status(500).json({ message: err.message || "Error del servidor al eliminar." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
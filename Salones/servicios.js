const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

// ================================
// GET todos los servicios
// ================================
router.get("/", async (req, res) => {
  let client;
  try {
    client = await connectDB();
    const result = await client.query(`
      SELECT 
        idservicio as "IdServicio",
        nombre as "Nombre", 
        descripcion as "Descripcion" 
      FROM servicios 
      ORDER BY idservicio
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener servicios:", err);
    res.status(500).json({ message: "Error del servidor al obtener servicios." });
  } finally {
    if (client) client.release();
  }
});

// ================================
// POST agregar servicio
// ================================
router.post("/", async (req, res) => {
  const { Nombre, Descripcion } = req.body;

  if (!Nombre || !Descripcion) {
    return res.status(400).json({ message: "Nombre y descripción son requeridos." });
  }

  let client;
  try {
    client = await connectDB();
    await client.query(
      "INSERT INTO servicios (nombre, descripcion) VALUES ($1, $2)",
      [Nombre, Descripcion]
    );

    res.status(201).json({ message: "Servicio agregado correctamente." });
  } catch (err) {
    console.error("Error al agregar servicio:", err);
    res.status(500).json({ message: "Error del servidor al agregar servicio." });
  } finally {
    if (client) client.release();
  }
});

// ================================
// PUT actualizar servicio
// ================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { Nombre, Descripcion } = req.body;

  if (!Nombre || !Descripcion) {
    return res.status(400).json({ message: "Nombre y descripción son requeridos." });
  }

  let client;
  try {
    client = await connectDB();
    const result = await client.query(
      "UPDATE servicios SET nombre = $1, descripcion = $2 WHERE idservicio = $3",
      [Nombre, Descripcion, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Servicio no encontrado." });
    }

    res.json({ message: "Servicio actualizado correctamente." });
  } catch (err) {
    console.error("Error al actualizar servicio:", err);
    res.status(500).json({ message: "Error del servidor al actualizar servicio." });
  } finally {
    if (client) client.release();
  }
});

// ================================
// DELETE eliminar servicio
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  let client;
  try {
    client = await connectDB();
    const result = await client.query("DELETE FROM servicios WHERE idservicio = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Servicio no encontrado." });
    }

    res.json({ message: "Servicio eliminado correctamente." });
  } catch (err) {
    console.error("Error al eliminar servicio:", err);
    res.status(500).json({ message: "Error del servidor al eliminar servicio." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
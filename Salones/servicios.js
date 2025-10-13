const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// ================================
// GET todos los servicios
// ================================
router.get("/", async (req, res) => {
  try {
    const pool = await connectDB();
    const result = await pool.request()
      .query("SELECT IdServicio, Nombre, Descripcion FROM Servicios ORDER BY IdServicio");

    res.json(result.recordset);
  } catch (err) {
    console.error("Error al obtener servicios:", err);
    res.status(500).json({ message: "Error del servidor al obtener servicios." });
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

  try {
    const pool = await connectDB();
    await pool.request()
      .input("Nombre", sql.VarChar, Nombre)
      .input("Descripcion", sql.VarChar, Descripcion)
      .query("INSERT INTO Servicios (Nombre, Descripcion) VALUES (@Nombre, @Descripcion)");

    res.status(201).json({ message: "Servicio agregado correctamente." });
  } catch (err) {
    console.error("Error al agregar servicio:", err);
    res.status(500).json({ message: "Error del servidor al agregar servicio." });
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

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("Nombre", sql.VarChar, Nombre)
      .input("Descripcion", sql.VarChar, Descripcion)
      .query("UPDATE Servicios SET Nombre = @Nombre, Descripcion = @Descripcion WHERE IdServicio = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Servicio no encontrado." });
    }

    res.json({ message: "Servicio actualizado correctamente." });
  } catch (err) {
    console.error("Error al actualizar servicio:", err);
    res.status(500).json({ message: "Error del servidor al actualizar servicio." });
  }
});

// ================================
// DELETE eliminar servicio
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM Servicios WHERE IdServicio = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Servicio no encontrado." });
    }

    res.json({ message: "Servicio eliminado correctamente." });
  } catch (err) {
    console.error("Error al eliminar servicio:", err);
    res.status(500).json({ message: "Error del servidor al eliminar servicio." });
  }
});

module.exports = router;

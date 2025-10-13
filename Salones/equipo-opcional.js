const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// ================================
// GET todos los equipos opcionales
// ================================
router.get("/", async (req, res) => {
  console.log("[INFO] Solicitud GET /EquipoOpcional recibida");
  try {
    const pool = await connectDB();
    const result = await pool.request().query("SELECT * FROM EquipoOpcional");
    console.log(`[INFO] Se obtuvieron ${result.recordset.length} equipos opcionales`);
    res.json(result.recordset);
  } catch (err) {
    console.error("[ERROR] Error al obtener equipos opcionales:", err);
    res.status(500).json({ message: "Error del servidor al obtener equipos opcionales." });
  }
});

// ================================
// POST agregar un nuevo equipo opcional
// ================================
router.post("/", async (req, res) => {
  const { Nombre, Descripcion } = req.body;
  console.log("[INFO] Solicitud POST /EquipoOpcional recibida", req.body);

  if (!Nombre || !Descripcion) {
    console.warn("[WARN] Nombre o descripción faltante en la solicitud");
    return res.status(400).json({ message: "Nombre y descripción son campos requeridos." });
  }

  try {
    const pool = await connectDB();
    await pool.request()
      .input("Nombre", sql.NVarChar(50), Nombre)
      .input("Descripcion", sql.NVarChar(255), Descripcion) // Asumo un NVarChar más largo para Descripción
      .query("INSERT INTO EquipoOpcional (Nombre, Descripcion) VALUES (@Nombre, @Descripcion)");

    console.log("[INFO] Equipo opcional agregado correctamente:", Nombre);
    res.status(201).json({ message: "Equipo opcional agregado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al agregar equipo opcional:", err);
    res.status(500).json({ message: "Error del servidor al agregar el equipo opcional." });
  }
});

// ================================
// PUT actualizar equipo opcional
// ================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { Nombre, Descripcion } = req.body;
  console.log(`[INFO] Solicitud PUT /EquipoOpcional/${id} recibida`, req.body);

  if (!Nombre || !Descripcion) {
    console.warn("[WARN] Nombre o descripción faltante en la actualización");
    return res.status(400).json({ message: "Nombre y descripción son campos requeridos." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("IdEquipo", sql.Int, id)
      .input("Nombre", sql.NVarChar(50), Nombre)
      .input("Descripcion", sql.NVarChar(255), Descripcion)
      .query("UPDATE EquipoOpcional SET Nombre = @Nombre, Descripcion = @Descripcion WHERE IdEquipo = @id");

    if (result.rowsAffected[0] === 0) {
      console.warn(`[WARN] Equipo opcional con ID ${id} no encontrado`);
      return res.status(404).json({ message: "Equipo opcional no encontrado." });
    }

    console.log(`[INFO] Equipo opcional con ID ${id} actualizado correctamente`);
    res.json({ message: "Equipo opcional actualizado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al actualizar equipo opcional:", err);
    res.status(500).json({ message: "Error del servidor al actualizar el equipo opcional." });
  }
});

// ================================
// DELETE equipo opcional
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] Solicitud DELETE /EquipoOpcional/${id} recibida`);

  try {
    const pool = await connectDB();

    // Verificar si el equipo opcional está en uso en SalonEquipoOpcional
    const check = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT COUNT(*) AS total FROM SalonEquipoOpcional WHERE IdEquipo = @id");

    if (check.recordset[0].total > 0) {
      console.warn(`[WARN] No se puede eliminar, está en uso en SalonEquipoOpcional`);
      return res.status(400).json({
        message: "No se puede eliminar este Equipo Opcional porque está en uso en Salones."
      });
    }

    // Si no está en uso, eliminarlo
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM EquipoOpcional WHERE IdEquipo = @id");

    if (result.rowsAffected[0] === 0) {
      console.warn(`[WARN] Equipo opcional con ID ${id} no encontrado para eliminar`);
      return res.status(404).json({ message: "Equipo opcional no encontrado." });
    }

    console.log(`[INFO] Equipo opcional con ID ${id} eliminado correctamente`);
    res.json({ message: "Equipo opcional eliminado correctamente." });

  } catch (err) {
    console.error("[ERROR] Error al eliminar equipo opcional:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el equipo opcional." });
  }
});


module.exports = router;
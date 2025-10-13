const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// ================================
// GET todos los tipos de montaje
// ================================
router.get("/", async (req, res) => {
  console.log("[INFO] Solicitud GET /TiposMontaje recibida");
  try {
    const pool = await connectDB();
    const result = await pool.request().query("SELECT * FROM TiposMontaje");
    console.log(`[INFO] Se obtuvieron ${result.recordset.length} tipos de montaje`);
    res.json(result.recordset);
  } catch (err) {
    console.error("[ERROR] Error al obtener tipos de montaje:", err);
    res.status(500).json({ message: "Error del servidor al obtener tipos de montaje." });
  }
});

// ================================
// POST agregar un nuevo tipo de montaje
// ================================
router.post("/", async (req, res) => {
  const { Nombre, Descripcion } = req.body;
  console.log("[INFO] Solicitud POST /TiposMontaje recibida", req.body);

  if (!Nombre || !Descripcion) {
    console.warn("[WARN] Nombre o descripción faltante en la solicitud");
    return res.status(400).json({ message: "Nombre y descripción son campos requeridos." });
  }

  try {
    const pool = await connectDB();
    await pool.request()
      .input("Nombre", sql.NVarChar(50), Nombre)
      .input("Descripcion", sql.NVarChar(50), Descripcion)
      .query("INSERT INTO TiposMontaje (Nombre, Descripcion) VALUES (@Nombre, @Descripcion)");

    console.log("[INFO] Tipo de montaje agregado correctamente:", Nombre);
    res.status(201).json({ message: "Tipo de montaje agregado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al agregar tipo de montaje:", err);
    res.status(500).json({ message: "Error del servidor al agregar el tipo de montaje." });
  }
});

// ================================
// PUT actualizar tipo de montaje
// ================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { Nombre, Descripcion } = req.body;
  console.log(`[INFO] Solicitud PUT /TiposMontaje/${id} recibida`, req.body);

  if (!Nombre || !Descripcion) {
    console.warn("[WARN] Nombre o descripción faltante en la actualización");
    return res.status(400).json({ message: "Nombre y descripción son campos requeridos." });
  }

  try {
    const pool = await connectDB();
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("Nombre", sql.NVarChar(50), Nombre)
      .input("Descripcion", sql.NVarChar(50), Descripcion)
      .query("UPDATE TiposMontaje SET Nombre = @Nombre, Descripcion = @Descripcion WHERE IdTipoMontaje = @id");

    if (result.rowsAffected[0] === 0) {
      console.warn(`[WARN] Tipo de montaje con ID ${id} no encontrado`);
      return res.status(404).json({ message: "Tipo de montaje no encontrado." });
    }

    console.log(`[INFO] Tipo de montaje con ID ${id} actualizado correctamente`);
    res.json({ message: "Tipo de montaje actualizado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al actualizar tipo de montaje:", err);
    res.status(500).json({ message: "Error del servidor al actualizar el tipo de montaje." });
  }
});

// ================================
// DELETE tipo de montaje
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] Solicitud DELETE /TiposMontaje/${id} recibida`);

  try {
    const pool = await connectDB();

    // Verificar si el tipo de montaje está en uso en Capacidades
    const check = await pool.request()
      .input("id", sql.Int, id)
      .query("SELECT COUNT(*) AS total FROM Capacidades WHERE IdTipoMontaje = @id");

    if (check.recordset[0].total > 0) {
      console.warn(`[WARN] No se puede eliminar, está en uso en Capacidades`);
      return res.status(400).json({
        message: "No se puede eliminar este Tipo de Montaje porque está en uso en Capacidades."
      });
    }

    // Si no está en uso, eliminarlo
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM TiposMontaje WHERE IdTipoMontaje = @id");

    if (result.rowsAffected[0] === 0) {
      console.warn(`[WARN] Tipo de montaje con ID ${id} no encontrado para eliminar`);
      return res.status(404).json({ message: "Tipo de montaje no encontrado." });
    }

    console.log(`[INFO] Tipo de montaje con ID ${id} eliminado correctamente`);
    res.json({ message: "Tipo de montaje eliminado correctamente." });

  } catch (err) {
    console.error("[ERROR] Error al eliminar tipo de montaje:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el tipo de montaje." });
  }
});


module.exports = router;

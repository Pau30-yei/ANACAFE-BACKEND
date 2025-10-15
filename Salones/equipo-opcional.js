const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

// ================================
// GET todos los equipos opcionales
// ================================
router.get("/", async (req, res) => {
  console.log("[INFO] Solicitud GET /EquipoOpcional recibida");
  let client;
  try {
    client = await connectDB();
    const result = await client.query(`
      SELECT 
        idequipo as "IdEquipo",
        nombre as "Nombre",
        descripcion as "Descripcion"
      FROM equipoopcional
    `);
    console.log(`[INFO] Se obtuvieron ${result.rows.length} equipos opcionales`);
    res.json(result.rows);
  } catch (err) {
    console.error("[ERROR] Error al obtener equipos opcionales:", err);
    res.status(500).json({ message: "Error del servidor al obtener equipos opcionales." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    await client.query(
      "INSERT INTO equipoopcional (nombre, descripcion) VALUES ($1, $2)",
      [Nombre, Descripcion]
    );

    console.log("[INFO] Equipo opcional agregado correctamente:", Nombre);
    res.status(201).json({ message: "Equipo opcional agregado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al agregar equipo opcional:", err);
    res.status(500).json({ message: "Error del servidor al agregar el equipo opcional." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    const result = await client.query(
      "UPDATE equipoopcional SET nombre = $1, descripcion = $2 WHERE idequipo = $3",
      [Nombre, Descripcion, id]
    );

    if (result.rowCount === 0) {
      console.warn(`[WARN] Equipo opcional con ID ${id} no encontrado`);
      return res.status(404).json({ message: "Equipo opcional no encontrado." });
    }

    console.log(`[INFO] Equipo opcional con ID ${id} actualizado correctamente`);
    res.json({ message: "Equipo opcional actualizado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al actualizar equipo opcional:", err);
    res.status(500).json({ message: "Error del servidor al actualizar el equipo opcional." });
  } finally {
    if (client) client.release();
  }
});

// ================================
// DELETE equipo opcional
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] Solicitud DELETE /EquipoOpcional/${id} recibida`);

  let client;
  try {
    client = await connectDB();

    // Verificar si el equipo opcional está en uso en SalonEquipoOpcional
    const check = await client.query(
      "SELECT COUNT(*) AS total FROM salonequipoopcional WHERE idequipo = $1",
      [id]
    );

    if (parseInt(check.rows[0].total) > 0) {
      console.warn(`[WARN] No se puede eliminar, está en uso en SalonEquipoOpcional`);
      return res.status(400).json({
        message: "No se puede eliminar este Equipo Opcional porque está en uso en Salones."
      });
    }

    // Si no está en uso, eliminarlo
    const result = await client.query(
      "DELETE FROM equipoopcional WHERE idequipo = $1",
      [id]
    );

    if (result.rowCount === 0) {
      console.warn(`[WARN] Equipo opcional con ID ${id} no encontrado para eliminar`);
      return res.status(404).json({ message: "Equipo opcional no encontrado." });
    }

    console.log(`[INFO] Equipo opcional con ID ${id} eliminado correctamente`);
    res.json({ message: "Equipo opcional eliminado correctamente." });

  } catch (err) {
    console.error("[ERROR] Error al eliminar equipo opcional:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el equipo opcional." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
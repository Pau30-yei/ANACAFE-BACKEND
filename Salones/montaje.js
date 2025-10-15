const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

// ================================
// GET todos los tipos de montaje
// ================================
router.get("/", async (req, res) => {
  console.log("[INFO] Solicitud GET /TiposMontaje recibida");
  let client;
  try {
    client = await connectDB();
    const result = await client.query(`
      SELECT 
        idtipomontaje as "IdTipoMontaje",
        nombre as "Nombre",
        descripcion as "Descripcion"
      FROM tiposmontaje
    `);
    console.log(`[INFO] Se obtuvieron ${result.rows.length} tipos de montaje`);
    res.json(result.rows);
  } catch (err) {
    console.error("[ERROR] Error al obtener tipos de montaje:", err);
    res.status(500).json({ message: "Error del servidor al obtener tipos de montaje." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    await client.query(
      "INSERT INTO tiposmontaje (nombre, descripcion) VALUES ($1, $2)",
      [Nombre, Descripcion]
    );

    console.log("[INFO] Tipo de montaje agregado correctamente:", Nombre);
    res.status(201).json({ message: "Tipo de montaje agregado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al agregar tipo de montaje:", err);
    res.status(500).json({ message: "Error del servidor al agregar el tipo de montaje." });
  } finally {
    if (client) client.release();
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

  let client;
  try {
    client = await connectDB();
    const result = await client.query(
      "UPDATE tiposmontaje SET nombre = $1, descripcion = $2 WHERE idtipomontaje = $3",
      [Nombre, Descripcion, id]
    );

    if (result.rowCount === 0) {
      console.warn(`[WARN] Tipo de montaje con ID ${id} no encontrado`);
      return res.status(404).json({ message: "Tipo de montaje no encontrado." });
    }

    console.log(`[INFO] Tipo de montaje con ID ${id} actualizado correctamente`);
    res.json({ message: "Tipo de montaje actualizado correctamente." });
  } catch (err) {
    console.error("[ERROR] Error al actualizar tipo de montaje:", err);
    res.status(500).json({ message: "Error del servidor al actualizar el tipo de montaje." });
  } finally {
    if (client) client.release();
  }
});

// ================================
// DELETE tipo de montaje
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`[INFO] Solicitud DELETE /TiposMontaje/${id} recibida`);

  let client;
  try {
    client = await connectDB();

    // Verificar si el tipo de montaje está en uso en Capacidades
    const check = await client.query(
      "SELECT COUNT(*) AS total FROM capacidades WHERE idtipomontaje = $1",
      [id]
    );

    if (parseInt(check.rows[0].total) > 0) {
      console.warn(`[WARN] No se puede eliminar, está en uso en Capacidades`);
      return res.status(400).json({
        message: "No se puede eliminar este Tipo de Montaje porque está en uso en Capacidades."
      });
    }

    // Si no está en uso, eliminarlo
    const result = await client.query(
      "DELETE FROM tiposmontaje WHERE idtipomontaje = $1",
      [id]
    );

    if (result.rowCount === 0) {
      console.warn(`[WARN] Tipo de montaje con ID ${id} no encontrado para eliminar`);
      return res.status(404).json({ message: "Tipo de montaje no encontrado." });
    }

    console.log(`[INFO] Tipo de montaje con ID ${id} eliminado correctamente`);
    res.json({ message: "Tipo de montaje eliminado correctamente." });

  } catch (err) {
    console.error("[ERROR] Error al eliminar tipo de montaje:", err);
    res.status(500).json({ message: "Error del servidor al eliminar el tipo de montaje." });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
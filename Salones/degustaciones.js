const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// ================================
// GET todas las degustaciones
// ================================
router.get("/", async (req, res) => {
    console.log("[INFO] Solicitud GET /Degustaciones recibida");
    try {
        const pool = await connectDB();
        const result = await pool.request().query("SELECT * FROM Degustaciones");
        console.log(`[INFO] Se obtuvieron ${result.recordset.length} degustaciones`);
        res.json(result.recordset);
    } catch (err) {
        console.error("[ERROR] Error al obtener degustaciones:", err);
        res.status(500).json({ message: "Error del servidor al obtener degustaciones." });
    }
});

// ================================
// POST agregar una nueva degustacion
// ================================
router.post("/", async (req, res) => {
    const { Nombre } = req.body;
    console.log("[INFO] Solicitud POST /Degustaciones recibida", req.body);

    if (!Nombre) {
        console.warn("[WARN] Nombre faltante en la solicitud");
        return res.status(400).json({ message: "Nombre es un campo requerido." });
    }

    try {
        const pool = await connectDB();
        await pool.request()
            .input("Nombre", sql.NVarChar(50), Nombre)
            .query("INSERT INTO Degustaciones (Nombre) VALUES (@Nombre)");

        console.log("[INFO] Degustación agregada correctamente:", Nombre);
        res.status(201).json({ message: "Degustación agregada correctamente." });
    } catch (err) {
        console.error("[ERROR] Error al agregar degustación:", err);
        res.status(500).json({ message: "Error del servidor al agregar la degustación." });
    }
});

// ================================
// PUT actualizar degustacion
// ================================
router.put("/:id", async (req, res) => {
    const { id } = req.params; // IdDegustacion
    const { Nombre } = req.body;
    console.log(`[INFO] Solicitud PUT /Degustaciones/${id} recibida`, req.body);

    if (!Nombre) {
        console.warn("[WARN] Nombre faltante en la actualización");
        return res.status(400).json({ message: "Nombre es un campo requerido." });
    }

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input("id", sql.Int, id)
            .input("Nombre", sql.NVarChar(50), Nombre)
            .query("UPDATE Degustaciones SET Nombre = @Nombre WHERE IdDegustacion = @id");

        if (result.rowsAffected[0] === 0) {
            console.warn(`[WARN] Degustación con ID ${id} no encontrada`);
            return res.status(404).json({ message: "Degustación no encontrada." });
        }

        console.log(`[INFO] Degustación con ID ${id} actualizada correctamente`);
        res.json({ message: "Degustación actualizada correctamente." });
    } catch (err) {
        console.error("[ERROR] Error al actualizar degustación:", err);
        res.status(500).json({ message: "Error del servidor al actualizar la degustación." });
    }
});

// ================================
// DELETE degustacion con verificación de uso en SalonDegustaciones
// ================================
router.delete("/:id", async (req, res) => {
    const { id } = req.params; // IdDegustacion
    console.log(`[INFO] Solicitud DELETE /Degustaciones/${id} recibida`);

    try {
        const pool = await connectDB();

        // Verificar si la degustación está en uso en SalonDegustaciones
        const check = await pool.request()
            .input("id", sql.Int, id)
            .query("SELECT COUNT(*) AS total FROM SalonDegustaciones WHERE IdDegustacion = @id");

        if (check.recordset[0].total > 0) {
            console.warn(`[WARN] No se puede eliminar, está en uso en SalonDegustaciones`);
            return res.status(400).json({
                message: "No se puede eliminar esta Degustación porque está en uso en SalonDegustaciones."
            });
        }

        // Si no está en uso, eliminarlo
        const result = await pool.request()
            .input("id", sql.Int, id)
            .query("DELETE FROM Degustaciones WHERE IdDegustacion = @id");

        if (result.rowsAffected[0] === 0) {
            console.warn(`[WARN] Degustación con ID ${id} no encontrada para eliminar`);
            return res.status(404).json({ message: "Degustación no encontrada." });
        }

        console.log(`[INFO] Degustación con ID ${id} eliminada correctamente`);
        res.json({ message: "Degustación eliminada correctamente." });

    } catch (err) {
        console.error("[ERROR] Error al eliminar degustación:", err);
        res.status(500).json({ message: "Error del servidor al eliminar la degustación." });
    }
});


module.exports = router;
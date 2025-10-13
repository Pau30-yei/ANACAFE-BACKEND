const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// ===========================================
// GET todas las SalonDegustaciones para un salón
// ===========================================
router.get("/salon/:idSalon", async (req, res) => {
    const { idSalon } = req.params;
    console.log(`[INFO] Solicitud GET /SalonDegustaciones/salon/${idSalon} recibida`);
    
    try {
        const pool = await connectDB();
        // Se realiza un JOIN con Degustaciones para obtener el Nombre
        const query = `
            SELECT 
                SD.[Id], 
                SD.[IdSalon], 
                SD.[IdDegustacion], 
                SD.[Nota],
                D.Nombre AS NombreDegustacion 
            FROM SalonDegustaciones SD
            INNER JOIN Degustaciones D ON SD.IdDegustacion = D.IdDegustacion
            WHERE SD.IdSalon = @idSalon
        `;
        
        const result = await pool.request()
            .input("idSalon", sql.Int, idSalon)
            .query(query);
            
        console.log(`[INFO] Se obtuvieron ${result.recordset.length} SalonDegustaciones para el salón ${idSalon}`);
        res.json(result.recordset);
    } catch (err) {
        console.error("[ERROR] Error al obtener SalonDegustaciones:", err);
        res.status(500).json({ message: "Error del servidor al obtener SalonDegustaciones." });
    }
});

// ================================
// POST agregar un nuevo detalle de degustación
// ================================
router.post("/", async (req, res) => {
    const { IdSalon, IdDegustacion, Nota } = req.body;
    console.log("[INFO] Solicitud POST /SalonDegustaciones recibida", req.body);

    if (!IdSalon || !IdDegustacion) {
        console.warn("[WARN] IdSalon o IdDegustacion faltante en la solicitud");
        return res.status(400).json({ message: "IdSalon y IdDegustacion son campos requeridos." });
    }

    try {
        const pool = await connectDB();
        await pool.request()
            .input("IdSalon", sql.Int, IdSalon)
            .input("IdDegustacion", sql.Int, IdDegustacion)
            .input("Nota", sql.NVarChar(255), Nota) // Asumo NVarChar(255) para Nota
            .query("INSERT INTO SalonDegustaciones (IdSalon, IdDegustacion, Nota) VALUES (@IdSalon, @IdDegustacion, @Nota)");

        console.log("[INFO] Detalle de degustación agregado correctamente");
        res.status(201).json({ message: "Detalle de degustación agregado correctamente." });
    } catch (err) {
        console.error("[ERROR] Error al agregar detalle de degustación:", err);
        res.status(500).json({ message: "Error del servidor al agregar el detalle de degustación." });
    }
});

// ================================
// PUT actualizar detalle de degustación
// ================================
router.put("/:id", async (req, res) => {
    const { id } = req.params; // Id de SalonDegustaciones
    const { IdDegustacion, Nota } = req.body; 
    console.log(`[INFO] Solicitud PUT /SalonDegustaciones/${id} recibida`, req.body);

    if (!IdDegustacion) {
        console.warn("[WARN] IdDegustacion faltante en la actualización");
        return res.status(400).json({ message: "IdDegustacion es un campo requerido." });
    }

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input("id", sql.Int, id)
            .input("IdDegustacion", sql.Int, IdDegustacion)
            .input("Nota", sql.NVarChar(255), Nota)
            .query("UPDATE SalonDegustaciones SET IdDegustacion = @IdDegustacion, Nota = @Nota WHERE Id = @id");

        if (result.rowsAffected[0] === 0) {
            console.warn(`[WARN] Detalle de degustación con ID ${id} no encontrado`);
            return res.status(404).json({ message: "Detalle de degustación no encontrado." });
        }

        console.log(`[INFO] Detalle de degustación con ID ${id} actualizado correctamente`);
        res.json({ message: "Detalle de degustación actualizado correctamente." });
    } catch (err) {
        console.error("[ERROR] Error al actualizar detalle de degustación:", err);
        res.status(500).json({ message: "Error del servidor al actualizar el detalle de degustación." });
    }
});

// ================================
// DELETE detalle de degustación
// ================================
router.delete("/:id", async (req, res) => {
    const { id } = req.params; // Id de SalonDegustaciones
    console.log(`[INFO] Solicitud DELETE /SalonDegustaciones/${id} recibida`);

    try {
        const pool = await connectDB();

        // Se elimina directamente ya que es la tabla de detalle
        const result = await pool.request()
            .input("id", sql.Int, id)
            .query("DELETE FROM SalonDegustaciones WHERE Id = @id");

        if (result.rowsAffected[0] === 0) {
            console.warn(`[WARN] Detalle de degustación con ID ${id} no encontrado para eliminar`);
            return res.status(404).json({ message: "Detalle de degustación no encontrado." });
        }

        console.log(`[INFO] Detalle de degustación con ID ${id} eliminado correctamente`);
        res.json({ message: "Detalle de degustación eliminado correctamente." });

    } catch (err) {
        console.error("[ERROR] Error al eliminar detalle de degustación:", err);
        res.status(500).json({ message: "Error del servidor al eliminar el detalle de degustación." });
    }
});


module.exports = router;
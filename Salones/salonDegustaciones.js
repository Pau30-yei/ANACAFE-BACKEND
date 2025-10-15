const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

// ===========================================
// GET todas las SalonDegustaciones para un salón
// ===========================================
router.get("/salon/:idSalon", async (req, res) => {
    const { idSalon } = req.params;
    console.log(`[INFO] Solicitud GET /SalonDegustaciones/salon/${idSalon} recibida`);
    
    let client;
    try {
        client = await connectDB();
        // Se realiza un JOIN con Degustaciones para obtener el Nombre
        const query = `
            SELECT 
                sd.id as "Id", 
                sd.idsalon as "IdSalon", 
                sd.iddegustacion as "IdDegustacion", 
                sd.nota as "Nota",
                d.nombre as "NombreDegustacion" 
            FROM salondegustaciones sd
            INNER JOIN degustaciones d ON sd.iddegustacion = d.iddegustacion
            WHERE sd.idsalon = $1
        `;
        
        const result = await client.query(query, [idSalon]);
            
        console.log(`[INFO] Se obtuvieron ${result.rows.length} SalonDegustaciones para el salón ${idSalon}`);
        res.json(result.rows);
    } catch (err) {
        console.error("[ERROR] Error al obtener SalonDegustaciones:", err);
        res.status(500).json({ message: "Error del servidor al obtener SalonDegustaciones." });
    } finally {
        if (client) client.release();
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

    let client;
    try {
        client = await connectDB();
        await client.query(
            "INSERT INTO salondegustaciones (idsalon, iddegustacion, nota) VALUES ($1, $2, $3)",
            [IdSalon, IdDegustacion, Nota]
        );

        console.log("[INFO] Detalle de degustación agregado correctamente");
        res.status(201).json({ message: "Detalle de degustación agregado correctamente." });
    } catch (err) {
        console.error("[ERROR] Error al agregar detalle de degustación:", err);
        res.status(500).json({ message: "Error del servidor al agregar el detalle de degustación." });
    } finally {
        if (client) client.release();
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

    let client;
    try {
        client = await connectDB();
        const result = await client.query(
            "UPDATE salondegustaciones SET iddegustacion = $1, nota = $2 WHERE id = $3",
            [IdDegustacion, Nota, id]
        );

        if (result.rowCount === 0) {
            console.warn(`[WARN] Detalle de degustación con ID ${id} no encontrado`);
            return res.status(404).json({ message: "Detalle de degustación no encontrado." });
        }

        console.log(`[INFO] Detalle de degustación con ID ${id} actualizado correctamente`);
        res.json({ message: "Detalle de degustación actualizado correctamente." });
    } catch (err) {
        console.error("[ERROR] Error al actualizar detalle de degustación:", err);
        res.status(500).json({ message: "Error del servidor al actualizar el detalle de degustación." });
    } finally {
        if (client) client.release();
    }
});

// ================================
// DELETE detalle de degustación
// ================================
router.delete("/:id", async (req, res) => {
    const { id } = req.params; // Id de SalonDegustaciones
    console.log(`[INFO] Solicitud DELETE /SalonDegustaciones/${id} recibida`);

    let client;
    try {
        client = await connectDB();

        // Se elimina directamente ya que es la tabla de detalle
        const result = await client.query(
            "DELETE FROM salondegustaciones WHERE id = $1",
            [id]
        );

        if (result.rowCount === 0) {
            console.warn(`[WARN] Detalle de degustación con ID ${id} no encontrado para eliminar`);
            return res.status(404).json({ message: "Detalle de degustación no encontrado." });
        }

        console.log(`[INFO] Detalle de degustación con ID ${id} eliminado correctamente`);
        res.json({ message: "Detalle de degustación eliminado correctamente." });

    } catch (err) {
        console.error("[ERROR] Error al eliminar detalle de degustación:", err);
        res.status(500).json({ message: "Error del servidor al eliminar el detalle de degustación." });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
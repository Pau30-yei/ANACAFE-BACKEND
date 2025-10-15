const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");

// ================================
// GET todos los salones
// ================================
router.get("/", async (req, res) => {
  console.info("[INFO] GET /salones - Inicio de petición");
  let client;
  try {
    client = await connectDB();
    const result = await client.query(`
      SELECT 
    s.idsalon AS "IdSalon",
    s.nombre AS "Nombre",
    STRING_AGG(tc.nombre || ': ' || TO_CHAR(c.monto, 'FM999,999,999.00'), ' | ') AS "CostosConcatenados",
    s.medidalargo AS "MedidaLargo",
    s.medidaancho AS "MedidaAncho",
    COALESCE(CAST(t.tarimalargo AS VARCHAR), 'N/A') AS "TarimaLargo",
    COALESCE(CAST(t.tarimaancho AS VARCHAR), 'N/A') AS "TarimaAncho",
    s.nota AS "Nota",
    s.idestado AS "IdEstado",
    s.fechacreacion AS "FechaCreacion",
    s.fechamodificacion AS "FechaModificacion"
FROM salones s
LEFT JOIN detalletarimaporsalon t ON s.idsalon = t.idsalon
LEFT JOIN costos c ON s.idsalon = c.idsalon
LEFT JOIN tiposcosto tc ON c.idtipocosto = tc.idtipocosto
WHERE s.idestado <> 3
GROUP BY 
    s.idsalon, s.nombre, s.medidalargo, s.medidaancho, 
    t.tarimalargo, t.tarimaancho, 
    s.nota, s.idestado, s.fechacreacion, s.fechamodificacion
ORDER BY s.idsalon
    `);
    console.info(`[INFO] GET /salones - ${result.rows.length} registros obtenidos`);
    res.json(result.rows);  // <-- Esto envía un JSON al frontend
  } catch (err) {
    console.error("[ERROR] GET /salones -", err.message);
    res.status(500).json({ message: err.message });
  } finally {
    if (client) client.release();
  }
});
// ================================
// POST agregar salón
// ================================
router.post("/", async (req, res) => {
  const { nombre, medidaLargo, medidaAncho, aplicaTarima, tarimaLargo, tarimaAncho, nota, idEstado } = req.body;

  let client;
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Inserta salón
    const insertSalon = await client.query(
      `INSERT INTO salones (nombre, medidalargo, medidaancho, nota, idestado)
        VALUES ($1, $2, $3, $4, $5) RETURNING idsalon`,
      [nombre, medidaLargo, medidaAncho, nota, idEstado]
    );

    const newSalonId = insertSalon.rows[0].idsalon;

    // Inserta tarima si aplica
    if (aplicaTarima) {
      await client.query(
        `INSERT INTO detalletarimaporsalon (idsalon, tarimalargo, tarimaancho)
          VALUES ($1, $2, $3)`,
        [newSalonId, tarimaLargo, tarimaAncho]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: "Salón agregado correctamente" });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    if (client) client.release();
  }
});

// ================================
// PUT actualizar salón
// ================================
router.put("/:id", async (req, res) => {
  const id = req.params.id;
  const { nombre, medidaLargo, medidaAncho, aplicaTarima, tarimaLargo, tarimaAncho, nota, idEstado } = req.body;

  let client;
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Actualiza salón
    await client.query(
      `UPDATE salones
        SET nombre = $1,
            medidalargo = $2,
            medidaancho = $3,
            nota = $4,
            idestado = $5,
            fechamodificacion = CURRENT_TIMESTAMP
        WHERE idsalon = $6`,
      [nombre, medidaLargo, medidaAncho, nota, idEstado, id]
    );

    // Actualiza detalle de tarima
    if (aplicaTarima) {
      // Verifica si existe
      const exists = await client.query(
        "SELECT COUNT(*) AS count FROM detalletarimaporsalon WHERE idsalon = $1",
        [id]
      );

      if (parseInt(exists.rows[0].count) > 0) {
        // Actualiza existente
        await client.query(
          `UPDATE detalletarimaporsalon
            SET tarimalargo = $1,
                tarimaancho = $2
            WHERE idsalon = $3`,
          [tarimaLargo, tarimaAncho, id]
        );
      } else {
        // Inserta nuevo
        await client.query(
          `INSERT INTO detalletarimaporsalon (idsalon, tarimalargo, tarimaancho)
            VALUES ($1, $2, $3)`,
          [id, tarimaLargo, tarimaAncho]
        );
      }
    } else {
      // Elimina detalle si no aplica
      await client.query("DELETE FROM detalletarimaporsalon WHERE idsalon = $1", [id]);
    }

    await client.query('COMMIT');
    res.json({ message: "Salón actualizado correctamente" });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally {
    if (client) client.release();
  }
});

// ================================
// DELETE salón (soft delete con validación)
// ================================
router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const usuario = req.body.usuario || "Desconocido";
  let client;
  try {
    client = await connectDB();
    await client.query('BEGIN');

    // Verificar dependencias en Capacidades
    const check = await client.query(
      `SELECT COUNT(*) AS count FROM capacidades WHERE idsalon = $1`,
      [id]
    );

    if (parseInt(check.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: "No se puede eliminar, el salón tiene capacidades asociadas."
      });
    }

    // Obtener datos antes de eliminar para auditoría
    const salon = await client.query("SELECT * FROM salones WHERE idsalon = $1", [id]);

    const datosEliminados = salon.rows[0] ? JSON.stringify(salon.rows[0]) : null;

    // Eliminar físicamente
    await client.query("DELETE FROM salones WHERE idsalon = $1", [id]);

    // Guardar auditoría
    await client.query(
      `INSERT INTO auditoriaeliminaciones
        (usuario, tablaeliminada, idregistroeliminado, datoseleminados)
        VALUES ($1, $2, $3, $4)`,
      [usuario, "Salones", id, datosEliminados]
    );

    await client.query('COMMIT');
    res.json({ message: "Salón eliminado correctamente y auditoría registrada" });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("[ERROR] DELETE /salones -", err.message);
    res.status(500).json({ message: err.message });
  } finally {
    if (client) client.release();
  }
});

router.patch("/toggle/:id", async (req, res) => {
  const id = req.params.id;
  let client;
  try {
    client = await connectDB();
    await client.query(
      `UPDATE salones
        SET idestado = CASE WHEN idestado = 1 THEN 2 ELSE 1 END,
            fechamodificacion = CURRENT_TIMESTAMP
        WHERE idsalon = $1`,
      [id]
    );
    res.json({ message: "Estado actualizado correctamente" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
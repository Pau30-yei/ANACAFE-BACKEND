const express = require("express");
const router = express.Router();
const { connectDB } = require("../database.js");
const sql = require("mssql");

// ================================
// GET todos los salones
// ================================
router.get("/", async (req, res) => {
  console.info("[INFO] GET /salones - Inicio de petición");
  try {
    const pool = await connectDB();
    const result = await pool.request().query(`
      SELECT 
    s.IdSalon,
    s.Nombre,
    STRING_AGG(tc.Nombre + ': ' + FORMAT(c.Monto, 'N2'), ' | ') AS CostosConcatenados,
    s.MedidaLargo,
    s.MedidaAncho,
    ISNULL(CONVERT(VARCHAR(10), t.TarimaLargo), 'N/A') AS TarimaLargo,
    ISNULL(CONVERT(VARCHAR(10), t.TarimaAncho), 'N/A') AS TarimaAncho,
    s.Nota,
    s.IdEstado,
    s.FechaCreacion,
    s.FechaModificacion
FROM Salones s
LEFT JOIN DetalleTarimaPorSalon t ON s.IdSalon = t.IdSalon
LEFT JOIN Costos c ON s.IdSalon = c.IdSalon
LEFT JOIN TiposCosto tc ON c.IdTipoCosto = tc.IdTipoCosto
WHERE s.IdEstado <> 3
GROUP BY 
    s.IdSalon, s.Nombre, s.MedidaLargo, s.MedidaAncho, 
    t.TarimaLargo, t.TarimaAncho, 
    s.Nota, s.IdEstado, s.FechaCreacion, s.FechaModificacion
ORDER BY s.IdSalon
    `);
    console.info(`[INFO] GET /salones - ${result.recordset.length} registros obtenidos`);
    res.json(result.recordset);  // <-- Esto envía un JSON al frontend
  } catch (err) {
    console.error("[ERROR] GET /salones -", err.message);
    res.status(500).json({ message: err.message });
  }
});
// ================================
// POST agregar salón
// ================================
router.post("/", async (req, res) => {
  const { nombre, medidaLargo, medidaAncho, aplicaTarima, tarimaLargo, tarimaAncho, nota, idEstado } = req.body;

  try {
    const pool = await connectDB();

    // Inserta salón
    const insertSalon = await pool.request()
      .input("nombre", nombre)
      .input("medidaLargo", medidaLargo)
      .input("medidaAncho", medidaAncho)
      .input("nota", nota)
      .input("idEstado", idEstado)
      .query(`
        INSERT INTO Salones (Nombre, MedidaLargo, MedidaAncho, Nota, IdEstado)
        OUTPUT INSERTED.IdSalon
        VALUES (@nombre, @medidaLargo, @medidaAncho, @nota, @idEstado)
      `);

    const newSalonId = insertSalon.recordset[0].IdSalon;

    // Inserta tarima si aplica
    if (aplicaTarima) {
      await pool.request()
        .input("idSalon", newSalonId)
        .input("tarimaLargo", tarimaLargo)
        .input("tarimaAncho", tarimaAncho)
        .query(`
          INSERT INTO DetalleTarimaPorSalon (IdSalon, TarimaLargo, TarimaAncho)
          VALUES (@idSalon, @tarimaLargo, @tarimaAncho)
        `);
    }

    res.status(201).json({ message: "Salón agregado correctamente" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ================================
// PUT actualizar salón
// ================================
router.put("/:id", async (req, res) => {
  const id = req.params.id;
  const { nombre, medidaLargo, medidaAncho, aplicaTarima, tarimaLargo, tarimaAncho, nota, idEstado } = req.body;

  try {
    const pool = await connectDB();

    // Actualiza salón
    await pool.request()
      .input("id", id)
      .input("nombre", nombre)
      .input("medidaLargo", medidaLargo)
      .input("medidaAncho", medidaAncho)
      .input("nota", nota)
      .input("idEstado", idEstado)
      .query(`
        UPDATE Salones
        SET Nombre = @nombre,
            MedidaLargo = @medidaLargo,
            MedidaAncho = @medidaAncho,
            Nota = @nota,
            IdEstado = @idEstado,
            FechaModificacion = GETDATE()
        WHERE IdSalon = @id
      `);

    // Actualiza detalle de tarima
    if (aplicaTarima) {
      // Verifica si existe
      const exists = await pool.request()
        .input("idSalon", id)
        .query("SELECT COUNT(*) AS count FROM DetalleTarimaPorSalon WHERE IdSalon = @idSalon");

      if (exists.recordset[0].count > 0) {
        // Actualiza existente
        await pool.request()
          .input("idSalon", id)
          .input("tarimaLargo", tarimaLargo)
          .input("tarimaAncho", tarimaAncho)
          .query(`
            UPDATE DetalleTarimaPorSalon
            SET TarimaLargo = @tarimaLargo,
                TarimaAncho = @tarimaAncho
            WHERE IdSalon = @idSalon
          `);
      } else {
        // Inserta nuevo
        await pool.request()
          .input("idSalon", id)
          .input("tarimaLargo", tarimaLargo)
          .input("tarimaAncho", tarimaAncho)
          .query(`
            INSERT INTO DetalleTarimaPorSalon (IdSalon, TarimaLargo, TarimaAncho)
            VALUES (@idSalon, @tarimaLargo, @tarimaAncho)
          `);
      }
    } else {
      // Elimina detalle si no aplica
      await pool.request()
        .input("idSalon", id)
        .query("DELETE FROM DetalleTarimaPorSalon WHERE IdSalon = @idSalon");
    }

    res.json({ message: "Salón actualizado correctamente" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ================================
// DELETE salón (soft delete con validación)
// ================================
router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const usuario = req.body.usuario || "Desconocido";
  try {
    const pool = await connectDB();

    // Verificar dependencias en Capacidades
    const check = await pool.request()
      .input("id", id)
      .query(`SELECT COUNT(*) AS count FROM Capacidades WHERE IdSalon = @id`);

    if (check.recordset[0].count > 0) {
      return res.status(400).json({
        message: "No se puede eliminar, el salón tiene capacidades asociadas."
      });
    }

    // Obtener datos antes de eliminar para auditoría
    const salon = await pool.request()
      .input("id", id)
      .query("SELECT * FROM Salones WHERE IdSalon = @id");

    const datosEliminados = salon.recordset[0] ? JSON.stringify(salon.recordset[0]) : null;

    // Eliminar físicamente
    await pool.request()
      .input("id", id)
      .query("DELETE FROM Salones WHERE IdSalon = @id");

    // Guardar auditoría
    await pool.request()
      .input("usuario", usuario)
      .input("tabla", "Salones")
      .input("idRegistro", id)
      .input("datos", datosEliminados)
      .query(`
        INSERT INTO AuditoriaEliminaciones
        (Usuario, TablaEliminada, IdRegistroEliminado, DatosEliminados)
        VALUES (@usuario, @tabla, @idRegistro, @datos)
      `);

    res.json({ message: "Salón eliminado correctamente y auditoría registrada" });
  } catch (err) {
    console.error("[ERROR] DELETE /salones -", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.patch("/toggle/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const pool = await connectDB();
    await pool.request()
      .input("id", id)
      .query(`
        UPDATE Salones
        SET IdEstado = CASE WHEN IdEstado = 1 THEN 2 ELSE 1 END,
            FechaModificacion = GETDATE()
        WHERE IdSalon = @id
      `);
    res.json({ message: "Estado actualizado correctamente" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

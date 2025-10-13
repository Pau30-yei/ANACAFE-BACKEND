const express = require('express');
const cors = require('cors');
const app = express();
const loginRouter = require('./Login/login');
const salonesRouter = require('./Salones/salones'); 
const capacidadsRouter = require('./Salones/capacidades'); 
const montajeRouter = require('./Salones/montaje'); 
const inicioRouter = require('./Inicio/inicio'); 
const gestionUsuarios = require('./gestionUsuarios/usuarios'); 
const gestionModulos = require('./Modulos/modulos'); 
const serviciosRouter = require('./Salones/servicios'); 
const SalonServiciosRouter = require('./Salones/salonServicios'); 
const DegustacionRouter = require('./Salones/degustaciones'); 
const SalonDegustacionRouter = require('./Salones/salonDegustaciones'); 
const EquipacionRouter = require('./Salones/equipo-opcional'); 
const SalonEquipacionRouter = require('./Salones/salon-equipo-opcional'); 
const TipoCostoRouter = require('./Salones/tipo-costo'); 
const CostosRouter= require('./Salones/costo');
const SolicitudReserva= require('./Reservas/reservas');
const Pilotos=require('./Pilotos/asignaciones');
require('dotenv').config();

app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true
}));

app.use(express.json());
app.use('/login', loginRouter);
app.use('/inicio', inicioRouter); 
app.use('/usuarios',gestionUsuarios);
app.use('/modulos',gestionModulos);
app.use('/salones', salonesRouter); 
app.use('/capacidades', capacidadsRouter); 
app.use('/montaje', montajeRouter); 
app.use('/servicios', serviciosRouter); 
app.use('/salonServicios', SalonServiciosRouter); 
app.use('/degustaciones', DegustacionRouter); 
app.use('/salonDegustaciones', SalonDegustacionRouter); 
app.use('/equipo-opcional', EquipacionRouter); 
app.use('/salon-equipo-opcional', SalonEquipacionRouter); 
app.use('/tipo-costo', TipoCostoRouter); 
app.use('/costo', CostosRouter); 
app.use('/reservas',SolicitudReserva);
app.use('/asignaciones',Pilotos);
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
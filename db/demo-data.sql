-- Café Aroma & Código — datos de ejemplo (opcional)
-- Ejecutar UNA sola vez, después de db/schema.sql o de `npm run db:init`.
-- Sirve para probar el panel de administración con mensajes de muestra.

insert into contact_messages
  (motivo, nombre, correo, telefono, mensaje, estado)
values
  (
    'reserva',
    'Marta Ruiz',
    'marta.ruiz@example.com',
    '+54 11 4444 5555',
    'Quisiera reservar la mesa larga para seis personas el viernes a las 19.',
    'nuevo'
  ),
  (
    'consulta',
    'Leo Fernández',
    'leo.fernandez@example.com',
    null,
    '¿Tienen opciones sin gluten para el desayuno?',
    'leido'
  ),
  (
    'sugerencia',
    'Ana Gómez',
    'ana.gomez@example.com',
    null,
    'Estaría bueno tener más enchufes en la mesa del fondo.',
    'respondido'
  );

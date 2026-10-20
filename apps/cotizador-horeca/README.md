# Bogati HORECA

Cotizador comercial independiente, preparado para Vercel. Interfaz en español, responsive, sin dependencias de instalación. Requiere Node.js 22 o superior.

## Abrir localmente

Desde esta carpeta: `npm start`. Abrir http://localhost:4173.

La configuración y cotizaciones se guardan en `data/state.json`, en el servidor; el borrador se conserva en el navegador. Mantener un respaldo de `data/`. Este servidor local escucha solo en la computadora donde se ejecuta. No implica sincronización con otros equipos.

## Reglas comerciales

- Tradicional: $3/L sin IVA. Premium: $3,50/L sin IVA. IVA inicial configurable: 15%.
- Presentaciones configurables: 3,5 / 5 / 12 L.
- Pedido mínimo 20 L. Se suman los litros de todos los sabores para determinar el rango automáticamente.
- Rangos iniciales: desde 20, 30, 50, 80, 100, 150 y 200 L. Los límites superiores son exclusivos: 79,5 L pertenece al rango desde 50 hasta menos de 80.
- Logística opcional. Flete fijo: un cargo por pedido. Prorrateado: flete con IVA / mínimo del rango × litros reales del pedido. Puede recuperar más que el flete base.
- Fletes ingresados con IVA. Se conserva su valor con IVA si cambia la tasa general.
- Cálculo monetario conciliado a centavos. El precio unitario mostrado es referencial redondeado; los subtotales y el total son los importes cobrables. Distribución de residuos por mayor resto.
- Sin rentabilidad ni costos internos. Descuentos desactivados en configuración y fuera de la interfaz.
- La asignación inicial de categorías sigue el catálogo de fábrica del archivo original; revisar en Configuración antes del uso comercial.
- Datos del cliente opcionales; el modo «Sin datos del cliente» los omite del PDF. Los demás campos vacíos también se omiten.
- Emitir guarda una copia inmutable de los importes y datos, asigna número y abre el documento imprimible. El PDF se obtiene con «Guardar como PDF» del navegador. No se envía automáticamente por correo o WhatsApp.

## Configuración y concurrencia

Todos los usuarios con acceso pueden editar. Los cambios se guardan explícitamente. Se rechaza un guardado si otra persona cambió la versión desde su lectura; actualizar antes de reintentar. Antes de emitir también se comprueba que el precio corresponda a la versión vigente. Importación/exportación JSON con validación; importación requiere guardar para aplicarse.

## Desplegar en Vercel

El proyecto incluye `vercel.json`, recursos públicos y la función `/api`. Importar esta carpeta como proyecto independiente, con preset Other. No requiere dependencias externas.

Configurar estas variables de entorno antes de usarlo en producción:

- `APP_PASSWORD`: clave de acceso compartida del equipo. En Vercel el servicio permanece bloqueado sin esta clave.
- `SUPABASE_URL`: URL del proyecto de Supabase.
- `SUPABASE_SECRET_KEY`: clave privada del servidor (`sb_secret_...`). Como alternativa, se admite `SUPABASE_SERVICE_ROLE_KEY` para una clave JWT heredada. Nunca usar un prefijo `NEXT_PUBLIC_` para estas claves.

Ejecutar primero `supabase/migrations/202610200001_horeca.sql` en el SQL Editor. Crea las tablas `horeca_config` y `horeca_quotes`, con RLS y permisos limitados al servidor. No otorga acceso a visitantes ni a usuarios del navegador. Las funciones verifican la revisión y aplican cada guardado de manera atómica. Una cotización emitida conserva su copia de datos. Se reservan identificadores opcionales de cliente y vendedor para la futura integración con Brain, sin asumir tablas externas.

El adaptador de Redis anterior se conserva como alternativa cuando no se configura Supabase. Sin almacenamiento remoto configurado, Vercel no permite operar para evitar guardar en un disco temporal. En desarrollo local se mantiene `data/state.json`.

La contraseña del equipo es el acceso inicial; las cuentas individuales y la auditoría por vendedor siguen pendientes. El historial se obtiene completo y necesitará paginación cuando aumente el volumen. La instalación local no migra automáticamente sus documentos o precios a Supabase: el proyecto nuevo inicia con los valores del catálogo de fábrica; se puede importar un respaldo de configuración y guardarlo.

La conexión real y el SQL se verifican después de configurar las variables y desplegar. Las pruebas locales del adaptador usan respuestas simuladas y no confirman por sí solas el acceso a una base remota.

## Verificación

`npm test`: reglas de negocio, rangos, 68 L, flete, IVA, validación y conciliación de centavos.

`npm run build`: comprobación de sintaxis de los archivos del proyecto.

### Protección de ediciones pendientes

Entrar a Configuración sin editar no cambia nada. Cada edición se registra desde la primera pulsación y se respalda como borrador local, sin modificar los precios vigentes. Al salir se puede guardar, seguir editando o descartar. Cerrar o recargar solicita la advertencia nativa del navegador cuando este la admite; al volver se recupera el borrador. Un error de validación o guardado conserva la edición y muestra el error. Si el servidor tiene otra revisión, el guardado se rechaza y el borrador se puede exportar antes de descartarlo y cargar los valores actuales. Mientras se guarda, se bloquean cambios adicionales y navegación interna.


## Lista de sabores y precios

La sección Lista de precios genera un documento comercial sin cantidades ni total de pedido. Permite todos los sabores o una selección, todas las presentaciones o una, precios de todos los rangos o uno, y logística desactivada, fija o prorrateada. Solo el modo prorrateado muestra el beneficio de volumen y compara tarifas por rango. Los precios finales con IVA son protagonistas, con valores sin IVA secundarios. El flete fijo se muestra una vez por pedido fuera de los precios de producto. Los límites de rango conservan los inicios del catálogo completo incluso al mostrar un solo rango. La selección se conserva en el navegador. El documento es referencial, lleva fecha y vigencia y se imprime con el mismo diálogo PDF del cotizador; no se registra como una cotización emitida.


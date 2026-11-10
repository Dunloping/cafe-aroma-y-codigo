# Café Aroma & Código

Landing page de una cafetería de barrio, ahora con **formulario de contacto y buzón de
sugerencias** que guarda cada mensaje en **PostgreSQL**. El sitio se despliega en
**Vercel** como sitio estático + una función serverless que escribe en la base.

**Sitio publicado:** <https://cafe-aroma-y-codigo.vercel.app>

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | HTML5 semántico, CSS externo (sin framework), JavaScript sin dependencias |
| Backend | Función serverless de Node.js (`api/contact.js`) |
| Base de datos | PostgreSQL (Neon, Supabase, Railway o local) con `pg` |
| Deploy | Vercel (estático + función) |
| Tests | `node --test` (runner nativo de Node) |

## Estructura

```
.
├── index.html            # Landing page (una sola página)
├── css/styles.css        # Estilos, mobile-first
├── js/main.js            # Menú móvil, animaciones y envío del formulario
├── api/
│   └── contact.js        # POST /api/contact (validación + inserción SQL)
├── lib/
│   ├── db.js             # Pool de PostgreSQL reutilizado entre invocaciones
│   └── validation.js     # Normalización y validación del payload
├── db/schema.sql         # Tabla contact_messages, índices y constraints
├── scripts/init-db.js    # Aplica el esquema (npm run db:init)
├── tests/api.test.js     # Tests del endpoint y de la validación
├── env.example           # Variables de entorno de referencia
└── vercel.json           # Configuración de la función y headers de seguridad
```

## 1. Base de datos

Se recomienda **Neon** por su plan gratuito y porque se integra con Vercel desde el
Marketplace. Cualquier PostgreSQL con una URL de conexión sirve (Supabase, Railway,
un Postgres local, etc.).

1. Crear un proyecto en [neon.com](https://neon.com) (o instalar la integración
   **Neon** desde el Marketplace de Vercel).
2. Copiar la cadena de conexión **pooled** (`...-pooler...`) con `sslmode=require`.
3. Crear `.env.local`:

   ```powershell
   Copy-Item env.example .env.local
   # editar .env.local y pegar DATABASE_URL
   ```

4. Aplicar el esquema:

   ```bash
   npm install
   npm run db:init
   ```

   Debe imprimir `✔ Esquema aplicado: tabla contact_messages lista.`

### Tabla `contact_messages`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | bigint identity | Clave primaria |
| `motivo` | text | `reserva`, `consulta` o `sugerencia` |
| `nombre` | text | 2–80 caracteres |
| `correo` | text | Hasta 120 caracteres |
| `telefono` | text | Opcional, hasta 30 |
| `mensaje` | text | 10–1000 caracteres |
| `estado` | text | `nuevo`, `leido`, `respondido` |
| `ip_hash` | text | SHA-256 de la IP con sal (nunca se guarda la IP) |
| `user_agent` | text | Hasta 300 caracteres |
| `creado_en` | timestamptz | `now()` |

Consultas útiles:

```sql
-- Últimos mensajes
select id, motivo, nombre, correo, mensaje, estado, creado_en
  from contact_messages
 order by creado_en desc
 limit 20;

-- Marcar como respondido
update contact_messages set estado = 'respondido' where id = 1;

-- Cantidad por motivo
select motivo, count(*) from contact_messages group by motivo;
```

## 2. Desarrollo local

La landing se puede abrir con doble clic, pero el formulario necesita la función
serverless. Hay dos formas de levantar todo junto:

```bash
# Opción A — servidor propio, funciona en Windows sin permisos de symlink
npm run dev:local       # http://127.0.0.1:3001

# Opción B — Vercel CLI (falla en Windows si no está activado el modo desarrollador)
npm install -g vercel   # una sola vez
vercel login
npm run dev:vercel
```

Ambos leen `.env.local`, sirven `index.html` y montan `/api/contact` contra la base
real. `dev:local` solo expone `index.html`, `css/` y `js/`, nunca `.env.local` ni
`node_modules`.

## 3. API

### `POST /api/contact`

Acepta JSON (fetch del navegador) o `application/x-www-form-urlencoded` (formulario
nativo, sin JavaScript).

```json
{
  "motivo": "sugerencia",
  "nombre": "Ana Gómez",
  "correo": "ana@ejemplo.com",
  "telefono": "+54 11 5555 0123",
  "mensaje": "Estaría bueno tener más enchufes en la mesa del fondo.",
  "consent": "on"
}
```

| Código | Significado |
| --- | --- |
| `201` | Mensaje guardado (devuelve `{ ok: true, id }`) |
| `303` | Formulario nativo: redirige a `/?enviado=1#contacto` |
| `400` | Validación: devuelve `fields` con el error por campo |
| `413` | Payload mayor a 8 KB |
| `429` | Más de 5 mensajes desde una misma IP en 10 minutos |
| `500` | Base no configurada o error de escritura (mensaje genérico) |

Protecciones implementadas: consultas parametrizadas, validación y normalización en
servidor, límite de tamaño, honeypot (`website`), rate limit por hash de IP y
`Cache-Control: no-store`. Los logs nunca incluyen el contenido del mensaje.

## 4. Deploy en Vercel

```bash
npm install -g vercel
vercel login
vercel          # preview
vercel --prod   # producción
```

Luego, en **Project → Settings → Environment Variables**, agregar para
*Production* y *Preview*:

- `DATABASE_URL`
- `PGSSL` (`require`, o `disable` para un Postgres local sin TLS)
- `IP_HASH_SALT` (cadena aleatoria larga)

Volver a desplegar para que la función tome las variables:

```bash
vercel --prod
```

Si se instala Neon desde el Marketplace de Vercel, la variable `DATABASE_URL` se
inyecta automáticamente.

## 5. Repositorio en GitHub

```bash
git init -b main
git add .
git commit -m "feat: landing page with PostgreSQL contact form"
gh repo create cafe-aroma-y-codigo --public --source=. --push
```

Sin `gh`:

1. Crear el repositorio vacío en GitHub (sin README ni .gitignore).
2. `git remote add origin https://github.com/USUARIO/cafe-aroma-y-codigo.git`
3. `git push -u origin main`

Para que Vercel despliegue en cada push: **Add New → Project → Import Git
Repository**, elegir el repo y configurar las variables de entorno.

## 6. Verificación

```bash
npm test
```

8 tests: métodos no permitidos, errores por campo, honeypot, payload grande, respuesta
sin base configurada, redirección del formulario nativo y normalización de datos.

Auditoría Lighthouse de la landing: 100 en accesibilidad, buenas prácticas y SEO.

## Notas

- Precios, dirección y testimonios son ficticios.
- El formulario pide consentimiento explícito y no comparte datos con terceros.
- Sin JavaScript la página sigue siendo navegable y el formulario se envía igual,
  volviendo a la página con un aviso.

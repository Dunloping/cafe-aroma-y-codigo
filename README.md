# Café Aroma & Código

Landing page de una cafetería de barrio con **formulario de contacto y buzón de
sugerencias** que guarda cada mensaje en **PostgreSQL**, más un **panel de
administración** protegido para leerlos y marcarlos como leídos o respondidos.

**Sitio publicado:** <https://cafe-aroma-y-codigo.vercel.app>
**Panel:** <https://cafe-aroma-y-codigo.vercel.app/admin.html>
**Repositorio:** <https://github.com/Dunloping/cafe-aroma-y-codigo>

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | HTML5 semántico, CSS externo (sin framework), JavaScript sin dependencias |
| Backend | Funciones serverless de Node.js (`api/contact.js`, `api/admin/*`) |
| Base de datos | PostgreSQL (Neon, Supabase, Railway o local) con `pg` |
| Autenticación | Contraseña con scrypt + cookie de sesión firmada (HMAC) |
| Deploy | Vercel (estático + funciones) |
| Tests | `node --test` (runner nativo de Node) |

## Estructura

```
.
├── index.html              # Landing page (una sola página)
├── admin.html              # Panel de mensajes (no indexado)
├── css/
│   ├── styles.css          # Estilos de la landing, mobile-first
│   └── admin.css           # Estilos del panel
├── js/
│   ├── main.js             # Menú móvil, animaciones y envío del formulario
│   └── admin.js            # Login, filtros y cambio de estado
├── api/
│   ├── contact.js          # POST /api/contact
│   └── admin/
│       ├── login.js        # POST /api/admin/login
│       ├── logout.js       # POST /api/admin/logout
│       └── messages.js     # GET / PATCH /api/admin/messages
├── lib/
│   ├── auth.js             # Hash scrypt, token HMAC y cookies
│   ├── db.js               # Pool de PostgreSQL reutilizado entre invocaciones
│   ├── http.js             # Parseo de body y helpers de texto
│   ├── ip.js               # Hash de IP con sal
│   └── validation.js       # Normalización y validación del formulario
├── db/schema.sql           # Tablas, índices y constraints
├── scripts/
│   ├── init-db.js          # Aplica el esquema (npm run db:init)
│   ├── dev-server.mjs      # Servidor local para Windows (npm run dev:local)
│   └── hash-password.mjs   # Genera ADMIN_PASSWORD_HASH
├── tests/                  # 21 tests (API pública, admin y auth)
├── env.example             # Variables de entorno de referencia
├── robots.txt              # Excluye /admin.html y /api/
└── vercel.json             # Función, headers de seguridad y noindex
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

   El script crea `contact_messages` y `admin_login_attempts`.

### Tablas

`contact_messages`

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

`admin_login_attempts` registra los intentos fallidos del panel para el rate limit
(IP hasheada + fecha). Las filas de más de dos días se limpian solas en cada login.

Consultas útiles:

```sql
-- Últimos mensajes
select id, motivo, nombre, correo, mensaje, estado, creado_en
  from contact_messages
 order by creado_en desc
 limit 20;

-- Marcar como respondido
update contact_messages set estado = 'respondido' where id = 1;

-- Cantidad por estado
select estado, count(*) from contact_messages group by estado;
```

## 2. Desarrollo local

La landing se puede abrir con doble clic, pero el formulario y el panel necesitan las
funciones serverless. Hay dos formas de levantar todo junto:

```bash
# Opción A — servidor propio, funciona en Windows sin permisos de symlink
npm run dev:local       # http://127.0.0.1:3001

# Opción B — Vercel CLI (falla en Windows si no está activado el modo desarrollador)
npm install -g vercel   # una sola vez
vercel login
npm run dev:vercel
```

Ambos leen `.env.local`, sirven `index.html` y `admin.html`, y montan `/api/*` contra
la base real. `dev:local` solo expone los archivos públicos: nunca `.env.local`,
`node_modules` ni `scripts/`.

## 3. API pública

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

Protecciones: consultas parametrizadas, validación y normalización en servidor,
límite de tamaño, honeypot (`website`), rate limit por hash de IP y
`Cache-Control: no-store`. Los logs nunca incluyen el contenido del mensaje.

## 4. Panel de administración

Entrar a `/admin.html` con la contraseña del local (se comparte por fuera del
repositorio). El panel muestra:

- Totales por estado (nuevo, leído, respondido).
- Filtros por estado y motivo, y búsqueda por nombre, correo o mensaje.
- El mensaje completo con enlace `mailto:` para responder.
- Botones para marcar leído, respondido o reabrir.

### Cómo funciona la seguridad

| Medida | Detalle |
| --- | --- |
| Contraseña | Hash **scrypt** en `ADMIN_PASSWORD_HASH` (`sal:hash`); nunca se guarda en claro |
| Sesión | Cookie `HttpOnly`, `SameSite=Strict`, `Secure` en Vercel, 8 horas |
| Firma | HMAC-SHA256 del vencimiento con `ADMIN_SESSION_SECRET` (mínimo 32 caracteres) |
| Rate limit | 10 intentos fallidos cada 15 minutos por IP hasheada |
| CSRF | `SameSite=Strict` + verificación de `Origin` en `PATCH` |
| Indexación | `noindex` en la página, `X-Robots-Tag` y `robots.txt` |

El token no se guarda en la base: se valida la firma en cada request, así que el panel
funciona igual con varias instancias serverless.

### Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/admin/login` | Valida la contraseña y setea la cookie |
| `POST` | `/api/admin/logout` | Borra la cookie |
| `GET` | `/api/admin/messages` | Lista con `estado`, `motivo`, `q` y `limit` (máx. 100) |
| `PATCH` | `/api/admin/messages` | `{ "id": 4, "estado": "respondido" }` |

Sin cookie válida devuelven `401`; sin configuración de admin, `503`.

### Cambiar la contraseña

```bash
npm run hash-password
# pegar el hash en Vercel:
vercel env add ADMIN_PASSWORD_HASH production --sensitive --force
vercel env add ADMIN_PASSWORD_HASH preview --sensitive --force
vercel env add ADMIN_PASSWORD_HASH development --sensitive --force
vercel --prod
```

## 5. Deploy en Vercel

```bash
npm install -g vercel
vercel login
vercel          # preview
vercel --prod   # producción
```

Variables de entorno (Production, Preview y Development):

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Conexión Postgres (la inyecta la integración de Neon) |
| `IP_HASH_SALT` | Sal para hashear IPs del formulario y del login |
| `ADMIN_PASSWORD_HASH` | Hash scrypt de la contraseña del panel |
| `ADMIN_SESSION_SECRET` | Secreto de firma de la cookie (32+ caracteres) |
| `PGSSL` | Opcional: `disable` solo para un Postgres local sin TLS |

Si se instala Neon desde el Marketplace, `DATABASE_URL` se inyecta automáticamente.

## 6. Repositorio en GitHub

```bash
git init -b main
git add .
git commit -m "feat: landing page with PostgreSQL contact form"
gh repo create cafe-aroma-y-codigo --public --source=. --push
```

Sin `gh`: crear el repositorio vacío en GitHub (sin README ni .gitignore), luego
`git remote add origin https://github.com/USUARIO/cafe-aroma-y-codigo.git` y
`git push -u origin main`.

Para que Vercel despliegue en cada push: **Add New → Project → Import Git
Repository**, elegir el repo y configurar las variables.

## 7. Verificación

```bash
npm test
```

21 tests: validación del formulario, honeypot, payload grande, formulario nativo,
hash y sesión del panel, login correcto/incorrecto, cookie `HttpOnly`, logout y
permisos de los endpoints.

Auditoría Lighthouse de la landing: 100 en accesibilidad, buenas prácticas y SEO.

## Notas

- Precios, dirección y testimonios son ficticios.
- El formulario pide consentimiento explícito y no comparte datos con terceros.
- Sin JavaScript la página sigue siendo navegable y el formulario se envía igual,
  volviendo a la página con un aviso.
- La contraseña del panel no se versiona: vive en Vercel como secreto.

# Proyecto: App personal de productividad

## Qué es esto

Aplicación web personal, para un solo usuario (el dueño del proyecto). No es un
producto comercial: no hay cuentas, no hay registro, no hay otros usuarios.
Cualquier decisión de diseño debe optimizar para simplicidad y para que una sola
persona la mantenga, no para escalar.

Visión a largo plazo: habit tracker + mentor + guía creativa + gestor de finanzas
personales, con una capa de IA que analiza el historial real y da sugerencias.

**Nada de eso se construye todavía.** Ver "Alcance de la versión 1".

## Stack

- React + TypeScript
- Vite como bundler
- Tailwind CSS para estilos
- Almacenamiento local en el navegador (ver "Datos")
- Sin backend en la v1

Diseñada para usarse en celular y en computadora: layout responsive, pensado
primero para pantalla pequeña. Más adelante se convertirá en PWA instalable.

## Alcance de la versión 1

La v1 hace exactamente esto y nada más:

1. Ver la lista de hábitos del día.
2. Marcar un hábito como hecho o no hecho con un solo toque.
3. Crear, editar y eliminar hábitos (eliminar = archivar; ver «Datos»).
4. Ver la semana actual: una cuadrícula de hábitos x días con lo cumplido.

### Fuera de alcance en la v1

No implementar, ni siquiera "por si acaso":

- Rachas, estadísticas, porcentajes o gráficos
- Categorías, etiquetas o carpetas de hábitos
- Recordatorios o notificaciones
- Cualquier función de IA o sugerencias
- Módulo de ideas
- Módulo de finanzas
- Sincronización entre dispositivos
- Cuentas de usuario o login
- Modo oscuro / temas
- Animaciones elaboradas

Si algo de esta lista parece necesario, se discute antes de escribirlo.

## Datos

### Regla central

Todo acceso a datos pasa por **un solo módulo** (`src/data/`). Ningún componente
lee ni escribe almacenamiento directamente. Esto existe para que cambiar de
almacenamiento local a una base de datos sincronizada más adelante sea un cambio
contenido en un solo lugar.

### Modelo

Dos entidades:

**Habit** — la definición de un hábito.

| Campo       | Tipo    | Notas                                    |
|-------------|---------|------------------------------------------|
| `id`        | string  | Identificador único                       |
| `name`      | string  | Nombre visible                            |
| `createdAt` | string  | Fecha ISO                                 |
| `archived`  | boolean | Los hábitos no se borran, se archivan     |
| `order`     | number  | Orden en la lista                         |

**HabitEntry** — un registro de un día concreto.

| Campo     | Tipo    | Notas                                     |
|-----------|---------|-------------------------------------------|
| `id`      | string  | Identificador único                        |
| `habitId` | string  | Referencia al hábito                       |
| `date`    | string  | `YYYY-MM-DD`, fecha local                  |
| `done`    | boolean | Cumplido o no                              |

### Por qué así

- **Los registros son inmutables por fecha.** Nunca se sobrescribe el historial
  al editar un hábito. Si el hábito cambia de nombre, los registros pasados
  siguen siendo válidos. Esto es lo que hará posible el análisis con IA después.
- **Archivar en vez de borrar.** Borrar un hábito destruiría su historial. La
  regla es archivar: el botón de la interfaz puede decir «Eliminar», pero por
  dentro marca `archived: true`. El hábito y sus `HabitEntry` nunca se destruyen;
  solo dejan de aparecer en las listas activas.
- **Fechas como texto `YYYY-MM-DD`, no como `Date`.** Evita errores de zona
  horaria, que son la fuente número uno de bugs en apps de seguimiento diario.
- **Ausencia ≠ incumplimiento.** Si no hay registro para un día, ese día está sin
  responder, que no es lo mismo que "no lo hice". La interfaz debe distinguir los
  tres estados: hecho, no hecho, sin responder.

## Cómo trabajar en este proyecto

- Construir en pasos pequeños y verificables. Después de cada paso, el proyecto
  debe poder ejecutarse.
- Explicar qué hace cada pieza antes de pasar a la siguiente. El dueño del
  proyecto debe entender el código, no solo tenerlo.
- Preguntar antes de añadir dependencias nuevas.
- Preguntar antes de añadir cualquier cosa que no esté en el alcance de la v1.
- Hacer commit de git en cada paso que funcione.

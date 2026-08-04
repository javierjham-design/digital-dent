// Divide un script SQL en sentencias por el `;` de nivel superior, respetando lo que
// un `sql.split(';')` ingenuo partiría al medio: strings entre comillas simples (con
// escape `''`), bloques dollar-quoted (`$tag$ … $tag$`) y comentarios (`-- …` de línea
// y `/* … */` de bloque).
//
// El init.sql que genera Prisma HOY no trae funciones, triggers ni defaults con `;`,
// así que el split ingenuo alcanzaba. Pero es frágil: el día que el schema tenga un
// default con `;`, un CHECK con `;`, o una función, la provisión de clínicas nuevas se
// rompería en silencio. Este splitter lo hace robusto de una vez. Lo usa
// applyTenantSchema() en lib/provision.ts.
export function splitSqlStatements(sql: string): string[] {
  const stmts: string[] = []
  let cur = ''
  let i = 0
  const n = sql.length

  while (i < n) {
    const ch = sql[i]
    const next = sql[i + 1]

    // Comentario de línea: -- … hasta el fin de línea.
    if (ch === '-' && next === '-') {
      const eol = sql.indexOf('\n', i)
      const end = eol === -1 ? n : eol
      cur += sql.slice(i, end)
      i = end
      continue
    }
    // Comentario de bloque: /* … */
    if (ch === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2)
      const end = close === -1 ? n : close + 2
      cur += sql.slice(i, end)
      i = end
      continue
    }
    // String entre comillas simples, con escape '' (dos comillas = una literal).
    if (ch === "'") {
      cur += ch
      i++
      while (i < n) {
        cur += sql[i]
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { cur += sql[i + 1]; i += 2; continue }
          i++
          break
        }
        i++
      }
      continue
    }
    // Dollar-quote: $tag$ … $tag$ (tag opcional). Todo el cuerpo es literal.
    if (ch === '$') {
      const m = /^\$[a-zA-Z_]*\$/.exec(sql.slice(i))
      if (m) {
        const tag = m[0]
        const close = sql.indexOf(tag, i + tag.length)
        const end = close === -1 ? n : close + tag.length
        cur += sql.slice(i, end)
        i = end
        continue
      }
    }
    // Separador de sentencias (fuera de string/comentario/dollar-quote).
    if (ch === ';') {
      stmts.push(cur.trim())
      cur = ''
      i++
      continue
    }
    cur += ch
    i++
  }
  if (cur.trim()) stmts.push(cur.trim())

  // Descartar lo que quede solo con comentarios/espacios (p. ej. el `-- comentario`
  // final tras el último `;`). Se filtra sobre una versión sin comentarios, pero se
  // EJECUTA la sentencia original (Postgres acepta comentarios al inicio).
  return stmts.filter((s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0)
}

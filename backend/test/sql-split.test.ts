import { describe, it, expect } from 'vitest'
import { splitSqlStatements } from '@/lib/sql-split'

describe('splitSqlStatements', () => {
  it('separa sentencias por ; de nivel superior', () => {
    expect(splitSqlStatements('CREATE TABLE a (id int); CREATE INDEX i ON a(id);'))
      .toEqual(['CREATE TABLE a (id int)', 'CREATE INDEX i ON a(id)'])
  })

  it('NO parte un ; dentro de un string entre comillas simples', () => {
    const sql = `ALTER TABLE t ALTER COLUMN c SET DEFAULT 'hola; mundo'; CREATE INDEX i ON t(c);`
    expect(splitSqlStatements(sql)).toEqual([
      "ALTER TABLE t ALTER COLUMN c SET DEFAULT 'hola; mundo'",
      'CREATE INDEX i ON t(c)',
    ])
  })

  it("respeta el escape de comilla simple ('' = una literal)", () => {
    const sql = `INSERT INTO t VALUES ('a''b; c'); SELECT 1;`
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t VALUES ('a''b; c')",
      'SELECT 1',
    ])
  })

  it('NO parte un ; dentro de un comentario de línea', () => {
    const sql = 'CREATE TABLE a (id int); -- ojo; con punto y coma\nCREATE TABLE b (id int);'
    const out = splitSqlStatements(sql)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('CREATE TABLE a')
    expect(out[1]).toContain('CREATE TABLE b')
  })

  it('NO parte un ; dentro de un cuerpo dollar-quoted', () => {
    const sql = `CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 1;`
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql',
      'SELECT 1',
    ])
  })

  it('descarta chunks vacíos y de solo comentarios', () => {
    const sql = 'CREATE TABLE a (id int);\n\n-- comentario final sin sentencia\n'
    expect(splitSqlStatements(sql)).toEqual(['CREATE TABLE a (id int)'])
  })

  it('preserva el comentario -- CreateTable al inicio de una sentencia (Postgres lo acepta)', () => {
    const sql = '-- CreateTable\nCREATE TABLE "X" ("id" TEXT NOT NULL);'
    const out = splitSqlStatements(sql)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('CREATE TABLE "X"')
  })
})

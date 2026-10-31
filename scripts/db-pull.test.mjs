import assert from "node:assert/strict";
import { test } from "node:test";
import { TABLES, buildSql, insertSql } from "./db-pull.mjs";

const offers = TABLES.find((t) => t.name === "grocery.offers");
const history = TABLES.find((t) => t.name === "grocery.price_history");

test("insertSql: JSON-строки через json_populate_recordset; у таблицы с identity — overriding system value и сдвиг счётчика", () => {
  const sql = insertSql(offers, [{ id: 7, title: "Piens 'UHT' $1" }]);
  assert.match(sql, /insert into grocery\.offers \("id", "title"\) overriding system value\s+select "id", "title" from json_populate_recordset\(null::grocery\.offers,/);
  assert.match(sql, /"title":"Piens 'UHT' \$1"/); // кавычки и $ внутри данных не мешают
  assert.match(sql, /setval\(pg_get_serial_sequence\('grocery\.offers', 'id'\)/);
});

test("insertSql: вычисляемые столбцы базы (offers.discount, offers.search) в список вставки не попадают — иначе «generated column» и откат всей копии", () => {
  const sql = insertSql(offers, [{ id: 7, title: "x", discount: 30, search: "'x':1" }]);
  assert.match(sql, /\("id", "title"\) overriding system value/); // только обычные столбцы, discount и search отброшены
});

test("insertSql: пустая таблица — пустая строка; история цен сначала очищается от строк, которые сам создал триггер log_price", () => {
  assert.equal(insertSql(offers, []), "");
  const sql = insertSql(history, [{ offer_id: 1, day: "2026-10-31", price: 1.5 }]);
  assert.ok(sql.startsWith("delete from grocery.price_history;\ninsert into grocery.price_history"));
  assert.equal(insertSql(history, []), "delete from grocery.price_history;");
});

test("insertSql: в данных есть наш разделитель — ошибка, а не обрыв строки и SQL-инъекция из чужих названий", () => {
  assert.throws(() => insertSql(offers, [{ id: 1, title: "a $bp$; drop table x; $bp$" }]), /\$bp\$/);
});

test("buildSql: одна транзакция, перед вставкой очищаются все копируемые таблицы вместе, порядок вставки — как в TABLES", () => {
  const data = Object.fromEntries(TABLES.map((t) => [t.name, [{ x: 1 }]]));
  const sql = buildSql(data);
  assert.ok(sql.startsWith("begin;") && sql.trimEnd().endsWith("commit;"));
  const truncate = sql.match(/truncate ([^;]+);/)[1];
  for (const t of TABLES) assert.ok(truncate.includes(t.name), t.name);
  assert.ok(!/leaflet_offers|public\.users|allowed_emails/.test(sql)); // локальные и личные данные не трогаем
  const at = (n) => sql.indexOf(`insert into ${n}`);
  assert.ok(at("grocery.products") < at("grocery.offers") && at("grocery.offers") < at("grocery.price_history"));
});

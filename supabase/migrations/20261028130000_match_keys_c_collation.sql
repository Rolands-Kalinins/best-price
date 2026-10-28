-- Ключи сортирует код (JS сравнивает по кодам символов), а база по умолчанию en_US.UTF-8 и игнорирует пунктуацию.
-- Проверка key_a < key_b должна идти в том же порядке, что и код: сравнение по байтам (collate "C").
alter table grocery.match_decisions   drop constraint match_decisions_check,   add check (key_a collate "C" < key_b collate "C");
alter table grocery.match_suggestions drop constraint match_suggestions_check, add check (key_a collate "C" < key_b collate "C");

-- Откат витрины CRM на базе маркетплейса. Таблицы и данные площадки не трогает.
BEGIN;
DROP FUNCTION IF EXISTS crm.presence();
DROP FUNCTION IF EXISTS crm.accounts();
DROP SCHEMA IF EXISTS crm;
COMMIT;

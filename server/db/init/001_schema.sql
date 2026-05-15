-- Удаляем таблицу team_members и ссылки на нее
DROP TABLE IF EXISTS team_members CASCADE;

-- Обновляем схему tasks и event_tasks
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE event_tasks DROP CONSTRAINT IF EXISTS event_tasks_assignee_id_fkey;

ALTER TABLE tasks
  DROP COLUMN assignee_id;
ALTER TABLE event_tasks
  DROP COLUMN assignee_id;

ALTER TABLE ucp_task_members DROP CONSTRAINT IF EXISTS ucp_task_members_member_id_fkey;
ALTER TABLE ucp_task_members DROP CONSTRAINT IF EXISTS ucp_task_members_pkey;
ALTER TABLE ucp_task_members
  DROP COLUMN member_id;

-- Создаем связи с таблицей users
ALTER TABLE tasks
  ADD COLUMN assignee_id integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE event_tasks
  ADD COLUMN assignee_id integer REFERENCES users(id) ON DELETE SET NULL;

-- Обновляем ucp_task_members с новым столбцом member_id
ALTER TABLE ucp_task_members
  ADD COLUMN member_id integer REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ucp_task_members
  ADD PRIMARY KEY (task_id, member_id);

-- Удаляем демо-данные team_members и связанные данные
DELETE FROM team_members;
DELETE FROM tasks WHERE 1=1;
DELETE FROM event_tasks WHERE 1=1;
DELETE FROM ucp_task_members WHERE 1=1;

-- Оставляем пример пользователей в таблице users и приглашения
-- seed пользователей и приглашений в других местах



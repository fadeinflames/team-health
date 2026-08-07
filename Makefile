SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

COMPOSE ?= docker compose
IMAGE ?= team-health
REGISTRY ?=
TAG ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
GIT_SHA ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
API_PORT ?= 4173
WEB_PORT ?= 5173
BASE_URL ?= http://127.0.0.1:$(API_PORT)

# pg_dump берём из контейнера базы: на ноутбуке postgresql-client обычно нет,
# а версия клиента обязана совпадать с сервером, иначе дамп не тот.
DB_USER ?= $(shell grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2 || echo team_health)
DB_NAME ?= $(shell grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2 || echo team_health)
# Через unix-сокет: внутри контейнера он доверенный, и пароль в команду
# подставлять не приходится.
IN_DB_URL = postgresql:///$(or $(DB_NAME),team_health)?host=/var/run/postgresql&user=$(or $(DB_USER),team_health)

.PHONY: help env secrets secrets-force secrets-check install dev dev-api dev-web build start preview check reset-data clean \
        up up-prod down down-v logs ps rebuild sh db-shell \
        migrate migrate-status migrate-new migrate-down migrate-baseline seed \
        db-schema db-drift db-dump db-restore db-vacuum db-bloat admin-password \
        test-install test test-smoke test-ui test-docker \
        image image-push

help: ## Показать список целей
	@awk 'BEGIN {FS = ":.*##"} \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_-]+:.*##/ { printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

##@ Окружение и секреты

env: ## Создать .env из .env.example и сгенерировать секреты
	@test -f .env && echo ".env уже существует, не трогаю" \
		|| (cp .env.example .env && node scripts/secrets.mjs init && echo ".env создан, секреты сгенерированы")

secrets: ## Сгенерировать недостающие секреты в .env (существующие не трогает)
	@node scripts/secrets.mjs init

secrets-force: ## Перегенерировать ВСЕ секреты в .env
	@node scripts/secrets.mjs init --force

secrets-check: ## Проверить, что в .env нет пустых и слабых секретов
	@node scripts/secrets.mjs check

admin-password: ## Сгенерировать и применить новый пароль админа к запущенной базе
	@$(COMPOSE) run --rm migrate node scripts/admin-password.mjs rotate

##@ Локальная разработка (на хосте)

install: ## Установить зависимости
	@if [ -f package-lock.json ]; then npm ci; else npm install; fi

dev: ## Бэкенд и фронтенд с автоперезагрузкой, UI на порту 5173
	@echo "api → http://127.0.0.1:$(API_PORT), web → http://127.0.0.1:$(WEB_PORT)"
	@node --watch server.js & api=$$!; \
	npx vite & web=$$!; \
	trap "kill $$api $$web 2>/dev/null" EXIT INT TERM; \
	wait

dev-api: ## Только бэкенд под node --watch
	node --watch server.js

dev-web: ## Только vite dev server
	npx vite

build: ## Собрать фронтенд в dist
	npm run build

start: ## Запустить собранное приложение (нужен предварительный make build)
	npm run start

preview: ## vite preview поверх собранного dist
	npm run preview

check: ## Быстрая проверка: сборка проходит
	npm run check

reset-data: ## Удалить локальное file-хранилище (.data)
	rm -rf .data
	@echo ".data удалён"

clean: ## Удалить dist, .data и артефакты тестов
	rm -rf dist .data test-results playwright-report

##@ Docker

up: secrets-check ## Поднять dev-стек в docker (postgres + миграции + api + web)
	$(COMPOSE) up -d --build
	@echo "web → http://127.0.0.1:$(WEB_PORT), api → http://127.0.0.1:$(API_PORT)"

up-prod: secrets-check ## Поднять прод-подобный стек из runtime-образа
	$(COMPOSE) --profile prod up -d --build db migrate app
	@echo "app → http://127.0.0.1:$${PROD_PORT:-8080}"

down: ## Остановить контейнеры
	$(COMPOSE) --profile prod --profile test --profile seed down --remove-orphans

down-v: ## Остановить контейнеры и удалить volume с данными
	$(COMPOSE) --profile prod --profile test --profile seed down --remove-orphans -v

logs: ## Хвост логов dev-стека
	$(COMPOSE) logs -f --tail=100

ps: ## Состояние контейнеров
	$(COMPOSE) ps

rebuild: ## Пересобрать образы без кеша
	$(COMPOSE) build --no-cache

sh: ## Shell внутри контейнера api
	$(COMPOSE) exec api sh

db-shell: ## psql внутри контейнера postgres
	$(COMPOSE) exec db psql -U $(DB_USER) -d $(DB_NAME)

##@ База: миграции и данные

migrate: ## Применить миграции к локальной базе
	$(COMPOSE) run --rm migrate

migrate-status: ## Показать применённые и ожидающие миграции
	$(COMPOSE) run --rm migrate node scripts/migrate.mjs status

migrate-down: ## Откатить одну последнюю миграцию (только local)
	$(COMPOSE) run --rm migrate node scripts/migrate.mjs down 1

migrate-baseline: ## Отметить baseline применённым на существующей базе (один раз на окружение)
	$(COMPOSE) run --rm migrate node scripts/migrate.mjs baseline

migrate-new: ## Создать файл миграции: make migrate-new name=add_teams
	@node scripts/migrate.mjs create "$(name)"

seed: ## Залить демо-фикстуры в локальную базу
	$(COMPOSE) --profile seed run --rm seed

db-schema: ## Обновить db/schema.sql из локальной базы
	@PGDUMP="$(COMPOSE) exec -T db pg_dump" DATABASE_URL="$(IN_DB_URL)" scripts/schema-dump.sh > db/schema.sql
	@echo "db/schema.sql обновлён"

db-drift: ## Сравнить db/schema.sql с реальной схемой локальной базы
	@PGDUMP="$(COMPOSE) exec -T db pg_dump" DATABASE_URL="$(IN_DB_URL)" scripts/schema-dump.sh > /tmp/th-schema-actual.sql
	@diff -u db/schema.sql /tmp/th-schema-actual.sql \
		&& echo "Схема совпадает с db/schema.sql" \
		|| (echo ""; echo "Схема разошлась с db/schema.sql: либо не применены миграции, либо схему правили руками."; exit 1)

db-dump: ## Снять полный бэкап локальной базы в backups/
	@mkdir -p backups
	@$(COMPOSE) exec -T db pg_dump --format=custom --no-owner --no-privileges "$(IN_DB_URL)" \
		> backups/team-health-$$(date +%Y%m%d-%H%M%S).dump
	@ls -la backups | tail -1

db-vacuum: ## Разовая чистка после перехода на точечные записи (окно обслуживания)
	@echo "VACUUM FULL блокирует таблицы целиком. Делайте это в окне обслуживания."
	@echo "Ctrl-C, если передумали."
	@sleep 5
	@$(COMPOSE) exec -T db psql -v ON_ERROR_STOP=1 "$(IN_DB_URL)" -c "vacuum full analyze"
	@echo "Готово. Проверить раздутость: make db-bloat"

db-bloat: ## Показать соотношение мёртвых и живых версий строк
	@$(COMPOSE) exec -T db psql "$(IN_DB_URL)" -c "\
		select relname, n_live_tup, n_dead_tup, \
		       case when n_live_tup > 0 then round(n_dead_tup::numeric / n_live_tup, 2) else null end as dead_ratio, \
		       last_autovacuum \
		from pg_stat_user_tables \
		where n_dead_tup > 0 \
		order by n_dead_tup desc"

db-restore: ## Восстановить базу из бэкапа: make db-restore file=backups/....dump
	@test -n "$(file)" || (echo "Укажи файл: make db-restore file=backups/team-health-....dump" && exit 1)
	@test -f "$(file)" || (echo "$(file) не найден" && exit 1)
	@echo "Это перезапишет содержимое базы $(DB_NAME). Ctrl-C, если передумал."
	@sleep 3
	@$(COMPOSE) exec -T db pg_restore --clean --if-exists --no-owner --no-privileges \
		-d "$(IN_DB_URL)" < "$(file)"
	@echo "Восстановлено из $(file)"

##@ Тесты

test-install: ## Поставить браузер для playwright (нужно один раз)
	npx playwright install chromium

test: ## Все тесты на хосте против запущенного сервера
	BASE_URL=$(BASE_URL) npm test

test-smoke: ## Smoke-тесты на хосте
	BASE_URL=$(BASE_URL) npm run test:smoke

test-ui: ## UI-аудит на хосте
	BASE_URL=$(BASE_URL) npm run test:ui

TEST_SERVICES = db-test migrate-test seed-test api-test tests

test-docker: ## Все тесты в docker: своя база, миграции с нуля, dev-данные не трогаются
	@set +e; \
	$(COMPOSE) --profile test up -d --build $(TEST_SERVICES); \
	started=$$?; \
	if [ $$started -ne 0 ]; then \
		echo "Стек не поднялся, логи подготовительных сервисов:"; \
		$(COMPOSE) --profile test logs --tail=40 migrate-test seed-test api-test; \
		$(COMPOSE) --profile test rm -fsv $(TEST_SERVICES) >/dev/null 2>&1; \
		exit $$started; \
	fi; \
	$(COMPOSE) --profile test logs -f tests & \
	logs=$$!; \
	$(COMPOSE) --profile test wait tests >/dev/null 2>&1; \
	status=$$?; \
	kill $$logs 2>/dev/null; \
	$(COMPOSE) --profile test rm -fsv $(TEST_SERVICES) >/dev/null 2>&1; \
	exit $$status

##@ Образ

image: ## Собрать runtime-образ с тегом из git describe
	docker build --target runtime \
		--build-arg VERSION=$(TAG) \
		--build-arg GIT_SHA=$(GIT_SHA) \
		-t $(IMAGE):$(TAG) -t $(IMAGE):latest .

image-push: image ## Запушить образ (нужен REGISTRY=...)
	@test -n "$(REGISTRY)" || (echo "Укажи REGISTRY, например: make image-push REGISTRY=ghcr.io/jtprogru" && exit 1)
	docker tag $(IMAGE):$(TAG) $(REGISTRY)/$(IMAGE):$(TAG)
	docker push $(REGISTRY)/$(IMAGE):$(TAG)

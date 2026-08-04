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

.PHONY: help env install dev dev-api dev-web build start preview check reset-data clean \
        up up-prod down down-v logs ps rebuild sh db-shell \
        test-install test test-smoke test-ui test-docker \
        image image-push

help: ## Показать список целей
	@awk 'BEGIN {FS = ":.*##"} \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_-]+:.*##/ { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

##@ Локальная разработка (на хосте)

env: ## Создать .env из .env.example, если его ещё нет
	@test -f .env && echo ".env уже существует, не трогаю" || (cp .env.example .env && echo ".env создан")

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
	@echo ".data удалён, seed создастся при следующем старте"

clean: ## Удалить dist, .data и артефакты тестов
	rm -rf dist .data test-results playwright-report

##@ Docker

up: ## Поднять dev-стек в docker (postgres + api + web) с автоперезагрузкой
	$(COMPOSE) up -d --build
	@echo "web → http://127.0.0.1:$(WEB_PORT), api → http://127.0.0.1:$(API_PORT)"

up-prod: ## Поднять прод-подобный стек из runtime-образа
	$(COMPOSE) --profile prod up -d --build db app
	@echo "app → http://127.0.0.1:$${PROD_PORT:-8080}"

down: ## Остановить контейнеры
	$(COMPOSE) --profile prod --profile test down --remove-orphans

down-v: ## Остановить контейнеры и удалить volume с данными
	$(COMPOSE) --profile prod --profile test down --remove-orphans -v

logs: ## Хвост логов dev-стека
	$(COMPOSE) logs -f --tail=100

ps: ## Состояние контейнеров
	$(COMPOSE) ps

rebuild: ## Пересобрать образы без кеша
	$(COMPOSE) build --no-cache

sh: ## Shell внутри контейнера api
	$(COMPOSE) exec api sh

db-shell: ## psql внутри контейнера postgres
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-team_health} -d $${POSTGRES_DB:-team_health}

##@ Тесты

test-install: ## Поставить браузер для playwright (нужно один раз)
	npx playwright install chromium

test: ## Все тесты на хосте против запущенного сервера
	BASE_URL=$(BASE_URL) npm test

test-smoke: ## Smoke-тесты на хосте
	BASE_URL=$(BASE_URL) npm run test:smoke

test-ui: ## UI-аудит на хосте
	BASE_URL=$(BASE_URL) npm run test:ui

test-docker: ## Все тесты в docker: своя база, свой сервер, dev-данные не трогаются
	@set +e; \
	$(COMPOSE) --profile test up --build --abort-on-container-exit --exit-code-from tests db-test api-test tests; \
	status=$$?; \
	$(COMPOSE) --profile test rm -fsv db-test api-test tests >/dev/null 2>&1; \
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

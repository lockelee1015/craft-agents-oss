SHELL := /bin/bash

.PHONY: help install dev start test lint typecheck clean

help:
	@echo "Available targets:"
	@echo "  make install   Install dependencies"
	@echo "  make dev       Start app in hot-reload mode"
	@echo "  make start     Build and run app"
	@echo "  make test      Run tests"
	@echo "  make lint      Run lint checks"
	@echo "  make typecheck Run type checks"
	@echo "  make clean     Clean Electron build artifacts"

install:
	bun install

dev: install
	bun run electron:dev

start: install
	bun run electron:start

test:
	bun test

lint:
	bun run lint

typecheck:
	bun run typecheck:all

clean:
	bun run electron:clean

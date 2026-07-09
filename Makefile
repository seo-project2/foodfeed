.PHONY: help install init-db serve

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

install: ## Install backend dependencies into current venv
	pip install -r FoodFeed/requirements.txt

init-db: ## Create foodfeed.db from schema.sql and seed dev user
	python -m FoodFeed.databases

serve: ## Run the Flask dev server on :5000
	python -m FoodFeed.app

.PHONY: help install init-db serve wipe-user

help:
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

install: ## Install backend dependencies into current venv
	pip install -r FoodFeed/requirements.txt

init-db: ## Create foodfeed.db from schema.sql and seed dev user
	python -m FoodFeed.databases

serve: ## Run the Flask dev server on :5000
	python -m FoodFeed.app

wipe-user: ## Delete a user by email (demo reset). Usage: make wipe-user EMAIL=you@uchicago.edu
	@test -n "$(EMAIL)" || (echo "EMAIL is required (e.g. make wipe-user EMAIL=you@uchicago.edu)" && exit 1)
	python -m FoodFeed.wipe_user $(EMAIL)

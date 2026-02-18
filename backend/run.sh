#!/usr/bin/env bash
cd "$(dirname "$0")"
./venv/Scripts/python.exe -m uvicorn app:app --reload --host 0.0.0.0 --port 8000

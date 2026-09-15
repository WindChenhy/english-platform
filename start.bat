@echo off
rem 一键启动英语学习平台（前端已由 FastAPI 托管）
cd /d %~dp0backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

@echo off
rem 一键启动英语学习平台（前端已由 FastAPI 托管）
rem 默认监听 0.0.0.0:8000，便于局域网手机访问；仅本机可设 EP_BIND_HOST=127.0.0.1
cd /d %~dp0backend
set EP_BIND_HOST=0.0.0.0
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000


"""FastAPI 应用入口：注册路由、跨域与前端静态托管。

生产形态下前端 build 产物（frontend/dist）由本应用直接托管，
本机只需启动这一个进程即可访问完整站点。
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.gzip import GZipMiddleware

from .api import articles, books, dictionary, dictation, mistakes, stats, study
from .config import DATA_DIR, settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """应用生命周期：启动时确保数据目录存在。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="English Learning Platform", lifespan=lifespan)

# 开发期允许 Vite dev server 跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# 静态资源与 API 响应启用 gzip（前端含 recharts，包体较大）
app.add_middleware(GZipMiddleware, minimum_size=1024)

for mod in (books, study, dictionary, articles, mistakes, stats, dictation):
    app.include_router(mod.router)

# 生产形态：前端 build 产物由 FastAPI 托管（运行时检查 dist，先启动后端再构建前端也无需重启）
_dist = settings.frontend_dist


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str):
    """SPA 回退：dist 下的静态文件直接返回，其余路径回退到 index.html。"""
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404)
    index = _dist / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=404, detail="前端尚未构建：请先在 frontend 目录执行 npm run build"
        )
    candidate = (_dist / full_path).resolve()
    if full_path and candidate.is_file() and str(candidate).startswith(str(_dist.resolve())):
        return FileResponse(candidate)
    return FileResponse(index)

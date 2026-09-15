# 英语学习平台

自用英语学习平台：背单词（间隔重复）+ 分级阅读（点词查词、生词本）+ 错题本与学习统计。
纯本地运行，单用户、无登录，数据存 SQLite，内容全部为种子数据、不依赖任何外部服务或 AI API。

## 功能

- **背单词**：四本词书（中考 1987 词 / 高考 3743 词 / 四级 4544 词 / 六级 3991 词）。
  新词方向可选 英→中 / 中→英 / 混合（四选一），复习翻面三档自评（忘了/模糊/记得），
  手写简化 SM-2 算法安排复习间隔；支持 Anki 风格键盘快捷键（空格翻面/继续、1-3 评分、A-D 选项）；
  词条自带例句、短语、近义词、同根词；发音用浏览器 Web Speech API。
- **默写拼写**：三种模式——看中文释义默写单词（来源可选词书或生词本，错词一键收进生词本）、
  看中文意思默写词书短语（3 万+ 条）、看中文译文默写文章原句（60 句）；
  提示方式可选 中文提示 / **发音听写**（自动播放读音）/ 混合，可选首字母提示，
  判分带逐词批改（写错标红删除线、漏写标绿补出），支持重练错题。
- **分级阅读**：30 篇文章（入门/四级/六级 各 10 篇，共 120 道理解题）。
  点击单词即查释义（ECDICT 词典 5.7 万高频/考纲词），一键收进生词本——生词自动进入当天复习队列。
- **错题本**：阅读理解答错自动收进，重练答对自动移出。
- **统计图表**：每日学习量（近 30 天堆叠柱图）、词汇增长曲线、打卡热力图（约 26 周）、
  未来 14 天到期预测（recharts + 自绘 SVG 热力图）。
- **统计面板**：今日新学/复习、待复习数、连续打卡、词汇量估算（间隔≥21 天的词数）、阅读完成度与正确率。
- **备份**：一键导出全部学习数据为 JSON（v2 格式）；支持导入备份文件**整库恢复**（覆盖当前记录，事务保护）。
- **多语言**：界面中英双语，默认跟随操作系统语言，页头可切换并持久化（i18next）。
- **数据安全**：数据就是一个 SQLite 文件（`backend/data/app.db`），复制即备份。

## 技术栈

- 后端：Python 3.11 + FastAPI + SQLAlchemy 2.0 + Alembic + SQLite（响应启用 gzip）
- 前端：Vite + React 18 + TypeScript + Ant Design 5 + TanStack Query + Zustand + recharts + i18next
- 内容来源：词书 [kajweb/dict](https://github.com/kajweb/dict)（有道词书 JSON）、词典 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）、文章为自建种子数据

## 目录结构

```
english-platform/
├── start.bat              # 一键启动（Windows）
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI 入口（含前端静态托管）
│   │   ├── models.py      # 9 张表
│   │   ├── srs.py         # 简化 SM-2 算法
│   │   ├── grade 逻辑在前端：frontend/src/grade.ts（默写判分/逐词对比/首字母遮罩）
│   │   ├── seed.py        # 种子数据导入（python -m app.seed）
│   │   └── api/           # books / study / dictionary / articles / mistakes / stats / dictation
│   ├── migrations/        # Alembic
│   ├── tests/test_srs.py  # 算法单元测试
│   └── data/              # app.db + 种子数据（词书 zip、词典 CSV、文章与默写句子 JSON）
└── frontend/
    └── src/pages/         # Dashboard / Study / Dictation / Reading / ReadingArticle / Wordlist / Mistakes
```

## 从零搭建（新机器）

```bash
# 后端（推荐 uv：自动创建 .venv、解析依赖并生成 uv.lock）
cd backend
uv init --bare --name english-platform-backend   # 首次初始化（已有 pyproject.toml 可跳过）
# 修改 pyproject.toml 的 requires-python 为 ">=3.11"
uv add "fastapi>=0.115" "uvicorn[standard]>=0.30" "sqlalchemy>=2.0.30" "alembic>=1.13" "pydantic>=2.7" "pydantic-settings>=2.3" "pytest>=8.0" "httpx>=0.27"
# 下载种子数据（词书 zip + ECDICT CSV），放到 backend/data/ 下：
#   data/books/{CET4_1,CET4_2,CET4_3,CET6_1,CET6_2,CET6_3,ChuZhong_2,ChuZhong_3,GaoZhong_2,GaoZhong_3}.zip
#   data/ecdict.csv
uv run alembic upgrade head
uv run python -m app.seed

# 前端
cd ../frontend
npm install
npm run build        # 产物 dist/ 由后端托管

# 启动
cd .. && start.bat   # 或 cd backend && uv run uvicorn app.main:app --port 8000
```

> 也可以不用 uv：`python -m venv .venv` + `pip install -r requirements.txt`（requirements.txt 保留）。

打开 http://127.0.0.1:8000 即可使用。

## 日常开发

```bash
# 终端 1：后端（热重载）
cd backend && .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# 终端 2：前端 dev server（/api 自动代理到 8000）
cd frontend && npm run dev     # http://localhost:5173

# 测试

```bash
# 后端：算法单测 + 全接口测试（内存库 + 最小种子，37 个用例）
cd backend && .venv\Scripts\python -m pytest tests -q
# 前端：判分工具 / i18n 键一致性 / 状态持久化 / 应用集成冒烟（21 个用例）
cd frontend && npm test
```

## SM-2 简化算法（app/srs.py）

复习三档自评驱动，粒度为天：

- **记得**：间隔阶梯增长 1 天 → 6 天 → `interval × ease`，ease 上调（上限 2.8）
- **模糊**：间隔 ×1.2，ease 下调
- **忘了**：间隔归 1 天，reps 清零，ease 下调（下限 1.3），计一次遗忘

词汇量估算 = 复习间隔 ≥ 21 天的卡片数。

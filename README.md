# 英语学习平台

自用英语学习平台：背单词（FSRS 间隔重复）+ 默写/听写 + 分级阅读 + **真题题型训练** + **日常口语/发音模仿/录音** + 错题本与统计 + 人机拼写对战。
纯本地运行，单用户、无登录，数据存 SQLite，内容以种子数据为主，不依赖外部 AI API。

## 功能

- **背单词**：五本词书（中考 / 高考 / 四级 / 六级 / **考研**）。新词方向可选 英→中 / 中→英 / 混合；
  复习三档自评（忘了/模糊/记得），由 **FSRS** 调度间隔；支持 Anki 风格键盘快捷键；
  可设每日新词与复习上限；**弱项训练**优先练习易错词；会话可中断后**本地恢复**；
  复习卡支持**挂起/埋藏**；词条自带例句、短语、近义词、同根词；发音用浏览器 Web Speech API。
- **默写拼写**：单词（词书/生词本/**弱项**）/ 短语 / 文章句子三模式；
  中文提示 / 发音听写 / 混合，首字母遮罩，LCS 逐词批改，错词一键入生词本；**结果落库**。
- **真题演练**：入门 2 篇 + 四级 3 篇 + 六级 3 篇 + 考研 3 篇 **阅读题型训练**（原创仿真材料，
  按考试级别筛选，含理解题与解析；不使用受版权保护的原卷扫描件）。
- **日常口语**：机场 / 餐厅 / 酒店 / 购物 / 诊所 / **职场** / **家庭** / **学校** 等 **14 个场景**；
  播放标准音（TTS）→ **发音模仿**（浏览器语音识别 + 词级评分）→ **录音回放对比**（音频落盘可删）。
  另支持 **单词发音练习**：从词书 / 生词本 / 弱项词抽取单词，逐词跟读评分与录音。
- **人机对战**：拼写 PVE，按近 20 局胜率自适应推荐难度，战绩落库。
- **分级阅读**：40 篇种子文章 + **自贴英文材料**；点词查 ECDICT，一键收进生词本。
- **搜索**：生词本关键词搜索与多字段排序；词典前缀模糊搜索。
- **每日目标**：首页显示今日新词/复习进度，可自定义目标。
- **统计图表**：每日学习量、词汇增长、打卡热力图、14 天到期预测、默写正确率、口语练习次数。
- **备份**：v3 JSON 导出/导入；**多语言**界面；数据即一个 SQLite 文件 + `data/recordings/` 音频目录。

> 口语发音识别与评分依赖浏览器 **Chrome / Edge** 的 Web Speech API；录音使用 MediaRecorder。其它浏览器可播放标准音，但无法跟读识别。

## 技术栈

- 后端：Python 3.11 + FastAPI + SQLAlchemy 2.0 + Alembic + SQLite + python-multipart（录音上传）
- 前端：Vite + React 18 + TypeScript + Ant Design 5 + TanStack Query + Zustand + recharts + i18next
- 语音：浏览器 SpeechSynthesis（TTS）/ SpeechRecognition（ASR）/ MediaRecorder（录音）
- 内容来源：词书 [kajweb/dict](https://github.com/kajweb/dict)、词典 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）、文章与对话为自建种子数据

## 目录结构

```
english-platform/
├── start.bat              # 一键启动（Windows）
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI 入口（含前端静态托管）
│   │   ├── models.py      # 全部表（含 Speaking*）
│   │   ├── srs.py         # FSRS 简化实现
│   │   ├── seed.py        # 种子数据导入（词书/文章/真题/口语场景）
│   │   └── api/           # books / study / dictionary / articles / mistakes / stats /
│   │                      # dictation / battle / settings / speaking
│   ├── migrations/        # Alembic
│   ├── tests/             # 算法 + 接口测试（含口语/真题）
│   └── data/              # app.db + 种子数据 + recordings/ 录音
└── frontend/
    └── src/
        ├── pronounce.ts   # 语音识别与词级评分
        ├── record.ts      # MediaRecorder 录音
        └── pages/         # Dashboard / Study / Dictation / Exam / Speaking / Battle /
                           # Reading / Wordlist / Mistakes / Charts
```

## 从零搭建（新机器）

```bash
# 后端
cd backend
uv sync   # 或 pip install -r requirements.txt
# 放置种子数据后：
uv run alembic upgrade head
uv run python -m app.seed

# 前端
cd ../frontend
npm install
npm run build

# 启动
cd .. && start.bat
```

打开 http://127.0.0.1:8000 即可使用。

## 日常开发

```bash
# 后端热重载
cd backend && .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# 前端
cd frontend && npm run dev

# 测试
cd backend && .venv\Scripts\python -m pytest tests -q
cd frontend && npm test
```

## FSRS 调度（app/srs.py）

rating：1=Again / 2=Hard / 3=Good（映射 FSRS grade 1/2/4）。
卡片维护 stability / difficulty / state；interval ≥ 21 视为已掌握。

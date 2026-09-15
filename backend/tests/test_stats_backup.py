"""统计、图表数据与备份导出/导入接口测试。"""


def _do_activity(client):
    """制造一段学习活动：新词答对 + 收藏生词。"""
    client.post("/api/study/review", json={"kind": "new", "word": "apple", "rating": 3, "book_id": 1})
    client.post("/api/study/wordlist", json={"word": "strawberry"})


def test_stats_reflect_activity(client):
    """仪表盘统计：新学/生词本/待复习计数随学习活动变化。"""
    _do_activity(client)
    s = client.get("/api/stats").json()
    assert s["new_today"] == 1
    assert s["wordlist_count"] == 1
    assert s["due_today"] >= 1  # 生词收藏即今日到期


def test_charts_shape(client):
    """图表数据结构：daily 恒为 30 天、forecast 恒为 14 天、活动计入当日。"""
    _do_activity(client)
    c = client.get("/api/stats/charts").json()
    assert len(c["daily"]) == 30
    assert c["daily"][-1]["new"] >= 1
    assert len(c["forecast"]) == 14
    assert sum(h["n"] for h in c["heatmap"]) >= 1  # 新词复习会计入流水


def test_export_v3(client):
    """导出为 v3 格式，卡片携带 id/book_id/FSRS 字段以支持恢复。"""
    _do_activity(client)
    d = client.get("/api/export").json()
    assert d["version"] == 3
    assert len(d["cards"]) == 2
    assert {"id", "word", "book_id", "due", "stability", "state"} <= set(d["cards"][0].keys())
    assert d["review_logs"] and d["mistakes"] == []
    assert "goals" in d and "dictation_logs" in d


def test_import_accepts_v2(client):
    """v2 备份仍可导入（兼容旧备份）。"""
    _do_activity(client)
    v3 = client.get("/api/export").json()
    v2 = {
        "version": 2,
        "cards": [{k: c[k] for k in (
            "id", "word", "meaning", "phonetic", "book_id", "source", "ease",
            "interval", "reps", "lapses", "due", "created_at", "last_review_at",
        ) if k in c} for c in v3["cards"]],
        "review_logs": v3["review_logs"],
        "reading_attempts": v3["reading_attempts"],
        "mistakes": v3["mistakes"],
    }
    assert client.post("/api/import", json=v2).status_code == 200
    assert len(client.get("/api/export").json()["cards"]) == 2


def test_import_roundtrip(client):
    """导出 → 破坏现场 → 导入恢复：数据回到备份时刻。"""
    _do_activity(client)
    backup = client.get("/api/export").json()
    assert len(backup["cards"]) == 2

    # 破坏现场：多学一个词
    client.post("/api/study/review", json={"kind": "new", "word": "banana", "rating": 3, "book_id": 1})
    assert len(client.get("/api/export").json()["cards"]) == 3

    r = client.post("/api/import", json=backup)
    assert r.status_code == 200
    assert r.json()["cards"] == 2

    # 恢复后：卡片数与统计都回到备份时刻
    assert len(client.get("/api/export").json()["cards"]) == 2
    s = client.get("/api/stats").json()
    assert s["wordlist_count"] == 1
    assert s["new_today"] == 1  # banana 的记录已被备份时刻的状态覆盖


def test_import_rejects_old_version(client):
    """无 version 字段的旧格式备份 → 400。"""
    assert client.post("/api/import", json={"cards": []}).status_code == 400


def test_import_bad_data_rolls_back(client):
    """导入非法数据（缺 due 字段）→ 400，且原数据不受影响（事务回滚）。"""
    _do_activity(client)
    bad = {"version": 2, "cards": [{"word": "x"}], "review_logs": [], "reading_attempts": [], "mistakes": []}
    assert client.post("/api/import", json=bad).status_code == 400
    assert len(client.get("/api/study/wordlist").json()) == 1  # strawberry 仍在


def test_spa_and_api_fallback(client):
    """/ 返回前端入口（dist 存在时），未知 /api 路径返回 404 而非页面。"""
    r = client.get("/")
    assert r.status_code in (200, 404)  # 200=dist 已构建，404=未构建
    if r.status_code == 200:
        assert "text/html" in r.headers["content-type"]
    assert client.get("/api/nonexistent").status_code == 404

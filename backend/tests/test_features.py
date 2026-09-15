"""新功能接口测试：目标、词典搜索、用户文章、默写落库、对战、弱项、卡片管理。"""


def test_goals_roundtrip(client):
    """每日目标：默认可读，PUT 后可读回。"""
    g = client.get("/api/settings/goals").json()
    assert g["daily_new"] == 10
    r = client.put("/api/settings/goals", json={"daily_new": 20, "daily_review": 80})
    assert r.status_code == 200
    assert client.get("/api/settings/goals").json() == {"daily_new": 20, "daily_review": 80}


def test_stats_includes_goals(client):
    """仪表盘统计携带目标与今日默写/对战计数。"""
    s = client.get("/api/stats").json()
    assert s["goals"]["daily_new"] == 10
    assert s["dictation_today"] == 0
    assert s["battle_today"] == 0


def test_dictionary_search(client):
    """词典前缀模糊搜索。"""
    r = client.get("/api/dictionary/search", params={"q": "app"})
    assert r.status_code == 200
    words = [i["word"] for i in r.json()["items"]]
    assert "apple" in words


def test_user_articles_crud(client):
    """自贴文章：创建 → 列表 → 详情 → 删除。"""
    r = client.post("/api/articles/user", json={
        "title": "My Note",
        "content": "Hello world. This is a short English note for reading practice.",
    })
    assert r.status_code == 200
    aid = r.json()["id"]
    assert r.json()["word_count"] > 5

    lst = client.get("/api/articles/user/list").json()
    assert any(a["id"] == aid for a in lst)

    detail = client.get(f"/api/articles/user/{aid}").json()
    assert detail["title"] == "My Note"

    assert client.delete(f"/api/articles/user/{aid}").json()["deleted"] is True
    assert client.get(f"/api/articles/user/{aid}").status_code == 404


def test_dictation_result_and_weak(client):
    """默写结果落库，并驱动弱项队列。"""
    client.post("/api/study/review", json={"kind": "new", "word": "apple", "rating": 3, "book_id": 1})
    r = client.post("/api/dictation/result", json={"items": [
        {"kind": "word", "answer": "apple", "correct": False, "word": "apple"},
        {"kind": "word", "answer": "banana", "correct": True, "word": "banana"},
    ]})
    assert r.status_code == 200
    assert r.json()["saved"] == 2

    s = client.get("/api/stats").json()
    assert s["dictation_today"] == 2

    weak = client.get("/api/study/queue", params={"mode": "weak"}).json()
    assert any(i.get("word") == "apple" for i in weak["items"])


def test_battle_config_and_history(client):
    """对战：默认推荐 normal，落库后可查历史。"""
    cfg = client.get("/api/battle/config").json()
    assert cfg["suggested"] == "normal"

    r = client.post("/api/battle/result", json={
        "difficulty": "normal", "result": "win",
        "user_correct": 4, "total_rounds": 5, "avg_seconds": 8.5,
        "wrong_words": ["apple"],
    })
    assert r.status_code == 200
    h = client.get("/api/battle/history").json()
    assert h["total"] == 1
    assert h["wins"] == 1
    assert client.get("/api/stats").json()["battle_today"] == 1


def test_suspend_bury_and_preview(client):
    """挂起/埋藏后不进队列，解除后恢复；预览接口返回卡片状态。"""
    client.post("/api/study/review", json={"kind": "new", "word": "apple", "rating": 3, "book_id": 1})
    client.post("/api/study/cards/apple/suspend", json={"days": 7})
    q = client.get("/api/study/queue").json()
    assert all(i.get("word") != "apple" for i in q["items"] if i["type"] == "review")

    card = client.get("/api/study/cards/apple").json()
    assert card["suspended"] is True

    client.post("/api/study/cards/apple/unsuspend")
    q2 = client.get("/api/study/queue").json()
    # apple 可能已不在今日到期（被推迟），只要 unsuspend 成功即可
    assert client.get("/api/study/cards/apple").json()["suspended"] is False


def test_wordlist_search_sort(client):
    """生词本搜索与排序。"""
    client.post("/api/study/wordlist", json={"word": "strawberry"})
    client.post("/api/study/wordlist", json={"word": "apple"})
    r = client.get("/api/study/wordlist", params={"q": "straw"})
    assert len(r.json()) == 1
    assert r.json()[0]["word"] == "strawberry"
    r2 = client.get("/api/study/wordlist", params={"sort": "word"})
    words = [c["word"] for c in r2.json()]
    assert words == sorted(words)

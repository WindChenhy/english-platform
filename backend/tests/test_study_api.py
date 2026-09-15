"""学习队列、复习结算与生词本接口测试。"""


def test_queue_e2c(client):
    """新词队列（英→中）：题目为释义四选一，正确释义必须出现在选项中。"""
    r = client.get("/api/study/queue", params={"book_id": 1, "new_limit": 3, "direction": "e2c"})
    assert r.status_code == 200
    data = r.json()
    assert data["counts"]["new"] == 3
    assert all(i["type"] == "new" and i["quiz"] == "e2c" for i in data["items"])
    for i in data["items"]:
        assert len(i["options"]) == 4
        assert i["meaning"] in i["options"]
        assert i["word"] not in i["options"]  # e2c 的选项是释义，不含词面


def test_queue_c2e(client):
    """新词队列（中→英）：题目为词面四选一，正确词必须在选项中。"""
    r = client.get("/api/study/queue", params={"book_id": 1, "new_limit": 3, "direction": "c2e"})
    assert r.status_code == 200
    for i in r.json()["items"]:
        assert i["quiz"] == "c2e"
        assert len(i["options"]) == 4
        assert i["word"] in i["options"]
        assert i["meaning"] not in i["options"]


def test_queue_direction_invalid(client):
    """direction 非法取值应返回 400。"""
    assert client.get("/api/study/queue", params={"book_id": 1, "direction": "xyz"}).status_code == 400


def test_queue_new_limit_cap(client):
    """new_limit 超过 50 应被参数校验拦截（422）。"""
    assert client.get("/api/study/queue", params={"book_id": 1, "new_limit": 99}).status_code == 422


def test_queue_review_only_empty(client):
    """没有任何到期卡时，纯复习队列为空。"""
    r = client.get("/api/study/queue")
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["counts"]["review"] == 0


def test_review_new_and_progression(client):
    """新词首答建卡（FSRS 初始间隔）；再次以新词身份提交复用已有卡。"""
    r = client.post("/api/study/review", json={"kind": "new", "word": "apple", "rating": 3, "book_id": 1})
    assert r.status_code == 200
    assert r.json()["interval"] >= 1
    assert r.json()["stability"] is not None
    first = r.json()["interval"]
    r2 = client.post("/api/study/review", json={"kind": "new", "word": "apple", "rating": 3, "book_id": 1})
    assert r2.json()["interval"] >= 1
    assert r2.json()["state"] in ("review", "learning", "relearning")


def test_review_missing_card_404(client):
    """kind=review 但没有对应复习卡时返回 404。"""
    r = client.post("/api/study/review", json={"kind": "review", "word": "apple", "rating": 3})
    assert r.status_code == 404


def test_review_rating1_penalizes(client):
    """复习答"忘了"：间隔归 1 天，进入 relearning，计一次遗忘。"""
    client.post("/api/study/review", json={"kind": "new", "word": "apple", "rating": 3, "book_id": 1})
    r = client.post("/api/study/review", json={"kind": "review", "word": "apple", "rating": 1})
    assert r.status_code == 200
    body = r.json()
    assert body["interval"] == 1
    assert body["state"] == "relearning"


def test_wordlist_flow(client):
    """生词本完整链路：收藏 → 进入今日复习队列 → 重复收藏幂等 → 删除。"""
    r = client.post("/api/study/wordlist", json={"word": "strawberry"})
    assert r.status_code == 200
    assert r.json()["created"] is True

    # 收藏即到期：纯复习队列应出现该词
    queue = client.get("/api/study/queue").json()
    assert any(i["type"] == "review" and i["word"] == "strawberry" for i in queue["items"])

    # 重复收藏：不新建卡，也不需要提前到期
    r2 = client.post("/api/study/wordlist", json={"word": "strawberry"})
    assert r2.json()["created"] is False
    assert len(client.get("/api/study/wordlist").json()) == 1

    # 删除后消失，再删报 404
    assert client.delete("/api/study/wordlist/strawberry").json()["deleted"] is True
    assert client.get("/api/study/wordlist").json() == []
    assert client.delete("/api/study/wordlist/strawberry").status_code == 404


def test_wordlist_unknown_word_404(client):
    """词典中不存在的词不能收藏。"""
    assert client.post("/api/study/wordlist", json={"word": "notaword"}).status_code == 404

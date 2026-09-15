"""词典、词书与阅读理解/错题本接口测试。"""


def test_books_initial(client):
    """词书列表：种子词书共 5 词，初始无学习进度。"""
    books = client.get("/api/books").json()
    assert len(books) == 1
    b = books[0]
    assert (b["code"], b["total"], b["learned"], b["mastered"], b["due_now"]) == ("test4", 5, 0, 0, 0)


def test_books_progress_after_review(client):
    """学过一个词后，词书进度 learned 应 +1。"""
    client.post("/api/study/review", json={"kind": "new", "word": "apple", "rating": 3, "book_id": 1})
    b = client.get("/api/books").json()[0]
    assert b["learned"] == 1


def test_dictionary_found_and_404(client):
    """查词：命中返回音标释义，未命中返回 404。"""
    r = client.get("/api/dictionary/apple")
    assert r.status_code == 200
    assert r.json()["translation"] == "n. 苹果"
    assert client.get("/api/dictionary/zzzz").status_code == 404


def _article_ids(client):
    arts = client.get("/api/articles").json()
    art_id = arts[0]["id"]
    detail = client.get(f"/api/articles/{art_id}").json()
    return art_id, detail


def test_article_detail_hides_answers(client):
    """文章详情不应泄露答案与解析。"""
    _, detail = _article_ids(client)
    assert len(detail["questions"]) == 2
    assert all("answer" not in q and "explanation" not in q for q in detail["questions"])
    assert detail["attempts"] == []


def test_submit_grading_and_attempt(client):
    """提交作答：逐题判分、记录做题次数。"""
    art_id, detail = _article_ids(client)
    q1, q2 = detail["questions"]
    r = client.post(f"/api/articles/{art_id}/submit", json={
        "answers": [{"question_id": q1["id"], "choice": 1}, {"question_id": q2["id"], "choice": 0}],
    })
    assert r.status_code == 200
    body = r.json()
    assert (body["correct"], body["total"]) == (1, 2)
    assert body["results"][0]["correct"] is True
    assert body["results"][1]["correct"] is False and body["results"][1]["answer"] == 2
    # 做题记录已登记
    _, detail2 = _article_ids(client)
    assert len(detail2["attempts"]) == 1


def test_mistake_flow(client):
    """错题闭环：答错自动收进（不重复）→ 重练答对自动解决。"""
    art_id, detail = _article_ids(client)
    q1 = detail["questions"][0]
    payload = {"answers": [{"question_id": q1["id"], "choice": 0}]}  # 正确答案是 B(1)
    client.post(f"/api/articles/{art_id}/submit", json=payload)

    unresolved = client.get("/api/mistakes").json()
    assert len(unresolved) == 1
    assert unresolved[0]["question"]["id"] == q1["id"]

    # 重复答错同一题：错题不重复入库
    client.post(f"/api/articles/{art_id}/submit", json=payload)
    assert len(client.get("/api/mistakes").json()) == 1

    # 重练答对 → 移入已解决
    r = client.post(f"/api/mistakes/{q1['id']}/practice", json={"choice": 1})
    assert r.json()["correct"] is True
    assert client.get("/api/mistakes?resolved=false").json() == []
    assert len(client.get("/api/mistakes?resolved=true").json()) == 1


def test_practice_wrong_keeps_mistake(client):
    """重练仍答错：错题保留在未解决列表。"""
    art_id, detail = _article_ids(client)
    q1 = detail["questions"][0]
    client.post(f"/api/articles/{art_id}/submit", json={"answers": [{"question_id": q1["id"], "choice": 0}]})
    r = client.post(f"/api/mistakes/{q1['id']}/practice", json={"choice": 0})
    assert r.json()["correct"] is False
    assert len(client.get("/api/mistakes").json()) == 1

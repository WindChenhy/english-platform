"""默写出题接口测试（单词/短语/句子三种模式与范围过滤）。"""


def test_overview(client):
    """概览：短语数按词书统计、句子数按级别统计。"""
    data = client.get("/api/dictation/overview").json()
    assert data["phrase_by_book"]["1"] == 5  # 每个词条 1 条短语
    assert data["sentence_by_level"] == {"cet4": 1}
    assert data["wordlist_count"] == 0


def test_quiz_word_from_book(client):
    """单词默写：从词书随机出题，prompt 为释义。"""
    r = client.post("/api/dictation/quiz", json={"kind": "word", "source": "book", "book_id": 1, "count": 3})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 3
    assert all(i["answer"] in {"apple", "banana", "cat", "dog", "egg"} for i in items)


def test_quiz_word_needs_book(client):
    """词书来源但未指定词书 → 400。"""
    assert client.post("/api/dictation/quiz", json={"kind": "word", "source": "book"}).status_code == 400


def test_quiz_word_wordlist(client):
    """单词默写（生词本来源）：收藏后才可出题，词条来自生词卡。"""
    assert client.post("/api/dictation/quiz", json={
        "kind": "word", "source": "wordlist", "count": 5,
    }).status_code == 404  # 空生词本
    client.post("/api/study/wordlist", json={"word": "strawberry"})
    items = client.post("/api/dictation/quiz", json={
        "kind": "word", "source": "wordlist", "count": 5,
    }).json()["items"]
    assert len(items) == 1 and items[0]["answer"] == "strawberry"


def test_quiz_phrase(client):
    """短语默写：来自词条 detail_json 的短语库。"""
    items = client.post("/api/dictation/quiz", json={"kind": "phrase", "book_id": 1, "count": 2}).json()["items"]
    assert len(items) == 2
    assert all(i["answer"].endswith(" out") for i in items)


def test_quiz_sentence(client):
    """句子默写：中文译文为提示，原句必须来自文章。"""
    items = client.post("/api/dictation/quiz", json={"kind": "sentence"}).json()["items"]
    assert len(items) == 1
    assert items[0]["source"] == "Test Article"
    assert "apples" in items[0]["answer"]


def test_quiz_sentence_level_empty(client):
    """按不存在内容的级别过滤 → 404。"""
    assert client.post("/api/dictation/quiz", json={"kind": "sentence", "level": "cet6"}).status_code == 404

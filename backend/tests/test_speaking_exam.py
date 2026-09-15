"""真题材料与口语场景接口测试。"""
import io


def test_exam_articles_filter(client):
    """考试材料按 category=exam 过滤；分级阅读默认不含 exam。"""
    # 种子 Test Article 为 graded
    graded = client.get("/api/articles", params={"category": "graded"}).json()
    assert all(a["category"] == "graded" for a in graded)
    exam = client.get("/api/articles", params={"category": "exam"}).json()
    assert exam == []  # 测试库尚未导入 exam 文章


def test_speaking_scenarios(client):
    """场景列表与详情。"""
    lst = client.get("/api/speaking/scenarios").json()
    assert len(lst) >= 1
    assert lst[0]["code"] == "test_airport"
    detail = client.get(f"/api/speaking/scenarios/{lst[0]['id']}").json()
    assert detail["lines"][0]["en"] == "Where is the gate?"
    assert client.get("/api/speaking/scenarios/999").status_code == 404


def test_speaking_record_save_and_audio(client):
    """录音记录上传：带音频时落盘并可回放。"""
    audio = io.BytesIO(b"RIFF0000WAVEfake")
    r = client.post(
        "/api/speaking/records",
        data={
            "target_text": "Where is the gate?",
            "transcript": "where is the gate",
            "score": "88",
            "scenario_id": "1",
            "duration_ms": "1200",
        },
        files={"audio": ("clip.webm", audio, "audio/webm")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["has_audio"] is True
    assert body["score"] == 88

    recs = client.get("/api/speaking/records", params={"scenario_id": 1}).json()
    assert recs and recs[0]["target_text"] == "Where is the gate?"
    assert client.get(f"/api/speaking/records/{body['id']}/audio").status_code == 200

    stats = client.get("/api/speaking/stats").json()
    assert stats["total"] == 1
    assert stats["avg_score"] == 88

    assert client.delete(f"/api/speaking/records/{body['id']}").json()["deleted"] is True
    assert client.get("/api/speaking/records").json() == []


def test_speaking_record_without_audio(client):
    """仅评分无音频时也可保存。"""
    r = client.post(
        "/api/speaking/records",
        data={"target_text": "Hello", "transcript": "hello", "score": "100"},
    )
    assert r.status_code == 200
    assert r.json()["has_audio"] is False


def test_speaking_filter_scene(client):
    """按场景类型过滤。"""
    airport = client.get("/api/speaking/scenarios", params={"scene": "airport"}).json()
    assert all(s["scene"] == "airport" for s in airport)
    hotel = client.get("/api/speaking/scenarios", params={"scene": "hotel"}).json()
    assert hotel == []


def test_articles_include_category_fields(client):
    """文章详情携带 category/exam_label 字段。"""
    arts = client.get("/api/articles").json()
    aid = arts[0]["id"]
    detail = client.get(f"/api/articles/{aid}").json()
    assert detail["category"] == "graded"
    assert "exam_label" in detail

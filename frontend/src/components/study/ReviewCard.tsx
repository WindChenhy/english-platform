/** 复习卡：翻面三档自评，支持挂起/埋藏跳过本词。 */
import { PauseCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { Button, Col, Row, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { QueueItemReview } from '../../api';
import { speak } from '../../speech';

export default function ReviewCard({
  item,
  revealed,
  onReveal,
  onRate,
  onSuspend,
  onBury,
}: {
  item: QueueItemReview;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: 1 | 2 | 3) => void;
  onSuspend: () => void;
  onBury: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div style={{ textAlign: 'center' }}>
        <span className="study-word">
          <span className="marker-ink">{item.word}</span>
        </span>
        <Button type="text" icon={<SoundOutlined />} onClick={() => speak(item.word)} />
        <Space size={4} style={{ display: 'block', marginTop: 4 }}>
          <Button size="small" type="text" icon={<PauseCircleOutlined />} onClick={onSuspend}>
            {t('study.suspend')}
          </Button>
          <Button size="small" type="text" onClick={onBury}>
            {t('study.bury')}
          </Button>
        </Space>
      </div>
      <div className="study-phonetic">
        {item.phonetic ? `/ ${item.phonetic} /` : t('study.reviewFallback')}
      </div>
      {!revealed ? (
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <Button type="primary" size="large" style={{ paddingInline: 42 }} onClick={onReveal}>
            {t('study.showAnswer')}
          </Button>
          <div className="hand" style={{ marginTop: 14, color: 'var(--ink-soft)', fontSize: 13 }}>
            {t('study.recallHint')}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <Typography.Paragraph
            strong
            style={{ textAlign: 'center', fontSize: 17, maxWidth: 640, margin: '0 auto' }}
          >
            {item.meaning}
          </Typography.Paragraph>
          <Row justify="center" gutter={12} style={{ marginTop: 26 }}>
            <Col>
              <Button danger size="large" style={{ borderWidth: 2, fontWeight: 600 }} onClick={() => onRate(1)}>
                {t('study.rate1')}
              </Button>
            </Col>
            <Col>
              <Button
                size="large"
                style={{ color: 'var(--amber-ink)', borderColor: 'var(--amber-ink)', borderWidth: 2, fontWeight: 600 }}
                onClick={() => onRate(2)}
              >
                {t('study.rate2')}
              </Button>
            </Col>
            <Col>
              <Button
                type="primary"
                size="large"
                style={{ background: 'var(--green-ink)', borderWidth: 2, fontWeight: 600 }}
                onClick={() => onRate(3)}
              >
                {t('study.rate3')}
              </Button>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
}

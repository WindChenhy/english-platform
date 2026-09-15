/** 新词卡：英→中 / 中→英 四选一，答后展开例句短语等详情。 */
import { CheckCircleFilled, CloseCircleFilled, SoundOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueueItemNew } from '../../api';
import { speak } from '../../speech';

const LETTERS = ['A', 'B', 'C', 'D'];

/** 单块详情列表（例句/短语/近义词/同根词共用布局）。 */
function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-block" style={{ textAlign: 'left' }}>
      <span className="eyebrow">{title}</span>
      {children}
    </div>
  );
}

export default function NewCard({
  item,
  answered,
  onChoose,
  onNext,
}: {
  item: QueueItemNew;
  answered?: { choice: number; correct: boolean };
  onChoose: (choice: number) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const detail = item.detail;
  const isC2E = item.quiz === 'c2e';
  return (
    <div>
      {!isC2E ? (
        <>
          <div style={{ textAlign: 'center' }}>
            <span className="study-word">
              <span className="marker-ink">{item.word}</span>
            </span>
            <Button type="text" icon={<SoundOutlined />} onClick={() => speak(item.word)} />
          </div>
          <div className="study-phonetic">
            {item.phonetic_us ? `/ ${item.phonetic_us} /` : item.phonetic_uk ? `/ ${item.phonetic_uk} /` : ''}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0 2px' }}>
          <span className="eyebrow" style={{ letterSpacing: 2 }}>
            {t('study.c2eEyebrow')}
          </span>
          <div
            style={{
              fontSize: 29,
              fontWeight: 650,
              color: 'var(--ink)',
              lineHeight: 1.55,
              maxWidth: 620,
              margin: '4px auto 0',
            }}
          >
            {item.meaning}
          </div>
        </div>
      )}
      {answered && (
        <div
          className="hand-verdict"
          style={{ color: answered.correct ? 'var(--green-ink)' : 'var(--red-pen)' }}
        >
          {answered.correct ? t('study.vRight') : t('study.vWrong')}
        </div>
      )}

      <div style={{ maxWidth: 560, margin: '10px auto 0' }}>
        {item.options.map((opt, i) => {
          const isCorrectOpt = opt === (isC2E ? item.word : item.meaning);
          let style: CSSProperties = {};
          if (answered) {
            if (isCorrectOpt) style = { borderColor: 'var(--green-ink)', background: 'rgba(59,140,90,.07)' };
            else if (i === answered.choice) style = { borderColor: 'var(--red-pen)', background: 'rgba(214,69,80,.06)' };
          }
          return (
            <Button
              key={i}
              block
              className="option-btn"
              disabled={!!answered}
              onClick={() => onChoose(i)}
              style={{ ...style, marginBottom: 8 }}
            >
              <span className="opt-letter">{LETTERS[i]}</span>
              {answered && isCorrectOpt && (
                <CheckCircleFilled style={{ color: 'var(--green-ink)', marginRight: 8 }} />
              )}
              {answered && i === answered.choice && !answered.correct && (
                <CloseCircleFilled style={{ color: 'var(--red-pen)', marginRight: 8 }} />
              )}
              {isC2E ? (
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>{opt}</span>
              ) : (
                opt
              )}
            </Button>
          );
        })}
      </div>

      {answered && (
        <div style={{ marginTop: 14 }}>
          {isC2E && (
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 30,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                <span className="marker-ink">{item.word}</span>
              </span>
              <Button type="text" icon={<SoundOutlined />} onClick={() => speak(item.word)} />
              <div className="study-phonetic" style={{ marginBottom: 4 }}>
                {item.phonetic_us ? `/ ${item.phonetic_us} /` : item.phonetic_uk ? `/ ${item.phonetic_uk} /` : ''}
              </div>
              <Typography.Paragraph strong style={{ maxWidth: 640, margin: '0 auto' }}>
                {item.meaning}
              </Typography.Paragraph>
            </div>
          )}
          {!isC2E && (
            <Typography.Paragraph strong style={{ textAlign: 'center', fontSize: 16 }}>
              {item.meaning}
            </Typography.Paragraph>
          )}
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
            {detail?.sentences && detail.sentences.length > 0 && (
              <DetailBlock title={t('study.dSentences')}>
                {detail.sentences.map((s, i) => (
                  <div key={i} className="detail-line">
                    <Button
                      size="small"
                      type="text"
                      icon={<SoundOutlined />}
                      onClick={() => speak(s.en)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontFamily: 'var(--font-serif)' }}>{s.en}</span>
                    <br />
                    <span className="detail-cn" style={{ marginLeft: 30 }}>
                      {s.zh}
                    </span>
                  </div>
                ))}
              </DetailBlock>
            )}
            {detail?.phrases && detail.phrases.length > 0 && (
              <DetailBlock title={t('study.dPhrases')}>
                <div>
                  {detail.phrases.map((p, i) => (
                    <Tag key={i} style={{ marginBottom: 4, background: '#fff' }}>
                      {p.en} <span className="detail-cn">{p.zh}</span>
                    </Tag>
                  ))}
                </div>
              </DetailBlock>
            )}
            {detail?.synonyms && detail.synonyms.length > 0 && (
              <DetailBlock title={t('study.dSynonyms')}>
                <div>
                  {detail.synonyms.map((s, i) => (
                    <Tag
                      key={i}
                      style={{
                        marginBottom: 4,
                        background: '#fff',
                        borderColor: 'var(--ink-primary)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {s.word} <span className="detail-cn">{s.zh}</span>
                    </Tag>
                  ))}
                </div>
              </DetailBlock>
            )}
            {detail?.related && detail.related.length > 0 && (
              <DetailBlock title={t('study.dRelated')}>
                <div>
                  {detail.related.map((r, i) => (
                    <Tag key={i} style={{ marginBottom: 4, background: '#fff' }}>
                      {r.word} <span className="detail-cn">{r.zh}</span>
                    </Tag>
                  ))}
                </div>
              </DetailBlock>
            )}
          </div>
          <Button
            type="primary"
            block
            size="large"
            style={{ marginTop: 18, maxWidth: 560 }}
            onClick={onNext}
          >
            {t('study.next')}
          </Button>
        </div>
      )}
    </div>
  );
}

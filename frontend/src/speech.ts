/**
 * 单词/例句发音：使用浏览器内置 Web Speech API，零依赖、离线可用。
 */

/**
 * 朗读一段英文文本（重复调用会打断上一次朗读）。
 * @param text 要朗读的英文内容
 */
export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

/**
 * 뉴스레터 분석기
 * 이메일 구조 분석 및 패턴 추출
 */

const fs = require('fs');
const path = require('path');

class NewsletterAnalyzer {
  constructor() {
    this.configDir = path.join(__dirname, '..', '..', 'config');
  }

  /**
   * 라벨 분석
   */
  async analyzeLabel(label, onProgress) {
    const labelName = label.name || label;

    if (onProgress) {
      onProgress({ status: 'started', label: labelName });
    }

    // 실제 구현에서는 Gmail API로 이메일을 가져와 분석
    // 현재는 기본 구조 반환
    const result = {
      label: labelName,
      senders: [],
      structure: {
        type: 'multi-item',
        avgItemCount: 5
      },
      encoding: 'utf-8',
      analyzed_at: new Date().toISOString()
    };

    if (onProgress) {
      onProgress({ status: 'complete', label: labelName, result });
    }

    return result;
  }

  /**
   * 보낸사람별 집계
   */
  aggregateBySender(emails) {
    const senderMap = new Map();

    for (const email of emails) {
      const sender = this.extractSender(email.from);

      if (!senderMap.has(sender.email)) {
        senderMap.set(sender.email, {
          email: sender.email,
          name: sender.name,
          emails: [],
          frequency: 0
        });
      }

      const senderData = senderMap.get(sender.email);
      senderData.emails.push(email);
      senderData.frequency++;
    }

    return Array.from(senderMap.values());
  }

  /**
   * 발신자 정보 추출
   */
  extractSender(fromField) {
    // "이름 <email@example.com>" 형식 파싱
    const match = fromField.match(/^(.+?)\s*<(.+?)>$/);
    if (match) {
      return {
        name: match[1].trim().replace(/"/g, ''),
        email: match[2].trim()
      };
    }

    // 이메일만 있는 경우
    return {
      name: fromField.split('@')[0],
      email: fromField.trim()
    };
  }

  /**
   * 샘플 크기 계산
   */
  calculateSampleSize(frequency) {
    if (frequency <= 1) return 1;
    if (frequency <= 3) return 2;
    if (frequency <= 7) return 3;
    return Math.min(5, frequency);
  }

  /**
   * 대표 샘플 선택
   */
  selectRepresentativeSamples(emails, count) {
    if (emails.length <= count) {
      return emails;
    }

    // 날짜 기준 균등 분포 선택
    const sorted = [...emails].sort((a, b) =>
      new Date(b.date) - new Date(a.date)
    );

    const interval = Math.floor(sorted.length / count);
    const samples = [];

    for (let i = 0; i < count; i++) {
      samples.push(sorted[i * interval]);
    }

    return samples;
  }

  /**
   * 인코딩 무결성 검증
   */
  verifyEncodingIntegrity(emails) {
    for (const email of emails) {
      const text = email.clean_text || email.body || '';

      // 한글 깨짐 패턴 감지
      if (text.includes('ใ') || text.includes('�') || text.includes('ã')) {
        return false;
      }
    }
    return true;
  }

  /**
   * charset 감지
   */
  detectCharset(emails) {
    if (emails.length === 0) return 'utf-8';

    const firstEmail = emails[0];
    const headers = firstEmail.headers || {};
    const contentType = headers['content-type'] || '';
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);

    return charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';
  }

  /**
   * 뉴스레터 카탈로그 저장
   */
  saveNewsletterCatalog(newsletters) {
    const catalogPath = path.join(this.configDir, 'newsletters.json');

    const catalog = {
      newsletters,
      last_scan: new Date().toISOString()
    };

    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

    return catalogPath;
  }
}

module.exports = { NewsletterAnalyzer };

/**
 * Gmail 메시지 수집 (Node.js)
 * PowerShell 스크립트를 대체하는 크로스 플랫폼 버전
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

class GmailFetcher {
  constructor(credentialsDir) {
    this.credentialsDir = credentialsDir || path.join(__dirname, '..', 'config', 'credentials');
    this.gmail = null;
  }

  /**
   * Gmail API 인증
   */
  async authenticate() {
    const tokenPath = path.join(this.credentialsDir, 'token.json');
    const clientSecretPath = path.join(this.credentialsDir, 'client_secret.json');

    if (!fs.existsSync(tokenPath)) {
      throw new Error('token.json not found. Run npm run auth first.');
    }

    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

    // client_secret.json이 있으면 사용, 없으면 토큰만으로 인증
    let auth;
    if (fs.existsSync(clientSecretPath)) {
      const credentials = JSON.parse(fs.readFileSync(clientSecretPath, 'utf8'));
      const { client_id, client_secret } = credentials.installed || credentials.web;

      auth = new google.auth.OAuth2(client_id, client_secret);
      auth.setCredentials(token);
    } else {
      // 토큰만으로 인증 (access_token 사용)
      auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: token.access_token });
    }

    this.gmail = google.gmail({ version: 'v1', auth });
    return this;
  }

  /**
   * 메시지 목록 가져오기
   */
  async listMessages(options) {
    const { label, subLabels, dateStart, dateEnd, maxResults = 100 } = options;

    // 라벨 쿼리 생성
    const labelParts = [`label:${label}`];
    if (subLabels && subLabels.length > 0) {
      subLabels.forEach(sub => labelParts.push(`label:${sub.trim()}`));
    }
    const labelQuery = `(${labelParts.join(' OR ')})`;
    const query = `${labelQuery} after:${dateStart} before:${dateEnd}`;

    console.log(`Query: ${query}`);

    const allMessages = [];
    let pageToken = null;

    do {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        pageToken
      });

      if (response.data.messages) {
        allMessages.push(...response.data.messages);
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    console.log(`Fetched from API: ${allMessages.length} messages`);
    return allMessages;
  }

  /**
   * 단일 메시지 상세 정보 가져오기
   */
  async getMessage(messageId) {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });
    return response.data;
  }

  /**
   * 메시지에서 헤더 추출
   */
  extractHeaders(message) {
    const headers = message.payload.headers || [];
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    return {
      subject: getHeader('Subject'),
      from: getHeader('From'),
      date: getHeader('Date')
    };
  }

  /**
   * Base64 URL-safe 디코딩
   */
  decodeBase64(data) {
    if (!data) return '';

    // URL-safe base64를 일반 base64로 변환
    let base64 = data.replace(/-/g, '+').replace(/_/g, '/');

    // 패딩 추가
    while (base64.length % 4) {
      base64 += '=';
    }

    try {
      return Buffer.from(base64, 'base64').toString('utf8');
    } catch (error) {
      return '';
    }
  }

  /**
   * 메시지에서 HTML 본문 추출
   */
  extractHtmlBody(message) {
    const payload = message.payload;

    // 직접 body에 data가 있는 경우
    if (payload.body && payload.body.data) {
      return this.decodeBase64(payload.body.data);
    }

    // parts에서 HTML 찾기
    if (payload.parts) {
      const htmlBody = this.findHtmlInParts(payload.parts);
      if (htmlBody) return htmlBody;
    }

    return '';
  }

  /**
   * parts 배열에서 HTML 재귀적 탐색
   */
  findHtmlInParts(parts) {
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        return this.decodeBase64(part.body.data);
      }

      // nested parts 탐색
      if (part.parts) {
        const nestedHtml = this.findHtmlInParts(part.parts);
        if (nestedHtml) return nestedHtml;
      }
    }
    return null;
  }

  /**
   * 날짜를 KST로 변환
   */
  parseToKST(dateString) {
    if (!dateString) return null;

    try {
      // 괄호 안의 타임존 표시 제거 (예: "(UTC)")
      const cleanDate = dateString.replace(/\s*\([^)]+\)\s*$/, '');
      const date = new Date(cleanDate);

      if (isNaN(date.getTime())) return null;

      // KST (UTC+9)로 변환
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(date.getTime() + kstOffset);

      return kstDate;
    } catch (error) {
      return null;
    }
  }

  /**
   * KST 날짜 범위 필터링
   */
  isInKSTDateRange(dateString, targetDate) {
    if (!targetDate) return true;

    const kstDate = this.parseToKST(dateString);
    if (!kstDate) return false;

    const targetStart = new Date(targetDate + 'T00:00:00');
    const targetEnd = new Date(targetDate + 'T23:59:59');

    const kstYear = kstDate.getUTCFullYear();
    const kstMonth = kstDate.getUTCMonth();
    const kstDay = kstDate.getUTCDate();
    const msgDate = new Date(kstYear, kstMonth, kstDay);

    return msgDate >= targetStart && msgDate <= targetEnd;
  }

  /**
   * 메시지 수집 및 저장
   */
  async fetchMessages(options) {
    const { label, subLabels, dateStart, dateEnd, targetDate, outputDir } = options;

    // 출력 디렉토리 생성
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 메시지 목록 가져오기
    const messageList = await this.listMessages({
      label,
      subLabels: subLabels ? subLabels.split(',') : [],
      dateStart,
      dateEnd
    });

    if (targetDate) {
      console.log(`Target Date (KST): ${targetDate}`);
    }

    const seenHashes = new Map();
    const filteredMessages = [];
    const duplicateIds = [];
    const skippedByDate = [];
    const senders = new Map(); // 발신자 집계용

    for (const msg of messageList) {
      const msgId = msg.id;
      console.log(`Fetching: ${msgId}`);

      try {
        const msgData = await this.getMessage(msgId);
        const headers = this.extractHeaders(msgData);
        const { subject, from, date } = headers;

        // KST 날짜 필터링
        if (targetDate && !this.isInKSTDateRange(date, targetDate)) {
          console.log(`  Skipped (out of KST range)`);
          skippedByDate.push(msgId);
          continue;
        }

        // HTML 본문 추출
        const htmlBody = this.extractHtmlBody(msgData);

        // 중복 감지
        const contentHash = `${subject}|${from}|${htmlBody.length}`;
        if (seenHashes.has(contentHash)) {
          console.log(`  Skipped (duplicate of ${seenHashes.get(contentHash)})`);
          duplicateIds.push(msgId);
          continue;
        }
        seenHashes.set(contentHash, msgId);

        // KST 날짜 문자열
        const kstDate = this.parseToKST(date);
        const dateKstStr = kstDate
          ? kstDate.toISOString().replace('T', ' ').substring(0, 19)
          : '';

        // 발신자 집계
        const senderEmail = this.extractSenderEmail(from);
        if (senderEmail) {
          if (!senders.has(senderEmail)) {
            senders.set(senderEmail, { email: senderEmail, name: from, count: 0 });
          }
          senders.get(senderEmail).count++;
        }

        // 결과 저장
        const msgResult = {
          message_id: msgId,
          subject,
          from,
          date,
          date_kst: dateKstStr,
          html_length: htmlBody.length,
          html_body: htmlBody
        };

        const msgPath = path.join(outputDir, `msg_${msgId}.json`);
        fs.writeFileSync(msgPath, JSON.stringify(msgResult, null, 2), 'utf8');

        filteredMessages.push({ id: msgId });
        console.log(`  OK: ${subject} (HTML: ${htmlBody.length}) [KST: ${dateKstStr}]`);

      } catch (error) {
        console.log(`  Error: ${error.message}`);
        continue;
      }
    }

    // 최종 결과 저장
    const result = {
      label,
      date_start: dateStart,
      date_end: dateEnd,
      target_date: targetDate || null,
      total_fetched: messageList.length,
      total_count: filteredMessages.length,
      skipped_by_date: skippedByDate.length,
      duplicates_count: duplicateIds.length,
      duplicates: duplicateIds,
      messages: filteredMessages,
      senders: Array.from(senders.values()) // 발신자 목록 추가
    };

    const resultPath = path.join(outputDir, 'messages_list.json');
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf8');

    console.log('');
    console.log('=== Summary ===');
    console.log(`Fetched: ${messageList.length}`);
    console.log(`Skipped by KST date: ${skippedByDate.length}`);
    console.log(`Duplicates: ${duplicateIds.length}`);
    console.log(`Final: ${filteredMessages.length}`);
    console.log(`Unique senders: ${senders.size}`);
    console.log('Done!');

    return result;
  }

  /**
   * 발신자 이메일 추출
   */
  extractSenderEmail(from) {
    if (!from) return null;
    const match = from.match(/<(.+?)>/);
    return match ? match[1] : from.trim();
  }
}

/**
 * CLI 실행
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--?/, '');
    const value = args[i + 1];
    options[key] = value;
  }

  // 필수 파라미터 확인
  if (!options.label || !options.dateStart || !options.dateEnd || !options.outputDir) {
    console.error('Usage: node fetch_gmail.js --label <label> --dateStart <YYYY/MM/DD> --dateEnd <YYYY/MM/DD> --outputDir <dir> [--targetDate <YYYY-MM-DD>] [--subLabels <label1,label2>]');
    process.exit(1);
  }

  try {
    const fetcher = new GmailFetcher();
    await fetcher.authenticate();
    await fetcher.fetchMessages({
      label: options.label,
      subLabels: options.subLabels || '',
      dateStart: options.dateStart,
      dateEnd: options.dateEnd,
      targetDate: options.targetDate || null,
      outputDir: options.outputDir
    });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// CLI 실행 또는 모듈 export
if (require.main === module) {
  main();
}

module.exports = { GmailFetcher };

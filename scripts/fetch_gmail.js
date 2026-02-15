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
    // 재시도 설정
    this.retryDelays = [1000, 2000, 4000, 8000, 16000];
  }

  /**
   * 재시도 래퍼
   */
  async withRetry(operation, operationName) {
    let lastError;
    for (let i = 0; i <= this.retryDelays.length; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const isRetryable = this.isRetryableError(error);

        if (isRetryable && i < this.retryDelays.length) {
          const delay = this.retryDelays[i];
          console.log(`  ${operationName} 실패, ${delay/1000}초 후 재시도 (${i + 1}/${this.retryDelays.length}): ${error.message}`);
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * 재시도 가능한 에러인지 확인
   */
  isRetryableError(error) {
    const code = error.code;
    const status = error.response?.status;
    const msg = error.message || '';

    return (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      msg.includes('timeout') ||
      msg.includes('socket hang up')
    );
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
   * 메시지 목록 가져오기 (재시도 포함)
   */
  async listMessages(options) {
    const { label, subLabels, dateStart, dateEnd, maxResults = 100 } = options;

    // 라벨 쿼리 생성 (Gmail 검색에서 공백은 하이픈으로 치환 필요)
    const labelParts = [`label:${label.replace(/ /g, '-')}`];
    if (subLabels && subLabels.length > 0) {
      subLabels.forEach(sub => labelParts.push(`label:${sub.trim().replace(/ /g, '-')}`));
    }
    const labelQuery = `(${labelParts.join(' OR ')})`;
    const query = `${labelQuery} after:${dateStart} before:${dateEnd}`;

    console.log(`Query: ${query}`);

    const allMessages = [];
    let pageToken = null;

    do {
      const response = await this.withRetry(
        () => this.gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults,
          pageToken
        }),
        'messages.list'
      );

      if (response.data.messages) {
        allMessages.push(...response.data.messages);
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    console.log(`Fetched from API: ${allMessages.length} messages`);
    return allMessages;
  }

  /**
   * 단일 메시지 상세 정보 가져오기 (재시도 포함)
   */
  async getMessage(messageId) {
    const response = await this.withRetry(
      () => this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      }),
      `messages.get(${messageId.substring(0, 8)})`
    );
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
   * JavaScript Date()는 이미 타임존을 해석하므로 추가 변환 불필요
   */
  parseToKST(dateString) {
    if (!dateString) return null;

    try {
      // 괄호 안의 타임존 표시 제거 (예: "(UTC)")
      const cleanDate = dateString.replace(/\s*\([^)]+\)\s*$/, '');
      const date = new Date(cleanDate);

      if (isNaN(date.getTime())) return null;

      // Date()가 이미 타임존을 해석함
      // UTC 시간에서 KST(+9) 날짜/시간 계산
      const utcYear = date.getUTCFullYear();
      const utcMonth = date.getUTCMonth();
      const utcDate = date.getUTCDate();
      const utcHours = date.getUTCHours();

      // KST = UTC + 9시간
      const kstHours = utcHours + 9;
      const dayOverflow = kstHours >= 24 ? 1 : 0;

      // KST 날짜로 새 Date 생성 (UTC로 저장하여 일관성 유지)
      const kstDate = new Date(Date.UTC(
        utcYear,
        utcMonth,
        utcDate + dayOverflow,
        kstHours % 24,
        date.getUTCMinutes(),
        date.getUTCSeconds()
      ));

      return kstDate;
    } catch (error) {
      return null;
    }
  }

  /**
   * 시간 범위 필터링 (실제 시작/종료 시각 기준)
   * @param {string} dateString - 메일의 Date 헤더
   * @param {string} rangeStart - ISO 문자열 (예: '2025-02-05T10:01:00+09:00')
   * @param {string} rangeEnd - ISO 문자열 (예: '2025-02-06T10:00:00+09:00')
   * @param {string} targetDate - (하위 호환) YYYY-MM-DD 형식, rangeStart/rangeEnd 없을 때 사용
   */
  isInDateRange(dateString, rangeStart, rangeEnd, targetDate) {
    // 실제 시간 범위가 있으면 정밀 비교
    if (rangeStart && rangeEnd) {
      try {
        const cleanDate = dateString.replace(/\s*\(.*?\)\s*$/, '');
        const msgDate = new Date(cleanDate);
        if (isNaN(msgDate.getTime())) return false;

        const start = new Date(rangeStart);
        const end = new Date(rangeEnd);
        return msgDate >= start && msgDate < end;
      } catch (e) {
        return false;
      }
    }

    // 하위 호환: targetDate만 있으면 기존 KST 날짜 비교
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
    const { label, subLabels, dateStart, dateEnd, targetDate, rangeStart, rangeEnd, outputDir } = options;

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

    if (rangeStart && rangeEnd) {
      console.log(`Time Range: ${rangeStart} ~ ${rangeEnd}`);
    } else if (targetDate) {
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

        // 시간 범위 필터링
        if ((rangeStart && rangeEnd) || targetDate) {
          if (!this.isInDateRange(date, rangeStart, rangeEnd, targetDate)) {
            console.log(`  Skipped (out of range)`);
            skippedByDate.push(msgId);
            continue;
          }
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

  /**
   * 메시지를 읽음으로 표시 (UNREAD 라벨 제거)
   */
  async markAsRead(messageId) {
    return await this.withRetry(
      () => this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      }),
      `markAsRead(${messageId.substring(0, 8)})`
    );
  }

  /**
   * 여러 메시지를 읽음으로 표시 (배치)
   */
  async markMessagesAsRead(messageIds) {
    if (!messageIds || messageIds.length === 0) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;

    for (const messageId of messageIds) {
      try {
        await this.markAsRead(messageId);
        success++;
      } catch (error) {
        console.log(`  읽음 표시 실패 (${messageId}): ${error.message}`);
        failed++;
      }
    }

    console.log(`읽음 표시 완료: 성공 ${success}개, 실패 ${failed}개`);
    return { success, failed };
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

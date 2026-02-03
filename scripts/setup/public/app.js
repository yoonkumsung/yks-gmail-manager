/**
 * Gmail Manager 설정 마법사 - 프론트엔드
 */

// 상태 관리
const state = {
  currentStep: 1,
  profile: null,
  labels: [],
  selectedLabels: [],
  analysisComplete: false,
  generationComplete: false,
  generatedAgents: [],
  generatedSkills: []
};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadExistingProfile();
  loadLabels();
  setupFormHandler();
});

// 기존 프로필 로드
async function loadExistingProfile() {
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      const data = await res.json();
      if (data.profile && data.profile.user) {
        const user = data.profile.user;
        document.getElementById('occupation').value = user.occupation?.title || '';
        document.getElementById('occupationDesc').value = user.occupation?.description || '';
        document.getElementById('interestsTechnical').value = (user.interests?.technical || []).join(', ');
        document.getElementById('interestsBusiness').value = (user.interests?.business || []).join(', ');
        document.getElementById('interestsIntellectual').value = (user.interests?.intellectual || []).join(', ');
        document.getElementById('interestsCreative').value = (user.interests?.creative || []).join(', ');
        document.getElementById('interestsSocial').value = (user.interests?.social || []).join(', ');
        state.profile = data.profile;
      }
    }
  } catch (err) {
    console.log('프로필 로드 실패 (첫 설정일 수 있음)');
  }
}

// 라벨 목록 로드
async function loadLabels() {
  try {
    const res = await fetch('/api/labels');
    if (res.ok) {
      const data = await res.json();
      state.labels = data.labels || [];
      renderLabels();
    } else {
      document.getElementById('labelsContainer').innerHTML =
        '<p class="error">라벨 목록을 불러올 수 없습니다. config/labels.json 파일을 확인하세요.</p>';
    }
  } catch (err) {
    document.getElementById('labelsContainer').innerHTML =
      '<p class="error">서버 연결 오류</p>';
  }
}

// 라벨 렌더링
function renderLabels() {
  const container = document.getElementById('labelsContainer');

  if (state.labels.length === 0) {
    container.innerHTML = '<p>사용 가능한 라벨이 없습니다. config/labels.json 파일을 확인하세요.</p>';
    return;
  }

  container.innerHTML = state.labels.map(label => `
    <div class="label-card ${label.enabled ? 'selected' : ''}"
         data-label="${label.name}"
         onclick="toggleLabel('${label.name}')">
      <div class="label-name">${label.name}</div>
      <div class="label-count">${label.description || ''}</div>
    </div>
  `).join('');

  // 초기 선택 상태 설정
  state.selectedLabels = state.labels.filter(l => l.enabled).map(l => l.name);
}

// 라벨 토글
function toggleLabel(labelName) {
  const card = document.querySelector(`[data-label="${labelName}"]`);
  const index = state.selectedLabels.indexOf(labelName);

  if (index > -1) {
    state.selectedLabels.splice(index, 1);
    card.classList.remove('selected');
  } else {
    state.selectedLabels.push(labelName);
    card.classList.add('selected');
  }
}

// 폼 핸들러 설정
function setupFormHandler() {
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const profile = {
      occupation: {
        title: document.getElementById('occupation').value.trim(),
        description: document.getElementById('occupationDesc').value.trim()
      },
      interests: {
        technical: parseInterests(document.getElementById('interestsTechnical').value),
        business: parseInterests(document.getElementById('interestsBusiness').value),
        intellectual: parseInterests(document.getElementById('interestsIntellectual').value),
        creative: parseInterests(document.getElementById('interestsCreative').value),
        social: parseInterests(document.getElementById('interestsSocial').value)
      }
    };

    // 프로필 저장
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile })
      });

      if (res.ok) {
        const data = await res.json();
        state.profile = data.profile;
        goToStep(2);
      } else {
        const error = await res.json();
        showError(error.errors?.join(', ') || '프로필 저장 실패');
      }
    } catch (err) {
      showError('서버 연결 오류');
    }
  });
}

// 관심사 파싱
function parseInterests(value) {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// 라벨 저장 후 다음 단계
async function saveLabelsAndNext() {
  if (state.selectedLabels.length === 0) {
    showError('최소 1개 이상의 라벨을 선택해주세요.');
    return;
  }

  try {
    const res = await fetch('/api/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedLabels: state.selectedLabels })
    });

    if (res.ok) {
      goToStep(3);
    } else {
      showError('라벨 저장 실패');
    }
  } catch (err) {
    showError('서버 연결 오류');
  }
}

// 분석 시작
async function startAnalysis() {
  const btn = document.getElementById('startAnalysisBtn');
  btn.disabled = true;
  btn.textContent = '분석 중...';

  const logContainer = document.getElementById('analysisLog');
  logContainer.innerHTML = '';

  const statusEl = document.getElementById('analysisStatus');
  statusEl.innerHTML = '<span class="status-icon loading">&#9696;</span><span class="status-text">분석 중...</span>';

  try {
    const eventSource = new EventSource(`/api/analyze?labels=${encodeURIComponent(state.selectedLabels.join(','))}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'progress') {
        addLog(logContainer, data.message, 'info');
      } else if (data.type === 'complete') {
        addLog(logContainer, `분석 완료: ${data.label}`, 'success');
      } else if (data.type === 'error') {
        addLog(logContainer, `오류: ${data.message}`, 'error');
      } else if (data.type === 'done') {
        eventSource.close();
        state.analysisComplete = true;
        statusEl.innerHTML = '<span class="status-icon">&#10003;</span><span class="status-text">분석 완료</span>';
        btn.classList.add('hidden');
        document.getElementById('nextAfterAnalysisBtn').classList.remove('hidden');
        addLog(logContainer, '모든 분석이 완료되었습니다.', 'success');
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      addLog(logContainer, '분석 중 오류가 발생했습니다.', 'error');
      btn.disabled = false;
      btn.textContent = '다시 시도';
    };
  } catch (err) {
    showError('분석 시작 실패');
    btn.disabled = false;
    btn.textContent = '다시 시도';
  }
}

// 로그 추가
function addLog(container, message, type) {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

// Agent 생성
async function generateAgents() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.textContent = '생성 중...';

  const progressContainer = document.getElementById('generationProgress');
  progressContainer.innerHTML = '<p class="loading">Agent 문서를 생성하는 중...</p>';

  try {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labels: state.selectedLabels,
        profile: state.profile
      })
    });

    if (res.ok) {
      const data = await res.json();
      state.generatedAgents = data.agents || [];
      state.generatedSkills = data.skills || [];
      state.generationComplete = true;

      // 결과 렌더링
      progressContainer.innerHTML = `
        <h4>생성된 Agent (${state.generatedAgents.length}개)</h4>
        ${state.generatedAgents.map(a => `
          <div class="generation-item">
            <span class="item-name">${a.name}</span>
            <span class="item-status done">&#10003; 생성됨</span>
          </div>
        `).join('')}
        ${state.generatedSkills.length > 0 ? `
          <h4 style="margin-top: 16px;">생성된 SKILL (${state.generatedSkills.length}개)</h4>
          ${state.generatedSkills.map(s => `
            <div class="generation-item">
              <span class="item-name">${s.name}</span>
              <span class="item-status done">&#10003; 생성됨</span>
            </div>
          `).join('')}
        ` : ''}
      `;

      btn.classList.add('hidden');
      document.getElementById('nextAfterGenerateBtn').classList.remove('hidden');
    } else {
      const error = await res.json();
      showError(error.message || 'Agent 생성 실패');
      btn.disabled = false;
      btn.textContent = '다시 시도';
    }
  } catch (err) {
    showError('서버 연결 오류');
    btn.disabled = false;
    btn.textContent = '다시 시도';
  }
}

// 완료 및 저장
async function finalize() {
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agents: state.generatedAgents,
        skills: state.generatedSkills
      })
    });

    if (res.ok) {
      // 요약 정보 표시
      const summaryEl = document.getElementById('summaryDetails');
      summaryEl.innerHTML = `
        <h4>설정 요약</h4>
        <ul>
          <li><strong>역할:</strong> ${state.profile?.user?.occupation?.title || '-'}</li>
          <li><strong>활성 라벨:</strong> ${state.selectedLabels.length}개</li>
          <li><strong>생성된 Agent:</strong> ${state.generatedAgents.length}개</li>
          <li><strong>생성된 SKILL:</strong> ${state.generatedSkills.length}개</li>
        </ul>
      `;
      goToStep(5);
    } else {
      showError('설정 저장 실패');
    }
  } catch (err) {
    showError('서버 연결 오류');
  }
}

// 마법사 종료
async function closeWizard() {
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch (err) {
    // 무시 - 서버가 종료되면서 연결이 끊김
  }

  document.body.innerHTML = `
    <div style="text-align: center; padding: 100px; color: white;">
      <h1>설정 완료</h1>
      <p>이 창을 닫아도 됩니다.</p>
    </div>
  `;
}

// 단계 이동
function goToStep(step) {
  // 현재 단계 비활성화
  document.querySelector(`.step-content.active`)?.classList.remove('active');
  document.querySelector(`.step.active`)?.classList.remove('active');

  // 이전 단계들 완료 표시
  document.querySelectorAll('.step').forEach((el, idx) => {
    if (idx + 1 < step) {
      el.classList.add('completed');
    } else {
      el.classList.remove('completed');
    }
  });

  // 새 단계 활성화
  document.getElementById(`step${step}`)?.classList.add('active');
  document.querySelector(`[data-step="${step}"]`)?.classList.add('active');

  // 프로그레스 바 업데이트
  const progressPercent = (step / 5) * 100;
  document.getElementById('progressFill').style.width = `${progressPercent}%`;

  state.currentStep = step;
}

// 에러 표시
function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  document.getElementById('errorModal').classList.remove('hidden');
}

// 모달 닫기
function closeModal() {
  document.getElementById('errorModal').classList.add('hidden');
}

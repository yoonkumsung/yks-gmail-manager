/**
 * 웹 기반 설정 마법사 서버
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { Wizard } = require('./wizard');
const { NewsletterAnalyzer } = require('./newsletter_analyzer');
const { AgentGenerator } = require('./agent_generator');
const { SkillGenerator } = require('./skill_generator');

const app = express();
const PORT = process.env.SETUP_PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 상태 저장
let wizardState = {
  step: 1,
  profile: null,
  labels: [],
  selectedLabels: [],
  analysisResults: null,
  generatedAgents: [],
  generatedSkills: []
};

// ============ API 엔드포인트 ============

// 상태 조회
app.get('/api/status', (req, res) => {
  res.json({
    step: wizardState.step,
    hasProfile: !!wizardState.profile,
    selectedLabels: wizardState.selectedLabels,
    analysisComplete: !!wizardState.analysisResults
  });
});

// 프로필 조회 (기존 프로필 로드)
app.get('/api/profile', (req, res) => {
  try {
    const profilePath = path.join(__dirname, '..', '..', 'config', 'user_profile.json');
    if (fs.existsSync(profilePath)) {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      wizardState.profile = profile;
      res.json({ profile });
    } else {
      res.json({ profile: null });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 프로필 저장
app.post('/api/profile', async (req, res) => {
  try {
    const { profile } = req.body;

    // 검증
    const errors = [];
    if (!profile.occupation || !profile.occupation.title) {
      errors.push('직업/역할은 필수입니다.');
    }

    const interests = profile.interests || {};
    const hasAnyInterest =
      (interests.technical && interests.technical.length > 0) ||
      (interests.business && interests.business.length > 0) ||
      (interests.intellectual && interests.intellectual.length > 0) ||
      (interests.creative && interests.creative.length > 0) ||
      (interests.social && interests.social.length > 0);

    if (!hasAnyInterest) {
      errors.push('관심사를 최소 1개 이상 입력해주세요.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // 프로필 저장
    wizardState.profile = {
      version: '1.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: profile
    };

    const configDir = path.join(__dirname, '..', '..', 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const profilePath = path.join(configDir, 'user_profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(wizardState.profile, null, 2), 'utf8');

    wizardState.step = 2;
    res.json({ success: true, profile: wizardState.profile });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Step 3: Gmail 라벨 목록 조회
app.get('/api/labels', async (req, res) => {
  try {
    // config/labels.json에서 라벨 목록 읽기
    const labelsPath = path.join(__dirname, '..', '..', 'config', 'labels.json');

    if (fs.existsSync(labelsPath)) {
      const labelsConfig = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
      wizardState.labels = labelsConfig.labels || [];
      res.json({ labels: wizardState.labels });
    } else {
      res.json({ labels: [] });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 라벨 선택 저장
app.post('/api/labels', (req, res) => {
  try {
    const { selectedLabels } = req.body;
    wizardState.selectedLabels = selectedLabels;
    wizardState.step = 3;
    res.json({ success: true, step: 3 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 분석 시작 (SSE)
app.get('/api/analyze', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // 쿼리 파라미터에서 라벨 목록 가져오기
    const labelsParam = req.query.labels;
    const selectedLabels = labelsParam ? labelsParam.split(',') : wizardState.selectedLabels;

    if (selectedLabels.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '선택된 라벨이 없습니다.' })}\n\n`);
      res.end();
      return;
    }

    wizardState.selectedLabels = selectedLabels;

    const totalLabels = selectedLabels.length;
    let completedLabels = 0;

    for (const labelName of selectedLabels) {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        message: `${labelName} 라벨 분석 중... (${completedLabels + 1}/${totalLabels})`
      })}\n\n`);

      // 실제로는 여기서 이메일 구조 분석
      // 현재는 라벨 이름만 저장
      await new Promise(resolve => setTimeout(resolve, 300)); // 시뮬레이션 딜레이

      completedLabels++;
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        label: labelName
      })}\n\n`);
    }

    wizardState.analysisResults = {
      labels: selectedLabels,
      analyzedAt: new Date().toISOString()
    };

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// 생성된 Agent 목록 조회
app.get('/api/agents', (req, res) => {
  res.json({ agents: wizardState.generatedAgents });
});

// Agent 생성
app.post('/api/agents', async (req, res) => {
  try {
    const { labels, profile } = req.body;
    const agentGenerator = new AgentGenerator();

    wizardState.generatedAgents = [];
    wizardState.generatedSkills = [];

    const targetLabels = labels || wizardState.selectedLabels;
    const targetProfile = profile || wizardState.profile;

    for (const labelName of targetLabels) {
      const label = wizardState.labels.find(l => l.name === labelName) || { name: labelName };
      const content = await agentGenerator.generate(label, targetProfile);

      wizardState.generatedAgents.push({
        name: `${labelName}.md`,
        label: labelName,
        content: content,
        path: `agents/labels/${labelName}.md`
      });
    }

    res.json({
      success: true,
      agents: wizardState.generatedAgents,
      skills: wizardState.generatedSkills
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Step 5: Agent 수정
app.put('/api/agents/:label', (req, res) => {
  try {
    const { label } = req.params;
    const { content } = req.body;

    const agent = wizardState.generatedAgents.find(a => a.label === label);
    if (agent) {
      agent.content = content;
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Agent not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Step 6: 저장 및 완료
app.post('/api/save', async (req, res) => {
  try {
    const agentsDir = path.join(__dirname, '..', '..', 'agents', 'labels');

    // agents/labels 디렉토리 생성
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    // Agent 파일 저장
    for (const agent of wizardState.generatedAgents) {
      const agentPath = path.join(__dirname, '..', '..', agent.path);
      fs.writeFileSync(agentPath, agent.content, 'utf8');
    }

    // labels.json 업데이트 (선택한 라벨만 enabled)
    const labelsPath = path.join(__dirname, '..', '..', 'config', 'labels.json');
    if (fs.existsSync(labelsPath)) {
      const labelsConfig = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
      labelsConfig.labels = labelsConfig.labels.map(label => ({
        ...label,
        enabled: wizardState.selectedLabels.includes(label.name)
      }));
      fs.writeFileSync(labelsPath, JSON.stringify(labelsConfig, null, 2), 'utf8');
    }

    wizardState.step = 6;
    res.json({
      success: true,
      savedFiles: wizardState.generatedAgents.map(a => a.path),
      step: 6
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 서버 종료
app.post('/api/shutdown', (req, res) => {
  res.json({ success: true, message: '서버가 종료됩니다.' });
  setTimeout(() => {
    console.log('\n설정 완료! 서버를 종료합니다.');
    process.exit(0);
  }, 1000);
});

// 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
function startServer() {
  app.listen(PORT, 'localhost', () => {
    console.log('\n========================================');
    console.log('   Gmail Manager 설정 마법사');
    console.log('========================================\n');
    console.log(`서버 실행 중: http://localhost:${PORT}/setup\n`);

    // 브라우저 자동 열기 (Windows/Mac/Linux 지원)
    const { exec } = require('child_process');
    const url = `http://localhost:${PORT}/setup`;
    const cmd = process.platform === 'win32' ? `start ${url}`
              : process.platform === 'darwin' ? `open ${url}`
              : `xdg-open ${url}`;
    exec(cmd, (err) => {
      if (err) console.log(`브라우저에서 ${url} 을 열어주세요.`);
    });
  });
}

// 직접 실행 시
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

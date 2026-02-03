/**
 * 생성된 문서 검증기
 */

const fs = require('fs');
const path = require('path');

class Validator {
  /**
   * Agent 문서 검증
   */
  validateAgent(content) {
    const errors = [];
    const warnings = [];

    // 필수 섹션 확인
    const requiredSections = ['역할', '추출 규칙', '출력 형식'];
    for (const section of requiredSections) {
      if (!content.includes(`## ${section}`)) {
        errors.push(`필수 섹션 누락: ${section}`);
      }
    }

    // 출력 형식 JSON 확인
    if (!content.includes('"items"')) {
      warnings.push('출력 형식에 items 배열이 없습니다.');
    }

    // 마크다운 구문 확인
    const headingCount = (content.match(/^#+ /gm) || []).length;
    if (headingCount < 3) {
      warnings.push('헤딩이 부족합니다. 구조를 개선하세요.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * SKILL 문서 검증
   */
  validateSkill(content) {
    const errors = [];
    const warnings = [];

    // 필수 섹션 확인
    const requiredSections = ['메타데이터', '구조', '추출 규칙'];
    for (const section of requiredSections) {
      if (!content.includes(`## ${section}`)) {
        errors.push(`필수 섹션 누락: ${section}`);
      }
    }

    // 발신자 정보 확인
    if (!content.includes('발신자')) {
      warnings.push('발신자 정보가 없습니다.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 프로필 검증
   */
  validateProfile(profile) {
    const errors = [];

    if (!profile.user) {
      errors.push('user 객체가 없습니다.');
      return { valid: false, errors };
    }

    if (!profile.user.occupation || !profile.user.occupation.title) {
      errors.push('직업/역할이 필요합니다.');
    }

    if (!profile.user.interests) {
      errors.push('관심사가 필요합니다.');
    } else {
      const interests = profile.user.interests;
      const hasAny =
        (interests.technical && interests.technical.length > 0) ||
        (interests.business && interests.business.length > 0) ||
        (interests.intellectual && interests.intellectual.length > 0);

      if (!hasAny) {
        errors.push('최소 1개 이상의 관심사가 필요합니다.');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 모든 생성된 파일 검증
   */
  validateAll(agentsDir, skillsDir) {
    const results = {
      agents: [],
      skills: [],
      overall: true
    };

    // Agent 검증
    if (fs.existsSync(agentsDir)) {
      const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      for (const file of agentFiles) {
        const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
        const result = this.validateAgent(content);
        results.agents.push({
          file,
          ...result
        });
        if (!result.valid) results.overall = false;
      }
    }

    // SKILL 검증
    if (fs.existsSync(skillsDir)) {
      const skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
      for (const file of skillFiles) {
        const content = fs.readFileSync(path.join(skillsDir, file), 'utf8');
        const result = this.validateSkill(content);
        results.skills.push({
          file,
          ...result
        });
        if (!result.valid) results.overall = false;
      }
    }

    return results;
  }
}

module.exports = { Validator };

/**
 * 마법사 백엔드 로직
 */

const fs = require('fs');
const path = require('path');

class Wizard {
  constructor() {
    this.configDir = path.join(__dirname, '..', '..', 'config');
  }

  /**
   * 사용자 프로필 저장
   */
  saveProfile(profile) {
    const profileData = {
      version: '1.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: profile
    };

    const profilePath = path.join(this.configDir, 'user_profile.json');
    fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2), 'utf8');

    return profileData;
  }

  /**
   * 사용자 프로필 로드
   */
  loadProfile() {
    const profilePath = path.join(this.configDir, 'user_profile.json');
    if (fs.existsSync(profilePath)) {
      return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    }
    return null;
  }

  /**
   * 라벨 설정 로드
   */
  loadLabels() {
    const labelsPath = path.join(this.configDir, 'labels.json');
    if (fs.existsSync(labelsPath)) {
      const config = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
      return config.labels || [];
    }
    return [];
  }

  /**
   * 라벨 활성화 상태 업데이트
   */
  updateLabelStatus(selectedLabels) {
    const labelsPath = path.join(this.configDir, 'labels.json');
    if (fs.existsSync(labelsPath)) {
      const config = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
      config.labels = config.labels.map(label => ({
        ...label,
        enabled: selectedLabels.includes(label.name)
      }));
      fs.writeFileSync(labelsPath, JSON.stringify(config, null, 2), 'utf8');
      return config;
    }
    return null;
  }

  /**
   * 프로필 검증
   */
  validateProfile(profile) {
    const errors = [];

    if (!profile.occupation || !profile.occupation.title) {
      errors.push('직업/역할은 필수입니다.');
    }

    if (!profile.interests) {
      errors.push('관심사를 최소 1개 이상 입력해주세요.');
    } else {
      const hasAnyInterest =
        (profile.interests.technical && profile.interests.technical.length > 0) ||
        (profile.interests.business && profile.interests.business.length > 0) ||
        (profile.interests.intellectual && profile.interests.intellectual.length > 0);

      if (!hasAnyInterest) {
        errors.push('관심사를 최소 1개 이상 입력해주세요.');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = { Wizard };

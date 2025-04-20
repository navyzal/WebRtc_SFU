// 환경 변수를 관리하는 설정 파일

// TURN 서버 관련 설정
export const TURN_SERVER = import.meta.env.VITE_TURN_SERVER || '20.214.122.119:3478';
export const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || 'testuser';
export const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL || 'testpass';

// SFU 서버 관련 설정
export const getSfuServerUrl = () => {
  const sfu_server = import.meta.env.VITE_SFU_SERVER;
  
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'ws://localhost:4000';
  } else if (sfu_server) {
    return `ws://${sfu_server}:4000`;
  } else {
    return 'ws://20.249.161.77:4000'; // 기본값
  }
};

// ICE 서버 설정
export const getIceServers = (useTurn = false) => {
  return useTurn
    ? [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: `turn:${TURN_SERVER}`,
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL,
        },
      ]
    : [
        { urls: 'stun:stun.l.google.com:19302' },
      ];
};

// 클라이언트 설정
export const CLIENTS = [
  { id: 'B', label: 'B (오디오만)' },
  { id: 'C', label: 'C (비디오만)' },
  { id: 'D', label: 'D (오디오+비디오)' },
];

export const MEDIA_TYPES = [
  { value: 'audio', label: '오디오만' },
  { value: 'video', label: '비디오만' },
  { value: 'audio+video', label: '오디오+비디오' },
];

// 송출자 역할 확인
export const getSenderRole = () => {
  return import.meta.env.VITE_SENDER_ROLE || window?.SENDER_ROLE || null;
};

// 버전 정보
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

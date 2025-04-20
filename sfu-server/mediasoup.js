// mediasoup 초기화 및 설정 모듈
const mediasoup = require('mediasoup');

// mediasoup worker, router 등
let worker, router;

// 지원하는 미디어 코덱 설정
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  }
];

// mediasoup 초기화 함수
async function initializeMediasoup() {
  try {
    // Azure 환경에서는 PUBLIC_IP 환경 변수 사용
    const publicIp = process.env.PUBLIC_IP || '0.0.0.0';
    console.log(`Using public IP: ${publicIp}`);
    
    worker = await mediasoup.createWorker({
      logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        'rtx',
        'bwe',
        'score',
        'simulcast',
        'svc',
        'sctp'
      ],
      rtcMinPort: 10000,
      rtcMaxPort: 10100
    });
    
    console.log('mediasoup worker created');
    
    // 프로세스 종료 처리
    worker.on('died', () => {
      console.error('mediasoup worker died, exiting in 2 seconds...');
      setTimeout(() => process.exit(1), 2000);
    });
    
    // 라우터 생성
    router = await worker.createRouter({ mediaCodecs });
    
    console.log('mediasoup router created');
    
    return { worker, router };
  } catch (error) {
    console.error('mediasoup worker/router 초기화 오류:', error);
    throw error;
  }
}

// 초기화 및 내보내기
let initialized = false;
let initPromise = null;

async function getMediasoup() {
  if (!initialized) {
    if (!initPromise) {
      initPromise = initializeMediasoup();
    }
    try {
      const result = await initPromise;
      worker = result.worker;
      router = result.router;
      initialized = true;
    } catch (error) {
      initPromise = null;
      throw error;
    }
  }
  return { worker, router };
}

module.exports = {
  getMediasoup,
  get worker() { return worker; },
  get router() { return router; },
  mediaCodecs
};

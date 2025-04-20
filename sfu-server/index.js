// 기본 SFU 서버 구조: mediasoup + express + ws(WebSocket)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { handleMessage, handleDisconnect } = require('./handlers/messageHandler');
const { getMediasoup, router } = require('./mediasoup');

// express 앱 및 HTTP 서버 생성
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 환경 변수 및 설정
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 기본 상태 확인 라우트
app.get('/', (req, res) => {
  res.send('WebRTC SFU 서버가 실행 중입니다');
});

// 서버 상태 확인 API
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    env: NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// mediasoup 초기화
async function initServer() {
  try {
    // mediasoup 초기화 (worker와 router 생성)
    await getMediasoup();
    
    // WebSocket 연결 처리
    wss.on('connection', (ws) => {
      console.log('새 WebSocket 연결 설정됨');
      
      // 클라이언트 ID 임시 저장
      let clientId;
      
      // 클라이언트가 연결되면 routerRtpCapabilities 전송
      if (router) {
        ws.send(JSON.stringify({
          type: 'routerRtpCapabilities',
          rtpCapabilities: router.rtpCapabilities
        }));
      }
      
      // 메시지 처리
      ws.on('message', async (message) => {
        try {
          // 메시지 핸들러 호출하여 처리
          const updatedClientId = await handleMessage(ws, message, clientId);
          if (updatedClientId) clientId = updatedClientId;
        } catch (err) {
          console.error('메시지 처리 오류:', err);
          ws.send(JSON.stringify({ type: 'error', message: '서버 내부 오류: ' + err.message }));
        }
      });
      
      // 연결 종료 처리
      ws.on('close', async () => {
        if (clientId) {
          try {
            await handleDisconnect(clientId);
          } catch (err) {
            console.error('연결 종료 처리 오류:', err);
          }
        }
      });
      
      // 오류 처리
      ws.on('error', (error) => {
        console.error('WebSocket 오류:', error);
      });
    });
    
    // HTTP 서버 시작
    server.listen(PORT, () => {
      console.log(`SFU server listening on http://localhost:${PORT} (${NODE_ENV} mode)`);
    });
    
  } catch (error) {
    console.error('서버 초기화 실패:', error);
    process.exit(1);
  }
}

// 서버 시작
initServer().catch(error => {
  console.error('SFU 서버 시작 실패:', error);
  process.exit(1);
});

// 예상치 못한 오류 처리
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 종료 처리
process.on('SIGINT', async () => {
  console.log('서버를 종료합니다...');
  if (router) {
    router.close();
  }
  process.exit(0);
});

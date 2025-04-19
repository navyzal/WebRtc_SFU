// 기본 SFU 서버 구조: mediasoup + express + ws(WebSocket)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// mediasoup worker, router 등 초기화 (간단 예시)
let worker, router;
(async () => {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({
    mediaCodecs: [
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
      }
    ]
  });
})();

// 클라이언트별 연결 관리
const clients = {};

// mediasoup transport/producer/consumer 관리 및 오디오/비디오 분배 뼈대
const transports = {};
const producers = {};
const consumers = {};
const clientMediaType = {};

// WebSocket 시그널링 기본 구조
wss.on('connection', (ws) => {
  // 클라이언트가 연결되면 routerRtpCapabilities 전송
  if (router) {
    ws.send(JSON.stringify({
      type: 'routerRtpCapabilities',
      rtpCapabilities: router.rtpCapabilities
    }));
  }
  let clientId;
  ws.on('message', async (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }
    // 클라이언트 등록 및 미디어 타입 저장
    if (data.client && !clientId) {
      clientId = data.client;
      clients[clientId] = ws;
    }
    if (data.mediaType) {
      clientMediaType[clientId] = data.mediaType;
    }
    // 송출자(A)가 offer를 보내면 producer 생성
    if (data.type === 'offer' && clientId === 'A') {
      // TODO: mediasoup transport/producer 생성
      // producers['A'] = { audioProducer, videoProducer };
      // signaling: B/C/D에게 offer 전달
      ['B', 'C', 'D'].forEach(cid => {
        if (clients[cid]) {
          clients[cid].send(JSON.stringify({ ...data, from: clientId }));
        }
      });
    }
    // 수신자(B/C/D)가 answer를 보내면 consumer 생성
    if (data.type === 'answer' && ['B','C','D'].includes(clientId)) {
      // TODO: mediasoup transport/consumer 생성
      // consumers[clientId] = { audioConsumer, videoConsumer };
      // signaling: A에게 answer 전달
      if (clients['A']) {
        clients['A'].send(JSON.stringify({ ...data, from: clientId }));
      }
    }
    // ICE candidate relay (실제 구현 시 transport에 candidate 추가 필요)
    if (data.type === 'ice-candidate' && data.from) {
      if (clients[data.from]) {
        clients[data.from].send(JSON.stringify({ ...data, from: clientId }));
      }
    }
    // mediasoup transport/producer/consumer 생성 및 분배 예시 뼈대
    // 실제 production 환경에서는 signaling, transport 정보 교환, 오류처리, 인증 등 추가 필요

    // 예시: 클라이언트가 transport 생성 요청 시
    // ws.on('message', async (message) => { ... }) 내부에 아래와 같은 분기 추가
    if (data.type === 'create-transport') {
      // WebRTC transport 생성
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });
      transports[clientId] = transport;
      ws.send(JSON.stringify({
        type: 'transport-created',
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        }
      }));
    }

    // connect-transport: 클라이언트의 DTLS 파라미터를 transport에 적용
    if (data.type === 'connect-transport' && transports[clientId]) {
      const transport = transports[clientId];
      if (!transport._connected) {
        await transport.connect({ dtlsParameters: data.dtlsParameters });
        transport._connected = true;
        ws.send(JSON.stringify({ type: 'transport-connected' }));
      } else {
        ws.send(JSON.stringify({ type: 'transport-already-connected' }));
      }
    }

    // 예시: 송출자(A)가 producer 생성 요청 시
    if (data.type === 'produce' && clientId === 'A') {
      try {
        if (!data.rtpParameters || !data.rtpParameters.codecs) {
          ws.send(JSON.stringify({ type: 'error', message: 'produce: missing rtpParameters.codecs' }));
          return;
        }
        const producer = await transports[clientId].produce({
          kind: data.kind,
          rtpParameters: data.rtpParameters,
        });
        if (!producers[clientId]) producers[clientId] = {};
        producers[clientId][data.kind] = producer;
        ws.send(JSON.stringify({ type: 'produced', kind: data.kind, id: producer.id }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'produce failed: ' + err.message }));
        console.error('produce error:', err);
      }
    }

    // 예시: 수신자(B/C/D)가 consumer 생성 요청 시
    if (data.type === 'consume' && ['B','C','D'].includes(clientId)) {
      // 분배 정책: clientMediaType[clientId]에 따라 오디오/비디오만 consumer 생성
      const result = {};
      if (clientMediaType[clientId]?.includes('audio') && producers['A']?.audio) {
        const audioConsumer = await transports[clientId].consume({
          producerId: producers['A'].audio.id,
          rtpCapabilities: data.rtpCapabilities,
          paused: false,
        });
        if (!consumers[clientId]) consumers[clientId] = {};
        consumers[clientId].audio = audioConsumer;
        result.audio = {
          id: audioConsumer.id,
          kind: audioConsumer.kind,
          rtpParameters: audioConsumer.rtpParameters,
          producerId: audioConsumer.producerId,
        };
      }
      if (clientMediaType[clientId]?.includes('video') && producers['A']?.video) {
        const videoConsumer = await transports[clientId].consume({
          producerId: producers['A'].video.id,
          rtpCapabilities: data.rtpCapabilities,
          paused: false,
        });
        if (!consumers[clientId]) consumers[clientId] = {};
        consumers[clientId].video = videoConsumer;
        result.video = {
          id: videoConsumer.id,
          kind: videoConsumer.kind,
          rtpParameters: videoConsumer.rtpParameters,
          producerId: videoConsumer.producerId,
        };
      }
      ws.send(JSON.stringify({ type: 'consumed', ...result }));
    }
    // TODO: mediasoup transport/producer/consumer 생성 및 트랙 분배
    // 각 클라이언트의 clientMediaType에 따라 오디오/비디오만 consumer로 연결
    // 예: B는 audio만, C는 video만, D는 audio+video
  });
  ws.on('close', () => {
    if (clientId) {
      delete clients[clientId];
      delete clientMediaType[clientId];
      // TODO: mediasoup transport/producer/consumer 정리
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`SFU server listening on http://localhost:${PORT}`);
});

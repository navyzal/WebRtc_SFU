// WebSocket 메시지 핸들러 모듈화
const { 
  clients, 
  clientMediaType, 
  transports, 
  producers, 
  consumers 
} = require('../store');

// mediasoup 관련 - getMediasoup 함수를 가져와서 사용
const { getMediasoup } = require('../mediasoup');

/**
 * ICE candidate 처리 핸들러
 */
async function handleIceCandidate(ws, data, clientId) {
  try {
    // mediasoup은 client에서 server로의 ICE candidate 추가가 필요 없음
    // 단지 클라이언트 간 P2P 연결용 ICE candidate를 전달만 함
    
    // 다른 피어에게 ICE candidate 전달
    if (data.from && data.candidate) {
      if (clients[data.from]) {
        clients[data.from].send(JSON.stringify({ 
          type: 'ice-candidate',
          candidate: data.candidate,
          from: clientId 
        }));
        console.log(`ICE candidate 전달 완료 (${clientId} -> ${data.from})`);
      }
    } else {
      console.log(`ICE candidate 수신 (클라이언트: ${clientId}) - 전달 대상 없음`);
    }
  } catch (err) {
    console.error('ICE candidate 처리 오류:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'ICE candidate 처리 실패: ' + err.message }));
  }
}

/**
 * 송출자(A)의 offer 처리 핸들러
 */
async function handleOffer(ws, data, clientId) {
  try {
    // 미디어소프 인스턴스 가져오기
    const { router } = await getMediasoup();
    
    // transport가 없으면 생성
    if (!transports[clientId]) {
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

    // 오디오/비디오 트랙 정보가 있으면 producer 생성
    if (data.offerTracks) {
      if (!producers['A']) producers['A'] = {};
      
      if (data.offerTracks.audio && data.offerTracks.audio.codecs && data.offerTracks.audio.codecs.length > 0) {
        const audioProducer = await transports[clientId].produce({
          kind: 'audio',
          rtpParameters: data.offerTracks.audio,
        });
        producers['A'].audio = audioProducer;
      }
      
      if (data.offerTracks.video && data.offerTracks.video.codecs && data.offerTracks.video.codecs.length > 0) {
        const videoProducer = await transports[clientId].produce({
          kind: 'video',
          rtpParameters: data.offerTracks.video,
        });
        producers['A'].video = videoProducer;
      }
      
      ws.send(JSON.stringify({
        type: 'producers-created',
        audio: producers['A'].audio?.id,
        video: producers['A'].video?.id
      }));
    }
    
    // signaling: B/C/D에게 offer 전달
    ['B', 'C', 'D'].forEach(cid => {
      if (clients[cid]) {
        clients[cid].send(JSON.stringify({ ...data, from: clientId }));
      }
    });
  } catch (err) {
    console.error('Producer 생성 오류:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Producer 생성 실패: ' + err.message }));
  }
}

/**
 * 수신자(B/C/D)의 answer 처리 핸들러
 */
async function handleAnswer(ws, data, clientId) {
  try {
    // 미디어소프 인스턴스 가져오기
    const { router } = await getMediasoup();
    
    // transport가 없으면 생성
    if (!transports[clientId]) {
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
    
    // 클라이언트 미디어 타입에 따라 consumer 생성
    if (!consumers[clientId]) consumers[clientId] = {};
    
    // Producer가 존재하면 해당 미디어 타입에 맞는 consumer 생성
    if (data.rtpCapabilities && producers['A']) {
      // 미디어 타입에 따른 consumer 생성
      const mediaTypesToConsume = clientMediaType[clientId]?.split('+') || [];
      
      if (mediaTypesToConsume.includes('audio') && producers['A'].audio) {
        const audioConsumer = await transports[clientId].consume({
          producerId: producers['A'].audio.id,
          rtpCapabilities: data.rtpCapabilities,
          paused: false,
        });
        consumers[clientId].audio = audioConsumer;
        
        ws.send(JSON.stringify({
          type: 'consumer-created',
          kind: 'audio',
          id: audioConsumer.id,
          producerId: audioConsumer.producerId,
          rtpParameters: audioConsumer.rtpParameters,
        }));
      }
      
      if (mediaTypesToConsume.includes('video') && producers['A'].video) {
        const videoConsumer = await transports[clientId].consume({
          producerId: producers['A'].video.id,
          rtpCapabilities: data.rtpCapabilities,
          paused: false,
        });
        consumers[clientId].video = videoConsumer;
        
        ws.send(JSON.stringify({
          type: 'consumer-created',
          kind: 'video',
          id: videoConsumer.id,
          producerId: videoConsumer.producerId,
          rtpParameters: videoConsumer.rtpParameters,
        }));
      }
    }
    
    // signaling: A에게 answer 전달
    if (clients['A']) {
      clients['A'].send(JSON.stringify({ ...data, from: clientId }));
    }
  } catch (err) {
    console.error('Consumer 생성 오류:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Consumer 생성 실패: ' + err.message }));
  }
}

/**
 * transport 연결 처리 핸들러
 */
async function handleConnectTransport(ws, data, clientId) {
  try {
    const transport = transports[clientId];
    if (!transport) {
      console.log(`[handleConnectTransport] transport가 없습니다 (클라이언트: ${clientId})`);
      ws.send(JSON.stringify({ type: 'error', message: 'Transport가 존재하지 않습니다. Transport 생성 버튼을 먼저 클릭해주세요.' }));
      return;
    }
    
    if (!transport._connected) {
      console.log(`[handleConnectTransport] transport 연결 시도 (클라이언트: ${clientId})`);
      await transport.connect({ dtlsParameters: data.dtlsParameters });
      transport._connected = true;
      ws.send(JSON.stringify({ type: 'transport-connected' }));
    } else {
      ws.send(JSON.stringify({ type: 'transport-already-connected' }));
    }
  } catch (err) {
    console.error('Transport 연결 오류:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Transport 연결 실패: ' + err.message }));
  }
}

/**
 * producer 생성 처리 핸들러 (A만 해당)
 */
async function handleProduce(ws, data, clientId) {
  try {
    if (clientId !== 'A') {
      ws.send(JSON.stringify({ type: 'error', message: 'A 클라이언트만 produce 가능합니다' }));
      return;
    }
    
    if (!data.rtpParameters) {
      ws.send(JSON.stringify({ type: 'error', message: 'produce: missing rtpParameters' }));
      return;
    }
    
    if (!data.rtpParameters.codecs || data.rtpParameters.codecs.length === 0) {
      ws.send(JSON.stringify({ type: 'error', message: 'produce: empty or missing codecs in rtpParameters' }));
      return;
    }
    
    if (!transports[clientId]) {
      ws.send(JSON.stringify({ type: 'error', message: 'transport가 생성되지 않았습니다. Transport 생성 버튼을 먼저 클릭해주세요.' }));
      return;
    }
    
    console.log(`Producer 생성 요청 (${data.kind}) - 코덱 정보:`, JSON.stringify(data.rtpParameters.codecs));
    
    const producer = await transports[clientId].produce({
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    });
    
    if (!producers[clientId]) producers[clientId] = {};
    producers[clientId][data.kind] = producer;
    
    ws.send(JSON.stringify({ type: 'produced', kind: data.kind, id: producer.id }));
    
    console.log(`${data.kind} producer 생성 성공`);
  } catch (err) {
    console.error('produce error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'produce failed: ' + err.message }));
  }
}

/**
 * consumer 생성 처리 핸들러 (B/C/D만 해당)
 */
async function handleConsume(ws, data, clientId) {
  try {
    if (clientId === 'A') {
      ws.send(JSON.stringify({ type: 'error', message: 'A 클라이언트는 consume할 수 없습니다' }));
      return;
    }
    
    if (!transports[clientId]) {
      ws.send(JSON.stringify({ type: 'error', message: 'transport가 생성되지 않았습니다. Transport 생성 버튼을 먼저 클릭해주세요.' }));
      return;
    }
    
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
  } catch (err) {
    console.error('consume error:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'consume failed: ' + err.message }));
  }
}

/**
 * transport 생성 처리 핸들러
 */
async function handleCreateTransport(ws, data, clientId) {
  try {
    // 미디어소프 인스턴스 가져오기
    const { router } = await getMediasoup();
    
    if (!router) {
      console.error('Router가 초기화되지 않았습니다');
      ws.send(JSON.stringify({ type: 'error', message: 'Router가 초기화되지 않았습니다. 잠시 후 다시 시도해주세요.' }));
      return;
    }
    
    // WebRTC transport 생성 (Azure 환경 설정)
    const publicIp = process.env.PUBLIC_IP || '0.0.0.0';
    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: '0.0.0.0',           // 모든 인터페이스에서 수신
          announcedIp: publicIp    // 클라이언트에게 공개 IP 전달
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      // Azure 환경에서는 TURN 서버와 함께 사용하도록 설정
      iceServers: [
        {
          urls: [`stun:${publicIp}:3478`]
        }
      ]
    });
    
    transports[clientId] = transport;
    console.log(`Transport 생성 성공 (클라이언트: ${clientId}, ID: ${transport.id})`);
    
    ws.send(JSON.stringify({
      type: 'transport-created',
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      }
    }));
  } catch (err) {
    console.error('transport 생성 오류:', err);
    ws.send(JSON.stringify({ type: 'error', message: 'Transport 생성 실패: ' + err.message }));
  }
}

/**
 * 미디어 타입 변경 처리 핸들러
 */
function handleMediaTypeChange(ws, data, clientId) {
  if (data.mediaType) {
    clientMediaType[clientId] = data.mediaType;
    ws.send(JSON.stringify({ type: 'mediaType-updated', mediaType: data.mediaType }));
  }
}

// 메시지 타입별 처리 핸들러 매핑
const messageHandlers = {
  'ice-candidate': handleIceCandidate,
  'offer': handleOffer,
  'answer': handleAnswer,
  'connect-transport': handleConnectTransport,
  'produce': handleProduce,
  'consume': handleConsume,
  'create-transport': handleCreateTransport,
  'mediaTypeChange': handleMediaTypeChange
};

// 메인 메시지 처리 함수
async function handleMessage(ws, message, clientId) {
  let data;
  try {
    data = JSON.parse(message);
    console.log(`메시지 수신: ${data.type || 'unknown'} (클라이언트: ${clientId || 'unknown'})`);
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return clientId;
  }

  // 클라이언트 등록 및 미디어 타입 저장
  if (data.client && !clientId) {
    clientId = data.client;
    clients[clientId] = ws;
    console.log(`클라이언트 ${clientId} 등록됨`);
  }
  if (data.mediaType) {
    clientMediaType[clientId] = data.mediaType;
    console.log(`클라이언트 ${clientId} 미디어 타입 설정: ${data.mediaType}`);
  }

  // 메시지 타입에 따른 핸들러 호출
  const handler = messageHandlers[data.type];
  if (handler) {
    await handler(ws, data, clientId);
  } else if (data.type) {
    console.log(`미처리 메시지 타입: ${data.type}`);
  }

  return clientId;
}

// 클라이언트 연결 종료 처리
async function handleDisconnect(clientId) {
  console.log(`클라이언트 ${clientId} 연결 종료`);
  
  // 클라이언트 연결 해제
  delete clients[clientId];
  delete clientMediaType[clientId];
  
  try {
    // Consumer 정리
    if (consumers[clientId]) {
      if (consumers[clientId].audio) {
        consumers[clientId].audio.close();
      }
      if (consumers[clientId].video) {
        consumers[clientId].video.close();
      }
      delete consumers[clientId];
    }
    
    // 만약 송출자(A)가 연결 종료하면 관련 producer 정리
    if (clientId === 'A' && producers['A']) {
      if (producers['A'].audio) {
        producers['A'].audio.close();
      }
      if (producers['A'].video) {
        producers['A'].video.close();
      }
      delete producers['A'];
      
      // A가 종료되면 모든 consumer에게 종료 알림
      Object.keys(clients).forEach(cid => {
        if (cid !== 'A' && clients[cid]) {
          clients[cid].send(JSON.stringify({
            type: 'producer-closed',
            message: '송출자 A가 연결을 종료했습니다'
          }));
        }
      });
    }
    
    // Transport 정리
    if (transports[clientId]) {
      transports[clientId].close();
      delete transports[clientId];
    }
  } catch (err) {
    console.error(`클라이언트 ${clientId} 리소스 정리 오류:`, err);
  }
}

module.exports = {
  handleMessage,
  handleDisconnect
};

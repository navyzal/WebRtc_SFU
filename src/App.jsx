import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { Device } from 'mediasoup-client';

const CLIENTS = [
  { id: 'B', label: 'B (오디오만)' },
  { id: 'C', label: 'C (비디오만)' },
  { id: 'D', label: 'D (오디오+비디오)' },
];

const MEDIA_TYPES = [
  { value: 'audio', label: '오디오만' },
  { value: 'video', label: '비디오만' },
  { value: 'audio+video', label: '오디오+비디오' },
];

function App() {
  const [selectedClient, setSelectedClient] = useState('B');
  const [mediaType, setMediaType] = useState('audio');
  const [wsStatus, setWsStatus] = useState('disconnected');
  const wsRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const videoRef = useRef(null);
  // 수신자(B/C/D)용 remoteStream 상태 및 미디어 표시
  const [remoteStream, setRemoteStream] = useState(null);
  const remoteVideoRef = useRef(null);

  // 역할이 A(송출자)일 때만 미디어 캡처, B/C/D는 수신만(미리보기 없음)
  const isSender = selectedClient === 'A';

  // TURN 사용 여부를 환경변수 또는 UI로 제어할 수 있도록 state 추가
  const [useTurn, setUseTurn] = useState(false); // 기본값: false (STUN만 사용)

  // ICE 서버 설정: STUN만 또는 STUN+TURN 동적 선택
  const ICE_SERVERS = useTurn
    ? [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:coturn:3478', // docker-compose coturn 서비스명 사용
          username: 'testuser',
          credential: 'testpass',
        },
      ]
    : [
        { urls: 'stun:stun.l.google.com:19302' },
      ];

  // PeerConnection 예시 (실제 offer/answer, 트랙 송수신 로직은 추후 구현)
  const pcRef = useRef(null);

  const createPeerConnection = () => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    // TODO: 트랙 추가/수신, 시그널링 메시지 송수신 등 구현 예정
    return pc;
  };

  // WebSocket 연결 및 시그널링 예시
  const connectSignaling = () => {
    if (wsRef.current) wsRef.current.close();
    const ws = new window.WebSocket('ws://localhost:4000');
    ws.onopen = () => setWsStatus('connected');
    ws.onclose = () => setWsStatus('disconnected');
    ws.onmessage = (msg) => {
      // TODO: 시그널링 메시지 처리
      console.log('시그널링 수신:', msg.data);
    };
    wsRef.current = ws;
  };

  // 미디어 타입 변경 시 서버에 알림 (예시)
  const handleMediaTypeChange = (e) => {
    const value = e.target.value;
    setMediaType(value);
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'mediaTypeChange',
        client: selectedClient,
        mediaType: value,
      }));
    }
  };

  // 미디어 타입에 따라 getUserMedia로 스트림 획득
  useEffect(() => {
    if (!isSender) {
      setLocalStream(null);
      return;
    }
    let constraints;
    if (mediaType === 'audio') constraints = { audio: true, video: false };
    else if (mediaType === 'video') constraints = { audio: false, video: true };
    else constraints = { audio: true, video: true };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        setLocalStream(stream);
      })
      .catch(err => {
        setLocalStream(null);
        console.error('미디어 획득 실패:', err);
      });
    // 정리: 이전 스트림 정지
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, isSender]);

  // 비디오 엘리먼트에 스트림 연결
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // 수신자: 트랙 수신 시 remoteStream에 연결
  useEffect(() => {
    if (!isSender && pcRef.current) {
      pcRef.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };
    }
  }, [isSender, wsStatus]);

  // remoteStream이 바뀌면 비디오/오디오 엘리먼트에 연결
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // 시그널링 및 WebRTC 연결 뼈대
  useEffect(() => {
    if (wsStatus !== 'connected') return;
    // PeerConnection 생성
    const pc = createPeerConnection();

    // 송출자(A)일 때: 트랙 추가 및 offer 생성/전송
    if (isSender && localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            client: selectedClient,
          }));
        }
      };
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'offer',
            offer,
            client: selectedClient,
            mediaType,
          }));
        }
      });
    }

    // 수신자(B/C/D)일 때: 트랙 수신 핸들러
    if (!isSender) {
      pc.ontrack = (event) => {
        // TODO: 수신 미디어 표시 (비디오/오디오)
        // 예: setRemoteStream(event.streams[0]);
      };
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            client: selectedClient,
          }));
        }
      };
    }

    // 시그널링 메시지 수신 핸들러
    const ws = wsRef.current;
    if (!ws) return;
    ws.onmessage = async (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === 'answer' && isSender) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } else if (data.type === 'offer' && !isSender) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({
          type: 'answer',
          answer,
          client: selectedClient,
        }));
      } else if (data.type === 'ice-candidate') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('ICE candidate 추가 실패:', e);
        }
      } else if (data.type === 'transport-created') {
        setTransportParams(data.params);
        // TODO: PeerConnection에 transport 파라미터 적용 및 DTLS 교환
      } else if (data.type === 'produced') {
        setProduced(p => ({ ...p, [data.kind]: true }));
      } else if (data.type === 'consumed') {
        setConsumed({
          audio: !!data.audio,
          video: !!data.video,
        });
        // TODO: 수신 트랙을 PeerConnection에 연결
      }
      // ...기타 메시지 처리...
    };

    return () => {
      pc.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsStatus, localStream, isSender, mediaType, selectedClient]);

  // transport, producer, consumer 상태
  const [transportParams, setTransportParams] = useState(null);
  const [produced, setProduced] = useState({ audio: false, video: false });
  const [consumed, setConsumed] = useState({ audio: false, video: false });
  const [device, setDevice] = useState(null);

  // mediasoup Device 생성 및 rtpCapabilities 서버 전송
  useEffect(() => {
    if (wsStatus !== 'connected') return;
    const loadDevice = async () => {
      const dev = new Device();
      setDevice(dev);
      // 서버에 rtpCapabilities 전송(consume용)
      if (wsRef.current && dev.rtpCapabilities) {
        wsRef.current.send(JSON.stringify({
          type: 'rtpCapabilities',
          client: selectedClient,
          rtpCapabilities: dev.rtpCapabilities,
        }));
      }
    };
    loadDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsStatus, selectedClient]);

  // transport 생성 및 연결, produce/consume 자동화 예시
  useEffect(() => {
    if (!device || !transportParams) return;
    let transport;
    if (isSender) {
      // 송출자: send transport 생성
      transport = device.createSendTransport(transportParams);
      if (localStream) {
        localStream.getTracks().forEach(track => {
          transport.produce({ track });
        });
      }
    } else {
      // 수신자: recv transport 생성
      transport = device.createRecvTransport(transportParams);
      // 서버에 consume 요청
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'consume',
          client: selectedClient,
          rtpCapabilities: device.rtpCapabilities,
        }));
      }
    }
    // TODO: transport 이벤트 핸들링 및 트랙 연결
    // 예: transport.on('connect', ...), transport.on('produce', ...)
    // 예: consumer.on('track', ...)
    // ...
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, transportParams, localStream, isSender]);

  // mediasoup transport/produce/consume 자동화 및 이벤트 핸들링
  useEffect(() => {
    if (!device || !transportParams) return;
    let transport;
    if (isSender) {
      // 송출자: send transport 생성
      transport = device.createSendTransport(transportParams);
      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'connect-transport',
            client: selectedClient,
            dtlsParameters,
          }));
        }
        callback();
      });
      transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'produce',
            client: selectedClient,
            kind,
            rtpParameters,
          }));
        }
        callback({ id: `${kind}-producer-id` }); // 실제 id는 서버 응답 필요
      });
      if (localStream) {
        localStream.getTracks().forEach(track => {
          transport.produce({ track });
        });
      }
    } else {
      // 수신자: recv transport 생성
      transport = device.createRecvTransport(transportParams);
      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'connect-transport',
            client: selectedClient,
            dtlsParameters,
          }));
        }
        callback();
      });
      // 서버에 consume 요청
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: 'consume',
          client: selectedClient,
          rtpCapabilities: device.rtpCapabilities,
        }));
      }
      // 서버에서 consumed 응답 시 consumer 생성 및 트랙 연결
      wsRef.current.onmessage = async (msg) => {
        const data = JSON.parse(msg.data);
        if (data.type === 'consumed') {
          if (data.audio) {
            const audioConsumer = await transport.consume({
              id: data.audio.id,
              producerId: data.audio.producerId,
              kind: 'audio',
              rtpParameters: data.audio.rtpParameters,
            });
            const remoteStream = new MediaStream([audioConsumer.track]);
            setRemoteStream(remoteStream);
          }
          if (data.video) {
            const videoConsumer = await transport.consume({
              id: data.video.id,
              producerId: data.video.producerId,
              kind: 'video',
              rtpParameters: data.video.rtpParameters,
            });
            const remoteStream = new MediaStream([videoConsumer.track]);
            setRemoteStream(remoteStream);
          }
        }
      };
    }
    // ...기존 useEffect cleanup 등...
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, transportParams, localStream, isSender]);

  // transport 생성 요청
  const createTransport = () => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'create-transport', client: selectedClient }));
    }
  };

  // produce 요청 (A만)
  const produceTrack = async (kind, rtpParameters) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'produce',
        client: selectedClient,
        kind,
        rtpParameters,
      }));
    }
  };

  // consume 요청 (B/C/D만)
  const consumeTrack = (rtpCapabilities) => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'consume',
        client: selectedClient,
        rtpCapabilities,
      }));
    }
  };

  return (
    <div className="App">
      <h1>WebRTC SFU 테스트 클라이언트</h1>
      <div>
        <label>클라이언트 역할 선택: </label>
        <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
          {CLIENTS.map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label>미디어 타입 선택: </label>
        <select value={mediaType} onChange={handleMediaTypeChange}>
          {MEDIA_TYPES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div style={{ margin: '1em 0' }}>
        <button onClick={connectSignaling} disabled={wsStatus === 'connected'}>
          {wsStatus === 'connected' ? '시그널링 연결됨' : '시그널링 서버 연결'}
        </button>
      </div>
      <div style={{ margin: '1em 0' }}>
        <label>
          <input
            type="checkbox"
            checked={useTurn}
            onChange={e => setUseTurn(e.target.checked)}
          />
          TURN 서버 사용 (기본: 해제, STUN만 사용)
        </label>
      </div>
      <div style={{ margin: '1em 0' }}>
        {wsStatus === 'connected' && (
          <>
            <button onClick={createTransport}>transport 생성</button>
            {isSender && transportParams && (
              <>
                <button onClick={() => produceTrack('audio', {/* TODO: 실제 rtpParameters */})} disabled={produced.audio}>audio produce</button>
                <button onClick={() => produceTrack('video', {/* TODO: 실제 rtpParameters */})} disabled={produced.video}>video produce</button>
              </>
            )}
            {!isSender && transportParams && (
              <button onClick={() => consumeTrack({/* TODO: 실제 rtpCapabilities */})} disabled={consumed.audio && consumed.video}>consume</button>
            )}
          </>
        )}
      </div>
      <div style={{ margin: '1em 0' }}>
        <label>로컬 미디어 미리보기:</label>
        {isSender ? (
          mediaType.includes('video') ? (
            <video ref={videoRef} autoPlay playsInline muted style={{ width: 320, height: 240, background: '#222' }} />
          ) : (
            <audio ref={videoRef} autoPlay muted controls style={{ width: 320 }} />
          )
        ) : (
          <span>수신자 역할(B/C/D)은 미리보기가 없습니다.</span>
        )}
      </div>
      {/* 수신자(B/C/D) 미디어 표시 */}
      {!isSender && (
        <div style={{ margin: '1em 0' }}>
          <label>수신 미디어:</label>
          {mediaType.includes('video') ? (
            <video ref={remoteVideoRef} autoPlay playsInline controls style={{ width: 320, height: 240, background: '#222' }} />
          ) : (
            <audio ref={remoteVideoRef} autoPlay controls style={{ width: 320 }} />
          )}
        </div>
      )}
      {/* TODO: WebRTC 연결 및 미디어 표시 영역 추가 예정 */}
      <div>
        <p>시그널링 상태: {wsStatus}</p>
      </div>
    </div>
  );
}

export default App;

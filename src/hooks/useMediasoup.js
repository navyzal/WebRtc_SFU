import { useState, useEffect, useRef, useCallback } from 'react';
import { Device } from 'mediasoup-client';

/**
 * mediasoup을 사용한 SFU 방식의 WebRTC 연결을 관리하는 훅
 * @param {Object} options - 훅 옵션
 * @param {string} options.clientId - 클라이언트 ID
 * @param {string} options.mediaType - 미디어 타입 ('audio', 'video', 'audio+video')
 * @param {Function} options.onStatusChange - 상태 변경 콜백
 * @param {Function} options.onError - 오류 발생 콜백
 */
const useMediasoup = ({ clientId, mediaType, onStatusChange, onError }) => {
  // 웹소켓과 연결 상태 관리
  const wsRef = useRef(null);
  const [wsStatus, setWsStatus] = useState('disconnected');
  
  // 미디어 스트림 관련 상태
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  
  // mediasoup 관련 상태
  const [device, setDevice] = useState(null);
  const [deviceLoaded, setDeviceLoaded] = useState(false);
  const [routerRtpCapabilities, setRouterRtpCapabilities] = useState(null);
  const [transportParams, setTransportParams] = useState(null);
  const [produced, setProduced] = useState({ audio: false, video: false });
  const [consumed, setConsumed] = useState({ audio: false, video: false });
  
  // mediasoup 전송 객체 관리
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);

  // WebSocket URL 계산
  const getWebSocketUrl = useCallback(() => {
    // 환경변수에서 SFU 서버 주소를 가져오도록 수정
    const sfuServer = import.meta.env.VITE_SFU_SERVER;
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'ws://localhost:4000';
    } else if (sfuServer) {
      return `ws://${sfuServer}:4000`;
    } else {
      return 'ws://20.249.161.77:4000'; // 기본값 (환경변수가 없을 경우)
    }
  }, []);

  // WebSocket 연결 함수
  const connectSignaling = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    
    const wsUrl = getWebSocketUrl();
    console.log('WebSocket 연결 시도:', wsUrl);
    
    try {
      const ws = new window.WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket 연결 성공');
        setWsStatus('connected');
        onStatusChange && onStatusChange('connected');
        
        // 연결 즉시 클라이언트 ID 및 미디어 타입 전송
        ws.send(JSON.stringify({
          client: clientId,
          mediaType: mediaType
        }));
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket 연결 종료:', event.code, event.reason);
        setWsStatus('disconnected');
        onStatusChange && onStatusChange('disconnected');
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket 오류:', error);
        setWsStatus('error');
        onStatusChange && onStatusChange('error');
        onError && onError('시그널링 서버 연결 오류', error);
      };
      
      wsRef.current = ws;
    } catch (err) {
      console.error('WebSocket 연결 시도 중 오류:', err);
      onError && onError('시그널링 서버 연결 시도 실패', err);
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [clientId, mediaType, getWebSocketUrl, onStatusChange, onError]);

  // 미디어 획득 함수
  const getMediaStream = useCallback(async (constraints) => {
    try {
      // 모의 스트림 생성 함수 (getUserMedia 미지원 환경용)
      const createMockStream = () => {
        console.warn('미디어 디바이스 접근 불가: 모의 스트림을 생성합니다');
        const audioContext = typeof window !== 'undefined' && window.AudioContext ? 
          new window.AudioContext() : null;
        
        // 빈 캔버스와 오디오 컨텍스트를 사용하여 모의 스트림 생성
        const mockStream = new MediaStream();
        
        if (constraints.video) {
          const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
          if (canvas) {
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = 'gray';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.font = '30px Arial';
              ctx.fillStyle = 'white';
              ctx.textAlign = 'center';
              ctx.fillText('카메라 접근 불가', canvas.width/2, canvas.height/2);
              
              const stream = canvas.captureStream ? canvas.captureStream(30) : null;
              if (stream && stream.getVideoTracks) {
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) mockStream.addTrack(videoTrack);
              }
            }
          }
        }
        
        if (constraints.audio && audioContext) {
          const oscillator = audioContext.createOscillator();
          const dest = audioContext.createMediaStreamDestination();
          oscillator.connect(dest);
          oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
          const audioTrack = dest.stream.getAudioTracks()[0];
          mockStream.addTrack(audioTrack);
        }
        
        return mockStream;
      };
      
      // 브라우저 환경인지 확인
      if (typeof window !== 'undefined') {
        // 실제 미디어 디바이스에 접근
        if (navigator && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          return navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
              console.log('미디어 스트림 획득 성공');
              return stream;
            })
            .catch(err => {
              console.error('미디어 획득 실패:', err);
              onError && onError('카메라/마이크 접근 실패', err);
              
              // 모의 스트림으로 폴백
              try {
                return createMockStream();
              } catch (mockErr) {
                console.error('모의 스트림 생성 실패:', mockErr);
                onError && onError('모의 미디어 생성 실패', mockErr);
                return null;
              }
            });
        } else {
          console.warn('getUserMedia를 지원하지 않는 환경');
          onError && onError('브라우저가 미디어 장치 접근을 지원하지 않습니다');
          // 모의 스트림 사용
          try {
            return Promise.resolve(createMockStream());
          } catch (mockErr) {
            console.error('모의 스트림 생성 실패:', mockErr);
            onError && onError('모의 미디어 생성 실패', mockErr);
            return Promise.resolve(null);
          }
        }
      } else {
        console.error('브라우저 환경이 아닙니다');
        onError && onError('브라우저 환경이 아닙니다');
        return Promise.resolve(null);
      }
    } catch (err) {
      console.error('미디어 접근 예외 발생:', err);
      onError && onError('미디어 접근 중 오류 발생', err);
      return Promise.resolve(null);
    }
  }, [onError]);

  // mediasoup 전송 생성 함수
  const createMediasoupTransport = useCallback((direction) => {
    if (!device) {
      onError && onError('미디어소프 오류', '디바이스가 초기화되지 않았습니다.');
      return null;
    }

    if (!transportParams) {
      onError && onError('미디어소프 오류', '트랜스포트 파라미터가 없습니다.');
      return null;
    }

    try {
      let transport;
      if (direction === 'send') {
        if (!device.canProduce('audio') && !device.canProduce('video')) {
          onError && onError('미디어소프 오류', '디바이스가 미디어 생성을 지원하지 않습니다.');
          return null;
        }
        transport = device.createSendTransport(transportParams);
      } else {
        transport = device.createRecvTransport(transportParams);
      }

      // 커넥트 이벤트 핸들러 - SFU 서버와 연결 설정
      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        console.log(`Transport connect 이벤트 (${direction})`);
        if (wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({
            type: 'connect-transport',
            dtlsParameters,
            client: clientId,
            direction
          }));
          callback();
        } else {
          errback(new Error('시그널링 서버에 연결되어 있지 않습니다.'));
        }
      });

      // 프로듀스 이벤트 핸들러 - 미디어 생성 시 호출
      if (direction === 'send') {
        transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
          console.log(`Transport produce 이벤트, 종류: ${kind}`);
          if (wsRef.current && wsRef.current.readyState === 1) {
            wsRef.current.send(JSON.stringify({
              type: 'produce',
              kind,
              rtpParameters,
              appData,
              client: clientId
            }));
            // 아래는 임시값이지만, 서버에서 producer.id를 반환하여 callback에 전달해야 함
            // 실제로는 서버의 응답을 기다려야 하지만 여기서는 임시로 생성
            callback({ id: `${kind}-${Date.now()}` });
          } else {
            errback(new Error('시그널링 서버에 연결되어 있지 않습니다.'));
          }
        });
      }

      return transport;
    } catch (err) {
      console.error(`${direction} 트랜스포트 생성 오류:`, err);
      onError && onError('전송 설정 오류', `미디어 ${direction === 'send' ? '전송' : '수신'} 설정에 실패했습니다.`);
      return null;
    }
  }, [device, transportParams, clientId, onError]);

  // 미디어소프 디바이스 초기화
  useEffect(() => {
    if (!routerRtpCapabilities) return;
    
    try {
      const dev = new Device();
      dev.load({ routerRtpCapabilities })
        .then(() => {
          setDevice(dev);
          setDeviceLoaded(true);
          
          // 서버에 rtpCapabilities 전송(consume용)
          if (wsRef.current && wsRef.current.readyState === 1 && dev.rtpCapabilities) {
            wsRef.current.send(JSON.stringify({
              type: 'rtpCapabilities',
              client: clientId,
              rtpCapabilities: dev.rtpCapabilities,
            }));
          }
        })
        .catch((err) => {
          setDeviceLoaded(false);
          setDevice(null);
          console.error('mediasoup Device load 실패:', err);
          onError && onError('미디어소프 디바이스 초기화 실패', err);
        });
    } catch (err) {
      console.error('Device 생성 오류:', err);
      onError && onError('미디어소프 디바이스 생성 실패', err);
    }
  }, [routerRtpCapabilities, clientId, onError]);

  // WebSocket 메시지 처리 설정 (mediasoup 관련 메시지만 처리)
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    
    const handleMessage = async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        console.log('시그널링 메시지 수신:', data.type);
        
        // 라우터 RTP 기능 처리
        if (data.type === 'routerRtpCapabilities') {
          console.log('Router RTP Capabilities 수신:', data);
          setRouterRtpCapabilities(data.rtpCapabilities);
        }
        
        // transport 파라미터 처리
        else if (data.type === 'transport-created') {
          console.log('Transport 생성됨:', data.params);
          setTransportParams(data.params);
          
          // 트랜스포트 파라미터가 수신되면 미디어소프 트랜스포트 생성
          if (clientId === 'A') {
            // 송출자는 send 트랜스포트만 필요
            const sendTransport = createMediasoupTransport('send');
            if (sendTransport) {
              sendTransportRef.current = sendTransport;
            }
          } else {
            // 수신자는 receive 트랜스포트만 필요
            const recvTransport = createMediasoupTransport('recv');
            if (recvTransport) {
              recvTransportRef.current = recvTransport;
            }
          }
        }
        
        // Producer 생성 응답 처리
        else if (data.type === 'producers-created' || data.type === 'produced') {
          console.log('Producer 생성됨:', data);
          setProduced({
            audio: !!data.audio,
            video: !!data.video
          });
        }
        
        // Consumer 생성 응답 처리
        else if (data.type === 'consumer-created') {
          console.log('Consumer 생성됨:', data);
          if (data.kind === 'audio') {
            setConsumed(prev => ({...prev, audio: true}));
          } else if (data.kind === 'video') {
            setConsumed(prev => ({...prev, video: true}));
          }
        }
        
        // 전체 Consumer 목록 처리
        else if (data.type === 'consumed') {
          console.log('Consume 성공:', data);
          setConsumed({
            audio: !!data.audio,
            video: !!data.video,
          });
        }
        
        // Producer 종료 처리
        else if (data.type === 'producer-closed') {
          console.log('Producer 종료됨:', data);
          setRemoteStream(null);
          onError && onError('알림', data.message || '송출자 연결이 종료되었습니다.');
        }
        
        // 오류 메시지 처리
        else if (data.type === 'error') {
          console.error('서버 오류:', data.message);
          onError && onError('서버 오류', data.message);
        }
        
      } catch (err) {
        console.error('시그널링 메시지 처리 오류:', err);
        onError && onError('데이터 처리 오류', err);
      }
    };
    
    wsRef.current.onmessage = handleMessage;
    
    return () => {
      if (wsRef.current) {
        wsRef.current.onmessage = null;
      }
    };
  }, [clientId, device, onError, createMediasoupTransport]);

  // 로컬 스트림 초기화 함수
  const initLocalStream = useCallback(async () => {
    let constraints;
    if (mediaType === 'audio') constraints = { audio: true, video: false };
    else if (mediaType === 'video') constraints = { audio: false, video: true };
    else constraints = { audio: true, video: true };

    try {
      // 이전 스트림 정리
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // 새 스트림 획득
      const stream = await getMediaStream(constraints);
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('로컬 스트림 초기화 오류:', err);
      onError && onError('미디어 장치 접근 오류', err);
      return null;
    }
  }, [mediaType, localStream, getMediaStream, onError]);

  // transport 생성 요청
  const createTransport = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ 
        type: 'create-transport', 
        client: clientId,
        direction: clientId === 'A' ? 'send' : 'recv'
      }));
    } else {
      onError && onError('연결 오류', '시그널링 서버에 연결되어 있지 않습니다');
    }
  }, [clientId, onError]);

  // produce 요청 (A만) - mediasoup 사용
  const produceTrack = useCallback(async (kind) => {
    // 송출자가 아니거나 전송 Transport가 없으면 에러
    if (clientId !== 'A' || !sendTransportRef.current) {
      onError && onError('미디어 전송 오류', '송출자 설정이 완료되지 않았습니다.');
      return;
    }
    
    if (!localStream) {
      onError && onError('미디어 오류', '로컬 미디어 스트림이 없습니다.');
      return;
    }
    
    // 해당 종류의 트랙 찾기
    const track = localStream.getTracks().find(t => t.kind === kind);
    if (!track) {
      console.error(`${kind} 트랙이 없습니다`);
      onError && onError('미디어 오류', `${kind} 트랙을 찾을 수 없습니다`);
      return;
    }
    
    try {
      // mediasoup sendTransport로 트랙 추가
      const producer = await sendTransportRef.current.produce({
        track,
        encodings: kind === 'video' ? [
          { maxBitrate: 100000 },
          { maxBitrate: 300000 },
          { maxBitrate: 900000 }
        ] : undefined,
        codecOptions: kind === 'video' ? { videoGoogleStartBitrate: 1000 } : undefined
      });
      
      console.log(`${kind} producer 생성 성공:`, producer.id);
      
      // producer 이벤트 리스너 등록
      producer.on('transportclose', () => {
        console.log(`${kind} transport 종료`);
        producer.close();
      });
      
      producer.on('trackended', () => {
        console.log(`${kind} track 종료`);
        producer.close();
      });
      
      // 상태 업데이트
      if (kind === 'audio') {
        setProduced(prev => ({ ...prev, audio: true }));
      } else if (kind === 'video') {
        setProduced(prev => ({ ...prev, video: true }));
      }
      
    } catch (err) {
      console.error(`${kind} produce 오류:`, err);
      onError && onError('미디어 송출 오류', `${kind} 송출에 실패했습니다: ${err.message}`);
    }
  }, [clientId, localStream, onError]);

  // consume 요청 (B/C/D만) - mediasoup 사용
  const consumeTrack = useCallback(async () => {
    // 송출자이거나 수신 Transport가 없으면 에러
    if (clientId === 'A' || !recvTransportRef.current) {
      onError && onError('미디어 수신 오류', '수신자 설정이 완료되지 않았습니다.');
      return;
    }
    
    if (!device || !device.rtpCapabilities) {
      onError && onError('초기화 오류', '미디어소프 디바이스가 초기화되지 않았습니다.');
      return;
    }
    
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        type: 'consume',
        client: clientId,
        rtpCapabilities: device.rtpCapabilities,
        mediaType
      }));
      console.log('consume 요청 전송', { rtpCapabilities: device.rtpCapabilities, mediaType });
    } else {
      onError && onError('미디어 수신 오류', '시그널링 서버에 연결되어 있지 않습니다.');
    }
  }, [clientId, device, mediaType, onError]);

  // 미디어 전송 시작 (모든 트랙 produce)
  const startSending = useCallback(async () => {
    if (!localStream) {
      const stream = await initLocalStream();
      if (!stream) {
        onError && onError('미디어 오류', '로컬 미디어 스트림을 초기화할 수 없습니다.');
        return;
      }
    }

    // 오디오 트랙이 있으면 produce
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      await produceTrack('audio');
    }

    // 비디오 트랙이 있으면 produce
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      await produceTrack('video');
    }
  }, [localStream, initLocalStream, produceTrack, onError]);

  // 자원 정리 함수
  const cleanup = useCallback(() => {
    // 로컬 스트림 정리
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // 원격 스트림 정리
    setRemoteStream(null);
    
    // mediasoup 전송 객체 정리
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }
    
    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }
    
    // 상태 초기화
    setProduced({ audio: false, video: false });
    setConsumed({ audio: false, video: false });
    setDeviceLoaded(false);
    setDevice(null);
    setRouterRtpCapabilities(null);
    setTransportParams(null);
    
    // 웹소켓 연결 종료
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setWsStatus('disconnected');
  }, [localStream]);

  // 컴포넌트 언마운트 시 자원 정리
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    // 상태
    wsStatus,
    localStream,
    remoteStream,
    deviceLoaded,
    produced,
    consumed,
    
    // 함수
    connectSignaling,
    initLocalStream,
    createTransport,
    produceTrack,
    consumeTrack,
    startSending,
    cleanup
  };
};

export default useMediasoup;

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * WebRTC P2P 연결을 관리하는 훅
 * @param {Object} options - 훅 옵션
 * @param {string} options.clientId - 클라이언트 ID
 * @param {string} options.mediaType - 미디어 타입 ('audio', 'video', 'audio+video')
 * @param {Function} options.onStatusChange - 상태 변경 콜백
 * @param {Function} options.onError - 오류 발생 콜백
 */
const useWebRTC = ({ clientId, mediaType, onStatusChange, onError }) => {
  // 웹소켓과 연결 상태 관리
  const wsRef = useRef(null);
  const [wsStatus, setWsStatus] = useState('disconnected');
  
  // 미디어 스트림 관련 상태
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  
  // webrtc 관련 상태
  const pcRef = useRef(null);
  const [useTurn, setUseTurn] = useState(false);
  
  // 보류된 ICE candidate 저장
  const pendingIceCandidatesRef = useRef([]);
  
  // ICE 서버 설정 계산
  const getIceServers = useCallback(() => {
    // 환경변수에서 TURN 서버 설정을 가져오도록 수정
    const turnServer = import.meta.env.VITE_TURN_SERVER || '20.214.122.119:3478';
    const turnUsername = import.meta.env.VITE_TURN_USERNAME || 'testuser';
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL || 'testpass';
    
    return useTurn
      ? [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: `turn:${turnServer}`,
            username: turnUsername,
            credential: turnCredential,
          },
        ]
      : [
          { urls: 'stun:stun.l.google.com:19302' },
        ];
  }, [useTurn]);

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

  // 보류된 ICE candidate 처리 함수
  const processPendingIceCandidates = useCallback(() => {
    if (!pcRef.current || !pcRef.current.remoteDescription) return;
    
    console.log(`보류된 ICE candidate ${pendingIceCandidatesRef.current.length}개 처리 중`);
    
    pendingIceCandidatesRef.current.forEach(async (candidate) => {
      try {
        await pcRef.current.addIceCandidate(candidate);
        console.log('저장된 ICE candidate 추가 성공');
      } catch (err) {
        console.error('저장된 ICE candidate 추가 실패:', err);
      }
    });
    
    pendingIceCandidatesRef.current = [];
  }, []);

  // PeerConnection 생성 함수
  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    
    // ICE 후보 목록 초기화
    pendingIceCandidatesRef.current = [];
    
    try {
      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      pcRef.current = pc;
      
      // 트랙 이벤트 핸들러 설정
      pc.ontrack = (event) => {
        console.log('ontrack 이벤트:', event);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        }
      };
      
      // ICE 후보 이벤트 핸들러 설정
      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate,
            client: clientId,
            from: clientId
          }));
        }
      };
      
      // 연결 상태 변경 이벤트
      pc.onconnectionstatechange = () => {
        console.log('PeerConnection 상태 변경:', pc.connectionState);
      };
      
      // ICE 연결 상태 변경 이벤트
      pc.oniceconnectionstatechange = () => {
        console.log('ICE 연결 상태 변경:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          onError && onError('P2P 연결 실패', 'ICE 연결에 실패했습니다. 다시 시도해주세요.');
        }
      };
      
      return pc;
    } catch (err) {
      console.error('PeerConnection 생성 오류:', err);
      onError && onError('WebRTC 초기화 실패', err);
      return null;
    }
  }, [getIceServers, clientId, onError]);

  // WebSocket 메시지 처리 설정 (P2P 관련 메시지만 처리)
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    
    const handleMessage = async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        console.log('시그널링 메시지 수신:', data.type);
        
        // 응답 처리 (수신자일 때)
        if (data.type === 'offer' && clientId !== 'A') {
          console.log('Offer 수신:', data);
          const pc = pcRef.current || createPeerConnection();
          if (!pc) return;
          
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            // 보류된 ICE candidate 처리
            processPendingIceCandidates();
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            const message = {
              type: 'answer',
              answer,
              client: clientId,
              from: clientId
            };
            
            wsRef.current.send(JSON.stringify(message));
            console.log('Answer 전송 완료');
          } catch (err) {
            console.error('Offer 처리 중 오류:', err);
            onError && onError('수신 중 오류', err);
          }
        }
        
        // 응답 처리 (송출자일 때)
        else if (data.type === 'answer' && clientId === 'A') {
          try {
            if (!pcRef.current) return;
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('Answer 설정 완료');
            
            // 보류된 ICE candidate 처리
            processPendingIceCandidates();
          } catch (err) {
            console.error('Answer 처리 중 오류:', err);
            onError && onError('응답 처리 중 오류', err);
          }
        }
        
        // ICE 후보 처리
        else if (data.type === 'ice-candidate') {
          // 송출자('A')가 자신에게 보낸 ICE candidate는 무시 (자기 자신에게 처리 방지)
          if (!(clientId === 'A' && data.from === clientId)) {
            try {
              if (!data.candidate) return;
              
              const candidate = new RTCIceCandidate(data.candidate);
              
              // 원격 설명이 설정되어 있으면 ICE candidate 추가
              if (pcRef.current && pcRef.current.remoteDescription) {
                await pcRef.current.addIceCandidate(candidate);
                console.log('ICE candidate 추가 성공');
              } 
              // 원격 설명이 설정되어 있지 않으면 candidate 저장
              else if (pcRef.current) {
                console.log('원격 설명이 아직 설정되지 않아 ICE candidate를 저장합니다');
                pendingIceCandidatesRef.current.push(candidate);
              }
            } catch (err) {
              console.error('ICE candidate 추가 실패:', err);
              onError && onError('네트워크 연결 설정 오류', err);
            }
          }
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
  }, [clientId, createPeerConnection, onError, processPendingIceCandidates]);

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

  // 연결 시작 함수 (offer 생성 및 전송 - 송출자 A만)
  const startSending = useCallback(async () => {
    if (clientId !== 'A' || !localStream) {
      onError && onError('송출 오류', '송출자(A)만 미디어를 전송할 수 있습니다');
      return;
    }
    
    try {
      const pc = pcRef.current || createPeerConnection();
      if (!pc) return;
      
      // 로컬 미디어 트랙을 PeerConnection에 추가
      const tracks = localStream.getTracks();
      console.log('로컬 트랙 추가:', tracks);
      
      tracks.forEach(track => pc.addTrack(track, localStream));
      
      // Offer 생성 및 전송
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (wsRef.current && wsRef.current.readyState === 1) {
        // 오디오/비디오 트랙 정보 추출
        const offerTracks = {};
        tracks.forEach(track => {
          const sender = pc.getSenders().find(s => s.track === track);
          if (sender && sender.getParameters) {
            offerTracks[track.kind] = sender.getParameters();
          }
        });
        
        // 메시지 객체 생성
        const message = {
          type: 'offer',
          offer,
          offerTracks, // 트랙 정보 포함
          client: clientId,
          from: clientId
        };
        
        wsRef.current.send(JSON.stringify(message));
        console.log('Offer 전송 완료');
      } else {
        onError && onError('송출 오류', '시그널링 서버에 연결되어 있지 않습니다');
      }
    } catch (err) {
      console.error('Offer 생성 중 오류:', err);
      onError && onError('송출 시작 오류', err);
    }
  }, [clientId, localStream, createPeerConnection, onError]);

  // TURN 서버 사용 설정
  const toggleTurn = useCallback((useTurnServer) => {
    setUseTurn(useTurnServer);
    
    // PeerConnection이 이미 존재하면 재생성
    if (pcRef.current) {
      const pc = createPeerConnection();
      
      // 로컬 스트림이 있으면 트랙 다시 추가
      if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      }
    }
  }, [createPeerConnection, localStream]);

  // 자원 정리 함수
  const cleanup = useCallback(() => {
    // 로컬 스트림 정리
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // 원격 스트림 정리
    setRemoteStream(null);
    
    // PeerConnection 정리
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    // 보류된 ICE candidate 정리
    pendingIceCandidatesRef.current = [];
    
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
    useTurn,
    
    // 함수
    connectSignaling,
    initLocalStream,
    startSending,
    toggleTurn,
    cleanup
  };
};

export default useWebRTC;

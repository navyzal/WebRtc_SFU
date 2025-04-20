import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import useWebRTC from './hooks/useWebRTC';
import useMediasoup from './hooks/useMediasoup';
import Notification from './components/Notification';
import { 
  CLIENTS, 
  MEDIA_TYPES, 
  getSenderRole,
  APP_VERSION 
} from './config';

function App() {
  // SENDER_ROLE 환경변수 감지 (컨테이너에서 전달)
  const senderRole = getSenderRole();
  
  // sender-a 컨테이너에서는 자동으로 A 역할, 오디오+비디오 고정
  const isSenderA = senderRole === 'A';
  
  // 로컬 스토리지에서 이전 선택한 클라이언트와 미디어 타입 로드
  const getInitialClient = () => {
    if (isSenderA) return 'A';
    const saved = localStorage.getItem('selectedClient');
    return saved || 'B';
  };
  
  const getInitialMediaType = () => {
    if (isSenderA) return 'audio+video';
    const saved = localStorage.getItem('mediaType');
    return saved || 'audio';
  };
  
  const [selectedClient, setSelectedClient] = useState(getInitialClient());
  const [mediaType, setMediaType] = useState(getInitialMediaType());
  
  // 알림 상태
  const [notification, setNotification] = useState({
    show: false,
    type: 'info',
    title: '',
    message: ''
  });
  
  // 비디오 엘리먼트 참조
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // 역할이 A(송출자)일 때만 미디어 캡처, B/C/D는 수신만(미리보기 없음)
  const isSender = isSenderA || selectedClient === 'A';

  // 오류 처리 함수
  const handleError = (title, message) => {
    console.error(`${title}: ${message}`);
    setNotification({
      show: true,
      type: 'error',
      title,
      message: typeof message === 'object' ? message.message || JSON.stringify(message) : message
    });
  };

  // 알림 표시 함수
  const showNotification = (type, title, message) => {
    setNotification({
      show: true,
      type,
      title,
      message
    });
  };

  // 알림 닫기 함수
  const closeNotification = () => {
    setNotification(prev => ({ ...prev, show: false }));
  };
  
  // mediasoup 훅 사용 (SFU 방식)
  const mediasoup = useMediasoup({
    clientId: selectedClient,
    mediaType,
    onStatusChange: (status) => {
      console.log('WebSocket 상태 변경:', status);
      if (status === 'connected') {
        showNotification('success', '연결 성공', '시그널링 서버에 연결되었습니다.');
      } else if (status === 'disconnected') {
        showNotification('warning', '연결 종료', '시그널링 서버와의 연결이 종료되었습니다.');
      } else if (status === 'error') {
        showNotification('error', '연결 오류', '시그널링 서버와의 연결에 문제가 발생했습니다.');
      }
    },
    onError: handleError
  });

  // WebRTC 훅 사용 (P2P 방식)
  const webrtc = useWebRTC({
    clientId: selectedClient,
    mediaType,
    onStatusChange: (status) => {
      console.log('WebSocket 상태 변경:', status);
      if (status === 'connected') {
        showNotification('success', '연결 성공', '시그널링 서버에 연결되었습니다.');
      } else if (status === 'disconnected') {
        showNotification('warning', '연결 종료', '시그널링 서버와의 연결이 종료되었습니다.');
      } else if (status === 'error') {
        showNotification('error', '연결 오류', '시그널링 서버와의 연결에 문제가 발생했습니다.');
      }
    },
    onError: handleError
  });

  // 현재 사용 중인 WebRTC 객체 (mediasoup 또는 webrtc)
  // 사용할 WebRTC 구현 선택 (mediasoup 또는 webrtc)
  // 현재는 SFU 방식(mediasoup)을 사용
  const rtc = clientId === 'A' ? webrtc : mediasoup;

  // 미디어 타입 변경 시 서버에 알림
  const handleMediaTypeChange = (e) => {
    const value = e.target.value;
    setMediaType(value);
    localStorage.setItem('mediaType', value);
  };

  // 송출자 선택 변경 시 처리
  const handleClientChange = (e) => {
    const newClient = e.target.value;
    setSelectedClient(newClient);
    localStorage.setItem('selectedClient', newClient);
    
    // 이전 연결 종료
    rtc.cleanup();
    
    // 즉시 새로고침하지 않고 페이지에 변경 사항 반영
    showNotification('info', '클라이언트 역할 변경', `${newClient} 역할로 변경되었습니다. 시그널링 서버에 다시 연결하세요.`);
  };

  // 비디오 엘리먼트에 로컬 스트림 연결
  useEffect(() => {
    if (videoRef.current && rtc.localStream) {
      videoRef.current.srcObject = rtc.localStream;
    }
  }, [rtc.localStream]);

  // 원격 스트림 비디오 엘리먼트에 연결
  useEffect(() => {
    if (remoteVideoRef.current && rtc.remoteStream) {
      remoteVideoRef.current.srcObject = rtc.remoteStream;
    }
  }, [rtc.remoteStream]);

  // 송출자 모드에서 미디어 스트림 초기화
  useEffect(() => {
    if (isSender) {
      rtc.initLocalStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSender, mediaType]);

  // sender-a 컨테이너에서는 시그널링 자동 연결
  useEffect(() => {
    if (isSenderA && rtc.wsStatus !== 'connected') {
      rtc.connectSignaling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSenderA, rtc.wsStatus]);

  return (
    <div className="App">
      <h1>WebRTC SFU 테스트 클라이언트</h1>
      <div className="app-version">v{APP_VERSION}</div>
      
      {!isSenderA && (
        <div className="control-group">
          <label>클라이언트 역할 선택: </label>
          <select value={selectedClient} onChange={handleClientChange}>
            <option value="A">A (송출자)</option>
            {CLIENTS.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      )}
      
      <div className="control-group">
        <label>미디어 타입 선택: </label>
        {isSenderA ? (
          <span>오디오+비디오 (고정)</span>
        ) : (
          <select value={mediaType} onChange={handleMediaTypeChange}>
            {MEDIA_TYPES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        )}
      </div>
      
      <div className="control-group">
        <button 
          onClick={rtc.connectSignaling}
          disabled={rtc.wsStatus === 'connected'}
          className={rtc.wsStatus === 'connected' ? 'connected' : ''}
        >
          {rtc.wsStatus === 'connected' ? '시그널링 연결됨' : '시그널링 서버 연결'}
        </button>
      </div>
      
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={webrtc.useTurn}
            onChange={e => webrtc.toggleTurn(e.target.checked)}
          />
          TURN 서버 사용 (기본: 해제, STUN만 사용)
        </label>
      </div>
      
      {rtc.wsStatus === 'connected' && (
        <div className="control-group">
          <button onClick={rtc.createTransport}>transport 생성</button>
          
          {isSender && rtc.transportParams && (
            <>
              <button 
                onClick={() => rtc.produceTrack('audio')} 
                disabled={rtc.produced.audio}
                className={rtc.produced.audio ? 'active' : ''}
              >
                {rtc.produced.audio ? '오디오 전송 중' : '오디오 전송 시작'}
              </button>
              
              <button 
                onClick={() => rtc.produceTrack('video')} 
                disabled={rtc.produced.video}
                className={rtc.produced.video ? 'active' : ''}
              >
                {rtc.produced.video ? '비디오 전송 중' : '비디오 전송 시작'}
              </button>
              
              <button 
                onClick={rtc.startSending}
                disabled={rtc.produced.audio && rtc.produced.video}
              >
                미디어 전송
              </button>
            </>
          )}
          
          {!isSender && rtc.transportParams && (
            <button 
              onClick={rtc.consumeTrack}
              disabled={(rtc.consumed.audio && rtc.consumed.video) || !rtc.deviceLoaded}
              className={(rtc.consumed.audio || rtc.consumed.video) ? 'active' : ''}
            >
              {!rtc.deviceLoaded ? 'device 로딩 중...' : (
                (rtc.consumed.audio || rtc.consumed.video) ? '미디어 수신 중' : '미디어 수신 시작'
              )}
            </button>
          )}
        </div>
      )}
      
      <div className="media-container">
        <div className="media-preview">
          <h3>로컬 미디어 미리보기:</h3>
          {isSender ? (
            mediaType.includes('video') ? (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                style={{ width: 320, height: 240, background: '#222' }} 
              />
            ) : (
              <audio 
                ref={videoRef} 
                autoPlay 
                muted 
                controls 
                style={{ width: 320 }} 
              />
            )
          ) : (
            <div className="no-preview">수신자 역할(B/C/D)은 미리보기가 없습니다.</div>
          )}
        </div>
        
        {!isSender && (
          <div className="media-preview">
            <h3>수신 미디어:</h3>
            {mediaType.includes('video') ? (
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                controls 
                style={{ width: 320, height: 240, background: '#222' }} 
              />
            ) : (
              <audio 
                ref={remoteVideoRef} 
                autoPlay 
                controls 
                style={{ width: 320 }} 
              />
            )}
          </div>
        )}
      </div>
      
      <div className="status-bar">
        <p>시그널링 상태: <span className={`status-${rtc.wsStatus}`}>{rtc.wsStatus}</span></p>
        {rtc.deviceLoaded && <p>미디어소프 디바이스: <span className="status-connected">로드됨</span></p>}
        {rtc.transportParams && <p>Transport: <span className="status-connected">생성됨</span></p>}
        {rtc.produced.audio && <p>오디오 송출: <span className="status-connected">활성</span></p>}
        {rtc.produced.video && <p>비디오 송출: <span className="status-connected">활성</span></p>}
        {rtc.consumed.audio && <p>오디오 수신: <span className="status-connected">활성</span></p>}
        {rtc.consumed.video && <p>비디오 수신: <span className="status-connected">활성</span></p>}
      </div>
      
      <Notification
        show={notification.show}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={closeNotification}
      />
    </div>
  );
}

export default App;

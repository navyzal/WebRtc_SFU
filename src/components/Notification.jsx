import React, { useState, useEffect } from 'react';

// 알림 스타일
const styles = {
  notification: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '15px 20px',
    borderRadius: '5px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',
    zIndex: 1000,
    maxWidth: '350px',
    wordBreak: 'break-word',
  },
  error: {
    backgroundColor: '#f44336',
    color: 'white',
  },
  info: {
    backgroundColor: '#2196F3',
    color: 'white',
  },
  success: {
    backgroundColor: '#4CAF50',
    color: 'white',
  },
  warning: {
    backgroundColor: '#FF9800',
    color: 'white',
  },
  title: {
    fontWeight: 'bold',
    marginBottom: '5px',
  },
  closeButton: {
    float: 'right',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '18px',
    marginLeft: '10px',
  }
};

const Notification = ({ show, type = 'info', title, message, onClose, autoClose = true, duration = 5000 }) => {
  const [visible, setVisible] = useState(show);
  
  // 타입에 따른 스타일 계산
  const getStyle = () => {
    return {
      ...styles.notification,
      ...styles[type],
      transform: visible ? 'translateX(0)' : 'translateX(110%)',
      opacity: visible ? 1 : 0,
    };
  };
  
  useEffect(() => {
    setVisible(show);
    
    // 자동 닫기 설정
    let timer;
    if (show && autoClose) {
      timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => {
          onClose && onClose();
        }, 300); // 트랜지션 시간 이후에 onClose 호출
      }, duration);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [show, autoClose, duration, onClose]);
  
  // 닫기 버튼 클릭 핸들러
  const handleClose = () => {
    setVisible(false);
    setTimeout(() => {
      onClose && onClose();
    }, 300); // 트랜지션 시간 이후에 onClose 호출
  };
  
  if (!show && !visible) return null;
  
  return (
    <div style={getStyle()}>
      <button style={styles.closeButton} onClick={handleClose}>×</button>
      {title && <div style={styles.title}>{title}</div>}
      <div>{message}</div>
    </div>
  );
};

export default Notification;

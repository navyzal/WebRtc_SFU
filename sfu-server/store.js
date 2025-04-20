// 서버 측 상태 저장 모듈

// 클라이언트별 연결 관리
const clients = {};

// 클라이언트별 미디어 타입 저장
const clientMediaType = {};

// mediasoup transport/producer/consumer 관리
const transports = {};
const producers = {};
const consumers = {};

module.exports = {
  clients,
  clientMediaType,
  transports,
  producers,
  consumers
};

# WebRTC SFU 프로젝트

이 프로젝트는 Node.js 기반 mediasoup SFU 서버와 React(Vite 기반) 프론트엔드, coturn TURN 서버, Docker 환경으로 구성되어 있습니다.

## 주요 기능
- A의 오디오+비디오를 B(오디오만), C(비디오만), D(오디오+비디오)로 분배하는 SFU 서버
- 프론트엔드에서 각 클라이언트(B, C, D)는 오디오/비디오/오디오+비디오 타입을 동적으로 선택 가능
- 로컬 테스트 및 Azure 컨테이너 배포 지원
- 프론트엔드에서 테스트 및 시뮬레이션 가능
- Google STUN, coturn TURN 서버 연동

## PUBLIC_IP 환경변수 적용 방법
- **로컬 환경**: docker-compose 실행 시 `PUBLIC_IP`를 127.0.0.1 또는 실제 로컬 네트워크 IP로 지정
  - 예시: `PUBLIC_IP=127.0.0.1 docker-compose up --build`
- **Azure 등 클라우드 환경**: Azure Portal에서 컨테이너 인스턴스의 퍼블릭 IP를 확인 후, 배포 파이프라인/환경변수에 해당 IP를 지정
  - 예시: Azure DevOps 파이프라인에서 `PUBLIC_IP=$(AZURE_CONTAINER_IP)`로 지정

## docker-compose 예시
```yaml
  coturn:
    image: instrumentisto/coturn
    ...
    command: >
      --lt-cred-mech --no-cli --no-tls --no-dtls --user testuser:testpass --realm=webrtc.local --external-ip=${PUBLIC_IP}
```

## 실행 방법
1. `PUBLIC_IP=127.0.0.1 docker-compose up --build` (로컬)
2. Azure 배포 시 파이프라인/환경변수에서 PUBLIC_IP를 실제 퍼블릭 IP로 지정

---

자세한 구현 및 사용법은 추후 업데이트됩니다.
# WebRtc_SFU

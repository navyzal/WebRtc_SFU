# WebRTC SFU 테스트 프로젝트

이 프로젝트는 WebRTC SFU(Node.js, mediasoup)와 React 프론트엔드(Vite 기반)로 구성되어 있습니다.

- SFU 서버는 A의 오디오+비디오를 B(오디오만), C(비디오만), D(오디오+비디오)로 분배합니다.
- 프론트엔드에서 각 클라이언트(B, C, D)는 오디오/비디오/오디오+비디오 타입을 동적으로 선택할 수 있습니다.
- 로컬 및 Azure 컨테이너 환경에서 동작합니다.
- 테스트 및 시뮬레이션을 위한 프론트엔드 페이지가 포함되어 있습니다.

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

## 로컬에서 A/B 웹페이지로 테스트하는 방법

1. **의존성 설치**
   ```sh
   npm install
   ```

2. **도커 컨테이너 빌드 및 실행**
   ```sh
   docker-compose up --build
   ```

3. **웹페이지 접속**
   - A(송출자) 페이지: [http://localhost:5175](http://localhost:5175)
   - B(수신자/테스트) 페이지: [http://localhost:5173](http://localhost:5173)

4. **테스트 방법**
   - A 페이지는 자동으로 오디오+비디오 송출을 시작합니다.
   - B 페이지에서 역할(오디오/비디오/오디오+비디오) 및 미디어 타입을 선택해 송출된 미디어를 수신할 수 있습니다.
   - 네트워크 내 다른 PC에서 테스트하려면, 호스트 PC의 실제 IP(예: 192.168.x.x:5173, 5175)로 접속하세요.

5. **참고**
   - Windows/WSL 환경에서는 방화벽 및 포트포워딩 설정이 필요할 수 있습니다.
   - 컨테이너 환경에서는 WebSocket 주소가 자동으로 맞춰집니다.

---

자세한 구현 및 사용법은 추후 업데이트됩니다.
# WebRtc_SFU

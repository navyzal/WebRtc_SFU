<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

이 프로젝트는 WebRTC SFU(Node.js, mediasoup)와 React 프론트엔드(Vite 기반)로 구성되어 있습니다.
- SFU 서버는 A의 오디오+비디오를 B(오디오만), C(비디오만), D(오디오+비디오)로 분배합니다.
- 프론트엔드에서 각 클라이언트(B, C, D)는 오디오/비디오/오디오+비디오 타입을 동적으로 선택할 수 있습니다.
- 로컬 및 Azure 컨테이너 환경에서 동작해야 합니다.
- 테스트 및 시뮬레이션을 위한 프론트엔드 페이지가 필요합니다.

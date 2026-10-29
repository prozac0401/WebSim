/* Evidence for the reconstructed public course and unregistered research candidates. */
(function(root){
  'use strict';
  const sources={
    kdlAnnouncement:{title:'2016 KDL 주최 발표 보도 · T21 방향',url:'https://www.top-rider.com/article/view/trd201603150012',kind:'organizer-announcement-report'},
    kdlResult:{title:'2016 KDL 2라운드 결과 · T21 사용 확인',url:'https://www.top-rider.com/article/view/trd201606090003',kind:'event-report'},
    kdlResultCrosscheck:{title:'2016 KDL 2라운드 · 모비벅스 사진 제공',url:'https://raceweek.co.kr/?p=4742',kind:'event-report'},
    kdlVideo:{title:'2016 KDL 2라운드 · 리그 채널 영상',url:'https://www.youtube.com/watch?v=i4decJM0q1s',kind:'league-channel-video'},
    fiaKic:{title:'FIA 영암 공식 도면 · T1/T2 코너 번호',url:'https://www.fia.com/sites/default/files/external_archive/node4128/Doc%201%20KOREA_CIRCUIT_13%20FIA.pdf',kind:'official-circuit-map'},
    kicOperator:{title:'KIC 운영사 시설 안내',url:'https://koreacircuit.com/Tracks',kind:'venue-operator'},
    injeSdcAnnouncement:{title:'MOTION 주최 공지 · 2018 SDC 1전, 인제 B코스',url:'https://www.motiontuning.itpage.kr/bbs/board.php?bo_table=basic16&wr_id=6117',kind:'organizer-announcement'},
    injeSdcVideo:{title:'MAXTUNING MAX_D · 2018 SDC 인제 경기 원본',url:'https://www.youtube.com/watch?v=9NgRIs8o0sc',kind:'participant-video'},
    injeSdcQualifying:{title:'명성모터스 · 2018 SDC1R S클래스 예선',url:'https://www.youtube.com/watch?v=rzMlndBCk7k',kind:'participant-video'},
    injeAerial:{title:'인제 운영사 · 시설 항공사진',url:'https://www.speedium.co.kr/company/img/content/s0101img04.jpg',kind:'venue-operator'},
    kicSdcAnnouncement:{title:'SDC 공식 · 2017.11.26 KIC 상설 2전 공지',url:'https://www.youtube.com/watch?v=0GQCb4c_YT8',kind:'organizer-announcement'},
    kicSdcFinal:{title:'SDC 공식 · ROUND2 결승 중계',url:'https://www.youtube.com/watch?v=qzZuyhYA7XQ',kind:'organizer-video'},
    kicSdcIntro:{title:'SDC 공식 · KIC 도리도리 코스 소개',url:'https://www.youtube.com/watch?v=gh4jKKNYNBk',kind:'organizer-video'},
    ebisuEvent:{title:'D1GP 공식 · 2025 에비스 R5/6 행사·주행 구간',url:'https://d1gp.co.jp/22261/',kind:'organizer-event'},
    ebisuProgram:{title:'D1GP 공식 · 에비스 행사 프로그램',url:'https://d1gp.co.jp/22569/',kind:'organizer-program'},
    ebisuCourseGuide:{title:'D1GP 공식 프로그램 · 에비스 경기 구간도',url:'https://d1gp.co.jp/wp-content/uploads/2025/09/D1GP250506-EBISU-PROGRAM-10-724x1024.jpg',kind:'official-event-map'},
    ebisuFacility:{title:'에비스 운영사 · West 시설 도면',url:'https://www.ebisu-circuit.com/c-images/nishi.pdf',kind:'venue-operator'},
    ebisuVideo:{title:'D1GP 공식 · 2025 에비스 경기 중계',url:'https://www.youtube.com/watch?v=qYbQmPS_NxA',kind:'organizer-video'},
    tsukubaEvent:{title:'D1GP 공식 · 2025 쓰쿠바 R3/4 행사·주행 구간',url:'https://d1gp.co.jp/21565/',kind:'organizer-event'},
    tsukubaProgram:{title:'D1GP 공식 · 쓰쿠바 행사 프로그램',url:'https://d1gp.co.jp/21579/',kind:'organizer-program'},
    tsukubaCourseGuide:{title:'D1GP 공식 프로그램 · 쓰쿠바 경기 구간도',url:'https://d1gp.co.jp/wp-content/uploads/2025/06/D1GP250304-TSUKUBA-PROGRAM-08-724x1024.jpg',kind:'official-event-map'},
    tsukubaFacility:{title:'쓰쿠바 운영사 · 시설 도면',url:'https://www.tsukuba-circuit.jp/guide/img/guidemap.pdf',kind:'venue-operator'},
    tsukubaVideo:{title:'D1GP 공식 · 2025 쓰쿠바 경기 중계',url:'https://www.youtube.com/watch?v=MFmsKbgXhw0',kind:'organizer-video'},
    osm:{title:'OpenStreetMap · 지도 데이터와 ODbL',url:'https://www.openstreetmap.org/copyright',kind:'map-data-license'},
    d2Results:{title:'D2 Racing 참가팀 공식 결과',url:'https://www.d2-race.com/RacingTeam/GALLERY',kind:'participant-report'},
    d2Videos:{title:'D2 Racing 공식 영상 목록',url:'https://www.d2-race.com/VideosCollection',kind:'participant-video-index'},
    injeReport:{title:'2024 인제 개막전 현장 보도',url:'https://www.gocarnet.co.kr/motorsports_tunning/2024/04/82761',kind:'press-report'},
    injeVideo:{title:'인제 KDGP 2024 R1 · D2 Racing',url:'https://www.youtube.com/watch?v=xqE1vrietsk',kind:'participant-video'},
    kicVideo:{title:'영암 KDGP 2024 R2 · D2 Racing',url:'https://www.youtube.com/watch?v=Kf37UeNI3_A',kind:'participant-video'},
    belleEvent:{title:'주한 필리핀 대사관 대회 참가 보고',url:'https://www.philembassy-seoul.com/news/filipina-drift-driver-bella-canete-makes-strong-debut-in-korea-drift-series',kind:'government-participant-report'},
    belleVenue:{title:'벨포레 운영사 시설 안내·전체 지도',url:'https://belleforetresort.com/content/moto_intro',kind:'venue-operator'},
    belleVideo:{title:'벨포레 KDS 2026 R4 · Bella Cañete',url:'https://www.youtube.com/watch?v=X4ZHi1SE8ig',kind:'participant-video'},
    elevation:{title:'Open-Meteo 고도 API · 90m DEM 설명',url:'https://open-meteo.com/en/docs/elevation-api',kind:'data-provider'},
    ngiiDem:{title:'국토지리정보원 수치표고모형',url:'https://www.data.go.kr/data/15059920/fileData.do',kind:'government-data-catalog'},
    ngiiMap:{title:'국토지리정보원 수치지형도 V2',url:'https://www.data.go.kr/data/15059719/fileData.do',kind:'government-data-catalog'}
  };
  const missing=[
    '해당 라운드의 축척·주행 방향·출발/종료·채점 구간·클리핑 존 도면',
    '포장 영역과 당일 경기 경계의 좌표, 실제 폭과 방호물 위치',
    '노면 고도·종단 경사·횡단 경사와 배수 경사의 근거',
    '연석·포장 밖 경계·지형지물의 위치 및 재질 확인'
  ];
  const candidate=(data)=>Object.assign({
    status:'research',playable:false,
    verification:{event:'documented',eventLayout:'pending',roadGeometry:'pending',roadElevation:'pending',environment:'partial-visual-observations'},
    geometry:null,elevation:null,courseLengthM:null,judgedLengthM:null,
    missingEvidence:missing.slice()
  },data);
  const reconstruction=data=>candidate({
    status:'reconstructed',playable:true,
    verification:{event:'documented',eventLayout:'mapped-interpretation-not-surveyed',roadGeometry:'osm-reconstruction',roadElevation:'smoothed-90m-dem-estimate',environment:'map-and-selected-frame-observations'},
    geometry:{method:'documented event route aligned to OSM centreline',surveyed:false},
    elevation:{method:'arc-weighted Gaussian sigma 90m, +/-270m; Copernicus GLO-90 DSM',resolutionM:90,surveyed:false},
    missingEvidence:[
      '출발·종료·채점·클리핑 목표의 정확한 좌표와 폭은 공식 실측값이 아닙니다. 현재 값은 영상·도면 판독 및 모형 설정입니다.',
      '90m DEM은 노면 측량 자료가 아닙니다. 횡단 경사·캠버·배수 경사·연석 단면은 미확인으로, 뱅킹과 연석 높이의 물리 효과를 재현하지 않습니다.',
      'OSM 시설 윤곽과 수림 영역을 단순화했습니다. 건물·방호물 높이, 개별 나무 위치·수종·높이, 표면 재료와 마찰계수는 실측하지 않았습니다.'
    ],...data
  });
  const candidates=[
    candidate({
      id:'kr-kic-t21-kdl-2016-r2',name:'영암 KIC T21 · 2016 KDL R2',priority:1,status:'reconstructed',playable:true,
      event:{series:'KDL',year:2016,round:2,dates:['2016-06-04','2016-06-05'],sources:['kdlAnnouncement','kdlResult','kdlResultCrosscheck','kdlVideo']},
      subtitle:'첫 실행 코스 · GP T2 → T1 역방향',
      reason:'실제 대회가 사용한 T2→T1 방향을 확인하고, OSM 도로·시설 기하와 현장 영상을 대조해 주행 모형으로 재구성했습니다. 정확한 경기 경계와 채점 좌표까지 실측한 복제본은 아닙니다.',
      reuse:'EV2 영암 GP의 OSM 중심선과 90m DEM을 바탕으로 합니다. 남동쪽 T1/T2의 번호는 FIA 공식 도면으로 확인했습니다. T1의 넓은 포장 영역은 영상·지도 기반 복원이며 시작·종료·채점·클립은 모형 설정입니다.',
      mapStatus:'공식 코너 도면 + OSM 기하 재구성',
      lengthStatus:'앱의 복원 코스 길이 표시 · 공식 경기 길이 미확인',
      elevationStatus:'90m DEM 평활 근사 · 노면 실측 아님',
      courseLengthM:585.0552526523198,judgedLengthM:213.98451628616831,heightRangeM:.7514825255649384,widthEstimateM:14,
      inspectionMethod:'리그 공식 영상의 공개 미리보기 프레임을 직접 확인했습니다. 전체 영상 연속 재생 검증은 아니며 시각은 약 5초 간격 프레임의 근삿값입니다.',
      verification:{event:'documented',eventLayout:'direction-confirmed-boundaries-reconstructed',roadGeometry:'osm-reconstruction',roadElevation:'smoothed-90m-dem-estimate',environment:'map-and-preview-observations'},
      geometry:{method:'OSM centreline and facility geometry with video comparison',surveyed:false},
      elevation:{method:'smoothed Copernicus GLO-90 DSM',resolutionM:90,surveyed:false},
      missingEvidence:[
        '정확한 당일 경기 경계·출발/종료·채점 구간·클리핑 존의 공식 좌표는 미확인입니다. 현재 값은 모형 설정입니다.',
        '노면의 정밀 고도·횡단 경사·캠버·연석 단면과 배수 경사는 실측하지 않았습니다.',
        '표면 재질의 상세 사양·마찰계수·수목 수종은 미확인입니다. 표시 색과 물리 계수는 모형 가정입니다.'
      ],
      videoCaveat:'315초 이후의 원형 주행 자국은 결승 뒤 세리머니 장면과 이어집니다. 이를 공식 채점 경로로 사용하지 않습니다. 영상의 경기차 진입 속도도 순정 차량의 목표 성능으로 전용하지 않습니다.',
      observations:[
        {feature:'도로·주행 방향',observed:'T1/T2 사이 도로와 넓은 T1 포장 영역, 실제 탠덤 주행',unknown:'공식 출발·종료선과 채점 중심선의 미터 좌표',source:'kdlVideo',seconds:[135,180,275],precision:'preview-frame'},
        {feature:'연석·경계',observed:'곡선 포장 끝, 녹색·적색 도색, 흰 선, 콘과 안쪽 잔디섬',unknown:'당일 공식 이탈 판정선·콘 간격·연석 단면과 실제 재질',source:'kdlVideo',seconds:[125,130,335,340],precision:'preview-frame'},
        {feature:'시설·외곽',observed:'T1 주변 관람석·방호벽·잔디 영역을 영상과 지도에서 대조',unknown:'2016년의 모든 시설 치수·벽 높이와 외곽 지표 재질',source:'kdlVideo',seconds:[275,285,340],precision:'preview-frame'},
        {feature:'노면·식생',observed:'넓은 포장면의 타이어 자국, 배경 수목과 사면',unknown:'마찰계수·포장 배합·수종·노면 캠버와 상세 경사',source:'kdlVideo',seconds:[135,275,285],precision:'preview-frame'}
      ],
      sources:['kdlAnnouncement','kdlResult','kdlResultCrosscheck','kdlVideo','fiaKic','kicOperator','osm','elevation']
    }),
    reconstruction({
      id:'kr-inje-b-sdc-2018-r1',name:'인제 B · 2018 SDC R1',priority:2,
      event:{series:'SDC',year:2018,round:1,dates:['2018-06-24'],sources:['injeSdcAnnouncement','injeSdcVideo','injeSdcQualifying']},
      subtitle:'서쪽 헤어핀과 다음 방향 전환 · 상설 B코스',
      reason:'주최 공지로 B코스 개최를 확인하고 참가팀의 원본 경기 프레임을 OSM 서쪽 헤어핀 구간에 맞췄습니다. 제1주차장 특설 코스인 2024 KDGP와 구분합니다.',
      reuse:'EV2 인제의 지도 중심선과 고도를 사용합니다. 선택 구간은 현재 OSM 도로 형상에 대한 영상 정합 결과이며, 2018년 공식 경기 배치의 측량 복제본은 아닙니다.',
      mapStatus:'주최 개최 공지 + 경기 영상·OSM 정합 · 공식 배치 좌표 미확인',
      courseLengthM:805.5938483116264,judgedLengthM:560.6907177605021,heightRangeM:14.203713410215073,widthEstimateM:14,
      inspectionMethod:'참가팀 영상 9NgRIs8o0sc의 30·48·63·72초 원본 프레임과 rzMlndBCk7k의 약 15–70초 구간에서 5초 간격으로 추출한 프레임을 확인했습니다. 전체 영상 연속 재생 검증은 아닙니다. 짧은 구간 추출 시각은 키프레임 탐색 때문에 근사입니다.',
      observations:[
        {feature:'경로·코너',observed:'B코스 서쪽 헤어핀의 접근·선회·다음 전환을 원본 영상과 지도에서 대조',unknown:'공식 출발·종료·채점선 및 클리핑 좌표, 2018년 포장 경계의 정확한 위치',source:'injeSdcQualifying',seconds:[20,30,50],precision:'selected-original-frame'},
        {feature:'연석·도색',observed:'적백 연석, 녹색 가장자리 페인트, 흰 경계선과 타이어 자국',unknown:'연석 폭·단면·높이, 페인트 영역의 정확한 미터 좌표·마찰',source:'injeSdcVideo',seconds:[30,48,63],precision:'selected-original-frame'},
        {feature:'주변 시설',observed:'잔디섬, 은색 가드레일, 적백 방호물, B패독 주변',unknown:'방호물의 규격과 재질, 임시 시설의 정확한 배치·높이',source:'injeSdcQualifying',seconds:[15,20,40],precision:'selected-original-frame'},
        {feature:'지형·수목',observed:'코스 밖 사면과 수림, 도로의 높이 변화',unknown:'정밀 도로·사면 고도, 횡단 경사, 수종·개별 나무 위치·높이',source:'injeSdcVideo',seconds:[30,48],precision:'selected-original-frame'}
      ],
      sources:['injeSdcAnnouncement','injeSdcVideo','injeSdcQualifying','injeAerial','osm','elevation']
    }),
    reconstruction({
      id:'kr-kic-permanent-sdc-2017-r2',name:'영암 상설 · 2017 SDC R2',priority:3,
      event:{series:'SDC',year:2017,round:2,dates:['2017-11-26'],sources:['kicSdcAnnouncement','kicSdcFinal']},
      subtitle:'상설 피트 직선 → 헤어핀 → 연속 전환 · 도리도리 구간',
      reason:'주최 공지와 결승 중계로 상설 서킷 대회를 확인하고 실제 경기의 헤어핀·전환을 지도와 대조했습니다. 기존 GP 남동쪽 T21과 다른 구간입니다.',
      reuse:'EV2 영암 상설의 OSM 중심선과 고도를 사용합니다. FIA 전체 도면은 코너 위치 참고이며 SDC의 공식 채점 도면이 아닙니다. 채점 구간과 클립은 별도 모형 설정입니다.',
      mapStatus:'SDC 공식 공지·결승 영상 + OSM 정합 · 공식 배치 좌표 미확인',
      courseLengthM:579.4595224888069,judgedLengthM:332.8960620243374,heightRangeM:2.497507675801204,widthEstimateM:14,
      inspectionMethod:'SDC 주최 채널 결승 중계의 약 150–175초 원본 프레임을 5초 간격으로 확인했습니다. 전체 중계를 연속 시청한 검증은 아니며, 짧은 구간 추출 시각은 키프레임 탐색 때문에 근사입니다.',
      videoCaveat:'행사 소개 영상 gh4jKKNYNBk의 앞부분에는 다른 장소의 영상이 섞여 있습니다. 경기 경로의 근거는 해당 라운드 결승 중계입니다.',
      observations:[
        {feature:'경로·대회',observed:'상설 피트 옆 직선, 헤어핀과 이어지는 두 번의 방향 전환',unknown:'공식 경기 시작·종료·채점·클립의 실측 좌표',source:'kicSdcFinal',seconds:[150,155,165],precision:'selected-original-frame'},
        {feature:'연석·노면',observed:'적백 연석, 녹색 가장자리 페인트, 흰 선과 타이어 자국',unknown:'연석 높이·정확한 폭, 포장 배합·마찰계수',source:'kicSdcFinal',seconds:[150,155,160],precision:'selected-original-frame'},
        {feature:'시설·외곽',observed:'관람석 구조, 은회색 가드레일, 갈색 계절 잔디',unknown:'2017년 시설 치수·높이, 방호물 내부 구조와 지표 재질',source:'kicSdcFinal',seconds:[150,165,175],precision:'selected-original-frame'},
        {feature:'지형·식생',observed:'배경의 낮은 언덕과 수목, 포장 주변 잔디',unknown:'정밀 고도·횡단 경사·캠버, 나무 수종과 개별 높이',source:'kicSdcFinal',seconds:[165],precision:'selected-original-frame'}
      ],
      sources:['kicSdcAnnouncement','kicSdcFinal','kicSdcIntro','fiaKic','osm','elevation']
    }),
    reconstruction({
      id:'jp-ebisu-west-d1gp-2025',name:'에비스 West · 2025 D1GP R5/6',priority:4,
      event:{series:'D1GP',year:2025,rounds:[5,6],dates:['2025-09-27','2025-09-28'],sources:['ebisuEvent','ebisuProgram','ebisuVideo']},
      subtitle:'메인 직선 → 우회전 1·2코너 → 왼쪽 전환 출구',
      reason:'D1GP 공식 행사 구간도와 당일 중계 프레임에 맞춰 West의 경기 구간을 재구성했습니다. 서킷 전체를 드리프트 코스로 대체하지 않았습니다.',
      reuse:'공식 행사 프로그램의 구간도를 OSM 중심선에 정합했습니다. 운영사 시설 도면은 전체 시설 참고입니다. 도면의 출발·종료·클리핑 위치를 지도에 옮긴 값과 도로 폭은 근사입니다.',
      mapStatus:'D1GP 공식 행사 구간도 확보 · OSM 정합 좌표는 근사',
      courseLengthM:560.5107952360275,judgedLengthM:367.51079523602755,heightRangeM:8.015527612975688,widthEstimateM:12,
      inspectionMethod:'D1GP 공식 YouTube 중계의 공개 스토리보드 프레임만 확인했습니다. 4500초와 9030·9040·9060·9070·9080초 장면이며, 전체 영상을 연속 재생하거나 현장을 측량한 검증은 아닙니다.',
      observations:[
        {feature:'구간·방향',observed:'메인 직선, 우회전 코너와 왼쪽 전환을 공식 구간도 및 중계 프레임에서 대조',unknown:'출발·종료·클립의 정확한 지도 좌표와 판정 영역 치수',source:'ebisuVideo',seconds:[4500,9030,9040],precision:'official-storyboard-frame'},
        {feature:'노면·경계',observed:'아스팔트, 흰색 경계선과 흰 벽',unknown:'도로 폭 12m는 모형 추정값; 벽 위치·높이·재질과 노면 마찰은 미측량',source:'ebisuVideo',seconds:[9030,9040,9060],precision:'official-storyboard-frame'},
        {feature:'시설·외곽',observed:'피트·관중석과 잔디 사면',unknown:'시설의 정확한 높이, 사면 종단·횡단 경사와 지표 재료',source:'ebisuVideo',seconds:[9060,9070,9080],precision:'official-storyboard-frame'},
        {feature:'수목·고도',observed:'배경 수림과 코스 주변 높이 변화',unknown:'수종·개별 나무의 위치·높이, 노면 정밀 고도·캠버·연석 높이',source:'ebisuVideo',seconds:[4500,9070,9080],precision:'official-storyboard-frame'}
      ],
      sources:['ebisuEvent','ebisuProgram','ebisuCourseGuide','ebisuFacility','ebisuVideo','osm','elevation']
    }),
    reconstruction({
      id:'jp-tsukuba-d1gp-2025',name:'쓰쿠바 2000 · 2025 D1GP R3/4',priority:5,
      event:{series:'D1GP',year:2025,rounds:[3,4],dates:['2025-06-28','2025-06-29'],sources:['tsukubaEvent','tsukubaProgram','tsukubaVideo']},
      subtitle:'최종 코너 출발 → 메인 직선 → 1코너·S자 → 제1헤어핀 출구',
      reason:'2025 D1GP 공식 구간도와 당일 중계의 클리핑 지도를 사용했습니다. 전체 쓰쿠바 2000 중 해당 대회가 사용한 열린 구간을 모델링했습니다.',
      reuse:'공식 행사 구간도를 OSM 도로 중심선에 맞췄습니다. 2025년 클리핑 배치의 도면은 확인했지만, 지도 정합한 존의 위치·길이·오프셋과 주행 폭은 실측값이 아닙니다.',
      mapStatus:'D1GP 공식 행사·당일 클리핑 지도 확보 · 정합 좌표는 근사',
      courseLengthM:887.0405609415183,judgedLengthM:761.0405609415183,heightRangeM:1.765886831923389,widthEstimateM:12,
      inspectionMethod:'D1GP 공식 YouTube 중계의 공개 스토리보드 프레임만 확인했습니다. 2260·2270초 구간 지도와 4500·4510·4560·4570·4580초 현장 장면이며, 전체 영상 연속 재생이나 측량은 하지 않았습니다.',
      observations:[
        {feature:'구간·클리핑',observed:'당일 구간·클리핑 지도, 메인 직선에서 제1헤어핀 출구까지의 대회 경로',unknown:'지도 정합한 시작·종료·존의 실측 좌표·폭·길이',source:'tsukubaVideo',seconds:[2260,2270],precision:'official-storyboard-frame'},
        {feature:'연석·경계',observed:'적백 연석, 흰 가드레일과 경계선',unknown:'연석 높이·단면, 가드레일의 정확한 위치·규격과 마찰',source:'tsukubaVideo',seconds:[4560,4570,4580],precision:'official-storyboard-frame'},
        {feature:'시설·노면',observed:'출발 구역, 피트·관제탑, 포장면과 잔디',unknown:'건물 높이·재질·포장 배합·도로 폭의 실측값',source:'tsukubaVideo',seconds:[4500,4510,4560],precision:'official-storyboard-frame'},
        {feature:'수목·고도',observed:'코스 뒤 수림과 잔디 영역',unknown:'수종·개별 나무 위치·높이, 정밀 고도·뱅킹·배수 경사',source:'tsukubaVideo',seconds:[4570,4580],precision:'official-storyboard-frame'}
      ],
      sources:['tsukubaEvent','tsukubaProgram','tsukubaCourseGuide','tsukubaFacility','tsukubaVideo','osm','elevation']
    }),
    candidate({
      id:'kr-inje-kdgp-2024-r1',name:'인제스피디움',priority:2,
      event:{series:'KDGP',year:2024,round:1,dates:['2024-04-13','2024-04-14'],sources:['d2Results','injeReport','injeVideo']},
      subtitle:'2024 KDGP 1라운드 · 제1주차장 특설 구간',
      reason:'참가팀의 항공·차량 외부·차내 장면을 확보한 추가 조사 대상입니다. 아직 주행 코스로 등록하지 않았습니다.',
      reuse:'EV2 인제 자료는 본 서킷의 중심선입니다. 제1주차장 특설 코스의 좌표·경계·고도로 사용할 수 없습니다.',
      mapStatus:'대회 구간의 축척 도면 미확보',
      observations:[
        {feature:'노면 표시',observed:'어두운 포장 위 흰 직선 표시와 겹쳐진 타이어 자국',unknown:'표시선의 미터 좌표·재료·포장 배합·마찰계수',source:'injeVideo',seconds:[0,1],precision:'preview-frame'},
        {feature:'코스 경계',observed:'빨강·흰색 방호물 열, 붉은색·초록색 콘',unknown:'방호물의 내부 재질·규격, 공식 이탈 판정선과의 대응',source:'injeVideo',seconds:[31,35,62],precision:'preview-frame'},
        {feature:'주변 지형·식생',observed:'포장 옆 사면, 배경의 수목과 산지',unknown:'사면의 토질·경사, 나무 수종·높이·개체별 위치',source:'injeVideo',seconds:[0,1,31],precision:'preview-frame'},
        {feature:'연석·외곽 처리',observed:'연석 위치를 확정할 만큼 충분한 근접 자료는 아직 없음',unknown:'연석 유무와 위치·단면, 배수로와 포장 끝 재질',source:'injeVideo',seconds:[31,35],precision:'insufficient'}
      ],
      sources:['d2Results','d2Videos','injeReport','injeVideo']
    }),
    candidate({
      id:'kr-yeongam-kdgp-2024-r2',name:'영암 KDGP 2024',priority:3,
      event:{series:'KDGP',year:2024,round:2,dates:['2024-06-08','2024-06-09'],sources:['d2Results','kicVideo']},
      subtitle:'2024 KDGP 2라운드 · 주행 구역 확인 중',
      reason:'항공 장면과 근접 주행 장면을 확보했습니다. 어느 포장 구역을 썼는지 전체 시설 도면과 먼저 맞춰야 합니다.',
      reuse:'EV2 영암 GP·상설 중심선의 일부라고 아직 확정하지 않았습니다. 관람석·가드레일을 기준점으로 행사 구역을 먼저 식별해야 합니다.',
      mapStatus:'시설 내 경기 구역과 해당 라운드 경계 미확정',
      videoCaveat:'36~44초 차량에 TAXI 표시가 보입니다. 이 장면은 환경 참고에만 쓰며 콘 배치를 공식 경기 경계로 확정하지 않습니다.',
      observations:[
        {feature:'노면 표시',observed:'검은 타이어 자국이 밀집한 포장면과 흰 곡선 표시',unknown:'흰 선의 공식 판정 용도·치수, 표면 재질의 세부 사양',source:'kicVideo',seconds:[7,36,40],precision:'preview-frame'},
        {feature:'코스 경계',observed:'붉은색·초록색 콘과 은회색 가드레일',unknown:'콘 간격·충돌 경계 좌표, 가드레일 규격',source:'kicVideo',seconds:[37,38,43],precision:'preview-frame'},
        {feature:'시설·식생',observed:'관람석 구조, 수목 열과 포장 바깥의 녹색 영역',unknown:'수목의 수종·정확한 높이, 녹색 영역의 세부 지표 재질',source:'kicVideo',seconds:[3,6,36],precision:'preview-frame'},
        {feature:'연석·고저차',observed:'선정 프레임만으로 코스 전체의 연석과 경사를 확정할 수 없음',unknown:'연석 위치·단면, 고도 프로파일·횡단 경사',source:'kicVideo',seconds:[4,5,36],precision:'insufficient'}
      ],
      sources:['d2Results','d2Videos','kicVideo']
    }),
    candidate({
      id:'kr-belleforet-kds-2026-r4',name:'벨포레 모토아레나',priority:4,
      event:{series:'KDS',year:2026,round:4,dates:['2026-09-05','2026-09-06'],sources:['belleEvent','belleVideo'],roundSource:'참가 선수의 영상 제목'},
      subtitle:'2026 KDS 4라운드 · 임시 배치 구간 조사',
      reason:'대회 참가 보고와 선수 영상, 운영사 시설 지도가 있습니다. 드리프트 구간과 카트 트랙의 범위를 구분해야 합니다.',
      reuse:'공식 길이 1.5km·17코너·직선 247m·고저차 약 12m는 카트 서킷 전체 수치입니다. KDS 채점 구간 길이·고저차에 전용하지 않습니다.',
      facilityOnly:{lengthM:1500,corners:17,straightM:247,heightDifferenceM:12,source:'belleVenue',scope:'full-kart-circuit',appliesToDriftLayout:false},
      mapStatus:'운영사 전체 지도 확보 / KDS 배치도 미확보',
      observations:[
        {feature:'노면 표시',observed:'넓은 회색 포장면, 검은 타이어 자국과 흰 표시선',unknown:'포장 배합·마찰계수, 선의 치수·정확한 판정 용도',source:'belleVideo',seconds:[18,19,20],precision:'preview-frame'},
        {feature:'코스 경계',observed:'붉은 콘과 흰색 연결형 방호물',unknown:'방호물의 재질·충전 상태·규격, 전체 배치 좌표',source:'belleVideo',seconds:[18,22,23],precision:'preview-frame'},
        {feature:'주변 지형·식생',observed:'포장 너머 낮은 사면과 수목이 있는 언덕',unknown:'사면 높이·지표 재질·수목 수종',source:'belleVideo',seconds:[18,24,26],precision:'preview-frame'},
        {feature:'연석·고저차',observed:'연석과 노면 고도는 선정 장면만으로 확정할 수 없음',unknown:'드리프트 구간의 고도·횡단 경사·포장 외곽 단면',source:'belleVideo',seconds:[18,26],precision:'insufficient'}
      ],
      sources:['belleEvent','belleVenue','belleVideo']
    })
  ];
  const data={version:3,reviewedAt:'2026-10-29',priority:'Korean competition venues first',sources,candidates,
    visualMethod:'코스별로 확인 방식과 시각을 따로 기록했습니다. 인제·영암 SDC는 선정한 원본 프레임, 에비스·쓰쿠바 D1GP는 공식 중계의 공개 스토리보드만 확인했습니다. 기존 T21과 조사 후보 3개는 공개 미리보기 프레임을 확인했습니다. 어느 경우도 전체 영상을 연속 재생해 검증했다는 뜻이 아닙니다. 프레임 시각·지도 정합은 근사이며 정밀 측량을 대신하지 않습니다.',
    license:'영상 원본과 미리보기 이미지는 제작용 텍스처에 포함하지 않습니다. 관찰 기록과 원본 링크만 제공합니다.'};
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  root.DriftTrackResearch=freeze(data);
  if(typeof module!=='undefined')module.exports=root.DriftTrackResearch;
})(typeof window==='undefined'?globalThis:window);

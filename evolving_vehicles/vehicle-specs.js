/* Verified Korean-market configurations. Drivetrain variants match the named engine, trim, wheel size and year; reviewed 2026-10-14. PS is metric horsepower. */
(function(root){ const specs = {
  "ray": {
    "variant": "1.0 가솔린 4AT · 15인치",
    "lengthMm": 3595,
    "heightMm": 1700,
    "wheelbaseMm": 2520,
    "curbMassKg": 1090,
    "powerPs": 76,
    "torqueNm": 95.125,
    "frontTireRadiusMm": 278,
    "rearTireRadiusMm": 278,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.kia.com/kr/vehicles/ray/specification",
    "sourceNote": "",
    "driveVariants": {
      "fwd": {}
    },
    "driveVerificationDate": "2026-10-14"
  },
  "morning": {
    "variant": "1.0 가솔린 GT-Line 4AT · 16인치",
    "lengthMm": 3595,
    "heightMm": 1485,
    "wheelbaseMm": 2400,
    "curbMassKg": 1010,
    "powerPs": 76,
    "torqueNm": 95.125,
    "frontTireRadiusMm": 290.95,
    "rearTireRadiusMm": 290.95,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.kia.com/kr/vehicles/morning/specification",
    "sourceNote": "",
    "driveVariants": {
      "fwd": {}
    },
    "driveVerificationDate": "2026-10-14"
  },
  "k5": {
    "variant": "2.0 가솔린 6AT · 18인치·빌트인 캠",
    "lengthMm": 4905,
    "heightMm": 1445,
    "wheelbaseMm": 2850,
    "curbMassKg": 1455,
    "powerPs": 160,
    "torqueNm": 196.133,
    "frontTireRadiusMm": 334.35,
    "rearTireRadiusMm": 334.35,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.kia.com/kr/vehicles/k5/specification",
    "sourceNote": "",
    "driveVariants": {
      "fwd": {}
    },
    "driveVerificationDate": "2026-10-14"
  },
  "carnival": {
    "variant": "1.6 터보 하이브리드 9인승 · 18인치",
    "lengthMm": 5155,
    "heightMm": 1785,
    "wheelbaseMm": 3090,
    "curbMassKg": 2155,
    "powerPs": 245,
    "torqueNm": 366.769,
    "frontTireRadiusMm": 369.6,
    "rearTireRadiusMm": 369.6,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.kia.com/kr/vehicles/carnival/specification",
    "sourceNote": "출력·토크는 제조사 시스템 합산값.",
    "driveVariants": {
      "fwd": {}
    },
    "driveVerificationDate": "2026-10-14"
  },
  "musso_ev": {
    "variant": "전기 2WD · 17인치",
    "lengthMm": 5160,
    "heightMm": 1740,
    "wheelbaseMm": 3150,
    "curbMassKg": 2155,
    "powerPs": 207,
    "torqueNm": 340.291,
    "frontTireRadiusMm": 362.9,
    "rearTireRadiusMm": 362.9,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.kg-mobility.com/attached/contents/display/file/200000200010012/20260228234258004_JNYcqu.pdf#page=2",
    "sourceNote": "2026년 3월 공식 가격표 PDF 2쪽(인쇄 7쪽), 17인치 2WD/AWD 제원. 2026-10-14 확인.",
    "powertrainType": "electric",
    "driveVariants": {
      "fwd": {},
      "awd": {
        "variant": "전기 AWD · 17인치",
        "curbMassKg": 2275,
        "powerPs": 414,
        "torqueNm": 678.62
      }
    },
    "driveVerificationDate": "2026-10-14"
  },
  "torres": {
    "variant": "1.5 가솔린 터보 2WD 8AT · 18인치",
    "lengthMm": 4705,
    "heightMm": 1720,
    "wheelbaseMm": 2680,
    "curbMassKg": 1520,
    "powerPs": 170,
    "torqueNm": 300.083,
    "frontTireRadiusMm": 357.85,
    "rearTireRadiusMm": 357.85,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.kg-mobility.com/attached/contents/display/file/2000001000100010011/20260529155803866_yvKDug.pdf#page=17",
    "sourceNote": "2026년 6월 공식 카탈로그 PDF 17쪽, 가솔린 1.5 터보 8AT 18인치 2WD/AWD 제원. 2026-10-14 확인.",
    "driveVariants": {
      "fwd": {},
      "awd": {
        "variant": "1.5 가솔린 터보 AWD 8AT · 18인치",
        "curbMassKg": 1610
      }
    },
    "driveVerificationDate": "2026-10-14"
  },
  "porter2": {
    "variant": "2.5 LPG 터보 자동5단 · 초장축 슈퍼캡 2WD · 범퍼가드",
    "lengthMm": 5155,
    "heightMm": 1970,
    "wheelbaseMm": 2640,
    "curbMassKg": 1705,
    "powerPs": 159,
    "torqueNm": 294.2,
    "frontTireRadiusMm": 327,
    "rearTireRadiusMm": 281.1,
    "tireFitment": {
      "front": { "size": "195/70 R15C 8PR", "tiresPerAxle": 2 },
      "rear": { "size": "145 R13C 8PR", "tiresPerAxle": 4, "mounting": "dual" }
    },
    "tireSourceUrl": "https://www.hyundai.com/contents/repn-car/catalog/porter2-2026-price.pdf",
    "rearDualSourceUrl": "https://www.hyundai.com/contents/repn-car/html/homepage/spec/images/pip-porter2-24my-specifications-back-w.jpg",
    "factoryDrive": "rwd",
    "sourceUrl": "https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro",
    "sourceNote": "2WD 앞 195/70 R15C 단륜·뒤 145 R13C 복륜. 뒤 타이어 단면비는 미표기이므로 80%를 가정한 반지름 281.1mm를 사용하며 제조사 실측값이 아닙니다. 무적재 공차중량에는 복륜이 포함됩니다.",
    "driveVariants": {
      "rwd": {}
    },
    "driveVerificationDate": "2026-10-14",
    "driveAvailabilityNote": "기준 LPG 터보 5단 자동변속기는 2WD 후륜 사양입니다. 4WD 수동변속기 사양과 구분합니다."
  },
  "avante": {
    "variant": "2027 올 뉴 아반떼 스마트스트림 가솔린2.0 IVT,18인치",
    "lengthMm": 4765,
    "heightMm": 1425,
    "wheelbaseMm": 2750,
    "curbMassKg": 1400,
    "powerPs": 149,
    "torqueNm": 179.462,
    "frontTireRadiusMm": 325.35,
    "rearTireRadiusMm": 325.35,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.hyundai.com/contents/repn-car/catalog/spec/avante-27fc-spec.pdf",
    "sourcePage": "https://www.hyundai.com/kr/ko/e/vehicles/the-all-new-avante/intro",
    "sourceNote": "사진의 선택사양과 별도로 명시한 동력계 기준을 적용합니다.",
    "driveVariants": {
      "fwd": {}
    },
    "driveVerificationDate": "2026-10-14"
  },
  "staria": {
    "variant": "2026 더 뉴 스타리아 라운지7인승 LPG3.5 2WD 자동8단,18인치",
    "lengthMm": 5255,
    "heightMm": 1990,
    "wheelbaseMm": 3275,
    "curbMassKg": 2295,
    "powerPs": 240,
    "torqueNm": 313.813,
    "frontTireRadiusMm": 357.85,
    "rearTireRadiusMm": 357.85,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.hyundai.com/contents/repn-car/html/homepage/model/staria-lounge-26pe_intro.content",
    "sourcePage": "https://www.hyundai.com/kr/ko/e/vehicles/the-new-staria-lounge/intro",
    "sourceNote": "사진의 선택사양과 별도로 명시한 동력계 기준을 적용합니다.",
    "driveVariants": {
      "fwd": {}
    },
    "driveVerificationDate": "2026-10-14",
    "driveAvailabilityNote": "현재 기준인 LPG 3.5 라운지 7인승은 전륜 2WD입니다. 과거 디젤 AWD 사양을 섞지 않습니다."
  },
  "ioniq5": {
    "variant": "2027 아이오닉5 Long Range2WD,20인치",
    "lengthMm": 4655,
    "heightMm": 1605,
    "wheelbaseMm": 3000,
    "curbMassKg": 2025,
    "powerPs": 229,
    "torqueNm": 350,
    "frontTireRadiusMm": 368.75,
    "rearTireRadiusMm": 368.75,
    "factoryDrive": "rwd",
    "sourceUrl": "https://www.hyundai.com/contents/repn-car/catalog/spec/ioniq5-27my-spec.pdf",
    "sourcePage": "https://www.hyundai.com/kr/ko/e/vehicles/ioniq5/intro",
    "sourceNote": "사진의 선택사양과 별도로 명시한 동력계 기준을 적용합니다.",
    "powertrainType": "electric",
    "driveVariants": {
      "rwd": {},
      "awd": {
        "variant": "2027 아이오닉5 Long Range AWD · 20인치",
        "curbMassKg": 2130,
        "powerPs": 325,
        "torqueNm": 605
      }
    },
    "driveVerificationDate": "2026-10-14"
  },
  "santafe": {
    "variant": "2026 싼타페 캘리그래피 2.5 터보 2WD 5인승 · 21인치·루프랙",
    "lengthMm": 4830,
    "heightMm": 1780,
    "wheelbaseMm": 2815,
    "curbMassKg": 1865,
    "powerPs": 281,
    "torqueNm": 421.686,
    "frontTireRadiusMm": 376.95,
    "rearTireRadiusMm": 376.95,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.hyundai.com/contents/repn-car/html/homepage/model/santafe-26my_intro.content",
    "sourcePage": "https://www.hyundai.com/kr/ko/e/vehicles/santafe/intro",
    "sourceNote": "캘리그래피 21인치·루프랙 적용 기준.",
    "driveVariants": {
      "fwd": {},
      "awd": {
        "variant": "2026 싼타페 캘리그래피 2.5 터보 AWD 5인승 · 21인치·루프랙",
        "curbMassKg": 1930
      }
    },
    "driveVerificationDate": "2026-10-14"
  },
  "grandeur": {
    "variant": "2027 더 뉴 그랜저 가솔린2.5 2WD 자동8단,20인치",
    "lengthMm": 5050,
    "heightMm": 1460,
    "wheelbaseMm": 2895,
    "curbMassKg": 1650,
    "powerPs": 198,
    "torqueNm": 248.108,
    "frontTireRadiusMm": 352,
    "rearTireRadiusMm": 352,
    "factoryDrive": "fwd",
    "sourceUrl": "https://www.hyundai.com/contents/repn-car/catalog/spec/grandeur-27fl-spec.pdf",
    "sourcePage": "https://www.hyundai.com/kr/ko/e/vehicles/the-new-grandeur/intro",
    "sourceNote": "사진의 선택사양과 별도로 명시한 동력계 기준을 적용합니다.",
    "driveVariants": {
      "fwd": {}
    },
    "driveVerificationDate": "2026-10-14",
    "driveAvailabilityNote": "기준 가솔린 2.5는 전륜만 적용합니다. 가솔린 3.5의 AWD 사양과 구분합니다."
  },
  "g80": {
    "variant": "G80 기본모델 가솔린2.5터보 2WD 자동8단,20인치(스포츠패키지미적용)",
    "lengthMm": 5005,
    "heightMm": 1465,
    "wheelbaseMm": 3010,
    "curbMassKg": 1850,
    "powerPs": 304,
    "torqueNm": 421.686,
    "frontTireRadiusMm": 352,
    "rearTireRadiusMm": 350.25,
    "factoryDrive": "rwd",
    "sourceUrl": "https://www.genesis.com/kr/ko/models/luxury-sedan-genesis/g80/specs.html",
    "sourcePage": "https://www.genesis.com/kr/ko/models/g80",
    "sourceNote": "사진의 선택사양과 별도로 명시한 동력계 기준을 적용합니다.",
    "driveVariants": {
      "rwd": {},
      "awd": {
        "variant": "G80 기본모델 가솔린2.5터보 AWD 자동8단 · 20인치(스포츠패키지미적용)",
        "curbMassKg": 1920
      }
    },
    "driveVerificationDate": "2026-10-14"
  },
  "rexton_tow": {
    "variant": "2020 G4 렉스턴 · 2.2 LET 디젤 5인승 4WD 7AT · 18인치",
    "lengthMm": 4850,
    "heightMm": 1825,
    "wheelbaseMm": 2865,
    "curbMassKg": 2170,
    "powerPs": 187,
    "torqueNm": 421.686,
    "frontTireRadiusMm": 381.6,
    "rearTireRadiusMm": 381.6,
    "factoryDrive": "awd",
    "powertrainType": "diesel",
    "powerRpm": 3800,
    "torqueRpmRange": [
      1600,
      2600
    ],
    "redlineRpm": 4500,
    "baseTune": {
      "power": 1.25,
      "torque": 1.2
    },
    "conversionMassKg": 350,
    "conversionPosition": -0.28,
    "sourceUrl": "https://m.kg-mobility.com/showroom/total_price/__icsFiles/afieldfile/2019/11/05/Total_price_2019_11_up_1.pdf",
    "conversionSourceUrl": "https://etrucks.co.kr/m/special/detail.php?idx=1442",
    "sourceNote": "원차: 2020 G4 5인승 2WD/4WD 출고 제원. 선택 구동 사양의 공차중량에 개조 순증350kg·후방위치0.28차체길이·출력25%/토크20% 튜닝을 더합니다. 개조 수치는 실제 인증값이 아닌 모형 가정이며 참고 개조 제품2270kg와 구분합니다. 한계4500rpm도 모형 가정.",
    "driveVariants": {
      "rwd": {
        "variant": "2020 G4 렉스턴 · 2.2 LET 디젤 5인승 2WD 7AT · 18인치",
        "curbMassKg": 2060,
        "driveNote": "후륜 2WD 원차 기준에 같은 견인장비와 기본 튜닝을 적용합니다."
      },
      "awd": {
        "driveLabel": "사륜 · 4WD",
        "driveSystem": "part-time-4wd",
        "driveNote": "4TRONIC의 4WD 선택 상태를 모형의 사륜으로 표현합니다. 2H·4H·4L 전환은 재현하지 않습니다."
      }
    },
    "driveVerificationDate": "2026-10-14"
  },
  "starex_tow": {
    "variant": "2017 전기형 그랜드 스타렉스 외관 · 2.5 VGT 디젤 밴 3인승 2WD 5AT 기준 · 16인치",
    "lengthMm": 5150,
    "heightMm": 1935,
    "wheelbaseMm": 3200,
    "curbMassKg": 2060,
    "powerPs": 175,
    "torqueNm": 451.106,
    "frontTireRadiusMm": 353.7,
    "rearTireRadiusMm": 353.7,
    "factoryDrive": "rwd",
    "powertrainType": "diesel",
    "powerRpm": 3600,
    "torqueRpmRange": [
      2000,
      2250
    ],
    "redlineRpm": 4500,
    "baseTune": {
      "power": 1.25,
      "torque": 1.2
    },
    "conversionMassKg": 350,
    "conversionPosition": -0.28,
    "sourceUrl": "https://www.hyundai.com/kr/ko/vehicles/grand-starex/20my/specifications.html",
    "conversionSourceUrl": "https://8949truck.my1.kr/truck/50674/",
    "sourceNote": "외관: 실제2017 전기형 개조차 참고. 2060kg 등 기준 제원은 공식2020MY 3인승밴2WD5AT를 준용한 추정으로 2017 실측값이 아님. 개조 순증350kg·후방위치0.28차체길이·출력25%/토크20% 및 한계4500rpm은 모형 가정.",
    "driveVariants": {
      "rwd": {}
    },
    "driveVerificationDate": "2026-10-14",
    "driveAvailabilityNote": "준용한 2020MY 3인승 밴 5AT 제원은 후륜 2WD입니다. 왜건 4WD 사양과 구분합니다."
  }
}; root.VehicleSpecs=Object.freeze(specs); if(typeof module!=='undefined'&&module.exports)module.exports=root.VehicleSpecs; })(typeof window!=='undefined'?window:globalThis);
